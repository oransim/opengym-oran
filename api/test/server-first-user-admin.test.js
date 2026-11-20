/* FIRST_USER_ADMIN (#328): the first password registration on an empty instance becomes
   its owner and admin. Existing profiles are never promoted. Off unless FIRST_USER_ADMIN=1. */
import { test, before } from 'node:test';
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
const ORIGIN = 'http://localhost:8080';
const mintSession = (uid, sv = 0) => {
  const payload = `${uid}:${Date.now() + 86400000}:${sv}`;
  return 'gymsid=' + payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};

const GOOD = 'correct horse battery staple';
let pwHash;
// Made before any test runs: withPassword() reads it while a test's arguments to startServer are
// still being built, so a test run on its own would otherwise give its user no hash at all.
before(async () => { pwHash ??= await hashPassword(GOOD); });

async function startServer(t, { env = {}, users = [] } = {}) {
  pwHash ??= await hashPassword(GOOD);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-fa-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users, subs: [], invites: [] }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost',
      TRUST_PROXY: '1', INVITE_ONLY: '', ADMIN_UIDS: '', AUDIT_LOG: '1', ...env
    }
  });
  const h = { api: '', log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.req = async (method, p, { body, cookie, ip = '198.51.100.1', headers = {} } = {}) => {
    const r = await fetch(`${h.api}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'X-Forwarded-For': ip, ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = r.headers.getSetCookie().find(c => c.startsWith('gymsid=') && !c.startsWith('gymsid=;'));
    return { status: r.status, body: await r.json(), headers: r.headers, cookie: setCookie ? setCookie.split(';')[0] : null };
  };
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  h.audit = () => { try { return fs.readFileSync(path.join(dataDir, 'audit.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l)); } catch { return []; } };
  return h;
}
const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });
const withPassword = (id, name) => user(id, name, { pw: { h: pwHash, set: new Date().toISOString() } });


const registerPassword = (h, name, ip) => h.req('POST', '/api/register/password', { body: { name, password: GOOD, email: `${name.toLowerCase()}@example.com` }, ip });
const stored = (h, id) => h.db().users.find(u => u.id === id);

test('the first password registration on an empty instance is the admin, the second is not', async t => {
  const h = await startServer(t, { env: { FIRST_USER_ADMIN: '1' } });
  const first = await registerPassword(h, 'Ana', '198.51.100.10');
  assert.equal(first.status, 200);
  assert.equal(first.body.user.admin, true);
  assert.equal(first.body.user.owner, true);
  assert.equal(stored(h, first.body.user.id).admin, true);
  assert.equal(stored(h, first.body.user.id).owner, true);
  assert.equal((await h.req('GET', '/api/admin/users', { cookie: first.cookie })).status, 200);
  assert.ok(h.audit().some(e => e.ev === 'admin.first-user' && e.uid === first.body.user.id));

  const second = await registerPassword(h, 'Bea', '198.51.100.11');
  assert.equal(second.status, 200);
  assert.equal(second.body.user.admin, false);
  assert.equal(second.body.user.owner, undefined);
  assert.equal('admin' in stored(h, second.body.user.id), false);
  assert.equal((await h.req('GET', '/api/admin/users', { cookie: second.cookie })).status, 403);
});

test('unset or FIRST_USER_ADMIN=0 leaves the first profile an ordinary one', async t => {
  for (const off of [undefined, '', '0', 'false', 'off']) {
    const h = await startServer(t, { env: { FIRST_USER_ADMIN: off } });
    const r = await registerPassword(h, 'Ana', '198.51.100.30');
    assert.equal(r.status, 200);
    assert.equal(r.body.user.admin, false, off);
    assert.equal('admin' in stored(h, r.body.user.id), false, off);
    const second = await registerPassword(h, 'Bea', '198.51.100.31');
    assert.equal(second.body.user.admin, false, off);
  }
});

test('an instance that already has profiles promotes nobody on upgrade or on a new registration', async t => {
  const h = await startServer(t, { env: { FIRST_USER_ADMIN: '1' }, users: [user('u1', 'Old'), user('u2', 'Older')] });
  assert.equal(stored(h, 'u1').admin, undefined);
  const r = await registerPassword(h, 'New', '198.51.100.40');
  assert.equal(r.status, 200);
  assert.equal(r.body.user.admin, false);
  const second = await registerPassword(h, 'Newer', '198.51.100.41');
  assert.equal(second.body.user.admin, false);
  assert.equal(h.db().users.filter(u => u.admin === true).length, 0);
});

test('an ADMIN_UIDS admin stays an admin, and does not make the next profile one', async t => {
  const h = await startServer(t, { env: { ADMIN_UIDS: 'u1', FIRST_USER_ADMIN: '1' }, users: [user('u1', 'Owner')] });
  assert.equal((await h.req('GET', '/api/admin/users', { cookie: mintSession('u1') })).status, 200);
  const r = await registerPassword(h, 'Guest', '198.51.100.50');
  assert.equal(r.body.user.admin, false);
});
