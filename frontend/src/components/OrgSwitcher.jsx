import { useState, useRef, useEffect } from 'react';
import { useOrg } from '../context/OrgContext.jsx';

export default function OrgSwitcher() {
  const { organisations, currentOrg, setCurrentOrg, switchOrg } = useOrg();
  const [open, setOpen] = useState(false);
  const [alertModal, setAlertModal] = useState({
    open: false,
    type: 'expired',
    title: '',
    badge: '',
    message: '',
    orgName: '',
  });
  const ref = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  if (!currentOrg) return null;

  function pick(org) {
    const isSusp = org.is_suspended || org.license_status === 'suspended';
    const isExp = org.is_expired || org.license_status === 'expired';

    if (isSusp) {
      setOpen(false);
      setAlertModal({
        open: true,
        type: 'suspended',
        title: 'Organisation Suspended',
        badge: 'Organisation Suspended',
        orgName: org.org_name,
        message:
          org.block_reason ||
          `Your organisation "${org.org_name}" has been suspended. Please contact your administrator.`,
      });
      return;
    }

    if (isExp) {
      setOpen(false);
      setAlertModal({
        open: true,
        type: 'expired',
        title: 'Subscription / License Expired',
        badge: 'Organisation Expired',
        orgName: org.org_name,
        message:
          org.block_reason ||
          `Your organisation "${org.org_name}" subscription / license has expired. Please contact your administrator.`,
      });
      return;
    }

    setCurrentOrg(org); // updates context + localStorage in one shot
    setOpen(false);
  }

  // If the user only has one org, show a static chip
  if (organisations.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--muted-bg)] border border-[var(--card-border)]">
        <span className="text-indigo-500">🏢</span>
        <span className="font-medium text-[var(--foreground)]">{currentOrg.org_name}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-indigo-500/50 transition cursor-pointer text-[var(--foreground)]"
      >
        <span className="text-indigo-500">🏢</span>
        <span className="font-medium">{currentOrg.org_name}</span>
        <span className={`text-[var(--muted)] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-2.5 text-xs uppercase tracking-wider font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">
            Switch organisation
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--card-border)]/50">
            {organisations.map((o) => {
              const isSelected = o.id === currentOrg.id;
              const isSusp = o.is_suspended || o.license_status === 'suspended';
              const isExp = o.is_expired || o.license_status === 'expired';
              const isBlocked = isSusp || isExp;

              return (
                <button
                  key={o.id}
                  onClick={() => pick(o)}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-[var(--muted-bg)] transition cursor-pointer ${
                    isSelected ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-[var(--foreground)] truncate">{o.org_name}</span>
                      {isBlocked && (
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isSusp
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isSusp ? 'Suspended' : 'Expired'}
                        </span>
                      )}
                    </div>
                    {o.address && (
                      <div className="text-xs text-[var(--muted)] truncate max-w-[14rem]">
                        {o.address}
                      </div>
                    )}
                  </div>
                  {isSelected && <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Alert Pop-up Modal for Expired / Suspended Organisations */}
      {alertModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[var(--card-bg)] border border-red-500/30 rounded-2xl shadow-2xl p-6 text-center relative animate-in zoom-in-95 duration-200">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg ${
                alertModal.type === 'suspended'
                  ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-amber-500/10'
                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-500 shadow-rose-500/10'
              }`}
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-[var(--foreground)] mb-1">
              {alertModal.title}
            </h2>
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold mb-4 border ${
                alertModal.type === 'suspended'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}
            >
              {alertModal.badge}
            </span>

            <div
              className={`border rounded-xl p-3.5 text-left mb-5 ${
                alertModal.type === 'suspended'
                  ? 'bg-amber-500/5 border-amber-500/20'
                  : 'bg-rose-500/5 border-rose-500/20'
              }`}
            >
              <p
                className={`font-semibold text-xs mb-1 ${
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
                })
              }
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
