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

The web app uses username and password for sign-in and account creation. **Forgot password?** sends an email link to choose a new password. A profile’s recovery email is required when creating an account.

Use a **separate sender account**. The sender and each profile’s recovery recipient are independent. Nothing connects your personal or Workspace mailbox automatically. Gmail supports `smtp.gmail.com` on port 465 with an [App Password](https://support.google.com/accounts/answer/185833) after enabling 2-Step Verification. Enter the sender credentials locally in the ignored `.env` file:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-separate-tracker-account@gmail.com
SMTP_PASSWORD=your-google-app-password
SMTP_FROM=your-separate-tracker-account@gmail.com
```

Do not paste sender credentials into chat or commit them. `SMTP_FROM` is a plain authorized email address. Port 465 uses implicit TLS; other remote SMTP ports require STARTTLS. Certificate verification stays enabled. Set `ORIGIN` to your real HTTPS app address before sending links; HTTP is accepted only for localhost development. Reset links use that trusted address and never the request’s Host header.

**Existing account without a password:** back up `data`, then deploy the new backend and web build together with SMTP configured. Run the protected local setup command:

```bash
docker compose exec api node setup-password.js "your-username" your-recovery-address@example.com
```

The command sends a setup link to the existing profile. Open it and choose a password before signing out of the current session. It does not create a replacement account or change training files. Confirm you can sign in with the new password in another browser.

Reset links work once for 30 minutes. Requesting one keeps your current password and sessions working; completing it signs out old sessions and returns to normal sign-in. New requests, password changes and recovery-email changes invalidate earlier links. Request responses do not identify matching accounts. Missing SMTP configuration or failed connection/authentication checks are shown as temporary unavailability. Once queued, the acknowledgement says only that an email was requested. A later message rejection is reported privately in the server log without recipient or token details, so it cannot reveal account existence. No reset tokens or SMTP credentials are returned in request responses or written to logs.

## Bundled routine and class library

The Routines screen includes routine and class libraries packaged with the web app in `frontend/src/lib/routine-catalog.json`. They do not depend on any account remaining on the server. The initial class templates are yoga, Pilates, tricking, climbing, and functional. To add or update templates later, choose **Export plan file** in the app while using kilograms, then run `node scripts/publish-routine-catalog.mjs path/to/exported-plan.json` at the repository root. The script merges routines and classes by name, keeps existing templates that are absent from the export, and includes referenced custom exercises. Review and commit the catalog file, then rebuild the web image. A plan export contains no workouts or weigh-ins.

## Phone access

For a phone browser, put a reverse proxy, tunnel, or Tailscale Serve in front of port 8080 and set the app address in `.env`:

```dotenv
ORIGIN=https://gym.example.com
```

The recovery email link uses `ORIGIN`, so set it to the exact HTTPS address people open. Restart with `docker compose up -d --build` after changing it.

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
