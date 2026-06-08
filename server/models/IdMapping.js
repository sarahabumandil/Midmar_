import mongoose from 'mongoose';

const idMappingSchema = new mongoose.Schema(
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
    tempTrackingId: { type: Number, required: true },
    globalId: { type: Number, required: true, min: 1, index: true },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'id_mappings',
  }
);

idMappingSchema.index({ clubId: 1, matchId: 1, tempTrackingId: 1 }, { unique: true });
idMappingSchema.index({ clubId: 1, matchId: 1, globalId: 1 });

export const IdMapping = mongoose.model('IdMapping', idMappingSchema);
