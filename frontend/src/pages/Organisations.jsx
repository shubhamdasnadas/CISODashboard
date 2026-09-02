import * as session from '../utils/session.js';
import { useEffect, useState } from 'react';
import api from '../api';
import { Card, PageHeader, PrimaryButton, Input, Badge } from '../components/UI.jsx';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

export default function Organisations() {
  const user = session.getUser();
  const [orgs, setOrgs] = useState([]);
  const [form, setForm] = useState({ org_name: '', address: '', mobile_no: '', slug: '' });
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = user.role === 'superAdmin';

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/organisations');
      setOrgs(data.organisations || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    try {
      await api.post('/organisations', form);
      setForm({ org_name: '', address: '', mobile_no: '', slug: '' });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add');
    }
  }

  async function remove(id) {
    if (!confirm('Delete this organisation?')) return;
    await api.delete(`/organisations/${id}`);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Organisations"
        subtitle={isSuperAdmin ? 'Manage all organisations' : 'Your organisations'}
      />

      {isSuperAdmin && (
        <Card className="mb-6">
          <h3 className="font-semibold mb-3">Add new organisation</h3>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input
              placeholder="Organisation name"
              value={form.org_name}
              onChange={(e) => setForm({ ...form, org_name: e.target.value })}
              required
            />
            <Input
              placeholder="Address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <Input
              placeholder="Mobile number"
              value={form.mobile_no}
              onChange={(e) => setForm({ ...form, mobile_no: e.target.value })}
            />
            <Input
              placeholder="Slug (optional, auto-generated)"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
            <PrimaryButton type="submit">+ Add</PrimaryButton>
          </form>
        </Card>
      )}

      {loading ? (
        <WidgetSkeleton variant="table" />
      ) : (
        <Card>
          <table className="w-full text-left">
            <thead className="text-muted text-sm border-b border-navy-700">
              <tr>
                <th className="py-2">ID</th>
                <th>Name</th>
                <th>Address</th>
                <th>Mobile</th>
                {isSuperAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="border-b border-navy-700 last:border-0">
                  <td className="py-3"><Badge>{o.id}</Badge></td>
                  <td className="font-medium">{o.org_name}</td>
                  <td className="text-muted">{o.address || '—'}</td>
                  <td className="text-muted">{o.mobile_no || '—'}</td>
                  {isSuperAdmin && (
                    <td className="text-right">
                      <button
                        onClick={() => remove(o.id)}
                        className="text-rose-400 hover:text-rose-300"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted">No organisations yet.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}