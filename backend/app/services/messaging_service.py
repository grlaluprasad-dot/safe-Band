import logging
import math
import base64
import json
import urllib.request
import urllib.parse
from datetime import datetime
from typing import Optional, Union
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.database import SessionLocal
from app.services.notify_service import send_email

logger = logging.getLogger("safeband.messaging")


def sanitize_location(lat: Optional[float], lng: Optional[float], accuracy_m: Optional[float] = None, city_hint: Optional[str] = None) -> tuple[Optional[float], Optional[float]]:
    """Validates and formats geographic coordinates to 5 decimal places."""
    if lat is None or lng is None:
        return lat, lng
    try:
        f_lat = float(lat)
        f_lng = float(lng)
        if not (-90.0 <= f_lat <= 90.0 and -180.0 <= f_lng <= 180.0):
            return None, None
        return round(f_lat, 5), round(f_lng, 5)
    except (TypeError, ValueError):
        return None, None


def calculate_haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates distance between two coordinates in meters using the Haversine formula."""
    R = 6371000  # Radius of earth in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def send_sms_alert(phone_number: str, message: str) -> tuple[bool, str]:
    """Dispatches SMS alert. Supports Twilio, Fast2SMS, or dev simulated dispatch.
    Returns (success: bool, status_label: str)."""
    if not phone_number:
        return False, "SKIPPED_NO_PHONE"

    clean_digits = "".join(filter(str.isdigit, phone_number))
    if len(clean_digits) < 10:
        logger.warning("[SMS SKIPPED] Phone number '%s' is too short (min 10 digits required)", phone_number)
        return False, f"SKIPPED_INVALID_PHONE ({phone_number})"

    target_10digit = clean_digits[-10:]

    # 1. Twilio SMS
    if settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_phone:
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
            auth_str = f"{settings.twilio_account_sid}:{settings.twilio_auth_token}"
            auth_header = "Basic " + base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
            data = urllib.parse.urlencode({
                "To": phone_number if phone_number.startswith("+") else f"+91{target_10digit}",
                "From": settings.twilio_from_phone,
                "Body": message,
            }).encode("utf-8")

            req = urllib.request.Request(url, data=data, method="POST")
            req.add_header("Authorization", auth_header)
            with urllib.request.urlopen(req, timeout=10) as response:
                if 200 <= response.status < 300:
                    logger.info("[TWILIO SMS DELIVERED] To: %s", phone_number)
                    return True, "DELIVERED (Twilio)"
        except Exception as e:
            logger.error("[TWILIO SMS ERROR] Failed to send to %s: %s", phone_number, e)
            return False, f"TWILIO_ERROR: {str(e)[:50]}"

    # 2. Fast2SMS (popular in India for Kannada/Telugu/Hindi alerts)
    if settings.fast2sms_api_key:
        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            payload = json.dumps({
                "route": "q",
                "message": message[:160],  # Quick SMS length constraint
                "language": "english",
                "flash": 0,
                "numbers": target_10digit,
            }).encode("utf-8")

            req = urllib.request.Request(url, data=payload, method="POST")
            req.add_header("authorization", settings.fast2sms_api_key)
            req.add_header("Content-Type", "application/json")
            with urllib.request.urlopen(req, timeout=10) as response:
                resp_text = response.read().decode("utf-8", errors="ignore")
                try:
                    resp_json = json.loads(resp_text)
                    if resp_json.get("return") is True:
                        logger.info("[FAST2SMS DELIVERED] To: %s | Resp: %s", phone_number, resp_text)
                        return True, "DELIVERED (Fast2SMS)"
                    else:
                        logger.warning("[FAST2SMS REJECTED] %s", resp_text)
                        return False, f"FAST2SMS_REJECTED: {resp_json.get('message', 'Rejected')[:40]}"
                except Exception:
                    if 200 <= response.status < 300:
                        return True, "DELIVERED (Fast2SMS)"
        except Exception as e:
            logger.error("[FAST2SMS ERROR] Failed to send to %s: %s", phone_number, e)
            return False, f"FAST2SMS_ERROR: {str(e)[:50]}"

    # 3. Dev / Simulated SMS Dispatch
    logger.info("[SIMULATED SMS DISPATCH] To: %s | Message: %s", phone_number, message)
    return True, "SIMULATED (No SMS API Key in .env)"


def send_test_sms(phone_number: str) -> tuple[bool, str]:
    """Sends a verification SMS to confirm cellular gateway connectivity."""
    msg = "SafeBand Test: SMS alert gateway connected successfully. 24/7 Child Safety System."
    return send_sms_alert(phone_number, msg)



def _record_alert_log(
    db: Session,
    child_id: str,
    scan_event_id: Optional[str],
    channel: str,
    recipient: str,
    subject: Optional[str],
    message: str,
    status: str,
):
    try:
        log_entry = models.AlertLog(
            child_id=child_id,
            scan_event_id=scan_event_id,
            channel=channel,
            recipient=recipient,
            subject=subject,
            message=message,
            status=status,
            created_at=datetime.utcnow(),
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        logger.warning("Failed to record AlertLog: %s", e)
        db.rollback()


def dispatch_scan_alert(
    child: Union[models.Child, str],
    scan_event: Union[models.ScanEvent, str, None] = None,
    db: Optional[Session] = None,
    is_geofence_violation: bool = False,
    distance_m: Optional[float] = None,
    child_id: Optional[str] = None,
    scan_event_id: Optional[str] = None,
) -> None:
    """Dispatches alerts to the primary parent and all registered guardians.
    Safely creates own DB session if executed in async background task."""
    owns_session = False
    active_db = db

    try:
        # Resolve DB session
        if active_db is None or not active_db.is_active:
            active_db = SessionLocal()
            owns_session = True

        # Resolve child instance
        cid = child_id or (child.id if hasattr(child, "id") else str(child))
        child_obj = active_db.query(models.Child).filter(models.Child.id == cid).first()
        if not child_obj:
            logger.warning("dispatch_scan_alert: Child %s not found", cid)
            return

        # Resolve scan event instance
        eid = scan_event_id or (scan_event.id if hasattr(scan_event, "id") else (str(scan_event) if scan_event else None))
        scan_obj = active_db.query(models.ScanEvent).filter(models.ScanEvent.id == eid).first() if eid else None

        subject = f"🚨 SafeBand Alert: {child_obj.display_name}'s bracelet was scanned!"
        dashboard_url = f"{settings.frontend_base_url}/children/{child_obj.id}"

        has_coords = bool(scan_obj and scan_obj.approx_lat is not None and scan_obj.approx_lng is not None)
        if has_coords:
            c_lat, c_lng = sanitize_location(scan_obj.approx_lat, scan_obj.approx_lng, scan_obj.location_accuracy_m, child_obj.city)
            maps_url = f"https://maps.google.com/?q={c_lat},{c_lng}"
        else:
            maps_url = None

        finder_info = ""
        if scan_obj and (scan_obj.scanner_name or scan_obj.scanner_phone):
            parts = []
            if scan_obj.scanner_name:
                parts.append(f"Finder: {scan_obj.scanner_name}")
            if scan_obj.scanner_phone:
                parts.append(f"Phone: {scan_obj.scanner_phone}")
            finder_info = f" ({', '.join(parts)})"

        if is_geofence_violation:
            dist_str = f" (~{int(distance_m)}m away)" if distance_m else ""
            alert_body = (
                f"URGENT GEOFENCE VIOLATION: {child_obj.display_name} was scanned OUTSIDE their "
                f"designated safe zone '{child_obj.safe_zone_name or 'Safe Zone'}'{dist_str}.\n"
            )
        elif has_coords:
            acc_str = f" (Accuracy: ±{int(scan_obj.location_accuracy_m)}m)" if scan_obj.location_accuracy_m else ""
            alert_body = (
                f"{child_obj.display_name}'s SafeBand QR was scanned and live GPS location was shared!{finder_info}\n"
                f"📍 Google Maps Pin: {maps_url}{acc_str}\n"
            )
        else:
            alert_body = (
                f"{child_obj.display_name}'s SafeBand QR was scanned!{finder_info}\n"
                f"The scanner has not yet granted GPS permissions. Check your live dashboard for instant updates.\n"
            )

        alert_body += f"Incident Command Deck: {dashboard_url}"

        # SMS message (concise, high-priority)
        if maps_url:
            sms_msg = f"SafeBand Alert: {child_obj.display_name} scanned! Map: {maps_url} | Deck: {dashboard_url}"
        else:
            sms_msg = f"SafeBand Alert: {child_obj.display_name} scanned! Open dashboard: {dashboard_url}"

        # 1. Primary Parent Dispatch
        if child_obj.parent:
            if child_obj.parent.email:
                _, email_status = send_email(child_obj.parent.email, subject, alert_body)
                _record_alert_log(active_db, child_obj.id, eid, "EMAIL", child_obj.parent.email, subject, alert_body, email_status)

            if child_obj.parent.phone_number:
                _, status = send_sms_alert(child_obj.parent.phone_number, sms_msg)
                _record_alert_log(active_db, child_obj.id, eid, "SMS", child_obj.parent.phone_number, None, sms_msg, status)

        # 2. Registered Guardians Dispatch
        guardians = active_db.query(models.Guardian).filter(models.Guardian.child_id == child_obj.id).all()
        for g in guardians:
            if g.notify_email and g.email:
                g_subject = f"SafeBand Guardian Alert: {subject}"
                g_body = f"Dear {g.name} ({g.relation}),\n\n{alert_body}"
                _, email_status = send_email(g.email, g_subject, g_body)
                _record_alert_log(active_db, child_obj.id, eid, "EMAIL", g.email, g_subject, g_body, email_status)

            if g.notify_sms and g.phone:
                g_sms = f"SafeBand ({g.relation}): {child_obj.display_name} scanned! " + (f"Map: {maps_url}" if maps_url else f"Deck: {dashboard_url}")
                _, status = send_sms_alert(g.phone, g_sms)
                _record_alert_log(active_db, child_obj.id, eid, "SMS", g.phone, None, g_sms, status)

    except Exception as err:
        logger.exception("Error in dispatch_scan_alert: %s", err)
    finally:
        if owns_session and active_db:
            active_db.close()


def dispatch_found_alert(
    child: Union[models.Child, str],
    scan_event: Union[models.ScanEvent, str, None] = None,
    db: Optional[Session] = None,
    child_id: Optional[str] = None,
    scan_event_id: Optional[str] = None,
) -> None:
    """Notifies all guardians that the child was marked as found by the scanner.
    Safely creates own DB session if executed in async background task."""
    owns_session = False
    active_db = db

    try:
        # Resolve DB session
        if active_db is None or not active_db.is_active:
            active_db = SessionLocal()
            owns_session = True

        cid = child_id or (child.id if hasattr(child, "id") else str(child))
        child_obj = active_db.query(models.Child).filter(models.Child.id == cid).first()
        if not child_obj:
            logger.warning("dispatch_found_alert: Child %s not found", cid)
            return

        eid = scan_event_id or (scan_event.id if hasattr(scan_event, "id") else (str(scan_event) if scan_event else None))
        scan_obj = active_db.query(models.ScanEvent).filter(models.ScanEvent.id == eid).first() if eid else None

        dashboard_url = f"{settings.frontend_base_url}/children/{child_obj.id}"
        has_coords = bool(scan_obj and scan_obj.approx_lat is not None and scan_obj.approx_lng is not None)
        if has_coords:
            c_lat, c_lng = sanitize_location(scan_obj.approx_lat, scan_obj.approx_lng, scan_obj.location_accuracy_m, child_obj.city)
            maps_url = f"https://maps.google.com/?q={c_lat},{c_lng}"
        else:
            maps_url = None

        subject = f"✅ SafeBand: {child_obj.display_name} has been reported found!"
        body = (
            f"Great news! A finder scanning {child_obj.display_name}'s bracelet has marked them as found.\n\n"
        )
        if maps_url:
            body += f"📍 Reported Found Location: {maps_url}\n"
        body += f"Open your dashboard to coordinate reunification: {dashboard_url}"

        sms_msg = f"SafeBand: {child_obj.display_name} marked found! " + (f"Map: {maps_url} | " if maps_url else "") + f"Deck: {dashboard_url}"

        # 1. Primary Parent
        if child_obj.parent:
            if child_obj.parent.email:
                _, email_status = send_email(child_obj.parent.email, subject, body)
                _record_alert_log(active_db, child_obj.id, eid, "EMAIL", child_obj.parent.email, subject, body, email_status)

            if child_obj.parent.phone_number:
                _, status = send_sms_alert(child_obj.parent.phone_number, sms_msg)
                _record_alert_log(active_db, child_obj.id, eid, "SMS", child_obj.parent.phone_number, None, sms_msg, status)

        # 2. Registered Guardians
        guardians = active_db.query(models.Guardian).filter(models.Guardian.child_id == child_obj.id).all()
        for g in guardians:
            if g.notify_email and g.email:
                g_body = f"Dear {g.name} ({g.relation}),\n\n{body}"
                _, email_status = send_email(g.email, subject, g_body)
                _record_alert_log(active_db, child_obj.id, eid, "EMAIL", g.email, subject, g_body, email_status)

            if g.notify_sms and g.phone:
                g_sms = f"SafeBand ({g.relation}): {body}"
                _, status = send_sms_alert(g.phone, g_sms)
                _record_alert_log(active_db, child_obj.id, eid, "SMS", g.phone, None, g_sms, status)

    except Exception as err:
        logger.exception("Error in dispatch_found_alert: %s", err)
    finally:
        if owns_session and active_db:
            active_db.close()
