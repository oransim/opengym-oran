#!/usr/bin/env node
// Server-owner-only migration: send the ordinary email link; never choose or expose a password.
import { askAdminSocket } from './admin-socket.js';
const [name, email] = process.argv.slice(2);
if (!name || !email) {
  console.error('Usage: node setup-password.js "profile name" recovery@example.com');
  process.exitCode = 2;
} else {
  try {
    const result = await askAdminSocket({ cmd: 'setup-password', name, email }, { timeoutMs: 60000 });
    if (!result.ok) { console.error(result.error || 'Could not send password setup email.'); process.exitCode = 1; }
    else console.log(`Password setup email sent for "${result.name}". Open the email link to choose your password. Your profile and training data are unchanged.`);
  } catch {
    console.error('Could not reach the running server. Run this command inside the API container.');
    process.exitCode = 1;
  }
}
