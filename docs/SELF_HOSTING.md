# Self-host Open Gym Oran

This fork runs as two containers: a web server and a small API. The API saves account data, routines, workout history, and uploaded media in `./data` on the host.

## Local setup

```bash
git clone https://github.com/oransim/opengym-oran.git
cd opengym-oran
cp .env.example .env
docker compose up -d --build
curl http://localhost:8080/api/health
```

Open <http://localhost:8080>. Docker Compose builds from this source because the fork's registry images have not been published. The web port binds to `127.0.0.1` by default. `docker compose logs -f` shows logs; `docker compose down` stops the containers without deleting `./data`.

## Username/password login and email recovery

The simple web flow uses username/password and **Forgot password? → email link → new password**. Set `PASSWORD_LOGIN=1` and, after existing-account setup, `SIMPLE_LOGIN=1`. The normal web screens omit passkeys, QR codes and other-device codes. Legacy credentials remain internally during migration; the native app retains its existing protocol.

Use a **separate sender account**. The sender and each profile’s recovery recipient are independent. Nothing connects your personal or Workspace mailbox automatically. Gmail supports `smtp.gmail.com` on port 465 with an [App Password](https://support.google.com/accounts/answer/185833) after enabling 2-Step Verification. Enter the sender credentials locally in the ignored `.env` file:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-separate-tracker-account@gmail.com
SMTP_PASSWORD=your-google-app-password
SMTP_FROM=your-separate-tracker-account@gmail.com
```

Do not paste sender credentials into chat or commit them. `SMTP_FROM` is a plain authorized email address. Port 465 uses implicit TLS; other remote SMTP ports require STARTTLS. Certificate verification stays enabled. Set `ORIGIN` to your real HTTPS app address before sending links; HTTP is accepted only for localhost development. Reset links use that trusted address and never the request’s Host header.

**Existing passkey-only account:** back up `data`, retain your current working login, and deploy the new backend and web build together with `SIMPLE_LOGIN=0` and the SMTP configuration first. This keeps the previous login choices available while enabling the new email-link page. Then, on the server, run:

```bash
docker compose exec api node setup-password.js "oran" your-recovery-address@example.com
```

This protected local command sends an ordinary setup email for the existing profile. It does not create a replacement account, choose your password, revoke current access, or alter training files. Open the email link and choose your password in the app. Confirm a username/password login in another browser before setting `SIMPLE_LOGIN=1`, restarting the API with the updated environment, and refreshing the app. Keep the previous image available for rollback. An unavailable sender is an error, not a completed migration.

Reset links work once for 30 minutes. Requesting one keeps your current password and sessions working; completing it signs out old sessions and returns to normal sign-in. New requests, password changes and recovery-email changes invalidate earlier links. Request responses do not identify matching accounts. Missing SMTP configuration or failed connection/authentication checks are shown as temporary unavailability. Once queued, the acknowledgement says only that an email was requested. A later message rejection is reported privately in the server log without recipient or token details, so it cannot reveal account existence. No reset tokens or SMTP credentials are returned in request responses or written to logs.

## Phone access and passkeys

Browsers accept passkeys over HTTPS, with `http://localhost` as the local exception. Pick a hostname before creating a passkey on your phone. Put a reverse proxy, tunnel, or Tailscale Serve in front of port 8080, then set these values in `.env`:

```dotenv
RP_ID=gym.example.com
ORIGIN=https://gym.example.com
RP_NAME=Open Gym Oran
```

`RP_ID` is only the hostname; `ORIGIN` includes `https://`. Both must match the address opened on the phone. Restart with `docker compose up -d --build` after changing them. A passkey made for one hostname cannot sign in on another.

A Caddy example for a server with a public DNS record:

```caddy
gym.example.com {
    reverse_proxy localhost:8080
}
```

When the reverse proxy runs on another host, set `WEB_PORT` to the private address it can reach (for example `192.168.1.10:8080`) and restrict that port with the host firewall. Do not expose plain HTTP publicly alongside the HTTPS proxy.

For a private network certificate, see [HTTPS on a private network](SELF_HOSTING_HTTPS.md).

## Single-user security

Create your profile before sharing the address. To restrict new registrations after that, set `INVITE_ONLY=1` in `.env`. `ALLOW_GUEST=0` removes guest mode from the sign-in page. Keep the API behind the web container and expose only the HTTPS entry point. The `.env` file may contain secrets and must not be committed.

## Backups and updates

Back up the entire `./data` directory, including the database, uploaded media, and session secret. Stop the stack or take a consistent filesystem snapshot before copying it. The default API now runs as UID 10001. A short-lived Compose helper changes ownership of `./data` to UID 10001 before the API starts, including on the first upgrade and after a restore. This changes host file ownership; use an account with access to that UID or `sudo` for host-side backups. The helper must finish successfully before the API starts. A standalone `docker run` deployment must grant UID 10001 ownership of its data mount before starting the image.

To update from source, pull the desired commit, then run `docker compose up -d --build`. Enable GitHub Actions and make `tests-ok` a required check for `main` in the repository ruleset. A successful test run on `main` publishes both `:edge` images and matching `:sha-<full-commit>` images to GitHub Container Registry. Both Compose services use `IMAGE_TAG` from `.env` (default `edge`); set it to one `sha-<full-commit>` value to pull a tested pair or roll back. Run `docker compose pull && docker compose up -d --no-build`, then check `curl http://localhost:8080/api/health` and sign in from your phone. The registry makes new images available; it does not update the running server automatically. Private packages require the server to log in to `ghcr.io` before pulling.
