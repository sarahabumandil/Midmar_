# Python API Server for FootBrain AI Models

This Python Flask server provides API endpoints for AI model predictions.

## Setup

1. **Install Python dependencies:**
   ```bash
   cd server/python-api
   pip install -r requirements.txt
   ```

2. **Place model file:**
   - Copy `xgb_final_model.pkl` to `server/python-api/models/`
   - Create the `models` directory if it doesn't exist

3. **Start the server:**
   ```bash
   python app.py
   ```
   
   Or with gunicorn (production):
   ```bash
   gunicorn -w 4 -b 0.0.0.0:5000 app:app
   ```

## API Endpoints

### Health Check
- **GET** `/health`
- Returns server status and model loading status

### Market Value Prediction
- **POST** `/predict/market-value`
- **Request Body:**
  ```json
  {
    "Age": 25,
    "Goals": 15,
    "Assists": 8,
    "90s": 30.5,
    "Comp": "Premier League",
    "Nation": "England",
    "Pos": "Forward",
    "Squad": "Manchester United"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "predictedValue": 25.5,
    "predictedValueEuros": 25500000,
    "input": { ... }
  }
  ```

## Notes

- The model expects one-hot encoded categorical variables
- Make sure the training columns match what the model expects
- The server runs on port 5000 by default
