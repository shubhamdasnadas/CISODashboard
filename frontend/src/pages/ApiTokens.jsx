import * as session from '../utils/session.js';
import { useEffect, useState } from 'react';
import api from '../api';
import { Card, PageHeader, PrimaryButton, Input, Select, Badge } from '../components/UI.jsx';
import { useOrg } from '../context/OrgContext.jsx';

export default function ApiTokens() {
  const [tokens, setTokens] = useState([]);
  const [form, setForm] = useState({ api_name: '', token: '' });
  const user = session.getUser();
  const isAdmin = user.role === 'superAdmin' || user.role === 'admin';
  const { currentOrg, switchOrg, organisations } = useOrg();

  useEffect(() => {
    if (!currentOrg) return;
    api.get(`/tokens/${currentOrg.id}`).then(({ data }) => setTokens(data.tokens || []));
  }, [currentOrg]);

  async function submit(e) {
    e.preventDefault();
    if (!currentOrg || !form.api_name || !form.token) return;
    try {
      await api.post('/tokens', { org_id: currentOrg.id, ...form });
      setForm({ api_name: '', token: '' });
      const { data } = await api.get(`/tokens/${currentOrg.id}`);
      setTokens(data.tokens || []);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add');
    }
  }

  async function remove(id) {
    if (!confirm('Delete this token?')) return;
    await api.delete(`/tokens/${id}`);
    const { data } = await api.get(`/tokens/${currentOrg.id}`);
    setTokens(data.tokens || []);
  }

  // Multi-org users can still pick another org directly on this page
  function handleSelectOrg(e) {
    const id = parseInt(e.target.value, 10);
    switchOrg(id);
  }

  return (
    <div>
      <PageHeader title="API Tokens" subtitle="Manage vendor API tokens per organisation" />

      {organisations.length > 1 && (
        <Card className="mb-6">
          <label className="text-sm text-muted">Organisation</label>
          <Select
            className="mt-1"
            value={currentOrg?.id || ''}
            onChange={handleSelectOrg}
          >
            {organisations.map((o) => (
              <option key={o.id} value={o.id}>{o.org_name}</option>
            ))}
          </Select>
        </Card>
      )}

      {isAdmin && (
        <Card className="mb-6">
          <h3 className="font-semibold mb-3">Add token</h3>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="API name (e.g. SentinelOne)" value={form.api_name}
              onChange={(e) => setForm({ ...form, api_name: e.target.value })} required />
            <Input placeholder="Token" value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })} required />
            <PrimaryButton type="submit">+ Add token</PrimaryButton>
          </form>
        </Card>
      )}

      <Card>
        <table className="w-full text-left">
          <thead className="text-muted text-sm border-b border-navy-700">
            <tr>
              <th className="py-2">ID</th>
              <th>API Name</th>
              <th>Token</th>
              {user.role === 'superAdmin' && <th></th>}
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} className="border-b border-navy-700 last:border-0">
                <td className="py-3"><Badge>{t.id}</Badge></td>
                <td className="font-medium">{t.api_name}</td>
                <td className="font-mono text-muted text-sm">{t.token}</td>
                {user.role === 'superAdmin' && (
                  <td className="text-right">
                    <button onClick={() => remove(t.id)} className="text-rose-400 hover:text-rose-300">
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {tokens.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-muted">No tokens configured.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}