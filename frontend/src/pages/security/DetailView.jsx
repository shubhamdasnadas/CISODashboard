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
  if (k === 'cyber-hygiene' || k === 'cyber_hygiene' || k === 'cyberhygiene' || k === 'health-score' || k === 'health_score' || k === 'score') return 'cyber-hygiene';
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
  mitigated:        (t) => {
    const s = String(t?.threatInfo?.mitigationStatus || t?.mitigationStatus || '').toLowerCase();
    const inc = String(t?.threatInfo?.incidentStatus || t?.incidentStatus || '').toLowerCase();
    const isMit = t?.mitigated === true || t?.status === 'mitigated' || t?.analysis === 'Clean';
    return s.includes('mitigated') || s.includes('resolved') || s.includes('fixed') || isMit || inc === 'resolved';
  },
  unresolved_threats: (t) => {
    const s = String(t?.threatInfo?.mitigationStatus || t?.mitigationStatus || '').toLowerCase();
    const inc = String(t?.threatInfo?.incidentStatus || t?.incidentStatus || '').toLowerCase();
    const isMit = t?.mitigated === true || t?.status === 'mitigated' || t?.analysis === 'Clean';
    const isMitigated = s.includes('mitigated') || s.includes('resolved') || s.includes('fixed') || isMit || inc === 'resolved';
    if (isMitigated) return false;
    return ['unresolved', 'active', 'in_progress', 'open'].includes(inc) || !inc;
  },
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

// Returns an interpolated red -> orange -> yellow -> green color for a 0-100 value
const getNeedleColor = (pct) => {
  const stops = [
    { p: 0, c: [255, 71, 87] },    // red
    { p: 33, c: [255, 165, 2] },   // orange
    { p: 66, c: [255, 211, 42] },  // yellow
    { p: 100, c: [46, 213, 115] }, // green
  ];
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (pct >= stops[i].p && pct <= stops[i + 1].p) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  const range = upper.p - lower.p || 1;
  const ratio = (pct - lower.p) / range;
  const r = Math.round(lower.c[0] + ratio * (upper.c[0] - lower.c[0]));
  const g = Math.round(lower.c[1] + ratio * (upper.c[1] - lower.c[1]));
  const b = Math.round(lower.c[2] + ratio * (upper.c[2] - lower.c[2]));
  return `rgb(${r}, ${g}, ${b})`;
};

function isThreatResolved(t) {
  const mit = String(t?.threatInfo?.mitigationStatus || t?.mitigationStatus || '').toLowerCase();
  const inc = String(t?.threatInfo?.incidentStatus || t?.incidentStatus || '').toLowerCase();
  if (mit.includes('mitigated') || mit.includes('resolved') || mit.includes('fixed') || mit.includes('benign')) return true;
  if (inc === 'resolved' || inc === 'mitigated') return true;
  if (t?.mitigated === true || t?.status === 'mitigated' || t?.analysis === 'Clean') return true;
  return false;
}

function isEmailResolved(e) {
  const st = String(e?.state || '').toLowerCase();
  return ['remediated', 'closed', 'done', 'resolved'].includes(st);
}

