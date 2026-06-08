"""
Script to extract feature names from the XGBoost model
This will help us understand what columns the model expects
"""
import pickle
import os

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'xgb_final_model.pkl')

try:
    with open(MODEL_PATH, 'rb') as f:
        model = pickle.load(f)
    
    print("Model loaded successfully!")
    print(f"Number of features expected: {model.n_features_in_}")
    
    # Check if model has feature names
    if hasattr(model, 'feature_names_in_'):
        print(f"\nFeature names available: {len(model.feature_names_in_)}")
        print("First 20 features:", model.feature_names_in_[:20])
        print("Last 20 features:", model.feature_names_in_[-20:])
    else:
        print("\nModel does not have feature_names_in_ attribute")
        # Try to get from booster
        if hasattr(model, 'get_booster'):
            booster = model.get_booster()
            if hasattr(booster, 'feature_names'):
                feature_names = booster.feature_names
                if feature_names:
                    print(f"Feature names from booster: {len(feature_names)}")
                    print("First 20:", feature_names[:20])
                    print("Last 20:", feature_names[-20:])
                else:
                    print("Booster has no feature names")
            else:
                print("Booster does not have feature_names attribute")
        else:
            print("Model does not have get_booster method")
    
    # Check model type
    print(f"\nModel type: {type(model)}")
    print(f"Model attributes: {[attr for attr in dir(model) if not attr.startswith('_')]}")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
