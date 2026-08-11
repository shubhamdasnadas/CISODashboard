import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../api';
import { useProviders } from '../../../context/ProviderContext.jsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import TicketVolcanoGraph from './TicketVolcanoGraph';
import Circlemember from './Circlemember';
import Mttrcard from './Mttrcard';
import Funneldiagram from './Funneldiagram';
import Hourbasedset from './Hourbasedset';
import Zohoticketcount from './Zohoticketcount';
import Topperformance from './Topperformance';
import Ticketingmttr from '../../CyberHygen/Ticketingmttr.jsx';

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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
        <span className={"mr-auto text-[var(--muted)]" + (onCountClick ? " cursor-pointer hover:text-indigo-600 hover:underline" : "")}
          onClick={onCountClick ? () => onCountClick(filteredTickets) : undefined}>
          {getPeriodLabel(from, to)} · {filteredTickets.length} tickets
        </span>
        <input aria-label="Widget from date" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
          className="h-8 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] px-2 text-xs text-[var(--foreground)] outline-none focus:ring-2 focus:ring-indigo-500" />
        <input aria-label="Widget to date" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
          className="h-8 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] px-2 text-xs text-[var(--foreground)] outline-none focus:ring-2 focus:ring-indigo-500" />
        {(from || to) && <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="h-8 rounded-md px-2 font-medium text-indigo-600 hover:bg-indigo-50">Clear</button>}
      </div>
      {typeof children === 'function' ? children(filteredTickets) : null}
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

const PRIORITY_COLORS = { High: '#ef4444', Critical: '#dc2626', Medium: '#f59e0b', Low: '#22c55e' };

// ── Shared Donut Styling ──────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: 8,
  fontSize: 12,
};

