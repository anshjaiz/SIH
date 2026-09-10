import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue — icons are served locally so pins render
// even when public CDNs (unpkg / raw.githubusercontent) are slow or blocked.
delete L.Icon.Default.prototype._getIconUrl;

const defaultIcon = new L.Icon({
  iconUrl: '/images/markers/marker-icon.png',
  iconRetinaUrl: '/images/markers/marker-icon-2x.png',
  shadowUrl: '/images/markers/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const workerIcon = new L.Icon({
  iconUrl: '/images/markers/marker-icon-green.png',
  iconRetinaUrl: '/images/markers/marker-icon-2x-green.png',
  shadowUrl: '/images/markers/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const customerIcon = new L.Icon({
  iconUrl: '/images/markers/marker-icon-blue.png',
  iconRetinaUrl: '/images/markers/marker-icon-2x-blue.png',
  shadowUrl: '/images/markers/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FlyToLocation({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 14, { duration: 1.5 });
    }
  }, [position, map]);
  return null;
}

const isValidLatLng = (c) =>
  Array.isArray(c) &&
  c.length === 2 &&
  typeof c[0] === 'number' &&
  typeof c[1] === 'number' &&
  Number.isFinite(c[0]) &&
  Number.isFinite(c[1]);
const DEFAULT_CENTER = [17.385, 78.4867];

function FitPolylines({ polylines }) {
  const map = useMap();
  useEffect(() => {
    if (!Array.isArray(polylines) || polylines.length === 0) return undefined;
    const bounds = {
      lat: [],
      lng: [],
    };
    polylines.forEach((line) => {
      line.positions.forEach(([lat, lng]) => {
        bounds.lat.push(lat);
        bounds.lng.push(lng);
      });
    });
    if (bounds.lat.length) {
      map.fitBounds(
        L.latLngBounds(
          [Math.min(...bounds.lat), Math.min(...bounds.lng)],
          [Math.max(...bounds.lat), Math.max(...bounds.lng)]
        ),
        { padding: [30, 30] }
      );
    }
  }, [polylines, map]);
  return null;
}

export default function MapComponent({
  center = DEFAULT_CENTER,
  markers = [],
  circles = [],
  polylines = [],
  fitToPolylines = false,
  height = '400px',
  zoom = 12,
  className = '',
}) {
  const safeCenter = isValidLatLng(center) ? center : DEFAULT_CENTER;
  const safeMarkers = markers.filter((m) => isValidLatLng([m.lat, m.lng]));
  const safeCircles = circles.filter((c) => isValidLatLng([c.lat, c.lng]));
  const safePolylines = Array.isArray(polylines)
    ? polylines
        .filter((l) => Array.isArray(l.positions) && l.positions.length >= 2)
        .map((l) => ({ ...l, positions: l.positions.filter((p) => isValidLatLng(p)) }))
        .filter((l) => l.positions.length >= 2)
    : [];
  return (
    <div className={`rounded-xl overflow-hidden border border-gray-200 ${className}`} style={{ height }}>
      <MapContainer
        center={safeCenter}
        zoom={zoom}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        className="z-1"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToLocation position={safeCenter} />
        {fitToPolylines && <FitPolylines polylines={safePolylines} />}

        {safeMarkers.map((marker, i) => (
          <Marker
            key={i}
            position={[marker.lat, marker.lng]}
            icon={marker.type === 'worker' ? workerIcon : marker.type === 'customer' ? customerIcon : defaultIcon}
          >
            <Popup>
              {marker.label && (
                <div>
                  <strong>{marker.label}</strong>
                  {marker.details && <p className="text-sm mt-1">{marker.details}</p>}
                </div>
              )}
            </Popup>
          </Marker>
        ))}

        {safeCircles.map((circle, i) => (
          <Circle
            key={i}
            center={[circle.lat, circle.lng]}
            radius={circle.radius || 500}
            fillColor={circle.color || '#3b82f6'}
            fillOpacity={circle.opacity || 0.2}
            color={circle.borderColor || '#3b82f6'}
            weight={1}
          />
        ))}

        {safePolylines.map((line, i) => (
          <Polyline
            key={i}
            positions={line.positions}
            pathOptions={{
              color: line.color || '#3b82f6',
              weight: line.weight || 5,
              opacity: line.opacity ?? 0.8,
              dashArray: line.dashArray,
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
