import mongoose from 'mongoose';

const marketValuePredictionSchema = new mongoose.Schema(
  {
    clubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', default: null, index: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    predictedValue: { type: Number, required: true, min: 0 }, // in millions
    modelConfidence: { type: Number, default: 0 },
    valueRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
    },
    inputStats: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: 'market_value_predictions',
  }
);

marketValuePredictionSchema.index({ clubId: 1, playerId: 1, createdAt: -1 });

export const MarketValuePrediction = mongoose.model('MarketValuePrediction', marketValuePredictionSchema);
