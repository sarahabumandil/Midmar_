import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema(
  {
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Club',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, required: true, trim: true },
    opponent: { type: String, default: '', trim: true },
    matchDate: { type: Date, required: true, index: true },
    videoPath: { type: String, default: '' },
    /** Annotated output from CV (filename under python-api/output_videos) */
    analysisOutputFilename: { type: String, default: '' },
    status: {
      type: String,
      enum: ['created', 'processed', 'mapped', 'finalized'],
      default: 'created',
      index: true,
    },
    rawInsights: { type: [mongoose.Schema.Types.Mixed], default: [] },
    mappingCompletedAt: { type: Date, default: null },
    finalizedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'matches',
  }
);

matchSchema.index({ clubId: 1, matchDate: -1 });

export const Match = mongoose.model('Match', matchSchema);
