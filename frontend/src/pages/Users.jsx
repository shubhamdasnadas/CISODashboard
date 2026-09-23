import { useEffect, useState, useMemo } from 'react';
import * as session from '../utils/session.js';
import api from '../api';
import { PAGES } from '../constants/navPages.js';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

export default function Users() {
  const currentUser = session.getUser();
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', message: '' }

  // ── Modals State ─────────────────────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'member',
    org_ids: [],
    allowed_pages: null, // null = full access, array = custom
  });
  const [showAddPages, setShowAddPages] = useState(false);

  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'member',
    org_ids: [],
    allowed_pages: null,
  });
  const [showEditPages, setShowEditPages] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── Fetch Users & Organizations from Database ────────────────────────────────
  async function loadData() {
    setLoading(true);
    try {
      const [usersRes, orgsRes] = await Promise.all([
        api.get('/users'),
        api.get('/organisations'),
      ]);
      setUsers(usersRes.data?.users || []);
      setOrgs(orgsRes.data?.organisations || []);
    } catch (err) {
      console.error('[Users] Fetch error:', err);
      showNotice('error', err.response?.data?.error || err.response?.data?.message || 'Failed to load user data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function showNotice(type, message) {
    setNotice({ type, message });
    setTimeout(() => {
      setNotice((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleAddSubmit(e) {
    e.preventDefault();
    if (!addForm.username.trim() || !addForm.password) {
      showNotice('error', 'Username and Password are required');
      return;
    }
    setActionLoading(true);
    try {
      const payload = {
        username: addForm.username.trim(),
        email: addForm.email ? addForm.email.trim() : null,
        password: addForm.password,
        role: addForm.role,
        org_ids: addForm.org_ids,
        allowed_pages: showAddPages && Array.isArray(addForm.allowed_pages) && addForm.allowed_pages.length > 0
          ? addForm.allowed_pages
          : null,
      };

      const res = await api.post('/users', payload);
      showNotice('success', `User "${res.data?.user?.username || addForm.username}" created successfully`);
      setShowAddModal(false);
      setAddForm({
        username: '',
        email: '',
        password: '',
        role: 'member',
        org_ids: [],
        allowed_pages: null,
      });
      setShowAddPages(false);
      loadData();
    } catch (err) {
      console.error('[Users] Add error:', err);
      showNotice('error', err.response?.data?.error || err.response?.data?.message || 'Failed to create user');
    } finally {
      setActionLoading(false);
    }
  }

  function openEditModal(user) {
    setEditUser(user);
    const hasCustomPages = Array.isArray(user.allowed_pages) && user.allowed_pages.length > 0;
    setShowEditPages(hasCustomPages);
    setEditForm({
      username: user.username || '',
      email: user.email || '',
      password: '',
      role: user.role || 'member',
      org_ids: Array.isArray(user.org_ids) ? [...user.org_ids] : [],
      allowed_pages: hasCustomPages ? [...user.allowed_pages] : PAGES.map((p) => p.key),
    });
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editUser) return;
    if (!editForm.username.trim()) {
      showNotice('error', 'Username is required');
      return;
    }
    setActionLoading(true);
    try {
      const payload = {
        username: editForm.username.trim(),
        email: editForm.email ? editForm.email.trim() : null,
        role: editForm.role,
        org_ids: editForm.org_ids,
        allowed_pages: showEditPages && Array.isArray(editForm.allowed_pages) && editForm.allowed_pages.length > 0
          ? editForm.allowed_pages
          : null,
      };
      if (editForm.password && editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }

      await api.put(`/users/${editUser.id}`, payload);
      showNotice('success', `User "${editForm.username}" updated successfully`);
      setEditUser(null);
      loadData();
    } catch (err) {
      console.error('[Users] Update error:', err);
      showNotice('error', err.response?.data?.error || err.response?.data?.message || 'Failed to update user');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    if (currentUser?.userId === deleteTarget.id) {
      showNotice('error', 'You cannot delete your own active account');
      setDeleteTarget(null);
      return;
    }
    setActionLoading(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      showNotice('success', `User "${deleteTarget.username}" deleted successfully`);
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      console.error('[Users] Delete error:', err);
      showNotice('error', err.response?.data?.error || err.response?.data?.message || 'Failed to delete user');
    } finally {
      setActionLoading(false);
    }
  }

  // ── Organization Toggle Helpers ──────────────────────────────────────────────
  function toggleOrgInForm(id, isEdit = false) {
    const targetState = isEdit ? editForm : addForm;
    const setTargetState = isEdit ? setEditForm : setAddForm;
    const exists = targetState.org_ids.includes(id);
    const updated = exists
      ? targetState.org_ids.filter((x) => x !== id)
      : [...targetState.org_ids, id];
    setTargetState({ ...targetState, org_ids: updated });
  }

  function togglePageInForm(pageKey, isEdit = false) {
    const targetState = isEdit ? editForm : addForm;
    const setTargetState = isEdit ? setEditForm : setAddForm;
    const currentList = Array.isArray(targetState.allowed_pages) ? targetState.allowed_pages : [];
    const exists = currentList.includes(pageKey);
    const updated = exists
      ? currentList.filter((k) => k !== pageKey)
      : [...currentList, pageKey];
    setTargetState({ ...targetState, allowed_pages: updated });
  }

  // ── Filtered Users Calculation ───────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        String(u.id).includes(q) ||
        (u.organisations && u.organisations.some((o) => o.org_name?.toLowerCase().includes(q)));

      const matchRole = roleFilter === 'all' || u.role === roleFilter;

      const matchOrg =
        orgFilter === 'all' ||
        (Array.isArray(u.org_ids) && u.org_ids.includes(parseInt(orgFilter, 10)));

      return matchSearch && matchRole && matchOrg;
    });
  }, [users, search, roleFilter, orgFilter]);

  // ── Quick Summary Metrics ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = users.length;
    const superAdmins = users.filter((u) => u.role === 'superAdmin').length;
    const admins = users.filter((u) => u.role === 'admin').length;
    const members = users.filter((u) => u.role === 'member').length;
    const assignedOrgsCount = new Set(users.flatMap((u) => u.org_ids || [])).size;
    return { total, superAdmins, admins, members, assignedOrgsCount };
  }, [users]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-7 rounded-full bg-gradient-to-b from-indigo-500 to-purple-600 shadow-sm" />
            <h1 className="text-2xl font-black tracking-tight text-[var(--foreground)] flex items-center gap-2.5">
              User Management
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                SuperAdmin
              </span>
            </h1>
          </div>
          <p className="text-sm text-[var(--muted)] mt-1 ml-5">
            Manage system users, authentication identities, role permissions, and organization access.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
            title="Refresh database"
          >
            <svg
              className={`w-4 h-4 text-[var(--muted)] ${loading ? 'animate-spin text-indigo-500' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white shadow-sm transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add New User
          </button>
        </div>
      </div>

      {/* ── Notification Banner ──────────────────────────────────────────────── */}
      {notice && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl text-sm font-medium border transition-all animate-fadeIn ${
            notice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notice.type === 'success' ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span>{notice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs opacity-70 hover:opacity-100 font-bold px-2 py-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── KPI Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {[
          { label: 'Total Users', value: stats.total, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
          { label: 'SuperAdmins', value: stats.superAdmins, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
          { label: 'Admins', value: stats.admins, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
          { label: 'Members', value: stats.members, color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
          { label: 'Linked Orgs', value: stats.assignedOrgsCount, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`card-surface rounded-2xl p-4 border border-[var(--card-border)] flex items-center justify-between gap-3 shadow-sm`}
          >
            <div>
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">{kpi.label}</p>
              <p className="text-2xl font-black text-[var(--foreground)] mt-1">{loading ? '—' : kpi.value}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl ${kpi.bg} ${kpi.border} border flex items-center justify-center ${kpi.color} font-bold text-base flex-shrink-0`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Search and Filter Controls ───────────────────────────────────────── */}
      <div className="card-surface rounded-2xl p-4 border border-[var(--card-border)] flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="relative w-full md:w-80">
          <svg
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by username, email, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
          {/* Role Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-[var(--muted)]">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
            >
              <option value="all">All Roles ({users.length})</option>
              <option value="superAdmin">SuperAdmin</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
            </select>
          </div>

          {/* Org Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-[var(--muted)]">Organisation:</span>
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer max-w-[160px] truncate"
            >
              <option value="all">All Organisations</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.org_name}
                </option>
              ))}
            </select>
          </div>

          {(search || roleFilter !== 'all' || orgFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setRoleFilter('all');
                setOrgFilter('all');
              }}
              className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 px-2 py-1 cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Users Table ──────────────────────────────────────────────────────── */}
      <div className="card-surface rounded-2xl border border-[var(--card-border)] overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-6">
            <WidgetSkeleton variant="table" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 mx-auto flex items-center justify-center mb-3">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-[var(--foreground)]">No users found</h3>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-sm mx-auto">
              {search || roleFilter !== 'all' || orgFilter !== 'all'
                ? 'No user matches your current search criteria. Try resetting the filters.'
                : 'Get started by creating your first system user.'}
            </p>
            {(search || roleFilter !== 'all' || orgFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setRoleFilter('all');
                  setOrgFilter('all');
                }}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--card-border)] bg-[var(--muted-bg)]/40 text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Assigned Organisations</th>
                  <th className="py-3 px-4">Page Permissions</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)] text-sm">
                {filteredUsers.map((u) => {
                  const isCurrent = currentUser?.userId === u.id;
                  const customPagesCount = Array.isArray(u.allowed_pages) ? u.allowed_pages.length : null;

                  return (
                    <tr key={u.id} className="hover:bg-[var(--muted-bg)]/30 transition-colors">
                      {/* User Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-500 font-bold text-xs uppercase flex-shrink-0">
                            {u.username ? u.username.slice(0, 2) : 'U'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[var(--foreground)]">{u.username}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--muted-bg)] text-[var(--muted)] border border-[var(--card-border)]">
                                ID: {u.id}
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                  You
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--muted)] mt-0.5">
                              {u.email ? u.email : <span className="italic opacity-60">No email assigned</span>}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold capitalize border ${
                            u.role === 'superAdmin'
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                              : u.role === 'admin'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              u.role === 'superAdmin'
                                ? 'bg-purple-400'
                                : u.role === 'admin'
                                ? 'bg-emerald-400'
                                : 'bg-sky-400'
                            }`}
                          />
                          {u.role === 'superAdmin' ? 'Super Admin' : u.role}
                        </span>
                      </td>

                      {/* Organisations */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {u.organisations && u.organisations.length > 0 ? (
                            u.organisations.map((o) => (
                              <span
                                key={o.id}
                                className="text-xs px-2.5 py-0.5 rounded-lg bg-[var(--muted-bg)] text-[var(--foreground)] border border-[var(--card-border)] font-medium"
                              >
                                {o.org_name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[var(--muted)] italic">No organisations assigned</span>
                          )}
                        </div>
                      </td>

                      {/* Page Permissions */}
                      <td className="py-3.5 px-4">
                        {customPagesCount === null ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Full Access (All Pages)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-lg">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Custom ({customPagesCount} / {PAGES.length} pages)
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="p-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
                            title="Edit user details & permissions"
                          >
                            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteTarget(u)}
                            disabled={isCurrent}
                            className={`p-1.5 rounded-lg border border-[var(--card-border)] transition-colors ${
                              isCurrent
                                ? 'opacity-40 cursor-not-allowed bg-[var(--muted-bg)]'
                                : 'bg-[var(--card-bg)] text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/30 cursor-pointer'
                            }`}
                            title={isCurrent ? 'You cannot delete your own active account' : 'Delete user account'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
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

      {/* ── Add User Modal ───────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-full max-w-lg p-6 sm:p-7 my-8 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute top-5 right-5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
            >
              ✕
            </button>

            <h2 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
              <span>👤</span> Add New System User
            </h2>
            <p className="text-xs text-[var(--muted)] mt-1 mb-5">
              Create an authentication account and link access to organisations.
            </p>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  Username <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. jdoe"
                  value={addForm.username}
                  onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  Email Address <span className="text-rose-500">*</span>
                  <span className="text-[10px] text-[var(--muted)] font-normal ml-1">(Used for OTP Login & notifications)</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. john.doe@example.com"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  System Role <span className="text-rose-500">*</span>
                </label>
                <select
                  value={addForm.role}
                  onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="member">Member (Regular Organization User)</option>
                  <option value="admin">Admin (Organization Administrator)</option>
                  <option value="superAdmin">SuperAdmin (Full Platform Administrator)</option>
                </select>
              </div>

              {/* Organisation Selection */}
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">
                  Assign Organisations ({addForm.org_ids.length} selected)
                </label>
                {orgs.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] italic">No organisations available in database.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-[var(--muted-bg)]/50 border border-[var(--card-border)] rounded-xl">
                    {orgs.map((o) => {
                      const isSelected = addForm.org_ids.includes(o.id);
                      return (
                        <button
                          type="button"
                          key={o.id}
                          onClick={() => toggleOrgInForm(o.id, false)}
                          className={`text-xs px-3 py-1 rounded-full border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-semibold'
                              : 'bg-[var(--card-bg)] text-[var(--muted)] border-[var(--card-border)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {o.org_name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Page Access Selector */}
              <div className="pt-2 border-t border-[var(--card-border)]">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    Page Permissions
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showAddPages;
                      setShowAddPages(next);
                      if (next && !addForm.allowed_pages) {
                        setAddForm({ ...addForm, allowed_pages: PAGES.map((p) => p.key) });
                      }
                    }}
                    className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 cursor-pointer"
                  >
                    {showAddPages ? 'Switch to Full Access' : 'Customize Page Access'}
                  </button>
                </div>

                {!showAddPages ? (
                  <p className="text-xs text-[var(--muted)] bg-[var(--muted-bg)]/40 p-2.5 rounded-xl border border-[var(--card-border)]">
                    ✓ User will have full access to all dashboard pages and modules.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                      <span>Select allowed pages:</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setAddForm({ ...addForm, allowed_pages: PAGES.map((p) => p.key) })}
                          className="hover:underline text-indigo-500 cursor-pointer"
                        >
                          Select All
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => setAddForm({ ...addForm, allowed_pages: [] })}
                          className="hover:underline text-rose-500 cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2 bg-[var(--muted-bg)]/50 border border-[var(--card-border)] rounded-xl">
                      {PAGES.map((p) => {
                        const checked = Array.isArray(addForm.allowed_pages) && addForm.allowed_pages.includes(p.key);
                        return (
                          <label
                            key={p.key}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                              checked ? 'bg-indigo-500/15 text-indigo-400 font-semibold' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePageInForm(p.key, false)}
                              className="rounded accent-indigo-600"
                            />
                            <span className="truncate">{p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition-all cursor-pointer flex items-center gap-2"
                >
                  {actionLoading ? 'Creating User…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ──────────────────────────────────────────────────── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-full max-w-lg p-6 sm:p-7 my-8 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setEditUser(null)}
              className="absolute top-5 right-5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
            >
              ✕
            </button>

            <h2 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
              <span>✏️</span> Edit User: {editUser.username}
            </h2>
            <p className="text-xs text-[var(--muted)] mt-1 mb-5">
              Update authentication credentials, role permissions, and organization access.
            </p>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  Username <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  Email Address
                  <span className="text-[10px] text-[var(--muted)] font-normal ml-1">(Used for OTP Login & notifications)</span>
                </label>
                <input
                  type="email"
                  placeholder="e.g. user@example.com"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  Reset Password
                  <span className="text-[10px] text-[var(--muted)] font-normal ml-1">(Leave blank to keep existing password)</span>
                </label>
                <input
                  type="password"
                  placeholder="Enter new password if changing"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  System Role
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="member">Member (Regular Organization User)</option>
                  <option value="admin">Admin (Organization Administrator)</option>
                  <option value="superAdmin">SuperAdmin (Full Platform Administrator)</option>
                </select>
              </div>

              {/* Organisation Selection */}
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">
                  Assigned Organisations ({editForm.org_ids.length} selected)
                </label>
                {orgs.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] italic">No organisations available.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-[var(--muted-bg)]/50 border border-[var(--card-border)] rounded-xl">
                    {orgs.map((o) => {
                      const isSelected = editForm.org_ids.includes(o.id);
                      return (
                        <button
                          type="button"
                          key={o.id}
                          onClick={() => toggleOrgInForm(o.id, true)}
                          className={`text-xs px-3 py-1 rounded-full border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-semibold'
                              : 'bg-[var(--card-bg)] text-[var(--muted)] border-[var(--card-border)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {o.org_name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Page Access Selector */}
              <div className="pt-2 border-t border-[var(--card-border)]">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    Page Permissions
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showEditPages;
                      setShowEditPages(next);
                      if (next && !editForm.allowed_pages) {
                        setEditForm({ ...editForm, allowed_pages: PAGES.map((p) => p.key) });
                      }
                    }}
                    className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 cursor-pointer"
                  >
                    {showEditPages ? 'Switch to Full Access' : 'Customize Page Access'}
                  </button>
                </div>

                {!showEditPages ? (
                  <p className="text-xs text-[var(--muted)] bg-[var(--muted-bg)]/40 p-2.5 rounded-xl border border-[var(--card-border)]">
                    ✓ User has full access to all dashboard pages and modules.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                      <span>Select allowed pages:</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, allowed_pages: PAGES.map((p) => p.key) })}
                          className="hover:underline text-indigo-500 cursor-pointer"
                        >
                          Select All
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, allowed_pages: [] })}
                          className="hover:underline text-rose-500 cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2 bg-[var(--muted-bg)]/50 border border-[var(--card-border)] rounded-xl">
                      {PAGES.map((p) => {
                        const checked = Array.isArray(editForm.allowed_pages) && editForm.allowed_pages.includes(p.key);
                        return (
                          <label
                            key={p.key}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                              checked ? 'bg-indigo-500/15 text-indigo-400 font-semibold' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePageInForm(p.key, true)}
                              className="rounded accent-indigo-600"
                            />
                            <span className="truncate">{p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition-all cursor-pointer flex items-center gap-2"
                >
                  {actionLoading ? 'Saving Changes…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ──────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-7">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="text-lg font-bold text-[var(--foreground)]">Delete User Account?</h3>
            <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
              Are you sure you want to delete user <strong className="text-[var(--foreground)]">{deleteTarget.username}</strong>
              {deleteTarget.email ? ` (${deleteTarget.email})` : ''}? This action cannot be undone and will remove all their active authentication tokens and organization memberships.
            </p>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white shadow-sm transition-all cursor-pointer flex items-center gap-2"
              >
                {actionLoading ? 'Deleting…' : 'Yes, Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
