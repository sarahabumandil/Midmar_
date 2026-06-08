import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { ensureClubByName } from '../services/club.service.js';
import { logActivity } from '../services/activityLog.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

export const signup = async (req, res) => {
  try {
    const { email, password, name, teamName } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({
        error: 'Please provide email, password, and name',
      });
    }

    if (!teamName || !teamName.trim()) {
      return res.status(400).json({
        error: 'Please provide a team name',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters long',
      });
    }

    // Normalize email (lowercase and trim) to match schema behavior
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists (using normalized email)
    const existingUser = await User.findOne({
      email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'User with this email already exists',
      });
    }

    // Create new user (email will be normalized by schema)
    const user = new User({
      email: normalizedEmail,
      password,
      name: name.trim(),
      role: 'user',
      teamInfo: {
        name: teamName.trim(),
        totalPlayers: 0,
        injuryAlerts: 0,
        marketValue: '€0M',
        videosAnalyzed: 0,
      },
    });

    try {
      await user.save();

      const club = await ensureClubByName(teamName.trim(), user._id);
      user.clubId = club._id;
      await user.save();
    } catch (saveError) {
      // If save fails with duplicate key error, check what email exists
      if (saveError.name === 'MongoServerError' && saveError.code === 11000) {
        const conflictingUser = await User.findOne({
          email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        if (conflictingUser) {
          console.error('Found conflicting user:', conflictingUser.email);
        }
        throw saveError; // Re-throw to be caught by outer catch
      }
      throw saveError;
    }

    // Generate token
    const token = generateToken(user._id);

    // Return user data (password excluded by toJSON method)
    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        clubId: user.clubId ? String(user.clubId) : null,
        teamInfo: user.teamInfo,
      },
    });
    await logActivity(req, {
      user,
      clubId: user.clubId || null,
      action: 'Signup',
      resource: 'Authentication',
      status: 'success',
      details: 'User account created',
      metadata: { email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Signup error:', error);

    if (error.name === 'MongoServerError' && error.code === 11000) {
      return res.status(400).json({
        error: 'User with this email already exists',
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        details: Object.values(error.errors).map(e => e.message).join(', ')
      });
    }

    res.status(500).json({
      error: 'Server error during signup',
      details: error.message,
      type: error.name || 'UnknownError'
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Please provide email and password',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      await logActivity(req, {
        action: 'Failed Login Attempt',
        resource: 'Authentication',
        status: 'error',
        details: 'Invalid email or password',
        metadata: { email: normalizedEmail },
      });
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await logActivity(req, {
        user,
        clubId: user.clubId || null,
        action: 'Failed Login Attempt',
        resource: 'Authentication',
        status: 'error',
        details: 'Invalid email or password',
        metadata: { email: normalizedEmail },
      });
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        clubId: user.clubId ? String(user.clubId) : null,
        teamInfo: user.teamInfo,
      },
    });
    await logActivity(req, {
      user,
      clubId: user.clubId || null,
      action: 'Login',
      resource: 'Authentication',
      status: 'success',
      details: 'User logged in successfully',
      metadata: { email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Server error during login',
      details: error.message,
    });
  }
};

export const verify = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        error: 'User not found',
      });
    }

    res.json({
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        clubId: user.clubId ? String(user.clubId) : null,
        teamInfo: user.teamInfo,
      },
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Invalid or expired token',
      });
    }
    console.error('Verify error:', error);
    res.status(500).json({
      error: 'Server error during verification',
      details: error.message,
    });
  }
};