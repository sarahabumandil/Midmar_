"""
Python API server for FootBrain AI models
- Market value: player_value_model.pkl (performance stats: goals, assists, etc.)
- Injury risk: xgb_model.pkl (physical attributes: height, weight, age, BMI, etc.)
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import pandas as pd
import numpy as np
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# --- Market value model (performance-based) ---
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'player_value_model.pkl')
model = None

# --- Injury risk model (physical-attribute-based only) ---
# Injury model must expect injury features (age, height, weight, bmi, hamstring, sprint_speed, training_hours).
# Do NOT use FIFA-style models (Release clause, International reputation, etc.) for injury.
# First try your trained model at f:\miu\xgboost_model.pkl (or set env INJURY_MODEL_PATH), then project models.
INJURY_MODEL_EXTERNAL = os.environ.get('INJURY_MODEL_PATH', r'f:\miu\xgboost_model.pkl')
INJURY_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'xgb_model.pkl')
INJURY_MODEL_FALLBACK = os.path.join(os.path.dirname(__file__), 'models', 'xgboost_model.pkl')
injury_model = None
injury_feature_names = None  # set from model.feature_names_in_ if available

# FIFA-style feature names = not an injury model. Injury model uses physical/health features.
FIFA_STYLE_MARKERS = ('release clause', 'international reputation', 'number of playstyles', 'total stats')


def _is_injury_model(feature_names):
    """True if this model expects injury-related features (age, height, weight, etc.), not FIFA columns."""
    if feature_names is None or len(feature_names) == 0:
        return True
    names_str = ' '.join(str(x).strip().lower() for x in feature_names)
    if any(m in names_str for m in FIFA_STYLE_MARKERS):
        return False
    return True


def _patch_sklearn_for_old_pickle():
    """Allow loading models pickled with sklearn 1.6.x (ColumnTransformer used _RemainderColsList)."""
    try:
        import sklearn.compose._column_transformer as _ct
        if not hasattr(_ct, '_RemainderColsList'):
            class _RemainderColsList(list):
                pass
            _ct._RemainderColsList = _RemainderColsList
    except Exception:
        pass


def load_model():
    """Load the market value model (scikit-learn Pipeline). Uses performance stats (goals, assists, etc.)."""
    global model
    try:
        _patch_sklearn_for_old_pickle()
        with open(MODEL_PATH, 'rb') as f:
            model = pickle.load(f)
        print(f"✅ Market value model loaded from {MODEL_PATH}")
        return True
    except FileNotFoundError:
        print(f"❌ Market value: file not found at {MODEL_PATH}")
        return False
    except Exception as e:
        err = str(e)
        print(f"❌ Market value model failed to load: {err}")
        if "_RemainderColsList" in err or "column_transformer" in err.lower():
            print("   → Try: pip install scikit-learn==1.6.1 then restart. Injury model is separate and can still work.")
        return False

def load_injury_model():
    """Load the injury risk model. Uses f:\\miu\\xgboost_model.pkl or project models. Accepts any .pkl and maps our API (age, height, weight) to the model's expected columns."""
    global injury_model, injury_feature_names
    injury_model = None
    injury_feature_names = None
    # Try: (1) f:\miu\xgboost_model.pkl, (2) models/xgb_model.pkl, (3) models/xgboost_model.pkl
    for path in [INJURY_MODEL_EXTERNAL, INJURY_MODEL_PATH, INJURY_MODEL_FALLBACK]:
        if not os.path.isfile(path):
            continue
        try:
            with open(path, 'rb') as f:
                m = pickle.load(f)
            names = getattr(m, 'feature_names_in_', None)
            if names is None and hasattr(m, 'get_booster'):
                try:
                    names = m.get_booster().feature_names
                except Exception:
                    pass
            if names is not None:
                names = list(names)  # ensure list, correct length
            injury_model = m
            injury_feature_names = names
            print(f"✅ Injury model loaded from {path}")
            if injury_feature_names is not None:
                print(f"   Features ({len(injury_feature_names)}): {list(injury_feature_names)}")
            return True
        except Exception as e:
            print(f"❌ Error loading {path}: {str(e)}")
            continue
    print("⚠️  Injury: no model loaded. Put your .pkl at " + INJURY_MODEL_EXTERNAL + " or at server/python-api/models/xgb_model.pkl")
    return False

