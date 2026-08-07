from app.auth.hashing import hash_password
from app.db.session import SessionLocal
from app.models.user import User

db = SessionLocal()

user = db.query(User).filter(
    User.username == "admin"
).first()

if user:
    print("Admin already exists.")
else:
    admin = User(
        username="admin",
        email="admin@certmonitor.local",
        hashed_password=hash_password("Admin@123"),
        is_superuser=True,
    )

    db.add(admin)
    db.commit()

    print("Admin user created successfully.")

db.close()