# How to start the Python API (so "Python API is not running" goes away)

The Python API runs on **http://127.0.0.1:5000** and is used for Market Value and Injury Prediction.

## Option 1: From project root (recommended)

```bash
npm run dev:python
```

This runs `node server/python-api/start-api.js`, which looks for a Python venv in `server/python-api` and starts `app.py`. Keep this terminal open.

---

## Option 2: Manual (if Option 1 fails)

1. Open a terminal.
2. Go to the python-api folder:
   ```bash
   cd F:\Soffiascrapping\Prototype\server\python-api
   ```
3. Activate the venv where you installed flask/pandas/scikit-learn (use the one that works for you):
   - **PowerShell:**
     ```powershell
     .\.venv311\Scripts\Activate.ps1
     ```
     or if you use `.venv311_new`:
     ```powershell
     .\.venv311_new\Scripts\Activate.ps1
     ```
   - **CMD:**
     ```cmd
     .\.venv311\Scripts\activate.bat
     ```
4. Start the API:
   ```bash
   python app.py
   ```
5. You should see: `Running on http://127.0.0.1:5000` (or similar). Leave this terminal open.

---

## Check that it’s running

- In the browser or PowerShell:
  ```text
  http://127.0.0.1:5000/health
  ```
  You should get JSON like: `{"status":"ok","model_loaded":true,...}`

- Or in PowerShell:
  ```powershell
  Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5000/health
  ```

---

## You need both running

1. **Node backend** (e.g. `npm run dev:server`) – port 3000 or 3001  
2. **Python API** (this) – port 5000  

Then use the site; Market Value and Injury Prediction will call the Python API.
