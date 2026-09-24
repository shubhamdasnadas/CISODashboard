import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../api';
import * as session from '../utils/session.js';
import PageTransitionLoader from '../components/PageTransitionLoader.jsx';
import OtpNotificationToast from '../components/OtpNotificationToast.jsx';

const TOTAL_STEPS = 2;

export default function OtpVerify() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get('email');
  const username = params.get('username') || email;
  const userIdentifier = email || username;
  const sessionId = params.get('sessionId');
  const alreadySent = params.get('sent') === '1';

  // Determine which flow we're in
  const is2faFlow = !!sessionId;
  const isTraditionalFlow = !!userIdentifier && !sessionId;

  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const [emailMasked, setEmailMasked] = useState(email || '');
  const [cooldownUntil, setCooldownUntil] = useState(0); // epoch ms when resend unlocks
  const [resendCooldown, setResendCooldown] = useState(0); // seconds remaining
  const [toastOtp, setToastOtp] = useState(() => {
    return params.get('otp') || sessionStorage.getItem('ciso_last_otp') || '';
  });
  const initialOtpSentRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Countdown — driven by an end-timestamp stored in STATE, not a ref.
  // The interval re-arms itself whenever cooldownUntil changes, so even if React
  // StrictMode remounts this effect (mount → cleanup → mount), the timer keeps
  // counting from where it left off instead of freezing.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setResendCooldown(remaining);
      if (remaining <= 0) setCooldownUntil(0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  function startResendCooldown(seconds = 30) {
    setResendCooldown(seconds);
    setCooldownUntil(Date.now() + seconds * 1000);
  }

  // ---------------------------------------------------------------------------
  // Auto-send OTP on first mount (unless it was already dispatched by the login
  // screen, signalled by ?sent=1)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (initialOtpSentRef.current) return;
    if (!isTraditionalFlow && !is2faFlow) return;

    initialOtpSentRef.current = true;
    let cancelled = false;

    if (is2faFlow && sessionId) {
      const storedEmail = localStorage.getItem('ciso_2fa_email');
      if (storedEmail) setEmailMasked(storedEmail);
    }

    if (alreadySent) {
      // OTP was already dispatched during the Sign In step — just start cooldown.
      startResendCooldown();
      return;
    }

    async function sendInitialOtp() {
      setSendingOtp(true);
      try {
        if (isTraditionalFlow && userIdentifier) {
          const r = await api.post('/auth/otp/send', { email: userIdentifier, username: userIdentifier });
          const masked = r.data?.emailMasked;
          if (masked) setEmailMasked(masked);
          const newOtp = r.data?.otp || r.data?.otpCode;
          if (newOtp) setToastOtp(String(newOtp));
        } else if (is2faFlow && sessionId) {
          // Direct visit without ?sent=1 (e.g. after refresh): re-dispatch through
          // the cooldown-aware resend path.
          const r = await api.post('/auth/2fa/resend-otp', { sessionId });
          const masked = r.data?.emailMasked;
          if (masked) setEmailMasked(masked);
          const newOtp = r.data?.otp || r.data?.otpCode;
          if (newOtp) setToastOtp(String(newOtp));
        }

        if (!cancelled) {
          startResendCooldown();
        }
      } catch (err) {
        if (!cancelled) {
          const retryAfter = err.response?.data?.retryAfterSec;
          if (retryAfter) {
            startResendCooldown(retryAfter);
            setError(err.response?.data?.error || 'Please wait before requesting another code.');
          } else {
            setError(err.response?.data?.error || 'Could not send OTP');
          }
        }
      } finally {
        if (!cancelled) {
          setSendingOtp(false);
        }
      }
    }

    sendInitialOtp();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Resend OTP — 30s server-side cooldown enforced both client + server.
  // ---------------------------------------------------------------------------
  async function handleResend(e) {
    e.preventDefault();
    if (resendCooldown > 0 || sendingOtp) return;
    setError('');
    setResendSuccess('');
    setSendingOtp(true);
    try {
      let masked = null;
      let newOtp = null;
      if (isTraditionalFlow && userIdentifier) {
        const r = await api.post('/auth/otp/send', { email: userIdentifier, username: userIdentifier });
        masked = r.data?.emailMasked;
        newOtp = r.data?.otp || r.data?.otpCode;
      } else if (is2faFlow && sessionId) {
        const r = await api.post('/auth/2fa/resend-otp', { sessionId });
        masked = r.data?.emailMasked;
        newOtp = r.data?.otp || r.data?.otpCode;
      }
      if (masked) setEmailMasked(masked);
      if (newOtp) {
        setToastOtp(String(newOtp));
        try {
          sessionStorage.setItem('ciso_last_otp', String(newOtp));
        } catch {}
      }
      setResendSuccess(`A new code has been sent to ${masked || emailMasked || 'your registered email'}.`);
      startResendCooldown();
    } catch (err) {
      const retryAfter = err.response?.data?.retryAfterSec;
      if (retryAfter) {
        setResendSuccess('');
        startResendCooldown(retryAfter);
        setError(err.response?.data?.error || 'Please wait before requesting another code.');
      } else {
        setError(err.response?.data?.error || 'Could not resend OTP');
      }
    } finally {
      setSendingOtp(false);
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

      if (isTraditionalFlow && userIdentifier) {
        // Traditional flow: verify with email/username + otp
        const r = await api.post('/auth/otp/verify', { email: userIdentifier, username: userIdentifier, otp });
        token = r.data.token;
        user = r.data.user;
      } else if (is2faFlow && sessionId) {
        // 2FA flow: verify with sessionId + otp — backend returns both token + user
        const r = await api.post('/auth/2fa/verify-otp', { sessionId, otp });
        token = r.data.accessToken;
        user = r.data.user;
      } else {
        throw new Error('Invalid flow: missing username or sessionId');
      }

      // Store token and user in this tab's own session
      session.setAuth({ token, user });
      session.setOrgId(null);
      localStorage.removeItem('ciso_2fa_email');
      sessionStorage.removeItem('ciso_last_otp');
      delete api.defaults.headers.common['X-Org-Id'];
      navigate('/select-organisation', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  const progressPct = resendCooldown > 0 ? (resendCooldown / 30) * 100 : 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6 transition-colors duration-200 relative">
      {/* Full-page animated shield loader while sending or verifying OTP */}
      {(loading || sendingOtp) && (
        <PageTransitionLoader
          isLoading={true}
          fullScreen={true}
          title="SecureHub"
          badge="Enterprise"
          statusText={
            sendingOtp
              ? 'Sending verification code to your registered email…'
              : 'Verifying OTP code and authorizing session…'
          }
        />
      )}

      <div className="w-full max-w-md bg-[var(--card-bg)] rounded-2xl p-8 border border-[var(--card-border)] shadow-xl text-center">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
                  step === 1 ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'
                }`}
              >
                {step === 1 ? '✓' : step}
              </div>
              {step === 1 && <div className="w-6 h-0.5 bg-indigo-600" />}
            </div>
          ))}
          <span className="text-[11px] text-[var(--muted)] font-medium">
            Step 2 of {TOTAL_STEPS}
          </span>
        </div>

        {/* Icon */}
        <div className="w-14 h-14 mx-auto rounded-full bg-indigo-600/10 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-[var(--foreground)]">Check your email</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          We sent a 6-digit verification code to{' '}
          <span className="font-semibold text-[var(--foreground)]">{emailMasked || 'your registered email'}</span>.
          Enter it below to continue.
        </p>

        <form onSubmit={submitOtp} className="space-y-4 mt-6">
          {/* OTP input — oversized, centered, monospaced digits */}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-3.5 rounded-xl border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] text-center tracking-[0.55em] text-2xl font-semibold font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 selection:bg-indigo-100"
            placeholder="••••••"
            autoFocus
          />

          {/* Error / success banner */}
          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {resendSuccess && !error && (
            <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
              {resendSuccess}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || sendingOtp}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Verifying…</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Verify &amp; continue
              </>
            )}
          </button>
        </form>

        {/* Resend row — circular countdown progress + unlock at 0 */}
        <div className="mt-6 pt-5 border-t border-[var(--card-border)]">
          <p className="text-xs text-[var(--muted)] mb-3">Didn’t receive the code?</p>
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || loading || sendingOtp}
              className="relative inline-flex items-center justify-center gap-2 px-5 py-2 rounded-full text-xs font-semibold border transition-all disabled:cursor-not-allowed disabled:opacity-70"
              style={
                resendCooldown > 0
                  ? { borderColor: 'var(--card-border)', color: 'var(--muted)' }
                  : { borderColor: '#6366f1', color: '#6366f1' }
              }
            >
              {sendingOtp ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sending…
                </>
              ) : resendCooldown > 0 ? (
                <>
                  {/* Circular progress ring */}
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.2" />
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${(progressPct / 100) * 56.55} 56.55`}
                      transform="rotate(-90 12 12)"
                    />
                  </svg>
                  Resend in {resendCooldown}s
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Resend OTP
                </>
              )}
            </button>
            <Link
              to={is2faFlow ? '/login-2fa' : '/login'}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              ← Back to login
            </Link>
          </div>
        </div>
      </div>

      {/* Top-Right OTP Notification Popup */}
      {toastOtp && (
        <OtpNotificationToast
          otp={toastOtp}
          email={emailMasked || email || ''}
          onClose={() => setToastOtp('')}
          onAutoFill={(code) => setOtp(code)}
        />
      )}
    </div>
  );
}