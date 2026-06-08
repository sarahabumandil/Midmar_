"""
Script to check feature importance from the XGBoost model
This will help us understand which features are most important
"""
import pickle
import os
import numpy as np

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'xgb_final_model.pkl')

try:
    with open(MODEL_PATH, 'rb') as f:
        model = pickle.load(f)
    
    print("Model loaded successfully!")
    print(f"Number of features: {model.n_features_in_}")
    
    # Get feature importance
    if hasattr(model, 'feature_importances_'):
        importances = model.feature_importances_
        print(f"\nFeature importance array shape: {importances.shape}")
        print(f"Total importance: {importances.sum()}")
        
        # Get top 20 most important features
        top_indices = np.argsort(importances)[::-1][:20]
        print("\nTop 20 most important features (by index):")
        for i, idx in enumerate(top_indices):
            print(f"  {i+1}. Index {idx}: Importance = {importances[idx]:.6f}")
        
        # Check if Age, Goals, Assists, 90s are in top features
        # We'll assume they might be at indices 0, 1, 2, 3 or somewhere in the first few
        print("\nChecking first 10 features:")
        for i in range(min(10, len(importances))):
            print(f"  Index {i}: Importance = {importances[i]:.6f}")
            
    else:
        print("Model does not have feature_importances_ attribute")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
