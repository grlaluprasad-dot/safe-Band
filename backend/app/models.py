import uuid
import enum
from datetime import datetime

from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Enum, Float
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


def short_id() -> str:
    # Human-facing SafeBand ID, e.g. SB-4F82A1 (not secret, just an identifier)
    return "SB-" + uuid.uuid4().hex[:6].upper()


class User(Base):
    """A parent / guardian account."""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    phone_number = Column(String, nullable=True)  # never exposed publicly
    address = Column(String, nullable=True)

    is_admin = Column(Boolean, default=False)
    is_suspended = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    children = relationship("Child", back_populates="parent", cascade="all, delete-orphan")


class Child(Base):
    __tablename__ = "children"

    id = Column(String, primary_key=True, default=gen_uuid)
    parent_id = Column(String, ForeignKey("users.id"), nullable=False)

    display_name = Column(String, nullable=False)  # first name / nickname ONLY
    dob = Column(String, nullable=True)  # YYYY-MM-DD
    gender = Column(String, nullable=True)  # Male, Female, Non-binary, etc.
    preferred_language = Column(String, default="en")  # en, es, fr, hi

    photo_url = Column(String, nullable=True)
    blood_group = Column(String, nullable=True)  # A+, B+, O+, etc.
    allergies = Column(Text, nullable=True)
    emergency_instructions = Column(Text, nullable=True)
    medical_info = Column(Text, nullable=True)  # legacy / combined

    # Granular Visibility Controls (Sensitive info private by default)
    show_photo_publicly = Column(Boolean, default=False)
    show_age_publicly = Column(Boolean, default=False)
    show_blood_group_publicly = Column(Boolean, default=False)
    show_allergies_publicly = Column(Boolean, default=False)
    show_emergency_instructions_publicly = Column(Boolean, default=False)
    show_medical_info_publicly = Column(Boolean, default=False)

    # Home Address (Strictly Private - NEVER shown on public scan page)
    address_line = Column(String, nullable=True)
    area_locality = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    pincode = Column(String, nullable=True)

    safeband_id = Column(String, unique=True, index=True, default=short_id)
    # qr_token is the unguessable secret embedded in the QR URL. Rotate to revoke old QR codes.
    qr_token = Column(String, unique=True, index=True, default=gen_uuid)

    is_active = Column(Boolean, default=True)  # false if bracelet revoked
    lost_mode = Column(Boolean, default=False)

    # Event Mode & Auto-Expiry
    is_event_bracelet = Column(Boolean, default=False)
    event_name = Column(String, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    # Geofence Safe Zone
    safe_zone_name = Column(String, nullable=True)
    safe_zone_lat = Column(Float, nullable=True)
    safe_zone_lng = Column(Float, nullable=True)
    safe_zone_radius_m = Column(Float, default=500.0)

    created_at = Column(DateTime, default=datetime.utcnow)

    parent = relationship("User", back_populates="children")
    scan_events = relationship("ScanEvent", back_populates="child", cascade="all, delete-orphan")
    guardians = relationship("Guardian", back_populates="child", cascade="all, delete-orphan")


class Guardian(Base):
    """Guardians notified when a child's SafeBand is scanned."""
    __tablename__ = "guardians"

    id = Column(String, primary_key=True, default=gen_uuid)
    child_id = Column(String, ForeignKey("children.id"), nullable=False)
    name = Column(String, nullable=False)
    relation = Column(String, nullable=False)  # e.g., "Mother", "Father", "Grandparent", "Chaperone"
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    is_primary = Column(Boolean, default=False)
    notify_sms = Column(Boolean, default=True)
    notify_email = Column(Boolean, default=True)
    notification_method = Column(String, default="all")  # "sms", "email", "in_app", "all"
    created_at = Column(DateTime, default=datetime.utcnow)

    child = relationship("Child", back_populates="guardians")


class ScanEvent(Base):
    __tablename__ = "scan_events"

    id = Column(String, primary_key=True, default=gen_uuid)
    child_id = Column(String, ForeignKey("children.id"), nullable=False)

    session_token = Column(String, default=gen_uuid, index=True)
    scanned_at = Column(DateTime, default=datetime.utcnow)
    approx_lat = Column(Float, nullable=True)
    approx_lng = Column(Float, nullable=True)
    location_accuracy_m = Column(Float, nullable=True)
    location_shared = Column(Boolean, default=False)

    geofence_violation = Column(Boolean, default=False)
    scanner_name = Column(String, nullable=True)
    scanner_phone = Column(String, nullable=True)

    contact_revealed = Column(Boolean, default=False)
    marked_found = Column(Boolean, default=False)
    resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime, nullable=True)

    # Technical metadata only
    scanner_user_agent = Column(String, nullable=True)

    child = relationship("Child", back_populates="scan_events")
    pings = relationship("LocationPing", back_populates="scan_event", cascade="all, delete-orphan", order_by="LocationPing.timestamp.asc()")
    messages = relationship("IncidentMessage", back_populates="scan_event", cascade="all, delete-orphan", order_by="IncidentMessage.created_at.asc()")


class LocationPing(Base):
    """Breadcrumbs sent during active location sharing from finder's browser."""
    __tablename__ = "location_pings"

    id = Column(String, primary_key=True, default=gen_uuid)
    scan_event_id = Column(String, ForeignKey("scan_events.id"), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    accuracy_m = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    scan_event = relationship("ScanEvent", back_populates="pings")


class IncidentMessage(Base):
    """In-app masked chat exchange between guardian and scanner."""
    __tablename__ = "incident_messages"

    id = Column(String, primary_key=True, default=gen_uuid)
    scan_event_id = Column(String, ForeignKey("scan_events.id"), nullable=False)
    sender_type = Column(String, nullable=False)  # "scanner" or "guardian"
    sender_name = Column(String, nullable=True)   # "Scanner" or "Guardian" (masked for privacy)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    scan_event = relationship("ScanEvent", back_populates="messages")


class ReportStatus(str, enum.Enum):
    open = "open"
    reviewing = "reviewing"
    resolved = "resolved"
    dismissed = "dismissed"


class AbuseReport(Base):
    __tablename__ = "abuse_reports"

    id = Column(String, primary_key=True, default=gen_uuid)
    child_id = Column(String, ForeignKey("children.id"), nullable=True)
    reason = Column(Text, nullable=False)
    reporter_contact = Column(String, nullable=True)
    status = Column(Enum(ReportStatus), default=ReportStatus.open)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=gen_uuid)
    actor = Column(String, nullable=True)
    action = Column(String, nullable=False)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AlertLog(Base):
    """Tracks all emergency SMS and Email alerts dispatched for a child or incident."""
    __tablename__ = "alert_logs"

    id = Column(String, primary_key=True, default=gen_uuid)
    child_id = Column(String, ForeignKey("children.id"), nullable=False)
    scan_event_id = Column(String, ForeignKey("scan_events.id"), nullable=True)
    channel = Column(String, nullable=False)  # "SMS" or "EMAIL"
    recipient = Column(String, nullable=False)
    subject = Column(String, nullable=True)
    message = Column(Text, nullable=False)
    status = Column(String, default="SENT")  # "SENT", "DELIVERED", "MOCK_DISPATCHED"
    created_at = Column(DateTime, default=datetime.utcnow)

