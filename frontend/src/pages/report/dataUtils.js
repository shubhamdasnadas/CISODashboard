// ─── Shared data-derivation helpers for the PDF report ───────────────────────
// Pure functions only — no React/JSX. Reused by both the DOM preview and the
// @react-pdf/renderer template so the same numbers appear everywhere.

// ── Colour palettes ───────────────────────────────────────────────────────────
export const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
export const SEV_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];
export const STATE_COLORS = { new: '#ef4444', pending: '#f97316', detected: '#f59e0b', remediated: '#22c55e', closed: '#3b82f6', done: '#10b981' };
export const RISK_COLORS = {
  '5': '#7f1d1d', '4': '#ef4444', '3': '#f97316', '2': '#eab308', '1': '#22c55e', '-': '#94a3b8',
};
export const CVE_COLORS = { CRITICAL: '#a855f7', HIGH: '#ef4444', MEDIUM: '#eab308', LOW: '#3b82f6', UNKNOWN: '#64748b' };
export const SEVER_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

export const EVENT_TYPE_COLORS_RPT = {
  phishing: '#ef4444', malware: '#f97316', dlp: '#8b5cf6',
  suspicious_phishing: '#f59e0b', suspicious_malware: '#ec4899',
};
export const FALLBACK_COLORS_RPT = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

// Zoho status/priority colors
export const ZOHO_STATUS_COLORS = { Open: '#3b82f6', Closed: '#22c55e', 'On Hold': '#f59e0b', Escalated: '#ef4444', 'In Progress': '#8b5cf6', Resolved: '#10b981' };
export const ZOHO_PRIORITY_COLORS = { High: '#ef4444', Critical: '#dc2626', Medium: '#f59e0b', Low: '#22c55e' };

// ── Generic extract / parse helpers ───────────────────────────────────────────
export const toArray = (v) => {
  if (Array.isArray(v) && v.length > 0) return v;
  if (v && typeof v === 'object' && !Array.isArray(v)) return [v];
  return undefined;
};

export const parseNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

export const getFirstValue = (row, cols, fallback = '-') => {
  for (const col of cols) {
    const v = row?.[col];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return fallback;
};

export const extractTable = (raw) => {
  if (!raw) return null;
  try {
    const entry =
      toArray(raw?.report?.result?.entry) ||
      toArray(raw?.report?.result?.report?.entry) ||
      toArray(raw?.response?.result?.report?.entry) ||
      toArray(raw?.response?.result?.entry) ||
      toArray(raw?.result?.report?.entry) ||
      toArray(raw?.result?.entry) ||
      toArray(raw?.entry);
    if (entry && entry.length > 0) {
      const colSet = new Set();
      entry.forEach(item => {
        if (typeof item === 'object' && item !== null)
          Object.keys(item).forEach(k => {
            if (k === '@name') colSet.add('name');
            else if (!k.startsWith('@')) colSet.add(k);
          });
      });
      const columns = Array.from(colSet);
      const rows = entry.map(item => {
        const row = {};
        columns.forEach(col => {
          const rk = col === 'name' ? '@name' : col;
          const value = item?.[rk] ?? item?.[col];
          row[col] = typeof value === 'object' && value !== null && '#text' in value ? value['#text'] : value ?? '';
        });
        return row;
      });
      return { columns, rows };
    }
    if (Array.isArray(raw)) {
      const columns = Array.from(new Set(raw.flatMap(item => Object.keys(item || {}))));
      return { columns, rows: raw };
    }
  } catch { /* ignore */ }
  return null;
};

export const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getSumByColumn = (rows, cols) => {
  return rows.reduce((sum, row) => sum + parseNumber(getFirstValue(row, cols, 0)), 0);
};

// ── Firewall helpers ──────────────────────────────────────────────────────────
export const makeTopChartData = (rows, cols, limit = 8) => {
  const map = new Map();
  rows.forEach(row => {
    const value = String(getFirstValue(row, cols, '')).trim();
    if (!value || value === '-') return;
    const n = parseNumber(getFirstValue(row, ['count', 'nrepeat', 'nsess', 'sessions', 'threats'], 1));
    map.set(value, (map.get(value) || 0) + (n || 1));
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name: name.length > 30 ? name.slice(0, 30) + '…' : name, value }));
};

export const makeRiskTrendData = (rows) => {
  const map = new Map();
  rows.forEach(row => {
    const rawDate = getFirstValue(row, ['slabbed-receive_time', 'receive_time', 'time', 'date', 'updatedAt']);
    const date = rawDate && rawDate !== '-' ? new Date(rawDate).toLocaleDateString('en-CA') : null;
    if (!date || date === 'Invalid Date') return;
    const old = map.get(date) || { date, sessions: 0 };
    old.sessions += parseNumber(getFirstValue(row, ['nsess', 'sessions', 'session', 'count'], 1));
    map.set(date, old);
  });
  return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-14);
};

