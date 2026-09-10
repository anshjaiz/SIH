import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/auth/me');
        if (res.success) {
          setUser(res.data.user);
          setProfile(res.data.profile);
          connectSocket(res.data.user, res.data.profile);
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      }
      setLoading(false);
    };
    restore();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.success) {
      setUser(res.data.user);
      setProfile(res.data.profile);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      connectSocket(res.data.user, res.data.profile);
      return { success: true, data: res.data };
    }
    return { success: false, message: res.message };
  };

  const register = async (data) => {
    const res = await api.post('/auth/register', data);
    if (res.success) {
      // Email verification required — do NOT auto-login until the OTP is confirmed.
      if (res.requiresVerification) {
        return { success: true, requiresVerification: true, email: res.data?.email, data: res.data };
      }
      setUser(res.data.user);
      setProfile(res.data.profile || null);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      connectSocket(res.data.user, res.data.profile || null);
      return { success: true, data: res.data };
    }
    return { success: false, message: res.message };
  };

  const verifyOtp = async (email, otp) => {
    const res = await api.post('/auth/verify-otp', { email, otp });
    if (res.success) {
      setUser(res.data.user);
      setProfile(res.data.profile || null);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      connectSocket(res.data.user, res.data.profile || null);
      return { success: true, data: res.data };
    }
    return { success: false, message: res.message, status: res.status };
  };

  const resendOtp = async (email) => {
    const res = await api.post('/auth/resend-otp', { email });
    return res.success
      ? { success: true, message: res.message }
      : { success: false, message: res.message, status: res.status };
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setProfile(null);
    disconnectSocket();
  };

  const value = { user, profile, login, register, verifyOtp, resendOtp, logout, loading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
