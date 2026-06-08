import { User } from '../models/User.js';
import mongoose from 'mongoose';
import { Club } from '../models/Team.js';
import { Player } from '../models/Player.js';
import { Match } from '../models/Match.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { InjuryPrediction } from '../models/InjuryPrediction.js';
import { MarketValuePrediction } from '../models/MarketValuePrediction.js';
import { ensureClubByName } from '../services/club.service.js';
import { logActivity } from '../services/activityLog.service.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@footbrain.com';

const mapUser = (userDoc) => ({
  id: String(userDoc._id),
  email: userDoc.email,
  name: userDoc.name,
  role: userDoc.role,
  clubId: userDoc.clubId ? String(userDoc.clubId) : null,
  teamInfo: userDoc.teamInfo || undefined,
});

export const listUsers = async (req, res) => {
  try {
    const [users, playerCounts] = await Promise.all([
      User.find({}).sort({ createdAt: -1 }),
      Player.aggregate([
        {
          $group: {
            _id: '$user',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const countsByUserId = new Map(
      playerCounts.map((pc) => [pc._id.toString(), pc.count])
    );

    const clubIds = users
      .map((u) => u.clubId)
      .filter((id) => Boolean(id))
      .map((id) => id.toString());

    const clubObjectIds = clubIds.map((id) => new mongoose.Types.ObjectId(id));

    const [matchesByClub, latestRiskRows, latestValueRows] = await Promise.all([
      Match.aggregate([
        { $match: { clubId: { $in: clubObjectIds }, status: 'finalized' } },
        { $group: { _id: '$clubId', totalMatches: { $sum: 1 } } },
      ]),
      InjuryPrediction.aggregate([
        { $match: { clubId: { $in: clubObjectIds }, playerId: { $ne: null } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$playerId', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
      ]),
      MarketValuePrediction.aggregate([
        { $match: { clubId: { $in: clubObjectIds }, playerId: { $ne: null } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$playerId', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
      ]),
    ]);

    const matchesByClubMap = new Map(
      matchesByClub.map((m) => [String(m._id), Number(m.totalMatches || 0)])
    );
    const injuryAlertsByClubMap = new Map();
    latestRiskRows.forEach((row) => {
      const cid = String(row.clubId || '');
      if (!cid) return;
      const isHigh = row.riskLevel === 'high' || Number(row.riskProbability || 0) >= 0.6;
      if (!isHigh) return;
      injuryAlertsByClubMap.set(cid, Number(injuryAlertsByClubMap.get(cid) || 0) + 1);
    });
    const marketValueByClubMap = new Map();
    latestValueRows.forEach((row) => {
      const cid = String(row.clubId || '');
      if (!cid) return;
      marketValueByClubMap.set(cid, Number(marketValueByClubMap.get(cid) || 0) + Number(row.predictedValue || 0));
    });

    res.json({
      users: users.map((userDoc) => ({
        ...mapUser(userDoc),
        teamInfo: {
          ...(userDoc.teamInfo || {}),
          totalPlayers: countsByUserId.get(userDoc._id.toString()) || 0,
          injuryAlerts: injuryAlertsByClubMap.get(String(userDoc.clubId || '')) || 0,
          marketValue: `€${Number(marketValueByClubMap.get(String(userDoc.clubId || '')) || 0).toFixed(1)}M`,
          videosAnalyzed: matchesByClubMap.get(String(userDoc.clubId || '')) || 0,
        },
        playerCount: countsByUserId.get(userDoc._id.toString()) || 0,
      })),
    });
  } catch (error) {
    console.error('Error fetching users for admin:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      details: error.message,
    });
  }
};

export const stats = async (req, res) => {
  try {
    const [totalUsers, totalPlayers, totalClubs, totalMatches] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Player.countDocuments({}),
      Club.countDocuments({}),
      Match.countDocuments({}),
    ]);

    res.json({
      totalUsers,
      totalPlayers,
      totalClubs,
      totalMatches,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      error: 'Failed to fetch admin stats',
      details: error.message,
    });
  }
};

export const createUser = async (req, res) => {
  try {
    const { email, password, name, role = 'user', teamName } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        error: 'Email, password, and name are required',
      });
    }

    if (!teamName || !teamName.trim()) {
      return res.status(400).json({
        error: 'Team name is required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters long',
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({
        error: 'User with this email already exists',
      });
    }

    const user = new User({
      email: normalizedEmail,
      password,
      name: String(name).trim(),
      role: role === 'admin' ? 'admin' : 'user',
      teamInfo: {
        name: String(teamName).trim(),
        totalPlayers: 0,
        injuryAlerts: 0,
        marketValue: '€0M',
        videosAnalyzed: 0,
      },
    });

    await user.save();

    const club = await ensureClubByName(String(teamName).trim(), user._id);
    user.clubId = club._id;
    await user.save();

    res.status(201).json({
      message: 'User created successfully',
      user: mapUser(user),
    });
    await logActivity(req, {
      action: 'Create User',
      resource: 'Admin',
      status: 'success',
      details: `Admin created user ${user.email}`,
      metadata: { createdUserId: String(user._id), role: user.role },
    });
  } catch (error) {
    console.error('Error creating user for admin:', error);
    res.status(500).json({
      error: 'Failed to create user',
      details: error.message,
    });
  }
};

export const updateUser = async (req, res) => {
  try {
    const emailParam = req.params.email.toLowerCase();
    const { name, role, teamName, password } = req.body;

    const user = await User.findOne({ email: emailParam });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.email === ADMIN_EMAIL && role && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot change main admin role' });
    }

    if (name && typeof name === 'string') {
      user.name = name.trim();
    }

    if (role && (role === 'user' || role === 'admin')) {
      user.role = role;
    }

    if (teamName && typeof teamName === 'string') {
      if (!user.teamInfo) {
        user.teamInfo = {};
      }
      user.teamInfo.name = teamName.trim();
      const club = await ensureClubByName(teamName.trim(), user._id);
      user.clubId = club._id;
    }

    if (password && typeof password === 'string') {
      if (password.length < 6) {
        return res.status(400).json({
          error: 'Password must be at least 6 characters long',
        });
      }
      user.password = password; // will be hashed by pre-save hook
    }

    await user.save();

    res.json({
      message: 'User updated successfully',
      user: mapUser(user),
    });
    await logActivity(req, {
      action: 'Update User',
      resource: 'Admin',
      status: 'success',
      details: `Admin updated user ${user.email}`,
      metadata: { updatedUserId: String(user._id), role: user.role },
    });
  } catch (error) {
    console.error('Error updating user for admin:', error);
    res.status(500).json({
      error: 'Failed to update user',
      details: error.message,
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const emailParam = req.params.email.toLowerCase();

    if (emailParam === ADMIN_EMAIL.toLowerCase()) {
      return res.status(400).json({
        error: 'Cannot delete main admin user',
      });
    }

    // Find and delete user so we have their _id for cascading deletes
    const user = await User.findOneAndDelete({ email: emailParam });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Cascade delete: remove this user's players and matches
    try {
      await Promise.all([
        Player.deleteMany({ user: user._id }),
        Match.deleteMany({ createdBy: user._id }),
      ]);
    } catch (cascadeError) {
      console.error('Error deleting related players/matches:', cascadeError);
      return res.status(500).json({
        error: 'User deleted, but failed to remove related players/matches',
        details: cascadeError.message,
      });
    }

    res.json({ message: 'User, players, and matches deleted successfully' });
    await logActivity(req, {
      action: 'Delete User',
      resource: 'Admin',
      status: 'warning',
      details: `Admin deleted user ${emailParam}`,
      metadata: { deletedUserId: String(user._id) },
    });
  } catch (error) {
    console.error('Error deleting user for admin:', error);
    res.status(500).json({
      error: 'Failed to delete user',
      details: error.message,
    });
  }
};

export const listActivityLogs = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(10, Math.min(200, Number(req.query.limit || 100)));
    const status = String(req.query.status || 'all').toLowerCase();
    const resource = String(req.query.resource || 'all');
    const search = String(req.query.search || '').trim();

    const filter = {};
    if (status !== 'all') {
      filter.status = status;
    }
    if (resource !== 'all') {
      filter.resource = resource;
    }
    if (search) {
      filter.$or = [
        { action: { $regex: search, $options: 'i' } },
        { details: { $regex: search, $options: 'i' } },
        { actorEmail: { $regex: search, $options: 'i' } },
        { actorName: { $regex: search, $options: 'i' } },
      ];
    }

    const [logs, total, resources] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ActivityLog.countDocuments(filter),
      ActivityLog.distinct('resource'),
    ]);

    res.json({
      logs: logs.map((log) => ({
        id: String(log._id),
        timestamp: log.createdAt,
        user: log.actorName || 'Unknown',
        userEmail: log.actorEmail || 'unknown@local',
        action: log.action,
        resource: log.resource,
        status: log.status,
        ipAddress: log.ipAddress || 'N/A',
        details: log.details || '',
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      resources: resources.sort(),
    });
  } catch (error) {
    console.error('Error fetching activity logs for admin:', error);
    res.status(500).json({
      error: 'Failed to fetch activity logs',
      details: error.message,
    });
  }
};
