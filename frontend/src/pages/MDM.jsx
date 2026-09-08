import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, AreaChart, Area, Legend } from 'recharts';
import AnalyticsLaunchButton from '../components/AnalyticsLaunchButton.jsx';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';
import { CompareRangeSelector, ChartViewDropdown, useViewState, withinRange, MultiViewChart } from './security/widgetViews.jsx';

const tooltipStyle = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12 };

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];
const CATEGORY_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

// ── Category Time Series Chart (for multi-line/area views) ─────────────────────

function CategoryTimeSeriesChart({ timeSeriesData, type = 'line', storageKey = 'chart' }) {
  const { data, categories, colors } = timeSeriesData;
  if (!data || data.length === 0 || categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[80px] px-4 text-center">
        <p className="text-sm text-[var(--muted)]">No data available</p>
      </div>
    );
  }
  const isArea = type === 'area';
  const Chart = isArea ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={Math.max(0, Math.floor(data.length / 7))} tickFormatter={(v) => v.slice(5)} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {categories.map((cat, i) => {
          const color = colors[i] || CATEGORY_COLORS[i % CATEGORY_COLORS.length];
          if (isArea) {
            const gradientId = `areaGrad-${storageKey}-${i}`;
            return (
              <Area
                key={cat}
                type="monotone"
                dataKey={cat}
                name={cat}
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={{ r: 2, fill: color }}
                activeDot={{ r: 4, cursor: 'pointer' }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
              </Area>
            );
          }
          return (
            <Line
              key={cat}
              type="monotone"
              dataKey={cat}
              name={cat}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 2, fill: color }}
              activeDot={{ r: 4, cursor: 'pointer' }}
            />
          );
        })}
      </Chart>
    </ResponsiveContainer>
  );
}

// Builds per-category time series data for multi-line/area charts.
function categoryTimeSeries(items, { keyOf, dateOf, days = 30, refDate }) {
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let ref = refDate || new Date();
  let start = new Date(ref);
  start.setDate(start.getDate() - days);

  // Fall back to latest observed date if current window is empty
  const dates = items
    .map((item) => { const d = dateOf(item); return d && !isNaN(d.getTime()) ? d : null; })
    .filter(Boolean);
  if (dates.length > 0) {
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
    const hasInWindow = dates.some((d) => d >= start && d <= ref);
    if (!hasInWindow) {
      ref = new Date(latest);
      ref.setDate(ref.getDate() + 1);
      start = new Date(ref);
      start.setDate(start.getDate() - days);
    }
  }

  // Collect all categories and build per-day buckets
  const categories = new Set();
  const dayBuckets = {};

  items.forEach((item) => {
    const k = keyOf(item);
    if (!k) return;
    const d = dateOf(item);
    if (!d || isNaN(d.getTime())) return;
    if (d < start || d > ref) return;

    categories.add(k);
    const dk = dayKey(d);
    if (!dayBuckets[dk]) dayBuckets[dk] = {};
    dayBuckets[dk][k] = (dayBuckets[dk][k] || 0) + 1;
  });

  const catList = [...categories];
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

  // Build time series rows (one per day)
  const data = [];
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1);
  while (cur <= ref) {
    const dk = dayKey(cur);
    const row = { date: dk };
    catList.forEach((cat) => { row[cat] = (dayBuckets[dk]?.[cat]) || 0; });
    data.push(row);
    cur.setDate(cur.getDate() + 1);
  }

  return { data, categories: catList, colors: colors.slice(0, catList.length) };
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

