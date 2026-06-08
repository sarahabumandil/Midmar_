import mongoose from 'mongoose';

const playerResetLogSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      index: true,
    },
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Club',
      required: true,
      index: true,
    },
    resetBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    resetAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    consecutiveMissedMatchesAtReset: {
      type: Number,
      default: 0,
    },
    fieldsReset: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: false,
    collection: 'player_reset_logs',
  }
);

playerResetLogSchema.index({ playerId: 1, resetAt: -1 });

export const PlayerResetLog = mongoose.model('PlayerResetLog', playerResetLogSchema);
