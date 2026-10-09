from app.telegram.client import send_message

def send_test_message() -> None:
    message = (
        "🔔 CertMonitor Test\n\n"
        "Telegram notifications are working correctly.\n\n"
        "This is a test message from CertMonitor."
    )

    send_message(message)
def send_certificate_expiry_alert(
    domain: str,
    port: int,
    days_remaining: int,
    valid_until: str,
    shared_domains: list[str] | None = None,
) -> None:
    if days_remaining < 0:
        status = "🔴 EXPIRED"
    elif days_remaining <= 7:
        status = "🔴 CRITICAL"
    elif days_remaining <= 30:
        status = "🟠 EXPIRING SOON"
    elif days_remaining <= 60:
        status = "🟡 ATTENTION"
    else:
        status = "🟢 HEALTHY"

    domains = sorted(set(shared_domains or [f"{domain}:{port}"]))

    message = (
        f"{status}\n\n"
        "SSL Certificate Alert\n\n"
        f"Shared by {len(domains)} monitored domain(s):\n"
        + "\n".join(f"• {item}" for item in domains)
        + f"\n\nDays Remaining: {days_remaining}"
        + f"\nValid Until: {valid_until}"
    )

    send_message(message)
def send_certificate_changed_alert(
    domain: str,
    port: int,
) -> None:
    message = (
        "🔄 SSL Certificate Changed\n\n"
        f"Domain: {domain}\n"
        f"Port: {port}\n\n"
        "The SSL certificate fingerprint "
        "has changed."
    )

    send_message(message)
def send_scan_failure_alert(
    domain: str,
    port: int,
    error_message: str,
) -> None:
    message = (
        "❌ SSL Scan Failed\n\n"
        f"Domain: {domain}\n"
        f"Port: {port}\n\n"
        f"Error: {error_message}"
    )

    send_message(message)
def send_scan_recovery_alert(
    domain: str,
    port: int,
) -> None:
    message = (
        "✅ SSL Scan Recovered\n\n"
        f"Domain: {domain}\n"
        f"Port: {port}\n\n"
        "The SSL certificate scan is working again.\n"
        "The previous scan failure has recovered."
    )

    send_message(message)