export const makeRiskDistribution = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    const risk = String(getFirstValue(row, ['risk', 'severity', 'name'], '-'));
    const count = parseNumber(getFirstValue(row, ['count', 'nrepeat', 'nsess', 'sessions'], 1));
    map.set(risk, (map.get(risk) || 0) + count);
  });
  return Array.from(map.entries())
    .map(([risk, value]) => ({
      risk,
      name: risk === '-' ? 'Unknown' : `Risk ${risk}`,
      value,
    }))
    .sort((a, b) => (b.risk === '-' ? -1 : a.risk === '-' ? 1 : Number(b.risk) - Number(a.risk)));
};

export const getSecurityScoreStatus = (score) => {
  if (score >= 80) return { label: 'Excellent', color: '#22c55e' };
  if (score >= 60) return { label: 'Good', color: '#84cc16' };
  if (score >= 40) return { label: 'Fair', color: '#f59e0b' };
  return { label: 'At Risk', color: '#ef4444' };
};

// ── Zoho helpers ─────────────────────────────────────────────────────────────
export const ZOHO_AGING_BUCKETS = ['<1h', '1-4h', '4-24h', '1-3d', '3+d'];
export const getResolutionTimeBucket = (t) => {
  const ca = t?.created_at || t?.createdTime || t?.createdAt;
  const cl = t?.closed_at || t?.closedTime || t?.closedAt || t?.closeTime || t?.close_time;
  if (!ca || !cl) return null;
  try {
    const ms = new Date(cl).getTime() - new Date(ca).getTime();
    if (ms < 3600000) return '<1h';
    if (ms < 14400000) return '1-4h';
    if (ms < 86400000) return '4-24h';
    if (ms < 259200000) return '1-3d';
    return '3+d';
  } catch { return null; }
};
export const getDeptName = (t) => t?.department?.name || t?.departmentName || 'Unknown';
export const getAssigneeName = (t) => t?.assignee?.name || t?.assigneeName || t?.owner?.name || 'Unassigned';
export const isClosedTicket = (t) => ['closed', 'technically closed', 'resolved', 'duplicate'].includes(String(t.status || '').toLowerCase());

// ── CVE helpers ──────────────────────────────────────────────────────────────
export function shortName(v, max = 18) {
  return v && v.length > max ? v.slice(0, max) + '…' : (v || '');
}

