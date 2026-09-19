from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services.messaging_service import (
    calculate_haversine_distance_m,
    sanitize_location,
    dispatch_scan_alert,
    dispatch_found_alert,
)

router = APIRouter(prefix="/api/scan", tags=["public-scan"])


def _get_child_by_token(qr_token: str, db: Session) -> models.Child:
    child = db.query(models.Child).filter(models.Child.qr_token == qr_token).first()
    if not child or not child.is_active:
        raise HTTPException(
            status_code=404,
            detail="This SafeBand code is not valid or has been deactivated."
        )
    return child


def _calculate_age(dob_str: str) -> int | None:
    if not dob_str:
        return None
    try:
        d = datetime.strptime(dob_str, "%Y-%m-%d").date()
        today = date.today()
        return today.year - d.year - ((today.month, today.day) < (d.month, d.day))
    except Exception:
        return None


@router.get("/{qr_token}", response_model=schemas.PublicChildOut)
def view_public_profile(
    qr_token: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Public, no-auth endpoint. Returns minimum necessary data.
    Sensitive information (home address, personal guardian details) is strictly omitted.
    Medical advisories and age are returned ONLY if the parent explicitly permitted public visibility."""
    child = _get_child_by_token(qr_token, db)

    # Check for Bracelet Expiry
    now = datetime.utcnow()
    is_expired = False
    if child.expires_at and now > child.expires_at:
        is_expired = True

    if is_expired:
        return schemas.PublicChildOut(
            display_name=child.display_name,
            photo_url=child.photo_url if child.show_photo_publicly else None,
            age=_calculate_age(child.dob) if child.show_age_publicly else None,
            blood_group=child.blood_group if child.show_blood_group_publicly else None,
            allergies=child.allergies if child.show_allergies_publicly else None,
            emergency_instructions=child.emergency_instructions if child.show_emergency_instructions_publicly else None,
            medical_info=child.medical_info if child.show_medical_info_publicly else None,
            preferred_language=child.preferred_language or "en",
            safeband_id=child.safeband_id,
            lost_mode=False,
            message="This SafeBand event bracelet has expired. Please contact event staff or registration booth.",
            is_expired=True,
            event_name=child.event_name,
            expires_at=child.expires_at,
            safe_zone_configured=bool(child.safe_zone_lat and child.safe_zone_lng),
        )

    # Valid scan: attach to existing unresolved scan event within 24h, or create new
    now_utc = datetime.utcnow()
    recent_cutoff = now_utc - timedelta(hours=24)
    scan = (
        db.query(models.ScanEvent)
        .filter(
            models.ScanEvent.child_id == child.id,
            models.ScanEvent.resolved == False,
            models.ScanEvent.scanned_at >= recent_cutoff,
        )
        .order_by(models.ScanEvent.scanned_at.desc())
        .first()
    )

    is_new_scan = False
    if not scan:
        scan = models.ScanEvent(
            child_id=child.id,
            scanner_user_agent=request.headers.get("user-agent", "")[:255],
        )
        db.add(scan)
        db.commit()
        db.refresh(scan)
        is_new_scan = True
    else:
        user_agent = request.headers.get("user-agent", "")[:255]
        if user_agent:
            scan.scanner_user_agent = user_agent
            db.commit()

    # Multi-guardian notification dispatch in background on first scan
    if is_new_scan:
        background_tasks.add_task(
            dispatch_scan_alert,
            child=child.id,
            scan_event=scan.id,
            is_geofence_violation=False,
        )

    return schemas.PublicChildOut(
        display_name=child.display_name,
        photo_url=child.photo_url if child.show_photo_publicly else None,
        age=_calculate_age(child.dob) if child.show_age_publicly else None,
        blood_group=child.blood_group if child.show_blood_group_publicly else None,
        allergies=child.allergies if child.show_allergies_publicly else None,
        emergency_instructions=child.emergency_instructions if child.show_emergency_instructions_publicly else None,
        medical_info=child.medical_info if child.show_medical_info_publicly else None,
        preferred_language=child.preferred_language or "en",
        safeband_id=child.safeband_id,
        lost_mode=child.lost_mode,
        is_expired=False,
        event_name=child.event_name,
        expires_at=child.expires_at,
        session_token=scan.session_token,
        scan_event_id=scan.id,
        safe_zone_configured=bool(child.safe_zone_lat and child.safe_zone_lng),
    )


@router.post("/{qr_token}/location")
def submit_location(
    qr_token: str,
    payload: schemas.LocationSubmit,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Called when scanner grants GPS permission.
    Calculates geofence distance (inside safe-zone radius -> no alert; outside -> triggers breach alert)."""
    child = _get_child_by_token(qr_token, db)

    # Check for Expiry
    if child.expires_at and datetime.utcnow() > child.expires_at:
        raise HTTPException(status_code=410, detail="Bracelet has expired.")

    # Match latest scan event
    scan = (
        db.query(models.ScanEvent)
        .filter(models.ScanEvent.child_id == child.id)
        .order_by(models.ScanEvent.scanned_at.desc())
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="No scan event found to attach location to")

    raw_lat = round(payload.latitude, 5)
    raw_lng = round(payload.longitude, 5)
    lat, lng = sanitize_location(raw_lat, raw_lng, payload.accuracy_m, child.city)

    scan.approx_lat = lat
    scan.approx_lng = lng
    scan.location_accuracy_m = payload.accuracy_m
    scan.location_shared = True
    if payload.scanner_name:
        scan.scanner_name = payload.scanner_name
    if payload.scanner_phone:
        scan.scanner_phone = payload.scanner_phone

    # Record breadcrumb ping
    ping = models.LocationPing(
        scan_event_id=scan.id,
        lat=lat,
        lng=lng,
        accuracy_m=payload.accuracy_m,
        timestamp=datetime.utcnow(),
    )
    db.add(ping)

    # Geofence Distance Calculation:
    is_violation = False
    distance_m = None
    if child.safe_zone_lat is not None and child.safe_zone_lng is not None:
        distance_m = calculate_haversine_distance_m(
            child.safe_zone_lat, child.safe_zone_lng, lat, lng
        )
        radius = child.safe_zone_radius_m or 500.0
        if distance_m > radius:
            is_violation = True
            scan.geofence_violation = True
        else:
            scan.geofence_violation = False

    db.commit()

    # Dispatch alerts to all guardians
    background_tasks.add_task(
        dispatch_scan_alert,
        child=child.id,
        scan_event=scan.id,
        is_geofence_violation=is_violation,
        distance_m=distance_m,
    )

    return {
        "status": "location_received",
        "geofence_violation": is_violation,
        "distance_m": round(distance_m, 1) if distance_m is not None else None,
        "safe_zone_radius_m": child.safe_zone_radius_m if child.safe_zone_lat else None,
        "session_token": scan.session_token,
        "scan_event_id": scan.id,
    }


@router.get("/{qr_token}/contact")
def reveal_contact(qr_token: str, db: Session = Depends(get_db)):
    """Reveals guardian phone number(s) on explicit scanner action. Home address is NEVER included."""
    child = _get_child_by_token(qr_token, db)

    scan = (
        db.query(models.ScanEvent)
        .filter(models.ScanEvent.child_id == child.id)
        .order_by(models.ScanEvent.scanned_at.desc())
        .first()
    )
    if scan:
        scan.contact_revealed = True
        db.commit()

    contacts = []
    if child.parent and child.parent.phone_number:
        contacts.append({
            "name": child.parent.full_name,
            "relation": "Primary Account Guardian",
            "phone_number": child.parent.phone_number,
        })

    guardians = db.query(models.Guardian).filter(models.Guardian.child_id == child.id).all()
    for g in guardians:
        if g.phone:
            contacts.append({
                "name": g.name,
                "relation": g.relation,
                "phone_number": g.phone,
            })

    if not contacts:
        return {
            "contacts": [],
            "phone_number": None,
            "message": "No emergency phone contacts on file for this child."
        }

    return {
        "contacts": contacts,
        "phone_number": contacts[0]["phone_number"]
    }


@router.post("/{qr_token}/mark-found")
def mark_found(
    qr_token: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    child = _get_child_by_token(qr_token, db)
    scan = (
        db.query(models.ScanEvent)
        .filter(models.ScanEvent.child_id == child.id)
        .order_by(models.ScanEvent.scanned_at.desc())
        .first()
    )
    if scan:
        scan.marked_found = True
        db.commit()

    background_tasks.add_task(
        dispatch_found_alert,
        child=child.id,
        scan_event=scan.id if scan else None,
    )
    return {"status": "guardian_notified"}


@router.post("/{qr_token}/report")
def report_abuse(qr_token: str, payload: schemas.ReportSubmit, db: Session = Depends(get_db)):
    child = db.query(models.Child).filter(models.Child.qr_token == qr_token).first()
    report = models.AbuseReport(
        child_id=child.id if child else None,
        reason=payload.reason,
        reporter_contact=payload.reporter_contact,
    )
    db.add(report)
    db.commit()
    return {"status": "report_submitted"}
