import { Player } from '../models/Player.js';
import { PlayerAggregate } from '../models/PlayerAggregate.js';
import { PlayerMatchStat } from '../models/PlayerMatchStat.js';
import { PlayerResetLog } from '../models/PlayerResetLog.js';
import { Club } from '../models/Team.js';
import { logActivity } from '../services/activityLog.service.js';

const computeAge = (birthDate) => {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

// Helper to map Mongo player to frontend PlayerData shape
const mapPlayerToClient = (playerDoc) => ({
  id: playerDoc._id.toString(),
  globalId: playerDoc.globalId,
  shirtNumber: playerDoc.shirtNumber ?? playerDoc.globalId,
  name: playerDoc.name,
  birthDate: playerDoc.birthDate ? playerDoc.birthDate.toISOString().split('T')[0] : null,
  age: playerDoc.birthDate ? computeAge(playerDoc.birthDate) : playerDoc.age,
  consecutiveMissedMatches: playerDoc.consecutiveMissedMatches ?? 0,
  lastPlayedDate: playerDoc.lastPlayedDate ? playerDoc.lastPlayedDate.toISOString().split('T')[0] : null,
  predictionDataResetAt: playerDoc.predictionDataResetAt ? playerDoc.predictionDataResetAt.toISOString() : null,
  position: playerDoc.position,
  team: playerDoc.teamName,
  nationality: playerDoc.nationality,
  imageUrl: playerDoc.imageUrl || '',
  bmi:
    playerDoc.physical?.bmi
      ? Number(playerDoc.physical.bmi)
      : playerDoc.physical?.height && playerDoc.physical?.weight
      ? Number((playerDoc.physical.weight / ((playerDoc.physical.height / 100) ** 2)).toFixed(2))
      : 0,
  stats: {
    matches: playerDoc.stats?.matches ?? 0,
    goals: playerDoc.stats?.goals ?? 0,
    assists: playerDoc.stats?.assists ?? 0,
    tackles: playerDoc.stats?.tackles ?? 0,
    interceptions: playerDoc.stats?.interceptions ?? 0,
    minutesPlayed: playerDoc.stats?.minutesPlayed ?? 0,
    injuries: playerDoc.stats?.injuries ?? 0,
    saves: playerDoc.stats?.saves ?? 0,
    cleanSheets: playerDoc.stats?.cleanSheets ?? 0,
    savePerMatch: playerDoc.stats?.savePerMatch ?? 0,
    goalsConceded: playerDoc.stats?.goalsConceded ?? 0,
    penaltiesSaved: playerDoc.stats?.penaltiesSaved ?? 0,
    distanceCoveredKm: playerDoc.stats?.distanceCoveredKm ?? 0,
    maxSpeedKmh: playerDoc.stats?.maxSpeedKmh ?? 0,
    sprintCount: playerDoc.stats?.sprintCount ?? 0,
    hsrM: playerDoc.stats?.hsrM ?? 0,
  },
  physical: {
    height: playerDoc.physical?.height ?? 0,
    weight: playerDoc.physical?.weight ?? 0,
    sprintSpeed: playerDoc.physical?.sprintSpeed ?? 0,
    stamina: playerDoc.physical?.stamina ?? 0,
    strength: playerDoc.physical?.strength ?? 0,
  },
});

export const listPlayers = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'admin') {
      filter = {};
    } else {
      if (!req.user.clubId) {
        return res.status(400).json({ error: 'User does not have a club configured.' });
      }
      filter = { clubId: req.user.clubId };
    }
    const players = await Player.find(filter).sort({ name: 1 });
    const clubDoc = req.user.clubId ? await Club.findById(req.user.clubId).select('settings') : null;
    const inactivityThreshold = clubDoc?.settings?.inactivityThreshold ?? 5;

    res.json({
      players: players.map(mapPlayerToClient),
      inactivityThreshold,
    });
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({
      error: 'Failed to fetch players',
      details: error.message,
    });
  }
};

