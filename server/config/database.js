import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Use MONGODB_URI from .env, or fall back to local MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/FOOTBRAIN';
const MONGODB_DB = process.env.MONGODB_DB || 'FOOTBRAIN';

export const connectDB = async () => {
  try {
    // Force target DB to avoid Atlas defaulting to "test".
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    const displayUri = MONGODB_URI.includes('mongodb+srv') ? 'MongoDB Atlas' : MONGODB_URI;
    console.log('✅ MongoDB connected successfully:', displayUri);
    console.log(`✅ Active MongoDB database: ${mongoose.connection.db.databaseName}`);
    
    // Clean up any problematic indexes on connection
    try {
      const collection = mongoose.connection.collection('users');
      const indexes = await collection.indexes();
      const usernameIndex = indexes.find(idx => idx.name === 'username_1');
      if (usernameIndex) {
        console.log('⚠️  Found problematic username_1 index, removing...');
        await collection.dropIndex('username_1');
        console.log('✅ Removed username_1 index');
      }
    } catch (error) {
      // Ignore errors during index cleanup
      if (error.code !== 27) { // 27 = index not found
        console.log('ℹ️  Index cleanup:', error.message);
      }
    }

    // Legacy `teams` collection (old Team model) — removed from the app; drop if it still exists.
    try {
      await mongoose.connection.dropCollection('teams');
      console.log('✅ Dropped legacy teams collection');
    } catch (error) {
      if (error.code !== 26 && error.codeName !== 'NamespaceNotFound') {
        console.log('ℹ️  teams collection cleanup:', error.message);
      }
    }

    return true;
  } catch (error) {
    console.error('❌ MongoDB Atlas connection error:', error);
    if (error.message.includes('authentication failed')) {
      console.error('💡 Check your username and password in the connection string');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.error('💡 Check your cluster URL and internet connection');
    } else if (error.message.includes('IP')) {
      console.error('💡 Make sure your IP address is whitelisted in MongoDB Atlas Network Access');
    }
    console.error('💡 Verify your MONGODB_URI in the .env file is correct');
    throw error;
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});
