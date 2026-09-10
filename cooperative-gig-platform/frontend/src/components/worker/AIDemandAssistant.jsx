import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import MapComponent from '../MapComponent';
import toast from 'react-hot-toast';

const LEVEL_META = {
  VERY_HIGH: { label: 'VERY HIGH', emoji: '🔴', color: '#dc2626', badge: 'badge-danger' },
  HIGH: { label: 'HIGH', emoji: '🟠', color: '#f97316', badge: 'badge-warning' },
  MEDIUM: { label: 'MEDIUM', emoji: '🟡', color: '#eab308', badge: 'badge-warning' },
  LOW: { label: 'LOW', emoji: '🟢', color: '#22c55e', badge: 'badge-success' },
};

export default function AIDemandAssistant() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [navRoute, setNavRoute] = useState(null);
  const [navLoading, setNavLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState(null);
  const [mapKey, setMapKey] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/workers/demand/assistant');
      setData(res.data);
      if (res.data?.worker?.location?.coordinates) {
        const c = res.data.worker.location.coordinates;
        setMapCenter([c[1], c[0]]);
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not load demand data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const { zones, worker, recommendation, prediction, currentZone } = data || {};
  const workerLoc = useMemo(() => {
    if (!worker?.location?.coordinates) return null;
    const c = worker.location.coordinates;
    return { lat: c[1], lng: c[0], radiusKm: worker.radiusKm };
  }, [worker]);

  const circles = useMemo(() => {
    const out = [];
    if (workerLoc) {
      out.push({
        lat: workerLoc.lat,
        lng: workerLoc.lng,
        radius: (workerLoc.radiusKm || 15) * 1000,
        color: '#2563eb',
        opacity: 0.06,
        borderColor: '#2563eb',
      });
    }
    (zones || []).forEach((z) => {
      const meta = LEVEL_META[z.level] || LEVEL_META.LOW;
      out.push({
        lat: z.lat,
        lng: z.lng,
        radius: 260 + Math.round(z.score * 8),
        color: meta.color,
        opacity: 0.16 + (z.score / 100) * 0.3,
        borderColor: meta.color,
      });
    });
    return out;
  }, [zones, workerLoc]);

  const markers = useMemo(() => {
    const out = [];
    if (workerLoc) out.push({ lat: workerLoc.lat, lng: workerLoc.lng, type: 'worker', label: 'You', details: `Working radius ${workerLoc.radiusKm} km` });
    if (recommendation && !navRoute) {
      out.push({
        lat: recommendation.navigateTo.lat,
        lng: recommendation.navigateTo.lng,
        type: 'customer',
        label: `Recommended: ${zones?.find((z) => z.key === recommendation.zoneKey)?.topArea || 'nearby area'}`,
        details: `${recommendation.demandLevel} demand • ${recommendation.distanceKm} km away`,
      });
    }
    return out;
  }, [workerLoc, recommendation, navRoute, zones]);

  const polylines = useMemo(
    () =>
      navRoute?.coordinates
        ? [{ positions: navRoute.coordinates, color: '#10b981', weight: 5, opacity: 0.85 }]
        : [],
    [navRoute]
  );

  const navigateThere = async () => {
    if (!recommendation || !workerLoc) return;
    setNavLoading(true);
    try {
      const res = await api.get('/routes', {
        params: {
          fromLng: workerLoc.lng,
          fromLat: workerLoc.lat,
          toLng: recommendation.navigateTo.lng,
          toLat: recommendation.navigateTo.lat,
        },
      });
      setNavRoute({
        distance: res.data.distance,
        duration: res.data.duration,
        coordinates: Array.isArray(res.data.geometry?.coordinates)
          ? res.data.geometry.coordinates.map(([lng, lat]) => [lat, lng])
          : [],
      });
      setMapKey((k) => k + 1);
    } catch (e) {
      toast.error(e.message || 'No route found');
    } finally {
      setNavLoading(false);
    }
  };

  const focusZone = (z) => {
    setMapCenter([z.lat, z.lng]);
    setMapKey((k) => k + 1);
  };

  const recIsHere =
    recommendation &&
    workerLoc &&
    (recommendation.insideRadius || recommendation.distanceKm <= workerLoc.radiusKm * 1.2);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h3 className="font-semibold">AI Demand Assistant</h3>
          <span className="badge badge-info">LIVE DEMAND</span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-brand-600 hover:underline disabled:opacity-50"
        >
          {loading ? 'Loading…' : '⟳ Refresh'}
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div>
        </div>
      )}

      {!loading && (!zones || zones.length === 0) && (
        <div className="card bg-yellow-50 border border-yellow-200 py-8 text-center">
          <p className="text-yellow-700 font-medium">
            No recent job demand near you yet.
          </p>
          <p className="text-sm text-yellow-600 mt-1">
            We compute demand from real requests in the last {data?.windowDays || 14} days. Check back soon!
          </p>
        </div>
      )}

      {!loading && zones && zones.length > 0 && (
        <div className="space-y-4">
          {/* Dynamic assistant message */}
          {recommendation ? (
            <div className={`rounded-lg p-4 border ${recIsHere ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="font-semibold text-gray-900">{recommendation.title}</p>
              <p className="text-sm text-gray-700 mt-1">{recommendation.reason}</p>

              {!recIsHere && (
                <>
                  <div className="mt-3 p-3 rounded-lg bg-white border border-gray-200">
                    <p className="font-medium text-sm">High demand detected:</p>
                    <p className="text-sm mt-1">
                      📍 <span className="font-medium">{recommendation.navigateTo.lat.toFixed(4)}, {recommendation.navigateTo.lng.toFixed(4)}</span>
                    </p>
                    <p className="text-sm">🐾 {recommendation.distanceKm} km away</p>
                    <p className="text-sm">
                      📈 Demand: <span className={`badge ${LEVEL_META[recommendation.demandLevel]?.badge || 'badge-gray'}`}>
                        {LEVEL_META[recommendation.demandLevel]?.label || recommendation.demandLevel}
                      </span>
                    </p>
                    <p className="text-sm mt-1 text-gray-500">
                      Moving toward this area may increase your chances of receiving a job.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <button onClick={navigateThere} disabled={navLoading} className="btn-primary text-sm">
                      {navLoading ? 'Finding route…' : navRoute ? '⟳ Route loaded' : '🧭 Navigate There'}
                    </button>
                    {navRoute && (
                      <>
                        <span className="text-xs text-gray-500">
                          🚗 {(navRoute.distance / 1000).toFixed(1)} km • ⏱ {Math.round(navRoute.duration / 60)} min
                        </span>
                        <a
                          className="text-xs text-brand-600 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                          href={`https://www.google.com/maps/dir/?api=1&origin=${workerLoc.lat},${workerLoc.lng}&destination=${recommendation.navigateTo.lat},${recommendation.navigateTo.lng}`}
                        >
                          Open in Maps →
                        </a>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-lg p-4 bg-gray-50 border border-gray-200">
              <p className="font-semibold text-gray-900">
                {currentZone
                  ? `Demand in your current area: ${LEVEL_META[currentZone.level]?.label || currentZone.level}`
                  : 'No clearly better area nearby right now.'}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {currentZone
                  ? `Stay put for now — the highest-demand nearby area is only ${Math.round(
                      (zones[0]?.distanceKm || 0)
                    )} km away.`
                  : 'When new requests come in we will show you where demand is rising.'}
              </p>
            </div>
          )}

          {/* Map */}
          <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: '320px' }}>
            <MapComponent
              key={mapKey}
              center={mapCenter || (workerLoc ? [workerLoc.lat, workerLoc.lng] : [17.385, 78.4867])}
              markers={markers}
              circles={circles}
              polylines={polylines}
              fitToPolylines={polylines.length > 0}
              height="320px"
              zoom={12}
            />
          </div>

          {/* Hot zones */}
          {(zones || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Demand by area</p>
              <div className="space-y-2">
                {zones.slice(0, 4).map((z) => {
                  const meta = LEVEL_META[z.level] || LEVEL_META.LOW;
                  return (
                    <button
                      key={z.key}
                      onClick={() => focusZone(z)}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg bg-gray-50 hover:bg-brand-50 border border-gray-100 text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {meta.emoji} {z.topArea || `~${z.lat.toFixed(2)}, ${z.lng.toFixed(2)}`}
                          {z.insideRadius && <span className="text-xs text-gray-400 ml-1">(in radius)</span>}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {z.recentRequests} recent • {z.activeJobs} open • {z.completedJobs} completed • score {z.score}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`badge ${meta.badge}`}>{meta.label}</span>
                        <span className="text-xs text-gray-400">{z.distanceKm} km</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legend + honest disclaimer */}
          <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 pt-3">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#dc2626' }} />Very High</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#f97316' }} />High</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#eab308' }} />Medium</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e' }} />Low</span>
            </div>
            <p className="text-xs text-gray-400 ml-auto">
              CURRENT DEMAND from real requests (last {data?.windowDays || 14} days) {workerLoc ? `within ${data?.searchRadiusKm || 30} km of you` : ''}.{' '}
              {prediction?.available
                ? 'Short-term trend available.'
                : 'Not an AI prediction — yet.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}