export const createPlayer = async (req, res) => {
  try {
    const teamName = req.user?.teamInfo?.name;
    const clubId = req.user?.clubId;

    if (!teamName || !clubId) {
      return res.status(400).json({
        error: 'User does not have a club configured.',
      });
    }

    const {
      name,
      age,
      birthDate,
      position,
      nationality,
      imageUrl,
      globalId,
      shirtNumber,
      stats = {},
      physical = {},
    } = req.body;

    if (!name || !position || !nationality) {
      return res.status(400).json({
        error: 'Name, position, and nationality are required',
      });
    }

    let resolvedGlobalId = Number(globalId || shirtNumber);
    if (!resolvedGlobalId || Number.isNaN(resolvedGlobalId)) {
      const latest = await Player.findOne({ clubId }).sort({ globalId: -1 }).select('globalId');
      resolvedGlobalId = (latest?.globalId || 0) + 1;
    }

    const parsedBirthDate = birthDate ? new Date(birthDate) : null;
    const player = await Player.create({
      user: req.user._id,
      teamName,
      clubId,
      name,
      birthDate: parsedBirthDate,
      age: parsedBirthDate ? computeAge(parsedBirthDate) : (age ?? 0),
      position,
      nationality,
      imageUrl: String(imageUrl || '').trim(),
      globalId: resolvedGlobalId,
      shirtNumber: Number(shirtNumber || resolvedGlobalId),
      stats,
      physical,
    });

    await Club.findByIdAndUpdate(clubId, { $inc: { totalPlayers: 1 } });

    res.status(201).json({
      message: 'Player created successfully',
      player: mapPlayerToClient(player),
    });
    await logActivity(req, {
      action: 'Add Player',
      resource: 'Players',
      status: 'success',
      details: `Created player ${player.name}`,
      metadata: { playerId: String(player._id), globalId: player.globalId },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ error: 'Global ID (t-shirt number) must be unique within club' });
    }
    console.error('Error creating player:', error);
    res.status(500).json({
      error: 'Failed to create player',
      details: error.message,
    });
  }
};

export const bulkSetupPlayers = async (req, res) => {
  try {
    if (!req.user?.clubId || !req.user?.teamInfo?.name) {
      return res.status(400).json({ error: 'User does not have a club configured.' });
    }
    const { players } = req.body || {};
    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: 'players[] is required' });
    }

    const docs = players.map((p) => ({
      user: req.user._id,
      clubId: req.user.clubId,
      teamName: req.user.teamInfo.name,
      name: String(p.name || '').trim(),
      birthDate: p.birthDate ? new Date(p.birthDate) : null,
      age: p.birthDate ? computeAge(new Date(p.birthDate)) : Number(p.age || 0),
      position: String(p.position || '').trim(),
      nationality: String(p.nationality || 'Unknown').trim(),
      globalId: Number(p.globalId || p.shirtNumber),
      shirtNumber: Number(p.shirtNumber || p.globalId),
      physical: {
        height: Number(p.height || p.physical?.height || 0),
        weight: Number(p.weight || p.physical?.weight || 0),
        bmi: Number(
          p.bmi ||
            p.physical?.bmi ||
            ((Number(p.height || p.physical?.height || 0) > 0 && Number(p.weight || p.physical?.weight || 0) > 0)
              ? (Number(p.weight || p.physical?.weight || 0) / ((Number(p.height || p.physical?.height || 0) / 100) ** 2))
              : 0)
        ),
        sprintSpeed: Number(p.sprintSpeed || p.physical?.sprintSpeed || 0),
        stamina: Number(p.stamina || p.physical?.stamina || 0),
        strength: Number(p.strength || p.physical?.strength || 0),
      },
      stats: {
        matches: Number(p.matches || p.stats?.matches || 0),
        goals: Number(p.goals || p.stats?.goals || 0),
        assists: Number(p.assists || p.stats?.assists || 0),
        tackles: Number(p.tackles || p.stats?.tackles || 0),
        interceptions: Number(p.interceptions || p.stats?.interceptions || p.interception || p.stats?.interception || 0),
        minutesPlayed: Number(p.minutesPlayed || p.stats?.minutesPlayed || 0),
        injuries: Number(p.injuries || p.stats?.injuries || 0),
        saves: Number(p.saves || p.stats?.saves || 0),
        cleanSheets: Number(p.cleanSheets || p.clean_sheets || p.stats?.cleanSheets || p.stats?.clean_sheets || 0),
        savePerMatch: Number(p.savePerMatch || p.save_per_match || p.stats?.savePerMatch || p.stats?.save_per_match || 0),
        goalsConceded: Number(p.goalsConceded || p.goals_conceded || p.stats?.goalsConceded || p.stats?.goals_conceded || 0),
        penaltiesSaved: Number(p.penaltiesSaved || p.penalties_saved || p.stats?.penaltiesSaved || p.stats?.penalties_saved || 0),
        distanceCoveredKm: Number(p.distanceCoveredKm || p.distance_covered_km || p.stats?.distanceCoveredKm || p.stats?.distance_covered_km || 0),
        maxSpeedKmh: Number(p.maxSpeedKmh || p.max_speed_kmh || p.stats?.maxSpeedKmh || p.stats?.max_speed_kmh || 0),
        sprintCount: Number(p.sprintCount || p.sprint_count || p.stats?.sprintCount || p.stats?.sprint_count || 0),
        hsrM: Number(p.hsrM || p.hsr_m || p.stats?.hsrM || p.stats?.hsr_m || 0),
      },
    }));

    for (const d of docs) {
      if (!d.name || !d.position || !d.globalId) {
        return res.status(400).json({ error: 'Each player requires name, position, and globalId/shirtNumber' });
      }
    }

    const result = await Player.insertMany(docs, { ordered: false });
    await Club.findByIdAndUpdate(req.user.clubId, { $inc: { totalPlayers: result.length } });
    await logActivity(req, {
      action: 'Bulk Import Players',
      resource: 'Players',
      status: 'success',
      details: `Imported ${result.length} players`,
      metadata: { count: result.length },
    });

    return res.status(201).json({
      message: 'Players imported successfully',
      count: result.length,
      players: result.map(mapPlayerToClient),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ error: 'Duplicate globalId found in import payload' });
    }
    console.error('Error bulk importing players:', error);
    return res.status(500).json({ error: 'Failed to import players', details: error.message });
  }
};

