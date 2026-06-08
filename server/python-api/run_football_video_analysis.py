"""
Football match video analysis runner.
Produces player insights (PID, Team, Dist(m), MaxSpd, HSR(m), Spr, Risk, G, A, tackles, interceptions, blocks).
Run: python run_football_video_analysis.py --video path/to/video.mp4 [--player-model path] [--goalpost-model path] [--output insights.json]
"""
import argparse
import json
import os
import sys

# Optional: load config from integrated model if present
def _load_pkl_config(pkl_path):
    try:
        import dill
        with open(pkl_path, 'rb') as f:
            pkg = dill.load(f)
        return pkg.get('config') or {}
    except Exception:
        return {}

def _run_demo_analysis(video_path=None):
    """Return demo player insights when full pipeline is not available."""
    return [
        {"pid": 1, "team": "Team A", "dist_m": 28.5, "max_spd": 28.2, "hsr_m": 8.2, "spr": 4, "risk": 158.2, "g": 0, "a": 0, "tackles": 0, "interceptions": 0, "blocks": 0},
        {"pid": 2, "team": "Team B", "dist_m": 36.0, "max_spd": 29.9, "hsr_m": 15.7, "spr": 9, "risk": 285.7, "g": 0, "a": 0, "tackles": 0, "interceptions": 0, "blocks": 0},
        {"pid": 4, "team": "Team A", "dist_m": 33.0, "max_spd": 30.6, "hsr_m": 10.9, "spr": 8, "risk": 250.9, "g": 0, "a": 0, "tackles": 0, "interceptions": 0, "blocks": 0},
        {"pid": 7, "team": "Team B", "dist_m": 30.4, "max_spd": 33.6, "hsr_m": 11.9, "spr": 5, "risk": 157.2, "g": 0, "a": 0, "tackles": 0, "interceptions": 0, "blocks": 0},
    ]

def _open_output_writer(cv2, output_video_path, fps, frame_size):
    """
    OpenCV codec preference for browser playback:
    - avc1/H264 first (best compatibility for HTML5 <video>)
    - fallback to mp4v if H.264 encoder is unavailable on this machine
    """
    preferred_codecs = ("avc1", "H264", "mp4v")
    for codec in preferred_codecs:
        fourcc = cv2.VideoWriter_fourcc(*codec)
        writer = cv2.VideoWriter(output_video_path, fourcc, fps, frame_size)
        if writer.isOpened():
            return writer, codec
        writer.release()
    return None, None

