from fastapi import FastAPI

from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.domains import router as domain_router

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

app.include_router(
    domain_router,
    prefix="/api/v1",
    tags=["Domains"],
)

@app.get("/")
def root():
    return {
        "message": "Welcome to CertMonitor API"
    }