import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const teamInfoSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  totalPlayers: { type: Number, default: 0 },
  injuryAlerts: { type: Number, default: 0 },
  marketValue: { type: String, default: '€0M' },
  videosAnalyzed: { type: Number, default: 0 },
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Club',
    default: null,
    index: true,
  },
  teamInfo: {
    type: teamInfoSchema,
    default: () => ({
      name: '',
      totalPlayers: 0,
      injuryAlerts: 0,
      marketValue: '€0M',
      videosAnalyzed: 0,
    }),
  },
}, {
  timestamps: true,
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to convert to JSON (exclude password)
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

userSchema.index(
  { role: 1, clubId: 1 },
  { partialFilterExpression: { role: 'user' } }
);

export const User = mongoose.model('User', userSchema);
