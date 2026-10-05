import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useProviders } from '../../context/ProviderContext';

export default function ScalefusionConfig() {
  const navigate = useNavigate();
  const { setSelectedProvider } = useProviders();

  const [baseUrl, setBaseUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [status, setStatus] = useState('idle');
  const [msg, setMsg] = useState('');

  // API Data states
  const [devices, setDevices] = useState([]);
  const [applications, setApplications] = useState([]);
  const [rawResponse, setRawResponse] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('devices'); // 'devices' | 'applications' | 'raw'
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);

  const loadApiData = async () => {
    setDataLoading(true);
    try {
      const [devRes, appRes, rawRes] = await Promise.allSettled([
        api.get('/scalefusion/db/devices'),
        api.get('/scalefusion/db/applications'),
        api.get('/scalefusion/response'),
      ]);

      if (devRes.status === 'fulfilled' && Array.isArray(devRes.value.data?.data)) {
        setDevices(devRes.value.data.data);
      }
      if (appRes.status === 'fulfilled' && Array.isArray(appRes.value.data?.data)) {
        setApplications(appRes.value.data.data);
      }
      if (rawRes.status === 'fulfilled' && rawRes.value.data) {
        setRawResponse(rawRes.value.data.data);
        if (rawRes.value.data.synced_at) {
          setLastSyncedAt(rawRes.value.data.synced_at);
        }
      }
    } catch (err) {
      console.error('Failed to load Scale Fusion data', err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    api.get('/scalefusion/credentials').then(r => {
      if (r.data.baseUrl) setBaseUrl(r.data.baseUrl);
      if (r.data.apiToken) setApiToken(r.data.apiToken);
      if (r.data.lastSyncedAt) setLastSyncedAt(r.data.lastSyncedAt);
    }).catch(() => {});

    loadApiData();
  }, []);

  const handleSaveSync = async () => {
    if (!apiToken.trim()) {
      setMsg('API Token is required');
      setStatus('error');
      return;
    }
    setStatus('saving');
    setMsg('Saving credentials…');
    try {
      await api.put('/scalefusion/credentials', {
        baseUrl: baseUrl.trim(),
        apiToken: apiToken.trim(),
      });
      setStatus('syncing');
      setMsg('Syncing Scale Fusion devices…');
      const r = await api.post('/scalefusion/sync');
      const summary = r.data?.devices != null
        ? `Synced ${r.data.devices} devices, ${r.data?.applications ?? 0} applications`
        : (r.data.message || 'Sync complete');
      setSelectedProvider('deviceManagement', 'Scale Fusion');
      setMsg(summary + ' — Scale Fusion is now the active Device Management provider.');
      setStatus('done');
      setLastSyncedAt(new Date().toISOString());
      await loadApiData();
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error');
      setStatus('error');
    }
  };

  const handleCopyJson = () => {
    if (!rawResponse) return;
    navigator.clipboard.writeText(JSON.stringify(rawResponse, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    if (!rawResponse) return;
    const blob = new Blob([JSON.stringify(rawResponse, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scalefusion_devices_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const statusColor = (s) => ({
    idle: 'text-gray-500', saving: 'text-indigo-600', syncing: 'text-indigo-600',
    done: 'text-green-600', error: 'text-red-500',
  }[s] || '');

  // Filtered devices based on search query
  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return devices;
    const q = searchQuery.toLowerCase();
    return devices.filter((d) => {
      const name = (d.name || d.device_name || d.model_name || '').toLowerCase();
      const model = (d.model || d.model_name || '').toLowerCase();
      const os = (d.os_name || d.os || d.platform || '').toLowerCase();
      const serial = (d.serial_number || d.imei || d.id || '').toString().toLowerCase();
      const group = (d.group_name || d.policy_name || '').toLowerCase();
      const status = (d.compliance_state || d.compliance_status || d.status || '').toLowerCase();
      return name.includes(q) || model.includes(q) || os.includes(q) || serial.includes(q) || group.includes(q) || status.includes(q);
    });
  }, [devices, searchQuery]);

  // Filtered applications based on search query
  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return applications;
    const q = searchQuery.toLowerCase();
    return applications.filter((a) => {
      const name = (a.name || a.app_name || '').toLowerCase();
      const pkg = (a.package_name || a.bundle_id || '').toLowerCase();
      const platform = (a.platform || a.os_type || '').toLowerCase();
      const version = (a.version || a.app_version || '').toLowerCase();
      return name.includes(q) || pkg.includes(q) || platform.includes(q) || version.includes(q);
    });
  }, [applications, searchQuery]);

  const compliantCount = useMemo(() => {
    return devices.filter((d) => d.compliant === true).length;
  }, [devices]);

  const formattedJson = useMemo(() => {
    return rawResponse ? JSON.stringify(rawResponse, null, 2) : '';
  }, [rawResponse]);

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="text-[var(--muted)] hover:text-[var(--foreground)] p-1.5 rounded-lg hover:bg-[var(--muted-bg)] transition-colors"
            title="Back to Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Scale Fusion Configuration</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Configure Scale Fusion MDM integration</p>
          </div>
        </div>

        {devices.length > 0 && (
          <button
            onClick={() => navigate('/mdm')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--card-bg)] hover:bg-[var(--muted-bg)] border border-[var(--card-border)] rounded-xl text-sm font-medium text-[var(--foreground)] transition-colors"
          >
            <span>Open MDM Dashboard</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}
      </div>

      {/* Configuration Card */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-semibold text-[var(--foreground)]">Scale Fusion</h3>
          </div>
          {lastSyncedAt && (
            <span className="text-xs text-[var(--muted)]">
              Last synced: {new Date(lastSyncedAt).toLocaleString()}
            </span>
          )}
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
              Devices API URL <span className="text-[var(--muted)] font-normal">— paste the full devices endpoint</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api-in.scalefusion.com/api/v1/devices.json"
              className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">API Token</label>
            <input
              type="password"
              value={apiToken}
              onChange={e => setApiToken(e.target.value)}
              placeholder="OAuth access token"
              className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-4 pt-1 flex-wrap">
            <button
              onClick={handleSaveSync}
              disabled={status === 'saving' || status === 'syncing'}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {status === 'saving' || status === 'syncing' ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  {status === 'saving' ? 'Saving…' : 'Syncing…'}
                </>
              ) : 'Save & Sync'}
            </button>
            {msg && <span className={`text-sm font-medium ${statusColor(status)}`}>{msg}</span>}
          </div>
        </div>
      </div>

      {/* API Data Display Section */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
        {/* Section Header */}
        <div className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <h2 className="font-bold text-[var(--foreground)] text-base">Scale Fusion API Data</h2>
              <p className="text-xs text-[var(--muted)]">
                {lastSyncedAt ? `Live synchronized data from Scale Fusion API (Synced ${new Date(lastSyncedAt).toLocaleString()})` : 'Data received from Scale Fusion API endpoint'}
              </p>
            </div>
          </div>

          {rawResponse && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--card-bg)] hover:bg-[var(--card-border)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-500">Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    <span>Copy JSON</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--card-bg)] hover:bg-[var(--card-border)] border border-[var(--card-border)] text-[var(--foreground)] transition-colors"
                title="Download JSON Payload"
              >
                <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download</span>
              </button>
            </div>
          )}
        </div>

        {/* Syncing Loading State */}
        {status === 'syncing' || dataLoading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full mb-3" />
            <p className="text-sm font-semibold text-[var(--foreground)]">Fetching latest API data from Scale Fusion…</p>
            <p className="text-xs text-[var(--muted)] mt-1">Calling {baseUrl || 'https://api-in.scalefusion.com/api/v1/devices.json'}</p>
          </div>
        ) : !rawResponse && devices.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7c0-2-1.5-3-3.5-3h-9C5.5 4 4 5 4 7z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h4" />
              </svg>
            </div>
            <p className="text-base font-bold text-[var(--foreground)]">No API Data Synced Yet</p>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-md">
              Enter your Scale Fusion Devices API URL and API Token above, then click <strong>"Save & Sync"</strong> to retrieve and view live API data here.
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* KPI Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[var(--muted-bg)]/70 border border-[var(--card-border)] rounded-xl p-3.5">
                <p className="text-xs text-[var(--muted)] font-medium">Enrolled Devices</p>
                <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{devices.length}</p>
              </div>
              <div className="bg-[var(--muted-bg)]/70 border border-[var(--card-border)] rounded-xl p-3.5">
                <p className="text-xs text-[var(--muted)] font-medium">Applications Tracked</p>
                <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{applications.length}</p>
              </div>
              <div className="bg-[var(--muted-bg)]/70 border border-[var(--card-border)] rounded-xl p-3.5">
                <p className="text-xs text-[var(--muted)] font-medium">Compliant Devices</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {compliantCount} <span className="text-xs font-normal text-[var(--muted)]">({devices.length ? Math.round((compliantCount / devices.length) * 100) : 100}%)</span>
                </p>
              </div>
              <div className="bg-[var(--muted-bg)]/70 border border-[var(--card-border)] rounded-xl p-3.5">
                <p className="text-xs text-[var(--muted)] font-medium">API Response Status</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  200 OK / Synced
                </p>
              </div>
            </div>

            {/* Tab navigation and Search */}
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-[var(--card-border)] pb-2">
              <div className="flex gap-2">
                {[
                  { key: 'devices', label: `Devices (${devices.length})`, icon: '📱' },
                  { key: 'applications', label: `Applications (${applications.length})`, icon: '📦' },
                  { key: 'raw', label: 'Raw API Response (JSON)', icon: '{ }' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === tab.key
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)]'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab !== 'raw' && (
                <div className="relative min-w-[240px]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search ${activeTab === 'devices' ? 'devices' : 'applications'}…`}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <svg className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              )}
            </div>

            {/* TAB 1: DEVICES TABLE */}
            {activeTab === 'devices' && (
              <div className="border border-[var(--card-border)] rounded-xl overflow-hidden">
                {filteredDevices.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[var(--muted)]">
                    {searchQuery ? 'No devices match your search query.' : 'No devices found in API response.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[480px]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-[var(--muted-bg)] border-b border-[var(--card-border)] z-10">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)]">Device Name / ID</th>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)]">Model / Hardware</th>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)]">OS & Platform</th>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)]">Group / Policy</th>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)]">Status</th>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)]">Last Connected</th>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)] text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--card-border)]">
                        {filteredDevices.map((d, idx) => {
                          const name = d.device_name || d.name || d.model_name || `Device ${d.id ?? idx}`;
                          const model = d.model_name || d.model || '—';
                          const os = d.os_name || d.os || d.platform || 'Unknown';
                          const osVer = d.os_version ? ` v${d.os_version}` : '';
                          const group = d.group_name || d.policy_name || '—';
                          const statusText = d.compliance_state || d.compliance_status || d.status || 'Active';
                          const isCompliant = d.compliant === true || (/compliant|active|enrolled/i.test(String(statusText)) && !/non/i.test(String(statusText)));
                          const lastConn = d.last_connected_at || d.last_reported || d.last_seen || d.updated_at;

                          return (
                            <tr
                              key={d.id || idx}
                              className="hover:bg-[var(--muted-bg)]/60 transition-colors"
                            >
                              <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                                <div>{name}</div>
                                {d.serial_number && (
                                  <div className="text-[10px] text-[var(--muted)] font-mono mt-0.5">SN: {d.serial_number}</div>
                                )}
                                {d.imei && (
                                  <div className="text-[10px] text-[var(--muted)] font-mono">IMEI: {d.imei}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-[var(--muted)]">
                                <div>{model}</div>
                                {d.device_type && <div className="text-[10px] text-[var(--muted)]">{d.device_type}</div>}
                              </td>
                              <td className="px-4 py-3 text-[var(--muted)]">
                                <div>{os}{osVer}</div>
                                {d.ip_address && <div className="text-[10px] font-mono text-[var(--muted)]">IP: {d.ip_address}</div>}
                              </td>
                              <td className="px-4 py-3 text-[var(--muted)]">
                                <span className="inline-flex px-2 py-0.5 rounded bg-[var(--muted-bg)] text-[11px] font-medium">
                                  {group}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                                  isCompliant
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                }`}>
                                  {String(statusText).replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-[var(--muted)] text-[11px]">
                                {lastConn ? new Date(lastConn).toLocaleString() : '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => setSelectedDevice(d)}
                                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                                >
                                  Inspect
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: APPLICATIONS TABLE */}
            {activeTab === 'applications' && (
              <div className="border border-[var(--card-border)] rounded-xl overflow-hidden">
                {filteredApps.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[var(--muted)]">
                    {searchQuery ? 'No applications match your search query.' : 'No applications found in API response.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[480px]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-[var(--muted-bg)] border-b border-[var(--card-border)] z-10">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)]">Application Name</th>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)]">Package / Bundle ID</th>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)]">Platform</th>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)]">Version</th>
                          <th className="px-4 py-3 font-semibold text-[var(--muted)]">Category</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--card-border)]">
                        {filteredApps.map((a, idx) => (
                          <tr key={a.id || idx} className="hover:bg-[var(--muted-bg)]/60 transition-colors">
                            <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                              {a.name || a.app_name || 'Unknown Application'}
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px] text-[var(--muted)]">
                              {a.package_name || a.bundle_id || '—'}
                            </td>
                            <td className="px-4 py-3 text-[var(--muted)] capitalize">
                              {a.platform || a.os_type || '—'}
                            </td>
                            <td className="px-4 py-3 text-[var(--muted)]">
                              {a.version || a.app_version || '—'}
                            </td>
                            <td className="px-4 py-3 text-[var(--muted)]">
                              <span className="inline-flex px-2 py-0.5 rounded bg-[var(--muted-bg)] text-[10px] font-medium">
                                {a.category || 'General'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: RAW JSON RESPONSE */}
            {activeTab === 'raw' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>Showing complete raw response payload from Scale Fusion API</span>
                  <span>{formattedJson.split('\n').length} lines</span>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-[var(--card-border)] bg-[var(--muted-bg)]">
                  <pre className="p-4 text-xs font-mono text-[var(--foreground)] overflow-auto max-h-[500px] leading-relaxed whitespace-pre-wrap break-all">
                    {formattedJson || 'No JSON response data'}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Device Detail Inspect Modal */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[var(--foreground)] text-base">
                  {selectedDevice.name || selectedDevice.device_name || 'Device Details'}
                </h3>
                <p className="text-xs text-[var(--muted)]">Scale Fusion Device Record</p>
              </div>
              <button
                onClick={() => setSelectedDevice(null)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] p-1 rounded-lg hover:bg-[var(--card-border)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-[var(--muted-bg)] p-3 rounded-xl border border-[var(--card-border)]">
                  <span className="text-[var(--muted)] font-medium">Device ID</span>
                  <p className="font-semibold text-[var(--foreground)] mt-0.5">{selectedDevice.id || selectedDevice.device_id || '—'}</p>
                </div>
                <div className="bg-[var(--muted-bg)] p-3 rounded-xl border border-[var(--card-border)]">
                  <span className="text-[var(--muted)] font-medium">Model</span>
                  <p className="font-semibold text-[var(--foreground)] mt-0.5">{selectedDevice.model || selectedDevice.model_name || '—'}</p>
                </div>
                <div className="bg-[var(--muted-bg)] p-3 rounded-xl border border-[var(--card-border)]">
                  <span className="text-[var(--muted)] font-medium">OS / Platform</span>
                  <p className="font-semibold text-[var(--foreground)] mt-0.5">{selectedDevice.os || selectedDevice.platform || '—'} {selectedDevice.os_version ? `(${selectedDevice.os_version})` : ''}</p>
                </div>
                <div className="bg-[var(--muted-bg)] p-3 rounded-xl border border-[var(--card-border)]">
                  <span className="text-[var(--muted)] font-medium">Serial Number</span>
                  <p className="font-semibold text-[var(--foreground)] mt-0.5 font-mono">{selectedDevice.serial_number || '—'}</p>
                </div>
                <div className="bg-[var(--muted-bg)] p-3 rounded-xl border border-[var(--card-border)]">
                  <span className="text-[var(--muted)] font-medium">Policy / Group</span>
                  <p className="font-semibold text-[var(--foreground)] mt-0.5">{selectedDevice.policy_name || selectedDevice.group_name || '—'}</p>
                </div>
                <div className="bg-[var(--muted-bg)] p-3 rounded-xl border border-[var(--card-border)]">
                  <span className="text-[var(--muted)] font-medium">Compliance State</span>
                  <p className="font-semibold text-[var(--foreground)] mt-0.5 capitalize">{selectedDevice.compliance_state || selectedDevice.compliance_status || (selectedDevice.compliant ? 'Compliant' : 'Non-compliant')}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider mb-2">Raw Device JSON</h4>
                <pre className="p-3 bg-[var(--muted-bg)] text-[11px] font-mono rounded-xl border border-[var(--card-border)] overflow-auto max-h-60 leading-relaxed text-[var(--foreground)]">
                  {JSON.stringify(selectedDevice, null, 2)}
                </pre>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-[var(--card-border)] bg-[var(--muted-bg)] flex justify-end">
              <button
                onClick={() => setSelectedDevice(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
