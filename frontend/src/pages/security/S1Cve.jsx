import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api.js';
import WidgetSkeleton from '../dashboard/WidgetSkeleton.jsx';
import {
  MultiViewChart, ChartViewDropdown, DaysFilter, DEFAULT_DAY_OPTIONS, useViewState, rangeComparison, withinRange,
  categoryTimeSeries, KpiCard, DeltaBadge, parseRecordDate, getMaxMs,
} from './widgetViews.jsx';

const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];
const COLORS = { CRITICAL: '#a855f7', HIGH: '#ef4444', MEDIUM: '#eab308', LOW: '#3b82f6', UNKNOWN: '#64748b' };

function shortName(v) {
  return v?.length > 18 ? v.slice(0, 18) + '...' : (v || '');
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function ChartCard({ title, controls, children }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
        {controls && <div className="flex items-center gap-2 flex-wrap">{controls}</div>}
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">{label}</span>
      <span className="text-xs font-semibold text-[var(--foreground)] mt-0.5">{value ?? '—'}</span>
    </div>
  );
}

export default function S1Cve() {
  const navigate = useNavigate();
  const [apps, setApps]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [selectedDays, setSelectedDays] = useState('all');

  // Chart-type view per card — same dropdown as Threats.jsx, persisted to
  // localStorage so the chosen view survives a page refresh.
  const [severityView, setSeverityView] = useViewState('cveSeverity', 'donut');
  const [scoreView, setScoreView]       = useViewState('cveScore', 'donut');
  const [riskyView, setRiskyView]       = useViewState('cveRisky', 'column');
  const [agingView, setAgingView]       = useViewState('cveAging', 'column');
  const [impactView, setImpactView]     = useViewState('cveImpact', 'column');
  const [vendorView, setVendorView]     = useViewState('cveVendor', 'bar');

  // Rolling comparison window (days) for the Line/Area/Comparison views.
  const [severityDays, setSeverityDays] = useState(30);
  const [scoreDays, setScoreDays]       = useState(30);
  const [riskyDays, setRiskyDays]       = useState(30);
  const [agingDays, setAgingDays]       = useState(30);
  const [impactDays, setImpactDays]     = useState(30);
  const [vendorDays, setVendorDays]     = useState(30);

  useEffect(() => {
    api.get('/sentinelone/db/application-cve')
      .then((r) => {
        setApps(r.data?.data || r.data?.cves || []);
        if (r.data?.lastSyncedAt) setLastSync(r.data.lastSyncedAt);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const dateOfCve = (r) => parseRecordDate(r.detectionDate);

  const goToDetail = (state) => navigate('/security/detail', { state: { ...state, days: selectedDays } });

  const computeCveMetrics = (rows) => {
    if (!rows || rows.length === 0) {
      return {
        totalApplications: 0,
        totalCves: 0,
        critical: 0,
        high: 0,
        medium: 0,
        totalEndpoints: 0,
        avgScore: 0,
      };
    }
    const appSet = new Set();
    const cveSet = new Set();
    const endpointSet = new Set();
    let critical = 0, high = 0, medium = 0;
    let scoreSum = 0, scoreCount = 0;

    rows.forEach((r) => {
      if (!r) return;
      const app = r.applicationName || r.application;
      if (app) appSet.add(app);
      if (r.cveId) cveSet.add(r.cveId);
      const ep = r.endpointId || r.endpointName;
      if (ep) endpointSet.add(ep);
      const sev = (r.severity || '').toUpperCase();
      if (sev === 'CRITICAL') critical++;
      else if (sev === 'HIGH') high++;
      else if (sev === 'MEDIUM') medium++;
      const s = parseFloat(r.baseScore);
      if (!isNaN(s)) {
        scoreSum += s;
        scoreCount++;
      }
    });

    return {
      totalApplications: appSet.size,
      totalCves: cveSet.size || rows.length,
      critical,
      high,
      medium,
      totalEndpoints: endpointSet.size,
      avgScore: scoreCount > 0 ? Number((scoreSum / scoreCount).toFixed(1)) : 0,
    };
  };

  const { current: windowCurrent, previous: windowPrevious, isFiltered } = useMemo(() => {
    if (!apps || apps.length === 0) return { current: [], previous: [], isFiltered: false };
    if (selectedDays === 'all' || !selectedDays) {
      return { current: apps, previous: [], isFiltered: false };
    }
    const numDays = parseInt(selectedDays, 10);
    if (isNaN(numDays) || numDays <= 0) {
      return { current: apps, previous: [], isFiltered: false };
    }

    const current = withinRange(apps, dateOfCve, numDays);

    const validDates = apps.map(dateOfCve).filter(Boolean);
    let ref = new Date();
    if (validDates.length > 0) {
      const maxMs = getMaxMs(validDates);
      if (validDates.every((d) => d.getTime() < ref.getTime() - numDays * 86400000)) {
        ref = new Date(maxMs);
        ref.setHours(23, 59, 999);
      }
    }
    const curStart = new Date(ref.getTime() - numDays * 86400000);
    curStart.setHours(0, 0, 0, 0);
    const prevStart = new Date(curStart.getTime() - numDays * 86400000);

    const previous = apps.filter((r) => {
      const d = dateOfCve(r);
      if (!d) return false;
      return d >= prevStart && d < curStart;
    });

    return { current, previous, isFiltered: true };
  }, [apps, selectedDays]);

  const curKpis = useMemo(() => computeCveMetrics(windowCurrent), [windowCurrent]);
  const prevKpis = useMemo(() => isFiltered ? computeCveMetrics(windowPrevious) : null, [windowPrevious, isFiltered]);

  const filteredApps = windowCurrent;
  const filteredRawCves = windowCurrent;

  // Per-card day-window slices so the day selector filters the base chart
  // data (not just the comparison series) for every comparison-capable card.
  const cveByWindow = useMemo(() => ({
    severity: withinRange(filteredApps, dateOfCve, severityDays),
    score: withinRange(filteredApps, dateOfCve, scoreDays),
    risky: withinRange(filteredApps, dateOfCve, riskyDays),
    aging: withinRange(filteredApps, dateOfCve, agingDays),
    impact: withinRange(filteredApps, dateOfCve, impactDays),
    vendor: withinRange(filteredApps, dateOfCve, vendorDays),
  }), [filteredApps, severityDays, scoreDays, riskyDays, agingDays, impactDays, vendorDays]);

  // Build a per-application aggregate (same shape as `dashboardData`'s appMap)
  // from a raw slice of CVE rows.
  const aggregateApps = (rows) => {
    const appMap = {};
    rows.forEach((r) => {
      const key = r.applicationName || r.application || 'Unknown';
      if (!appMap[key]) appMap[key] = {
        name: key, vendor: r.applicationVendor || '',
        cves: new Set(), endpoints: new Set(), severities: [], scores: [],
        daysDetected: r.daysDetected || 0,
      };
      const a = appMap[key];
      if (r.cveId) a.cves.add(r.cveId);
      if (r.endpointId || r.endpointName) a.endpoints.add(r.endpointId || r.endpointName);
      if (r.severity) a.severities.push((r.severity || '').toUpperCase());
      const s = parseFloat(r.baseScore) || 0;
      if (!isNaN(s)) a.scores.push(s);
      a.daysDetected = Math.max(a.daysDetected, r.daysDetected || 0);
    });
    const SEVER_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
    return Object.values(appMap).map((a) => ({
      name: a.name, vendor: a.vendor,
      cveCount: a.cves.size,
      endpointCount: a.endpoints.size,
      highestSeverity: SEVER_ORDER.find((s) => a.severities.includes(s)) || 'UNKNOWN',
      highestNvdBaseScore: a.scores.length ? Math.max(...a.scores) : 0,
      daysDetected: a.daysDetected,
    }));
  };

  const dashboardData = useMemo(() => {
    // Raw records: one row per CVE per endpoint
    // Fields: cveId, applicationName, applicationVendor, severity, baseScore,
    //         daysDetected, endpointName, endpointId, detectionDate, status

    const apps = filteredApps;
    const sc = (r) => parseFloat(r.baseScore) || 0;

    // Aggregate per application
    const appMap = {};
    apps.forEach((r) => {
      const key = r.applicationName || r.application || 'Unknown';
      if (!appMap[key]) {
        appMap[key] = {
          name: key,
          vendor: r.applicationVendor || '',
          cves: new Set(),
          endpoints: new Set(),
          severities: [],
          scores: [],
          daysDetected: r.daysDetected || 0,
        };
      }
      const a = appMap[key];
      if (r.cveId) a.cves.add(r.cveId);
      if (r.endpointId || r.endpointName) a.endpoints.add(r.endpointId || r.endpointName);
      if (r.severity) a.severities.push((r.severity || '').toUpperCase());
      a.scores.push(sc(r));
      a.daysDetected = Math.max(a.daysDetected, r.daysDetected || 0);
    });

    const SEVER_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
    const appList = Object.values(appMap).map((a) => ({
      name: a.name,
      vendor: a.vendor,
      cveCount: a.cves.size,
      endpointCount: a.endpoints.size,
      highestSeverity: SEVER_ORDER.find((s) => a.severities.includes(s)) || 'UNKNOWN',
      highestNvdBaseScore: a.scores.length ? Math.max(...a.scores) : 0,
      daysDetected: a.daysDetected,
    }));

    const totalApplications = appList.length;
    const totalCves         = new Set(apps.map((r) => r.cveId).filter(Boolean)).size || apps.length;
    const totalEndpoints    = new Set(apps.map((r) => r.endpointId || r.endpointName).filter(Boolean)).size;
    const avgScore          = apps.length > 0
      ? (apps.reduce((s, r) => s + sc(r), 0) / apps.length).toFixed(1)
      : 0;

      
    const severityMap = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    cveByWindow.severity.forEach((r) => {
      const s = (r.severity || 'UNKNOWN').toUpperCase();
      if (s in severityMap) severityMap[s]++; else severityMap.UNKNOWN++;
    });
    const severityDistribution = Object.entries(severityMap)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, fill: COLORS[name] }));

    const severityAppList = aggregateApps(cveByWindow.severity);
    const topRiskyApps = [...severityAppList]
      .sort((a, b) => b.cveCount - a.cveCount)
      .slice(0, 10)
      .map((a) => ({ name: shortName(a.name), fullName: a.name, cves: a.cveCount, score: a.highestNvdBaseScore }));

    const agingBuckets = { '0-30': 0, '31-90': 0, '91-180': 0, '180+': 0 };
    cveByWindow.aging.forEach((r) => {
      const d = parseInt(r.daysDetected, 10) || 0;
      if (d <= 30)  agingBuckets['0-30']++;
      else if (d <= 90)  agingBuckets['31-90']++;
      else if (d <= 180) agingBuckets['91-180']++;
      else agingBuckets['180+']++;
    });
    const cveAging = Object.entries(agingBuckets).map(([name, count]) => ({ name, count }));

    const impactAppList = aggregateApps(cveByWindow.impact);
    const endpointImpact = [...impactAppList]
      .sort((a, b) => b.endpointCount - a.endpointCount)
      .slice(0, 10)
      .map((a) => ({ name: shortName(a.name), fullName: a.name, endpoints: a.endpointCount }));

    const scoreRangeBuckets = [
      { name: 'Low (0-3.9)',  fill: '#3b82f6', count: 0 },
      { name: 'Med (4-6.9)',  fill: '#eab308', count: 0 },
      { name: 'High (7-8.9)', fill: '#ef4444', count: 0 },
      { name: 'Crit (9-10)',  fill: '#a855f7', count: 0 },
    ];
    cveByWindow.score.forEach((r) => {
      const s = sc(r);
      if (s < 4)      scoreRangeBuckets[0].count++;
      else if (s < 7) scoreRangeBuckets[1].count++;
      else if (s < 9) scoreRangeBuckets[2].count++;
      else            scoreRangeBuckets[3].count++;
    });
    const scoreRange = scoreRangeBuckets.filter((b) => b.count > 0).map((b) => ({ name: b.name, value: b.count, fill: b.fill }));

    const vendorCounts = {};
    cveByWindow.vendor.forEach((r) => {
      const v = r.applicationVendor || '';
      if (v) vendorCounts[v] = (vendorCounts[v] || 0) + 1;
    });
    const vendorRisk = Object.entries(vendorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, cves], i) => ({ name: shortName(name), cves, fullName: name, fill: CHART_COLORS[i % CHART_COLORS.length] }));

    const statusCounts = {};
    apps.forEach((r) => { const s = r.status || 'Unknown'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
    const statusDistribution = Object.entries(statusCounts)
      .map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));

    const criticalApps = appList
      .filter((a) => a.highestSeverity === 'CRITICAL')
      .sort((a, b) => b.cveCount - a.cveCount)
      .slice(0, 6);

    // Pie chart data for SideLegendDonut
    const severityPieData = severityDistribution;
    
    const scoreRangePieData = scoreRange;
    
    const vendorPieData = vendorRisk.map((v) => ({ name: v.name, value: v.cves, fill: v.fill }));
    
    const agingPieData = cveAging.map((a, i) => ({ name: a.name, value: a.count, fill: CHART_COLORS[i % CHART_COLORS.length] }));

    return {
      totalApplications, totalCves, totalEndpoints, avgScore,
      severityMap, severityDistribution, topRiskyApps,
      cveAging, endpointImpact, scoreRange, vendorRisk, statusDistribution, criticalApps,
      severityPieData,
      scoreRangePieData,
      vendorPieData,
      agingPieData,
    };
  }, [filteredApps, cveByWindow]);

  // Current-vs-previous-month series per distribution card, so Line/Area
  // views can show the two months in different colours on the same graph.
  const raw = filteredApps; // one row per CVE record
  const rangeBucket = (s) => s < 4 ? 'Low (0-3.9)' : s < 7 ? 'Med (4-6.9)' : s < 9 ? 'High (7-8.9)' : 'Crit (9-10)';
  const agingBucket = (d) => d <= 30 ? '0-30' : d <= 90 ? '31-90' : d <= 180 ? '91-180' : '180+';

  const severityRange = useMemo(() => rangeComparison(raw, {
    keyOf: (r) => (r.severity || 'UNKNOWN').toUpperCase(), dateOf: (r) => parseDate(r.detectionDate), days: severityDays,
  }), [raw, severityDays]);
  const scoreBucketRange = useMemo(() => rangeComparison(raw, {
    keyOf: (r) => rangeBucket(parseFloat(r.baseScore) || 0), dateOf: (r) => parseDate(r.detectionDate), days: scoreDays,
  }), [raw, scoreDays]);
  const riskyRange = useMemo(() => rangeComparison(raw, {
    keyOf: (r) => r.applicationName || r.application || 'Unknown', dateOf: (r) => parseDate(r.detectionDate), days: riskyDays,
  }), [raw, riskyDays]);
  const agingRange = useMemo(() => rangeComparison(raw, {
    keyOf: (r) => agingBucket(parseInt(r.daysDetected, 10) || 0), dateOf: (r) => parseDate(r.detectionDate), days: agingDays,
  }), [raw, agingDays]);
  const impactRange = useMemo(() => rangeComparison(raw, {
    keyOf: (r) => r.applicationName || r.application || 'Unknown', dateOf: (r) => parseDate(r.detectionDate), days: impactDays,
  }), [raw, impactDays]);
  const vendorRange = useMemo(() => rangeComparison(raw, {
    keyOf: (r) => r.applicationVendor || '', dateOf: (r) => parseDate(r.detectionDate), days: vendorDays,
  }), [raw, vendorDays]);

  // Category time series for Line / Area daily trends per category
  const severityTimeSeries = useMemo(() => categoryTimeSeries(filteredApps, {
    keyOf: (r) => (r.severity || 'UNKNOWN').toUpperCase(),
    dateOf: dateOfCve,
    days: severityDays,
    colorMap: COLORS,
  }), [filteredApps, severityDays]);

  const scoreTimeSeries = useMemo(() => categoryTimeSeries(filteredApps, {
    keyOf: (r) => rangeBucket(parseFloat(r.baseScore) || 0),
    dateOf: dateOfCve,
    days: scoreDays,
    colorMap: { 'Low (0-3.9)': '#3b82f6', 'Med (4-6.9)': '#eab308', 'High (7-8.9)': '#ef4444', 'Crit (9-10)': '#a855f7' },
  }), [filteredApps, scoreDays]);

  const riskyTimeSeries = useMemo(() => categoryTimeSeries(filteredApps, {
    keyOf: (r) => r.applicationName || r.application || 'Unknown',
    dateOf: dateOfCve,
    days: riskyDays,
    topN: 10,
  }), [filteredApps, riskyDays]);

  const agingTimeSeries = useMemo(() => categoryTimeSeries(filteredApps, {
    keyOf: (r) => agingBucket(parseInt(r.daysDetected, 10) || 0),
    dateOf: dateOfCve,
    days: agingDays,
  }), [filteredApps, agingDays]);

  const impactTimeSeries = useMemo(() => categoryTimeSeries(filteredApps, {
    keyOf: (r) => r.applicationName || r.application || 'Unknown',
    dateOf: dateOfCve,
    days: impactDays,
    topN: 10,
  }), [filteredApps, impactDays]);

  const vendorTimeSeries = useMemo(() => categoryTimeSeries(filteredApps, {
    keyOf: (r) => r.applicationVendor || '',
    dateOf: dateOfCve,
    days: vendorDays,
    topN: 10,
  }), [filteredApps, vendorDays]);

  if (loading) {
    return (
      <div className="p-6">
        <WidgetSkeleton variant="table" />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        </div>
        <p className="text-base font-semibold text-[var(--foreground)]">No CVE data</p>
        <p className="text-sm text-[var(--muted)] mt-1">Sync SentinelOne to populate CVE analytics</p>
      </div>
    );
  }

  const { totalApplications, totalCves, totalEndpoints, avgScore, severityMap,
          severityDistribution, topRiskyApps, cveAging, endpointImpact,
          scoreRange, vendorRisk, statusDistribution, criticalApps,
          severityPieData, scoreRangePieData, vendorPieData, agingPieData } = dashboardData;

  return (
    <div className="p-4 sm:p-6 space-y-6">

      {/* Header + Global Date Filter */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">Application CVE Analytics</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {curKpis.totalApplications} applications · {curKpis.totalCves} CVE records
            {selectedDays !== 'all' && (
              <span className="ml-2 text-indigo-500 font-medium">
                Last {selectedDays} days
              </span>
            )}
            {lastSync && <span> · Last sync: {new Date(lastSync).toLocaleString()}</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DaysFilter value={selectedDays} onChange={setSelectedDays} options={DEFAULT_DAY_OPTIONS} />
        </div>
      </div>

      {filteredApps.length === 0 ? (
        <div className="p-6 flex flex-col items-center justify-center text-center bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl">
          <p className="text-sm font-semibold text-[var(--foreground)]">No CVEs detected in the selected date range</p>
          <p className="text-xs text-[var(--muted)] mt-1">Try selecting a wider time range above.</p>
        </div>
      ) : (
      <>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <KpiCard
          title="Applications"
          value={curKpis.totalApplications}
          cur={curKpis.totalApplications}
          prev={prevKpis?.totalApplications}
          accent="#3b82f6"
          goodWhenUp={false}
        />
        <KpiCard
          title="Total CVEs"
          value={curKpis.totalCves}
          cur={curKpis.totalCves}
          prev={prevKpis?.totalCves}
          accent="#ef4444"
          goodWhenUp={false}
          onClick={() => goToDetail({ dataset: 'cve', filterId: 'all', title: 'All CVEs' })}
        />
        <KpiCard
          title="Critical Severity"
          value={curKpis.critical}
          cur={curKpis.critical}
          prev={prevKpis?.critical}
          accent="#a855f7"
          goodWhenUp={false}
          onClick={() => goToDetail({ dataset: 'cve', filterId: 'severity', value: 'CRITICAL', title: 'Critical Severity CVEs' })}
        />
        <KpiCard
          title="High Severity"
          value={curKpis.high}
          cur={curKpis.high}
          prev={prevKpis?.high}
          accent="#ef4444"
          goodWhenUp={false}
          onClick={() => goToDetail({ dataset: 'cve', filterId: 'severity', value: 'HIGH', title: 'High Severity CVEs' })}
        />
        <KpiCard
          title="Medium Severity"
          value={curKpis.medium}
          cur={curKpis.medium}
          prev={prevKpis?.medium}
          accent="#eab308"
          goodWhenUp={false}
          onClick={() => goToDetail({ dataset: 'cve', filterId: 'severity', value: 'MEDIUM', title: 'Medium Severity CVEs' })}
        />
        <KpiCard
          title="Endpoints"
          value={curKpis.totalEndpoints}
          cur={curKpis.totalEndpoints}
          prev={prevKpis?.totalEndpoints}
          accent="#3b82f6"
          goodWhenUp={false}
        />
        <KpiCard
          title="Avg Score"
          value={curKpis.avgScore}
          cur={curKpis.avgScore}
          prev={prevKpis?.avgScore}
          accent="#6366f1"
          goodWhenUp={false}
        />
      </div>

      {/* Charts 2-col grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Severity Distribution */}
        <ChartCard title="Severity Distribution" controls={<><ChartViewDropdown value={severityView} onChange={setSeverityView} /><DaysFilter value={severityDays} onChange={setSeverityDays} options={DEFAULT_DAY_OPTIONS} compact /></>}>
          <div style={{ height: 280 }}>
            <MultiViewChart
              data={severityPieData}
              viewType={severityView}
              monthlyData={severityRange}
              days={severityDays}
              timeSeriesData={severityTimeSeries}
              storageKey="cveSeverity"
              emptyLabel="No severity data"
              onItemClick={(data) => goToDetail({ dataset: 'cve', filterId: 'severity', value: data.name, title: `${data.name} Severity CVEs` })}
            />
          </div>
        </ChartCard>

        {/* Base Score Range */}
        <ChartCard title="Base Score Range" controls={<><ChartViewDropdown value={scoreView} onChange={setScoreView} /><DaysFilter value={scoreDays} onChange={setScoreDays} options={DEFAULT_DAY_OPTIONS} compact /></>}>
          <div style={{ height: 280 }}>
            <MultiViewChart
              data={scoreRangePieData}
              viewType={scoreView}
              monthlyData={scoreBucketRange}
              days={scoreDays}
              timeSeriesData={scoreTimeSeries}
              storageKey="cveScore"
              emptyLabel="No score data"
              onItemClick={(data) => goToDetail({ dataset: 'cve', filterId: 'scoreRange', value: data.name, title: `CVEs in ${data.name} score range` })}
            />
          </div>
        </ChartCard>

        {/* Top 10 Risky Applications */}
        <ChartCard title="Top 10 Risky Applications" controls={<><ChartViewDropdown value={riskyView} onChange={setRiskyView} /><DaysFilter value={riskyDays} onChange={setRiskyDays} options={DEFAULT_DAY_OPTIONS} compact /></>}>
          <div style={{ height: 300 }}>
            <MultiViewChart
              data={topRiskyApps.map((a) => ({ name: a.name, fullName: a.fullName, value: a.cves, fill: '#ef4444' }))}
              viewType={riskyView}
              monthlyData={riskyRange}
              days={riskyDays}
              timeSeriesData={riskyTimeSeries}
              storageKey="cveRisky"
              barColor="#ef4444"
              emptyLabel="No application data"
              onItemClick={(data) => goToDetail({ dataset: 'cve', filterId: 'topRiskyApp', value: data.fullName || data.name, title: `CVEs for ${data.fullName || data.name}` })}
            />
          </div>
        </ChartCard>

        {/* CVE Aging */}
        <ChartCard title="CVE Aging (Days Detected)" controls={<><ChartViewDropdown value={agingView} onChange={setAgingView} /><DaysFilter value={agingDays} onChange={setAgingDays} options={DEFAULT_DAY_OPTIONS} compact /></>}>
          <div style={{ height: 300 }}>
            <MultiViewChart
              data={cveAging.map((a, i) => ({ name: a.name, value: a.count, fill: CHART_COLORS[i % CHART_COLORS.length] }))}
              viewType={agingView}
              monthlyData={agingRange}
              days={agingDays}
              timeSeriesData={agingTimeSeries}
              storageKey="cveAging"
              barColor="#38bdf8"
              emptyLabel="No aging data"
              onItemClick={(data) => goToDetail({ dataset: 'cve', filterId: 'cveAgingBucket', value: data.name, title: `CVEs in ${data.name} days aging bucket` })}
            />
          </div>
        </ChartCard>

        {/* Endpoint Impact */}
        <ChartCard title="Endpoint Impact (Top 10)" controls={<><ChartViewDropdown value={impactView} onChange={setImpactView} /><DaysFilter value={impactDays} onChange={setImpactDays} options={DEFAULT_DAY_OPTIONS} compact /></>}>
          <div style={{ height: 300 }}>
            <MultiViewChart
              data={endpointImpact.map((a) => ({ name: a.name, fullName: a.fullName, value: a.endpoints, fill: '#22c55e' }))}
              viewType={impactView}
              monthlyData={impactRange}
              days={impactDays}
              timeSeriesData={impactTimeSeries}
              storageKey="cveImpact"
              barColor="#22c55e"
              emptyLabel="No endpoint data"
              onItemClick={(data) => goToDetail({ dataset: 'cve', filterId: 'endpointImpact', value: data.fullName || data.name, title: `CVEs for ${data.fullName || data.name}` })}
            />
          </div>
        </ChartCard>

        {/* Vendor Risk */}
        <ChartCard title="Vendor Risk (CVEs by Vendor)" controls={<><ChartViewDropdown value={vendorView} onChange={setVendorView} /><DaysFilter value={vendorDays} onChange={setVendorDays} options={DEFAULT_DAY_OPTIONS} compact /></>}>
          <div style={{ height: 300 }}>
            <MultiViewChart
              data={vendorRisk.map((v) => ({ name: v.name, fullName: v.fullName, value: v.cves, fill: v.fill }))}
              viewType={vendorView}
              monthlyData={vendorRange}
              days={vendorDays}
              timeSeriesData={vendorTimeSeries}
              storageKey="cveVendor"
              barColor="#f97316"
              emptyLabel="No vendor data"
              onItemClick={(data) => goToDetail({ dataset: 'cve', filterId: 'CVEs', value: data.fullName || data.name, title: `CVEs for vendor ${data.fullName || data.name}` })}
            />
          </div>
        </ChartCard>

      </div>

      {/* Critical Apps mini-cards */}
      {criticalApps.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-[var(--foreground)] mb-3">Critical Applications</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {criticalApps.map((app, i) => (
              <div
                key={i}
                onClick={() => goToDetail({ dataset: 'cve', filterId: 'topRiskyApp', value: app.name, title: `CVEs for ${app.name}` })}
                className="bg-[var(--card-bg)] border-l-4 border-purple-500 border border-[var(--card-border)] rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              >
                <p className="text-sm font-bold text-[var(--foreground)] truncate mb-3" title={app.name}>{app.name}</p>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                  <Info label="Severity"  value={<span className="text-purple-600 font-bold">{app.highestSeverity}</span>} />
                  <Info label="CVEs"      value={app.cveCount} />
                  <Info label="Score"     value={typeof app.highestNvdBaseScore === 'number' ? app.highestNvdBaseScore.toFixed(1) : app.highestNvdBaseScore} />
                  <Info label="Endpoints" value={app.endpointCount} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      </>
      )}

    </div>
  );
}
