from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user
from app.services.qr_service import generate_qr_png_base64, scan_url_for_token

router = APIRouter(prefix="/api/bulk", tags=["bulk"])


@router.post("/children", response_model=schemas.BulkChildResponse, status_code=201)
def bulk_register_children(
    payload: schemas.BulkChildCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Registers multiple children at once (ideal for school trips, camps, festivals, events)."""
    if not payload.children:
        raise HTTPException(status_code=400, detail="No children provided for registration.")

    created_children = []

    for item in payload.children:
        child = models.Child(
            parent_id=current_user.id,
            display_name=item.display_name.strip(),
            medical_info=item.medical_info.strip() if item.medical_info else None,
            show_medical_info_publicly=bool(item.medical_info),
            show_photo_publicly=False,
            is_event_bracelet=bool(payload.event_name or payload.expires_at),
            event_name=payload.event_name,
            expires_at=payload.expires_at,
            safe_zone_name=payload.safe_zone_name,
            safe_zone_lat=payload.safe_zone_lat,
            safe_zone_lng=payload.safe_zone_lng,
            safe_zone_radius_m=payload.safe_zone_radius_m or 500.0,
        )
        db.add(child)
        db.flush()  # Generate child.id

        # If emergency contact details supplied, register as secondary guardian
        if item.emergency_contact_name:
            guardian = models.Guardian(
                child_id=child.id,
                name=item.emergency_contact_name.strip(),
                relation=item.emergency_contact_relation or "Emergency Contact",
                phone=item.emergency_contact_phone,
                is_primary=False,
                notify_sms=bool(item.emergency_contact_phone),
                notify_email=False,
            )
            db.add(guardian)

        created_children.append(child)

    db.commit()
    for c in created_children:
        db.refresh(c)

    return schemas.BulkChildResponse(
        created_count=len(created_children),
        children=created_children
    )


@router.post("/batch-print-data")
def get_batch_print_data(
    child_ids: list[str],
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns printable bracelet payload (QR base64, ID, Name, Event Name, Expiry) for batch printing."""
    children = (
        db.query(models.Child)
        .filter(models.Child.id.in_(child_ids), models.Child.parent_id == current_user.id)
        .all()
    )

    results = []
    for c in children:
        results.append({
            "id": c.id,
            "display_name": c.display_name,
            "safeband_id": c.safeband_id,
            "event_name": c.event_name,
            "expires_at": c.expires_at.strftime("%Y-%m-%d %H:%M") if c.expires_at else None,
            "qr_image_base64": generate_qr_png_base64(c.qr_token),
            "scan_url": scan_url_for_token(c.qr_token),
            "medical_info": c.medical_info if c.show_medical_info_publicly else None,
            "emergency_phone": c.parent.phone_number if c.parent else None,
        })

    return {"bracelets": results}
