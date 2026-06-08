/**
 * Start the Python API (Flask) for Market Value + Injury prediction.
 * Tries venvs in order: .venv311_new, .venv311, venv311, venv, then system python.
 */
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const apiDir = __dirname;
const isWin = process.platform === 'win32';
const scriptsOrBin = isWin ? 'Scripts' : 'bin';

const venvCandidates = [
  '.venv311_new',
  '.venv311',
  'venv311',
  'venv',
  '.venv',
].flatMap((name) => [
  path.join(apiDir, name, scriptsOrBin, 'python.exe'),
  path.join(apiDir, name, scriptsOrBin, 'python'),
]);

let pythonPath = null;
let pythonArgs = [path.join(apiDir, 'app.py')];
for (const p of venvCandidates) {
  if (fs.existsSync(p)) {
    pythonPath = p;
    break;
  }
}
if (!pythonPath) {
  pythonPath = isWin ? 'py' : 'python3';
  pythonArgs = isWin ? ['-3.11', path.join(apiDir, 'app.py')] : [path.join(apiDir, 'app.py')];
  console.log('No venv found. Using: ' + pythonPath + (isWin ? ' -3.11' : ''));
  console.log('To use a venv: cd server\\python-api, then .\\.venv311\\Scripts\\Activate.ps1, then python app.py');
}

console.log('Starting Python API on http://127.0.0.1:5000');
console.log('Python:', pythonPath);
const child = spawn(pythonPath, pythonArgs, {
  cwd: apiDir,
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, PORT: '5000' },
});

child.on('error', (err) => {
  console.error('Failed to start Python API:', err.message);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
child.on('close', (code) => {
  process.exit(code ?? 0);
});
