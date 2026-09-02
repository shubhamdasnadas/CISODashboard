import { useState, useEffect } from 'react';
import api from '../api';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

const STATUS_OPTS = ['open', 'in_progress', 'closed'];
const STATUS_CLS = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  closed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export default function Support() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium' });
  const [saving, setSaving] = useState(false);

  const fetch = () => {
    setLoading(true);
    api.get('/support').then(r => setTickets(r.data.tickets || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const handleAdd = async e => {
    e.preventDefault();
    if (!form.subject.trim()) return;
    setSaving(true);
    try {
      await api.post('/support', form);
      setForm({ subject: '', description: '', priority: 'medium' });
      setShowForm(false);
      fetch();
    } finally { setSaving(false); }
  };

  const updateStatus = async (id, status) => {
    await api.put(`/support/${id}`, { status });
    fetch();
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Support</h1>
          <p className="text-sm text-[var(--muted)] mt-1">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
          {showForm ? 'Cancel' : '+ New Ticket'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-4">
          <input required placeholder="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--foreground)]" />
          <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
            className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--foreground)] resize-none" />
          <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
            className="px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)] focus:outline-none">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
          <button disabled={saving} type="submit" className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
            {saving ? 'Submitting…' : 'Submit Ticket'}
          </button>
        </form>
      )}

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        {loading ? (
          <WidgetSkeleton variant="table" />
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)]">No support tickets.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted-bg)] text-left">
                  {['Subject', 'Priority', 'Status', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {tickets.map(t => (
                  <tr key={t.id} className="hover:bg-[var(--muted-bg)]">
                    <td className="px-4 py-3 text-[var(--foreground)] max-w-xs">
                      <p className="font-medium truncate">{t.subject}</p>
                      {t.description && <p className="text-xs text-[var(--muted)] truncate mt-0.5">{t.description}</p>}
                    </td>
                    <td className="px-4 py-3 capitalize text-[var(--muted)]">{t.priority || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_CLS[t.status] || 'bg-gray-100 text-gray-600'}`}>{t.status?.replace('_', ' ') || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)}
                        className="text-xs px-2 py-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-[var(--foreground)] focus:outline-none">
                        {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
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
