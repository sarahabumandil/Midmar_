import { User } from '../models/User.js';
import { Club } from '../models/Team.js';
import { UserPreference } from '../models/UserPreference.js';

const sanitizeUser = (user) => ({
  id: String(user._id),
  email: user.email,
  name: user.name,
  role: user.role,
  clubId: user.clubId ? String(user.clubId) : null,
  teamInfo: user.teamInfo,
});

export const getMyProfile = async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const [preferences, club] = await Promise.all([
    UserPreference.findOne({ userId: user._id }),
    user.clubId ? Club.findById(user.clubId) : null,
  ]);

  return res.json({
    user: sanitizeUser(user),
    preferences: preferences || {
      privacy: { profileVisibility: 'team', activityTracking: true, dataSharing: false },
      notifications: { emailAlerts: true, injuryRiskAlerts: true, weeklySummary: true, matchInsightsReady: true },
    },
    teamSettings: club?.settings || {
      preferredFormation: '',
      playStyle: '',
      trainingFocus: '',
      notes: '',
    },
  });
};

export const updateMyProfile = async (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.name = String(name).trim();
  await user.save();
  return res.json({ message: 'Profile updated', user: sanitizeUser(user) });
};

export const changeMyEmail = async (req, res) => {
  const { currentPassword, newEmail } = req.body || {};
  if (!currentPassword || !newEmail) {
    return res.status(400).json({ error: 'currentPassword and newEmail are required' });
  }
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const valid = await user.comparePassword(String(currentPassword));
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const normalized = String(newEmail).toLowerCase().trim();
  const existing = await User.findOne({ email: normalized, _id: { $ne: user._id } });
  if (existing) return res.status(400).json({ error: 'Email already in use' });

  user.email = normalized;
  await user.save();
  return res.json({ message: 'Email updated', user: sanitizeUser(user) });
};

export const changeMyPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const valid = await user.comparePassword(String(currentPassword));
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  user.password = String(newPassword);
  await user.save();
  return res.json({ message: 'Password updated successfully' });
};

export const updateMyPreferences = async (req, res) => {
  const { privacy, notifications } = req.body || {};
  const preference = await UserPreference.findOneAndUpdate(
    { userId: req.user._id },
    {
      $set: {
        ...(privacy ? { privacy } : {}),
        ...(notifications ? { notifications } : {}),
      },
      $setOnInsert: { userId: req.user._id },
    },
    { upsert: true, new: true }
  );
  return res.json({ message: 'Preferences updated', preferences: preference });
};

export const updateTeamSettings = async (req, res) => {
  if (!req.user.clubId) return res.status(400).json({ error: 'Club context missing' });
  const { preferredFormation, playStyle, trainingFocus, notes } = req.body || {};
  const club = await Club.findByIdAndUpdate(
    req.user.clubId,
    {
      $set: {
        settings: {
          preferredFormation: String(preferredFormation || ''),
          playStyle: String(playStyle || ''),
          trainingFocus: String(trainingFocus || ''),
          notes: String(notes || ''),
        },
      },
    },
    { new: true }
  );
  return res.json({ message: 'Team settings updated', settings: club?.settings || {} });
};
