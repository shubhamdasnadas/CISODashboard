import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../api';
import { useProviders } from '../../../context/ProviderContext.jsx';
import AnalyticsLaunchButton from '../../../components/AnalyticsLaunchButton.jsx';
import WidgetSkeleton from '../../dashboard/WidgetSkeleton.jsx';
import TicketVolcanoGraph from './TicketVolcanoGraph';
import Circlemember from './Circlemember';
import Mttrcard from './Mttrcard';
import Funneldiagram from './Funneldiagram';
import Hourbasedset from './Hourbasedset';
import Topperformance from './Topperformance';
import Ticketingmttr from '../../CyberHygen/Ticketingmttr.jsx';
import {
  DaysFilter,
  ChartViewDropdown,
  useViewState,
  withinRange,
  categoryTimeSeries,
  MultiViewChart,
} from '../../security/widgetViews.jsx';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const agingBuckets = ['<1h', '1-4h', '4-24h', '1-3d', '3+d'];
const barColors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];
const closedStatuses = new Set(['closed', 'technically closed', 'duplicate']);
const pageSize = 10;

const getPeriodLabel = (from, to) => {
  if (!from && !to) return 'All available tickets';
  const format = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  if (from && to) return `${format(from)} – ${format(to)}`;
  return from ? `From ${format(from)}` : `Until ${format(to)}`;
};

const filterTicketsByPeriod = (tickets, from, to) => tickets.filter((ticket) => {
  if (!from && !to) return true;
  const createdAt = ticket?.created_at || ticket?.createdTime || ticket?.createdAt;
  const createdDate = new Date(createdAt);
  if (!createdAt || Number.isNaN(createdDate.getTime())) return false;
  const start = from ? new Date(`${from}T00:00:00`) : null;
  const end = to ? new Date(`${to}T23:59:59.999`) : null;
  return (!start || createdDate >= start) && (!end || createdDate <= end);
});

