import mongoose from 'mongoose';

const statsSchema = new mongoose.Schema(
  {
    matches: { type: Number, default: 0 },
    goals: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    tackles: { type: Number, default: 0 },
    interceptions: { type: Number, default: 0 },
    minutesPlayed: { type: Number, default: 0 },
    injuries: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    cleanSheets: { type: Number, default: 0 },
    savePerMatch: { type: Number, default: 0 },
    goalsConceded: { type: Number, default: 0 },
    penaltiesSaved: { type: Number, default: 0 },
    distanceCoveredKm: { type: Number, default: 0 },
    maxSpeedKmh: { type: Number, default: 0 },
    sprintCount: { type: Number, default: 0 },
    hsrM: { type: Number, default: 0 },
  },
  { _id: false }
);

const physicalSchema = new mongoose.Schema(
  {
    height: { type: Number, default: 0 }, // cm
    weight: { type: Number, default: 0 }, // kg
    bmi: { type: Number, default: 0 },
    sprintSpeed: { type: Number, default: 0 }, // 0-100
    stamina: { type: Number, default: 0 }, // 0-100
    strength: { type: Number, default: 0 }, // 0-100
  },
  { _id: false }
);

const playerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Club',
      index: true,
      default: null,
    },
    globalId: {
      // Stable identifier inside a club (jersey/t-shirt number)
      type: Number,
      required: true,
      min: 1,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    birthDate: {
      type: Date,
      default: null,
    },
    age: {
      type: Number,
      default: 0,
    },
    position: {
      type: String,
      required: true,
      trim: true,
    },
    nationality: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    consecutiveMissedMatches: {
      type: Number,
      default: 0,
    },
    lastPlayedDate: {
      type: Date,
      default: null,
    },
    predictionDataResetAt: {
      type: Date,
      default: null,
    },
    shirtNumber: {
      type: Number,
      default: null,
    },
    stats: {
      type: statsSchema,
      default: () => ({}),
    },
    physical: {
      type: physicalSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    collection: 'players',
  }
);

playerSchema.index({ clubId: 1, globalId: 1 }, { unique: true });
playerSchema.index({ user: 1, teamName: 1 });

export const Player = mongoose.model('Player', playerSchema);

