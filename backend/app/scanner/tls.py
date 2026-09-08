import socket
import ssl
from datetime import datetime, timezone


def get_certificate(domain: str, port: int = 443) -> dict:
    context = ssl.create_default_context()

    with socket.create_connection((domain, port), timeout=10) as sock:
        with context.wrap_socket(sock, server_hostname=domain) as ssock:
            certificate = ssock.getpeercert()

            not_before = datetime.strptime(
                certificate["notBefore"],
                "%b %d %H:%M:%S %Y %Z",
            ).replace(tzinfo=timezone.utc)

            not_after = datetime.strptime(
                certificate["notAfter"],
                "%b %d %H:%M:%S %Y %Z",
            ).replace(tzinfo=timezone.utc)

            days_remaining = (not_after - datetime.now(timezone.utc)).days

            return {
                "domain": domain,
                "port": port,
                "subject": certificate.get("subject"),
                "issuer": certificate.get("issuer"),
                "serial_number": certificate.get("serialNumber"),
                "not_before": not_before,
                "not_after": not_after,
                "days_remaining": days_remaining,
            }