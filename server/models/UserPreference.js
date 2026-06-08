import mongoose from 'mongoose';

const userPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['private', 'team', 'public'],
        default: 'team',
      },
      activityTracking: { type: Boolean, default: true },
      dataSharing: { type: Boolean, default: false },
    },
    notifications: {
      emailAlerts: { type: Boolean, default: true },
      injuryRiskAlerts: { type: Boolean, default: true },
      weeklySummary: { type: Boolean, default: true },
      matchInsightsReady: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    collection: 'user_preferences',
  }
);

export const UserPreference = mongoose.model('UserPreference', userPreferenceSchema);
