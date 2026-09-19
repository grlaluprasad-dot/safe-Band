import base64
import io
import socket
import qrcode

from app.config import settings


def get_lan_ip() -> str:
    """Detects primary local LAN IPv4 address so mobile devices on the same Wi-Fi can open QR links."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


def get_base_url_for_mobile(custom_host: str = None) -> str:
    """Returns the base URL for the QR code.
    In production, strictly uses FRONTEND_BASE_URL (public internet domain).
    In local development only, falls back to LAN IP when localhost is configured."""
    if custom_host:
        custom = custom_host.strip()
        if not custom.startswith("http://") and not custom.startswith("https://"):
            return f"https://{custom}"
        return custom

    base = (settings.frontend_base_url or "").strip().rstrip("/")
    is_production = settings.environment == "production" or ("localhost" not in base and "127.0.0.1" not in base)

    # In production, ALWAYS return the clean production URL (never LAN / localhost)
    if is_production:
        return base

    # Local development Wi-Fi fallback only
    if "localhost" in base or "127.0.0.1" in base:
        lan_ip = get_lan_ip()
        if lan_ip and lan_ip not in ("localhost", "127.0.0.1"):
            base = base.replace("localhost", lan_ip).replace("127.0.0.1", lan_ip)
    return base


def generate_qr_png_base64(qr_token: str, base_url: str = None) -> str:
    """Generate a QR code PNG (data URI) pointing at the mobile-accessible scan URL."""
    resolved_base = base_url or get_base_url_for_mobile()
    scan_url = f"{resolved_base}/scan/{qr_token}"
    img = qrcode.make(scan_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def scan_url_for_token(qr_token: str, base_url: str = None) -> str:
    resolved_base = base_url or get_base_url_for_mobile()
    return f"{resolved_base}/scan/{qr_token}"