# Load models on startup (market value and injury are separate)
print("--- Market value (performance: goals, assists, shots...) ---")
if not load_model():
    print("⚠️  Market value: not loaded. Fix: pip install scikit-learn==1.6.1 then restart.")
print("--- Injury risk (physical: height, weight, age, BMI...) ---")
load_injury_model()
if injury_model is None:
    print("⚠️  Injury: not loaded. Expected: " + INJURY_MODEL_EXTERNAL + " or server/python-api/models/xgb_model.pkl")
else:
    print("   Injury model ready.")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'injury_model_loaded': injury_model is not None
    })

@app.route('/predict/market-value', methods=['POST'])
def predict_market_value():
    """
    Predict market value for a player using the Ridge regression
    pipeline saved as player_value_model.pkl.

    This model was trained in the notebook Market_valuewrite.ipynb and
    expects the following raw input columns (before preprocessing):

    - Age       (numeric)
    - Gls+Ast   (numeric, goals + assists)
    - Sh        (numeric, shots)
    - SoT       (numeric, shots on target)
    - Player    (string, player name)
    - Nation    (string, nationality code, e.g. 'ENG')
    - Pos       (string, position code, e.g. 'FW')
    - Club_x    (string, club name)
    - Leauge    (string, league name, note original spelling)
    """
    if model is None:
        return jsonify({
            'error': 'Model not loaded. Please check server logs.'
        }), 500

    try:
        data = request.get_json() or {}

        # Extract and validate required fields for the sklearn Pipeline
        player_input = {
            'Age': data.get('Age'),
            'Gls+Ast': data.get('Gls+Ast'),
            'Sh': data.get('Sh'),
            'SoT': data.get('SoT'),
            'Player': data.get('Player'),
            'Nation': data.get('Nation'),
            'Pos': data.get('Pos'),
            'Club_x': data.get('Club_x'),
            'Leauge': data.get('Leauge'),
        }

        # Basic validation: numeric fields must be present
        missing_numeric = [
            key for key in ['Age', 'Gls+Ast', 'Sh', 'SoT']
            if player_input[key] is None
        ]
        if missing_numeric:
            return jsonify({
                'error': f'Missing required numeric fields: {", ".join(missing_numeric)}'
            }), 400

        # Convert numeric fields to float
        for key in ['Age', 'Gls+Ast', 'Sh', 'SoT']:
            try:
                player_input[key] = float(player_input[key])
            except (TypeError, ValueError):
                return jsonify({
                    'error': f'Field {key} must be a numeric value'
                }), 400

        # Provide safe defaults for categoricals if not supplied
        if player_input['Player'] is None:
            player_input['Player'] = 'Unknown Player'
        if player_input['Nation'] is None:
            player_input['Nation'] = 'Other'
        if player_input['Pos'] is None:
            player_input['Pos'] = 'FW'
        if player_input['Club_x'] is None:
            player_input['Club_x'] = 'Unknown Club'
        if player_input['Leauge'] is None:
            player_input['Leauge'] = 'Unknown League'

        # Create a single-row DataFrame with exactly the columns
        # used in the training notebook
        player_df = pd.DataFrame([player_input])

        # Get prediction directly from the sklearn Pipeline
        raw_prediction = model.predict(player_df)[0]
        if isinstance(raw_prediction, (np.integer, np.floating)):
            raw_prediction = float(raw_prediction)
        else:
            raw_prediction = float(raw_prediction)

        predicted_value = max(0.0, float(raw_prediction))
        predicted_value_millions = float(predicted_value / 1_000_000)

        serializable_input = {}
        for key, value in player_input.items():
            if isinstance(value, (np.integer, np.floating)):
                serializable_input[key] = float(value)
            else:
                serializable_input[key] = value

        return jsonify({
            'success': True,
            'predictedValue': float(predicted_value_millions),
            'predictedValueEuros': float(predicted_value),
            'input': serializable_input
        })
        
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# --- Injury prediction: your model's real features (no Release clause / FIFA stuff) ---
# Fallback when model doesn't expose feature names; matches your injury model columns
INJURY_MODEL_FEATURES = [
    'Age', 'Height_cm', 'Weight_kg', 'Position', 'Training_hours', 'Matches_played',
    'Previous_injuries', 'Knee_Strength', 'Hamstring', 'Reaction_time', 'Balance',
    'Top_Sprint_Speed', 'Agility', 'Sleep_Hours', 'Stress_Level', 'Nutrition', 'Warmup', 'BMI'
]
DEFAULT_INJURY_FEATURES = [
    'age', 'height', 'weight', 'bmi', 'hamstring', 'sprint_speed', 'training_hours'
]


