/**
 * Central widget configuration for the Analytics page + PDF.
 *
 * Each section builder takes raw data and returns a layout descriptor:
 *   { kpis: [...], groups: [{ cols, widgets }] }
 *
 * Both the live page (PageWidgetRenderer) and the PDF (PdfWidget) consume
 * this — add a widget here once, both update.
 */

// ── Shared constants ──────────────────────────────────────────────────────────
export const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];

export const STATUS_COLORS = {
  Open: '#3b82f6', Closed: '#22c55e', 'Technically Closed': '#22c55e', Resolved: '#10b981',
  Pending: '#f59e0b', Deleted: '#ef4444', 'In Progress': '#8b5cf6', Escalated: '#ef4444',
};

export const PRIORITY_COLORS = {
  High: '#ef4444', Critical: '#dc2626', Medium: '#f59e0b', Low: '#22c55e',
};

export const SEVERITY_COLORS = {
  CRITICAL: '#a855f7', HIGH: '#ef4444', MEDIUM: '#eab308', LOW: '#3b82f6', UNKNOWN: '#64748b',
};

export const SEV_LABELS = { 0: 'Informational', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' };
export const SEV_COLORS_CP = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];

export const STATE_COLORS = {
  new: '#ef4444', pending: '#f97316', detected: '#f59e0b', remediated: '#22c55e',
  closed: '#3b82f6', done: '#10b981', unknown: '#64748b',
};

// ── Pure helpers ──────────────────────────────────────────────────────────────
export const normText = (v) => String(v || '').trim();
export const truncateLabel = (label, maxLen = 20) => {
  if (!label || label === '-') return label;
  return String(label).length > maxLen ? String(label).slice(0, maxLen) + '...' : String(label);
};
export const parseDate = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };

export const bucket = (arr, keyFn, fallback = 'unknown') => {
  const counts = {};
  arr.forEach((item) => { const k = keyFn(item) || fallback; counts[k] = (counts[k] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
};

export const topN = (arr, keyFn, n = 8) => {
  const c = {};
  arr.forEach((item) => { const k = keyFn(item); if (k) c[k] = (c[k] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, value]) => ({ name: truncateLabel(name), value }));
};

export const formatDuration = (minutes) => {
  if (minutes == null || isNaN(minutes)) return '—';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) { const h = Math.floor(minutes / 60); const m = Math.round(minutes % 60); return m > 0 ? `${h}h ${m}m` : `${h}h`; }
  const d = Math.floor(minutes / 1440); const h = Math.round((minutes % 1440) / 60);
  return h > 0 ? `${d}d ${h}m` : `${d}d`;
};

const parseDuration = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) { const n = parseFloat(s); return isNaN(n) ? null : n; }
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/i);
  const m = s.match(/(\d+(?:\.\d+)?)\s*m/i);
  if (h || m) { let total = 0; if (h) total += parseFloat(h[1]) * 60; if (m) total += parseFloat(m[1]); return total; }
  const parts = s.split(':').map((p) => parseFloat(p));
  if (parts.length === 3 && parts.every((p) => !isNaN(p))) return parts[0] * 60 + parts[1] + parts[2] / 60;
  return null;
};

const getDept = (t) => normText(t.department?.name) || normText(t.departmentName) || 'Unknown Department';
const isClosedTicket = (t) => ['closed', 'technically closed', 'resolved'].includes(normText(t.status).toLowerCase());
const getCreated = (t) => parseDate(t.created_at || t.createdTime || t.createdAt);
const getClosed = (t) => parseDate(t.closed_at || t.closedTime || t.closedAt || t.closeTime);

export const fmtNum = (v) => Number(v || 0).toLocaleString('en-IN');

// ── Widget type constants ─────────────────────────────────────────────────────
// 'kpi' | 'donut' | 'bar' | 'hbar' | 'line' | 'area' | 'stacked' | 'gauge' | 'heatmap' | 'scorebar' | 'table' | 'composed'

// ═══════════════════════════════════════════════════════════════════════════════
// ZOHO DESK
// ═══════════════════════════════════════════════════════════════════════════════

