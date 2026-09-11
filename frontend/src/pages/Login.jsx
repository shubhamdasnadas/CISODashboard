import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import * as session from '../utils/session.js';
import PageTransitionLoader from '../components/PageTransitionLoader.jsx';

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
        // Password valid — dispatch OTP code to registered email while whole-page loader is active
        await api.post('/auth/otp/send', { username });
        // OTP code dispatched successfully to mail -> transition to verification screen
        navigate('/verify-otp?username=' + encodeURIComponent(username) + '&sent=1');
      } else {
        // Legacy fallback - directly logged in (creates this tab's own session)
        session.setAuth({ token: data.token, user: data.user });
        session.setOrgId(null);
        delete api.defaults.headers.common['X-Org-Id'];
        navigate('/select-organisation');
      }
    } catch (err) {
      console.error('[login/otp] failed:', err);
      setError(err.response?.data?.error || err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6 transition-colors duration-200 relative">
      {/* Full-page animated shield loader shown after clicking Sign In until OTP is sent to email */}
      {loading && (
        <PageTransitionLoader
          isLoading={true}
          fullScreen={true}
          title="SecureHub"
          badge="Enterprise"
          messages={[
            'Verifying credentials…',
            'Generating secure verification code…',
            'Sending OTP code to your registered email…',
            'Preparing verification session…',
          ]}
        />
      )}

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
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Sending OTP…</span>
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="mt-6 text-xs text-[var(--muted)] text-center">
          Seed users: <span className="text-[var(--foreground)] font-medium">Shubham</span>, <span className="text-[var(--foreground)] font-medium">Ramesh</span>, <span className="text-[var(--foreground)] font-medium">Radhesh</span>, <span className="text-[var(--foreground)] font-medium">Raju</span>
        </p>
      </div>
    </div>
  );
}
