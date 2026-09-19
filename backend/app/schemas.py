from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, ConfigDict, computed_field


# ---------- Auth ----------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    phone_number: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    full_name: str
    phone_number: Optional[str] = None
    is_admin: bool
    created_at: datetime


# ---------- Guardians ----------

class GuardianCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    relation: str = Field(min_length=1, max_length=50)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    is_primary: bool = False
    notify_sms: bool = True
    notify_email: bool = True
    notification_method: Optional[str] = "all"  # "sms", "email", "in_app", "all"


class GuardianOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    child_id: str
    name: str
    relation: str
    phone: Optional[str] = None
    email: Optional[str] = None
    is_primary: bool
    notify_sms: bool
    notify_email: bool
    notification_method: Optional[str] = "all"
    created_at: datetime


# ---------- SafeZone & Event Mode ----------

class SafeZoneUpdate(BaseModel):
    safe_zone_name: Optional[str] = None
    safe_zone_lat: Optional[float] = None
    safe_zone_lng: Optional[float] = None
    safe_zone_radius_m: Optional[float] = 500.0


class EventModeUpdate(BaseModel):
    is_event_bracelet: bool
    event_name: Optional[str] = None
    expires_at: Optional[datetime] = None


# ---------- Incident Location Pings & Chat Messages ----------

class LocationPingCreate(BaseModel):
    latitude: float
    longitude: float
    accuracy_m: Optional[float] = None


class LocationPingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    scan_event_id: str
    lat: float
    lng: float
    accuracy_m: Optional[float] = None
    timestamp: datetime


class IncidentMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    sender_type: str = "scanner"  # "scanner" or "guardian"
    session_token: Optional[str] = None


class IncidentMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    scan_event_id: str
    sender_type: str
    sender_name: Optional[str] = None
    message: str
    created_at: datetime


# ---------- Children (parent-facing, full detail) ----------

class ChildCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)
    dob: Optional[str] = None  # YYYY-MM-DD
    gender: Optional[str] = None
    preferred_language: Optional[str] = "en"
    photo_url: Optional[str] = None

    # Medical info & instructions
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    emergency_instructions: Optional[str] = None
    medical_info: Optional[str] = None

    # Granular Visibility controls (sensitive private by default)
    show_photo_publicly: bool = False
    show_age_publicly: bool = False
    show_blood_group_publicly: bool = False
    show_allergies_publicly: bool = False
    show_emergency_instructions_publicly: bool = False
    show_medical_info_publicly: bool = False

    # Home address (STRICTLY PRIVATE - never exposed publicly)
    address_line: Optional[str] = None
    area_locality: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

    # Multi-guardians support during registration
    guardians: Optional[list[GuardianCreate]] = None

    # Optional event mode settings
    is_event_bracelet: bool = False
    event_name: Optional[str] = None
    expires_at: Optional[datetime] = None

    # Optional geofence safe zone
    safe_zone_name: Optional[str] = None
    safe_zone_lat: Optional[float] = None
    safe_zone_lng: Optional[float] = None
    safe_zone_radius_m: Optional[float] = 500.0


class ChildUpdate(BaseModel):
    display_name: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    preferred_language: Optional[str] = None
    photo_url: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    emergency_instructions: Optional[str] = None
    medical_info: Optional[str] = None

    show_photo_publicly: Optional[bool] = None
    show_age_publicly: Optional[bool] = None
    show_blood_group_publicly: Optional[bool] = None
    show_allergies_publicly: Optional[bool] = None
    show_emergency_instructions_publicly: Optional[bool] = None
    show_medical_info_publicly: Optional[bool] = None

    address_line: Optional[str] = None
    area_locality: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

    is_event_bracelet: Optional[bool] = None
    event_name: Optional[str] = None
    expires_at: Optional[datetime] = None
    safe_zone_name: Optional[str] = None
    safe_zone_lat: Optional[float] = None
    safe_zone_lng: Optional[float] = None
    safe_zone_radius_m: Optional[float] = None


class ChildOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    display_name: str
    dob: Optional[str] = None
    gender: Optional[str] = None
    preferred_language: Optional[str] = "en"
    photo_url: Optional[str] = None

    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    emergency_instructions: Optional[str] = None
    medical_info: Optional[str] = None

    show_photo_publicly: bool = False
    show_age_publicly: bool = False
    show_blood_group_publicly: bool = False
    show_allergies_publicly: bool = False
    show_emergency_instructions_publicly: bool = False
    show_medical_info_publicly: bool = False

    # Private address (returned only to authenticated parent/guardian)
    address_line: Optional[str] = None
    area_locality: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

    safeband_id: str
    qr_token: str
    is_active: bool
    lost_mode: bool

    is_event_bracelet: bool = False
    event_name: Optional[str] = None
    expires_at: Optional[datetime] = None

    safe_zone_name: Optional[str] = None
    safe_zone_lat: Optional[float] = None
    safe_zone_lng: Optional[float] = None
    safe_zone_radius_m: Optional[float] = 500.0
    created_at: datetime
    guardians: list[GuardianOut] = []

    @computed_field
    @property
    def age(self) -> Optional[int]:
        if not self.dob:
            return None
        try:
            d = datetime.strptime(self.dob, "%Y-%m-%d").date()
            today = date.today()
            return today.year - d.year - ((today.month, today.day) < (d.month, d.day))
        except Exception:
            return None


# ---------- Bulk Registration ----------

class BulkChildItem(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)
    dob: Optional[str] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    emergency_instructions: Optional[str] = None
    medical_info: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = "Guardian"


class BulkChildCreate(BaseModel):
    event_name: Optional[str] = None
    expires_at: Optional[datetime] = None
    safe_zone_name: Optional[str] = None
    safe_zone_lat: Optional[float] = None
    safe_zone_lng: Optional[float] = None
    safe_zone_radius_m: Optional[float] = 500.0
    children: list[BulkChildItem]


class BulkChildResponse(BaseModel):
    created_count: int
    children: list[ChildOut]


# ---------- Public scan-facing (minimum necessary data) ----------
# Home address is STRICTLY EXCLUDED here. Sensitive items are only populated if opted-in.

class PublicChildOut(BaseModel):
    display_name: str
    photo_url: Optional[str] = None
    age: Optional[int] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    emergency_instructions: Optional[str] = None
    medical_info: Optional[str] = None
    preferred_language: Optional[str] = "en"
    safeband_id: str
    lost_mode: bool
    message: str = "This child may be separated from their guardian."
    is_expired: bool = False
    event_name: Optional[str] = None
    expires_at: Optional[datetime] = None
    session_token: Optional[str] = None
    scan_event_id: Optional[str] = None
    safe_zone_configured: bool = False
    geofence_safe: Optional[bool] = None


class LocationSubmit(BaseModel):
    latitude: float
    longitude: float
    accuracy_m: Optional[float] = None
    session_token: Optional[str] = None
    scanner_name: Optional[str] = None
    scanner_phone: Optional[str] = None


class ReportSubmit(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)
    reporter_contact: Optional[str] = None


# ---------- Scan history (parent-facing) ----------

class ScanEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    session_token: Optional[str] = None
    scanned_at: datetime
    approx_lat: Optional[float] = None
    approx_lng: Optional[float] = None
    location_accuracy_m: Optional[float] = None
    location_shared: bool
    contact_revealed: bool
    marked_found: bool
    resolved: bool
    resolved_at: Optional[datetime] = None
    geofence_violation: bool = False
    scanner_name: Optional[str] = None
    scanner_phone: Optional[str] = None
    pings: list[LocationPingOut] = []
    messages: list[IncidentMessageOut] = []


# ---------- Admin ----------

class AdminStats(BaseModel):
    total_users: int
    total_children: int
    total_scans: int
    open_reports: int
    suspended_users: int


class AbuseReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    child_id: Optional[str]
    reason: str
    status: str
    created_at: datetime


class AlertLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    child_id: str
    scan_event_id: Optional[str] = None
    channel: str
    recipient: str
    subject: Optional[str] = None
    message: str
    status: str
    created_at: datetime

