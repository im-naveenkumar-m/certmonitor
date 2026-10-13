from app.auth.hashing import verify_password

password = "CertMonitor123"

hashed = "$2b$12$0IWJqvpubHHCkCGcAf0yjuSKVUbpp7AyIfYgf31/F1trZPbjbhEnK"

print(verify_password(password, hashed))