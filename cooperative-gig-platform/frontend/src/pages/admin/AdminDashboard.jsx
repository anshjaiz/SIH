import { useEffect, useState } from 'react';
import api from '../../services/api';
import StatsCard from '../../components/StatsCard';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import {
  HiOutlineUsers, HiOutlineCheckCircle, HiOutlineClock,
  HiOutlineCurrencyRupee, HiOutlineStar, HiOutlineExclamation,
} from 'react-icons/hi';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/admin/dashboard');
        setData(res.data);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  const stats = data?.stats || {};
  const charts = data?.charts || {};

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Cooperative Dashboard</h2>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Workers" value={stats.totalWorkers} icon={HiOutlineUsers} color="brand" />
        <StatsCard title="Verified Workers" value={stats.verifiedWorkers} icon={HiOutlineCheckCircle} color="success" />
        <StatsCard title="Today's Bookings" value={stats.todaysBookings} icon={HiOutlineClock} color="info" />
        <StatsCard title="Revenue (Total)" value={`₹${(stats.revenue || 0).toLocaleString()}`} icon={HiOutlineCurrencyRupee} color="success" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Pending Jobs" value={stats.pendingJobs} icon={HiOutlineClock} color="warning" />
        <StatsCard title="Completed Jobs" value={stats.completedJobs} icon={HiOutlineCheckCircle} color="success" />
        <StatsCard title="Open Complaints" value={stats.openComplaints} icon={HiOutlineExclamation} color="danger" />
        <StatsCard title="Avg Rating" value={stats.customerSatisfaction?.toFixed(1) || 'N/A'} icon={HiOutlineStar} color="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bookings by category */}
        <div className="card">
          <h3 className="font-semibold mb-4">Bookings by Category</h3>
          {charts.bookingsByCategory?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={charts.bookingsByCategory.map(c => ({ name: c._id || 'Other', count: c.count }))}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">No data</p>
          )}
        </div>

        {/* Daily revenue */}
        <div className="card">
          <h3 className="font-semibold mb-4">Revenue Trend</h3>
          {charts.dailyRevenue?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={charts.dailyRevenue.map(d => ({ date: d._id, revenue: d.revenue }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">No data</p>
          )}
        </div>

        {/* Monthly bookings */}
        <div className="card">
          <h3 className="font-semibold mb-4">Monthly Bookings</h3>
          {charts.monthlyBookings?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={charts.monthlyBookings.map(d => ({ date: d._id, count: d.count }))}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">No data</p>
          )}
        </div>

        {/* Worker earnings */}
        <div className="card">
          <h3 className="font-semibold mb-4">Worker Earnings</h3>
          <div className="flex flex-col items-center justify-center h-[200px]">
            <p className="text-3xl font-bold text-green-600">₹{(stats.workerEarnings || 0).toLocaleString()}</p>
            <p className="text-sm text-gray-500">Total worker net earnings</p>
            <p className="text-xs text-gray-400 mt-2">{stats.completedPayments || 0} payments processed</p>
          </div>
        </div>
      </div>
    </div>
  );
}
