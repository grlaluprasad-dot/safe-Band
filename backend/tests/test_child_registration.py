import os
import unittest
from datetime import date
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_registration.db"
os.environ["EMAIL_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-reg"

from app.main import app
from app.database import Base, engine


class TestChildRegistrationAndPrivacy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)
        if os.path.exists("./test_registration.db"):
            try:
                os.remove("./test_registration.db")
            except Exception:
                pass

    def test_complete_child_registration_flow_and_privacy_guarantees(self):
        client = self.client

        # 1. Register parent
        reg_res = client.post("/api/auth/register", json={
            "email": "parent_reg@example.com",
            "password": "Password123!",
            "full_name": "Elena Rostova",
            "phone_number": "+15550222"
        })
        self.assertEqual(reg_res.status_code, 201)

        # 2. Login
        login_res = client.post("/api/auth/login", json={
            "email": "parent_reg@example.com",
            "password": "Password123!"
        })
        self.assertEqual(login_res.status_code, 200)
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 3. Register Child with complete registration payload
        # Date of birth: 7 years ago
        birth_year = date.today().year - 7
        dob_str = f"{birth_year}-05-12"

        child_payload = {
            "display_name": "Maya",
            "dob": dob_str,
            "gender": "Female",
            "preferred_language": "es",
            "photo_url": "https://example.com/photos/maya.jpg",
            "blood_group": "O+",
            "allergies": "Peanut and Tree Nut allergy",
            "emergency_instructions": "Carries EpiPen in backpack. Administer immediately on anaphylaxis symptoms.",
            
            # Privacy controls: sensitive info private by default
            "show_photo_publicly": False,
            "show_age_publicly": False,
            "show_blood_group_publicly": False,
            "show_allergies_publicly": False,
            "show_emergency_instructions_publicly": False,

            # Confidential Home Address (Strictly Private)
            "address_line": "742 Evergreen Terrace, Apt 4B",
            "area_locality": "Springfield West",
            "city": "Springfield",
            "state": "Oregon",
            "pincode": "97477",

            # Multi-Guardians
            "guardians": [
                {
                    "name": "Elena Rostova",
                    "relation": "Mother",
                    "phone": "+15550222",
                    "email": "elena@example.com",
                    "is_primary": True,
                    "notify_sms": True,
                    "notify_email": True,
                    "notification_method": "all"
                },
                {
                    "name": "Dmitri Rostov",
                    "relation": "Father",
                    "phone": "+15550333",
                    "email": "dmitri@example.com",
                    "is_primary": False,
                    "notify_sms": True,
                    "notify_email": False,
                    "notification_method": "sms"
                }
            ]
        }

        create_res = client.post("/api/children", headers=headers, json=child_payload)
        self.assertEqual(create_res.status_code, 201)
        created_child = create_res.json()
        child_id = created_child["id"]
        qr_token = created_child["qr_token"]

        # Validate Parent-Facing Child Data includes private details and calculated age
        self.assertEqual(created_child["display_name"], "Maya")
        self.assertEqual(created_child["dob"], dob_str)
        self.assertEqual(created_child["gender"], "Female")
        self.assertEqual(created_child["preferred_language"], "es")
        self.assertEqual(created_child["age"], 7)
        self.assertEqual(created_child["address_line"], "742 Evergreen Terrace, Apt 4B")
        self.assertEqual(created_child["pincode"], "97477")

        # Check guardians were registered
        guardians_res = client.get(f"/api/children/{child_id}/guardians", headers=headers)
        self.assertEqual(guardians_res.status_code, 200)
        guardians = guardians_res.json()
        self.assertEqual(len(guardians), 2)
        self.assertEqual(guardians[0]["name"], "Elena Rostova")
        self.assertEqual(guardians[1]["name"], "Dmitri Rostov")
        self.assertEqual(guardians[1]["notification_method"], "sms")

        # 4. Check QR Code endpoint returns mobile scan URL and LAN IP
        qr_res = client.get(f"/api/children/{child_id}/qr", headers=headers)
        self.assertEqual(qr_res.status_code, 200)
        qr_data = qr_res.json()
        self.assertIn("qr_image_base64", qr_data)
        self.assertIn("mobile_scan_url", qr_data)
        self.assertIn("local_scan_url", qr_data)
        self.assertIn("lan_ip", qr_data)
        self.assertTrue(qr_data["qr_image_base64"].startswith("data:image/png;base64,"))

        # 5. PUBLIC SCAN PRIVACY VERIFICATION: PRIVATE BY DEFAULT
        # Public scan should NOT expose photo, age, blood group, allergies, instructions, or home address!
        scan_res = client.get(f"/api/scan/{qr_token}")
        self.assertEqual(scan_res.status_code, 200)
        public_data = scan_res.json()

        # Name is visible
        self.assertEqual(public_data["display_name"], "Maya")
        self.assertEqual(public_data["preferred_language"], "es")

        # Sensitive info MUST be None (private by default)
        self.assertIsNone(public_data.get("photo_url"))
        self.assertIsNone(public_data.get("age"))
        self.assertIsNone(public_data.get("blood_group"))
        self.assertIsNone(public_data.get("allergies"))
        self.assertIsNone(public_data.get("emergency_instructions"))

        # HOME ADDRESS MUST NEVER BE IN THE PUBLIC PAYLOAD
        self.assertNotIn("address_line", public_data)
        self.assertNotIn("area_locality", public_data)
        self.assertNotIn("city", public_data)
        self.assertNotIn("state", public_data)
        self.assertNotIn("pincode", public_data)

        # 6. UPDATE PRIVACY VISIBILITY: Enable Age, Blood Group & Allergy Public Visibility
        patch_res = client.patch(f"/api/children/{child_id}", headers=headers, json={
            "show_photo_publicly": True,
            "show_age_publicly": True,
            "show_blood_group_publicly": True,
            "show_allergies_publicly": True,
            "show_emergency_instructions_publicly": True
        })
        self.assertEqual(patch_res.status_code, 200)

        # Re-check public scan - now permitted fields should be visible
        scan_res_updated = client.get(f"/api/scan/{qr_token}")
        self.assertEqual(scan_res_updated.status_code, 200)
        updated_public = scan_res_updated.json()

        self.assertEqual(updated_public["photo_url"], "https://example.com/photos/maya.jpg")
        self.assertEqual(updated_public["age"], 7)
        self.assertEqual(updated_public["blood_group"], "O+")
        self.assertEqual(updated_public["allergies"], "Peanut and Tree Nut allergy")
        self.assertIn("EpiPen", updated_public["emergency_instructions"])

        # And Home Address STILL MUST NEVER BE IN PUBLIC PAYLOAD even with all toggles on
        self.assertNotIn("address_line", updated_public)
        self.assertNotIn("area_locality", updated_public)
        self.assertNotIn("city", updated_public)
        self.assertNotIn("state", updated_public)
        self.assertNotIn("pincode", updated_public)


if __name__ == "__main__":
    unittest.main()