export function buildCveData(apps) {
  const sc = (r) => parseFloat(r.baseScore) || 0;

  const appMap = {};
  apps.forEach((r) => {
    const key = r.applicationName || r.application || 'Unknown';
    if (!appMap[key]) appMap[key] = { name: key, vendor: r.applicationVendor || '', cves: new Set(), endpoints: new Set(), severities: [], scores: [], daysDetected: 0 };
    const a = appMap[key];
    if (r.cveId) a.cves.add(r.cveId);
    if (r.endpointId || r.endpointName) a.endpoints.add(r.endpointId || r.endpointName);
    if (r.severity) a.severities.push(String(r.severity).toUpperCase());
    a.scores.push(sc(r));
    a.daysDetected = Math.max(a.daysDetected, r.daysDetected || 0);
  });

  const appList = Object.values(appMap).map((a) => ({
    name: a.name, vendor: a.vendor,
    cveCount: a.cves.size,
    endpointCount: a.endpoints.size,
    highestSeverity: SEVER_ORDER.find((s) => a.severities.includes(s)) || 'UNKNOWN',
    highestNvdBaseScore: a.scores.length ? Math.max(...a.scores) : 0,
    daysDetected: a.daysDetected,
  }));

  const totalCves = new Set(apps.map((r) => r.cveId).filter(Boolean)).size || apps.length;
  const totalEndpoints = new Set(apps.map((r) => r.endpointId || r.endpointName).filter(Boolean)).size;
  const avgScore = apps.length ? (apps.reduce((s, r) => s + sc(r), 0) / apps.length).toFixed(1) : 0;

  const severityMap = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
  apps.forEach((r) => { const s = String(r.severity || 'UNKNOWN').toUpperCase(); severityMap[s in severityMap ? s : 'UNKNOWN']++; });

  const severityDistribution = Object.entries(severityMap)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value, fill: CVE_COLORS[name] }));

  const topRiskyApps = [...appList].sort((a, b) => b.cveCount - a.cveCount).slice(0, 10)
    .map((a) => ({ name: shortName(a.name), fullName: a.name, cves: a.cveCount, score: a.highestNvdBaseScore }));

  const agingBuckets = { '0-30': 0, '31-90': 0, '91-180': 0, '180+': 0 };
  apps.forEach((r) => {
    const d = parseInt(r.daysDetected, 10) || 0;
    if (d <= 30) agingBuckets['0-30']++; else if (d <= 90) agingBuckets['31-90']++; else if (d <= 180) agingBuckets['91-180']++; else agingBuckets['180+']++;
  });
  const cveAging = Object.entries(agingBuckets).map(([name, count]) => ({ name, count }));

  const endpointImpact = [...appList].sort((a, b) => b.endpointCount - a.endpointCount).slice(0, 10)
    .map((a) => ({ name: shortName(a.name), endpoints: a.endpointCount }));

  const scoreRangeBuckets = [
    { name: 'Low (0-3.9)', fill: '#3b82f6', count: 0 },
    { name: 'Med (4-6.9)', fill: '#eab308', count: 0 },
    { name: 'High (7-8.9)', fill: '#ef4444', count: 0 },
    { name: 'Crit (9-10)', fill: '#a855f7', count: 0 },
  ];
  apps.forEach((r) => {
    const s = sc(r);
    if (s < 4) scoreRangeBuckets[0].count++; else if (s < 7) scoreRangeBuckets[1].count++; else if (s < 9) scoreRangeBuckets[2].count++; else scoreRangeBuckets[3].count++;
  });
  const scoreRange = scoreRangeBuckets.filter((b) => b.count > 0).map((b) => ({ name: b.name, value: b.count, fill: b.fill }));

  const vendorCounts = {};
  apps.forEach((r) => { const v = r.applicationVendor || ''; if (v) vendorCounts[v] = (vendorCounts[v] || 0) + 1; });
  const vendorRisk = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, cves]) => ({ name: shortName(name), cves, fullName: name }));

  const statusCounts = {};
  apps.forEach((r) => { const s = r.status || 'Unknown'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
  const estimateStatus = Object.entries(statusCounts)
    .map(([name, value], i) => ({ name, value, fill: ['#f97316', '#22c55e', '#3b82f6', '#a855f7'][i % 4] }));

  const criticalApps = appList.filter((a) => a.highestSeverity === 'CRITICAL' && a.name !== 'Microsoft Office Standard 2016')
    .sort((a, b) => b.cveCount - a.cveCount).slice(0, 6);

  return { totalApplications: appList.length, totalCves, totalEndpoints, avgScore, severityMap, severityDistribution, topRiskyApps, cveAging, endpointImpact, scoreRange, vendorRisk, estimateStatus, criticalApps };
}

// ── Weekly insights (Week-over-Week) helpers ─────────────────────────────────
// Normalize Postgres timestamp strings like "2026-06-10 17:49:01.168+05:30"
// to ISO 8601 "2026-06-10T17:49:01.168+05:30" so new Date() parses reliably.
export function parseTs(v) {
  if (!v) return null;
  const d = new Date(typeof v === 'string' ? v.replace(' ', 'T') : v);
  return isNaN(d.getTime()) ? null : d;
}

export function toWDateKey(d) {
  const dt = (d instanceof Date) ? d : parseTs(d);
  if (!dt) return null;
  return dt.toISOString().slice(0, 10);
}

export function computeWeeklyStats(harmonyEvents, s1Threats, s1Agents = [], s1Cves = []) {
  const events = Array.isArray(harmonyEvents) ? harmonyEvents : [];
  const threats = Array.isArray(s1Threats) ? s1Threats : [];
  const agents = Array.isArray(s1Agents) ? s1Agents : [];
  const cves = Array.isArray(s1Cves) ? s1Cves : [];

  let anchor = null;
  events.forEach(e => {
    const d = parseTs(e.event_created);
    if (d && (!anchor || d > anchor)) anchor = d;
  });
  threats.forEach(t => {
    const d = parseTs(t.threatInfo?.createdAt);
    if (d && (!anchor || d > anchor)) anchor = d;
  });
  if (!anchor) anchor = new Date();

  const thisEnd = new Date(anchor); thisEnd.setHours(23, 59, 59, 999);
  const thisStart = new Date(thisEnd); thisStart.setDate(thisEnd.getDate() - 6); thisStart.setHours(0, 0, 0, 0);
  const lastEnd = new Date(thisStart);
  const lastStart = new Date(lastEnd); lastStart.setDate(lastEnd.getDate() - 7);

  const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const periodLabel = `${fmtDate(thisStart)} – ${fmtDate(thisEnd)}`;

  const thisWeekEvents = events.filter(e => { const d = parseTs(e.event_created); return d && d >= thisStart && d <= thisEnd; });
  const lastWeekEvents = events.filter(e => { const d = parseTs(e.event_created); return d && d >= lastStart && d < lastEnd; });
  const thisWeekThreats = threats.filter(t => { const d = parseTs(t.threatInfo?.createdAt); return d && d >= thisStart && d <= thisEnd; });
  const lastWeekThreats = threats.filter(t => { const d = parseTs(t.threatInfo?.createdAt); return d && d >= lastStart && d < lastEnd; });

  const sevLabel = (s) => {
    const n = Number(s);
    if (isNaN(n)) return String(s || 'unknown').toLowerCase();
    if (n >= 4) return 'critical';
    if (n === 3) return 'high';
    if (n === 2) return 'medium';
    return 'low';
  };

  const remStates = ['remediated', 'closed', 'done'];
  const thisRem = thisWeekEvents.filter(e => remStates.includes(e.state)).length;
  const lastRem = lastWeekEvents.filter(e => remStates.includes(e.state)).length;
  const thisCrit = thisWeekEvents.filter(e => { const n = Number(e.severity); return !isNaN(n) && n >= 3; }).length;
  const lastCrit = lastWeekEvents.filter(e => { const n = Number(e.severity); return !isNaN(n) && n >= 3; }).length;

  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(thisEnd); d.setDate(thisEnd.getDate() - i); d.setHours(12, 0, 0, 0);
    last14.push({ key: toWDateKey(d), label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) });
  }

  const eventTypesSet = new Set();
  const eventByDay = {};
  last14.forEach(({ key, label }) => { eventByDay[key] = { date: label }; });
  events.forEach(e => {
    if (!e.event_created) return;
    const k = toWDateKey(e.event_created);
    if (!eventByDay[k]) return;
    const type = e.type || 'unknown'; eventTypesSet.add(type);
    eventByDay[k][type] = (eventByDay[k][type] || 0) + 1;
  });
  const trend14dEvents = last14.map(({ key }) => eventByDay[key]);
  const eventTypes = [...eventTypesSet];

  const threatByDay = {};
  last14.forEach(({ key, label }) => { threatByDay[key] = { date: label, detected: 0, mitigated: 0 }; });
  threats.forEach(t => {
    const k = t.threatInfo?.createdAt ? toWDateKey(t.threatInfo.createdAt) : null;
    if (!k || !threatByDay[k]) return;
    threatByDay[k].detected++;
    if (t.threatInfo?.mitigationStatus === 'mitigated') threatByDay[k].mitigated++;
  });
  const trend14dThreats = last14.map(({ key }) => threatByDay[key]);

  const remComp = [];
  for (let i = 6; i >= 0; i--) {
    const td = new Date(thisEnd); td.setDate(thisEnd.getDate() - i); td.setHours(12, 0, 0, 0);
    const tk = toWDateKey(td);
    const ld = new Date(td); ld.setDate(ld.getDate() - 7);
    const lk = toWDateKey(ld);
    remComp.push({
      day: td.toLocaleDateString('en-GB', { weekday: 'short' }),
      'This Week': thisWeekEvents.filter(e => e.event_created && toWDateKey(e.event_created) === tk).length,
      'Last Week': lastWeekEvents.filter(e => e.event_created && toWDateKey(e.event_created) === lk).length,
    });
  }

  const sevLevels = ['critical', 'high', 'medium', 'low'];
  const severityShift = sevLevels.map(sev => ({
    severity: sev.charAt(0).toUpperCase() + sev.slice(1),
    thisWeek: thisWeekEvents.filter(e => sevLabel(e.severity) === sev).length,
    lastWeek: lastWeekEvents.filter(e => sevLabel(e.severity) === sev).length,
  })).filter(d => d.thisWeek > 0 || d.lastWeek > 0);

  const senderOf = (e) => {
    if (e.sender_address && e.sender_address !== 'Unknown') return e.sender_address;
    const ad = (typeof e.additional_data === 'string' ? JSON.parse(e.additional_data) : e.additional_data) || {};
    const inner = ad.additional_data || ad;
    const fromHeap = inner.sender_address || inner.senderAddress || inner.from_email || inner.fromEmail ||
      inner.mail_from || inner.source_address || inner.mailFrom || inner.sender || inner.from || inner.from_address;
    if (fromHeap) return fromHeap;
    const toHeap = inner.receiver_address || inner.recipient_address || inner.receiverAddress || inner.recipientAddress || inner.to;
    if (toHeap) return `→ ${toHeap}`;
    return 'Unknown';
  };
  const sThis = {}, sLast = {};
  thisWeekEvents.forEach(e => { const s = senderOf(e); sThis[s] = (sThis[s] || 0) + 1; });
  lastWeekEvents.forEach(e => { const s = senderOf(e); sLast[s] = (sLast[s] || 0) + 1; });
  const topSenders = Object.entries(sThis).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([s, tw]) => ({ sender_address: s.length > 45 ? s.slice(0, 45) + '…' : s, 'This Week': tw, 'Last Week': sLast[s] || 0, Change: tw - (sLast[s] || 0) }));

  const getEp = t => t.agentRealtimeInfo?.agentComputerName || t.agentDetectionInfo?.agentComputerName || '';
  const epThis = {}, epLast = {};
  thisWeekThreats.forEach(t => { const ep = getEp(t); if (ep) epThis[ep] = (epThis[ep] || 0) + 1; });
  lastWeekThreats.forEach(t => { const ep = getEp(t); if (ep) epLast[ep] = (epLast[ep] || 0) + 1; });
  const topEndpoints = Object.entries(epThis).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([ep, tw]) => ({ endpoint: ep.length > 40 ? ep.slice(0, 40) + '…' : ep, 'This Week': tw, 'Last Week': epLast[ep] || 0 }));

  const thisNames = new Set(thisWeekThreats.map(t => t.threatInfo?.threatName).filter(Boolean));
  const lastNames = new Set(lastWeekThreats.map(t => t.threatInfo?.threatName).filter(Boolean));
  const newCount = [...thisNames].filter(n => !lastNames.has(n)).length;
  const recCount = [...thisNames].filter(n => lastNames.has(n)).length;
  const newVsRecurring = [
    { name: 'New', value: newCount, fill: '#ef4444' },
    { name: 'Recurring', value: recCount, fill: '#f97316' },
  ].filter(d => d.value > 0);

  const getUser = t => t.threatInfo?.initiatingUsername || t.threatInfo?.processUser || t.agentDetectionInfo?.agentLastLoggedInUserName || '';
  const userThis = {}, userLast = {};
  thisWeekThreats.forEach(t => { const u = getUser(t); if (u) userThis[u] = (userThis[u] || 0) + 1; });
  lastWeekThreats.forEach(t => { const u = getUser(t); if (u) userLast[u] = (userLast[u] || 0) + 1; });
  const topUsers = Object.entries(userThis).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([u, tw]) => ({ user: u.length > 40 ? u.slice(0, 40) + '…' : u, 'This Week': tw, 'Last Week': userLast[u] || 0 }));

  const getAgentDate = a => a.registeredAt || a.createdAt || a.registered_at || a.created_at;
  const newAgentsThis = agents.filter(a => { const d = parseTs(getAgentDate(a)); return d && d >= thisStart && d <= thisEnd; }).length;
  const newAgentsLast = agents.filter(a => { const d = parseTs(getAgentDate(a)); return d && d >= lastStart && d < lastEnd; }).length;

  const inCveWindowThis = c => { const n = Number(c.daysDetected); return !isNaN(n) && n >= 0 && n <= 7; };
  const inCveWindowLast = c => { const n = Number(c.daysDetected); return !isNaN(n) && n > 7 && n <= 14; };
  const newCvesThis = cves.filter(inCveWindowThis).length;
  const newCvesLast = cves.filter(inCveWindowLast).length;
  const critCvesThis = cves.filter(c => inCveWindowThis(c) && (String(c.severity || '').toUpperCase() === 'CRITICAL' || Number(c.baseScore) >= 9)).length;

  const mttdMap = {};
  last14.forEach(({ key }) => { mttdMap[key] = { sum: 0, count: 0 }; });
  threats.forEach(t => {
    const created = parseTs(t.threatInfo?.createdAt);
    const identified = parseTs(t.threatInfo?.identifiedAt);
    if (!created || !identified) return;
    const k = toWDateKey(created);
    if (!mttdMap[k]) return;
    mttdMap[k].sum += (created - identified) / 60000;
    mttdMap[k].count += 1;
  });
  const mttdTrend = last14
    .map(({ key, label }) => mttdMap[key]?.count > 0 ? { date: label, avg: Math.round(mttdMap[key].sum / mttdMap[key].count) } : null)
    .filter(Boolean);

  const mttmMap = {};
  last14.forEach(({ key }) => { mttmMap[key] = { sum: 0, count: 0 }; });
  threats.forEach(t => {
    const identified = parseTs(t.threatInfo?.identifiedAt);
    const successEntry = (t.mitigationStatus || []).find(s => s.status === 'success');
    if (!identified || !successEntry) return;
    const ended = parseTs(successEntry.mitigationEndedAt);
    if (!ended) return;
    const k = toWDateKey(identified);
    if (!mttmMap[k]) return;
    mttmMap[k].sum += (ended - identified) / 60000;
    mttmMap[k].count += 1;
  });
  const mttmTrend = last14
    .map(({ key, label }) => mttmMap[key]?.count > 0 ? { date: label, avg: Math.round(mttmMap[key].sum / mttmMap[key].count) } : null)
    .filter(Boolean);

  return {
    kpi: {
      harmonyThis: thisWeekEvents.length, harmonyLast: lastWeekEvents.length,
      threatsThis: thisWeekThreats.length, threatsLast: lastWeekThreats.length,
      remRateThis: thisWeekEvents.length > 0 ? Math.round((thisRem / thisWeekEvents.length) * 100) : 0,
      remRateLast: lastWeekEvents.length > 0 ? Math.round((lastRem / lastWeekEvents.length) * 100) : 0,
      critThis: thisCrit, critLast: lastCrit,
      newAgentsThis, newAgentsLast,
      newCvesThis, newCvesLast, critCvesThis,
    },
    periodLabel,
    trend14dEvents, eventTypes, trend14dThreats, remComp, severityShift,
    topSenders, topEndpoints, topUsers, newVsRecurring, thisNameCount: thisNames.size, newCount,
    mttdTrend, mttmTrend,
  };
}

