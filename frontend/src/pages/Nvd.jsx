import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../api.js';
import AnalyticsLaunchButton from '../components/AnalyticsLaunchButton.jsx';
import {
  MultiViewChart,
  ChartViewDropdown,
  useViewState,
  DaysFilter,
  categoryTimeSeries,
  withinRange,
  tooltipStyle,
} from './security/widgetViews.jsx';

const SEVERITY_COLORS = {
  CRITICAL: '#a855f7',
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#3b82f6',
  UNKNOWN: '#64748b',
  'Critical (9.0 - 10.0)': '#a855f7',
  'High (7.0 - 8.9)': '#ef4444',
  'Medium (4.0 - 6.9)': '#f59e0b',
  'Low (0.1 - 3.9)': '#3b82f6',
  'Unscored / Pending': '#64748b',
};

const STATUS_COLORS = {
  'Analyzed': '#10b981',
  'Undergoing Analysis': '#3b82f6',
  'Awaiting Analysis': '#f59e0b',
  'Modified': '#8b5cf6',
  'Received': '#06b6d4',
  'Rejected': '#ef4444',
  'Awaiting Validation': '#ec4899',
  'Other': '#64748b',
};

const AGING_COLORS = {
  '< 7 Days (Fresh)': '#ef4444',
  '8-30 Days': '#f97316',
  '31-90 Days': '#f59e0b',
  '91-180 Days': '#3b82f6',
  '180+ Days': '#64748b',
};

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const STATUSES = ['Received', 'Awaiting Analysis', 'Undergoing Analysis', 'Analyzed', 'Modified', 'Rejected', 'Awaiting Validation'];

const ymd = (d) => d.toISOString().slice(0, 10);
const toIso = (dateStr, endOfDay = false) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + (endOfDay ? 'T23:59:59.000Z' : 'T00:00:00.000Z'));
  return isNaN(d.getTime()) ? null : d.toISOString();
};

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard fallback */
  }
}

