import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CheckpointDashboard from './CheckpointDashboard';
import { useProviders } from '../../context/ProviderContext.jsx';
import Emailsecuritymttr from '../CyberHygen/Emailsecuritymttr.jsx';

const ALL_EVENT_TYPES = ['phishing','malware','suspicious_malware','suspicious_phishing','dlp'];

const CHART_COLORS = {
  phishing: '#6366f1',
  malware: '#ef4444',
  dlp: '#f59e0b',
  suspicious_malware: '#f97316',
  suspicious_phishing: '#8b5cf6',
};

const TABLE_PAGE_SIZE = 15;

const fmt = (d) => d.toISOString().slice(0, 10);

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function mapEvent(e) {
  const ad = e.additional_data || {};
  return {
    eventId: e.event_id,
    type: e.type,
    state: e.state,
    severity: e.severity,
    confidenceIndicator: e.confidence_indicator,
    description: e.description,
    senderAddress: e.sender_address,
    receiverAddress: ad.receiver_address || ad.recipient_address || ad.receiverAddress || ad.recipientAddress || ad.to || null,
    saas: e.saas,
    entityId: e.entity_id,
    entityLink: e.entity_link,
    eventCreated: e.event_created,
    actions: e.actions,
    additionalData: e.additional_data,
  };
}

function computeSummary(events, types) {
  const filtered = events.filter(e => types.includes(e.type));
  const total = filtered.length;
  const remediated = filtered.filter(e => e.state === 'remediated' || e.state === 'closed' || e.state === 'done').length;
  const pending = filtered.filter(e => e.state === 'new' || e.state === 'pending').length;
  const detected = Math.max(0, total - remediated - pending);
  const pct = (n) => total > 0 ? Math.round((n/total)*100) : 0;
  return { total, pending, remediated, remediatedPct: pct(remediated), detected, detectedPct: pct(detected) };
}

// ── ThreatCard ────────────────────────────────────────────────────────────────

