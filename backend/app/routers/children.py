import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.services.qr_service import generate_qr_png_base64, scan_url_for_token, get_lan_ip, get_base_url_for_mobile
from app.services.export_service import generate_incident_csv, generate_incident_pdf
from app.services.notify_service import send_test_email
from app.services.messaging_service import send_test_sms

router = APIRouter(prefix="/api/children", tags=["children"])


def _get_owned_child(child_id: str, user: models.User, db: Session) -> models.Child:
    child = db.query(models.Child).filter(models.Child.id == child_id).first()
    if not child or (not user.is_admin and child.parent_id != user.id):
        raise HTTPException(status_code=404, detail="Child profile not found")
    return child


@router.get("", response_model=list[schemas.ChildOut])
def list_children(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(models.Child).filter(models.Child.parent_id == current_user.id).all()


@router.post("", response_model=schemas.ChildOut, status_code=201)
def add_child(
    payload: schemas.ChildCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creates a new child profile with granular privacy controls, home address, and initial guardians."""
    data = payload.model_dump(exclude={"guardians"})
    guardians_data = payload.guardians or []

    child = models.Child(parent_id=current_user.id, **data)
    db.add(child)
    db.flush()  # Generates child.id

    # Add provided guardians
    for g in guardians_data:
        if g.name and g.name.strip():
            guardian = models.Guardian(
                child_id=child.id,
                name=g.name.strip(),
                relation=g.relation.strip() or "Guardian",
                phone=g.phone.strip() if g.phone else None,
                email=g.email.strip() if g.email else None,
                is_primary=g.is_primary,
                notify_sms=g.notify_sms,
                notify_email=g.notify_email,
                notification_method=g.notification_method or "all",
            )
            db.add(guardian)

    db.commit()
    db.refresh(child)
    return child


@router.get("/{child_id}", response_model=schemas.ChildOut)
def get_child(
    child_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_owned_child(child_id, current_user, db)


@router.patch("/{child_id}", response_model=schemas.ChildOut)
def update_child(
    child_id: str,
    payload: schemas.ChildUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(child, field, value)
    db.commit()
    db.refresh(child)
    return child


@router.delete("/{child_id}", status_code=204)
def delete_child(
    child_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    db.delete(child)
    db.commit()
    return None


# ---------- QR Code & Revocation ----------

@router.get("/{child_id}/qr")
def get_qr_code(
    child_id: str,
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    base_url = get_base_url_for_mobile()
    scan_url = scan_url_for_token(child.qr_token, base_url=base_url)
    is_prod = settings.environment == "production" or ("localhost" not in base_url and "127.0.0.1" not in base_url)
    lan_ip = get_lan_ip()

    return {
        "qr_image_base64": generate_qr_png_base64(child.qr_token, base_url=base_url),
        "scan_url": scan_url,
        "mobile_scan_url": scan_url if is_prod else f"http://{lan_ip}:5173/scan/{child.qr_token}",
        "local_scan_url": scan_url if is_prod else f"http://localhost:5173/scan/{child.qr_token}",
        "is_production": is_prod,
        "lan_ip": None if is_prod else lan_ip,
        "safeband_id": child.safeband_id,
        "display_name": child.display_name,
        "event_name": child.event_name,
        "expires_at": child.expires_at.strftime("%Y-%m-%d %H:%M") if child.expires_at else None,
    }


@router.post("/{child_id}/regenerate-qr")
def regenerate_qr(
    child_id: str,
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    child.qr_token = str(uuid.uuid4())
    db.commit()
    db.refresh(child)
    base_url = get_base_url_for_mobile()
    scan_url = scan_url_for_token(child.qr_token, base_url=base_url)
    is_prod = settings.environment == "production" or ("localhost" not in base_url and "127.0.0.1" not in base_url)
    lan_ip = get_lan_ip()

    return {
        "qr_image_base64": generate_qr_png_base64(child.qr_token, base_url=base_url),
        "scan_url": scan_url,
        "mobile_scan_url": scan_url if is_prod else f"http://{lan_ip}:5173/scan/{child.qr_token}",
        "is_production": is_prod,
    }


@router.post("/{child_id}/revoke")
def revoke_bracelet(
    child_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    child.is_active = False
    db.commit()
    return {"status": "revoked"}


@router.post("/{child_id}/reactivate")
def reactivate_bracelet(
    child_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    child.is_active = True
    db.commit()
    return {"status": "active"}


@router.post("/{child_id}/lost-mode/{state}")
def set_lost_mode(
    child_id: str,
    state: bool,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    child.lost_mode = state
    db.commit()
    return {"lost_mode": child.lost_mode}


# ---------- Safe Zone & Event Mode ----------

@router.patch("/{child_id}/safe-zone", response_model=schemas.ChildOut)
def update_safe_zone(
    child_id: str,
    payload: schemas.SafeZoneUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    child.safe_zone_name = payload.safe_zone_name
    child.safe_zone_lat = payload.safe_zone_lat
    child.safe_zone_lng = payload.safe_zone_lng
    child.safe_zone_radius_m = payload.safe_zone_radius_m or 500.0
    db.commit()
    db.refresh(child)
    return child


@router.patch("/{child_id}/event-mode", response_model=schemas.ChildOut)
def update_event_mode(
    child_id: str,
    payload: schemas.EventModeUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    child.is_event_bracelet = payload.is_event_bracelet
    child.event_name = payload.event_name
    child.expires_at = payload.expires_at
    db.commit()
    db.refresh(child)
    return child


# ---------- Guardians ----------

@router.get("/{child_id}/guardians", response_model=list[schemas.GuardianOut])
def list_guardians(
    child_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    return db.query(models.Guardian).filter(models.Guardian.child_id == child.id).all()


@router.post("/{child_id}/guardians", response_model=schemas.GuardianOut, status_code=201)
def add_guardian(
    child_id: str,
    payload: schemas.GuardianCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    guardian = models.Guardian(child_id=child.id, **payload.model_dump())
    db.add(guardian)
    db.commit()
    db.refresh(guardian)
    return guardian


@router.delete("/{child_id}/guardians/{guardian_id}", status_code=204)
def delete_guardian(
    child_id: str,
    guardian_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    guardian = (
        db.query(models.Guardian)
        .filter(models.Guardian.id == guardian_id, models.Guardian.child_id == child.id)
        .first()
    )
    if not guardian:
        raise HTTPException(status_code=404, detail="Guardian not found")
    db.delete(guardian)
    db.commit()
    return None


# ---------- Scans & Incident Exports ----------

@router.get("/{child_id}/scans", response_model=list[schemas.ScanEventOut])
def scan_history(
    child_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    return (
        db.query(models.ScanEvent)
        .filter(models.ScanEvent.child_id == child.id)
        .order_by(models.ScanEvent.scanned_at.desc())
        .all()
    )


@router.post("/{child_id}/scans/{scan_id}/resolve")
def resolve_scan(
    child_id: str,
    scan_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    scan = (
        db.query(models.ScanEvent)
        .filter(models.ScanEvent.id == scan_id, models.ScanEvent.child_id == child.id)
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan event not found")
    scan.resolved = True
    scan.resolved_at = datetime.utcnow()
    db.commit()
    return {"status": "resolved"}


@router.get("/{child_id}/scans/{scan_id}/export/csv")
def export_incident_csv(
    child_id: str,
    scan_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    scan = (
        db.query(models.ScanEvent)
        .filter(models.ScanEvent.id == scan_id, models.ScanEvent.child_id == child.id)
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan event not found")

    csv_data = generate_incident_csv(child, scan, db)
    filename = f"incident_{child.safeband_id}_{scan.id[:8]}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/{child_id}/scans/{scan_id}/export/pdf")
def export_incident_pdf(
    child_id: str,
    scan_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = _get_owned_child(child_id, current_user, db)
    scan = (
        db.query(models.ScanEvent)
        .filter(models.ScanEvent.id == scan_id, models.ScanEvent.child_id == child.id)
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan event not found")

    pdf_bytes = generate_incident_pdf(child, scan, db)
    filename = f"police_incident_{child.safeband_id}_{scan.id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/{child_id}/alerts", response_model=list[schemas.AlertLogOut])
def get_child_alerts(
    child_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns SMS and Email emergency alerts dispatched for this child and their incidents."""
    child = _get_owned_child(child_id, current_user, db)
    return (
        db.query(models.AlertLog)
        .filter(models.AlertLog.child_id == child.id)
        .order_by(models.AlertLog.created_at.desc())
        .limit(50)
        .all()
    )


@router.post("/{child_id}/test-alerts")
def test_child_alerts(
    child_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sends immediate test notifications (Email and SMS) to the user to verify provider connectivity."""
    child = _get_owned_child(child_id, current_user, db)
    results = []

    # 1. Primary Email test
    if current_user.email:
        _, email_status = send_test_email(current_user.email)
        log_e = models.AlertLog(
            child_id=child.id,
            channel="EMAIL",
            recipient=current_user.email,
            subject="🧪 SafeBand Test Alert",
            message="Test email dispatch to verify SMTP connectivity.",
            status=email_status,
            created_at=datetime.utcnow(),
        )
        db.add(log_e)
        results.append({"channel": "EMAIL", "recipient": current_user.email, "status": email_status})

    # 2. Primary SMS test
    if current_user.phone_number:
        _, sms_status = send_test_sms(current_user.phone_number)
        log_s = models.AlertLog(
            child_id=child.id,
            channel="SMS",
            recipient=current_user.phone_number,
            subject=None,
            message="SafeBand Test Alert: Verification SMS dispatched.",
            status=sms_status,
            created_at=datetime.utcnow(),
        )
        db.add(log_s)
        results.append({"channel": "SMS", "recipient": current_user.phone_number, "status": sms_status})

    db.commit()
    return {
        "status": "tested",
        "results": results,
        "message": "Test notifications triggered. Review status badges below."
    }


