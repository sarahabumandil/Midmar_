# Python Version Compatibility Issue

## Problem

You're using **Python 3.13**, which was released in October 2024. Many packages (including pandas, Flask, and their dependencies) don't have pre-built wheels for Python 3.13 yet, causing installation failures.

## Solutions

### Option 1: Use Python 3.11 or 3.12 (Recommended)

Python 3.11 or 3.12 have much better package support and are more stable for production use.

**Steps:**

1. **Install Python 3.11 or 3.12** (if not already installed):
   - Download from: https://www.python.org/downloads/
   - Choose Python 3.11.9 or Python 3.12.7 (latest stable versions)

2. **Create a virtual environment with the correct Python version:**
   
   **On Windows (PowerShell):**
   ```powershell
   # Navigate to the python-api folder
   cd server/python-api
   
   # Check available Python versions
   py --list
   
   # Create virtual environment with Python 3.11 (use py -3.11 on Windows)
   py -3.11 -m venv venv
   
   # Activate it
   venv\Scripts\Activate.ps1
   # If you get an execution policy error, run:
   # Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
   
   **Alternative: Install directly without venv (if permission issues):**
   ```powershell
   # Install packages directly to Python 3.11 user site-packages
   py -3.11 -m pip install --user -r requirements.txt
   ```

3. **Install dependencies:**
   ```powershell
   # If venv is activated:
   pip install -r requirements.txt
   
   # Or if installing directly:
   py -3.11 -m pip install --user -r requirements.txt
   ```

4. **Start the API:**
   ```powershell
   # If venv is activated:
   python app.py
   
   # Or if using system Python 3.11:
   py -3.11 app.py
   ```

### Option 2: Use Python 3.13 with Updated Requirements

If you want to stick with Python 3.13, you'll need to use the latest versions of packages that support it. Update `requirements.txt` to:

```txt
flask>=3.0.3
flask-cors>=4.0.1
pandas>=2.2.3
numpy>=2.0.0
xgboost>=2.1.0
scikit-learn>=1.5.0
pickle5==0.0.12
```

Then try installing again. However, some packages may still have compatibility issues.

### Option 3: Use Conda/Miniconda

Conda often has better support for newer Python versions:

```bash
# Create environment with Python 3.12
conda create -n footbrain-api python=3.12
conda activate footbrain-api

# Install packages
pip install -r requirements.txt
```

## Recommended Approach

**Use Python 3.11 or 3.12** - This is the most reliable solution and will save you time troubleshooting compatibility issues.

## Verify Your Python Version

```bash
python --version
```

You should see something like:
- `Python 3.11.9` ✅ (Good)
- `Python 3.12.7` ✅ (Good)
- `Python 3.13.x` ⚠️ (May have compatibility issues)