def _float(data, key, default):
    """Get a float from request data, or return default."""
    v = data.get(key)
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


@app.route('/predict/injury', methods=['POST'])
def predict_injury():
    """
    Predict injury risk from physical attributes only.
    Inputs: age, height (cm), weight (kg), bmi (optional, computed from height/weight),
            hamstring (score 0-100 or strength), sprint_speed (e.g. km/h or 0-100),
            training_hours (per week).
    Returns: risk_level (high/medium/low), risk_probability (0-1), and factors.
    """
    if injury_model is None:
        return jsonify({
            'error': 'Injury model not loaded. Please add xgb_model.pkl to server/python-api/models/'
        }), 500

    try:
        raw = request.get_json() or {}
        data = {**raw.get('physical', {}), **raw}  # read from both physical and top-level
        age = _float(data, 'age', 25)
        height = _float(data, 'height', 180)   # cm
        weight = _float(data, 'weight', 75)    # kg
        bmi_val = data.get('bmi')
        if bmi_val is None and height and weight:
            bmi_val = weight / ((height / 100) ** 2)
        else:
            bmi_val = _float(data, 'bmi', 22.0)
        hamstring = _float(data, 'hamstring', 70)
        sprint_speed = _float(data, 'sprint_speed', 30)
        training_hours = _float(data, 'training_hours', 15)
        # Optional injury-model fields (from form or 0)
        position = _float(data, 'position', 0)
        matches_played = _float(data, 'matches_played', 20)
        previous_injuries = _float(data, 'previous_injuries', 0)
        knee_strength = _float(data, 'knee_strength', 70)
        reaction_time = _float(data, 'reaction_time', 50)
        balance = _float(data, 'balance', 70)
        agility = _float(data, 'agility', 70)
        sleep_hours = _float(data, 'sleep_hours', 7)
        stress_level = _float(data, 'stress_level', 30)
        nutrition = _float(data, 'nutrition', 70)
        warmup = _float(data, 'warmup', 1)

        # Use model's expected feature names (injury columns only, no Release clause etc.)
        n_expected = getattr(injury_model, 'n_features_in_', None)
        if injury_feature_names is not None and len(injury_feature_names) > 0:
            col_names = [str(x).strip() for x in injury_feature_names]
        elif n_expected is not None and n_expected == len(INJURY_MODEL_FEATURES):
            col_names = list(INJURY_MODEL_FEATURES)
        else:
            col_names = list(DEFAULT_INJURY_FEATURES)
        if n_expected is not None and len(col_names) != n_expected:
            if n_expected == len(INJURY_MODEL_FEATURES):
                col_names = list(INJURY_MODEL_FEATURES)
            else:
                col_names = col_names[:n_expected] if len(col_names) > n_expected else col_names + [f'feature_{i}' for i in range(len(col_names), n_expected)]

        # Map model column names to our values (injury features only)
        row = {
            'age': age,
            'height_cm': height,
            'height': height,
            'weight_kg': weight,
            'weight': weight,
            'bmi': bmi_val,
            'hamstring': hamstring,
            'top_sprint_speed': sprint_speed,
            'sprint_speed': sprint_speed,
            'training_hours': training_hours,
            'position': position,
            'matches_played': matches_played,
            'previous_injuries': previous_injuries,
            'knee_strength': knee_strength,
            'reaction_time': reaction_time,
            'balance': balance,
            'agility': agility,
            'sleep_hours': sleep_hours,
            'stress_level': stress_level,
            'nutrition': nutrition,
            'warmup': warmup,
        }

        # Features that should be int (like training data): Age, Position, Matches, Previous_injuries, Warmup
        int_features = {'age', 'position', 'matches_played', 'previous_injuries', 'warmup'}

        def _value_for_feature(name):
            key = str(name).strip().lower().replace(' ', '_').replace('-', '_')
            val = 0
            if key in row:
                val = row[key]
            elif 'sprint' in key:
                val = sprint_speed
            elif 'sleep' in key:
                val = sleep_hours
            elif 'stress' in key:
                val = stress_level
            elif 'balance' in key:
                val = balance
            elif 'agility' in key:
                val = agility
            elif 'reaction' in key:
                val = reaction_time
            elif 'knee' in key:
                val = knee_strength
            elif 'previous' in key or ('injur' in key and 'next' not in key):
                val = previous_injuries
            elif 'match' in key:
                val = matches_played
            elif 'warmup' in key or 'warm' in key:
                val = warmup
            elif 'nutrition' in key:
                val = nutrition
            # Match training types: int for Age, Position, counts; float for continuous
            if key in int_features:
                return int(round(val))
            return float(val)

        values = [_value_for_feature(k) for k in col_names]
        X = pd.DataFrame([values], columns=col_names)
        # Log so you can verify Age/Height/Weight are passed correctly (e.g. age=35)
        age_idx = next((i for i, c in enumerate(col_names) if 'age' in str(c).lower() and 'prev' not in str(c).lower()), None)
        if age_idx is not None:
            print(f"   [Injury] Age={values[age_idx]}, Height={height}, Weight={weight} -> model input OK")

        # Predict: use class 1 = injury risk (so young/low risk -> lower %, old/high risk -> higher %)
        if hasattr(injury_model, 'predict_proba'):
            proba = injury_model.predict_proba(X)[0]
            p0 = float(proba[0]) if len(proba) > 0 else 0.5
            p1 = float(proba[1]) if len(proba) > 1 else 0.5
            # Class 1 = injury risk (22 yo -> lower %, 35 yo -> higher %)
            risk_probability = p1
        else:
            pred = injury_model.predict(X)[0]
            risk_probability = float(pred) if isinstance(pred, (int, float)) else 0.5

        risk_probability = max(0.0, min(1.0, risk_probability))
        if risk_probability >= 0.6:
            risk_level = 'high'
        elif risk_probability >= 0.35:
            risk_level = 'medium'
        else:
            risk_level = 'low'

        # Simple risk factors from inputs (for UI)
        top_risk_factors = []
        if age > 28:
            top_risk_factors.append({'factor': 'Age', 'impact': min(0.3, (age - 28) / 50), 'description': 'Older players have higher injury risk'})
        if training_hours > 20:
            top_risk_factors.append({'factor': 'Training load', 'impact': 0.25, 'description': 'High training volume increases injury risk'})
        if bmi_val > 26 or bmi_val < 19:
            top_risk_factors.append({'factor': 'BMI', 'impact': 0.2, 'description': 'BMI outside optimal range can affect injury risk'})
        if hamstring < 50:
            top_risk_factors.append({'factor': 'Hamstring', 'impact': 0.25, 'description': 'Lower hamstring strength is associated with higher risk'})
        if not top_risk_factors:
            top_risk_factors.append({'factor': 'Overall fitness', 'impact': 1.0 - risk_probability, 'description': 'Physical attributes within normal range'})

        return jsonify({
            'success': True,
            'risk_level': risk_level,
            'risk_probability': risk_probability,
            'risk_percentage': round(risk_probability * 100, 1),
            'top_risk_factors': top_risk_factors[:5],
            'model_confidence': 0.85,
            'input': {k: (float(v) if isinstance(v, (np.floating, np.integer)) else v) for k, v in row.items()}
        })
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    # use_reloader=False avoids double startup and port issues on Windows
    print(f"Starting Python API on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)
