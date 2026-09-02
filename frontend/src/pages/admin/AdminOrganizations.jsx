import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import WidgetSkeleton from '../dashboard/WidgetSkeleton.jsx';

export default function AdminOrganizations() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ org_name: '', slug: '', email: '', plan: 'starter', industry: '' });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const fetch = () => {
    setLoading(true);
    api.get('/admin/organizations').then(r => setOrgs(r.data.organizations || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const handleAdd = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/organizations', form);
      setForm({ org_name: '', slug: '', email: '', plan: 'starter', industry: '' });
      setShowForm(false);
      fetch();
    } finally { setSaving(false); }
  };

  const handleDelete = async id => {
    if (!confirm('Delete this organisation? This cannot be undone.')) return;
    await api.delete(`/admin/organizations/${id}`);
    fetch();
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Organisations</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Super admin — {orgs.length} total</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
          {showForm ? 'Cancel' : '+ New Org'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'org_name', label: 'Org Name', ph: 'Acme Corp', required: true },
            { key: 'slug', label: 'Slug', ph: 'acme-corp' },
            { key: 'email', label: 'Email', ph: 'admin@acme.com' },
            { key: 'industry', label: 'Industry', ph: 'Technology' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{f.label}{f.required && ' *'}</label>
              <input required={f.required} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph}
                className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--foreground)]" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Plan</label>
            <select value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value }))}
              className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)] focus:outline-none">
              {['starter', 'professional', 'enterprise'].map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button disabled={saving} type="submit" className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
              {saving ? 'Creating…' : 'Create Organisation'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        {loading ? (
          <WidgetSkeleton variant="table" />
        ) : orgs.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)]">No organisations.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted-bg)] text-left">
                  {['ID', 'Name', 'Slug', 'Email', 'Plan', 'Active', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {orgs.map(o => (
                  <tr key={o.id} className="hover:bg-[var(--muted-bg)]">
                    <td className="px-4 py-3 text-[var(--muted)]">{o.id}</td>
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">{o.org_name}</td>
                    <td className="px-4 py-3 text-[var(--muted)] font-mono text-xs">{o.slug || '—'}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{o.email || '—'}</td>
                    <td className="px-4 py-3 capitalize text-[var(--foreground)]">{o.plan || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`w-2 h-2 rounded-full inline-block ${o.is_active !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => navigate(`/admin/organizations/${o.id}/users`)} className="text-indigo-600 text-xs hover:underline">Users</button>
                        <button onClick={() => handleDelete(o.id)} className="text-red-500 text-xs hover:underline">Delete</button>
                      </div>
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
