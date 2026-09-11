import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import OtpVerify from '../../components/auth/OtpVerify';
import LanguageSelector from '../../components/LanguageSelector';
import toast from 'react-hot-toast';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'customer' });
  const [loading, setLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState(null);
  const { register } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone || !form.password) {
      toast.error(t('toast.fillAllFields'));
      return;
    }
    if (form.password.length < 6) {
      toast.error(t('toast.passwordMin'));
      return;
    }
    setLoading(true);
    try {
      const result = await register(form);
      if (result.success && result.requiresVerification) {
        toast.success(result.message || t('toast.checkEmailCode'));
        setVerifyEmail({ email: form.email.trim().toLowerCase(), role: form.role });
      } else if (result.success) {
        toast.success(t('toast.registerSuccess'));
        navigate(`/${form.role === 'worker' ? 'worker' : 'customer'}`);
      } else {
        toast.error(result.message || t('toast.registrationFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('toast.registrationFailed'));
    }
    setLoading(false);
  };

  const handleVerified = (data) => {
    const role = data.user?.role;
    navigate(`/${role === 'worker' ? 'worker' : 'customer'}`);
  };

  if (verifyEmail) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center p-4">
        <div className="absolute top-4 right-4"><LanguageSelector /></div>
        <OtpVerify
          email={verifyEmail.email}
          onVerified={handleVerified}
          onBack={() => setVerifyEmail(null)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4"><LanguageSelector /></div>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-xl mb-4">
            <span className="text-2xl font-bold text-brand-700">{t('app.shortName')}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('auth.createAccount')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('auth.joinTagline')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-text">{t('auth.iAmA')}</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, role: 'customer' })}
                className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  form.role === 'customer'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                🏠 {t('roles.customer')}
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, role: 'worker' })}
                className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  form.role === 'worker'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                🔧 {t('roles.worker')}
              </button>
            </div>
          </div>

          <div>
            <label className="label-text">{t('auth.fullName')}</label>
            <input
              name="name"
              type="text"
              className="input-field"
              placeholder={t('auth.namePlaceholder')}
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <label className="label-text">{t('auth.email')}</label>
            <input
              name="email"
              type="email"
              className="input-field"
              placeholder={t('auth.emailPlaceholder')}
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <label className="label-text">{t('auth.phone')}</label>
            <input
              name="phone"
              type="tel"
              className="input-field"
              placeholder={t('auth.phonePlaceholder')}
              value={form.phone}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <label className="label-text">{t('auth.password')}</label>
            <input
              name="password"
              type="password"
              className="input-field"
              placeholder={t('auth.passwordPlaceholder')}
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                {t('auth.creatingAccount')}
              </>
            ) : (
              t('auth.createAccount')
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:text-brand-800">{t('auth.signIn')}</Link>
        </div>
      </div>
    </div>
  );
}