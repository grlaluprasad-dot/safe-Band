import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import axios from 'axios'
import client from '../api/client'
import LocationMap from '../components/LocationMap'
import LiveIncidentTracker from '../components/LiveIncidentTracker'
import IncidentChat from '../components/IncidentChat'
import PrintableWristband from '../components/PrintableWristband'

export default function ChildProfile() {
  const { childId } = useParams()
  const navigate = useNavigate()
  const [child, setChild] = useState(null)
  const [qr, setQr] = useState(null)
  const [scans, setScans] = useState([])
  const [guardians, setGuardians] = useState([])
  const [alerts, setAlerts] = useState([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [testingAlerts, setTestingAlerts] = useState(false)

  const handleTestAlerts = async () => {
    setTestingAlerts(true)
    try {
      const res = await client.post(`/children/${childId}/test-alerts`)
      const summary = res.data?.results?.map((r) => `${r.channel}: ${r.status}`).join(' | ') || 'Dispatched'
      setNotice(`✓ Test notifications executed: ${summary}`)
      const alertsRes = await client.get(`/children/${childId}/alerts`).catch(() => ({ data: [] }))
      setAlerts(alertsRes.data || [])
    } catch (err) {
      setNotice('Failed to trigger test notification. Please verify backend connectivity.')
    } finally {
      setTestingAlerts(false)
    }
  }

  // Event Mode form state
  const [isEventBracelet, setIsEventBracelet] = useState(false)
  const [eventName, setEventName] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  // Geofence form state
  const [safeZoneName, setSafeZoneName] = useState('')
  const [safeZoneLat, setSafeZoneLat] = useState('')
  const [safeZoneLng, setSafeZoneLng] = useState('')
  const [safeZoneRadius, setSafeZoneRadius] = useState(500)
  const [isDetectingSafeZone, setIsDetectingSafeZone] = useState(false)

  // Mobile QR copy state
  const [copiedMobile, setCopiedMobile] = useState(false)

  // Private Address form state
  const [showEditAddress, setShowEditAddress] = useState(false)
  const [addressForm, setAddressForm] = useState({
    address_line: '',
    area_locality: '',
    city: '',
    state: '',
    pincode: '',
  })

  // Add Guardian form state
  const [showAddGuardian, setShowAddGuardian] = useState(false)
  const [guardianForm, setGuardianForm] = useState({
    name: '',
    relation: 'Co-Parent',
    phone: '',
    email: '',
    notify_sms: true,
    notify_email: true,
  })

  const loadAll = async () => {
    const [childRes, qrRes, scansRes, guardiansRes, alertsRes] = await Promise.all([
      client.get(`/children/${childId}`),
      client.get(`/children/${childId}/qr`),
      client.get(`/children/${childId}/scans`),
      client.get(`/children/${childId}/guardians`),
      client.get(`/children/${childId}/alerts`).catch(() => ({ data: [] })),
    ])

    const c = childRes.data
    setChild(c)
    setQr(qrRes.data)
    setScans(scansRes.data)
    setGuardians(guardiansRes.data)
    setAlerts(alertsRes.data || [])

    // Sync form states
    setIsEventBracelet(c.is_event_bracelet || false)
    setEventName(c.event_name || '')
    setExpiresAt(c.expires_at ? c.expires_at.slice(0, 16) : '')

    setSafeZoneName(c.safe_zone_name || '')
    setSafeZoneLat(c.safe_zone_lat != null ? String(c.safe_zone_lat) : '')
    setSafeZoneLng(c.safe_zone_lng != null ? String(c.safe_zone_lng) : '')
    setSafeZoneRadius(c.safe_zone_radius_m || 500)

    setAddressForm({
      address_line: c.address_line || '',
      area_locality: c.area_locality || '',
      city: c.city || '',
      state: c.state || '',
      pincode: c.pincode || '',
    })
  }

  useEffect(() => {
    loadAll()
    const pollTimer = setInterval(async () => {
      try {
        const [scansRes, alertsRes] = await Promise.all([
          client.get(`/children/${childId}/scans`),
          client.get(`/children/${childId}/alerts`).catch(() => ({ data: [] })),
        ])
        setScans(scansRes.data)
        setAlerts(alertsRes.data || [])
      } catch (err) {
        console.warn('Silent scan sync error:', err)
      }
    }, 4000)

    return () => clearInterval(pollTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId])

  const withBusy = async (fn, message) => {
    setBusy(true)
    setNotice('')
    try {
      await fn()
      await loadAll()
      if (message) setNotice(message)
    } finally {
      setBusy(false)
    }
  }

  const toggleLostMode = () =>
    withBusy(
      () => client.post(`/children/${childId}/lost-mode/${!child.lost_mode}`),
      !child.lost_mode ? '🚨 Lost Mode activated.' : 'Lost Mode deactivated.'
    )

  const regenerateQr = () =>
    withBusy(
      () => client.post(`/children/${childId}/regenerate-qr`),
      '✓ New QR code generated. The previous QR bracelet is now invalidated.'
    )

  const toggleRevoke = () =>
    withBusy(
      () => client.post(`/children/${childId}/${child.is_active ? 'revoke' : 'reactivate'}`),
      child.is_active ? 'Bracelet revoked.' : 'Bracelet reactivated.'
    )

  const resolveScan = (scanId) =>
    withBusy(
      () => client.post(`/children/${childId}/scans/${scanId}/resolve`),
      '✓ Incident marked as safely resolved.'
    )

  const deleteChild = async () => {
    if (!confirm(`Permanently delete ${child.display_name}'s safety profile? This cannot be undone.`)) return
    await client.delete(`/children/${childId}`)
    navigate('/dashboard')
  }

  // Safe QR image src helper: handles data: prefix properly without doubling
  const getQrImageSrc = (raw) => {
    if (!raw) return ''
    if (raw.startsWith('data:')) return raw
    return `data:image/png;base64,${raw}`
  }

  const copyScanUrl = () => {
    if (!qr?.scan_url) return
    navigator.clipboard.writeText(qr.scan_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyMobileScanUrl = () => {
    const url = qr?.mobile_scan_url || qr?.scan_url
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopiedMobile(true)
    setTimeout(() => setCopiedMobile(false), 2000)
  }

  const saveAddress = (e) => {
    e.preventDefault()
    withBusy(
      () =>
        client.patch(`/children/${childId}`, {
          address_line: addressForm.address_line.trim() || null,
          area_locality: addressForm.area_locality.trim() || null,
          city: addressForm.city.trim() || null,
          state: addressForm.state.trim() || null,
          pincode: addressForm.pincode.trim() || null,
        }),
      'Confidential home address updated securely.'
    )
    setShowEditAddress(false)
  }

  const toggleVisibility = (field, currentValue) => {
    withBusy(
      () => client.patch(`/children/${childId}`, { [field]: !currentValue }),
      'Privacy visibility updated.'
    )
  }

  // Save Event Mode & Auto-Expiry
  const saveEventMode = (e) => {
    e.preventDefault()
    withBusy(
      () =>
        client.patch(`/children/${childId}/event-mode`, {
          is_event_bracelet: isEventBracelet,
          event_name: eventName.trim() || null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      'Event mode & automatic expiry settings saved.'
    )
  }

  const setExpiryPreset = (hours) => {
    const d = new Date()
    d.setHours(d.getHours() + hours)
    const pad = (n) => String(n).padStart(2, '0')
    const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    setExpiresAt(formatted)
    setIsEventBracelet(true)
  }

  // Save Geofence Safe Zone
  const saveSafeZone = (e) => {
    e.preventDefault()
    withBusy(
      () =>
        client.patch(`/children/${childId}/safe-zone`, {
          safe_zone_name: safeZoneName.trim() || null,
          safe_zone_lat: safeZoneLat !== '' ? parseFloat(safeZoneLat) : null,
          safe_zone_lng: safeZoneLng !== '' ? parseFloat(safeZoneLng) : null,
          safe_zone_radius_m: safeZoneRadius,
        }),
      'Safe zone geofence parameters updated.'
    )
  }

  const setCurrentLocationAsSafeZone = () => {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    setIsDetectingSafeZone(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const rawLat = parseFloat(pos.coords.latitude.toFixed(5))
        const rawLng = parseFloat(pos.coords.longitude.toFixed(5))
        setSafeZoneLat(rawLat.toString())
        setSafeZoneLng(rawLng.toString())
        try {
          const res = await axios.get(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${rawLat}&lon=${rawLng}&zoom=16&addressdetails=1`,
            { timeout: 5000, headers: { 'Accept-Language': 'en' } }
          )
          if (res.data) {
            const addr = res.data.address || {}
            const place = addr.suburb || addr.neighbourhood || addr.road || ''
            const city = addr.city || addr.town || addr.village || addr.county || ''
            const nameCandidate = [place, city].filter(Boolean).join(', ')
            if (nameCandidate) {
              setSafeZoneName(`${nameCandidate} Safe Zone`)
            } else if (res.data.display_name) {
              setSafeZoneName(`${res.data.display_name.split(',')[0]} Safe Zone`)
            }
          }
        } catch {
          if (!safeZoneName) setSafeZoneName('Current Safe Zone')
        } finally {
          setIsDetectingSafeZone(false)
        }
      },
      (err) => {
        setIsDetectingSafeZone(false)
        console.warn('Geolocation error:', err)
        alert('Could not access device location. Please ensure location permissions are enabled in your browser.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  // Add Guardian
  const handleAddGuardian = (e) => {
    e.preventDefault()
    withBusy(async () => {
      await client.post(`/children/${childId}/guardians`, {
        name: guardianForm.name.trim(),
        relation: guardianForm.relation.trim(),
        phone: guardianForm.phone.trim() || null,
        email: guardianForm.email.trim() || null,
        notify_sms: guardianForm.notify_sms,
        notify_email: guardianForm.notify_email,
      })
      setShowAddGuardian(false)
      setGuardianForm({
        name: '',
        relation: 'Co-Parent',
        phone: '',
        email: '',
        notify_sms: true,
        notify_email: true,
      })
    }, 'Co-guardian added successfully.')
  }

  const handleDeleteGuardian = (guardianId) => {
    if (!confirm('Remove this guardian? They will no longer receive emergency alerts.')) return
    withBusy(
      () => client.delete(`/children/${childId}/guardians/${guardianId}`),
      'Guardian removed from emergency network.'
    )
  }

  const activeScan = scans.find((s) => !s.resolved)

  if (!child) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-slate-400 font-medium">
        <span className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mr-3"></span>
        Loading Command Deck...
      </div>
    )
  }

  const qrImageSrc = qr ? getQrImageSrc(qr.qr_image_base64) : ''

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link to="/dashboard" className="hover:text-brand-400 transition flex items-center gap-1">
          <span>← Back to Dashboard</span>
        </Link>
        <span>/</span>
        <span className="text-slate-200 font-medium">{child.display_name}</span>
      </div>

      {/* Hero Command Header */}
      <div className="glass-card rounded-2xl p-6 sm:p-7 relative overflow-hidden shadow-2xl border border-white/10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            {child.photo_url ? (
              <img
                src={child.photo_url}
                alt={child.display_name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-brand-500 shadow-glow-brand flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-brand-700 via-brand-600 to-cyber-cyan flex items-center justify-center text-white text-3xl font-display font-extrabold shadow-glow-brand flex-shrink-0">
                {child.display_name[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-tight">
                  {child.display_name}
                </h1>
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  {child.safeband_id}
                </span>
                {child.age !== null && child.age !== undefined && (
                  <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    🎂 {child.age} yrs old
                  </span>
                )}
                {child.gender && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-white/10">
                    {child.gender}
                  </span>
                )}
                {child.preferred_language && (
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-white/10 uppercase">
                    🌐 {child.preferred_language}
                  </span>
                )}
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                    child.is_active
                      ? 'bg-safety-500/20 text-safety-400 border border-safety-500/30 shadow-glow-safety'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${child.is_active ? 'bg-safety-500 animate-pulse' : 'bg-red-500'}`}></span>
                  {child.is_active ? 'WEARABLE ACTIVE' : 'BRACELET REVOKED'}
                </span>
                {child.lost_mode && (
                  <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-emergency-600 text-white border border-emergency-500 shadow-glow-emergency animate-pulse">
                    🚨 LOST MODE ENGAGED
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-2">
                <span>
                  Safe Zone: <strong className="text-slate-200">{child.safe_zone_name || 'Not configured'}</strong>
                </span>
                <span>•</span>
                <span>
                  Event Mode:{' '}
                  <strong className="text-slate-200">
                    {child.is_event_bracelet ? child.event_name || 'Active' : 'Permanent'}
                  </strong>
                </span>
                {child.expires_at && (
                  <>
                    <span>•</span>
                    <span>
                      Expires: <strong className="text-slate-200">{new Date(child.expires_at).toLocaleString()}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => setShowPrintModal(true)}
              className="flex-1 sm:flex-initial bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-glow-brand transition flex items-center justify-center gap-2"
            >
              <span>🖨️ Print Wristband</span>
            </button>
            <button
              disabled={busy}
              onClick={toggleLostMode}
              className={`flex-1 sm:flex-initial text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 ${
                child.lost_mode
                  ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                  : 'bg-gradient-to-r from-red-600 to-emergency-600 hover:from-red-500 hover:to-emergency-500 text-white shadow-glow-emergency'
              }`}
            >
              <span>{child.lost_mode ? 'Deactivate Lost Mode' : '🚨 Activate Lost Mode'}</span>
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <div className="p-4 rounded-xl bg-brand-900/40 border border-brand-500/40 text-brand-200 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">ℹ️</span>
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice('')} className="text-slate-400 hover:text-white text-sm font-bold">
            ✕
          </button>
        </div>
      )}

      {/* ACTIVE INCIDENT COMMAND CENTER (When scan is unresolved) */}
      {activeScan && (
        <div className="rounded-2xl p-6 bg-gradient-to-b from-red-950/80 to-slate-900/90 border-2 border-red-500 shadow-glow-emergency space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-red-500/30 pb-4">
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-ping"></span>
              <div>
                <h2 className="text-lg font-display font-extrabold text-white tracking-tight flex items-center gap-2">
                  <span>🚨 LIVE INCIDENT REUNIFICATION DECK</span>
                  {activeScan.geofence_violation && (
                    <span className="text-[11px] bg-red-500/30 border border-red-500/50 text-red-300 px-2 py-0.5 rounded-full font-bold">
                      GEOFENCE BREACH
                    </span>
                  )}
                </h2>
                <p className="text-xs text-red-200/80 mt-0.5">
                  Scan initiated at {new Date(activeScan.scanned_at).toLocaleTimeString()}. Tracking live telemetry below.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/api/children/${childId}/scans/${activeScan.id}/export/pdf`}
                download
                className="bg-slate-950 hover:bg-black text-white text-xs font-bold px-3 py-2 rounded-lg border border-white/20 transition flex items-center gap-1.5 shadow"
              >
                <span>📄 Police Incident PDF</span>
              </a>
              <a
                href={`/api/children/${childId}/scans/${activeScan.id}/export/csv`}
                download
                className="bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-2 rounded-lg border border-white/10 transition flex items-center gap-1.5"
              >
                <span>📊 Audit CSV</span>
              </a>
              <button
                onClick={() => resolveScan(activeScan.id)}
                className="bg-safety-600 hover:bg-safety-500 text-white text-xs font-extrabold px-3.5 py-2 rounded-lg shadow-glow-safety transition"
              >
                ✓ Mark Incident Resolved
              </button>
            </div>
          </div>

          {/* FINDER REPORTED CHILD FOUND BANNER */}
          {activeScan.marked_found && (
            <div className="bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600 text-white p-4 rounded-xl shadow-lg flex items-center justify-between gap-3 border-2 border-green-300">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎉</span>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base tracking-tight">
                    FINDER REPORTED CHILD FOUND!
                  </h3>
                  <p className="text-xs text-green-100 mt-0.5">
                    A good samaritan scanning this SafeBand has confirmed finding {child.display_name}. Use the live coordination chat below to arrange immediate physical handoff.
                  </p>
                </div>
              </div>
              <span className="hidden sm:inline-block text-xs font-mono font-bold bg-white/25 px-3 py-1.5 rounded-lg border border-white/30 text-white">
                ✓ Confirmed Found
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <LiveIncidentTracker
                eventId={activeScan.id}
                initialLat={activeScan.approx_lat}
                initialLng={activeScan.approx_lng}
                safeZoneLat={child.safe_zone_lat}
                safeZoneLng={child.safe_zone_lng}
                safeZoneRadiusM={child.safe_zone_radius_m}
                safeZoneName={child.safe_zone_name}
                isGeofenceViolation={activeScan.geofence_violation}
              />
            </div>
            <div>
              <IncidentChat
                eventId={activeScan.id}
                senderType="guardian"
                placeholderText="Reply directly to finder (masked)..."
              />
            </div>
          </div>

          {/* Emergency Alert Dispatches Log */}
          <div className="bg-slate-900/90 rounded-xl p-4 border border-white/10 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔔</span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Emergency Alert Dispatches (SMS & Email)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/10">
                  {alerts.length} logged
                </span>
              </div>
              <button
                onClick={handleTestAlerts}
                disabled={testingAlerts}
                className="bg-brand-600 hover:bg-brand-500 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg shadow transition flex items-center gap-1 self-start sm:self-auto"
              >
                <span>{testingAlerts ? '⏳ Testing Providers...' : '🧪 Test Email & SMS Now'}</span>
              </button>
            </div>

            {alerts.some((a) => String(a.status).includes('SIMULATED')) && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] flex items-start gap-2">
                <span>ℹ️</span>
                <p>
                  <strong>Real Delivery Setup:</strong> Alerts marked <code className="text-amber-300 font-mono">SIMULATED</code> are stored locally. To send real emails to <code className="text-white">grlaluprasad@gmail.com</code> and real SMS to <code className="text-white">9019515851</code>, configure your Google App Password and Fast2SMS API Key in <code className="text-amber-300">backend/.env</code>.
                </p>
              </div>
            )}

            {alerts.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No alerts dispatched yet for this incident.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-2 text-xs">
                {alerts.slice(0, 10).map((a) => {
                  const s = String(a.status || '').toUpperCase()
                  const isDelivered = s.includes('DELIVERED')
                  const isSimulated = s.includes('SIMULATED') || s.includes('MOCK')
                  const mapsMatch = a.message && a.message.match(/https:\/\/maps\.google\.com\/\?q=[0-9.,-]+/)

                  return (
                    <div key={a.id} className="bg-slate-950/80 p-3 rounded-lg border border-white/5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                            a.channel === 'SMS' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}>
                            {a.channel === 'SMS' ? '📱 SMS' : '✉️ EMAIL'}
                          </span>
                          <span className="text-slate-200 font-semibold truncate">{a.recipient}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed break-words">{a.message}</p>
                        {mapsMatch && (
                          <div className="pt-0.5">
                            <a
                              href={mapsMatch[0]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-cyber-cyan hover:underline font-bold inline-flex items-center gap-1"
                            >
                              <span>📍 Open Exact Location in Google Maps →</span>
                            </a>
                          </div>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap self-start ${
                        isDelivered
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-glow-safety'
                          : isSimulated
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-red-500/20 text-red-300 border border-red-500/40'
                      }`}>
                        {isDelivered ? '✓ ' : isSimulated ? '⚠️ ' : '❌ '}
                        {a.status}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Grid: QR Hardware, Safe Zone, Event Expiry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: QR Hardware Deck (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
                <span>📱 Wearable QR Hardware</span>
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/10">
                AES-256 Token
              </span>
            </div>

            {/* QR Code Container with Flawless Fallback & Contrast */}
            <div className="bg-white rounded-2xl p-4 flex flex-col items-center justify-center border-4 border-slate-800 shadow-2xl relative group">
              {qrImageSrc ? (
                <img
                  src={qrImageSrc}
                  alt={`SafeBand QR Code for ${child.display_name}`}
                  className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                  onError={(e) => {
                    console.error('QR image failed to load', e)
                  }}
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-slate-100 text-slate-400 text-xs">
                  Generating QR Code...
                </div>
              )}

              <div className="mt-2 text-center">
                <span className="text-xs font-mono font-extrabold text-slate-900 tracking-wider">
                  {child.safeband_id}
                </span>
                <p className="text-[10px] text-slate-500 font-sans">Points to public emergency scan dossier</p>
              </div>
            </div>

            {/* QR Action Buttons */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={copyScanUrl}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-white/10 transition flex items-center justify-center gap-1.5"
              >
                <span>{copied ? '✓ Copied' : '🔗 Copy Link'}</span>
              </button>

              <a
                href={qrImageSrc}
                download={`${child.safeband_id}-qr.png`}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-white/10 transition flex items-center justify-center gap-1.5 text-center"
              >
                <span>💾 Save PNG</span>
              </a>

              {qr?.scan_url && (
                <a
                  href={qr.scan_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="col-span-2 py-2 px-3 rounded-xl bg-brand-600/20 hover:bg-brand-600/30 text-brand-300 font-bold border border-brand-500/30 transition flex items-center justify-center gap-1.5 text-center"
                >
                  <span>👁️ Open Scanner View as Finder →</span>
                </a>
              )}
            </div>

            {/* Mobile Scan URL for Phone Cameras */}
            {qr?.mobile_scan_url && (
              <div className="p-3.5 bg-slate-900/90 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-cyber-cyan flex items-center gap-1.5">
                    <span>{qr?.is_production || !qr?.lan_ip ? '🌐 Worldwide Production Scan URL' : '📶 Mobile Scanner Wi-Fi URL'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={copyMobileScanUrl}
                    className="text-[11px] text-brand-300 hover:text-white font-bold bg-brand-500/20 hover:bg-brand-500/30 border border-brand-500/30 px-2.5 py-1 rounded-lg transition"
                  >
                    {copiedMobile ? '✓ Copied' : 'Copy Scan URL'}
                  </button>
                </div>
                <div className="text-[11px] font-mono text-slate-300 break-all bg-slate-950/80 p-2 rounded-lg border border-white/5 select-all">
                  {qr.mobile_scan_url}
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {qr?.is_production || !qr?.lan_ip ? (
                    <>
                      🚀 <strong className="text-emerald-400">Production Live:</strong> This QR code points directly to your production domain. Any smartphone scanning this will instantly open SafeBand over cellular internet worldwide.
                    </>
                  ) : (
                    <>
                      📱 <strong className="text-slate-300">Local Wi-Fi Resolution:</strong> When testing locally with a mobile phone, the QR code resolves to your Wi-Fi IP (<code className="text-brand-300">{qr.lan_ip || 'LAN IP'}</code>) instead of <code className="text-red-400">localhost</code>.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Regenerate / Revoke actions */}
            <div className="pt-3 border-t border-white/10 flex gap-2">
              <button
                disabled={busy}
                onClick={regenerateQr}
                className="flex-1 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition"
              >
                Regenerate QR
              </button>
              <button
                disabled={busy}
                onClick={toggleRevoke}
                className="flex-1 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition"
              >
                {child.is_active ? 'Revoke Bracelet' : 'Reactivate'}
              </button>
            </div>
          </div>

          {/* Confidential Home Address (Strictly Private) */}
          <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
                  <span>🏠 Confidential Home Address</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stored exclusively for parent records and official police files.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                  🔒 NEVER SHOWN PUBLICLY
                </span>
                <button
                  type="button"
                  onClick={() => setShowEditAddress(!showEditAddress)}
                  className="text-xs text-brand-300 hover:text-white bg-brand-600/20 hover:bg-brand-600/30 border border-brand-500/30 px-2.5 py-1 rounded-lg transition font-semibold"
                >
                  {showEditAddress ? 'Cancel' : 'Edit'}
                </button>
              </div>
            </div>

            {showEditAddress ? (
              <form onSubmit={saveAddress} className="space-y-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Address Line
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 742 Evergreen Terrace, Apt 4B"
                    value={addressForm.address_line}
                    onChange={(e) => setAddressForm({ ...addressForm, address_line: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-lg glass-input focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Area / Locality
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Springfield West"
                      value={addressForm.area_locality}
                      onChange={(e) => setAddressForm({ ...addressForm, area_locality: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg glass-input focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Springfield"
                      value={addressForm.city}
                      onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg glass-input focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      State / Province
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Oregon"
                      value={addressForm.state}
                      onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg glass-input focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      PIN / Postal Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 97477"
                      value={addressForm.pincode}
                      onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg glass-input focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEditAddress(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow transition"
                  >
                    Save Address
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 bg-slate-900/60 rounded-xl border border-white/10 space-y-2 text-xs">
                {child.address_line || child.city || child.state || child.pincode ? (
                  <>
                    <div className="text-slate-200 font-medium">
                      {child.address_line}
                    </div>
                    {child.area_locality && (
                      <div className="text-slate-400">
                        {child.area_locality}
                      </div>
                    )}
                    <div className="text-slate-400">
                      {[child.city, child.state, child.pincode].filter(Boolean).join(', ')}
                    </div>
                  </>
                ) : (
                  <div className="text-slate-400 italic">
                    No home address configured yet. Click "Edit" to add confidential residence details for police dossiers.
                  </div>
                )}
                <div className="pt-2 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span>🛡️</span>
                  <span>Excluded from QR public view: Finders will only see permitted emergency contacts.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Identity Dossier, Safe Zone & Event Mode (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Child Identity & Privacy Dossier Card */}
          <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
                  <span>📋 Child Profile & Public Scan Visibility</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage individual visibility toggles. Click any badge to toggle public visibility.
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-safety-500/20 text-safety-300 border border-safety-500/30 self-start sm:self-auto">
                CLICK TO TOGGLE
              </span>
            </div>

            {/* Basic Information Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10">
                <span className="text-[10px] text-slate-400 block font-semibold">Date of Birth</span>
                <span className="text-slate-200 font-bold mt-0.5 block">{child.dob || '—'}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10">
                <span className="text-[10px] text-slate-400 block font-semibold">Age (Calculated)</span>
                <span className="text-brand-300 font-bold font-mono mt-0.5 block">
                  {child.age !== null && child.age !== undefined ? `${child.age} yrs old` : '—'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10">
                <span className="text-[10px] text-slate-400 block font-semibold">Gender</span>
                <span className="text-slate-200 font-bold mt-0.5 block">{child.gender || '—'}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10">
                <span className="text-[10px] text-slate-400 block font-semibold">Language</span>
                <span className="text-slate-200 font-bold font-mono mt-0.5 block uppercase">
                  {child.preferred_language || 'EN'}
                </span>
              </div>
            </div>

            {/* Medical Advisories */}
            <div className="space-y-3 pt-1">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Blood Group</span>
                  <span className="text-slate-200 font-bold">{child.blood_group || 'Not Specified'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleVisibility('show_blood_group_publicly', child.show_blood_group_publicly)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${
                    child.show_blood_group_publicly
                      ? 'bg-brand-600/30 text-brand-300 border-brand-500/40 hover:bg-brand-600/40'
                      : 'bg-slate-800 text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  {child.show_blood_group_publicly ? '👁️ Public on Scan' : '🔒 Hidden on Scan'}
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex-1 min-w-0 pr-2">
                  <span className="text-[10px] text-slate-400 block font-semibold">Allergies & Sensitivities</span>
                  <span className="text-slate-200 font-bold break-words">{child.allergies || 'None Specified'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleVisibility('show_allergies_publicly', child.show_allergies_publicly)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition flex-shrink-0 ${
                    child.show_allergies_publicly
                      ? 'bg-brand-600/30 text-brand-300 border-brand-500/40 hover:bg-brand-600/40'
                      : 'bg-slate-800 text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  {child.show_allergies_publicly ? '👁️ Public on Scan' : '🔒 Hidden on Scan'}
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex-1 min-w-0 pr-2">
                  <span className="text-[10px] text-slate-400 block font-semibold">Critical Emergency Instructions</span>
                  <span className="text-slate-200 font-bold break-words">{child.emergency_instructions || 'None Specified'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleVisibility('show_emergency_instructions_publicly', child.show_emergency_instructions_publicly)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition flex-shrink-0 ${
                    child.show_emergency_instructions_publicly
                      ? 'bg-brand-600/30 text-brand-300 border-brand-500/40 hover:bg-brand-600/40'
                      : 'bg-slate-800 text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  {child.show_emergency_instructions_publicly ? '👁️ Public on Scan' : '🔒 Hidden on Scan'}
                </button>
              </div>
            </div>

            {/* General Visibility Pills */}
            <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] text-slate-400 font-semibold">Other Scan Visibility:</span>
              <button
                type="button"
                onClick={() => toggleVisibility('show_photo_publicly', child.show_photo_publicly)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${
                  child.show_photo_publicly
                    ? 'bg-brand-600/30 text-brand-300 border-brand-500/40'
                    : 'bg-slate-800 text-slate-400 border-white/10'
                }`}
              >
                Photo: {child.show_photo_publicly ? 'Visible' : 'Hidden'}
              </button>
              <button
                type="button"
                onClick={() => toggleVisibility('show_age_publicly', child.show_age_publicly)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${
                  child.show_age_publicly
                    ? 'bg-brand-600/30 text-brand-300 border-brand-500/40'
                    : 'bg-slate-800 text-slate-400 border-white/10'
                }`}
              >
                Age: {child.show_age_publicly ? 'Visible' : 'Hidden'}
              </button>
            </div>
          </div>

          {/* Geofence Radar Card */}
          <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
                  <span>🛡️ Geofence Safe Zone Radar</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scans outside this perimeter trigger immediate priority alerts.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={setCurrentLocationAsSafeZone}
                  disabled={isDetectingSafeZone}
                  className="text-xs bg-brand-600 hover:bg-brand-500 text-white font-bold px-3.5 py-1.5 rounded-xl transition self-start sm:self-auto flex items-center gap-1.5 shadow-glow-brand disabled:opacity-50"
                >
                  <span>{isDetectingSafeZone ? '⏳' : '🎯'}</span>
                  <span>{isDetectingSafeZone ? 'Detecting GPS...' : 'Set Safe Zone to Current Location'}</span>
                </button>
              </div>
            </div>

            <form onSubmit={saveSafeZone} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Zone Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Home Safe Zone, School Campus"
                    value={safeZoneName}
                    onChange={(e) => setSafeZoneName(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl glass-input focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Center Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="12.97160"
                    value={safeZoneLat}
                    onChange={(e) => setSafeZoneLat(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl glass-input focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Center Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="77.59460"
                    value={safeZoneLng}
                    onChange={(e) => setSafeZoneLng(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl glass-input focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Safe Zone Radius: {safeZoneRadius} meters</span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    (~{Math.round((safeZoneRadius / 1000) * 10) / 10} km)
                  </span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="3000"
                  step="50"
                  value={safeZoneRadius}
                  onChange={(e) => setSafeZoneRadius(Number(e.target.value))}
                  className="w-full accent-brand-500 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-glow-brand transition"
              >
                Save Safe Zone Radar
              </button>
            </form>
          </div>

          {/* Event Mode & Auto-Expiry Card */}
          <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
                  <span>⏳ Event Mode & Expiry</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Automates expiration for festivals, school field trips, and day camps.
                </p>
              </div>
              {child.expires_at && (
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    new Date(child.expires_at) < new Date()
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                  }`}
                >
                  {new Date(child.expires_at) < new Date() ? 'EXPIRED' : 'ACTIVE'}
                </span>
              )}
            </div>

            <form onSubmit={saveEventMode} className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="event_mode_toggle"
                  checked={isEventBracelet}
                  onChange={(e) => setIsEventBracelet(e.target.checked)}
                  className="w-4 h-4 text-brand-600 rounded bg-slate-900 border-white/20"
                />
                <label htmlFor="event_mode_toggle" className="text-xs font-bold text-slate-200 cursor-pointer">
                  Enable Event Bracelet Mode
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Event / Trip Name
                  </label>
                  <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="e.g. Wonderland Carnival 2026"
                    className="w-full text-xs px-3 py-2 rounded-xl glass-input focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Expiration Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl glass-input focus:outline-none"
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-400 font-semibold">Quick Presets:</span>
                {[
                  { label: '+6 Hours', hours: 6 },
                  { label: '+12 Hours', hours: 12 },
                  { label: '+24 Hours', hours: 24 },
                  { label: '+3 Days', hours: 72 },
                ].map((p) => (
                  <button
                    key={p.hours}
                    type="button"
                    onClick={() => setExpiryPreset(p.hours)}
                    className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 px-2.5 py-1 rounded-lg font-medium transition"
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setExpiresAt('')
                    setIsEventBracelet(false)
                  }}
                  className="text-[11px] text-slate-400 hover:text-white px-2 py-1 underline"
                >
                  Clear
                </button>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold py-2.5 rounded-xl border border-white/10 transition"
              >
                Save Event Expiry Parameters
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Multi-Guardian Emergency Broadcast Deck */}
      <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
              <span>👥 Multi-Guardian Emergency Network</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Simultaneous SMS & Email alerts dispatched to all authorized contacts when scanned.
            </p>
          </div>
          <button
            onClick={() => setShowAddGuardian(!showAddGuardian)}
            className="text-xs font-bold bg-brand-600 hover:bg-brand-500 text-white px-3.5 py-2 rounded-xl shadow-glow-brand transition self-start sm:self-auto"
          >
            {showAddGuardian ? '✕ Cancel' : '+ Add Co-Guardian'}
          </button>
        </div>

        {/* Add Guardian Form */}
        {showAddGuardian && (
          <form onSubmit={handleAddGuardian} className="p-4 rounded-xl bg-slate-900/90 border border-white/10 space-y-3">
            <h3 className="text-xs font-bold uppercase text-brand-300">Add New Emergency Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Robert Smith"
                  value={guardianForm.name}
                  onChange={(e) => setGuardianForm({ ...guardianForm, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-lg glass-input"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Relationship *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grandparent, Nanny, Camp Director"
                  value={guardianForm.relation}
                  onChange={(e) => setGuardianForm({ ...guardianForm, relation: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-lg glass-input"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Phone Number (SMS Alert)</label>
                <input
                  type="tel"
                  placeholder="+1 555-0188"
                  value={guardianForm.phone}
                  onChange={(e) => setGuardianForm({ ...guardianForm, phone: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-lg glass-input"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="guardian@example.com"
                  value={guardianForm.email}
                  onChange={(e) => setGuardianForm({ ...guardianForm, email: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-lg glass-input"
                />
              </div>
            </div>

            <div className="flex gap-4 text-xs pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardianForm.notify_sms}
                  onChange={(e) => setGuardianForm({ ...guardianForm, notify_sms: e.target.checked })}
                  className="rounded bg-slate-800 text-brand-600"
                />
                <span className="text-slate-200">SMS Alerts</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardianForm.notify_email}
                  onChange={(e) => setGuardianForm({ ...guardianForm, notify_email: e.target.checked })}
                  className="rounded bg-slate-800 text-brand-600"
                />
                <span className="text-slate-200">Email Alerts</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="bg-brand-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-brand-500 shadow"
            >
              Save to Emergency Network
            </button>
          </form>
        )}

        {/* Guardians List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {guardians.length === 0 ? (
            <div className="col-span-2 text-xs text-slate-400 italic p-3 bg-slate-900/50 rounded-xl border border-white/5">
              Only primary account holder registered. Add co-parents, grandparents, or chaperones above for simultaneous alerts.
            </div>
          ) : (
            guardians.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between p-3.5 bg-slate-900/70 border border-white/10 rounded-xl text-xs"
              >
                <div>
                  <div className="font-bold text-slate-100 flex items-center gap-2">
                    <span>{g.name}</span>
                    <span className="text-[10px] text-brand-300 font-mono bg-brand-500/10 px-1.5 py-0.2 rounded border border-brand-500/20">
                      {g.relation}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 space-x-2">
                    {g.phone && <span>📱 {g.phone}</span>}
                    {g.email && <span>✉️ {g.email}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {g.phone && (
                    <a
                      href={`https://wa.me/${g.phone.replace(/[^0-9]/g, '').length === 10 ? `91${g.phone.replace(/[^0-9]/g, '')}` : g.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`SafeBand Alert for ${child.display_name}: Check Incident Command Deck: ${window.location.origin}/children/${child.id}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1 transition"
                      title="Send Instant Free WhatsApp Alert"
                    >
                      <span>💬 WhatsApp</span>
                    </a>
                  )}
                  {g.notify_sms && (
                    <span className="text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded">
                      SMS
                    </span>
                  )}
                  {g.notify_email && (
                    <span className="text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded">
                      EMAIL
                    </span>
                  )}
                  <button
                    onClick={() => handleDeleteGuardian(g.id)}
                    className="text-slate-500 hover:text-red-400 ml-2 font-bold text-base transition"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Historical Telemetry & Scan Events */}
      <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
        <h2 className="font-display font-bold text-base text-white">Chronological Telemetry & Scan Audit Log</h2>
        {scans.length === 0 ? (
          <p className="text-xs text-slate-400">No scans recorded yet for this bracelet.</p>
        ) : (
          <div className="space-y-4">
            {scans.map((scan) => (
              <div key={scan.id} className="border border-white/10 rounded-xl p-4 bg-slate-900/60 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">
                      {new Date(scan.scanned_at).toLocaleString()}
                    </span>
                    {scan.geofence_violation && (
                      <span className="bg-red-500/20 border border-red-500/30 text-red-300 px-2 py-0.5 rounded font-bold">
                        ⚠️ Geofence Breach
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/children/${childId}/scans/${scan.id}/export/pdf`}
                      download
                      className="text-brand-400 hover:text-brand-300 font-semibold"
                    >
                      Export Police PDF
                    </a>
                    <span className="text-slate-600">•</span>
                    <a
                      href={`/api/children/${childId}/scans/${scan.id}/export/csv`}
                      download
                      className="text-brand-400 hover:text-brand-300 font-semibold"
                    >
                      Audit CSV
                    </a>
                    <span className="text-slate-600">•</span>
                    {scan.resolved ? (
                      <span className="text-safety-400 font-bold">✓ Resolved</span>
                    ) : (
                      <button
                        onClick={() => resolveScan(scan.id)}
                        className="text-emergency-400 font-bold hover:underline"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>

                <LocationMap lat={scan.approx_lat} lng={scan.approx_lng} label={child.display_name} />

                <div className="flex flex-wrap gap-3 text-xs text-slate-400 pt-1">
                  <span>{scan.location_shared ? '✓ GPS Shared by Scanner' : 'No GPS Shared'}</span>
                  <span>{scan.contact_revealed ? '✓ Contact Revealed' : 'Contact Not Viewed'}</span>
                  {scan.marked_found && <span className="text-safety-400 font-bold">✓ Marked Found by Scanner</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="border-t border-white/10 pt-4 flex justify-between items-center text-xs">
        <span className="text-slate-500">Permanently delete child profile and forensic history</span>
        <button
          onClick={deleteChild}
          className="text-red-400 hover:text-red-300 font-semibold underline"
        >
          Delete this profile
        </button>
      </div>

      {/* Single Printable Wristband Modal */}
      {showPrintModal && qr && (
        <PrintableWristband
          bracelets={[
            {
              id: child.id,
              display_name: child.display_name,
              safeband_id: child.safeband_id,
              event_name: child.event_name,
              expires_at: child.expires_at ? new Date(child.expires_at).toLocaleString() : null,
              qr_image_base64: qr.qr_image_base64,
              medical_info: child.medical_info,
            },
          ]}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  )
}
