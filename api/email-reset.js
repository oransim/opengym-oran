import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { hashPassword, normalizeEmail, passwordProblem, MIN_LENGTH } from './password.js';
import { createWindow } from './rate-limit.js';

const TTL = 30 * 60000;
const digest = token => crypto.createHash('sha256').update('opengym-email-reset:' + token).digest('hex');
const failure = (code, status, message, extra = {}) => Object.assign(new Error(message), { code, status, ...extra });
const unavailable = () => failure('email-unavailable', 503, 'Password reset email is unavailable. Please try again later or contact the app owner.');
const invalid = () => failure('reset-invalid', 400, 'This password reset link has expired or has already been used. Request a new link.');

/** Owns email delivery and token lifecycle. Callers own durable account storage and sessions. */
export function createEmailReset({ env = process.env, users, save, setPassword, clearFailures = () => {}, now = Date.now,
  canSetPassword = () => true, canUseEmail,
  onDeliveryFailure = () => console.error('Password reset email delivery failed. Check the sender configuration.') }) {
  const host = env.SMTP_HOST?.trim(), from = normalizeEmail(env.SMTP_FROM || env.SMTP_USER || '');
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  let origin;
  try {
    origin = new URL(env.ORIGIN || 'http://localhost:8080');
    if (origin.username || origin.password || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) origin = null;
  } catch { origin = null; }
  const configured = !!(host && from && origin && (local || (env.SMTP_USER && env.SMTP_PASSWORD)));
  const port = Number(env.SMTP_PORT || 465);
  const transport = configured ? nodemailer.createTransport({
    host, port, secure: port === 465, requireTLS: !local && port !== 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  }) : null;
  const limit = createWindow({ max: 3, windowMs: 15 * 60000, now });
  let sequence = 0;
  const live = user => users().includes(user) && !user.disabled;
  const emailFree = (user, email) => canUseEmail ? canUseEmail(user, email) : !users().some(u => u !== user && u.email === email);
  const nameConflict = () => failure('name-taken', 409, 'Another profile already signs in with this username.');
  const validRecord = user => live(user) && user.emailReset?.exp > now()
    && user.emailReset.email === user.email && user.emailReset.sv === (user.sv || 0)
    && user.emailReset.version === (user.resetVersion || 0);
  async function deliver(user, email, setup = false) {
    const pw = user.pw, sv = user.sv || 0, oldEmail = user.email;
    const version = user.resetVersion || 0;
    if (!canSetPassword(user)) throw nameConflict();
    const token = crypto.randomBytes(32).toString('base64url');
    const issued = sequence = Math.max(now(), sequence + 1, (user.emailReset?.issued || 0) + 1);
    const record = { h: digest(token), exp: now() + TTL, email, sv, issued, version };
    const link = new URL(origin); link.hash = '/reset-password?token=' + token;
    try {
      const result = await transport.sendMail({ from, to: email, subject: setup ? 'Set your Open Gym Oran password' : 'Reset your Open Gym Oran password',
        text: `${setup ? 'Set' : 'Reset'} your password using this link:\n\n${link.href}\n\nThis link works once and expires in 30 minutes. If you did not request this, you can ignore this email. Your current access has not changed.` });
      if (!result.accepted?.length) throw unavailable();
    } catch { throw unavailable(); }
    // SMTP is awaited: do not save a link for an account that changed while sending.
    if (!live(user) || user.pw !== pw || (user.sv || 0) !== sv || user.email !== oldEmail || (user.resetVersion || 0) !== version) throw invalid();
    if (!canSetPassword(user)) throw nameConflict();
    if (setup && !emailFree(user, email)) throw failure('email-taken', 409, 'Another profile already uses this email.');
    if ((user.emailReset?.issued || 0) > issued) return;
    if (setup && user.email !== email) { user.email = email; user.resetVersion = version + 1; record.version = user.resetVersion; }
    user.emailReset = record;
    save();
  }
  return {
    configured,
    async request(rawEmail, { background = false } = {}) {
      if (!configured) throw unavailable();
      const email = normalizeEmail(rawEmail);
      if (!email) throw failure('email-invalid', 400, 'Enter a valid email address.');
      const retryAfter = limit.take(email);
      if (retryAfter) throw failure('locked', 429, 'Too many requests. Please try again later.', { retryAfter });
      // Check delivery availability for unknown addresses too, without sending them email.
      try { await transport.verify(); } catch { throw unavailable(); }
      const user = users().find(u => u.email === email && !u.disabled);
      if (user && canSetPassword(user)) {
        if (background) void deliver(user, email).catch(() => onDeliveryFailure());
        else await deliver(user, email);
      }
      return { ok: true };
    },
    async redeem(token, password) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
      const h = digest(token);
      const find = () => users().find(u => validRecord(u) && u.emailReset.h === h);
      const user = find(); if (!user) throw invalid();
      if (!canSetPassword(user)) throw nameConflict();
      const record = user.emailReset;
      const problem = passwordProblem(password);
      if (problem) throw failure(problem, 400, problem === 'too-short' ? `Use at least ${MIN_LENGTH} characters.` : 'Choose a stronger password.');
      const hashed = await hashPassword(password);
      if (find() !== user || user.emailReset !== record) throw invalid();
      if (!canSetPassword(user)) throw nameConflict();
      setPassword(user, hashed); delete user.emailReset;
      clearFailures(user); save();
      return { ok: true };
    },
    async setup(user, rawEmail) {
      if (!configured) throw unavailable();
      const email = normalizeEmail(rawEmail);
      if (!email) throw failure('email-invalid', 400, 'Enter a valid recovery email.');
      if (!live(user)) throw invalid();
      if (!canSetPassword(user)) throw nameConflict();
      if (!emailFree(user, email)) throw failure('email-taken', 409, 'Another profile already uses this email.');
      await deliver(user, email, true);
      return { ok: true };
    },
  };
}
