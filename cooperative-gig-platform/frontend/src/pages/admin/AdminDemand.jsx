import { useEffect, useState } from 'react';
import api from '../../services/api';
import MapComponent from '../../components/MapComponent';

export default function AdminDemand() {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/admin/heatmap?days=${days}`);
        setPoints(res.data || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [days]);

  // Convert to heatmap circles
  const circles = points.map(p => ({
    lat: p.lat,
    lng: p.lng,
    color: p.isEmergency ? '#ef4444' : p.intensity > 3 ? '#f59e0b' : '#3b82f6',
    radius: p.isEmergency ? 800 : 600,
    opacity: p.isEmergency ? 0.35 : 0.25,
  }));

  const markers = points.filter((_, i) => i % 3 === 0).map(p => ({
    lat: p.lat,
    lng: p.lng,
    label: `${p.category}${p.isEmergency ? ' (EMERGENCY)' : ''}`,
    type: p.isEmergency ? 'worker' : 'customer',
  }));

  // Category summary
  const categorySummary = {};
  points.forEach(p => {
    if (!categorySummary[p.category]) categorySummary[p.category] = { count: 0, emergencies: 0 };
    categorySummary[p.category].count += 1;
    if (p.isEmergency) categorySummary[p.category].emergencies += 1;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Demand Heatmap</h2>
        <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} className="input-field max-w-xs">
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
      ) : (
        <>
          <div className="card p-0 overflow-hidden">
            <MapComponent
              center={[17.3850, 78.4867]}
              markers={markers}
              circles={circles}
              height="500px"
              zoom={12}
            />
          </div>

          {/* Legend */}
          <div className="card">
            <h3 className="font-semibold mb-3">Heatmap Legend</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"></div> Emergency requests</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> High demand</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Regular demand</div>
            </div>
          </div>

          {/* Category Summary */}
          <div className="card">
            <h3 className="font-semibold mb-3">Demand by Category</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(categorySummary).map(([cat, data]) => (
                <div key={cat} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-sm">{cat}</p>
                  <p className="text-xs text-gray-500">{data.count} requests • {data.emergencies} emergency</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
