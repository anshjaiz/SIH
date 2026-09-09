import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import {
  HiOutlineHome, HiOutlineBriefcase, HiOutlineUser, HiOutlineCurrencyRupee,
  HiOutlineHeart, HiOutlineChartBar, HiOutlineCog, HiOutlineLogout,
  HiOutlineBell, HiOutlineMenu, HiOutlineX, HiOutlineFire,
  HiOutlineExclamation, HiOutlineMap, HiOutlineClock,
  HiOutlineClipboardList, HiOutlineUsers, HiOutlineShieldCheck,
} from 'react-icons/hi';
import { HiOutlineExclamationTriangle } from 'react-icons/hi2';

const ICON_CLASS = 'w-5 h-5';

export default function Sidebar({ role, collapsed, setCollapsed }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const navItems = {
    customer: [
      { to: '/customer', icon: HiOutlineHome, label: 'Dashboard', end: true },
      { to: '/customer/services', icon: HiOutlineBriefcase, label: 'Services' },
      { to: '/customer/bookings', icon: HiOutlineClipboardList, label: 'My Bookings' },
      { to: '/customer/complaints', icon: HiOutlineExclamationTriangle, label: 'My Complaints' },
    ],
    worker: [
      { to: '/worker', icon: HiOutlineHome, label: 'Dashboard', end: true },
      { to: '/worker/jobs', icon: HiOutlineBriefcase, label: 'Job Requests' },
      { to: '/worker/active', icon: HiOutlineClock, label: 'Active Jobs' },
      { to: '/worker/history', icon: HiOutlineClipboardList, label: 'Job History' },
      { to: '/worker/profile', icon: HiOutlineUser, label: 'My Profile' },
      { to: '/worker/earnings', icon: HiOutlineCurrencyRupee, label: 'Earnings' },
      { to: '/worker/collaborations', icon: HiOutlineUsers, label: 'Collaborations' },
      { to: '/worker/complaints', icon: HiOutlineExclamationTriangle, label: 'Complaints' },
      { to: '/worker/welfare', icon: HiOutlineHeart, label: 'Welfare & Training' },
    ],
    admin: [
      { to: '/admin', icon: HiOutlineHome, label: 'Dashboard', end: true },
      { to: '/admin/workers', icon: HiOutlineUsers, label: 'Workers' },
      { to: '/admin/bookings', icon: HiOutlineClipboardList, label: 'Bookings' },
      { to: '/admin/complaints', icon: HiOutlineExclamationTriangle, label: 'Complaints' },
      { to: '/admin/analytics', icon: HiOutlineChartBar, label: 'Analytics' },
      { to: '/admin/demand', icon: HiOutlineMap, label: 'Demand Heatmap' },
      { to: '/admin/forecast', icon: HiOutlineFire, label: 'AI Forecasting' },
      { to: '/admin/reliability', icon: HiOutlineShieldCheck, label: 'Reliability' },
      { to: '/admin/welfare', icon: HiOutlineHeart, label: 'Worker Welfare' },
      { to: '/admin/settings', icon: HiOutlineCog, label: 'Settings' },
    ],
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} fixed h-full z-40`}>
      {/* Logo */}
      <div className="h-16 border-b border-gray-100 flex items-center justify-between px-4">
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-brand-700 text-sm truncate">Aman Seva</span>
            <span className="text-[10px] text-gray-500 leading-tight truncate">Cooperative Gig Platform</span>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-500 hover:text-gray-700 p-1 rounded-md">
          {collapsed ? <HiOutlineMenu className="w-5 h-5" /> : <HiOutlineX className="w-5 h-5" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {(navItems[role] || []).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
            title={collapsed ? item.label : ''}
          >
            <item.icon className={ICON_CLASS} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-gray-100 px-3 py-4">
        {!collapsed && (
          <div className="text-xs text-gray-600 truncate mb-2 px-4">{user?.name}</div>
        )}
        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-left text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <HiOutlineLogout className={ICON_CLASS} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
