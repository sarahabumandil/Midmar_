import mongoose from 'mongoose';

const physicalInputSchema = new mongoose.Schema(
  {
    age: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    weight: { type: Number, default: 0 },
    minutes_played: { type: Number, default: 0 },
    distance_covered_km: { type: Number, default: 0 },
    max_speed_kmh: { type: Number, default: 0 },
    sprint_count: { type: Number, default: 0 },
    hsr_m: { type: Number, default: 0 },
  },
  { _id: false }
);

const riskFactorSchema = new mongoose.Schema(
  {
    factor: { type: String, required: true, trim: true },
    impact: { type: Number, default: 0 },
    description: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const injuryPredictionSchema = new mongoose.Schema(
  {
    clubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', default: null, index: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    input: { type: physicalInputSchema, default: () => ({}) },
    riskProbability: { type: Number, required: true, min: 0, max: 1 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], required: true, index: true },
    topRiskFactors: { type: [riskFactorSchema], default: [] },
    recommendations: { type: [String], default: [] },
    modelConfidence: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'injury_predictions',
  }
);

injuryPredictionSchema.index({ clubId: 1, playerId: 1, createdAt: -1 });

export const InjuryPrediction = mongoose.model('InjuryPrediction', injuryPredictionSchema);
