# CertMonitor --- Production Deployment

This guide is for users who want to deploy CertMonitor on a public Linux
server using their own domain and public IP. It uses Docker Compose and
Caddy for automatic HTTPS. It does not require a separate install
script.

## Prerequisites

-   A separate Linux server with Docker Engine and the Docker Compose
    plugin.
-   A domain name you control and a public IP address that can reach the
    server.
-   Provider/server firewall access for inbound TCP ports 80 and 443.
-   Git installed on the server.
-   Secure SSH access to the server.

Do not expose the application publicly until environment secrets,
authentication, backups, and firewall rules have been reviewed.

## 1. Get the project

``` bash
git clone https://github.com/im-naveenkumar-m/certmonitor.git
cd certmonitor
```

Use the project's documented release/default branch for production
rather than an unfinished development branch, if a stable release branch
is available.

## 2. Configure environment files

Create the local environment files only if they do not already exist:

``` bash
cp .env.example .env
cp backend/.env.example backend/.env
```

If either file already exists, do not overwrite it; edit the existing
file carefully.

Generate two strong random values:

``` bash
openssl rand -hex 32
openssl rand -hex 32
```

Use the first value for `POSTGRES_PASSWORD` in the root `.env` and the
matching password in `DATABASE_URL` in `backend/.env`. Use the second
value for `SECRET_KEY` in `backend/.env`.

Set `DOMAIN` in the root `.env` to the exact public hostname, for
example:

``` dotenv
DOMAIN=certmonitor.example.com
```

Replace the example with your own domain. Ensure `POSTGRES_DB`,
`POSTGRES_USER`, and the password match the database connection settings
in `backend/.env`. The database hostname in `DATABASE_URL` should be
`db`, using the Compose network and internal port `5432`.

Keep `DEBUG=false`. Telegram settings are optional unless you want
notifications. Review all required backend settings from the current
`backend/.env.example` and application configuration before deployment.

Keep `.env` and `backend/.env` private and excluded from Git. Never
commit real secrets.

## 3. Configure DNS and firewall

1.  Create a DNS `A` record for your chosen hostname pointing to the
    production server's public IPv4 address.
2.  If you configure an `AAAA` record, verify that IPv6 is correctly
    routed and firewalled; remove an unusable record.
3.  Allow inbound TCP ports 80 and 443 in both the hosting/provider
    firewall and the server firewall. Configure router/NAT forwarding if
    applicable.
4.  Confirm that the domain resolves to the correct server and that
    inbound validation traffic can reach it.

A public IP does not guarantee that inbound connections are allowed.
Certificate issuance will fail until DNS and network access are correct.

## 4. Validate the production configuration

Copy these files from the repository's production deployment files into
the repository root:

-   `docker-compose.production.yml`
-   `Caddyfile.production`

Then run:

``` bash
docker compose -f docker-compose.yml -f docker-compose.production.yml config -q
docker compose -f docker-compose.yml -f docker-compose.production.yml config --services
```

Review the merged configuration locally. It should include `db`,
`backend`, `nginx`, `scheduler`, and `caddy`. Verify that Caddy
publishes TCP 80 and 443, while Nginx, FastAPI, and PostgreSQL have no
public host-port mappings.

The production override removes backend and scheduler source bind mounts
so the running containers use the code built into their images.

## 5. Build and start production

Run only after the environment files, DNS, public IP, and firewall are
configured:

``` bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
```

Check status and logs:

``` bash
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail=100 caddy nginx backend db scheduler
```

## 6. Create the first administrator

Only for a fresh database that has no users:

``` bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec backend python create_admin.py
```

Use a strong, unique administrator password. This is an initial-account
setup command, not a password-reset command.

## 7. Verify the site

1.  Open `https://YOUR_REAL_DOMAIN/` using your configured hostname.
2.  Confirm the browser reports a valid, publicly trusted certificate.
3.  Confirm HTTP redirects to HTTPS.
4.  Test login, frontend navigation, API requests, certificate scanning,
    scheduler activity, and Telegram notifications if configured.
5.  Check logs for errors.
6.  Verify from outside the server that only the intended web ports are
    publicly reachable.
7.  Test a container restart and confirm the database and Caddy
    certificate state persist.

Caddy automatically obtains and renews public certificates when the
hostname resolves correctly and the required validation traffic reaches
the server.

## 8. Backups and updates

-   Schedule PostgreSQL backups and store them away from the production
    server.
-   Test database restoration before relying on backups.
-   Keep the Docker volumes `postgres_data`, `caddy_data_production`,
    and `caddy_config_production`.
-   To update, back up first, obtain the intended reviewed release, then
    rebuild and redeploy using the same Compose file pair.
-   Do not run `docker compose down -v` as a routine update or
    troubleshooting command.
-   Document recovery, rollback, and secret rotation procedures.

## Production checklist

-   [ ] Domain DNS points to the correct public IP.
-   [ ] TCP 80 and 443 are allowed through provider and server
    firewalls.
-   [ ] Root `.env` and `backend/.env` are configured securely and
    excluded from Git.
-   [ ] Compose configuration validates successfully.
-   [ ] Only Caddy publishes public host ports.
-   [ ] HTTPS certificate is valid and HTTP redirects to HTTPS.
-   [ ] Administrator setup, login, API, scanning, scheduler, and
    notifications are tested.
-   [ ] PostgreSQL backups and recovery are tested.
-   [ ] Rollback steps are documented.