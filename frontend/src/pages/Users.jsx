import { useEffect, useState } from 'react';
import api from '../api';
import { Card, PageHeader, PrimaryButton, Input, Select, Badge } from '../components/UI.jsx';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'member', org_ids: [] });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [u, o] = await Promise.all([api.get('/users'), api.get('/organisations')]);
      setUsers(u.data.users || []);
      setOrgs(o.data.organisations || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    try {
      await api.post('/users', form);
      setForm({ username: '', password: '', role: 'member', org_ids: [] });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add user');
    }
  }

  async function remove(id) {
    if (!confirm('Delete this user?')) return;
    await api.delete(`/users/${id}`);
    load();
  }

  function toggleOrg(id) {
    const i = form.org_ids.indexOf(id);
    if (i >= 0) setForm({ ...form, org_ids: form.org_ids.filter((x) => x !== id) });
    else setForm({ ...form, org_ids: [...form.org_ids, id] });
  }

  return (
    <div>
      <PageHeader title="Users" subtitle="SuperAdmin only — manage user accounts and access" />

      <Card className="mb-6">
        <h3 className="font-semibold mb-3">Add user</h3>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="Username" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <Input type="password" placeholder="Password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="member">member</option>
            <option value="admin">admin</option>
            <option value="superAdmin">superAdmin</option>
          </Select>
          <div className="flex flex-wrap gap-2 items-center">
            {orgs.map((o) => (
              <button
                type="button"
                key={o.id}
                onClick={() => toggleOrg(o.id)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  form.org_ids.includes(o.id)
                    ? 'bg-accent text-white border-accent'
                    : 'bg-navy-700 text-muted border-navy-700 hover:border-accent'
                }`}
              >
                {o.org_name}
              </button>
            ))}
          </div>
          <PrimaryButton type="submit" className="md:col-span-2">+ Add user</PrimaryButton>
        </form>
      </Card>

      {loading ? (
        <WidgetSkeleton variant="table" />
      ) : (
        <Card>
          <table className="w-full text-left">
            <thead className="text-muted text-sm border-b border-navy-700">
              <tr>
                <th className="py-2">ID</th>
                <th>Username</th>
                <th>Role</th>
                <th>Organisations</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-navy-700 last:border-0">
                  <td className="py-3"><Badge>{u.id}</Badge></td>
                  <td className="font-medium">{u.username}</td>
                  <td>
                    <Badge color={u.role === 'superAdmin' ? 'accent' : u.role === 'admin' ? 'green' : 'gray'}>
                      {u.role}
                    </Badge>
                  </td>
                  <td className="text-muted">
                    {(u.organisations || []).map((o) => o.org_name).join(', ') || '—'}
                  </td>
                  <td className="text-right">
                    <button onClick={() => remove(u.id)} className="text-rose-400 hover:text-rose-300">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}