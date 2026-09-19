import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { translations } from '../utils/i18n'
import IncidentChat from '../components/IncidentChat'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

// Clean reverse geocode function with multi-source fallback
async function fetchReverseGeocode(lat, lng) {
  try {
    const res = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { timeout: 5000, headers: { 'Accept-Language': 'en' } }
    )
    if (res.data) {
      const addr = res.data.address || {}
      const landmark = addr.amenity || addr.road || addr.suburb || addr.neighbourhood || ''
      const city = addr.city || addr.town || addr.village || addr.county || addr.state_district || ''
      const state = addr.state || ''
      const country = addr.country || ''

      const cleanParts = [landmark, city, state || country].filter(Boolean)
      if (cleanParts.length > 0) {
        return cleanParts.join(', ')
      }
      if (res.data.display_name) {
        return res.data.display_name.split(',').slice(0, 3).join(', ')
      }
    }
  } catch (e) {
    // BigDataCloud client reverse geocode fallback (free, CORS-enabled, no key required)
    try {
      const bdcRes = await axios.get(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
        { timeout: 4000 }
      )
      if (bdcRes.data) {
        const d = bdcRes.data
        const locality = d.locality || d.city || d.principalSubdivision
        const country = d.countryName
        if (locality) {
          return `${locality}${d.principalSubdivision && d.principalSubdivision !== locality ? ', ' + d.principalSubdivision : ''}${country ? ', ' + country : ''}`
        }
      }
    } catch {}
  }
  return `Pinned Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`
}

// IP-based geolocation fallback when browser GPS is blocked/unsupported
async function fetchIpLocation() {
  try {
    const res = await axios.get('https://ipapi.co/json/', { timeout: 4000 })
    if (res.data && res.data.latitude && res.data.longitude) {
      const name = [res.data.city, res.data.region, res.data.country_name].filter(Boolean).join(', ')
      return {
        lat: parseFloat(Number(res.data.latitude).toFixed(5)),
        lng: parseFloat(Number(res.data.longitude).toFixed(5)),
        name: name || 'Approximate Network Location',
        accuracy: 2500,
      }
    }
  } catch (e) {
    try {
      const res2 = await axios.get('https://freeipapi.com/api/json', { timeout: 4000 })
      if (res2.data && res2.data.latitude && res2.data.longitude) {
        const name = [res2.data.cityName, res2.data.regionName, res2.data.countryName].filter(Boolean).join(', ')
        return {
          lat: parseFloat(Number(res2.data.latitude).toFixed(5)),
          lng: parseFloat(Number(res2.data.longitude).toFixed(5)),
          name: name || 'Approximate Network Location',
          accuracy: 2500,
        }
      }
    } catch {}
  }
  return null
}

