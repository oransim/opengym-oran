# Open Gym Oran

A personal, self-hosted fitness tracker for workouts and gym or class visits. This repository is a fork of [openGym by Duarte Santos](https://github.com/DuarteSantos8/openGym), with a smaller focus on one person's training. The original openGym code is licensed under the [GNU AGPL v3](LICENSE); copyright and third-party media notices remain in [NOTICE.md](NOTICE.md).

## What this fork adds

- Create a gym or class visit, such as climbing, yoga, or Pilates, alongside exercise routines.
- Put visits on the weekly plan or schedule a specific date.
- Start a visit, see elapsed time, and finish it to save the duration in history.
- Start and end a fast, see its elapsed time, and review completed fasts in history.
- Keep exercises, custom photos, video URLs, routines, workouts, and history from openGym.

## Add routines and classes to the built-in library

Edit [`frontend/src/lib/routine-catalog.json`](frontend/src/lib/routine-catalog.json). Add a new object to `routines` with a unique, stable `id`, a `name`, an `emoji` glyph, and an `ex` array. A workout class or gym visit uses `"kind": "visit"` and typically has `"ex": []`. An exercise routine omits `kind`; each item in `ex` refers to an exercise ID from the exercise catalogue and includes its planned sets and reps or duration. If a routine needs a custom exercise, add it to the catalog's `customEx` array and reference its ID in `ex`.

The Routines screen links to the searchable library. Selecting an entry adds a new copy to the user's routines or classes, with fresh IDs and any referenced custom exercises. Changing a built-in entry later does not overwrite copies users have already added.

The phone experience is the web app: open your HTTPS address in a browser and add it to the home screen. No separate mobile app or app-store release is needed for this setup.

## Run locally

```bash
git clone https://github.com/oransim/opengym-oran.git
cd opengym-oran
cp .env.example .env
docker compose up -d --build
curl http://localhost:8080/api/health
```

Open <http://localhost:8080> and create your profile. `docker compose up --build` builds both containers from this repository. After GitHub Actions is enabled and the tests pass on `main`, the workflow publishes `ghcr.io/oransim/opengym-oran-api:edge` and `ghcr.io/oransim/opengym-oran-web:edge`.

The web app uses username and password, with email links for forgotten passwords. New passwords need at least 6 characters. Browser sessions last 90 days by default. Configure a separate SMTP sender. For an existing account without a password, use the setup command in the self-hosting guide. See [account setup and email recovery](docs/SELF_HOSTING.md#usernamepassword-login-and-email-recovery).

## Use it from your phone

Set `ORIGIN` in `.env` to the exact HTTPS address opened from your phone, put HTTPS in front of the web container, then restart the stack. This address is also used in password reset links.

The API stores accounts, routines, workouts, and uploads in `./data`. Back up that directory. For a single-user public instance, create your profile first, then consider `INVITE_ONLY=1` and `ALLOW_GUEST=0` in `.env`. See [self-hosting](docs/SELF_HOSTING.md) for setup and backup details.

## Deployment files

- [Docker Compose](docker-compose.yml) for a small server.
- [HTTPS on a private network](docs/SELF_HOSTING_HTTPS.md) if you do not want a public hostname.

The Compose file points to this fork's image names. Until images are published, use the Compose source build. Enabling GitHub Actions remains a separate repository setting.

## License and media

The code is [AGPL-3.0](LICENSE). The bundled exercise media has separate restrictions; keep the files and notices together and read [NOTICE.md](NOTICE.md) and [catalogue/media/NOTICE.md](catalogue/media/NOTICE.md) before distributing a modified build. This fork retains the original authors' attribution.
