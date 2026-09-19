"""One-off script: creates (or promotes) an admin user from env vars.

Usage:
    python scripts/create_admin.py
Reads ADMIN_EMAIL / ADMIN_PASSWORD from your .env file (see .env.example).
"""
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal, Base, engine  # noqa: E402
from app import models  # noqa: E402
from app.security import hash_password  # noqa: E402

Base.metadata.create_all(bind=engine)


def main():
    email = os.getenv("ADMIN_EMAIL", "admin@safeband.app")
    password = os.getenv("ADMIN_PASSWORD", "change-me-now")

    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            user.is_admin = True
            print(f"Promoted existing user {email} to admin.")
        else:
            user = models.User(
                email=email,
                password_hash=hash_password(password),
                full_name="SafeBand Admin",
                is_admin=True,
            )
            db.add(user)
            print(f"Created new admin user {email}.")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