const DONUT_PROPS = {
  innerRadius: '50%',
  outerRadius: '80%',
  cornerRadius: 10,
  paddingAngle: 2,
};

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
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-[var(--muted)]">No data available</p>
      </div>
    );
  }

  const midpoint = Math.ceil(data.length / 2);
  const leftItems = data.slice(0, midpoint);
  const rightItems = data.slice(midpoint);

  return (
    <div className="flex items-center h-72 px-2 gap-3">
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
      <div className="flex-1 min-w-0 h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              {...DONUT_PROPS}
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
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => {
                const n = Number(value);
                const total = data.reduce((s, d) => s + d.value, 0);
                return [`${n.toLocaleString('en-IN')} (${Math.round((n / total) * 100)}%)`, ''];
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
const getCreatedAt = (t) => normalizeText(t.created_at) || normalizeText(t.createdTime);
const getClosedAt = (t) => normalizeText(t.closed_at) || normalizeText(t.closedTime) || normalizeText(t.closedAt) || normalizeText(t.closeTime) || normalizeText(t.closedDate);
const getCustomerResponseTime = (t) => normalizeText(t.customerResponseTime) || normalizeText(t.customer_response_time) || normalizeText(t.customer_responseTime) || normalizeText(t.responseTime) || '-';
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
  const customerResponseTime = getCustomerResponseTime(ticket);
  const closedTime = formatDateTime(getClosedAt(ticket));
  const hasCreated = createdTime !== '-', hasResponse = customerResponseTime !== '-', hasClosed = closedTime !== '-';
  const progress = hasClosed ? 100 : hasResponse ? 50 : hasCreated ? 8 : 0;
  const steps = [
    { label: 'Created Time', value: createdTime, complete: hasCreated },
    { label: 'Customer Response Time', value: customerResponseTime, complete: hasResponse },
    { label: 'Closed Time', value: closedTime, complete: hasClosed },
  ];
  return (
    <div className="rounded-md bg-[var(--card-bg)] px-4 py-5">
      <div className="relative mx-1 pb-2">
        <div className="absolute left-0 right-0 top-4 h-2 rounded-full bg-slate-200" />
        <div className="absolute left-0 top-4 h-2 rounded-full bg-indigo-600 transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
        <div className="relative grid grid-cols-3 gap-3">
          {steps.map((step, idx) => (
            <div key={step.label} className={`flex ${idx === 0 ? 'items-start' : idx === 1 ? 'items-center' : 'items-end'} flex-col`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-500 ${step.complete ? 'border-indigo-600 bg-indigo-600 text-white shadow-[0_0_0_6px_rgba(79,70,229,0.12)]' : 'border-indigo-500 bg-[var(--card-bg)] text-indigo-600'}`}>
                {step.complete ? <span className="text-sm leading-none">✓</span> : <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-indigo-500" />}
              </span>
              <div className={`mt-4 max-w-[180px] text-sm ${idx === 0 ? 'text-left' : idx === 1 ? 'text-center' : 'text-right'}`}>
                <div className="text-xs font-bold uppercase text-[var(--muted)]">{step.label}</div>
                <div className="mt-1 font-medium text-[var(--foreground)]">{step.value}</div>
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
    <span className="relative inline-flex min-w-10 justify-end" onMouseEnter={show} onMouseLeave={hide}>
      <span className={count ? 'cursor-pointer font-semibold text-indigo-600' : 'text-[var(--muted)]'}>{count}</span>
      {open && count > 0 && (
        <div onMouseEnter={clearTimer} onMouseLeave={hide}
          className="fixed left-1/2 top-24 z-50 w-[min(92vw,780px)] -translate-x-1/2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-[var(--foreground)] shadow-xl">
          <p className="mb-2 text-sm font-semibold">{title}</p>
          <div className="max-h-72 overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-xs">
              <thead>
                <tr className="bg-[var(--muted-bg)]">
                  {['ticket_no', 'subject', 'createdTime', 'closedTime', 'resolve_time', 'assignee', 'status'].map(h => (
                    <th key={h} className="border border-[var(--card-border)] px-2 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickets.map((t, i) => (
                  <tr key={`${getTicketNo(t)}-${t.id || i}`}>
                    <td className="border border-[var(--card-border)] px-2 py-2">{getTicketNo(t)}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{t.subject || '-'}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{formatDateTime(getCreatedAt(t))}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{formatDateTime(getClosedAt(t))}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{formatResolutionTime(t)}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{getAssigneeName(t)}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{t.status || '-'}</td>
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
          {[
            { label: 'Assignee', type: 'select', value: assignee, onChange: v => { setAssignee(v); reset(); } },
          ].map(() => null)}
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
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--card-bg)]">
                <th className="w-12 px-4 py-3 text-left font-semibold text-[var(--foreground)]" />
                <th className="px-4 py-3 text-left font-semibold text-[var(--foreground)]">Subject</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((ticket, i) => {
                const key = getTicketKey(ticket, startIndex + i);
                const isExpanded = Boolean(expanded[key]);
                return (
                  <>
                    <tr key={key} className="border-t border-[var(--card-border)]">
                      <td className="px-4 py-3 align-top">
                        <button type="button" onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] text-sm font-bold text-[var(--foreground)] transition-colors hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          {isExpanded ? '^' : 'v'}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                        <button type="button" onClick={() => onTicketClick && onTicketClick(ticket)}
                          className="text-left hover:text-indigo-600 hover:underline transition-colors cursor-pointer">
                          {ticket.subject || '-'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${key}-exp`} className="border-t border-[var(--card-border)] bg-[var(--card-bg)]">
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3"><TicketTracking ticket={ticket} /></td>
                      </tr>
                    )}
                  </>
                );
              })}
              {!visible.length && (
                <tr><td colSpan={2} className="px-4 py-8 text-center text-[var(--muted)]">{loading ? 'Loading...' : 'No tickets found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <div>Showing {filtered.length ? startIndex + 1 : 0} to {endIndex} of {filtered.length} entries</div>
          <div className="flex flex-wrap items-center gap-2">
            {[['First', 1], ['Prev', safePage - 1]].map(([label, target]) => (
              <button key={label} type="button" onClick={() => goTo(target)} disabled={safePage === 1}
                className="rounded-md border border-[var(--card-border)] px-3 py-1.5 font-medium text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50">
                {label}
              </button>
            ))}
            {pages.map((p, idx) => {
              const prev = pages[idx - 1];
              return (
                <>
                  {prev && p - prev > 1 && <span key={`gap-${p}`} className="px-1">...</span>}
                  <button key={p} type="button" onClick={() => goTo(p)}
                    className={`h-9 min-w-9 rounded-md border border-[var(--card-border)] px-3 font-semibold ${safePage === p ? 'bg-indigo-600 text-white' : 'text-[var(--foreground)]'}`}>
                    {p}
                  </button>
                </>
              );
            })}
            {[['Next', safePage + 1], ['Last', pageCount]].map(([label, target]) => (
              <button key={label} type="button" onClick={() => goTo(target)} disabled={safePage === pageCount}
                className="rounded-md border border-[var(--card-border)] px-3 py-1.5 font-medium text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50">
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── TicketTrendWidget ─────────────────────────────────────────────────────────
function TicketTrendWidget({ tickets, activeDay, setActiveDay, loading, onBarClick }) {
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
  const activeTrendRow = trend.find(r => r.day === activeDay);
  const maxCount = Math.max(...trend.map(r => r.tickets.length), 1);
  return (
    <section className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
      <div className="mb-5"><h2 className="text-xl font-bold text-[var(--foreground)]">Ticket Trend</h2></div>
      <div className="rounded-lg border border-[var(--card-border)] bg-[var(--muted-bg)] p-4 sm:p-6">
        {activeTrendRow && activeTrendRow.tickets.length > 0 && (
          <div className="mb-5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-[var(--foreground)] shadow-sm">
            <p className="mb-2 text-sm font-semibold">{activeTrendRow.day} tickets ({activeTrendRow.tickets.length})</p>
            <div className="max-h-72 overflow-auto">
              <table className="w-full min-w-[900px] border-collapse text-xs">
                <thead><tr className="bg-[var(--muted-bg)]">
                  {['ticket_no', 'subject', 'createdTime', 'closedTime', 'resolve_time', 'assignee', 'status'].map(h => (
                    <th key={h} className="border border-[var(--card-border)] px-2 py-2 text-left">{h}</th>
                  ))}
                </tr></thead>
                <tbody>{activeTrendRow.tickets.map((t, i) => (
                  <tr key={i}>
                    <td className="border border-[var(--card-border)] px-2 py-2">{getTicketNo(t)}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{t.subject || '-'}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{formatDateTime(getCreatedAt(t))}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{formatDateTime(getClosedAt(t))}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{formatResolutionTime(t)}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{getAssigneeName(t)}</td>
                    <td className="border border-[var(--card-border)] px-2 py-2">{t.status || '-'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        <div className="h-full w-full flex h-32 items-end gap-3 overflow-x-auto pb-2 sm:gap-5">
          {trend.map((row, idx) => {
            const count = row.tickets.length;
            const height = Math.max((count / maxCount) * 100, count ? 10 : 3);
            const isSel = activeDay === row.day;
            return (
              <div key={row.day} className="h-full w-full flex min-w-16 flex-1 flex-col items-center justify-end gap-2">
                <button type="button" onClick={() => setActiveDay(prev => prev === row.day ? null : row.day)}
                  className={`rounded px-1.5 py-0.5 text-sm font-bold transition-colors ${isSel ? 'bg-indigo-600 text-white' : count ? 'text-[var(--foreground)] hover:bg-[var(--card-bg)]' : 'text-[var(--foreground)]'}`}>
                  {count}
                </button>
                <button type="button" aria-label={`${row.day}: ${count} tickets`}
                  className="w-full min-w-12 rounded-t-md transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  style={{ height: `${height}%`, backgroundColor: barColors[idx] }}
                  onClick={() => { setActiveDay(prev => prev === row.day ? null : row.day); if (onBarClick && count > 0) onBarClick(row.day); }} />
                <div className="text-xs font-semibold text-[var(--muted)]">{row.day}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
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
  return (
    <section className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
      <div className="mb-5"><h2 className="text-xl font-bold text-[var(--foreground)]">Engineer Performance</h2></div>
      <div className="overflow-x-auto rounded-lg border border-[var(--card-border)] bg-[var(--muted-bg)] p-4">
        <table className="w-full min-w-[360px] text-sm">
          <thead><tr>
            <th className="pb-3 text-left font-semibold text-[var(--foreground)]">Engineer</th>
            <th className="pb-3 text-right font-semibold text-[var(--foreground)]">Open</th>
            <th className="pb-3 text-right font-semibold text-[var(--foreground)]">Closed</th>
          </tr></thead>
          <tbody>
            {engPerf.map(row => (
              <tr key={row.engineer} onClick={() => onEngineerClick && onEngineerClick(row.engineer)}
                className="cursor-pointer hover:bg-[var(--muted-bg)]/60 transition-colors">
                <td className="py-1.5 pr-6 font-medium text-[var(--foreground)]">{row.engineer}</td>
                <td className="py-1.5 text-right"><HoverCount title={`${row.engineer} open tickets`} count={row.open.length} tickets={row.open} /></td>
                <td className="py-1.5 text-right"><HoverCount title={`${row.engineer} closed tickets`} count={row.closed.length} tickets={row.closed} /></td>
              </tr>
            ))}
            {!engPerf.length && <tr><td colSpan={3} className="py-6 text-center text-[var(--muted)]">{loading ? 'Loading...' : 'No tickets found'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
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
  return (
    <section className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-2 shadow-sm">
      <div className="mb-5"><h2 className="text-xl font-bold text-[var(--foreground)]">Department Based Resolution Time Heatmap</h2></div>
      <div className="rounded-lg border border-[var(--card-border)] bg-[var(--muted-bg)] p-2">
        {agingMatrix.length ? (
          <div className="space-y-4">
            <div className="hidden grid-cols-[minmax(120px,1.4fr)_repeat(5,minmax(72px,1fr))] gap-1 text-xs font-semibold text-[var(--muted)] md:grid">
              <div>Department</div>
              {agingBuckets.map(b => <div key={b} className="text-center">{b}</div>)}
            </div>
            {agingMatrix.map(row => (
              <div key={row.department} className="grid gap-1 md:grid-cols-[minmax(120px,1.4fr)_repeat(5,minmax(72px,1fr))]">
                <div className="flex items-center rounded-md bg-[var(--card-bg)] px-2 py-2 text-sm font-semibold text-[var(--foreground)]">{row.department}</div>
                {agingBuckets.map(b => {
                  const bt = row.buckets[b]; const cnt = bt.length;
                  const intensity = cnt / maxAging;
                  return (
                    <div key={b} className={`rounded-md border border-[var(--card-border)] px-3 py-2 ${cnt > 0 ? 'cursor-pointer hover:brightness-90 transition-all' : ''}`}
                      style={{ backgroundColor: cnt ? `rgba(79, 70, 229, ${0.12 + intensity * 0.45})` : 'var(--card-bg)' }}
                      onClick={() => { if (cnt > 0 && onCellClick) onCellClick(row.department, b); }}>
                      <div className="mb-1 flex items-center justify-between gap-2 md:hidden"><span className="text-xs font-semibold text-[var(--muted)]">{b}</span></div>
                      <div className="flex items-center justify-between gap-2 md:justify-center">
                        <span className="h-2 w-2 rounded-full bg-indigo-500" />
                        <HoverCount title={`${row.department} ${b} tickets`} count={cnt} tickets={bt} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-[var(--muted)]">{loading ? 'Loading...' : 'No tickets found'}</div>
        )}
      </div>
    </section>
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
  const gridStyle = { '--month-grid': `minmax(150px, 1.4fr) repeat(${Math.max(monthMatrix.months.length, 1)}, minmax(72px, 1fr))` };
  return (
    <section className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
      <div className="mb-5"><h2 className="text-xl font-bold text-[var(--foreground)]">Department Based Monthly Ticket Volume</h2></div>
      <div className="rounded-lg border border-[var(--card-border)] bg-[var(--muted-bg)] p-4">
        {monthMatrix.rows.length ? (
          <div className="space-y-4">
            <div className="hidden gap-2 text-xs font-semibold text-[var(--muted)] md:grid" style={{ gridTemplateColumns: 'var(--month-grid)', ...gridStyle }}>
              <div>Department</div>
              {monthMatrix.months.map(m => <div key={m.key} className="text-center">{m.label}</div>)}
            </div>
            {monthMatrix.rows.map(row => (
              <div key={row.department} className="grid gap-2" style={{ gridTemplateColumns: 'var(--month-grid)', ...gridStyle }}>
                <div className="flex items-center rounded-md bg-[var(--card-bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]">{row.department}</div>
                {monthMatrix.months.map(m => {
                  const mt = row.monthTickets[m.key] || []; const cnt = mt.length;
                  const intensity = cnt / maxMonth;
                  return (
                    <div key={m.key} className={`rounded-md border border-[var(--card-border)] px-3 py-2 ${cnt > 0 ? 'cursor-pointer hover:brightness-90 transition-all' : ''}`}
                      style={{ backgroundColor: cnt ? `rgba(8, 145, 178, ${0.12 + intensity * 0.45})` : 'var(--card-bg)' }}
                      onClick={() => { if (cnt > 0 && onCellClick) onCellClick(row.department, m.label); }}>
                      <div className="mb-1 flex items-center justify-between gap-2 md:hidden"><span className="text-xs font-semibold text-[var(--muted)]">{m.label}</span></div>
                      <div className="flex items-center justify-between gap-2 md:justify-center">
                        <span className="h-2 w-2 rounded-full bg-cyan-600" />
                        <HoverCount title={`${row.department} ${m.label} tickets`} count={cnt} tickets={mt} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-[var(--muted)]">{loading ? 'Loading...' : 'No tickets found'}</div>
        )}
      </div>
    </section>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Zohoone() {
  const navigate = useNavigate();
  const { selectedProviders } = useProviders();
  const activeTool = selectedProviders.ticketing || 'Zoho Desk';

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeDay, setActiveDay] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [lastSynced, setLastSynced] = useState(null);
  const [info, setInfo] = useState('');
  const [overviewPage, setOverviewPage] = useState(1);
  const overviewPageSize = 10;

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
        setInfo(r.data.message); // showing cached data, not a hard failure
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
    navigate('/security/detail', {
      state: { dataset: 'zoho', filterId, value, title, rows: overrideRows || tickets },
    });
  }, [navigate, tickets]);

  const statusCounts = useMemo(() => Object.entries(
    tickets.reduce((acc, t) => {
      const s = t.status || 'Unknown';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || '#6366f1' })).sort((a, b) => b.value - a.value), [tickets]);

  const priorityCounts = useMemo(() => Object.entries(
    tickets.reduce((acc, t) => {
      const p = t.priority || 'Unknown';
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value })), [tickets]);

  const departmentCounts = useMemo(() => Object.entries(
    tickets.reduce((acc, t) => {
      const d = getDeptName(t);
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8), [tickets]);

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
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] disabled:opacity-50 transition-colors">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button onClick={handleSync} disabled={syncing || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors">
            {syncing
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Syncing…</>
              : 'Sync from Zoho'
            }
          </button>
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: tickets.length, color: '#6366f1', filterId: 'zohoAll', filterValue: 'all', title: 'All Zoho Tickets' },
          { label: 'Open', value: tickets.filter(t => t.status === 'Open').length, color: '#3b82f6', filterId: 'zohoOpen', filterValue: 'Open', title: 'Open Zoho Tickets' },
          { label: 'High Priority', value: tickets.filter(t => t.priority === 'High' || t.priority === 'Critical').length, color: '#ef4444', filterId: 'zohoHighPriority', filterValue: 'High', title: 'High Priority Zoho Tickets' },
          { label: 'Closed', value: tickets.filter(t => ['Closed', 'Technically Closed', 'Resolved'].includes(t.status)).length, color: '#22c55e', filterId: 'zohoClosed', filterValue: 'Closed', title: 'Closed Zoho Tickets' },
        ].map(s => (
          <div key={s.label} onClick={() => goToDetail(s.filterId, s.filterValue, s.title)}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 cursor-pointer hover:shadow-md transition-shadow">
            <p className="text-sm text-[var(--muted)] mb-1.5">{s.label}</p>
            <p className="text-3xl font-bold" style={{ color: s.color }}>{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
          <h3 className="font-semibold text-[var(--foreground)] mb-4">Ticketing Health Score</h3>
          {/* <ResponsiveContainer width="100%" height={200}> */}
            <Ticketingmttr tickets={tickets} loading={loading} />
          {/* </ResponsiveContainer> */}
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
          <h3 className="font-semibold text-[var(--foreground)] mb-4">By Status</h3>
          <ImprovedDonut data={statusCounts} onSliceClick={(data) => goToDetail('zohoStatus', data.name, `Zoho Tickets with "${data.name}" status`)} />
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
          <h3 className="font-semibold text-[var(--foreground)] mb-4">By Priority</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={priorityCounts}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--muted)' }} />
              <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer"
                onClick={(data) => goToDetail('zohoPriority', data.name, `Zoho Tickets with "${data.name}" priority`)}>
                {priorityCounts.map(e => <Cell key={e.name} fill={PRIORITY_COLORS[e.name] || '#6b7280'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
          <h3 className="font-semibold text-[var(--foreground)] mb-4">By Department</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={departmentCounts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: 'var(--muted)' }} />
              <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8 }} />
              <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} cursor="pointer"
                onClick={(data) => goToDetail('zohoDepartment', data.name, `Zoho Tickets in "${data.name}" department`)} />
            </BarChart>
          </ResponsiveContainer>
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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

      {/* <div className="grid gap-5 xl:grid-cols-2">
        <Funneldiagram />
      </div>
      <div className="grid gap-5">
        <Hourbasedset tickets={tickets} />
      </div> */}
      <div className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <WidgetDateFilter tickets={tickets}>{filtered => <Funneldiagram tickets={filtered} loading={loading}
            onSliceClick={(slice) => goToDetail('zohoStatusGroup', slice.status, 'Zoho Tickets - ' + slice.status)} />}</WidgetDateFilter>
        </div>
        <div className="xl:col-span-3">
          <WidgetDateFilter tickets={tickets}>{filtered => <Hourbasedset tickets={filtered}
            onCellClick={(day, hour) => {
              const getCreatedAt = (t) => t?.createdTime || t?.created_at || t?.createdAt;
              const dayIndex = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(day);
              const pre = tickets.filter(t => {
                const ca = getCreatedAt(t);
                const d = new Date(ca);
                if (!ca || isNaN(d.getTime())) return false;
                const ticketDayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
                return ticketDayIdx === dayIndex && d.getHours() === hour;
              });
              goToDetail('zohoAll', 'all', 'Zoho Tickets - ' + day + ' ' + hour + ':00', pre);
            }} />}</WidgetDateFilter>
        </div>
      </div>
      <div className="grid gap-5">
        <WidgetDateFilter tickets={tickets} onCountClick={(filtered) => goToDetail('zohoAll', 'all', 'All Zoho Tickets', filtered)}>
          {filtered => <Zohoticketcount tickets={filtered} loading={loading}
            onCardClick={(card) => goToDetail('zohoStatusGroup', card.title, 'Zoho Tickets - ' + card.title)} />}
        </WidgetDateFilter>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <WidgetDateFilter tickets={tickets}>{filtered => <TicketTrendWidget tickets={filtered} activeDay={activeDay} setActiveDay={setActiveDay} loading={loading} onBarClick={(day) => goToDetail('zohoDay', day, `Zoho Tickets on ${day}`)} />}</WidgetDateFilter>
        <WidgetDateFilter tickets={tickets}>{filtered => <EngineerPerformanceWidget tickets={filtered} loading={loading} onEngineerClick={(name) => goToDetail('zohoAssignee', name, `Zoho Tickets by ${name}`)} />}</WidgetDateFilter>
        <WidgetDateFilter tickets={tickets}>{filtered => <ResolutionHeatmapWidget tickets={filtered} loading={loading} onCellClick={(dept, bucket) => {
          const norm = (v) => (v != null ? String(v).trim() : '');
          const getDept = (t) => norm(t.department?.name) || norm(t.departmentName) || 'Unknown';
          const bucketRegex = { '<1h': [0, 3600000], '1-4h': [3600000, 14400000], '4-24h': [14400000, 86400000], '1-3d': [86400000, 259200000], '3+d': [259200000, Infinity] };
          const closedStatuses = new Set(['closed', 'technically closed', 'duplicate']);
          const getCreatedAt = (t) => t?.created_at || t?.createdTime || t?.createdAt;
          const getClosedAt = (t) => t?.closed_at || t?.closedTime || t?.closedAt || t?.closeTime;
          const pre = tickets.filter(t => {
            if (getDept(t) !== dept) return false;
            const ca = getCreatedAt(t); const cd = new Date(ca); if (!ca || isNaN(cd.getTime())) return false;
            const ca2 = getClosedAt(t); const closedDate = new Date(ca2); const isClosed = closedStatuses.has(norm(t.status).toLowerCase());
            if (!isClosed) return false; if (!ca2 || isNaN(closedDate.getTime())) return false;
            const ms = closedDate.getTime() - cd.getTime();
            const range = bucketRegex[bucket]; return range ? (ms >= range[0] && ms < range[1]) : false;
          });
          goToDetail('zohoAll', 'all', `${dept} – ${bucket} Resolution`, pre);
        }} />}</WidgetDateFilter>
        <WidgetDateFilter tickets={tickets}>{filtered => <MonthlyVolumeWidget tickets={filtered} loading={loading} onCellClick={(dept, monthLabel) => {
          const norm = (v) => (v != null ? String(v).trim() : '');
          const getDept = (t) => norm(t.department?.name) || norm(t.departmentName) || 'Unknown';
          const getCreatedAt = (t) => t?.created_at || t?.createdTime || t?.createdAt;
          const pre = tickets.filter(t => {
            if (getDept(t) !== dept) return false;
            const ca = getCreatedAt(t); const d = new Date(ca); if (!ca || isNaN(d.getTime())) return false;
            const m = d.toLocaleString('en-US', { month: 'short' }); return m === monthLabel;
          });
          goToDetail('zohoAll', 'all', `${dept} – ${monthLabel}`, pre);
        }} />}</WidgetDateFilter>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          </div>
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
                    <td className="px-4 py-3 font-medium text-[var(--foreground)] max-w-xs truncate">{t.subject || '\u2014'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                        backgroundColor: (STATUS_COLORS[t.status] || '#6b7280') + '22',
                        color: STATUS_COLORS[t.status] || '#6b7280',
                      }}>{t.status || '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {t.priority && t.priority !== '\u2014'
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                          backgroundColor: (PRIORITY_COLORS[t.priority] || '#6b7280') + '22',
                          color: PRIORITY_COLORS[t.priority] || '#6b7280',
                        }}>{t.priority}</span>
                        : <span className="text-[var(--muted)]">{'\u2014'}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] text-xs max-w-[120px] truncate">{getDeptName(t)}</td>
                    <td className="px-4 py-3 text-[var(--muted)] max-w-[120px] truncate">{getContactName(t)}</td>
                    <td className="px-4 py-3 text-[var(--muted)] max-w-[120px] truncate">{getAssigneeName(t)}</td>
                    <td className="px-4 py-3 text-[var(--muted)] text-xs whitespace-nowrap">{getCreatedAt(t) ? timeAgo(getCreatedAt(t)) : '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── Pagination footer ─────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 border-t border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                Showing {overviewFiltered.length ? overviewStartIndex + 1 : 0} to {overviewEndIndex} of {overviewFiltered.length} entries
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[['First', 1], ['Prev', overviewSafePage - 1]].map(([label, target]) => (
                  <button key={label} type="button" onClick={() => goToOverviewPage(target)} disabled={overviewSafePage === 1}
                    className="rounded-md border border-[var(--card-border)] px-3 py-1.5 font-medium text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50">
                    {label}
                  </button>
                ))}
                {overviewPages.map((p, idx) => {
                  const prev = overviewPages[idx - 1];
                  return (
                    <span key={p} className="inline-flex items-center gap-1">
                      {prev && p - prev > 1 && <span className="px-1">...</span>}
                      <button type="button" onClick={() => goToOverviewPage(p)}
                        className={'h-9 min-w-9 rounded-md border border-[var(--card-border)] px-3 font-semibold ' + (overviewSafePage === p ? 'bg-indigo-600 text-white' : 'text-[var(--foreground)]')}>
                        {p}
                      </button>
                    </span>
                  );
                })}
                {[['Next', overviewSafePage + 1], ['Last', overviewPageCount]].map(([label, target]) => (
                  <button key={label} type="button" onClick={() => goToOverviewPage(target)} disabled={overviewSafePage === overviewPageCount}
                    className="rounded-md border border-[var(--card-border)] px-3 py-1.5 font-medium text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}