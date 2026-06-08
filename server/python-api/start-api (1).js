/**
 * Start the Python API (Flask) for Market Value + Injury prediction.
 * Tries venvs in order: .venv311_new, .venv311, venv311, venv, then system python.
 */
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Skip venvs for now - they appear to be broken launcher stubs
// Use full path to system Python
const pythonFullPath = 'C:\\Users\\Dell\\AppData\\Local\\Programs\\Python\\Python311\\python.exe';
if (fs.existsSync(pythonFullPath)) {
  pythonPath = pythonFullPath;
} else {
  // Fallback to trying py command
  pythonPath = 'py';
  pythonArgs = ['-3.11', path.join(apiDir, 'app.py')];
}

console.log('Using Python: ' + pythonPath);

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
