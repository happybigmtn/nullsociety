import http from 'node:http';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const port = Number(process.env.MOBILE_ERROR_PORT ?? 9079);
const logDir = process.env.MOBILE_ERROR_LOG_DIR ?? 'logs';
const logFile = join(logDir, 'mobile-errors.jsonl');

mkdirSync(logDir, { recursive: true });

const respond = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    respond(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && req.url?.startsWith('/errors')) {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        respond(res, 413, { error: 'payload too large' });
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const record = {
          receivedAt: new Date().toISOString(),
          ...payload,
        };
        appendFileSync(logFile, `${JSON.stringify(record)}\n`);
        console.log('[mobile-error]', record.type ?? 'unknown', record.message ?? '');
        respond(res, 200, { ok: true });
      } catch (err) {
        console.error('[mobile-error] invalid payload', err);
        respond(res, 400, { error: 'invalid json' });
      }
    });
    return;
  }

  respond(res, 404, { error: 'not found' });
});

server.listen(port, () => {
  console.log(`[mobile-error] listening on http://0.0.0.0:${port}`);
  console.log(`[mobile-error] logging to ${logFile}`);
});
