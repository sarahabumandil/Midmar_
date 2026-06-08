import mongoose from 'mongoose';

const playerAggregateSchema = new mongoose.Schema(
  {
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Club',
      required: true,
      index: true,
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      index: true,
    },
    globalId: { type: Number, required: true, min: 1 },
    windowSize: { type: Number, required: true, default: 5 },
    matchCount: { type: Number, default: 0 },
    totals: {
      goals: { type: Number, default: 0 },
      assists: { type: Number, default: 0 },
      minutesPlayed: { type: Number, default: 0 },
      interceptions: { type: Number, default: 0 },
      tackles: { type: Number, default: 0 },
      blocks: { type: Number, default: 0 },
      distanceM: { type: Number, default: 0 },
      hsrM: { type: Number, default: 0 },
      riskScore: { type: Number, default: 0 },
      sprints: { type: Number, default: 0 },
    },
    averages: {
      distanceM: { type: Number, default: 0 },
      hsrM: { type: Number, default: 0 },
      riskScore: { type: Number, default: 0 },
      injuryProbability: { type: Number, default: 0 },
    },
    updatedAtSource: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'player_aggregates',
  }
);

playerAggregateSchema.index({ clubId: 1, globalId: 1, windowSize: 1 }, { unique: true });

export const PlayerAggregate = mongoose.model('PlayerAggregate', playerAggregateSchema);
