import * as session from '../utils/session.js';
import { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useOrg } from '../context/OrgContext.jsx';
import { PAGES as ALL_PAGES } from '../constants/navPages.js';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-xl font-bold text-[var(--foreground)] mb-1">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--muted)] mb-5">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function inputCls() {
  return 'w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs sm:text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500';
}

function labelCls() {
  return 'block text-xs font-semibold text-[var(--foreground)] mb-1.5';
}

export default function Members() {
  const { currentOrg } = useOrg();
  const user = session.getUser();
  const isSuperAdmin = user.role === 'superAdmin';
  const canManage = isSuperAdmin || user.role === 'admin' || user.role === 'org_admin';

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  // ── Add modal ──────────────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'member',
    department: '',
    allowed_pages: null,
  });
  const [showAddPages, setShowAddPages] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // ── Edit modal ─────────────────────────────────────────────────────────────
  const [editMember, setEditMember] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'member',
    department: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // ── Page access modal ──────────────────────────────────────────────────────
  const [pageAccessMember, setPageAccessMember] = useState(null);
  const [pageSelections, setPageSelections] = useState([]);
  const [pageSaving, setPageSaving] = useState(false);

  // ── Remove confirm ─────────────────────────────────────────────────────────
  const [removeMember, setRemoveMember] = useState(null);
  const [removing, setRemoving] = useState(false);

  // ── Add to org (superAdmin) ────────────────────────────────────────────────
  const [addToOrgMember, setAddToOrgMember] = useState(null);
  const [allOrgs, setAllOrgs] = useState([]);
  const [addToOrgForm, setAddToOrgForm] = useState({ targetOrgId: '', role: 'member', department: '' });
  const [addToOrgSaving, setAddToOrgSaving] = useState(false);
  const [addToOrgError, setAddToOrgError] = useState('');
  const [addToOrgSuccess, setAddToOrgSuccess] = useState('');

  const orgName = currentOrg?.org_name || 'Organization';

  const loadMembers = async (orgId) => {
    setLoading(true);
    setError('');
    try {
      const r = await api.get('/member/members', { headers: { 'X-Org-Id': String(orgId) } });
      setMembers(r.data.members || []);
    } catch (e) {
      const msg = e.response?.data?.message || 'Failed to load members';
      console.error('[Members] loadMembers error:', e.response?.status, msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentOrg?.id) {
      loadMembers(currentOrg.id);
    } else {
      setLoading(false);
    }
  }, [currentOrg?.id]);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.password) {
      setAddError('Name, Email and Password are required');
      return;
    }
    setAddError('');
    setAdding(true);
    try {
      await api.post('/member/members', {
        name: addForm.name.trim(),
        email: addForm.email.trim(),
        password: addForm.password,
        role: addForm.role,
        department: addForm.department ? addForm.department.trim() : '',
        allowed_pages: showAddPages && Array.isArray(addForm.allowed_pages) && addForm.allowed_pages.length > 0
          ? addForm.allowed_pages
          : null,
      });
      setAddForm({ name: '', email: '', password: '', role: 'member', department: '', allowed_pages: null });
      setShowAddPages(false);
      setShowAdd(false);
      loadMembers(currentOrg?.id);
    } catch (e) {
      setAddError(e.response?.data?.message || 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (m) => {
    const nextStatus = !m.is_active;
    setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_active: nextStatus } : x)));
    try {
      await api.put(`/member/members/${m.id}`, { is_active: nextStatus, user_type: m.user_type });
    } catch {
      loadMembers(currentOrg?.id);
    }
  };

  const openEdit = (m) => {
    setEditMember(m);
    setEditForm({
      name: m.name,
      email: m.email || '',
      password: '',
      role: m.role === 'org_admin' || m.role === 'admin' ? 'admin' : 'member',
      department: m.department || '',
    });
    setEditError('');
    setOpenMenuId(null);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editMember) return;
    if (!editForm.name.trim()) {
      setEditError('Name is required');
      return;
    }
    setEditError('');
    setEditSaving(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email ? editForm.email.trim() : '',
        role: editForm.role,
        department: editForm.department ? editForm.department.trim() : '',
        user_type: editMember.user_type,
      };
      if (editForm.password && editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }

      await api.put(`/member/members/${editMember.id}`, payload);
      loadMembers(currentOrg?.id);
      setEditMember(null);
    } catch (e) {
      setEditError(e.response?.data?.message || 'Failed to update member');
    } finally {
      setEditSaving(false);
    }
  };

  const openPageAccess = (m) => {
    setPageAccessMember(m);
    const pages = m.allowed_pages;
    setPageSelections(Array.isArray(pages) ? pages : ALL_PAGES.map((p) => p.key));
    setOpenMenuId(null);
  };

  const handlePageAccess = async () => {
    if (!pageAccessMember) return;
    setPageSaving(true);
    try {
      await api.put(`/member/members/${pageAccessMember.id}`, {
        allowed_pages: pageSelections,
        user_type: pageAccessMember.user_type || 'system_user',
      });
      loadMembers(currentOrg?.id);
      setPageAccessMember(null);
    } finally {
      setPageSaving(false);
    }
  };

  const togglePage = (key) => {
    setPageSelections((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const openRemove = (m) => {
    setRemoveMember(m);
    setOpenMenuId(null);
  };

  const handleRemove = async () => {
    if (!removeMember) return;
    setRemoving(true);
    try {
      await api.delete(`/member/members/${removeMember.id}?user_type=${removeMember.user_type || 'system_user'}`);
      setRemoveMember(null);
      loadMembers(currentOrg?.id);
    } finally {
      setRemoving(false);
    }
  };

  const openAddToOrg = async (m) => {
    setAddToOrgError('');
    setAddToOrgSuccess('');
    setAddToOrgForm({ targetOrgId: '', role: 'member', department: m.department || '' });
    setOpenMenuId(null);
    try {
      const r = await api.get('/admin/organizations');
      const orgs = (r.data.organizations || []).filter((o) => o.id !== currentOrg?.id && o.is_active !== false);
      setAllOrgs(orgs);
      if (orgs.length > 0) setAddToOrgForm((f) => ({ ...f, targetOrgId: String(orgs[0].id) }));
    } catch {
      setAllOrgs([]);
    }
    setAddToOrgMember(m);
  };

  const handleAddToOrg = async (e) => {
    e.preventDefault();
    if (!addToOrgMember) return;
    setAddToOrgError('');
    setAddToOrgSaving(true);
    try {
      await api.post('/admin/org-users', {
        org_id: parseInt(addToOrgForm.targetOrgId, 10),
        name: addToOrgMember.name,
        email: addToOrgMember.email,
        role: addToOrgForm.role,
        department: addToOrgForm.department || addToOrgMember.department,
      });
      const targetOrg = allOrgs.find((o) => String(o.id) === addToOrgForm.targetOrgId);
      setAddToOrgSuccess(`${addToOrgMember.name} has been added to ${targetOrg?.org_name ?? 'the selected org'}.`);
    } catch (e) {
      setAddToOrgError(e.response?.data?.message || 'Failed to add member to org');
    } finally {
      setAddToOrgSaving(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = members.filter(
    (m) =>
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()) ||
      m.department?.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = members.filter((m) => m.is_active !== false).length;
  const adminCount = members.filter((m) => m.role === 'org_admin' || m.role === 'admin').length;

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-surface border border-[var(--card-border)] rounded-2xl p-4 shadow-sm">
              <div className="h-3 w-1/3 bg-[var(--muted-bg)] rounded animate-pulse mb-3" />
              <div className="h-8 w-1/3 bg-[var(--muted-bg)] rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="card-surface border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm p-6">
          <WidgetSkeleton variant="table" />
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-7 rounded-full bg-gradient-to-b from-indigo-500 to-purple-600 shadow-sm" />
            <h1 className="text-2xl font-black text-[var(--foreground)] tracking-tight">Members</h1>
          </div>
          <p className="text-sm text-[var(--muted)] mt-1 ml-5">{orgName}</p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setAddError('');
              setShowAdd(true);
            }}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-indigo-700 active:scale-98 shadow-sm transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Member
          </button>
        )}
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-xl p-4 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Members', value: members.length, color: 'text-indigo-500' },
          { label: 'Active', value: activeCount, color: 'text-emerald-500' },
          { label: 'Admins', value: adminCount, color: 'text-purple-500' },
        ].map((s) => (
          <div key={s.label} className="card-surface border border-[var(--card-border)] rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or department…"
          className="w-full pl-10 pr-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-xs sm:text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card-surface border border-[var(--card-border)] rounded-2xl p-16 text-center shadow-sm">
          <div className="w-14 h-14 bg-indigo-500/10 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-[var(--foreground)] mb-1">
            {search ? 'No members found' : 'No members yet'}
          </h3>
          <p className="text-[var(--muted)] text-xs max-w-sm mx-auto">
            {search ? 'Try a different search term or clear the filter.' : 'Add the first member to get started.'}
          </p>
        </div>
      ) : (
        <div className="card-surface border border-[var(--card-border)] rounded-2xl overflow-visible shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--muted-bg)]/50 border-b border-[var(--card-border)]">
              <tr>
                <th className="px-6 py-3.5 text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Member</th>
                <th className="px-6 py-3.5 text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Role</th>
                <th className="px-6 py-3.5 text-xs font-bold text-[var(--muted)] uppercase tracking-wider hidden md:table-cell">
                  Department
                </th>
                <th className="px-6 py-3.5 text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Status</th>
                <th className="px-6 py-3.5 text-xs font-bold text-[var(--muted)] uppercase tracking-wider hidden lg:table-cell">
                  Joined
                </th>
                {canManage && <th className="px-6 py-3.5 text-right font-bold text-xs text-[var(--muted)]">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)] text-sm">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-[var(--muted-bg)]/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-indigo-500/15 border border-indigo-500/30 rounded-xl flex items-center justify-center text-xs font-bold text-indigo-400 flex-shrink-0 uppercase">
                        {m.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[var(--foreground)]">{m.name}</p>
                        <p className="text-xs text-[var(--muted)]">{m.email || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        m.role === 'org_admin' || m.role === 'admin'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                          : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          m.role === 'org_admin' || m.role === 'admin' ? 'bg-purple-400' : 'bg-sky-400'
                        }`}
                      />
                      {m.role === 'org_admin' || m.role === 'admin' ? 'Admin' : 'Member'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-[var(--muted)] hidden md:table-cell">
                    {m.department || '—'}
                  </td>
                  <td className="px-6 py-4">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => toggleActive(m)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                          m.is_active !== false ? 'bg-emerald-500' : 'bg-zinc-600'
                        }`}
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform"
                          style={{ transform: m.is_active !== false ? 'translateX(18px)' : 'translateX(2px)' }}
                        />
                      </button>
                    ) : (
                      <span
                        className={`text-xs font-bold ${
                          m.is_active !== false ? 'text-emerald-500' : 'text-[var(--muted)]'
                        }`}
                      >
                        {m.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-[var(--muted)] hidden lg:table-cell">
                    {m.created_at
                      ? new Date(m.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                  {canManage && (
                    <td className="px-6 py-4 text-right">
                      <div className="relative inline-block" ref={openMenuId === m.id ? menuRef : undefined}>
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                          className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1.5 rounded-lg hover:bg-[var(--muted-bg)] border border-transparent hover:border-[var(--card-border)] cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </button>
                        {openMenuId === m.id && (
                          <div className="absolute right-0 top-8 z-50 w-48 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl py-1 text-xs font-semibold animate-fadeIn">
                            <button
                              type="button"
                              onClick={() => openEdit(m)}
                              className="w-full text-left px-4 py-2 text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
                            >
                              ✏️ Edit Member
                            </button>
                            <button
                              type="button"
                              onClick={() => openPageAccess(m)}
                              className="w-full text-left px-4 py-2 text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
                            >
                              🔒 Manage Page Access
                            </button>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => openAddToOrg(m)}
                                className="w-full text-left px-4 py-2 text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
                              >
                                🏢 Add to Another Org
                              </button>
                            )}
                            <div className="border-t border-[var(--card-border)] my-1" />
                            <button
                              type="button"
                              onClick={() => openRemove(m)}
                              className="w-full text-left px-4 py-2 text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            >
                              🗑️ Remove from Org
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Member Modal ────────────────────────────────────────────────── */}
      {showAdd && (
        <Modal title="Add Member" subtitle={`Add a new member to ${orgName}`} onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={labelCls()}>
                Full Name / Username <span className="text-rose-500">*</span>
              </label>
              <input
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                required
                placeholder="e.g. John Doe"
                className={inputCls()}
              />
            </div>
            <div>
              <label className={labelCls()}>
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                required
                placeholder="e.g. john@company.com"
                className={inputCls()}
              />
            </div>
            <div>
              <label className={labelCls()}>
                Password <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))}
                required
                placeholder="••••••••"
                className={inputCls()}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls()}>Role</label>
                <select
                  value={addForm.role}
                  onChange={(e) => setAddForm((p) => ({ ...p, role: e.target.value }))}
                  className={inputCls()}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className={labelCls()}>Department</label>
                <input
                  value={addForm.department}
                  onChange={(e) => setAddForm((p) => ({ ...p, department: e.target.value }))}
                  placeholder="e.g. Security"
                  className={inputCls()}
                />
              </div>
            </div>

            {/* Page Access Selection */}
            <div className="pt-2 border-t border-[var(--card-border)]">
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls()}>Page Permissions</label>
                <button
                  type="button"
                  onClick={() => {
                    const next = !showAddPages;
                    setShowAddPages(next);
                    if (next && !addForm.allowed_pages) {
                      setAddForm((p) => ({ ...p, allowed_pages: ALL_PAGES.map((pg) => pg.key) }));
                    }
                  }}
                  className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 cursor-pointer"
                >
                  {showAddPages ? 'Full Access' : 'Customize Pages'}
                </button>
              </div>
              {showAddPages && (
                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-2 bg-[var(--muted-bg)]/40 border border-[var(--card-border)] rounded-xl">
                  {ALL_PAGES.map((p) => {
                    const checked = Array.isArray(addForm.allowed_pages) && addForm.allowed_pages.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer select-none ${
                          checked ? 'text-indigo-400 font-semibold' : 'text-[var(--muted)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const list = Array.isArray(addForm.allowed_pages) ? addForm.allowed_pages : [];
                            const updated = list.includes(p.key) ? list.filter((k) => k !== p.key) : [...list, p.key];
                            setAddForm((prev) => ({ ...prev, allowed_pages: updated }));
                          }}
                          className="rounded accent-indigo-600"
                        />
                        <span className="truncate">{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {addError && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 px-4 py-2.5 rounded-xl text-xs font-medium">
                {addError}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 border border-[var(--card-border)] rounded-xl text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adding}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {adding ? 'Adding…' : 'Add Member'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Edit Member Modal ───────────────────────────────────────────────── */}
      {editMember && (
        <Modal title="Edit Member" subtitle={editMember.email || editMember.name} onClose={() => setEditMember(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <label className={labelCls()}>
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                required
                className={inputCls()}
              />
            </div>
            <div>
              <label className={labelCls()}>Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="john@company.com"
                className={inputCls()}
              />
            </div>
            <div>
              <label className={labelCls()}>
                Reset Password <span className="text-[10px] text-[var(--muted)] font-normal">(Leave blank to keep current)</span>
              </label>
              <input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="New password"
                className={inputCls()}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls()}>Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                  className={inputCls()}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className={labelCls()}>Department</label>
                <input
                  value={editForm.department}
                  onChange={(e) => setEditForm((p) => ({ ...p, department: e.target.value }))}
                  placeholder="Engineering"
                  className={inputCls()}
                />
              </div>
            </div>

            {editError && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 px-4 py-2.5 rounded-xl text-xs font-medium">
                {editError}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditMember(null)}
                className="flex-1 px-4 py-2 border border-[var(--card-border)] rounded-xl text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Page Access Modal ───────────────────────────────────────────────── */}
      {pageAccessMember && (
        <Modal title="Manage Page Access" subtitle={pageAccessMember.name} onClose={() => setPageAccessMember(null)}>
          <div className="space-y-2 mb-4 max-h-64 overflow-y-auto pr-1">
            <div className="flex items-center justify-between text-xs text-[var(--muted)] pb-2 mb-2 border-b border-[var(--card-border)]">
              <span>Toggle permitted dashboard modules:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPageSelections(ALL_PAGES.map((p) => p.key))}
                  className="text-indigo-500 hover:underline cursor-pointer font-semibold"
                >
                  All
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setPageSelections([])}
                  className="text-rose-500 hover:underline cursor-pointer font-semibold"
                >
                  Clear
                </button>
              </div>
            </div>
            {ALL_PAGES.map(({ key, label }) => (
              <label
                key={key}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                  pageSelections.includes(key) ? 'bg-indigo-500/10 text-indigo-400 font-semibold' : 'hover:bg-[var(--muted-bg)] text-[var(--foreground)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={pageSelections.includes(key)}
                  onChange={() => togglePage(key)}
                  className="w-4 h-4 rounded accent-indigo-600"
                />
                <span className="text-xs">{label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setPageAccessMember(null)}
              className="flex-1 px-4 py-2 border border-[var(--card-border)] rounded-xl text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handlePageAccess}
              disabled={pageSaving}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
            >
              {pageSaving ? 'Saving…' : 'Save Access'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add to Org Modal (superAdmin) ──────────────────────────────────── */}
      {addToOrgMember && (
        <Modal
          title="Add to Org"
          subtitle={`Add ${addToOrgMember.name} to another organization`}
          onClose={() => setAddToOrgMember(null)}
        >
          {addToOrgSuccess ? (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 px-4 py-3 rounded-xl text-xs font-medium">
                {addToOrgSuccess}
              </div>
              <button
                onClick={() => setAddToOrgMember(null)}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : allOrgs.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No other organizations available.</p>
          ) : (
            <form onSubmit={handleAddToOrg} className="space-y-4">
              <div>
                <label className={labelCls()}>Organization</label>
                <select
                  value={addToOrgForm.targetOrgId}
                  onChange={(e) => setAddToOrgForm((f) => ({ ...f, targetOrgId: e.target.value }))}
                  className={inputCls()}
                >
                  {allOrgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.org_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls()}>Role</label>
                  <select
                    value={addToOrgForm.role}
                    onChange={(e) => setAddToOrgForm((f) => ({ ...f, role: e.target.value }))}
                    className={inputCls()}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls()}>Department</label>
                  <input
                    value={addToOrgForm.department}
                    onChange={(e) => setAddToOrgForm((f) => ({ ...f, department: e.target.value }))}
                    placeholder={addToOrgMember.department || 'Optional'}
                    className={inputCls()}
                  />
                </div>
              </div>
              {addToOrgError && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 px-4 py-2.5 rounded-xl text-xs font-medium">
                  {addToOrgError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAddToOrgMember(null)}
                  className="flex-1 px-4 py-2 border border-[var(--card-border)] rounded-xl text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addToOrgSaving}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  {addToOrgSaving ? 'Adding…' : 'Add to Org'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* ── Remove Confirm ──────────────────────────────────────────────────── */}
      {removeMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRemoveMember(null)} />
          <div className="relative bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-full max-w-sm p-6 sm:p-7">
            <div className="w-12 h-12 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-[var(--foreground)] text-center mb-1.5">Remove Member</h2>
            <p className="text-xs text-[var(--muted)] text-center mb-5 leading-relaxed">
              Are you sure you want to remove <strong className="text-[var(--foreground)]">{removeMember.name}</strong> from {orgName}? They will no longer have access to this organization.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRemoveMember(null)}
                className="flex-1 px-4 py-2 border border-[var(--card-border)] rounded-xl text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing}
                className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
