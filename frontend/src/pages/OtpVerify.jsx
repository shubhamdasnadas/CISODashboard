import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../api';

export default function OtpVerify() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get('sessionId');

  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailHint = localStorage.getItem('ciso_2fa_email') || 'your email';

  async function submitOtp(e) {
    e.preventDefault();
    setError('');
    if (otp.length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const r = await api.post('/auth/2fa/verify-otp', { sessionId, otp });
      localStorage.setItem('ciso_token', r.data.accessToken);
      localStorage.removeItem('ciso_2fa_email');
      localStorage.removeItem('ciso_current_org_id');
      delete api.defaults.headers.common['X-Org-Id'];
      navigate('/select-organisation', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6 transition-colors duration-200">
      <div className="w-full max-w-md bg-[var(--card-bg)] rounded-2xl p-8 border border-[var(--card-border)] shadow-xl text-center">
        <span className="inline-block text-[11px] font-semibold text-[var(--muted)] uppercase tracking-widest mb-2">
          Step 2 of 2 · Enter code
        </span>
        <h1 className="text-xl font-bold text-[var(--foreground)]">Check your email</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          We sent a 6-digit verification code to{' '}
          <span className="font-semibold text-[var(--foreground)]">{emailHint}</span>.
          Enter it below to continue.
        </p>

        <form onSubmit={submitOtp} className="space-y-4 mt-6">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] text-center tracking-[0.5em] text-2xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="••••••"
            autoFocus
          />
          {error && <div className="text-sm text-red-500">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Verifying…' : 'Verify & continue'}
          </button>
        </form>

        <div className="mt-6">
          <Link to="/login-2fa" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
