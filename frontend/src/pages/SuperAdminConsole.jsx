import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import * as session from '../utils/session.js';
import { useOrg } from '../context/OrgContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

const INDUSTRIES = [
  'Technology',
  'Finance & Banking',
  'Healthcare & Pharma',
  'Retail & E-commerce',
  'Education',
  'Manufacturing',
  'Government & Defense',
  'Telecommunications',
  'Energy & Utilities',
  'Professional Services',
  'Other',
];

const PLANS = [
  { id: 'starter', label: 'Starter', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { id: 'professional', label: 'Professional', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { id: 'enterprise', label: 'Enterprise', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
];

const ROLES = [
  { id: 'admin', label: 'Org Admin' },
  { id: 'analyst', label: 'Analyst' },
  { id: 'viewer', label: 'Viewer' },
  { id: 'member', label: 'Member' },
];

function formatDate(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
}

function formatDateTime(d) {
  if (!d) return 'Never';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(d);
  }
}

function StatusBadge({ status, isExpiringSoon, daysRemaining }) {
  const s = (status || '').toLowerCase();
  if (s === 'active') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Active
        </span>
        {isExpiringSoon && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
            title={`Expiring in ${daysRemaining} days`}
          >
            ⚠️ {daysRemaining}d left
          </span>
        )}
      </div>
    );
  }
  if (s === 'upcoming') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
        Upcoming
      </span>
    );
  }
  if (s === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
        Expired
      </span>
    );
  }
  if (s === 'suspended') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Suspended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
      {status || 'Unknown'}
    </span>
  );
}

