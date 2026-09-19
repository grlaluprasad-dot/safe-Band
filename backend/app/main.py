from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine, run_auto_migrations
from app.routers import auth, children, scan, admin, incident, bulk

# Auto-create tables for dev convenience.
Base.metadata.create_all(bind=engine)
run_auto_migrations()

app = FastAPI(
    title="SafeBand API",
    description="QR-based child safety bracelet & lost-child reunification system",
    version="1.2.0",
)

# In development, allow all origins so mobile devices on local Wi-Fi can connect without CORS issues
allow_origins = ["*"] if settings.environment == "development" else settings.cors_origin_list

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=r"https://.*\.netlify\.app|http://localhost:.*|http://127\.0\.0\.1:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(children.router)
app.include_router(scan.router)
app.include_router(incident.router)
app.include_router(bulk.router)
app.include_router(admin.router)


@app.get("/")
def root_check():
    return {
        "status": "ok",
        "app": "SafeBand API",
        "version": "1.2.0",
        "environment": settings.environment,
    }


@app.get("/api/health")
def health_check():
    return {"status": "ok", "environment": settings.environment}
