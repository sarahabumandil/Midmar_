import mongoose from 'mongoose';

// Canonical club model for multi-club architecture.
const clubSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    totalPlayers: { type: Number, default: 0 },
    totalMatches: { type: Number, default: 0 },
    injuryAlerts: { type: Number, default: 0 },
    marketValueTotal: { type: Number, default: 0 },
    videosAnalyzed: { type: Number, default: 0 },
    settings: {
      preferredFormation: { type: String, default: '' },
      playStyle: { type: String, default: '' },
      trainingFocus: { type: String, default: '' },
      notes: { type: String, default: '' },
      inactivityThreshold: { type: Number, default: 5 },
    },
  },
  {
    timestamps: true,
    collection: 'clubs',
  }
);

clubSchema.index({ name: 1 }, { unique: true });

export const Club = mongoose.model('Club', clubSchema);

