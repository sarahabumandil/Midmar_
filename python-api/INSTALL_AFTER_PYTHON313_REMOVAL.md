# Install Python Packages After Removing Python 3.13

## Steps to Follow

### 1. Close and Restart Your Terminal/PowerShell

This clears any cached environment variables.

### 2. Navigate to the Python API Directory

```powershell
cd E:\Uni\Grad\Prototype\server\python-api
```

### 3. Use Python from the Virtual Environment Directly

Since `python` command might not be available, use the venv's Python directly:

```powershell
# Unset problematic environment variables first
$env:PIP_NO_INDEX = $null
$env:HTTP_PROXY = $null
$env:HTTPS_PROXY = $null
$env:http_proxy = $null
$env:https_proxy = $null

# Verify Python version
.\venv311\Scripts\python.exe --version
# Should show: Python 3.11.9

# Install packages using the venv's Python
.\venv311\Scripts\python.exe -m pip install -r requirements.txt
```

**OR** if you want to activate the venv (so `python` command works):

```powershell
venv311\Scripts\activate.bat
# Now python command should work
python --version
python -m pip install -r requirements.txt
```

## If You Still Get Proxy Errors

### Option A: Disable Proxy in Windows Settings

1. Press `Win + I`
2. Go to **Network & Internet** → **Proxy**
3. Turn OFF "Use a proxy server"
4. Turn OFF "Automatically detect settings"
5. Click **Save**
6. Restart terminal and try again

### Option B: Use Mobile Hotspot

If you're on a corporate network:
1. Connect to your mobile hotspot
2. Try installing packages again

### Option C: Install Packages One by One

If bulk install fails, try installing packages individually using the venv's Python:

```powershell
# Use the venv's Python directly (don't use 'pip' command - it's broken)
.\venv311\Scripts\python.exe -m pip install flask==3.0.0
.\venv311\Scripts\python.exe -m pip install flask-cors==4.0.0
.\venv311\Scripts\python.exe -m pip install numpy==1.26.2
.\venv311\Scripts\python.exe -m pip install pandas==2.1.4
.\venv311\Scripts\python.exe -m pip install xgboost==2.0.3
.\venv311\Scripts\python.exe -m pip install scikit-learn==1.3.2
.\venv311\Scripts\python.exe -m pip install pickle5==0.0.12
```

**Important:** Always use `.\venv311\Scripts\python.exe -m pip` instead of just `pip` because the system `pip` is still pointing to the uninstalled Python 3.13.

## Verify Installation

After installation, verify packages are installed:

```powershell
pip list
```

You should see:
- flask (3.0.0)
- Flask-Cors (4.0.0)
- pandas (2.1.4)
- numpy (1.26.2)
- xgboost (2.0.3)
- scikit-learn (1.3.2)
- pickle5 (0.0.12)

## Start the Python API

Once packages are installed:

```powershell
python app.py
```

The API should start on `http://localhost:5000`

## Troubleshooting

### "Fatal error in launcher" or "python not found"

If you see errors like:
```
Fatal error in launcher: Unable to create process using '"C:\Users\...\Python313\python.exe"'
```

This means the system `pip` command is still pointing to the uninstalled Python 3.13. **Solution:** Always use the venv's Python directly:

```powershell
# Instead of: pip install package
# Use:
.\venv311\Scripts\python.exe -m pip install package

# Or activate the venv first:
venv311\Scripts\activate.bat
python -m pip install package  # Now 'python' refers to venv's Python
```

### "Execution Policy" Error

If you get an error activating the venv:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then try activating again.

### Still Can't Connect to PyPI

1. Check your internet connection
2. Try: `pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org flask`
3. Check Windows Firewall settings
4. Temporarily disable antivirus