function CardShell({ title, description, children, className = '', onHeaderClick, days, onDaysChange, view, onViewChange }) {
  return (
    <div className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm flex flex-col ${className}`}>
      <div
        className={`px-5 py-3.5 border-b border-[var(--card-border)] bg-[var(--muted-bg)] ${onHeaderClick ? 'cursor-pointer hover:bg-[var(--card-border)]/40 transition-colors' : ''}`}
        onClick={onHeaderClick}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className={`text-sm font-bold text-[var(--foreground)] ${onHeaderClick ? 'hover:underline' : ''}`}>{title}</h3>
            {description && <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onViewChange && <ChartViewDropdown value={view} onChange={onViewChange} compact />}
            {onDaysChange && <CompareRangeSelector value={days} onChange={onDaysChange} />}
          </div>
        </div>
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

  // Days filter state for each chart
  const [osDays, setOsDays] = useState(30);
  const [complianceDays, setComplianceDays] = useState(30);
  const [deviceTypeDays, setDeviceTypeDays] = useState(30);
  const [platformDays, setPlatformDays] = useState(30);

  // View type state for each chart
  const [osView, setOsView] = useViewState('mdm:os', 'donut');
  const [complianceView, setComplianceView] = useViewState('mdm:compliance', 'donut');
  const [deviceTypeView, setDeviceTypeView] = useViewState('mdm:deviceType', 'donut');
  const [platformView, setPlatformView] = useViewState('mdm:platform', 'donut');

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

  // Helper to filter items by days based on a date field
  const filterByDays = (items, dateField, days) => {
    if (!items || items.length === 0) return [];
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    return items.filter((item) => {
      const d = item[dateField] ? new Date(item[dateField]) : null;
      return d && !isNaN(d.getTime()) && d >= start && d <= now;
    });
  };

  // Filtered data by days
  const filteredDevicesOs = useMemo(() => filterByDays(devices, 'last_reported', osDays), [devices, osDays]);
  const filteredDevicesCompliance = useMemo(() => filterByDays(devices, 'last_reported', complianceDays), [devices, complianceDays]);
  const filteredDevicesType = useMemo(() => filterByDays(devices, 'last_reported', deviceTypeDays), [devices, deviceTypeDays]);
  const filteredAppsPlatform = useMemo(() => filterByDays(apps, 'updated_at', platformDays), [apps, platformDays]);

  const osCounts = {};
  filteredDevicesOs.forEach((d) => {
    const os = d.os_name || d.os_type || d.platform || d.os || 'Unknown';
    osCounts[os] = (osCounts[os] || 0) + 1;
  });
  const osData = Object.entries(osCounts).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));

  const compliantCount = filteredDevicesCompliance.filter((d) => d.compliant === true).length;
  const nonCompliantCount = filteredDevicesCompliance.length - compliantCount;
  const complianceData = filteredDevicesCompliance.length === 0 ? [] : [
    { name: 'Compliant', value: compliantCount, fill: '#10b981' },
    { name: 'Non-compliant', value: nonCompliantCount, fill: '#ef4444' },
  ];

  const deviceTypeCounts = {};
  filteredDevicesType.forEach((d) => {
    const type = d.device_type || 'unknown';
    deviceTypeCounts[type] = (deviceTypeCounts[type] || 0) + 1;
  });
  const deviceTypeData = Object.entries(deviceTypeCounts).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));

  const STALE_DAYS = 7;
  const staleDevices = devices
    .filter((d) => d.last_reported && (Date.now() - new Date(d.last_reported).getTime()) > STALE_DAYS * 24 * 60 * 60 * 1000)
    .sort((a, b) => new Date(a.last_reported) - new Date(b.last_reported));

  const platformCounts = {};
  filteredAppsPlatform.forEach((a) => {
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

  // Category time series data for Line/Area views
  const osTimeSeries = useMemo(() => {
    if (!devices || devices.length === 0) return null;
    return categoryTimeSeries(devices, {
      keyOf: (d) => d.os_name || d.os_type || d.platform || d.os || 'Unknown',
      dateOf: (d) => d.last_reported ? new Date(d.last_reported) : null,
      days: osDays,
    });
  }, [devices, osDays]);

  const complianceTimeSeries = useMemo(() => {
    if (!devices || devices.length === 0) return null;
    return categoryTimeSeries(devices, {
      keyOf: (d) => d.compliant === true ? 'Compliant' : 'Non-compliant',
      dateOf: (d) => d.last_reported ? new Date(d.last_reported) : null,
      days: complianceDays,
    });
  }, [devices, complianceDays]);

  const deviceTypeTimeSeries = useMemo(() => {
    if (!devices || devices.length === 0) return null;
    return categoryTimeSeries(devices, {
      keyOf: (d) => d.device_type || 'unknown',
      dateOf: (d) => d.last_reported ? new Date(d.last_reported) : null,
      days: deviceTypeDays,
    });
  }, [devices, deviceTypeDays]);

  const platformTimeSeries = useMemo(() => {
    if (!apps || apps.length === 0) return null;
    return categoryTimeSeries(apps, {
      keyOf: (a) => a.platform || 'unknown',
      dateOf: (a) => a.updated_at ? new Date(a.updated_at) : null,
      days: platformDays,
    });
  }, [apps, platformDays]);

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
            {devicesLoading ? <WidgetSkeleton variant="table" /> : devices.length === 0 ? <Empty msg="No devices found — configure & sync Hexnode in Settings" /> : (
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

        <CardShell title="Device OS / Platform Breakdown" className="h-[420px]"
          days={osDays} onDaysChange={setOsDays} view={osView} onViewChange={setOsView}>
          <div className="h-full p-3">
            {devicesLoading ? <WidgetSkeleton variant="table" /> : osData.length === 0 ? <Empty msg="No device data" /> : (
              (osView === 'line' || osView === 'area') && osTimeSeries ? (
                <CategoryTimeSeriesChart timeSeriesData={osTimeSeries} type={osView} storageKey="os" />
              ) : (
                <MultiViewChart
                  data={osData}
                  viewType={osView}
                  onItemClick={(d) => navigate('/mdm/detail', { state: { dataset: 'devices', filterId: 'os', value: d.name, title: `Devices — ${d.name}` } })}
                  barColor="#3b82f6"
                />
              )
            )}
          </div>
        </CardShell>
      </div>

      {/* Compliance Status + Device Type Breakdown + Stale Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardShell title="Compliance Status" className="h-[340px]"
          days={complianceDays} onDaysChange={setComplianceDays} view={complianceView} onViewChange={setComplianceView}>
          <div className="h-full p-3">
            {devicesLoading ? <WidgetSkeleton variant="table" /> : complianceData.length === 0 ? <Empty msg="No device data" /> : (
              (complianceView === 'line' || complianceView === 'area') && complianceTimeSeries ? (
                <CategoryTimeSeriesChart timeSeriesData={complianceTimeSeries} type={complianceView} storageKey="compliance" />
              ) : (
                <MultiViewChart
                  data={complianceData}
                  viewType={complianceView}
                  onItemClick={(d) => navigate('/mdm/detail', { state: { dataset: 'devices', filterId: 'compliant', value: d.name === 'Compliant', title: `${d.name} Devices` } })}
                  barColor="#3b82f6"
                />
              )
            )}
          </div>
        </CardShell>

        <CardShell title="Device Type Breakdown" className="h-[340px]"
          days={deviceTypeDays} onDaysChange={setDeviceTypeDays} view={deviceTypeView} onViewChange={setDeviceTypeView}>
          <div className="h-full p-3">
            {devicesLoading ? <WidgetSkeleton variant="table" /> : deviceTypeData.length === 0 ? <Empty msg="No device data" /> : (
              (deviceTypeView === 'line' || deviceTypeView === 'area') && deviceTypeTimeSeries ? (
                <CategoryTimeSeriesChart timeSeriesData={deviceTypeTimeSeries} type={deviceTypeView} storageKey="deviceType" />
              ) : (
                <MultiViewChart
                  data={deviceTypeData}
                  viewType={deviceTypeView}
                  barColor="#3b82f6"
                />
              )
            )}
          </div>
        </CardShell>

        <CardShell title="Stale Devices" description={`(inactive for >${STALE_DAYS}d)`} className="h-[340px]">
          <div className="h-full overflow-auto">
            {devicesLoading ? <WidgetSkeleton variant="table" /> : staleDevices.length === 0 ? <Empty msg="No stale devices — all reporting recently" /> : (
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
            {appsLoading ? <WidgetSkeleton variant="table" /> : apps.length === 0 ? <Empty msg="No applications found — configure & sync Hexnode in Settings" /> : (
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
        <CardShell title="App Platform Breakdown" className="h-[420px]"
          days={platformDays} onDaysChange={setPlatformDays} view={platformView} onViewChange={setPlatformView}>
          <div className="h-full grid grid-cols-1 gap-2 p-3">
            <div className="h-full min-w-0">
              <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider text-center mb-1">Platform</p>
              {appsLoading ? <WidgetSkeleton variant="table" /> : platformData.length === 0 ? <Empty msg="No app data" /> : (
                (platformView === 'line' || platformView === 'area') && platformTimeSeries ? (
                  <CategoryTimeSeriesChart timeSeriesData={platformTimeSeries} type={platformView} storageKey="platform" />
                ) : (
                  <MultiViewChart
                    data={platformData}
                    viewType={platformView}
                    onItemClick={(d) => navigate('/mdm/detail', { state: { dataset: 'apps', filterId: 'platform', value: d.name, title: `Apps — ${d.name}` } })}
                    barColor="#3b82f6"
                  />
                )
              )}
            </div>
          </div>
        </CardShell>

        <CardShell title="Blacklisted / Mandatory Apps" className="h-[420px]">
          <div className="h-full overflow-auto">
            {flaggedAppsLoading ? <WidgetSkeleton variant="table" /> : flaggedApps.length === 0 ? <Empty msg="No blacklisted or mandatory apps found" /> : (
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
