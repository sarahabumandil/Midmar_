# Fix Proxy Issue Preventing pip Installation

## Problem

pip is trying to use a proxy server that's not working, preventing package installation. The error shows:
```
ProxyError('Cannot connect to proxy.', ...)
```

## Solutions

### Option 1: Disable Proxy in Windows Settings (Recommended)

1. **Open Windows Settings:**
   - Press `Win + I`
   - Go to **Network & Internet** → **Proxy**

2. **Disable Proxy:**
   - Under "Manual proxy setup", turn OFF "Use a proxy server"
   - Under "Automatic proxy setup", turn OFF "Automatically detect settings" (if enabled)
   - Click **Save**

3. **Restart your terminal/PowerShell**

4. **Try installing again:**
   ```powershell
   cd server/python-api
   venv311\Scripts\activate.bat
   pip install -r requirements.txt
   ```

### Option 2: Configure Correct Proxy (If you need a proxy)

If you're on a corporate network and need a proxy:

1. **Get proxy details from your IT department:**
   - Proxy server address (e.g., `proxy.company.com`)
   - Port number (e.g., `8080`)
   - Authentication (if required)

2. **Set proxy environment variables:**
   ```powershell
   $env:HTTP_PROXY = "http://proxy.company.com:8080"
   $env:HTTPS_PROXY = "http://proxy.company.com:8080"
   ```

3. **If authentication is required:**
   ```powershell
   $env:HTTP_PROXY = "http://username:password@proxy.company.com:8080"
   $env:HTTPS_PROXY = "http://username:password@proxy.company.com:8080"
   ```

### Option 3: Use a Different Network

If you can't fix the proxy:

1. **Connect to a different network:**
   - Use mobile hotspot
   - Use a different Wi-Fi network
   - Disconnect from VPN (if connected)

2. **Then try installing:**
   ```powershell
   cd server/python-api
   venv311\Scripts\activate.bat
   pip install -r requirements.txt
   ```

### Option 4: Install Packages Manually (Last Resort)

If network issues persist, download and install packages manually:

1. **Download wheel files from PyPI:**
   - Visit: https://pypi.org/project/flask/#files
   - Download the `.whl` file for Python 3.11 Windows 64-bit
   - Repeat for: flask-cors, pandas, numpy, xgboost, scikit-learn, pickle5

2. **Install from local files:**
   ```powershell
   cd server/python-api
   venv311\Scripts\activate.bat
   pip install path\to\downloaded\flask-3.0.0-py3-none-any.whl
   pip install path\to\downloaded\flask_cors-4.0.0-py2.py3-none-any.whl
   # ... repeat for other packages
   ```

## Check Current Proxy Settings

To see what proxy is configured:

```powershell
# Check environment variables
echo $env:HTTP_PROXY
echo $env:HTTPS_PROXY

# Check Windows proxy settings via registry
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
```

## Verify Fix

After fixing the proxy issue:

```powershell
cd server/python-api
venv311\Scripts\activate.bat
pip install flask
# Should install successfully
```

## Still Having Issues?

1. **Check Windows Firewall** - Make sure it's not blocking pip
2. **Check Antivirus** - Some antivirus software blocks pip
3. **Contact IT Support** - If on corporate network, they may need to whitelist PyPI
4. **Try using Conda** - Conda often handles proxies better:
   ```powershell
   conda install flask flask-cors pandas numpy scikit-learn
   pip install xgboost pickle5
   ```
