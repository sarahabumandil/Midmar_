import { Player } from '../models/Player.js';
import { PlayerMatchStat } from '../models/PlayerMatchStat.js';
import { Match } from '../models/Match.js';
import { User } from '../models/User.js';
import { Club } from '../models/Team.js';
import { ReportEmailRequest } from '../models/ReportEmailRequest.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { InjuryPrediction } from '../models/InjuryPrediction.js';
import { MarketValuePrediction } from '../models/MarketValuePrediction.js';

const moneyFmt = (n) => `€${(Number(n || 0) / 1_000_000).toFixed(1)}M`;
const pct = (n) => Math.max(0, Math.min(100, Number(n || 0)));
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n || 0)));
const monthLabel = (year, month) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'short' });

const riskPercentFromMetrics = (metrics = {}) => {
  if (Number.isFinite(Number(metrics.injuryProbability)) && Number(metrics.injuryProbability) > 0) {
    return pct(Number(metrics.injuryProbability) * 100);
  }
  const raw = Number(metrics.riskScore || 0);
  if (raw <= 1) return pct(raw * 100);
  if (raw <= 100) return pct(raw);
  return pct(raw / 2);
};

const riskLevelFromPercent = (riskPercent) => {
  if (riskPercent >= 60) return 'high';
  if (riskPercent >= 35) return 'medium';
  return 'low';
};

