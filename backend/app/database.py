from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

db_url = settings.database_url
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

if db_url.startswith("sqlite"):
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
else:
    engine = create_engine(db_url, pool_pre_ping=True, pool_recycle=300)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def run_auto_migrations():
    """Ensures SQLite dev tables have all current schema columns without dropping data."""
    if not db_url.startswith("sqlite"):
        return

    with engine.connect() as conn:
        # Check children table
        try:
            res = conn.execute(text("PRAGMA table_info(children)")).fetchall()
            existing_children_cols = {row[1] for row in res}
            if existing_children_cols:
                cols_to_add = [
                    ("dob", "VARCHAR"),
                    ("gender", "VARCHAR"),
                    ("preferred_language", "VARCHAR DEFAULT 'en'"),
                    ("blood_group", "VARCHAR"),
                    ("allergies", "TEXT"),
                    ("emergency_instructions", "TEXT"),
                    ("show_age_publicly", "BOOLEAN DEFAULT 0"),
                    ("show_blood_group_publicly", "BOOLEAN DEFAULT 0"),
                    ("show_allergies_publicly", "BOOLEAN DEFAULT 0"),
                    ("show_emergency_instructions_publicly", "BOOLEAN DEFAULT 0"),
                    ("address_line", "VARCHAR"),
                    ("area_locality", "VARCHAR"),
                    ("city", "VARCHAR"),
                    ("state", "VARCHAR"),
                    ("pincode", "VARCHAR"),
                ]
                for col_name, col_def in cols_to_add:
                    if col_name not in existing_children_cols:
                        conn.execute(text(f"ALTER TABLE children ADD COLUMN {col_name} {col_def}"))
                conn.commit()
        except Exception as e:
            print("Auto migration note (children):", e)

        # Check guardians table
        try:
            res = conn.execute(text("PRAGMA table_info(guardians)")).fetchall()
            existing_guardian_cols = {row[1] for row in res}
            if existing_guardian_cols:
                if "notification_method" not in existing_guardian_cols:
                    conn.execute(text("ALTER TABLE guardians ADD COLUMN notification_method VARCHAR DEFAULT 'all'"))
                conn.commit()
        except Exception as e:
            print("Auto migration note (guardians):", e)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
