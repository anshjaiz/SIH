import { useEffect, useState } from 'react';
import DashboardLayout from './DashboardLayout';
import LocationModal from '../components/LocationModal';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function CustomerLayout() {
  const { user } = useAuth();
  const [needsLocation, setNeedsLocation] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await api.get('/customers/profile');
        const p = res.data;
        if (p && !p.address && !p.city) setNeedsLocation(true);
      } catch {
        /* ignore */
      }
    };
    if (user?.role === 'customer') check();
  }, [user]);

  return (
    <>
      <DashboardLayout role="customer" />
      {needsLocation && (
        <LocationModal onDone={() => setNeedsLocation(false)} />
      )}
    </>
  );
}