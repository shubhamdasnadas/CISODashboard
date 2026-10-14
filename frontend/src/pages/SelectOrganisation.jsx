import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import * as session from '../utils/session.js';
import { useOrg } from '../context/OrgContext.jsx';
import PageTransitionLoader from '../components/PageTransitionLoader.jsx';

/**
 * Client-side helper to decode and inspect custom binary key format:
 * ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)
 * or cryptographically signed JWT offline license.
 */
function decodeClientKey(keyStr) {
  if (!keyStr || typeof keyStr !== 'string') return null;
  const clean = keyStr.trim();

  // 1. Try custom binary packed key (prefixed by ciso_lic_ or raw 66-hex)
  let hex = clean;
  if (hex.startsWith('ciso_lic_')) {
    hex = hex.slice(9);
  }

  if (/^[0-9a-fA-F]{66}$/.test(hex)) {
    try {
      const ver = parseInt(hex.slice(0, 2), 16);
      const orgHex = hex.slice(2, 34);
      const last16 = orgHex.slice(16);
      let orgId = parseInt(last16, 16);
      if (isNaN(orgId) || orgId === 0) {
        orgId = orgHex;
      }

      const startDays = parseInt(hex.slice(34, 42), 16);
      const endDays = parseInt(hex.slice(42, 50), 16);
      const startDate = new Date(startDays * 86400000).toISOString().slice(0, 10);
      const endDate = new Date(endDays * 86400000).toISOString().slice(0, 10);
      const licHex = hex.slice(50, 66).toUpperCase();
      const licenseId = `LIC-${licHex}`;

      const todayStr = new Date().toISOString().slice(0, 10);
      const isSameDate = startDate === endDate;
      const isExpired = endDate < todayStr || isSameDate;
      const daysDiff = Math.round((new Date(endDate) - new Date(todayStr)) / 86400000);

      return {
        format: 'Custom Binary Key (33-byte packed)',
        version: ver,
        orgId,
        startDate,
        endDate,
        licenseId,
        licenseIdHex: licHex,
        isExpired,
        daysRemaining: Math.max(0, daysDiff),
        formatString: `ver(${ver}) | org_id(16) | start(${startDays}d) | end(${endDays}d) | license_id(${licHex})`,
      };
    } catch {
      return null;
    }
  }

  // 2. Try signed JWT offline license
  if (clean.startsWith('ey') && clean.split('.').length === 3) {
    try {
      const payloadPart = clean.split('.')[1];
      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = atob(normalized);
      const payload = JSON.parse(jsonStr);
      const todayStr = new Date().toISOString().slice(0, 10);
      const startDate = payload.start_date ? new Date(payload.start_date).toISOString().slice(0, 10) : todayStr;
      const endDate = payload.end_date ? new Date(payload.end_date).toISOString().slice(0, 10) : null;
      const isSameDate = Boolean(startDate && endDate && startDate === endDate);
      const isExpired = (endDate ? endDate < todayStr : false) || isSameDate;
      const daysDiff = endDate ? Math.round((new Date(endDate) - new Date(todayStr)) / 86400000) : 0;

      return {
        format: 'Cryptographically Signed Offline License',
        orgId: payload.org_id,
        orgName: payload.org_name,
        slug: payload.slug,
        startDate,
        endDate,
        licenseId: payload.license_id,
        isExpired,
        daysRemaining: Math.max(0, daysDiff),
        parsedKey: payload.parsed_key || null,
      };
    } catch {
      return null;
    }
  }

  return null;
}

