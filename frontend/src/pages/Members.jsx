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
      <div className="relative bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-full max-w-md p-8">
        <button onClick={onClose} className="absolute top-5 right-5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-xl font-bold text-[var(--foreground)] mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-[var(--muted)] mb-6">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function inputCls() {
  return 'w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500';
}

function labelCls() {
  return 'block text-sm font-semibold text-[var(--foreground)] mb-1.5';
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
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'org_user', department: '' });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // ── Edit modal ─────────────────────────────────────────────────────────────
  const [editMember, setEditMember] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'org_user', department: '' });
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
  const [addToOrgForm, setAddToOrgForm] = useState({ targetOrgId: '', role: 'org_user', department: '' });
  const [addToOrgSaving, setAddToOrgSaving] = useState(false);
  const [addToOrgError, setAddToOrgError] = useState('');
  const [addToOrgSuccess, setAddToOrgSuccess] = useState('');

  const orgName = currentOrg?.org_name || 'Organization';

  const loadMembers = async (orgId) => {
    setLoading(true); setError('');
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
    setAddError(''); setAdding(true);
    try {
      await api.post('/member/members', addForm);
      setAddForm({ name: '', email: '', password: '', role: 'org_user', department: '' });
      setShowAdd(false);
      loadMembers(currentOrg?.id);
    } catch (e) {
      setAddError(e.response?.data?.message || 'Failed to add member');
    } finally { setAdding(false); }
  };

  const toggleActive = async (m) => {
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, is_active: !m.is_active } : x));
    try {
      await api.put(`/member/members/${m.id}`, { is_active: !m.is_active, user_type: m.user_type });
    } catch { loadMembers(currentOrg?.id); }
  };

  const isSystemUser = (m) => m.user_type === 'system_user';

  const openEdit = (m) => {
    setEditMember(m);
    setEditForm({ name: m.name, email: m.email || '', role: m.role, department: m.department || '' });
    setEditError('');
    setOpenMenuId(null);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editMember) return;
    setEditError(''); setEditSaving(true);
    try {
      await api.put(`/member/members/${editMember.id}`, { ...editForm, user_type: editMember.user_type });
      loadMembers(currentOrg?.id);
      setEditMember(null);
    } catch (e) {
      setEditError(e.response?.data?.message || 'Failed to update member');
    } finally { setEditSaving(false); }
  };

  const openPageAccess = (m) => {
    setPageAccessMember(m);
    const pages = m.allowed_pages;
    setPageSelections(Array.isArray(pages) ? pages : ALL_PAGES.map(p => p.key));
    setOpenMenuId(null);
  };

  const handlePageAccess = async () => {
    if (!pageAccessMember) return;
    setPageSaving(true);
    try {
      await api.put(`/member/members/${pageAccessMember.id}`, {
        allowed_pages: pageSelections,
        user_type: pageAccessMember.user_type || 'org_user',
      });
      loadMembers(currentOrg?.id);
      setPageAccessMember(null);
    } finally { setPageSaving(false); }
  };

  const togglePage = (key) => {
    setPageSelections(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const openRemove = (m) => { setRemoveMember(m); setOpenMenuId(null); };

  const handleRemove = async () => {
    if (!removeMember) return;
    setRemoving(true);
    try {
      await api.delete(`/member/members/${removeMember.id}?user_type=${removeMember.user_type || 'org_user'}`);
      setRemoveMember(null);
      loadMembers(currentOrg?.id);
    } finally { setRemoving(false); }
  };

  const openAddToOrg = async (m) => {
    setAddToOrgError(''); setAddToOrgSuccess('');
    setAddToOrgForm({ targetOrgId: '', role: 'org_user', department: m.department || '' });
    setOpenMenuId(null);
    try {
      const r = await api.get('/admin/organizations');
      const orgs = (r.data.organizations || []).filter(o => o.id !== currentOrg?.id && o.is_active !== false);
      setAllOrgs(orgs);
      if (orgs.length > 0) setAddToOrgForm(f => ({ ...f, targetOrgId: String(orgs[0].id) }));
    } catch { setAllOrgs([]); }
    setAddToOrgMember(m);
  };

  const handleAddToOrg = async (e) => {
    e.preventDefault();
    if (!addToOrgMember) return;
    setAddToOrgError(''); setAddToOrgSaving(true);
    try {
      await api.post('/admin/org-users', {
        org_id: parseInt(addToOrgForm.targetOrgId, 10),
        name: addToOrgMember.name,
        email: addToOrgMember.email,
        role: addToOrgForm.role,
        department: addToOrgForm.department || addToOrgMember.department,
      });
      const targetOrg = allOrgs.find(o => String(o.id) === addToOrgForm.targetOrgId);
      setAddToOrgSuccess(`${addToOrgMember.name} has been added to ${targetOrg?.org_name ?? 'the selected org'}.`);
    } catch (e) {
      setAddToOrgError(e.response?.data?.message || 'Failed to add member to org');
    } finally { setAddToOrgSaving(false); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = members.filter(m =>
    (m.name?.toLowerCase().includes(search.toLowerCase()) ||
     m.email?.toLowerCase().includes(search.toLowerCase()) ||
     m.department?.toLowerCase().includes(search.toLowerCase()))
  );

  const activeCount = members.filter(m => m.is_active).length;
  const adminCount  = members.filter(m => m.role === 'org_admin' || m.role === 'admin').length;

  if (loading) return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm">
            <div className="h-3 w-1/3 bg-[var(--muted-bg)] rounded animate-pulse mb-3" />
            <div className="h-8 w-1/3 bg-[var(--muted-bg)] rounded animate-pulse" />
          </div>
        ))}
      </div>
      {/* Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
        <WidgetSkeleton variant="table" />
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Members</h1>
          <p className="text-[var(--muted)] text-sm mt-1">{orgName}</p>
        </div>
        {canManage && (
          <button
            onClick={() => { setAddError(''); setShowAdd(true); }}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Member
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Members', value: members.length,  color: 'text-indigo-600 dark:text-indigo-400' },
          { label: 'Active',         value: activeCount,    color: 'text-green-600 dark:text-green-400'   },
          { label: 'Admins',         value: adminCount,     color: 'text-violet-600 dark:text-violet-400' },
        ].map(s => (
          <div key={s.label} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4">
            <p className="text-xs text-[var(--muted)] mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email or department…"
          className="w-full pl-10 pr-4 py-2.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-16 text-center">
          <div className="w-14 h-14 bg-[var(--muted-bg)] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">
            {search ? 'No members found' : 'No members yet'}
          </h3>
          <p className="text-[var(--muted)] text-sm">
            {search ? 'Try a different search term.' : 'Add the first member to get started.'}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-visible">
          <table className="w-full">
            <thead className="bg-[var(--muted-bg)] border-b border-[var(--card-border)]">
              <tr>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Member</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Role</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider hidden md:table-cell">Department</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider hidden lg:table-cell">Joined</th>
                {canManage && <th className="px-6 py-3.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {filtered.map(m => (
                <tr key={m.id} className="hover:bg-[var(--muted-bg)] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center text-sm font-bold text-indigo-700 dark:text-indigo-300 flex-shrink-0">
                        {m.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{m.name}</p>
                        <p className="text-xs text-[var(--muted)]">{m.email || (m.user_type === 'system_user' ? 'System account' : '—')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      m.role === 'org_admin' || m.role === 'admin'
                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                        : 'bg-[var(--muted-bg)] text-[var(--muted)]'
                    }`}>
                      {m.role === 'org_admin' || m.role === 'admin' ? 'Admin' : 'Member'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--muted)] hidden md:table-cell">
                    {m.department || '—'}
                  </td>
                  <td className="px-6 py-4">
                    {canManage && m.user_type !== 'system_user' ? (
                      <button
                        onClick={() => toggleActive(m)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${m.is_active ? 'bg-green-500' : 'bg-[var(--muted-bg)]'}`}
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                          style={{ transform: m.is_active ? 'translateX(18px)' : 'translateX(2px)' }}
                        />
                      </button>
                    ) : (
                      <span className={`text-xs font-medium ${m.is_active ? 'text-green-600' : 'text-[var(--muted)]'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--muted)] hidden lg:table-cell">
                    {m.user_type === 'system_user' ? '—' : m.created_at ? new Date(m.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  {canManage && (
                    <td className="px-6 py-4 text-right">
                      <div className="relative inline-block" ref={openMenuId === m.id ? menuRef : undefined}>
                        <button
                          onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                          className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1 rounded-lg hover:bg-[var(--muted-bg)]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </button>
                        {openMenuId === m.id && (
                          <div className="absolute right-0 top-8 z-[9999] w-48 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg py-1">
                            {(
                              <button onClick={() => openEdit(m)} className="w-full text-left px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors">Edit Member</button>
                            )}
                            {(
                              <button onClick={() => openPageAccess(m)} className="w-full text-left px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors">Manage Page Access</button>
                            )}
                            {isSuperAdmin && (
                              <button onClick={() => openAddToOrg(m)} className="w-full text-left px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors">Add to Org</button>
                            )}
                            {(
                              <>
                                <div className="border-t border-[var(--card-border)] my-1" />
                                <button onClick={() => openRemove(m)} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Remove from Org</button>
                              </>
                            )}
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
              <label className={labelCls()}>Full Name *</label>
              <input value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} required placeholder="John Doe" className={inputCls()} />
            </div>
            <div>
              <label className={labelCls()}>Email *</label>
              <input type="email" value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} required placeholder="john@company.com" className={inputCls()} />
            </div>
            <div>
              <label className={labelCls()}>Password *</label>
              <input type="password" value={addForm.password} onChange={e => setAddForm(p => ({ ...p, password: e.target.value }))} required placeholder="••••••••" className={inputCls()} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls()}>Role</label>
                <select value={addForm.role} onChange={e => setAddForm(p => ({ ...p, role: e.target.value }))} className={inputCls()}>
                  <option value="org_user">Member</option>
                  <option value="org_admin">Admin</option>
                </select>
              </div>
              <div>
                <label className={labelCls()}>Department</label>
                <input value={addForm.department} onChange={e => setAddForm(p => ({ ...p, department: e.target.value }))} placeholder="Engineering" className={inputCls()} />
              </div>
            </div>
            {addError && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">{addError}</div>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 border border-[var(--card-border)] rounded-xl text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors">Cancel</button>
              <button type="submit" disabled={adding} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">{adding ? 'Adding…' : 'Add Member'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Edit Member Modal ───────────────────────────────────────────────── */}
      {editMember && (
        <Modal title="Edit Member" subtitle={isSystemUser(editMember) ? 'System account' : editMember.email} onClose={() => setEditMember(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <label className={labelCls()}>Full Name *</label>
              <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} required className={inputCls()} />
            </div>
            <div>
              <label className={labelCls()}>Email *</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} required placeholder="john@company.com" className={inputCls()} />
            </div>
            {!isSystemUser(editMember) && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls()}>Role</label>
                  <select value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))} className={inputCls()}>
                    <option value="org_user">Member</option>
                    <option value="org_admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls()}>Department</label>
                  <input value={editForm.department} onChange={e => setEditForm(p => ({ ...p, department: e.target.value }))} placeholder="Engineering" className={inputCls()} />
                </div>
              </div>
            )}
            {isSystemUser(editMember) && (
              <p className="text-xs text-[var(--muted)]">System account — role and department are managed centrally.</p>
            )}
            {editError && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">{editError}</div>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditMember(null)} className="flex-1 px-4 py-2.5 border border-[var(--card-border)] rounded-xl text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors">Cancel</button>
              <button type="submit" disabled={editSaving} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">{editSaving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Page Access Modal ───────────────────────────────────────────────── */}
      {pageAccessMember && (
        <Modal title="Manage Page Access" subtitle={pageAccessMember.name} onClose={() => setPageAccessMember(null)}>
          <div className="space-y-2 mb-4 max-h-64 overflow-y-auto pr-1">
            {ALL_PAGES.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-[var(--muted-bg)] transition-colors">
                <input
                  type="checkbox"
                  checked={pageSelections.includes(key)}
                  onChange={() => togglePage(key)}
                  className="w-4 h-4 rounded accent-indigo-600"
                />
                <span className="text-sm text-[var(--foreground)]">{label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)] mb-5">Changes take effect on the member's next login.</p>
          <div className="flex gap-3">
            <button onClick={() => setPageAccessMember(null)} className="flex-1 px-4 py-2.5 border border-[var(--card-border)] rounded-xl text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors">Cancel</button>
            <button onClick={handlePageAccess} disabled={pageSaving} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">{pageSaving ? 'Saving…' : 'Save Access'}</button>
          </div>
        </Modal>
      )}

      {/* ── Add to Org Modal (superAdmin) ──────────────────────────────────── */}
      {addToOrgMember && (
        <Modal title="Add to Org" subtitle={`Add ${addToOrgMember.name} to another organization`} onClose={() => setAddToOrgMember(null)}>
          {addToOrgSuccess ? (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-xl text-sm">{addToOrgSuccess}</div>
              <button onClick={() => setAddToOrgMember(null)} className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">Done</button>
            </div>
          ) : allOrgs.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No other organizations available.</p>
          ) : (
            <form onSubmit={handleAddToOrg} className="space-y-4">
              <div>
                <label className={labelCls()}>Organization</label>
                <select value={addToOrgForm.targetOrgId} onChange={e => setAddToOrgForm(f => ({ ...f, targetOrgId: e.target.value }))} className={inputCls()}>
                  {allOrgs.map(o => <option key={o.id} value={o.id}>{o.org_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls()}>Role</label>
                  <select value={addToOrgForm.role} onChange={e => setAddToOrgForm(f => ({ ...f, role: e.target.value }))} className={inputCls()}>
                    <option value="org_user">Member</option>
                    <option value="org_admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls()}>Department</label>
                  <input value={addToOrgForm.department} onChange={e => setAddToOrgForm(f => ({ ...f, department: e.target.value }))} placeholder={addToOrgMember.department || 'Optional'} className={inputCls()} />
                </div>
              </div>
              {addToOrgError && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">{addToOrgError}</div>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setAddToOrgMember(null)} className="flex-1 px-4 py-2.5 border border-[var(--card-border)] rounded-xl text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors">Cancel</button>
                <button type="submit" disabled={addToOrgSaving} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">{addToOrgSaving ? 'Adding…' : 'Add to Org'}</button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* ── Remove Confirm ──────────────────────────────────────────────────── */}
      {removeMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRemoveMember(null)} />
          <div className="relative bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-full max-w-sm p-8">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-[var(--foreground)] text-center mb-2">Remove Member</h2>
            <p className="text-sm text-[var(--muted)] text-center mb-6">
              This will deactivate <span className="font-semibold text-[var(--foreground)]">{removeMember.name}</span>'s access to {orgName}. They will no longer be able to log in to this org.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRemoveMember(null)} className="flex-1 px-4 py-2.5 border border-[var(--card-border)] rounded-xl text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors">Cancel</button>
              <button onClick={handleRemove} disabled={removing} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">{removing ? 'Removing…' : 'Remove'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
