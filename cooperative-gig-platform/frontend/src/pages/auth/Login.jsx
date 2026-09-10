import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import OtpVerify from '../../components/auth/OtpVerify';
import toast from 'react-hot-toast';
import { HiEye, HiEyeOff } from 'react-icons/hi';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        toast.success('Login successful!');
        const role = result.data.user.role;
        navigate(`/${role === 'worker' ? 'worker' : role === 'admin' ? 'admin' : 'customer'}`);
      } else if (/verify your email/i.test(result.message || '')) {
        setVerifyEmail(email);
      } else {
        toast.error(result.message || 'Login failed');
      }
    } catch (err) {
      toast.error(err.message || 'Login failed');
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
        <OtpVerify
          email={verifyEmail}
          onVerified={handleVerified}
          onBack={() => setVerifyEmail(null)}
          heading="Verify your email to sign in"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-xl mb-4">
            <span className="text-2xl font-bold text-brand-700">AS</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Aman Seva Cooperative</h1>
          <p className="text-sm text-gray-500 mt-1">Cooperative Gig Services Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label-text">Email</label>
            <input
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="label-text">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-field pr-10"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-gray-600">Remember me</span>
            </label>
            <Link to="/forgot-password" className="text-brand-600 hover:text-brand-800 font-medium">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-brand-600 font-medium hover:text-brand-800">Register now</Link>
        </div>

        {/* Demo credentials hint */}
        <div className="mt-6 bg-gray-50 rounded-lg p-4 text-xs text-gray-600">
          <p className="font-medium mb-2 text-gray-700">Demo Credentials (after seeding):</p>
          <p>Admin: admin@coop.in / Admin@123</p>
          <p>Customer: customer1@test.com / Pass@123</p>
          <p>Worker: worker1@test.com / Pass@123</p>
        </div>
      </div>
    </div>
  );
}
