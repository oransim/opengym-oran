# Simple username/password login and email recovery

## User request

Replace the confusing passkey, QR, pairing, and other-device code experience with username/password sign-in and a familiar email Reset password flow. Keep all existing accounts, routines, workouts, and other profile data. The owner does not want their personal Gmail or Workspace account used as the app's email sender; they can create a separate Gmail account.

## Proposed experience

- The login screen has Username, Password, Sign in, Forgot password?, and Create account. No passkey, QR, pairing, other-device, or administrator-code choices appear in the normal web login/account flows.
- Creating an account asks for username, recovery email, password, and confirmation. Existing invite-only configuration, when enabled, continues to protect registration.
- Recovery emails remain unique across profiles, using the existing normalized-email uniqueness rules. An email-only recovery request therefore identifies at most one profile.
- Forgot password? asks for the recovery email. Submit shows the same neutral acknowledgement whether or not an account matches. The person receives a clickable email link, chooses and confirms a new password, then signs in normally. There are no codes to copy between devices.
- Settings exposes password change, recovery email, and sign-out controls. Password and recovery-email changes require the current password. Do not expose a password-removal option.
- Keep persistent sign-in, password hashing, CSRF defenses, login throttling, and existing account isolation. Simplifying the interface must not weaken these protections or change password policy without a separate request.

## Email and reset implementation choices

Use SMTP with a separate sender account, configured only on the server. Gmail SMTP is supported; no personal mailbox is connected automatically. Sender credentials must never enter browser bundles, logs, version control, or this design document. The actual sender address and credentials are still to be supplied by the owner through local configuration; recipient recovery email belongs to each profile and is independent of the sender.

Use a cryptographically random token with at least 256 bits of entropy, stored only as a hash. Links expire after 30 minutes, work once, and are invalidated by a newer reset, password change, email change, or account disable. Requesting a reset does not change the current password or sign anyone out. Successful reset invalidates existing sessions and returns the person to ordinary sign-in. Apply bounded per-address and per-account request limits; bound token-verification attempts. Never build links from untrusted request Host headers. Do not expose tokens to third-party assets or referrers.

If sending email is not configured or SMTP availability checks fail, show a truthful, actionable availability error without revealing whether an account exists. Once a request is queued, acknowledge only that it was requested, never that mail was delivered. Later SMTP message rejection is reported privately to the operator with no recipient/token details; changing the public response for that case would disclose account existence. Test SMTP delivery with a local mail receiver before connecting a real account; live delivery remains unverified until sender configuration exists.

## Existing-account migration and rollout

The existing owner profile `oran` currently has a passkey and no password or recovery email. Do not disable its working access or deploy a password-only login until it can use the replacement. Prepare a server-owner-only bootstrap through the existing protected local admin socket that associates the owner's chosen recovery email and sends the standard password-setup link. Do not accept an unauthenticated browser session as proof for setting a first password, invent a password, or ask the owner to paste one into chat. The owner chooses the password in the app. Retain legacy credentials internally during migration; remove their normal UI entry points. No training state migration or account recreation is required.

Implementation can be prepared and tested without a real mailbox. Connecting the sender and migrating the owner's account precede replacing the running app. Preserve a rollback path to the existing working version and back up account/profile data before rollout. Native-mobile pairing is outside this web-app change; do not change a separate native app's authentication protocol incidentally.

## Acceptance checks

1. Login and account screens present username/password and email recovery without passkey, QR, or other-device choices.
2. New account, existing-password sign-in, wrong-password errors, and persistent sessions work.
3. A real local SMTP receiver receives the correct profile's reset link; no token is returned by the request API or stored in plaintext.
4. Expired, reused, superseded, malformed, wrong-account, disabled-account, and concurrently redeemed tokens fail safely.
5. SMTP failure, missing configuration, unknown email, and request flooding behave as specified.
6. Password and recovery-email changes invalidate outstanding links appropriately. Account migration preserves the same profile ID and all training data.
7. Focused authentication tests, relevant existing tests, frontend build, and visual inspection of the new screens run before completion. Report any unrelated baseline failures explicitly.

## Open owner inputs

- Confirm this complete experience before production implementation.
- Separate SMTP sender address and locally configured credentials.
- The recovery recipient address for `oran`; do not infer that it should be the same as the sender.

The implementation mechanism, module boundaries, and exact UI layout are delegated to the builder. These must follow the existing Node/React application rather than replace the app's stack.
