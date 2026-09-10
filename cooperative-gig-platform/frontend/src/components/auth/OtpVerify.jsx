import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const RESEND_COOLDOWN = 30;

const maskEmail = (email) => {
  const e = String(email || '').trim().toLowerCase();
  const at = e.indexOf('@');
  if (at <= 0) return e;
  return `${e[0]}${'*'.repeat(Math.max(2, Math.min(at - 1, 3)))}${e.slice(at)}`;
};

export default function OtpVerify({ email, onVerified, onBack, heading = 'Verify your email' }) {
  const { verifyOtp, resendOtp } = useAuth();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputsRef = useRef([]);
  const sentInitialRef = useRef(false);

  const code = digits.join('');

  // Auto-show a fresh code state once on mount (login-after-unverified flow).
  useEffect(() => {
    if (!sentInitialRef.current && email) {
      sentInitialRef.current = true;
    }
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
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
        if (!silent) toast.success('A new verification code has been sent.');
        setDigits(['', '', '', '', '', '']);
        inputsRef.current[0]?.focus();
      } else {
        toast.error(res.message || 'Could not resend the code.');
      }
      setCooldown(RESEND_COOLDOWN);
    } catch {
      toast.error('Could not resend the code.');
    }
    setResending(false);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const res = await verifyOtp(email, code);
      if (res.success) {
        toast.success('Email verified successfully.');
        onVerified?.(res.data);
      } else {
        toast.error(res.message || 'Verification failed');
        // Expired or locked-out codes are useless — silently ask for a fresh one.
        if (/expired|too many/i.test(res.message || '')) {
          setDigits(['', '', '', '', '', '']);
          handleResend(true);
        }
      }
    } catch (err) {
      toast.error(err.message || 'Verification failed');
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-xl mb-4">
          <span className="text-2xl">✉️</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
        <p className="text-sm text-gray-500 mt-2">
          We sent a 6-digit verification code to{' '}
          <span className="font-medium text-gray-700">{maskEmail(email)}</span>. It expires in 5 minutes.
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
              className={`w-11 h-14 text-center text-xl font-bold border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                d ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-900'
              }`}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>

        <button type="submit" disabled={loading || code.length !== 6} className="btn-primary w-full flex items-center justify-center gap-2">
          {loading ? (
            <>
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
              Verifying...
            </>
          ) : (
            'Verify Email'
          )}
        </button>
      </form>

      <div className="mt-5 text-center text-sm text-gray-600">
        <span>Didn't receive it?</span>{' '}
        <button
          type="button"
          onClick={() => handleResend()}
          disabled={cooldown > 0 || resending}
          className="text-brand-600 font-medium hover:text-brand-800 disabled:text-gray-400"
        >
          {resending ? 'Sending...' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>

      {onBack && (
        <div className="mt-4 text-center text-sm text-gray-500">
          <button type="button" onClick={onBack} className="text-gray-500 hover:text-gray-700">
            ← Back to sign up
          </button>
        </div>
      )}
    </div>
  );
}