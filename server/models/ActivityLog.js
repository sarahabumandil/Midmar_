import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Club',
      default: null,
      index: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    actorEmail: { type: String, default: '', trim: true },
    actorName: { type: String, default: '', trim: true },
    actorRole: { type: String, enum: ['user', 'admin', 'system', 'anonymous'], default: 'anonymous', index: true },
    action: { type: String, required: true, trim: true, index: true },
    resource: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: ['success', 'warning', 'error'], default: 'success', index: true },
    details: { type: String, default: '', trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: '', trim: true },
    userAgent: { type: String, default: '', trim: true },
  },
  {
    timestamps: true,
    collection: 'activity_logs',
  }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ resource: 1, status: 1, createdAt: -1 });

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
