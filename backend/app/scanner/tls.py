import socket
import ssl
import hashlib
from datetime import datetime, timezone

from cryptography import x509
from cryptography.hazmat.backends import default_backend


def get_certificate(domain: str, port: int = 443) -> dict:
    """
    Retrieve the TLS certificate presented by a remote server.

    Certificate verification is intentionally disabled because CertMonitor
    needs to inspect certificates even when they are expired or untrusted.
    """

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    with socket.create_connection((domain, port), timeout=10) as sock:
        with context.wrap_socket(sock, server_hostname=domain) as ssock:
            certificate_der = ssock.getpeercert(binary_form=True)

            if not certificate_der:
                raise ssl.SSLError(
                    "Server did not provide a certificate"
                )

            fingerprint_sha256 = hashlib.sha256(
                certificate_der
            ).hexdigest().upper()

            certificate = x509.load_der_x509_certificate(
                certificate_der,
                default_backend(),
            )

            not_before = certificate.not_valid_before_utc
            not_after = certificate.not_valid_after_utc

            days_remaining = (
                not_after - datetime.now(timezone.utc)
            ).days

            return {
                "domain": domain,
                "port": port,
                "subject": certificate.subject.rfc4514_string(),
                "issuer": certificate.issuer.rfc4514_string(),
                "serial_number": format(
                    certificate.serial_number,
                    "X",
                ),
                "fingerprint_sha256": fingerprint_sha256,
                "not_before": not_before,
                "not_after": not_after,
                "days_remaining": days_remaining,
            }