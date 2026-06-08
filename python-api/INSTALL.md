# Install Python Dependencies

## Quick Install

Run this command in the `server/python-api` folder:

```bash
cd server/python-api
pip install -r requirements.txt
```

## What This Installs

- `flask` - Web framework for the API
- `flask-cors` - Enable CORS for cross-origin requests
- `pandas` - Data manipulation
- `numpy` - Numerical computing
- `xgboost` - XGBoost machine learning model
- `scikit-learn` - Machine learning utilities
- `pickle5` - For loading saved models

## After Installation

Once installed, start the API:

```bash
python app.py
```

## Troubleshooting

### "pip is not recognized"
- Python might not be in your PATH
- Try: `python -m pip install -r requirements.txt`

### "Permission denied"
- Try: `pip install --user -r requirements.txt`
- Or use a virtual environment (recommended)

### Using Virtual Environment (Recommended)

```bash
# Create virtual environment
python -m venv venv

# Activate it (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start API
python app.py
```
