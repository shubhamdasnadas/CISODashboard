import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import * as session from '../utils/session.js';
import PageTransitionLoader from '../components/PageTransitionLoader.jsx';
import OtpNotificationToast from '../components/OtpNotificationToast.jsx';
import drishtiLightImg from '../../image/Drishti360DarkMode.png';
import drishtiDarkImg from '../../image/Drishti360Lightmode.png';

export default function Login2FA() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [receivedOtp, setReceivedOtp] = useState('');

  useEffect(() => {
    const token = session.getToken();
    if (token) {
      const user = session.getUser();
      if (user?.role === 'superAdmin') {
        navigate('/superadmin-console', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username || !email || !password) {
      setError('Please enter username, email and password.');
      return;
    }
    setLoading(true);
    try {
      // Step 1: verify username + email + password against the database and send OTP to mail
      const { data } = await api.post('/auth/2fa/login', { username, email, password });
      if (!data.sessionId) {
        setError('Login failed — no session returned.');
        return;
      }
      localStorage.setItem('ciso_2fa_email', data.emailMasked || '');
      const receivedOtp = data.otp || data.otpCode;
      if (receivedOtp) {
        setReceivedOtp(String(receivedOtp));
        try {
          sessionStorage.setItem('ciso_last_otp', String(receivedOtp));
        } catch {}
      }
      const otpParam = receivedOtp ? `&otp=${encodeURIComponent(receivedOtp)}` : '';
      navigate(`/verify-otp?sessionId=${encodeURIComponent(data.sessionId)}&sent=1${otpParam}`);
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) setError(err.response?.data?.error || 'Invalid credentials.');
      else if (status === 400) setError(err.response?.data?.error || 'Invalid request.');
      else setError('Unable to reach the server. Please try again.');
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
          title="Drishti360"
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
        <div className="flex flex-col items-center justify-center gap-2 mb-8">
          <img
            src={drishtiLightImg}
            alt="Drishti360"
            className="h-10 w-auto max-w-[200px] object-contain dark:hidden"
          />
          <img
            src={drishtiDarkImg}
            alt="Drishti360"
            className="h-10 w-auto max-w-[200px] object-contain hidden dark:block"
          />
          <p className="text-[var(--muted)] text-xs font-medium">Sign in with QR &amp; email verification</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-1">Username</label>
            <input
              type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus
              className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="e.g. Shubham"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-1">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="registered email (e.g. sithdalvi123@gmail.com)"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-1">Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">{error}</div>}

          <button
            type="submit" disabled={loading}
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
              'Continue'
            )}
          </button>
        </form>

        <p className="text-xs text-[var(--muted)] mt-6 text-center">
          Prefer the classic login?{' '}
          <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">Sign in here</Link>
        </p>
      </div>

      {/* Top-Right OTP Notification Popup */}
      {receivedOtp && (
        <OtpNotificationToast
          otp={receivedOtp}
          email={email}
          onClose={() => setReceivedOtp('')}
        />
      )}
    </div>
  );
}
