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

#### Option A: HTTP deployment (local testing only)

The default Compose configuration publishes HTTP on port 80:

```text
http://SERVER_ADDRESS/
```

Replace `SERVER_ADDRESS` with the server's hostname or IP address. HTTP traffic is not encrypted. Use this option only for local testing on a trusted network, not for public production deployments.

#### Option B: HTTPS deployment (LAN or public)

CertMonitor supports HTTPS through **Nginx**, using a TLS certificate and private key supplied by the administrator. Caddy is not required.

**Choose a certificate appropriate for your deployment:**

- **Private LAN:** Use a certificate issued by your organization's internal certificate authority, or a self-signed certificate for testing. Clients must trust the issuing CA or certificate to avoid browser security warnings.
- **Public domain:** Obtain a certificate from a public certificate provider. Configure DNS to point your domain to the server's public IP and ensure the required network access is available.

The certificate must match the hostname or IP address users enter in their browsers.

**Prepare the certificate files**

Create the certificate directory:

```bash
mkdir -p certs
```

Place the certificate chain in `certs/fullchain.pem` and the matching private key in `certs/privkey.pem`. For a self-signed certificate, the certificate file contains the self-signed certificate.

Protect the private key and never commit certificates containing private keys, passwords, or other secrets to GitHub. Keep the certificate and key readable by the Nginx container.

**Validate and start HTTPS**

From the repository root, run:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.tls.yml ps
```

Check the Nginx configuration:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml exec nginx nginx -t
```

Open the application over HTTPS:

```text
https://SERVER_ADDRESS/
```

For a LAN deployment, use the configured hostname or IP address. For a public deployment, use your domain name.

The TLS Compose override publishes ports 80 and 443 and configures Nginx to redirect HTTP to HTTPS. Certificate renewal and replacement must be managed by the administrator according to the selected certificate provider.

For the full deployment, verification, backup, and rollback procedure, read [Production HTTPS Deployment](docs/production-https-deployment.md).

**Important:** Do not expose PostgreSQL or FastAPI directly to the public internet. Never commit real environment files, private keys, passwords, Telegram tokens, or application secrets to GitHub.

### 7. Verify the installation

- Confirm the required Docker services are healthy.
- Open the dashboard and sign in with the initial administrator account.
- Verify certificate monitoring and Telegram notifications, if configured.
- For HTTPS deployments, verify that HTTPS loads successfully and HTTP redirects to HTTPS.
- Verify that clients trust the configured certificate, especially on private LAN deployments.

## Production readiness

A successful Docker startup does not by itself establish production readiness. Before serving real users, review authentication, HTTPS, firewall access, certificate renewal, secret management, dependency updates, and operational monitoring. Establish a database backup schedule and test restoring a backup. Keep PostgreSQL and FastAPI ports unpublished on the public host.
