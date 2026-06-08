import express from 'express';
import http from 'http';
import { notFound, errorHandler } from '../server/middleware/errorMiddleware.js';

const app = express();
const PORT = 0; // ephemeral

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'Server is running' }));
app.get('/error', (req, res, next) => next(new Error('smoke test error')));

// mount our project's middlewares
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
server.listen(PORT, () => {
  const { port } = server.address();
  console.log('Smoke server listening on', port);

  const tests = [
    { path: '/api/health', expectedStatus: 200 },
    { path: '/not-found', expectedStatus: 404 },
    { path: '/error', expectedStatus: 500 },
  ];

  const makeRequest = (path) => new Promise((resolve, reject) => {
    http.get({ port, path, timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });

  (async () => {
    for (const t of tests) {
      try {
        const res = await makeRequest(t.path);
        console.log(t.path, '->', res.status, res.body);
      } catch (err) {
        console.error('Request failed:', t.path, err);
      }
    }
    server.close();
  })();
});
