import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api';
import WidgetSkeleton from '../dashboard/WidgetSkeleton.jsx';

export default function AdminOrgUsers() {
  const { id: orgId } = useParams();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'org_user', department: '' });
  const [saving, setSaving] = useState(false);

  const fetch = () => {
    setLoading(true);
    api.get(`/admin/org-users?orgId=${orgId}`).then(r => setUsers(r.data.users || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { if (orgId) fetch(); }, [orgId]);

  const handleAdd = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/org-users', { ...form, org_id: parseInt(orgId) });
      setForm({ name: '', email: '', password: '', role: 'org_user', department: '' });
      setShowForm(false);
      fetch();
    } finally { setSaving(false); }
  };

  const handleDelete = async id => {
    if (!confirm('Remove this user?')) return;
    await api.delete(`/admin/org-users/${id}`);
    fetch();
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Org Users</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Organisation ID: {orgId} — {users.length} users</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'name', label: 'Name', ph: 'Jane Doe', required: true },
            { key: 'email', label: 'Email', ph: 'jane@example.com', required: true },
            { key: 'password', label: 'Password', ph: '••••••••', required: true, type: 'password' },
            { key: 'department', label: 'Department', ph: 'Security' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{f.label}{f.required && ' *'}</label>
              <input type={f.type || 'text'} required={f.required} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph}
                className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--foreground)]" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Role</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)] focus:outline-none">
              <option value="org_user">User</option>
              <option value="org_admin">Admin</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button disabled={saving} type="submit" className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
              {saving ? 'Adding…' : 'Add User'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        {loading ? (
          <WidgetSkeleton variant="table" />
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)]">No users in this organisation.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted-bg)] text-left">
                  {['Name', 'Email', 'Role', 'Department', 'Active', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-[var(--muted-bg)]">
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">{u.name}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{u.email}</td>
                    <td className="px-4 py-3 capitalize text-[var(--foreground)]">{u.role?.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{u.department || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`w-2 h-2 rounded-full inline-block ${u.is_active !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(u.id)} className="text-red-500 text-xs hover:underline">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
