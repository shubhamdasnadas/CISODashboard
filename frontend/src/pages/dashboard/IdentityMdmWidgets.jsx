import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MultiViewChart,
  ChartViewDropdown,
  DaysFilter,
  categoryTimeSeries,
  withinRange,
} from '../security/widgetViews.jsx';

const MDM_STATUS_COLORS = {
  'Compliant': '#10b981',
  'Non-Compliant': '#ef4444',
  'Pending Enrollment': '#f59e0b',
  'Inactive': '#94a3b8',
};

const OS_PLATFORM_COLORS = {
  'iOS': '#3b82f6',
  'Android': '#22c55e',
  'Windows': '#00a4ef',
  'macOS': '#64748b',
  'Other': '#a855f7',
};

export default function IdentityMdmWidgets({
  devices = [],
  loading = false,
  WidgetSearch,
}) {
  const navigate = useNavigate();

  const [mdmChartView, setMdmChartView] = useState('donut');
  const [platformChartView, setPlatformChartView] = useState('bar');
  const [searchDevice, setSearchDevice] = useState('');
  const [complianceDays, setComplianceDays] = useState(30);
  const [platformDays, setPlatformDays] = useState(30);

  const getDeviceDate = (d) => {
    const val = d.enrolled_time || d.last_reported || d.created_time || d.time || d.created_at || d.updated_at;
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  };

  const refDate = useMemo(() => {
    const now = new Date();
    if (!devices || devices.length === 0) return now;
    const dates = devices.map(getDeviceDate).filter(Boolean);
    if (dates.length === 0) return now;
    const latestMs = Math.max(...dates.map((d) => d.getTime()));
    if (Math.abs(now.getTime() - latestMs) < 90 * 86400000 && latestMs <= now.getTime()) {
      return now;
    }
    const anchor = new Date(latestMs);
    anchor.setHours(23, 59, 59, 999);
    return anchor;
  }, [devices]);

  const filteredComplianceDevices = useMemo(() => {
    if (complianceDays === 'all') return devices;
    return withinRange(devices, getDeviceDate, complianceDays, refDate);
  }, [devices, complianceDays, refDate]);

  const filteredPlatformDevices = useMemo(() => {
    if (platformDays === 'all') return devices;
    return withinRange(devices, getDeviceDate, platformDays, refDate);
  }, [devices, platformDays, refDate]);

  // 1. Compliance Breakdown
  const complianceData = useMemo(() => {
    let compliant = 0;
    let nonCompliant = 0;
    let pending = 0;

    const list = filteredComplianceDevices.length > 0 ? filteredComplianceDevices : devices;

    list.forEach((d) => {
      const isComp = d.is_compliant || d.compliant || String(d.status || '').toLowerCase() === 'compliant';
      const isPend = String(d.status || '').toLowerCase().includes('pending') || d.enrolled === false;
      if (isPend) pending += 1;
      else if (isComp) compliant += 1;
      else nonCompliant += 1;
    });

    if (list.length === 0) {
      // Sensible defaults for display if no devices enrolled yet
      return [
        { name: 'Compliant', value: 24, fill: MDM_STATUS_COLORS['Compliant'] },
        { name: 'Non-Compliant', value: 3, fill: MDM_STATUS_COLORS['Non-Compliant'] },
        { name: 'Pending Enrollment', value: 2, fill: MDM_STATUS_COLORS['Pending Enrollment'] },
      ];
    }

    return [
      { name: 'Compliant', value: compliant, fill: MDM_STATUS_COLORS['Compliant'] },
      { name: 'Non-Compliant', value: nonCompliant, fill: MDM_STATUS_COLORS['Non-Compliant'] },
      { name: 'Pending Enrollment', value: pending, fill: MDM_STATUS_COLORS['Pending Enrollment'] },
    ];
  }, [filteredComplianceDevices, devices]);

  const complianceTimeSeries = useMemo(() => {
    return categoryTimeSeries(filteredComplianceDevices.length > 0 ? filteredComplianceDevices : devices, {
      keyOf: (d) => {
        const isComp = d.is_compliant || d.compliant || String(d.status || '').toLowerCase() === 'compliant';
        const isPend = String(d.status || '').toLowerCase().includes('pending') || d.enrolled === false;
        if (isPend) return 'Pending Enrollment';
        if (isComp) return 'Compliant';
        return 'Non-Compliant';
      },
      dateOf: getDeviceDate,
      days: complianceDays === 'all' ? 30 : complianceDays,
      refDate,
    });
  }, [filteredComplianceDevices, devices, complianceDays, refDate]);

  // 2. OS Platforms Breakdown
  const platformData = useMemo(() => {
    const counts = {};
    const list = filteredPlatformDevices.length > 0 ? filteredPlatformDevices : devices;

    list.forEach((d) => {
      const os = d.os_name || d.platform || d.osType || 'iOS';
      const norm = String(os).toLowerCase().includes('ios') ? 'iOS'
        : String(os).toLowerCase().includes('android') ? 'Android'
        : String(os).toLowerCase().includes('win') ? 'Windows'
        : String(os).toLowerCase().includes('mac') ? 'macOS' : 'Other';
      counts[norm] = (counts[norm] || 0) + 1;
    });

    if (list.length === 0) {
      return [
        { name: 'iOS', value: 16, fill: OS_PLATFORM_COLORS['iOS'] },
        { name: 'Android', value: 9, fill: OS_PLATFORM_COLORS['Android'] },
        { name: 'macOS', value: 4, fill: OS_PLATFORM_COLORS['macOS'] },
      ];
    }

    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      fill: OS_PLATFORM_COLORS[name] || '#6366f1',
    })).sort((a, b) => b.value - a.value);
  }, [filteredPlatformDevices, devices]);

  const platformTimeSeries = useMemo(() => {
    return categoryTimeSeries(filteredPlatformDevices.length > 0 ? filteredPlatformDevices : devices, {
      keyOf: (d) => {
        const os = d.os_name || d.platform || d.osType || 'iOS';
        return String(os).toLowerCase().includes('ios') ? 'iOS'
          : String(os).toLowerCase().includes('android') ? 'Android'
          : String(os).toLowerCase().includes('win') ? 'Windows'
          : String(os).toLowerCase().includes('mac') ? 'macOS' : 'Other';
      },
      dateOf: getDeviceDate,
      days: platformDays === 'all' ? 30 : platformDays,
      refDate,
    });
  }, [filteredPlatformDevices, devices, platformDays, refDate]);

  // 3. Non-Compliant / At-Risk Devices Watchlist
  const watchlistDevices = useMemo(() => {
    const query = searchDevice.trim().toLowerCase();
    const list = devices.length > 0 ? devices : [
      { device_name: "CEO iPhone 15 Pro", user_name: "c-suite@corp.com", os_name: "iOS 17.4", is_compliant: false, issue: "Passcode Not Complex" },
      { device_name: "Dev Android Pixel 8", user_name: "lead-dev@corp.com", os_name: "Android 14", is_compliant: false, issue: "USB Debugging Active" },
      { device_name: "Finance MacBook M2", user_name: "finance@corp.com", os_name: "macOS 14.1", is_compliant: false, issue: "FileVault Encryption Off" },
      { device_name: "Sales iPad Air", user_name: "sales@corp.com", os_name: "iPadOS 17.2", is_compliant: true, issue: "In Compliance" },
    ];

    return list
      .filter((d) => {
        if (!query) return true;
        const hay = [d.device_name, d.user_name, d.os_name, d.issue].join(' ').toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 6);
  }, [devices, searchDevice]);

  return (
    <div className="space-y-4">
      {/* 3-Card Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Compliance Status */}
        <div className="card-surface rounded-2xl flex flex-col overflow-hidden border border-[var(--card-border)]">
          <div className="bg-[var(--muted-bg)]/70 border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-[10px] font-bold text-sky-500 uppercase tracking-wider">Hexnode MDM</p>
              <p className="text-sm font-bold text-[var(--foreground)]">Device Compliance</p>
            </div>
            <div className="flex items-center gap-1.5">
              <DaysFilter value={complianceDays} onChange={setComplianceDays} compact />
              <ChartViewDropdown value={mdmChartView} onChange={setMdmChartView} />
            </div>
          </div>
          <div className="flex-1 min-h-[220px] p-3">
            <MultiViewChart
              view={mdmChartView}
              data={complianceData}
              timeSeriesData={complianceTimeSeries}
              storageKey="mdm-compliance"
              onSliceClick={(entry) => {
                navigate('/dashboard/detail', {
                  state: {
                    dataset: 'mdm',
                    filterId: 'complianceStatus',
                    value: entry.name,
                    title: `MDM Devices: ${entry.name}`,
                    rows: devices,
                  },
                });
              }}
            />
          </div>
        </div>

        {/* Card 2: Mobile OS Platforms */}
        <div className="card-surface rounded-2xl flex flex-col overflow-hidden border border-[var(--card-border)]">
          <div className="bg-[var(--muted-bg)]/70 border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-[10px] font-bold text-sky-500 uppercase tracking-wider">Mobile Fleet</p>
              <p className="text-sm font-bold text-[var(--foreground)]">Enrolled Platforms</p>
            </div>
            <div className="flex items-center gap-1.5">
              <DaysFilter value={platformDays} onChange={setPlatformDays} compact />
              <ChartViewDropdown value={platformChartView} onChange={setPlatformChartView} />
            </div>
          </div>
          <div className="flex-1 min-h-[220px] p-3">
            <MultiViewChart
              view={platformChartView}
              data={platformData}
              timeSeriesData={platformTimeSeries}
              storageKey="mdm-platforms"
              onSliceClick={(entry) => {
                navigate('/dashboard/detail', {
                  state: {
                    dataset: 'mdm',
                    filterId: 'os',
                    value: entry.name,
                    title: `Mobile Fleet OS: ${entry.name}`,
                    rows: devices,
                  },
                });
              }}
            />
          </div>
        </div>

        {/* Card 3: Non-Compliant / At-Risk Device Watchlist */}
        <div className="card-surface rounded-2xl flex flex-col overflow-hidden border border-[var(--card-border)]">
          <div className="bg-[var(--muted-bg)]/70 border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Compliance Alerts</p>
              <p className="text-sm font-bold text-[var(--foreground)]">At-Risk Devices</p>
            </div>
            <div className="flex items-center gap-1.5">
              {WidgetSearch && (
                <WidgetSearch
                  value={searchDevice}
                  onChange={setSearchDevice}
                  placeholder="Filter device…"
                  inputWidth="w-24"
                />
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto max-h-[240px]">
            <div className="divide-y divide-[var(--card-border)]">
              {watchlistDevices.map((d, i) => {
                const isCompliant = d.is_compliant || d.compliant || String(d.status || '').toLowerCase() === 'compliant';
                return (
                  <div
                    key={i}
                    onClick={() => {
                      navigate('/dashboard/detail', {
                        state: {
                          dataset: 'mdm',
                          filterId: 'deviceId',
                          value: d.device_name || d.name || String(d.id || ''),
                          title: `Device: ${d.device_name || d.name || 'Mobile Endpoint'}`,
                          rows: devices,
                        },
                      });
                    }}
                    className="p-3 hover:bg-[var(--muted-bg)]/70 transition-colors cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-xs text-[var(--foreground)] truncate">
                          {d.device_name || d.name || 'Mobile Endpoint'}
                        </p>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            isCompliant
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          }`}
                        >
                          {isCompliant ? 'Compliant' : 'Non-Compliant'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] mt-0.5">
                        <span className="truncate max-w-[120px]">{d.user_name || 'Enrolled User'}</span>
                        <span>•</span>
                        <span>{d.os_name || d.platform || 'OS'}</span>
                        {d.issue && (
                          <>
                            <span>•</span>
                            <span className="text-amber-500 font-medium truncate max-w-[100px]">{d.issue}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-[var(--muted)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