export function buildZohoWidgets(tickets) {
  if (!tickets || !tickets.length) return { kpis: [], groups: [] };

  // KPI values
  const highPriority = tickets.filter((t) => t.priority === 'High' || t.priority === 'Critical').length;
  const closed = tickets.filter((t) => ['Closed', 'Technically Closed', 'Resolved'].includes(t.status)).length;
  const openTickets = tickets.filter((t) => t.status === 'Open').length;
  const closedPct = tickets.length ? Math.round((closed / tickets.length) * 100) : 0;
  const onHold = tickets.filter((t) => /on hold/i.test(t.status || '')).length;
  const deptCount = tickets.reduce((s, t) => s.add(getDept(t)), new Set()).size;

  // Avg response / resolution time
  let respSum = 0, respCount = 0, resSum = 0, resCount = 0;
  tickets.forEach((t) => {
    const created = getCreated(t);
    if (!created) return;
    const respRaw = t.customerResponseTime || t.customer_response_time || t.responseTime;
    if (respRaw) {
      const resp = parseDuration(respRaw);
      if (resp != null) { respSum += resp; respCount++; }
    }
    const closedAt = getClosed(t);
    if (closedAt && isClosedTicket(t)) { resSum += (closedAt.getTime() - created.getTime()) / 60000; resCount++; }
  });
  const avgResponse = respCount ? respSum / respCount : null;
  const avgResolution = resCount ? resSum / resCount : null;

  // Chart data
  const statusData = Object.entries(tickets.reduce((acc, t) => { const s = t.status || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {}))
    .map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || '#6366f1' })).sort((a, b) => b.value - a.value);

  const priorityData = Object.entries(tickets.reduce((acc, t) => { const p = t.priority || 'Unknown'; acc[p] = (acc[p] || 0) + 1; return acc; }, {}))
    .map(([name, value]) => ({ name, value, fill: PRIORITY_COLORS[name] || '#6b7280' })).sort((a, b) => b.value - a.value);

  const departmentData = Object.entries(tickets.reduce((acc, t) => { const d = getDept(t); acc[d] = (acc[d] || 0) + 1; return acc; }, {}))
    .map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  const ticketTrend = (() => {
    const counts = {};
    tickets.forEach((t) => { const d = getCreated(t); if (!d) return; const key = d.toISOString().slice(0, 10); counts[key] = (counts[key] || 0) + 1; });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-20).map(([date, count]) => ({ date, count }));
  })();

  const openAging = (() => {
    const buckets = { '< 1 day': 0, '1-3 days': 0, '3-7 days': 0, '7-14 days': 0, '> 14 days': 0 };
    tickets.forEach((t) => {
      if (!['Open', 'Pending', 'On Hold'].some((s) => normText(t.status).toLowerCase() === s.toLowerCase()) && !/pending|on hold/.test(normText(t.status).toLowerCase())) return;
      const d = getCreated(t); if (!d) return;
      const days = (Date.now() - d.getTime()) / 86400000;
      if (days < 1) buckets['< 1 day']++; else if (days < 3) buckets['1-3 days']++; else if (days < 7) buckets['3-7 days']++; else if (days < 14) buckets['7-14 days']++; else buckets['> 14 days']++;
    });
    return Object.entries(buckets).filter(([, v]) => v > 0).map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  })();

  const resolutionByDept = (() => {
    const map = {};
    tickets.forEach((t) => {
      const created = getCreated(t); const closedAt = getClosed(t);
      if (!created || !closedAt || !isClosedTicket(t)) return;
      const dept = getDept(t); const mins = (closedAt.getTime() - created.getTime()) / 60000;
      if (!map[dept]) map[dept] = { sum: 0, count: 0 }; map[dept].sum += mins; map[dept].count++;
    });
    return Object.entries(map).map(([name, { sum, count }]) => ({ name: truncateLabel(name), fullName: name, value: sum / count }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  })();

  const assigneeData = (() => {
    const counts = {};
    tickets.forEach((t) => { const a = `${normText(t.assignee?.firstName)} ${normText(t.assignee?.lastName)}`.trim() || 'Unassigned'; counts[a] = (counts[a] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  })();

  const contactData = (() => {
    const counts = {};
    tickets.forEach((t) => { const c = `${normText(t.contact?.firstName)} ${normText(t.contact?.lastName)}`.trim() || normText(t.contact?.email) || 'Unknown'; counts[c] = (counts[c] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  })();

  const statusPriorityData = (() => {
    const states = [...new Set(tickets.map((t) => normText(t.status) || 'Unknown'))].slice(0, 6);
    const prios = [...new Set(tickets.map((t) => normText(t.priority) || 'Unknown'))]
      .sort((a, b) => ['Critical', 'High', 'Medium', 'Low'].indexOf(a) - ['Critical', 'High', 'Medium', 'Low'].indexOf(b));
    return states.map((status) => {
      const row = { name: status };
      prios.forEach((p) => { row[p] = tickets.filter((t) => normText(t.status) === status && normText(t.priority) === p).length; });
      return row;
    });
  })();

  // MTTR gauge
  const mttrPct = tickets.length ? Math.round((closed / tickets.length) * 100) : 0;

  // Filter chip data (status + priority counts for interactive chips)
  const filterStatusData = statusData.map((s) => ({ name: s.name, value: s.value }));
  const filterPriorityData = priorityData.map((p) => ({ name: p.name, value: p.value }));

  return {
    kpis: [
      { label: 'Total', value: tickets.length, color: '#8b5cf6' },
      { label: 'Open', value: openTickets, color: '#3b82f6' },
      { label: 'High Priority', value: highPriority, color: '#ef4444' },
      { label: 'Closed', value: closed, color: '#22c55e', subtitle: `${closedPct}% of total` },
    ],
    secondaryKpis: [
      { label: 'On Hold', value: onHold, color: '#f59e0b' },
      { label: 'Departments', value: deptCount, color: undefined },
      { label: 'Avg Response Time', value: formatDuration(avgResponse), color: '#06b6d4', subtitle: 'time to first reply' },
      { label: 'Avg Resolution Time', value: formatDuration(avgResolution), color: '#22c55e', subtitle: 'open → closed' },
    ],
    filterChips: { status: filterStatusData, priority: filterPriorityData },
    groups: [
      // Volume + aging
      { cols: 2, widgets: [
        { id: 'z-trend', type: 'area', title: 'Ticket Volume Trend', subtitle: 'Daily new tickets', data: ticketTrend, color: '#3b82f6' },
        { id: 'z-aging', type: 'donut', title: 'Open Ticket Aging', subtitle: 'how long open tickets have been open', data: openAging },
      ]},
      // Status / priority / department
      { cols: 3, widgets: [
        { id: 'z-status', type: 'donut', title: 'By Status', data: statusData },
        { id: 'z-priority', type: 'bar', title: 'By Priority', data: priorityData },
        { id: 'z-dept', type: 'hbar', title: 'By Department', data: departmentData },
      ]},
      // Assignees / contacts / resolution / stacked
      { cols: 2, widgets: [
        { id: 'z-assignees', type: 'hbar', title: 'Top Assignees', subtitle: 'tickets per agent', data: assigneeData, color: '#06b6d4' },
        { id: 'z-contacts', type: 'hbar', title: 'Top Contacts', subtitle: 'tickets per reporter', data: contactData, color: '#ec4899' },
      ]},
      { cols: 2, widgets: [
        { id: 'z-resolution', type: 'hbar', title: 'Avg Resolution by Department', subtitle: 'hours to close (open → closed)', data: resolutionByDept, color: '#f59e0b', valueFmt: 'duration' },
        { id: 'z-stacked', type: 'stacked', title: 'Status × Priority', subtitle: 'ticket mix by status stacked by priority', data: statusPriorityData, meta: { keys: priorityData.map((p) => p.name), fills: PRIORITY_COLORS } },
      ]},
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SENTINEL ONE — Agents
// ═══════════════════════════════════════════════════════════════════════════════

export function buildAgentWidgets(agents) {
  if (!agents || !agents.length) return { kpis: [], groups: [] };

  const active = agents.filter((a) => a.isActive || a.status === 'active').length;
  const inactive = agents.filter((a) => !a.isActive && a.status !== 'active').length;
  const threats = agents.filter((a) => (a.threats || a.activeThreats || 0) > 0).length;
  const outdated = agents.filter((a) => a.isOutdated || a.agentVersionOutdated).length;
  const health = agents.length ? Math.round((active / agents.length) * 100) : 0;

  const osData = bucket(agents, (a) => a.osName || a.os_family || a.os || 'Unknown');
  const activeStatus = [
    { name: 'Active', value: active, fill: '#22c55e' },
    { name: 'Inactive', value: inactive, fill: '#ef4444' },
  ];
  const firewallStatus = bucket(agents, (a) => a.firewallEnabled === true ? 'Enabled' : a.firewallEnabled === false ? 'Disabled' : 'Unknown');
  const versionStatus = bucket(agents, (a) => a.agentVersion || a.version || 'Unknown');
  const siteDistribution = bucket(agents, (a) => a.siteName || a.site || 'Default');
  const networkStatus = bucket(agents, (a) => a.networkStatus || a.isConnected ? 'Connected' : 'Disconnected');
  const scanStatus = (() => {
    const data = bucket(agents, (a) => a.scanStatus || 'Unknown');
    return data.length > 0 ? data : [];
  })();

  return {
    kpis: [
      { label: 'Total Agents', value: agents.length, color: '#3b82f6' },
      { label: 'Active', value: active, color: '#22c55e', subtitle: `${health}% health` },
      { label: 'Inactive', value: inactive, color: '#ef4444' },
      { label: 'Active Threats', value: threats, color: '#f59e0b' },
      { label: 'Outdated', value: outdated, color: '#ef4444' },
    ],
    groups: [
      { cols: 3, widgets: [
        { id: 's1-os', type: 'donut', title: 'OS Distribution', data: osData },
        { id: 's1-active', type: 'donut', title: 'Active Status', data: activeStatus },
        { id: 's1-firewall', type: 'donut', title: 'Firewall Status', data: firewallStatus },
      ]},
      { cols: 3, widgets: [
        { id: 's1-version', type: 'donut', title: 'Agent Version', data: versionStatus },
        { id: 's1-site', type: 'donut', title: 'Site Distribution', data: siteDistribution },
        { id: 's1-network', type: 'donut', title: 'Network Status', data: networkStatus },
      ]},
      ...(scanStatus.length > 0 ? [{ cols: 1, widgets: [{ id: 's1-scan', type: 'donut', title: 'Scan Status', data: scanStatus }] }] : []),
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SENTINEL ONE — CVEs
// ═══════════════════════════════════════════════════════════════════════════════

export function buildCveWidgets(cves) {
  if (!cves || !cves.length) return { kpis: [], groups: [] };

  const totalApplications = new Set(cves.map((c) => c.application || c.appName || c.applicationName)).size;
  const totalCves = cves.length;
  const critical = cves.filter((c) => (c.severity || '').toUpperCase() === 'CRITICAL').length;
  const high = cves.filter((c) => (c.severity || '').toUpperCase() === 'HIGH').length;

  const severityData = bucket(cves, (c) => (c.severity || 'UNKNOWN').toUpperCase());
  const statusData = bucket(cves, (c) => c.status || 'open');
  const topApps = topN(cves, (c) => c.application || c.appName || c.applicationName);

  // CVSS Base Score Range (mirrors the page's CVSS range widget)
  const cvssRange = [
    { name: 'Critical (9-10)', value: cves.filter((c) => { const s = parseFloat(c.baseScore || c.cvssBaseScore); return !isNaN(s) && s >= 9; }).length, fill: '#a855f7' },
    { name: 'High (7-8.9)', value: cves.filter((c) => { const s = parseFloat(c.baseScore || c.cvssBaseScore); return !isNaN(s) && s >= 7 && s < 9; }).length, fill: '#ef4444' },
    { name: 'Medium (4-6.9)', value: cves.filter((c) => { const s = parseFloat(c.baseScore || c.cvssBaseScore); return !isNaN(s) && s >= 4 && s < 7; }).length, fill: '#eab308' },
    { name: 'Low (0-3.9)', value: cves.filter((c) => { const s = parseFloat(c.baseScore || c.cvssBaseScore); return !isNaN(s) && s < 4; }).length, fill: '#3b82f6' },
  ].filter((d) => d.value > 0);

  // CVE Aging (days detected)
  const agingMap = { '0-30 days': 0, '31-90 days': 0, '91-180 days': 0, '180+ days': 0 };
  cves.forEach((r) => {
    const dDetect = parseDate(r.detectionDate || r.detectedAt || r.firstDetectedAt);
    const dDays = r.daysDetected;
    if (dDays != null) {
      const n = Number(dDays);
      if (n <= 30) agingMap['0-30 days']++;
      else if (n <= 90) agingMap['31-90 days']++;
      else if (n <= 180) agingMap['91-180 days']++;
      else agingMap['180+ days']++;
    } else if (dDetect) {
      const days = (Date.now() - dDetect.getTime()) / 86400000;
      if (days <= 30) agingMap['0-30 days']++;
      else if (days <= 90) agingMap['31-90 days']++;
      else if (days <= 180) agingMap['91-180 days']++;
      else agingMap['180+ days']++;
    }
  });
  const agingData = [{ name: '0-30 days', value: agingMap['0-30 days'], fill: '#22c55e' },
    { name: '31-90 days', value: agingMap['31-90 days'], fill: '#f59e0b' },
    { name: '91-180 days', value: agingMap['91-180 days'], fill: '#f97316' },
    { name: '180+ days', value: agingMap['180+ days'], fill: '#ef4444' }].filter(d => d.value > 0);

  // Endpoint Impact
  const endpointImpact = topN(cves, (r) => r.endpointName || r.endpoint || 'Unknown', 8);
  // Vendor Risk
  const vendorRisk = topN(cves, (r) => r.applicationVendor || r.vendor || 'Unknown', 8);

  return {
    kpis: [
      { label: 'Applications', value: totalApplications, color: undefined },
      { label: 'Total CVEs', value: totalCves, color: '#3b82f6' },
      { label: 'Critical', value: critical, color: '#a855f7' },
      { label: 'High', value: high, color: '#ef4444' },
    ],
    groups: [
      { cols: 3, widgets: [
        { id: 's1-cve-sev', type: 'donut', title: 'CVEs by Severity', data: severityData },
        { id: 's1-cve-status', type: 'donut', title: 'CVEs by Status', data: statusData },
        { id: 's1-cve-apps', type: 'hbar', title: 'Top Affected Applications', data: topApps, color: '#ef4444' },
      ]},
      { cols: 2, widgets: [
        { id: 's1-cve-cvss', type: 'donut', title: 'CVSS Base Score Range', data: cvssRange, color: '#3b82f6' },
        { id: 's1-cve-aging', type: 'bar', title: 'CVE Aging (Days Detected)', data: agingData, color: '#06b6d4' },
      ]},
      { cols: 2, widgets: [
        { id: 's1-cve-endpoint', type: 'hbar', title: 'Endpoint Impact', data: endpointImpact, color: '#8b5cf6' },
        { id: 's1-cve-vendor', type: 'hbar', title: 'Vendor Risk', subtitle: 'CVEs by vendor', data: vendorRisk, color: '#ec4899' },
      ]},
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SENTINEL ONE — Threats
// ═══════════════════════════════════════════════════════════════════════════════

export function buildThreatWidgets(threats) {
  if (!threats || !threats.length) return { kpis: [], groups: [] };

  const total = threats.length;
  const mitigated = threats.filter((t) => t.threatInfo?.analystVerdict === 'mitigated' || t.threatInfo?.currentDetection === 'resolved').length;
  const unresolved = threats.filter((t) => !['resolved', 'mitigated', 'detected'].includes(String(t.threatInfo?.currentDetection || '').toLowerCase())).length;
  const fileless = threats.filter((t) => t.threatInfo?.isFileless).length;

  // MTTD / MTTM (if available)
  let mttdSum = 0, mttdCount = 0, mttmSum = 0, mttmCount = 0;
  threats.forEach((t) => {
    const created = parseDate(t.threatInfo?.createdAt);
    const detected = parseDate(t.threatInfo?.detectedAt);
    const mitigatedAt = parseDate(t.threatInfo?.mitigatedAt);
    if (created && detected) { mttdSum += (detected.getTime() - created.getTime()) / 60000; mttdCount++; }
    if (created && mitigatedAt) { mttmSum += (mitigatedAt.getTime() - created.getTime()) / 60000; mttmCount++; }
  });

  const classificationData = bucket(threats, (t) => t.threatInfo?.classification || 'Unknown');
  const filelessData = [
    { name: 'Fileless', value: fileless, fill: '#f59e0b' },
    { name: 'File-based', value: total - fileless, fill: '#3b82f6' },
  ];
  const mitigationOutcomes = bucket(threats, (t) => t.threatInfo?.analystVerdict || 'unknown');
  const topAffectedEndpoints = topN(threats, (t) => t.agentDetectionInfo?.computerName);
  const topUsersByThreat = topN(threats, (t) => t.threatInfo?.user || t.agentDetectionInfo?.userName);
  const threatsBySite = topN(threats, (t) => t.agentDetectionInfo?.siteName);

  const threatTrend = (() => {
    const counts = {};
    threats.forEach((t) => {
      const d = parseDate(t.threatInfo?.createdAt); if (!d) return;
      const key = d.toISOString().slice(0, 10); counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
  })();

  // MTTR gauge data
  const mttrPct = total ? Math.round((mitigated / total) * 100) : 0;

  return {
    kpis: [
      { label: 'Total Threats', value: total, color: '#3b82f6' },
      { label: 'Mitigated', value: mitigated, color: '#22c55e', subtitle: total ? `${Math.round((mitigated / total) * 100)}% of total` : '' },
      { label: 'Unresolved', value: unresolved, color: '#ef4444' },
      { label: 'Fileless', value: fileless, color: '#f59e0b' },
      { label: 'Avg MTTD', value: formatDuration(mttdCount ? mttdSum / mttdCount : null), color: '#8b5cf6', subtitle: 'time to detect' },
      { label: 'Avg MTTM', value: formatDuration(mttmCount ? mttmSum / mttmCount : null), color: '#06b6d4', subtitle: 'time to mitigate' },
    ],
    groups: [
      { cols: 1, widgets: [
        { id: 's1-threat-trend', type: 'line', title: 'Threat Trend Over Time', subtitle: 'Daily new threats', data: threatTrend, color: '#3b82f6' },
      ]},
      { cols: 3, widgets: [
        { id: 's1-class', type: 'donut', title: 'Classification', data: classificationData },
        { id: 's1-fileless', type: 'donut', title: 'Fileless vs File-based', data: filelessData },
        { id: 's1-mitigation', type: 'donut', title: 'Mitigation Outcomes', data: mitigationOutcomes },
      ]},
      { cols: 3, widgets: [
        { id: 's1-top-endpoints', type: 'hbar', title: 'Top Affected Endpoints', data: topAffectedEndpoints, color: '#3b82f6' },
        { id: 's1-top-users', type: 'hbar', title: 'Top Users by Threat Count', data: topUsersByThreat, color: '#f59e0b' },
        { id: 's1-top-sites', type: 'hbar', title: 'Threats by Site', data: threatsBySite, color: '#10b981' },
      ]},
      { cols: 2, widgets: [
        { id: 's1-mttr', type: 'gauge', title: 'SentinelOne Health Score', meta: { pct: mttrPct, goodLabel: 'Mitigated', badLabel: 'Unmitigated', goodCount: mitigated, badCount: unresolved } },
      ]},
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MDM / HEXNODE
// ═══════════════════════════════════════════════════════════════════════════════

export function buildMdmWidgets(devices, apps) {
  if (!devices && !apps) return { kpis: [], groups: [] };
  const devArr = devices || [];
  const appArr = apps || [];

  const staleCount = devArr.filter((d) => d.last_reported && (Date.now() - new Date(d.last_reported).getTime()) > 7 * 24 * 60 * 60 * 1000).length;
  const nonCompliant = devArr.filter((d) => d.compliant !== true).length;
  const osData = bucket(devArr, (d) => d.os_name || d.os_type || d.platform || d.os || 'Unknown');
  const complianceData = devArr.length === 0 ? [] : [
    { name: 'Compliant', value: devArr.filter((d) => d.compliant === true).length, fill: '#10b981' },
    { name: 'Non-compliant', value: nonCompliant, fill: '#ef4444' },
  ];
  const deviceTypeData = bucket(devArr, (d) => d.device_type || 'unknown');
  const appPlatformData = bucket(appArr, (a) => a.platform || a.os_type || a.os_name || 'Unknown');

  return {
    kpis: [
      { label: 'Enrolled Devices', value: devArr.length, color: '#3b82f6' },
      { label: 'Applications Tracked', value: appArr.length, color: '#8b5cf6' },
      { label: 'Non-compliant', value: nonCompliant, color: '#ef4444' },
      { label: 'Stale Devices (>7d)', value: staleCount, color: '#ef4444' },
    ],
    groups: [
      { cols: 4, widgets: [
        { id: 'mdm-os', type: 'donut', title: 'Device OS / Platform', data: osData },
        { id: 'mdm-compliance', type: 'donut', title: 'Compliance Status', data: complianceData },
        { id: 'mdm-type', type: 'donut', title: 'Device Type', data: deviceTypeData },
        { id: 'mdm-apps', type: 'donut', title: 'App Platform Breakdown', data: appPlatformData },
      ]},
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NVD CVEs
// ═══════════════════════════════════════════════════════════════════════════════

export function buildNvdWidgets(stats) {
  if (!stats) return { kpis: [], groups: [] };

  const severityMap = {};
  (stats.severityCounts || []).forEach((s) => { severityMap[s.severity] = s.count; });
  const sevCount = (name) => severityMap[name] ?? 0;
  const highRisk = sevCount('CRITICAL') + sevCount('HIGH');
  const highRiskPct = stats.total ? Math.round((highRisk / stats.total) * 100) : 0;

  const severityData = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
    .filter((s) => severityMap[s] != null)
    .map((s) => ({ name: s, value: severityMap[s], fill: SEVERITY_COLORS[s] }));

  const statusData = (stats.statusCounts || [])
    .filter((s) => s.status)
    .sort((a, b) => b.count - a.count)
    .map((s, i) => ({ name: s.status, value: s.count, fill: CHART_COLORS[i % CHART_COLORS.length] }));

  return {
    kpis: [
      { label: 'Total CVEs', value: stats.total, color: undefined },
      { label: 'CRITICAL', value: sevCount('CRITICAL'), color: '#a855f7' },
      { label: 'HIGH', value: sevCount('HIGH'), color: '#ef4444' },
      { label: 'MEDIUM', value: sevCount('MEDIUM'), color: '#f59e0b' },
      { label: 'LOW', value: sevCount('LOW'), color: '#3b82f6' },
      { label: 'Critical + High', value: highRisk, color: '#ef4444', subtitle: `${highRiskPct}% of total` },
    ],
    groups: [
      { cols: 2, widgets: [
        { id: 'nvd-severity', type: 'donut', title: 'CVEs by Severity', data: severityData },
        { id: 'nvd-status', type: 'hbar', title: 'CVEs by Status', data: statusData, color: '#8b5cf6' },
      ]},
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKPOINT HARMONY
// ═══════════════════════════════════════════════════════════════════════════════

export function buildCheckpointWidgets(events) {
  if (!events || !events.length) return { kpis: [], groups: [] };

  const total = events.length;
  const remediated = events.filter((e) => e.state === 'remediated' || e.state === 'closed' || e.state === 'done').length;
  const pending = events.filter((e) => e.state === 'new' || e.state === 'pending').length;
  const detected = total - pending - remediated;
  const remediatedPct = total ? Math.round((remediated / total) * 100) : 0;
  const pendingPct = total ? Math.round((pending / total) * 100) : 0;
  const detectedPct = total ? Math.round((detected / total) * 100) : 0;

  const avgSeverity = (() => {
    const valid = events.filter((e) => e.severity !== '' && e.severity != null && !isNaN(Number(e.severity)));
    return valid.length ? (valid.reduce((s, e) => s + Number(e.severity), 0) / valid.length).toFixed(1) : null;
  })();
  const criticalCount = events.filter((e) => Number(e.severity) >= 4).length;

  const severityData = (() => {
    const counts = {};
    events.forEach((e) => { const s = e.severity ?? '?'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).sort(([a], [b]) => Number(a) - Number(b))
      .map(([sev, value]) => ({ name: SEV_LABELS[sev] ?? `Sev ${sev}`, value, fill: SEV_COLORS_CP[Number(sev) % SEV_COLORS_CP.length] }));
  })();

  const stateData = (() => {
    const counts = {};
    events.forEach((e) => { const s = e.state ?? 'unknown'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: STATE_COLORS[name] ?? '#6366f1' }));
  })();

  const eventTypes = bucket(events, (e) => e.type || 'unknown');

  const confidenceData = (() => {
    const counts = {};
    const CONF_COLORS = { malicious: '#ef4444', suspicious: '#f97316', detected: '#f59e0b', unknown: '#94a3b8' };
    events.forEach((e) => { const c = (e.confidenceIndicator ?? 'unknown').toLowerCase(); counts[c] = (counts[c] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: CONF_COLORS[name] ?? '#6366f1' }));
  })();

  const saasData = (() => {
    const counts = {};
    const PALETTE = ['#6366f1', '#f97116', '#22c55e', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
    events.forEach((e) => { const p = e.platform || e.saas || 'Unknown'; counts[p] = (counts[p] || 0) + 1; });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([name, value], i) => ({ name, value, fill: PALETTE[i % PALETTE.length] }));
  })();

  const dailyTrend = (() => {
    const counts = {};
    events.forEach((e) => { const d = parseDate(e.eventCreated); if (!d) return; const key = d.toISOString().slice(0, 10); counts[key] = (counts[key] || 0) + 1; });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-25).map(([date, count]) => ({ date, count }));
  })();

  const typeSevData = (() => {
    const sevKeys = ['4', '3', '2', '1', '0'];
    const types = [...new Set(events.map((e) => e.type || 'unknown'))];
    return types.map((type) => {
      const row = { name: type };
      sevKeys.forEach((s) => { row[SEV_LABELS[s]] = events.filter((e) => (e.type || 'unknown') === type && String(e.severity) === s).length; });
      return row;
    });
  })();

  const cumulativeTimeline = (() => {
    const counts = {};
    events.forEach((e) => { const d = parseDate(e.eventCreated); if (!d) return; const key = d.toISOString().slice(0, 10); counts[key] = (counts[key] || 0) + 1; });
    let cumulative = 0;
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => { cumulative += count; return { date, cumulative }; });
  })();

  const remediationRateOverTime = (() => {
    const byDay = {};
    events.forEach((e) => {
      const d = parseDate(e.eventCreated); if (!d) return;
      const key = d.toISOString().slice(0, 10);
      if (!byDay[key]) byDay[key] = { total: 0, remediated: 0 };
      byDay[key].total++;
      if (e.state === 'remediated' || e.state === 'closed' || e.state === 'done') byDay[key].remediated++;
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { total: t, remediated: r }]) => ({ date, rate: t > 0 ? Math.round((r / t) * 100) : 0 }));
  })();

  // MTTR gauge
  const mttrPct = total ? Math.round((remediated / total) * 100) : 0;

  return {
    kpis: [
      { label: 'Total Events', value: total, color: '#3b82f6' },
      { label: 'Remediated', value: remediated, color: '#22c55e', subtitle: `${remediatedPct}% of total` },
      { label: 'Pending', value: pending, color: '#ef4444', subtitle: `${pendingPct}% of total` },
      { label: 'Avg Severity', value: avgSeverity ?? '—', color: '#f59e0b', subtitle: 'out of 5' },
      { label: 'Critical Events', value: criticalCount, color: '#ef4444', subtitle: 'severity ≥ 4' },
      { label: 'Detected', value: detected, color: '#f97316', subtitle: `${detectedPct}% of total` },
    ],
    groups: [
      // Gauge
      { cols: 2, widgets: [
        { id: 'cp-mttr', type: 'gauge', title: 'Email Security Health Score', meta: { pct: mttrPct, goodLabel: 'Remediated', badLabel: 'Pending', goodCount: remediated, badCount: pending } },
      ]},
      // Daily trend
      { cols: 1, widgets: [
        { id: 'cp-trend', type: 'bar', title: 'Security Events Over Time', subtitle: 'all event types', data: dailyTrend, color: '#6366f1' },
      ]},
      // Donuts
      { cols: 3, widgets: [
        { id: 'cp-severity', type: 'donut', title: 'Severity Distribution', data: severityData },
        { id: 'cp-type', type: 'donut', title: 'Event Type', data: eventTypes },
        { id: 'cp-state', type: 'donut', title: 'Event State', data: stateData },
      ]},
      // Confidence + SaaS
      { cols: 2, widgets: [
        ...(confidenceData.length > 0 ? [{ id: 'cp-confidence', type: 'donut', title: 'Confidence Indicator', data: confidenceData }] : []),
        ...(saasData.length > 0 ? [{ id: 'cp-saas', type: 'donut', title: 'SaaS Platform Distribution', data: saasData }] : []),
      ]},
      // Type × severity stacked
      { cols: 1, widgets: [
        { id: 'cp-typesev', type: 'stacked', title: 'Event Type × Severity', subtitle: 'severity mix within each event type', data: typeSevData, meta: { keys: ['Informational', 'Low', 'Medium', 'High', 'Critical'], fills: { Informational: '#22c55e', Low: '#84cc16', Medium: '#f59e0b', High: '#f97316', Critical: '#ef4444' } } },
      ]},
      // Cumulative + remediation rate
      { cols: 2, widgets: [
        { id: 'cp-cumulative', type: 'line', title: 'Cumulative Events Over Time', subtitle: 'running total of security events', data: cumulativeTimeline, color: '#6366f1' },
        { id: 'cp-remediation', type: 'line', title: 'Remediation Rate Over Time', subtitle: '% events remediated per day', data: remediationRateOverTime, color: '#22c55e' },
      ]},
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIREWALL (Palo Alto)
// ═══════════════════════════════════════════════════════════════════════════════

// Firewall helpers (inline to avoid import cycle)
const fwParseNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};
const fwToArray = (v) => {
  if (Array.isArray(v) && v.length > 0) return v;
  if (v && typeof v === 'object' && !Array.isArray(v)) return [v];
  return undefined;
};
const fwExtractTable = (raw) => {
  if (!raw) return null;
  try {
    const entry = fwToArray(raw?.report?.result?.entry) || fwToArray(raw?.report?.result?.report?.entry) ||
      fwToArray(raw?.response?.result?.report?.entry) || fwToArray(raw?.response?.result?.entry) ||
      fwToArray(raw?.result?.report?.entry) || fwToArray(raw?.result?.entry) || fwToArray(raw?.entry);
    if (entry && entry.length > 0) {
      const colSet = new Set();
      entry.forEach((item) => {
        if (typeof item === 'object' && item !== null)
          Object.keys(item).forEach((k) => { if (k === '@name') colSet.add('name'); else if (!k.startsWith('@')) colSet.add(k); });
      });
      const columns = Array.from(colSet);
      const rows = entry.map((item) => {
        const row = {};
        columns.forEach((col) => {
          const rk = col === 'name' ? '@name' : col;
          const value = item?.[rk] ?? item?.[col];
          row[col] = typeof value === 'object' && value !== null && '#text' in value ? value['#text'] : (value ?? '');
        });
        return row;
      });
      return { columns, rows };
    }
    if (Array.isArray(raw)) return { columns: Array.from(new Set(raw.flatMap((item) => Object.keys(item || {})))), rows: raw };
  } catch { /* ignore */ }
  return null;
};
const fwFirst = (row, cols, fallback = '-') => {
  for (const col of cols) { const v = row?.[col]; if (v !== undefined && v !== null && v !== '') return v; }
  return fallback;
};
const fwSum = (rows, cols) => {
  const col = cols.find((c) => rows.some((r) => r[c] !== undefined && r[c] !== null && r[c] !== ''));
  if (!col) return 0;
  return rows.reduce((sum, r) => sum + fwParseNumber(r[col]), 0);
};
const fwTopChart = (rows, cols, limit = 8) => {
  const map = new Map();
  rows.forEach((row) => {
    const value = String(fwFirst(row, cols, '')).trim();
    if (!value || value === '-') return;
    const rawCount = fwFirst(row, ['count', 'nrepeat', 'nsess', 'sessions', 'threats', 'nbytes', 'bytes'], null);
    const n = rawCount !== null ? fwParseNumber(rawCount) : 1;
    map.set(value, (map.get(value) || 0) + (n > 0 ? n : 1));
  });
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([name, value]) => ({ name: name.length > 24 ? name.slice(0, 24) + '…' : name, value }));
};
const fwRiskDistribution = (rows) => {
  const map = new Map();
  const RISK_COLORS_FW = { '1': '#22c55e', '2': '#84cc16', '3': '#f59e0b', '4': '#f97316', '5': '#ef4444' };
  rows.forEach((row) => {
    const risk = String(fwFirst(row, ['risk', 'severity', 'name'], '-'));
    const count = fwParseNumber(fwFirst(row, ['count', 'nrepeat', 'nsess', 'sessions'], 1));
    if (!risk || risk === '-') return;
    map.set(risk, (map.get(risk) || 0) + (count || 1));
  });
  return Array.from(map.entries())
    .map(([risk, value]) => ({ name: `Risk ${risk}`, value, fill: RISK_COLORS_FW[risk] || '#6366f1' }))
    .sort((a, b) => fwParseNumber(a.name.split(' ')[1]) - fwParseNumber(b.name.split(' ')[1]));
};

export function buildFirewallWidgets(reports) {
  if (!reports || !reports.length) return { kpis: [], groups: [] };

  const getRows = (name) => reports.find((r) => r.report === name)?.rows ?? [];
  const allRows = reports.flatMap((r) => r.rows);
  const riskRows = getRows('risk-trend');
  const attackRows = getRows('top-attacks');
  const sourceRows = getRows('top-attacker-sources');
  const destRows = [...getRows('top-attacker-destinations'), ...getRows('top-denied-destinations')];
  const deniedDestRows = getRows('top-denied-destinations');
  const deniedSourceRows = getRows('top-denied-sources');
  const deniedAppRows = getRows('top-denied-applications');
  const connRows = getRows('top-connections');
  const riskyUserRows = getRows('risky-users');

  const totalSessions = fwSum(allRows, ['nsess', 'sessions', 'session', 'count']);
  const totalTraffic = fwSum(allRows, ['nbytes', 'bytes', 'byte']);
  const highRiskEvents = riskRows.reduce((sum, row) => {
    const risk = fwParseNumber(fwFirst(row, ['risk', 'name', 'severity'], 0));
    return risk >= 4 ? sum + fwParseNumber(fwFirst(row, ['count', 'nrepeat', 'nsess', 'sessions'], 1)) : sum;
  }, 0);
  const topDestEntry = fwTopChart(destRows, ['dst', 'destination', 'destination_ip', 'name'], 1)[0];
  const securityScore = Math.min(100, Math.max(0, Math.round(100 - highRiskEvents * 0.5)));
  const riskLabel = securityScore >= 80 ? 'Excellent' : securityScore >= 50 ? 'Warning' : 'Critical';

  const riskDistribution = fwRiskDistribution(riskRows.length ? riskRows : allRows);
  const topAttacks = fwTopChart(attackRows.length ? attackRows : allRows, ['threatid', 'threat', 'name', 'category']);
  const topSources = fwTopChart(sourceRows.length ? sourceRows : allRows, ['src', 'source', 'source_ip', 'name']);
  const topDeniedDest = fwTopChart(deniedDestRows.length ? deniedDestRows : allRows, ['dst', 'destination', 'destination_ip', 'name']);
  const topDeniedSources = fwTopChart(deniedSourceRows.length ? deniedSourceRows : allRows, ['src', 'source', 'source_ip', 'name']);
  const topDeniedApps = fwTopChart(deniedAppRows.length ? deniedAppRows : allRows, ['application', 'category', 'name']);
  const topConnections = fwTopChart(connRows.length ? connRows : allRows, ['source', 'destination', 'name', 'src', 'dst']);
  const riskyUsers = fwTopChart(riskyUserRows.length ? riskyUserRows : allRows, ['user', 'username', 'source_user', 'name'], 8);
  const riskTrend = riskRows.map((row) => ({
    name: String(fwFirst(row, ['date', 'day', 'name', 'time'], '')),
    traffic: fwSum([row], ['nbytes', 'bytes']),
    sessions: fwSum([row], ['nsess', 'sessions']),
  })).filter((r) => r.name);

  return {
    kpis: [
      { label: 'Total Sessions', value: fmtNum(totalSessions), color: '#3b82f6' },
      { label: 'Total Traffic', value: totalTraffic, color: '#06b6d4', valueFmt: 'bytes' },
      { label: 'High Risk Events', value: fmtNum(highRiskEvents), color: '#ef4444' },
      { label: 'Top Destination', value: truncateLabel(topDestEntry?.name || '-', 14), color: undefined },
      { label: 'Security Score', value: securityScore, color: '#22c55e', subtitle: riskLabel },
    ],
    groups: [
      { cols: 3, widgets: [
        { id: 'fw-risk', type: 'donut', title: 'Risk-wise Distribution', data: riskDistribution },
        { id: 'fw-attacks', type: 'hbar', title: 'Top Attacks', data: topAttacks, color: '#ef4444' },
        { id: 'fw-sources', type: 'hbar', title: 'Top Sources', data: topSources, color: '#3b82f6' },
      ]},
      { cols: 3, widgets: [
        { id: 'fw-denied-dest', type: 'hbar', title: 'Top Denied Destinations', data: topDeniedDest, color: '#f59e0b' },
        { id: 'fw-denied-src', type: 'hbar', title: 'Top Denied Sources', data: topDeniedSources, color: '#06b6d4' },
        { id: 'fw-denied-apps', type: 'hbar', title: 'Top Denied Applications', data: topDeniedApps, color: '#8b5cf6' },
      ]},
      { cols: 2, widgets: [
        { id: 'fw-conn', type: 'hbar', title: 'Top Connections', data: topConnections, color: '#ec4899' },
        { id: 'fw-risky', type: 'hbar', title: 'Risky Users', data: riskyUsers, color: '#ef4444' },
      ]},
      ...(riskTrend.length > 0 ? [{ cols: 1, widgets: [
        { id: 'fw-trend', type: 'composed', title: 'Risk Trend Over Time', subtitle: 'bars = traffic · line = sessions', data: riskTrend, meta: { barKey: 'traffic', lineKey: 'sessions', barName: 'Traffic (bytes)', lineName: 'Sessions', barColor: '#3b82f6', lineColor: '#f59e0b' } },
      ] }] : []),
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MICROSOFT 365
// ═══════════════════════════════════════════════════════════════════════════════

export function buildMicrosoftWidgets(msData) {
  if (!msData) return { kpis: [], groups: [] };

  const arr = (key) => msData[key]?.data?.value ?? [];
  const users = arr('users');
  const signIns = arr('signIns');
  const riskyUsers = arr('riskyUsers');
  const riskDetections = arr('riskDetections');
  const securityAlerts = arr('securityAlerts');
  const secureScores = arr('secureScores');
  const managedDevices = arr('managedDevices');
  const serviceIssues = arr('serviceIssues');
  const subscribedSkus = arr('subscribedSkus');
  const authMeta = msData?.['organization']?.data?.value?.[0];

  const activeUsers = users.filter((u) => u.accountEnabled).length;
  const totalLicenses = subscribedSkus.reduce((s, l) => s + (l.prepaidUnits?.enabled || 0), 0);
  const consumedLicenses = subscribedSkus.reduce((s, l) => s + (l.consumedUnits || 0), 0);
  const unassignedLicenses = Math.max(0, totalLicenses - consumedLicenses);
  const numSkus = subscribedSkus.length;

  const failedSignIns = signIns.filter((s) => s.status?.errorCode !== 0).length;
  const failedPct = signIns.length ? Math.round((failedSignIns / signIns.length) * 100) : 0;

  const secureScore = secureScores[0];
  const tenantName = authMeta?.displayName || authMeta?.userPrincipalName || '—';

  const roleData = bucket(users, (u) => (u.assignedRoles?.length || 0) > 0 ? 'Admin' : 'Standard');
  const licenseStatus = [
    { name: 'Assigned', value: consumedLicenses, fill: '#22c55e' },
    { name: 'Available', value: unassignedLicenses, fill: '#3b82f6' },
  ];

  const signInTrend = (() => {
    const counts = {};
    signIns.forEach((s) => {
      const d = parseDate(s.createdDateTime); if (!d) return;
      const key = d.toISOString().slice(0, 10);
      if (!counts[key]) counts[key] = { date: key, success: 0, failure: 0 };
      if (s.status?.errorCode === 0) counts[key].success++; else counts[key].failure++;
    });
    return Object.values(counts).sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
  })();

  // Additional chart data (mirrors the live page's additional donuts)
  const riskEvtData = bucket(riskDetections, (r) => r.riskEventType || 'Unknown').slice(0, 8);
  const riskLvlData = bucket(riskyUsers, (u) => u.riskLevel || 'Unknown');
  const alertSevData = bucket(securityAlerts, (a) => a.severity || 'Unknown');
  const complianceData = bucket(managedDevices, (d) => d.complianceState || 'Unknown');

  const riskyUserCount = riskyUsers.length;

  return {
    kpis: [
      { label: 'Tenant', value: tenantName, color: undefined },
      { label: 'Total Users', value: users.length, color: '#3b82f6' },
      { label: 'Active Users', value: activeUsers, color: '#22c55e' },
      { label: 'Sign-ins', value: signIns.length, color: '#8b5cf6' },
      { label: 'Failed Sign-ins', value: failedSignIns, color: '#ef4444', subtitle: `${failedPct}% of sign-ins`, goodWhenUp: false },
      { label: 'Risky Users', value: riskyUserCount, color: '#ef4444' },
      { label: 'Security Alerts', value: securityAlerts.length, color: '#f59e0b' },
    ],
    secondaryKpis: [
      { label: 'Secure Score', value: secureScore?.currentScore ?? '—', color: '#10b981', subtitle: secureScore?.maxScore ? `/ ${secureScore.maxScore}` : '' },
      { label: 'License Utilization', value: totalLicenses ? `${Math.round((consumedLicenses / totalLicenses) * 100)}%` : '—', color: '#8b5cf6', subtitle: `${fmtNum(consumedLicenses)} / ${fmtNum(totalLicenses)}` },
      { label: 'Unassigned Licenses', value: fmtNum(unassignedLicenses), color: '#94a3b8' },
      { label: 'Managed Devices', value: managedDevices.length, color: '#3b82f6' },
      { label: 'Service Issues', value: serviceIssues.length, color: '#f97316' },
      { label: 'SKUs', value: numSkus, color: '#94a3b8' },
    ],
    groups: [
      { cols: 2, widgets: [
        { id: 'ms-roles', type: 'donut', title: 'User Roles', data: roleData },
        { id: 'ms-licenses', type: 'donut', title: 'License Status', data: licenseStatus },
      ]},
      ...((riskEvtData.length > 0 || riskLvlData.length > 0 || alertSevData.length > 0 || complianceData.length > 0) ? [{ cols: 3, widgets: [
        ...(riskEvtData.length > 0 ? [{ id: 'ms-risk-events', type: 'donut', title: 'Risk Detections by Type', data: riskEvtData }] : []),
        ...(riskLvlData.length > 0 ? [{ id: 'ms-risk-levels', type: 'donut', title: 'Risky Users by Level', data: riskLvlData }] : []),
        ...(alertSevData.length > 0 ? [{ id: 'ms-alert-sev', type: 'donut', title: 'Alerts by Severity', data: alertSevData }] : []),
        ...(complianceData.length > 0 ? [{ id: 'ms-compliance', type: 'donut', title: 'Device Compliance', data: complianceData }] : []),
      ] }] : []),
      ...(signInTrend.length > 0 ? [{ cols: 1, widgets: [
        { id: 'ms-signins', type: 'bar', title: 'Sign-in Trend (Success vs Failure)', data: signInTrend.map((d) => ({ name: d.date.slice(5), success: d.success, failure: d.failure })), meta: { keys: ['success', 'failure'], fills: { success: '#22c55e', failure: '#ef4444' }, stacked: true } },
      ] }] : []),
      { cols: 2, widgets: [
        { id: 'ms-assigned', type: 'scorebar', title: 'Assigned vs Unassigned Licenses', data: [{ name: 'Assigned', value: consumedLicenses }], meta: { max: totalLicenses, color: consumedLicenses > unassignedLicenses ? '#22c55e' : '#f59e0b', sub: `${consumedLicenses} / ${totalLicenses}` } },
      ]},
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section metadata for PDF cover pages
// ═══════════════════════════════════════════════════════════════════════════════

export const SECTION_META = {
  s1agents: { number: 1, title: '1.1 — Agent Analytics', subtitle: 'SentinelOne Agent Fleet', color: '#10b981' },
  s1cves: { number: 1, title: '1.2 — Application CVEs', subtitle: 'SentinelOne Application Vulnerabilities', color: '#10b981' },
  s1threats: { number: 1, title: '1.3 — Threat Analytics', subtitle: 'SentinelOne Threat Intelligence', color: '#10b981' },
  mdm: { number: 2, title: 'MDM / Hexnode', subtitle: 'Mobile Device Management', color: '#06b6d4' },
  nvd: { number: 3, title: 'NVD CVEs', subtitle: 'National Vulnerability Database', color: '#8b5cf6' },
  checkpoint: { number: 4, title: 'Checkpoint Harmony', subtitle: 'Email Security', color: '#6366f1' },
  firewall: { number: 5, title: 'Palo Alto Firewall', subtitle: 'Network Security', color: '#f59e0b' },
  zoho: { number: 6, title: 'Zoho Desk', subtitle: 'Ticketing System', color: '#3b82f6' },
  microsoft: { number: 7, title: 'Microsoft 365', subtitle: 'Identity & Access', color: '#8b5cf6' },
};
