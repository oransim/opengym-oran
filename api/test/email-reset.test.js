import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailReset } from '../email-reset.js';
import { hashPassword, verifyPassword } from '../password.js';
import { smtpReceiver, tokenIn } from './smtp-receiver.mjs';

const GOOD = 'a sufficiently long new password';
async function fixture(t, extra = {}) {
  const smtp = await smtpReceiver(t);
  let clock = 1800000000000, saves = 0;
  const user = { id: 'u1', name: 'Oran', email: 'oran@example.com', sv: 2, pw: { h: 'old-hash' } };
  const users = [user];
  const service = createEmailReset({ env: smtp.env, users: () => users, save: () => saves++, now: () => clock,
    setPassword: (u, h) => { u.pw = { h }; u.sv++; delete u.emailReset; }, clearFailures: () => {}, ...extra });
  return { ...smtp, user, users, service, saves: () => saves, advance: ms => { clock += ms; } };
}
test('delivers a real reset link and stores only its hash without changing existing access', async t => {
  const f = await fixture(t);
  const result = await f.service.request(' ORAN@example.com ');
  assert.deepEqual(result, { ok: true }); assert.equal(f.mail.length, 1);
  const token = tokenIn(f.mail[0]); assert(token); assert.match(f.mail[0].envelope[1], /oran@example.com/);
  assert(!JSON.stringify(f.user).includes(token)); assert.equal(f.user.pw.h, 'old-hash'); assert.equal(f.user.sv, 2);
  assert.match(f.mail[0].message, /30 minutes/);
});
test('unknown email has the same response and sends no message', async t => {
  const f = await fixture(t); assert.deepEqual(await f.service.request('nobody@example.com'), { ok: true });
  assert.equal(f.mail.length, 0); assert.equal(f.saves(), 0);
});
test('redeems once, changes the password and ends old sessions', async t => {
  const f = await fixture(t); await f.service.request(f.user.email); const token = tokenIn(f.mail[0]);
  assert.deepEqual(await f.service.redeem(token, GOOD), { ok: true });
  assert(await verifyPassword(GOOD, f.user.pw.h)); assert.equal(f.user.sv, 3);
  await assert.rejects(f.service.redeem(token, GOOD), e => e.code === 'reset-invalid');
});
for (const change of ['expired', 'email', 'password', 'disabled', 'deleted']) test(`rejects a link after ${change}`, async t => {
  const f = await fixture(t); await f.service.request(f.user.email); const token = tokenIn(f.mail[0]);
  if (change === 'expired') f.advance(30 * 60000);
  if (change === 'email') f.user.email = 'different@example.com';
  if (change === 'password') f.user.sv++;
  if (change === 'disabled') f.user.disabled = true;
  if (change === 'deleted') f.users.length = 0;
  await assert.rejects(f.service.redeem(token, GOOD), e => e.code === 'reset-invalid');
});
test('a newer reset replaces the old link', async t => {
  const f = await fixture(t); await f.service.request(f.user.email); const old = tokenIn(f.mail[0]);
  await f.service.request(f.user.email); await assert.rejects(f.service.redeem(old, GOOD), e => e.code === 'reset-invalid');
  await f.service.redeem(tokenIn(f.mail[1]), GOOD);
});
test('concurrent redemption succeeds once', async t => {
  const f = await fixture(t); await f.service.request(f.user.email); const token = tokenIn(f.mail[0]);
  const results = await Promise.allSettled([f.service.redeem(token, GOOD), f.service.redeem(token, GOOD)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1); assert.equal(f.user.sv, 3);
});
test('failed delivery preserves a prior working link and reports mail unavailable', async t => {
  const f = await fixture(t); await f.service.request(f.user.email); const token = tokenIn(f.mail[0]);
  await new Promise(resolve => f.server.close(resolve));
  await assert.rejects(f.service.request(f.user.email), e => e.code === 'email-unavailable');
  await assert.rejects(f.service.request('unknown@example.com'), e => e.code === 'email-unavailable');
  await f.service.redeem(token, GOOD);
});
test('missing SMTP is a truthful availability error and does not modify accounts', async t => {
  const f = await fixture(t, { env: {} }); assert.equal(f.service.configured, false);
  await assert.rejects(f.service.request(f.user.email), e => e.code === 'email-unavailable'); assert.equal(f.saves(), 0);
});
test('limits email requests equally for known and unknown addresses', async t => {
  const f = await fixture(t);
  for (const email of [f.user.email, 'unknown@example.com']) {
    for (let i = 0; i < 3; i++) await f.service.request(email);
    await assert.rejects(f.service.request(email), e => e.code === 'locked');
  }
});
test('weak password does not consume a working reset link', async t => {
  const f = await fixture(t); await f.service.request(f.user.email); const token = tokenIn(f.mail[0]);
  await assert.rejects(f.service.redeem(token, 'short'), e => e.code === 'too-short');
  await f.service.redeem(token, GOOD);
});
test('bootstrap sends a password setup link while preserving profile identity and access', async t => {
  const f = await fixture(t); delete f.user.pw; delete f.user.email;
  assert.deepEqual(await f.service.setup(f.user, 'new@example.com'), { ok: true });
  assert.equal(f.user.id, 'u1'); assert.equal(f.user.email, 'new@example.com'); assert.equal(f.user.sv, 2);
  await f.service.redeem(tokenIn(f.mail[0]), GOOD); assert(await verifyPassword(GOOD, f.user.pw.h));
});
test('pending SMTP cannot recreate a reset after account security changes and restoration', async t => {
  const f = await fixture(t);
  let arrive, release;
  const arrived = new Promise(r => { arrive = r; }), gate = new Promise(r => { release = r; });
  f.control.beforeAccept = () => { arrive(); return gate; };
  const pending = f.service.request(f.user.email);
  await arrived; f.user.resetVersion = 1; release();
  await assert.rejects(pending, e => e.code === 'reset-invalid'); assert(!f.user.emailReset);
});
test('bootstrap rejects username and email identity collisions', async t => {
  const a = await fixture(t, { canSetPassword: () => false });
  await assert.rejects(a.service.setup(a.user, 'new@example.com'), e => e.code === 'name-taken'); assert.equal(a.mail.length, 0);
  const b = await fixture(t, { canUseEmail: () => false });
  await assert.rejects(b.service.setup(b.user, 'new@example.com'), e => e.code === 'email-taken'); assert.equal(b.mail.length, 0);
});
test('a username collision arising during password hashing cannot create a second password', async t => {
  let allowed = true;
  const f = await fixture(t, { canSetPassword: () => allowed }); await f.service.request(f.user.email);
  const pending = f.service.redeem(tokenIn(f.mail[0]), GOOD); allowed = false;
  await assert.rejects(pending, e => e.code === 'name-taken'); assert.equal(f.user.pw.h, 'old-hash');
});
