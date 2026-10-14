# CertMonitor Disaster Recovery Runbook

## 1. Purpose

This document describes how to recover CertMonitor after a database failure, server issue, or accidental data loss.

**Important:** Never delete the production PostgreSQL volume or overwrite the production database during an initial recovery attempt. Restore and validate a backup separately first.

## 2. Current deployment

| Component | Configuration |
|---|---|
| Project directory | `/home/naveenkm/gitproject/certmonitor` |
| Compose services | `db`, `backend`, `nginx`, `scheduler` |
| Production database | `certmonitor` |
| PostgreSQL container | `certmonitor-db` |
| PostgreSQL volume | `certmonitor_postgres_data` |
| Backup directory | `/home/naveenkm/gitproject/certmonitor/backups/` |
| Backup schedule | Daily at 02:00 |
| Backup health check | Daily at 02:30 |
| Frontend image | `certmonitor-frontend:latest` |

## 3. Recovery principles

1. Preserve the original backup files.
2. Never commit `.env` files or credentials to Git.
3. Never remove the production PostgreSQL volume as a troubleshooting step.
4. Restore backups into a separate database first.
5. Verify the restored database before considering production recovery complete.
6. Keep the existing backup scripts and cron entries unchanged unless a separate change is approved.

## 4. Initial assessment

From the project directory, inspect the deployment:

```bash
cd /home/naveenkm/gitproject/certmonitor
docker compose ps
docker compose config --quiet
df -h .
```

Inspect recent backups:

```bash
ls -lht backups/ | head -15
tail -40 backups/backup.log
tail -30 backups/healthcheck.log
```

Do not assume that a backup is valid solely because the file exists or the health check reports success.

## 5. Restore a backup into an isolated database

Choose a backup that has been verified and note its full path.

Check that the proposed test database name is unused:

```bash
docker exec certmonitor-db psql \
  -U "$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)" \
  -d postgres \
  -tAc "SELECT datname FROM pg_database WHERE datname = 'certmonitor_restore_test_new';"
```

Proceed only if the query returns no output. Create the test database:

```bash
docker exec certmonitor-db createdb \
  -U "$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)" \
  certmonitor_restore_test_new
```

Restore the selected SQL dump:

```bash
docker exec -i certmonitor-db psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -U "$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)" \
  -d certmonitor_restore_test_new \
  < /absolute/path/to/verified-backup.sql
```

Replace `/absolute/path/to/verified-backup.sql` with the real backup path.

If the restore fails, preserve the error output and investigate before retrying. Do not drop existing databases to make room for the test.

## 6. Validate the restored database

List the tables:

```bash
docker exec certmonitor-db psql \
  -U "$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)" \
  -d certmonitor_restore_test_new \
  -c '\dt'
```

Check the migration version:

```bash
docker exec certmonitor-db psql \
  -U "$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)" \
  -d certmonitor_restore_test_new \
  -c 'SELECT version_num FROM alembic_version;'
```

Check the application table counts:

```bash
docker exec certmonitor-db psql \
  -U "$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)" \
  -d certmonitor_restore_test_new \
  -c "SELECT
    (SELECT count(*) FROM users) AS users,
    (SELECT count(*) FROM certificates) AS certificates,
    (SELECT count(*) FROM domains) AS domains,
    (SELECT count(*) FROM scan_history) AS scan_history,
    (SELECT count(*) FROM notification_events) AS notification_events;"
```

Compare these results with the backup's expected data. Also check important relationships and application behavior where practical.

## 7. Rebuild and start application services

After confirming the source code and environment configuration are available, validate the Compose file:

```bash
docker compose config --quiet
```

Build the application images:

```bash
docker compose build
```

Start services:

```bash
docker compose up -d
docker compose ps
```

These commands can recreate containers. During an emergency, assess the impact before executing them on a live deployment.

**Important:** Rebuilding and starting services does not itself restore database contents. Database recovery must be planned and verified separately.

## 8. Post-recovery verification

Check the service health:

```bash
docker compose ps
```

Check the frontend and API documentation:

```bash
curl -sS -o /dev/null -w 'Frontend: HTTP %{http_code}\n' http://127.0.0.1/
curl -sS -o /dev/null -w 'API docs: HTTP %{http_code}\n' http://127.0.0.1/docs
```

Then verify the following manually:

- Login with an existing account.
- Dashboard data loads.
- Certificate and domain pages work.
- VM pages and navigation work.
- Page refreshes work.
- Scheduler activity and notification behavior are appropriate.

Do not declare recovery complete until the application and restored data have been checked.

## 9. Production database recovery

Production recovery requires a separate, deliberate decision. Before replacing or reconnecting the production database:

1. Stop and assess application writes where appropriate.
2. Preserve the current database state if it is still accessible.
3. Identify the correct backup and recovery point.
4. Restore and validate the backup separately.
5. Plan the production switch, maintenance window, and rollback.
6. Verify application behavior after the switch.

Do not copy a test database over production or change `DATABASE_URL` without a reviewed recovery plan.

## 10. Backup and security reminders

- Keep backup files outside Git history.
- Protect database dumps because they can contain user information and password hashes.
- Store a separate copy of important backups on another disk or protected storage location.
- Never share `.env` contents, database passwords, or secret tokens when requesting support.
- Periodically perform an isolated restore test.
- Keep a record of the tested backup date, restore result, and verification checks.

## 11. Last verified restore test

A restore test was completed using:

`certmonitor_2026-10-14_02-00-01.sql`

The test database was `certmonitor_restore_oct14`.

The restore completed without errors. The five application table counts matched the dump, the Alembic migration version was `845056ad805f`, and the checks found zero orphaned certificates and zero orphaned scan-history records.

This records the result of that specific test; future backups must be tested independently.
