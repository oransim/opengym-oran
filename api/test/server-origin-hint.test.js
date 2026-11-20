/* Self-hosting friction (Discord tcmac, 10-21): an api service whose ORIGIN is not the address in
   the browser. Over plain http to a LAN address there is no Sec-Fetch-Site, the Origin is compared
   with ORIGIN, and every write is refused. The log has to say which setting fixes it, and the 403
   carries a `code` the app turns into a sentence instead of a bare "cross-origin request refused".
   The same Origin is accepted when it matches the setting. Real server.js in a child. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://localhost:8080';

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-originhint-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: 'u1', name: 'Ana', created: new Date().toISOString() }],
    subs: [], invites: []
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost' }
  });
  const h = { api: '', log: '' };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  return h;
}
const post = (h, p, body, headers = {}) => fetch(h.api + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('a write from the LAN address names ORIGIN in the log and the answer', async t => {
  const h = await startServer(t);
  const r = await post(h, '/api/login/password', {}, { Origin: 'http://10.11.0.4:3030' });
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: 'cross-origin request refused', code: 'origin-mismatch', expected: ORIGIN });
  const line = h.log.split('\n').find(l => l.startsWith('refused cross-origin'));
  assert.match(line, /origin="http:\/\/10\.11\.0\.4:3030" expected=http:\/\/localhost:8080/);
  assert.match(line, /set ORIGIN=http:\/\/10\.11\.0\.4:3030 on the api service/);
});

test('a page on another site gets the same refusal, and the log does not advise changing ORIGIN', async t => {
  const h = await startServer(t);
  const r = await post(h, '/api/login/password', {}, { Origin: 'https://evil.test', 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, 'origin-mismatch');
  const line = h.log.split('\n').find(l => l.startsWith('refused cross-origin'));
  assert.doesNotMatch(line, /set ORIGIN/);
});

test('a matching Origin without Sec-Fetch-Site reaches the password handler', async t => {
  const h = await startServer(t);
  const r = await post(h, '/api/login/password', {}, { Origin: ORIGIN });
  assert.deepEqual({ status: r.status, body: await r.json() },
    { status: 400, body: { error: 'name and password required', code: 'missing' } });
  assert.doesNotMatch(h.log, /refused cross-origin/);
});
