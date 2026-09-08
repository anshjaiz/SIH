import { useEffect, useState } from 'react';
import api from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function Earnings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/workers/earnings');
        setData(res.data);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  const summary = data?.summary || {};
  const payments = data?.payments || [];

  // Create chart data
  const chartData = payments.slice(0, 10).map((p, i) => ({
    name: p.booking?.serviceSnapshot?.name || `Job ${i + 1}`,
    gross: p.workerGross || p.amount,
    net: p.workerNetEarnings || p.amount,
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">My Earnings</h2>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card bg-green-50 border-green-200">
          <p className="text-sm text-green-700 font-medium">Total Net Earnings</p>
          <p className="text-2xl font-bold text-green-800 mt-1">₹{(summary.totalNet || 0).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Gross Amount</p>
          <p className="text-2xl font-bold mt-1">₹{(summary.totalGross || 0).toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Cooperative Contribution</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">₹{(summary.totalCoopDeduction || 0).toLocaleString()}</p>
          <p className="text-xs text-gray-500">For your welfare fund</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">Recent Earnings</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="gross" fill="#93c5fd" name="Gross" radius={[4, 4, 0, 0]} />
              <Bar dataKey="net" fill="#22c55e" name="Net" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payment history */}
      <div className="card">
        <h3 className="font-semibold mb-4">Payment History</h3>
        {payments.length === 0 ? (
          <p className="text-gray-400 text-sm">No payments yet</p>
        ) : (
          <div className="space-y-3">
            {payments.map((p) => (
              <div key={p._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{p.booking?.serviceSnapshot?.name || 'Service'}</p>
                  <p className="text-xs text-gray-500">{p.method} • {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-600">₹{p.workerNetEarnings}</p>
                  <p className="text-xs text-gray-500">Gross: ₹{p.workerGross}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
