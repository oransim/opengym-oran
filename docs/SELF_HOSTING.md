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

Open <http://localhost:8080>. Docker Compose builds from this source because the fork's registry images have not been published. `docker compose logs -f` shows logs; `docker compose down` stops the containers without deleting `./data`.

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

For a private network certificate, see [HTTPS on a private network](SELF_HOSTING_HTTPS.md). Kubernetes users can follow the [manifest guide](SELF_HOSTING_KUBERNETES.md) or [Helm guide](../helm/README.md).

## Single-user security

Create your profile before sharing the address. To restrict new registrations after that, set `INVITE_ONLY=1` in `.env`. `ALLOW_GUEST=0` removes guest mode from the sign-in page. Keep the API behind the web container and expose only the HTTPS entry point. The `.env` file may contain secrets and must not be committed.

## Backups and updates

Back up the entire `./data` directory, including the database, uploaded media, and session secret. Stop the stack or take a consistent filesystem snapshot before copying it. Restore the directory with the same permissions before restarting.

To update this fork, pull the desired commit, then run `docker compose up -d --build`. Check `curl http://localhost:8080/api/health` and sign in from your phone. GitHub Actions and its registry images are currently disabled for this fork.
