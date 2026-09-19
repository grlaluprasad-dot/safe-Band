import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Vite bundles Leaflet's default marker icons incorrectly by default; fix that here.
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

export default function LocationMap({ lat, lng, label }) {
  if (lat == null || lng == null) {
    return (
      <div className="h-48 flex items-center justify-center bg-gray-100 rounded text-gray-400 text-sm">
        No location shared for this scan
      </div>
    )
  }

  const displayLat = Number(lat)
  const displayLng = Number(lng)

  return (
    <MapContainer center={[displayLat, displayLng]} zoom={15} className="h-48 rounded z-0">
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[displayLat, displayLng]}>
        <Popup>{label || 'Approximate scan location'}</Popup>
      </Marker>
    </MapContainer>
  )
}
