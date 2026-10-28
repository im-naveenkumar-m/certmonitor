# CertMonitor — HTTPS Deployment Guide

This guide explains how to deploy CertMonitor with HTTPS using Docker Compose and Nginx. The administrator supplies the TLS certificate and matching private key.

This approach supports both private LAN deployments and public deployments. Caddy is not required.

## Prerequisites

- A Linux server with Docker Engine and the Docker Compose plugin.
- Git installed on the server.
- Secure access to the server.
- A TLS certificate and its matching private key.
- Port 80 and port 443 available on the server.
- For a public deployment, a domain name and a public IP address that can reach the server.

For public deployments, configure DNS and firewalls before making the application publicly accessible. Review authentication, environment secrets, backups, and firewall rules before production use.

## 1. Get the project

```bash
git clone https://github.com/im-naveenkumar-m/certmonitor.git
cd certmonitor
```

Use a reviewed release or stable branch for production when one is available.

## 2. Configure environment files

Create the environment files only if they do not already exist:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Do not overwrite existing environment files. Review and update them carefully.

Generate two strong random values:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Configure the first value as `POSTGRES_PASSWORD` in the root `.env` file and use the same password in `DATABASE_URL` in `backend/.env`. Configure the second value as `SECRET_KEY` in `backend/.env`.

Confirm that the database name, username, and password match between the two files. The backend's database hostname should be `db` and its internal port should be `5432`.

Keep `DEBUG=false`. Configure Telegram settings if notifications are required. Review the current environment templates and application settings for all other required values.

Keep environment files private and excluded from Git.

## 3. Prepare the certificate

Create a directory in the repository root:

```bash
mkdir -p certs
```

Place the certificate chain and private key in these locations:

```text
certs/fullchain.pem
certs/privkey.pem
```

`fullchain.pem` must contain the certificate presented by the server and, when applicable, the intermediate certificates required to validate its chain. `privkey.pem` must contain the corresponding private key.

Ensure that the certificate matches the exact hostname or IP address users will use to access CertMonitor.

### Private LAN deployments

You can use a certificate from your organization's internal certificate authority. Alternatively, a self-signed certificate can be used for testing.

Install and trust the internal CA certificate on client devices when using a private CA. A self-signed certificate will normally trigger a browser warning until the client explicitly trusts it. Trusting a certificate does not make an expired or hostname-mismatched certificate valid.

A public domain and a publicly trusted certificate are not required for a private LAN deployment.

### Public deployments

Obtain a certificate from a public certificate provider of your choice. Configure DNS to resolve your domain to the server's public IP address.

Allow inbound TCP ports 80 and 443 through the provider firewall, server firewall, and any relevant upstream router or NAT device.

Certificate issuance and renewal depend on the certificate provider and its validation method. The administrator is responsible for renewing the certificate and replacing the deployed files before expiry.

**Security:** Never commit the private key to Git. Protect it with appropriate filesystem permissions, and restrict access to the certificate directory.

## 4. Validate the deployment configuration

Run these commands from the repository root:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.tls.yml config --services
```

Inspect the merged configuration before starting the application. The TLS override configures Nginx to publish ports 80 and 443, use the provided certificate files, and redirect HTTP traffic to HTTPS.

The override removes development source-code bind mounts from the backend and scheduler so that the containers use the code built into their images.

Ensure `certs/fullchain.pem` and `certs/privkey.pem` exist and correspond to each other.

## 5. Build and start the services

Start the application:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build
```

Check the services:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml ps
```

Validate the active Nginx configuration:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml exec nginx nginx -t
```

If a service fails, inspect its logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml logs --tail=100 nginx backend db scheduler
```

Resolve any configuration or certificate errors before allowing users to access the application.

## 6. Create the first administrator

Run this only for a fresh database that does not already contain users:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml exec backend python create_admin.py
```

Use a strong, unique password. This command creates the initial administrator; it is not a password-reset command.

## 7. Verify HTTPS

For a public deployment, open:

```text
https://YOUR_REAL_DOMAIN/
```

For a LAN deployment, open the HTTPS URL using the configured hostname or IP address.

Verify the following:

1. The application loads over HTTPS.
2. HTTP traffic redirects to HTTPS.
3. The certificate is valid, unexpired, and matches the hostname or IP address.
4. The client trusts the issuing CA or certificate.
5. Login, frontend navigation, API requests, certificate scanning, scheduler activity, and configured Telegram notifications work.
6. Nginx, backend, database, and scheduler logs do not show unresolved errors.
7. Only intended ports are publicly reachable; PostgreSQL and FastAPI are not exposed directly.
8. A container restart preserves database data and the application remains accessible.

For a quick connectivity check, replace the address with your server's configured hostname or IP:

```bash
curl -I https://YOUR_HOSTNAME_OR_IP/
curl -I http://YOUR_HOSTNAME_OR_IP/
```

The HTTPS request should succeed when the certificate is trusted by the client. The HTTP request should return a redirect to HTTPS.

For a self-signed certificate that is not trusted, `curl` may report a certificate verification error. You can use `curl -k` for a temporary connectivity test, but do not treat that as successful certificate validation.

## 8. Certificate renewal and replacement

Nginx serves the certificate files provided by the administrator. It does not automatically issue or renew them.

1. Renew or reissue the certificate through your chosen certificate provider before expiry.
2. Replace `certs/fullchain.pem` and `certs/privkey.pem` with the new certificate and matching private key.
3. Validate the Nginx configuration.
4. Reload or recreate Nginx so the new certificate is loaded.
5. Test HTTPS from a client and verify the new expiry date.

For example, after replacing the files:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml exec nginx nginx -t
docker compose -f docker-compose.yml -f docker-compose.tls.yml restart nginx
```

Plan renewal in advance and protect a working copy of the current certificate until the replacement has been verified.

## 9. Backups, updates, and rollback

- Schedule database backups and store them separately from the production server.
- Test restoring a backup.
- Preserve the `postgres_data` Docker volume during routine updates and troubleshooting.
- Back up the environment files and TLS certificate material securely.
- Obtain the intended reviewed code version, then rebuild and redeploy using the same Compose file pair.
- Do not run `docker compose down -v` as a routine update or troubleshooting command.
- Document how to restore the previous application version and certificate.

## Production checklist

- [ ] Environment files contain secure values and are excluded from Git.
- [ ] The certificate and private key match the deployment hostname or IP.
- [ ] The certificate chain is valid for the intended clients.
- [ ] For public deployments, DNS and firewall rules are configured.
- [ ] The merged Compose configuration validates successfully.
- [ ] Nginx configuration validation succeeds.
- [ ] HTTP redirects to HTTPS.
- [ ] Login, frontend, API, scanning, scheduler, and notifications are tested.
- [ ] PostgreSQL and FastAPI are not publicly exposed.
- [ ] Certificate renewal responsibilities and procedures are documented.
- [ ] Database backups and recovery have been tested.
- [ ] Rollback steps are documented.
