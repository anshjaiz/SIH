import { useEffect, useState } from 'react';
import api from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

export default function AdminForecast() {
  const [forecasts, setForecasts] = useState([]);
  const [allocation, setAllocation] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      const [fRes, aRes] = await Promise.all([
        api.get(`/admin/forecast${refresh ? '?refresh=true' : ''}`).catch(() => ({ data: [] })),
        api.get('/admin/allocations').catch(() => ({ data: null })),
      ]);
      setForecasts(fRes.data || []);
      setAllocation(aRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = () => {
    load(true);
    toast.success('Generating fresh forecasts...');
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  // Group forecasts by date
  const grouped = {};
  forecasts.forEach(f => {
    const date = f.forecastDate?.split('T')[0] || 'Unknown';
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(f);
  });

  // Top shortages
  const shortages = (allocation?.analysis || []).filter(a => a.shortage > 0);
  const recommendations = allocation?.recommendations || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">AI Demand Forecasting & Workforce Allocation</h2>
        <button onClick={handleRefresh} className="btn-primary text-sm">Refresh Forecasts</button>
      </div>

      {/* Forecast Table */}
      <div className="card">
        <h3 className="font-semibold mb-4">Demand Predictions</h3>
        {forecasts.length === 0 ? (
          <p className="text-gray-400 text-sm">No forecasts yet. Click refresh to generate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 font-medium">Expected Requests</th>
                  <th className="pb-2 font-medium">Confidence</th>
                  <th className="pb-2 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {forecasts.slice(0, 20).map((f, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-2">{f.forecastDate?.split('T')[0]}</td>
                    <td className="py-2 font-medium">{f.serviceName}</td>
                    <td className="py-2">{f.expectedRequests}</td>
                    <td className="py-2">
                      <span className={`badge ${f.confidence >= 80 ? 'badge-success' : f.confidence >= 60 ? 'badge-warning' : 'badge-gray'}`}>
                        {f.confidence}%
                      </span>
                    </td>
                    <td className="py-2">
                      {f.trend === 'UP' && <span className="text-green-600">↑ Up</span>}
                      {f.trend === 'DOWN' && <span className="text-red-600">↓ Down</span>}
                      {f.trend === 'STABLE' && <span className="text-gray-500">→ Stable</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Workforce Allocation */}
      {allocation && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Shortages */}
          <div className="card">
            <h3 className="font-semibold mb-4">Skill Shortages</h3>
            {shortages.length === 0 ? (
              <p className="text-green-600 text-sm font-medium">✓ No significant shortages detected</p>
            ) : (
              <div className="space-y-3">
                {shortages.map((s, i) => (
                  <div key={i} className="p-3 bg-red-50 rounded-lg">
                    <p className="font-medium text-sm text-red-700">{s.category}</p>
                    <p className="text-xs text-gray-600">
                      Expected: {s.expectedRequests} • Available capacity: {s.estimatedCapacity} • Shortage: {s.shortage}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recommendations */}
          <div className="card">
            <h3 className="font-semibold mb-4">AI Recommendations</h3>
            {recommendations.length === 0 ? (
              <p className="text-gray-400 text-sm">No specific recommendations at this time</p>
            ) : (
              <div className="space-y-3">
                {recommendations.slice(0, 5).map((r, i) => (
                  <div key={i} className={`p-3 rounded-lg ${r.severity === 'HIGH' ? 'bg-red-50' : 'bg-yellow-50'}`}>
                    <p className="font-medium text-sm">{r.type}</p>
                    <p className="text-xs text-gray-600 mt-1">{r.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Underutilized workers */}
      {allocation?.underutilizedWorkers?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">Underutilized Workers (Prioritize for Allocation)</h3>
          <div className="space-y-2">
            {allocation.underutilizedWorkers.slice(0, 10).map((w, i) => (
              <div key={i} className="p-2 bg-green-50 rounded-lg text-sm">
                Worker {w.workerId.toString().slice(-6)}: {w.workload} jobs this week in {w.category} — {w.recommendedAction}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
