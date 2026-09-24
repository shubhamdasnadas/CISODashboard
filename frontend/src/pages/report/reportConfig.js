import { buildCveData, formatBytes } from './dataUtils';

// ── Shared formatting and pure data helpers ──────────────────────────────────
export const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
export const SEV_LABELS_FULL = ['Informational', 'Low', 'Medium', 'High', 'Critical'];
export const SEV_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];

export const fmtNum = (v) => Number(v || 0).toLocaleString('en-IN');
export const truncateLabel = (label, maxLen = 20) => {
  if (!label || label === '-') return label;
  return String(label).length > maxLen ? String(label).slice(0, maxLen) + '...' : String(label);
};

export const bucket = (arr, keyFn, fallback = 'unknown') => {
  const counts = {};
  (arr || []).forEach((item) => { const k = keyFn(item) || fallback; counts[k] = (counts[k] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
};

export const topN = (arr, keyFn, n = 8) => {
  const c = {};
  (arr || []).forEach((item) => { const k = keyFn(item); if (k) c[k] = (c[k] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, value]) => ({ name: truncateLabel(name), value }));
};

export const parseDate = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };

export const formatDuration = (minutes) => {
  if (minutes == null || isNaN(minutes) || minutes === 0) return '—';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) { const h = Math.floor(minutes / 60); const m = Math.round(minutes % 60); return m > 0 ? `${h}h ${m}m` : `${h}h`; }
  const d = Math.floor(minutes / 1440); const h = Math.round((minutes % 1440) / 60);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
};

export const parseDuration = (v) => {
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

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS REPORT CONFIGURATION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════
// Config-driven architecture:
// Each integration defines its sub-tabs, data availability predicate (`hasData`),
// lead text, KPI rows (with delta support), progress bars, and widget items.
// ═══════════════════════════════════════════════════════════════════════════════

export const ANALYTICS_CONFIG = [
  // ── 1. SentinelOne ──────────────────────────────────────────────────────────
  {
    id: 'security',
    alias: 'sentinelone',
    title: 'SentinelOne',
    color: '#10b981',
    hasData: (data) =>
      (Array.isArray(data.s1Agents) && data.s1Agents.length > 0) ||
      (Array.isArray(data.s1Cves) && data.s1Cves.length > 0) ||
      (Array.isArray(data.s1Threats) && data.s1Threats.length > 0),
    subTabs: [
      // 1.1 Agent Analytics
      {
        id: 's1agents',
        sectionKey: 's1agents',
        number: '1.1',
        title: 'SentinelOne — Agent Analytics',
        subtitle: 'Endpoint protection & agent health',
        color: '#10b981',
        hasData: (data) => Array.isArray(data.s1Agents) && data.s1Agents.length > 0,
        getLead: (data) => {
          const agents = data.s1Agents || [];
          const active = agents.filter((a) => a.isActive).length;
          const health = agents.length ? Math.round((active / agents.length) * 100) : 0;
          const threats = agents.filter((a) => (a.activeThreats || 0) > 0).length;
          const outdated = agents.filter((a) => !a.isUpToDate).length;
          return `${agents.length} agents · ${active} active (${health}% health) · ${agents.length - active} inactive · ${threats} with active threats · ${outdated} outdated.`;
        },
        getKpis: (data) => {
          const curList = data.s1Agents || [];
          const prevList = Array.isArray(data.s1AgentsPrev) ? data.s1AgentsPrev : null;
          const compute = (arr) => ({
            total: arr.length,
            active: arr.filter((a) => a.isActive).length,
            inactive: arr.length - arr.filter((a) => a.isActive).length,
            threats: arr.filter((a) => (a.activeThreats || 0) > 0).length,
            outdated: arr.filter((a) => !a.isUpToDate).length,
          });
          const cur = compute(curList);
          const prev = prevList ? compute(prevList) : null;
          const health = cur.total ? Math.round((cur.active / cur.total) * 100) : 0;
          return [
            [
              { label: 'Total Agents', value: cur.total, cur: cur.total, prev: prev?.total, color: '#3b82f6', goodWhenUp: true },
              { label: 'Active', value: cur.active, cur: cur.active, prev: prev?.active, color: '#10b981', sub: `${health}% health`, goodWhenUp: true },
              { label: 'Inactive', value: cur.inactive, cur: cur.inactive, prev: prev?.inactive, color: '#ef4444', goodWhenUp: false },
              { label: 'Active Threats', value: cur.threats, cur: cur.threats, prev: prev?.threats, color: '#f59e0b', goodWhenUp: false },
              { label: 'Outdated', value: cur.outdated, cur: cur.outdated, prev: prev?.outdated, color: '#ef4444', goodWhenUp: false },
            ],
          ];
        },
        getWidgets: (data) => {
          const agents = data.s1Agents || [];
          const active = agents.filter((a) => a.isActive).length;
          const inactive = agents.length - active;
          const osDist = bucket(agents, (a) => a.osName || 'Unknown');
          const activeStatus = [
            { name: 'Active', value: active, fill: '#10b981' },
            { name: 'Inactive', value: inactive, fill: '#ef4444' },
          ].filter((d) => d.value > 0);
          const fwStatus = [
            { name: 'Enabled', value: agents.filter((a) => a.firewallEnabled).length, fill: '#3b82f6' },
            { name: 'Disabled', value: agents.filter((a) => !a.firewallEnabled).length, fill: '#f59e0b' },
          ].filter((d) => d.value > 0);
          const versionStatus = [
            { name: 'Up to Date', value: agents.filter((a) => a.isUpToDate).length, fill: '#10b981' },
            { name: 'Outdated', value: agents.filter((a) => !a.isUpToDate).length, fill: '#ef4444' },
          ].filter((d) => d.value > 0);
          const siteDist = bucket(agents, (a) => a.siteName || 'Unknown').slice(0, 8);
          const networkStatus = bucket(agents, (a) => a.networkStatus || 'Unknown');
          const scanStatus = bucket(agents, (a) => a.scanStatus || 'Unknown');

          return [
            { id: 'os_dist', title: 'OS Distribution', type: 'donut', data: osDist, half: true },
            { id: 'active_status', title: 'Active Status', type: 'donut', data: activeStatus, half: true },
            { id: 'fw_status', title: 'Firewall Status', type: 'donut', data: fwStatus, half: true },
            { id: 'ver_status', title: 'Agent Version', type: 'donut', data: versionStatus, half: true },
            { id: 'site_dist', title: 'Site Distribution', type: 'donut', data: siteDist, half: true },
            { id: 'net_status', title: 'Network Status', type: 'donut', data: networkStatus, half: true },
            ...(scanStatus.length > 0 ? [{ id: 'scan_status', title: 'Scan Status', type: 'donut', data: scanStatus, half: true }] : []),
          ];
        },
      },

      // 1.2 Application CVEs
      {
        id: 's1cves',
        sectionKey: 's1cves',
        number: '1.2',
        title: 'SentinelOne — Application CVEs',
        subtitle: 'Known vulnerabilities & CVSS analysis',
        color: '#7c3aed',
        hasData: (data) => Array.isArray(data.s1Cves) && data.s1Cves.length > 0,
        getLead: (data) => {
          const cveData = buildCveData(data.s1Cves || []);
          return `${cveData.totalApplications} applications · ${cveData.totalCves} CVEs · ${cveData.totalEndpoints} endpoints affected · average CVSS ${cveData.avgScore}.`;
        },
        getKpis: (data) => {
          const curData = buildCveData(data.s1Cves || []);
          const prevData = Array.isArray(data.s1CvesPrev) ? buildCveData(data.s1CvesPrev) : null;
          return [
            [
              { label: 'Applications', value: curData.totalApplications, cur: curData.totalApplications, prev: prevData?.totalApplications, color: '#a78bfa', goodWhenUp: true },
              { label: 'Total CVEs', value: curData.totalCves, cur: curData.totalCves, prev: prevData?.totalCves, color: '#818cf8', goodWhenUp: false },
              { label: 'Endpoints Affected', value: curData.totalEndpoints, cur: curData.totalEndpoints, prev: prevData?.totalEndpoints, color: '#3b82f6', goodWhenUp: false },
              { label: 'Avg Score', value: curData.avgScore, cur: curData.avgScore !== '—' ? parseFloat(curData.avgScore) : null, prev: prevData && prevData.avgScore !== '—' ? parseFloat(prevData.avgScore) : null, color: '#94a3b8', goodWhenUp: false },
            ],
            [
              { label: 'Critical', value: curData.severityMap.CRITICAL, cur: curData.severityMap.CRITICAL, prev: prevData?.severityMap?.CRITICAL, color: '#a855f7', goodWhenUp: false },
              { label: 'High', value: curData.severityMap.HIGH, cur: curData.severityMap.HIGH, prev: prevData?.severityMap?.HIGH, color: '#ef4444', goodWhenUp: false },
              { label: 'Medium', value: curData.severityMap.MEDIUM, cur: curData.severityMap.MEDIUM, prev: prevData?.severityMap?.MEDIUM, color: '#f59e0b', goodWhenUp: false },
              { label: 'Low', value: curData.severityMap.LOW, cur: curData.severityMap.LOW, prev: prevData?.severityMap?.LOW, color: '#3b82f6', goodWhenUp: false },
            ],
          ];
        },
        getWidgets: (data) => {
          const cveData = buildCveData(data.s1Cves || []);
          const scoreRange = cveData.scoreRange.length
            ? cveData.scoreRange.map((x) => ({ name: x.name, value: x.count, fill: x.fill }))
            : [];
          const endpointImpact = cveData.endpointImpact.length
            ? cveData.endpointImpact.slice(0, 6).map((x) => ({ name: x.name, value: x.endpoints, fill: COLORS[1] }))
            : [];
          const vendorRisk = cveData.vendorRisk.length
            ? cveData.vendorRisk.slice(0, 6).map((x) => ({ name: x.name, value: x.cves, fill: COLORS[3] }))
            : [];
          const agingData = cveData.cveAging.length
            ? cveData.cveAging.map((x) => ({ name: x.name, value: x.count, fill: COLORS[2] }))
            : [];

          return [
            { id: 'cve_sev', title: 'CVE Severity Distribution', type: 'hbar', data: cveData.severityDistribution, half: true },
            { id: 'cve_cvss', title: 'CVSS Base Score Range', type: 'bar', data: scoreRange, half: true },
            { id: 'cve_apps', title: 'Top Risky Applications', type: 'hbar', data: cveData.topRiskyApps.slice(0, 8).map((x) => ({ name: x.name, value: x.cves, fill: COLORS[0] })), color: '#ef4444', half: true },
            { id: 'cve_aging', title: 'CVE Aging', type: 'bar', data: agingData, color: '#06b6d4', half: true },
            { id: 'cve_endpoints', title: 'Endpoint Impact', type: 'hbar', data: endpointImpact, color: '#f59e0b', half: true },
            { id: 'cve_vendors', title: 'Top Vendors by Risk', type: 'hbar', data: vendorRisk, color: '#8b5cf6', half: true },
          ];
        },
      },

      // 1.3 Threat Analytics
      {
        id: 's1threats',
        sectionKey: 's1threats',
        number: '1.3',
        title: 'SentinelOne — Threat Analytics',
        subtitle: 'Threat detection, trends & mitigation',
        color: '#dc2626',
        hasData: (data) => Array.isArray(data.s1Threats) && data.s1Threats.length > 0,
        getLead: (data) => {
          const list = data.s1Threats || [];
          const mitigated = list.filter((t) => t.threatInfo?.mitigationStatus === 'mitigated').length;
          const mitRate = list.length ? Math.round((mitigated / list.length) * 100) : 0;
          const unresolved = list.filter((t) => ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus)).length;
          const fileless = list.filter((t) => t.threatInfo?.isFileless).length;
          return `${list.length} threats · ${mitigated} mitigated (${mitRate}%) · ${unresolved} unresolved · ${fileless} fileless.`;
        },
        getKpis: (data) => {
          const curList = data.s1Threats || [];
          const prevList = Array.isArray(data.s1ThreatsPrev) ? data.s1ThreatsPrev : null;
          const compute = (arr) => {
            const total = arr.length;
            const mitigated = arr.filter((t) => t.threatInfo?.mitigationStatus === 'mitigated').length;
            const unresolved = arr.filter((t) => ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus)).length;
            const fileless = arr.filter((t) => t.threatInfo?.isFileless).length;
            let mttdSum = 0, mttdCount = 0, mttmSum = 0, mttmCount = 0;
            arr.forEach((t) => {
              const created = parseDate(t.threatInfo?.createdAt);
              const identified = parseDate(t.threatInfo?.identifiedAt);
              if (created && identified) { mttdSum += (created - identified) / 60000; mttdCount++; }
              const successEntry = (t.mitigationStatus || []).find((s) => s.status === 'success');
              if (successEntry && identified) {
                const ended = parseDate(successEntry.mitigationEndedAt);
                if (ended) { mttmSum += (ended - identified) / 60000; mttmCount++; }
              }
            });
            return {
              total, mitigated, unresolved, fileless,
              avgMttd: mttdCount ? mttdSum / mttdCount : 0,
              avgMttm: mttmCount ? mttmSum / mttmCount : 0,
            };
          };
          const cur = compute(curList);
          const prev = prevList ? compute(prevList) : null;
          const mitRate = cur.total ? Math.round((cur.mitigated / cur.total) * 100) : 0;

          return [
            [
              { label: 'Total Threats', value: cur.total, cur: cur.total, prev: prev?.total, color: '#3b82f6', goodWhenUp: false },
              { label: 'Mitigated', value: cur.mitigated, cur: cur.mitigated, prev: prev?.mitigated, color: '#10b981', sub: `${mitRate}% of total`, goodWhenUp: true },
              { label: 'Unresolved', value: cur.unresolved, cur: cur.unresolved, prev: prev?.unresolved, color: '#ef4444', goodWhenUp: false },
              { label: 'Fileless', value: cur.fileless, cur: cur.fileless, prev: prev?.fileless, color: '#f59e0b', goodWhenUp: false },
              { label: 'Avg MTTD', value: formatDuration(cur.avgMttd), cur: Math.round(cur.avgMttd), prev: prev ? Math.round(prev.avgMttd) : null, color: '#8b5cf6', sub: 'time to detect', goodWhenUp: false },
              { label: 'Avg MTTM', value: formatDuration(cur.avgMttm), cur: Math.round(cur.avgMttm), prev: prev ? Math.round(prev.avgMttm) : null, color: '#06b6d4', sub: 'time to mitigate', goodWhenUp: false },
            ],
          ];
        },
        getProgress: (data) => {
          const list = data.s1Threats || [];
          const total = list.length;
          const mitigated = list.filter((t) => t.threatInfo?.mitigationStatus === 'mitigated').length;
          const unresolved = list.filter((t) => ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus)).length;
          const mitRate = total ? Math.round((mitigated / total) * 100) : 0;
          return {
            title: 'Threat Mitigation Progress',
            label: 'Mitigation Rate',
            value: mitRate,
            max: 100,
            color: '#10b981',
            sub: `${mitigated} mitigated of ${total} total threats · ${unresolved} unresolved`,
          };
        },
        getWidgets: (data) => {
          const threats = data.s1Threats || [];
          const threatTrend = (() => {
            const counts = {};
            threats.forEach((t) => {
              const d = parseDate(t.threatInfo?.createdAt);
              if (!d) return;
              const key = d.toISOString().slice(0, 10);
              counts[key] = (counts[key] || 0) + 1;
            });
            return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-20).map(([date, count]) => ({ date, count }));
          })();
          const classData = bucket(threats, (t) => t.threatInfo?.classification || 'Unknown');
          const filelessCount = threats.filter((t) => t.threatInfo?.isFileless).length;
          const filelessData = [
            { name: 'Fileless', value: filelessCount, fill: '#ef4444' },
            { name: 'File-based', value: threats.length - filelessCount, fill: '#3b82f6' },
          ].filter((d) => d.value > 0);
          const mitData = (() => {
            const counts = {};
            threats.forEach((t) => (t.mitigationStatus || []).forEach((s) => { if (s.status) counts[s.status] = (counts[s.status] || 0) + 1; }));
            return Object.entries(counts).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
          })();
          const topEndpoints = topN(threats, (t) => t.agentRealtimeInfo?.agentComputerName || t.agentDetectionInfo?.agentComputerName || '');
          const topUsers = topN(threats, (t) => t.threatInfo?.initiatingUsername || t.threatInfo?.processUser || '');
          const threatsBySite = topN(threats, (t) => t.agentRealtimeInfo?.siteName || t.siteName || t.agentDetectionInfo?.siteName || '');

          return [
            ...(threatTrend.length > 0 ? [{ id: 'threat_trend', title: 'Threat Trend Over Time (Daily New Threats)', type: 'line', data: threatTrend, labelKey: 'date', valueKey: 'count', color: '#3b82f6', half: false }] : []),
            { id: 'threat_class', title: 'Classification', type: 'donut', data: classData, half: true },
            { id: 'threat_fileless', title: 'Fileless vs File-based', type: 'donut', data: filelessData, half: true },
            { id: 'threat_mit_outcomes', title: 'Mitigation Outcomes', type: 'donut', data: mitData, half: true },
            { id: 'threat_endpoints', title: 'Top Affected Endpoints', type: 'hbar', data: topEndpoints, color: '#3b82f6', half: true },
            { id: 'threat_users', title: 'Top Users by Threat', type: 'hbar', data: topUsers, color: '#f59e0b', half: true },
            { id: 'threat_sites', title: 'Threats by Site', type: 'hbar', data: threatsBySite, color: '#dc2626', half: true },
          ];
        },
      },
    ],
  },

  // ── 2. MDM / Hexnode ─────────────────────────────────────────────────────────
  {
    id: 'mdm',
    sectionKey: 'mdm',
    number: '2',
    title: 'MDM / Hexnode — Mobile Device Management',
    subtitle: 'Mobile device management & compliance',
    color: '#06b6d4',
    hasData: (data) => (Array.isArray(data.mdmDevices) && data.mdmDevices.length > 0) || (Array.isArray(data.mdmApps) && data.mdmApps.length > 0),
    getLead: (data) => {
      const devList = data.mdmDevices || [];
      const appList = data.mdmApps || [];
      const isStale = (d) => d.last_reported && (Date.now() - new Date(d.last_reported).getTime()) > 7 * 86400000;
      const nonCompliant = devList.filter((d) => d.compliant !== true).length;
      const stale = devList.filter(isStale).length;
      return `${devList.length} devices · ${appList.length} applications tracked · ${nonCompliant} non-compliant · ${stale} stale devices.`;
    },
    getKpis: (data) => {
      const devList = data.mdmDevices || [];
      const prevDevList = Array.isArray(data.mdmDevicesPrev) ? data.mdmDevicesPrev : null;
      const isStale = (d) => d.last_reported && (Date.now() - new Date(d.last_reported).getTime()) > 7 * 86400000;
      const curStale = devList.filter(isStale).length;
      const curNonCompliant = devList.filter((d) => d.compliant !== true).length;
      const prevStale = prevDevList ? prevDevList.filter(isStale).length : null;
      const prevNonCompliant = prevDevList ? prevDevList.filter((d) => d.compliant !== true).length : null;

      return [
        [
          { label: 'Enrolled Devices', value: devList.length, cur: devList.length, prev: prevDevList?.length, color: '#3b82f6', goodWhenUp: true },
          { label: 'Applications Tracked', value: (data.mdmApps || []).length, color: '#8b5cf6' },
          { label: 'Non-compliant', value: curNonCompliant, cur: curNonCompliant, prev: prevNonCompliant, color: '#ef4444', goodWhenUp: false },
          { label: 'Stale (>7d)', value: curStale, cur: curStale, prev: prevStale, color: '#ef4444', goodWhenUp: false },
        ],
      ];
    },
    getWidgets: (data) => {
      const devList = data.mdmDevices || [];
      const appList = data.mdmApps || [];
      const osData = bucket(devList, (d) => d.os_name || d.os_type || d.platform || d.os || 'Unknown');
      const complianceData = devList.length === 0 ? [] : [
        { name: 'Compliant', value: devList.filter((d) => d.compliant === true).length, fill: '#10b981' },
        { name: 'Non-compliant', value: devList.filter((d) => d.compliant !== true).length, fill: '#ef4444' },
      ].filter((d) => d.value > 0);
      const deviceType = bucket(devList, (d) => d.device_type || 'Unknown');
      const appPlatform = bucket(appList, (a) => a.platform || a.os_type || a.os_name || 'Unknown');

      return [
        { id: 'mdm_os', title: 'Device OS / Platform', type: 'donut', data: osData, half: true },
        { id: 'mdm_compliance', title: 'Compliance Status', type: 'donut', data: complianceData, half: true },
        { id: 'mdm_type', title: 'Device Type', type: 'donut', data: deviceType, half: true },
        ...(appPlatform.length > 0 ? [{ id: 'mdm_apps', title: 'App Platform Breakdown', type: 'donut', data: appPlatform, half: true }] : []),
      ];
    },
  },

  // ── 3. NVD ──────────────────────────────────────────────────────────────────
  {
    id: 'nvd',
    sectionKey: 'nvd',
    number: '3',
    title: 'NVD — National Vulnerability Database',
    subtitle: 'Vulnerability telemetry & CVSS breakdown',
    color: '#8b5cf6',
    hasData: (data) => (Array.isArray(data.nvdRows) && data.nvdRows.length > 0) || Boolean(data.nvdStats),
    getLead: (data) => {
      const rows = data.nvdRows || [];
      const total = rows.length;
      let highRisk = 0;
      rows.forEach((v) => {
        const s = String(v.cvss_base_severity || '').toUpperCase();
        const sc = Number(v.cvss_base_score);
        if (s === 'CRITICAL' || s === 'HIGH' || sc >= 7) highRisk++;
      });
      const highRiskPct = total ? Math.round((highRisk / total) * 100) : 0;
      return `${fmtNum(total)} CVEs in scope · ${fmtNum(highRisk)} Critical/High (${highRiskPct}%).`;
    },
    getKpis: (data) => {
      const computeNvd = (arr) => {
        let total = 0;
        let sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
        let withWeakness = 0;
        let scoreSum = 0;
        let scoreCount = 0;
        if (Array.isArray(arr) && arr.length > 0) {
          total = arr.length;
          arr.forEach((v) => {
            let s = String(v.cvss_base_severity || '').toUpperCase();
            const sc = Number(v.cvss_base_score);
            if (!s) {
              if (sc >= 9) s = 'CRITICAL';
              else if (sc >= 7) s = 'HIGH';
              else if (sc >= 4) s = 'MEDIUM';
              else if (sc > 0) s = 'LOW';
              else s = 'UNKNOWN';
            }
            sevCounts[s] = (sevCounts[s] || 0) + 1;
            if (v.weaknesses) withWeakness++;
            if (!isNaN(sc) && sc > 0) { scoreSum += sc; scoreCount++; }
          });
        }
        const avgCvss = scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : null;
        const highRisk = (sevCounts['CRITICAL'] || 0) + (sevCounts['HIGH'] || 0);
        const highRiskPct = total ? Math.round((highRisk / total) * 100) : 0;
        return { total, sevCounts, withWeakness, scoreCount, avgCvss, highRisk, highRiskPct };
      };

      const cur = computeNvd(data.nvdRows);
      const prev = data.nvdRowsPrev ? computeNvd(data.nvdRowsPrev) : null;
      const totalAll = data.nvdStats?.total ?? cur.total;

      return [
        [
          { label: 'Total CVEs', value: fmtNum(cur.total), cur: cur.total, prev: prev?.total, color: '#3b82f6', sub: totalAll ? `${Math.round((cur.total / totalAll) * 100)}% of all-time` : '', goodWhenUp: false },
          { label: 'Critical', value: fmtNum(cur.sevCounts.CRITICAL), cur: cur.sevCounts.CRITICAL, prev: prev?.sevCounts?.CRITICAL, color: '#a855f7', goodWhenUp: false },
          { label: 'High', value: fmtNum(cur.sevCounts.HIGH), cur: cur.sevCounts.HIGH, prev: prev?.sevCounts?.HIGH, color: '#ef4444', goodWhenUp: false },
          { label: 'Medium', value: fmtNum(cur.sevCounts.MEDIUM), cur: cur.sevCounts.MEDIUM, prev: prev?.sevCounts?.MEDIUM, color: '#f59e0b', goodWhenUp: false },
          { label: 'Low', value: fmtNum(cur.sevCounts.LOW), cur: cur.sevCounts.LOW, prev: prev?.sevCounts?.LOW, color: '#3b82f6', goodWhenUp: false },
        ],
        [
          { label: 'Critical + High', value: fmtNum(cur.highRisk), cur: cur.highRisk, prev: prev?.highRisk, color: '#ef4444', sub: `${cur.highRiskPct}% of window`, goodWhenUp: false },
          { label: 'Avg CVSS Score', value: cur.avgCvss || '—', cur: cur.avgCvss ? parseFloat(cur.avgCvss) : null, prev: prev && prev.avgCvss ? parseFloat(prev.avgCvss) : null, color: '#f1f5f9', sub: `${cur.scoreCount} scored CVEs`, goodWhenUp: false },
          { label: 'With Weakness', value: fmtNum(cur.withWeakness), cur: cur.withWeakness, prev: prev?.withWeakness, color: '#10b981', sub: cur.total ? `${Math.round((cur.withWeakness / cur.total) * 100)}% of window` : '', goodWhenUp: false },
          { label: 'UNKNOWN Severity', value: fmtNum(cur.sevCounts.UNKNOWN), cur: cur.sevCounts.UNKNOWN, prev: prev?.sevCounts?.UNKNOWN, color: '#94a3b8', sub: 'no CVSS mapping', goodWhenUp: false },
        ],
      ];
    },
    getWidgets: (data) => {
      const arr = data.nvdRows || [];
      const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
      const statusCounts = {};
      const buckets = { 'Critical (9.0-10)': 0, 'High (7.0-8.9)': 0, 'Medium (4.0-6.9)': 0, 'Low (0.1-3.9)': 0, 'None': 0 };

      arr.forEach((v) => {
        let s = String(v.cvss_base_severity || '').toUpperCase();
        const sc = Number(v.cvss_base_score);
        if (!s) {
          if (sc >= 9) s = 'CRITICAL';
          else if (sc >= 7) s = 'HIGH';
          else if (sc >= 4) s = 'MEDIUM';
          else if (sc > 0) s = 'LOW';
          else s = 'UNKNOWN';
        }
        sevCounts[s] = (sevCounts[s] || 0) + 1;
        const st = v.vuln_status || 'Unknown';
        statusCounts[st] = (statusCounts[st] || 0) + 1;
        if (!isNaN(sc) && sc > 0) {
          if (sc >= 9) buckets['Critical (9.0-10)']++;
          else if (sc >= 7) buckets['High (7.0-8.9)']++;
          else if (sc >= 4) buckets['Medium (4.0-6.9)']++;
          else buckets['Low (0.1-3.9)']++;
        } else {
          buckets['None']++;
        }
      });

      const severityData = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']
        .filter((s) => sevCounts[s] > 0)
        .map((s, i) => ({ name: s, value: sevCounts[s], fill: ['#a855f7', '#ef4444', '#eab308', '#3b82f6', '#64748b'][i] }));
      const statusData = Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
      const scoreBuckets = Object.entries(buckets)
        .filter(([, val]) => val > 0)
        .map(([name, value], i) => ({ name, value, fill: ['#a855f7', '#ef4444', '#eab308', '#3b82f6', '#94a3b8'][i % 5] }));

      return [
        { id: 'nvd_sev', title: 'CVEs by Severity', type: 'donut', data: severityData, half: true },
        { id: 'nvd_status', title: 'CVEs by Status', type: 'donut', data: statusData, half: true },
        { id: 'nvd_score_range', title: 'CVEs by CVSS Score Range', type: 'donut', data: scoreBuckets, half: true },
      ];
    },
  },

  // ── 4. Checkpoint Harmony ───────────────────────────────────────────────────
  {
    id: 'checkpoint',
    sectionKey: 'checkpoint',
    number: '4',
    title: 'Checkpoint Harmony — Email & Cloud Security',
    subtitle: 'Email threat detection & automated remediation',
    color: '#6366f1',
    hasData: (data) => Array.isArray(data.harmonyEvents) && data.harmonyEvents.length > 0,
    getLead: (data) => {
      const list = data.harmonyEvents || [];
      const total = list.length;
      const remediated = list.filter((e) => ['remediated', 'closed', 'done'].includes(e.state)).length;
      const pending = list.filter((e) => e.state === 'pending' || e.state === 'new').length;
      const remediatedPct = total ? Math.round((remediated / total) * 100) : 0;
      return `${fmtNum(total)} events · ${fmtNum(remediated)} remediated (${remediatedPct}%) · ${fmtNum(pending)} pending.`;
    },
    getKpis: (data) => {
      const computeCp = (arr) => {
        const list = Array.isArray(arr) ? arr : [];
        const total = list.length;
        const remediated = list.filter((e) => ['remediated', 'closed', 'done'].includes(e.state)).length;
        const pending = list.filter((e) => e.state === 'pending' || e.state === 'new').length;
        const detected = total - pending - remediated;
        const remediatedPct = total ? Math.round((remediated / total) * 100) : 0;
        const pendingPct = total ? Math.round((pending / total) * 100) : 0;
        const detectedPct = total ? Math.round((detected / total) * 100) : 0;
        const avgSevValid = list.filter((e) => e.severity !== '' && e.severity != null && !isNaN(Number(e.severity)));
        const avgSevNum = avgSevValid.length ? (avgSevValid.reduce((s, e) => s + Number(e.severity), 0) / avgSevValid.length) : null;
        const avgSev = avgSevNum != null ? avgSevNum.toFixed(1) : '—';
        const criticalCount = list.filter((e) => Number(e.severity) >= 4).length;
        return { total, remediated, pending, detected, remediatedPct, pendingPct, detectedPct, avgSevNum, avgSev, criticalCount };
      };
      const cur = computeCp(data.harmonyEvents);
      const prev = data.harmonyEventsPrev ? computeCp(data.harmonyEventsPrev) : null;

      return [
        [
          { label: 'Total Events', value: fmtNum(cur.total), cur: cur.total, prev: prev?.total, color: '#3b82f6', goodWhenUp: false },
          { label: 'Remediated', value: fmtNum(cur.remediated), cur: cur.remediated, prev: prev?.remediated, color: '#10b981', sub: `${cur.remediatedPct}% of total`, goodWhenUp: true },
          { label: 'Pending', value: fmtNum(cur.pending), cur: cur.pending, prev: prev?.pending, color: '#ef4444', sub: `${cur.pendingPct}% of total`, goodWhenUp: false },
          { label: 'Avg Severity', value: cur.avgSev, cur: cur.avgSevNum ? parseFloat(cur.avgSevNum.toFixed(1)) : null, prev: prev?.avgSevNum ? parseFloat(prev.avgSevNum.toFixed(1)) : null, color: '#f59e0b', sub: 'out of 5', goodWhenUp: false },
          { label: 'Critical Events', value: fmtNum(cur.criticalCount), cur: cur.criticalCount, prev: prev?.criticalCount, color: '#ef4444', sub: 'severity ≥ 4', goodWhenUp: false },
          { label: 'Detected', value: fmtNum(cur.detected), cur: cur.detected, prev: prev?.detected, color: '#f97316', sub: `${cur.detectedPct}% of total`, goodWhenUp: false },
        ],
      ];
    },
    getProgress: (data) => {
      const list = data.harmonyEvents || [];
      const total = list.length;
      const remediated = list.filter((e) => ['remediated', 'closed', 'done'].includes(e.state)).length;
      const pending = list.filter((e) => e.state === 'pending' || e.state === 'new').length;
      const remediatedPct = total ? Math.round((remediated / total) * 100) : 0;
      return {
        title: 'Email Security Remediation Rate',
        label: 'Remediation Progress',
        value: remediatedPct,
        max: 100,
        color: '#10b981',
        sub: `${fmtNum(remediated)} remediated of ${fmtNum(total)} total events · ${fmtNum(pending)} pending`,
      };
    },
    getWidgets: (data) => {
      const list = data.harmonyEvents || [];
      const SEV_LBL = { 0: 'Informational', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' };
      const sevCounts = {};
      list.forEach((e) => { const s = e.severity ?? '?'; sevCounts[s] = (sevCounts[s] || 0) + 1; });
      const severityData = Object.entries(sevCounts).sort(([a], [b]) => Number(a) - Number(b))
        .map(([sev, value]) => ({ name: SEV_LBL[sev] ?? `Sev ${sev}`, value, fill: SEV_COLORS[Number(sev) % 5] }));

      const STATE_COLORS = { new: '#ef4444', pending: '#f97316', detected: '#f59e0b', remediated: '#22c55e', closed: '#3b82f6', done: '#10b981' };
      const stateCounts = {};
      list.forEach((e) => { const s = e.state ?? 'unknown'; stateCounts[s] = (stateCounts[s] || 0) + 1; });
      const stateData = Object.entries(stateCounts).map(([name, value]) => ({ name, value, fill: STATE_COLORS[name] ?? '#6366f1' }));

      const CONF_COLORS = { malicious: '#ef4444', suspicious: '#f97316', detected: '#f59e0b', unknown: '#94a3b8' };
      const confCounts = {};
      list.forEach((e) => { const c = (e.confidenceIndicator ?? 'unknown').toLowerCase(); confCounts[c] = (confCounts[c] || 0) + 1; });
      const confidenceData = Object.entries(confCounts).map(([name, value]) => ({ name, value, fill: CONF_COLORS[name] ?? '#6366f1' }));

      const eventTypes = bucket(list, (e) => e.type || 'Unknown');
      const saasCounts = {};
      list.forEach((e) => { const p = e.platform || e.saas || 'Unknown'; saasCounts[p] = (saasCounts[p] || 0) + 1; });
      const saasData = Object.entries(saasCounts).sort(([, a], [, b]) => b - a).map(([name, value], idx) => ({ name, value, fill: COLORS[idx % COLORS.length] }));

      const trendCounts = {};
      list.forEach((e) => {
        const d = parseDate(e.eventCreated);
        if (!d) return;
        const key = d.toISOString().slice(0, 10);
        trendCounts[key] = (trendCounts[key] || 0) + 1;
      });
      const dailyTrend = Object.entries(trendCounts).sort(([a], [b]) => a.localeCompare(b)).slice(-20).map(([date, count]) => ({ date, count }));

      const types = [...new Set(list.map((e) => e.type || 'unknown'))];
      const typeSevData = types.map((type) => {
        const row = { name: type };
        ['4', '3', '2', '1', '0'].forEach((s) => {
          row[SEV_LABELS_FULL[s]] = list.filter((e) => (e.type || 'unknown') === type && String(e.severity) === s).length;
        });
        return row;
      });

      return [
        ...(dailyTrend.length > 0 ? [{ id: 'cp_trend', title: 'Security Events Over Time (Daily Trend)', type: 'line', data: dailyTrend, labelKey: 'date', valueKey: 'count', color: '#6366f1', half: false }] : []),
        { id: 'cp_sev', title: 'Severity Distribution', type: 'donut', data: severityData, half: true },
        { id: 'cp_type', title: 'Event Type', type: 'donut', data: eventTypes, half: true },
        { id: 'cp_state', title: 'Event State', type: 'donut', data: stateData, half: true },
        { id: 'cp_confidence', title: 'Confidence Indicator', type: 'donut', data: confidenceData, half: true },
        { id: 'cp_saas', title: 'SaaS Platform Distribution', type: 'donut', data: saasData, half: true },
        ...(typeSevData.length > 0 ? [{ id: 'cp_typesev', title: 'Event Type × Severity', type: 'stacked', data: typeSevData, half: true }] : []),
      ];
    },
  },

  // ── 5. Palo Alto Firewall ───────────────────────────────────────────────────
  {
    id: 'firewall',
    sectionKey: 'firewall',
    number: '5',
    title: 'Palo Alto Firewall — Network Security',
    subtitle: 'Traffic flow, threat detection & perimeter defense',
    color: '#f59e0b',
    hasData: (data) => Array.isArray(data.fwReports) && data.fwReports.some((r) => Array.isArray(r.rows) && r.rows.length > 0),
    getLead: (data) => {
      const allRows = (data.fwReports || []).flatMap((r) => r.rows || []);
      const parseNum = (v) => { const n = Number(String(v || '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim()); return isNaN(n) ? 0 : n; };
      const totalSessions = allRows.reduce((sum, r) => sum + parseNum(r.nsess || r.sessions || r.count || 0), 0);
      return `${fmtNum(totalSessions)} sessions processed across network firewalls.`;
    },
    getKpis: (data) => {
      const computeFw = (fwReportsList) => {
        if (!Array.isArray(fwReportsList) || fwReportsList.length === 0) {
          return { totalSessions: 0, totalTraffic: 0, highRiskEvents: 0, topDestination: '-', securityScore: 100, riskLabel: 'Excellent' };
        }
        const getRows = (name) => fwReportsList.find((r) => r.report === name)?.rows ?? [];
        const allRows = fwReportsList.flatMap((r) => r.rows);
        const riskRows = getRows('risk-trend');
        const destRows = [...getRows('top-attacker-destinations'), ...getRows('top-denied-destinations')];

        const parseNum = (v) => { const n = Number(String(v || '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim()); return isNaN(n) ? 0 : n; };
        const getFirst = (row, cols) => { for (const c of cols) { if (row?.[c] != null && row[c] !== '') return row[c]; } return '-'; };
        const getSum = (rows, cols) => {
          const col = cols.find((c) => rows.some((r) => r[c] != null && r[c] !== ''));
          if (!col) return 0;
          return rows.reduce((sum, r) => sum + parseNum(r[col]), 0);
        };
        const getTop = (rows, cols, limit = 1) => {
          const map = new Map();
          rows.forEach((row) => {
            const val = String(getFirst(row, cols)).trim();
            if (!val || val === '-') return;
            const rawCount = getFirst(row, ['count', 'nrepeat', 'nsess', 'sessions', 'threats', 'nbytes', 'bytes']);
            const n = rawCount !== '-' ? parseNum(rawCount) : 1;
            map.set(val, (map.get(val) || 0) + (n > 0 ? n : 1));
          });
          return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, value]) => ({ name: truncateLabel(name), value }));
        };

        const totalSessions = getSum(allRows, ['nsess', 'sessions', 'session', 'count']);
        const totalTraffic = getSum(allRows, ['nbytes', 'bytes', 'byte']);
        const highRiskEvents = (riskRows.length ? riskRows : allRows).reduce((sum, row) => {
          const risk = parseNum(getFirst(row, ['risk', 'name', 'severity']));
          return risk >= 4 ? sum + parseNum(getFirst(row, ['count', 'nrepeat', 'nsess', 'sessions'])) : sum;
        }, 0);

        const topDestEntry = getTop(destRows.length ? destRows : allRows, ['dst', 'destination', 'destination_ip', 'name'], 1)[0];
        const topDestination = topDestEntry?.name || '-';
        const securityScore = Math.min(100, Math.max(0, Math.round(100 - highRiskEvents * 0.5)));
        const riskLabel = securityScore >= 80 ? 'Excellent' : securityScore >= 50 ? 'Warning' : 'Critical';

        return { totalSessions, totalTraffic, highRiskEvents, topDestination, securityScore, riskLabel };
      };

      const cur = computeFw(data.fwReports);
      const prev = data.fwReportsPrev ? computeFw(data.fwReportsPrev) : null;

      return [
        [
          { label: 'Total Sessions', value: fmtNum(cur.totalSessions), cur: cur.totalSessions, prev: prev?.totalSessions, color: '#3b82f6', goodWhenUp: true },
          { label: 'Total Traffic', value: formatBytes(cur.totalTraffic), cur: cur.totalTraffic, prev: prev?.totalTraffic, color: '#06b6d4', goodWhenUp: true },
          { label: 'High Risk Events', value: fmtNum(cur.highRiskEvents), cur: cur.highRiskEvents, prev: prev?.highRiskEvents, color: '#ef4444', goodWhenUp: false },
          { label: 'Top Destination', value: truncateLabel(cur.topDestination, 16), color: '#f1f5f9' },
          { label: 'Security Score', value: `${cur.securityScore}`, cur: cur.securityScore, prev: prev?.securityScore, color: '#10b981', sub: cur.riskLabel, goodWhenUp: true },
        ],
      ];
    },
    getWidgets: (data) => {
      const reports = data.fwReports || [];
      const getRows = (name) => reports.find((r) => r.report === name)?.rows ?? [];
      const allRows = reports.flatMap((r) => r.rows);
      const riskRows = getRows('risk-trend');
      const attackRows = getRows('top-attacks');
      const sourceRows = getRows('top-attacker-sources');
      const deniedDestRows = getRows('top-denied-destinations');
      const deniedSourceRows = getRows('top-denied-sources');
      const connRows = getRows('top-connections');

      const parseNum = (v) => { const n = Number(String(v || '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim()); return isNaN(n) ? 0 : n; };
      const getFirst = (row, cols) => { for (const c of cols) { if (row?.[c] != null && row[c] !== '') return row[c]; } return '-'; };
      const getTop = (rows, cols, limit = 8) => {
        const map = new Map();
        rows.forEach((row) => {
          const val = String(getFirst(row, cols)).trim();
          if (!val || val === '-') return;
          const rawCount = getFirst(row, ['count', 'nrepeat', 'nsess', 'sessions', 'threats', 'nbytes', 'bytes']);
          const n = rawCount !== '-' ? parseNum(rawCount) : 1;
          map.set(val, (map.get(val) || 0) + (n > 0 ? n : 1));
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, value]) => ({ name: truncateLabel(name), value }));
      };

      const riskMap = new Map();
      (riskRows.length ? riskRows : allRows).forEach((row) => {
        const risk = String(getFirst(row, ['risk', 'severity', 'name']));
        const count = parseNum(getFirst(row, ['count', 'nrepeat', 'nsess', 'sessions']));
        if (!risk || risk === '-') return;
        riskMap.set(risk, (riskMap.get(risk) || 0) + (count || 1));
      });
      const RISK_COLORS_MAP = { '1': '#22c55e', '2': '#84cc16', '3': '#f59e0b', '4': '#f97316', '5': '#ef4444' };
      const riskDist = Array.from(riskMap.entries())
        .map(([risk, value]) => ({ name: `Risk ${risk}`, value, fill: RISK_COLORS_MAP[risk] || COLORS[Number(risk) % COLORS.length] }))
        .sort((a, b) => parseNum(a.name.split(' ')[1]) - parseNum(b.name.split(' ')[1]));

      const topAttacks = getTop(attackRows.length ? attackRows : allRows, ['threatid', 'threat', 'name', 'category']);
      const topSources = getTop(sourceRows.length ? sourceRows : allRows, ['src', 'source', 'source_ip', 'name']);
      const topDeniedDestinations = getTop(deniedDestRows.length ? deniedDestRows : allRows, ['dst', 'destination', 'destination_ip', 'name']);
      const topDeniedSources = getTop(deniedSourceRows.length ? deniedSourceRows : allRows, ['src', 'source', 'source_ip', 'name']);
      const topConnections = getTop(connRows.length ? connRows : allRows, ['source', 'destination', 'name', 'src', 'dst']);

      return [
        { id: 'fw_risk', title: 'Risk-wise Distribution', type: 'donut', data: riskDist, half: true },
        { id: 'fw_attacks', title: 'Top Attacks', type: 'hbar', data: topAttacks, color: '#ef4444', half: true },
        { id: 'fw_sources', title: 'Top Attacker Sources', type: 'hbar', data: topSources, color: '#f59e0b', half: true },
        { id: 'fw_denied_dest', title: 'Top Denied Destinations', type: 'hbar', data: topDeniedDestinations, color: '#8b5cf6', half: true },
        { id: 'fw_denied_src', title: 'Top Denied Sources', type: 'hbar', data: topDeniedSources, color: '#ec4899', half: true },
        { id: 'fw_conn', title: 'Top Connections', type: 'hbar', data: topConnections, color: '#3b82f6', half: true },
      ];
    },
  },

  // ── 6. Zoho Desk ────────────────────────────────────────────────────────────
  {
    id: 'zoho',
    sectionKey: 'zoho',
    number: '6',
    title: 'Zoho Desk — Ticketing',
    subtitle: 'Service management & ticket resolution telemetry',
    color: '#3b82f6',
    hasData: (data) => Array.isArray(data.zohoTickets) && data.zohoTickets.length > 0,
    getLead: (data) => {
      const tickets = data.zohoTickets || [];
      const total = tickets.length;
      const isClosed = (t) => ['closed', 'technically closed', 'resolved'].includes(String(t.status || '').toLowerCase());
      const closed = tickets.filter(isClosed).length;
      const closedPct = total ? Math.round((closed / total) * 100) : 0;
      const openTickets = tickets.filter((t) => t.status === 'Open').length;
      return `${fmtNum(total)} tickets · ${fmtNum(openTickets)} open · ${fmtNum(closed)} closed (${closedPct}%).`;
    },
    getKpis: (data) => {
      const computeZoho = (arr) => {
        const list = Array.isArray(arr) ? arr : [];
        const isClosed = (t) => ['closed', 'technically closed', 'resolved'].includes(String(t.status || '').toLowerCase());
        const normText = (v) => String(v || '').trim();
        const getDept = (t) => normText(t.department?.name) || normText(t.departmentName) || 'Unknown';
        const getCreated = (t) => parseDate(t.created_at || t.createdTime || t.createdAt);
        const getClosed = (t) => parseDate(t.closed_at || t.closedTime || t.closedAt || t.closeTime);

        const total = list.length;
        const openTickets = list.filter((t) => t.status === 'Open').length;
        const highPriority = list.filter((t) => t.priority === 'High' || t.priority === 'Critical').length;
        const closed = list.filter((t) => isClosed(t)).length;
        const closedPct = total ? Math.round((closed / total) * 100) : 0;
        const onHold = list.filter((t) => /on hold/i.test(t.status || '')).length;
        const deptCount = new Set(list.map(getDept)).size;

        let respSum = 0, respCount = 0, resSum = 0, resCount = 0;
        list.forEach((t) => {
          const created = getCreated(t);
          if (!created) return;
          const respRaw = t.customerResponseTime || t.customer_response_time || t.responseTime;
          if (respRaw) { const resp = parseDuration(respRaw); if (resp != null) { respSum += resp; respCount++; } }
          const closedAt = getClosed(t);
          if (closedAt && isClosed(t)) { resSum += (closedAt.getTime() - created.getTime()) / 60000; resCount++; }
        });
        const avgResp = respCount ? respSum / respCount : null;
        const avgRes = resCount ? resSum / resCount : null;

        return { total, openTickets, highPriority, closed, closedPct, onHold, deptCount, avgResp, avgRes };
      };

      const cur = computeZoho(data.zohoTickets);
      const prev = data.zohoTicketsPrev ? computeZoho(data.zohoTicketsPrev) : null;

      return [
        [
          { label: 'Total Tickets', value: fmtNum(cur.total), cur: cur.total, prev: prev?.total, color: '#8b5cf6', goodWhenUp: true },
          { label: 'Open', value: fmtNum(cur.openTickets), cur: cur.openTickets, prev: prev?.openTickets, color: '#3b82f6', goodWhenUp: false },
          { label: 'High Priority', value: fmtNum(cur.highPriority), cur: cur.highPriority, prev: prev?.highPriority, color: '#ef4444', goodWhenUp: false },
          { label: 'Closed', value: fmtNum(cur.closed), cur: cur.closed, prev: prev?.closed, color: '#10b981', sub: `${cur.closedPct}% of total`, goodWhenUp: true },
        ],
        [
          { label: 'On Hold', value: fmtNum(cur.onHold), cur: cur.onHold, prev: prev?.onHold, color: '#f59e0b', goodWhenUp: false },
          { label: 'Departments', value: fmtNum(cur.deptCount), cur: cur.deptCount, prev: prev?.deptCount, color: '#f1f5f9', goodWhenUp: true },
          { label: 'Avg Response', value: formatDuration(cur.avgResp), cur: cur.avgResp ? Math.round(cur.avgResp) : null, prev: prev?.avgResp ? Math.round(prev.avgResp) : null, color: '#06b6d4', sub: 'first response', goodWhenUp: false },
          { label: 'Avg Resolution', value: formatDuration(cur.avgRes), cur: cur.avgRes ? Math.round(cur.avgRes) : null, prev: prev?.avgRes ? Math.round(prev.avgRes) : null, color: '#8b5cf6', sub: 'ticket resolution', goodWhenUp: false },
        ],
      ];
    },
    getWidgets: (data) => {
      const list = data.zohoTickets || [];
      const STATUS_COLORS = { Open: '#3b82f6', Closed: '#22c55e', 'Technically Closed': '#22c55e', Resolved: '#10b981', Pending: '#f59e0b', 'On Hold': '#f59e0b' };
      const PRIORITY_COLORS = { High: '#ef4444', Critical: '#dc2626', Medium: '#f59e0b', Low: '#22c55e' };
      const isClosed = (t) => ['closed', 'technically closed', 'resolved'].includes(String(t.status || '').toLowerCase());
      const normText = (v) => String(v || '').trim();
      const getDept = (t) => normText(t.department?.name) || normText(t.departmentName) || 'Unknown';
      const getCreated = (t) => parseDate(t.created_at || t.createdTime || t.createdAt);
      const getClosed = (t) => parseDate(t.closed_at || t.closedTime || t.closedAt || t.closeTime);

      const statusData = Object.entries(list.reduce((acc, t) => { const s = t.status || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {}))
        .map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || '#6366f1' })).sort((a, b) => b.value - a.value);
      const priorityData = Object.entries(list.reduce((acc, t) => { const p = t.priority || 'Unknown'; acc[p] = (acc[p] || 0) + 1; return acc; }, {}))
        .map(([name, value]) => ({ name, value, fill: PRIORITY_COLORS[name] || '#6b7280' })).sort((a, b) => b.value - a.value);
      const departmentData = Object.entries(list.reduce((acc, t) => { const d = getDept(t); acc[d] = (acc[d] || 0) + 1; return acc; }, {}))
        .map(([name, value]) => ({ name: truncateLabel(name), value })).sort((a, b) => b.value - a.value).slice(0, 8);

      const agingBuckets = { '< 1 day': 0, '1-3 days': 0, '3-7 days': 0, '7-14 days': 0, '> 14 days': 0 };
      list.forEach((t) => {
        if (isClosed(t)) return;
        const d = getCreated(t); if (!d) return;
        const days = (Date.now() - d.getTime()) / 86400000;
        if (days < 1) agingBuckets['< 1 day']++; else if (days < 3) agingBuckets['1-3 days']++; else if (days < 7) agingBuckets['3-7 days']++; else if (days < 14) agingBuckets['7-14 days']++; else agingBuckets['> 14 days']++;
      });
      const openAging = Object.entries(agingBuckets).filter(([, v]) => v > 0).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));

      const assigneeMap = {};
      list.forEach((t) => { const a = `${normText(t.assignee?.firstName)} ${normText(t.assignee?.lastName)}`.trim() || 'Unassigned'; assigneeMap[a] = (assigneeMap[a] || 0) + 1; });
      const assigneeData = Object.entries(assigneeMap).map(([name, value]) => ({ name: truncateLabel(name), value })).sort((a, b) => b.value - a.value).slice(0, 8);

      const contactMap = {};
      list.forEach((t) => { const c = `${normText(t.contact?.firstName)} ${normText(t.contact?.lastName)}`.trim() || normText(t.contact?.email) || 'Unknown'; contactMap[c] = (contactMap[c] || 0) + 1; });
      const contactData = Object.entries(contactMap).map(([name, value]) => ({ name: truncateLabel(name), value })).sort((a, b) => b.value - a.value).slice(0, 8);

      const resByDeptMap = {};
      list.forEach((t) => {
        const created = getCreated(t); const closedAt = getClosed(t);
        if (!created || !closedAt || !isClosed(t)) return;
        const dept = getDept(t); const mins = (closedAt.getTime() - created.getTime()) / 60000;
        if (!resByDeptMap[dept]) resByDeptMap[dept] = { sum: 0, count: 0 };
        resByDeptMap[dept].sum += mins; resByDeptMap[dept].count++;
      });
      const resolutionByDept = Object.entries(resByDeptMap).map(([name, { sum, count }]) => ({ name: truncateLabel(name), value: Math.round(sum / count) }))
        .sort((a, b) => b.value - a.value).slice(0, 8);

      return [
        { id: 'zoho_status', title: 'Status Breakdown', type: 'donut', data: statusData, half: true },
        { id: 'zoho_priority', title: 'Priority Distribution', type: 'donut', data: priorityData, half: true },
        { id: 'zoho_dept', title: 'Department Distribution', type: 'donut', data: departmentData, half: true },
        { id: 'zoho_aging', title: 'Open Ticket Aging', type: 'donut', data: openAging, half: true },
        { id: 'zoho_assignees', title: 'Top Assignees', type: 'hbar', data: assigneeData, color: '#3b82f6', half: true },
        { id: 'zoho_contacts', title: 'Top Requesters', type: 'hbar', data: contactData, color: '#8b5cf6', half: true },
        ...(resolutionByDept.length > 0 ? [{ id: 'zoho_res_dept', title: 'Avg Resolution Time by Dept (Mins)', type: 'hbar', data: resolutionByDept, color: '#06b6d4', half: true }] : []),
      ];
    },
  },

  // ── 7. Microsoft 365 ────────────────────────────────────────────────────────
  {
    id: 'microsoft',
    sectionKey: 'microsoft',
    number: '7',
    title: 'Microsoft 365 — Cloud Identity & Security',
    subtitle: 'Tenant security posture, identity risk & device management',
    color: '#3b82f6',
    hasData: (data) => data.msData && typeof data.msData === 'object' && Object.keys(data.msData).length > 0,
    getLead: (data) => {
      const arr = (key) => data.msData?.[key]?.data?.value ?? [];
      const users = arr('users');
      const signIns = arr('auditSignIns');
      const failed = signIns.filter((s) => s.status?.errorCode !== 0).length;
      const failedPct = signIns.length ? Math.round((failed / signIns.length) * 100) : 0;
      return `${fmtNum(users.length)} total users · ${fmtNum(signIns.length)} sign-ins (${failedPct}% failed).`;
    },
    getKpis: (data) => {
      const computeMs = (dataObj) => {
        const arr = (key) => dataObj?.[key]?.data?.value ?? [];
        const riskyUsers = arr('riskyUsers');
        const users = arr('users');
        const signIns = arr('auditSignIns');
        const securityAlerts = arr('securityAlerts');
        const secureScore = arr('secureScores')[0] || null;
        const managedDevices = arr('managedDevices');
        const serviceIssues = arr('serviceIssues');
        const subscribedSkus = arr('subscribedSkus');

        const assignedLicenses = subscribedSkus.reduce((s, sku) => s + (sku.consumedUnits || 0), 0);
        const totalLicenses = subscribedSkus.reduce((s, sku) => s + (sku.prepaidUnits?.enabled || 0), 0);
        const unassignedLicenses = Math.max(0, totalLicenses - assignedLicenses);
        const licenseUtil = totalLicenses ? Math.round((assignedLicenses / totalLicenses) * 100) : 0;

        const failedSignIns = signIns.filter((s) => s.status?.errorCode !== 0).length;
        const failedPct = signIns.length ? Math.round((failedSignIns / signIns.length) * 100) : 0;

        return {
          riskyUsers, users, signIns, securityAlerts, secureScore,
          managedDevices, serviceIssues, assignedLicenses, totalLicenses,
          unassignedLicenses, licenseUtil, failedSignIns, failedPct,
        };
      };

      const cur = computeMs(data.msData);
      const prev = data.msDataPrev ? computeMs(data.msDataPrev) : null;

      return [
        [
          { label: 'Sign-ins', value: fmtNum(cur.signIns.length), cur: cur.signIns.length, prev: prev?.signIns?.length, color: '#3b82f6', goodWhenUp: true },
          { label: 'Failed Sign-ins', value: fmtNum(cur.failedSignIns), cur: cur.failedSignIns, prev: prev?.failedSignIns, color: '#ef4444', sub: `${cur.failedPct}% of sign-ins`, goodWhenUp: false },
          { label: 'Risky Users', value: fmtNum(cur.riskyUsers.length), cur: cur.riskyUsers.length, prev: prev?.riskyUsers?.length, color: '#ef4444', goodWhenUp: false },
          { label: 'Total Users', value: fmtNum(cur.users.length), cur: cur.users.length, prev: prev?.users?.length, color: '#3b82f6', goodWhenUp: true },
          { label: 'Secure Score', value: `${cur.secureScore?.currentScore ?? '—'}`, color: '#10b981', sub: cur.secureScore?.maxScore ? `/ ${cur.secureScore.maxScore}` : '' },
          { label: 'Security Alerts', value: fmtNum(cur.securityAlerts.length), cur: cur.securityAlerts.length, prev: prev?.securityAlerts?.length, color: '#f59e0b', goodWhenUp: false },
        ],
        [
          { label: 'License Utilization', value: `${cur.licenseUtil}%`, color: '#8b5cf6', sub: `${fmtNum(cur.assignedLicenses)} / ${fmtNum(cur.totalLicenses)}` },
          { label: 'Unassigned Licenses', value: fmtNum(cur.unassignedLicenses), color: '#f1f5f9' },
          { label: 'Managed Devices', value: fmtNum(cur.managedDevices.length), cur: cur.managedDevices.length, prev: prev?.managedDevices?.length, color: '#3b82f6', goodWhenUp: true },
          { label: 'Service Issues', value: fmtNum(cur.serviceIssues.length), cur: cur.serviceIssues.length, prev: prev?.serviceIssues?.length, color: '#f97316', goodWhenUp: false },
        ],
      ];
    },
    getProgress: (data) => {
      const arr = (key) => data.msData?.[key]?.data?.value ?? [];
      const subscribedSkus = arr('subscribedSkus');
      const assignedLicenses = subscribedSkus.reduce((s, sku) => s + (sku.consumedUnits || 0), 0);
      const totalLicenses = subscribedSkus.reduce((s, sku) => s + (sku.prepaidUnits?.enabled || 0), 0);
      const unassignedLicenses = Math.max(0, totalLicenses - assignedLicenses);
      const licenseUtil = totalLicenses ? Math.round((assignedLicenses / totalLicenses) * 100) : 0;
      return {
        title: 'Assigned vs Unassigned Licenses',
        label: 'License Utilization',
        value: licenseUtil,
        max: 100,
        color: '#6366f1',
        sub: `${fmtNum(assignedLicenses)} assigned · ${fmtNum(unassignedLicenses)} unassigned of ${fmtNum(totalLicenses)} total`,
      };
    },
    getWidgets: (data) => {
      const arr = (key) => data.msData?.[key]?.data?.value ?? [];
      const riskDetections = arr('riskDetections');
      const riskyUsers = arr('riskyUsers');
      const securityAlerts = arr('securityAlerts');
      const managedDevices = arr('managedDevices');

      const riskTypeData = bucket(riskDetections, (r) => r.riskEventType, 'unknown');
      const riskyUsersLevel = bucket(riskyUsers, (u) => u.riskLevel || 'unknown');
      const alertsSeverity = bucket(securityAlerts, (a) => a.severity, 'unknown');
      const deviceCompliance = bucket(managedDevices, (d) => d.complianceState || 'unknown');
      const deviceOs = bucket(managedDevices, (d) => d.operatingSystem || 'unknown');

      return [
        { id: 'ms_risk_types', title: 'Risk Detections by Type', type: 'donut', data: riskTypeData, half: true },
        { id: 'ms_risky_users', title: 'Risky Users by Level', type: 'donut', data: riskyUsersLevel, half: true },
        { id: 'ms_alerts_sev', title: 'Alerts by Severity', type: 'donut', data: alertsSeverity, half: true },
        { id: 'ms_dev_comp', title: 'Managed Device Compliance', type: 'donut', data: deviceCompliance, half: true },
        { id: 'ms_dev_os', title: 'Device OS Distribution', type: 'donut', data: deviceOs, half: true },
      ];
    },
  },
];
