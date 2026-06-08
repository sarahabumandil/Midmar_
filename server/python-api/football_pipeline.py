"""
Football video analysis pipeline classes.
Extracted from the notebook for integration into the API.
"""
import cv2
import numpy as np
import pandas as pd
from collections import defaultdict, deque
from sklearn.cluster import KMeans
from ultralytics import YOLO
import torch

# Utility functions
def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def bbox_center(b):
    x1, y1, x2, y2 = b
    return ((x1 + x2) * 0.5, (y1 + y2) * 0.5)

def bbox_feet(b):
    """Bottom-centre of bounding box — closest point to ball contact."""
    x1, y1, x2, y2 = b
    return ((x1 + x2) * 0.5, float(y2))

def pt_in_rect(px, py, rx1, ry1, rx2, ry2):
    return rx1 <= px <= rx2 and ry1 <= py <= ry2

def hsv_jersey_feature(frame, bbox):
    x1, y1, x2, y2 = bbox
    h = y2 - y1
    if h <= 0 or (x2 - x1) <= 0:
        return None
    y_top    = y1 + int(0.10 * h)
    y_bottom = y1 + int(0.55 * h)
    H, W = frame.shape[:2]
    crop = frame[clamp(y_top, 0, H-1):clamp(y_bottom, 0, H-1),
                 clamp(x1,   0, W-1):clamp(x2,        0, W-1)]
    if crop.size == 0:
        return None
    crop = cv2.resize(crop, (40, 40), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hch, sch, _ = cv2.split(hsv)
    mask = (~((hch >= 35) & (hch <= 85))) & (sch >= 40)
    if mask.sum() < 50:
        return hsv.reshape(-1, 3).mean(axis=0).astype(np.float32)
    return hsv[mask].mean(axis=0).astype(np.float32)


class MultiObjectTracker:
    def __init__(self, model, conf=0.20, iou=0.45, device="cuda",
                 ball_min_conf=0.25, ball_max_size_px=80, ball_max_aspect_ratio=2.0):
        self.model  = model
        self.conf   = conf
        self.iou    = iou
        self.device = device
        self.ball_min_conf = float(ball_min_conf)
        self.ball_max_size = float(ball_max_size_px)
        self.ball_max_aspect = float(ball_max_aspect_ratio)

    def _is_valid_ball(self, box, conf):
        x1, y1, x2, y2 = box
        w = x2 - x1
        h = y2 - y1
        if w > self.ball_max_size or h > self.ball_max_size:
            return False
        if conf < self.ball_min_conf:
            return False
        if w > 0 and h > 0:
            aspect = max(w / h, h / w)
            if aspect > self.ball_max_aspect:
                return False
        return True

    def process_frame(self, frame):
        results = self.model.track(
            frame, conf=self.conf, iou=self.iou,
            persist=True, tracker="bytetrack.yaml", verbose=False,
            device=self.device
        )
        player_boxes    = {}
        ball_candidates = []

        for r in results:
            if r.boxes is None:
                continue
            xyxy = r.boxes.xyxy
            cls  = r.boxes.cls
            conf = r.boxes.conf
            ids  = r.boxes.id

            for i in range(len(xyxy)):
                label = self.model.names[int(cls[i])]
                box   = list(map(int, xyxy[i]))
                c     = float(conf[i])
                tid   = int(ids[i]) if ids is not None else None

                if label in ["player", "goalkeeper"]:
                    if tid is None:
                        continue
                    player_boxes[tid] = box
                elif label == "ball":
                    if self._is_valid_ball(box, c):
                        ball_candidates.append((c, box))

        ball_bbox = ball_pos = None
        if ball_candidates:
            ball_candidates.sort(key=lambda x: x[0], reverse=True)
            _, ball_bbox = ball_candidates[0]
            cx, cy = bbox_center(ball_bbox)
            ball_pos = (int(cx), int(cy))

        return player_boxes, ball_pos, ball_bbox


class BallPositionPredictor:
    def __init__(self, max_history=15, max_predict_frames=12, frame_w=1280, frame_h=720):
        self.max_history        = max_history
        self.max_predict_frames = int(max_predict_frames)
        self.frame_w            = int(frame_w)
        self.frame_h            = int(frame_h)
        self._history           = deque(maxlen=max_history)
        self._consecutive_missed = 0

    def get_ball_position(self, detected_pos, detected_bbox, frame_id):
        if detected_pos is not None:
            self._history.append((frame_id, (float(detected_pos[0]), float(detected_pos[1]))))
            self._consecutive_missed = 0
            return detected_pos, detected_bbox, False

        self._consecutive_missed += 1
        if self._consecutive_missed > self.max_predict_frames or len(self._history) < 2:
            return None, None, False

        (f0, (x0, y0)), (f1, (x1, y1)) = list(self._history)[-2], self._history[-1]
        dt = f1 - f0
        if dt <= 0:
            return (int(x1), int(y1)), None, True
        vx = (x1 - x0) / dt
        vy = (y1 - y0) / dt
        steps = frame_id - f1
        px = x1 + vx * steps
        py = y1 + vy * steps
        px = clamp(px, 0, self.frame_w - 1)
        py = clamp(py, 0, self.frame_h - 1)
        return (int(px), int(py)), None, True


class SimpleReID:
    def __init__(self, max_gap_frames=60, max_dist_px=80.0, max_color_dist=30.0):
        self.max_gap        = int(max_gap_frames)
        self.max_dist       = float(max_dist_px)
        self.max_color_dist = float(max_color_dist)
        self.last_seen_frame = {}
        self.last_seen_pos   = {}
        self.last_seen_color = {}
        self.raw_to_stable   = {}
        self.next_stable     = 1

    def _color_dist(self, a, b):
        if a is None or b is None:
            return 1e9
        return float(np.linalg.norm(a - b))

    def update(self, frame, frame_id, raw_player_boxes):
        stable = {}
        used   = set()

        for raw_id, bbox in raw_player_boxes.items():
            cx, cy = bbox_center(bbox)
            color  = hsv_jersey_feature(frame, bbox)

            if raw_id in self.raw_to_stable:
                sid = self.raw_to_stable[raw_id]
            else:
                sid = None
                best_score = 1e18
                for cand_sid, last_f in self.last_seen_frame.items():
                    if cand_sid in used:
                        continue
                    gap = frame_id - last_f
                    if gap <= 0 or gap > self.max_gap:
                        continue
                    px, py = self.last_seen_pos.get(cand_sid, (1e9, 1e9))
                    dist = float(np.hypot(cx - px, cy - py))
                    if dist > self.max_dist:
                        continue
                    cd = self._color_dist(color, self.last_seen_color.get(cand_sid))
                    if cd > self.max_color_dist:
                        continue
                    score = dist + 2.0 * cd
                    if score < best_score:
                        best_score = score
                        sid = cand_sid
                if sid is None:
                    sid = self.next_stable
                    self.next_stable += 1
                self.raw_to_stable[raw_id] = sid

            stable[sid] = bbox
            used.add(sid)
            self.last_seen_frame[sid] = frame_id
            self.last_seen_pos[sid]   = (float(cx), float(cy))
            self.last_seen_color[sid] = color

        return stable


class TeamClusteringStable:
    def __init__(self, n_teams=2, min_players_to_init=8,
                 samples_per_player=6, team_names=None):
        self.n_teams             = n_teams
        self.min_players_to_init = int(min_players_to_init)
        self.samples_per_player  = int(samples_per_player)
        self.team_names          = team_names or {0: "Team A", 1: "Team B"}
        self.player_team         = {}
        self.team_centroids      = None
        self.player_features     = defaultdict(
            lambda: deque(maxlen=self.samples_per_player))

    def update_features(self, frame, stable_boxes):
        for pid, bbox in stable_boxes.items():
            feat = hsv_jersey_feature(frame, bbox)
            if feat is not None:
                self.player_features[pid].append(feat)

    def _mean_feat(self, pid):
        feats = self.player_features.get(pid)
        if not feats:
            return None
        return np.mean(np.stack(feats), axis=0)

    def assign(self):
        cands, ids = [], []
        for pid in self.player_features:
            if pid in self.player_team:
                continue
            if len(self.player_features[pid]) < max(2, self.samples_per_player // 2):
                continue
            mf = self._mean_feat(pid)
            if mf is not None:
                cands.append(mf)
                ids.append(pid)

        if self.team_centroids is None:
            if len(cands) < self.min_players_to_init:
                return self.player_team
            X  = np.array(cands, dtype=np.float32)
            km = KMeans(n_clusters=self.n_teams, random_state=42, n_init=10)
            labels = km.fit_predict(X)
            self.team_centroids = km.cluster_centers_
            for pid, t in zip(ids, labels):
                self.player_team[pid] = int(t)
            return self.player_team

        for pid in ids:
            f = self._mean_feat(pid)
            if f is None:
                continue
            dists = [np.linalg.norm(f - c) for c in self.team_centroids]
            self.player_team[pid] = int(np.argmin(dists))

        return self.player_team

    def team_name(self, tid):
        if tid is None or tid < 0:
            return "Unknown"
        return self.team_names.get(int(tid), f"Team {tid}")


class PitchTransformer:
    def __init__(self, pixel_points, meter_points):
        self.H, _ = cv2.findHomography(
            np.array(pixel_points, dtype=np.float32),
            np.array(meter_points, dtype=np.float32)
        )

    def pixel_to_meter(self, x, y):
        pt  = np.array([[[x, y]]], dtype=np.float32)
        out = cv2.perspectiveTransform(pt, self.H)
        return float(out[0][0][0]), float(out[0][0][1])


class GoalpostModel:
    def __init__(self, model_path, conf=0.30, freeze_frames=90,
                 frame_w=1280, frame_h=720, device="cuda", vertical_extent_ratio=0.4):
        self.model   = YOLO(model_path)
        # Move model to specified device
        if device == "cuda" and torch.cuda.is_available():
            self.model.to(device)
        self.conf    = float(conf)
        self.device  = device
        self.freeze  = int(freeze_frames)
        self.W       = int(frame_w)
        self.H       = int(frame_h)
        self.vertical_extent = float(vertical_extent_ratio)
        self._last_left   = None
        self._last_right  = None
        self._left_frame  = -999999
        self._right_frame = -999999

    def update(self, frame, frame_id):
        results    = self.model(frame, conf=self.conf, verbose=False, device=self.device)
        detections = []

        for r in results:
            if r.boxes is None:
                continue
            for box in r.boxes:
                cls_id = int(box.cls[0])
                if self.model.names.get(cls_id, "") != "post":
                    continue
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cx = (x1 + x2) / 2.0
                box_h  = y2 - y1
                y2_ext = min(self.H, y2 + int(box_h * self.vertical_extent))
                detections.append((cx, x1, y1, x2, y2_ext))

        mid       = self.W / 2.0
        left_det  = [d for d in detections if d[0] < mid]
        right_det = [d for d in detections if d[0] >= mid]

        def best_box(dets):
            if not dets:
                return None
            dets_sorted = sorted(dets, key=lambda d: d[3] - d[1], reverse=True)
            _, x1, y1, x2, y2 = dets_sorted[0]
            return (x1, y1, x2, y2)

        left_box  = best_box(left_det)
        right_box = best_box(right_det)

        if left_box is not None:
            self._last_left  = left_box
            self._left_frame = frame_id
        if right_box is not None:
            self._last_right  = right_box
            self._right_frame = frame_id

        if left_box is None and (frame_id - self._left_frame) <= self.freeze:
            left_box = self._last_left
        if right_box is None and (frame_id - self._right_frame) <= self.freeze:
            right_box = self._last_right

        return left_box, right_box


class GoalZone:
    def __init__(self, side, fps=30.0, confirm_frames=2,
                 cooldown_sec=8.0, frame_w=1280, frame_h=720):
        self.side    = side
        self.fps     = float(fps)
        self.confirm = int(confirm_frames)
        self.cooldown_frames = int(cooldown_sec * fps)
        self.W       = int(frame_w)
        self.H       = int(frame_h)
        self.rect    = None
        self._streak         = 0
        self._cooldown_until = -1
        self._prev_ball_x    = None

    def set_rect(self, box):
        if box is not None:
            self.rect = box

    def update(self, frame_id, ball_pos_px):
        if self.rect is None:
            return None

        if frame_id < self._cooldown_until:
            if ball_pos_px:
                self._prev_ball_x = ball_pos_px[0]
            self._streak = 0
            return None

        if ball_pos_px is None:
            self._streak = 0
            return None

        cx, cy = ball_pos_px
        rx1, ry1, rx2, ry2 = self.rect

        moving_in = True
        if self._prev_ball_x is not None:
            dx = cx - self._prev_ball_x
            if self.side == "right" and dx < -2:
                moving_in = False
            if self.side == "left"  and dx > +2:
                moving_in = False
        self._prev_ball_x = cx

        inside = pt_in_rect(cx, cy, rx1, ry1, rx2, ry2)

        if inside and moving_in:
            self._streak += 1
        else:
            self._streak = 0

        if self._streak >= self.confirm:
            self._streak         = 0
            self._cooldown_until = frame_id + self.cooldown_frames
            return {
                "frame":   frame_id,
                "t_sec":   frame_id / self.fps,
                "side":    self.side,
                "method":  "goalpost_model",
                "ball_px": (cx, cy),
            }
        return None


class PossessionHistoryTracker:
    def __init__(self, max_touch_dist_px=65.0, hold_frames=5,
                 history_len=15, max_assist_gap_sec=8.0, fps=30.0):
        self.max_dist       = float(max_touch_dist_px)
        self.hold_frames    = int(hold_frames)
        self.fps            = float(fps)
        self.max_assist_gap = float(max_assist_gap_sec * fps)
        self.touch_history    = deque(maxlen=int(history_len))
        self.last_touch_pid   = None
        self.last_touch_frame = -999999

    def update(self, frame_id, ball_pos_px, stable_boxes, team_map):
        if ball_pos_px is None:
            return

        bx, by    = ball_pos_px
        best_pid  = None
        best_dist = 1e18

        for pid, bbox in stable_boxes.items():
            fx, fy = bbox_feet(bbox)
            d = float(np.hypot(bx - fx, by - fy))
            if d < best_dist:
                best_dist = d
                best_pid  = pid

        if best_pid is None or best_dist > self.max_dist:
            return

        if (frame_id - self.last_touch_frame) < self.hold_frames:
            self.last_touch_frame = frame_id
            return

        if best_pid != self.last_touch_pid:
            self.touch_history.append({
                "frame_id":  frame_id,
                "player_id": best_pid,
                "team_id":   team_map.get(best_pid, -1),
            })
            self.last_touch_pid   = best_pid
            self.last_touch_frame = frame_id

    def get_scorer_and_assist(self, goal_frame_id):
        if not self.touch_history:
            return None, None, False

        scorer_entry = self.touch_history[-1]
        scorer_pid   = scorer_entry["player_id"]
        scorer_team  = scorer_entry["team_id"]
        assist_pid   = None

        for entry in reversed(list(self.touch_history)[:-1]):
            if entry["player_id"] == scorer_pid:
                continue
            if entry["team_id"] != scorer_team:
                continue
            if (goal_frame_id - entry["frame_id"]) > self.max_assist_gap:
                break
            assist_pid = entry["player_id"]
            break

        return scorer_pid, assist_pid, False


class DefensiveStatsTracker:
    """Heuristic tackles, interceptions, and blocks from possession and ball trajectory."""

    def __init__(self, fps, tackle_dist_px=100.0, intercept_min_dist_px=100.0,
                 block_angle_deg=90.0, block_prox_px=80.0,
                 cooldown_frames=15):
        self.fps = float(fps)
        self.tackle_dist = float(tackle_dist_px)
        self.intercept_min_dist = float(intercept_min_dist_px)
        self.block_angle = float(block_angle_deg)
        self.block_prox = float(block_prox_px)
        self.cooldown = int(cooldown_frames)

        self.tackles = defaultdict(int)
        self.interceptions = defaultdict(int)
        self.blocks = defaultdict(int)

        self._prev_possessor = None
        self._prev_poss_team = -1
        self._prev_poss_pos = None
        self._ball_history = deque(maxlen=5)
        self._last_event_frame = -999999

    def update(self, frame_id, ball_pos_px, stable_boxes, team_map, possession):
        if ball_pos_px is not None:
            self._ball_history.append((frame_id, ball_pos_px))

        self._check_block(frame_id, ball_pos_px, stable_boxes, team_map, possession)

        cur_pid = possession.last_touch_pid
        cur_team = team_map.get(cur_pid, -1) if cur_pid else -1

        if (cur_pid is not None and
            self._prev_possessor is not None and
            cur_pid != self._prev_possessor and
            cur_team >= 0 and self._prev_poss_team >= 0 and
            cur_team != self._prev_poss_team and
            (frame_id - self._last_event_frame) > self.cooldown):

            cur_box = stable_boxes.get(cur_pid)
            if cur_box is not None and self._prev_poss_pos is not None:
                cx, cy = bbox_feet(cur_box)
                px, py = self._prev_poss_pos
                dist = float(np.hypot(cx - px, cy - py))

                if dist < self.tackle_dist:
                    self.tackles[cur_pid] += 1
                else:
                    self.interceptions[cur_pid] += 1
                self._last_event_frame = frame_id

        if cur_pid is not None:
            self._prev_possessor = cur_pid
            self._prev_poss_team = cur_team
            cur_box = stable_boxes.get(cur_pid)
            if cur_box is not None:
                self._prev_poss_pos = bbox_feet(cur_box)

    def _check_block(self, frame_id, ball_pos_px, stable_boxes, team_map, possession):
        if len(self._ball_history) < 3 or ball_pos_px is None:
            return
        if (frame_id - self._last_event_frame) <= self.cooldown:
            return

        (_, p1), (_, p2), (_, p3) = (list(self._ball_history)[-3],
                                      list(self._ball_history)[-2],
                                      list(self._ball_history)[-1])
        v1x, v1y = p2[0] - p1[0], p2[1] - p1[1]
        v2x, v2y = p3[0] - p2[0], p3[1] - p2[1]
        m1 = np.hypot(v1x, v1y)
        m2 = np.hypot(v2x, v2y)
        if m1 < 3 or m2 < 3:
            return

        cos_a = max(-1.0, min(1.0, (v1x * v2x + v1y * v2y) / (m1 * m2)))
        angle = np.degrees(np.arccos(cos_a))
        if angle < self.block_angle:
            return

        poss_team = team_map.get(possession.last_touch_pid, -1) if possession.last_touch_pid else -1
        best_pid, best_d = None, 1e18
        for pid, bbox in stable_boxes.items():
            pt = team_map.get(pid, -1)
            if pt < 0 or pt == poss_team:
                continue
            fx, fy = bbox_feet(bbox)
            d = float(np.hypot(ball_pos_px[0] - fx, ball_pos_px[1] - fy))
            if d < best_d:
                best_d = d
                best_pid = pid
        if best_pid is not None and best_d < self.block_prox:
            self.blocks[best_pid] += 1
            self._last_event_frame = frame_id

    def get_stats(self, pid):
        return {
            "tackles": self.tackles.get(pid, 0),
            "interceptions": self.interceptions.get(pid, 0),
            "blocks": self.blocks.get(pid, 0),
        }

    def summary_table(self):
        all_pids = sorted(set(list(self.tackles.keys()) +
                               list(self.interceptions.keys()) +
                               list(self.blocks.keys())))
        rows = []
        for pid in all_pids:
            rows.append({
                "player_id": int(pid),
                "tackles": self.tackles.get(pid, 0),
                "interceptions": self.interceptions.get(pid, 0),
                "blocks": self.blocks.get(pid, 0),
            })
        df = pd.DataFrame(rows)
        if len(df) == 0:
            df = pd.DataFrame(columns=["player_id", "tackles", "interceptions", "blocks"])
        return df.sort_values("player_id")


class GoalAssistAttributor:
    def __init__(self, left_zone: GoalZone, right_zone: GoalZone,
                 left_defending_team=0, right_defending_team=1):
        self.zones  = {"left": left_zone, "right": right_zone}
        self.defend = {"left": left_defending_team, "right": right_defending_team}
        self.goals  = []

    def update(self, frame_id, ball_pos_px,
               possession: PossessionHistoryTracker, team_map, team_obj):
        for side, det in self.zones.items():
            g = det.update(frame_id, ball_pos_px)
            if g is None:
                continue

            scorer_pid, assist_pid, _ = possession.get_scorer_and_assist(frame_id)
            scorer_team   = team_map.get(scorer_pid, -1) if scorer_pid else -1
            credited_team = scorer_team

            event = {
                "type":               "GOAL",
                "frame":              int(frame_id),
                "t_sec":              float(g["t_sec"]),
                "method":             g["method"],
                "side":               side,
                "scorer_id":          int(scorer_pid)  if scorer_pid  is not None else -1,
                "assist_id":          int(assist_pid)  if assist_pid  is not None else -1,
                "scoring_team":       int(scorer_team),
                "credited_team":      int(credited_team),
                "scorer_team_name":   team_obj.team_name(scorer_team),
                "credited_team_name": team_obj.team_name(credited_team),
            }
            self.goals.append(event)
            return event
        return None

    def score(self):
        s = defaultdict(int)
        for g in self.goals:
            if g["credited_team"] >= 0:
                s[g["credited_team"]] += 1
        return dict(s)


class SpeedDistanceCalculator:
    def __init__(self, fps, max_speed_kph=40.0, min_move_m=0.05, ema_alpha=0.4):
        self.fps           = float(fps)
        self.max_speed_mps = float(max_speed_kph) / 3.6
        self.min_move_m    = float(min_move_m)
        self.ema_alpha     = float(ema_alpha)
        self.last_pos      = {}
        self.last_frame    = {}
        self.total_dist    = defaultdict(float)
        self.speed_ema_mps = defaultdict(float)
        self.max_speed_seen_mps = defaultdict(float)

    def update(self, players_meter, frame_id):
        out = {}
        for pid, info in players_meter.items():
            x, y = info["position"]

            if pid not in self.last_pos:
                self.last_pos[pid]   = (x, y)
                self.last_frame[pid] = frame_id
                out[pid] = {
                    "distance_this_frame_m": 0.0,
                    "total_distance_m": 0.0,
                    "speed_kph": 0.0,
                    "max_speed_kph": 0.0
                }
                continue

            dt = (frame_id - self.last_frame[pid]) / self.fps
            if dt <= 0:
                ema = float(self.speed_ema_mps[pid])
                out[pid] = {
                    "distance_this_frame_m": 0.0,
                    "total_distance_m": float(self.total_dist[pid]),
                    "speed_kph": float(ema * 3.6),
                    "max_speed_kph": float(self.max_speed_seen_mps[pid] * 3.6)
                }
                continue

            px, py = self.last_pos[pid]
            dist   = float(np.hypot(x - px, y - py))
            if dist < self.min_move_m:
                dist = 0.0

            spd_mps = dist / dt if dt > 0 else 0.0
            if spd_mps > self.max_speed_mps:
                dist = 0.0
                spd_mps = 0.0

            self.total_dist[pid] += dist

            prev_ema = float(self.speed_ema_mps[pid])
            new_ema  = self.ema_alpha * spd_mps + (1 - self.ema_alpha) * prev_ema
            self.speed_ema_mps[pid] = new_ema
            self.max_speed_seen_mps[pid] = max(float(self.max_speed_seen_mps[pid]), float(new_ema))

            self.last_pos[pid]   = (x, y)
            self.last_frame[pid] = frame_id

            out[pid] = {
                "distance_this_frame_m": float(dist),
                "total_distance_m": float(self.total_dist[pid]),
                "speed_kph": float(new_ema * 3.6),
                "max_speed_kph": float(self.max_speed_seen_mps[pid] * 3.6),
            }

        return out


class InjuryRiskAnalyzer:
    def __init__(
        self,
        fps: float,
        hsr_kph: float = 19.8,
        sprint_kph: float = 25.2,
        sprint_end_kph: float = 23.0,
        risk_w_hsr_per_m: float = 1.0,
        risk_w_sprint: float = 30.0,
        top_k_minutes: int = 5
    ):
        self.fps = float(fps)
        self.hsr_kph = float(hsr_kph)
        self.sprint_kph = float(sprint_kph)
        self.sprint_end_kph = float(sprint_end_kph)
        self.risk_w_hsr_per_m = float(risk_w_hsr_per_m)
        self.risk_w_sprint = float(risk_w_sprint)
        self.top_k_minutes = int(top_k_minutes)
        self.hsr_dist_m = defaultdict(float)
        self.sprint_count = defaultdict(int)
        self._is_sprinting = defaultdict(bool)
        self.minute_hsr_m = defaultdict(float)
        self.minute_sprints = defaultdict(int)

    def update(self, player_metrics: dict, frame_id: int):
        t_sec = frame_id / self.fps
        minute = int(t_sec // 60)

        for pid, info in player_metrics.items():
            spd = float(info.get("speed_kph", 0.0))
            d = float(info.get("distance_this_frame_m", 0.0))

            if spd >= self.hsr_kph and d > 0:
                self.hsr_dist_m[pid] += d
                self.minute_hsr_m[(pid, minute)] += d

            if not self._is_sprinting[pid] and spd >= self.sprint_kph:
                self._is_sprinting[pid] = True
                self.sprint_count[pid] += 1
                self.minute_sprints[(pid, minute)] += 1
            elif self._is_sprinting[pid] and spd <= self.sprint_end_kph:
                self._is_sprinting[pid] = False

    def summary_tables(self):
        import pandas as pd
        players = sorted(set(list(self.hsr_dist_m.keys()) + list(self.sprint_count.keys())))
        rows = []
        for pid in players:
            rows.append({
                "player_id": int(pid),
                "hsr_distance_m": float(self.hsr_dist_m.get(pid, 0.0)),
                "sprint_count": int(self.sprint_count.get(pid, 0)),
            })
        df = pd.DataFrame(rows)
        if len(df) == 0:
            df = pd.DataFrame(columns=["player_id", "hsr_distance_m", "sprint_count"])
        return df.sort_values(["hsr_distance_m", "sprint_count"], ascending=[False, False])
