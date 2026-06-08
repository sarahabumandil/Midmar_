import { Match } from '../models/Match.js';
import { Player } from '../models/Player.js';
import { IdMapping } from '../models/IdMapping.js';
import { PlayerMatchStat } from '../models/PlayerMatchStat.js';
import { PlayerAggregate } from '../models/PlayerAggregate.js';
import { Club } from '../models/Team.js';
import { logActivity } from '../services/activityLog.service.js';

const toNumber = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const createMatch = async (req, res) => {
  const { title, opponent, matchDate, videoPath } = req.body || {};
  if (!req.user?.clubId) {
    return res.status(400).json({ error: 'Club context is missing for user' });
  }
  if (!title || !matchDate) {
    return res.status(400).json({ error: 'title and matchDate are required' });
  }
  const match = await Match.create({
    clubId: req.user.clubId,
    createdBy: req.user._id,
    title: String(title).trim(),
    opponent: String(opponent || '').trim(),
    matchDate: new Date(matchDate),
    videoPath: String(videoPath || ''),
    status: 'created',
  });
  await logActivity(req, {
    action: 'Create Match',
    resource: 'Matches',
    status: 'success',
    details: `Created match ${match.title}`,
    metadata: { matchId: String(match._id) },
  });
  return res.status(201).json({ match });
};

export const listMatches = async (req, res) => {
  if (!req.user?.clubId && req.user?.role !== 'admin') {
    return res.status(400).json({ error: 'Club context is missing for user' });
  }
  const filter = req.user.role === 'admin' ? {} : { clubId: req.user.clubId };
  const matches = await Match.find(filter).sort({ matchDate: -1, createdAt: -1 }).limit(100);
  return res.json({ matches });
};

export const saveRawInsights = async (req, res) => {
  const { matchId } = req.params;
  const { rawInsights } = req.body || {};
  if (!Array.isArray(rawInsights)) {
    return res.status(400).json({ error: 'rawInsights[] is required' });
  }
  const match = await Match.findOne({ _id: matchId, clubId: req.user.clubId });
  if (!match) return res.status(404).json({ error: 'Match not found' });
  match.rawInsights = rawInsights;
  match.status = 'processed';
  await match.save();
  await logActivity(req, {
    action: 'Save Raw Insights',
    resource: 'Matches',
    status: 'success',
    details: `Saved ${rawInsights.length} raw insight rows`,
    metadata: { matchId: String(match._id), rawInsightsCount: rawInsights.length },
  });
  return res.json({ message: 'Raw insights saved', count: rawInsights.length });
};

export const mapTempIds = async (req, res) => {
  const { matchId } = req.params;
  const { mappings } = req.body || {};
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return res.status(400).json({ error: 'mappings[] is required' });
  }
  const match = await Match.findOne({ _id: matchId, clubId: req.user.clubId });
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const playerGlobalIds = mappings.map((m) => Number(m.globalId));
  const players = await Player.find({
    clubId: req.user.clubId,
    globalId: { $in: playerGlobalIds },
  }).select('_id globalId');
  const existingGlobalIds = new Set(players.map((p) => p.globalId));
  for (const gid of playerGlobalIds) {
    if (!existingGlobalIds.has(gid)) {
      return res.status(400).json({ error: `Global ID ${gid} not found in your club players` });
    }
  }

  for (const m of mappings) {
    await IdMapping.findOneAndUpdate(
      {
        clubId: req.user.clubId,
        matchId: match._id,
        tempTrackingId: Number(m.tempTrackingId),
      },
      {
        $set: {
          globalId: Number(m.globalId),
          assignedBy: req.user._id,
        },
      },
      { upsert: true, new: true }
    );
  }
  match.status = 'mapped';
  match.mappingCompletedAt = new Date();
  await match.save();
  await logActivity(req, {
    action: 'Map Player IDs',
    resource: 'Matches',
    status: 'success',
    details: `Mapped ${mappings.length} tracking IDs`,
    metadata: { matchId: String(match._id), mappingsCount: mappings.length },
  });
  return res.json({ message: 'Mappings saved', count: mappings.length });
};

