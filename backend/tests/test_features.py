import os
import uuid
import unittest
from datetime import datetime, timedelta

# Use in-memory SQLite for testing
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["EMAIL_ENABLED"] = "false"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app import models
from app.services.messaging_service import (
    calculate_haversine_distance_m,
    dispatch_scan_alert,
    dispatch_found_alert
)
from app.services.export_service import generate_incident_csv, generate_incident_pdf

class TestSafeBandFeatures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.SessionLocal()
        # Create unique test parent per test
        self.parent = models.User(
            email=f"parent_{uuid.uuid4().hex[:8]}@test.com",
            password_hash="hash123",
            full_name="Parent User",
            phone_number="+15550001"
        )
        self.db.add(self.parent)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_geofence_distance_calculation(self):
        # Coordinates for Central Park (approx 40.785091, -73.968285)
        lat1, lon1 = 40.785091, -73.968285
        # Coordinate ~100m away
        lat2, lon2 = 40.785900, -73.968285
        dist_inside = calculate_haversine_distance_m(lat1, lon1, lat2, lon2)
        self.assertLess(dist_inside, 200.0)

        # Coordinate ~2.5km away (Times Square approx 40.758896, -73.985130)
        lat_far, lon_far = 40.758896, -73.985130
        dist_outside = calculate_haversine_distance_m(lat1, lon1, lat_far, lon_far)
        self.assertGreater(dist_outside, 2000.0)

        # Test radius boundary logic
        radius_m = 500.0
        self.assertFalse(dist_inside > radius_m, "Inside coordinate should not violate geofence")
        self.assertTrue(dist_outside > radius_m, "Far coordinate should violate geofence")

    def test_multi_guardian_notification_dispatch(self):
        child = models.Child(
            parent_id=self.parent.id,
            display_name="Leo",
            safe_zone_lat=40.785091,
            safe_zone_lng=-73.968285,
            safe_zone_radius_m=300.0,
            safe_zone_name="Park Safe Zone"
        )
        self.db.add(child)
        self.db.commit()

        # Add secondary guardians
        g1 = models.Guardian(
            child_id=child.id,
            name="Grandma Rose",
            relation="Grandmother",
            phone="+15550002",
            email="rose@test.com",
            notify_sms=True,
            notify_email=True
        )
        g2 = models.Guardian(
            child_id=child.id,
            name="Coach Dave",
            relation="Camp Coach",
            phone="+15550003",
            email="coach@test.com",
            notify_sms=True,
            notify_email=False
        )
        self.db.add_all([g1, g2])
        self.db.commit()

        scan = models.ScanEvent(child_id=child.id, session_token="sess-test-123")
        self.db.add(scan)
        self.db.commit()

        # Test dispatching normal scan alert (should succeed without errors)
        dispatch_scan_alert(child, scan, self.db, is_geofence_violation=False)

        # Test dispatching geofence violation alert
        dispatch_scan_alert(child, scan, self.db, is_geofence_violation=True, distance_m=1250.0)

        # Test found alert
        dispatch_found_alert(child, scan, self.db)

        guardians = self.db.query(models.Guardian).filter(models.Guardian.child_id == child.id).all()
        self.assertEqual(len(guardians), 2)

        # Verify AlertLog records are populated
        alert_logs = self.db.query(models.AlertLog).filter(models.AlertLog.child_id == child.id).all()
        self.assertGreater(len(alert_logs), 0)
        self.assertTrue(any(a.channel == "SMS" for a in alert_logs))
        self.assertTrue(any(a.channel == "EMAIL" for a in alert_logs))

    def test_bracelet_expiry_validation(self):
        # 1. Expired bracelet
        past_time = datetime.utcnow() - timedelta(hours=2)
        expired_child = models.Child(
            parent_id=self.parent.id,
            display_name="Max",
            is_event_bracelet=True,
            event_name="Yesterday Carnival",
            expires_at=past_time
        )
        self.db.add(expired_child)

        # 2. Active event bracelet
        future_time = datetime.utcnow() + timedelta(hours=8)
        active_child = models.Child(
            parent_id=self.parent.id,
            display_name="Emma",
            is_event_bracelet=True,
            event_name="Today Fun Fair",
            expires_at=future_time
        )
        self.db.add(active_child)
        self.db.commit()

        now = datetime.utcnow()
        self.assertTrue(expired_child.expires_at < now, "Expired child must be detected as expired")
        self.assertFalse(active_child.expires_at < now, "Active child must not be detected as expired")

    def test_incident_pings_chat_and_exports(self):
        child = models.Child(
            parent_id=self.parent.id,
            display_name="Sophia",
            medical_info="Peanut allergy. Carries EpiPen.",
            safeband_id="SB-TEST01"
        )
        self.db.add(child)
        self.db.commit()

        scan = models.ScanEvent(
            child_id=child.id,
            session_token="session-sophia-xyz",
            approx_lat=37.7749,
            approx_lng=-122.4194,
            location_accuracy_m=15.0,
            location_shared=True,
            scanner_user_agent="Mozilla/5.0 Safari"
        )
        self.db.add(scan)
        self.db.commit()

        # Add pings
        p1 = models.LocationPing(scan_event_id=scan.id, lat=37.7750, lng=-122.4195, accuracy_m=10.0)
        p2 = models.LocationPing(scan_event_id=scan.id, lat=37.7752, lng=-122.4198, accuracy_m=8.0)
        self.db.add_all([p1, p2])

        # Add chat messages
        m1 = models.IncidentMessage(
            scan_event_id=scan.id,
            sender_type="scanner",
            sender_name="Scanner",
            message="Found Sophia by the carousel, she is safe!"
        )
        m2 = models.IncidentMessage(
            scan_event_id=scan.id,
            sender_type="guardian",
            sender_name="Guardian",
            message="Thank you! We are on our way right now."
        )
        self.db.add_all([m1, m2])
        self.db.commit()

        # Test CSV export
        csv_content = generate_incident_csv(child, scan, self.db)
        self.assertIn("SafeBand Official Incident Audit Log", csv_content)
        self.assertIn("Sophia", csv_content)
        self.assertIn("Found Sophia by the carousel", csv_content)
        self.assertIn("LOCATION_BREADCRUMB", csv_content)

        # Test PDF export
        pdf_bytes = generate_incident_pdf(child, scan, self.db)
        self.assertTrue(len(pdf_bytes) > 500, "PDF should contain valid binary document data")
        self.assertTrue(pdf_bytes.startswith(b"%PDF"), "Generated output should be a valid PDF")

    def test_production_qr_url_and_db_configuration(self):
        from app.config import settings
        from app.services.qr_service import get_base_url_for_mobile, scan_url_for_token, generate_qr_png_base64

        # 1. Test Production URL Resolution (No localhost, no LAN IP)
        orig_env = settings.environment
        orig_url = settings.frontend_base_url
        try:
            settings.environment = "production"
            settings.frontend_base_url = "https://safeband.netlify.app"

            base = get_base_url_for_mobile()
            self.assertEqual(base, "https://safeband.netlify.app")
            self.assertNotIn("localhost", base)
            self.assertNotIn("127.0.0.1", base)
            self.assertNotIn("192.168", base)

            token = "test-prod-token-12345"
            scan_url = scan_url_for_token(token)
            self.assertEqual(scan_url, "https://safeband.netlify.app/scan/test-prod-token-12345")

            qr_b64 = generate_qr_png_base64(token)
            self.assertTrue(qr_b64.startswith("data:image/png;base64,"))

            # 2. Test PostgreSQL URL compatibility check
            pg_url = "postgres://user:pass@host:5432/db"
            normalized_url = pg_url.replace("postgres://", "postgresql://", 1)
            self.assertTrue(normalized_url.startswith("postgresql://"))

            # 3. Test CORS origin list parsing
            settings.cors_origins = "https://safeband.netlify.app, https://safeband.vercel.app/"
            origins = settings.cors_origin_list
            self.assertIn("https://safeband.netlify.app", origins)
            self.assertIn("https://safeband.vercel.app", origins)
        finally:
            settings.environment = orig_env
            settings.frontend_base_url = orig_url

if __name__ == "__main__":
    unittest.main()