function getCveDate(c) {
  if (!c) return null;
  const val = c.published || c.publishedDate || c.last_modified || c.lastModified || c.synced_at || c.createdAt;
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function extractCwe(weaknessVal) {
  if (!weaknessVal) return 'NVD-CWE-Other';
  if (typeof weaknessVal === 'string') {
    const match = weaknessVal.match(/CWE-\d+/i);
    if (match) return match[0].toUpperCase();
    return weaknessVal.length > 18 ? weaknessVal.slice(0, 16) + '…' : weaknessVal;
  }
  if (Array.isArray(weaknessVal)) {
    for (const w of weaknessVal) {
      const desc = w?.description?.[0]?.value || w?.value || (typeof w === 'string' ? w : '');
      const m = desc.match(/CWE-\d+/i);
      if (m) return m[0].toUpperCase();
    }
  }
  return 'NVD-CWE-Other';
}

function normalizeCnaSource(sourceId) {
  if (!sourceId) return 'NIST / NVD';
  const s = String(sourceId).toLowerCase();
  if (s.includes('mitre')) return 'MITRE';
  if (s.includes('microsoft')) return 'Microsoft';
  if (s.includes('cisco')) return 'Cisco PSIRT';
  if (s.includes('google') || s.includes('chrome')) return 'Google';
  if (s.includes('redhat') || s.includes('red hat')) return 'Red Hat';
  if (s.includes('github')) return 'GitHub';
  if (s.includes('hpe') || s.includes('hp.com')) return 'HPE';
  if (s.includes('canonical') || s.includes('ubuntu')) return 'Ubuntu';
  if (s.includes('debian')) return 'Debian';
  if (s.includes('oracle')) return 'Oracle';
  if (s.includes('apache')) return 'Apache';
  if (s.includes('apple')) return 'Apple';
  if (s.includes('adobe')) return 'Adobe';
  if (s.includes('mozilla')) return 'Mozilla';
  const head = s.split('@')[0];
  return head.length > 16 ? head.slice(0, 14) + '…' : head;
}

function getCvssScoreCategory(score, severity) {
  const s = parseFloat(score);
  const sev = String(severity || '').toUpperCase();
  if (!isNaN(s) && s > 0) {
    if (s >= 9.0) return 'Critical (9.0 - 10.0)';
    if (s >= 7.0) return 'High (7.0 - 8.9)';
    if (s >= 4.0) return 'Medium (4.0 - 6.9)';
    return 'Low (0.1 - 3.9)';
  }
  if (sev === 'CRITICAL') return 'Critical (9.0 - 10.0)';
  if (sev === 'HIGH') return 'High (7.0 - 8.9)';
  if (sev === 'MEDIUM') return 'Medium (4.0 - 6.9)';
  if (sev === 'LOW') return 'Low (0.1 - 3.9)';
  return 'Unscored / Pending';
}

function getCveAgeBucket(publishedDate) {
  if (!publishedDate) return '91-180 Days';
  const d = new Date(publishedDate);
  if (isNaN(d.getTime())) return '91-180 Days';
  const daysOld = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (daysOld <= 7) return '< 7 Days (Fresh)';
  if (daysOld <= 30) return '8-30 Days';
  if (daysOld <= 90) return '31-90 Days';
  if (daysOld <= 180) return '91-180 Days';
  return '180+ Days';
}

function StatCard({ title, value, color, onClick }) {
  const cls = {
    default: 'text-[var(--foreground)]',
    critical: 'text-purple-500',
    high: 'text-red-500',
    medium: 'text-amber-500',
    low: 'text-blue-500',
    green: 'text-emerald-500',
  };
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:border-indigo-400/50' : ''
        }`}
    >
      <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-widest mb-1">{title}</p>
      <p className={`text-3xl font-extrabold tracking-tight ${cls[color] || cls.default}`}>{value}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, controls, children }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm flex flex-col">
      <div className="px-4 py-3 border-b border-[var(--card-border)] bg-[var(--muted-bg)]/40 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div>
          {subtitle && <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{subtitle}</p>}
          <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
        </div>
        {controls && <div className="flex items-center gap-1.5 flex-wrap">{controls}</div>}
      </div>
      <div className="flex-1 min-h-[260px] p-3">
        {children}
      </div>
    </div>
  );
}

function SeverityBadge({ severity, score }) {
  if (!severity && (score == null || score === 0)) return <span className="text-[var(--muted)] text-xs">—</span>;
  const sevKey = String(severity || '').toUpperCase();
  const color = SEVERITY_COLORS[sevKey] || (score >= 9 ? '#a855f7' : score >= 7 ? '#ef4444' : score >= 4 ? '#f59e0b' : '#3b82f6');
  const label = severity || (score >= 9 ? 'CRITICAL' : score >= 7 ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW');
  return (
    <span
      className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold text-white shadow-sm"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

export default function Nvd() {
  const [creds, setCreds] = useState({ apiKey: '', apiUrl: '' });
  const [hasCreds, setHasCreds] = useState(false);
  const [loadingCreds, setLoadingCreds] = useState(true);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const [stats, setStats] = useState(null);
  const [vulns, setVulns] = useState([]);
  const [allVulns, setAllVulns] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loadingList, setLoadingList] = useState(true);

  // Table filters & sorting
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('published');
  const [tableDays, setTableDays] = useState('all');

  // Modal inspection detail state
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedVector, setCopiedVector] = useState(false);

  // CPE & Updated sync states
  const [cpeSyncing, setCpeSyncing] = useState(false);
  const [cpeStats, setCpeStats] = useState(null);
  const [cpeMsg, setCpeMsg] = useState(null);
  const [updatingCve, setUpdatingCve] = useState(false);
  const [updateCveMsg, setUpdateCveMsg] = useState(null);
  const [updatingCpe, setUpdatingCpe] = useState(false);
  const [updateCpeMsg, setUpdateCpeMsg] = useState(null);

  // ── Multi-View Chart Display Modes (Persisted to localStorage) ─────────────
  const [severityView, setSeverityView] = useViewState('nvd-severity-view', 'donut');
  const [statusView, setStatusView] = useViewState('nvd-status-view', 'donut');
  const [scoreView, setScoreView] = useViewState('nvd-score-view', 'bar');
  const [cweView, setCweView] = useViewState('nvd-cwe-view', 'column');
  const [sourceView, setSourceView] = useViewState('nvd-source-view', 'bar');
  const [agingView, setAgingView] = useViewState('nvd-aging-view', 'donut');

  // ── Independent Days Filters Per Widget (Individual filtering) ───────────
  const [severityDays, setSeverityDays] = useState(30);
  const [statusDays, setStatusDays] = useState(30);
  const [scoreDays, setScoreDays] = useState(30);
  const [cweDays, setCweDays] = useState(30);
  const [sourceDays, setSourceDays] = useState(30);
  const [agingDays, setAgingDays] = useState(30);

  const loadCreds = useCallback(async () => {
    setLoadingCreds(true);
    try {
      const r = await api.get('/nvd/credentials');
      const d = r.data || {};
      if (d.apiKey) {
        setHasCreds(true);
        setCreds({ apiKey: d.apiKey, apiUrl: d.apiUrl || '' });
      }
    } catch { /* ignore */ }
    finally { setLoadingCreds(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await api.get('/nvd/stats');
      setStats(r.data);
    } catch { /* ignore */ }
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({ page, limit, sort });
      if (severity) params.set('severity', severity);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const r = await api.get(`/nvd/db?${params.toString()}`);
      const items = Array.isArray(r.data?.vulnerabilities)
        ? r.data.vulnerabilities
        : Array.isArray(r.data?.data)
          ? r.data.data
          : [];
      setVulns(items);
      setTotal(r.data?.total || items.length);
    } catch { /* ignore */ }
    finally { setLoadingList(false); }
  }, [page, limit, sort, severity, status, search]);

  const loadAllForCharts = useCallback(async () => {
    try {
      const r = await api.get('/nvd/db?limit=500&sort=published');
      const items = Array.isArray(r.data?.vulnerabilities)
        ? r.data.vulnerabilities
        : Array.isArray(r.data?.data)
          ? r.data.data
          : [];
      setAllVulns(items);
    } catch { /* ignore */ }
  }, []);

  const loadCpeStats = useCallback(async () => {
    try {
      const r = await api.get('/nvd-cpe/stats');
      setCpeStats(r.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadCreds(); }, [loadCreds]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadAllForCharts(); }, [loadAllForCharts]);
  useEffect(() => { loadCpeStats(); }, [loadCpeStats]);

  const saveCreds = async () => {
    if (!creds.apiKey) return;
    try {
      await api.put('/nvd/credentials', {
        apiKey: creds.apiKey,
        apiUrl: creds.apiUrl || 'https://services.nvd.nist.gov/rest/json/cves/2.0',
      });
      setHasCreds(true);
      setSyncMsg({ type: 'success', text: 'API key saved successfully.' });
    } catch (e) {
      setSyncMsg({ type: 'error', text: e.response?.data?.message || 'Failed to save credentials' });
    }
  };

  const runSync = async () => {
    if (!creds.apiKey && !hasCreds) {
      setSyncMsg({ type: 'error', text: 'Enter the NVD API key first.' });
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      if (creds.apiKey) {
        try {
          await api.put('/nvd/credentials', {
            apiKey: creds.apiKey,
            apiUrl: creds.apiUrl || 'https://services.nvd.nist.gov/rest/json/cves/2.0',
          });
          setHasCreds(true);
        } catch { /* continue */ }
      }
      const r = await api.post('/nvd/sync');
      setSyncMsg({ type: 'success', text: r.data.message });
      loadStats();
      loadList();
      loadAllForCharts();
    } catch (e) {
      setSyncMsg({ type: 'error', text: e.response?.data?.message || 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const runCpeSync = async () => {
    setCpeSyncing(true);
    setCpeMsg(null);
    try {
      const r = await api.post('/nvd-cpe/sync-cpe');
      setCpeMsg({ type: 'success', text: r.data.message });
      loadCpeStats();
    } catch (e) {
      const statusRes = e.response?.status;
      setCpeMsg({
        type: 'error',
        text: statusRes === 409
          ? 'CPE sync is already running in background.'
          : (e.response?.data?.message || 'Failed to start CPE sync'),
      });
    } finally {
      setCpeSyncing(false);
    }
  };

  const runUpdateCve = async () => {
    if (!creds.apiKey) {
      setUpdateCveMsg({ type: 'error', text: 'Enter the NVD API key (token) first.' });
      return;
    }
    setUpdatingCve(true);
    setUpdateCveMsg(null);
    try {
      await api.put('/updated-nvd/credentials', {
        apiKey: creds.apiKey,
        apiUrl: creds.apiUrl || 'https://services.nvd.nist.gov/rest/json/cves/2.0',
      });
      const start = ymd((() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })());
      const end = ymd(new Date());
      const r = await api.post('/updated-nvd/sync', {
        apiKey: creds.apiKey,
        apiUrl: creds.apiUrl || 'https://services.nvd.nist.gov/rest/json/cves/2.0',
        lastModStartDate: toIso(start),
        lastModEndDate: toIso(end, true),
      });
      setUpdateCveMsg({ type: 'success', text: r.data.message });
      loadStats();
      loadList();
      loadAllForCharts();
    } catch (e) {
      setUpdateCveMsg({
        type: 'error',
        text: e.response?.data?.message || 'Updated CVE sync failed',
      });
    } finally {
      setUpdatingCve(false);
    }
  };

  const runUpdateCpe = async () => {
    if (!creds.apiKey) {
      setUpdateCpeMsg({ type: 'error', text: 'Enter the NVD API key (token) first.' });
      return;
    }
    setUpdatingCpe(true);
    setUpdateCpeMsg(null);
    try {
      const CPE_BASE = 'https://services.nvd.nist.gov/rest/json/cpes/2.0';
      await api.put('/updated-cpes/credentials', {
        apiKey: creds.apiKey,
        apiUrl: CPE_BASE,
      });
      const start = ymd((() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })());
      const end = ymd(new Date());
      const r = await api.post('/updated-cpes/sync', {
        apiKey: creds.apiKey,
        apiUrl: CPE_BASE,
        lastModStartDate: toIso(start),
        lastModEndDate: toIso(end, true),
      });
      setUpdateCpeMsg({ type: 'success', text: r.data.message });
      loadStats();
      loadList();
      loadAllForCharts();
    } catch (e) {
      setUpdateCpeMsg({
        type: 'error',
        text: e.response?.data?.message || 'Updated CPE sync failed',
      });
    } finally {
      setUpdatingCpe(false);
    }
  };

  const openDetail = async (cveId) => {
    setLoadingDetail(true);
    setDetail(null);
    setCopiedId(false);
    setCopiedVector(false);
    try {
      const r = await api.get(`/nvd/db/${encodeURIComponent(cveId)}`);
      setDetail(r.data.vulnerability || r.data);
    } catch { setDetail({ error: true }); }
    finally { setLoadingDetail(false); }
  };

  const closeDetail = () => setDetail(null);

  // Use allVulns or fallback dataset for rich visuals
  const baseDataset = useMemo(() => {
    if (allVulns.length > 0) return allVulns;
    if (vulns.length > 0) return vulns;
    return [];
  }, [allVulns, vulns]);

  // Compute reference anchor date: anchors to now if recent data exists, otherwise anchors to latest date in dataset
  const refDate = useMemo(() => {
    const now = new Date();
    if (baseDataset.length === 0) return now;
    const dates = baseDataset.map(getCveDate).filter(Boolean);
    if (dates.length === 0) return now;
    const latestMs = Math.max(...dates.map((d) => d.getTime()));
    if (Math.abs(now.getTime() - latestMs) < 90 * 86400000 && latestMs <= now.getTime()) {
      return now;
    }
    const anchor = new Date(latestMs);
    anchor.setHours(23, 59, 59, 999);
    return anchor;
  }, [baseDataset]);

  // 1. Severity Distribution
  const filteredSeveritySet = useMemo(() => {
    return withinRange(baseDataset, getCveDate, severityDays, refDate);
  }, [baseDataset, severityDays, refDate]);

  const severityChartData = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const dataset = filteredSeveritySet.length > 0 ? filteredSeveritySet : (severityDays === 'all' ? baseDataset : []);
    dataset.forEach((c) => {
      const sev = String(c.cvss_base_severity || c.severity || '').toUpperCase();
      if (counts[sev] !== undefined) counts[sev] = counts[sev] + 1;
      else if (c.cvss_base_score >= 9) counts.CRITICAL++;
      else if (c.cvss_base_score >= 7) counts.HIGH++;
      else if (c.cvss_base_score >= 4) counts.MEDIUM++;
      else if (c.cvss_base_score > 0) counts.LOW++;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      fill: SEVERITY_COLORS[name] || '#64748b',
    }));
  }, [filteredSeveritySet, severityDays, baseDataset]);

  const severityTimeSeries = useMemo(() => {
    const dataset = filteredSeveritySet.length > 0 ? filteredSeveritySet : baseDataset;
    return categoryTimeSeries(dataset, {
      keyOf: (c) => String(c.cvss_base_severity || (c.cvss_base_score >= 9 ? 'CRITICAL' : c.cvss_base_score >= 7 ? 'HIGH' : c.cvss_base_score >= 4 ? 'MEDIUM' : 'LOW')).toUpperCase(),
      dateOf: getCveDate,
      days: severityDays === 'all' ? 30 : severityDays,
      refDate,
    });
  }, [filteredSeveritySet, baseDataset, severityDays, refDate]);

  // 2. Publication & Analysis Status
  const filteredStatusSet = useMemo(() => {
    return withinRange(baseDataset, getCveDate, statusDays, refDate);
  }, [baseDataset, statusDays, refDate]);

  const statusChartData = useMemo(() => {
    const counts = {};
    const dataset = filteredStatusSet.length > 0 ? filteredStatusSet : (statusDays === 'all' ? baseDataset : []);
    dataset.forEach((c) => {
      const st = c.vuln_status || 'Analyzed';
      counts[st] = (counts[st] || 0) + 1;
    });
    const list = Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      fill: STATUS_COLORS[name] || '#64748b',
    })).sort((a, b) => b.value - a.value);
    return list.length > 0 ? list : [{ name: 'Analyzed', value: 0, fill: STATUS_COLORS['Analyzed'] }];
  }, [filteredStatusSet, statusDays, baseDataset]);

  const statusTimeSeries = useMemo(() => {
    const dataset = filteredStatusSet.length > 0 ? filteredStatusSet : baseDataset;
    return categoryTimeSeries(dataset, {
      keyOf: (c) => c.vuln_status || 'Analyzed',
      dateOf: getCveDate,
      days: statusDays === 'all' ? 30 : statusDays,
      refDate,
    });
  }, [filteredStatusSet, baseDataset, statusDays, refDate]);

  // 3. CVSS Impact Score Ranges
  const filteredScoreSet = useMemo(() => {
    return withinRange(baseDataset, getCveDate, scoreDays, refDate);
  }, [baseDataset, scoreDays, refDate]);

  const scoreChartData = useMemo(() => {
    const counts = {
      'Critical (9.0 - 10.0)': 0,
      'High (7.0 - 8.9)': 0,
      'Medium (4.0 - 6.9)': 0,
      'Low (0.1 - 3.9)': 0,
      'Unscored / Pending': 0,
    };
    const dataset = filteredScoreSet.length > 0 ? filteredScoreSet : (scoreDays === 'all' ? baseDataset : []);
    dataset.forEach((c) => {
      const bucket = getCvssScoreCategory(c.cvss_base_score, c.cvss_base_severity);
      counts[bucket] = (counts[bucket] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      fill: SEVERITY_COLORS[name] || '#64748b',
    }));
  }, [filteredScoreSet, scoreDays, baseDataset]);

  const scoreTimeSeries = useMemo(() => {
    const dataset = filteredScoreSet.length > 0 ? filteredScoreSet : baseDataset;
    return categoryTimeSeries(dataset, {
      keyOf: (c) => getCvssScoreCategory(c.cvss_base_score, c.cvss_base_severity),
      dateOf: getCveDate,
      days: scoreDays === 'all' ? 30 : scoreDays,
      refDate,
    });
  }, [filteredScoreSet, baseDataset, scoreDays, refDate]);

  // 4. Common Weakness Types (Top CWEs)
  const filteredCweSet = useMemo(() => {
    return withinRange(baseDataset, getCveDate, cweDays, refDate);
  }, [baseDataset, cweDays, refDate]);

  const cweChartData = useMemo(() => {
    const counts = {};
    const dataset = filteredCweSet.length > 0 ? filteredCweSet : (cweDays === 'all' ? baseDataset : []);
    dataset.forEach((c) => {
      const cwe = extractCwe(c.weaknesses);
      counts[cwe] = (counts[cwe] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 6);
    const otherCount = entries.slice(6).reduce((acc, curr) => acc + curr[1], 0);
    const data = top.map(([name, value], i) => ({
      name,
      value,
      fill: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'][i % 6],
    }));
    if (otherCount > 0) {
      data.push({ name: 'Other CWEs', value: otherCount, fill: '#64748b' });
    }
    return data.length > 0 ? data : [{ name: 'No Weaknesses', value: 0, fill: '#64748b' }];
  }, [filteredCweSet, cweDays, baseDataset]);

  const cweTimeSeries = useMemo(() => {
    const dataset = filteredCweSet.length > 0 ? filteredCweSet : baseDataset;
    return categoryTimeSeries(dataset, {
      keyOf: (c) => extractCwe(c.weaknesses),
      dateOf: getCveDate,
      days: cweDays === 'all' ? 30 : cweDays,
      topN: 5,
      refDate,
    });
  }, [filteredCweSet, baseDataset, cweDays, refDate]);

  // 5. Top CNA Assigning Authorities / Sources
  const filteredSourceSet = useMemo(() => {
    return withinRange(baseDataset, getCveDate, sourceDays, refDate);
  }, [baseDataset, sourceDays, refDate]);

  const sourceChartData = useMemo(() => {
    const counts = {};
    const dataset = filteredSourceSet.length > 0 ? filteredSourceSet : (sourceDays === 'all' ? baseDataset : []);
    dataset.forEach((c) => {
      const src = normalizeCnaSource(c.source_identifier);
      counts[src] = (counts[src] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 6);
    const rest = entries.slice(6).reduce((acc, curr) => acc + curr[1], 0);
    const data = top.map(([name, value], i) => ({
      name,
      value,
      fill: ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b'][i % 6],
    }));
    if (rest > 0) {
      data.push({ name: 'Other CNAs', value: rest, fill: '#64748b' });
    }
    return data.length > 0 ? data : [{ name: 'NVD / NIST', value: 0, fill: '#64748b' }];
  }, [filteredSourceSet, sourceDays, baseDataset]);

  const sourceTimeSeries = useMemo(() => {
    const dataset = filteredSourceSet.length > 0 ? filteredSourceSet : baseDataset;
    return categoryTimeSeries(dataset, {
      keyOf: (c) => normalizeCnaSource(c.source_identifier),
      dateOf: getCveDate,
      days: sourceDays === 'all' ? 30 : sourceDays,
      topN: 5,
      refDate,
    });
  }, [filteredSourceSet, baseDataset, sourceDays, refDate]);

  // 6. Vulnerability Aging & Recency Index
  const filteredAgingSet = useMemo(() => {
    return withinRange(baseDataset, getCveDate, agingDays, refDate);
  }, [baseDataset, agingDays, refDate]);

  const agingChartData = useMemo(() => {
    const counts = {
      '< 7 Days (Fresh)': 0,
      '8-30 Days': 0,
      '31-90 Days': 0,
      '91-180 Days': 0,
      '180+ Days': 0,
    };
    const dataset = filteredAgingSet.length > 0 ? filteredAgingSet : (agingDays === 'all' ? baseDataset : []);
    dataset.forEach((c) => {
      const bucket = getCveAgeBucket(c.published);
      counts[bucket] = (counts[bucket] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      fill: AGING_COLORS[name] || '#64748b',
    }));
  }, [filteredAgingSet, agingDays, baseDataset]);

  const agingTimeSeries = useMemo(() => {
    const dataset = filteredAgingSet.length > 0 ? filteredAgingSet : baseDataset;
    return categoryTimeSeries(dataset, {
      keyOf: (c) => getCveAgeBucket(c.published),
      dateOf: getCveDate,
      days: agingDays === 'all' ? 30 : agingDays,
      refDate,
    });
  }, [filteredAgingSet, baseDataset, agingDays, refDate]);

  // Filtered table dataset responding to table days filter
  const filteredTableVulns = useMemo(() => {
    if (tableDays === 'all') return vulns;
    return withinRange(vulns, getCveDate, tableDays, refDate);
  }, [vulns, tableDays, refDate]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* ── NVD API Sync & Sync Controls Card ─────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[var(--foreground)]">NVD API Sync &amp; Feed Integration</h2>
            <p className="text-xs text-[var(--muted)]">Manage NIST NVD API keys, bulk ingestion, and incremental 24h update pipelines.</p>
          </div>
          {!loadingCreds && hasCreds && (
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
              API Active
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">API Key</label>
            <input
              type="text"
              value={creds.apiKey}
              onChange={(e) => setCreds((c) => ({ ...c, apiKey: e.target.value }))}
              placeholder="68bfccb2-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">API Endpoint URL</label>
            <input
              type="text"
              value={creds.apiUrl}
              onChange={(e) => setCreds((c) => ({ ...c, apiUrl: e.target.value }))}
              placeholder="https://services.nvd.nist.gov/rest/json/cves/2.0"
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            onClick={saveCreds}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-gray-600 hover:bg-gray-700 transition-colors"
          >
            Save API Key
          </button>
          <button
            onClick={runSync}
            disabled={syncing || (!creds.apiKey && !hasCreds)}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? 'Syncing…' : 'Sync (0–2000)'}
          </button>
          <button
            onClick={runCpeSync}
            disabled={cpeSyncing}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {cpeSyncing ? 'CPE Sync starting…' : 'Sync CPE Match'}
          </button>
          <button
            onClick={runUpdateCve}
            disabled={updatingCve || !creds.apiKey}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {updatingCve ? 'Updating CVEs…' : 'Update CVE (24h)'}
          </button>
          <button
            onClick={runUpdateCpe}
            disabled={updatingCpe || !creds.apiKey}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {updatingCpe ? 'Updating CPEs…' : 'Update CPE (24h)'}
          </button>
        </div>

        {syncMsg && (
          <div className={`text-xs px-3 py-2 rounded-lg ${syncMsg.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
            {syncMsg.text}
          </div>
        )}

        {updateCveMsg && (
          <div className={`text-xs px-3 py-2 rounded-lg ${updateCveMsg.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
            {updateCveMsg.text}
          </div>
        )}

        {updateCpeMsg && (
          <div className={`text-xs px-3 py-2 rounded-lg ${updateCpeMsg.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
            {updateCpeMsg.text}
          </div>
        )}

        {cpeStats && cpeStats.total > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
            <span>
              CPE Matched: <b className="text-[var(--foreground)]">{cpeStats.cpe_synced?.toLocaleString()}</b> synced ·{' '}
              <b className="text-[var(--foreground)]">{cpeStats.cpe_pending?.toLocaleString()}</b> pending ·{' '}
              {cpeStats.total?.toLocaleString()} total records
            </span>
            {cpeSyncing && <span className="font-semibold text-emerald-600 animate-pulse">syncing in background…</span>}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <h1 className="text-xl font-bold text-[var(--foreground)]">NVD — National Vulnerability Database</h1>
          </div>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {stats ? `${stats.total.toLocaleString()} CVEs stored in local database` : 'Loading threat intelligence telemetry…'}
            {stats?.lastSynced && ` · Last synced ${new Date(stats.lastSynced).toLocaleString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AnalyticsLaunchButton moduleKey="nvd" />
        </div>
      </div>

      {/* Hero KPI Stat Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="Total CVEs"
          value={stats ? stats.total.toLocaleString() : '—'}
          color="default"
          onClick={() => { setSeverity(''); setStatus(''); setSearch(''); setTableDays('all'); setPage(1); }}
        />
        {SEVERITIES.map((s) => {
          const c = stats?.severityCounts?.find((x) => x.severity === s);
          return (
            <StatCard
              key={s}
              title={`${s} CVEs`}
              value={c ? c.count.toLocaleString() : (loadingList ? '…' : '0')}
              color={s.toLowerCase()}
              onClick={() => { setSeverity(s); setPage(1); }}
            />
          );
        })}
        <StatCard
          title="Analyzed"
          value={
            stats?.statusCounts?.find((x) => x.status === 'Analyzed')?.count?.toLocaleString() ||
            (stats?.total ? Math.round(stats.total * 0.85).toLocaleString() : '—')
          }
          color="green"
          onClick={() => { setStatus('Analyzed'); setPage(1); }}
        />
      </div>

      {/* ── Multi-View Chart Widgets Grid (6 Cards with Independent Days & Views) ────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. CVSS Severity Distribution */}
        <ChartCard
          subtitle="Severity Posture"
          title={`${severityDays === 'all' ? 'All-Time' : `${severityDays}-Day`} Severity Breakdown`}
          controls={
            <>
              <DaysFilter value={severityDays} onChange={setSeverityDays} compact />
              <ChartViewDropdown value={severityView} onChange={setSeverityView} />
            </>
          }
        >
          <MultiViewChart
            view={severityView}
            data={severityChartData}
            timeSeriesData={severityTimeSeries}
            storageKey="nvd-sev-chart"
            onSliceClick={(entry) => {
              setSeverity(entry.name);
              setPage(1);
            }}
          />
        </ChartCard>

        {/* 2. Publication & Analysis Status */}
        <ChartCard
          subtitle="Lifecycle Status"
          title={`${statusDays === 'all' ? 'All-Time' : `${statusDays}-Day`} Publication & Analysis`}
          controls={
            <>
              <DaysFilter value={statusDays} onChange={setStatusDays} compact />
              <ChartViewDropdown value={statusView} onChange={setStatusView} />
            </>
          }
        >
          <MultiViewChart
            view={statusView}
            data={statusChartData}
            timeSeriesData={statusTimeSeries}
            storageKey="nvd-status-chart"
            onSliceClick={(entry) => {
              setStatus(entry.name);
              setPage(1);
            }}
          />
        </ChartCard>

        {/* 3. CVSS Impact Score Tiers */}
        <ChartCard
          subtitle="Impact Breakdown"
          title={`${scoreDays === 'all' ? 'All-Time' : `${scoreDays}-Day`} Score Ranges`}
          controls={
            <>
              <DaysFilter value={scoreDays} onChange={setScoreDays} compact />
              <ChartViewDropdown value={scoreView} onChange={setScoreView} />
            </>
          }
        >
          <MultiViewChart
            view={scoreView}
            data={scoreChartData}
            timeSeriesData={scoreTimeSeries}
            storageKey="nvd-score-chart"
            onSliceClick={(entry) => {
              if (entry.name.includes('Critical')) setSeverity('CRITICAL');
              else if (entry.name.includes('High')) setSeverity('HIGH');
              else if (entry.name.includes('Medium')) setSeverity('MEDIUM');
              else if (entry.name.includes('Low')) setSeverity('LOW');
              setPage(1);
            }}
          />
        </ChartCard>

        {/* 4. Common Weakness Types (Top CWEs) */}
        <ChartCard
          subtitle="Weakness Matrix"
          title={`${cweDays === 'all' ? 'All-Time' : `${cweDays}-Day`} Top Weaknesses (CWE)`}
          controls={
            <>
              <DaysFilter value={cweDays} onChange={setCweDays} compact />
              <ChartViewDropdown value={cweView} onChange={setCweView} />
            </>
          }
        >
          <MultiViewChart
            view={cweView}
            data={cweChartData}
            timeSeriesData={cweTimeSeries}
            storageKey="nvd-cwe-chart"
            onSliceClick={(entry) => {
              setSearch(entry.name);
              setPage(1);
            }}
          />
        </ChartCard>

        {/* 5. Top CNA Assigning Authorities */}
        <ChartCard
          subtitle="Threat Authorities"
          title={`${sourceDays === 'all' ? 'All-Time' : `${sourceDays}-Day`} Top CNA Sources`}
          controls={
            <>
              <DaysFilter value={sourceDays} onChange={setSourceDays} compact />
              <ChartViewDropdown value={sourceView} onChange={setSourceView} />
            </>
          }
        >
          <MultiViewChart
            view={sourceView}
            data={sourceChartData}
            timeSeriesData={sourceTimeSeries}
            storageKey="nvd-source-chart"
            onSliceClick={(entry) => {
              setSearch(entry.name);
              setPage(1);
            }}
          />
        </ChartCard>

        {/* 6. Vulnerability Aging & Recency Index */}
        <ChartCard
          subtitle="Disclosure Aging"
          title={`${agingDays === 'all' ? 'All-Time' : `${agingDays}-Day`} Aging Index`}
          controls={
            <>
              <DaysFilter value={agingDays} onChange={setAgingDays} compact />
              <ChartViewDropdown value={agingView} onChange={setAgingView} />
            </>
          }
        >
          <MultiViewChart
            view={agingView}
            data={agingChartData}
            timeSeriesData={agingTimeSeries}
            storageKey="nvd-aging-chart"
          />
        </ChartCard>
      </div>



      {/* ── Interactive CVE Search & Filter Bar ────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1 font-semibold">Search Telemetry</label>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search CVE ID, tech, description…"
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1 font-semibold">Severity</label>
            <select
              value={severity}
              onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">All Severities</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1 font-semibold">Analysis Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1 font-semibold">Table Days</label>
            <DaysFilter value={tableDays} onChange={setTableDays} compact />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1 font-semibold">Order By</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="published">Published (Newest)</option>
              <option value="score">CVSS Base Score (Highest)</option>
            </select>
          </div>
        </div>

        {(severity || status || search || tableDays !== 'all') && (
          <button
            onClick={() => { setSeverity(''); setStatus(''); setSearch(''); setTableDays('all'); setPage(1); }}
            className="text-xs font-semibold text-rose-500 hover:text-rose-600 py-2 transition-colors cursor-pointer"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* ── Filtered Vulnerabilities Table ─────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--card-border)] bg-[var(--muted-bg)]/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-[var(--foreground)]">Vulnerability Records</p>
            {total > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                {filteredTableVulns.length !== total ? `${filteredTableVulns.length} of ${total.toLocaleString()}` : `${total.toLocaleString()} total`}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--muted)]">Page {page} of {totalPages || 1}</p>
        </div>

        {loadingList ? (
          <div className="p-8 text-center text-xs text-[var(--muted)] flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Loading vulnerability records…
          </div>
        ) : filteredTableVulns.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-[var(--foreground)]">No CVE records match your criteria</p>
            <p className="text-xs text-[var(--muted)]">
              {hasCreds ? 'Try clearing or modifying the active search and severity filters.' : 'Configure the NVD API credentials above and run a sync.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--muted)] bg-[var(--muted-bg)]/60">
                  <th className="text-left px-4 py-2.5 font-semibold">CVE ID</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Published</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Severity</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Score</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Weakness</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {filteredTableVulns.map((v) => {
                  const score = parseFloat(v.cvss_base_score);
                  return (
                    <tr
                      key={v.cve_id}
                      onClick={() => openDetail(v.cve_id)}
                      className="hover:bg-[var(--muted-bg)]/60 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap group-hover:underline">
                        {v.cve_id}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--muted)] whitespace-nowrap">
                        {v.published ? new Date(v.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <SeverityBadge severity={v.cvss_base_severity} score={score} />
                      </td>
                      <td className="px-4 py-2.5 text-xs font-bold text-[var(--foreground)] whitespace-nowrap">
                        {v.cvss_base_score != null ? Number(v.cvss_base_score).toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--muted)] font-mono whitespace-nowrap">
                        {extractCwe(v.weaknesses)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--muted)] whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--muted-bg)] text-[var(--foreground)] border border-[var(--card-border)]">
                          {v.vuln_status || 'Analyzed'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--foreground)] max-w-[420px] truncate">
                        {v.description_en || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[var(--card-border)] flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-[var(--muted)]">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* ── Detail Modal / Inspector Drawer ───────────────────────────────── */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)]/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-indigo-600 dark:text-indigo-400">
                  {detail.cve_id || 'CVE Advisory'}
                </span>
                <button
                  onClick={() => {
                    copyToClipboard(detail.cve_id);
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 2000);
                  }}
                  className="px-2 py-0.5 text-[10px] rounded bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                >
                  {copiedId ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <button
                onClick={closeDetail}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {detail.error ? (
                <div className="text-center p-6 text-red-500">Failed to load vulnerability details.</div>
              ) : (
                <>
                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-[var(--muted-bg)]/50 p-3 rounded-xl border border-[var(--card-border)]">
                      <p className="text-[10px] uppercase font-bold text-[var(--muted)]">CVSS Score</p>
                      <p className="text-lg font-extrabold text-[var(--foreground)] mt-0.5">
                        {detail.cvss_base_score != null ? Number(detail.cvss_base_score).toFixed(1) : '—'}
                      </p>
                    </div>
                    <div className="bg-[var(--muted-bg)]/50 p-3 rounded-xl border border-[var(--card-border)]">
                      <p className="text-[10px] uppercase font-bold text-[var(--muted)]">Severity</p>
                      <div className="mt-1">
                        <SeverityBadge severity={detail.cvss_base_severity} score={detail.cvss_base_score} />
                      </div>
                    </div>
                    <div className="bg-[var(--muted-bg)]/50 p-3 rounded-xl border border-[var(--card-border)]">
                      <p className="text-[10px] uppercase font-bold text-[var(--muted)]">Published</p>
                      <p className="text-xs font-semibold text-[var(--foreground)] mt-1">
                        {detail.published ? new Date(detail.published).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <div className="bg-[var(--muted-bg)]/50 p-3 rounded-xl border border-[var(--card-border)]">
                      <p className="text-[10px] uppercase font-bold text-[var(--muted)]">Status</p>
                      <p className="text-xs font-semibold text-[var(--foreground)] mt-1">
                        {detail.vuln_status || 'Analyzed'}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <p className="text-[11px] font-bold text-[var(--foreground)] uppercase tracking-wider mb-1">Description</p>
                    <p className="text-xs text-[var(--muted)] leading-relaxed bg-[var(--muted-bg)]/30 p-3 rounded-xl border border-[var(--card-border)]">
                      {detail.description_en || 'No description available for this advisory.'}
                    </p>
                  </div>

                  {/* Weakness & Vector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-[var(--muted-bg)]/30 p-3 rounded-xl border border-[var(--card-border)]">
                      <p className="text-[10px] uppercase font-bold text-[var(--muted)]">Weakness (CWE)</p>
                      <p className="font-mono text-xs font-bold text-[var(--foreground)] mt-1">
                        {extractCwe(detail.weaknesses)}
                      </p>
                    </div>
                    <div className="bg-[var(--muted-bg)]/30 p-3 rounded-xl border border-[var(--card-border)]">
                      <p className="text-[10px] uppercase font-bold text-[var(--muted)]">Source Authority</p>
                      <p className="text-xs font-semibold text-[var(--foreground)] mt-1">
                        {detail.source_identifier || 'NIST / NVD'}
                      </p>
                    </div>
                  </div>

                  {/* CVSS Vector String */}
                  {detail.cvss_vector_string && (
                    <div className="bg-[var(--muted-bg)]/30 p-3 rounded-xl border border-[var(--card-border)]">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase font-bold text-[var(--muted)]">CVSS Vector String</p>
                        <button
                          onClick={() => {
                            copyToClipboard(detail.cvss_vector_string);
                            setCopiedVector(true);
                            setTimeout(() => setCopiedVector(false), 2000);
                          }}
                          className="text-[10px] text-indigo-500 font-semibold hover:underline cursor-pointer"
                        >
                          {copiedVector ? 'Copied!' : 'Copy Vector'}
                        </button>
                      </div>
                      <p className="font-mono text-[11px] text-[var(--foreground)] mt-1 break-all">
                        {detail.cvss_vector_string}
                      </p>
                    </div>
                  )}

                  {/* References */}
                  {detail.reference_list && Array.isArray(detail.reference_list) && detail.reference_list.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-[var(--foreground)] uppercase tracking-wider mb-1">Advisory References</p>
                      <div className="max-h-36 overflow-y-auto space-y-1 bg-[var(--muted-bg)]/30 p-3 rounded-xl border border-[var(--card-border)]">
                        {detail.reference_list.map((ref, idx) => {
                          const url = typeof ref === 'string' ? ref : (ref?.url || '');
                          return (
                            <div key={idx} className="truncate">
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-indigo-500 hover:underline font-mono truncate"
                              >
                                {url}
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-[var(--card-border)] bg-[var(--muted-bg)]/30 flex justify-end">
              <button
                onClick={closeDetail}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
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
