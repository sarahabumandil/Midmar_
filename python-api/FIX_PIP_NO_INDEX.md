# Fix PIP_NO_INDEX Environment Variable

## Problem

The `PIP_NO_INDEX` environment variable is set on your system, preventing pip from accessing PyPI. This needs to be removed from Windows environment variables.

## Solution: Remove PIP_NO_INDEX from Windows Environment Variables

### Method 1: Using Windows Settings (Easiest)

1. **Open Environment Variables:**
   - Press `Win + R` to open Run dialog
   - Type: `sysdm.cpl` and press Enter
   - Click the "Advanced" tab
   - Click "Environment Variables" button

2. **Remove PIP_NO_INDEX:**
   - In "User variables" section, look for `PIP_NO_INDEX`
   - If found, select it and click "Delete"
   - In "System variables" section, look for `PIP_NO_INDEX`
   - If found, select it and click "Delete" (may require admin)
   - Click "OK" to save

3. **Restart your terminal/PowerShell** for changes to take effect

### Method 2: Using PowerShell (Run as Administrator)

```powershell
# Remove from user environment variables
[Environment]::SetEnvironmentVariable("PIP_NO_INDEX", $null, "User")

# Remove from system environment variables (requires admin)
[Environment]::SetEnvironmentVariable("PIP_NO_INDEX", $null, "Machine")
```

### Method 3: Using Command Prompt (Run as Administrator)

```cmd
# Remove from user environment variables
setx PIP_NO_INDEX ""

# Remove from system environment variables
setx PIP_NO_INDEX "" /M
```

**Note:** After using `setx`, you need to close and reopen your terminal.

## Verify It's Removed

After removing the variable and restarting your terminal:

```powershell
# Check if PIP_NO_INDEX is still set
echo $env:PIP_NO_INDEX

# Should show nothing (empty)

# Check pip config
py -3.11 -m pip config list
# Should NOT show :env:.no-index='1'
```

## After Fixing, Install Packages

Once `PIP_NO_INDEX` is removed:

```powershell
cd server/python-api
.\venv311\Scripts\python.exe -m pip install -r requirements.txt
```

Or if you want to use the venv:

```powershell
# Use batch file instead of PowerShell script (avoids execution policy)
venv311\Scripts\activate.bat
pip install -r requirements.txt
```

## Alternative: Use Batch File Activation

If you still have execution policy issues, use the batch file:

```cmd
cd server\python-api
venv311\Scripts\activate.bat
pip install -r requirements.txt
```

## Still Having Issues?

If removing `PIP_NO_INDEX` doesn't work:

1. **Check for proxy settings** in Windows Settings → Network & Internet → Proxy
2. **Try using a different network** (mobile hotspot) to rule out network issues
3. **Contact your IT department** if you're on a corporate network with strict policies
