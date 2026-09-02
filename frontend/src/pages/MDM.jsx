import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import AnalyticsLaunchButton from '../components/AnalyticsLaunchButton.jsx';

const tooltipStyle = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12 };

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];

function Spin() {
  return (
    <div className="flex items-center justify-center h-full min-h-[100px]">
      <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  );
}
function Empty({ msg }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[80px] px-4 text-center">
      <p className="text-sm text-[var(--muted)]">{msg}</p>
    </div>
  );
}

// Legend item component (side-by-side legend for improved donuts)
function LegendItem({ color, name, value, onClick }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-[var(--muted-bg)]/40 transition-colors cursor-pointer group"
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] font-semibold text-[var(--foreground)] group-hover:text-indigo-400 transition-colors">
        {name}
      </span>
      <span className="text-[10px] text-[var(--muted)] group-hover:text-[var(--foreground)] transition-colors">
        ({value})
      </span>
    </div>
  );
}

// Improved Donut chart with side-by-side legends (left + right)
function ImprovedDonut({ data, onSliceClick }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[260px]">
        <p className="text-sm text-[var(--muted)]">No data available</p>
      </div>
    );
  }

  const midpoint = Math.ceil(data.length / 2);
  const leftItems = data.slice(0, midpoint);
  const rightItems = data.slice(midpoint);

  return (
    <div className="flex items-center h-full min-h-[260px] w-full px-2 gap-3">
      {/* Left Legend */}
      <div className="flex flex-col gap-3 justify-center shrink-0">
        {leftItems.map((item) => (
          <LegendItem
            key={item.name}
            color={item.fill}
            name={item.name}
            value={item.value}
            onClick={() => onSliceClick && onSliceClick(item)}
          />
        ))}
      </div>

      {/* Center Chart */}
      <div className="flex-1 min-w-0 h-full min-h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="50%"
              outerRadius="80%"
              cornerRadius={10}
              paddingAngle={2}
              cursor="pointer"
              onClick={onSliceClick}
              animationBegin={0}
              animationDuration={400}
            >
              {data.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={entry.fill} stroke="var(--card-bg)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => {
                const n = Number(value);
                const total = data.reduce((s, d) => s + d.value, 0);
                return [`${n} (${Math.round((n / total) * 100)}%)`, ''];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Right Legend */}
      {rightItems.length > 0 && (
        <div className="flex flex-col gap-3 justify-center shrink-0">
          {rightItems.map((item) => (
            <LegendItem
              key={item.name}
              color={item.fill}
              name={item.name}
              value={item.value}
              onClick={() => onSliceClick && onSliceClick(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CardShell({ title, description, children, className = '', onHeaderClick }) {
  return (
    <div className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm flex flex-col ${className}`}>
      <div
        className={`px-5 py-3.5 border-b border-[var(--card-border)] bg-[var(--muted-bg)] ${onHeaderClick ? 'cursor-pointer hover:bg-[var(--card-border)]/40 transition-colors' : ''}`}
        onClick={onHeaderClick}
      >
        <h3 className={`text-sm font-bold text-[var(--foreground)] ${onHeaderClick ? 'hover:underline' : ''}`}>{title}</h3>
        {description && <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

export default function MDM() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [apps, setApps] = useState([]);
  const [appsLoading, setAppsLoading] = useState(true);

  const [flaggedApps, setFlaggedApps] = useState([]);
  const [flaggedAppsLoading, setFlaggedAppsLoading] = useState(true);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const loadDevices = () => {
    setDevicesLoading(true);
    api.get('/hexnode/db/devices')
      .then((r) => setDevices(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(() => setDevices([]))
      .finally(() => setDevicesLoading(false));
  };

  const loadApps = () => {
    setAppsLoading(true);
    api.get('/hexnode/db/applications')
      .then((r) => setApps(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(() => setApps([]))
      .finally(() => setAppsLoading(false));
  };

  const loadFlaggedApps = () => {
    setFlaggedAppsLoading(true);
    api.get('/hexnode/db/device-applications/flagged')
      .then((r) => setFlaggedApps(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(() => setFlaggedApps([]))
      .finally(() => setFlaggedAppsLoading(false));
  };

  useEffect(() => {
    loadDevices();
    loadApps();
    loadFlaggedApps();
    api.get('/hexnode/credentials').then((r) => setLastSyncedAt(r.data?.lastSyncedAt ?? null)).catch(() => {});
  }, []);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await api.post('/hexnode/sync');
      const warnings = r.data.warnings?.length ? ` ⚠ ${r.data.warnings.join('; ')}` : '';
      setSyncMsg({ text: (r.data.message || 'Sync complete') + warnings, ok: !r.data.warnings?.length });
      loadDevices();
      loadApps();
      loadFlaggedApps();
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      setSyncMsg({ text: err.response?.data?.message || 'Sync failed — configure credentials in Settings', ok: false });
    } finally {
      setSyncing(false);
    }
  };

  const osCounts = {};
  devices.forEach((d) => {
    const os = d.os_name || d.os_type || d.platform || d.os || 'Unknown';
    osCounts[os] = (osCounts[os] || 0) + 1;
  });
  const osData = Object.entries(osCounts).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));

  const compliantCount = devices.filter((d) => d.compliant === true).length;
  const nonCompliantCount = devices.length - compliantCount;
  const complianceData = devices.length === 0 ? [] : [
    { name: 'Compliant', value: compliantCount, fill: '#10b981' },
    { name: 'Non-compliant', value: nonCompliantCount, fill: '#ef4444' },
  ];

  const deviceTypeCounts = {};
  devices.forEach((d) => {
    const type = d.device_type || 'unknown';
    deviceTypeCounts[type] = (deviceTypeCounts[type] || 0) + 1;
  });
  const deviceTypeData = Object.entries(deviceTypeCounts).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));

  const STALE_DAYS = 7;
  const staleDevices = devices
    .filter((d) => d.last_reported && (Date.now() - new Date(d.last_reported).getTime()) > STALE_DAYS * 24 * 60 * 60 * 1000)
    .sort((a, b) => new Date(a.last_reported) - new Date(b.last_reported));

  const platformCounts = {};
  apps.forEach((a) => {
    const platform = a.platform || 'unknown';
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
  });
  const platformData = Object.entries(platformCounts).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));

  const categoryCounts = {};
  apps.forEach((a) => {
    const category = a.category || 'Uncategorized';
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });
  const categoryData = Object.entries(categoryCounts).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">MDM</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : 'Hexnode mobile device management'}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
        >
          {syncing ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Syncing…</> : 'Sync'}
        </button>
        <AnalyticsLaunchButton moduleKey="mdm" />
      </div>

      {syncMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          syncMsg.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                     : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>{syncMsg.text}</div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
          <p className="text-3xl font-bold text-[var(--foreground)] leading-none">{devicesLoading ? '—' : devices.length}</p>
          <p className="text-xs text-[var(--muted)] mt-1.5 font-medium">Enrolled devices</p>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
          <p className="text-3xl font-bold text-[var(--foreground)] leading-none">{appsLoading ? '—' : apps.length}</p>
          <p className="text-xs text-[var(--muted)] mt-1.5 font-medium">Applications tracked</p>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
          <p className="text-3xl font-bold text-[var(--foreground)] leading-none">{osData.length}</p>
          <p className="text-xs text-[var(--muted)] mt-1.5 font-medium">OS / platform variants</p>
        </div>
      </div>

      {/* Device Inventory + OS Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardShell title="Device Inventory" className="lg:col-span-2 h-[420px]">
          <div className="h-full overflow-auto">
            {devicesLoading ? <Spin /> : devices.length === 0 ? <Empty msg="No devices found — configure & sync Hexnode in Settings" /> : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Device</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">OS</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d, i) => {
                    const name = d.device_name || d.name || d.model || `Device ${d.id ?? i}`;
                    const os = d.os_name || d.os_type || d.platform || '—';
                    const status = d.compliance_state || d.enrollment_status || d.status || 'unknown';
                    const isGood = /compliant|active|enrolled/i.test(String(status));
                    return (
                      <tr key={i} className={`cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                        onClick={() => navigate('/mdm/detail', { state: { dataset: 'devices', filterId: 'deviceId', value: d.id, title: `Device — ${name}` } })}>
                        <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium">{name}</td>
                        <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)]">{os}</td>
                        <td className="px-4 py-2.5 border-b border-[var(--card-border)]">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${isGood ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'}`}>{String(status).replace(/_/g, ' ')}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardShell>

        <CardShell title="Device OS / Platform Breakdown" className="h-[420px]">
          <div className="h-full p-3">
            {devicesLoading ? <Spin /> : osData.length === 0 ? <Empty msg="No device data" /> : (
              <ImprovedDonut
                data={osData}
                onSliceClick={(d) => navigate('/mdm/detail', { state: { dataset: 'devices', filterId: 'os', value: d.name, title: `Devices — ${d.name}` } })}
              />
            )}
          </div>
        </CardShell>
      </div>

      {/* Compliance Status + Device Type Breakdown + Stale Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardShell title="Compliance Status" className="h-[340px]">
          <div className="h-full p-3">
            {devicesLoading ? <Spin /> : complianceData.length === 0 ? <Empty msg="No device data" /> : (
              <ImprovedDonut
                data={complianceData}
                onSliceClick={(d) => navigate('/mdm/detail', { state: { dataset: 'devices', filterId: 'compliant', value: d.name === 'Compliant', title: `${d.name} Devices` } })}
              />
            )}
          </div>
        </CardShell>

        <CardShell title="Device Type Breakdown" className="h-[340px]">
          <div className="h-full p-3">
            {devicesLoading ? <Spin /> : deviceTypeData.length === 0 ? <Empty msg="No device data" /> : (
              <ImprovedDonut data={deviceTypeData} />
            )}
          </div>
        </CardShell>

        <CardShell title="Stale Devices" description={`(inactive for >${STALE_DAYS}d)`} className="h-[340px]">
          <div className="h-full overflow-auto">
            {devicesLoading ? <Spin /> : staleDevices.length === 0 ? <Empty msg="No stale devices — all reporting recently" /> : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Device</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Last Reported</th>
                  </tr>
                </thead>
                <tbody>
                  {staleDevices.map((d, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'}>
                      <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium">{d.device_name || d.name || `Device ${d.id}`}</td>
                      <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)]">{new Date(d.last_reported).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardShell>
      </div>

      {/* Application Inventory */}
      <div className="grid grid-cols-1 gap-4">
        <CardShell title="Application Inventory" className="h-[420px]">
          <div className="h-full overflow-auto">
            {appsLoading ? <Spin /> : apps.length === 0 ? <Empty msg="No applications found — configure & sync Hexnode in Settings" /> : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Application</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Version</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((a, i) => {
                    const name = a.name || a.app_name || 'Unknown';
                    return (
                    <tr key={i} className={`cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                      onClick={() => navigate('/mdm/detail', { state: { dataset: 'apps', filterId: 'appId', value: a.id, title: `App — ${name}` } })}>
                      <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium">{name}</td>
                      <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)]">{a.version || '—'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardShell>
      </div>

      {/* App Platform/Category Breakdown + Blacklisted/Mandatory Apps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardShell title="App Platform Breakdown" className="h-[420px]">
          <div className="h-full grid grid-cols-1 gap-2 p-3">
            <div className="h-full min-w-0">
              <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider text-center mb-1">Platform</p>
              {appsLoading ? <Spin /> : platformData.length === 0 ? <Empty msg="No app data" /> : (
                <ImprovedDonut
                  data={platformData}
                  onSliceClick={(d) => navigate('/mdm/detail', { state: { dataset: 'apps', filterId: 'platform', value: d.name, title: `Apps — ${d.name}` } })}
                />
              )}
            </div>
          </div>
        </CardShell>

        <CardShell title="Blacklisted / Mandatory Apps" className="h-[420px]">
          <div className="h-full overflow-auto">
            {flaggedAppsLoading ? <Spin /> : flaggedApps.length === 0 ? <Empty msg="No blacklisted or mandatory apps found" /> : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">App</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Device ID</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {flaggedApps.map((a, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'}>
                      <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium">{a.name || 'Unknown'}</td>
                      <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)]">{a.deviceId ?? '—'}</td>
                      <td className="px-4 py-2.5 border-b border-[var(--card-border)]">
                        <div className="flex gap-1.5">
                          {a.black_listed && <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Blacklisted</span>}
                          {a.mandatory_app && <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Mandatory</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardShell>
      </div>

      {/* Placeholders — not yet connected */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['Device Location', 'Data Usage', 'App Data Usage'].map((title) => (
          <CardShell key={title} title={title} className="h-[160px]">
            <div className="h-full flex items-center justify-center px-4 text-center">
              <p className="text-xs text-[var(--muted)]">Not connected yet — {title.toLowerCase()} sync is not wired up.</p>
            </div>
          </CardShell>
        ))}
      </div>
    </div>
  );
}
