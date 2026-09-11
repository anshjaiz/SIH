import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../../components/LanguageSelector';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const handleRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      toast.success(res.message || t('toast.resetTokenSent'));
      if (res.data?.resetToken) {
        setResetToken(res.data.resetToken);
      }
      setStep(2);
    } catch (err) {
      toast.error(err.message || t('toast.resetFailed'));
    }
    setLoading(false);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, resetToken, newPassword });
      toast.success(t('toast.passwordReset'));
      setStep(3);
    } catch (err) {
      toast.error(err.message || t('toast.resetFailed'));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4"><LanguageSelector /></div>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('auth.resetPassword')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('auth.resetHelp')}</p>
        </div>

        {step === 1 && (
          <form onSubmit={handleRequest} className="space-y-4">
            <div>
              <label className="label-text">{t('auth.emailAddress')}</label>
              <input type="email" className="input-field" placeholder={t('auth.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? t('auth.sending') : t('auth.sendResetToken')}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="label-text">{t('auth.resetToken')}</label>
              <input type="text" className="input-field" placeholder={t('auth.enterToken')} value={resetToken} onChange={(e) => setResetToken(e.target.value)} required />
              <p className="text-xs text-gray-500 mt-1">{t('auth.checkEmailOrConsole')}</p>
            </div>
            <div>
              <label className="label-text">{t('auth.newPassword')}</label>
              <input type="password" className="input-field" placeholder={t('auth.newPasswordPlaceholder')} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? t('auth.resetting') : t('auth.resetPassword')}
            </button>
          </form>
        )}

        {step === 3 && (
          <div className="text-center">
            <p className="text-green-600 font-medium mb-4">{t('auth.resetSuccess')}</p>
            <Link to="/login" className="btn-primary inline-block">{t('auth.goToLogin')}</Link>
          </div>
        )}

        <div className="mt-6 text-center text-sm">
          <Link to="/login" className="text-brand-600 hover:text-brand-800 font-medium">{t('auth.backToLogin')}</Link>
        </div>
      </div>
    </div>
  );
}