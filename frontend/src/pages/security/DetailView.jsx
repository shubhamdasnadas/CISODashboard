import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import api from '../../api.js';
import WidgetSkeleton from '../dashboard/WidgetSkeleton.jsx';

const PAGE_SIZE = 25;
const RECENT_CAP = 1500;
const CAPPED_FILTERS = new Set(['classification', 'severity']);

const fmt = (d) => d ? new Date(d).toLocaleString() : '—';
const yesNo = (v) => (v === true || v === 'true' || v === 1) ? 'Yes' : (v === false || v === 'false' || v === 0) ? 'No' : (v ? String(v) : 'No');

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const MITRE_FILTERS = new Set(['mitreTechnique', 'mitreTactic']);

function extractTechId(link) {
  const m = /\/techniques\/(T\d+)(?:\/(\d+))?\/?$/.exec(link || '');
  return m ? (m[2] ? `${m[1]}.${m[2]}` : m[1]) : null;
}

// Mirrors CheckpointPage.jsx's mapEvent() — DetailView fetches the same raw
// endpoint directly rather than importing that page's local helper.
function mapCheckpointEvent(e) {
  return {
    eventId: e.event_id || e.eventId,
    type: e.type,
    state: e.state,
    severity: e.severity,
    confidenceIndicator: e.confidence_indicator || e.confidenceIndicator,
    description: e.description,
    senderAddress: e.sender_address || e.senderAddress,
    saas: e.saas,
    eventCreated: e.event_created || e.eventCreated,
  };
}

