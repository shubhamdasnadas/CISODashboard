import { useState, useEffect, useCallback } from 'react';
import api from '../api.js';

// Dynamic window defaults: start = yesterday, end = today. Recomputed on every
// render so "tomorrow" the start becomes the day before tomorrow, etc.
const ymd = (d) => d.toISOString().slice(0, 10);
const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
};
const todayStr = () => ymd(new Date());

function Info({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">{label}</span>
      <span className="text-xs font-semibold text-[var(--foreground)] mt-0.5 break-words">{value ?? '—'}</span>
    </div>
  );
}

// Convert a <input type="date"> value (YYYY-MM-DD) to the NVD ISO timestamp.
const toIso = (dateStr, endOfDay = false) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + (endOfDay ? 'T23:59:59.000Z' : 'T00:00:00.000Z'));
  return isNaN(d.getTime()) ? null : d.toISOString();
};

export default function UpdatedCpes() {
  const [creds, setCreds] = useState({ apiKey: '', apiUrl: '' });
  const [hasCreds, setHasCreds] = useState(false);
  const [loadingCreds, setLoadingCreds] = useState(true);

  // Date window selected from the frontend (sent in the payload).
  // Defaults: start = yesterday, end = today (dynamic — updates each day).
  const [startDate, setStartDate] = useState(yesterdayStr);
  const [endDate, setEndDate] = useState(todayStr);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  // Last-used window returned by the backend.
  const [window, setWindow] = useState({ lastModStartDate: null, lastModEndDate: null });

  const loadCreds = useCallback(async () => {
    setLoadingCreds(true);
    try {
      const r = await api.get('/updated-cpes/credentials');
      const d = r.data || {};
      if (d.apiKey) {
        setHasCreds(true);
        setCreds({ apiKey: d.apiKey, apiUrl: d.apiUrl || '' });
      }
      // NOTE: Do NOT overwrite the date pickers with stored values — the defaults
      // are dynamic (yesterday -> today). We only surface the last-used window as
      // read-only info.
      setWindow({
        lastModStartDate: d.lastModStartDate || null,
        lastModEndDate: d.lastModEndDate || null,
      });
    } catch { /* ignore */ }
    finally { setLoadingCreds(false); }
  }, []);

  useEffect(() => { loadCreds(); }, [loadCreds]);

  const saveCreds = async () => {
    if (!creds.apiKey) return;
    try {
      // Always store the CPE endpoint — never creds.apiUrl (which holds the CVE endpoint).
      const CPE_BASE = 'https://services.nvd.nist.gov/rest/json/cpes/2.0';
      await api.put('/updated-cpes/credentials', {
        apiKey: creds.apiKey,
        apiUrl: CPE_BASE,
      });
      setHasCreds(true);
      setSyncMsg({ type: 'success', text: 'API key saved.' });
    } catch (e) {
      setSyncMsg({ type: 'error', text: e.response?.data?.message || 'Failed to save credentials' });
    }
  };

  const runSync = async () => {
    if (!creds.apiKey) {
      setSyncMsg({ type: 'error', text: 'Enter the NVD API key (token) first.' });
      return;
    }
    if (!startDate || !endDate) {
      setSyncMsg({ type: 'error', text: 'Select both a start and end date.' });
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setSyncMsg({ type: 'error', text: 'Start date must be before the end date.' });
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      // Persist the user-entered token + base URL first, so the sync always uses
      // exactly the key the user typed (single source of truth in the backend's
      // integration_credentials row). Always use the CPE endpoint — never a
      // stored/derived CVE URL.
      const CPE_BASE = 'https://services.nvd.nist.gov/rest/json/cpes/2.0';
      await api.put('/updated-cpes/credentials', {
        apiKey: creds.apiKey,
        apiUrl: CPE_BASE,
      });
      setHasCreds(true);

      // Both dates are sent in the payload so the backend uses exactly what the
      // user picked. Token + base URL are sent from the frontend inputs too.
      // The backend matches each returned CPE to existing CVEs (by their stored
      // configuration CPE criteria) and updates ONLY the cpe_match column of the
      // matching CVEs — no new CVE rows are created.
      const r = await api.post('/updated-cpes/sync', {
        apiKey: creds.apiKey,
        apiUrl: CPE_BASE,
        lastModStartDate: toIso(startDate),
        lastModEndDate: toIso(endDate, true),
      });
      setHasCreds(true);
      setSyncMsg({ type: 'success', text: r.data.message });
      setWindow({
        lastModStartDate: r.data.lastModStartDate || window.lastModStartDate,
        lastModEndDate: r.data.lastModEndDate || null,
      });
    } catch (e) {
      setSyncMsg({ type: 'error', text: e.response?.data?.message || 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const fmt = (v) => (v ? new Date(v).toLocaleString() : '—');

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--foreground)]">Updated CPEs — Modified CPE Sync</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          Pick a date window (lastModStartDate → lastModEndDate) and sync only the CPEs modified in that range.
          Each returned CPE is matched to existing CVEs by their stored configuration criteria and updates
          <b> only the CPE column</b> (cpe_match) of those CVEs. CVEs with no match are left untouched.
        </p>
      </div>

      {/* Config + Sync */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--foreground)]">NVD CPE API Configuration</h2>
          {!loadingCreds && hasCreds && (
            <span className="text-[11px] font-semibold text-green-600 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">Configured</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">Token (API Key)</label>
            <input
              type="text" value={creds.apiKey}
              onChange={(e) => setCreds((c) => ({ ...c, apiKey: e.target.value }))}
              placeholder="68bfccb2-...."
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">Base URL</label>
            <input
              type="text" value={creds.apiUrl}
              onChange={(e) => setCreds((c) => ({ ...c, apiUrl: e.target.value }))}
              placeholder="https://services.nvd.nist.gov/rest/json/cpes/2.0"
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        {/* Date window pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">Last Modified Start Date</label>
            <input
              type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">Last Modified End Date</label>
            <input
              type="date" value={endDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <button
            onClick={saveCreds}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gray-500 hover:bg-gray-600 transition-colors"
          >
            Save API Key
          </button>
          <button
            onClick={runSync}
            disabled={syncing || !creds.apiKey}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? 'Updating CPEs…' : 'Updated CPE'}
          </button>
        </div>

        {/* Last-used window info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[var(--muted-bg)] rounded-xl p-3">
          <Info label="lastModStartDate (sent)" value={fmt(toIso(startDate))} />
          <Info label="lastModEndDate (sent)" value={fmt(toIso(endDate, true))} />
        </div>

        {syncMsg && (
          <div className={`text-xs px-3 py-2 rounded-lg ${syncMsg.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
            {syncMsg.text}
          </div>
        )}

        <p className="text-[11px] text-[var(--muted)] leading-relaxed">
          The selected dates are sent directly in the sync payload as <b>lastModStartDate</b> and <b>lastModEndDate</b>
          against the <code>/cpes/2.0</code> endpoint (the same call as <code>/cves/2.0</code> but with the path
          swapped to <code>cpes</code>). View the synced CPE data on the <a href="/nvd" className="text-indigo-600 dark:text-indigo-400 hover:underline">NVD</a> page (cpe_match column).
        </p>
      </div>
    </div>
  );
}
