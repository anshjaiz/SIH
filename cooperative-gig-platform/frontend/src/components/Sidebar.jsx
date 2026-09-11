import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  const navItems = {
    customer: [
      { to: '/customer', icon: HiOutlineHome, label: t('nav.dashboard'), end: true },
      { to: '/customer/services', icon: HiOutlineBriefcase, label: t('nav.services') },
      { to: '/customer/bookings', icon: HiOutlineClipboardList, label: t('nav.myBookings') },
      { to: '/customer/payments', icon: HiOutlineCurrencyRupee, label: t('nav.payments') },
      { to: '/customer/complaints', icon: HiOutlineExclamationTriangle, label: t('nav.myComplaints') },
    ],
    worker: [
      { to: '/worker', icon: HiOutlineHome, label: t('nav.dashboard'), end: true },
      { to: '/worker/jobs', icon: HiOutlineBriefcase, label: t('nav.jobRequests') },
      { to: '/worker/active', icon: HiOutlineClock, label: t('nav.activeJobs') },
      { to: '/worker/history', icon: HiOutlineClipboardList, label: t('nav.jobHistory') },
      { to: '/worker/profile', icon: HiOutlineUser, label: t('nav.myProfile') },
      { to: '/worker/earnings', icon: HiOutlineCurrencyRupee, label: t('nav.earnings') },
      { to: '/worker/collaborations', icon: HiOutlineUsers, label: t('nav.collaborations') },
      { to: '/worker/complaints', icon: HiOutlineExclamationTriangle, label: t('nav.complaints') },
      { to: '/worker/welfare', icon: HiOutlineHeart, label: t('nav.welfare') },
    ],
    admin: [
      { to: '/admin', icon: HiOutlineHome, label: t('nav.dashboard'), end: true },
      { to: '/admin/workers', icon: HiOutlineUsers, label: t('nav.workers') },
      { to: '/admin/bookings', icon: HiOutlineClipboardList, label: t('nav.bookings') },
      { to: '/admin/payments', icon: HiOutlineCurrencyRupee, label: t('nav.payments') },
      { to: '/admin/complaints', icon: HiOutlineExclamationTriangle, label: t('nav.complaints') },
      { to: '/admin/analytics', icon: HiOutlineChartBar, label: t('nav.analytics') },
      { to: '/admin/demand', icon: HiOutlineMap, label: t('nav.demandHeatmap') },
      { to: '/admin/forecast', icon: HiOutlineFire, label: t('nav.aiForecasting') },
      { to: '/admin/reliability', icon: HiOutlineShieldCheck, label: t('nav.reliability') },
      { to: '/admin/welfare', icon: HiOutlineHeart, label: t('nav.workerWelfare') },
      { to: '/admin/settings', icon: HiOutlineCog, label: t('nav.settings') },
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
            <span className="font-bold text-brand-700 text-sm truncate">{t('app.name')}</span>
            <span className="text-[10px] text-gray-500 leading-tight truncate">{t('app.platformTagline')}</span>
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
          {!collapsed && <span>{t('nav.logout')}</span>}
        </button>
      </div>
    </aside>
  );
}
