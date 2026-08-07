from app.auth.hashing import hash_password, verify_password

password = "CertMonitor123"

hashed = hash_password(password)

print("Password :", password)
print("Hash     :", hashed)

print(
    verify_password(
        password,
        hashed,
    )
)