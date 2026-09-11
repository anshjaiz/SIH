import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

const RESEND_COOLDOWN = 30;

const maskEmail = (email) => {
  const e = String(email || '').trim().toLowerCase();
  const at = e.indexOf('@');
  if (at <= 0) return e;
  return `${e[0]}${'*'.repeat(Math.max(2, Math.min(at - 1, 3)))}${e.slice(at)}`;
};

export default function OtpVerify({ email, onVerified, onBack, heading }) {
  const { verifyOtp, resendOtp } = useAuth();
  const { t } = useTranslation();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputsRef = useRef([]);
  const sentInitialRef = useRef(false);

  const code = digits.join('');
  const displayHeading = heading || t('auth.verificationCode');

  useEffect(() => {
    if (!sentInitialRef.current && email) {
      sentInitialRef.current = true;
    }
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t2 = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t2);
  }, [cooldown]);

  const focusNext = (i) => inputsRef.current[i + 1]?.focus();
  const focusPrev = (i) => inputsRef.current[i - 1]?.focus();

  const handleChange = (i, value) => {
    if (value && !/^\d$/.test(value)) return;
    setDigits((prev) => {
      const next = [...prev];
      next[i] = value;
      if (value && i < 5) inputsRef.current[i + 1]?.focus();
      return next;
    });
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      setDigits((prev) => {
        const next = [...prev];
        next[i - 1] = '';
        return next;
      });
      focusPrev(i);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    setDigits(Array.from({ length: 6 }, (_, i) => pasted[i] || ''));
    inputsRef.current[pasted.length]?.focus();
  };

  const handleResend = async (silent = false) => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      const res = await resendOtp(email);
      if (res.success) {
        if (!silent) toast.success(t('toast.verificationCodeSent'));
        setDigits(['', '', '', '', '', '']);
        inputsRef.current[0]?.focus();
      } else {
        toast.error(res.message || t('toast.codeResendFailed'));
      }
      setCooldown(RESEND_COOLDOWN);
    } catch {
      toast.error(t('toast.codeResendFailed'));
    }
    setResending(false);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      toast.error(t('toast.enter6Digit'));
      return;
    }
    setLoading(true);
    try {
      const res = await verifyOtp(email, code);
      if (res.success) {
        toast.success(t('toast.emailVerified'));
        onVerified?.(res.data);
      } else {
        toast.error(res.message || t('toast.verificationFailed'));
        if (/expired|too many/i.test(res.message || '')) {
          setDigits(['', '', '', '', '', '']);
          handleResend(true);
        }
      }
    } catch (err) {
      toast.error(err.message || t('toast.verificationFailed'));
    }
    setLoading(false);
  };

  return (
    <div className="auth-shell w-full max-w-md rounded-[1.25rem] p-6 sm:p-8">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <span className="text-xl">✉</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#17211b]">{displayHeading}</h1>
        <p className="mt-2 text-sm text-[#68756b]">
          {t('auth.otpSentTo')}{' '}
          <span className="font-semibold text-[#35443a]">{maskEmail(email)}</span>. {t('auth.otpExpiresIn', { minutes: 5 })}
        </p>
      </div>

      <form onSubmit={handleVerify}>
        <div className="flex justify-center gap-2 mb-6" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputsRef.current[i] = el)}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              inputMode="numeric"
              maxLength={2}
              className={`h-14 w-11 rounded-lg border-2 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                d ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-900'
              }`}
              aria-label={t('auth.digitLabel', { number: i + 1 })}
            />
          ))}
        </div>

        <button type="submit" disabled={loading || code.length !== 6} className="btn-primary w-full flex items-center justify-center gap-2">
          {loading ? (
            <>
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
              {t('auth.verifying')}
            </>
          ) : (
            t('auth.verifyEmail')
          )}
        </button>
      </form>

      <div className="mt-5 text-center text-sm text-[#68756b]">
        <span>{t('auth.didntReceive')}</span>{' '}
        <button
          type="button"
          onClick={() => handleResend()}
          disabled={cooldown > 0 || resending}
          className="font-bold text-brand-600 hover:text-brand-800 disabled:text-gray-400"
        >
          {resending ? t('auth.sending') : cooldown > 0 ? t('auth.resendCodeIn', { seconds: cooldown }) : t('auth.resendCode')}
        </button>
      </div>

      {onBack && (
        <div className="mt-4 text-center text-sm text-gray-500">
          <button type="button" onClick={onBack} className="text-gray-500 hover:text-gray-700">
            ← {t('auth.backToRegister')}
          </button>
        </div>
      )}
    </div>
  );
}