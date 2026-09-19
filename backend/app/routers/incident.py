from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user_optional
from app.services.messaging_service import sanitize_location

router = APIRouter(prefix="/api/incident", tags=["incident-live"])


def _verify_incident_access(
    event_id: str,
    db: Session,
    session_token: Optional[str] = None,
    current_user: Optional[models.User] = None,
) -> models.ScanEvent:
    """Verifies that either:
    1. The requester is the scanner with the valid session_token for this scan event, OR
    2. The requester is the authenticated parent/admin of the child.
    """
    scan = db.query(models.ScanEvent).filter(models.ScanEvent.id == event_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Incident scan session not found")

    # Scanner session token match
    if session_token and scan.session_token == session_token:
        return scan

    # Authenticated guardian match
    if current_user:
        if current_user.is_admin or scan.child.parent_id == current_user.id:
            return scan

    raise HTTPException(
        status_code=403,
        detail="Unauthorized. Valid session token or guardian login required."
    )


@router.post("/{event_id}/ping", response_model=schemas.LocationPingOut)
def record_location_ping(
    event_id: str,
    payload: schemas.LocationPingCreate,
    x_session_token: Optional[str] = Header(None, alias="X-Session-Token"),
    session_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Called periodically by scanner device during active 'Share Live Updates' mode."""
    active_token = x_session_token or session_token
    scan = _verify_incident_access(event_id, db, session_token=active_token)

    raw_lat = round(payload.latitude, 5)
    raw_lng = round(payload.longitude, 5)
    clean_lat, clean_lng = sanitize_location(raw_lat, raw_lng, payload.accuracy_m, getattr(scan.child, 'city', None))

    ping = models.LocationPing(
        scan_event_id=scan.id,
        lat=clean_lat,
        lng=clean_lng,
        accuracy_m=payload.accuracy_m,
        timestamp=datetime.utcnow(),
    )
    db.add(ping)

    # Update latest scan event location as well
    scan.approx_lat = clean_lat
    scan.approx_lng = clean_lng
    scan.location_accuracy_m = ping.accuracy_m
    scan.location_shared = True
    db.commit()
    db.refresh(ping)
    return ping


@router.get("/{event_id}/locations", response_model=list[schemas.LocationPingOut])
def get_location_pings(
    event_id: str,
    x_session_token: Optional[str] = Header(None, alias="X-Session-Token"),
    session_token: Optional[str] = Query(None),
    current_user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Returns the ordered breadcrumbs of GPS coordinates for live map tracking."""
    active_token = x_session_token or session_token
    scan = _verify_incident_access(event_id, db, session_token=active_token, current_user=current_user)

    return (
        db.query(models.LocationPing)
        .filter(models.LocationPing.scan_event_id == scan.id)
        .order_by(models.LocationPing.timestamp.asc())
        .all()
    )


@router.get("/{event_id}/chat", response_model=list[schemas.IncidentMessageOut])
def get_incident_messages(
    event_id: str,
    x_session_token: Optional[str] = Header(None, alias="X-Session-Token"),
    session_token: Optional[str] = Query(None),
    current_user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Fetches chat messages for the incident between finder and guardian."""
    active_token = x_session_token or session_token
    scan = _verify_incident_access(event_id, db, session_token=active_token, current_user=current_user)

    return (
        db.query(models.IncidentMessage)
        .filter(models.IncidentMessage.scan_event_id == scan.id)
        .order_by(models.IncidentMessage.created_at.asc())
        .all()
    )


@router.post("/{event_id}/chat", response_model=schemas.IncidentMessageOut)
def send_incident_message(
    event_id: str,
    payload: schemas.IncidentMessageCreate,
    x_session_token: Optional[str] = Header(None, alias="X-Session-Token"),
    session_token: Optional[str] = Query(None),
    current_user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Sends a masked chat message from either the scanner or the guardian."""
    active_token = payload.session_token or x_session_token or session_token
    scan = _verify_incident_access(event_id, db, session_token=active_token, current_user=current_user)

    sender_type = payload.sender_type
    sender_name = "Scanner" if sender_type == "scanner" else "Guardian"

    if current_user and scan.child.parent_id == current_user.id:
        sender_type = "guardian"
        sender_name = "Guardian"

    msg = models.IncidentMessage(
        scan_event_id=scan.id,
        sender_type=sender_type,
        sender_name=sender_name,
        message=payload.message.strip(),
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg
