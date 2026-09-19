import sqlite3

conn = sqlite3.connect("backend/safeband_dev.db")
c = conn.cursor()

print("--- Children ---")
for r in c.execute("SELECT id, display_name, safe_zone_name, safe_zone_lat, safe_zone_lng, city FROM children").fetchall():
    print(r)

print("\n--- Location Pings ---")
for r in c.execute("SELECT id, scan_event_id, lat, lng, recorded_at FROM location_pings").fetchall():
    print(r)
