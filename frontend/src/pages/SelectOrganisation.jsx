import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import * as session from '../utils/session.js';
import { useOrg } from '../context/OrgContext.jsx';
import PageTransitionLoader from '../components/PageTransitionLoader.jsx';

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
      });
      return;
    }

    if (isExp) {
      setAlertModal({
        open: true,
        type: 'expired',
        title: 'Subscription / License Expired',
        badge: 'Organisation Expired',
        orgName: org.org_name,
        message:
          org.block_reason ||
          `Your organisation "${org.org_name}" subscription / license has expired. Please contact your administrator.`,
        note: 'This organisation license has expired. You can continue with any active organisation.',
      });
      return;
    }

    // Org is active -> select it
    setSelectedId(org.id);
  }

  function pickOrg(org) {
    const isSusp = org.is_suspended || org.license_status === 'suspended';
    const isExp = org.is_expired || org.license_status === 'expired';

    if (isSusp || isExp) {
      handleCardClick(org);
      return;
    }

    setIsContinuing(true);
    setCurrentOrg(org);
    navigate('/dashboard', { replace: true });
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
                      isBlocked
                        ? 'bg-rose-500/5 dark:bg-rose-950/20 border-rose-300/60 dark:border-rose-800/60 hover:border-rose-400 opacity-85'
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
                              isBlocked
                                ? 'text-rose-700 dark:text-rose-300'
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
                      {isBlocked ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex-shrink-0 ${
                            isSusp
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/40'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/40'
                          }`}
                        >
                          {isSusp ? 'Suspended' : 'Expired'}
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
                      {isBlocked ? (
                        <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Click for details
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

      {/* Alert Pop-up Modal for Expired / Suspended Organisations */}
      {alertModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[var(--card-bg)] border border-red-500/30 rounded-2xl shadow-2xl p-6 sm:p-8 text-center relative animate-in zoom-in-95 duration-200">
            {/* Alert Shield / Icon */}
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg ${
                alertModal.type === 'suspended'
                  ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-amber-500/10'
                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-500 shadow-rose-500/10'
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
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}
            >
              {alertModal.badge}
            </span>

            {/* Message Box */}
            <div
              className={`border rounded-xl p-4 text-left mb-5 ${
                alertModal.type === 'suspended'
                  ? 'bg-amber-500/5 border-amber-500/20'
                  : 'bg-rose-500/5 border-rose-500/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <svg
                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    alertModal.type === 'suspended' ? 'text-amber-500' : 'text-rose-500'
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
                        : 'text-rose-500 dark:text-rose-400'
                    }`}
                  >
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

            {/* Close Button */}
            <button
              type="button"
              onClick={() =>
                setAlertModal({
                  open: false,
                  type: 'expired',
                  title: '',
                  badge: '',
                  message: '',
                  orgName: '',
                  note: '',
                })
              }
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
