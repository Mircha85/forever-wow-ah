/**
 * Minimal HTTP wrapper so Cloud Run can host the extraction script.
 * Listens on $PORT (8080 by default). On POST /run?region=eu triggers
 * the extraction and returns the summary.
 *
 * Keep this file tiny — security-sensitive: bearer token required.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.PIPELINE_RUN_TOKEN;
const SCRIPT = path.resolve('scripts/extract-direct.ts');
const TSX = path.resolve('node_modules/.bin/tsx');

if (!TOKEN) {
  console.warn('[run-server] WARNING: PIPELINE_RUN_TOKEN env var is not set. /run will reject all requests.');
}

/** Run the extraction and stream its stdout/stderr back to the caller. */
function runExtract(region) {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, [SCRIPT, region], {
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => {
      const s = b.toString();
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr.on('data', (b) => {
      const s = b.toString();
      stderr += s;
      process.stderr.write(s);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && (req.url === '/healthz' || req.url === '/' || req.url === '')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Trigger extraction
  if (req.method === 'POST' && (req.url === '/run' || req.url?.startsWith('/run?'))) {
    if (!TOKEN) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Server misconfigured: PIPELINE_RUN_TOKEN not set');
      return;
    }
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized');
      return;
    }
    const region = new URL(req.url, 'http://x').searchParams.get('region') || 'eu';
    if (!['eu', 'us'].includes(region)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid region. Use eu or us.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(JSON.stringify({ started: true, region }));
    // Send response and start work in background
    setImmediate(async () => {
      try {
        const { code } = await runExtract(region);
        console.log(`[run-server] extraction ${region} exited with code ${code}`);
      } catch (err) {
        console.error('[run-server] extraction failed:', err);
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[run-server] listening on 0.0.0.0:${PORT}`);
  console.log(`[run-server] TOKEN configured: ${TOKEN ? 'yes' : 'no'}`);
  console.log(`[run-server] SCRIPT path: ${SCRIPT}`);
  console.log(`[run-server] TSX path: ${TSX}`);
  console.log(`[run-server] PID: ${process.pid}`);
});