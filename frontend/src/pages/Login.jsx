import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import * as session from '../utils/session.js';
import PageTransitionLoader from '../components/PageTransitionLoader.jsx';
import OtpNotificationToast from '../components/OtpNotificationToast.jsx';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userStatus, setUserStatus] = useState({
    checked: false,
    exists: false,
    organisations: [],
    deactivated: false,
    orgBlocked: false,
    orgStatus: null,
    blockCode: null,
    message: '',
    orgName: '',
  });
  const [passwordStatus, setPasswordStatus] = useState({ checked: false, valid: false });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [receivedOtp, setReceivedOtp] = useState('');
  const [alertModal, setAlertModal] = useState({
    open: false,
    type: 'deactivated', // 'deactivated' | 'suspended' | 'expired'
    title: 'Access Revoked',
    badge: 'Account Deactivated',
    message: '',
    orgName: '',
    note: 'No OTP verification code was sent to your email because this user account is currently deactivated.',
  });
  const debounceRef = useRef(null);
  const pwdDebounceRef = useRef(null);

  useEffect(() => {
    // Check if redirected due to account deactivation or organisation status
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      try {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('deactivated') === 'true') {
          setAlertModal({
            open: true,
            type: 'deactivated',
            title: 'Access Revoked',
            badge: 'Account Deactivated',
            message: 'Your account has been deactivated from this organisation. Access revoked.',
            orgName: '',
            note: 'No OTP verification code was sent to your email because this user account is currently deactivated.',
          });
          session.clearSession();
          return;
        } else if (sp.get('org_suspended') === 'true') {
          setAlertModal({
            open: true,
            type: 'suspended',
            title: 'Organisation Suspended',
            badge: 'Organisation Suspended',
            message: 'Your organisation has been suspended. Please contact your administrator.',
            orgName: '',
            note: 'No OTP verification code was sent to your email because organisation access is suspended.',
          });
          session.clearSession();
          return;
        } else if (sp.get('org_expired') === 'true') {
          setAlertModal({
            open: true,
            type: 'expired',
            title: 'License Expired',
            badge: 'Organisation Expired',
            message: 'Your organisation subscription or license has expired. Please contact your administrator.',
            orgName: '',
            note: 'No OTP verification code was sent to your email because organisation access has expired.',
          });
          session.clearSession();
          return;
        }
      } catch {
        // ignore
      }
    }

    // A fresh visit to /login starts a NEW session for this tab — otherwise
    // the tab would silently resume whatever user last logged in here.
    const token = session.getToken();
    if (token) {
      const user = session.getUser();
      if (user?.role === 'superAdmin') {
        navigate('/superadmin-console', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const trimmed = email.trim();
    setPassword('');
    setPasswordStatus({ checked: false, valid: false });
    if (!trimmed) {
      setUserStatus({
        checked: false,
        exists: false,
        organisations: [],
        deactivated: false,
        orgBlocked: false,
        orgStatus: null,
        blockCode: null,
        message: '',
        orgName: '',
      });
      setShowPassword(false);
      setError('');
      return;
    }

    // Require valid email structure — do not check user availability on username
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setUserStatus({
        checked: false,
        exists: false,
        organisations: [],
        deactivated: false,
        orgBlocked: false,
        orgStatus: null,
        blockCode: null,
        message: '',
        orgName: '',
      });
      setShowPassword(false);
      if (trimmed.length > 2 && !trimmed.includes('@')) {
        setError('Please enter a valid registered email address');
      } else {
        setError('');
      }
      return;
    }

    setError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/auth/check-username', { email: trimmed });
        const orgName = data.orgName || (data.organisations?.[0]?.org_name || '');
        setUserStatus({
          checked: true,
          exists: Boolean(data.exists),
          organisations: data.organisations || [],
          deactivated: Boolean(data.deactivated),
          orgBlocked: Boolean(data.orgBlocked),
          orgStatus: data.orgStatus || null,
          blockCode: data.blockCode || null,
          message: data.message || data.deactivationMessage || data.error || '',
          orgName,
        });
        setShowPassword(Boolean(data.exists));
        setError(data.exists ? '' : 'Account with this email not found');
      } catch (err) {
        console.error('[check-email] failed:', err);
        const body = err.response?.data;
        if (body?.detail) setError(`Server error: ${body.detail}`);
        else if (body?.error) setError(`Server error: ${body.error}`);
        else if (err.response) setError(`Server returned ${err.response.status}: ${err.response.statusText || 'no body'}`);
        else if (err.code === 'ERR_NETWORK') setError('Network error: is the backend running?');
        else setError(`Cannot reach server (${err.code || err.message || 'unknown error'})`);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [email]);

  useEffect(() => {
    if (!password) {
      setPasswordStatus({ checked: false, valid: false });
      return;
    }
    if (!userStatus.exists || !email.trim()) {
      setPasswordStatus({ checked: false, valid: false });
      return;
    }

    if (pwdDebounceRef.current) clearTimeout(pwdDebounceRef.current);
    pwdDebounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/auth/check-password', {
          email: email.trim(),
          password,
        });
        if (data && data.valid) {
          setPasswordStatus({ checked: true, valid: true });
          setError('');
          if (data.deactivated || data.orgBlocked) {
            setUserStatus((prev) => ({
              ...prev,
              deactivated: Boolean(data.deactivated),
              orgBlocked: Boolean(data.orgBlocked),
              orgStatus: data.orgStatus || prev.orgStatus,
              blockCode: data.blockCode || prev.blockCode,
              message: data.message || data.deactivationMessage || prev.message,
              orgName: data.orgName || prev.orgName,
            }));
          }
        } else {
          setPasswordStatus({ checked: true, valid: false });
        }
      } catch (err) {
        setPasswordStatus({ checked: false, valid: false });
      }
    }, 300);
    return () => clearTimeout(pwdDebounceRef.current);
  }, [password, email, userStatus.exists]);

  function triggerAlertModal({ code, orgStatus, message, orgName }) {
    const name = orgName || userStatus.orgName || userStatus.organisations?.[0]?.org_name || '';
    const isSuspended =
      code === 'ORGANISATION_SUSPENDED' ||
      code === 'ORG_SUSPENDED' ||
      orgStatus === 'suspended';

    const isExpired =
      code === 'ORGANISATION_EXPIRED' ||
      code === 'ORG_EXPIRED' ||
      code === 'TOKEN_EXPIRED' ||
      orgStatus === 'expired';

    if (isSuspended) {
      setAlertModal({
        open: true,
        type: 'suspended',
        title: 'Organisation Suspended',
        badge: 'Organisation Suspended',
        message: message || (name
          ? `Your organisation "${name}" has been suspended. Please contact your administrator.`
          : 'Your organisation has been suspended. Please contact your administrator.'),
        orgName: name,
        note: 'No OTP verification code was sent to your email because organisation access is suspended.',
      });
    } else if (isExpired) {
      setAlertModal({
        open: true,
        type: 'expired',
        title: 'Subscription / License Expired',
        badge: 'Organisation Expired',
        message: message || (name
          ? `Your organisation "${name}" subscription / license has expired. Please contact your administrator.`
          : 'Your organisation subscription / license has expired. Please contact your administrator.'),
        orgName: name,
        note: 'No OTP verification code was sent to your email because organisation access has expired.',
      });
    } else {
      setAlertModal({
        open: true,
        type: 'deactivated',
        title: 'Access Revoked',
        badge: 'Account Deactivated',
        message: message || (name
          ? `You are deactivated from ${name}. Please contact your administrator.`
          : 'You are deactivated from this organisation. Please contact your administrator.'),
        orgName: name,
        note: 'No OTP verification code was sent to your email because this user account is currently deactivated.',
      });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Pre-flight check: If user or their organization is already identified as blocked/suspended/expired,
    // open the pop-up modal immediately without hitting the OTP endpoints.
    if (userStatus.deactivated || userStatus.orgBlocked) {
      triggerAlertModal({
        code: userStatus.blockCode,
        orgStatus: userStatus.orgStatus,
        message: userStatus.message,
        orgName: userStatus.orgName,
      });
      return;
    }

    setLoading(true);
    try {
      const trimmedEmail = email.trim();
      const { data } = await api.post('/auth/login', { email: trimmedEmail, password });
      if (data.otpRequested) {
        // Password valid & account active — dispatch OTP code to registered email
        const targetEmail = data.email || trimmedEmail;
        const otpRes = await api.post('/auth/otp/send', { email: targetEmail, username: data.username });
        const otpCode = otpRes.data?.otp || otpRes.data?.otpCode;
        if (otpCode) {
          setReceivedOtp(String(otpCode));
          try {
            sessionStorage.setItem('ciso_last_otp', String(otpCode));
            sessionStorage.setItem('ciso_last_otp_email', targetEmail);
          } catch {}
        }
        // OTP code dispatched successfully to mail -> transition to verification screen
        const otpParam = otpCode ? '&otp=' + encodeURIComponent(otpCode) : '';
        navigate('/verify-otp?email=' + encodeURIComponent(targetEmail) + (data.username ? '&username=' + encodeURIComponent(data.username) : '') + '&sent=1' + otpParam);
      } else {
        // Direct logged in
        session.setAuth({ token: data.token, user: data.user });
        if (data.user?.role === 'superAdmin') {
          session.setOrgId(null);
          delete api.defaults.headers.common['X-Org-Id'];
          navigate('/superadmin-console', { replace: true });
        } else {
          // Non-superadmin: redirect to organisation selection screen to choose active organisation
          navigate('/select-organisation', { replace: true });
        }
      }
    } catch (err) {
      console.error('[login/otp] failed:', err);
      const errData = err.response?.data;
      const code = errData?.code || errData?.error;
      const isDeactivated =
        code === 'ACCOUNT_DEACTIVATED' ||
        String(errData?.message || errData?.error || '').toLowerCase().includes('deactivated');

      const isSuspended =
        code === 'ORGANISATION_SUSPENDED' ||
        code === 'ORG_SUSPENDED' ||
        errData?.orgStatus === 'suspended' ||
        String(errData?.message || '').toLowerCase().includes('suspended');

      const isExpired =
        code === 'ORGANISATION_EXPIRED' ||
        code === 'ORG_EXPIRED' ||
        code === 'TOKEN_EXPIRED' ||
        errData?.orgStatus === 'expired' ||
        String(errData?.message || '').toLowerCase().includes('expired');

      if (isDeactivated || isSuspended || isExpired || err.response?.status === 403) {
        triggerAlertModal({
          code: isSuspended ? 'ORGANISATION_SUSPENDED' : (isExpired ? 'ORGANISATION_EXPIRED' : 'ACCOUNT_DEACTIVATED'),
          orgStatus: errData?.orgStatus || (isSuspended ? 'suspended' : (isExpired ? 'expired' : 'inactive')),
          message: errData?.message,
          orgName: errData?.orgName || userStatus.orgName,
        });
        setError('');
      } else {
        setError(err.response?.data?.error || err.response?.data?.detail || 'Login failed');
      }
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
            'Checking organisation license status…',
            'Generating secure verification code…',
            'Sending OTP code to your registered email…',
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
          {/* Email Address */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
              autoFocus
            />
          </div>

          {/* Orgs preview */}
          {userStatus.exists && userStatus.organisations?.length > 0 && (
            <div className="bg-[var(--muted-bg)] rounded-xl p-4">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Connected organisations</p>
              <div className="flex flex-wrap gap-2">
                {userStatus.organisations.map((o) => {
                  const isSusp = o.is_suspended || o.license_status === 'suspended';
                  const isExp = o.is_expired || o.license_status === 'expired';
                  return (
                    <span
                      key={o.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                        isSusp
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                          : isExp
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                          : 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isSusp ? 'bg-amber-500' : isExp ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                      <span>{o.org_name}</span>
                      {isSusp && <span className="text-[10px] font-semibold uppercase tracking-wider opacity-85">(Suspended)</span>}
                      {isExp && <span className="text-[10px] font-semibold uppercase tracking-wider opacity-85">(Expired)</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Password */}
          {showPassword && (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Password</label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    setPasswordStatus({ checked: false, valid: false });
                  }}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                />
                {passwordStatus.checked && passwordStatus.valid && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
              </div>
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
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
          Sign in with your registered email address to receive a secure OTP code.
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

      {/* Alert Pop-up Modal (Deactivated / Suspended / Expired) */}
      {alertModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[var(--card-bg)] border border-red-500/30 rounded-2xl shadow-2xl p-6 sm:p-8 text-center relative animate-in zoom-in-95 duration-200">
            {/* Alert Shield / Icon */}
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg ${
                alertModal.type === 'suspended'
                  ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-amber-500/10'
                  : alertModal.type === 'expired'
                  ? 'bg-orange-500/10 border border-orange-500/20 text-orange-500 shadow-orange-500/10'
                  : 'bg-red-500/10 border border-red-500/20 text-red-500 shadow-red-500/10'
              }`}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h2 className="text-xl font-bold text-[var(--foreground)] mb-1">
              {alertModal.title}
            </h2>
            <span
              className={`inline-block px-3 py-0.5 rounded-full text-xs font-semibold mb-4 border ${
                alertModal.type === 'suspended'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : alertModal.type === 'expired'
                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
            >
              {alertModal.badge}
            </span>

            {/* Message Box */}
            <div
              className={`border rounded-xl p-4 text-left mb-6 ${
                alertModal.type === 'suspended'
                  ? 'bg-amber-500/5 border-amber-500/20'
                  : alertModal.type === 'expired'
                  ? 'bg-orange-500/5 border-orange-500/20'
                  : 'bg-red-500/5 border-red-500/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <svg
                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    alertModal.type === 'suspended'
                      ? 'text-amber-500'
                      : alertModal.type === 'expired'
                      ? 'text-orange-500'
                      : 'text-red-500'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm">
                  <p
                    className={`font-semibold mb-1 ${
                      alertModal.type === 'suspended'
                        ? 'text-amber-500 dark:text-amber-400'
                        : alertModal.type === 'expired'
                        ? 'text-orange-500 dark:text-orange-400'
                        : 'text-red-500 dark:text-red-400'
                    }`}
                  >
                    {alertModal.orgName ? `Organisation: ${alertModal.orgName}` : 'Organisation Access'}
                  </p>
                  <p className="text-[var(--foreground)] text-xs leading-relaxed">
                    {alertModal.message || 'Organisation access is currently restricted. Please contact your administrator.'}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-[var(--muted)] mb-6 leading-relaxed">
              {alertModal.note || 'No OTP verification code was sent to your email.'}
            </p>

            {/* Action Button */}
            <button
              type="button"
              onClick={() => {
                setAlertModal({
                  open: false,
                  type: 'deactivated',
                  title: 'Access Revoked',
                  badge: 'Account Deactivated',
                  message: '',
                  orgName: '',
                  note: '',
                });
                setPassword('');
                setPasswordStatus({ checked: false, valid: false });
              }}
              className={`w-full py-2.5 rounded-xl text-white font-semibold transition-all duration-200 cursor-pointer shadow-md ${
                alertModal.type === 'suspended'
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                  : alertModal.type === 'expired'
                  ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-600/20'
                  : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
              }`}
            >
              Understood & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
