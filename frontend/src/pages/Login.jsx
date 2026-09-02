import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import * as session from '../utils/session.js';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userStatus, setUserStatus] = useState({ checked: false, exists: false, organisations: [] });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    // A fresh visit to /login starts a NEW session for this tab — otherwise
    // the tab would silently resume whatever user last logged in here.
    if (session.getToken()) navigate('/select-organisation');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!username) {
      setUserStatus({ checked: false, exists: false, organisations: [] });
      setShowPassword(false);
      setError('');
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/auth/check-username', { username });
        setUserStatus({ checked: true, ...data });
        setShowPassword(Boolean(data.exists));
        setError(data.exists ? '' : 'Username not found');
      } catch (err) {
        console.error('[check-username] failed:', err);
        const body = err.response?.data;
        if (body?.detail) setError(`Server error: ${body.detail}`);
        else if (body?.error) setError(`Server error: ${body.error}`);
        else if (err.response) setError(`Server returned ${err.response.status}: ${err.response.statusText || 'no body'}`);
        else if (err.code === 'ERR_NETWORK') setError('Network error: is the backend running on http://localhost:3001?');
        else setError(`Cannot reach server (${err.code || err.message || 'unknown error'})`);
      }
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [username]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { username, password });
      if (data.otpRequested) {
        // Password valid, now go to OTP screen
        navigate('/verify-otp?username=' + encodeURIComponent(username));
      } else {
        // Legacy fallback - directly logged in (creates this tab's own session)
        session.setAuth({ token: data.token, user: data.user });
        session.setOrgId(null);
        delete api.defaults.headers.common['X-Org-Id'];
        navigate('/select-organisation');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6 transition-colors duration-200">
      <div className="w-full max-w-md bg-[var(--card-bg)] rounded-2xl p-8 border border-[var(--card-border)] shadow-xl">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">SecureHub</h1>
            <p className="text-[var(--muted)] text-sm">Sign in to continue</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Username</label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-4 py-2.5 pr-10 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                autoFocus
              />
              {userStatus.checked && userStatus.exists && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </div>
          </div>

          {/* Orgs preview */}
          {userStatus.exists && userStatus.organisations?.length > 0 && (
            <div className="bg-[var(--muted-bg)] rounded-xl p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Connected organisations</p>
              <div className="flex flex-wrap gap-2">
                {userStatus.organisations.map(o => (
                  <span key={o.id} className="px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm border border-indigo-200 dark:border-indigo-700">
                    {o.org_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Password */}
          {showPassword && (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 flex items-center gap-1.5">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!showPassword || !password || loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          {/* New 2FA flow: username+password -> QR scan -> email OTP -> org select */}
          {/* <Link
            to="/login-2fa"
            className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--input-border)] bg-[var(--background)] text-[var(--foreground)] font-semibold hover:bg-[var(--muted-bg)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m0 14v1m8-9h-1M5 12H4m13.657-5.657l-.707-.707M7.05 17.95l-.707.707m11.314 0l-.707-.707M7.05 6.05l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
            Sign in with QR code &amp; email verification
          </Link> */}

          
        </form>

        <p className="mt-6 text-xs text-[var(--muted)] text-center">
          Seed users: <span className="text-[var(--foreground)] font-medium">Shubham</span>, <span className="text-[var(--foreground)] font-medium">Ramesh</span>, <span className="text-[var(--foreground)] font-medium">Radhesh</span>, <span className="text-[var(--foreground)] font-medium">Raju</span>
        </p>
      </div>
    </div>
  );
}