const recomputeAggregateForPlayer = async ({ clubId, playerId, globalId, windowSize = 6 }) => {
  const latest = await PlayerMatchStat.find({ clubId, playerId })
    .sort({ createdAt: -1 })
    .limit(windowSize);

  const totals = latest.reduce(
    (acc, s) => {
      acc.goals += s.metrics.goals || 0;
      acc.assists += s.metrics.assists || 0;
      acc.minutesPlayed += s.metrics.minutesPlayed || 0;
      acc.interceptions += s.metrics.interceptions || 0;
      acc.tackles += s.metrics.tackles || 0;
      acc.blocks += s.metrics.blocks || 0;
      acc.distanceM += s.metrics.distanceM || 0;
      acc.hsrM += s.metrics.hsrM || 0;
      acc.riskScore += s.metrics.riskScore || 0;
      acc.sprints += s.metrics.sprints || 0;
      acc.injuryProbability += s.metrics.injuryProbability || 0;
      return acc;
    },
    {
      goals: 0,
      assists: 0,
      minutesPlayed: 0,
      interceptions: 0,
      tackles: 0,
      blocks: 0,
      distanceM: 0,
      hsrM: 0,
      riskScore: 0,
      sprints: 0,
      injuryProbability: 0,
    }
  );

  const count = latest.length || 1;
  await PlayerAggregate.findOneAndUpdate(
    { clubId, playerId, globalId, windowSize },
    {
      $set: {
        matchCount: latest.length,
        totals: {
          goals: totals.goals,
          assists: totals.assists,
          minutesPlayed: totals.minutesPlayed,
          interceptions: totals.interceptions,
          tackles: totals.tackles,
          blocks: totals.blocks,
          distanceM: totals.distanceM,
          hsrM: totals.hsrM,
          riskScore: totals.riskScore,
          sprints: totals.sprints,
        },
        averages: {
          distanceM: totals.distanceM / count,
          hsrM: totals.hsrM / count,
          riskScore: totals.riskScore / count,
          injuryProbability: totals.injuryProbability / count,
        },
        updatedAtSource: new Date(),
      },
    },
    { upsert: true, new: true }
  );
};

/**
 * Writes PlayerMatchStat rows from rawInsights + IdMapping, updates aggregates and club counters.
 * Sets match status to finalized.
 */
async function applyMatchFinalization(req, match) {
  const mappings = await IdMapping.find({ clubId: req.user.clubId, matchId: match._id });
  if (!mappings.length) {
    throw new Error('No ID mappings found for this match');
  }
  const mapByTemp = new Map(mappings.map((m) => [m.tempTrackingId, m.globalId]));

  const players = await Player.find({ clubId: req.user.clubId }).select('_id globalId position');
  const playerByGlobal = new Map(players.map((p) => [p.globalId, p]));

  const sourceInsights = Array.isArray(match.rawInsights) ? match.rawInsights : [];
  const participatedPlayerIds = new Set();
  let upsertCount = 0;
  for (const s of sourceInsights) {
    const tempId = Number(s.pid ?? s.tempTrackingId);
    const globalId = mapByTemp.get(tempId);
    if (!globalId) continue;
    const player = playerByGlobal.get(globalId);
    if (!player) continue;
    participatedPlayerIds.add(player._id.toString());

    const metrics = {
      goals: toNumber(s.g),
      assists: toNumber(s.a),
      minutesPlayed: toNumber(s.minutesPlayed, 90),
      interceptions: toNumber(s.interceptions),
      tackles: toNumber(s.tackles),
      blocks: toNumber(s.blocks),
      distanceM: toNumber(s.dist_m),
      hsrM: toNumber(s.hsr_m),
      riskScore: toNumber(s.risk),
      injuryProbability: Math.max(0, Math.min(1, toNumber(s.injuryProbability, 0))),
      maxSpeed: toNumber(s.max_spd),
      sprints: toNumber(s.spr),
    };

    await PlayerMatchStat.findOneAndUpdate(
      {
        clubId: req.user.clubId,
        matchId: match._id,
        globalId,
      },
      {
        $set: {
          playerId: player._id,
          tempTrackingId: tempId,
          position: player.position || '',
          metrics,
        },
      },
      { upsert: true, new: true }
    );
    upsertCount += 1;

    await Player.findByIdAndUpdate(player._id, {
      $inc: {
        'stats.matches': 1,
        'stats.goals': metrics.goals,
        'stats.assists': metrics.assists,
        'stats.tackles': metrics.tackles,
        'stats.interceptions': metrics.interceptions,
        'stats.minutesPlayed': metrics.minutesPlayed,
        // CV workload metrics persisted on player profile for injury model inputs.
        'stats.distanceCoveredKm': metrics.distanceM / 1000,
        'stats.sprintCount': metrics.sprints,
        'stats.hsrM': metrics.hsrM,
      },
      $max: {
        // Keep best observed top speed from analyzed matches.
        'stats.maxSpeedKmh': metrics.maxSpeed,
      },
    });

    await recomputeAggregateForPlayer({
      clubId: req.user.clubId,
      playerId: player._id,
      globalId: player.globalId,
      windowSize: 6,
    });
  }

  // Update consecutive missed matches for all club players
  const matchDate = match.matchDate || new Date();
  const bulkOps = players.map((p) => ({
    updateOne: {
      filter: { _id: p._id },
      update: participatedPlayerIds.has(p._id.toString())
        ? { $set: { consecutiveMissedMatches: 0, lastPlayedDate: matchDate } }
        : { $inc: { consecutiveMissedMatches: 1 } },
    },
  }));
  if (bulkOps.length > 0) await Player.bulkWrite(bulkOps);

  match.status = 'finalized';
  match.finalizedAt = new Date();
  await match.save();

  await Club.findByIdAndUpdate(req.user.clubId, { $inc: { totalMatches: 1, videosAnalyzed: 1 } });

  return upsertCount;
}

