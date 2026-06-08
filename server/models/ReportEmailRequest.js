import mongoose from 'mongoose';

const reportEmailRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Club',
      default: null,
      index: true,
    },
    templateId: { type: String, required: true, trim: true },
    format: { type: String, enum: ['pdf', 'excel', 'csv'], default: 'pdf' },
    dateRange: { type: String, default: 'month' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed'],
      default: 'queued',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'report_email_requests',
  }
);

export const ReportEmailRequest = mongoose.model('ReportEmailRequest', reportEmailRequestSchema);
