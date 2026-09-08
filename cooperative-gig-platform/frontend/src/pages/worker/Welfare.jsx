import { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineShieldCheck, HiOutlineAcademicCap, HiOutlineCurrencyRupee, HiOutlineHeart } from 'react-icons/hi';

export default function Welfare() {
  const [welfare, setWelfare] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [myTrainings, setMyTrainings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [wRes, tRes, mtRes] = await Promise.all([
          api.get('/workers/welfare').catch(() => ({ data: null })),
          api.get('/workers/trainings').catch(() => ({ data: [] })),
          api.get('/workers/trainings/my').catch(() => ({ data: [] })),
        ]);
        setWelfare(wRes.data);
        setTrainings(tRes.data || []);
        setMyTrainings(mtRes.data || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const handleEnroll = async (trainingId) => {
    try {
      await api.post('/workers/trainings/enroll', { trainingId });
      toast.success('Enrolled!');
      const res = await api.get('/workers/trainings/my');
      setMyTrainings(res.data || []);
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  const insurance = welfare?.insurance || {};

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Welfare & Training</h2>

      {/* Welfare overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <HiOutlineShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Insurance</p>
              <p className={`font-bold ${insurance.type === 'ACTIVE' ? 'text-green-600' : 'text-red-500'}`}>
                {insurance.type || 'INACTIVE'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <HiOutlineCurrencyRupee className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Cooperative Fund</p>
              <p className="font-bold">₹{(welfare?.cooperativeFundBalance || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <HiOutlineAcademicCap className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Trainings Completed</p>
              <p className="font-bold">{myTrainings.filter(t => t.status === 'COMPLETED' || t.status === 'CERTIFIED').length}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <HiOutlineHeart className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Emergency Fund</p>
              <p className="font-bold">₹{(welfare?.emergencyFund || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Welfare schemes */}
      <div className="card">
        <h3 className="font-semibold mb-4">Welfare Schemes</h3>
        {welfare?.schemesEnrolled?.length > 0 ? (
          <div className="space-y-3">
            {welfare.schemesEnrolled.map((scheme, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{scheme.name}</p>
                  <p className="text-xs text-gray-500">{scheme.category}</p>
                </div>
                <span className={`badge ${scheme.status === 'ENROLLED' ? 'badge-success' : scheme.status === 'ELIGIBLE' ? 'badge-info' : 'badge-gray'}`}>
                  {scheme.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <p>No schemes enrolled yet</p>
            <p className="text-xs mt-1">Contact cooperative admin for enrollment</p>
          </div>
        )}
      </div>

      {/* My Training */}
      {myTrainings.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">My Enrolled Trainings</h3>
          <div className="space-y-3">
            {myTrainings.map((enr) => (
              <div key={enr._id} className="p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{enr.training?.title || 'Training'}</p>
                    <p className="text-xs text-gray-500">Enrolled: {new Date(enr.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <span className={`badge ${
                      enr.status === 'COMPLETED' || enr.status === 'CERTIFIED' ? 'badge-success' : 'badge-info'
                    }`}>{enr.status}</span>
                    {enr.progressPercent > 0 && <p className="text-xs text-gray-500 mt-1">{enr.progressPercent}%</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Training */}
      <div className="card">
        <h3 className="font-semibold mb-4">Available Training Programs</h3>
        {trainings.length === 0 ? (
          <p className="text-gray-400 text-sm">No training programs available</p>
        ) : (
          <div className="space-y-3">
            {trainings.map((t) => {
              const enrolled = myTrainings.some((mt) => mt.training?._id === t._id);
              return (
                <div key={t._id} className="p-4 bg-gray-50 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-gray-500 mt-1">{t.description?.slice(0, 100)}</p>
                    <div className="flex gap-3 mt-2 text-xs text-gray-500">
                      <span>📂 {t.category || 'General'}</span>
                      <span>⏱ {t.duration || 'Self-paced'}</span>
                      <span>💻 {t.mode}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleEnroll(t._id)}
                    disabled={enrolled}
                    className={`text-sm px-3 py-1.5 rounded-lg ${enrolled ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
                  >
                    {enrolled ? 'Enrolled ✓' : 'Enroll'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