export const finalizeMatch = async (req, res) => {
  const { matchId } = req.params;
  const match = await Match.findOne({ _id: matchId, clubId: req.user.clubId });
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.status === 'finalized') {
    return res.status(400).json({ error: 'Match already finalized' });
  }

  try {
    const upsertCount = await applyMatchFinalization(req, match);
    await logActivity(req, {
      action: 'Finalize Match',
      resource: 'Matches',
      status: 'success',
      details: `Finalized match ${match.title}`,
      metadata: { matchId: String(match._id), upsertedStats: upsertCount },
    });
    return res.json({ message: 'Match finalized', upsertedStats: upsertCount });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Finalize failed' });
  }
};

/**
 * One-shot: create a match from CV output, save PID→globalId mappings, finalize stats.
 * Body: { title, matchDate, opponent?, rawInsights[], mappings: [{ tempTrackingId, globalId }], analysisOutputFilename? }
 */
export const commitVideoAnalysis = async (req, res) => {
  const {
    title,
    matchDate,
    opponent,
    rawInsights,
    mappings,
    analysisOutputFilename,
  } = req.body || {};

  if (!req.user?.clubId) {
    return res.status(400).json({ error: 'Club context is missing for user' });
  }
  if (!title || !matchDate) {
    return res.status(400).json({ error: 'title and matchDate are required' });
  }
  if (!Array.isArray(rawInsights) || rawInsights.length === 0) {
    return res.status(400).json({ error: 'rawInsights[] is required' });
  }
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return res.status(400).json({ error: 'mappings[] is required (map each CV player ID to a club global ID)' });
  }

  const playerGlobalIds = mappings.map((m) => Number(m.globalId));
  const players = await Player.find({
    clubId: req.user.clubId,
    globalId: { $in: playerGlobalIds },
  }).select('_id globalId');
  const existingGlobalIds = new Set(players.map((p) => p.globalId));
  for (const gid of playerGlobalIds) {
    if (!existingGlobalIds.has(gid)) {
      return res.status(400).json({ error: `Global ID ${gid} not found in your club players` });
    }
  }

  const match = await Match.create({
    clubId: req.user.clubId,
    createdBy: req.user._id,
    title: String(title).trim(),
    opponent: String(opponent || '').trim(),
    matchDate: new Date(matchDate),
    videoPath: '',
    analysisOutputFilename: String(analysisOutputFilename || '').trim(),
    rawInsights,
    status: 'processed',
  });

  for (const m of mappings) {
    await IdMapping.findOneAndUpdate(
      {
        clubId: req.user.clubId,
        matchId: match._id,
        tempTrackingId: Number(m.tempTrackingId),
      },
      {
        $set: {
          globalId: Number(m.globalId),
          assignedBy: req.user._id,
        },
      },
      { upsert: true, new: true }
    );
  }
  match.status = 'mapped';
  match.mappingCompletedAt = new Date();
  await match.save();

  try {
    const upsertCount = await applyMatchFinalization(req, match);
    await logActivity(req, {
      action: 'Commit Video Analysis',
      resource: 'Video Analysis',
      status: 'success',
      details: `Committed video analysis for ${match.title}`,
      metadata: { matchId: String(match._id), upsertedStats: upsertCount },
    });
    return res.status(201).json({
      message: 'Video analysis saved to database',
      match,
      upsertedStats: upsertCount,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Failed to finalize match stats' });
  }
};
