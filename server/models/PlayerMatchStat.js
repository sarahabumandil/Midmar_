import mongoose from 'mongoose';

const playerMatchStatSchema = new mongoose.Schema(
  {
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Club',
      required: true,
      index: true,
    },
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
      index: true,
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      index: true,
    },
    globalId: { type: Number, required: true, min: 1, index: true },
    tempTrackingId: { type: Number, required: true },
    position: { type: String, default: '' },
    metrics: {
      goals: { type: Number, default: 0 },
      assists: { type: Number, default: 0 },
      minutesPlayed: { type: Number, default: 0 },
      interceptions: { type: Number, default: 0 },
      tackles: { type: Number, default: 0 },
      blocks: { type: Number, default: 0 },
      distanceM: { type: Number, default: 0 },
      hsrM: { type: Number, default: 0 },
      riskScore: { type: Number, default: 0 },
      injuryProbability: { type: Number, default: 0 },
      maxSpeed: { type: Number, default: 0 },
      sprints: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    collection: 'player_match_stats',
  }
);

playerMatchStatSchema.index({ clubId: 1, matchId: 1, globalId: 1 }, { unique: true });
playerMatchStatSchema.index({ clubId: 1, globalId: 1, createdAt: -1 });

export const PlayerMatchStat = mongoose.model('PlayerMatchStat', playerMatchStatSchema);
