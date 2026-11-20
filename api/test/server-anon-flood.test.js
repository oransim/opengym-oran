/* Anonymous pairing failures are audit capped, password sign-in is throttled, and a
   signed-in session keeps at most one live pairing code. Real server.js in a child. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { hashPassword } from '../password.js';

const PASSWORD = 'correct horse battery staple';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');

function mintSession(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
const cookie = { Cookie: `gymsid=${mintSession('u_test_1')}` };

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-flood-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: 'u_test_1', name: 'One', created: new Date().toISOString(), pw: { h: await hashPassword(PASSWORD) } }], subs: [], invites: []
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', AUDIT_LOG: '1' }
  });
  const h = { api: '', dataDir, log: '' };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.port = await boundPort(child, () => h.log);
  h.api = `http://127.0.0.1:${h.port}`;
  h.post = (p, body, headers = {}) => fetch(`${h.api}${p}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {})
  });
  h.audit = () => {
    let text = '';
    try { text = fs.readFileSync(path.join(dataDir, 'audit.log'), 'utf8'); } catch { /* none yet */ }
    return text.split('\n').filter(Boolean).map(l => JSON.parse(l));
  };
  return h;
}

test('wrong pairing codes are all answered, but only a few of them reach the audit log', async t => {
  const h = await startServer(t);
  // Not paused: behind a proxy every visitor shares an address, and a 40-bit code that lives five
  // minutes is not worth guessing (see the sign-in throttle in server.js).
  for (let i = 0; i < 30; i++) assert.equal((await h.post('/api/pair/redeem', { code: 'WRONG' + i })).status, 400);
  assert.equal(h.audit().filter(r => r.ev === 'auth.pair.fail').length, 10, 'ten a minute per address, not thirty');
});

test('password sign-in failures are throttled without flooding the audit log', async t => {
  const h = await startServer(t);
  const statuses = [];
  for (let i = 0; i < 25; i++) {
    statuses.push((await h.post('/api/login/password', { name: 'One', password: 'wrong password' })).status);
  }
  assert.ok(statuses.includes(401), 'initial attempts reach password verification');
  assert.ok(statuses.includes(429), 'repeated attempts are paused');
  const failures = h.audit().filter(r => r.ev === 'auth.password.fail');
  assert.ok(failures.length > 0 && failures.length <= 10, 'failures are recorded without filling the log');
});

test('minting a pairing code retires the profile\'s previous one', async t => {
  const h = await startServer(t);
  // Each code asks the owner to confirm the current password.
  const mint = async () => {
    const r = await h.post('/api/pair/create', { current: PASSWORD }, { ...cookie, Origin: 'http://localhost:8080' });
    assert.equal(r.status, 200);
    return (await r.json()).code;
  };
  const first = await mint();
  const second = await mint();
  assert.notEqual(first, second);
  assert.equal((await h.post('/api/pair/redeem', { code: first })).status, 400, 'the older code is gone');
  assert.equal((await h.post('/api/pair/redeem', { code: second })).status, 200, 'the newest one works');
});
