import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../api';

export default function OtpVerify() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const username = params.get('username');
  const sessionId = params.get('sessionId');

  // Determine which flow we're in
  const is2faFlow = !!sessionId;
  const isTraditionalFlow = !!username && !sessionId;

  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailMasked, setEmailMasked] = useState('');
  const initialOtpSentRef = useRef(false);

  function startResendCooldown() {
    let seconds = 60;
    setResendCooldown(seconds);
    const interval = setInterval(() => {
      seconds -= 1;
      setResendCooldown(seconds);
      if (seconds <= 0) clearInterval(interval);
    }, 1000);
    return interval;
  }

  // Auto-send OTP only once when this page loads. React StrictMode runs effects
  // twice in development, so the ref prevents duplicate /send API calls.
  useEffect(() => {
    if (initialOtpSentRef.current) return;
    if (!isTraditionalFlow && !is2faFlow) return;

    initialOtpSentRef.current = true;
    let cancelled = false;
    let interval = null;

    async function sendInitialOtp() {
      try {
        if (isTraditionalFlow && username) {
          await api.post('/auth/otp/send', { username });
        } else if (is2faFlow && sessionId) {
          const storedEmail = localStorage.getItem('ciso_2fa_email');
          if (storedEmail) setEmailMasked(storedEmail);
          // 2FA OTP is already sent by /auth/2fa/login; do not call resend here.
        }

        if (!cancelled) {
          interval = startResendCooldown();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Could not send OTP');
        }
      }
    }

    sendInitialOtp();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [username, sessionId, isTraditionalFlow, is2faFlow]);

  // Resend OTP functionality
  async function handleResend(e) {
    e.preventDefault();
    if (resendCooldown > 0) return;
    setError('');
    try {
      if (isTraditionalFlow && username) {
        await api.post('/auth/otp/send', { username });
      } else if (is2faFlow && sessionId) {
        // 2FA flow: call the new resend endpoint
        await api.post('/auth/2fa/resend-otp', { sessionId });
      }
      startResendCooldown();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend OTP');
    }
  }

  async function submitOtp(e) {
    e.preventDefault();
    setError('');
    if (otp.length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      let token, user;

      if (isTraditionalFlow && username) {
        // Traditional flow: verify with username + otp
        const r = await api.post('/auth/otp/verify', { username, otp });
        token = r.data.token;
        user = r.data.user;
      } else if (is2faFlow && sessionId) {
        // 2FA flow: verify with sessionId + otp
        const r = await api.post('/auth/2fa/verify-otp', { sessionId, otp });
        token = r.data.accessToken;
        // Fetch user info using the token
        const userRes = await api.get('/auth/me');
        user = userRes.data.user;
      } else {
        throw new Error('Invalid flow: missing username or sessionId');
      }

      // Store token and user
      localStorage.setItem('ciso_token', token);
      localStorage.setItem('ciso_user', JSON.stringify(user));
      localStorage.removeItem('ciso_current_org_id');
      localStorage.removeItem('ciso_2fa_email');
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
          {is2faFlow ? 'Step 2 of 2 · Enter code' : 'Step 2 of 2 · Enter code'}
        </span>
        <h1 className="text-xl font-bold text-[var(--foreground)]">Check your email</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          We sent a 6-digit verification code to {emailMasked || 'your registered email'}.
          {isTraditionalFlow && !emailMasked && ' Enter it below to continue.'}
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

        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0 || loading}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
          </button>
          <Link to={is2faFlow ? '/login-2fa' : '/login'} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
