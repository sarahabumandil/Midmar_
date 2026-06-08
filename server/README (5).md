# FootBrain Backend Server

Backend API server for FootBrain application with MongoDB authentication.

## Quick Start

1. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Set up MongoDB Atlas (Cloud Database):**
   - Follow the guide: `../MONGODB_ATLAS_SETUP.md`
   - Create a free MongoDB Atlas account
   - Get your connection string from Atlas
   - Add it to your `.env` file

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and update:
   - `MONGODB_URI` - Your MongoDB Atlas connection string (required)
   - `JWT_SECRET` - A secure random string for JWT tokens
   - `PORT` - Server port (default: 3000)

4. **Start the server:**
   ```bash
   npm run dev
   ```

The server will:
- Connect to MongoDB
- Create an admin user on first run (if it doesn't exist)
- Run on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe"
  }
  ```

- `POST /api/auth/login` - Login user
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

- `GET /api/auth/verify` - Verify JWT token
  Headers: `Authorization: Bearer <token>`

### Health Check
- `GET /api/health` - Check server status

## Default Admin Credentials

- Email: `admin@footbrain.com`
- Password: `admin123`

(Change these in `.env` file)

## Database Schema

### User Model
```javascript
{
  email: String (unique, required),
  password: String (hashed, required),
  name: String (required),
  role: 'user' | 'admin' (default: 'user'),
  teamInfo: {
    name: String,
    totalPlayers: Number,
    injuryAlerts: Number,
    marketValue: String,
    videosAnalyzed: Number
  }
}
```
