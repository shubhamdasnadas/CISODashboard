import { useState, useEffect, useRef, cloneElement } from 'react';
import { Outlet, NavLink, Navigate, useNavigate, useLocation, useOutlet } from 'react-router-dom';
import api from '../api';
import * as session from '../utils/session.js';
import { PAGES } from '../constants/navPages.js';
import { useOrg } from '../context/OrgContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

const NAV = [
  {
    key: 'dashboard', name: 'Dashboard', path: '/dashboard',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  },
  {
    key: 'security', name: 'EDR', path: '/security',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  },
  {
    key: 'checkpoint', name: 'Email Security', path: '/checkpoint',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
  {
    key: 'nvd', name: 'NVD', path: '/nvd',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  },
  {
    key: 'paloalto', name: 'Firewall', path: '/paloalto',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>,
  },
  {
    key: 'mdm', name: 'MDM', path: '/mdm',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  },
  {
    key: 'microsoft365', name: 'Microsoft 365', path: '/microsoft365',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  },
  {
    key: 'zoho-one', name: 'Ticketing', path: '/zoho',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  },
  // {
  //   key: 'osint', name: 'OSINT Intel', path: '/osint',
  //   icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
  // },
 
  // {
  //   key: 'projects', name: 'Projects', path: '/projects',
  //   icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>,
  // },
  {
    key: 'reports', name: 'Reports', path: '/reports',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    key: 'analytics', name: 'Analytics', path: '/analytics',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  },
  {
    key: 'news', name: 'News', path: '/news',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-.586-1.414l-4.5-4.5A2 2 0 0014.5 3H12" /></svg>,
  },
  // {
  //   key: 'billing', name: 'Billing', path: '/billing',
  //   icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
  // },
  // {
  //   key: 'notifications', name: 'Notifications', path: '/notifications',
  //   icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
  // },
  // {
  //   key: 'support', name: 'Support', path: '/support',
  //   icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  // },
  {
    key: 'settings', name: 'Settings', path: '/settings',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
  {
    key: 'admin', name: 'Admin Orgs', path: '/admin/organizations', superAdminOnly: true,
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  },
   {
    key: 'members', name: 'Users', path: '/members',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
];

function Sidebar({ mobileOpen, onClose, allowedPages }) {
  const navigate = useNavigate();
  const user = session.getUser();
  const { setCurrentOrg } = useOrg();
  const [loggingOut, setLoggingOut] = useState(false);

  const isSuperAdmin = user.role === 'superAdmin';
  const initials = (user.username || '?').slice(0, 2).toUpperCase();

  const visibleNav = NAV.filter(item => {
    if (item.superAdminOnly) return isSuperAdmin;
    if (isSuperAdmin) return true; // superAdmin always sees everything
    // Page access control: null/undefined allowedPages = all pages.
    if (!Array.isArray(allowedPages)) return true;
    return allowedPages.includes(item.key);
  });

  const logout = async () => {
    setLoggingOut(true);
    session.clearSession();
    setCurrentOrg(null);
    navigate('/login');
  };

  const content = (
    <div className="w-60 bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] h-full flex flex-col transition-colors duration-200">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[var(--sidebar-border)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-[var(--foreground)] text-sm leading-tight">SecureHub</p>
            <p className="text-xs text-[var(--muted)] leading-tight">Enterprise Platform</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-[var(--muted-bg)] text-[var(--muted)]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map(item => (
          <NavLink key={item.key} to={item.path} onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-[var(--muted)] hover:bg-[var(--muted-bg)] hover:text-[var(--foreground)]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-white' : 'text-[var(--muted)]'}>{item.icon}</span>
                {item.name}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-[var(--sidebar-border)]">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--muted-bg)] mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 bg-indigo-600">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[var(--foreground)] truncate">{user.username}</p>
            <p className="text-xs text-[var(--muted)] capitalize">{user.role?.replace(/_/g, ' ')}</p>
          </div>
        </div>
        <button
          disabled={loggingOut}
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--muted)] hover:bg-[var(--muted-bg)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:flex flex-shrink-0">{content}</div>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <div className="relative z-10 flex-shrink-0">{content}</div>
        </div>
      )}
    </>
  );
}

function TopBar({ onMenuClick }) {
  const { organisations, currentOrg, switchOrg } = useOrg();
  const { theme, toggleTheme } = useTheme();
  const user = session.getUser();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const liveOrgs = organisations.filter(Boolean);

  return (
    <div className="h-14 bg-[var(--topbar-bg)] border-b border-[var(--topbar-border)] flex items-center justify-between px-4 sm:px-6 flex-shrink-0 z-30 transition-colors duration-200">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg hover:bg-[var(--muted-bg)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {liveOrgs.length > 0 && (
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-sm font-medium text-[var(--foreground)] min-w-[200px] transition-colors"
            >
              {currentOrg ? (
                <span className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-indigo-600">
                  {currentOrg.org_name?.[0]?.toUpperCase()}
                </span>
              ) : (
                <span className="w-6 h-6 rounded-md bg-[var(--muted-bg)] flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" />
                  </svg>
                </span>
              )}
              <span className="flex-1 truncate text-left">{currentOrg?.org_name || 'Select Organization'}</span>
              <svg className={`w-4 h-4 text-[var(--muted)] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {open && (
              <div className="absolute top-full left-0 mt-1.5 w-72 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 pt-3 pb-2">
                  <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Organizations</p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {liveOrgs.map(org => {
                    const isSelected = currentOrg?.id === org.id;
                    return (
                      <button key={org.id} onClick={() => { setOpen(false); switchOrg(org.id); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--muted-bg)] transition-colors text-left ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}>
                        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0 bg-indigo-600">
                          {org.org_name?.[0]?.toUpperCase()}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm font-medium truncate ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-[var(--foreground)]'}`}>{org.org_name}</span>
                        </span>
                        {isSelected && (
                          <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <button onClick={toggleTheme} aria-label="Toggle theme"
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--card-border)] hover:bg-[var(--muted-bg)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]">
          {theme === 'dark' ? (
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* User badge */}
        <div className="flex items-center gap-2 bg-[var(--muted-bg)] border border-[var(--card-border)] rounded-lg px-3 py-1.5">
          <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-sm font-medium text-[var(--foreground)] capitalize">{user.role?.replace(/_/g, ' ')}</span>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentOrg } = useOrg();
  const user = session.getUser();

  // ── Page access control ────────────────────────────────────────────────────
  // null = all pages allowed. Array = only these page keys.
  const isSuperAdmin = user.role === 'superAdmin';
  const [allowedPages, setAllowedPages] = useState(null); // null until loaded → show all

  useEffect(() => {
    if (isSuperAdmin) return; // superAdmin bypasses access control entirely
    let cancelled = false;
    api.get('/member/my-access')
      .then(({ data }) => { if (!cancelled) setAllowedPages(data.allowed_pages ?? null); })
      .catch(() => { if (!cancelled) setAllowedPages(null); }); // fail open
    return () => { cancelled = true; };
  }, [isSuperAdmin, currentOrg?.id]);

  // Re-mount the routed page whenever the active organisation changes so that
  // every page re-fetches its data against the new X-Org-Id automatically —
  // no manual browser refresh needed after switching organisations.
  const outlet = useOutlet();
  const outletKeyed = outlet
    ? cloneElement(outlet, { key: currentOrg?.id ?? 'none' })
    : outlet;

  // Route guard: if current path's page isn't allowed, bounce to first allowed page.
  const location = useLocation();
  let guardedOutlet = outletKeyed;
  if (!isSuperAdmin && Array.isArray(allowedPages) && outletKeyed) {
    const matchedPage = PAGES.find(p => {
      const pathPrefix = p.key === 'zoho-one' ? '/zoho' : `/${p.key}`;
      return location.pathname === pathPrefix || location.pathname.startsWith(`${pathPrefix}/`);
    });
    if (matchedPage && !allowedPages.includes(matchedPage.key)) {
      const firstAllowed = PAGES.find(p => allowedPages.includes(p.key));
      guardedOutlet = <Navigate to={firstAllowed ? firstAllowed.path : '/dashboard'} replace />;
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] transition-colors duration-200">
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} allowedPages={allowedPages} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {guardedOutlet}
        </main>
      </div>
    </div>
  );
}
