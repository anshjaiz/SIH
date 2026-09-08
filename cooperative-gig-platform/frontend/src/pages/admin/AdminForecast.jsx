import { useEffect, useState } from 'react';
import api from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import toast from 'react-hot-toast';

const MODEL_LABELS = {
  'matching-v1': 'Worker Matching',
  'collaboration-v1': 'Collaborator Recommendation',
  'forecast-v1': 'Demand Forecasting',
};

const levelBadge = (level) =>
  level === 'HIGH' ? 'badge badge-success' : level === 'MEDIUM' ? 'badge badge-warning' : 'badge badge-gray';

const metricSummary = (m) => {
  if (!m) return '';
  const parts = [];
  if (m.accuracy != null) parts.push(`${m.accuracy}% acc`);
  if (m.rmse != null) parts.push(`RMSE ${m.rmse}`);
  if (m.mape != null) parts.push(`MAPE ${m.mape}%`);
  if (m.r2 != null) parts.push(`R² ${m.r2}`);
  parts.push(`${m.trainSamples ?? 0} train`);
  return parts.join(' · ');
};

export default function AdminForecast() {
  const [forecasts, setForecasts] = useState([]);
  const [allocation, setAllocation] = useState(null);
  const [status, setStatus] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [selBooking, setSelBooking] = useState('');
  const [ranking, setRanking] = useState(null);
  const [collab, setCollab] = useState(null);
  const [training, setTraining] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      const [fRes, aRes, sRes, bRes] = await Promise.all([
        api.get(`/admin/forecast?days=7${refresh ? '&refresh=true' : ''}`).catch(() => ({ data: [] })),
        api.get('/admin/allocations').catch(() => ({ data: null })),
        api.get('/ai/status').catch(() => ({ data: null })),
        api.get('/admin/bookings').catch(() => ({ data: [] })),
      ]);
      setForecasts(fRes.data || []);
      setAllocation(aRes.data);
      setStatus(sRes.data);
      setBookings(bRes.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = () => {
    load(true);
    toast.success('Retraining models & generating fresh forecasts...');
  };

  const handleTrain = async () => {
    setTraining(true);
    try {
      await api.post('/ai/train', {}, { timeout: 120000 });
      await load(true);
      toast.success('All AI models retrained on historical data');
    } catch (e) {
      toast.error(e.message || 'Training failed');
    }
    setTraining(false);
  };

  const runDemo = async (id) => {
    if (!id) { setRanking(null); setCollab(null); return; }
    setRanking(null); setCollab(null);
    try {
      const [rk, cl] = await Promise.all([
        api.get(`/ai/worker-ranking/${id}`).catch(() => ({ data: null })),
        api.get(`/ai/collaborator-recommendation/${id}`).catch(() => ({ data: null })),
      ]);
      setRanking(rk.data);
      setCollab(cl.data);
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  const grouped = {};
  forecasts.forEach(f => {
    const date = f.forecastDate?.split('T')[0] || 'Unknown';
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(f);
  });

  const totalsByService = {};
  forecasts.forEach(f => {
    totalsByService[f.serviceName] = (totalsByService[f.serviceName] || { total: 0, zone: f.zone });
    totalsByService[f.serviceName].total += f.expectedRequests || 0;
  });
  const chartData = Object.entries(totalsByService)
    .map(([name, v]) => ({ name, jobs: v.total, zone: v.zone }))
    .sort((a, b) => b.jobs - a.jobs)
    .slice(0, 8);

  const shortages = (allocation?.analysis || []).filter(a => a.shortage > 0);
  const recommendations = allocation?.recommendations || [];
  const models = status?.models || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">AI Demand Forecasting & Workforce Allocation</h2>
          <p className="text-xs text-gray-500 mt-1">Trained in-process on real booking history (ridge + logistic regression) — refreshed on every job completion.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleTrain} disabled={training || status?.running} className="btn-primary text-sm">
            {training || status?.running ? 'Training…' : '⚙ Retrain AI Models'}
          </button>
          <button onClick={handleRefresh} className="btn-secondary text-sm">Refresh Forecasts</button>
        </div>
      </div>

      {/* Model status + pipeline */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Model Status</h3>
          <div className="flex gap-4 text-xs text-gray-500">
            {status?.running && <span className="text-brand-600">Running pipeline…</span>}
            {status?.lastRunAt && <span>Last trained: {new Date(status.lastRunAt).toLocaleString()}</span>}
            {status?.lastDurationMs != null && <span>{Math.round(status.lastDurationMs / 1000)}s</span>}
          </div>
        </div>
        {models.length === 0 ? (
          <p className="text-gray-400 text-sm">No trained models yet. Run “Retrain AI Models”.

          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {models.map(m => (
              <div key={m.key} className="p-3 rounded-lg border border-gray-100 bg-gray-50">
                <p className="font-medium text-sm">{MODEL_LABELS[m.key] || m.key}</p>
                <p className="text-xs text-gray-500 mt-1">{m.samples} historical samples</p>
                <p className="text-xs text-gray-600 mt-1">{metricSummary(m.metrics)}</p>
              </div>
            ))}
          </div>
        )}
        {status?.steps && (
          <div className="flex flex-wrap gap-2">
            {status.steps.map(s => (
              <span key={s.name} title={s.error || ''} className={`text-xs px-2 py-1 rounded-full ${s.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {s.ok ? '✓' : '✗'} {s.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Forecast chart + table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-1">
          <h3 className="font-semibold mb-4">Expected Jobs by Service (7 days)</h3>
          {chartData.length === 0 ? (
            <p className="text-gray-400 text-sm">No forecasts yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 12 }}>
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="jobs" radius={[0, 4, 4, 0]}>
                  {chartData.map((e, i) => (
                    <Cell key={i} fill={e.jobs >= 3 ? '#10b981' : e.jobs >= 1 ? '#f59e0b' : '#d1d5db'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card lg:col-span-2">
          <h3 className="font-semibold mb-4">Demand Predictions</h3>
          {forecasts.length === 0 ? (
            <p className="text-gray-400 text-sm">No forecasts yet. Click refresh to generate.</p>
          ) : (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Service</th>
                    <th className="pb-2 font-medium">Area</th>
                    <th className="pb-2 font-medium">Expected</th>
                    <th className="pb-2 font-medium">Demand Level</th>
                    <th className="pb-2 font-medium">Confidence</th>
                    <th className="pb-2 font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {forecasts.slice(0, 40).map((f, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 whitespace-nowrap">{f.forecastDate?.split('T')[0]}</td>
                      <td className="py-2 font-medium">{f.serviceName}</td>
                      <td className="py-2">{f.zone}</td>
                      <td className="py-2 font-semibold">{f.expectedRequests}</td>
                      <td className="py-2"><span className={levelBadge(f.level)}>{f.level}</span></td>
                      <td className="py-2">
                        <span className={`badge ${f.confidence >= 80 ? 'badge-success' : f.confidence >= 60 ? 'badge-warning' : 'badge-gray'}`}>
                          {f.confidence}%
                        </span>
                      </td>
                      <td className="py-2">
                        {f.trend === 'UP' && <span className="text-green-600">↑ Up</span>}
                        {f.trend === 'DOWN' && <span className="text-red-600">↓ Down</span>}
                        {f.trend === 'STABLE' && <span className="text-gray-500">→ Stable</span>}
                        {!f.trend && <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Workforce allocations */}
      {allocation && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-semibold mb-4">Workforce Shortages</h3>
            {shortages.length === 0 ? (
              <p className="text-green-600 text-sm font-medium">✓ No significant shortages detected</p>
            ) : (
              <div className="space-y-3">
                {shortages.map((s, i) => (
                  <div key={i} className="p-3 bg-red-50 rounded-lg">
                    <p className="font-medium text-sm text-red-700">{s.category} — {s.zone || 'All areas'}</p>
                    <p className="text-xs text-gray-600">
                      Expected: {s.expectedRequests} • Available: {s.availableWorkers} • Capacity: {s.estimatedCapacity} • Shortage: {s.shortage}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {allocation.underutilizedWorkers?.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Underutilized Workers (prioritize next booking)</p>
                <div className="space-y-2">
                  {allocation.underutilizedWorkers.slice(0, 8).map((w, i) => (
                    <div key={i} className="p-2 bg-green-50 rounded-lg text-xs text-gray-700">
                      {w.zone} · {w.category}: {w.workload} jobs this week — {w.recommendedAction}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="font-semibold mb-4">AI Recommendations</h3>
            {recommendations.length === 0 ? (
              <p className="text-gray-400 text-sm">No specific recommendations at this time</p>
            ) : (
              <div className="space-y-3">
                {recommendations.slice(0, 6).map((r, i) => (
                  <div key={i} className={`p-3 rounded-lg ${r.severity === 'HIGH' ? 'bg-red-50' : 'bg-yellow-50'}`}>
                    <p className="font-medium text-sm">{r.type} {r.zone && <span className="text-gray-400">· {r.zone}</span>}</p>
                    <p className="text-xs text-gray-600 mt-1">{r.message}</p>
                  </div>
                ))}
              </div>
            )}
            {allocation.peakPeriod && (
              <p className="text-xs text-gray-500 mt-3">{allocation.peakPeriod.message}</p>
            )}
          </div>
        </div>
      )}

      {/* Live model demos */}
      <div className="card">
        <h3 className="font-semibold mb-2">Live Model Demos — pick a past booking</h3>
        <p className="text-xs text-gray-500 mb-3">Worker matching and collaborator recommendation run the trained models in real time.</p>
        {bookings.length === 0 ? (
          <p className="text-gray-400 text-sm">No bookings to demo with.</p>
        ) : (
          <>
            <select
              className="input-field w-full md:w-96"
              value={selBooking}
              onChange={(e) => { setSelBooking(e.target.value); runDemo(e.target.value); }}
            >
              <option value="">Select a completed booking…</option>
              {bookings.slice(0, 60).map(b => (
                <option key={b._id} value={b._id}>
                  {b.bookingNumber} · {b.serviceSnapshot?.name || b.serviceName || 'Service'} · {b.city} · {b.status}
                </option>
              ))}
            </select>

            {(ranking || collab) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                {ranking && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Worker Ranking (AI)
                      {ranking.model === 'trained' && <span className="ml-2 text-brand-600">learned weights</span>}
                    </p>
                    <div className="space-y-2">
                      {ranking.ranked.slice(0, 5).map(r => (
                        <div key={r.workerId} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 text-sm">
                          <span className="font-medium">{r.name}</span>
                          <span className="text-xs text-gray-500">{r.distanceKm?.toFixed?.(1)} km</span>
                          <span className="badge badge-success">{Math.round(r.score)}</span>
                        </div>
                      ))}
                      {ranking.ranked.length === 0 && <p className="text-xs text-gray-400">No suitable workers found for this booking.</p>}
                    </div>
                  </div>
                )}
                {collab && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Collaborator Recommendation</p>
                    <div className={`p-3 rounded-lg ${collab.recommended ? 'bg-brand-50' : 'bg-gray-50'}`}>
                      <p className="text-lg font-bold">
                        {Math.round(collab.probability)}%
                        <span className="text-sm font-normal text-gray-500 ml-2">probability of needing an extra helper</span>
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {collab.probability >= 50 ? 'Recommend an additional on-the-ground collaborator.' : 'Single worker should suffice.'}
                      </p>
                      {(collab.nCollaborators || 0) > 0 && (
                        <p className="text-xs text-gray-500 mt-1">{collab.nCollaborators} similar past jobs needed collaborators</p>
                      )}
                      {collab.suggestedWorkers?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {collab.suggestedWorkers.slice(0, 3).map((w, i) => (
                            <p key={i} className="text-xs text-gray-600">{w.name} · {w.skills?.[0]?.name}</p>
                          ))}
                        </div>
                      )}
                    </div>
                    {(collab.basis || []).slice(0, 3).map((b, i) => (
                      <p key={i} className="text-xs text-gray-400 mt-1">• {b}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}