export const updatePlayer = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, clubId: req.user.clubId };
    const player = await Player.findOne(filter);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const { name, age, birthDate, position, nationality, imageUrl, shirtNumber, globalId, stats, physical } = req.body || {};
    if (name !== undefined) player.name = String(name).trim();
    if (birthDate !== undefined) {
      const parsed = birthDate ? new Date(birthDate) : null;
      player.birthDate = parsed;
      player.age = parsed ? computeAge(parsed) : (player.age ?? 0);
    } else if (age !== undefined) {
      player.age = Number(age) || 0;
    }
    if (position !== undefined) player.position = String(position).trim();
    if (nationality !== undefined) player.nationality = String(nationality).trim();
    if (imageUrl !== undefined) player.imageUrl = String(imageUrl || '').trim();
    if (shirtNumber !== undefined || globalId !== undefined) {
      const nextGlobal = Number(globalId || shirtNumber);
      if (!Number.isNaN(nextGlobal) && nextGlobal > 0) {
        player.globalId = nextGlobal;
        player.shirtNumber = Number(shirtNumber || nextGlobal);
      }
    }
    if (stats && typeof stats === 'object') {
      player.stats = {
        ...player.stats?.toObject?.(),
        ...stats,
      };
    }
    if (physical && typeof physical === 'object') {
      player.physical = {
        ...player.physical?.toObject?.(),
        ...physical,
      };
    }

    await player.save();
    await logActivity(req, {
      action: 'Update Player',
      resource: 'Players',
      status: 'success',
      details: `Updated player ${player.name}`,
      metadata: { playerId: String(player._id), globalId: player.globalId },
    });
    return res.json({ message: 'Player updated successfully', player: mapPlayerToClient(player) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ error: 'Global ID (t-shirt number) must be unique within club' });
    }
    console.error('Error updating player:', error);
    return res.status(500).json({ error: 'Failed to update player', details: error.message });
  }
};

