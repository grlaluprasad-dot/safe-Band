import os
import unittest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

# Dev test settings
os.environ["DATABASE_URL"] = "sqlite:///./test_safeband.db"
os.environ["EMAIL_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "integration-test-secret-key"

from app.main import app
from app.database import Base, engine, get_db

class TestAPIIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)
        if os.path.exists("./test_safeband.db"):
            try:
                os.remove("./test_safeband.db")
            except Exception:
                pass

    def test_full_incident_and_reunification_lifecycle(self):
        client = self.client

        # 1. Register parent account
        reg_res = client.post("/api/auth/register", json={
            "email": "sarah@example.com",
            "password": "Password123!",
            "full_name": "Sarah Connor",
            "phone_number": "+15550100"
        })
        self.assertEqual(reg_res.status_code, 201)

        # 2. Login to obtain JWT
        login_res = client.post("/api/auth/login", json={
            "email": "sarah@example.com",
            "password": "Password123!"
        })
        self.assertEqual(login_res.status_code, 200)
        token = login_res.json()["access_token"]
        auth_headers = {"Authorization": f"Bearer {token}"}

        # 3. Create Child profile with Geofence & Event Mode
        future_expiry = (datetime.utcnow() + timedelta(hours=24)).isoformat()
        child_res = client.post("/api/children", headers=auth_headers, json={
            "display_name": "John Connor",
            "medical_info": "Asthma. Carries emergency inhaler.",
            "show_medical_info_publicly": True,
            "is_event_bracelet": True,
            "event_name": "Camp Crystal Lake",
            "expires_at": future_expiry,
            "safe_zone_name": "Camp Headquarters",
            "safe_zone_lat": 44.1234,
            "safe_zone_lng": -73.4567,
            "safe_zone_radius_m": 500.0
        })
        self.assertEqual(child_res.status_code, 201)
        child_data = child_res.json()
        child_id = child_data["id"]
        qr_token = child_data["qr_token"]

        # 4. Add Secondary Guardians
        guardian_res = client.post(f"/api/children/{child_id}/guardians", headers=auth_headers, json={
            "name": "Uncle Bob",
            "relation": "Guardian",
            "phone": "+15550200",
            "email": "bob@example.com",
            "notify_sms": True,
            "notify_email": True
        })
        self.assertEqual(guardian_res.status_code, 201)

        # 5. Bulk Register for Event Organizers
        bulk_res = client.post("/api/bulk/children", headers=auth_headers, json={
            "event_name": "Group Hike 2026",
            "expires_at": future_expiry,
            "children": [
                {
                    "display_name": "Alice",
                    "medical_info": "Penicillin allergy",
                    "emergency_contact_name": "Dr. Alice Parent",
                    "emergency_contact_phone": "+15550301"
                },
                {
                    "display_name": "Charlie",
                    "emergency_contact_name": "Mr. Charlie Parent",
                    "emergency_contact_phone": "+15550302"
                }
            ]
        })
        self.assertEqual(bulk_res.status_code, 201)
        bulk_data = bulk_res.json()
        self.assertEqual(bulk_data["created_count"], 2)

        # Test Batch Print Data endpoint
        batch_ids = [c["id"] for c in bulk_data["children"]]
        batch_print_res = client.post("/api/bulk/batch-print-data", headers=auth_headers, json=batch_ids)
        self.assertEqual(batch_print_res.status_code, 200)
        self.assertEqual(len(batch_print_res.json()["bracelets"]), 2)

        # 6. Scanner scans QR bracelet: GET /api/scan/{qr_token}
        scan_res = client.get(f"/api/scan/{qr_token}")
        self.assertEqual(scan_res.status_code, 200)
        scan_data = scan_res.json()
        self.assertEqual(scan_data["display_name"], "John Connor")
        self.assertFalse(scan_data["is_expired"])
        session_token = scan_data["session_token"]
        scan_event_id = scan_data["scan_event_id"]
        self.assertIsNotNone(session_token)
        self.assertIsNotNone(scan_event_id)

        # 7. Scanner submits GPS Location: INSIDE safe zone (44.1235, -73.4568 ~15m away)
        loc_inside_res = client.post(f"/api/scan/{qr_token}/location", json={
            "latitude": 44.1235,
            "longitude": -73.4568,
            "accuracy_m": 10.0,
            "session_token": session_token
        })
        self.assertEqual(loc_inside_res.status_code, 200)
        self.assertFalse(loc_inside_res.json()["geofence_violation"], "Inside scan should not violate geofence")

        # 8. Scanner submits GPS Location: OUTSIDE safe zone (44.2000, -73.4567 ~8.5km away)
        loc_outside_res = client.post(f"/api/scan/{qr_token}/location", json={
            "latitude": 44.2000,
            "longitude": -73.4567,
            "accuracy_m": 8.0,
            "session_token": session_token
        })
        self.assertEqual(loc_outside_res.status_code, 200)
        self.assertTrue(loc_outside_res.json()["geofence_violation"], "Outside scan must trigger geofence breach")

        # 9. Scanner sends breadcrumb pings via POST /api/incident/{event_id}/ping
        ping_res = client.post(
            f"/api/incident/{scan_event_id}/ping",
            headers={"X-Session-Token": session_token},
            json={"latitude": 44.2002, "longitude": -73.4569, "accuracy_m": 5.0}
        )
        self.assertEqual(ping_res.status_code, 200)

        # Fetch breadcrumbs
        pings_res = client.get(
            f"/api/incident/{scan_event_id}/locations",
            headers={"X-Session-Token": session_token}
        )
        self.assertEqual(pings_res.status_code, 200)
        self.assertGreaterEqual(len(pings_res.json()), 1)

        # 10. Masked In-App Chat Exchange
        # Scanner sends message
        scanner_msg_res = client.post(
            f"/api/incident/{scan_event_id}/chat",
            headers={"X-Session-Token": session_token},
            json={"message": "Found John by the ranger station. He has a scratch but is fine.", "sender_type": "scanner"}
        )
        self.assertEqual(scanner_msg_res.status_code, 200)

        # Parent replies via authenticated JWT
        parent_msg_res = client.post(
            f"/api/incident/{scan_event_id}/chat",
            headers=auth_headers,
            json={"message": "Thank you! I am 2 minutes away.", "sender_type": "guardian"}
        )
        self.assertEqual(parent_msg_res.status_code, 200)

        # Read chat history
        chat_res = client.get(f"/api/incident/{scan_event_id}/chat", headers=auth_headers)
        self.assertEqual(chat_res.status_code, 200)
        msgs = chat_res.json()
        self.assertEqual(len(msgs), 2)

        # 11. Reveal Contact
        contact_res = client.get(f"/api/scan/{qr_token}/contact")
        self.assertEqual(contact_res.status_code, 200)
        self.assertTrue(len(contact_res.json()["contacts"]) >= 2)

        # 12. Mark Found
        found_res = client.post(f"/api/scan/{qr_token}/mark-found")
        self.assertEqual(found_res.status_code, 200)

        # 13. Export Official Police Incident PDF & CSV
        pdf_res = client.get(f"/api/children/{child_id}/scans/{scan_event_id}/export/pdf", headers=auth_headers)
        self.assertEqual(pdf_res.status_code, 200)
        self.assertEqual(pdf_res.headers["content-type"], "application/pdf")
        self.assertTrue(pdf_res.content.startswith(b"%PDF"))

        csv_res = client.get(f"/api/children/{child_id}/scans/{scan_event_id}/export/csv", headers=auth_headers)
        self.assertEqual(csv_res.status_code, 200)
        self.assertEqual(csv_res.headers["content-type"], "text/csv; charset=utf-8")
        self.assertIn("SafeBand Official Incident Audit Log", csv_res.text)

        # 14. Test Expired Bracelet Behavior
        expired_child_res = client.post("/api/children", headers=auth_headers, json={
            "display_name": "Timmy",
            "is_event_bracelet": True,
            "expires_at": (datetime.utcnow() - timedelta(hours=1)).isoformat()
        })
        expired_token = expired_child_res.json()["qr_token"]
        expired_scan_res = client.get(f"/api/scan/{expired_token}")
        self.assertEqual(expired_scan_res.status_code, 200)
        self.assertTrue(expired_scan_res.json()["is_expired"], "Expired child must return is_expired=True")

if __name__ == "__main__":
    unittest.main()
