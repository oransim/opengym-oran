import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('password-only login registers accounts and exposes no retired auth routes', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-password-only-'));
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [], subs: [], invites: [] }));
  const child = spawn(process.execPath, ['server.js'], { cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dir, ORIGIN: 'http://localhost:8080' } });
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dir, { recursive: true, force: true }); });
  let log = ''; child.stdout.on('data', d => { log += d }); child.stderr.on('data', d => { log += d });
  const base = `http://127.0.0.1:${await boundPort(child, () => log)}`;
  for (const route of ['/api/register/options', '/api/register/verify', '/api/login/options', '/api/login/verify',
    '/api/device-link/options', '/api/device-link/verify', '/api/account/passkeys/options', '/api/account/passkeys/verify']) {
    const response = await fetch(base + route, { method: 'POST', headers: { origin: 'http://localhost:8080', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 404, route);
  }
  assert.equal((await fetch(base + '/api/account/passkeys')).status, 404);
  assert.equal((await fetch(base + '/api/account/passkeys', { method: 'DELETE', headers: { origin: 'http://localhost:8080', 'content-type': 'application/json' }, body: '{}' })).status, 404);
  const config = await (await fetch(base + '/api/config')).json();
  assert.equal(config.password_login, true);
  assert.equal(config.simple_login, true);
  const register = await fetch(base + '/api/register/password', { method: 'POST', headers: { origin: 'http://localhost:8080', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ada', password: 'correct horse battery staple', email: 'ada@example.com' }) });
  assert.equal(register.status, 200);
  assert.equal((await register.json()).user.name, 'Ada');
  const login = await fetch(base + '/api/login/password', { method: 'POST', headers: { origin: 'http://localhost:8080', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ada', password: 'correct horse battery staple' }) });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.name, 'Ada');
});
