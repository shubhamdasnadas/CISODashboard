import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../context/OrgContext.jsx';

export default function SelectOrganisation() {
  const navigate = useNavigate();
  const { organisations, currentOrg, loading: ctxLoading, setCurrentOrg, refresh } = useOrg();
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem('ciso_token')) {
      navigate('/login', { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try { await refresh(); }
      catch { if (!cancelled) setError('Failed to load your organisations. Please try again.'); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-select: the previously chosen org (if still linked) else the first one.
  // We NEVER auto-redirect — the picker is always shown so the user can choose
  // which connected organisation to work with, then press Continue.
  useEffect(() => {
    if (ctxLoading || organisations.length === 0) return;
    if (selectedId) return; // user already picked something
    const preselect = organisations.find((o) => currentOrg && o.id === currentOrg.id) || organisations[0];
    setSelectedId(preselect ? preselect.id : null);
  }, [ctxLoading, organisations, currentOrg, selectedId]);

  useEffect(() => {
    if (ctxLoading) return;
    if (organisations.length === 0) {
      // SuperAdmin with no orgs should go create one
      try {
        const user = JSON.parse(localStorage.getItem('ciso_user') || '{}');
        if (user.role === 'superAdmin') {
          navigate('/admin/organizations', { replace: true });
          return;
        }
      } catch {}
      setError('No organisations are linked to your account. Please contact your administrator.');
    }
  }, [ctxLoading, organisations, navigate]);

  function pickOrg(org) {
    setCurrentOrg(org);
    navigate('/dashboard', { replace: true });
  }

  function logout() {
    localStorage.removeItem('ciso_token');
    localStorage.removeItem('ciso_user');
    localStorage.removeItem('ciso_current_org_id');
    setCurrentOrg(null);
    navigate('/login', { replace: true });
  }

  if (ctxLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--muted)]">
        <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full mr-3" />
        Loading organisations…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6 transition-colors duration-200">
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
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl p-4 text-sm">
            {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {organisations.map(o => {
                const isSelected = selectedId === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    className={`text-left p-5 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-600 shadow-sm'
                        : 'bg-[var(--muted-bg)] border-[var(--card-border)] hover:border-indigo-300 dark:hover:border-indigo-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {o.org_name?.[0]?.toUpperCase()}
                        </span>
                        <span className={`font-semibold ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-[var(--foreground)]'}`}>
                          {o.org_name}
                        </span>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-[var(--input-border)]'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    {o.address && <p className="text-xs text-[var(--muted)] mt-1">{o.address}</p>}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => { const chosen = organisations.find(o => o.id === selectedId); if (chosen) pickOrg(chosen); }}
              disabled={!selectedId}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
            >
              Continue →
            </button>
          </>
        )}

        <button onClick={logout} className="w-full mt-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] flex items-center justify-center gap-2 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );
}
