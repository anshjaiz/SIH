import { useEffect, useState } from 'react';
import DashboardLayout from './DashboardLayout';
import LocationModal from '../components/LocationModal';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function WorkerLayout() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [initial, setInitial] = useState({});

  useEffect(() => {
    const load = async () => {
      if (user?.role !== 'worker') return;
      // Ask for the live location at most once per browser session so the
      // modal never keeps blocking the worker dashboard on every visit.
      if (sessionStorage.getItem('wk_location_prompted') === '1') return;
      sessionStorage.setItem('wk_location_prompted', '1');
      try {
        const res = await api.get('/workers/profile');
        const p = res.data;
        // Prefill with the saved location, but ALWAYS ask on every login so
        // the worker can confirm/update their live location for the 30 km radius.
        setInitial({
          address: p.address,
          city: p.city,
          lat: p.location?.coordinates?.[1],
          lng: p.location?.coordinates?.[0],
        });
        setShowModal(true);
      } catch {
        setShowModal(true);
      }
    };
    load();
  }, [user]);

  return (
    <>
      <DashboardLayout role="worker" />
      {showModal && (
        <LocationModal
          endpoint="/workers/profile"
          title="📍 Is this where you are working today?"
          description="Update your live location — jobs are shown only within 30 km of where you are."
          initial={initial}
          dismissable
          dismissLabel="Keep saved location"
          onDone={() => setShowModal(false)}
        />
      )}
    </>
  );
}