# CertMonitor

Modern open-source SSL/TLS certificate monitoring platform.

CertMonitor uses FastAPI, React, PostgreSQL, Docker Compose, and a scheduler to monitor certificates and deliver Telegram alerts.

## Features

- SSL/TLS certificate monitoring
- Telegram notifications
- Web dashboard
- FastAPI backend
- React frontend
- PostgreSQL database
- Docker Compose deployment
- Automated backend tests and frontend build checks through GitHub Actions

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/im-naveenkumar-m/certmonitor.git
cd certmonitor
```

### 2. Configure environment files

Create local configuration files from the examples:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

These commands create the files only for a new installation. If either file already exists, **do not overwrite it**; review the existing configuration instead.

Generate a strong PostgreSQL password and application secret:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Copy the first generated value into `POSTGRES_PASSWORD` in `.env` and the matching password field in `DATABASE_URL` in `backend/.env`. Copy the second value into `SECRET_KEY` in `backend/.env`.

Keep these values private. Do not commit the real `.env` files or share their contents.

Confirm that the database settings match:

- `POSTGRES_DB` matches the database name in `DATABASE_URL`.
- `POSTGRES_USER` matches the username in `DATABASE_URL`.
- `POSTGRES_PASSWORD` matches the password in `DATABASE_URL`.
- `DATABASE_URL` uses the Compose database hostname `db` and port `5432`.

Keep `DEBUG=false`. Telegram notifications are optional; configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` if you want to use them.

### 3. Frontend development (optional)

For production deployment, Docker builds the React frontend automatically using the multi-stage `frontend/Dockerfile` and serves the production files with Nginx. You do not need to install Node.js or npm on the host machine.

If you want to develop or test the frontend locally, install Node.js and npm, then run:

```bash
cd frontend
npm ci
npm run lint
npm run build
cd ..
```

### 4. Build and start Docker services

```bash
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
```

Wait for PostgreSQL and the backend to become healthy. Check the status and logs if any service fails:

```bash
docker compose logs --tail=100 db
docker compose logs --tail=100 backend
docker compose logs --tail=100 scheduler
docker compose logs --tail=100 nginx
```

### 5. Create the initial administrator

**Run this step only for a fresh database with no existing users.**

```bash
docker compose exec backend python create_admin.py
```

Enter the desired administrator username and email. The script prompts for a password without displaying it and asks for confirmation. Use a strong, unique password; the script requires at least 8 characters and no more than 72 UTF-8 bytes.

The command refuses initial setup if an account already exists. It is not a password-reset command and must not be used to recreate or reset an existing administrator.

### 6. Open CertMonitor

The current Compose configuration publishes HTTP on port 80:

```text
http://SERVER_ADDRESS/
```

Replace `SERVER_ADDRESS` with the deployment server's hostname or IP address. Configure HTTPS and appropriate firewall rules before exposing the application publicly.

### 7. Verify the installation

- Confirm that the required Docker services are healthy.
- Open the dashboard and sign in with the initial administrator account.
- Verify certificate monitoring and configure Telegram notifications if needed.

**Production note:** A successful Docker startup does not by itself establish production readiness. Before serving real users, review HTTPS, firewall access, secret management, database backups and restoration, dependency updates, and operational monitoring.
