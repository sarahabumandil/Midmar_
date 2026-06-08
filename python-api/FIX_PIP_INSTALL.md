# Fix Python Package Installation Issues

## Problem

You're encountering issues installing Python packages due to:
1. **Proxy configuration** - pip is trying to use a proxy that's not working
2. **No-index setting** - pip is configured to not use PyPI

## Solutions

### Option 1: Fix Proxy Settings (Recommended if you're behind a corporate proxy)

1. **Check your proxy settings:**
   ```powershell
   py -3.11 -m pip config list
   ```

2. **If you see proxy settings, disable them:**
   ```powershell
   # Unset proxy environment variables
   $env:HTTP_PROXY = $null
   $env:HTTPS_PROXY = $null
   $env:http_proxy = $null
   $env:https_proxy = $null
   
   # Unset no-index setting
   $env:PIP_NO_INDEX = $null
   ```

3. **Create/Edit pip config file:**
   ```powershell
   # Create pip config directory if it doesn't exist
   New-Item -ItemType Directory -Force -Path "$env:APPDATA\pip"
   
   # Create/edit pip.ini file
   notepad "$env:APPDATA\pip\pip.ini"
   ```
   
   Add this content (remove any proxy settings):
   ```ini
   [global]
   index-url = https://pypi.org/simple
   trusted-host = pypi.org
   ```

### Option 2: Install Without Proxy (If you have direct internet access)

1. **Unset all proxy and no-index settings:**
   ```powershell
   $env:HTTP_PROXY = $null
   $env:HTTPS_PROXY = $null
   $env:http_proxy = $null
   $env:https_proxy = $null
   $env:PIP_NO_INDEX = $null
   ```

2. **Install packages:**
   ```powershell
   cd server/python-api
   py -3.11 -m pip install --user -r requirements.txt
   ```

### Option 3: Use Python 3.11 Virtual Environment (Best Practice)

1. **Create a fresh virtual environment:**
   ```powershell
   cd server/python-api
   
   # Remove old venv if it exists (optional)
   # Remove-Item -Recurse -Force venv -ErrorAction SilentlyContinue
   
   # Create new venv with Python 3.11
   py -3.11 -m venv venv
   ```

2. **Activate the virtual environment:**
   ```powershell
   # If you get execution policy error, run this first:
   # Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   
   venv\Scripts\Activate.ps1
   ```

3. **Unset proxy settings in the activated environment:**
   ```powershell
   $env:HTTP_PROXY = $null
   $env:HTTPS_PROXY = $null
   $env:PIP_NO_INDEX = $null
   ```

4. **Install packages:**
   ```powershell
   pip install -r requirements.txt
   ```

### Option 4: Manual Package Installation

If network issues persist, you can download wheels manually:

1. **Download packages from PyPI:**
   - Visit: https://pypi.org/project/flask/#files
   - Download the `.whl` file for Python 3.11 Windows
   - Repeat for other packages

2. **Install from local files:**
   ```powershell
   py -3.11 -m pip install --user path\to\downloaded\package.whl
   ```

## Verify Installation

After installation, verify packages are installed:

```powershell
py -3.11 -m pip list
```

You should see:
- flask
- flask-cors
- pandas
- numpy
- xgboost
- scikit-learn
- pickle5

## Start the Python API

Once packages are installed:

```powershell
cd server/python-api
py -3.11 app.py
```

Or if using venv:
```powershell
venv\Scripts\Activate.ps1
python app.py
```

## Troubleshooting

### "Execution Policy" Error
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Still Can't Connect
- Check your internet connection
- Verify firewall isn't blocking pip
- Try using a different network (mobile hotspot)
- Contact your IT department if on corporate network
