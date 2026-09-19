# SafeBand — QR-Based Child Safety Bracelet & Reunification System

A full-stack app that lets parents generate a secure QR bracelet for a child.
If the child is separated from their guardian, anyone can scan the code to see
limited, non-identifying info, contact the guardian, and optionally share
their location — with no account or app install required on the scanner's side.

## Stack

- **Backend**: FastAPI, SQLAlchemy, PostgreSQL (SQLite by default in dev), JWT auth (`python-jose`), `passlib`/`bcrypt` password hashing, `qrcode` for QR generation.
- **Frontend**: React 18 + Vite, Tailwind CSS, React Router, Axios, Leaflet/OpenStreetMap for maps.

## Project layout

```
safeband/
  backend/
    app/
      main.py            FastAPI app, CORS, router registration
      config.py           Settings (reads .env)
      database.py         SQLAlchemy engine/session
      models.py            User, Child, ScanEvent, AbuseReport, AuditLog
      schemas.py           Pydantic request/response models
      security.py          Password hashing + JWT
      deps.py               Auth dependencies
      routers/
        auth.py             Register / login / me / delete account
        children.py           Parent-facing: CRUD, QR, revoke, lost mode, scan history
        scan.py                 PUBLIC, no-auth: view profile, share location, reveal
                                 contact, mark found, report abuse
        admin.py                 Stats, abuse reports, suspend/unsuspend, audit log
      services/
        qr_service.py            Generates the QR PNG pointing at /scan/{token}
        notify_service.py         Email alerts to the parent (SMTP; logs in dev)
    scripts/create_admin.py     One-off script to bootstrap an admin user
    requirements.txt
    .env.example
  frontend/
    src/
      pages/                Login, Register, Dashboard, AddChild, ChildProfile,
                             PublicScan (the scanner-facing page), AdminDashboard
      components/           Navbar, ProtectedRoute, LocationMap
      context/AuthContext.jsx
      api/client.js         Axios instance with JWT attached automatically
```

## Running locally

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # edit values, especially SECRET_KEY
uvicorn app.main:app --reload --port 8000
```

By default `DATABASE_URL` in `.env.example` points at Postgres — for a
zero-setup local run you can instead set `DATABASE_URL=sqlite:///./safeband_dev.db`.
Tables are auto-created on startup in dev; use a real migration tool (Alembic)
before running this in production.

To create an admin user:
```bash
python scripts/create_admin.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:8000` (see `vite.config.js`), so the
frontend and backend run on separate ports in dev with no CORS setup needed
beyond what's already in `main.py`.

## How the core flow works

1. A parent registers, adds a child (first name/nickname + optional photo and
   medical note), and the backend generates a `SafeBand ID` and a **QR token**
   — a random, unguessable string embedded in the QR's URL (`/scan/{token}`).
   The token itself is never shown to the public; regenerating it invalidates
   any previously printed bracelet.
2. The parent downloads/prints the QR and attaches it to a physical bracelet.
3. Anyone finding a lost child scans the QR with their phone's camera (no app
   needed — it's just a URL) and lands on the public `/scan/:qrToken` page.
4. That page shows only the minimum necessary info (first name, optional
   photo/medical note, SafeBand ID, a fixed safety message) and:
   - lets them call the guardian via a **reveal-contact** action (the phone
     number is never embedded in the QR or shown by default),
   - lets them **share their location** only after the browser's geolocation
     permission prompt is accepted,
   - lets them **mark the child as found**, and
   - lets them **report abuse/a problem** with the code.
5. Every scan is logged; the backend emails the parent immediately, and again
   with an update if the scanner shares a location.
6. The parent's dashboard shows scan history, each with a Leaflet/OpenStreetMap
   view of the approximate shared location, and lets them mark an incident
   resolved.
7. Parents can regenerate the QR (revoking the old one), fully revoke/
   reactivate the bracelet, toggle Lost Mode, and delete the child's profile
   or their whole account at any time.

## Privacy & security notes

- Coordinates are rounded to ~4 decimal places (~11m) before storage — never
  pinpoint-exact.
- The public scan endpoint never returns the parent's name, address, or phone
  number directly; phone number requires an explicit "reveal contact" action.
- Passwords are hashed with bcrypt via passlib; JWT tokens expire (see
  `ACCESS_TOKEN_EXPIRE_MINUTES`).
- Deleting a parent's account cascades to delete all of their children's
  profiles and scan history.
- Admins only see aggregate stats and abuse reports — not children's private
  data or exact scan locations.
- For production: put this behind HTTPS, move `SECRET_KEY`/SMTP creds into
  real secret storage, switch to Postgres with Alembic migrations, and
  consider adding a masked-calling provider (e.g. Twilio proxy numbers) so the
  guardian's real phone number is never revealed to the scanner at all.

## Deployment

- **Frontend** → Vercel/Netlify: `npm run build`, deploy `dist/`, set the
  `VITE`-style API base URL / proxy to your backend's public URL.
- **Backend** → Render/Railway/Fly.io/AWS: set all `.env` values as real
  environment variables/secrets, run behind HTTPS, point `DATABASE_URL` at a
  managed Postgres instance (Supabase/Neon/RDS).
