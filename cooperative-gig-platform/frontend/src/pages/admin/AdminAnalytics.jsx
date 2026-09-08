import { useEffect, useState } from 'react';
import api from '../../services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/admin/analytics');
        setData(res.data);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Analytics</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Over Time */}
        <div className="card">
          <h3 className="font-semibold mb-4">Revenue Over Time</h3>
          {data?.revenueOverTime?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.revenueOverTime.map(d => ({ date: d._id, revenue: d.revenue, count: d.count }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="Revenue (₹)" />
                <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} name="Bookings" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm text-center py-12">No data available</p>
          )}
        </div>

        {/* Demand by Service */}
        <div className="card">
          <h3 className="font-semibold mb-4">Demand by Service Category</h3>
          {data?.demandByService?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.demandByService.map(d => ({ name: d._id, count: d.count }))}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.demandByService.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm text-center py-12">No data available</p>
          )}
        </div>

        {/* Workload Distribution */}
        <div className="card">
          <h3 className="font-semibold mb-4">Worker Workload Distribution (This Week)</h3>
          {data?.workloadDistribution?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.workloadDistribution.map((w, i) => ({ name: `Worker ${i + 1}`, jobs: w }))}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="jobs" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm text-center py-12">No data available</p>
          )}
        </div>

        {/* Satisfaction Trend */}
        <div className="card">
          <h3 className="font-semibold mb-4">Customer Satisfaction Trend</h3>
          {data?.satisfactionTrend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.satisfactionTrend.map(d => ({ date: d._id, rating: Math.round(d.avg * 10) / 10, reviews: d.count }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 5]} />
                <Tooltip />
                <Line type="monotone" dataKey="rating" stroke="#f59e0b" strokeWidth={2} name="Avg Rating" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm text-center py-12">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
