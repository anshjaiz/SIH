import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from './DashboardLayout';
import LocationModal from '../components/LocationModal';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function WorkerLayout() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const [initial, setInitial] = useState({});

  useEffect(() => {
    const load = async () => {
      if (user?.role !== 'worker') return;
      // Ask for the live location on every login so the worker can confirm or
      // update where they are working today (jobs match within 30 km).
      try {
        const res = await api.get('/workers/profile');
        const p = res.data;
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
          title={t('loc.workerTitle')}
          description={t('loc.workerDesc')}
          initial={initial}
          dismissable
          dismissLabel={t('loc.workerKeepSaved')}
          onDone={() => setShowModal(false)}
        />
      )}
    </>
  );
}