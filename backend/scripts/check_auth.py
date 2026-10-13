from app.auth.service import authenticate_user
from app.db.session import SessionLocal

db = SessionLocal()

user = authenticate_user(
    db,
    "admin",
    "Admin@123",
)

print(user)

db.close()