// ── SentinelOne section data builders ─────────────────────────────────────────
export function buildThreatAnalytics(threats) {
  const t = Array.isArray(threats) ? threats : [];

  const byCount = (fn) => {
    const counts = {};
    t.forEach(x => { const k = fn(x); counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  };

  const mitigationData = byCount(x => String(x.threatInfo?.mitigationStatus || 'unknown'))
    .map(d => ({ ...d, name: d.name.length > 20 ? d.name.slice(0, 20) + '…' : d.name }));
  const classData = byCount(x => x.threatInfo?.classification || 'Unknown')
    .slice(0, 8)
    .map(d => ({ ...d, name: d.name.length > 20 ? d.name.slice(0, 20) + '…' : d.name }));
  const incidentStatusData = byCount(x => x.threatInfo?.incidentStatus || 'unknown');

  const confidenceData = byCount(x => x.threatInfo?.confidenceLevel || x.threatInfo?.classification || 'Unknown')
    .map((d, i) => ({ ...d, fill: SEV_COLORS[i % SEV_COLORS.length] }));

  const engineData = byCount(x => (x.threatInfo?.engines || []).map(e => typeof e === 'string' ? e : (e?.name || 'Unknown')).join('|'))
    .slice(0, 10)
    .map(d => ({ ...d, name: d.name.includes('|') ? d.name.split('|')[0] : d.name }));

  const tacticData = byCount(x => (x.indicators || []).map(i => (i.tactics || []).map(tc => tc.name).join('|')).join('|'))
    .slice(0, 12)
    .map(d => ({ ...d, name: d.name.includes('|') ? d.name.split('|')[0] : d.name }));

  const siteData = byCount(x => x.agentRealtimeInfo?.siteName || 'Unknown')
    .slice(0, 10)
    .map(d => ({ ...d, name: d.name.length > 22 ? d.name.slice(0, 22) + '…' : d.name }));

  const mitigated = t.filter(x => x.threatInfo?.mitigationStatus === 'mitigated').length;
  const mitigatedAll = t.filter(x => ['mitigated', 'mitigated_preemptively'].includes(x.threatInfo?.mitigationStatus)).length;
  const unresolved = t.filter(x => ['unresolved', 'active'].includes(x.threatInfo?.incidentStatus)).length;
  const notMitigatedCount = t.filter(x => ['not_mitigated', 'unmitigated', 'active'].includes(x.threatInfo?.mitigationStatus)).length;
  const benignCount = t.filter(x => x.threatInfo?.mitigationStatus === 'marked_as_benign').length;

  const affectedEndpoints = new Set(t.map(x => x.agentComputerName || x.computerName || x.agentId).filter(Boolean)).size;

  const filelessData = (() => {
    const f = t.filter(x => x.threatInfo?.isFileless).length;
    return [
      { name: 'File-based', value: t.length - f, fill: '#3b82f6' },
      { name: 'Fileless', value: f, fill: '#ef4444' },
    ];
  })();

  let mttdSum = 0, mttdCount = 0, mttmSum = 0, mttmCount = 0;
  t.forEach(x => {
    const created = parseTs(x.threatInfo?.createdAt);
    const identified = parseTs(x.threatInfo?.identifiedAt);
    if (created && identified) {
      mttdSum += Math.abs(created - identified) / 60000; mttdCount++;
    }
    const successEntry = (x.mitigationStatus || []).find(s => s.status === 'success');
    if (successEntry && identified) {
      const ended = parseTs(successEntry.mitigationEndedAt);
      if (ended) { mttmSum += (ended - identified) / 60000; mttmCount++; }
    }
  });
  const avgMttd = mttdCount > 0 ? mttdSum / mttdCount : null;
  const avgMttm = mttmCount > 0 ? mttmSum / mttmCount : null;

  return {
    mitigationData, classData, incidentStatusData, confidenceData, engineData, tacticData, siteData,
    mitigated, mitigatedAll, unresolved, notMitigatedCount, benignCount, affectedEndpoints,
    filelessData, avgMttd, avgMttm,
    mitPct: t.length > 0 ? Math.round(mitigated / t.length * 100) : 0,
  };
}

export function buildAgentAnalytics(agents, generatedAt) {
  const list = Array.isArray(agents) ? agents : [];
  const cutoff = (() => {
    const c = new Date(generatedAt);
    c.setDate(c.getDate() - 30);
    return c;
  })();
  const newAgents = list.filter(a => {
    const d = a.registeredAt || a.createdAt || a.registered_at || a.created_at;
    return d && new Date(d) >= cutoff;
  }).length;

  const byCount = (fn) => {
    const counts = {};
    list.forEach(a => { const k = fn(a); counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  };

  const statusData = byCount(a => String(a.network_status || a.networkStatus || 'unknown'));
  const osData = byCount(a => a.os_type || a.osType || a.os || 'Unknown');
  const machineTypeData = byCount(a => a.machineType || a.machine_type || 'Unknown')
    .map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }));

  const connected = list.filter(a => String(a.network_status || a.networkStatus || '').toLowerCase() === 'connected').length;
  const disconnected = list.filter(a => String(a.network_status || a.networkStatus || '').toLowerCase() === 'disconnected').length;

  return { total: list.length, newAgents, statusData, osData, machineTypeData, connected, disconnected };
}

export function buildAtRisk(threats) {
  const t = Array.isArray(threats) ? threats : [];
  const byDevice = {}, byUser = {}, byGroup = {};
  t.forEach(x => {
    const dev = x.agentRealtimeInfo?.agentComputerName;
    const usr = x.threatInfo?.processUser;
    const grp = x.agentRealtimeInfo?.groupName || x.group_name;
    if (dev) byDevice[dev] = (byDevice[dev] || 0) + 1;
    if (usr) byUser[usr] = (byUser[usr] || 0) + 1;
    if (grp) byGroup[grp] = (byGroup[grp] || 0) + 1;
  });
  const top = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const entries = { devices: top(byDevice), users: top(byUser), groups: top(byGroup) };
  return {
    devices: entries.devices.map(([name, value]) => ({ name: name.length > 30 ? name.slice(0, 30) + '…' : name, value })),
    users: entries.users.map(([name, value]) => ({ name: name.length > 30 ? name.slice(0, 30) + '…' : name, value })),
    groups: entries.groups.map(([name, value]) => ({ name: name.length > 30 ? name.slice(0, 30) + '…' : name, value })),
    topDevice: entries.devices[0], topUser: entries.users[0], topGroup: entries.groups[0],
  };
}

export function buildZohoSummary(tickets) {
  const list = Array.isArray(tickets) ? tickets : [];
  const open = list.filter(t => t.status === 'Open').length;
  const closed = list.filter(t => isClosedTicket(t)).length;
  const highPri = list.filter(t => t.priority === 'High' || t.priority === 'Critical').length;
  const overdue = list.filter(t => {
    const ca = t?.created_at || t?.createdTime || t?.createdAt;
    if (!ca) return false;
    return (new Date() - new Date(ca).getTime()) > 24 * 60 * 60 * 1000 && !isClosedTicket(t);
  }).length;

  const byCount = (fn) => {
    const counts = {};
    list.forEach(t => { const k = fn(t); counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  };
  const statusData = byCount(t => t.status || 'Unknown').map(d => ({ ...d, fill: ZOHO_STATUS_COLORS[d.name] || '#6366f1' }));
  const priorityData = byCount(t => t.priority || 'Unknown').map(d => ({ ...d, fill: ZOHO_PRIORITY_COLORS[d.name] || '#6b7280' }));
  const departmentData = byCount(t => getDeptName(t)).sort((a, b) => b.value - a.value).slice(0, 8);

  const agingCounts = {};
  ZOHO_AGING_BUCKETS.forEach(b => agingCounts[b] = 0);
  list.forEach(t => { const b = getResolutionTimeBucket(t); if (b) agingCounts[b] = (agingCounts[b] || 0) + 1; });
  const agingData = ZOHO_AGING_BUCKETS.map(b => ({ name: b, value: agingCounts[b] }));

  const engineerPerformance = (() => {
    const grouped = {};
    list.forEach(t => {
      const eng = getAssigneeName(t);
      if (eng === 'Unassigned') return;
      if (!grouped[eng]) grouped[eng] = { engineer: eng, open: 0, closed: 0 };
      isClosedTicket(t) ? grouped[eng].closed++ : grouped[eng].open++;
    });
    return Object.values(grouped).sort((a, b) => (b.closed - a.closed) || a.engineer.localeCompare(b.engineer));
  })();

  return { total: list.length, open, closed, highPri, overdue, statusData, priorityData, departmentData, agingData, engineerPerformance };
}

export function buildFirewallSummary({
  fwRiskRaw, fwAttackersRaw, fwAttackerDestRaw, fwDeniedDestRaw,
  fwDeniedSourceRaw, fwDeniedAppRaw, fwRiskyUsersRaw, fwTopAttacksRaw, fwConnectionsRaw,
}) {
  const riskTable = extractTable(fwRiskRaw?.data);
  const attackersTable = extractTable(fwAttackersRaw?.data);
  const attackerDestTable = extractTable(fwAttackerDestRaw?.data);
  const deniedDestTable = extractTable(fwDeniedDestRaw?.data);
  const deniedSourceTable = extractTable(fwDeniedSourceRaw?.data);
  const deniedAppTable = extractTable(fwDeniedAppRaw?.data);
  const riskyUsersTable = extractTable(fwRiskyUsersRaw?.data);
  const topAttacksTable = extractTable(fwTopAttacksRaw?.data);
  const connTable = extractTable(fwConnectionsRaw?.data);

  const riskRows = riskTable?.rows || [];
  const riskTrend = makeRiskTrendData(riskRows);
  const riskDistribution = makeRiskDistribution(riskRows);

  const topAttackers = attackersTable ? makeTopChartData(attackersTable.rows, ['from', 'source', 'src', 'attacker', 'name']) : [];
  const topAttacks = topAttacksTable ? makeTopChartData(topAttacksTable.rows, ['threatid', 'threat', 'name', 'category']) : [];
  const topDeniedDestinations = deniedDestTable ? makeTopChartData(deniedDestTable.rows, ['dst', 'destination', 'destination_ip', 'name']) : [];
  const topDeniedSources = deniedSourceTable ? makeTopChartData(deniedSourceTable.rows, ['src', 'source', 'source_ip', 'name']) : [];
  const topDeniedApps = deniedAppTable ? makeTopChartData(deniedAppTable.rows, ['app', 'application', 'name']) : [];
  const riskyUsers = riskyUsersTable ? makeTopChartData(riskyUsersTable.rows, ['user', 'srcuser', 'name']) : [];

  const totalSessions = getSumByColumn(riskRows, ['nsess', 'sessions', 'session', 'count']);
  const totalTraffic = getSumByColumn(riskRows, ['nbytes', 'bytes', 'byte']);
  const highRiskEvents = riskRows.reduce((sum, row) => {
    const risk = parseNumber(getFirstValue(row, ['risk', 'name', 'severity'], 0));
    return risk >= 4 ? sum + parseNumber(getFirstValue(row, ['count', 'nrepeat', 'nsess', 'sessions'], 1)) : sum;
  }, 0);
  const blockedConnections = (deniedDestTable?.rows?.length) || riskRows.filter(row => {
    const action = String(getFirstValue(row, ['action', 'category', 'name'], '')).toLowerCase();
    return action.includes('block') || action.includes('deny') || action.includes('drop');
  }).length;
  const criticalUsers = riskyUsersTable?.rows?.length || 0;
  const securityScore = Math.max(0, Math.min(100, Math.round(100 - highRiskEvents * 0.05 - criticalUsers * 2 - blockedConnections * 0.1)));

  return {
    riskTable, attackersTable, attackerDestTable, deniedDestTable, deniedSourceTable, deniedAppTable,
    riskyUsersTable, topAttacksTable, connTable,
    riskRows, riskTrend, riskDistribution, topAttackers, topAttacks, topDeniedDestinations,
    topDeniedSources, topDeniedApps, riskyUsers,
    totalSessions, totalTraffic, highRiskEvents, blockedConnections, criticalUsers, securityScore,
  };
}