function ThreatCard({ label, summary, expanded, onToggle, activeTypes, onTypeChange }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleType = (t) => {
    if (activeTypes.includes(t)) {
      if (activeTypes.length === 1) return;
      onTypeChange(activeTypes.filter(x => x !== t));
    } else {
      onTypeChange([...activeTypes, t]);
    }
  };

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--card-border)]">
        <span className="font-semibold text-[var(--foreground)] text-sm capitalize">{label}</span>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setMenuOpen(p => !p)}
              className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1 rounded-lg hover:bg-[var(--muted-bg)]"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-40 w-52 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl py-1.5">
                  <p className="px-3 py-1 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Event Types</p>
                  {ALL_EVENT_TYPES.map(t => (
                    <button key={t} onClick={() => toggleType(t)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors capitalize"
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        activeTypes.includes(t) ? 'bg-indigo-600 border-indigo-600' : 'border-[var(--card-border)]'
                      }`}>
                        {activeTypes.includes(t) && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      {t.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        {summary.total === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-4">No events</p>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-4xl font-bold text-blue-600 dark:text-blue-400 leading-none">{summary.total}</p>
              <p className="text-xs text-[var(--muted)] mt-1.5 font-medium">Total</p>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className={`text-3xl font-bold leading-none ${
                  summary.remediatedPct === 100 ? 'text-green-600 dark:text-green-400' :
                  summary.remediatedPct > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--muted)]'
                }`}>{summary.remediatedPct}%</p>
                <p className={`text-xs mt-1.5 font-medium ${summary.remediatedPct === 100 ? 'text-green-600 dark:text-green-400' : 'text-[var(--muted)]'}`}>Remediated</p>
              </div>
              <div>
                <p className={`text-3xl font-bold leading-none ${summary.detectedPct > 0 ? 'text-orange-500' : 'text-[var(--muted)]'}`}>{summary.detectedPct}%</p>
                <p className="text-xs text-[var(--muted)] mt-1.5 font-medium">Detected</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-center pb-3">
        <button onClick={onToggle} className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1">
          <svg className={`w-5 h-5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────────────────────────

// "new" on top, then "detected", everything else after — ties keep the
// incoming (most-recent-first) order since Array.sort is stable.
function eventStateRank(ev) {
  if (ev.state === 'new') return 0;
  if (ev.state === 'detected') return 1;
  return 2;
}

function DetailPanel({ label, events }) {
  const sortedEvents = [...events].sort((a, b) => eventStateRank(a) - eventStateRank(b));
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm mb-6">
      <div className="px-5 py-3.5 border-b border-[var(--card-border)] bg-[var(--muted-bg)]">
        <p className="text-sm font-semibold text-[var(--foreground)] capitalize">
          {label} — {events.length} event{events.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="divide-y divide-[var(--card-border)] max-h-96 overflow-y-auto">
        {sortedEvents.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[var(--muted)] text-center">No events to show.</p>
        ) : sortedEvents.map((ev, i) => {
          const isPending = ev.state === 'new' || ev.state === 'pending';
          return (
            <div key={ev.eventId || i} className={`flex items-start gap-3 px-5 py-2.5 transition-colors ${
              isPending ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20' : 'hover:bg-[var(--muted-bg)]'
            }`}>
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                isPending ? 'bg-red-500' : ev.state === 'remediated' || ev.state === 'closed' ? 'bg-green-500' : 'bg-amber-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--foreground)] truncate leading-snug">{ev.description || 'No description'}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {ev.eventCreated ? new Date(ev.eventCreated).toLocaleString() : '—'}
                  {ev.senderAddress ? ` · ${ev.senderAddress}` : ''}
                </p>
              </div>
              <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded capitalize font-medium ${
                isPending ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
              }`}>{ev.state}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Event Detail Modal ────────────────────────────────────────────────────────

function EventModal({ event, onClose }) {
  if (!event) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--card-bg)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)] sticky top-0 bg-[var(--card-bg)]">
          <h2 className="font-semibold text-[var(--foreground)]">Event Detail</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)] p-1.5 rounded-lg hover:bg-[var(--muted-bg)]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-3 text-sm">
          {Object.entries(event).map(([key, val]) => (
            <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-1 border-b border-[var(--card-border)] pb-2">
              <span className="font-medium text-[var(--muted)] sm:w-48 flex-shrink-0 capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="text-[var(--foreground)] break-all">{typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val ?? '')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CheckpointPage() {
  const navigate = useNavigate();
  const { selectedProviders } = useProviders();
  const activeTool = selectedProviders.emailSecurity || 'Check Point Harmony';
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const [openCard, setOpenCard] = useState(null);
  const [phishingTypes, setPhishingTypes] = useState(['phishing']);
  const [malwareTypes, setMalwareTypes] = useState(['malware']);
  const [dlpTypes, setDlpTypes] = useState(['dlp']);

  const [cardDateFrom, setCardDateFrom] = useState('');
  const [cardDateTo, setCardDateTo]     = useState('');

  const [tableFilter, setTableFilter] = useState('all');
  const [tablePage, setTablePage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const today = new Date();
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 29);
  const [chartStart, setChartStart] = useState(fmt(thirtyDaysAgo));
  const [chartEnd, setChartEnd] = useState(fmt(today));
  const [chartTypes, setChartTypes] = useState(['phishing','malware','dlp']);
  const [chartMode, setChartMode] = useState('bar');

  const loadFromDb = async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get('/harmony/events-db');
      const rows = r.data.events || r.data.responseData || [];
      setEvents(rows.map(mapEvent));
      setLastSyncedAt(r.data.lastSyncedAt ?? null);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFromDb(); }, []);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      await api.post('/harmony/sync-db').catch(() => api.post('/harmony/sync'));
      setSyncMsg({ text: 'Sync complete', ok: true });
      await loadFromDb();
    } catch {
      setSyncMsg({ text: 'Sync failed — configure credentials in Settings', ok: false });
    } finally {
      setSyncing(false); }
  };

  const toggleCard = (key) => setOpenCard(prev => prev === key ? null : key);
  const toggleChartType = (t) => {
    setChartTypes(prev => prev.includes(t) ? (prev.length > 1 ? prev.filter(x => x !== t) : prev) : [...prev, t]);
  };

  // Handle bar click in Events per Day chart
  const handleChartClick = (data, name) => {
    if (!data || !name) return;
    const date = data.date;
    const type = name;
    const count = data[name];
    if (!count || count === 0) return;
    
    navigate('/security/detail', {
      state: { 
        dataset: 'checkpoint', 
        filterId: 'checkpointDate', 
        value: date, 
        title: `${type} events on ${date}`,
        dateFrom: chartStart,
        dateTo: chartEnd,
        additionalFilter: { filterId: 'checkpointType', value: type }
      }
    });
  };

  // Cards: date-filtered events
  const hasCardDateFilter = !!(cardDateFrom || cardDateTo);
  const cardEvents = useMemo(() => {
    if (!hasCardDateFilter) return events;
    return events.filter(e => {
      const d = parseDate(e.eventCreated);
      if (!d) return false;
      const key = fmt(d);
      if (cardDateFrom && key < cardDateFrom) return false;
      if (cardDateTo   && key > cardDateTo)   return false;
      return true;
    });
  }, [events, cardDateFrom, cardDateTo, hasCardDateFilter]);

  // Summaries
  const phishingSummary = computeSummary(cardEvents, phishingTypes);
  const malwareSummary  = computeSummary(cardEvents, malwareTypes);
  const dlpSummary      = computeSummary(cardEvents, dlpTypes);

  // Chart data
  const chartData = useMemo(() => {
    const start = new Date(chartStart + 'T00:00:00');
    const end   = new Date(chartEnd   + 'T23:59:59');
    const map = {};
    const cursor = new Date(start);
    while (cursor <= end) { map[fmt(cursor)] = {}; cursor.setDate(cursor.getDate()+1); }
    events.forEach(ev => {
      if (!chartTypes.includes(ev.type)) return;
      const d = new Date(ev.eventCreated);
      if (d < start || d > end) return;
      const key = fmt(d);
      if (!map[key]) return;
      map[key][ev.type] = (map[key][ev.type] || 0) + 1;
    });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([date,counts]) => ({ date, ...counts }));
  }, [events, chartStart, chartEnd, chartTypes]);

  // Table
  const tableEventTypes = ['all', ...Array.from(new Set(events.map(e => e.type))).sort()];
  const sortedEvents = [...events].sort((a,b) => new Date(b.eventCreated)-new Date(a.eventCreated));
  const filteredTableEvents = tableFilter === 'all' ? sortedEvents : sortedEvents.filter(e => e.type === tableFilter);
  const totalTablePages = Math.max(1, Math.ceil(filteredTableEvents.length / TABLE_PAGE_SIZE));
  const pagedTableEvents = filteredTableEvents.slice((tablePage-1)*TABLE_PAGE_SIZE, tablePage*TABLE_PAGE_SIZE);

  // Detail lists
  const sortedCardEvents = [...cardEvents].sort((a,b) => new Date(b.eventCreated)-new Date(a.eventCreated));
  const phishingDetail = sortedCardEvents.filter(e => phishingTypes.includes(e.type));
  const malwareDetail  = sortedCardEvents.filter(e => malwareTypes.includes(e.type));
  const dlpDetail      = sortedCardEvents.filter(e => dlpTypes.includes(e.type));

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-64">
      <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{activeTool}</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : 'Email & Collaboration security events'}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
        >
          {syncing ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Syncing…</> : 'Sync'}
        </button>
      </div>

      {syncMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          syncMsg.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                     : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>{syncMsg.text}</div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
          {error} — configure credentials in <a href="/settings" className="underline">Settings</a>
        </div>
      )}

      {/* Three threat cards */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-[var(--muted)] font-medium">From</label>
          <input type="date" value={cardDateFrom} max={cardDateTo || undefined}
            onChange={(e) => setCardDateFrom(e.target.value)}
            className="text-[10px] px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-[var(--muted)] font-medium">To</label>
          <input type="date" value={cardDateTo} min={cardDateFrom || undefined}
            onChange={(e) => setCardDateTo(e.target.value)}
            className="text-[10px] px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        {hasCardDateFilter && (
          <button onClick={() => { setCardDateFrom(''); setCardDateTo(''); }}
            className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold">Clear</button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <ThreatCard
          label="Phishing" summary={phishingSummary}
          expanded={openCard === 'phishing'} onToggle={() => toggleCard('phishing')}
          activeTypes={phishingTypes} onTypeChange={setPhishingTypes}
        />
        <ThreatCard
          label="Malware" summary={malwareSummary}
          expanded={openCard === 'malware'} onToggle={() => toggleCard('malware')}
          activeTypes={malwareTypes} onTypeChange={setMalwareTypes}
        />
        <ThreatCard
          label="DLP" summary={dlpSummary}
          expanded={openCard === 'dlp'} onToggle={() => toggleCard('dlp')}
          activeTypes={dlpTypes} onTypeChange={setDlpTypes}
        />
        <Emailsecuritymttr />
      </div>

      {/* Detail panels */}
      {openCard === 'phishing' && <DetailPanel label="Phishing" events={phishingDetail} />}
      {openCard === 'malware'  && <DetailPanel label="Malware"  events={malwareDetail}  />}
      {openCard === 'dlp'      && <DetailPanel label="DLP"      events={dlpDetail}       />}

      {/* Events per Day chart */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <h3 className="font-semibold text-[var(--foreground)] flex-1">Events per Day</h3>
          <div className="flex flex-wrap items-center gap-3">
            <input type="date" value={chartStart} onChange={e => setChartStart(e.target.value)}
              className="px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-[var(--muted)] text-sm">to</span>
            <input type="date" value={chartEnd} onChange={e => setChartEnd(e.target.value)}
              className="px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <div className="flex border border-[var(--card-border)] rounded-lg overflow-hidden">
              {['bar','line'].map(m => (
                <button key={m} onClick={() => setChartMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    chartMode === m ? 'bg-indigo-600 text-white' : 'text-[var(--muted)] hover:bg-[var(--muted-bg)]'
                  }`}>{m}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {ALL_EVENT_TYPES.map(t => (
                <button key={t} onClick={() => toggleChartType(t)}
                  className={`px-2 py-1 rounded-full text-xs font-medium border capitalize transition-colors ${
                    chartTypes.includes(t)
                      ? 'text-white border-transparent'
                      : 'text-[var(--muted)] border-[var(--card-border)]'
                  }`}
                  style={chartTypes.includes(t) ? { backgroundColor: CHART_COLORS[t] || '#6366f1' } : {}}>
                  {t.replace(/_/g,' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-[var(--muted)] text-sm">No data in range</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            {chartMode === 'bar' ? (
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                {chartTypes.map(t => (
                  <Bar
                    key={t}
                    dataKey={t}
                    stackId="a"
                    fill={CHART_COLORS[t] || '#6366f1'}
                    radius={[2,2,0,0]}
                    cursor="pointer"
                    onClick={(data) => handleChartClick(data.payload, t)}
                  />
                ))}
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                {chartTypes.map(t => (
                  <Line
                    key={t}
                    type="monotone"
                    dataKey={t}
                    stroke={CHART_COLORS[t] || '#6366f1'}
                    strokeWidth={2}
                    dot={false}
                    cursor="pointer"
                    onClick={(data) => handleChartClick(data.payload, t)}
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Analytics Dashboard (12 widgets) */}
      <CheckpointDashboard events={events} />

      {/* Security Events Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--card-border)]">
          <h3 className="font-semibold text-[var(--foreground)] mb-3">Security Events ({filteredTableEvents.length})</h3>
          {/* Type filter tabs */}
          <div className="flex flex-wrap gap-2">
            {tableEventTypes.map(t => (
              <button key={t} onClick={() => { setTableFilter(t); setTablePage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  tableFilter === t
                    ? 'bg-indigo-600 text-white'
                    : 'text-[var(--muted)] border border-[var(--card-border)] hover:bg-[var(--muted-bg)]'
                }`}>{t.replace(/_/g,' ')}</button>
            ))}
          </div>
        </div>

        {pagedTableEvents.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)]">No events. Sync in Settings to load data.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted-bg)] text-left">
                  {['Type','State','Severity','Sender','Description','Date'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {pagedTableEvents.map((ev, i) => (
                  <tr key={ev.eventId || i} className="hover:bg-[var(--muted-bg)] cursor-pointer" onClick={() => setSelectedEvent(ev)}>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize" style={{
                        backgroundColor: `${CHART_COLORS[ev.type] || '#6366f1'}20`,
                        color: CHART_COLORS[ev.type] || '#6366f1',
                      }}>{ev.type?.replace(/_/g,' ') || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`w-2 h-2 rounded-full inline-block mr-1.5 ${
                        ev.state === 'new' || ev.state === 'pending' ? 'bg-red-500' :
                        ev.state === 'remediated' || ev.state === 'closed' ? 'bg-green-500' : 'bg-amber-400'
                      }`} />
                      <span className="text-xs capitalize text-[var(--foreground)]">{ev.state || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)]">{ev.severity || '—'}</td>
                    <td className="px-4 py-3 text-xs text-[var(--foreground)] max-w-xs truncate">{ev.senderAddress || '—'}</td>
                    {/* <td className="px-4 py-3 text-xs text-[var(--foreground)] max-w-xs truncate">{ev.receiverAddress || '—'}</td> */}
                    <td className="px-4 py-3 text-xs text-[var(--muted)] max-w-xs truncate">{ev.description || '—'}</td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)]">{ev.eventCreated ? new Date(ev.eventCreated).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalTablePages > 1 && (
          <div className="px-6 py-4 border-t border-[var(--card-border)] flex items-center justify-between">
            <span className="text-sm text-[var(--muted)]">Page {tablePage} of {totalTablePages}</span>
            <div className="flex gap-2">
              <button disabled={tablePage === 1} onClick={() => setTablePage(p => p-1)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium border border-[var(--card-border)] text-[var(--foreground)] disabled:opacity-40 hover:bg-[var(--muted-bg)]">
                Prev
              </button>
              <button disabled={tablePage === totalTablePages} onClick={() => setTablePage(p => p+1)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium border border-[var(--card-border)] text-[var(--foreground)] disabled:opacity-40 hover:bg-[var(--muted-bg)]">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedEvent && <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  );
}
