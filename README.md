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

Create local configuration files from the example templates:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

These commands are for a new installation. If either file already exists, do not overwrite it; review the existing configuration instead.

Generate a strong PostgreSQL password and application secret:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Configure the generated values:

- Put the first value in `POSTGRES_PASSWORD` in the root `.env` file.
- Use the same PostgreSQL password in the `DATABASE_URL` value in `backend/.env`.
- Put the second value in `SECRET_KEY` in `backend/.env`.

Confirm that the database settings match:

- `POSTGRES_DB` matches the database name in `DATABASE_URL`.
- `POSTGRES_USER` matches the username in `DATABASE_URL`.
- `POSTGRES_PASSWORD` matches the password in `DATABASE_URL`.
- `DATABASE_URL` uses the Docker Compose database hostname `db` and port `5432`.

Keep `DEBUG=false`. Telegram notifications are optional; configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` if you want to receive them.

Keep all passwords, tokens, and secrets private. Never commit real environment files to GitHub.

### 3. Frontend development (optional)

For deployment, Docker builds the React frontend using the multi-stage `frontend/Dockerfile` and Nginx serves the built files. You do not need to install Node.js or npm on the host machine.

To develop or test the frontend locally, install Node.js and npm, then run:

```bash
cd frontend
npm ci
npm run lint
npm run build
cd ..
```

### 4. Build and start Docker services

From the repository root, validate the default Compose configuration, build the images, and start the services:

```bash
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
```

Wait for PostgreSQL and the backend to become healthy. If a service fails, check its logs:

```bash
docker compose logs --tail=100 db
docker compose logs --tail=100 backend
docker compose logs --tail=100 scheduler
docker compose logs --tail=100 nginx
```

### 5. Create the initial administrator

Run this step only for a fresh database that has no existing users:

```bash
docker compose exec backend python create_admin.py
```

Enter the administrator username and email. The script prompts for a password without displaying it and asks for confirmation. Use a strong, unique password. The script requires at least 8 characters and no more than 72 UTF-8 bytes.

The command refuses initial setup if an account already exists. It is not a password-reset command and must not be used to recreate or reset an existing administrator.

### 6. Access CertMonitor

#### Option A: HTTP deployment (local or private network)

The default Compose configuration publishes HTTP on port 80. Open:

```text
http://SERVER_ADDRESS/
```

Replace `SERVER_ADDRESS` with the deployment server's hostname or IP address. HTTP does not encrypt traffic, so use this option only on a trusted local or private network. Do not expose the default HTTP configuration directly to the public internet.

#### Option B: Public production deployment (HTTPS)

For a public deployment, use the production Compose override and Caddy configuration. Caddy automatically obtains and renews HTTPS certificates when the domain and network are configured correctly.

**Prerequisites**

- A Linux server with Docker Compose installed.
- A domain name you control, with its DNS records pointing to the server's public IP address.
- Inbound TCP ports 80 and 443 allowed through the server firewall and any upstream firewall or router.
- The root `.env` and `backend/.env` files configured with strong, private secrets.
- Internet access from the server so Caddy can obtain and renew public certificates.

**Configure the domain**

Set `DOMAIN` in the root `.env` file to the domain you intend to use. For example:

```dotenv
DOMAIN=monitor.example.com
```

Replace `monitor.example.com` with your actual domain. Ensure the DNS record points to the public IP of this server before starting the production configuration. Keep the existing database and secret settings in your environment files.

**Validate and start the production deployment**

Run these commands from the repository root:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
```

Open `https://your-domain.example/` using your configured domain.

For the full setup, verification, backup, and rollback procedure, read [Production HTTPS Deployment](docs/production-https-deployment.md).

**Important:** The production configuration uses `docker-compose.production.yml` and `Caddyfile.production`. Do not use the LAN test configuration, `docker-compose.https.yml`, for a public production deployment. Do not expose PostgreSQL or FastAPI directly to the public internet. Never commit real environment files, passwords, Telegram tokens, or application secrets to GitHub.

### 7. Verify the installation

- Confirm that the required Docker services are healthy.
- Open the dashboard and sign in with the initial administrator account.
- Verify certificate monitoring.
- Configure and test Telegram notifications if you plan to use them.
- For a public deployment, verify that the site loads over HTTPS and that HTTP redirects to HTTPS.

## Production readiness

A successful Docker startup does not by itself establish production readiness. Before serving real users, review authentication, HTTPS, firewall access, secret management, dependency updates, and operational monitoring. Establish a database backup schedule and test restoring a backup. Keep PostgreSQL and FastAPI ports unpublished on the public host.