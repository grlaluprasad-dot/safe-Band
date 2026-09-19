import smtplib
import logging
import json
import urllib.request
import urllib.error
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger("safeband.notify")


def _send_resend_email(to_email: str, subject: str, body: str) -> tuple[bool, str]:
    """Dispatches transactional email via Resend HTTP REST API."""
    try:
        url = "https://api.resend.com/emails"
        from_addr = settings.resend_from_email or "onboarding@resend.dev"
        payload = {
            "from": from_addr,
            "to": [to_email],
            "subject": subject,
            "text": body,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Authorization", f"Bearer {settings.resend_api_key}")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "SafeBand-API/1.2.0")

        with urllib.request.urlopen(req, timeout=10) as resp:
            if 200 <= resp.status < 300:
                logger.info("[RESEND EMAIL DELIVERED] To: %s | Subject: %s", to_email, subject)
                return True, "DELIVERED (Resend)"
            return False, f"RESEND_ERROR_STATUS_{resp.status}"
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        logger.error("[RESEND HTTP ERROR] Status: %s | Body: %s", e.code, err_body)
        return False, f"RESEND_ERROR: {e.code}"
    except Exception as e:
        logger.error("[RESEND ERROR] Failed to send to %s: %s", to_email, e)
        return False, f"RESEND_ERROR: {str(e)[:50]}"


def send_email(to_email: str, subject: str, body: str) -> tuple[bool, str]:
    """Send an email notification via Resend HTTP API or SMTP (supports TLS and SSL).
    Returns (success: bool, status_label: str)."""
    if not to_email or "@" not in to_email:
        return False, "SKIPPED_INVALID_EMAIL"

    # 1. Prefer HTTP-based transactional email in cloud environments (avoids SMTP port blocks)
    if settings.resend_api_key:
        return _send_resend_email(to_email, subject, body)

    if not settings.email_enabled:
        logger.info("[EMAIL SIMULATED (EMAIL_ENABLED=false in .env)] To: %s | Subject: %s", to_email, subject)
        return False, "SIMULATED (EMAIL_ENABLED=false)"

    if not settings.smtp_host or not settings.smtp_username:
        logger.warning("[SMTP CONFIG MISSING in .env] To: %s", to_email)
        return False, "SIMULATED (Configure SMTP or RESEND_API_KEY in .env)"

    msg = MIMEText(body)
    msg["Subject"] = subject
    from_addr = settings.smtp_from_email or settings.smtp_username
    msg["From"] = from_addr
    msg["To"] = to_email

    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=12) as server:
                server.login(settings.smtp_username, settings.smtp_password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=12) as server:
                server.starttls()
                server.login(settings.smtp_username, settings.smtp_password)
                server.sendmail(from_addr, [to_email], msg.as_string())

        logger.info("[EMAIL DELIVERED] To: %s | Subject: %s", to_email, subject)
        return True, "DELIVERED"
    except smtplib.SMTPAuthenticationError as auth_err:
        err_msg = f"SMTP_AUTH_ERROR: Invalid credentials ({str(auth_err)[:40]})"
        logger.error("[EMAIL AUTH ERROR] %s to %s", err_msg, to_email)
        return False, err_msg
    except Exception as e:
        err_msg = f"SMTP_ERROR: {str(e)[:60]}"
        logger.error("[EMAIL DISPATCH ERROR] Failed to send to %s: %s", to_email, err_msg)
        return False, err_msg


def send_test_email(to_email: str) -> tuple[bool, str]:
    """Sends a verification email to confirm SMTP connectivity."""
    subject = "🧪 SafeBand Notification Test: Email Delivery Confirmed"
    body = (
        "Hello from SafeBand!\n\n"
        "This is an automated test confirming that your SafeBand email alert system is "
        "properly connected and able to deliver real emergency notifications to your inbox.\n\n"
        "SafeBand 24/7 Child Safety & Lost Child Reunification System."
    )
    return send_email(to_email, subject, body)



def notify_parent_of_scan(parent_email: str, child_name: str, has_location: bool) -> None:
    subject = f"SafeBand Alert: {child_name}'s bracelet was scanned"
    if has_location:
        body = (
            f"{child_name}'s SafeBand QR code was just scanned and the scanner shared "
            f"their approximate location. Open your SafeBand dashboard to view the "
            f"scan time and location, and to contact the scanner."
        )
    else:
        body = (
            f"{child_name}'s SafeBand QR code was just scanned. The scanner did not "
            f"share their location. Open your SafeBand dashboard for details."
        )
    send_email(parent_email, subject, body)


def notify_parent_child_reported_found(parent_email: str, child_name: str) -> None:
    send_email(
        parent_email,
        f"SafeBand: {child_name} may have been found",
        f"Someone who scanned {child_name}'s bracelet marked them as found. "
        f"Please check your dashboard to confirm and resolve the incident.",
    )
