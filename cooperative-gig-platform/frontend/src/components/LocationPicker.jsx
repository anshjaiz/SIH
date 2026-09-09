import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;

const pinIcon = new L.Icon({
  iconUrl: '/images/markers/marker-icon-blue.png',
  iconRetinaUrl: '/images/markers/marker-icon-2x-blue.png',
  shadowUrl: '/images/markers/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Keep the visible map centred on the chosen pin (GPS or map click), so the
// user immediately sees their location instead of a map of the old spot.
function FollowPin({ lat, lng }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
    }
  }, [lat, lng, map]);
  return null;
}

const fetchAddress = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`
    );
    const data = await res.json();
    let city = data.address?.city || data.address?.town || data.address?.village || '';
    const parts = [
      data.address?.house_number,
      data.address?.road,
      data.address?.neighbourhood || data.address?.suburb,
      data.address?.city_district,
    ].filter(Boolean);
    return { city, address: parts.join(', ') };
  } catch {
    return { city: '', address: '' };
  }
};

function useMyLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export default function LocationPicker({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lat = Number(value.lat) || 17.385;
  const lng = Number(value.lng) || 78.487;

  const handlePick = async (newLat, newLng) => {
    onChange({ ...value, lat: newLat, lng: newLng });
    setBusy(true);
    setError('');
    const geo = await fetchAddress(newLat, newLng);
    onChange({ ...value, lat: newLat, lng: newLng, ...geo });
    setBusy(false);
  };

  const handleUseCurrent = async () => {
    setBusy(true);
    setError('');
    try {
      const [newLat, newLng] = await useMyLocation();
      onChange({ ...value, lat: newLat, lng: newLng });
      const geo = await fetchAddress(newLat, newLng);
      onChange({ ...value, lat: newLat, lng: newLng, ...geo });
    } catch (e) {
      setError('Could not get your location. Please allow location access or enter it manually.');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <button type="button" onClick={handleUseCurrent} disabled={busy}
          className="btn-primary flex-1 flex items-center justify-center gap-2">
          <span>📍</span> {busy ? 'Locating...' : 'Use my current location'}
        </button>
        <p className="text-xs text-gray-500 self-center">Or click on the map to drop your pin.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 220 }}>
        <MapContainer center={[lat, lng]} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={handlePick} />
          <FollowPin lat={lat} lng={lng} />
          <Marker position={[lat, lng]} icon={pinIcon} />
        </MapContainer>
      </div>

      <div>
        <label className="label-text">Address</label>
        <input
          name="address"
          className="input-field"
          placeholder="e.g., 42 Park Street, Kukatpally"
          value={value.address || ''}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label className="label-text">City</label>
          <input
            name="city"
            className="input-field"
            placeholder="City"
            value={value.city || ''}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
          />
        </div>
        <div>
          <label className="label-text">Latitude</label>
          <input
            name="lat"
            type="number"
            step="any"
            className="input-field"
            value={value.lat || ''}
            onChange={(e) => onChange({ ...value, lat: e.target.value })}
          />
        </div>
        <div>
          <label className="label-text">Longitude</label>
          <input
            name="lng"
            type="number"
            step="any"
            className="input-field"
            value={value.lng || ''}
            onChange={(e) => onChange({ ...value, lng: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}