import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import StatsCard from '../../components/StatsCard';
import MapComponent from '../../components/MapComponent';
import {
  HiOutlineBriefcase, HiOutlineCurrencyRupee, HiOutlineClock,
  HiOutlineCheckCircle,
} from 'react-icons/hi';
import { HiOutlineMapPin } from 'react-icons/hi2';

export default function CustomerDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/customers/dashboard');
        setDashboard(res.data);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  const stats = dashboard?.stats || {};
  const upcoming = dashboard?.upcomingBooking;
  const activeJob = dashboard?.activeJob;
  const previousJobs = dashboard?.previousJobs || [];
  const recommended = dashboard?.recommendedServices || [];
  const nearby = dashboard?.nearbyWorkers || [];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Welcome back!</h2>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Bookings" value={stats.totalBookings} icon={HiOutlineBriefcase} color="brand" />
        <StatsCard title="Total Spent" value={`₹${(stats.totalSpending || 0).toLocaleString()}`} icon={HiOutlineCurrencyRupee} color="success" />
        <StatsCard title="Completed" value={stats.completedBookings} icon={HiOutlineCheckCircle} color="success" />
        <StatsCard title="Upcoming" value={upcoming ? 1 : 0} icon={HiOutlineClock} color="warning" />
      </div>

      {/* Active Job / Upcoming */}
      {(activeJob || upcoming) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {activeJob && (
            <div className="card border-l-4 border-green-500">
              <h3 className="font-semibold text-green-700 mb-2">Active Job</h3>
              <p className="font-medium">{activeJob.service?.name}</p>
              <p className="text-sm text-gray-500">Status: {activeJob.status}</p>
              <Link to={`/customer/bookings/${activeJob._id}`} className="btn-primary text-sm mt-3 inline-block">
                Track Job →
              </Link>
            </div>
          )}
          {upcoming && (
            <div className="card border-l-4 border-blue-500">
              <h3 className="font-semibold text-blue-700 mb-2">Upcoming Booking</h3>
              <p className="font-medium">{upcoming.service?.name}</p>
              <p className="text-sm text-gray-500">
                Date: {new Date(upcoming.requestedDate).toLocaleDateString()}
              </p>
              <Link to={`/customer/bookings/${upcoming._id}`} className="btn-primary text-sm mt-3 inline-block">
                View Booking →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Quick Service Request */}
      <div className="card bg-gradient-to-r from-brand-600 to-brand-800 text-white">
        <h3 className="font-semibold mb-2">Need a service?</h3>
        <p className="text-sm text-blue-100 mb-4">Find verified workers near you instantly</p>
        <Link to="/customer/services" className="btn-accent inline-block">
          Browse Services
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recommended Services */}
        <div className="card">
          <h3 className="font-semibold mb-4">Recommended Services</h3>
          {recommended.length === 0 ? (
            <p className="text-gray-400 text-sm">No services yet</p>
          ) : (
            <div className="space-y-3">
              {recommended.map((svc) => (
                <div key={svc._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{svc.name}</p>
                    <p className="text-xs text-gray-500">{svc.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-brand-600">₹{svc.basePrice}</p>
                    <Link to={`/customer/services/request/${svc._id}`} className="text-xs text-brand-600 hover:underline">Book now</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Previous Jobs */}
        <div className="card">
          <h3 className="font-semibold mb-4">Recent Jobs</h3>
          {previousJobs.length === 0 ? (
            <p className="text-gray-400 text-sm">No previous jobs</p>
          ) : (
            <div className="space-y-3">
              {previousJobs.map((job) => (
                <Link
                  to={`/customer/bookings/${job._id}`}
                  key={job._id}
                  className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{job.service?.name}</p>
                    <span className={`badge ${
                      job.status === 'COMPLETED' ? 'badge-success' :
                      job.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{new Date(job.createdAt).toLocaleDateString()}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Nearby Workers */}
      {nearby.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">
            <HiOutlineMapPin className="w-4 h-4 inline mr-1" />
            Nearby Verified Workers
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {nearby.map((worker) => (
              <div key={worker._id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm">
                    {worker.user?.name?.charAt(0) || 'W'}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{worker.user?.name}</p>
                    <p className="text-xs text-gray-500">
                      ⭐ {worker.rating?.toFixed(1)} • {worker.completedJobs} jobs
                    </p>
                  </div>
                </div>
                {worker.distanceKm && (
                  <p className="text-xs text-gray-500">~{worker.distanceKm} km away</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