export default function SelectOrganisation() {
  const navigate = useNavigate();
  const { organisations, currentOrg, loading: ctxLoading, setCurrentOrg, refresh } = useOrg();
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const [alertModal, setAlertModal] = useState({
    open: false,
    type: 'expired', // 'expired' | 'suspended'
    title: '',
    badge: '',
    message: '',
    orgName: '',
    note: '',
    org: null,
  });

  const [activationModal, setActivationModal] = useState({
    open: false,
    org: null,
  });

  // Load the user's organisations. refresh() is the OrgContext's own fetch and
  // is idempotent; on a fresh machine it populates `organisations` reliably.
  const load = async () => {
    setError('');
    try {
      await refresh();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load your organisations. Please try again.');
    }
  };

  useEffect(() => {
    if (!session.getToken()) {
      navigate('/login', { replace: true });
      return;
    }
    const user = session.getUser();
    if (user?.role === 'superAdmin') {
      navigate('/superadmin-console', { replace: true });
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-select: the previously chosen org (if active) else the first active one.
  useEffect(() => {
    if (organisations.length === 0) return;
    if (selectedId) return; // user already picked something

    const activeOrgs = organisations.filter(
      (o) => !o.is_expired && !o.is_suspended && o.license_status !== 'expired' && o.license_status !== 'suspended'
    );
    const preselect = activeOrgs.find((o) => currentOrg && o.id === currentOrg.id) || activeOrgs[0];
    setSelectedId(preselect ? preselect.id : null);
  }, [organisations, currentOrg, selectedId]);

  function handleCardClick(org) {
    const isSusp = org.is_suspended || org.license_status === 'suspended';
    const isExp = org.is_expired || org.license_status === 'expired';

    // When clicking on an expired organisation, open the License Key Activation popup modal!
    if (isExp) {
      setActivationModal({
        open: true,
        org,
      });
      return;
    }

    if (isSusp) {
      setAlertModal({
        open: true,
        type: 'suspended',
        title: 'Organisation Suspended',
        badge: 'Organisation Suspended',
        orgName: org.org_name,
        message:
          org.block_reason ||
          `Your organisation "${org.org_name}" has been suspended. Please contact your administrator.`,
        note: 'This organisation is currently suspended. You can continue with any active organisation.',
        org,
      });
      return;
    }

    // Org is active -> select it
    setSelectedId(org.id);
  }

  function pickOrg(org) {
    const isSusp = org.is_suspended || org.license_status === 'suspended';
    const isExp = org.is_expired || org.license_status === 'expired';

    if (isExp) {
      setActivationModal({
        open: true,
        org,
      });
      return;
    }

    if (isSusp) {
      handleCardClick(org);
      return;
    }

    setIsContinuing(true);
    setCurrentOrg(org);
    navigate('/dashboard', { replace: true });
  }

  async function handleActivationSuccess(updatedOrg) {
    setIsContinuing(true);
    setActivationModal({ open: false, org: null });
    try {
      await refresh();
      setCurrentOrg(updatedOrg);
      navigate('/dashboard', { replace: true });
    } catch (e) {
      console.warn('Navigation after activation warning:', e);
      setCurrentOrg(updatedOrg);
      navigate('/dashboard', { replace: true });
    }
  }

  async function logout() {
    try {
      const logId = session.getLogId();
      const user = session.getUser();
      await api.post('/auth/logout', { logId, username: user?.username });
    } catch (err) {
      console.warn('Error recording logout:', err);
    }
    session.clearSession();
    setCurrentOrg(null);
    navigate('/login', { replace: true });
  }

  if (ctxLoading || isContinuing) {
    return (
      <PageTransitionLoader
        isLoading={true}
        fullScreen={true}
        title="SecureHub"
        badge="Enterprise"
        statusText="Initializing Workspace Telemetry & Dashboard Data…"
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6 transition-colors duration-200 relative">
      <div className="w-full max-w-2xl bg-[var(--card-bg)] rounded-2xl p-8 border border-[var(--card-border)] shadow-xl">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Select Organisation</h1>
            <p className="text-[var(--muted)] text-sm">Choose which organisation you want to work with</p>
          </div>
        </div>

        {error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl p-4 text-sm space-y-3">
            <p>{error}</p>
            <button
              onClick={load}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {organisations.map((o) => {
                const isSusp = o.is_suspended || o.license_status === 'suspended';
                const isExp = o.is_expired || o.license_status === 'expired';
                const isBlocked = isSusp || isExp;
                const isSelected = selectedId === o.id && !isBlocked;

                return (
                  <div
                    key={o.id}
                    onClick={() => handleCardClick(o)}
                    onDoubleClick={() => !isBlocked && pickOrg(o)}
                    className={`text-left p-5 rounded-2xl border transition-all cursor-pointer relative ${
                      isExp
                        ? 'bg-rose-500/5 dark:bg-rose-950/20 border-rose-400/60 dark:border-rose-800/80 hover:border-rose-500 hover:shadow-lg hover:shadow-rose-500/10'
                        : isSusp
                        ? 'bg-amber-500/5 dark:bg-amber-950/20 border-amber-300/60 dark:border-amber-800/60 hover:border-amber-400 opacity-90'
                        : isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 dark:border-indigo-500 shadow-md ring-2 ring-indigo-500/20'
                        : 'bg-[var(--muted-bg)] border-[var(--card-border)] hover:border-indigo-300 dark:hover:border-indigo-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${
                            isSusp ? 'bg-amber-600' : isExp ? 'bg-rose-600' : 'bg-indigo-600'
                          }`}
                        >
                          {o.org_name?.[0]?.toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <span
                            className={`font-semibold text-sm truncate block ${
                              isExp
                                ? 'text-rose-700 dark:text-rose-300'
                                : isSusp
                                ? 'text-amber-700 dark:text-amber-300'
                                : isSelected
                                ? 'text-indigo-700 dark:text-indigo-300'
                                : 'text-[var(--foreground)]'
                            }`}
                          >
                            {o.org_name}
                          </span>
                          {o.slug && <span className="text-[11px] text-[var(--muted)] font-mono">@{o.slug}</span>}
                        </div>
                      </div>

                      {/* Status indicator / Radio */}
                      {isExp ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex-shrink-0 bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/40 animate-pulse">
                          Expired · Activate
                        </span>
                      ) : isSusp ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex-shrink-0 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/40">
                          Suspended
                        </span>
                      ) : (
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-600'
                              : 'border-[var(--input-border)] bg-transparent'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Metadata & Status Footer */}
                    <div className="mt-3 pt-2.5 border-t border-[var(--card-border)] flex items-center justify-between text-xs">
                      <span className="text-[var(--muted)] truncate max-w-[12rem]">{o.address || 'Enterprise Workspace'}</span>
                      {isExp ? (
                        <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 hover:underline">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                          Click to enter key
                        </span>
                      ) : isSusp ? (
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Details
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => {
                const chosen = organisations.find((o) => o.id === selectedId);
                if (chosen) pickOrg(chosen);
              }}
              disabled={!selectedId}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              Continue →
            </button>
          </>
        )}

        <button
          onClick={logout}
          className="w-full mt-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>

      {/* Alert Pop-up Modal for Suspended Organisations */}
      {alertModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[var(--card-bg)] border border-amber-500/30 rounded-2xl shadow-2xl p-6 sm:p-8 text-center relative animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-amber-500/10">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h2 className="text-xl font-bold text-[var(--foreground)] mb-1">
              {alertModal.title}
            </h2>
            <span className="inline-block px-3 py-0.5 rounded-full text-xs font-semibold mb-4 border bg-amber-500/10 text-amber-400 border-amber-500/20">
              {alertModal.badge}
            </span>

            <div className="border rounded-xl p-4 text-left mb-5 bg-amber-500/5 border-amber-500/20">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm">
                  <p className="font-semibold mb-1 text-amber-500 dark:text-amber-400">
                    Organisation: {alertModal.orgName}
                  </p>
                  <p className="text-[var(--foreground)] text-xs leading-relaxed">
                    {alertModal.message}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-[var(--muted)] mb-6 leading-relaxed">
              {alertModal.note}
            </p>

            <button
              type="button"
              onClick={() =>
                setAlertModal({
                  open: false,
                  type: 'suspended',
                  title: '',
                  badge: '',
                  message: '',
                  orgName: '',
                  note: '',
                  org: null,
                })
              }
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Pop-up Modal for Expired Organisation Key Activation */}
      {activationModal.open && activationModal.org && (
        <ActivateLicenseModal
          org={activationModal.org}
          onClose={() => setActivationModal({ open: false, org: null })}
          onSuccess={handleActivationSuccess}
        />
      )}
    </div>
  );
}

/**
 * ActivateLicenseModal Component:
 * Opens when clicking on an expired organisation.
 * Allows pasting the generated binary key or signed license,
 * validates key fields (ver, org_id, start_date, end_date, license_id),
 * updates database validity, and grants access to the workspace.
 */
function ActivateLicenseModal({ org, onClose, onSuccess }) {
  const [keyInput, setKeyInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [activating, setActivating] = useState(false);
  const [verifyData, setVerifyData] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Quick client-side unpack helper
  const clientInfo = decodeClientKey(keyInput);

  // Auto-verify with backend whenever a valid client key is typed or pasted
  useEffect(() => {
    setError('');
    const clean = keyInput.trim();
    if (!clean) {
      setVerifyData(null);
      return;
    }

    if (clientInfo) {
      handleVerify(clean);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyInput]);

  const handleVerify = async (keyToVerify) => {
    const key = (keyToVerify || keyInput).trim();
    if (!key) {
      setError('Please enter or paste a license key');
      return;
    }
    setVerifying(true);
    setError('');
    try {
      const res = await api.post(`/organisations/${org.id}/verify-key`, { licenseKey: key });
      setVerifyData(res.data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Key verification failed';
      setError(msg);
      setVerifyData(null);
    } finally {
      setVerifying(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setKeyInput(text.trim());
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  };

  const handleActivate = async () => {
    const key = keyInput.trim();
    if (!key) {
      setError('Please paste a valid license key');
      return;
    }
    setActivating(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post(`/organisations/${org.id}/activate-key`, { licenseKey: key });
      setSuccessMsg(res.data.message || `License activated! Validity extended until ${res.data.newEndDate}`);
      setTimeout(() => {
        onSuccess(res.data.organisation || {
          ...org,
          end_date: res.data.newEndDate,
          is_expired: false,
          is_active: true,
          status: 'active',
          license_status: 'active',
        });
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to activate license key');
      setActivating(false);
    }
  };

  const activeInfo = verifyData || clientInfo;
  const isKeyOrgMatch = activeInfo ? (activeInfo.matchesOrg ?? (Number(activeInfo.orgId) === org.id || String(activeInfo.orgId).toLowerCase() === String(org.slug).toLowerCase())) : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[var(--card-bg)] border border-indigo-500/30 rounded-2xl shadow-2xl p-6 sm:p-7 relative animate-in zoom-in-95 duration-200 overflow-hidden text-left">
        {/* Glow ambient background effect */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 flex-shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--foreground)]">
                Activate Organisation License
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Paste your generated license key to verify and extend access
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Organisation Context Card */}
        <div className="p-3.5 rounded-xl bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/20 flex items-center justify-between mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {org.org_name?.[0]?.toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[var(--foreground)] truncate">
                  {org.org_name}
                </span>
                <span className="text-[11px] font-mono text-[var(--muted)]">
                  #{org.id}
                </span>
              </div>
              {org.slug && (
                <span className="text-[11px] font-mono text-[var(--muted)] block">
                  @{org.slug}
                </span>
              )}
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-400/40">
              Expired
            </span>
            <div className="text-[10px] text-[var(--muted)] mt-1">
              Expiry: {org.effective_end_date ? String(org.effective_end_date).slice(0, 10) : (org.end_date ? String(org.end_date).slice(0, 10) : 'Expired')}
            </div>
          </div>
        </div>

        {/* License Key Input Area */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
              <span>Paste Generated License Key</span>
              <span className="text-[10px] text-indigo-500 font-mono">(Custom Binary / Signed)</span>
            </label>
            <div className="flex items-center gap-2">
              {keyInput && (
                <button
                  type="button"
                  onClick={() => {
                    setKeyInput('');
                    setVerifyData(null);
                    setError('');
                  }}
                  className="text-[11px] text-[var(--muted)] hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Paste from Clipboard
              </button>
            </div>
          </div>

          <textarea
            rows={3}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="ciso_lic_010000000000000000000000000000000f0000510400005271a1b2c3d4e5f60718"
            className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono bg-[var(--muted-bg)] border border-[var(--input-border)] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 text-[var(--foreground)] placeholder:text-[var(--muted)]/50 resize-none transition-all outline-none"
          />

          <div className="flex items-center justify-between mt-1 text-[10px] text-[var(--muted)]">
            <span>Format: ver(1) | org_id(16) | start(uint32, days) | end(uint32, days) | license_id(8)</span>
            {verifying && (
              <span className="text-indigo-500 font-semibold animate-pulse">
                Verifying key...
              </span>
            )}
          </div>
        </div>

        {/* Live Decoded Key Breakdown Card */}
        {activeInfo && (
          <div className="mb-4 p-4 rounded-xl bg-slate-900/60 dark:bg-black/40 border border-indigo-500/30 text-xs text-left animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-indigo-500/20">
              <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Key Verified & Decoded
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {activeInfo.format || 'Binary Key'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
              <div>
                <span className="text-[10px] text-[var(--muted)] block">License ID</span>
                <span className="font-mono font-bold text-amber-400 text-xs">
                  {activeInfo.licenseId || 'LIC-KEY'}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-[var(--muted)] block">Target Org</span>
                <span className={`font-mono font-bold text-xs flex items-center gap-1 ${isKeyOrgMatch ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isKeyOrgMatch ? '✔ Org #' + activeInfo.orgId : '✖ Mismatch'}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-[var(--muted)] block">Start Date</span>
                <span className="font-mono font-semibold text-[var(--foreground)] text-xs">
                  {activeInfo.startDate || 'Current'}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-emerald-400 font-semibold block">Extended End Date</span>
                <span className="font-mono font-bold text-emerald-400 text-xs">
                  {activeInfo.endDate}
                </span>
              </div>
            </div>

            {activeInfo.formatString && (
              <div className="mt-2 pt-2 border-t border-slate-700/50 text-[10px] font-mono text-[var(--muted)] truncate">
                {activeInfo.formatString}
              </div>
            )}

            {activeInfo.daysRemaining !== undefined && (
              <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                <span>Access Extension Duration:</span>
                <span>+{activeInfo.daysRemaining} Days</span>
              </div>
            )}
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-start gap-2 animate-in fade-in">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-semibold">Activation Error</p>
              <p className="mt-0.5 text-[11px] leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
            <svg className="w-4 h-4 flex-shrink-0 text-emerald-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
            </svg>
            <div className="font-semibold">
              {successMsg} — Loading workspace...
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={activating}
            className="px-4 py-2.5 rounded-xl border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-xs font-semibold text-[var(--foreground)] transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {!activeInfo && (
            <button
              type="button"
              onClick={() => handleVerify()}
              disabled={!keyInput.trim() || verifying || activating}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {verifying ? 'Verifying...' : 'Verify Key'}
            </button>
          )}

          <button
            type="button"
            onClick={handleActivate}
            disabled={!keyInput.trim() || activating || (activeInfo && !isKeyOrgMatch)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-indigo-600 to-indigo-700 hover:from-emerald-500 hover:to-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
          >
            {activating ? (
              <>
                <svg className="w-4 h-4 animate-spin text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
                <span>Activating & Extending Access...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Activate & Enter Workspace →</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