export const resetPredictionData = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, clubId: req.user.clubId };
    const player = await Player.findOne(filter);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const missedAtReset = player.consecutiveMissedMatches ?? 0;

    player.stats.minutesPlayed = 0;
    player.stats.matches = 0;
    player.stats.injuries = 0;
    player.stats.distanceCoveredKm = 0;
    player.stats.maxSpeedKmh = 0;
    player.stats.sprintCount = 0;
    player.stats.hsrM = 0;
    player.consecutiveMissedMatches = 0;
    player.predictionDataResetAt = new Date();
    await player.save();

    await PlayerAggregate.deleteMany({ playerId: player._id });
    await PlayerMatchStat.deleteMany({ playerId: player._id });

    const fieldsReset = [
      'stats.minutesPlayed', 'stats.matches', 'stats.injuries',
      'stats.distanceCoveredKm', 'stats.maxSpeedKmh', 'stats.sprintCount', 'stats.hsrM',
      'playerAggregates', 'playerMatchStats',
    ];
    await PlayerResetLog.create({
      playerId: player._id,
      clubId: player.clubId,
      resetBy: req.user._id,
      resetAt: new Date(),
      consecutiveMissedMatchesAtReset: missedAtReset,
      fieldsReset,
    });

    await logActivity(req, {
      action: 'Reset Prediction Data',
      resource: 'Players',
      status: 'success',
      details: `Reset prediction data for ${player.name} (was ${missedAtReset} consecutive misses)`,
      metadata: { playerId: String(player._id), missedAtReset },
    });

    return res.json({ message: 'Prediction data reset successfully', player: mapPlayerToClient(player) });
  } catch (error) {
    console.error('Error resetting prediction data:', error);
    return res.status(500).json({ error: 'Failed to reset prediction data', details: error.message });
  }
};

export const getResetLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, clubId: req.user.clubId };
    const player = await Player.findOne(filter).select('_id');
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const logs = await PlayerResetLog.find({ playerId: player._id })
      .populate('resetBy', 'name email')
      .sort({ resetAt: -1 })
      .limit(20);

    return res.json({
      logs: logs.map((l) => ({
        id: l._id.toString(),
        resetAt: l.resetAt.toISOString(),
        resetByName: l.resetBy?.name || l.resetBy?.email || 'Unknown',
        consecutiveMissedMatchesAtReset: l.consecutiveMissedMatchesAtReset,
        fieldsReset: l.fieldsReset,
      })),
    });
  } catch (error) {
    console.error('Error fetching reset logs:', error);
    return res.status(500).json({ error: 'Failed to fetch reset logs', details: error.message });
  }
};

export const updateInactivityThreshold = async (req, res) => {
  try {
    const { threshold } = req.body;
    const t = Number(threshold);
    if (!Number.isInteger(t) || t < 1 || t > 50) {
      return res.status(400).json({ error: 'Threshold must be an integer between 1 and 50' });
    }
    const clubId = req.user.clubId;
    if (!clubId) return res.status(400).json({ error: 'No club associated with this account' });

    await Club.findByIdAndUpdate(clubId, { $set: { 'settings.inactivityThreshold': t } });
    await logActivity(req, {
      action: 'Update Inactivity Threshold',
      resource: 'Players',
      status: 'success',
      details: `Inactivity threshold set to ${t}`,
      metadata: { threshold: t },
    });
    return res.json({ inactivityThreshold: t });
  } catch (error) {
    console.error('Error updating inactivity threshold:', error);
    return res.status(500).json({ error: 'Failed to update threshold', details: error.message });
  }
};

export const deletePlayer = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, clubId: req.user.clubId };
    const deleted = await Player.findOneAndDelete(filter);
    if (!deleted) {
      return res.status(404).json({ error: 'Player not found' });
    }

    if (deleted.clubId) {
      await Club.findByIdAndUpdate(deleted.clubId, { $inc: { totalPlayers: -1 } });
    }
    await logActivity(req, {
      action: 'Delete Player',
      resource: 'Players',
      status: 'warning',
      details: `Deleted player ${deleted.name}`,
      metadata: { playerId: String(deleted._id), globalId: deleted.globalId },
    });
    return res.json({ message: 'Player deleted successfully' });
  } catch (error) {
    console.error('Error deleting player:', error);
    return res.status(500).json({ error: 'Failed to delete player', details: error.message });
  }
};
