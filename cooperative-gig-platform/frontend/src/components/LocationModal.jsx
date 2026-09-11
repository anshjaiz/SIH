import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../services/api';
import LocationPicker from './LocationPicker';

export default function LocationModal({
  onDone,
  endpoint = '/customers/profile',
  title,
  description,
  initial = {},
  dismissable = false,
  dismissLabel,
}) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('loc.title', '📍 Set your location');
  const resolvedDescription = description ?? t('loc.description', "We'll use this as your default location so you get matched with nearby jobs only.");
  const resolvedDismissLabel = dismissLabel ?? t('loc.dismissLabel', 'Skip for now');
  const [value, setValue] = useState({
    address: initial.address || '',
    city: initial.city || '',
    lat: initial.lat || initial.location?.coordinates?.[1] || '17.385',
    lng: initial.lng || initial.location?.coordinates?.[0] || '78.487',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.address || !value.city) {
      toast.error(t('toast.locMissing', 'Please enter your address and city'));
      return;
    }
    setSaving(true);
    try {
      await api.put(endpoint, {
        address: value.address,
        city: value.city,
        location: {
          type: 'Point',
          coordinates: [parseFloat(value.lng) || 78.487, parseFloat(value.lat) || 17.385],
        },
      });
      toast.success(t('toast.locSaved', 'Location saved.'));
      onDone();
    } catch (err) {
      toast.error(err.message || t('toast.locSaveFail', 'Failed to save location'));
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-bold text-gray-900">{resolvedTitle}</h2>
          <p className="text-sm text-gray-500 mt-1">{resolvedDescription}</p>

          <div className="mt-5">
            <LocationPicker value={value} onChange={setValue} />
          </div>

          <div className="mt-6 flex gap-3">
            {dismissable && (
              <button onClick={onDone} type="button" className="btn-secondary flex-1">
                {resolvedDismissLabel}
              </button>
            )}
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? t('loc.saving', 'Saving...') : t('loc.save', 'Save location')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}