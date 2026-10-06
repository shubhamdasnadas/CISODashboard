import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { useTheme } from '../context/ThemeContext.jsx';

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [verifying, setVerifying] = useState(true);
  const [valid, setValid] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [verifyError, setVerifyError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function verifyToken() {
      if (!token || !email) {
        setVerifying(false);
        setValid(false);
        setVerifyError('Missing invitation token or email in URL.');
        return;
      }
      try {
        const res = await api.get('/auth/verify-setup-token', {
          params: { token, email },
        });
        if (res.data?.valid) {
          setValid(true);
          setUserInfo(res.data);
        } else {
          setValid(false);
          setVerifyError(res.data?.error || 'Invalid or expired invitation link.');
        }
      } catch (err) {
        setValid(false);
        setVerifyError(
          err.response?.data?.error || 'This password setup link is invalid or has expired.'
        );
      } finally {
        setVerifying(false);
      }
    }

    verifyToken();
  }, [token, email]);

  // Validation rules
  const hasMinLen = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid = hasMinLen && hasUpper && hasLower && hasNumber && passwordsMatch;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!isFormValid) {
      setSubmitError('Please ensure all password requirements are satisfied.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/setup-password', {
        token,
        email,
        password,
      });
      setSuccess(true);
    } catch (err) {
      setSubmitError(
        err.response?.data?.error || 'Failed to set password. Please try again or request a new link.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--foreground)] p-4 sm:p-6 transition-colors duration-200 relative">
      {/* Theme Toggle Button in top-right */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2.5 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--card-border)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer shadow-sm"
        >
          {theme === 'dark' ? (
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>

      <div className="w-full max-w-lg bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 animate-scaleUp">
        {/* Brand Header */}
        <div className="flex items-center gap-3.5 pb-4 border-b border-[var(--card-border)]">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white text-xl shadow-md shadow-purple-600/30 flex-shrink-0">
            🛡️
          </div>
          <div>
            <h1 className="text-xl font-black text-[var(--foreground)] tracking-tight">CISO Dashboard</h1>
            <p className="text-xs text-[var(--muted)]">Enterprise Security Platform • SuperAdmin Setup</p>
          </div>
        </div>

        {/* 1. Loading State */}
        {verifying && (
          <div className="py-12 text-center space-y-3">
            <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-[var(--foreground)]">Verifying invitation link...</p>
            <p className="text-xs text-[var(--muted)]">Please wait while we validate your credentials.</p>
          </div>
        )}

        {/* 2. Invalid / Expired Token State */}
        {!verifying && !valid && (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto text-2xl">
              ⚠️
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[var(--foreground)]">Link Invalid or Expired</h2>
              <p className="text-xs text-[var(--muted)] max-w-sm mx-auto leading-relaxed">
                {verifyError || 'This password setup link is no longer valid. Invitation links expire after 24 hours or after their first use.'}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--muted-bg)] border border-[var(--card-border)] text-xs text-[var(--muted)] text-left space-y-1">
              <span className="font-bold text-[var(--foreground)] block">What should you do?</span>
              <span>Please ask an existing SuperAdmin to navigate to the <strong>SuperAdmin Console → Super Admins tab</strong> and click <strong>"Resend Invite"</strong>.</span>
            </div>
            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30"
              >
                Return to Login Page
              </Link>
            </div>
          </div>
        )}

        {/* 3. Success State */}
        {!verifying && valid && success && (
          <div className="py-6 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto text-3xl animate-bounce">
              ✓
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-black text-emerald-400">Password Created Successfully!</h2>
              <p className="text-xs text-[var(--muted)] max-w-sm mx-auto leading-relaxed">
                Your SuperAdmin account <strong className="text-[var(--foreground)]">{userInfo?.username}</strong> ({userInfo?.email}) is now active. You can now sign in with your email and password.
              </p>
            </div>
            <div className="pt-3">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
              >
                Proceed to Sign In →
              </button>
            </div>
          </div>
        )}

        {/* 4. Active Setup Form */}
        {!verifying && valid && !success && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Information Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 to-indigo-500/5 border border-purple-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                  Account Name
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  SuperAdmin
                </span>
              </div>
              <p className="text-sm font-bold text-[var(--foreground)]">{userInfo?.username}</p>
              <div className="flex items-center gap-1.5 text-xs text-[var(--muted)] font-mono">
                <span>📧 {userInfo?.email}</span>
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold text-[var(--foreground)]">Create Your New Password</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Please configure a strong password to protect your SuperAdmin privileges.
              </p>
            </div>

            {submitError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                ⚠️ {submitError}
              </div>
            )}

            {/* New Password */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-[var(--foreground)] uppercase">
                  New Password *
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs text-indigo-400 hover:underline cursor-pointer"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--foreground)] uppercase">
                Confirm Password *
              </label>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Password Requirements Checklist */}
            <div className="p-3.5 rounded-xl bg-[var(--muted-bg)] border border-[var(--card-border)] space-y-2 text-xs">
              <span className="font-bold text-[var(--foreground)] block text-[11px] uppercase tracking-wider">
                Password Requirements:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div className={`flex items-center gap-1.5 ${hasMinLen ? 'text-emerald-400' : 'text-[var(--muted)]'}`}>
                  <span>{hasMinLen ? '✓' : '•'}</span>
                  <span>At least 8 characters</span>
                </div>
                <div className={`flex items-center gap-1.5 ${hasUpper ? 'text-emerald-400' : 'text-[var(--muted)]'}`}>
                  <span>{hasUpper ? '✓' : '•'}</span>
                  <span>Uppercase letter (A-Z)</span>
                </div>
                <div className={`flex items-center gap-1.5 ${hasLower ? 'text-emerald-400' : 'text-[var(--muted)]'}`}>
                  <span>{hasLower ? '✓' : '•'}</span>
                  <span>Lowercase letter (a-z)</span>
                </div>
                <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-400' : 'text-[var(--muted)]'}`}>
                  <span>{hasNumber ? '✓' : '•'}</span>
                  <span>At least one number (0-9)</span>
                </div>
                <div className={`flex items-center gap-1.5 ${hasSpecial ? 'text-emerald-400' : 'text-[var(--muted)]'}`}>
                  <span>{hasSpecial ? '✓' : '•'}</span>
                  <span>Special character (symbol)</span>
                </div>
                <div className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-400' : 'text-[var(--muted)]'}`}>
                  <span>{passwordsMatch ? '✓' : '•'}</span>
                  <span>Passwords match</span>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || !isFormValid}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm shadow-md shadow-purple-600/30 transition-all cursor-pointer"
              >
                {submitting ? 'Setting Password...' : 'Set Password & Activate SuperAdmin'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
