from app.db.session import SessionLocal
from app.models.domain import Domain
from app.services.certificate import scan_domain_certificate


db = SessionLocal()

domain = db.query(Domain).filter(
    Domain.domain_name == "google.com"
).first()

if domain is None:
    print("Domain not found. Add google.com using the Domain API first.")
else:
    certificate = scan_domain_certificate(db, domain)

    print("Certificate saved successfully")
    print("ID:", certificate.id)
    print("Domain ID:", certificate.domain_id)
    print("Serial:", certificate.serial_number)
    print("Issuer:", certificate.issuer)
    print("Subject:", certificate.subject)
    print("Valid From:", certificate.valid_from)
    print("Valid Until:", certificate.valid_until)
    print("Days Remaining:", certificate.days_remaining)

db.close()