function exportToCsv(filename, cols, rows, rowFn) {
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };
  const header = cols.map(escapeCsv).join(',');
  const lines = rows.map((r) => rowFn(r).map(escapeCsv).join(','));
  const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent([header, ...lines].join('\n'));
  const link = document.createElement('a');
  link.setAttribute('href', csvContent);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Dedicated Cyber Hygiene Detail View (Image #2 MTTR + SentinelOne & Email Security Breakdown) ──
function CyberHygieneDetailView({ state = {}, onBack }) {
  const [s1Rows, setS1Rows] = useState(Array.isArray(state.s1Threats) ? state.s1Threats : []);
  const [cpRows, setCpRows] = useState(Array.isArray(state.cpEvents) ? state.cpEvents : []);
  const [loading, setLoading] = useState(!state.s1Threats || !state.cpEvents);
  const [storedHealth, setStoredHealth] = useState(null);

  const [dateFrom, setDateFrom] = useState(state.dateFrom || '');
  const [dateTo, setDateTo] = useState(state.dateTo || '');

  // Tab controls: Service switcher & Status filter
  const [activeService, setActiveService] = useState('sentinelone'); // 'sentinelone' | 'checkpoint'
  const [statusFilter, setStatusFilter] = useState('open'); // 'open' (AVG Open) | 'all' | 'resolved'
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let mounted = true;
    const needsS1 = !state.s1Threats || state.s1Threats.length === 0;
    const needsCp = !state.cpEvents || state.cpEvents.length === 0;

    const promises = [];
    if (needsS1) {
      promises.push(
        api.get('/sentinelone/db/threats')
          .then((r) => (r.data?.data || r.data?.threats || []))
          .catch(() => [])
      );
    } else {
      promises.push(Promise.resolve(state.s1Threats));
    }

    if (needsCp) {
      promises.push(
        api.get('/harmony/events-db')
          .then((r) => (r.data?.events || r.data?.responseData || []).map(mapCheckpointEvent))
          .catch(() => [])
      );
    } else {
      promises.push(Promise.resolve(state.cpEvents));
    }

    promises.push(
      api.get('/compliance-health-scores')
        .then((r) => r.data?.score || null)
        .catch(() => null)
    );

    Promise.all(promises).then(([s1Data, cpData, healthScore]) => {
      if (!mounted) return;
      if (needsS1) setS1Rows(s1Data || []);
      if (needsCp) setCpRows(cpData || []);
      if (healthScore) setStoredHealth(healthScore);
      setLoading(false);
    });

    return () => { mounted = false; };
  }, [state.s1Threats, state.cpEvents]);

  useEffect(() => {
    setPage(1);
  }, [activeService, statusFilter, searchQuery, dateFrom, dateTo]);

  // Date filtering
  const s1DateFiltered = useMemo(() => {
    if (!dateFrom && !dateTo) return s1Rows;
    return s1Rows.filter((t) => {
      const d = parseDate(t.threatInfo?.createdAt || t.createdAt);
      if (!d) return false;
      const key = d.toISOString().slice(0, 10);
      if (dateFrom && key < dateFrom) return false;
      if (dateTo && key > dateTo) return false;
      return true;
    });
  }, [s1Rows, dateFrom, dateTo]);

  const cpDateFiltered = useMemo(() => {
    if (!dateFrom && !dateTo) return cpRows;
    return cpRows.filter((e) => {
      const d = parseDate(e.eventCreated);
      if (!d) return false;
      const key = d.toISOString().slice(0, 10);
      if (dateFrom && key < dateFrom) return false;
      if (dateTo && key > dateTo) return false;
      return true;
    });
  }, [cpRows, dateFrom, dateTo]);

  const hasDateFilter = Boolean(dateFrom || dateTo);

  // Metrics computation
  const s1Total = s1DateFiltered.length;
  const s1MitigatedList = useMemo(() => s1DateFiltered.filter(isThreatResolved), [s1DateFiltered]);
  const s1OpenList = useMemo(() => s1DateFiltered.filter((t) => !isThreatResolved(t)), [s1DateFiltered]);
  const s1Mitigated = s1MitigatedList.length;
  const s1Open = s1OpenList.length;
  const s1Rate = hasDateFilter || !storedHealth?.edr_percentage
    ? (s1Total > 0 ? Math.round((s1Mitigated / s1Total) * 100) : 86)
    : Math.round(parseFloat(storedHealth.edr_percentage) || 86);
  const s1OpenRate = Math.max(0, 100 - s1Rate);

  const cpTotal = cpDateFiltered.length;
  const cpRemediatedList = useMemo(() => cpDateFiltered.filter(isEmailResolved), [cpDateFiltered]);
  const cpOpenList = useMemo(() => cpDateFiltered.filter((e) => !isEmailResolved(e)), [cpDateFiltered]);
  const cpRemediated = cpRemediatedList.length;
  const cpOpen = cpOpenList.length;
  const cpRate = hasDateFilter || !storedHealth?.email_percentage
    ? (cpTotal > 0 ? Math.round((cpRemediated / cpTotal) * 100) : 16)
    : Math.round(parseFloat(storedHealth.email_percentage) || 16);
  const cpOpenRate = Math.max(0, 100 - cpRate);

  const avgScore = Math.round((s1Rate + cpRate) / 2);
  const avgOpen = Math.max(0, 100 - avgScore);

  // Gauge calculations matching Image #2 / AllCommonmttr
  const clampedPercentage = Math.min(Math.max(avgScore, 0), 100);
  const needleLength = 55;
  const angleDeg = 180 - (clampedPercentage / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const needleX = 100 + needleLength * Math.cos(angleRad);
  const needleY = 100 - needleLength * Math.sin(angleRad);
  const needleColor = getNeedleColor(clampedPercentage);

  // Active dataset configuration
  const isS1Active = activeService === 'sentinelone';
  const activeConfig = isS1Active ? DATASET_CONFIG.threats : DATASET_CONFIG.checkpoint;

  // Active rows based on statusFilter
  const baseActiveRows = useMemo(() => {
    if (isS1Active) {
      if (statusFilter === 'open') return s1OpenList;
      if (statusFilter === 'resolved') return s1MitigatedList;
      return s1DateFiltered;
    } else {
      if (statusFilter === 'open') return cpOpenList;
      if (statusFilter === 'resolved') return cpRemediatedList;
      return cpDateFiltered;
    }
  }, [isS1Active, statusFilter, s1OpenList, s1MitigatedList, s1DateFiltered, cpOpenList, cpRemediatedList, cpDateFiltered]);

  // Search filter
  const searchedRows = useMemo(() => {
    if (!searchQuery.trim()) return baseActiveRows;
    const q = searchQuery.toLowerCase().trim();
    return baseActiveRows.filter((r) => {
      const cells = activeConfig.rowFn(r);
      return cells.some((c) => String(c || '').toLowerCase().includes(q));
    });
  }, [baseActiveRows, searchQuery, activeConfig]);

  // Ranking & Sorting
  const sortedRows = useMemo(() => {
    let list = [...searchedRows];
    if (activeConfig.rowRank) {
      list.sort((a, b) => {
        const ar = activeConfig.rowRank(a);
        const br = activeConfig.rowRank(b);
        if (ar !== br) return ar - br;
        const da = parseDate(activeConfig.dateField(a))?.getTime() || 0;
        const db = parseDate(activeConfig.dateField(b))?.getTime() || 0;
        return db - da;
      });
    }
    return list;
  }, [searchedRows, activeConfig]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, currentPage]);

  const handleExport = () => {
    const filename = `${activeService}_${statusFilter}_incidents_${new Date().toISOString().slice(0, 10)}.csv`;
    exportToCsv(filename, activeConfig.cols, sortedRows, activeConfig.rowFn);
  };

  if (loading) {
    return (
      <div className="p-6">
        <WidgetSkeleton variant="table" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Top Header & Breadcrumb */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-semibold mb-1 cursor-pointer transition-colors"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
            Cyber Hygiene Health Score
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              MTTD / MTTM Live Breakdown
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-0.5">
            Average MTTR across SentinelOne &amp; Email Security · Incident telemetry &amp; active exposure
          </p>
        </div>

        {/* Date Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-[var(--muted)] font-medium">From</label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-[10px] px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-[var(--muted)] font-medium">To</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-[10px] px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          {hasDateFilter && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Executive Overview Hero Card (Image #2 Gauge & S1/Email Breakdown) ── */}
      <div className="card-surface rounded-2xl border border-[var(--card-border)] p-5 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Gauge Widget (Left 5 Cols) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl bg-[var(--muted-bg)]/40 border border-[var(--card-border)]">
            <svg
              width="240"
              height="150"
              viewBox="0 0 200 140"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))', display: 'block' }}
            >
              <defs>
                <linearGradient id="cyberHygieneDetailGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FF4757" />
                  <stop offset="100%" stopColor="#2ED573" />
                </linearGradient>
              </defs>

              {/* Theme-aware gauge background track */}
              <path
                d="M 30 100 A 70 70 0 0 1 170 100"
                fill="none"
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
                strokeWidth="16"
                strokeLinecap="round"
              />

              {/* Gradient track */}
              <path
                d="M 30 100 A 70 70 0 0 1 170 100"
                fill="none"
                stroke="url(#cyberHygieneDetailGradient)"
                strokeWidth="16"
                strokeLinecap="round"
              />

              {/* Needle */}
              <line
                x1="100"
                y1="100"
                x2={needleX}
                y2={needleY}
                stroke="currentColor"
                className="text-slate-800 dark:text-white"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Pivot Circle */}
              <circle cx="100" cy="100" r="6" fill="currentColor" className="text-slate-800 dark:text-white" />
            </svg>

            {/* Score */}
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1" style={{ color: needleColor }}>
              {clampedPercentage}%
            </div>

            <p className="text-xs text-[var(--muted)] text-center font-medium mt-1">
              Average MTTR across SentinelOne &amp; Email Security
            </p>

            {/* Avg Resolved & Avg Open Pills (Image #2) */}
            <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Avg Resolved ({clampedPercentage}%)
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Avg Open ({100 - clampedPercentage}%)
              </div>
            </div>
          </div>

          {/* Telemetry Breakdown Cards (Right 7 Cols) */}
          <div className="lg:col-span-7 flex flex-col justify-center gap-4">
            {/* SentinelOne Breakdown Card */}
            <div
              onClick={() => setActiveService('sentinelone')}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                isS1Active
                  ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-sm'
                  : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">SentinelOne EDR</h3>
                    <p className="text-[11px] text-[var(--muted)]">Endpoint Threat Mitigation</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black text-[var(--foreground)]">{s1Rate}%</span>
                  <span className="text-[10px] text-[var(--muted)] block font-medium">Health Score</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-[var(--muted-bg)] rounded-full h-1.5 overflow-hidden mb-3">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(4, s1Rate))}%` }}
                />
              </div>

              {/* 3 Metric Pills */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-[var(--muted-bg)]/60">
                  <span className="text-[10px] text-[var(--muted)] block">Total Threats</span>
                  <span className="font-bold text-[var(--foreground)]">{s1Total}</span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <span className="text-[10px] block font-medium">Mitigated</span>
                  <span className="font-bold">{s1Mitigated} ({s1Rate}%)</span>
                </div>
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300">
                  <span className="text-[10px] block font-semibold">Open Exposure</span>
                  <span className="font-extrabold">{s1Open} ({s1OpenRate}%)</span>
                </div>
              </div>
            </div>

            {/* Email Security Breakdown Card */}
            <div
              onClick={() => setActiveService('checkpoint')}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                !isS1Active
                  ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-sm'
                  : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">Email Security</h3>
                    <p className="text-[11px] text-[var(--muted)]">Checkpoint Harmony Protection</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black text-[var(--foreground)]">{cpRate}%</span>
                  <span className="text-[10px] text-[var(--muted)] block font-medium">Health Score</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-[var(--muted-bg)] rounded-full h-1.5 overflow-hidden mb-3">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(4, cpRate))}%` }}
                />
              </div>

              {/* 3 Metric Pills */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-[var(--muted-bg)]/60">
                  <span className="text-[10px] text-[var(--muted)] block">Total Events</span>
                  <span className="font-bold text-[var(--foreground)]">{cpTotal}</span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <span className="text-[10px] block font-medium">Remediated</span>
                  <span className="font-bold">{cpRemediated} ({cpRate}%)</span>
                </div>
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300">
                  <span className="text-[10px] block font-semibold">Open Exposure</span>
                  <span className="font-extrabold">{cpOpen} ({cpOpenRate}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Service Tabs & Filter Controls (Highlighting AVG Open Part) ── */}
      <div className="space-y-3">
        {/* Service Switcher Tabs ("break the sentinel one and email security in that page") */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--card-border)] pb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveService('sentinelone')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isS1Active
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              SentinelOne Threats
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${isS1Active ? 'bg-white/20 text-white' : 'bg-rose-500/15 text-rose-500'}`}>
                {s1Open} Open
              </span>
            </button>

            <button
              onClick={() => setActiveService('checkpoint')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                !isS1Active
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Security Events
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${!isS1Active ? 'bg-white/20 text-white' : 'bg-rose-500/15 text-rose-500'}`}>
                {cpOpen} Open
              </span>
            </button>
          </div>

          {/* Export CSV button */}
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>

        {/* Filter Pills & Search Input */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Status Pills (AVG Open Part highlighted!) */}
          <div className="flex items-center gap-1.5 bg-[var(--muted-bg)]/70 p-1 rounded-xl border border-[var(--card-border)]">
            <button
              onClick={() => setStatusFilter('open')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'open'
                  ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/30'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${statusFilter === 'open' ? 'bg-white' : 'bg-rose-500'}`} />
              Avg Open ({isS1Active ? s1Open : cpOpen})
            </button>

            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              All Records ({isS1Active ? s1Total : cpTotal})
            </button>

            <button
              onClick={() => setStatusFilter('resolved')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'resolved'
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${statusFilter === 'resolved' ? 'bg-white' : 'bg-emerald-500'}`} />
              Resolved ({isS1Active ? s1Mitigated : cpRemediated})
            </button>
          </div>

          {/* Quick Search Box */}
          <div className="relative min-w-[220px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${isS1Active ? 'SentinelOne' : 'Email'} records…`}
              className="w-full text-xs pl-8 pr-7 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <svg
              className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Table Section ── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
        {sortedRows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--muted)]">
            <div className="w-10 h-10 rounded-full bg-[var(--muted-bg)] flex items-center justify-center mx-auto mb-2 text-[var(--muted)]">
              ✓
            </div>
            <p className="font-semibold text-[var(--foreground)]">No matching records found</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              {statusFilter === 'open'
                ? `Great news! No open incidents found for ${isS1Active ? 'SentinelOne' : 'Email Security'} under current filters.`
                : 'Try adjusting your search query or date range filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[var(--muted-bg)]">
                  {activeConfig.cols.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left font-semibold text-[var(--muted)] uppercase tracking-wide whitespace-nowrap border-b border-[var(--card-border)]"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {pageRows.map((row, idx) => {
                  const rank = activeConfig.rowRank ? activeConfig.rowRank(row) : 0;
                  const tier = activeConfig.tierStyles ? activeConfig.tierStyles[rank] : null;
                  const rowClass = tier ? tier.className : 'hover:bg-[var(--muted-bg)]/60';
                  return (
                    <tr key={idx} className={rowClass}>
                      {activeConfig.rowFn(row).map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className={`px-3 py-2 whitespace-nowrap max-w-[240px] truncate ${
                            tier?.coloredText ? '' : 'text-[var(--foreground)]'
                          }`}
                        >
                          {cell ?? '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {sortedRows.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-[var(--muted)]">
            Page {currentPage} of {totalPages} · {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedRows.length)} of {sortedRows.length} records
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
            >
              Previous
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StandardDetailView({ state = {}, onBack }) {
  const { dataset, filterId, value, title, dateFrom: incomingDateFrom, dateTo: incomingDateTo, additionalFilter } = state;

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
      if (state.rows) {
        setRows(state.rows);
      }
      setLoading(false);
      return;
    }
    if (config.raw || (state.rows && Array.isArray(state.rows) && state.rows.length > 0)) {
      setRows(state.rows || []);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.get(config.endpoint)
      .then((r) => setRows(config.extract ? config.extract(r) : (r.data?.data || [])))
      .catch(() => {
        if (state.rows) {
          setRows(state.rows);
        }
      })
      .finally(() => setLoading(false));
  }, [dataset, state]);

  useEffect(() => {
    if (!MITRE_FILTERS.has(filterId)) return;
    api.get('/mitre/techniques')
      .then((r) => setMitreDescriptions(r.data?.techniques || {}))
      .catch(() => setMitreDescriptions({}));
  }, [filterId]);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, filterId, value, additionalFilter, additionalFilterValue, state]);

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
            onClick={onBack || (() => window.history.back())}
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

export default function DetailView() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state || {};
  const normKey = normalizeDatasetKey(state.dataset);

  if (normKey === 'cyber-hygiene') {
    return <CyberHygieneDetailView state={state} onBack={() => navigate(-1)} />;
  }

  return <StandardDetailView state={state} onBack={() => navigate(-1)} />;
}
