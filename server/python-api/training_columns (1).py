import pickle
from pathlib import Path

BASE_DIR = Path(__file__).parent
MODEL_PATH = BASE_DIR / "models" / "xgboost_model.pkl"
OUT_PATH = BASE_DIR / "models" / "training_columns.pkl"

with MODEL_PATH.open("rb") as f:
    model = pickle.load(f)

columns = None

# Preferred: scikit-learn style
if hasattr(model, "feature_names_in_") and model.feature_names_in_ is not None:
    columns = list(model.feature_names_in_)
    print("Using model.feature_names_in_")
# Fallback: XGBoost booster feature names
elif hasattr(model, "get_booster"):
    booster = model.get_booster()
    if getattr(booster, "feature_names", None):
        columns = list(booster.feature_names)
        print("Using booster.feature_names")

if columns is None:
    raise RuntimeError("Model does not expose feature names; you must get X_columns from the notebook.")

print(f"Found {len(columns)} columns")
print(columns[:20], "..." if len(columns) > 20 else "")

with OUT_PATH.open("wb") as f:
    pickle.dump(columns, f)

print(f"Saved training_columns.pkl to {OUT_PATH}")