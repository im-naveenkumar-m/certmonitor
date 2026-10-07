from sqlalchemy.orm import Session

from app.models.scan_history import ScanHistory


def get_scan_history_by_domain(
    db: Session,
    domain_id: int,
    limit: int = 50,
):
    return (
        db.query(ScanHistory)
        .filter(
            ScanHistory.domain_id == domain_id
        )
        .order_by(
            ScanHistory.scanned_at.desc()
        )
        .limit(limit)
        .all()
    )