import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import client from '../api/client'

// Marker setup
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

// Controller to dynamically pan/fly map to latest live GPS coordinates
function MapViewController({ center, zoom = 15 }) {
  const map = useMap()
  const lastCenterRef = useRef(null)

  useEffect(() => {
    if (center && center[0] != null && center[1] != null) {
      const [lat, lng] = center
      if (
        !lastCenterRef.current ||
        Math.abs(lastCenterRef.current[0] - lat) > 0.0001 ||
        Math.abs(lastCenterRef.current[1] - lng) > 0.0001
      ) {
        lastCenterRef.current = [lat, lng]
        map.flyTo([lat, lng], zoom, { animate: true, duration: 1.2 })
      }
    }
  }, [center, map, zoom])

  return null
}

// Custom pulse icon for live scanner
const scannerPulseIcon = L.divIcon({
  className: 'scanner-pulse-pin',
  html: `<div style="position:relative; width:22px; height:22px;">
    <div style="position:absolute; width:22px; height:22px; border-radius:50%; background:#ef4444; opacity:0.75; animation: ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
    <div style="position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#dc2626; border:2px solid white; box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>
  </div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11]
})

const safeZoneIcon = L.divIcon({
  className: 'safezone-pin',
  html: `<div style="width:20px; height:20px; border-radius:50%; background:#2563eb; border:2px solid white; display:flex; align-items:center; justify-content:center; color:white; font-size:10px; font-weight:bold; box-shadow:0 0 4px rgba(0,0,0,0.4);">🛡️</div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
})

export default function LiveIncidentTracker({
  eventId,
  initialLat,
  initialLng,
  safeZoneLat,
  safeZoneLng,
  safeZoneRadiusM = 500,
  safeZoneName = 'Designated Safe Zone',
  isGeofenceViolation = false,
  sessionToken = null,
}) {
  const [pings, setPings] = useState([])
  const [latestLoc, setLatestLoc] = useState(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  )

  const sanitizeCoord = (lat, lng) => {
    if (lat == null || lng == null) return null
    return { lat: Number(lat), lng: Number(lng) }
  }

  useEffect(() => {
    if (initialLat && initialLng) {
      const clean = sanitizeCoord(initialLat, initialLng)
      setLatestLoc(clean)
    }
  }, [initialLat, initialLng])

  const fetchPings = async () => {
    if (!eventId) return
    try {
      const config = {}
      if (sessionToken) {
        config.headers = { 'X-Session-Token': sessionToken }
      }
      const res = await client.get(`/incident/${eventId}/locations`, config)
      setPings(res.data)
      if (res.data.length > 0) {
        const last = res.data[res.data.length - 1]
        const clean = sanitizeCoord(last.lat, last.lng)
        setLatestLoc({ lat: clean.lat, lng: clean.lng, accuracy_m: last.accuracy_m })
      }
    } catch (err) {
      console.warn('Failed to load incident location pings', err)
    }
  }

  useEffect(() => {
    fetchPings()
    const interval = setInterval(fetchPings, 4000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, sessionToken])

  const mapCenter = latestLoc
    ? [latestLoc.lat, latestLoc.lng]
    : safeZoneLat && safeZoneLng
    ? [safeZoneLat, safeZoneLng]
    : [20.5937, 78.9629]

  const polylineCoords = pings.map((p) => {
    const clean = sanitizeCoord(p.lat, p.lng)
    return [clean.lat, clean.lng]
  })
  if (initialLat && initialLng && polylineCoords.length === 0) {
    const clean = sanitizeCoord(initialLat, initialLng)
    polylineCoords.push([clean.lat, clean.lng])
  }

  return (
    <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200 bg-white">
      <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
            Real-Time GPS Incident Tracking
          </span>
        </div>
        {isGeofenceViolation ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
            ⚠️ GEOFENCE BREACH
          </span>
        ) : (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
            ✓ Safe Zone Monitored
          </span>
        )}
      </div>

      <div className="h-72 w-full relative z-0">
        <MapContainer center={mapCenter} zoom={15} className="h-full w-full">
          <MapViewController
            center={
              latestLoc
                ? [latestLoc.lat, latestLoc.lng]
                : safeZoneLat && safeZoneLng
                ? [safeZoneLat, safeZoneLng]
                : null
            }
          />
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Safe Zone Geofence Circle */}
          {safeZoneLat && safeZoneLng && (
            <>
              <Circle
                center={[safeZoneLat, safeZoneLng]}
                radius={safeZoneRadiusM}
                pathOptions={{
                  color: isGeofenceViolation ? '#ef4444' : '#3b82f6',
                  fillColor: isGeofenceViolation ? '#fca5a5' : '#93c5fd',
                  fillOpacity: 0.2,
                  dashArray: '6, 6',
                }}
              />
              <Marker position={[safeZoneLat, safeZoneLng]} icon={safeZoneIcon}>
                <Popup>
                  <div className="text-xs font-sans">
                    <p className="font-bold text-brand-700">{safeZoneName}</p>
                    <p className="text-gray-500">Radius: {safeZoneRadiusM}m</p>
                  </div>
                </Popup>
              </Marker>
            </>
          )}

          {/* Breadcrumb Trail */}
          {polylineCoords.length > 1 && (
            <Polyline
              positions={polylineCoords}
              pathOptions={{ color: '#ef4444', weight: 4, dashArray: '4, 4' }}
            />
          )}

          {/* Latest Scanner Location */}
          {latestLoc && (
            <Marker position={[latestLoc.lat, latestLoc.lng]} icon={scannerPulseIcon}>
              <Popup>
                <div className="text-xs font-sans">
                  <p className="font-bold text-red-600">Active Scanner Beacon</p>
                  <p className="text-gray-600">Lat: {latestLoc.lat}, Lng: {latestLoc.lng}</p>
                  {latestLoc.accuracy_m && (
                    <p className="text-gray-400">Accuracy: ±{Math.round(latestLoc.accuracy_m)}m</p>
                  )}
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Footer telemetry */}
      <div className="p-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-600 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold text-gray-700">Breadcrumbs:</span> {pings.length} GPS pings recorded
        </div>
        {latestLoc && (
          <div className="text-gray-500 font-mono text-[11px]">
            Latest: {latestLoc.lat.toFixed(4)}, {latestLoc.lng.toFixed(4)}
          </div>
        )}
      </div>
    </div>
  )
}
