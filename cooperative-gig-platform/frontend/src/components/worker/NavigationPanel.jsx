import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import toast from 'react-hot-toast';
import MapComponent from '../MapComponent';

const GEO_OPTIONS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 };
const RECALC_MIN_METRES = 250; // recalc only when worker has moved this far
const RECALC_MIN_INTERVAL_MS = 15000; // ...and never more often than this

const NAVIGABLE_STATUSES = ['ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'];

const gpsErrorMessage = (err, t) => {
  if (!err) return t('nav.gpsUnavailable', 'Unable to determine your current location.');
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return t('nav.gpsPermissionDenied', 'Please enable location permission to start navigation.');
    case err.POSITION_UNAVAILABLE:
      return t('nav.gpsUnavailable', 'Unable to determine your current location.');
    case err.TIMEOUT:
      return t('nav.gpsTimeout', 'Location request timed out. Please try again.');
    default:
      return t('nav.gpsUnknown', 'Unable to determine your current location.');
  }
};

const haversine = (a, b) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

export default function NavigationPanel({ job, open, onClose, onExpired }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState('idle'); // idle | starting | active | error
  const [gpsError, setGpsError] = useState('');
  const [current, setCurrent] = useState(null); // { lat, lng }
  const [route, setRoute] = useState(null); // { distance, duration, coordinates }
  const [routeLoading, setRouteLoading] = useState(false);

  const watchIdRef = useRef(null);
  const lastPosRef = useRef(null);
  const lastCallRef = useRef(0);
  const mountedRef = useRef(true);

  const coords =
    job && job.location && Array.isArray(job.location.coordinates) && job.location.coordinates.length >= 2
      ? job.location.coordinates
      : null; // [lng, lat] GeoJSON

  const clearWatch = () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const stopNavigation = () => {
    clearWatch();
    lastPosRef.current = null;
    lastCallRef.current = 0;
    setCurrent(null);
    setRoute(null);
    setGpsError('');
    setPhase('idle');
  };

  // Cleanup watcher on unmount / job change (prevents leaks)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearWatch();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      clearWatch();
      setPhase('idle');
      setCurrent(null);
      setRoute(null);
      setGpsError('');
    }
  }, [open]);

  const fetchRoute = async (pos) => {
    if (!pos || !coords) return;
    const nowMs = Date.now();
    if (nowMs - lastCallRef.current < RECALC_MIN_INTERVAL_MS) return; // throttle OSRM calls
    lastCallRef.current = nowMs;
    setRouteLoading(true);
    console.log('NAV: requesting route', pos.lng, pos.lat, '→ destination', coords[0], coords[1]);
    try {
      const res = await api.get('/routes', {
        params: { fromLng: pos.lng, fromLat: pos.lat, bookingId: job._id },
      });
      if (!mountedRef.current) return;
      const data = res.data;
      console.log('NAV: route received', data.distance + 'm', data.duration + 's', data.geometry?.coordinates?.length + ' pts');
      setRoute({
        distance: data.distance,
        duration: data.duration,
        coordinates: Array.isArray(data.geometry?.coordinates)
          ? data.geometry.coordinates.map(([lng, lat]) => [lat, lng])
          : null,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      console.log('NAV: route failed', err?.response?.status, err?.response?.data?.message || err?.message);
      const msg = err?.response?.data?.message || err?.message || 'Routing failed';
      if (/expired|no longer active/i.test(msg)) {
        toast.error(msg);
        onExpired && onExpired();
        clearWatch();
        setPhase('idle');
        return;
      }
      if (/assigned/i.test(msg)) {
        toast.error(t('nav.notAssigned', 'This job is not assigned to you.'));
        return;
      }
      toast.error(msg);
    } finally {
      if (mountedRef.current) setRouteLoading(false);
    }
  };

  const handlePosition = (pos) => {
    if (!mountedRef.current) return;
    const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setCurrent(p);
    setPhase('active');

    // First GPS fix: fetch the route right away. Subsequent updates only
    // recalculate when the worker has moved a significant distance away from
    // the last routed point, throttled by time.
    const last = lastPosRef.current;
    if (!last) {
      fetchRoute(p);
    } else if (route && haversine(last, p) >= RECALC_MIN_METRES) {
      fetchRoute(p);
    }
    lastPosRef.current = p;
  };

  const startNavigation = () => {
    console.log('START NAVIGATION BUTTON CLICKED');
    if (!navigator.geolocation) {
      console.log('NAV: geolocation API unavailable');
      setGpsError(t('nav.browserUnsupported', 'Your browser does not support location services.'));
      setPhase('error');
      return;
    }
    console.log('NAV: requesting GPS position…');
    setPhase('starting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('NAV: GPS position received', pos.coords.latitude, pos.coords.longitude);
        if (!mountedRef.current) return;
        handlePosition(pos);
        // Track continuously while navigating; clearWatch() stops it.
        watchIdRef.current = navigator.geolocation.watchPosition(
          (nextPos) => {
            console.log('NAV: watch position received', nextPos.coords.latitude, nextPos.coords.longitude);
            handlePosition(nextPos);
          },
          (err) => {
            console.log('NAV: GPS error', err && err.code, err && err.message);
            if (!mountedRef.current) return;
            clearWatch();
            setGpsError(gpsErrorMessage(err, t));
            setPhase('error');
          },
          GEO_OPTIONS
        );
      },
      (err) => {
        console.log('NAV: GPS error', err && err.code, err && err.message);
        if (!mountedRef.current) return;
        setGpsError(gpsErrorMessage(err, t));
        setPhase('error');
      },
      GEO_OPTIONS
    );
  };

  if (!open || !job) return null;
  console.log('Navigation component rendered', job.bookingNumber, 'status', job.status);

  const destLatLng = coords ? { lat: coords[1], lng: coords[0] } : null;
  const canNavigate = NAVIGABLE_STATUSES.includes(job.status) && destLatLng;
  const distanceKm = route ? (route.distance / 1000).toFixed(1) : null;
  const etaMin = route ? Math.max(1, Math.round(route.duration / 60)) : null;
  const mapCenter = current || destLatLng || { lat: 17.385, lng: 78.4867 };

  const markers = [];
  if (current) markers.push({ ...current, type: 'worker', label: 'You' });
  if (destLatLng) markers.push({ ...destLatLng, type: 'customer', label: job.customer?.name || 'Job location' });

  const polylines = route?.coordinates
    ? [{ positions: route.coordinates, color: '#10b981', weight: 5, opacity: 0.85 }]
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={onClose} />
      <div className="relative z-10 pointer-events-auto w-full sm:w-[540px] max-h-[92vh] overflow-y-auto bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <p className="font-semibold text-gray-900">🧭 {t('nav.navTitle', 'Navigation')} {phase === 'active' && <span className="text-green-600">{t('nav.active', 'Active')}</span>}</p>
            <p className="text-xs text-gray-500">{job.bookingNumber} · {job.serviceSnapshot?.name}</p>
          </div>
          <button onClick={() => { clearWatch(); onClose(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Destination summary */}
          <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-400">{t('nav.customer', 'Customer')}</p>
              <p className="font-medium text-gray-900">{job.customer?.name || '—'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-400">{t('nav.location', 'Location')}</p>
              <p className="font-medium text-gray-900">{job.address || '—'}</p>
            </div>
          </div>

          {/* GPS error state */}
          {phase === 'error' && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl">⚠️ {gpsError}</div>
          )}
          {!canNavigate && (
            <div className="p-3 bg-yellow-50 text-yellow-700 text-sm rounded-xl">
              {t('nav.inactiveWarning', 'This job is no longer active or has no destination coordinates.')}
            </div>
          )}

          {/* Actions */}
          {canNavigate && phase === 'idle' && (
            <button onClick={startNavigation} className="btn-primary w-full py-3">📍 {t('nav.startNavigation', 'Start Navigation')}</button>
          )}
          {canNavigate && phase === 'starting' && (
            <button disabled className="btn-primary w-full py-3 opacity-70 cursor-wait">
              📍 {t('nav.acquiringLocation', 'Acquiring location…')}
            </button>
          )}
          {canNavigate && phase === 'active' && (
            <button onClick={stopNavigation} className="btn-secondary w-full py-3">🛑 {t('nav.stopNavigation', 'Stop Navigation')}</button>
          )}
          {canNavigate && phase === 'error' && (
            <button onClick={startNavigation} className="btn-primary w-full py-3">🔄 {t('nav.retryNavigation', 'Retry Navigation')}</button>
          )}

          {destLatLng && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${destLatLng.lat},${destLatLng.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-brand-600 hover:underline"
            >
              {t('nav.openInMaps', 'Open in Maps ↗')}
            </a>
          )}

          {/* Map */}
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <MapComponent
              center={[mapCenter.lat, mapCenter.lng]}
              markers={markers}
              polylines={polylines}
              fitToPolylines={polylines.length > 0}
              height="300px"
              zoom={14}
            />
          </div>

          {/* Route metrics */}
          {route && routeLoading && (
            <p className="text-xs text-gray-400 flex items-center gap-2">
              <span className="inline-block h-3 w-3 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
              {t('nav.recalculating', 'Recalculating route…')}
            </p>
          )}
          {route && !routeLoading && distanceKm !== null && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-brand-50 rounded-xl">
                <p className="text-lg font-bold text-gray-900">{distanceKm}<span className="text-xs font-normal"> km</span></p>
                <p className="text-xs text-gray-500">{t('nav.distance', 'Distance')}</p>
              </div>
              <div className="p-3 bg-brand-50 rounded-xl">
                <p className="text-lg font-bold text-gray-900">{etaMin}<span className="text-xs font-normal"> min</span></p>
                <p className="text-xs text-gray-500">{t('nav.eta', 'ETA')}</p>
              </div>
              <div className="p-3 bg-brand-50 rounded-xl">
                <p className="text-lg font-bold text-gray-900">{markers.length >= 2 ? '2' : '1'}<span className="text-xs font-normal"> pts</span></p>
                <p className="text-xs text-gray-500">📍 · 📍</p>
              </div>
            </div>
          )}
          {!route && phase === 'active' && (
            <div className="flex items-center gap-2 text-sm text-gray-500 p-3 bg-gray-50 rounded-xl">
              <span className="inline-block h-3 w-3 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
              {t('nav.calculating', 'Calculating distance & ETA…')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