function WidgetDateFilter({ tickets = [], children, onCountClick }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const safeTickets = Array.isArray(tickets) ? tickets : [];
  const filteredTickets = useMemo(() => filterTicketsByPeriod(safeTickets, from, to), [safeTickets, from, to]);

  return (
    <div className="flex flex-col h-full space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs flex-shrink-0">
        <span className={"mr-auto text-[var(--muted)] font-medium" + (onCountClick ? " cursor-pointer hover:text-indigo-600 hover:underline" : "")}
          onClick={onCountClick ? () => onCountClick(filteredTickets) : undefined}>
          {getPeriodLabel(from, to)} · {filteredTickets.length} tickets
        </span>
        <input aria-label="Widget from date" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
          className="h-8 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] px-2 text-xs text-[var(--foreground)] outline-none focus:ring-2 focus:ring-indigo-500" />
        <input aria-label="Widget to date" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
          className="h-8 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] px-2 text-xs text-[var(--foreground)] outline-none focus:ring-2 focus:ring-indigo-500" />
        {(from || to) && <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="h-8 rounded-md px-2 font-medium text-indigo-600 hover:bg-indigo-50">Clear</button>}
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        {typeof children === 'function' ? children(filteredTickets) : null}
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  'Open': '#3b82f6',
  'Closed': '#22c55e',
  'On Hold': '#f59e0b',
  'Escalated': '#ef4444',
  'In Progress': '#8b5cf6',
  'Resolved': '#10b981',
  'Technically Closed': '#22c55e',
  'Duplicate': '#6b7280',
  'On Hold by Customer': '#f59e0b',
  'Acknowledge': '#1f2937',
  'WIP': '#1f2937',
  'Re-Open': '#6366f1',
  'Revert Awaited - Customer': '#f59e0b',
  'Revert Awaited - OEM': '#f59e0b',
  'Revert Awaited - Vendor': '#f59e0b',
};

const PRIORITY_COLORS = { High: '#ef4444', Critical: '#dc2626', Medium: '#f59e0b', Low: '#22c55e', None: '#94a3b8' };

const getTicketDate = (t) => {
  if (!t) return null;
  const val = t.created_at || t.createdTime || t.createdAt || t.created_time || t.time || t.modified_time || t.closed_at || t.closedTime;
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const normalizeText = (v) => String(v || '').trim();
const getTicketNo = (t) => normalizeText(t.ticket_no) || normalizeText(t.ticketNumber) || '-';
const getCreatedAt = (t) => normalizeText(t.created_at) || normalizeText(t.createdTime) || normalizeText(t.createdAt);
const getClosedAt = (t) => normalizeText(t.closed_at) || normalizeText(t.closedTime) || normalizeText(t.closedAt) || normalizeText(t.closeTime) || normalizeText(t.closedDate);
const getCustomerResponseTime = (t) =>
  normalizeText(t.customerResponseTime) ||
  normalizeText(t.customer_response_time) ||
  normalizeText(t.customer_responseTime) ||
  normalizeText(t.responseTime) ||
  normalizeText(t.first_response_time) ||
  normalizeText(t.firstResponseTime) ||
  normalizeText(t.respondedTime) ||
  '-';

const getAssigneeName = (t) => `${normalizeText(t.assignee?.firstName)} ${normalizeText(t.assignee?.lastName)}`.trim() || 'Unassigned';
const getDeptName = (t) => normalizeText(t.department?.name) || normalizeText(t.departmentName) || 'Unknown Department';
const getContactName = (t) => `${normalizeText(t.contact?.firstName)} ${normalizeText(t.contact?.lastName)}`.trim() || normalizeText(t.contact?.email) || 'Unknown';
const isClosedTicket = (t) => closedStatuses.has(normalizeText(t.status).toLowerCase());
const getTicketKey = (t, i) => normalizeText(t.id) || normalizeText(t.ticketNumber) || normalizeText(t.ticket_no) || String(i);

const formatDateTime = (date) => {
  if (!date) return '-';
  const p = new Date(date);
  if (isNaN(p.getTime())) return '-';
  return p.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatResolutionTime = (t) => {
  const ca = getCreatedAt(t), cl = getClosedAt(t);
  const cd = new Date(ca), cld = new Date(cl);
  if (!ca || !cl || isNaN(cd.getTime()) || isNaN(cld.getTime()) || cld < cd) return '-';
  const mins = Math.round((cld - cd) / 60000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const getResolutionTimeBucket = (t) => {
  if (!isClosedTicket(t)) return null;
  const ca = getCreatedAt(t), cl = getClosedAt(t);
  const cd = new Date(ca), cld = new Date(cl);
  if (!ca || !cl || isNaN(cd.getTime()) || isNaN(cld.getTime()) || cld < cd) return null;
  const h = (cld - cd) / (1000 * 60 * 60);
  if (h < 1) return '<1h'; if (h < 4) return '1-4h'; if (h < 24) return '4-24h'; if (h < 72) return '1-3d'; return '3+d';
};

// ── TicketTracking ─────────────────────────────────────────────────────────────
function TicketTracking({ ticket }) {
  const createdTime = formatDateTime(getCreatedAt(ticket));
  const rawResponse = getCustomerResponseTime(ticket);
  const isClosed = isClosedTicket(ticket);
  const responseTime =
    rawResponse !== '-'
      ? formatDateTime(rawResponse)
      : isClosed
        ? 'Responded & Actioned'
        : ticket.status === 'In Progress'
          ? 'In Progress (Active)'
          : 'Pending Response';
  const closedTime = formatDateTime(getClosedAt(ticket));
  const hasCreated = createdTime !== '-';
  const hasResponse = rawResponse !== '-' || isClosed || ticket.status === 'In Progress';
  const hasClosed = isClosed || closedTime !== '-';
  const progress = hasClosed ? 100 : hasResponse ? 50 : hasCreated ? 15 : 0;

  const steps = [
    { label: 'Created Time', value: createdTime, complete: hasCreated },
    { label: 'Triage / Response', value: responseTime, complete: hasResponse },
    { label: 'Resolution / Closed', value: closedTime !== '-' ? closedTime : (isClosed ? 'Closed' : 'In Resolution'), complete: hasClosed },
  ];

  return (
    <div className="rounded-xl bg-[var(--muted-bg)]/60 border border-[var(--card-border)] px-4 py-4 sm:px-6 sm:py-5">
      <div className="relative mx-1 pb-1">
        <div className="absolute left-0 right-0 top-4 h-2 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="absolute left-0 top-4 h-2 rounded-full bg-indigo-600 transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
        <div className="relative grid grid-cols-3 gap-3">
          {steps.map((step, idx) => (
            <div key={step.label} className={`flex ${idx === 0 ? 'items-start' : idx === 1 ? 'items-center' : 'items-end'} flex-col`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-500 ${step.complete ? 'border-indigo-600 bg-indigo-600 text-white shadow-[0_0_0_6px_rgba(79,70,229,0.15)]' : 'border-slate-300 dark:border-slate-600 bg-[var(--card-bg)] text-slate-400'}`}>
                {step.complete ? <span className="text-sm font-bold leading-none">✓</span> : <span className="h-2 w-2 rounded-full bg-slate-400" />}
              </span>
              <div className={`mt-3 max-w-[200px] ${idx === 0 ? 'text-left' : idx === 1 ? 'text-center' : 'text-right'}`}>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{step.label}</div>
                <div className="mt-0.5 text-xs font-semibold text-[var(--foreground)]">{step.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── HoverCount ─────────────────────────────────────────────────────────────────
function HoverCount({ title, count, tickets }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const clearTimer = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const show = () => { clearTimer(); setOpen(true); };
  const hide = () => { clearTimer(); closeTimer.current = setTimeout(() => setOpen(false), 180); };
  useEffect(() => () => clearTimer(), []);

  return (
    <span className="relative inline-flex min-w-8 justify-end" onMouseEnter={show} onMouseLeave={hide}>
      <span className={count ? 'cursor-pointer font-bold text-indigo-600 dark:text-indigo-400' : 'text-[var(--muted)] font-medium'}>{count}</span>
      {open && count > 0 && (
        <div onMouseEnter={clearTimer} onMouseLeave={hide}
          className="fixed left-1/2 top-24 z-50 w-[min(92vw,780px)] -translate-x-1/2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 text-[var(--foreground)] shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--card-border)]">
            <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{title}</p>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--muted-bg)] text-[var(--muted)]">
              {tickets?.length || count} tickets
            </span>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full min-w-[700px] border-collapse text-xs">
              <thead>
                <tr className="bg-[var(--muted-bg)]">
                  {['Ticket #', 'Subject', 'Created', 'Closed', 'Turnaround', 'Assignee', 'Status'].map(h => (
                    <th key={h} className="border border-[var(--card-border)] px-3 py-2 text-left font-semibold text-[var(--muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {(tickets || []).map((t, i) => (
                  <tr key={`${getTicketNo(t)}-${t.id || i}`} className="hover:bg-[var(--muted-bg)] transition-colors">
                    <td className="border border-[var(--card-border)] px-3 py-2 font-mono font-bold text-indigo-600 dark:text-indigo-400">{getTicketNo(t)}</td>
                    <td className="border border-[var(--card-border)] px-3 py-2 max-w-[200px] truncate">{t.subject || '-'}</td>
                    <td className="border border-[var(--card-border)] px-3 py-2 whitespace-nowrap text-[var(--muted)]">{formatDateTime(getCreatedAt(t))}</td>
                    <td className="border border-[var(--card-border)] px-3 py-2 whitespace-nowrap text-[var(--muted)]">{formatDateTime(getClosedAt(t))}</td>
                    <td className="border border-[var(--card-border)] px-3 py-2 whitespace-nowrap">{formatResolutionTime(t)}</td>
                    <td className="border border-[var(--card-border)] px-3 py-2 whitespace-nowrap font-medium">{getAssigneeName(t)}</td>
                    <td className="border border-[var(--card-border)] px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{
                        backgroundColor: (STATUS_COLORS[t.status] || '#6b7280') + '22',
                        color: STATUS_COLORS[t.status] || '#6b7280',
                      }}>{t.status || '-'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </span>
  );
}

// ── TicketListCard ─────────────────────────────────────────────────────────────
function TicketListCard({ tickets, loading, onTicketClick }) {
  const [assignee, setAssignee] = useState('all');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState({});
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const assignees = useMemo(() =>
    Array.from(new Set(tickets.map(getAssigneeName))).filter(Boolean).sort((a, b) => a.localeCompare(b)), [tickets]);

  const filtered = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
    return tickets.filter(t => {
      if (assignee !== 'all' && getAssigneeName(t) !== assignee) return false;
      const ca = getCreatedAt(t); const cd = new Date(ca);
      if ((from || to) && (!ca || isNaN(cd.getTime()))) return false;
      if (from && cd < from) return false;
      if (to && cd > to) return false;
      return true;
    });
  }, [assignee, fromDate, toDate, tickets]);

  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const safePage = Math.min(page, pageCount);
  const startIndex = filtered.length ? (safePage - 1) * pageSize : 0;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const visible = filtered.slice(startIndex, endIndex);
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(p => p === 1 || p === pageCount || Math.abs(p - safePage) <= 1);
  const goTo = (p) => setPage(Math.min(Math.max(p, 1), pageCount));
  const reset = () => { setPage(1); setExpanded({}); };

  return (
    <section className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <h2 className="text-xl font-bold text-[var(--foreground)]">Ticket Details</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[620px]">
          <label className="text-sm font-medium text-[var(--foreground)]">
            <span className="mb-1 block">Assignee</span>
            <select value={assignee} onChange={e => { setAssignee(e.target.value); reset(); }}
              className="h-10 w-full rounded-md border border-[var(--card-border)] bg-[var(--muted-bg)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="all">All assignees</option>
              {assignees.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            <span className="mb-1 block">From</span>
            <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); reset(); }}
              className="h-10 w-full rounded-md border border-[var(--card-border)] bg-[var(--muted-bg)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="text-sm font-medium text-[var(--foreground)]">
            <span className="mb-1 block">To</span>
            <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); reset(); }}
              className="h-10 w-full rounded-md border border-[var(--card-border)] bg-[var(--muted-bg)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--muted-bg)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-left">
                {['Action', '#', 'Subject', 'Status', 'Priority', 'Department', 'Contact', 'Assignee', 'Created', 'Resolution Time'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {visible.map((t, i) => {
                const key = getTicketKey(t, i);
                const isExp = !!expanded[key];
                return (
                  <Fragment key={key}>
                    <tr className={`transition-colors ${isExp ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : 'hover:bg-[var(--card-bg)]'}`}>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(p => ({ ...p, [key]: !p[key] }));
                          }}
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${isExp
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800'
                            }`}
                        >
                          {isExp ? '▲ Hide' : '▼ Track'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">{getTicketNo(t)}</td>
                      <td className="px-4 py-3 font-medium text-[var(--foreground)] max-w-xs truncate" title={t.subject}>{t.subject || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                          backgroundColor: (STATUS_COLORS[t.status] || '#6b7280') + '22',
                          color: STATUS_COLORS[t.status] || '#6b7280',
                        }}>{t.status || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                          backgroundColor: (PRIORITY_COLORS[t.priority] || '#6b7280') + '22',
                          color: PRIORITY_COLORS[t.priority] || '#6b7280',
                        }}>{t.priority || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-[var(--foreground)] whitespace-nowrap">{getDeptName(t)}</td>
                      <td className="px-4 py-3 text-[var(--foreground)] whitespace-nowrap">{getContactName(t)}</td>
                      <td className="px-4 py-3 text-[var(--foreground)] whitespace-nowrap">{getAssigneeName(t)}</td>
                      <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">{formatDateTime(getCreatedAt(t))}</td>
                      <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap font-medium">{formatResolutionTime(t)}</td>
                    </tr>

                    {/* Expanded Track View */}
                    {isExp && (
                      <tr className="bg-indigo-50/20 dark:bg-indigo-950/10 border-b border-[var(--card-border)]">
                        <td colSpan={10} className="p-3.5 sm:p-5">
                          <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-[var(--card-bg)] p-4 sm:p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
                                <span className="font-bold text-sm text-[var(--foreground)]">
                                  Lifecycle Tracking Timeline for Ticket #{getTicketNo(t)}
                                </span>
                              </div>
                              {onTicketClick && (
                                <button
                                  type="button"
                                  onClick={() => onTicketClick(t)}
                                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:underline cursor-pointer"
                                >
                                  Open In-Depth Detail →
                                </button>
                              )}
                            </div>

                            {/* Timeline Stepper */}
                            <TicketTracking ticket={t} />

                            {/* Ticket Details Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
                              <div className="p-3 rounded-xl bg-[var(--muted-bg)] border border-[var(--card-border)]">
                                <span className="text-[var(--muted)] block font-medium">Department &amp; Requester</span>
                                <span className="font-bold text-[var(--foreground)] mt-0.5 block">{getDeptName(t)}</span>
                                <span className="text-[var(--muted)]">{getContactName(t)}</span>
                              </div>
                              <div className="p-3 rounded-xl bg-[var(--muted-bg)] border border-[var(--card-border)]">
                                <span className="text-[var(--muted)] block font-medium">Assigned Engineer</span>
                                <span className="font-bold text-[var(--foreground)] mt-0.5 block">{getAssigneeName(t)}</span>
                                <span className="text-[var(--muted)]">Priority: {t.priority || 'Normal'}</span>
                              </div>
                              <div className="p-3 rounded-xl bg-[var(--muted-bg)] border border-[var(--card-border)]">
                                <span className="text-[var(--muted)] block font-medium">Resolution Turnaround</span>
                                <span className="font-bold text-[var(--foreground)] mt-0.5 block">{formatResolutionTime(t)}</span>
                                <span className="text-[var(--muted)]">Status: {t.status || 'Open'}</span>
                              </div>
                              <div className="p-3 rounded-xl bg-[var(--muted-bg)] border border-[var(--card-border)]">
                                <span className="text-[var(--muted)] block font-medium">Timestamps</span>
                                <span className="font-bold text-[var(--foreground)] mt-0.5 block">Created: {formatDateTime(getCreatedAt(t))}</span>
                                <span className="text-[var(--muted)]">Closed: {formatDateTime(getClosedAt(t))}</span>
                              </div>
                            </div>

                            {t.description && (
                              <div className="p-3 rounded-xl bg-[var(--muted-bg)]/60 border border-[var(--card-border)] text-xs">
                                <span className="font-bold text-[var(--foreground)] block mb-1">Ticket Description:</span>
                                <p className="text-[var(--muted)] whitespace-pre-wrap line-clamp-3">{t.description}</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!visible.length && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-sm text-[var(--muted)]">
                    {loading ? 'Loading tickets...' : 'No tickets match the selected filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--card-border)] px-4 py-3">
          <p className="text-xs text-[var(--muted)]">
            Showing {filtered.length ? startIndex + 1 : 0} to {endIndex} of {filtered.length} tickets
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => goTo(safePage - 1)} disabled={safePage <= 1}
              className="rounded px-2 py-1 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card-bg)] disabled:opacity-50">
              Prev
            </button>
            {pages.map((p, idx) => (
              <button key={idx} type="button" onClick={() => goTo(p)}
                className={`rounded px-2.5 py-1 text-xs font-semibold ${p === safePage ? 'bg-indigo-600 text-white' : 'text-[var(--foreground)] hover:bg-[var(--card-bg)]'}`}>
                {p}
              </button>
            ))}
            <button type="button" onClick={() => goTo(safePage + 1)} disabled={safePage >= pageCount}
              className="rounded px-2 py-1 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--card-bg)] disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── TicketTrendWidget ─────────────────────────────────────────────────────────
function TicketTrendWidget({ tickets, activeDay = 'Mon', setActiveDay, onBarClick }) {
  const currentDay = activeDay || 'Mon';

  const trend = useMemo(() => {
    const grouped = weekdays.map(day => ({ day, tickets: [] }));
    tickets.forEach(t => {
      const ca = getCreatedAt(t); const d = new Date(ca);
      if (!ca || isNaN(d.getTime())) return;
      const idx = (d.getDay() + 6) % 7;
      grouped[idx].tickets.push(t);
    });
    return grouped;
  }, [tickets]);

  const maxCount = Math.max(...trend.map(r => r.tickets.length), 1);
  const activeTrendRow = trend.find(r => r.day === currentDay);
  const totalWeekTickets = useMemo(() => trend.reduce((s, r) => s + r.tickets.length, 0), [trend]);

  return (
    <div className="w-full h-full min-h-[380px] rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm p-5 sm:p-6 flex flex-col justify-between overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">Ticket Trend</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Daily ticket volume distribution across weekdays</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
          {totalWeekTickets} Total
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-end min-h-0 py-2">
        <div className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--muted-bg)] p-4 sm:p-5 flex-1 flex flex-col justify-end">
          <div className="w-full flex items-end justify-between gap-2 sm:gap-4 h-44 pt-3">
            {trend.map((row, idx) => {
              const count = row.tickets.length;
              const heightPct = Math.max((count / maxCount) * 100, count > 0 ? 8 : 3);
              const isSel = currentDay === row.day;
              return (
                <div key={row.day} className="flex-1 flex flex-col items-center justify-end h-full group">
                  {/* Count Button / Badge */}
                  <button
                    type="button"
                    onClick={() => {
                      if (setActiveDay) setActiveDay(row.day);
                      if (onBarClick && count > 0) onBarClick(row.day);
                    }}
                    className={`mb-2 px-2 py-0.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      isSel
                        ? 'bg-indigo-600 text-white shadow-md scale-105 ring-2 ring-indigo-400/50'
                        : count > 0
                        ? 'text-[var(--foreground)] bg-[var(--card-bg)] hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 border border-[var(--card-border)]'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    {count}
                  </button>

                  {/* Bar Track & Fill */}
                  <div
                    className="w-full max-w-[42px] bg-slate-200/50 dark:bg-slate-800/60 rounded-t-lg relative flex items-end overflow-hidden cursor-pointer transition-all duration-300 group-hover:brightness-110"
                    style={{ height: '100%' }}
                    onClick={() => {
                      if (setActiveDay) setActiveDay(row.day);
                      if (onBarClick && count > 0) onBarClick(row.day);
                    }}
                  >
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 ease-out ${
                        isSel
                          ? 'ring-2 ring-indigo-400 ring-inset brightness-110'
                          : ''
                      }`}
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: barColors[idx % barColors.length],
                      }}
                    />
                  </div>

                  {/* Day Label */}
                  <div
                    className={`mt-2 text-xs font-semibold transition-colors ${
                      isSel ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-[var(--muted)]'
                    }`}
                  >
                    {row.day}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="flex justify-between items-center pt-3 border-t border-[var(--card-border)] text-xs text-[var(--muted)] flex-shrink-0">
        <span className="font-medium">
          Selected: <strong className="text-[var(--foreground)]">{activeTrendRow?.day || 'Mon'}</strong> ({activeTrendRow?.tickets.length || 0} tickets)
        </span>
        <button
          type="button"
          onClick={() => {
            if (activeTrendRow && onBarClick && activeTrendRow.tickets.length > 0) {
              onBarClick(activeTrendRow.day);
            }
          }}
          disabled={!activeTrendRow || activeTrendRow.tickets.length === 0}
          className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold disabled:opacity-40 disabled:no-underline cursor-pointer"
        >
          View {activeTrendRow?.day || 'Mon'} Tickets →
        </button>
      </div>
    </div>
  );
}

// ── EngineerPerformanceWidget ──────────────────────────────────────────────────
function EngineerPerformanceWidget({ tickets, loading, onEngineerClick }) {
  const engPerf = useMemo(() => {
    const grouped = {};
    tickets.forEach(t => {
      const eng = getAssigneeName(t);
      if (eng === 'Unassigned') return;
      if (!grouped[eng]) grouped[eng] = { engineer: eng, open: [], closed: [] };
      isClosedTicket(t) ? grouped[eng].closed.push(t) : grouped[eng].open.push(t);
    });
    return Object.values(grouped).sort((a, b) => (b.closed.length - a.closed.length) || a.engineer.localeCompare(b.engineer));
  }, [tickets]);

  const totalEngineers = engPerf.length;

  return (
    <div className="w-full h-full min-h-[380px] rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm p-5 sm:p-6 flex flex-col justify-between overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">Engineer Performance</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Open vs closed tickets distribution per engineer</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
          {totalEngineers} Engineers
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5">
        <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--muted-bg)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--card-bg)]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)]">Engineer</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-blue-500">Open</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-emerald-500">Closed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {engPerf.map((row, idx) => (
                <tr
                  key={row.engineer}
                  onClick={() => onEngineerClick && onEngineerClick(row.engineer)}
                  className="cursor-pointer hover:bg-[var(--card-bg)]/80 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-xs text-[var(--foreground)] truncate max-w-[160px]" title={row.engineer}>
                        {row.engineer}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">
                      <HoverCount title={`${row.engineer} Open tickets`} count={row.open.length} tickets={row.open} />
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                      <HoverCount title={`${row.engineer} Closed tickets`} count={row.closed.length} tickets={row.closed} />
                    </span>
                  </td>
                </tr>
              ))}
              {!engPerf.length && (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-sm text-[var(--muted)]">
                    {loading ? 'Loading engineers...' : 'No tickets found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between items-center pt-3 border-t border-[var(--card-border)] text-xs text-[var(--muted)] flex-shrink-0">
        <span className="font-medium">Total Open: {engPerf.reduce((s, r) => s + r.open.length, 0)}</span>
        <span className="font-medium">Total Closed: {engPerf.reduce((s, r) => s + r.closed.length, 0)}</span>
      </div>
    </div>
  );
}

// ── ResolutionHeatmapWidget ────────────────────────────────────────────────────
function ResolutionHeatmapWidget({ tickets, loading, onCellClick }) {
  const agingMatrix = useMemo(() => {
    const grouped = {};
    tickets.forEach(t => {
      const dept = getDeptName(t);
      const bucket = getResolutionTimeBucket(t);
      if (!bucket) return;
      if (!grouped[dept]) { grouped[dept] = {}; agingBuckets.forEach(b => { grouped[dept][b] = []; }); }
      grouped[dept][bucket].push(t);
    });
    return Object.entries(grouped).map(([dept, buckets]) => ({ department: dept, buckets }))
      .sort((a, b) => {
        const aT = agingBuckets.reduce((s, bucket) => s + a.buckets[bucket].length, 0);
        const bT = agingBuckets.reduce((s, bucket) => s + b.buckets[bucket].length, 0);
        return bT - aT || a.department.localeCompare(b.department);
      });
  }, [tickets]);

  const maxAging = Math.max(...agingMatrix.flatMap(r => agingBuckets.map(b => r.buckets[b].length)), 1);
  const totalResolved = useMemo(
    () => agingMatrix.reduce((sum, r) => sum + agingBuckets.reduce((s, b) => s + r.buckets[b].length, 0), 0),
    [agingMatrix]
  );

  return (
    <div className="w-full h-full min-h-[380px] rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm p-5 sm:p-6 flex flex-col justify-between overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">Department Based Resolution Time Heatmap</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Ticket resolution turnaround matrix across departments</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
          {totalResolved} Resolved
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--muted-bg)] p-3 sm:p-4">
          {agingMatrix.length ? (
            <div className="space-y-3">
              <div className="grid grid-cols-[minmax(100px,1.2fr)_repeat(5,minmax(48px,1fr))] gap-2 text-xs font-semibold text-[var(--muted)] select-none">
                <div>Department</div>
                {agingBuckets.map(b => <div key={b} className="text-center">{b}</div>)}
              </div>
              {agingMatrix.map(row => (
                <div key={row.department} className="grid grid-cols-[minmax(100px,1.2fr)_repeat(5,minmax(48px,1fr))] gap-2 items-center">
                  <div className="flex items-center rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] px-2.5 py-2 text-xs font-semibold text-[var(--foreground)] truncate" title={row.department}>
                    {row.department}
                  </div>
                  {agingBuckets.map(b => {
                    const bt = row.buckets[b];
                    const cnt = bt.length;
                    const intensity = cnt / maxAging;
                    return (
                      <div
                        key={b}
                        className={`rounded-lg border border-[var(--card-border)] py-2 px-1 text-center transition-all ${
                          cnt > 0 ? 'cursor-pointer hover:scale-105 hover:shadow-md' : 'opacity-60'
                        }`}
                        style={{
                          backgroundColor: cnt ? `rgba(99, 102, 241, ${0.15 + intensity * 0.55})` : 'var(--card-bg)',
                        }}
                        onClick={() => { if (cnt > 0 && onCellClick) onCellClick(row.department, b); }}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {cnt > 0 && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />}
                          <HoverCount title={`${row.department} • ${b} (${cnt} tickets)`} count={cnt} tickets={bt} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-[var(--muted)]">
              {loading ? 'Loading resolution matrix...' : 'No closed tickets found'}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center pt-3 border-t border-[var(--card-border)] text-xs text-[var(--muted)] flex-shrink-0">
        <span className="font-medium">Resolution Intensity</span>
        <div className="flex items-center gap-1.5">
          <span>Faster (&lt;1h)</span>
          {['rgba(99,102,241,0.15)', 'rgba(99,102,241,0.35)', 'rgba(99,102,241,0.55)', 'rgba(99,102,241,0.75)'].map((c, i) => (
            <div key={i} className="w-3.5 h-3.5 rounded-[3px]" style={{ backgroundColor: c }} />
          ))}
          <span>Slower (3d+)</span>
        </div>
      </div>
    </div>
  );
}

// ── MonthlyVolumeWidget ────────────────────────────────────────────────────────
function MonthlyVolumeWidget({ tickets, loading, onCellClick }) {
  const monthMatrix = useMemo(() => {
    const monthMap = new Map(); const deptMap = {};
    tickets.forEach(t => {
      const ca = getCreatedAt(t); const d = new Date(ca);
      if (!ca || isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short' });
      const dept = getDeptName(t);
      monthMap.set(key, label);
      if (!deptMap[dept]) deptMap[dept] = {};
      if (!deptMap[dept][key]) deptMap[dept][key] = [];
      deptMap[dept][key].push(t);
    });
    const months = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-5).map(([key, label]) => ({ key, label }));
    const rows = Object.entries(deptMap).map(([dept, mt]) => ({ department: dept, monthTickets: mt }))
      .sort((a, b) => {
        const aT = months.reduce((s, m) => s + (a.monthTickets[m.key]?.length || 0), 0);
        const bT = months.reduce((s, m) => s + (b.monthTickets[m.key]?.length || 0), 0);
        return bT - aT || a.department.localeCompare(b.department);
      });
    return { months, rows };
  }, [tickets]);

  const maxMonth = Math.max(...monthMatrix.rows.flatMap(r => monthMatrix.months.map(m => r.monthTickets[m.key]?.length || 0)), 1);
  const totalVolume = useMemo(
    () => monthMatrix.rows.reduce((sum, r) => sum + monthMatrix.months.reduce((s, m) => s + (r.monthTickets[m.key]?.length || 0), 0), 0),
    [monthMatrix]
  );

  return (
    <div className="w-full h-full min-h-[380px] rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm p-5 sm:p-6 flex flex-col justify-between overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">Department Based Monthly Ticket Volume</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Monthly ticket creation volume across departments</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800">
          {totalVolume} Tickets
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--muted-bg)] p-3 sm:p-4">
          {monthMatrix.rows.length ? (
            <div className="space-y-3">
              <div
                className="grid gap-2 text-xs font-semibold text-[var(--muted)] select-none"
                style={{
                  gridTemplateColumns: `minmax(120px, 1.4fr) repeat(${Math.max(monthMatrix.months.length, 1)}, minmax(60px, 1fr))`,
                }}
              >
                <div>Department</div>
                {monthMatrix.months.map(m => <div key={m.key} className="text-center">{m.label}</div>)}
              </div>
              {monthMatrix.rows.map(row => (
                <div
                  key={row.department}
                  className="grid gap-2 items-center"
                  style={{
                    gridTemplateColumns: `minmax(120px, 1.4fr) repeat(${Math.max(monthMatrix.months.length, 1)}, minmax(60px, 1fr))`,
                  }}
                >
                  <div className="flex items-center rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] px-2.5 py-2 text-xs font-semibold text-[var(--foreground)] truncate" title={row.department}>
                    {row.department}
                  </div>
                  {monthMatrix.months.map(m => {
                    const mt = row.monthTickets[m.key] || [];
                    const cnt = mt.length;
                    const intensity = cnt / maxMonth;
                    return (
                      <div
                        key={m.key}
                        className={`rounded-lg border border-[var(--card-border)] py-2 px-1 text-center transition-all ${
                          cnt > 0 ? 'cursor-pointer hover:scale-105 hover:shadow-md' : 'opacity-60'
                        }`}
                        style={{
                          backgroundColor: cnt ? `rgba(8, 145, 178, ${0.15 + intensity * 0.55})` : 'var(--card-bg)',
                        }}
                        onClick={() => { if (cnt > 0 && onCellClick) onCellClick(row.department, m.label); }}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {cnt > 0 && <span className="h-1.5 w-1.5 rounded-full bg-cyan-600" />}
                          <HoverCount title={`${row.department} • ${m.label} (${cnt} tickets)`} count={cnt} tickets={mt} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-[var(--muted)]">
              {loading ? 'Loading monthly volume...' : 'No tickets found'}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center pt-3 border-t border-[var(--card-border)] text-xs text-[var(--muted)] flex-shrink-0">
        <span className="font-medium">Volume Intensity</span>
        <div className="flex items-center gap-1.5">
          <span>Lower</span>
          {['rgba(8,145,178,0.15)', 'rgba(8,145,178,0.35)', 'rgba(8,145,178,0.55)', 'rgba(8,145,178,0.75)'].map((c, i) => (
            <div key={i} className="w-3.5 h-3.5 rounded-[3px]" style={{ backgroundColor: c }} />
          ))}
          <span>Higher</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Zohoone() {
  const navigate = useNavigate();
  const { selectedProviders } = useProviders();
  const activeTool = selectedProviders.ticketing || 'Zoho Desk';

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeDay, setActiveDay] = useState('Mon');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [lastSynced, setLastSynced] = useState(null);
  const [info, setInfo] = useState('');
  const [overviewPage, setOverviewPage] = useState(1);
  const overviewPageSize = 10;

  // Days filter and view selectors
  const [statusDays, setStatusDays] = useState(30);
  const [priorityDays, setPriorityDays] = useState(30);
  const [departmentDays, setDepartmentDays] = useState(30);
  const [statusView, setStatusView] = useViewState('zoho:statusView', 'donut');
  const [priorityView, setPriorityView] = useViewState('zoho:priorityView', 'column');
  const [departmentView, setDepartmentView] = useViewState('zoho:deptView', 'bar');

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.get('/zoho/tickets-db');
      setTickets(r.data.responseData || []);
      setLastSynced(r.data.lastSyncedAt || null);
    } catch (e) {
      setError(
        e.response?.data?.message ||
        e.response?.data?.error ||
        'Failed to load tickets'
      );
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Reset overview table page when search changes
  useEffect(() => {
    setOverviewPage(1);
  }, [search]);

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    setInfo('');
    try {
      const r = await api.post('/zoho/credentials-sync');
      if (r.data.stale && !r.data.success) {
        setError(r.data.message || 'Sync failed — no cached data available either');
      } else if (r.data.stale) {
        setInfo(r.data.message);
      }
      fetchTickets();
    } catch (e) {
      setError(e.response?.data?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Helper to navigate to the detail view with Zoho ticket data
  const goToDetail = useCallback((filterId, value, title, overrideRows) => {
    navigate('/zoho/detail', {
      state: { dataset: 'zoho', filterId, value, title, rows: overrideRows || tickets },
    });
  }, [navigate, tickets]);

  const refDate = useMemo(() => {
    const now = new Date();
    if (!tickets || tickets.length === 0) return now;
    const dates = tickets.map(getTicketDate).filter(Boolean);
    if (dates.length === 0) return now;
    const latestMs = Math.max(...dates.map((d) => d.getTime()));
    if (Math.abs(now.getTime() - latestMs) < 90 * 86400000 && latestMs <= now.getTime()) {
      return now;
    }
    const anchor = new Date(latestMs);
    anchor.setHours(23, 59, 59, 999);
    return anchor;
  }, [tickets]);

  // Filtered data by days using adaptive withinRange
  const filteredStatusTickets = useMemo(() => {
    if (!tickets || tickets.length === 0) return [];
    if (statusDays === 'all') return tickets;
    return withinRange(tickets, getTicketDate, statusDays, refDate);
  }, [tickets, statusDays, refDate]);

  const filteredPriorityTickets = useMemo(() => {
    if (!tickets || tickets.length === 0) return [];
    if (priorityDays === 'all') return tickets;
    return withinRange(tickets, getTicketDate, priorityDays, refDate);
  }, [tickets, priorityDays, refDate]);

  const filteredDepartmentTickets = useMemo(() => {
    if (!tickets || tickets.length === 0) return [];
    if (departmentDays === 'all') return tickets;
    return withinRange(tickets, getTicketDate, departmentDays, refDate);
  }, [tickets, departmentDays, refDate]);

  // Filtered chart data
  const filteredStatusCounts = useMemo(() => {
    const source = filteredStatusTickets.length > 0 ? filteredStatusTickets : (statusDays === 'all' ? tickets : []);
    return Object.entries(
      source.reduce((acc, t) => {
        const s = t.status || 'Unknown';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || '#6366f1' })).sort((a, b) => b.value - a.value);
  }, [filteredStatusTickets, tickets, statusDays]);

  const filteredPriorityCounts = useMemo(() => {
    const source = filteredPriorityTickets.length > 0 ? filteredPriorityTickets : (priorityDays === 'all' ? tickets : []);
    return Object.entries(
      source.reduce((acc, t) => {
        const p = t.priority || 'Unknown';
        acc[p] = (acc[p] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value, fill: PRIORITY_COLORS[name] || '#ef4444' }));
  }, [filteredPriorityTickets, tickets, priorityDays]);

  const filteredDepartmentCounts = useMemo(() => {
    const source = filteredDepartmentTickets.length > 0 ? filteredDepartmentTickets : (departmentDays === 'all' ? tickets : []);
    return Object.entries(
      source.reduce((acc, t) => {
        const d = getDeptName(t);
        acc[d] = (acc[d] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, value], i) => ({
      name,
      value,
      fill: ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'][i % 8],
    })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredDepartmentTickets, tickets, departmentDays]);

  // Category time series data for line & area views
  const statusTimeSeriesData = useMemo(() => {
    const source = filteredStatusTickets.length > 0 ? filteredStatusTickets : tickets;
    if (!source || source.length === 0) return null;
    return categoryTimeSeries(source, {
      keyOf: (t) => t.status || 'Unknown',
      dateOf: getTicketDate,
      days: statusDays === 'all' ? 30 : statusDays,
      refDate,
      colorMap: STATUS_COLORS,
    });
  }, [filteredStatusTickets, tickets, statusDays, refDate]);

  const priorityTimeSeriesData = useMemo(() => {
    const source = filteredPriorityTickets.length > 0 ? filteredPriorityTickets : tickets;
    if (!source || source.length === 0) return null;
    return categoryTimeSeries(source, {
      keyOf: (t) => t.priority || 'Unknown',
      dateOf: getTicketDate,
      days: priorityDays === 'all' ? 30 : priorityDays,
      refDate,
      colorMap: PRIORITY_COLORS,
    });
  }, [filteredPriorityTickets, tickets, priorityDays, refDate]);

  const departmentTimeSeriesData = useMemo(() => {
    const source = filteredDepartmentTickets.length > 0 ? filteredDepartmentTickets : tickets;
    if (!source || source.length === 0) return null;
    return categoryTimeSeries(source, {
      keyOf: (t) => getDeptName(t),
      dateOf: getTicketDate,
      days: departmentDays === 'all' ? 30 : departmentDays,
      refDate,
      topN: 8,
    });
  }, [filteredDepartmentTickets, tickets, departmentDays, refDate]);

  const closedStats = useMemo(() => {
    let currentMonthClosed = 0;
    let previousMonthClosed = 0;
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    tickets.forEach((t) => {
      const s = String(t.status || '').trim().toLowerCase();
      if (s === 'closed' || s === 'technically closed' || s === 'resolved' || s === 'duplicate') {
        const val = t.closedTime || t.closed_at || t.closedAt || t.closeTime || t.closedDate || '';
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          if (d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()) {
            currentMonthClosed++;
          }
          if (d.getMonth() === previousMonth.getMonth() && d.getFullYear() === previousMonth.getFullYear()) {
            previousMonthClosed++;
          }
        }
      }
    });

    const diff = currentMonthClosed - previousMonthClosed;
    const pct = previousMonthClosed > 0 ? (diff / previousMonthClosed) * 100 : currentMonthClosed > 0 ? 100 : 0;
    const currentMonthName = currentMonth.toLocaleString('en-IN', { month: 'short' });
    const previousMonthName = previousMonth.toLocaleString('en-IN', { month: 'short' });

    return {
      currentMonthClosed,
      previousMonthClosed,
      diff,
      pct,
      currentMonthName,
      previousMonthName,
    };
  }, [tickets]);

  const overviewFiltered = useMemo(() => tickets.filter(t =>
    !search ||
    (t.subject || '').toLowerCase().includes(search.toLowerCase()) ||
    getContactName(t).toLowerCase().includes(search.toLowerCase()) ||
    getDeptName(t).toLowerCase().includes(search.toLowerCase())
  ), [tickets, search]);

  // ── Overview table pagination ────────────────────────────────────────────────
  const overviewPageCount = Math.max(Math.ceil(overviewFiltered.length / overviewPageSize), 1);
  const overviewSafePage = Math.min(overviewPage, overviewPageCount);
  const overviewStartIndex = overviewFiltered.length ? (overviewSafePage - 1) * overviewPageSize : 0;
  const overviewEndIndex = Math.min(overviewStartIndex + overviewPageSize, overviewFiltered.length);
  const overviewVisible = overviewFiltered.slice(overviewStartIndex, overviewEndIndex);
  const overviewPages = Array.from({ length: overviewPageCount }, (_, i) => i + 1)
    .filter(p => p === 1 || p === overviewPageCount || Math.abs(p - overviewSafePage) <= 1);
  const goToOverviewPage = (p) => setOverviewPage(Math.min(Math.max(p, 1), overviewPageCount));

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* ── Overview ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-0.5">Support</p>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{activeTool}</h1>
          {lastSynced && !loading && (
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Last synced {timeAgo(lastSynced)} &mdash; {tickets.length} tickets
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchTickets} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] disabled:opacity-50 transition-colors cursor-pointer">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button onClick={handleSync} disabled={syncing || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors cursor-pointer">
            {syncing
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Syncing…</>
              : 'Sync from Zoho'
            }
          </button>
          <AnalyticsLaunchButton moduleKey="zoho-one" />
        </div>
      </div>

      {info && (
        <div className="px-4 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-sm text-indigo-700 dark:text-indigo-400">
          {info}
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <span className="font-semibold">Error:</span> {error}
        </div>
      )}

      {/* 6 Metric KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          {
            label: 'Total',
            value: tickets.length,
            color: '#6366f1',
            filterId: 'zohoAll',
            filterValue: 'all',
            title: 'All Zoho Tickets',
          },
          {
            label: 'Open',
            value: tickets.filter((t) => t.status === 'Open' || t.status === 'Re-Open').length,
            color: '#3b82f6',
            filterId: 'zohoOpen',
            filterValue: 'Open',
            title: 'Open Zoho Tickets',
          },
          {
            label: 'WIP / In Progress',
            value: tickets.filter((t) => ['wip', 'in progress', 'in-progress'].includes(String(t.status || '').toLowerCase())).length,
            color: '#8b5cf6',
            filterId: 'zohoStatus',
            filterValue: 'In Progress',
            title: 'In Progress Zoho Tickets',
          },
          {
            label: 'High Priority',
            value: tickets.filter((t) => t.priority === 'High' || t.priority === 'Critical').length,
            color: '#ef4444',
            filterId: 'zohoHighPriority',
            filterValue: 'High',
            title: 'High Priority Zoho Tickets',
          },
          {
            label: 'On Hold',
            value: tickets.filter((t) => String(t.status || '').toLowerCase().includes('hold') || String(t.status || '').toLowerCase().includes('revert')).length,
            color: '#f59e0b',
            filterId: 'zohoStatusGroup',
            filterValue: 'On Hold',
            title: 'On Hold Zoho Tickets',
          },
          {
            label: 'Closed',
            value: tickets.filter((t) => ['closed', 'technically closed', 'resolved', 'duplicate'].includes(String(t.status || '').toLowerCase())).length,
            color: '#22c55e',
            filterId: 'zohoClosed',
            filterValue: 'Closed',
            title: 'Closed Zoho Tickets',
            isClosedCard: true,
          },
        ].map((s) => {
          const isIncrease = closedStats.diff > 0;
          const isDecrease = closedStats.diff < 0;
          return (
            <div
              key={s.label}
              onClick={() => goToDetail(s.filterId, s.filterValue, s.title)}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 sm:p-5 cursor-pointer hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden"
            >
              <div className="flex items-start justify-between gap-1 mb-1.5">
                <p className="text-xs font-semibold text-[var(--muted)]">{s.label}</p>
                {s.isClosedCard && (
                  <div className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isIncrease ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : isDecrease ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                    <span>{isIncrease ? '↑' : isDecrease ? '↓' : '→'}</span>
                    <span>{Math.abs(closedStats.diff)}</span>
                    <span>({Math.abs(closedStats.pct).toFixed(1)}%)</span>
                  </div>
                )}
              </div>
              <p className="text-3xl font-bold" style={{ color: s.color }}>
                {loading ? '—' : s.value}
              </p>
              {s.isClosedCard && (
                <div className="mt-2 text-[10px] font-medium text-[var(--muted)]">
                  {closedStats.currentMonthName}: {closedStats.currentMonthClosed} | {closedStats.previousMonthName}: {closedStats.previousMonthClosed}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 flex flex-col justify-between shadow-sm">
          <div>
            <h3 className="font-semibold text-[var(--foreground)] mb-1">Ticketing Health Score</h3>
            <p className="text-xs text-[var(--muted)] mb-4">Service desk MTTR &amp; SLA posture</p>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <Ticketingmttr tickets={tickets} loading={loading} />
          </div>
        </div>

        {/* 1. By Status */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-[var(--foreground)]">By Status</h3>
              <p className="text-xs text-[var(--muted)]">{filteredStatusCounts.reduce((s, d) => s + d.value, 0)} tickets</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <DaysFilter value={statusDays} onChange={setStatusDays} compact />
              <ChartViewDropdown value={statusView} onChange={setStatusView} />
            </div>
          </div>
          <div className="flex-1 min-h-[260px]">
            <MultiViewChart
              data={filteredStatusCounts}
              view={statusView}
              viewType={statusView}
              timeSeriesData={statusTimeSeriesData}
              storageKey="zoho-status-view"
              onSliceClick={(data) => goToDetail('zohoStatus', data.name, `Zoho Tickets with "${data.name}" status`)}
              onItemClick={(data) => goToDetail('zohoStatus', data.name, `Zoho Tickets with "${data.name}" status`)}
              barColor="#3b82f6"
            />
          </div>
        </div>

        {/* 2. By Priority */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-[var(--foreground)]">By Priority</h3>
              <p className="text-xs text-[var(--muted)]">{filteredPriorityCounts.reduce((s, d) => s + d.value, 0)} tickets</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <DaysFilter value={priorityDays} onChange={setPriorityDays} compact />
              <ChartViewDropdown value={priorityView} onChange={setPriorityView} />
            </div>
          </div>
          <div className="flex-1 min-h-[260px]">
            <MultiViewChart
              data={filteredPriorityCounts}
              view={priorityView}
              viewType={priorityView}
              timeSeriesData={priorityTimeSeriesData}
              storageKey="zoho-priority-view"
              onSliceClick={(data) => goToDetail('zohoPriority', data.name, `Zoho Tickets with "${data.name}" priority`)}
              onItemClick={(data) => goToDetail('zohoPriority', data.name, `Zoho Tickets with "${data.name}" priority`)}
              barColor="#ef4444"
            />
          </div>
        </div>

        {/* 3. By Department */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 flex flex-col justify-between shadow-sm lg:col-span-3 xl:col-span-1">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-[var(--foreground)]">By Department</h3>
              <p className="text-xs text-[var(--muted)]">{filteredDepartmentCounts.reduce((s, d) => s + d.value, 0)} tickets</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <DaysFilter value={departmentDays} onChange={setDepartmentDays} compact />
              <ChartViewDropdown value={departmentView} onChange={setDepartmentView} />
            </div>
          </div>
          <div className="flex-1 min-h-[260px]">
            <MultiViewChart
              data={filteredDepartmentCounts}
              view={departmentView}
              viewType={departmentView}
              timeSeriesData={departmentTimeSeriesData}
              storageKey="zoho-department-view"
              onSliceClick={(data) => goToDetail('zohoDepartment', data.name, `Zoho Tickets in "${data.name}" department`)}
              onItemClick={(data) => goToDetail('zohoDepartment', data.name, `Zoho Tickets in "${data.name}" department`)}
              barColor="#6366f1"
            />
          </div>
        </div>
      </div>

      {/* ── Analytics ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Zoho One</h1>
          <p className="text-sm text-[var(--muted)]">Ticket analytics from stored Zoho data.</p>
        </div>
        <div className="text-sm text-[var(--muted)]">{loading ? 'Loading tickets...' : `${tickets.length} tickets`}</div>
      </div>

      <TicketListCard tickets={tickets} loading={loading}
        onTicketClick={(t) => goToDetail('zohoTicketNo', getTicketNo(t), `Zoho Ticket ${getTicketNo(t)}`)} />
      <WidgetDateFilter tickets={tickets}>{filtered => <TicketVolcanoGraph tickets={filtered} onBarClick={(label, min, max) => {
        var getCr = function (t) { return t?.createdTime || t?.created_at || t?.createdAt || ''; };
        var getCl = function (t) { return t?.closedTime || t?.closed_at || t?.closedAt || t?.closeTime || ''; };
        var pre = tickets.filter(function (t) {
          var ca = getCr(t); var cd = new Date(ca); if (!ca || isNaN(cd.getTime())) return false;
          var cl = getCl(t); var closedDate = new Date(cl);
          var closedStatuses = ['closed', 'technically closed', 'duplicate'];
          var isClosed = closedStatuses.indexOf(String(t.status || '').trim().toLowerCase()) !== -1;
          if (!isClosed) return false;
          if (!cl || isNaN(closedDate.getTime())) return false;
          var hours = (closedDate.getTime() - cd.getTime()) / (1000 * 60 * 60);
          return hours >= min && hours < max;
        });
        goToDetail('zohoAll', 'all', 'Zoho Tickets - ' + label + ' Resolution', pre);
      }} />}</WidgetDateFilter>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-stretch">
        <WidgetDateFilter tickets={tickets}>{filtered => <Circlemember tickets={filtered} onCircleClick={(name, dept) => {
          goToDetail('zohoAssignee', name, 'Zoho Tickets by ' + name + ' (' + dept + ')');
        }} />}</WidgetDateFilter>
        <WidgetDateFilter tickets={tickets}>{filtered => <Mttrcard tickets={filtered} onCardClick={() => {
          goToDetail('zohoAll', 'all', 'All Zoho Tickets');
        }} />}</WidgetDateFilter>
        <WidgetDateFilter tickets={tickets}>{filtered => <Topperformance tickets={filtered} onRowClick={(name) => {
          goToDetail('zohoAssignee', name, 'Zoho Tickets by ' + name);
        }} />}</WidgetDateFilter>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <WidgetDateFilter tickets={tickets}>{filtered => <Funneldiagram tickets={filtered} loading={loading}
          onSliceClick={(slice) => goToDetail('zohoStatusGroup', slice.status, 'Zoho Tickets - ' + slice.status)} />}</WidgetDateFilter>
        <WidgetDateFilter tickets={tickets}>{filtered => <Hourbasedset tickets={filtered}
          onCellClick={(day, hour) => {
            const getCr = (t) => t?.createdTime || t?.created_at || t?.createdAt;
            const dayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(day);
            const pre = tickets.filter(t => {
              const ca = getCr(t);
              const d = new Date(ca);
              if (!ca || isNaN(d.getTime())) return false;
              const ticketDayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
              return ticketDayIdx === dayIndex && d.getHours() === hour;
            });
            goToDetail('zohoAll', 'all', 'Zoho Tickets - ' + day + ' ' + hour + ':00', pre);
          }} />}</WidgetDateFilter>
      </div>


      {/* 4-Card Equal Width & Height Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <WidgetDateFilter tickets={tickets}>{filtered => <TicketTrendWidget tickets={filtered} activeDay={activeDay} setActiveDay={setActiveDay} loading={loading} onBarClick={(day) => goToDetail('zohoDay', day, `Zoho Tickets on ${day}`)} />}</WidgetDateFilter>
        <WidgetDateFilter tickets={tickets}>{filtered => <ResolutionHeatmapWidget tickets={filtered} loading={loading} onCellClick={(dept, bucket) => {
          const norm = (v) => (v != null ? String(v).trim() : '');
          const getDept = (t) => norm(t.department?.name) || norm(t.departmentName) || 'Unknown';
          const bucketRegex = { '<1h': [0, 3600000], '1-4h': [3600000, 14400000], '4-24h': [14400000, 86400000], '1-3d': [86400000, 259200000], '3+d': [259200000, Infinity] };
          const closedStatusesSet = new Set(['closed', 'technically closed', 'duplicate']);
          const getCr = (t) => t?.created_at || t?.createdTime || t?.createdAt;
          const getCl = (t) => t?.closed_at || t?.closedTime || t?.closedAt || t?.closeTime;
          const pre = tickets.filter(t => {
            if (getDept(t) !== dept) return false;
            const ca = getCr(t); const cd = new Date(ca); if (!ca || isNaN(cd.getTime())) return false;
            const ca2 = getCl(t); const closedDate = new Date(ca2); const isClosed = closedStatusesSet.has(norm(t.status).toLowerCase());
            if (!isClosed) return false; if (!ca2 || isNaN(closedDate.getTime())) return false;
            const ms = closedDate.getTime() - cd.getTime();
            const range = bucketRegex[bucket]; return range ? (ms >= range[0] && ms < range[1]) : false;
          });
          goToDetail('zohoAll', 'all', `${dept} – ${bucket} Resolution`, pre);
        }} />}</WidgetDateFilter>
        <WidgetDateFilter tickets={tickets}>{filtered => <EngineerPerformanceWidget tickets={filtered} loading={loading} onEngineerClick={(name) => goToDetail('zohoAssignee', name, `Zoho Tickets by ${name}`)} />}</WidgetDateFilter>
        <WidgetDateFilter tickets={tickets}>{filtered => <MonthlyVolumeWidget tickets={filtered} loading={loading} onCellClick={(dept, monthLabel) => {
          const norm = (v) => (v != null ? String(v).trim() : '');
          const getDept = (t) => norm(t.department?.name) || norm(t.departmentName) || 'Unknown';
          const getCr = (t) => t?.created_at || t?.createdTime || t?.createdAt;
          const pre = tickets.filter(t => {
            if (getDept(t) !== dept) return false;
            const ca = getCr(t); const d = new Date(ca); if (!ca || isNaN(d.getTime())) return false;
            const m = d.toLocaleString('en-US', { month: 'short' }); return m === monthLabel;
          });
          goToDetail('zohoAll', 'all', `${dept} – ${monthLabel}`, pre);
        }} />}</WidgetDateFilter>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">All Tickets Overview</h2>
            <p className="text-xs text-[var(--muted)]">Search and browse all synced tickets</p>
          </div>
          <div className="relative w-full max-w-xs">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by subject, contact, department..."
              className="w-full h-9 rounded-xl border border-[var(--card-border)] bg-[var(--muted-bg)] px-3 text-xs text-[var(--foreground)] outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <WidgetSkeleton variant="table" />
        ) : overviewFiltered.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)]">
            {tickets.length === 0
              ? 'No tickets found. Click "Sync from Zoho" to fetch tickets.'
              : 'No tickets match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted-bg)] text-left">
                  {['#', 'Subject', 'Status', 'Priority', 'Department', 'Contact', 'Assignee', 'Created'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {overviewVisible.map((t, i) => (
                  <tr key={t.id || i} className="hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
                    onClick={() => goToDetail('zohoTicketNo', getTicketNo(t), 'Zoho Ticket ' + getTicketNo(t))}>
                    <td className="px-4 py-3 text-xs text-[var(--muted)]">{getTicketNo(t)}</td>
                    <td className="px-4 py-3 font-medium text-[var(--foreground)] max-w-xs truncate">{t.subject || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                        backgroundColor: (STATUS_COLORS[t.status] || '#6b7280') + '22',
                        color: STATUS_COLORS[t.status] || '#6b7280',
                      }}>{t.status || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                        backgroundColor: (PRIORITY_COLORS[t.priority] || '#6b7280') + '22',
                        color: PRIORITY_COLORS[t.priority] || '#6b7280',
                      }}>{t.priority || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)] whitespace-nowrap">{getDeptName(t)}</td>
                    <td className="px-4 py-3 text-[var(--foreground)] whitespace-nowrap">{getContactName(t)}</td>
                    <td className="px-4 py-3 text-[var(--foreground)] whitespace-nowrap">{getAssigneeName(t)}</td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">{formatDateTime(getCreatedAt(t))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {overviewFiltered.length > 0 && (
          <div className="flex items-center justify-between border-t border-[var(--card-border)] px-4 py-3">
            <p className="text-xs text-[var(--muted)]">
              Showing {overviewStartIndex + 1} to {overviewEndIndex} of {overviewFiltered.length} tickets
            </p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => goToOverviewPage(overviewSafePage - 1)} disabled={overviewSafePage <= 1}
                className="rounded px-2 py-1 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted-bg)] disabled:opacity-50 cursor-pointer">
                Prev
              </button>
              {overviewPages.map((p, idx) => (
                <button key={idx} type="button" onClick={() => goToOverviewPage(p)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold cursor-pointer ${p === overviewSafePage ? 'bg-indigo-600 text-white' : 'text-[var(--foreground)] hover:bg-[var(--muted-bg)]'}`}>
                  {p}
                </button>
              ))}
              <button type="button" onClick={() => goToOverviewPage(overviewSafePage + 1)} disabled={overviewSafePage >= overviewPageCount}
                className="rounded px-2 py-1 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted-bg)] disabled:opacity-50 cursor-pointer">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
