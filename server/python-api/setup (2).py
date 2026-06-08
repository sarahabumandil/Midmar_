"""
Setup script to copy model file and prepare the Python API
Run this after placing your model file in the Downloads folder
"""
import shutil
import os

# Paths
downloads_path = r"C:\Users\Dell\Downloads\xgb_final_model.pkl"
target_path = os.path.join(os.path.dirname(__file__), 'models', 'xgb_final_model.pkl')
models_dir = os.path.join(os.path.dirname(__file__), 'models')

# Create models directory if it doesn't exist
os.makedirs(models_dir, exist_ok=True)

# Copy model file
if os.path.exists(downloads_path):
    shutil.copy2(downloads_path, target_path)
    print(f"✅ Model file copied to {target_path}")
else:
    print(f"❌ Model file not found at {downloads_path}")
    print(f"Please copy xgb_final_model.pkl to {target_path} manually")

print("\nNext steps:")
print("1. Install dependencies: pip install -r requirements.txt")
print("2. Start the API: python app.py")
print("3. The API will run on http://localhost:5000")
