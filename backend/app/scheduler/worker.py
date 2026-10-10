import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.blocking import BlockingScheduler
from sqlalchemy import and_, func, select

from app.db.session import SessionLocal
from app.models.domain import Domain
from app.models.scan_history import ScanHistory
from app.services.certificate import scan_domain_certificate
from app.services.notification import (
    send_scan_recovery_notification,
    send_certificate_changed_notification,
    send_expiry_notification,
    send_scan_failure_notification,
)
from pathlib import Path
from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR



# ============================================================
# Timezone
# ============================================================

IST = ZoneInfo("Asia/Kolkata")


# ============================================================
# Logging
# ============================================================

class ISTFormatter(logging.Formatter):
    """
    Logging formatter that displays timestamps in IST.
    """

    converter = staticmethod(
        lambda timestamp: datetime.fromtimestamp(
            timestamp,
            tz=IST,
        ).timetuple()
    )


formatter = ISTFormatter(
    "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

handler = logging.StreamHandler()
handler.setFormatter(formatter)

logging.basicConfig(
    level=logging.INFO,
    handlers=[handler],
)

logger = logging.getLogger("certmonitor.scheduler")

HEARTBEAT_FILE = Path("/tmp/certmonitor-scheduler-heartbeat")


def update_scheduler_heartbeat(event) -> None:
    """Record completion of the scheduled job, including job errors."""
    if event.job_id != "scan_due_domains":
        return

    try:
        HEARTBEAT_FILE.touch()
    except OSError:
        logger.exception("Failed to update scheduler heartbeat")


# ============================================================
# Domain scheduling
# ============================================================

def is_domain_due(
    domain: Domain,
    last_scan_at: datetime | None,
    now: datetime,
) -> bool:
    """
    Determine whether a domain is due for its next scan.
    """

    if not domain.enabled:
        return False

    if last_scan_at is None:
        return True

    next_scan_at = last_scan_at + timedelta(
        minutes=domain.scan_interval
    )

    return now >= next_scan_at


# ============================================================
# Scan due domains
# ============================================================

def scan_due_domains() -> None:
    """
    Find enabled domains that are due for scanning and scan them.
    """

    db = SessionLocal()

    try:
        # Keep internal time calculations in UTC.
        now = datetime.now(timezone.utc)

        # ----------------------------------------------------
        # Get latest scan time for each domain
        # ----------------------------------------------------

        latest_scan_subquery = (
            select(
                ScanHistory.domain_id,
                ScanHistory.scanned_at,
                func.row_number()
                .over(
                    partition_by=ScanHistory.domain_id,
                    order_by=ScanHistory.scanned_at.desc(),
                )
                .label("row_number"),
            )
            .subquery()
        )

        query = (
            select(
                Domain,
                latest_scan_subquery.c.scanned_at,
            )
            .outerjoin(
                latest_scan_subquery,
                and_(
                    latest_scan_subquery.c.domain_id == Domain.id,
                    latest_scan_subquery.c.row_number == 1,
                ),
            )
            .where(Domain.enabled.is_(True))
        )

        results = db.execute(query).all()

        logger.info(
            "Scheduler check started: %d enabled domain(s)",
            len(results),
        )

        # ----------------------------------------------------
        # Check each domain
        # ----------------------------------------------------

        for domain, last_scan_at in results:

            if not is_domain_due(
                domain,
                last_scan_at,
                now,
            ):
                continue

            logger.info(
                "Scanning domain: %s:%s",
                domain.domain_name,
                domain.port,
            )

            try:
                certificate = scan_domain_certificate(
                    db,
                    domain,
                )

                logger.info(
                    "Scan successful: %s:%s - %d days remaining",
                    domain.domain_name,
                    domain.port,
                    certificate.days_remaining,
                )

                # --------------------------------------------------------
                # Recovery notification
                # --------------------------------------------------------

                try:
                    recovered = send_scan_recovery_notification(
                        db=db,
                        domain_id=domain.id,
                        domain=domain.domain_name,
                        port=domain.port,
                    )

                    if recovered:
                        logger.info(
                            "Telegram notification sent: scan recovery - %s:%s",
                            domain.domain_name,
                            domain.port,
                        )

                except Exception:
                    # A Telegram failure must not turn a successful scan
                    # into a scan failure.
                    logger.exception(
                        "Failed to send scan recovery notification: %s:%s",
                        domain.domain_name,
                        domain.port,
                    )

                # --------------------------------------------------------
                # Certificate changed notification
                # --------------------------------------------------------

                latest_history = (
                    db.query(ScanHistory)
                    .filter(
                        ScanHistory.domain_id == domain.id
                    )
                    .order_by(
                        ScanHistory.scanned_at.desc()
                    )
                    .first()
                )

                if latest_history and latest_history.certificate_changed:
                    sent = send_certificate_changed_notification(
                        db=db,
                        domain_id=domain.id,
                        domain=domain.domain_name,
                        port=domain.port,
                        fingerprint_sha256=certificate.fingerprint_sha256,
                    )

                    if sent:
                        logger.info(
                            "Telegram notification sent: certificate changed - %s:%s",
                            domain.domain_name,
                            domain.port,
                        )

                # --------------------------------------------------------
                # Certificate expiry notification
                # --------------------------------------------------------

                sent = send_expiry_notification(
                    db=db,
                    domain_id=domain.id,
                    domain=domain.domain_name,
                    port=domain.port,
                    days_remaining=certificate.days_remaining,
                    valid_until=certificate.valid_until.isoformat(),
                    fingerprint_sha256=certificate.fingerprint_sha256,
                )

                if sent:
                    logger.info(
                        "Telegram notification sent: certificate expiry - %s:%s",
                        domain.domain_name,
                        domain.port,
                    )

            except Exception as exc:
                logger.exception(
                    "Scan failed: %s:%s",
                    domain.domain_name,
                    domain.port,
                )

                # --------------------------------------------------------
                # Scan failure notification
                # --------------------------------------------------------

                try:
                    sent = send_scan_failure_notification(
                        db=db,
                        domain_id=domain.id,
                        domain=domain.domain_name,
                        port=domain.port,
                        error_message=str(exc),
                    )

                    if sent:
                        logger.info(
                            "Telegram notification sent: scan failure - %s:%s",
                            domain.domain_name,
                            domain.port,
                        )

                except Exception:
                    logger.exception(
                        "Failed to send scan failure notification: %s:%s",
                        domain.domain_name,
                        domain.port,
                    )


    finally:
        db.close()


# ============================================================
# Scheduler
# ============================================================

def main() -> None:
    logger.info("CertMonitor scheduler starting")

    scheduler = BlockingScheduler(
        timezone="UTC",
    )

    scheduler.add_job(
        scan_due_domains,
        trigger="interval",
        minutes=1,
        id="scan_due_domains",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    scheduler.add_listener(
        update_scheduler_heartbeat,
        EVENT_JOB_EXECUTED | EVENT_JOB_ERROR,
    )

    try:
        scheduler.start()

    except (KeyboardInterrupt, SystemExit):
        logger.info("CertMonitor scheduler stopping")

        scheduler.shutdown(wait=True)


if __name__ == "__main__":
    main()