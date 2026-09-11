import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';

const categoryIcons = {
  'Plumbing': '🔧', 'Electrical': '⚡', 'Carpentry': '🪵', 'Painting': '🎨',
  'Cleaning': '🧹', 'Gardening': '🌿', 'Driving': '🚗', 'Appliance Repair': '🔩',
  'Domestic Help': '🏠', 'Caregiving': '❤️', 'Other community services': '🌐',
};

export default function Services() {
  const { t, i18n } = useTranslation();
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [svcRes, catRes] = await Promise.all([
          api.get('/services'),
          api.get('/services/categories'),
        ]);
        setServices(svcRes.data || []);
        setCategories(['All', ...(catRes.data || [])]);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, []);

  const filtered = services.filter((s) => {
    const matchCat = selectedCategory === 'All' || s.category === selectedCategory;
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const translateCat = (key) => {
    if (key === 'All') return t('cats.all');
    return t(`cats.${key}`, key);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-gray-900">{t('svc.title')}</h2>
        <input
          type="text"
          placeholder={t('svc.searchPlaceholder')}
          className="input-field max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat !== 'All' && categoryIcons[cat] ? `${categoryIcons[cat]} ` : ''}{translateCat(cat)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">{t('svc.noServices')}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((svc) => (
            <div key={svc._id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{categoryIcons[svc.category] || '🔧'}</span>
                <div>
                  <h3 className="font-semibold text-gray-900">{svc.name}</h3>
                  <span className="badge badge-info text-xs">{translateCat(svc.category)}</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-4 line-clamp-2">{svc.description}</p>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-gray-500">{t('svc.basePrice')}</p>
                  <p className="font-bold text-lg text-brand-600">₹{svc.basePrice}</p>
                </div>
                <div className="text-right text-gray-500">
                  <p>{svc.estimatedDuration} {t('common.min')}</p>
                  <p className="text-xs">{svc.unit || t('common.perVisit')}</p>
                </div>
              </div>
              {svc.emergencyAvailable && (
                <p className="text-xs text-orange-600 mt-2 font-medium">{t('svc.emergencyAvailable')}</p>
              )}
              <Link
                to={`/customer/services/request/${svc._id}`}
                className="btn-primary w-full mt-4 text-center text-sm"
              >
                {t('svc.bookNow')}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}