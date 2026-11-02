# Open Gym Oran

A personal, self-hosted fitness tracker for workouts and gym or class visits. This repository is a fork of [openGym by Duarte Santos](https://github.com/DuarteSantos8/openGym), with a smaller focus on one person's training. The original openGym code is licensed under the [GNU AGPL v3](LICENSE); copyright and third-party media notices remain in [NOTICE.md](NOTICE.md).

## What this fork adds

- Create a gym or class visit, such as climbing, yoga, or Pilates, alongside exercise routines.
- Put visits on the weekly plan or schedule a specific date.
- Start a visit, see elapsed time, and finish it to save the duration in history.
- Start and end a fast, see its elapsed time, and review completed fasts in history.
- Keep exercises, custom photos, video URLs, routines, workouts, and history from openGym.

The phone experience is the web app: open your HTTPS address in a browser and add it to the home screen. No separate mobile app or app-store release is needed for this setup.

## Run locally

```bash
git clone https://github.com/oransim/opengym-oran.git
cd opengym-oran
cp .env.example .env
docker compose up -d --build
curl http://localhost:8080/api/health
```

Open <http://localhost:8080> and create your profile. `docker compose up --build` builds both containers from this repository. The two planned prebuilt images are `ghcr.io/oransim/opengym-oran-api:edge` and `ghcr.io/oransim/opengym-oran-web:edge`; GitHub Actions is currently disabled, so those images have not been published.

The sign-in screen accepts a profile name and password. If you already have a passkey profile, sign in with it once and add a password in **Settings → Account → Password**. Browser sessions use a persistent cookie and last 90 days by default, so reopening the app or a tab normally signs you in automatically. Signing out, clearing browser cookies, or using a private window ends that convenience.

## Use it from your phone

Passkeys need HTTPS and a stable hostname. Before registering from your phone, set `RP_ID` to that hostname and `ORIGIN` to its exact `https://` address in `.env`. Put HTTPS in front of the web container, then restart the stack. Changing the hostname later means registering new passkeys.

The API stores accounts, routines, workouts, and uploads in `./data`. Back up that directory. For a single-user public instance, create your profile first, then consider `INVITE_ONLY=1` and `ALLOW_GUEST=0` in `.env`. See [self-hosting](docs/SELF_HOSTING.md) for setup and backup details.

## Deployment files

- [Docker Compose](docker-compose.yml) for a small server.
- [Helm chart](helm/README.md) and [Kubernetes manifests](docs/SELF_HOSTING_KUBERNETES.md) for a cluster.
- [HTTPS on a private network](docs/SELF_HOSTING_HTTPS.md) if you do not want a public hostname.

The deployment files point to this fork's image names. Until images are published, use the Compose source build or build and load the images into your cluster yourself. Enabling GitHub Actions remains a separate choice.

## License and media

The code is [AGPL-3.0](LICENSE). The bundled exercise media has separate restrictions; keep the files and notices together and read [NOTICE.md](NOTICE.md) and [catalogue/media/NOTICE.md](catalogue/media/NOTICE.md) before distributing a modified build. This fork retains the original authors' attribution.