def run_analysis(video_path, player_model_path=None, goalpost_model_path=None, pkl_path=None, output_video_path=None):
    """
    Run video analysis and return dict with playerInsights, matchScore, outputVideoFilename.
    output_video_path: if set, write an annotated video (detection/tracking overlay) to this path.
    """
    if not video_path or not os.path.isfile(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    config = {}
    if pkl_path and os.path.isfile(pkl_path):
        config = _load_pkl_config(pkl_path)

    # Try full pipeline (opencv + ultralytics + torch)
    try:
        import cv2
        import numpy as np
        from collections import defaultdict, deque
        from sklearn.cluster import KMeans
        print(f"[INFO] Successfully imported cv2, numpy, sklearn", file=sys.stderr)
    except ImportError as e:
        error_msg = f"Missing required dependencies: {e}. Please install: pip install opencv-python numpy scikit-learn"
        print(f"[ERROR] {error_msg}", file=sys.stderr)
        raise ImportError(error_msg) from e

    try:
        from ultralytics import YOLO
        import torch
        print(f"[INFO] Successfully imported ultralytics and torch", file=sys.stderr)
    except ImportError as e:
        error_msg = f"Missing YOLO/torch: {e}. Please install: pip install ultralytics torch"
        print(f"[ERROR] {error_msg}", file=sys.stderr)
        raise ImportError(error_msg) from e

    # Model paths: use provided or default under models/
    script_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(script_dir, 'models')
    player_model_path = player_model_path or os.path.join(models_dir, 'best.pt')
    goalpost_model_path = goalpost_model_path or os.path.join(models_dir, 'goalnet.pt')

    print(f"[INFO] Looking for player model at: {player_model_path}", file=sys.stderr)
    print(f"[INFO] Model file exists: {os.path.isfile(player_model_path) if player_model_path else False}", file=sys.stderr)
    
    if not player_model_path or not os.path.isfile(player_model_path):
        error_msg = f"Player model not found at {player_model_path}. Please place your YOLO model (best.pt) in {models_dir}/"
        print(f"[ERROR] {error_msg}", file=sys.stderr)
        # Don't return demo data - raise an error so the user knows what's wrong
        raise FileNotFoundError(error_msg)

    # Import pipeline classes (defined below or in separate module)
    # For now, define them inline to keep everything together
    from football_pipeline import (
        clamp, bbox_center, bbox_feet, pt_in_rect, hsv_jersey_feature,
        MultiObjectTracker, BallPositionPredictor, SimpleReID,
        TeamClusteringStable, PitchTransformer, GoalpostModel, GoalZone,
        PossessionHistoryTracker, DefensiveStatsTracker, GoalAssistAttributor,
        SpeedDistanceCalculator, InjuryRiskAnalyzer
    )

    # Configuration - GPU detection and setup
    if torch.cuda.is_available():
        DEVICE = "cuda"
        gpu_count = torch.cuda.device_count()
        gpu_name = torch.cuda.get_device_name(0) if gpu_count > 0 else "Unknown"
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3) if gpu_count > 0 else 0
        print(f"[INFO] GPU detected: {gpu_name} ({gpu_count} device(s), {gpu_memory:.1f} GB)", file=sys.stderr)
        print(f"[INFO] Using device: CUDA (GPU)", file=sys.stderr)
        # Set default device for torch operations
        torch.cuda.set_device(0)
    else:
        DEVICE = "cpu"
        print(f"[WARNING] CUDA not available. Using CPU (will be slower).", file=sys.stderr)
        print(f"[INFO] Using device: CPU", file=sys.stderr)

    TEAM_NAMES = config.get('TEAM_NAMES') or {0: "Team A", 1: "Team B"}
    LEFT_DEFENDING_TEAM = 0
    RIGHT_DEFENDING_TEAM = 1
    GOAL_CONFIRM_FRAMES = 2
    PIXEL_POINTS = [(0, 0), (1280, 0), (1280, 720), (0, 720)]
    METER_POINTS = [(0, 0), (105, 0), (105, 68), (0, 68)]
    GOAL_VERTICAL_EXTENT = 0.2
    BALL_MIN_CONFIDENCE = 0.25
    BALL_MAX_SIZE_PX = 80
    BALL_MAX_ASPECT_RATIO = 2.0
    HSR_KPH = config.get('HSR_KPH', 19.8)
    SPRINT_KPH = config.get('SPRINT_KPH', 25.2)
    SPRINT_END_KPH = config.get('SPRINT_END_KPH', 23.0)
    RISK_W_HSR_PER_M = config.get('RISK_W_HSR_PER_M', 1.0)
    RISK_W_SPRINT = config.get('RISK_W_SPRINT', 30.0)
    TACKLE_DIST_PX = config.get('TACKLE_DIST_PX', 100.0)
    INTERCEPT_MIN_DIST_PX = config.get('INTERCEPT_MIN_DIST_PX', 100.0)
    BLOCK_ANGLE_DEG = config.get('BLOCK_ANGLE_DEG', 90.0)
    BLOCK_PROX_PX = config.get('BLOCK_PROX_PX', 80.0)
    DEFENSIVE_COOLDOWN_FRAMES = int(config.get('DEFENSIVE_COOLDOWN_FRAMES', 15))

    # Get video properties
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        error_msg = f"Cannot open video: {video_path}"
        print(f"[ERROR] {error_msg}", file=sys.stderr)
        raise RuntimeError(error_msg)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    W_ = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H_ = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    print(f"[INFO] Video: {W_}x{H_} @ {fps:.1f} fps", file=sys.stderr)

    # Load models - GPU will be used automatically via device parameter in track() calls
    try:
        player_model = YOLO(player_model_path)
        if DEVICE == "cuda":
            # Verify GPU is working
            try:
                test_tensor = torch.zeros(1, device='cuda')
                del test_tensor
                torch.cuda.empty_cache()
                print(f"[INFO] Player model loaded. GPU verified and ready. Classes: {player_model.names}", file=sys.stderr)
                print(f"[INFO] All YOLO inference will use GPU (device='cuda' passed to track calls)", file=sys.stderr)
            except Exception as gpu_err:
                print(f"[WARNING] GPU verification failed: {gpu_err}", file=sys.stderr)
                print(f"[WARNING] YOLO will attempt GPU but may fall back to CPU if CUDA fails", file=sys.stderr)
                print(f"[INFO] Player model loaded. Classes: {player_model.names}", file=sys.stderr)
        else:
            print(f"[INFO] Player model loaded on CPU. Classes: {player_model.names}", file=sys.stderr)
    except Exception as e:
        error_msg = f"Failed to load player model from {player_model_path}: {e}"
        print(f"[ERROR] {error_msg}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        raise RuntimeError(error_msg) from e

    goalpost_model = None
    if os.path.isfile(goalpost_model_path):
        try:
            goalpost_model = GoalpostModel(
                goalpost_model_path,
                conf=0.35,
                freeze_frames=int(fps * 3),
                frame_w=W_, frame_h=H_,
                device=DEVICE,
                vertical_extent_ratio=GOAL_VERTICAL_EXTENT
            )
            if DEVICE == "cuda":
                print(f"[INFO] Goalpost model loaded and using GPU", file=sys.stderr)
            else:
                print(f"[INFO] Goalpost model loaded on CPU", file=sys.stderr)
        except Exception as e:
            print(f"[WARNING] Goalpost model failed to load: {e}", file=sys.stderr)

    # Initialize pipeline components
    mot = MultiObjectTracker(
        player_model, conf=0.20, iou=0.45, device=DEVICE,
        ball_min_conf=BALL_MIN_CONFIDENCE,
        ball_max_size_px=BALL_MAX_SIZE_PX,
        ball_max_aspect_ratio=BALL_MAX_ASPECT_RATIO
    )
    ball_predictor = BallPositionPredictor(max_predict_frames=12, frame_w=W_, frame_h=H_)
    reid = SimpleReID(max_gap_frames=int(2 * fps), max_dist_px=100.0)
    team_obj = TeamClusteringStable(n_teams=2, min_players_to_init=8,
                                     samples_per_player=6, team_names=TEAM_NAMES)
    pitch = PitchTransformer(PIXEL_POINTS, METER_POINTS)
    speed_dist = SpeedDistanceCalculator(fps=fps)
    risk = InjuryRiskAnalyzer(
        fps=fps,
        hsr_kph=HSR_KPH,
        sprint_kph=SPRINT_KPH,
        sprint_end_kph=SPRINT_END_KPH,
        risk_w_hsr_per_m=RISK_W_HSR_PER_M,
        risk_w_sprint=RISK_W_SPRINT,
        top_k_minutes=5
    )
    possession = PossessionHistoryTracker(
        max_touch_dist_px=65.0,
        hold_frames=max(3, int(fps * 0.12)),
        history_len=15,
        max_assist_gap_sec=8.0,
        fps=fps
    )
    defensive_stats = DefensiveStatsTracker(
        fps=fps,
        tackle_dist_px=TACKLE_DIST_PX,
        intercept_min_dist_px=INTERCEPT_MIN_DIST_PX,
        block_angle_deg=BLOCK_ANGLE_DEG,
        block_prox_px=BLOCK_PROX_PX,
        cooldown_frames=DEFENSIVE_COOLDOWN_FRAMES,
    )
    left_zone = GoalZone("left", fps=fps, confirm_frames=GOAL_CONFIRM_FRAMES,
                         cooldown_sec=8.0, frame_w=W_, frame_h=H_)
    right_zone = GoalZone("right", fps=fps, confirm_frames=GOAL_CONFIRM_FRAMES,
                          cooldown_sec=8.0, frame_w=W_, frame_h=H_)
    attributor = GoalAssistAttributor(
        left_zone, right_zone,
        left_defending_team=LEFT_DEFENDING_TEAM,
        right_defending_team=RIGHT_DEFENDING_TEAM
    )

    # Process video
    out_writer = None
    try:
        cap = cv2.VideoCapture(video_path)
        frame_id = 0
        print(f"[INFO] Processing video frames...", file=sys.stderr)

        if output_video_path:
            out_dir = os.path.dirname(output_video_path)
            if out_dir and not os.path.isdir(out_dir):
                os.makedirs(out_dir, exist_ok=True)
            out_writer, out_codec = _open_output_writer(cv2, output_video_path, fps, (W_, H_))
            if out_writer is None:
                print(f"[WARNING] Could not open output video writer: {output_video_path}", file=sys.stderr)
                out_writer = None
            else:
                print(f"[INFO] Writing output video to: {output_video_path} (codec={out_codec})", file=sys.stderr)

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            try:
                # Goalpost detection
                if goalpost_model:
                    left_box, right_box = goalpost_model.update(frame, frame_id)
                    left_zone.set_rect(left_box)
                    right_zone.set_rect(right_box)

                # Player + ball detection
                raw_boxes, ball_pos_px, ball_bbox = mot.process_frame(frame)
                ball_pos_px, ball_bbox, _ = ball_predictor.get_ball_position(ball_pos_px, ball_bbox, frame_id)
                stable_boxes = reid.update(frame, frame_id, raw_boxes)

                # Team clustering
                team_obj.update_features(frame, stable_boxes)
                team_map = team_obj.assign()

                # Speed / distance (meter space)
                players_meter = {}
                for pid, bbox in stable_boxes.items():
                    cx, cy = bbox_center(bbox)
                    mx, my = pitch.pixel_to_meter(cx, cy)
                    players_meter[pid] = {"position": (mx, my)}
                speed_map = speed_dist.update(players_meter, frame_id)

                # Possession
                possession.update(frame_id, ball_pos_px, stable_boxes, team_map)
                defensive_stats.update(frame_id, ball_pos_px, stable_boxes, team_map, possession)

                # Goal detection
                g_event = attributor.update(frame_id, ball_pos_px, possession, team_map, team_obj)

                # Injury risk update
                player_metrics_for_risk = {}
                for pid in stable_boxes.keys():
                    sm = speed_map.get(pid, {})
                    player_metrics_for_risk[pid] = {
                        "team": team_map.get(pid, -1),
                        "speed_kph": float(sm.get("speed_kph", 0.0)),
                        "distance_this_frame_m": float(sm.get("distance_this_frame_m", 0.0)),
                        "total_distance_m": float(sm.get("total_distance_m", 0.0)),
                        "max_speed_kph": float(sm.get("max_speed_kph", 0.0)),
                    }
                risk.update(player_metrics_for_risk, frame_id)

                # Draw detection/tracking overlay and write output frame
                if out_writer is not None:
                    vis = frame.copy()
                    for pid, bbox in stable_boxes.items():
                        x1, y1, x2, y2 = [int(x) for x in bbox]
                        team_id = team_map.get(pid, -1)
                        team_name = team_obj.team_name(team_id)
                        color = (0, 165, 255) if team_id == 0 else (0, 255, 100)
                        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
                        label = f"#{pid} {team_name}"
                        cv2.putText(vis, label, (x1, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
                    if ball_pos_px is not None:
                        bx, by = ball_pos_px
                        cv2.circle(vis, (int(bx), int(by)), 8, (0, 255, 255), 2)
                    out_writer.write(vis)

                frame_id += 1
                if frame_id % 100 == 0:
                    if DEVICE == "cuda":
                        gpu_mem_allocated = torch.cuda.memory_allocated(0) / (1024**3)
                        gpu_mem_reserved = torch.cuda.memory_reserved(0) / (1024**3)
                        print(f"[INFO] Processed {frame_id} frames... GPU memory: {gpu_mem_allocated:.2f} GB allocated, {gpu_mem_reserved:.2f} GB reserved", file=sys.stderr)
                    else:
                        print(f"[INFO] Processed {frame_id} frames...", file=sys.stderr)
            except Exception as e:
                print(f"[WARNING] Error processing frame {frame_id}: {e}", file=sys.stderr)
                import traceback
                traceback.print_exc(file=sys.stderr)
                # Continue processing other frames
                frame_id += 1
                continue

        cap.release()
        if out_writer is not None:
            out_writer.release()
            print(f"[INFO] Output video saved", file=sys.stderr)
        print(f"[INFO] Finished processing {frame_id} frames", file=sys.stderr)
        
        # Final GPU memory info if using CUDA
        if DEVICE == "cuda":
            gpu_mem_allocated = torch.cuda.memory_allocated(0) / (1024**3)
            gpu_mem_reserved = torch.cuda.memory_reserved(0) / (1024**3)
            print(f"[INFO] GPU memory after processing: {gpu_mem_allocated:.2f} GB allocated, {gpu_mem_reserved:.2f} GB reserved", file=sys.stderr)
            torch.cuda.empty_cache()
            print(f"[INFO] GPU cache cleared", file=sys.stderr)
    except Exception as e:
        print(f"[ERROR] Fatal error during video processing: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        try:
            cap.release()
        except Exception:
            pass
        if out_writer is not None:
            try:
                out_writer.release()
            except Exception:
                pass
        raise

    # Build player insights from collected data
    insights = []
    all_pids = (
        set(speed_dist.total_dist.keys())
        | set(risk.hsr_dist_m.keys())
        | set(risk.sprint_count.keys())
        | set(defensive_stats.tackles.keys())
        | set(defensive_stats.interceptions.keys())
        | set(defensive_stats.blocks.keys())
    )
    
    # Count goals and assists per player
    goals_by_player = defaultdict(int)
    assists_by_player = defaultdict(int)
    for g in attributor.goals:
        scorer_id = g.get("scorer_id", -1)
        assist_id = g.get("assist_id", -1)
        if scorer_id >= 0:
            goals_by_player[scorer_id] += 1
        if assist_id >= 0:
            assists_by_player[assist_id] += 1

    # Get final max speeds from speed_dist (it tracks max_speed_seen_mps)
    final_max_speeds = {}
    if hasattr(speed_dist, 'max_speed_seen_mps'):
        for pid in speed_dist.max_speed_seen_mps:
            final_max_speeds[pid] = float(speed_dist.max_speed_seen_mps[pid] * 3.6)

    for pid in sorted(all_pids):
        dist_m = float(speed_dist.total_dist.get(pid, 0.0))
        max_spd = final_max_speeds.get(pid, 0.0)
        hsr_m = float(risk.hsr_dist_m.get(pid, 0.0))
        spr = int(risk.sprint_count.get(pid, 0))
        # Calculate total risk for this player
        risk_score = RISK_W_HSR_PER_M * hsr_m + RISK_W_SPRINT * spr
        g = goals_by_player.get(pid, 0)
        a = assists_by_player.get(pid, 0)
        team_id = team_map.get(pid, -1)
        team_name = team_obj.team_name(team_id)
        ds = defensive_stats.get_stats(pid)

        insights.append({
            "pid": int(pid),
            "team": team_name,
            "dist_m": round(dist_m, 1),
            "max_spd": round(max_spd, 1),
            "hsr_m": round(hsr_m, 1),
            "spr": spr,
            "risk": round(risk_score, 1),
            "g": g,
            "a": a,
            "tackles": int(ds["tackles"]),
            "interceptions": int(ds["interceptions"]),
            "blocks": int(ds["blocks"]),
        })

    # Match score: always include both teams (Team A and Team B), 0 if no goals
    score_by_team_id = attributor.score()
    match_score = {}
    for tid, name in TEAM_NAMES.items():
        match_score[name] = int(score_by_team_id.get(tid, 0))
    for tid, count in score_by_team_id.items():
        name = team_obj.team_name(tid)
        if name not in match_score:
            match_score[name] = int(count)

    output_filename = os.path.basename(output_video_path) if output_video_path else None

    if len(insights) == 0:
        print(f"[WARNING] No players detected in video. Processed {frame_id} frames.", file=sys.stderr)
        print(f"[INFO] Players tracked: {len(all_pids)}", file=sys.stderr)
        return {
            "playerInsights": [],
            "matchScore": match_score,
            "outputVideoFilename": output_filename,
        }

    print(f"[INFO] Generated insights for {len(insights)} players", file=sys.stderr)
    return {
        "playerInsights": insights,
        "matchScore": match_score,
        "outputVideoFilename": output_filename,
    }

def main():
    ap = argparse.ArgumentParser(description='Football video analysis -> player insights JSON')
    ap.add_argument('--video', required=True, help='Path to match video')
    ap.add_argument('--player-model', default=None, help='YOLO player/ball model path (e.g. best.pt)')
    ap.add_argument('--goalpost-model', default=None, help='Goalpost model path (e.g. goalnet.pt)')
    ap.add_argument('--pkl', default=None, help='Optional football_model_integrated.pkl for config')
    ap.add_argument('--output', default=None, help='Output JSON path (default: stdout)')
    ap.add_argument('--output-video', default=None, help='Output annotated video path (optional)')
    args = ap.parse_args()

    pkl_path = args.pkl
    if not pkl_path:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        pkl_path = os.path.join(script_dir, 'models', 'football_model_integrated.pkl')

    result = run_analysis(
        video_path=args.video,
        player_model_path=args.player_model,
        goalpost_model_path=args.goalpost_model,
        pkl_path=pkl_path if os.path.isfile(pkl_path) else None,
        output_video_path=args.output_video,
    )
    out = {'success': True, **result}
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(out, f, indent=2)
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        print(json.dumps(out, indent=2))
    return 0

if __name__ == '__main__':
    sys.exit(main() or 0)
