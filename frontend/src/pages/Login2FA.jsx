import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

export default function Login2FA() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username || !email || !password) {
      setError('Please enter username, email and password.');
      return;
    }
    setLoading(true);
    try {
      // Step 1: verify username + email + password against the database.
      const { data } = await api.post('/auth/2fa/login', { username, email, password });
      if (!data.sessionId) {
        setError('Login failed — no session returned.');
        return;
      }
      localStorage.setItem('ciso_2fa_email', data.emailMasked || '');
      navigate(`/verify-otp?sessionId=${encodeURIComponent(data.sessionId)}`);
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6 transition-colors duration-200">
      <div className="w-full max-w-md bg-[var(--card-bg)] rounded-2xl p-8 border border-[var(--card-border)] shadow-xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">SecureHub</h1>
            <p className="text-[var(--muted)] text-sm">Sign in with QR &amp; email verification</p>
          </div>
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
            className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Verifying…' : 'Continue'}
          </button>
        </form>

        <p className="text-xs text-[var(--muted)] mt-6 text-center">
          Prefer the classic login?{' '}
          <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">Sign in here</Link>
        </p>
      </div>
    </div>
  );
}
