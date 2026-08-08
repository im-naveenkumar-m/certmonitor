from fastapi import FastAPI

from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router

app = FastAPI(
    title="CertMonitor API",
    version="0.1.0",
)

app.include_router(
    auth_router, 
    prefix="/api/v1", 
    tags=["Authentication"])

app.include_router(
    users_router,
    prefix="/api/v1",
    tags=["Users"],
)

@app.get("/")
def root():
    return {
        "message": "Welcome to CertMonitor API"
    }