const countHighRiskAlerts = async (match) => {
  const rows = await InjuryPrediction.aggregate([
    { $match: { ...match, playerId: { $ne: null } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$playerId',
        doc: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$doc' } },
    {
      $match: {
        $or: [
          { riskLevel: 'high' },
          { riskProbability: { $gte: 0.6 } },
        ],
      },
    },
    { $count: 'total' },
  ]);
  return Number(rows?.[0]?.total || 0);
};

export const analystDashboard = async (req, res) => {
  if (!req.user?.clubId) return res.status(400).json({ error: 'Club context missing' });
  const clubId = req.user.clubId;
  const predictionMatch = req.user.role === 'admin' ? {} : { clubId };

  const [totalPlayers, totalMatches, latestStats, latestValueRows, club, injuryAlerts] = await Promise.all([
    Player.countDocuments({ clubId }),
    Match.countDocuments({ clubId, status: 'finalized' }),
    PlayerMatchStat.find({ clubId }).sort({ createdAt: -1 }).limit(300),
    MarketValuePrediction.aggregate([
      { $match: { clubId, playerId: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$playerId', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ]),
    Club.findById(clubId),
    countHighRiskAlerts(predictionMatch),
  ]);

  const riskHigh = injuryAlerts;
  let totalRisk = 0;
  let totalDistance = 0;
  for (const s of latestStats) {
    const risk = riskPercentFromMetrics(s.metrics || {});
    totalRisk += risk;
    totalDistance += Number(s.metrics?.distanceM || 0);
  }
  const marketValueMillions = latestValueRows.reduce((acc, row) => acc + Number(row.predictedValue || 0), 0);

  return res.json({
    totalPlayers,
    totalMatches,
    videosAnalyzed: club?.videosAnalyzed || 0,
    injuryAlerts,
    riskHigh,
    avgRisk: latestStats.length ? Number((totalRisk / latestStats.length).toFixed(2)) : 0,
    avgDistance: latestStats.length ? Number((totalDistance / latestStats.length).toFixed(2)) : 0,
    marketValue: moneyFmt(marketValueMillions * 1_000_000),
  });
};

export const adminDashboard = async (_req, res) => {
  const [totalUsers, totalPlayers, totalMatches, totalClubs, injuryAlerts, latestValueRows] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Player.countDocuments({}),
    Match.countDocuments({ status: 'finalized' }),
    Club.countDocuments({}),
    countHighRiskAlerts({}),
    MarketValuePrediction.aggregate([
      { $match: { playerId: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$playerId', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ]),
  ]);

  const portfolioMillions = latestValueRows.reduce((acc, row) => acc + Number(row.predictedValue || 0), 0);

  return res.json({
    totalUsers,
    totalPlayers,
    totalMatches,
    totalClubs,
    injuryAlerts,
    totalPortfolioValue: moneyFmt(portfolioMillions * 1_000_000),
  });
};

export const dashboardRiskOverview = async (req, res) => {
  const limit = Math.max(1, Math.min(20, Number(req.query.limit || 5)));
  const match = req.user.role === 'admin' ? {} : { clubId: req.user.clubId };

  const latestByPlayer = await InjuryPrediction.aggregate([
    { $match: match },
    { $match: { playerId: { $ne: null } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$playerId',
        doc: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$doc' } },
    {
      $lookup: {
        from: 'players',
        localField: 'playerId',
        foreignField: '_id',
        as: 'player',
      },
    },
    { $unwind: '$player' },
    { $sort: { riskProbability: -1, createdAt: -1 } },
    { $limit: limit },
  ]);

  const players = latestByPlayer.map((row) => {
    const riskProbability = clamp01(Number(row.riskProbability || 0));
    return {
      id: String(row.player?._id),
      name: row.player?.name || 'Unknown',
      position: row.player?.position || 'N/A',
      team: row.player?.teamName || 'N/A',
      riskProbability,
      riskLevel: row.riskLevel || riskLevelFromPercent(riskProbability * 100),
      updatedAt: row.createdAt,
    };
  });

  return res.json({ players });
};

export const dashboardPerformanceTrends = async (req, res) => {
  const months = Math.max(3, Math.min(12, Number(req.query.months || 6)));
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCMonth(since.getUTCMonth() - (months - 1));

  const match = {
    createdAt: { $gte: since },
    ...(req.user.role === 'admin' ? {} : { clubId: req.user.clubId }),
  };

  const grouped = await PlayerMatchStat.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        predictions: { $sum: 1 },
        avgInjuryProbability: { $avg: '$metrics.injuryProbability' },
        avgRiskScore: { $avg: '$metrics.riskScore' },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  const byKey = new Map(
    grouped.map((g) => {
      const key = `${g._id.year}-${g._id.month}`;
      const injuryProb = clamp01(g.avgInjuryProbability);
      const fallbackProb = clamp01(Number(g.avgRiskScore || 0) > 1 ? Number(g.avgRiskScore || 0) / 200 : Number(g.avgRiskScore || 0));
      const inferredInjury = injuryProb > 0 ? injuryProb : fallbackProb;
      const accuracy = pct((1 - inferredInjury) * 100);
      return [
        key,
        {
          predictions: Number(g.predictions || 0),
          accuracy: Number(accuracy.toFixed(1)),
        },
      ];
    })
  );

  const points = [];
  const cursor = new Date(since);
  for (let i = 0; i < months; i += 1) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const key = `${year}-${month}`;
    const found = byKey.get(key) || { predictions: 0, accuracy: 0 };
    points.push({
      month: monthLabel(year, month),
      predictions: found.predictions,
      accuracy: found.accuracy,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return res.json({ points });
};

export const dashboardRecentActivity = async (req, res) => {
  const limit = Math.max(1, Math.min(30, Number(req.query.limit || 8)));
  const match = req.user.role === 'admin' ? {} : { clubId: req.user.clubId };

  const logs = await ActivityLog.find(match).sort({ createdAt: -1 }).limit(limit);
  const activities = logs.map((log) => {
    const resource = String(log.resource || '').toLowerCase();
    const action = String(log.action || '').toLowerCase();
    let type = 'ai';
    if (resource.includes('injury')) type = 'injury';
    else if (resource.includes('video') || action.includes('video')) type = 'video';
    else if (resource.includes('market') || action.includes('value')) type = 'value';
    return {
      id: String(log._id),
      type,
      title: log.action,
      description: log.details || `${log.action} on ${log.resource}`,
      timestamp: log.createdAt,
    };
  });
  return res.json({ activities });
};

export const adminAnalyticsOverview = async (req, res) => {
  const months = Math.max(3, Math.min(12, Number(req.query.months || 6)));
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCMonth(since.getUTCMonth() - (months - 1));

  const [users, clubs, playerCount, matchesTotal, playersByClub, matchesByClub, recentUsers, recentPlayers, recentMatches, latestRiskRows, latestValueRows] = await Promise.all([
    User.find({ role: 'user' }).select('_id clubId createdAt').lean(),
    Club.find({}).select('_id name').lean(),
    Player.countDocuments({}),
    Match.countDocuments({ status: 'finalized' }),
    Player.aggregate([{ $group: { _id: '$clubId', count: { $sum: 1 } } }]),
    Match.aggregate([
      { $match: { status: 'finalized' } },
      { $group: { _id: '$clubId', count: { $sum: 1 } } },
    ]),
    User.find({ role: 'user', createdAt: { $gte: since } }).select('createdAt').lean(),
    Player.find({ createdAt: { $gte: since } }).select('createdAt').lean(),
    Match.find({ status: 'finalized', createdAt: { $gte: since } }).select('createdAt').lean(),
    InjuryPrediction.aggregate([
      { $match: { playerId: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$playerId', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ]),
    MarketValuePrediction.aggregate([
      { $match: { playerId: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$playerId', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ]),
  ]);

  const clubById = new Map(clubs.map((c) => [String(c._id), c]));
  const teamRows = clubs.map((club) => ({
    name: club.name,
    players: 0,
    injuries: 0,
    videos: 0,
    marketValue: 0,
  }));
  const teamIndex = new Map(teamRows.map((t) => [t.name, t]));

  playersByClub.forEach((row) => {
    const club = clubById.get(String(row._id));
    if (!club) return;
    const target = teamIndex.get(club.name);
    if (target) target.players = Number(row.count || 0);
  });

  matchesByClub.forEach((row) => {
    const club = clubById.get(String(row._id));
    if (!club) return;
    const target = teamIndex.get(club.name);
    if (!target) return;
    target.videos = Number(row.count || 0);
  });

  latestRiskRows.forEach((row) => {
    const cid = String(row.clubId || '');
    if (!cid) return;
    const club = clubById.get(cid);
    if (!club) return;
    const target = teamIndex.get(club.name);
    if (!target) return;
    const isHigh = row.riskLevel === 'high' || Number(row.riskProbability || 0) >= 0.6;
    if (isHigh) target.injuries += 1;
  });

  latestValueRows.forEach((row) => {
    const cid = String(row.clubId || '');
    if (!cid) return;
    const club = clubById.get(cid);
    if (!club) return;
    const target = teamIndex.get(club.name);
    if (!target) return;
    target.marketValue += Number(row.predictedValue || 0);
  });

  const groupByMonth = (rows) =>
    rows.reduce((acc, r) => {
      const d = new Date(r.createdAt);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
      acc.set(key, (acc.get(key) || 0) + 1);
      return acc;
    }, new Map());

  const userGrouped = groupByMonth(recentUsers);
  const playerGrouped = groupByMonth(recentPlayers);
  const matchGrouped = groupByMonth(recentMatches);

  const usageTrends = [];
  const cursor = new Date(since);
  for (let i = 0; i < months; i += 1) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const key = `${year}-${month}`;
    usageTrends.push({
      month: monthLabel(year, month),
      users: Number(userGrouped.get(key) || 0),
      videos: Number(matchGrouped.get(key) || 0),
      players: Number(playerGrouped.get(key) || 0),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const totalUsers = users.length;
  const totalVideos = matchesTotal;
  const avgMarketValue = teamRows.length
    ? Number((teamRows.reduce((acc, t) => acc + Number(t.marketValue || 0), 0) / teamRows.length).toFixed(2))
    : 0;

  const riskBuckets = { low: 0, medium: 0, high: 0 };
  latestRiskRows.forEach((row) => {
    const explicitLevel = String(row.riskLevel || '').toLowerCase();
    if (explicitLevel === 'low' || explicitLevel === 'medium' || explicitLevel === 'high') {
      riskBuckets[explicitLevel] += 1;
      return;
    }

    const probability = Number(row.riskProbability || 0);
    if (probability >= 0.6) riskBuckets.high += 1;
    else if (probability >= 0.35) riskBuckets.medium += 1;
    else riskBuckets.low += 1;
  });

  const injuryDistribution = [
    { name: 'Low Risk', value: riskBuckets.low },
    { name: 'Medium Risk', value: riskBuckets.medium },
    { name: 'High Risk', value: riskBuckets.high },
  ];

  return res.json({
    totals: {
      totalUsers,
      totalPlayers: playerCount,
      totalVideos,
      avgMarketValue,
    },
    usageTrends,
    injuryDistribution,
    teamPerformance: teamRows.sort((a, b) => b.marketValue - a.marketValue).slice(0, 10),
  });
};

export const playerReport = async (req, res) => {
  const globalId = Number(req.params.globalId);
  if (!globalId) return res.status(400).json({ error: 'Invalid globalId' });

  const filter = req.user.role === 'admin' ? { globalId } : { globalId, clubId: req.user.clubId };
  const player = await Player.findOne(filter);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const matchStats = await PlayerMatchStat.find({
    playerId: player._id,
    ...(req.user.role === 'admin' ? {} : { clubId: req.user.clubId }),
  }).sort({ createdAt: -1 });

  const totals = matchStats.reduce(
    (acc, s) => {
      acc.goals += Number(s.metrics?.goals || 0);
      acc.assists += Number(s.metrics?.assists || 0);
      acc.minutesPlayed += Number(s.metrics?.minutesPlayed || 0);
      acc.interceptions += Number(s.metrics?.interceptions || 0);
      acc.tackles += Number(s.metrics?.tackles || 0);
      acc.distanceM += Number(s.metrics?.distanceM || 0);
      acc.hsrM += Number(s.metrics?.hsrM || 0);
      acc.riskScore += Number(s.metrics?.riskScore || 0);
      acc.injuryProbability += Number(s.metrics?.injuryProbability || 0);
      return acc;
    },
    {
      goals: 0,
      assists: 0,
      minutesPlayed: 0,
      interceptions: 0,
      tackles: 0,
      distanceM: 0,
      hsrM: 0,
      riskScore: 0,
      injuryProbability: 0,
    }
  );
  const count = matchStats.length || 1;

  return res.json({
    player: {
      id: String(player._id),
      globalId: player.globalId,
      shirtNumber: player.shirtNumber || player.globalId,
      name: player.name,
      age: player.age,
      position: player.position,
      height: player.physical?.height || 0,
      weight: player.physical?.weight || 0,
      bmi:
        player.physical?.height && player.physical?.weight
          ? Number((player.physical.weight / ((player.physical.height / 100) ** 2)).toFixed(2))
          : 0,
    },
    totals,
    averages: {
      distanceM: Number((totals.distanceM / count).toFixed(2)),
      hsrM: Number((totals.hsrM / count).toFixed(2)),
      riskScore: Number((totals.riskScore / count).toFixed(2)),
      injuryProbability: Number((totals.injuryProbability / count).toFixed(3)),
    },
    byMatch: matchStats.map((s) => ({
      matchId: String(s.matchId),
      globalId: s.globalId,
      metrics: s.metrics,
      date: s.createdAt,
    })),
  });
};

export const playerTrends = async (req, res) => {
  const globalId = Number(req.params.globalId);
  const lastN = Math.max(1, Math.min(20, Number(req.query.lastN || 6)));
  if (!globalId) return res.status(400).json({ error: 'Invalid globalId' });

  const player = await Player.findOne(
    req.user.role === 'admin' ? { globalId } : { globalId, clubId: req.user.clubId }
  );
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const stats = await PlayerMatchStat.find({
    playerId: player._id,
    ...(req.user.role === 'admin' ? {} : { clubId: req.user.clubId }),
  })
    .sort({ createdAt: -1 })
    .limit(lastN);

  return res.json({
    globalId,
    points: stats
      .reverse()
      .map((s) => ({
        date: s.createdAt,
        distanceM: Number(s.metrics?.distanceM || 0),
        hsrM: Number(s.metrics?.hsrM || 0),
        riskScore: Number(s.metrics?.riskScore || 0),
        goals: Number(s.metrics?.goals || 0),
        assists: Number(s.metrics?.assists || 0),
      })),
  });
};

export const queueReportEmail = async (req, res) => {
  const { templateId, format = 'pdf', dateRange = 'month', startDate, endDate } = req.body || {};
  if (!templateId) {
    return res.status(400).json({ error: 'templateId is required' });
  }
  const request = await ReportEmailRequest.create({
    userId: req.user._id,
    clubId: req.user.clubId || null,
    templateId: String(templateId),
    format: String(format),
    dateRange: String(dateRange),
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    status: 'queued',
  });
  return res.status(201).json({
    message: 'Report email request queued',
    requestId: String(request._id),
    status: request.status,
  });
};

export const createReportRequest = async (req, res) => {
  const { templateId, format = 'pdf', dateRange = 'month', startDate, endDate, status = 'sent' } = req.body || {};
  if (!templateId) return res.status(400).json({ error: 'templateId is required' });

  const allowedStatus = ['queued', 'sent', 'failed'];
  const normalizedStatus = allowedStatus.includes(String(status)) ? String(status) : 'sent';

  const request = await ReportEmailRequest.create({
    userId: req.user._id,
    clubId: req.user.clubId || null,
    templateId: String(templateId),
    format: String(format),
    dateRange: String(dateRange),
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    status: normalizedStatus,
  });

  return res.status(201).json({
    message: 'Report request saved',
    request: {
      id: String(request._id),
      templateId: request.templateId,
      format: request.format,
      dateRange: request.dateRange,
      startDate: request.startDate,
      endDate: request.endDate,
      status: request.status,
      createdAt: request.createdAt,
    },
  });
};

export const listRecentReportRequests = async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { userId: req.user._id };
  const requests = await ReportEmailRequest.find(filter)
    .sort({ createdAt: -1 })
    .limit(25)
    .populate('userId', 'name email');

  const rows = requests.map((row) => ({
    id: String(row._id),
    templateId: row.templateId,
    format: row.format,
    dateRange: row.dateRange,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    createdAt: row.createdAt,
    requestedBy: row.userId
      ? {
          id: String(row.userId._id),
          name: row.userId.name || 'Unknown',
          email: row.userId.email || 'unknown@example.com',
        }
      : null,
  }));

  return res.json({ requests: rows });
};

export const teamPerformancePlayersReport = async (req, res) => {
  const playersFilter = req.user.role === 'admin' ? {} : { clubId: req.user.clubId };
  const players = await Player.find(playersFilter)
    .select('name globalId age position teamName shirtNumber stats physical')
    .sort({ name: 1 })
    .lean();

  const playerIds = players.map((p) => p._id).filter(Boolean);
  const latestStats = await PlayerMatchStat.aggregate([
    { $match: { playerId: { $in: playerIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$playerId', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
  ]);

  const latestByPlayerId = new Map(latestStats.map((row) => [String(row.playerId), row]));

  const rows = players.map((player) => {
    const latest = latestByPlayerId.get(String(player._id));
    return {
      id: String(player._id),
      globalId: player.globalId || null,
      name: player.name || 'Unknown',
      age: player.age || 0,
      position: player.position || 'N/A',
      teamName: player.teamName || 'N/A',
      shirtNumber: player.shirtNumber || null,
      stats: {
        matches: Number(player.stats?.matches || 0),
        goals: Number(player.stats?.goals || 0),
        assists: Number(player.stats?.assists || 0),
        tackles: Number(player.stats?.tackles || 0),
        interceptions: Number(player.stats?.interceptions || 0),
        minutesPlayed: Number(player.stats?.minutesPlayed || 0),
      },
      physical: {
        height: Number(player.physical?.height || 0),
        weight: Number(player.physical?.weight || 0),
        sprintSpeed: Number(player.physical?.sprintSpeed || 0),
        stamina: Number(player.physical?.stamina || 0),
        strength: Number(player.physical?.strength || 0),
      },
      latestMetrics: latest
        ? {
            distanceM: Number(latest.metrics?.distanceM || 0),
            hsrM: Number(latest.metrics?.hsrM || 0),
            riskScore: Number(latest.metrics?.riskScore || 0),
            injuryProbability: Number(latest.metrics?.injuryProbability || 0),
            goals: Number(latest.metrics?.goals || 0),
            assists: Number(latest.metrics?.assists || 0),
            createdAt: latest.createdAt,
          }
        : null,
    };
  });

  return res.json({ players: rows });
};