export default function SuperAdminConsole() {
  const navigate = useNavigate();
  const { setCurrentOrg } = useOrg();
  const { theme, toggleTheme } = useTheme();
  const currentLoggedInUser = session.getUser();
  const viewingOrg = session.getSuperAdminViewingOrg();

  const handleLogout = async () => {
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
  };

  // Active Main Tab: 'organisations' | 'users' | 'superadmins'
  const [activeTab, setActiveTab] = useState('organisations');

  // ─── TAB 1: ORGANISATIONS STATE ─────────────────────────────────────────────
  const [orgs, setOrgs] = useState([]);
  const [orgCounts, setOrgCounts] = useState({ total: 0, active: 0, upcoming: 0, expired: 0, suspended: 0, expiringSoon: 0 });
  const [orgPagination, setOrgPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgStatusFilter, setOrgStatusFilter] = useState('all');
  const [orgPlanFilter, setOrgPlanFilter] = useState('all');
  const [orgIndustryFilter, setOrgIndustryFilter] = useState('all');

  // Org Modals
  const [showAddOrgModal, setShowAddOrgModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [extendOrgTarget, setExtendOrgTarget] = useState(null);
  const [deleteOrgTarget, setDeleteOrgTarget] = useState(null);
  const [detailOrgId, setDetailOrgId] = useState(null);
  const [syncWarningTarget, setSyncWarningTarget] = useState(null);
  const [syncingOrgId, setSyncingOrgId] = useState(null);

  // License & Token Modals & Config
  const [tokenModalOrg, setTokenModalOrg] = useState(null);
  const [generatedTokenData, setGeneratedTokenData] = useState(null);
  const [showOfflineUploadModal, setShowOfflineUploadModal] = useState(false);
  const [licenseConfig, setLicenseConfig] = useState({ deploymentMode: 'online' });

  // ─── TAB 2: USERS STATE ─────────────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [userPagination, setUserPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [userLoading, setUserLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userOrgFilter, setUserOrgFilter] = useState('all');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');

  // User Modals
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState(null);
  const [tempPasswordResult, setTempPasswordResult] = useState(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);

  // ─── TAB 3: SUPER ADMINS STATE ──────────────────────────────────────────────
  const [superAdmins, setSuperAdmins] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [adminActionTarget, setAdminActionTarget] = useState(null); // for password confirmation required operations

  // Toast / Notification Banner
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // ─── FETCH ORGANISATIONS ────────────────────────────────────────────────────
  const fetchOrganisations = useCallback(
    async (page = orgPagination.page) => {
      setOrgLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(orgPagination.limit),
          q: orgSearch,
          status: orgStatusFilter,
          plan: orgPlanFilter,
          industry: orgIndustryFilter,
        });
        const { data } = await api.get(`/superadmin/organisations?${params.toString()}`);
        setOrgs(data.organisations || []);
        setOrgPagination(data.pagination || { page: 1, limit: 10, total: 0, pages: 1 });
        if (data.counts) setOrgCounts(data.counts);
      } catch (err) {
        showToast(err.response?.data?.error || 'Failed to load organisations', 'error');
      } finally {
        setOrgLoading(false);
      }
    },
    [orgPagination.limit, orgPagination.page, orgSearch, orgStatusFilter, orgPlanFilter, orgIndustryFilter]
  );

  useEffect(() => {
    if (activeTab === 'organisations') {
      fetchOrganisations(1);
    }
  }, [fetchOrganisations, activeTab]);

  // ─── FETCH USERS ────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(
    async (page = userPagination.page) => {
      setUserLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(userPagination.limit),
          q: userSearch,
          org_id: userOrgFilter,
          role: userRoleFilter,
          status: userStatusFilter,
        });
        const { data } = await api.get(`/superadmin/users?${params.toString()}`);
        setUsers(data.users || []);
        setUserPagination(data.pagination || { page: 1, limit: 10, total: 0, pages: 1 });
      } catch (err) {
        showToast(err.response?.data?.error || 'Failed to load users', 'error');
      } finally {
        setUserLoading(false);
      }
    },
    [userPagination.limit, userPagination.page, userSearch, userOrgFilter, userRoleFilter, userStatusFilter]
  );

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers(1);
    }
  }, [fetchUsers, activeTab]);

  // ─── FETCH SUPER ADMINS ─────────────────────────────────────────────────────
  const fetchSuperAdmins = useCallback(async () => {
    setAdminLoading(true);
    try {
      const { data } = await api.get('/superadmin/admins');
      setSuperAdmins(data.admins || []);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load Super Admins', 'error');
    } finally {
      setAdminLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'superadmins') {
      fetchSuperAdmins();
    }
  }, [fetchSuperAdmins, activeTab]);

  // ─── FETCH LICENSE CONFIG ───────────────────────────────────────────────────
  const fetchLicenseConfig = useCallback(async () => {
    try {
      const { data } = await api.get('/superadmin/license/config');
      if (data) setLicenseConfig(data);
    } catch (err) {
      console.warn('Failed to load license config:', err);
    }
  }, []);

  useEffect(() => {
    fetchLicenseConfig();
  }, [fetchLicenseConfig]);

  // ─── ACTIONS: GENERATE / VIEW TOKEN ─────────────────────────────────────────
  const handleGenerateToken = async (org) => {
    try {
      const { data } = await api.post(`/superadmin/orgs/${org.id}/token/generate`);
      setGeneratedTokenData({
        org,
        rawToken: data.rawToken,
        token: data.token,
        signedLicense: data.token?.signed_license,
        deploymentMode: data.deploymentMode || licenseConfig.deploymentMode,
      });
      showToast(`Token generated successfully for ${org.org_name}`);
      fetchOrganisations();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to generate token', 'error');
    }
  };

  // ─── ACTIONS: ORG CONTEXT SYNC & SWITCH ──────────────────────────────────────
  const handleExecuteOrgSync = async (org) => {
    setSyncingOrgId(org.id);
    try {
      // Trigger integration sync
      await api.post(`/superadmin/organisations/${org.id}/sync`);
      showToast(`Integrations synced successfully for ${org.org_name}`);

      // Lock context in tab session storage
      session.setSuperAdminViewingOrg({
        id: org.id,
        org_name: org.org_name,
        slug: org.slug,
        plan: org.plan,
      });

      // Update OrgContext and navigate
      setCurrentOrg({ id: org.id, org_name: org.org_name, slug: org.slug });
      navigate('/dashboard');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to sync organisation', 'error');
    } finally {
      setSyncingOrgId(null);
      setSyncWarningTarget(null);
    }
  };

  const handleInitiateSync = (org) => {
    const s = (org.derived_status || '').toLowerCase();
    if (s === 'expired' || s === 'suspended' || s === 'upcoming') {
      setSyncWarningTarget(org);
    } else {
      handleExecuteOrgSync(org);
    }
  };

  // ─── ACTIONS: ORG STATUS TOGGLE ─────────────────────────────────────────────
  const handleToggleOrgStatus = async (org) => {
    const nextStatus = org.status === 'suspended' ? 'active' : 'suspended';
    try {
      await api.patch(`/superadmin/organisations/${org.id}/status`, { status: nextStatus });
      showToast(`Organisation ${nextStatus === 'suspended' ? 'suspended' : 'activated'}`);
      fetchOrganisations();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update status', 'error');
    }
  };

  // ─── ACTIONS: USER STATUS TOGGLE ────────────────────────────────────────────
  const handleToggleUserStatus = async (user) => {
    try {
      await api.patch(`/superadmin/users/${user.id}/status`, { is_active: !user.is_active });
      showToast(`User ${!user.is_active ? 'activated' : 'deactivated'}`);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update user status', 'error');
    }
  };

  // ─── ACTIONS: USER PASSWORD RESET / UPDATE (TWO OPTIONS) ───────────────────
  const handleAutoGenerateUserPassword = async (user) => {
    try {
      const { data } = await api.post(`/superadmin/users/${user.id}/reset-password`);
      setResetPasswordTarget(null);
      setTempPasswordResult({
        username: user.username,
        email: user.email,
        password: data.temporaryPassword,
      });
      showToast(`Temporary password generated for ${user.username}`);
      fetchUsers(userPagination.page);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to reset password', 'error');
    }
  };

  const handleSendEmailUserPasswordReset = async (user) => {
    try {
      const { data } = await api.post(`/superadmin/users/${user.id}/resend-invite`);
      setResetPasswordTarget(null);
      showToast(data.message || `Password setup email sent to ${user.email}`);
      fetchUsers(userPagination.page);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to send password reset email', 'error');
    }
  };

  // ─── ACTIONS: RESET USER PASSWORD (DIRECT TRIGGER) ──────────────────────────
  const handleResetUserPassword = (user) => {
    setResetPasswordTarget(user);
  };

  // ─── ACTIONS: RESEND USER INVITE EMAIL ──────────────────────────────────────
  const handleResendUserInvite = async (user) => {
    try {
      const { data } = await api.post(`/superadmin/users/${user.id}/resend-invite`);
      showToast(data.message || `Password setup email resent to ${user.email}`);
      fetchUsers(userPagination.page);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to resend invitation email', 'error');
    }
  };

  // ─── ACTIONS: RESEND SUPERADMIN INVITE EMAIL ────────────────────────────────
  const handleResendAdminInvite = async (admin) => {
    try {
      const { data } = await api.post(`/superadmin/admins/${admin.id}/resend-invite`);
      showToast(data.message || `Password setup email resent to ${admin.email}`);
      fetchSuperAdmins();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to resend invitation email', 'error');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--background)] text-[var(--foreground)] px-4 sm:px-8 lg:px-12 py-6 sm:py-8 lg:py-10 transition-colors duration-200">
      {/* Toast Banner */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-sm sm:text-base font-semibold border backdrop-blur-xl animate-slideDown ${
            toast.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-700/60 shadow-rose-950/50'
              : 'bg-emerald-950/90 text-emerald-200 border-emerald-700/60 shadow-emerald-950/50'
          }`}
        >
          <span className="text-lg">{toast.type === 'error' ? '❌' : '✅'}</span>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-3 opacity-60 hover:opacity-100 text-sm cursor-pointer font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Main Full-Width Container */}
      <div className="w-full space-y-8 animate-fadeIn">
        {/* Header & Action Controls Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2 border-b border-[var(--card-border)]/50">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/30 flex-shrink-0">
              <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[var(--foreground)] tracking-tight">
                SuperAdmin Console
              </h1>
              <p className="text-sm sm:text-base text-[var(--muted)] mt-1 font-medium">
                Central multi-tenant administration, tenant validity, user directory, and platform governance
              </p>
            </div>
          </div>

          {/* Action & Controls Bar */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            {/* If context-viewing an org */}
            {viewingOrg && (
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm font-bold transition-all cursor-pointer shadow-sm"
                title="Switch to tenant workspace dashboard"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="hidden sm:inline">Viewing:</span>
                <span className="font-extrabold max-w-[150px] truncate">{viewingOrg.org_name}</span>
                <span>→</span>
              </button>
            )}

            {/* Theme Switcher */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-3 rounded-2xl bg-[var(--card-bg)] hover:bg-[var(--card-border)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer shadow-sm"
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* SuperAdmin User Badge */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-sm">
              <span className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                👑
              </span>
              <span className="text-sm font-bold text-[var(--foreground)] truncate max-w-[140px]">
                {currentLoggedInUser?.username || 'SuperAdmin'}
              </span>
            </div>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 text-sm font-bold transition-all cursor-pointer shadow-sm"
              title="Sign out of SuperAdmin session"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </button>

            {/* Primary Tab Action Button */}
            {activeTab === 'organisations' && (
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setShowOfflineUploadModal(true)}
                  className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 font-bold text-sm sm:text-base transition-all cursor-pointer shadow-sm active:scale-98"
                  title="Apply or update a cryptographically signed license token"
                >
                  <span>🔑</span>
                  <span className="hidden sm:inline">Apply License</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingOrg(null);
                    setShowAddOrgModal(true);
                  }}
                  className="flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm sm:text-base shadow-lg shadow-indigo-600/30 transition-all cursor-pointer active:scale-98"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Organisation
                </button>
              </div>
            )}

            {activeTab === 'users' && (
              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setShowAddUserModal(true);
                }}
                className="flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm sm:text-base shadow-lg shadow-indigo-600/30 transition-all cursor-pointer active:scale-98"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add User
              </button>
            )}

            {activeTab === 'superadmins' && (
              <button
                type="button"
                onClick={() => setShowAddAdminModal(true)}
                className="flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-purple-600/30 transition-all cursor-pointer active:scale-98"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add SuperAdmin
              </button>
            )}
          </div>
        </div>

        {/* KPI Stats Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5">
          {[
            { label: 'Total Orgs', val: orgCounts.total, color: 'text-indigo-400', bg: 'from-indigo-500/10 to-indigo-500/5', border: 'border-indigo-500/25' },
            { label: 'Active Orgs', val: orgCounts.active, color: 'text-emerald-400', bg: 'from-emerald-500/10 to-emerald-500/5', border: 'border-emerald-500/25' },
            { label: 'Expiring ≤30d', val: orgCounts.expiringSoon, color: 'text-amber-400', bg: 'from-amber-500/10 to-amber-500/5', border: 'border-amber-500/25' },
            { label: 'Upcoming', val: orgCounts.upcoming, color: 'text-cyan-400', bg: 'from-cyan-500/10 to-cyan-500/5', border: 'border-cyan-500/25' },
            { label: 'Expired', val: orgCounts.expired, color: 'text-rose-400', bg: 'from-rose-500/10 to-rose-500/5', border: 'border-rose-500/25' },
            { label: 'Suspended', val: orgCounts.suspended, color: 'text-zinc-400', bg: 'from-zinc-500/10 to-zinc-500/5', border: 'border-zinc-500/25' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className={`p-5 sm:p-6 rounded-2xl bg-gradient-to-br ${kpi.bg} border ${kpi.border} backdrop-blur-md flex flex-col justify-between shadow-sm hover:border-[var(--card-border)] transition-all`}
            >
              <span className="text-xs sm:text-sm font-bold text-[var(--muted)] uppercase tracking-wider">{kpi.label}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className={`text-3xl sm:text-4xl lg:text-5xl font-black ${kpi.color}`}>{kpi.val}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Main Tabs Navigation */}
        <div className="border-b border-[var(--card-border)] flex items-center gap-2 sm:gap-4 overflow-x-auto">
          {[
            { id: 'organisations', label: 'Organisations', icon: '🏢', count: orgCounts.total },
            { id: 'users', label: 'Users Directory', icon: '👥', count: userPagination.total || undefined },
            { id: 'superadmins', label: 'Super Admins', icon: '🛡️', count: superAdmins.length || undefined },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-6 sm:px-8 py-4 sm:py-5 border-b-2 font-black text-sm sm:text-base lg:text-lg transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-2xl'
                    : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--card-border)]'
                }`}
              >
                <span className="text-lg sm:text-xl">{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-3 py-1 rounded-full text-xs sm:text-sm font-black ${
                      isActive ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40' : 'bg-[var(--muted-bg)] text-[var(--muted)]'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ─────────────────────────────────────────────────────────────────────── */}
        {/* TAB 1: ORGANISATIONS CONTENT                                            */}
        {/* ─────────────────────────────────────────────────────────────────────── */}
        {activeTab === 'organisations' && (
          <div className="space-y-6">
            {/* Filters & Search Toolbar */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 shadow-sm">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[280px]">
                <svg
                  className="w-5 h-5 text-[var(--muted)] absolute left-4 top-1/2 -translate-y-1/2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search organisations by name, slug, email..."
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl text-sm sm:text-base text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Dropdown Filters */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Status Filter */}
                <select
                  value={orgStatusFilter}
                  onChange={(e) => setOrgStatusFilter(e.target.value)}
                  className="px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl text-sm sm:text-base text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="expired">Expired</option>
                  <option value="suspended">Suspended</option>
                </select>

                {/* Plan Filter */}
                <select
                  value={orgPlanFilter}
                  onChange={(e) => setOrgPlanFilter(e.target.value)}
                  className="px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl text-sm sm:text-base text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  <option value="all">All Plans</option>
                  {PLANS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>

                {/* Industry Filter */}
                <select
                  value={orgIndustryFilter}
                  onChange={(e) => setOrgIndustryFilter(e.target.value)}
                  className="px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl text-sm sm:text-base text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[200px] font-medium"
                >
                  <option value="all">All Industries</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>

                {/* Items Per Page */}
                <select
                  value={orgPagination.limit}
                  onChange={(e) => setOrgPagination((p) => ({ ...p, limit: parseInt(e.target.value, 10), page: 1 }))}
                  className="px-3.5 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl text-sm sm:text-base text-[var(--foreground)] focus:outline-none font-medium"
                >
                  <option value="10">10 / page</option>
                  <option value="25">25 / page</option>
                  <option value="50">50 / page</option>
                </select>
              </div>
            </div>

            {/* Table Container */}
            <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden shadow-md">
              {orgLoading ? (
                <WidgetSkeleton variant="table" height="h-96" />
              ) : orgs.length === 0 ? (
                <div className="p-16 text-center text-[var(--muted)] space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--muted-bg)] flex items-center justify-center mx-auto text-3xl">
                    🏢
                  </div>
                  <p className="text-lg font-bold text-[var(--foreground)]">No organisations found</p>
                  <p className="text-sm text-[var(--muted)]">Try adjusting your search query or filter options.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm sm:text-base">
                    <thead className="bg-[var(--muted-bg)] border-b border-[var(--card-border)] text-[var(--muted)] font-bold uppercase tracking-wider text-xs sm:text-sm">
                      <tr>
                        <th className="py-4 sm:py-5 px-5 sm:px-6">Organisation</th>
                        <th className="py-4 sm:py-5 px-4">Industry</th>
                        <th className="py-4 sm:py-5 px-4">Plan</th>
                        <th className="py-4 sm:py-5 px-4">Validity</th>
                        <th className="py-4 sm:py-5 px-4">Status</th>
                        <th className="py-4 sm:py-5 px-4 text-center">Users</th>
                        <th className="py-4 sm:py-5 px-5 sm:px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--card-border)]">
                      {orgs.map((org) => {
                        const planMeta = PLANS.find((p) => p.id === (org.plan || 'starter')) || PLANS[0];
                        const isSyncing = syncingOrgId === org.id;

                        return (
                          <tr
                            key={org.id}
                            className="hover:bg-indigo-500/5 transition-colors group cursor-pointer"
                            onClick={() => setDetailOrgId(org.id)}
                          >
                            {/* Name + Slug + Email */}
                            <td className="py-4 sm:py-5 px-5 sm:px-6">
                              <div className="flex items-center gap-3.5">
                                <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-black flex items-center justify-center flex-shrink-0 text-sm shadow-md">
                                  {org.org_name?.[0]?.toUpperCase() || 'O'}
                                </span>
                                <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-[var(--foreground)] group-hover:text-indigo-400 transition-colors truncate text-sm sm:text-base">
                                    {org.org_name}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 rounded bg-[var(--muted-bg)] text-[var(--muted)] font-mono border border-[var(--card-border)]">
                                    #{org.id}
                                  </span>
                                </div>
                                <div className="text-xs sm:text-sm text-[var(--muted)] flex items-center gap-2 truncate mt-0.5">
                                  <span className="font-mono text-xs opacity-75">/{org.slug}</span>
                                  {org.email && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate">{org.email}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Industry */}
                          <td className="py-4 sm:py-5 px-4 text-[var(--foreground)] font-medium text-sm sm:text-base">
                            {org.industry || '—'}
                          </td>

                          {/* Plan */}
                          <td className="py-4 sm:py-5 px-4">
                            <span className={`px-3 py-1 rounded-xl text-xs sm:text-sm font-bold border ${planMeta.color}`}>
                              {planMeta.label}
                            </span>
                          </td>

                          {/* Validity Period & Expiration */}
                          <td className="py-4 sm:py-5 px-4">
                            <div className="text-xs sm:text-sm">
                              <span className="text-[var(--foreground)] font-medium">
                                {formatDate(org.start_date)}
                              </span>
                              <span className="text-[var(--muted)] mx-1.5">→</span>
                              <span className="text-[var(--foreground)] font-medium">
                                {formatDate(org.end_date)}
                              </span>
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td className="py-4 sm:py-5 px-4">
                            <StatusBadge
                              status={org.derived_status}
                              isExpiringSoon={org.is_expiring_soon}
                              daysRemaining={org.days_remaining}
                            />
                          </td>

                          {/* Users Count */}
                          <td className="py-4 sm:py-5 px-4 text-center">
                            <span className="inline-flex items-center gap-1.5 font-bold text-sm sm:text-base text-[var(--foreground)]">
                              {org.users_count || 0}
                              <span className="text-xs text-[var(--muted)] font-normal">
                                ({org.active_users_count || 0} active)
                              </span>
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-4 sm:py-5 px-5 sm:px-6 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Sync Button */}
                              <button
                                type="button"
                                title="Sync Integrations & View in Dashboard"
                                onClick={() => handleInitiateSync(org)}
                                disabled={isSyncing}
                                className="p-2 rounded-xl text-indigo-400 hover:bg-indigo-500/15 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {isSyncing ? (
                                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                )}
                              </button>

                              {/* Details button */}
                              <button
                                type="button"
                                title="View Details"
                                onClick={() => setDetailOrgId(org.id)}
                                className="p-2 rounded-xl text-cyan-400 hover:bg-cyan-500/15 transition-colors cursor-pointer"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>

                              {/* Edit button */}
                              <button
                                type="button"
                                title="Edit Organisation"
                                onClick={() => {
                                  setEditingOrg(org);
                                  setShowAddOrgModal(true);
                                }}
                                className="p-2 rounded-xl text-emerald-400 hover:bg-emerald-500/15 transition-colors cursor-pointer"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>

                              {/* Extend button */}
                              <button
                                type="button"
                                title="Extend Validity"
                                onClick={() => setExtendOrgTarget(org)}
                                className="p-2 rounded-xl text-purple-400 hover:bg-purple-500/15 transition-colors cursor-pointer"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </button>

                              {/* License Token Button */}
                              <button
                                type="button"
                                title="Generate / View License Token"
                                onClick={() => handleGenerateToken(org)}
                                className="p-2 rounded-xl text-amber-400 hover:bg-amber-500/15 transition-colors cursor-pointer"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                </svg>
                              </button>

                              {/* Toggle Status (Activate / Suspend) */}
                              <button
                                type="button"
                                title={org.status === 'suspended' ? 'Activate Organisation' : 'Suspend Organisation'}
                                onClick={() => handleToggleOrgStatus(org)}
                                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                                  org.status === 'suspended'
                                    ? 'text-emerald-400 hover:bg-emerald-500/15'
                                    : 'text-amber-400 hover:bg-amber-500/15'
                                }`}
                              >
                                {org.status === 'suspended' ? (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                              </button>

                              {/* Delete button */}
                              <button
                                type="button"
                                title="Delete Organisation"
                                onClick={() => setDeleteOrgTarget(org)}
                                className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination footer */}
            {orgPagination.pages > 1 && (
              <div className="p-4 sm:p-5 border-t border-[var(--card-border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-sm sm:text-base text-[var(--muted)]">
                <div>
                  Showing {((orgPagination.page - 1) * orgPagination.limit) + 1} to{' '}
                  {Math.min(orgPagination.page * orgPagination.limit, orgPagination.total)} of {orgPagination.total} organisations
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={orgPagination.page <= 1}
                    onClick={() => fetchOrganisations(orgPagination.page - 1)}
                    className="px-4 py-2 rounded-xl bg-[var(--muted-bg)] hover:bg-[var(--card-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[var(--foreground)] font-semibold text-sm"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 font-bold text-[var(--foreground)] text-sm sm:text-base">
                    {orgPagination.page} / {orgPagination.pages}
                  </span>
                  <button
                    disabled={orgPagination.page >= orgPagination.pages}
                    onClick={() => fetchOrganisations(orgPagination.page + 1)}
                    className="px-4 py-2 rounded-xl bg-[var(--muted-bg)] hover:bg-[var(--card-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[var(--foreground)] font-semibold text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: USERS DIRECTORY                                                  */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Filters & Search Toolbar */}
          <div className="p-4 sm:p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 shadow-sm">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[280px]">
              <svg
                className="w-5 h-5 text-[var(--muted)] absolute left-4 top-1/2 -translate-y-1/2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search users by name, username, email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Dropdown Filters */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Org Filter */}
              <select
                value={userOrgFilter}
                onChange={(e) => setUserOrgFilter(e.target.value)}
                className="px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[240px]"
              >
                <option value="all">All Organisations</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.org_name}
                  </option>
                ))}
              </select>

              {/* Role Filter */}
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Roles</option>
                <option value="superAdmin">SuperAdmin</option>
                <option value="admin">Org Admin</option>
                <option value="analyst">Analyst</option>
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
              </select>

              {/* Status Filter */}
              <select
                value={userStatusFilter}
                onChange={(e) => setUserStatusFilter(e.target.value)}
                className="px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden shadow-sm">
            {userLoading ? (
              <WidgetSkeleton variant="table" height="h-96" />
            ) : users.length === 0 ? (
              <div className="p-16 text-center text-[var(--muted)] space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-[var(--muted-bg)] flex items-center justify-center mx-auto text-3xl">
                  👥
                </div>
                <p className="text-lg font-bold text-[var(--foreground)]">No users found</p>
                <p className="text-sm text-[var(--muted)]">Try adjusting your filters or search query.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm sm:text-base">
                  <thead className="bg-[var(--muted-bg)] border-b border-[var(--card-border)] text-[var(--muted)] font-bold uppercase tracking-wider text-xs sm:text-sm">
                    <tr>
                      <th className="py-4 sm:py-5 px-5 sm:px-6">User</th>
                      <th className="py-4 sm:py-5 px-4 sm:px-5">Email</th>
                      <th className="py-4 sm:py-5 px-4 sm:px-5">Phone</th>
                      <th className="py-4 sm:py-5 px-4 sm:px-5">Organisation(s)</th>
                      <th className="py-4 sm:py-5 px-4 sm:px-5">Role</th>
                      <th className="py-4 sm:py-5 px-4 sm:px-5">Status</th>
                      <th className="py-4 sm:py-5 px-4 sm:px-5">Last Login</th>
                      <th className="py-4 sm:py-5 px-5 sm:px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--card-border)]">
                    {users.map((u) => {
                      const isPending = u.status === 'pending' || u.is_pending_setup;

                      return (
                        <tr key={u.id} className="hover:bg-indigo-500/5 transition-colors">
                          {/* Name + Username */}
                          <td className="py-4 sm:py-5 px-5 sm:px-6">
                            <div className="flex items-center gap-3.5">
                              <span className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white font-black flex items-center justify-center flex-shrink-0 text-sm shadow-md">
                                {u.username?.[0]?.toUpperCase() || 'U'}
                              </span>
                              <div className="min-w-0">
                                <span className="font-bold text-base text-[var(--foreground)] block truncate">{u.username}</span>
                                <span className="text-xs text-[var(--muted)] font-mono">ID: #{u.id}</span>
                              </div>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="py-4 sm:py-5 px-4 sm:px-5 text-[var(--foreground)] font-medium truncate max-w-[220px]">
                            {u.email || '—'}
                          </td>

                          {/* Phone */}
                          <td className="py-4 sm:py-5 px-4 sm:px-5 text-[var(--muted)] font-mono text-sm">
                            {u.phone_number || '—'}
                          </td>

                          {/* Organisation(s) */}
                          <td className="py-4 sm:py-5 px-4 sm:px-5">
                            <div className="flex flex-wrap gap-1.5">
                              {Array.isArray(u.organisations) && u.organisations.length > 0 ? (
                                u.organisations.map((o) => (
                                  <span
                                    key={o.id}
                                    className="px-2.5 py-1 rounded-lg bg-[var(--muted-bg)] text-[var(--foreground)] text-xs font-semibold border border-[var(--card-border)]"
                                  >
                                    {o.org_name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[var(--muted)] text-sm">—</span>
                              )}
                            </div>
                          </td>

                          {/* Role */}
                          <td className="py-4 sm:py-5 px-4 sm:px-5">
                            <span
                              className={`px-3 py-1 rounded-full text-xs sm:text-sm font-bold capitalize ${
                                u.role === 'superAdmin'
                                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                  : u.role === 'admin'
                                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                                  : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-4 sm:py-5 px-4 sm:px-5">
                            {isPending ? (
                              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                Pending Setup
                              </span>
                            ) : u.is_active ? (
                              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                <span className="w-2 h-2 rounded-full bg-zinc-400" />
                                Inactive
                              </span>
                            )}
                          </td>

                          {/* Last Login */}
                          <td className="py-4 sm:py-5 px-4 sm:px-5 text-sm text-[var(--muted)]">
                            {u.last_login_at ? formatDateTime(u.last_login_at) : (
                              <span className="text-xs opacity-75">
                                {isPending ? `Invited on ${formatDate(u.created_at)}` : 'Never'}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-4 sm:py-5 px-5 sm:px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Resend Invite Link Button (for Pending users) */}
                              {isPending && (
                                <button
                                  type="button"
                                  title="Resend Password Setup Link via Email"
                                  onClick={() => handleResendUserInvite(u)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  <span>Resend</span>
                                </button>
                              )}

                              {/* Reset Password Options (Auto-generate vs Email) */}
                              {!isPending && (
                                <button
                                  type="button"
                                  title="Reset / Update Password"
                                  onClick={() => setResetPasswordTarget(u)}
                                  className="p-2 rounded-xl text-amber-400 hover:bg-amber-500/15 transition-colors cursor-pointer"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                  </svg>
                                </button>
                              )}

                              {/* Edit */}
                              <button
                                type="button"
                                title="Edit User"
                                onClick={() => {
                                  setEditingUser(u);
                                  setShowAddUserModal(true);
                                }}
                                className="p-2 rounded-xl text-emerald-400 hover:bg-emerald-500/15 transition-colors cursor-pointer"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>

                              {/* Status Toggle */}
                              {!isPending && (
                                <button
                                  type="button"
                                  title={u.is_active ? 'Deactivate User' : 'Activate User'}
                                  onClick={() => handleToggleUserStatus(u)}
                                  className={`p-2 rounded-xl transition-colors cursor-pointer ${
                                    u.is_active ? 'text-zinc-400 hover:bg-zinc-500/15' : 'text-emerald-400 hover:bg-emerald-500/15'
                                  }`}
                                >
                                  {u.is_active ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                    </svg>
                                  ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  )}
                                </button>
                              )}

                              {/* Delete */}
                              <button
                                type="button"
                                title="Delete User"
                                onClick={() => setDeleteUserTarget(u)}
                                className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination footer */}
            {userPagination.pages > 1 && (
              <div className="p-4 sm:p-5 border-t border-[var(--card-border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-sm sm:text-base text-[var(--muted)]">
                <div>
                  Showing {((userPagination.page - 1) * userPagination.limit) + 1} to{' '}
                  {Math.min(userPagination.page * userPagination.limit, userPagination.total)} of {userPagination.total} users
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={userPagination.page <= 1}
                    onClick={() => fetchUsers(userPagination.page - 1)}
                    className="px-4 py-2 rounded-xl bg-[var(--muted-bg)] hover:bg-[var(--card-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[var(--foreground)] font-semibold text-sm"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 font-bold text-[var(--foreground)] text-sm sm:text-base">
                    {userPagination.page} / {userPagination.pages}
                  </span>
                  <button
                    disabled={userPagination.page >= userPagination.pages}
                    onClick={() => fetchUsers(userPagination.page + 1)}
                    className="px-4 py-2 rounded-xl bg-[var(--muted-bg)] hover:bg-[var(--card-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[var(--foreground)] font-semibold text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: SUPER ADMINS CONTENT                                             */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'superadmins' && (
        <div className="space-y-6">
          {/* SuperAdmins Table */}
          <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden shadow-sm">
            {adminLoading ? (
              <WidgetSkeleton variant="table" height="h-64" />
            ) : superAdmins.length === 0 ? (
              <div className="p-16 text-center text-[var(--muted)] space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-[var(--muted-bg)] flex items-center justify-center mx-auto text-3xl">
                  🛡️
                </div>
                <p className="text-lg font-bold text-[var(--foreground)]">No SuperAdmins found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm sm:text-base">
                  <thead className="bg-[var(--muted-bg)] border-b border-[var(--card-border)] text-[var(--muted)] font-bold uppercase tracking-wider text-xs sm:text-sm">
                    <tr>
                      <th className="py-4 sm:py-5 px-5 sm:px-6">SuperAdmin</th>
                      <th className="py-4 sm:py-5 px-4 sm:px-5">Email</th>
                      <th className="py-4 sm:py-5 px-4 sm:px-5">Phone</th>
                      <th className="py-4 sm:py-5 px-4 sm:px-5">Status</th>
                      <th className="py-4 sm:py-5 px-4 sm:px-5">2FA / MFA</th>
                      <th className="py-4 sm:py-5 px-4 sm:px-5">Last Login</th>
                      <th className="py-4 sm:py-5 px-5 sm:px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--card-border)]">
                    {superAdmins.map((adm) => {
                      const isSelf = adm.id === currentLoggedInUser.id;
                      const isLastAdmin = superAdmins.filter((a) => a.is_active && a.status !== 'pending').length <= 1;
                      const isPending = adm.status === 'pending' || adm.is_pending_setup;

                      return (
                        <tr key={adm.id} className="hover:bg-purple-500/5 transition-colors">
                          {/* SuperAdmin Name */}
                          <td className="py-4 sm:py-5 px-5 sm:px-6">
                            <div className="flex items-center gap-3.5">
                              <span className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-600 text-white font-black flex items-center justify-center flex-shrink-0 text-sm shadow-md">
                                {adm.username?.[0]?.toUpperCase() || 'S'}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-base text-[var(--foreground)]">{adm.username}</span>
                                  {isSelf && (
                                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                      You
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-[var(--muted)] font-mono">ID: #{adm.id}</span>
                              </div>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="py-4 sm:py-5 px-4 sm:px-5 text-[var(--foreground)] font-medium">
                            {adm.email || '—'}
                          </td>

                          {/* Phone */}
                          <td className="py-4 sm:py-5 px-4 sm:px-5 text-[var(--muted)] font-mono text-sm">
                            {adm.phone_number || '—'}
                          </td>

                          {/* Status */}
                          <td className="py-4 sm:py-5 px-4 sm:px-5">
                            {isPending ? (
                              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                Pending Setup
                              </span>
                            ) : adm.is_active ? (
                              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                <span className="w-2 h-2 rounded-full bg-zinc-400" />
                                Inactive
                              </span>
                            )}
                          </td>

                          {/* 2FA Status */}
                          <td className="py-4 sm:py-5 px-4 sm:px-5">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400/90 border border-amber-500/20">
                                ⏳ Pending Setup
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                🔒 Enabled (OTP)
                              </span>
                            )}
                          </td>

                          {/* Last Login */}
                          <td className="py-4 sm:py-5 px-4 sm:px-5 text-sm text-[var(--muted)]">
                            {adm.last_login_at ? formatDateTime(adm.last_login_at) : (
                              <span className="text-xs opacity-75">
                                {isPending ? `Invited on ${formatDate(adm.created_at)}` : 'Never'}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-4 sm:py-5 px-5 sm:px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Resend Invite Link Button (Shown for Pending SuperAdmins) */}
                              {isPending && (
                                <button
                                  type="button"
                                  title="Resend Password Setup Link via Email"
                                  onClick={() => handleResendAdminInvite(adm)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  <span>Resend</span>
                                </button>
                              )}

                              {/* Status Toggle */}
                              {!isPending && (
                                <button
                                  type="button"
                                  disabled={isSelf || (adm.is_active && isLastAdmin)}
                                  title={
                                    isSelf
                                      ? 'Cannot deactivate your own account'
                                      : isLastAdmin && adm.is_active
                                      ? 'Cannot deactivate last active SuperAdmin'
                                      : adm.is_active
                                      ? 'Deactivate'
                                      : 'Activate'
                                  }
                                  onClick={() =>
                                    setAdminActionTarget({
                                      type: 'toggle_status',
                                      admin: adm,
                                      nextActive: !adm.is_active,
                                    })
                                  }
                                  className="p-2 rounded-xl text-amber-400 hover:bg-amber-500/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </button>
                              )}

                              {/* Delete */}
                              <button
                                type="button"
                                disabled={isSelf || (!isPending && isLastAdmin)}
                                title={
                                  isSelf
                                    ? 'Cannot delete your own account'
                                    : !isPending && isLastAdmin
                                    ? 'Cannot delete last active SuperAdmin'
                                    : 'Delete SuperAdmin'
                                }
                                onClick={() =>
                                  setAdminActionTarget({
                                    type: 'delete',
                                    admin: adm,
                                  })
                                }
                                className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: ADD / EDIT ORGANISATION                                          */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {showAddOrgModal && (
        <OrgFormModal
          editingOrg={editingOrg}
          onClose={() => setShowAddOrgModal(false)}
          onSuccess={(msg, tempAdmin) => {
            setShowAddOrgModal(false);
            showToast(msg);
            fetchOrganisations();
            if (tempAdmin) {
              setTempPasswordResult({
                username: tempAdmin.username,
                email: tempAdmin.email,
                password: tempAdmin.temporaryPassword,
              });
            }
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: EXTEND VALIDITY                                                  */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {extendOrgTarget && (
        <ExtendValidityModal
          org={extendOrgTarget}
          licenseConfig={licenseConfig}
          onClose={() => setExtendOrgTarget(null)}
          onOpenApplyLicense={() => {
            setExtendOrgTarget(null);
            setShowOfflineUploadModal(true);
          }}
          onSuccess={(msg) => {
            setExtendOrgTarget(null);
            showToast(msg);
            fetchOrganisations();
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: GENERATED TOKEN DISPLAY (ONE-TIME VIEW & COPY)                   */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {generatedTokenData && (
        <TokenResultModal
          data={generatedTokenData}
          onClose={() => setGeneratedTokenData(null)}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: APPLY OFFLINE SIGNED LICENSE                                     */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {showOfflineUploadModal && (
        <OfflineLicenseUploadModal
          onClose={() => setShowOfflineUploadModal(false)}
          onSuccess={(msg) => {
            setShowOfflineUploadModal(false);
            showToast(msg);
            fetchOrganisations();
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: DELETE ORGANISATION (CONFIRM NAME)                               */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {deleteOrgTarget && (
        <DeleteOrgConfirmModal
          org={deleteOrgTarget}
          onClose={() => setDeleteOrgTarget(null)}
          onSuccess={(msg) => {
            setDeleteOrgTarget(null);
            showToast(msg);
            fetchOrganisations();
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: ADD / EDIT USER                                                  */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {showAddUserModal && (
        <UserFormModal
          editingUser={editingUser}
          organisations={orgs}
          onClose={() => {
            setShowAddUserModal(false);
            setEditingUser(null);
          }}
          onResetPassword={(u) => {
            setShowAddUserModal(false);
            setEditingUser(null);
            setResetPasswordTarget(u);
          }}
          onSuccess={(msg, tempPass) => {
            setShowAddUserModal(false);
            setEditingUser(null);
            showToast(msg);
            fetchUsers();
            if (tempPass) {
              setTempPasswordResult({
                username: tempPass.username,
                email: tempPass.email,
                password: tempPass.password,
              });
            }
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: RESET PASSWORD CHOICE (AUTO-GENERATE VS EMAIL RESET)             */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {resetPasswordTarget && (
        <ResetPasswordChoiceModal
          user={resetPasswordTarget}
          onClose={() => setResetPasswordTarget(null)}
          onAutoGenerate={handleAutoGenerateUserPassword}
          onSendEmail={handleSendEmailUserPasswordReset}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: DELETE USER CONFIRMATION                                         */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {deleteUserTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[var(--card-bg)] border border-rose-500/40 rounded-3xl p-7 sm:p-8 space-y-6 shadow-2xl animate-scaleUp">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center text-3xl shadow-sm">
              🗑️
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-[var(--foreground)]">Delete User Account</h3>
              <p className="text-sm sm:text-base text-[var(--muted)] mt-2 leading-relaxed">
                Are you sure you want to delete user <strong className="text-[var(--foreground)]">{deleteUserTarget.username}</strong>?
                This user will lose access to all organisations immediately.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3.5 pt-3">
              <button
                type="button"
                onClick={() => setDeleteUserTarget(null)}
                className="px-5 py-3 rounded-xl text-sm font-bold bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.delete(`/superadmin/users/${deleteUserTarget.id}`);
                    showToast(`User ${deleteUserTarget.username} deleted`);
                    setDeleteUserTarget(null);
                    fetchUsers();
                  } catch (err) {
                    showToast(err.response?.data?.error || 'Failed to delete user', 'error');
                  }
                }}
                className="px-6 py-3 rounded-xl text-sm sm:text-base font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30 cursor-pointer transition-all"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: ADD SUPER ADMIN                                                  */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {showAddAdminModal && (
        <AddSuperAdminModal
          organisations={orgs}
          onClose={() => setShowAddAdminModal(false)}
          onSuccess={(msg, tempPass) => {
            setShowAddAdminModal(false);
            showToast(msg);
            fetchSuperAdmins();
            if (tempPass) {
              setTempPasswordResult({
                username: tempPass.username,
                email: tempPass.email,
                password: tempPass.password,
              });
            }
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: SUPER ADMIN ACTION PASSWORD CONFIRMATION                         */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {adminActionTarget && (
        <AdminPasswordConfirmModal
          target={adminActionTarget}
          onClose={() => setAdminActionTarget(null)}
          onSuccess={(msg) => {
            setAdminActionTarget(null);
            showToast(msg);
            fetchSuperAdmins();
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: SYNC WARNING CONFIRMATION (EXPIRED/SUSPENDED/UPCOMING)           */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {syncWarningTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[var(--card-bg)] border border-amber-500/40 rounded-3xl p-7 sm:p-8 space-y-6 shadow-2xl animate-scaleUp">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center text-3xl shadow-sm">
              ⚠️
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-[var(--foreground)]">
                Sync {syncWarningTarget.derived_status === 'expired' ? 'Expired' : syncWarningTarget.derived_status === 'suspended' ? 'Suspended' : 'Upcoming'} Organisation?
              </h3>
              <p className="text-sm sm:text-base text-[var(--muted)] mt-2 leading-relaxed">
                Organisation <strong className="text-[var(--foreground)]">{syncWarningTarget.org_name}</strong> is currently{' '}
                <strong className="text-amber-400 uppercase tracking-wide">{syncWarningTarget.derived_status}</strong>.
                As SuperAdmin, you can still view and sync its data, but regular users from this organisation are blocked from logging in.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3.5 pt-3">
              <button
                type="button"
                onClick={() => setSyncWarningTarget(null)}
                className="px-5 py-3 rounded-xl text-sm font-bold bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExecuteOrgSync(syncWarningTarget)}
                className="px-6 py-3 rounded-xl text-sm sm:text-base font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/30 cursor-pointer transition-all"
              >
                Proceed & Sync
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: TEMPORARY PASSWORD COPY POPUP                                    */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {tempPasswordResult && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[var(--card-bg)] border border-emerald-500/40 rounded-3xl p-7 sm:p-8 space-y-6 shadow-2xl shadow-emerald-950/50 animate-scaleUp">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl shadow-sm">
              🔑
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-[var(--foreground)]">Temporary Credentials Generated</h3>
              <p className="text-xs sm:text-sm text-[var(--muted)] mt-1.5 leading-relaxed">
                Please copy and share this temporary password with the user. It will not be displayed again.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--muted-bg)] border border-[var(--card-border)] space-y-3">
              <div className="flex justify-between text-sm sm:text-base">
                <span className="text-[var(--muted)]">Username:</span>
                <span className="font-bold text-[var(--foreground)]">{tempPasswordResult.username}</span>
              </div>
              <div className="flex justify-between text-sm sm:text-base">
                <span className="text-[var(--muted)]">Email:</span>
                <span className="font-bold text-[var(--foreground)]">{tempPasswordResult.email}</span>
              </div>
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--card-border)]">
                <span className="font-mono text-base font-extrabold text-emerald-400 break-all select-all">
                  {tempPasswordResult.password}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(tempPasswordResult.password);
                    showToast('Password copied to clipboard!');
                  }}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer flex-shrink-0 shadow-md shadow-emerald-600/30"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setTempPasswordResult(null)}
                className="w-full px-5 py-3.5 rounded-xl text-sm sm:text-base font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 cursor-pointer transition-all"
              >
                I Have Saved This Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* POPUP MODAL: ORGANISATION DETAILS (4 TABS, HEALTH, AUDIT TRAIL)         */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {detailOrgId && (
        <OrgDetailsModal
          orgId={detailOrgId}
          organisations={orgs}
          showToast={showToast}
          setTempPasswordResult={setTempPasswordResult}
          onClose={() => setDetailOrgId(null)}
          onEdit={(org) => {
            setDetailOrgId(null);
            setEditingOrg(org);
            setShowAddOrgModal(true);
          }}
          onSync={(org) => {
            setDetailOrgId(null);
            handleInitiateSync(org);
          }}
          onViewAllUsers={(targetOrgId) => {
            setDetailOrgId(null);
            setActiveTab('users');
            setUserOrgFilter(String(targetOrgId));
          }}
        />
      )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: ORG FORM MODAL (ADD / EDIT)
// ─────────────────────────────────────────────────────────────────────────────
function OrgFormModal({ editingOrg, onClose, onSuccess }) {
  const isEdit = !!editingOrg;
  const todayStr = new Date().toISOString().split('T')[0];
  const nextYearStr = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [form, setForm] = useState({
    org_name: editingOrg?.org_name || '',
    slug: editingOrg?.slug || '',
    email: editingOrg?.email || '',
    industry: editingOrg?.industry || 'Technology',
    plan: editingOrg?.plan || 'starter',
    start_date: editingOrg?.start_date ? editingOrg.start_date.split('T')[0] : todayStr,
    end_date: editingOrg?.end_date ? editingOrg.end_date.split('T')[0] : nextYearStr,
    description: editingOrg?.description || '',
    address: editingOrg?.address || '',
    mobile_no: editingOrg?.mobile_no || '',
    createAdminUser: false,
    adminName: '',
    adminEmail: '',
    adminPasswordType: 'temp',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Auto-generate slug on typing name if creating new
  const handleNameChange = (e) => {
    const val = e.target.value;
    setForm((p) => {
      const next = { ...p, org_name: val };
      if (!isEdit) {
        next.slug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.org_name.trim()) {
      setError('Organisation Name is required');
      return;
    }
    if (new Date(form.end_date) <= new Date(form.start_date)) {
      setError('End Date must be after Start Date');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        const { data } = await api.put(`/superadmin/organisations/${editingOrg.id}`, form);
        onSuccess('Organisation updated successfully');
      } else {
        const { data } = await api.post('/superadmin/organisations', form);
        onSuccess('Organisation created successfully', data.adminUser);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl shadow-2xl my-8 overflow-hidden animate-scaleUp">
        <div className="p-6 sm:p-7 border-b border-[var(--card-border)] flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
          <div className="flex items-center gap-3.5">
            <span className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
              {isEdit ? '✏️' : '🏢'}
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--foreground)]">
                {isEdit ? `Edit "${editingOrg.org_name}"` : 'Add New Organisation'}
              </h2>
              <p className="text-xs sm:text-sm text-[var(--muted)] mt-0.5">
                {isEdit ? 'Update organisation details and subscription parameters' : 'Create new tenant workspace and allocate database resources'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--muted-bg)] text-[var(--muted)] hover:text-[var(--foreground)] text-lg">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm font-semibold">
              ⚠️ {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Org Name */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Organisation Name *
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Acme Corporation"
                value={form.org_name}
                onChange={handleNameChange}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Slug (Unique Identifier) *
              </label>
              <input
                required
                disabled={isEdit}
                type="text"
                placeholder="e.g. acme-corporation"
                value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base font-mono text-[var(--foreground)] disabled:opacity-60 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Contact Email
              </label>
              <input
                type="email"
                placeholder="admin@acme.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Industry */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Industry
              </label>
              <select
                value={form.industry}
                onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            </div>

            {/* Plan */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Subscription Plan
              </label>
              <select
                value={form.plan}
                onChange={(e) => setForm((p) => ({ ...p, plan: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {PLANS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Mobile No */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Mobile / Phone
              </label>
              <input
                type="text"
                placeholder="+1 555-0199"
                value={form.mobile_no}
                onChange={(e) => setForm((p) => ({ ...p, mobile_no: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Validity Start Date *
              </label>
              <input
                required
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Validity End Date *
              </label>
              <input
                required
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
              Description / Notes
            </label>
            <textarea
              rows={3}
              placeholder="Internal notes or description..."
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Optional: Auto-create Org Admin User (only on creation) */}
          {!isEdit && (
            <div className="p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.createAdminUser}
                  onChange={(e) => setForm((p) => ({ ...p, createAdminUser: e.target.checked }))}
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-bold text-indigo-300">
                  Auto-create Primary Org Administrator for this organisation
                </span>
              </label>

              {form.createAdminUser && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5">
                      Admin Full Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={form.adminName}
                      onChange={(e) => setForm((p) => ({ ...p, adminName: e.target.value }))}
                      className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--muted)] mb-1.5">
                      Admin Email *
                    </label>
                    <input
                      required
                      type="email"
                      placeholder="admin@acme.com"
                      value={form.adminEmail}
                      onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))}
                      className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3.5 pt-5 border-t border-[var(--card-border)]">
            <button
              type="button"
              onClick={onClose}
              className="px-5 sm:px-6 py-3 rounded-xl text-sm font-bold bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 sm:px-7 py-3 rounded-xl text-sm sm:text-base font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-lg shadow-indigo-600/30 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Organisation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: EXTEND VALIDITY MODAL (ONLINE & OFFLINE AWARE)
// ─────────────────────────────────────────────────────────────────────────────
function ExtendValidityModal({ org, licenseConfig, onClose, onSuccess, onOpenApplyLicense }) {
  const isOffline = licenseConfig?.deploymentMode === 'offline';

  // Calculate default new end date (+30 days from current end date or today)
  const computeInitialDate = () => {
    try {
      const base = org.end_date ? new Date(org.end_date) : new Date();
      const current = isNaN(base.getTime()) ? new Date() : base;
      const target = new Date(current.getTime() + 30 * 24 * 60 * 60 * 1000);
      return target.toISOString().split('T')[0];
    } catch {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }
  };

  const [newEndDate, setNewEndDate] = useState(computeInitialDate());
  const [reason, setReason] = useState('Enterprise subscription extension');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleApplyPreset = (days) => {
    try {
      const base = org.end_date ? new Date(org.end_date) : new Date();
      const current = isNaN(base.getTime()) ? new Date() : base;
      const target = new Date(current.getTime() + days * 24 * 60 * 60 * 1000);
      setNewEndDate(target.toISOString().split('T')[0]);
      setError('');
    } catch {
      // fallback
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!newEndDate) {
      setError('Please select a new validity end date.');
      return;
    }

    if (org.end_date) {
      const currentEnd = new Date(org.end_date.split('T')[0]);
      const nextEnd = new Date(newEndDate);
      if (nextEnd <= currentEnd) {
        setError(`New End Date (${newEndDate}) must be strictly after Current Expiry (${formatDate(org.end_date)}).`);
        return;
      }
    }

    if (!reason.trim()) {
      setError('Please provide a reason/note for this validity extension.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.patch(`/superadmin/orgs/${org.id}/token/extend`, {
        newEndDate,
        reason: reason.trim(),
      });
      onSuccess(data.message || `Validity extended successfully for ${org.org_name}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to extend validity');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[var(--card-bg)] border border-purple-500/30 rounded-3xl p-7 space-y-6 shadow-2xl animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <span className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-2xl shadow-sm">
              📅
            </span>
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">Extend License Validity</h3>
              <p className="text-xs sm:text-sm text-[var(--muted)]">{org.org_name} ({org.slug})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] text-lg cursor-pointer">
            ✕
          </button>
        </div>

        {/* Offline Mode Notice */}
        {isOffline && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-200">
              <span>🔒</span>
              <span>Offline / On-Premise Installation</span>
            </div>
            <p className="leading-relaxed">
              Direct validity extension on client servers is locked to prevent tampering. To extend, please apply a cryptographically signed license token string or file issued by your vendor SuperAdmin.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={onOpenApplyLicense}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold text-xs transition border border-amber-500/40 cursor-pointer"
              >
                Upload / Apply Signed License →
              </button>
            </div>
          </div>
        )}

        {/* Current Validity Summary */}
        <div className="p-4 rounded-2xl bg-[var(--muted-bg)] border border-[var(--card-border)] text-xs sm:text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Current Expiry Date:</span>
            <span className="font-bold text-rose-400">{formatDate(org.end_date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Current Status:</span>
            <span className="font-bold capitalize text-indigo-400">{org.derived_status || org.status}</span>
          </div>
          {org.license_id && (
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">License ID:</span>
              <span className="font-mono text-purple-300 font-semibold">{org.license_id}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              ⚠️ {error}
            </div>
          )}

          {/* Quick presets */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">Quick Extend Presets</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '+30 Days', days: 30 },
                { label: '+90 Days', days: 90 },
                { label: '+6 Months', days: 180 },
                { label: '+1 Year', days: 365 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handleApplyPreset(p.days)}
                  className="py-2.5 px-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold transition cursor-pointer text-center active:scale-95"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* New End Date Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider block">
              New Validity End Date *
            </label>
            <input
              type="date"
              required
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm font-semibold text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Reason / Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider block">
              Reason / Extension Note *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Annual renewal, contract extension, demo evaluation..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs sm:text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--card-border)]">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)] cursor-pointer transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-purple-600/30 disabled:opacity-50 transition cursor-pointer active:scale-95"
            >
              {submitting ? 'Extending...' : 'Confirm & Extend'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: TOKEN RESULT MODAL (ONE-TIME RAW TOKEN & SIGNED TOKEN DISPLAY)
// ─────────────────────────────────────────────────────────────────────────────
function TokenResultModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  const { org, rawToken, token, signedLicense, deploymentMode } = data || {};

  const tokenString = rawToken || signedLicense || '';
  const isSigned = !!signedLicense;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tokenString);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
    }
  };

  const handleDownloadLicenseFile = () => {
    if (!tokenString) return;
    const blob = new Blob([tokenString], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${org?.slug || 'ciso'}-license-${token?.license_id || 'key'}.lic`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-[var(--card-bg)] border border-indigo-500/40 rounded-3xl p-7 sm:p-8 space-y-6 shadow-2xl animate-scaleUp">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-2xl shadow-sm">
              🔑
            </span>
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">Enterprise License Token</h3>
              <p className="text-xs text-[var(--muted)]">{org?.org_name} ({org?.slug})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] text-lg cursor-pointer">
            ✕
          </button>
        </div>

        {/* Token Details Summary */}
        <div className="p-4 rounded-2xl bg-[var(--muted-bg)] border border-[var(--card-border)] text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">License ID:</span>
            <span className="font-mono text-indigo-400 font-semibold">{token?.license_id || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Validity Period:</span>
            <span className="font-bold text-[var(--foreground)]">{formatDate(token?.start_date)} → {formatDate(token?.end_date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Deployment Mode:</span>
            <span className="font-bold uppercase text-purple-400">{deploymentMode || 'online'}</span>
          </div>
        </div>

        {/* Token Display Area */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
              {isSigned ? 'Cryptographically Signed License Token' : 'Generated License Token (Raw)'}
            </label>
            <span className="text-[11px] text-amber-400 font-semibold">
              {!isSigned && '⚠️ Shown only once'}
            </span>
          </div>

          <div className="relative">
            <textarea
              readOnly
              rows={isSigned ? 5 : 3}
              value={tokenString}
              className="w-full p-3.5 bg-slate-950 border border-indigo-500/30 rounded-xl text-xs font-mono text-indigo-300 select-all focus:outline-none resize-none break-all"
            />
          </div>
        </div>

        {/* Security Warning Notice */}
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
          <span className="text-base flex-shrink-0">⚠️</span>
          <span className="leading-relaxed">
            {isSigned
              ? 'This token is cryptographically signed with your private key and verified with the public key on the client install.'
              : 'For security, this raw token is hashed with SHA-256 in the central database and cannot be retrieved again. Please copy and store it safely.'}
          </span>
        </div>

        {/* Modal Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          {isSigned && (
            <button
              type="button"
              onClick={handleDownloadLicenseFile}
              className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
            >
              📥 Download .lic File
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition cursor-pointer active:scale-95 flex items-center gap-1.5"
          >
            {copied ? (
              <>
                <span>✓</span>
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <span>📋</span>
                <span>Copy Token</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: OFFLINE LICENSE UPLOAD MODAL
// ─────────────────────────────────────────────────────────────────────────────
function OfflineLicenseUploadModal({ onClose, onSuccess }) {
  const [tokenInput, setTokenInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setError('Please enter or upload a valid signed license token string.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post('/superadmin/license/apply', {
        signedLicense: tokenInput.trim(),
      });
      onSuccess(data.message || 'Signed license applied successfully!');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to apply license token');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[var(--card-bg)] border border-purple-500/40 rounded-3xl p-7 sm:p-8 space-y-6 shadow-2xl animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-2xl shadow-sm">
              🔑
            </span>
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">Apply Signed License</h3>
              <p className="text-xs text-[var(--muted)]">Upload or paste a vendor-signed license token</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] text-lg cursor-pointer">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              ⚠️ {error}
            </div>
          )}

          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Paste the cryptographically signed JWT token string or upload the <code className="text-purple-300">.lic</code> license file issued by TechSec Vendor SuperAdmin.
          </p>

          <div>
            <label className="block text-xs font-bold text-[var(--foreground)] uppercase mb-1.5">
              Signed License Token String *
            </label>
            <textarea
              rows={5}
              required
              placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-[var(--input-border)] rounded-xl text-xs font-mono text-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none break-all"
            />
          </div>

          {/* File Upload Selector */}
          <div>
            <label className="block text-xs font-bold text-[var(--foreground)] uppercase mb-1.5">
              Or Upload License File (.lic / .txt / .jwt)
            </label>
            <input
              type="file"
              accept=".lic,.txt,.json,.jwt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (evt) => {
                    setTokenInput(String(evt.target?.result || ''));
                  };
                  reader.readAsText(file);
                }
              }}
              className="w-full text-xs text-[var(--muted)] file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--card-border)]">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-purple-600/30 disabled:opacity-50 transition cursor-pointer active:scale-95"
            >
              {submitting ? 'Verifying & Applying...' : 'Verify & Apply License'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: DELETE ORG MODAL (TYPED CONFIRMATION)
// ─────────────────────────────────────────────────────────────────────────────
function DeleteOrgConfirmModal({ org, onClose, onSuccess }) {
  const [typedName, setTypedName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isMatch = typedName.trim().toLowerCase() === org.org_name.trim().toLowerCase();

  const handleDelete = async () => {
    if (!isMatch) return;
    setSubmitting(true);
    try {
      await api.delete(`/superadmin/organisations/${org.id}`, {
        data: { confirmOrgName: typedName.trim() },
      });
      onSuccess(`Organisation "${org.org_name}" soft-deleted successfully`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete organisation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[var(--card-bg)] border border-rose-500/40 rounded-3xl p-7 space-y-5 shadow-2xl shadow-rose-950/50 animate-scaleUp">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-3xl shadow-sm">
          ⚠️
        </div>
        <div>
          <h3 className="text-xl font-bold text-[var(--foreground)]">Soft-Delete Organisation</h3>
          <p className="text-sm text-[var(--muted)] mt-1.5 leading-relaxed">
            This will suspend organisation <strong className="text-[var(--foreground)]">{org.org_name}</strong>,
            block all its users from logging in, and archive its tenant database records.
          </p>
        </div>

        <div className="space-y-2.5">
          <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)]">
            Type <span className="text-rose-400 select-all font-mono font-black">{org.org_name}</span> to confirm:
          </label>
          <input
            type="text"
            placeholder={org.org_name}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            className="w-full px-4 py-3 bg-[var(--input-bg)] border border-rose-500/30 rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-rose-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-xl text-sm font-bold bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isMatch || submitting}
            onClick={handleDelete}
            className="px-6 py-3 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? 'Deleting...' : 'Delete Organisation'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: USER FORM MODAL (ADD / EDIT)
// ─────────────────────────────────────────────────────────────────────────────
function UserFormModal({ editingUser, organisations = [], lockedOrgId = null, onClose, onSuccess, onResetPassword }) {
  const isEdit = !!editingUser;
  const [form, setForm] = useState({
    name: editingUser?.username || '',
    username: editingUser?.username || '',
    email: editingUser?.email || '',
    phone_number: editingUser?.phone_number || '',
    organisation_id: lockedOrgId ? String(lockedOrgId) : (editingUser?.organisation_id ? String(editingUser.organisation_id) : (organisations[0]?.id ? String(organisations[0].id) : '')),
    role: editingUser?.role || 'member',
    is_active: editingUser ? editingUser.is_active : true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const lockedOrgObj = lockedOrgId
    ? organisations.find((o) => String(o.id) === String(lockedOrgId))
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    setSubmitting(true);
    try {
      if (isEdit) {
        const { data } = await api.put(`/superadmin/users/${editingUser.id}`, {
          username: form.name.trim(),
          email: form.email.trim(),
          phone_number: form.phone_number.trim(),
          organisation_id: form.organisation_id,
          role: form.role,
          is_active: form.is_active,
        });
        onSuccess(data?.message || 'User updated successfully');
      } else {
        const { data } = await api.post('/superadmin/users', {
          name: form.name.trim(),
          username: form.name.trim(),
          email: form.email.trim(),
          phone_number: form.phone_number.trim(),
          organisation_id: form.organisation_id,
          role: form.role,
        });
        onSuccess(
          data.message || `User "${form.name}" created with status Pending. Invitation email sent to ${form.email}.`
        );
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl shadow-2xl overflow-hidden animate-scaleUp">
        <div className="p-6 sm:p-7 border-b border-[var(--card-border)] flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <span className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
              👤
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--foreground)]">
                {isEdit ? `Edit User "${editingUser.username}"` : 'Invite New User'}
              </h2>
              <p className="text-xs sm:text-sm text-[var(--muted)] mt-0.5">
                {isEdit ? 'Update account details and assigned permissions' : 'An activation email will be sent for password setup'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] transition-colors text-lg cursor-pointer">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1">
            {error && (
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm font-semibold">
                ⚠️ {error}
              </div>
            )}

            {/* Info Banner when Creating */}
            {!isEdit && (
              <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs sm:text-sm text-indigo-200 flex items-start gap-3">
                <span className="text-lg flex-shrink-0">✉️</span>
                <span className="leading-relaxed">
                  The new user will be created with <strong>Pending</strong> status and receive an email invitation to set their password.
                </span>
              </div>
            )}

            {/* User Full Name */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Full Name / Username *
              </label>
              <input
                required
                type="text"
                placeholder="e.g. John Doe"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Email Address *
              </label>
              <input
                required
                type="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              {isEdit && form.email.trim().toLowerCase() !== (editingUser?.email || '').trim().toLowerCase() && (
                <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1.5 font-medium">
                  <span>✉️</span> Changing the email address will send a new password setup invitation link to this address.
                </p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={form.phone_number}
                onChange={(e) => setForm((p) => ({ ...p, phone_number: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Organisation & Role */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                  Organisation {lockedOrgId && <span className="text-xs text-indigo-400 normal-case font-semibold">(Pre-selected)</span>}
                </label>
                {lockedOrgId ? (
                  <div className="w-full px-4 py-3 sm:py-3.5 bg-[var(--muted-bg)] border border-[var(--card-border)] rounded-xl text-sm sm:text-base font-bold text-[var(--foreground)] flex items-center justify-between">
                    <span className="truncate">
                      {lockedOrgObj?.org_name || 'Assigned Organisation'}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono flex items-center gap-1 flex-shrink-0">
                      🔒 Fixed
                    </span>
                  </div>
                ) : (
                  <select
                    value={form.organisation_id}
                    onChange={(e) => setForm((p) => ({ ...p, organisation_id: e.target.value }))}
                    className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">None (Standalone)</option>
                    {organisations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.org_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                  Role
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                  className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active switch when editing */}
            {isEdit && (
              <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--muted-bg)] border border-[var(--card-border)]">
                <div>
                  <span className="text-sm font-bold text-[var(--foreground)] block">Account Status</span>
                  <span className="text-xs text-[var(--muted)]">Toggle user access to the dashboard</span>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
                  className={`px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                    form.is_active
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}
                >
                  {form.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
            )}

            {/* Password Options when editing */}
            {isEdit && onResetPassword && (
              <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--muted-bg)] border border-[var(--card-border)]">
                <div>
                  <span className="text-sm font-bold text-[var(--foreground)] block">Password Options</span>
                  <span className="text-xs text-[var(--muted)]">Auto-generate temporary password or send reset email</span>
                </div>
                <button
                  type="button"
                  onClick={() => onResetPassword(editingUser)}
                  className="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>🔑</span>
                  <span>Reset Options</span>
                </button>
              </div>
            )}
          </div>

          <div className="p-5 sm:p-6 border-t border-[var(--card-border)] bg-[var(--card-bg)] flex items-center justify-end gap-3.5 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl text-sm font-bold bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 rounded-xl text-sm sm:text-base font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting
                ? isEdit
                  ? form.email.trim().toLowerCase() !== (editingUser?.email || '').trim().toLowerCase()
                    ? 'Saving & Sending Invite...'
                    : 'Saving Changes...'
                  : 'Sending Invite...'
                : isEdit
                  ? 'Save Changes'
                  : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: RESET PASSWORD CHOICE MODAL (TWO OPTIONS: AUTO VS EMAIL)
// ─────────────────────────────────────────────────────────────────────────────
function ResetPasswordChoiceModal({ user, onClose, onAutoGenerate, onSendEmail }) {
  const [loadingType, setLoadingType] = useState(null); // 'auto' | 'email' | null
  const [error, setError] = useState(null);

  const handleAuto = async () => {
    setError(null);
    setLoadingType('auto');
    try {
      await onAutoGenerate(user);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to generate temporary password');
      setLoadingType(null);
    }
  };

  const handleEmail = async () => {
    if (!user.email) {
      setError('User does not have a registered email address to receive reset link');
      return;
    }
    setError(null);
    setLoadingType('email');
    try {
      await onSendEmail(user);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to send password reset email');
      setLoadingType(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-7 sm:p-9 space-y-6 shadow-2xl animate-scaleUp">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-2 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center text-3xl shadow-sm flex-shrink-0">
              🔑
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-[var(--foreground)]">Reset User Password</h3>
              <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
                Choose how to update or reset the password for <strong className="text-[var(--foreground)]">{user.username}</strong>
                {user.email && <span className="text-indigo-400 font-semibold"> ({user.email})</span>}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-[var(--muted-bg)] hover:bg-[var(--card-border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] text-lg cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs sm:text-sm font-semibold flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Two Options Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {/* Option 1: Auto-generated Password */}
          <div className="flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-[var(--muted-bg)]/60 hover:bg-[var(--muted-bg)] border border-[var(--card-border)] hover:border-emerald-500/50 transition-all group">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                ⚡
              </div>
              <div>
                <h4 className="text-base sm:text-lg font-black text-[var(--foreground)]">Auto-generated Password</h4>
                <p className="text-xs sm:text-sm text-[var(--muted)] mt-1.5 leading-relaxed">
                  Generate an instant random temporary password immediately on screen to copy and share directly with the user.
                </p>
              </div>
              <div className="text-[11px] font-semibold text-emerald-400/90 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 inline-block">
                ⚡ Instant display & copy
              </div>
            </div>

            <button
              type="button"
              disabled={loadingType !== null}
              onClick={handleAuto}
              className="mt-6 w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
            >
              {loadingType === 'auto' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <span>Auto-generate Password</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>

          {/* Option 2: Send Email */}
          <div className="flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-[var(--muted-bg)]/60 hover:bg-[var(--muted-bg)] border border-[var(--card-border)] hover:border-indigo-500/50 transition-all group">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                ✉️
              </div>
              <div>
                <h4 className="text-base sm:text-lg font-black text-[var(--foreground)]">Send Reset Email</h4>
                <p className="text-xs sm:text-sm text-[var(--muted)] mt-1.5 leading-relaxed">
                  Dispatch a secure invitation / reset link to <strong className="text-[var(--foreground)]">{user.email || 'the user'}</strong> valid for 24 hours.
                </p>
              </div>
              <div className="text-[11px] font-semibold text-indigo-400/90 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 inline-block">
                🔒 Secure 24hr single-use link
              </div>
            </div>

            <button
              type="button"
              disabled={loadingType !== null || !user.email}
              onClick={handleEmail}
              className="mt-6 w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/30 cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
            >
              {loadingType === 'email' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Sending Email...</span>
                </>
              ) : (
                <>
                  <span>Send Reset Email</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-[var(--card-border)]">
          <button
            type="button"
            disabled={loadingType !== null}
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[var(--muted-bg)] hover:bg-[var(--card-border)] text-[var(--foreground)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: ADD SUPER ADMIN MODAL
// ─────────────────────────────────────────────────────────────────────────────
function AddSuperAdminModal({ organisations = [], onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone_number: '',
    allOrgs: true,
    org_ids: organisations.map((o) => o.id),
  });

  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const toggleOrg = (orgId) => {
    setForm((p) => {
      const exists = p.org_ids.includes(orgId);
      const updated = exists ? p.org_ids.filter((id) => id !== orgId) : [...p.org_ids, orgId];
      return {
        ...p,
        org_ids: updated,
        allOrgs: updated.length === organisations.length && organisations.length > 0,
      };
    });
  };

  const handleToggleAll = () => {
    setForm((p) => {
      const nextAll = !p.allOrgs;
      return {
        ...p,
        allOrgs: nextAll,
        org_ids: nextAll ? organisations.map((o) => o.id) : [],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    setSubmitting(true);
    try {
      const { data } = await api.post('/superadmin/admins', {
        name: form.name.trim(),
        username: form.name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim(),
        org_ids: form.allOrgs ? 'all' : form.org_ids,
      });
      onSuccess(
        data.message || `SuperAdmin "${form.name}" invited successfully. An email has been sent for password setup.`
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create SuperAdmin');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col bg-[var(--card-bg)] border border-purple-500/40 rounded-3xl shadow-2xl shadow-purple-950/50 overflow-hidden animate-scaleUp">
        {/* Fixed Header */}
        <div className="p-6 sm:p-7 border-b border-[var(--card-border)] flex items-center justify-between bg-gradient-to-r from-purple-500/15 to-transparent flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <span className="w-11 h-11 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
              🛡️
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--foreground)]">Invite New SuperAdmin</h2>
              <p className="text-xs sm:text-sm text-[var(--muted)] mt-0.5">An activation email will be sent for password configuration</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] transition-colors text-lg cursor-pointer">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1">
            {error && (
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm font-semibold">
                ⚠️ {error}
              </div>
            )}

            {/* Info Banner */}
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs sm:text-sm text-purple-200 flex items-start gap-3">
              <span className="text-lg flex-shrink-0">✉️</span>
              <span className="leading-relaxed">
                Upon submission, the new SuperAdmin will receive an enterprise invitation email with a secure link to configure their password.
              </span>
            </div>

            {/* SuperAdmin Name */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Super Admin Name *
              </label>
              <input
                required
                type="text"
                placeholder="e.g. John Doe / security_lead"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Email Address *
              </label>
              <input
                required
                type="email"
                placeholder="superadmin@ciso.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={form.phone_number}
                onChange={(e) => setForm((p) => ({ ...p, phone_number: e.target.value }))}
                className="w-full px-4 py-3 sm:py-3.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>

            {/* Organisation Access (Multi-Select Dropdown) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase">
                  Organisation Access *
                </label>
                <button
                  type="button"
                  onClick={handleToggleAll}
                  className="text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                >
                  {form.allOrgs ? '✓ All Organisations (Overall)' : 'Select All Organisations'}
                </button>
              </div>

              {/* Custom Multi-Select Dropdown Trigger */}
              <div>
                <div
                  onClick={() => setOrgDropdownOpen((p) => !p)}
                  className="w-full min-h-[50px] px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] hover:border-purple-500/50 rounded-xl text-sm sm:text-base text-[var(--foreground)] flex items-center justify-between gap-2 cursor-pointer transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                    {form.allOrgs ? (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
                        <span>🌐</span>
                        <span>Overall Access (All {organisations.length} Organisations)</span>
                      </span>
                    ) : form.org_ids.length === 0 ? (
                      <span className="text-[var(--muted)] text-sm">Select one or more organisations...</span>
                    ) : (
                      form.org_ids.map((id) => {
                        const org = organisations.find((o) => o.id === id);
                        return (
                          <span
                            key={id}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1"
                          >
                            <span>{org?.org_name || `Org #${id}`}</span>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleOrg(id);
                              }}
                              className="hover:text-rose-300 ml-1 cursor-pointer font-black"
                            >
                              ✕
                            </span>
                          </span>
                        );
                      })
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 text-[var(--muted)]">
                    <span className="text-xs font-semibold">
                      {form.allOrgs ? 'All' : `${form.org_ids.length}/${organisations.length}`}
                    </span>
                    <svg
                      className={`w-4 h-4 transition-transform ${orgDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Inline Expandable Organisation Selection Menu */}
                {orgDropdownOpen && (
                  <div className="mt-2 bg-[#121420] border border-purple-500/30 rounded-2xl p-3.5 space-y-2.5 shadow-xl animate-fadeIn">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--card-border)] text-xs text-[var(--muted)]">
                      <span>Select organisations to grant access:</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setForm((p) => ({ ...p, allOrgs: true, org_ids: organisations.map((o) => o.id) }));
                          }}
                          className="text-purple-400 hover:text-purple-300 font-bold cursor-pointer transition-colors"
                        >
                          All
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => {
                            setForm((p) => ({ ...p, allOrgs: false, org_ids: [] }));
                          }}
                          className="text-rose-400 hover:text-rose-300 font-bold cursor-pointer transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {organisations.length === 0 ? (
                      <div className="p-3 text-center text-xs text-[var(--muted)]">No organisations available.</div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                        {organisations.map((o) => {
                          const isSelected = form.allOrgs || form.org_ids.includes(o.id);
                          return (
                            <div
                              key={o.id}
                              onClick={() => toggleOrg(o.id)}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-purple-500/20 text-purple-200 font-bold border border-purple-500/30'
                                  : 'hover:bg-[var(--muted-bg)] text-[var(--foreground)] border border-transparent'
                              }`}
                            >
                              <span className="truncate">{o.org_name}</span>
                              <span className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] ${
                                isSelected ? 'bg-purple-600 border-purple-600 text-white font-bold' : 'border-[var(--card-border)]'
                              }`}>
                                {isSelected ? '✓' : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-[var(--muted)]">
                {form.allOrgs
                  ? '🌐 This SuperAdmin will have full overall access to all current and future organisations.'
                  : `Granted access to ${form.org_ids.length} specific organisation(s).`}
              </p>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="p-5 sm:p-6 border-t border-[var(--card-border)] bg-[var(--card-bg)] flex items-center justify-end gap-3.5 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl text-sm font-bold bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 rounded-xl text-sm sm:text-base font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/30 disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting ? 'Sending Invite...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: ADMIN PASSWORD CONFIRMATION MODAL (TOGGLE/DELETE)
// ─────────────────────────────────────────────────────────────────────────────
function AdminPasswordConfirmModal({ target, onClose, onSuccess }) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const isDelete = target.type === 'delete';

  const handleAuthorize = async () => {
    if (!password) {
      setError('Please enter your password to authorize this operation');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (isDelete) {
        await api.delete(`/superadmin/admins/${target.admin.id}`, {
          data: { confirmPassword: password },
        });
        onSuccess(`SuperAdmin "${target.admin.username}" deleted`);
      } else {
        await api.patch(`/superadmin/admins/${target.admin.id}/status`, {
          is_active: target.nextActive,
          confirmPassword: password,
        });
        onSuccess(`SuperAdmin "${target.admin.username}" ${target.nextActive ? 'activated' : 'deactivated'}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Authorization failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[var(--card-bg)] border border-purple-500/40 rounded-3xl p-7 space-y-5 shadow-2xl animate-scaleUp">
        <div className="w-14 h-14 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-3xl shadow-sm">
          🔐
        </div>
        <div>
          <h3 className="text-xl font-bold text-[var(--foreground)]">
            {isDelete ? 'Delete SuperAdmin' : `${target.nextActive ? 'Activate' : 'Deactivate'} SuperAdmin`}
          </h3>
          <p className="text-sm text-[var(--muted)] mt-1.5">
            Target account: <strong className="text-[var(--foreground)]">{target.admin.username}</strong>
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm font-semibold">
            ⚠️ {error}
          </div>
        )}

        <div className="space-y-2.5">
          <label className="block text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase">
            Enter your SuperAdmin password to authorize:
          </label>
          <input
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm sm:text-base text-[var(--foreground)] focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3.5 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-xl text-sm font-bold bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!password || submitting}
            onClick={handleAuthorize}
            className={`px-6 py-3 rounded-xl text-sm font-bold text-white shadow-lg ${
              isDelete ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/30'
            } disabled:opacity-40 transition-all`}
          >
            {submitting ? 'Verifying...' : 'Authorize Action'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: ORGANISATION DETAILS POPUP MODAL (4 TABS, HEALTH, AUDIT)
// ─────────────────────────────────────────────────────────────────────────────
function OrgDetailsModal({ orgId, organisations = [], showToast, setTempPasswordResult, onClose, onEdit, onSync, onViewAllUsers }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('profile'); // 'profile' | 'users' | 'activity' | 'audit'
  const [showAddUserModal, setShowAddUserModal] = useState(false);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/superadmin/organisations/${orgId}/details`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load organisation details');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="w-full max-w-3xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-8 shadow-2xl">
          <WidgetSkeleton variant="table" height="h-96" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[var(--card-bg)] border border-rose-500/40 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-2xl">
            ⚠️
          </div>
          <h3 className="text-lg font-bold text-[var(--foreground)]">Failed to Load Details</h3>
          <p className="text-xs text-[var(--muted)]">{error}</p>
          <div className="flex gap-3 justify-center pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--muted-bg)] text-[var(--foreground)]">
              Close
            </button>
            <button onClick={fetchDetails} className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { organisation: org, users: userStats, activity, auditTrail } = data;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-5xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl shadow-2xl my-4 overflow-hidden animate-scaleUp flex flex-col max-h-[92vh]">
        {/* Header Ribbon */}
        <div className="p-6 sm:p-7 border-b border-[var(--card-border)] bg-gradient-to-r from-indigo-600/15 via-purple-600/10 to-transparent flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-black flex items-center justify-center text-2xl shadow-lg shadow-indigo-600/30 flex-shrink-0">
                {org.org_name?.[0]?.toUpperCase() || 'O'}
              </span>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-2xl sm:text-3xl font-black text-[var(--foreground)] tracking-tight">
                    {org.org_name}
                  </h2>
                  <StatusBadge
                    status={org.derived_status}
                    isExpiringSoon={org.is_expiring_soon}
                    daysRemaining={org.days_remaining}
                  />
                  <span className="px-3 py-1 rounded-xl text-xs sm:text-sm font-bold uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                    {org.plan}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[var(--muted)] font-mono mt-1">
                  Slug: /{org.slug} • ID: #{org.id}
                </p>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => onSync(org)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-600/30 cursor-pointer transition-all active:scale-98"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync & View
              </button>

              <button
                type="button"
                onClick={() => onEdit(org)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--muted-bg)] hover:bg-[var(--card-border)] text-[var(--foreground)] font-bold text-xs sm:text-sm border border-[var(--card-border)] transition-all cursor-pointer"
              >
                ✏️ Edit
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-xl bg-[var(--muted-bg)] hover:bg-[var(--card-border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] text-lg cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Expiration warning banner if applicable */}
          {org.is_expiring_soon && (
            <div className="mt-4 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs sm:text-sm font-semibold flex items-center gap-2.5">
              <span className="text-base">⚠️</span>
              <span>
                This organisation expires in <strong>{org.days_remaining} days</strong> on {formatDate(org.end_date)}.
              </span>
            </div>
          )}
        </div>

        {/* Sub-Tabs */}
        <div className="border-b border-[var(--card-border)] px-6 sm:px-8 flex items-center gap-6 bg-[var(--muted-bg)]/40 flex-shrink-0">
          {[
            { id: 'profile', label: 'Org Profile', icon: '🏢' },
            { id: 'users', label: 'Users & Admins', icon: '👥', count: userStats?.stats?.total_users },
            { id: 'activity', label: 'Integrations & Health', icon: '⚡' },
            { id: 'audit', label: 'Audit Trail', icon: '📜', count: auditTrail?.length },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 py-4 border-b-2 font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                tab === t.id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <span className="text-base">{t.icon}</span>
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--muted-bg)] text-[var(--foreground)] border border-[var(--card-border)]">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content Body */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6">
          {/* 1. PROFILE TAB */}
          {tab === 'profile' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: 'Industry', val: org.industry || '—' },
                  { label: 'Contact Email', val: org.email || '—' },
                  { label: 'Phone / Mobile', val: org.mobile_no || '—' },
                  { label: 'Start Date', val: formatDate(org.start_date) },
                  { label: 'End Date', val: formatDate(org.end_date) },
                  { label: 'Created By', val: org.created_by || 'system' },
                  { label: 'Created At', val: formatDateTime(org.created_at) },
                  { label: 'Last Updated', val: formatDateTime(org.updated_at) },
                  { label: 'Tenant Database', val: `ciso_tenant_${org.slug}` },
                ].map((item) => (
                  <div key={item.label} className="p-4 rounded-2xl bg-[var(--muted-bg)]/60 border border-[var(--card-border)]">
                    <span className="text-xs font-bold text-[var(--muted)] block uppercase tracking-wider">{item.label}</span>
                    <span className="text-sm sm:text-base font-bold text-[var(--foreground)] mt-1.5 block break-all">
                      {item.val}
                    </span>
                  </div>
                ))}
              </div>

              {org.address && (
                <div className="p-4 rounded-2xl bg-[var(--muted-bg)]/60 border border-[var(--card-border)]">
                  <span className="text-xs font-bold text-[var(--muted)] block uppercase tracking-wider">Address</span>
                  <span className="text-sm sm:text-base text-[var(--foreground)] mt-1.5 block">{org.address}</span>
                </div>
              )}

              {org.description && (
                <div className="p-4 rounded-2xl bg-[var(--muted-bg)]/60 border border-[var(--card-border)]">
                  <span className="text-xs font-bold text-[var(--muted)] block uppercase tracking-wider">Description</span>
                  <span className="text-sm sm:text-base text-[var(--foreground)] mt-1.5 block">{org.description}</span>
                </div>
              )}
            </div>
          )}

          {/* 2. USERS TAB */}
          {tab === 'users' && (
            <div className="space-y-5">
              {/* User KPI Counts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Users', val: userStats?.stats?.total_users || 0, color: 'text-indigo-400' },
                  { label: 'Active Users', val: userStats?.stats?.active_users || 0, color: 'text-emerald-400' },
                  { label: 'Inactive Users', val: userStats?.stats?.inactive_users || 0, color: 'text-zinc-400' },
                  { label: 'Org Admins', val: userStats?.stats?.admin_users || 0, color: 'text-purple-400' },
                ].map((st) => (
                  <div key={st.label} className="p-4 rounded-2xl bg-[var(--muted-bg)] border border-[var(--card-border)] text-center">
                    <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">{st.label}</span>
                    <span className={`text-2xl sm:text-3xl font-black block mt-1.5 ${st.color}`}>{st.val}</span>
                  </div>
                ))}
              </div>

              {/* Latest 5 Users Table */}
              <div className="rounded-2xl border border-[var(--card-border)] overflow-hidden">
                <div className="p-4 bg-[var(--muted-bg)] border-b border-[var(--card-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs sm:text-sm font-bold text-[var(--foreground)] uppercase tracking-wider">Recent Users</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-bold border border-indigo-500/30">
                      {userStats?.stats?.total_users || 0} Total
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAddUserModal(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-600/30 cursor-pointer transition-all active:scale-95"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Add User</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onViewAllUsers(org.id)}
                      className="text-xs sm:text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                    >
                      View all in Users Tab →
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--muted-bg)]/40 text-[var(--muted)] border-b border-[var(--card-border)] text-xs font-bold uppercase">
                      <tr>
                        <th className="py-3.5 px-4">Username</th>
                        <th className="py-3.5 px-4">Email</th>
                        <th className="py-3.5 px-4">Role</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Last Login</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--card-border)]">
                      {(userStats?.latest || []).map((u) => (
                        <tr key={u.id} className="hover:bg-indigo-500/5 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-[var(--foreground)]">{u.username}</td>
                          <td className="py-3.5 px-4 text-[var(--muted)]">{u.email || '—'}</td>
                          <td className="py-3.5 px-4 capitalize text-indigo-400 font-semibold">{u.role}</td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${u.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-[var(--muted)]">{formatDateTime(u.last_login_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 3. INTEGRATIONS & ACTIVITY TAB */}
          {tab === 'activity' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(activity?.integrations || []).map((integ) => (
                  <div
                    key={integ.key}
                    className="p-5 rounded-2xl bg-[var(--muted-bg)]/60 border border-[var(--card-border)] flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${integ.connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                        <span className="font-bold text-base text-[var(--foreground)]">{integ.name}</span>
                      </div>
                      <span className="text-xs text-[var(--muted)] block mt-1.5">
                        Last sync: {formatDateTime(integ.lastSync)}
                      </span>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-xl text-xs font-bold ${
                        integ.connected
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}
                    >
                      {integ.status}
                    </span>
                  </div>
                ))}
              </div>

              {activity?.lastLogin && (
                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs sm:text-sm text-indigo-300 flex items-center justify-between">
                  <span>Last user activity in this organisation:</span>
                  <span className="font-bold">
                    {activity.lastLogin.username} on {formatDateTime(activity.lastLogin.login_time)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 4. AUDIT TRAIL TAB */}
          {tab === 'audit' && (
            <div className="space-y-3">
              {(!auditTrail || auditTrail.length === 0) ? (
                <div className="p-10 text-center text-[var(--muted)] text-sm">
                  No audit log entries recorded for this organisation yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {auditTrail.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 rounded-2xl bg-[var(--muted-bg)]/60 border border-[var(--card-border)] text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-indigo-400 uppercase tracking-wide text-xs">
                            {log.action.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-[var(--muted)] font-mono">by {log.actor}</span>
                        </div>
                        {log.details && (
                          <span className="text-xs text-[var(--foreground)] font-mono block truncate opacity-80">
                            {JSON.stringify(log.details)}
                          </span>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0 text-xs text-[var(--muted)] font-mono">
                        <div>{formatDateTime(log.created_at)}</div>
                        <div className="text-[11px] opacity-70">IP: {log.ip_address || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL: ADD USER (LOCKED TO THIS ORGANISATION) */}
        {showAddUserModal && (
          <UserFormModal
            lockedOrgId={org.id}
            organisations={organisations.length > 0 ? organisations : [org]}
            onClose={() => setShowAddUserModal(false)}
            onSuccess={(msg, tempPass) => {
              setShowAddUserModal(false);
              if (showToast) showToast(msg);
              if (tempPass && setTempPasswordResult) setTempPasswordResult(tempPass);
              fetchDetails();
            }}
          />
        )}
      </div>
    </div>
  );
}