const CHECKPOINT_EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Mirrors PaloAltoPage.jsx's getFirstValue/DATE_COLS — the "firewall" dataset
// below receives its rows pre-matched from that page (see its `raw` handling),
// so this only needs to locate a date on each raw row for the date filter.
function getFirstValue(row, cols, fallback = '-') {
  for (const col of cols) {
    const v = row?.[col];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return fallback;
}

const FIREWALL_DATE_COLS = ['slabbed-receive_time', 'receive_time', 'time_generated', 'time', 'date', 'updatedAt', 'publishedDate', 'createdAt'];
const FIREWALL_COUNT_COLS = ['count', 'nrepeat', 'nsess', 'sessions', 'threats', 'value'];

// Raw firewall report keys aren't always self-explanatory — override display
// labels for known abbreviations while keeping the underlying key for lookup.
const RAW_COL_LABELS = { nsess: 'Number of sessions' };

function sumFirewallCount(rows) {
  const col = FIREWALL_COUNT_COLS.find((c) => rows.some((r) => r[c] !== undefined && r[c] !== null && r[c] !== ''));
  if (!col) return null;
  return rows.reduce((sum, r) => {
    const n = Number(String(r[col] ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim());
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

// Shared row-tier styles, indexed by rank (0 = top/most severe). A dataset
// opts in by providing `rowRank(row)` returning an index into `tierStyles`
// (or omitting both for plain, unstyled rows).
const RED_TIER = { className: 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50', coloredText: true };
const ORANGE_TIER = { className: 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-950/50', coloredText: true };
const NORMAL_TIER = { className: 'hover:bg-[var(--muted-bg)]/60', coloredText: false };

// 4-step red→orange heat scale, darkest/most-severe first.
const HEAT_DARK_RED   = { className: 'bg-red-200 dark:bg-red-900/60 text-red-900 dark:text-red-200 hover:bg-red-300 dark:hover:bg-red-900/80', coloredText: true };
const HEAT_RED        = { className: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-950/60', coloredText: true };
const HEAT_DARK_ORANGE = { className: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/60', coloredText: true };
const HEAT_ORANGE     = { className: 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-950/50', coloredText: true };

const DATASET_CONFIG = {
  threats: {
    endpoint: '/sentinelone/db/threats',
    extract: (r) => r.data?.data || r.data?.threats || [],
    dateField: (t) => t.threatInfo?.createdAt || t.createdAt,
    rowRank: (t) => (
      t.threatInfo?.incidentStatus === 'unresolved'
        && t.threatInfo?.mitigationStatus !== 'mitigated'
        && t.threatInfo?.mitigationStatus !== 'marked_as_benign'
    ) ? 0 : 1,
    tierStyles: [RED_TIER, NORMAL_TIER],
    cols: ['Endpoint', 'Site', 'Group', 'User', 'Classification', 'Incident Status', 'Mitigation', 'Fileless', 'Confidence', 'Created At', 'Identified At'],
    rowFn: (t) => [
      t.agentRealtimeInfo?.agentComputerName || t.agentComputerName || t.computerName,
      t.agentRealtimeInfo?.siteName || t.siteName,
      t.agentRealtimeInfo?.groupName || t.groupName,
      t.threatInfo?.processUser || t.processUser,
      t.threatInfo?.classification || t.classification,
      t.threatInfo?.incidentStatus || t.incidentStatus,
      t.threatInfo?.mitigationStatus || t.mitigationStatus,
      yesNo(t.threatInfo?.isFileless ?? t.isFileless),
      t.threatInfo?.confidenceLevel || t.confidenceLevel,
      fmt(t.threatInfo?.createdAt || t.createdAt),
      fmt(t.threatInfo?.identifiedAt || t.identifiedAt),
    ],
  },
  cve: {
    endpoint: '/sentinelone/db/application-cve',
    extract: (r) => r.data?.data || r.data?.cves || [],
    dateField: (r) => r.detectionDate || r.publishedDate || r.createdAt,
    cols: ['CVE ID', 'Application', 'Vendor', 'Severity', 'Base Score', 'Days Detected', 'Endpoint', 'Detection Date', 'Status'],
    rowFn: (r) => [
      r.cveId || r.cve_id,
      r.applicationName || r.application,
      r.applicationVendor || r.vendor,
      r.severity,
      r.baseScore || r.cvssScore,
      r.daysDetected || (r.publishedDate ? Math.floor((Date.now() - new Date(r.publishedDate).getTime()) / 86400000) : '—'),
      r.endpointName || r.computerName,
      fmt(r.detectionDate || r.publishedDate || r.createdAt),
      r.status || 'Active',
    ],
  },
  agents: {
    endpoint: '/sentinelone/db/agents',
    extract: (r) => r.data?.agents || r.data?.data || [],
    dateField: (a) => a.lastActiveDate || a.registeredAt || a.createdAt,
    cols: ['Machine', 'User', 'Site', 'OS', 'Active', 'Active Threats', 'Mitigation Mode', 'Up To Date', 'Firewall', 'Last Active', 'Agent Version'],
    rowFn: (a) => [
      a.computerName || a.agentComputerName,
      a.lastLoggedInUserName || a.user,
      a.siteName || a.site,
      a.osName || a.os_name || a.osType,
      yesNo(a.isActive),
      a.activeThreats ?? 0,
      a.mitigationMode || 'Protect',
      yesNo(a.isUpToDate),
      yesNo(a.firewallEnabled),
      fmt(a.lastActiveDate || a.registeredAt || a.createdAt),
      a.agentVersion || a.version,
    ],
  },
  checkpoint: {
    endpoint: '/harmony/events-db',
    extract: (r) => (r.data?.events || r.data?.responseData || []).map(mapCheckpointEvent),
    dateField: (e) => e.eventCreated,
    rowRank: (e) => {
      const malicious = (e.confidenceIndicator || '').toLowerCase() === 'malicious';
      if (e.state === 'new') return malicious ? 0 : 1;
      if (e.state === 'detected') return malicious ? 2 : 3;
      return 4;
    },
    tierStyles: [HEAT_DARK_RED, HEAT_RED, HEAT_DARK_ORANGE, HEAT_ORANGE, NORMAL_TIER],
    cols: ['Type', 'State', 'Severity', 'Confidence', 'Sender', 'SaaS', 'Description', 'Date'],
    rowFn: (e) => [
      e.type,
      e.state,
      e.severity,
      e.confidenceIndicator,
      e.senderAddress,
      e.saas,
      e.description,
      fmt(e.eventCreated),
    ],
  },
  firewall: {
    raw: true,
    dateField: (row) => getFirstValue(row, FIREWALL_DATE_COLS, null),
  },
  zoho: {
    endpoint: '/zoho/tickets-db',
    extract: (r) => r.data?.responseData || r.data?.tickets || [],
    dateField: (t) => t.created_at || t.createdTime || t.createdAt,
    cols: ['Ticket #', 'Subject', 'Status', 'Priority', 'Department', 'Contact', 'Assignee', 'Channel', 'Type', 'Created At'],
    rowFn: (t) => {
      const norm = (v) => (v != null ? String(v).trim() : '');
      const dept = norm(t.department?.name) || norm(t.departmentName) || 'Unknown';
      const contact = `${norm(t.contact?.firstName)} ${norm(t.contact?.lastName)}`.trim() || norm(t.contact?.email) || 'Unknown';
      const assignee = `${norm(t.assignee?.firstName)} ${norm(t.assignee?.lastName)}`.trim() || 'Unassigned';
      return [
        t.ticketNumber || t.ticket_no || t.number || '—',
        t.subject || t.title || '—',
        t.status || '—',
        t.priority || '—',
        dept,
        contact,
        assignee,
        t.channel || '—',
        t.type || t.classification || '—',
        fmt(t.created_at || t.createdTime || t.createdAt),
      ];
    },
  },
  mdm: {
    endpoint: '/hexnode/db/devices',
    extract: (r) => Array.isArray(r.data?.data) ? r.data.data : [],
    dateField: (d) => d.last_reported || d.enrolled_time || d.created_time,
    cols: ['Device Name', 'Model', 'OS', 'OS Version', 'Type', 'Owner', 'Compliant', 'Enrollment Status', 'Serial Number', 'Last Reported'],
    rowFn: (d) => [
      d.device_name || d.name || `Device ${d.id || '—'}`,
      d.model_name || d.model || '—',
      d.os_name || d.os_type || d.platform || '—',
      d.os_version || '—',
      d.device_type || '—',
      d.user?.name || d.user_name || '—',
      yesNo(d.is_compliant ?? d.compliant),
      d.enrollment_status || (d.enrolled === false ? 'Pending' : 'Enrolled'),
      d.serial_number || '—',
      fmt(d.last_reported || d.enrolled_time || d.created_time),
    ],
  },
  nvd: {
    endpoint: '/nvd/cves?limit=100',
    extract: (r) => Array.isArray(r.data?.vulnerabilities) ? r.data.vulnerabilities : Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [],
    dateField: (c) => c.publishedDate || c.published || c.createdAt || c.lastModifiedDate,
    cols: ['CVE ID', 'CVSS Score', 'Severity', 'Description', 'Published Date', 'Source'],
    rowFn: (c) => [
      c.cveId || c.cve_id || '—',
      c.baseScore != null ? c.baseScore : (c.cvss_base_score != null ? c.cvss_base_score : (c.cvssScore || '—')),
      c.severity || c.cvss_base_severity || (c.cvss_base_score >= 9 ? 'CRITICAL' : c.cvss_base_score >= 7 ? 'HIGH' : c.cvss_base_score >= 4 ? 'MEDIUM' : 'LOW'),
      c.description || c.description_en || '—',
      fmt(c.publishedDate || c.published || c.createdAt || c.lastModifiedDate),
      c.sourceIdentifier || c.source_identifier || c.vendor || 'NVD',
    ],
  },
};

function normalizeDatasetKey(key) {
  if (!key) return 'threats';
  const k = String(key).toLowerCase().trim();
  if (k === 'harmony' || k === 'checkpoint' || k === 'email') return 'checkpoint';
  if (k === 'cve' || k === 'cves' || k === 'application-cve' || k === 'app-cve') return 'cve';
  if (k === 'agent' || k === 'agents' || k === 's1agent') return 'agents';
  if (k === 'threat' || k === 'threats' || k === 'security') return 'threats';
  if (k === 'firewall' || k === 'paloalto' || k === 'fw') return 'firewall';
  if (k === 'zoho' || k === 'tickets' || k === 'ticketing' || k === 'itsm') return 'zoho';
  if (k === 'mdm' || k === 'hexnode' || k === 'devices') return 'mdm';
  if (k === 'nvd' || k === 'threatintel' || k === 'threat_intel' || k === 'intel') return 'nvd';
  return key;
}

const FILTERS = {
  // Special filter that returns all rows (for "All Threats" etc.)
  all:            () => true,
  unresolved:      (t) => ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus),
  topEndpoint:      (t, value) => t.agentRealtimeInfo?.agentComputerName === value,
  classification:   (t, value) => (t.threatInfo?.classification || 'Unknown') === value,
  severity:         (r, value) => (r.severity || 'UNKNOWN').toUpperCase() === value,
  topRiskyApp:      (r, value) => (r.applicationName || r.application || 'Unknown') === value,
  // CVE-specific filters for S1Cve dashboard cards
  cveAgingApp:      (r, value) => (r.applicationName || r.application || 'Unknown') === value,
  endpointImpact:   (r, value) => (r.applicationName || r.application || 'Unknown') === value,
  CVEs:             (r, value) => (r.applicationVendor || 'Unknown') === value,
  scoreRange:       (r, value) => {
    const s = parseFloat(r.baseScore) || 0;
    if (value === 'Low (0-3.9)')  return s < 4;
    if (value === 'Med (4-6.9)')  return s >= 4 && s < 7;
    if (value === 'High (7-8.9)') return s >= 7 && s < 9;
    if (value === 'Crit (9-10)')  return s >= 9;
    return false;
  },
  // CVE Aging bucket filter - filters by daysDetected range
  cveAgingBucket:   (r, value) => {
    const d = parseInt(r.daysDetected, 10) || (r.publishedDate ? Math.floor((Date.now() - new Date(r.publishedDate).getTime()) / 86400000) : 0);
    const v = String(value || '').trim().toLowerCase();
    if (v === '0-30' || v.includes('< 30') || v.includes('0-30')) return d <= 30;
    if (v === '31-90' || v.includes('31-90')) return d > 30 && d <= 90;
    if (v === '91-180' || v.includes('91-180')) return d > 90 && d <= 180;
    if (v === '180+' || v.includes('180+')) return d > 180;
    return true;
  },
  mitreTechnique:   (t, value) => (t.indicators || []).some((ind) =>
    (ind.tactics || []).some((tac) => (tac.techniques || []).some((tech) => tech.name === value))),
  mitreTactic:      (t, value) => (t.indicators || []).some((ind) =>
    (ind.tactics || []).some((tac) => (tac.name || '').toLowerCase() === value.toLowerCase())),
  activeThreats:    (a) => (a.activeThreats || 0) > 0,
  agentDetail:      (a, value) => (a.computerName || a.agentComputerName) === value,
  active:           (a) => a.isActive === true,
  inactive:         (a) => a.isActive === false,
  outdated:         (a) => a.isUpToDate === false,
  inactiveMachines: (a, value) => (a.computerName || a.agentComputerName) === value,
  outdatedAgent:    (a, value) => (a.computerName || a.agentComputerName) === value,
  firewallDisabled: (a, value) => (a.computerName || a.agentComputerName) === value && a.firewallEnabled === false,
  oldScan:          (a, value) => (a.computerName || a.agentComputerName) === value,
  agentSite:        (a, value) => (a.siteName || a.site || 'Unknown') === value,
  os:               (a, value) => {
    const raw = String(a.osName || a.os_name || a.os_type || a.platform || a.osType || '').toLowerCase();
    const target = String(value || '').toLowerCase();
    if (target === 'other') return true;
    if (target.includes('win')) return raw.includes('win');
    if (target.includes('mac') || target.includes('darwin')) return raw.includes('mac') || raw.includes('darwin') || raw.includes('osx');
    if (target.includes('linux')) return raw.includes('linux') || raw.includes('ubuntu') || raw.includes('debian');
    if (target.includes('android')) return raw.includes('android');
    if (target.includes('ios')) return raw.includes('ios');
    return raw.includes(target) || target.includes(raw);
  },
  osName:           (a, value) => {
    const raw = String(a.osName || a.os_name || a.os_type || a.platform || a.osType || '').toLowerCase();
    const target = String(value || '').toLowerCase();
    if (target === 'other') return true;
    if (target.includes('win')) return raw.includes('win');
    if (target.includes('mac') || target.includes('darwin')) return raw.includes('mac') || raw.includes('darwin') || raw.includes('osx');
    if (target.includes('linux')) return raw.includes('linux') || raw.includes('ubuntu') || raw.includes('debian');
    if (target.includes('android')) return raw.includes('android');
    if (target.includes('ios')) return raw.includes('ios');
    return raw.includes(target) || target.includes(raw);
  },
  networkStatus:    (a, value) => (a.networkStatus || a.network_status || 'Unknown') === value,
  scanStatus:       (a, value) => (a.scanStatus || 'Unknown') === value,
  isActive:         (a, value) => String(a.isActive) === String(value),
  firewallEnabled:  (a, value) => String(a.firewallEnabled) === String(value),
  isUpToDate:       (a, value) => String(a.isUpToDate) === String(value),
  criticalEvents:   (e) => Number(e.severity) >= 4,
  checkpointSeverity: (e, value) => String(e.severity ?? '?') === String(value),
  checkpointState:  (e, value) => {
    const s = String(e.state ?? 'unknown').toLowerCase();
    const v = String(value || '').toLowerCase();
    if (v === 'remediated' || v === 'neutralized' || v === 'resolved' || v === 'closed') {
      return ['remediated', 'closed', 'done', 'resolved'].includes(s);
    }
    if (v === 'detected' || v === 'in-flight' || v === 'in-progress' || v === 'wip') {
      return ['detected', 'in_progress', 'wip'].includes(s);
    }
    if (v === 'new' || v === 'pending' || v === 'open' || v === 'unresolved') {
      return ['new', 'pending', 'open', 'unresolved'].includes(s);
    }
    return s === v || s.includes(v);
  },
  checkpointConfidence: (e, value) => (e.confidenceIndicator ?? 'unknown').toLowerCase() === String(value || '').toLowerCase(),
  checkpointSaas:   (e, value) => String(e.saas || 'Office 365').toLowerCase() === String(value || '').toLowerCase(),
  checkpointDate: (e, value) => {
    const d = parseDate(e.eventCreated);
    if (!d) return false;
    const key = d.toISOString().slice(0, 10);

    // Special handling for 'last7days'
    if (value === 'last7days') {
      const now = Date.now();
      const DAY = 86_400_000;
      return (now - d.getTime()) < 7 * DAY;
    }

    return key === value;
  },
  checkpointType: (e, value) => {
    const t = String(e.type ?? 'unknown').toLowerCase().replace(/_/g, ' ');
    const v = String(value || '').toLowerCase().replace(/_/g, ' ');
    return t.includes(v) || v.includes(t);
  },
  senderDomain:     (e, value) => {
    const parts = (e.senderAddress || '').split('@');
    return parts.length >= 2 && parts[parts.length - 1].toLowerCase() === String(value || '').toLowerCase();
  },
  sender:           (e, value) => (e.senderAddress || '').toLowerCase() === String(value || '').toLowerCase(),
  targetedMailbox:  (e, value) => {
    const matches = (e.description || '').match(CHECKPOINT_EMAIL_RE);
    if (!matches) return false;
    const sender = (e.senderAddress || '').toLowerCase();
    return matches.some((m) => { const lm = m.toLowerCase(); return lm === String(value || '').toLowerCase() && lm !== sender; });
  },
  // ── Zoho ticket filters ──────────────────────────────────────────────────
  zohoStatus:       (t, value) => {
    const s = String(t.status || '').trim().toLowerCase();
    const v = String(value || '').trim().toLowerCase();
    if (v === 'open') return s === 'open' || s === 're-open';
    if (v === 'in progress' || v === 'wip') return s.includes('progress') || s === 'wip';
    if (v === 'on hold') return s.includes('hold') || s.includes('revert');
    if (v === 'escalated') return s === 'escalated';
    if (v === 'closed' || v === 'resolved') return ['closed', 'technically closed', 'resolved', 'duplicate'].includes(s);
    return s === v;
  },
  zohoPriority:     (t, value) => {
    const p = String(t.priority || '').trim().toLowerCase();
    const v = String(value || '').trim().toLowerCase();
    if (v === 'critical' || v === 'urgent') return p === 'critical' || p === 'urgent';
    return p === v;
  },
  zohoDepartment:   (t, value) => {
    const norm = (v) => (v != null ? String(v).trim() : '');
    const dept = (norm(t.department?.name) || norm(t.departmentName) || 'Unknown').toLowerCase();
    return dept === String(value || '').toLowerCase();
  },
  zohoAll:          () => true,
  zohoOpen:         (t) => ['open', 're-open'].includes(String(t.status || '').trim().toLowerCase()),
  zohoHighPriority: (t) => ['high', 'critical', 'urgent'].includes(String(t.priority || '').trim().toLowerCase()),
  zohoClosed:       (t) => ['closed', 'technically closed', 'resolved', 'duplicate'].includes(String(t.status || '').trim().toLowerCase()),
  zohoAgingBucket:  (t, value) => {
    const created = t.createdTime || t.created_at || t.createdAt;
    if (!created) return true;
    const c = new Date(created).getTime();
    if (isNaN(c)) return true;
    const hours = (Date.now() - c) / (1000 * 60 * 60);
    const val = String(value || '').toLowerCase();
    if (val === '< 1 hour' || val.includes('< 1')) return hours < 1;
    if (val === '1-4 hours' || val.includes('1-4')) return hours >= 1 && hours <= 4;
    if (val === '4-24 hours' || val.includes('4-24')) return hours > 4 && hours <= 24;
    if (val === '1-3 days' || val.includes('1-3')) return hours > 24 && hours <= 72;
    if (val.includes('3+ days') || val.includes('overdue')) return hours > 72;
    return true;
  },
  zohoDay:          (t, value) => {
    const ca = t.created_at || t.createdTime || t.createdAt;
    const d = new Date(ca);
    if (!ca || isNaN(d.getTime())) return false;
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return days[d.getDay()] === value;
  },
  zohoAssignee:     (t, value) => {
    const norm = (v) => (v != null ? String(v).trim() : '');
    const name = `${norm(t.assignee?.firstName)} ${norm(t.assignee?.lastName)}`.trim() || 'Unassigned';
    return name.toLowerCase() === String(value || '').toLowerCase();
  },
  zohoTicketNo:     (t, value) => {
    const norm = (v) => (v != null ? String(v).trim().replace(/#/g, '') : '');
    const cleanVal = String(value || '').trim().replace(/#/g, '');
    return (norm(t.ticket_no) || norm(t.ticketNumber) || norm(t.number)) === cleanVal;
  },
  zohoStatusGroup:  (t, value) => {
    const s = String(t.status || '').trim().toLowerCase();
    const groups = {
      'Open':          ['open', 're-open'],
      'WIP':           ['wip'],
      'On Hold':       ['on hold', 'on hold by customer'],
      'Revert Awaited': ['revert awaited - customer', 'revert awaited - oem', 'revert awaited - vendor'],
      'Closed':        ['closed', 'technically closed', 'resolved'],
      'Escalated':     ['escalated'],
      'Duplicate':     ['duplicate'],
      'Acknowledge':   ['acknowledge'],
    };
    const matchers = groups[value] || [String(value || '').toLowerCase()];
    return matchers.includes(s);
  },
  // ── MDM / Device filters ─────────────────────────────────────────────────
  complianceStatus: (d, value) => {
    const isComp = d.is_compliant === true || d.compliant === true || String(d.status || '').toLowerCase() === 'compliant';
    const isPend = String(d.status || '').toLowerCase().includes('pending') || d.enrolled === false;
    const val = String(value || '').toLowerCase();
    if (val === 'compliant') return isComp;
    if (val === 'non-compliant' || val === 'noncompliant') return !isComp && !isPend;
    if (val.includes('pending')) return isPend;
    return true;
  },
  mdmCompliance:    (d, value) => {
    const isComp = d.is_compliant === true || d.compliant === true || String(d.status || '').toLowerCase() === 'compliant';
    const isPend = String(d.status || '').toLowerCase().includes('pending') || d.enrolled === false;
    const val = String(value || '').toLowerCase();
    if (val === 'compliant') return isComp;
    if (val === 'non-compliant' || val === 'noncompliant') return !isComp && !isPend;
    if (val.includes('pending')) return isPend;
    return true;
  },
  compliant:        (d) => d.is_compliant === true || d.compliant === true || String(d.status || '').toLowerCase() === 'compliant',
  nonCompliant:     (d) => !(d.is_compliant === true || d.compliant === true || String(d.status || '').toLowerCase() === 'compliant'),
  deviceId:         (d, value) => {
    const name = d.device_name || d.name || String(d.id || '');
    return name === String(value) || String(d.id) === String(value);
  },
  // ── NVD / Threat Intel filters ───────────────────────────────────────────
  nvdSeverity:      (c, value) => {
    const s = parseFloat(c.baseScore != null ? c.baseScore : (c.cvss_base_score != null ? c.cvss_base_score : (c.cvssScore || 0))) || 0;
    const sev = String(c.severity || c.cvss_base_severity || '').toUpperCase();
    const val = String(value || '').toUpperCase();
    if (val.includes('CRITICAL') || val.includes('9.0')) return s >= 9.0 || sev === 'CRITICAL';
    if (val.includes('HIGH') || val.includes('7.0')) return (s >= 7.0 && s < 9.0) || sev === 'HIGH';
    if (val.includes('MEDIUM') || val.includes('4.0')) return (s >= 4.0 && s < 7.0) || sev === 'MEDIUM';
    if (val.includes('LOW') || val.includes('0.1')) return (s < 4.0 && s > 0) || sev === 'LOW';
    return true;
  },
  cveId:            (c, value) => String(c.cveId || c.cve_id || '').toLowerCase() === String(value || '').toLowerCase(),
  // ── Firewall / Network filters ───────────────────────────────────────────
  app:              (r, value) => {
    const name = r['@name'] || r['name'] || r['app'] || r['application'] || '';
    return String(name).toLowerCase() === String(value || '').toLowerCase() || String(name).toLowerCase().includes(String(value || '').toLowerCase());
  },
  action:           (r, value) => {
    const a = String(r['action'] || r['rule_action'] || '').toLowerCase();
    return a.includes(String(value || '').toLowerCase());
  },
  threat:           (r, value) => {
    const t = String(r['threat'] || r['threat_name'] || r['subtype'] || '').toLowerCase();
    return t.includes(String(value || '').toLowerCase());
  },
  // Threats dataset filters
  total_threats:    () => true,
  mitigated:        (t, value) => (t.threatInfo?.mitigationStatus || '').toLowerCase() === (value || '').toLowerCase(),
  unresolved_threats:       (t) => ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus),
  fileless:         (t) => t.threatInfo?.isFileless === true,
  fileless_type:    (t, value) => {
    // fileless_type value would be 'true' or 'false' from the pie chart
    const isFileless = t.threatInfo?.isFileless === true;
    return String(isFileless) === String(value);
  },
  mttd:             (t) => {
    const created = parseDate(t.threatInfo?.createdAt);
    const identified = parseDate(t.threatInfo?.identifiedAt);
    return !!(created && identified && created > identified);
  },
  mttm:             (t) => {
    const identified = parseDate(t.threatInfo?.identifiedAt);
    const successEntry = (t.mitigationStatus || []).find((s) => s.status === 'success');
    if (!identified || !successEntry) return false;
    const ended = parseDate(successEntry.mitigationEndedAt);
    return !!ended;
  },
  threatTrend:      (t, value) => {
    const created = parseDate(t.threatInfo?.createdAt);
    if (!created || !value) return false;
    return created.toISOString().slice(0, 10) === value;
  },
  processUser:      (t, value) => (t.threatInfo?.processUser || '') === value,
  site:             (t, value) => (t.agentRealtimeInfo?.siteName || 'Unknown') === value,
  group:            (t, value) => (t.agentRealtimeInfo?.groupName || 'Unknown') === value,
  mitigationStatus: (t, value) => (t.threatInfo?.mitigationStatus || '').toLowerCase() === (value || '').toLowerCase(),
  mitigationStatusArray: (t, value) => (t.mitigationStatus || []).some((s) => s.status?.toLowerCase() === (value || '').toLowerCase()),
  isFileless:       (t, value) => t.threatInfo?.isFileless === value,
  topUser:          (t, value) => (t.threatInfo?.processUser || '') === value,
  confidenceLevel:  (t, value) => (t.threatInfo?.confidenceLevel || 'Unknown') === value,
  siteName:         (t, value) => (t.agentRealtimeInfo?.siteName || 'Unknown') === value,
  groupName:        (t, value) => (t.agentRealtimeInfo?.groupName || 'Unknown') === value,
  avgMttd:          (t) => {
    const created = parseDate(t.threatInfo?.createdAt);
    const identified = parseDate(t.threatInfo?.identifiedAt);
    return !!(created && identified && created > identified);
  },
  avgMttm:          (t) => {
    const identified = parseDate(t.threatInfo?.identifiedAt);
    const successEntry = (t.mitigationStatus || []).find((s) => s.status === 'success');
    if (!identified || !successEntry) return false;
    const ended = parseDate(successEntry.mitigationEndedAt);
    return !!ended;
  },
};

export default function DetailView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { dataset, filterId, value, title, dateFrom: incomingDateFrom, dateTo: incomingDateTo, additionalFilter } = location.state || {};

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(incomingDateFrom || '');
  const [dateTo, setDateTo] = useState(incomingDateTo || '');
  const [page, setPage] = useState(1);
  const [mitreDescriptions, setMitreDescriptions] = useState(null);

  const normKey = normalizeDatasetKey(dataset);
  const config = normKey ? DATASET_CONFIG[normKey] : null;
  const filterFn = filterId && FILTERS[filterId] ? FILTERS[filterId] : (config?.raw ? () => true : (FILTERS.all || (() => true)));
  // Handle additional filter from chart clicks (e.g., filter by type AND date)
  const additionalFilterFn = additionalFilter?.filterId ? FILTERS[additionalFilter.filterId] : null;
  const additionalFilterValue = additionalFilter?.value;

  useEffect(() => {
    if (!config) {
      if (location.state?.rows) {
        setRows(location.state.rows);
      }
      setLoading(false);
      return;
    }
    if (config.raw || (location.state?.rows && Array.isArray(location.state.rows) && location.state.rows.length > 0)) {
      setRows(location.state?.rows || []);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.get(config.endpoint)
      .then((r) => setRows(config.extract ? config.extract(r) : (r.data?.data || [])))
      .catch(() => {
        if (location.state?.rows) {
          setRows(location.state.rows);
        }
      })
      .finally(() => setLoading(false));
  }, [dataset, location.state]);

  useEffect(() => {
    if (!MITRE_FILTERS.has(filterId)) return;
    api.get('/mitre/techniques')
      .then((r) => setMitreDescriptions(r.data?.techniques || {}))
      .catch(() => setMitreDescriptions({}));
  }, [filterId]);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, filterId, value, additionalFilter, additionalFilterValue, location.state]);

  const dateValue = (r) => {
    const d = config?.dateField ? parseDate(config.dateField(r)) : null;
    return d ? d.getTime() : 0;
  };

  const hasDateFilter = !!(dateFrom || dateTo);

  const { processedRows, capped, totalCount } = useMemo(() => {
    if (!config || !filterFn) return { processedRows: [], capped: false, totalCount: 0 };

    let result = rows.filter((r) => filterFn(r, value));

    // Apply additional filter if present (e.g., from chart click)
    if (additionalFilterFn && additionalFilterValue) {
      result = result.filter((r) => additionalFilterFn(r, additionalFilterValue));
    }

    if (hasDateFilter) {
      result = result.filter((r) => {
        const d = config.dateField ? parseDate(config.dateField(r)) : null;
        if (!d) return false;
        const key = d.toISOString().slice(0, 10);
        if (dateFrom && key < dateFrom) return false;
        if (dateTo   && key > dateTo)   return false;
        return true;
      });
    }

    let didCap = false;
    const totalCount = result.length;
    if (!hasDateFilter && CAPPED_FILTERS.has(filterId) && result.length > RECENT_CAP) {
      result = [...result].sort((a, b) => dateValue(b) - dateValue(a)).slice(0, RECENT_CAP);
      didCap = true;
    }

    if (config.rowRank) {
      result = [...result].sort((a, b) => {
        const ar = config.rowRank(a);
        const br = config.rowRank(b);
        if (ar !== br) return ar - br;
        return dateValue(b) - dateValue(a);
      });
    }

    if (config.raw && result.some((r) => r.nsess !== undefined && r.nsess !== null && r.nsess !== '')) {
      const nsessValue = (r) => {
        const n = Number(String(r.nsess ?? '').replace(/,/g, '').trim());
        return Number.isFinite(n) ? n : -Infinity;
      };
      result = [...result].sort((a, b) => nsessValue(b) - nsessValue(a));
    }

    return { processedRows: result, capped: didCap, totalCount };
  }, [rows, filterFn, value, dateFrom, dateTo, hasDateFilter, filterId, config, additionalFilterFn, additionalFilterValue]);

  const eventTotal = useMemo(
    () => (config?.raw ? sumFirewallCount(processedRows) : null),
    [config, processedRows]
  );

  // Distinct techniques actually present in the filtered rows, for the
  // description panel — for a single-technique filter this is just that one
  // technique; for a tactic filter it's every technique under it that shows
  // up in the current results.
  const relevantTechniques = useMemo(() => {
    if (!MITRE_FILTERS.has(filterId)) return [];
    const seen = new Map();
    processedRows.forEach((t) => {
      (t.indicators || []).forEach((ind) => {
        (ind.tactics || []).forEach((tac) => {
          if (filterId === 'mitreTactic' && (tac.name || '').toLowerCase() !== value.toLowerCase()) return;
          (tac.techniques || []).forEach((tech) => {
            if (filterId === 'mitreTechnique' && tech.name !== value) return;
            const id = extractTechId(tech.link);
            const key = id || tech.name;
            if (!seen.has(key)) seen.set(key, { id, name: tech.name, link: tech.link });
          });
        });
      });
    });
    return [...seen.values()];
  }, [processedRows, filterId, value]);

  const totalPages = Math.max(1, Math.ceil(processedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return processedRows.slice(start, start + PAGE_SIZE);
  }, [processedRows, currentPage]);

  if (!config || !filterFn) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
        <p className="text-base font-semibold text-[var(--foreground)]">No detail to show</p>
        <p className="text-sm text-[var(--muted)] mt-1">Navigate here by clicking a KPI card or chart segment.</p>
        <Link to="/security" className="mt-4 text-sm text-indigo-500 hover:text-indigo-700 font-semibold">Back to Security</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <WidgetSkeleton variant="table" />
      </div>
    );
  }

  // Raw rows have no fixed schema — use custom cols/rowFn if provided (e.g.
  // Zoho), otherwise derive columns from whatever keys are present on the rows.
  const displayCols = config.cols
    ? config.cols
    : config.raw
      ? Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
      : config.cols;
  const displayRowFn = config.rowFn
    ? config.rowFn
    : config.raw
      ? (row) => displayCols.map((c) => row[c])
      : config.rowFn;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold mb-1"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-[var(--foreground)]">{title || 'Details'}</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {totalCount} row{totalCount === 1 ? '' : 's'}
            {typeof eventTotal === 'number' && eventTotal > totalCount &&
              ` · ${eventTotal.toLocaleString('en-IN')} events (rows are pre-aggregated by the source report)`}
            {capped && ` · showing ${RECENT_CAP} most recent — apply a date filter to see more`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-[var(--muted)] font-medium">From</label>
            <input type="date" value={dateFrom} max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-[10px] px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-[var(--muted)] font-medium">To</label>
            <input type="date" value={dateTo} min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-[10px] px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {hasDateFilter && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold">Clear</button>
          )}
        </div>
      </div>

      {relevantTechniques.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 space-y-3">
          {relevantTechniques.map((tech) => {
            const desc = tech.id && mitreDescriptions ? mitreDescriptions[tech.id] : null;
            return (
              <div key={tech.id || tech.name}>
                <p className="text-xs font-semibold text-[var(--foreground)]">
                  {tech.id && <span className="font-mono text-[var(--muted)] mr-1.5">{tech.id}</span>}
                  {tech.name}
                </p>
                {mitreDescriptions === null ? (
                  <p className="text-xs text-[var(--muted)] mt-0.5">Loading description…</p>
                ) : desc?.description ? (
                  <p className="text-xs text-[var(--muted)] mt-0.5">{desc.description}</p>
                ) : (
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    No description available.{' '}
                    {tech.link && <a href={tech.link} target="_blank" rel="noreferrer" className="text-indigo-500 hover:text-indigo-700 font-medium">View on MITRE ATT&CK ↗</a>}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
        {processedRows.length === 0
          ? <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">No matching records</div>
          : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[var(--muted-bg)]">
                    {displayCols.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-semibold text-[var(--muted)] uppercase tracking-wide whitespace-nowrap border-b border-[var(--card-border)]">{config.raw ? (RAW_COL_LABELS[c] || c) : c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--card-border)]">
                  {pageRows.map((row, i) => {
                    const tier = config.rowRank && config.tierStyles ? config.tierStyles[config.rowRank(row)] : null;
                    const rowClassName = tier ? tier.className : 'hover:bg-[var(--muted-bg)]/60';
                    return (
                      <tr key={i} className={rowClassName}>
                        {displayRowFn(row).map((cell, j) => (
                          <td key={j} className={`px-3 py-2 whitespace-nowrap max-w-[220px] truncate ${tier?.coloredText ? '' : 'text-[var(--foreground)]'}`}>{cell ?? '—'}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      {processedRows.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-[var(--muted)]">
            Page {currentPage} of {totalPages} · {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, processedRows.length)} of {processedRows.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted-bg)]"
            >
              Previous
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted-bg)]"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
