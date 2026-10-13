from app.scanner.tls import get_certificate


result = get_certificate("google.com")

print("Domain:", result["domain"])
print("Port:", result["port"])
print("Serial:", result["serial_number"])
print("SHA-256:", result["fingerprint_sha256"])
print("Valid From:", result["not_before"])
print("Valid Until:", result["not_after"])
print("Days Remaining:", result["days_remaining"])
print("Issuer:", result["issuer"])