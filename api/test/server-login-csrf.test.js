/* Password sign-in can set a browser session, so cross-origin forms and misleading
   Content-Types must be rejected before the password route reads their bodies. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../password.js';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const ORIGIN = 'https://gym.test';
const PASSWORD = 'correct horse battery staple';
function mintSession(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-logincsrf-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: 'u_victim', name: 'Victim', created: new Date().toISOString() },
      { id: 'u_attacker', name: 'Attacker', created: new Date().toISOString(), pw: { h: await hashPassword(PASSWORD) } }
    ], subs: [], invites: []
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN }
  });
  const h = { api: '', log: '' };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  return h;
}
const login = { name: 'Attacker', password: PASSWORD };
const textPlainForm = obj => JSON.stringify({ ...obj, pad: '' }).slice(0, -2) + '=' + '"}' + '\r\n';
const sessionUid = r => /__Host-gymsid=([^.;]+)/.exec(r.headers.get('set-cookie') || '')?.[1]?.split(':')[0] || null;

test('a cross-site form cannot sign the victim into the attacker account', async t => {
  const h = await startServer(t);
  const r = await fetch(`${h.api}/api/login/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.test', 'Sec-Fetch-Site': 'cross-site' },
    body: textPlainForm(login)
  });
  assert.equal(r.status, 403);
  assert.equal(sessionUid(r), null);
  assert.deepEqual(await r.json(), { error: 'cross-origin request refused', code: 'origin-mismatch', expected: ORIGIN });
});

test('all password credential routes require the browser origin, even with a Bearer', async t => {
  const h = await startServer(t);
  const cross = { 'Content-Type': 'application/json', Origin: 'https://evil.test', 'Sec-Fetch-Site': 'cross-site' };
  const routes = ['/api/login/password', '/api/register/password', '/api/login/password-reset', '/api/login/forgot-password', '/api/login/reset-password'];
  for (const p of routes) {
    const r = await fetch(`${h.api}${p}`, { method: 'POST', headers: cross, body: JSON.stringify(login) });
    assert.equal(r.status, 403, p);
    assert.equal(sessionUid(r), null, p);
  }
  const bearer = { ...cross, Authorization: `Bearer ${mintSession('u_attacker')}` };
  for (const p of routes) {
    const r = await fetch(`${h.api}${p}`, { method: 'POST', headers: bearer, body: JSON.stringify(login) });
    assert.equal(r.status, 403, p);
    assert.equal(sessionUid(r), null, p);
  }
  const sibling = await fetch(`${h.api}/api/login/password`, { method: 'POST', headers: { ...cross, Origin: 'https://other.test', 'Sec-Fetch-Site': 'same-site' }, body: JSON.stringify(login) });
  assert.equal(sibling.status, 403);
  const olderBrowser = await fetch(`${h.api}/api/login/password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.test' }, body: JSON.stringify(login) });
  assert.equal(olderBrowser.status, 403);
  const activity = await fetch(`${h.api}/api/activity`, { method: 'POST', headers: bearer, body: JSON.stringify({ active: false }) });
  assert.equal(activity.status, 200, 'Bearer remains valid when it authenticates the action');
});

test('a body not declared as JSON is refused before password sign-in reads it', async t => {
  const h = await startServer(t);
  for (const type of ['text/plain', 'text/plain;charset=UTF-8', 'text/plain; application/json', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', null]) {
    const r = await fetch(`${h.api}/api/login/password`, {
      method: 'POST', headers: type ? { 'Content-Type': type } : {}, body: Buffer.from(textPlainForm(login))
    });
    assert.equal(r.status, 415, String(type));
    assert.deepEqual(await r.json(), { error: 'content-type must be application/json' });
    assert.equal(sessionUid(r), null, String(type));
  }
  const pair = await fetch(`${h.api}/api/pair/redeem`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.test', 'Sec-Fetch-Site': 'cross-site' },
    body: '{"code":"ABCDEFGH","x":"="}'
  });
  assert.equal(pair.status, 415);
});

test('same-origin password sign-in accepts a JSON charset and body-less writes', async t => {
  const h = await startServer(t);
  const same = { 'Content-Type': 'application/json; charset=utf-8', Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' };
  const r = await fetch(`${h.api}/api/login/password`, { method: 'POST', headers: same, body: JSON.stringify(login) });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  assert.equal(sessionUid(r), 'u_attacker');
  const olderBrowser = await fetch(`${h.api}/api/login/password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(login) });
  assert.equal(olderBrowser.status, 200);
  const victim = { Cookie: `__Host-gymsid=${mintSession('u_victim')}`, 'Sec-Fetch-Site': 'same-origin' };
  assert.equal((await fetch(`${h.api}/api/push/rest-timer/cancel`, { method: 'POST', headers: victim })).status, 200);
  assert.equal((await fetch(`${h.api}/api/logout`, { method: 'POST', headers: victim })).status, 200);
});
