import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { smtpReceiver, tokenIn, waitFor } from './smtp-receiver.mjs';
import { hashPassword } from '../password.js';
import { askAdminSocket } from '../admin-socket.js';

const GOOD = 'correct horse battery staple';
async function start(t, { mail = true, extraUsers = [] } = {}) {
  const smtp = await smtpReceiver(t), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-email-reset-'));
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(dir, 'secret'), secret, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: 'u1', name: 'oran', email: 'oran@example.com', admin: true, owner: true, pw: { h: await hashPassword(GOOD) } }, ...extraUsers], creds: [], invites: [], subs: [] }));
  const child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, ...smtp.env, ...(mail ? {} : { SMTP_HOST: '' }), DATA_DIR: dir, PORT: '0', PASSWORD_LOGIN: '1', SIMPLE_LOGIN: '1', RP_ID: 'localhost' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', b => log += b); child.stderr.on('data', b => log += b);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + await boundPort(child, () => log);
  const request = async (p, body, headers = {}) => {
    const r = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Origin: smtp.env.ORIGIN, ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie') };
  };
  return { ...smtp, dir, request, db: () => JSON.parse(fs.readFileSync(path.join(dir, 'db.json'))), log: () => log };
}
test('config advertises simple login and actual reset availability', async t => {
  const f = await start(t); const r = await f.request('/api/config');
  assert.equal(r.body.simple_login, true); assert.equal(r.body.email_reset, true);
});
test('simple account registration requires a recovery email', async t => {
  const f = await start(t);
  const r = await f.request('/api/register/password', { name: 'new profile', password: GOOD });
  assert.equal(r.status, 400); assert.equal(r.body.code, 'email-invalid'); assert.equal(f.db().users.length, 1);
});
test('email reset round trip ends previous sessions, requires normal sign-in and leaves training data intact', async t => {
  const f = await start(t), state = { routines: [{ id: 'r1', name: 'Tricking power' }], workouts: [{ id: 'w1' }] };
  fs.writeFileSync(path.join(f.dir, 'state-u1.json'), JSON.stringify(state));
  const login = await f.request('/api/login/password', { name: 'oran', password: GOOD }); assert.equal(login.status, 200);
  const request = await f.request('/api/login/forgot-password', { email: 'oran@example.com' });
  assert.equal(request.status, 200); assert.deepEqual(request.body, { ok: true });
  await waitFor(() => f.db().users[0].emailReset);
  const token = tokenIn(f.mail[0]); assert(token); assert(!JSON.stringify(f.db()).includes(token)); assert(!f.log().includes(token));
  const oldCookie = login.cookie.split(';')[0];
  assert.equal((await f.request('/api/data', null, { Cookie: oldCookie })).status, 200);
  const reset = await f.request('/api/login/reset-password', { token, password: 'new sufficiently long password' });
  assert.equal(reset.status, 200); assert.equal(reset.cookie, null); assert.deepEqual(reset.body, { ok: true });
  assert.equal((await f.request('/api/data', null, { Cookie: oldCookie })).status, 401);
  assert.equal((await f.request('/api/login/reset-password', { token, password: GOOD })).status, 400);
  assert.equal((await f.request('/api/login/password', { name: 'oran', password: 'new sufficiently long password' })).status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir, 'state-u1.json'))), state);
});
test('SMTP message rejection cannot reveal whether a recovery email exists', async t => {
  const f = await start(t); f.control.rejectMessages = true;
  const known = await f.request('/api/login/forgot-password', { email: 'oran@example.com' });
  const unknown = await f.request('/api/login/forgot-password', { email: 'unknown@example.com' });
  assert.equal(known.status, 200); assert.deepEqual(known.body, unknown.body); assert.equal(known.status, unknown.status);
  await waitFor(() => f.log().includes('Password reset email delivery failed'));
});
test('disabling and re-enabling a profile permanently invalidates an earlier link', async t => {
  const f = await start(t, { extraUsers: [{ id: 'u2', name: 'second', email: 'second@example.com' }] });
  const login = await f.request('/api/login/password', { name: 'oran', password: GOOD });
  await f.request('/api/login/forgot-password', { email: 'second@example.com' });
  await waitFor(() => f.db().users.find(u => u.id === 'u2').emailReset);
  const token = tokenIn(f.mail[0]); assert(token);
  for (const disabled of [true, false]) assert.equal((await f.request('/api/admin/user/disable', { id: 'u2', disabled }, { Cookie: login.cookie.split(';')[0] })).status, 200);
  assert.equal((await f.request('/api/login/reset-password', { token, password: GOOD })).status, 400);
});
test('an email change and change-back invalidates SMTP work already in progress', async t => {
  const f = await start(t);
  let arrive, release; const arrived = new Promise(r => { arrive = r; }), gate = new Promise(r => { release = r; });
  f.control.beforeAccept = () => { arrive(); return gate; };
  const login = await f.request('/api/login/password', { name: 'oran', password: GOOD });
  await f.request('/api/login/forgot-password', { email: 'oran@example.com' }); await arrived;
  for (const email of ['new@example.com', 'oran@example.com']) assert.equal((await f.request('/api/account/email', { email, current: GOOD }, { Cookie: login.cookie.split(';')[0] })).status, 200);
  release(); await waitFor(() => f.log().includes('Password reset email delivery failed'));
  assert(!f.db().users[0].emailReset);
});
test('reset routes enforce same-origin requests even with a bearer credential', async t => {
  const f = await start(t);
  for (const p of ['/api/login/forgot-password', '/api/login/reset-password']) assert.equal((await f.request(p, { email: 'oran@example.com', token: 'x', password: GOOD }, { Origin: 'https://other.example' })).status, 403);
  assert.equal(f.mail.length, 0);
});
test('missing email configuration is reported without changing an account', async t => {
  const f = await start(t, { mail: false }); const before = f.db();
  assert.equal((await f.request('/api/config')).body.email_reset, false);
  const r = await f.request('/api/login/forgot-password', { email: 'oran@example.com' });
  assert.equal(r.status, 503); assert.equal(r.body.code, 'email-unavailable'); assert.deepEqual(f.db(), before);
});
test('protected local setup sends a standard link for the existing profile', async t => {
  const f = await start(t);
  const r = await askAdminSocket({ cmd: 'setup-password', name: 'oran', email: 'separate@example.com' }, { env: { DATA_DIR: f.dir } });
  assert.equal(r.ok, true); assert(!r.token); assert(!r.code);
  assert.equal(f.db().users[0].id, 'u1'); assert.equal(f.db().users[0].email, 'separate@example.com');
  assert(tokenIn(f.mail[0]));
});
test('bootstrap preserves legacy username and email-alias uniqueness rules', async t => {
  for (const [name, email, expected] of [['ORAN', 'new@example.com', /username/], ['recovery@example.com', 'recovery@example.com', /email/]]) {
    const f = await start(t, { extraUsers: [{ id: 'other', name, pw: { h: 'legacy-password-hash' } }] });
    const r = await askAdminSocket({ cmd: 'setup-password', id: 'u1', email }, { env: { DATA_DIR: f.dir } });
    assert.match(r.error, expected); assert.equal(f.mail.length, 0); assert.equal(f.db().users[0].email, 'oran@example.com');
  }
});