function InteractivePickerMap({ coords, onSelectCoords }) {
  useMapEvents({
    click(e) {
      onSelectCoords(e.latlng.lat, e.latlng.lng)
    },
  })
  return (
    <>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {coords && (
        <Marker
          position={[coords.lat, coords.lng]}
          draggable={true}
          eventHandlers={{
            dragend: (e) => {
              const pos = e.target.getLatLng()
              onSelectCoords(pos.lat, pos.lng)
            },
          }}
        />
      )}
    </>
  )
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const publicClient = axios.create({ baseURL: API_BASE })

export default function PublicScan() {
  const { qrToken } = useParams()
  const [lang, setLang] = useState('en')
  const [highContrast, setHighContrast] = useState(false)
  const [child, setChild] = useState(null)
  const [error, setError] = useState('')
  const [locationStatus, setLocationStatus] = useState('idle') // idle | asking | shared | denied
  const [locationAccuracy, setLocationAccuracy] = useState(null)
  const [contacts, setContacts] = useState([])
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportSent, setReportSent] = useState(false)
  const [foundSent, setFoundSent] = useState(false)
  const [geofenceBreach, setGeofenceBreach] = useState(false)

  // Live GPS Beacon state
  const [isLiveStreaming, setIsLiveStreaming] = useState(false)
  const watchIdRef = useRef(null)
  const pingIntervalRef = useRef(null)

  const [locationSource, setLocationSource] = useState('detecting') // gps | ip_fallback | search | manual_pin
  const [approxCity, setApproxCity] = useState('')
  const [showFinderForm, setShowFinderForm] = useState(false)
  const [finderName, setFinderName] = useState('')
  const [finderPhone, setFinderPhone] = useState('')
  const [lastCoords, setLastCoords] = useState(null)
  const [selectedCoords, setSelectedCoords] = useState(null)
  const [selectedLocationName, setSelectedLocationName] = useState('Detecting your location...')
  const [isDetectingLocation, setIsDetectingLocation] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchingLocation, setIsSearchingLocation] = useState(false)
  const [showLocationPicker, setShowLocationPicker] = useState(false)

  const t = translations[lang] || translations.en

  useEffect(() => {
    publicClient
      .get(`/scan/${qrToken}`)
      .then((res) => {
        setChild(res.data)
        if (res.data.preferred_language && ['en', 'hi', 'kn', 'te'].includes(res.data.preferred_language)) {
          setLang(res.data.preferred_language)
        }
        // Automatically attempt real location detection on scan
        detectLocation(false, res.data)
      })
      .catch(() =>
        setError('This SafeBand code could not be found. It may have been deactivated.')
      )
  }, [qrToken])

  // Cleanup GPS tracking on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
    }
  }, [])

  const postLocation = async (coords, extra = {}) => {
    try {
      const lat = parseFloat(Number(coords.latitude || coords.lat).toFixed(5))
      const lng = parseFloat(Number(coords.longitude || coords.lng).toFixed(5))
      setLastCoords({ lat, lng })
      setSelectedCoords({ lat, lng })

      const res = await publicClient.post(`/scan/${qrToken}/location`, {
        latitude: lat,
        longitude: lng,
        accuracy_m: coords.accuracy || coords.accuracy_m || 15.0,
        session_token: extra.session_token || child?.session_token,
        scanner_name: extra.scanner_name || finderName || null,
        scanner_phone: extra.scanner_phone || finderPhone || null,
      })
      if (coords.accuracy) {
        setLocationAccuracy(Math.round(coords.accuracy))
      }
      setLocationStatus('shared')
      if (extra.source) {
        setLocationSource(extra.source)
      }
      if (extra.city) {
        setApproxCity(extra.city)
        setSelectedLocationName(extra.city)
      }
      if (res.data?.geofence_violation) {
        setGeofenceBreach(true)
      }
    } catch (err) {
      console.warn('Failed to submit location', err)
      setLocationStatus('denied')
    }
  }

  // Real Location Detection: Device GPS with Automatic IP Fallback
  const detectLocation = (forceGps = false, currentChild = null) => {
    setIsDetectingLocation(true)
    setLocationStatus('asking')

    const useIpFallback = async () => {
      const ipLoc = await fetchIpLocation()
      if (ipLoc) {
        setSelectedCoords({ lat: ipLoc.lat, lng: ipLoc.lng })
        setSelectedLocationName(ipLoc.name)
        setLocationAccuracy(ipLoc.accuracy)
        setLocationSource('ip_fallback')
        await postLocation(
          { latitude: ipLoc.lat, longitude: ipLoc.lng, accuracy: ipLoc.accuracy },
          {
            session_token: currentChild?.session_token || child?.session_token,
            source: 'ip_fallback',
            city: ipLoc.name,
          }
        )
      } else {
        setSelectedLocationName('Location not detected. Tap "Detect My GPS" or search below.')
        setLocationStatus('denied')
      }
      setIsDetectingLocation(false)
    }

    if (!('geolocation' in navigator)) {
      useIpFallback()
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = parseFloat(Number(pos.coords.latitude).toFixed(5))
        const lng = parseFloat(Number(pos.coords.longitude).toFixed(5))
        const acc = Math.round(pos.coords.accuracy || 15)
        setSelectedCoords({ lat, lng })
        setLocationAccuracy(acc)
        setLocationSource('gps')

        const name = await fetchReverseGeocode(lat, lng)
        setSelectedLocationName(name)
        await postLocation(
          { latitude: lat, longitude: lng, accuracy: acc },
          {
            session_token: currentChild?.session_token || child?.session_token,
            source: 'gps',
            city: name,
          }
        )
        setIsDetectingLocation(false)
      },
      (err) => {
        console.warn('Browser GPS error, attempting fallback:', err)
        if (forceGps) {
          setIsDetectingLocation(false)
          alert('Device GPS was not accessible. Please ensure location permissions are granted in your browser.')
        } else {
          useIpFallback()
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    )
  }

  // Map Click or Drag Pin Handler
  const handleMapSelect = async (lat, lng) => {
    const fixedLat = parseFloat(Number(lat).toFixed(5))
    const fixedLng = parseFloat(Number(lng).toFixed(5))
    setSelectedCoords({ lat: fixedLat, lng: fixedLng })
    setLocationSource('manual_pin')
    const label = await fetchReverseGeocode(fixedLat, fixedLng)
    setSelectedLocationName(label)
    postLocation({ latitude: fixedLat, longitude: fixedLng, accuracy: 15 }, {
      source: 'manual_pin',
      city: label,
    })
  }

  // Search by Area / Landmark / Street Name
  const handleSearchLocation = async (e) => {
    if (e) e.preventDefault()
    if (!searchQuery.trim()) return
    setIsSearchingLocation(true)
    try {
      const res = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
        { timeout: 6000, headers: { 'Accept-Language': 'en' } }
      )
      if (res.data && res.data.length > 0) {
        const item = res.data[0]
        const nLat = parseFloat(parseFloat(item.lat).toFixed(5))
        const nLng = parseFloat(parseFloat(item.lon).toFixed(5))
        const name = item.display_name.split(',').slice(0, 3).join(', ')
        setSelectedCoords({ lat: nLat, lng: nLng })
        setSelectedLocationName(name)
        setLocationAccuracy(50)
        setLocationSource('search')
        postLocation({ latitude: nLat, longitude: nLng, accuracy: 50 }, { source: 'search', city: name })
      } else {
        alert(`No location found for "${searchQuery}". Please try another street, landmark, or city name.`)
      }
    } catch (err) {
      alert('Could not connect to online search. Please tap directly on the map to adjust location.')
    } finally {
      setIsSearchingLocation(false)
    }
  }

  const shareLocation = () => detectLocation(true)

  // Toggle Continuous Live Updates
  const toggleLiveBeacon = () => {
    if (isLiveStreaming) {
      // Stop beacon
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      setIsLiveStreaming(false)
      return
    }

    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser.')
      return
    }

    setIsLiveStreaming(true)

    const sendPing = (position) => {
      if (!child?.scan_event_id) return
      const lat = parseFloat(Number(position.coords.latitude).toFixed(5))
      const lng = parseFloat(Number(position.coords.longitude).toFixed(5))
      const acc = Math.round(position.coords.accuracy || 15)
      publicClient
        .post(
          `/incident/${child.scan_event_id}/ping`,
          {
            latitude: lat,
            longitude: lng,
            accuracy_m: acc,
          },
          {
            headers: { 'X-Session-Token': child.session_token },
          }
        )
        .then(() => {
          setLocationAccuracy(acc)
        })
        .catch((err) => console.warn('Live beacon ping error:', err))
    }

    // High accuracy watch with fallback
    watchIdRef.current = navigator.geolocation.watchPosition(
      sendPing,
      (err) => {
        console.warn('Watch position fallback:', err)
        navigator.geolocation.getCurrentPosition(sendPing, () => {}, { enableHighAccuracy: false })
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    )

    // Fallback periodic poll to guarantee continuous ping stream
    pingIntervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        sendPing,
        () => {
          navigator.geolocation.getCurrentPosition(sendPing, () => {}, { enableHighAccuracy: false })
        },
        { enableHighAccuracy: true, timeout: 8000 }
      )
    }, 5000)
  }

  const revealContact = async () => {
    const res = await publicClient.get(`/scan/${qrToken}/contact`)
    if (res.data.contacts && res.data.contacts.length > 0) {
      setContacts(res.data.contacts)
    } else if (res.data.phone_number) {
      setContacts([{ name: 'Primary Guardian', phone_number: res.data.phone_number }])
    } else {
      setContacts([])
    }
  }

  const markFound = async () => {
    await publicClient.post(`/scan/${qrToken}/mark-found`)
    setFoundSent(true)
  }

  const submitReport = async (e) => {
    e.preventDefault()
    await publicClient.post(`/scan/${qrToken}/report`, { reason: reportReason })
    setReportSent(true)
  }

  // High-contrast styles
  const bgClass = highContrast ? 'bg-black text-yellow-300 min-h-screen py-6' : 'bg-gray-50 min-h-screen py-6'
  const cardClass = highContrast
    ? 'bg-zinc-900 border-2 border-yellow-400 text-yellow-300 shadow-none'
    : 'bg-white border border-gray-200 shadow-md'

  if (error) {
    return (
      <div className={`max-w-md mx-auto mt-16 text-center p-6 rounded-2xl ${cardClass}`}>
        <span className="text-4xl block mb-2">⚠️</span>
        <h2 className="text-lg font-bold">Code Deactivated or Not Found</h2>
        <p className="text-sm mt-2 opacity-80">{error}</p>
      </div>
    )
  }

  if (!child) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-gray-500 font-medium">
        <span className="animate-spin text-2xl mr-2">⏳</span> Loading SafeBand details...
      </div>
    )
  }

  return (
    <div className={bgClass}>
      <div className="max-w-md mx-auto px-4 space-y-4">
        {/* Top Controls: Language Switcher & High-Contrast Mode */}
        <div className="flex items-center justify-between gap-2 pb-2">
          {/* Language selector */}
          <div className="flex items-center gap-1 bg-white/10 backdrop-blur rounded-lg p-1 border border-gray-300 dark:border-gray-700">
            {[
              { code: 'en', label: 'EN' },
              { code: 'hi', label: 'HI' },
              { code: 'kn', label: 'ಕನ್ನಡ' },
              { code: 'te', label: 'తెలుగు' },
            ].map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`text-xs px-2.5 py-1 rounded font-bold transition ${
                  lang === l.code
                    ? highContrast
                      ? 'bg-yellow-400 text-black'
                      : 'bg-brand-600 text-white shadow-sm'
                    : highContrast
                    ? 'text-yellow-400 hover:bg-yellow-400/20'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* High-Contrast Mode Toggle */}
          <button
            onClick={() => setHighContrast(!highContrast)}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition flex items-center gap-1.5 ${
              highContrast
                ? 'bg-yellow-400 text-black border-yellow-300'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50 shadow-sm'
            }`}
          >
            <span>{highContrast ? '☀️' : '👁️'}</span>
            <span>{highContrast ? t.normalContrast : t.highContrast}</span>
          </button>
        </div>

        {/* Expired Bracelet State */}
        {child.is_expired ? (
          <div className={`p-6 rounded-2xl text-center space-y-3 ${cardClass}`}>
            <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-2xl">
              ⏰
            </div>
            <h1 className="text-xl font-extrabold">{t.expiredNotice}</h1>
            <p className="text-sm opacity-80">{t.expiredDetail}</p>
            {child.event_name && (
              <p className="text-xs font-mono font-bold bg-amber-50 dark:bg-zinc-800 py-1.5 px-3 rounded-lg border border-amber-200">
                Event: {child.event_name}
              </p>
            )}
            <div className="text-xs opacity-75 pt-2">SafeBand ID: {child.safeband_id}</div>
          </div>
        ) : (
          <>
            {/* Geofence Breach Banner */}
            {geofenceBreach && (
              <div className="bg-red-600 text-white font-bold p-3 rounded-xl text-xs flex items-center gap-2 animate-bounce">
                <span>⚠️</span>
                <span>{t.geofenceBreach}</span>
              </div>
            )}

            {/* Main Child Card */}
            <div
              className={`rounded-2xl p-6 text-center transition-all ${
                child.lost_mode
                  ? 'bg-alert-500 text-white shadow-lg'
                  : cardClass
              }`}
            >
              {child.photo_url && (
                <img
                  src={child.photo_url}
                  alt={child.display_name}
                  className="w-24 h-24 rounded-full mx-auto mb-3 object-cover border-4 border-white shadow-md"
                />
              )}
              <h1 className="text-2xl font-extrabold tracking-tight">{child.display_name}</h1>
              <p className={`text-sm mt-1 font-medium ${child.lost_mode ? 'text-red-50' : 'opacity-80'}`}>
                {t.safetyMessage}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold ${
                  child.lost_mode ? 'bg-white/20' : 'bg-brand-50 text-brand-700'
                }`}>
                  SafeBand: {child.safeband_id}
                </span>
                {child.age != null && (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                    child.lost_mode ? 'bg-white/20' : 'bg-blue-50 text-blue-700'
                  }`}>
                    Age: {child.age} yrs
                  </span>
                )}
                {child.blood_group && (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                    child.lost_mode ? 'bg-white/20' : 'bg-red-50 text-red-700'
                  }`}>
                    🩸 Blood: {child.blood_group}
                  </span>
                )}
                {child.event_name && (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    child.lost_mode ? 'bg-white/20' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {child.event_name}
                  </span>
                )}
              </div>

              {child.allergies && (
                <div
                  className={`mt-3 text-xs rounded-xl p-3 text-left border ${
                    child.lost_mode
                      ? 'bg-white/10 border-white/20'
                      : highContrast
                      ? 'bg-black border-yellow-400 text-yellow-300'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  <strong className="block mb-0.5 font-bold">⚠️ Allergen Warning:</strong>
                  <span>{child.allergies}</span>
                </div>
              )}

              {child.emergency_instructions && (
                <div
                  className={`mt-3 text-xs rounded-xl p-3 text-left border ${
                    child.lost_mode
                      ? 'bg-white/10 border-white/20'
                      : highContrast
                      ? 'bg-black border-yellow-400 text-yellow-300'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <strong className="block mb-0.5 font-bold">📋 Emergency Action Protocol:</strong>
                  <span>{child.emergency_instructions}</span>
                </div>
              )}

              {child.medical_info && !child.allergies && !child.emergency_instructions && (
                <div
                  className={`mt-3 text-xs rounded-xl p-3 text-left border ${
                    child.lost_mode
                      ? 'bg-white/10 border-white/20'
                      : highContrast
                      ? 'bg-black border-yellow-400 text-yellow-300'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <strong className="block mb-0.5 font-bold">⚠️ {t.medicalInfo}:</strong>
                  <span>{child.medical_info}</span>
                </div>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className={`rounded-2xl p-5 space-y-3 ${cardClass}`}>
              {/* Emergency Calling Section */}
              <div>
                {contacts.length > 0 ? (
                  <div className="space-y-2">
                    <span className="text-xs font-bold opacity-75 uppercase tracking-wider block">
                      Emergency Contacts
                    </span>
                    {contacts.map((c, idx) => (
                      <a
                        key={idx}
                        href={`tel:${c.phone_number}`}
                        className={`block text-center py-2.5 px-4 rounded-xl font-bold transition flex items-center justify-center gap-2 ${
                          highContrast
                            ? 'bg-yellow-400 text-black hover:bg-yellow-300'
                            : 'bg-brand-600 hover:bg-brand-500 text-white shadow'
                        }`}
                      >
                        <span>📞</span>
                        <span>
                          Call {c.name ? `${c.name} (${c.relation || 'Guardian'})` : c.phone_number}
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={revealContact}
                    className={`w-full py-2.5 rounded-xl font-bold transition flex items-center justify-center gap-2 ${
                      highContrast
                        ? 'bg-yellow-400 text-black hover:bg-yellow-300'
                        : 'bg-brand-600 hover:bg-brand-500 text-white shadow'
                    }`}
                  >
                    <span>📞</span>
                    <span>{t.callGuardian}</span>
                  </button>
                )}
              </div>

              {/* Location Sharing Section */}
              <div className="pt-2 border-t border-gray-200 dark:border-zinc-800 space-y-3">
                {/* Active Location Confirmation Banner */}
                <div className="p-4 rounded-xl bg-slate-900 border border-brand-500/40 text-left space-y-2 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${isDetectingLocation ? 'bg-amber-400 animate-ping' : 'bg-emerald-500 animate-ping'}`}></span>
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                        {isDetectingLocation ? 'Detecting Live Location...' : 'Live Incident Location Reported'}
                      </span>
                    </div>
                    {locationAccuracy && (
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-white/10">
                        ±{locationAccuracy}m
                      </span>
                    )}
                  </div>

                  {isDetectingLocation ? (
                    <div className="py-2 flex items-center gap-2 text-brand-300 text-xs font-semibold">
                      <span className="animate-spin text-base">🛰️</span>
                      <span>Requesting high-accuracy GPS telemetry from your device...</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-white font-display font-extrabold text-sm flex items-center gap-2">
                        <span className="text-base">📍</span>
                        <span className="leading-snug">{selectedLocationName}</span>
                      </div>
                      {selectedCoords && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                          <span className="text-brand-300">
                            Coords: {selectedCoords.lat.toFixed(5)}, {selectedCoords.lng.toFixed(5)}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-sans font-bold uppercase tracking-wider ${
                            locationSource === 'gps'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : locationSource === 'ip_fallback'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          }`}>
                            {locationSource === 'gps' ? '🎯 High-Precision GPS' : locationSource === 'ip_fallback' ? '📡 Network Approximate' : '🗺️ User Pinned'}
                          </span>
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400 leading-relaxed pt-0.5">
                        Guardians have received this location pin. If you need to fine-tune, search any street/landmark below or drag the pin on the map.
                      </p>
                    </>
                  )}
                </div>

                {/* Location Detection & Adjust Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => detectLocation(true)}
                    disabled={isDetectingLocation}
                    className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow transition flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-98"
                  >
                    <span>{isDetectingLocation ? '⏳' : '🎯'}</span>
                    <span>{isDetectingLocation ? 'Locating...' : 'Detect / Refresh GPS'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowLocationPicker(!showLocationPicker)}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs transition border flex items-center justify-center gap-1.5 shadow-sm ${
                      showLocationPicker
                        ? 'bg-brand-600 text-white border-brand-500'
                        : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-zinc-700 hover:border-brand-400'
                    }`}
                  >
                    <span>🗺️</span>
                    <span>{showLocationPicker ? 'Hide Map Picker' : 'Pick on Map'}</span>
                  </button>
                </div>

                {/* Global Address / Landmark Search Bar */}
                <form onSubmit={handleSearchLocation} className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Search any area, city, landmark or street..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 text-xs px-3 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:border-brand-500"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingLocation}
                    className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                  >
                    <span>{isSearchingLocation ? '⏳' : '🔍'}</span>
                    <span>Search</span>
                  </button>
                </form>

                {/* Interactive Leaflet Location Picker */}
                {showLocationPicker && selectedCoords && (
                  <div className="rounded-xl overflow-hidden border-2 border-brand-500/60 shadow-lg text-left">
                    <div className="bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-brand-300 flex items-center justify-between">
                      <span>Tap anywhere or drag pin to position:</span>
                      <span className="font-mono text-slate-400 text-[10px]">
                        {selectedCoords.lat.toFixed(4)}, {selectedCoords.lng.toFixed(4)}
                      </span>
                    </div>
                    <div className="h-56 w-full relative z-0">
                      <MapContainer
                        center={[selectedCoords.lat, selectedCoords.lng]}
                        zoom={15}
                        className="h-full w-full"
                      >
                        <InteractivePickerMap
                          coords={selectedCoords}
                          onSelectCoords={handleMapSelect}
                        />
                      </MapContainer>
                    </div>
                  </div>
                )}

                {/* Continuous Live Beacon Tracking */}
                <button
                  onClick={toggleLiveBeacon}
                  className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                    isLiveStreaming
                      ? 'bg-red-600 text-white animate-pulse shadow'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow'
                  }`}
                >
                  <span>📡</span>
                  <span>{isLiveStreaming ? t.stopLiveUpdates : t.shareLiveUpdates}</span>
                </button>

                {isLiveStreaming && (
                  <div className="text-[11px] text-center font-semibold text-red-500 py-1 bg-red-50 dark:bg-red-950/40 rounded-lg border border-red-200">
                    {t.liveTrackingActive}
                  </div>
                )}

                {/* Optional Finder Contact & Landmark Form */}
                <div className="pt-1">
                  {!showFinderForm ? (
                    <button
                      type="button"
                      onClick={() => setShowFinderForm(true)}
                      className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline font-semibold flex items-center justify-center gap-1 w-full"
                    >
                      <span>🤝</span>
                      <span>Send My Contact Number / Landmark to Guardians</span>
                    </button>
                  ) : (
                    <div className="p-3 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-gray-200 dark:border-zinc-700 space-y-2 text-left">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-700 dark:text-gray-200">
                        <span>Finder Contact (Optional)</span>
                        <button
                          type="button"
                          onClick={() => setShowFinderForm(false)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <input
                          type="text"
                          placeholder="Your Name"
                          value={finderName}
                          onChange={(e) => setFinderName(e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-600 text-xs bg-white dark:bg-zinc-900"
                        />
                        <input
                          type="tel"
                          placeholder="Phone Number"
                          value={finderPhone}
                          onChange={(e) => setFinderPhone(e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-600 text-xs bg-white dark:bg-zinc-900"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (lastCoords) {
                            postLocation(lastCoords, { scanner_name: finderName, scanner_phone: finderPhone })
                          } else {
                            shareLocation()
                          }
                          setShowFinderForm(false)
                        }}
                        className="w-full py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition"
                      >
                        Submit Contact to Guardians
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Mark Child Found Button */}
              <button
                onClick={markFound}
                disabled={foundSent}
                className={`w-full py-2.5 rounded-xl font-bold transition flex items-center justify-center gap-2 ${
                  foundSent
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                }`}
              >
                <span>✓</span>
                <span>{foundSent ? t.childMarkedFound : t.markFound}</span>
              </button>
            </div>

            {/* In-App Incident Coordination Chat */}
            {child.scan_event_id && (
              <div className="space-y-1">
                <IncidentChat
                  eventId={child.scan_event_id}
                  sessionToken={child.session_token}
                  senderType="scanner"
                  isHighContrast={highContrast}
                  placeholderText={t.chatPlaceholder}
                />
              </div>
            )}

            {/* Report Problem Accordion */}
            <div className="text-center pt-2">
              {!reportOpen ? (
                <button
                  onClick={() => setReportOpen(true)}
                  className="text-xs opacity-60 hover:opacity-100 underline transition"
                >
                  {t.reportIssue}
                </button>
              ) : reportSent ? (
                <p className="text-xs text-green-600 font-semibold">
                  Thank you — your report has been submitted to SafeBand moderators.
                </p>
              ) : (
                <form onSubmit={submitReport} className={`rounded-xl p-4 mt-2 text-left space-y-2 ${cardClass}`}>
                  <label className="text-xs font-semibold block">
                    Describe the issue (e.g. lost code, wrong information):
                  </label>
                  <textarea
                    required
                    className="w-full border rounded-lg px-3 py-2 text-xs bg-transparent focus:outline-none"
                    rows={3}
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                  />
                  <button className="w-full bg-gray-800 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-gray-700 transition">
                    Submit Report
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
