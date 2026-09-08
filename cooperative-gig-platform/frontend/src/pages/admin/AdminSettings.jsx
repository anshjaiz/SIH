import { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/admin/settings');
        setSettings(res.data);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/admin/settings', settings);
      toast.success('Settings saved!');
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Cooperative Settings</h2>

      <form onSubmit={handleSave} className="card space-y-4">
        <div>
          <label className="label-text">Cooperative Name</label>
          <input className="input-field" value={settings?.name || ''} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-text">Platform Fee (%)</label>
            <input type="number" className="input-field" value={settings?.platformFeePercent || 0} onChange={(e) => setSettings({ ...settings, platformFeePercent: parseFloat(e.target.value) || 0 })} step="0.1" />
          </div>
          <div>
            <label className="label-text">Cooperative Contribution (%)</label>
            <input type="number" className="input-field" value={settings?.cooperativeContributionPercent || 0} onChange={(e) => setSettings({ ...settings, cooperativeContributionPercent: parseFloat(e.target.value) || 0 })} step="0.1" />
          </div>
        </div>

        <div>
          <label className="label-text">Address</label>
          <input className="input-field" value={settings?.address || ''} onChange={(e) => setSettings({ ...settings, address: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-text">Contact Email</label>
            <input type="email" className="input-field" value={settings?.contactEmail || ''} onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })} />
          </div>
          <div>
            <label className="label-text">Contact Phone</label>
            <input type="tel" className="input-field" value={settings?.contactPhone || ''} onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="label-text">Emergency Helpline</label>
          <input type="tel" className="input-field" value={settings?.emergencyHelpline || ''} onChange={(e) => setSettings({ ...settings, emergencyHelpline: e.target.value })} />
        </div>

        {/* Allocation Weights */}
        <div className="mt-6">
          <h3 className="font-semibold text-gray-700 mb-3">Matching Algorithm Weights</h3>
          <div className="grid grid-cols-2 gap-4">
            {['skill', 'distance', 'availability', 'rating', 'experience', 'workload'].map(w => (
              <div key={w}>
                <label className="label-text capitalize">{w} Weight</label>
                <input
                  type="number"
                  className="input-field"
                  value={settings?.allocationWeights?.[w] || 0}
                  onChange={(e) => setSettings({
                    ...settings,
                    allocationWeights: { ...(settings?.allocationWeights || {}), [w]: parseInt(e.target.value) || 0 }
                  })}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Weights determine how workers are matched. Sum = 100.</p>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
