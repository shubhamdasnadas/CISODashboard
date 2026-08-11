import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveGridLayout, noCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../api.js';
import { useOrg } from '../context/OrgContext.jsx';

import {
  FIREWALL_REPORTS, COLORS, GRID_BREAKPOINTS, GRID_COLS,
  DEFAULT_BOXES, WIDGET_OPTIONS,
  clampLayoutItem, normalizeSavedBoxes, makeResponsiveLayouts, clampGridItem,
  parseAxis, getNum, extractTable, buildRiskTrendData,
} from './dashboard/helpers.js';
import DynChart from './dashboard/DynChart.jsx';
import FwGraphWidget from './dashboard/FwGraphWidget.jsx';
import S1ConfigWidget from './dashboard/S1ConfigWidget.jsx';
import CheckpointWidgetPicker from './dashboard/CheckpointWidgetPicker.jsx';
import SentinelOneWidgetPicker from './dashboard/SentinelOneWidgetPicker.jsx';
import ZohoTicketMatrix from './zoho/ZohoTicketMatrix.jsx';
import AllCommonmttr from './CyberHygen/AllCommonmttr.jsx';

// ── Small UI helpers ────────────────────────────────────────────────────────────
function Spin() {
  return (
    <div className="flex items-center justify-center h-full min-h-[100px]">
      <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  );
}
function Err({ msg }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[80px] px-4 text-center">
      <p className="text-sm text-red-500 font-medium">{msg}</p>
    </div>
  );
}
function Empty({ msg }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[80px]">
      <p className="text-sm text-[var(--muted)]">{msg}</p>
    </div>
  );
}

// ── Date range filter (per-card) ───────────────────────────────────────────────
function DateRangeMini({ from, to, onChange }) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <input
        type="date"
        value={from || ''}
        max={to || undefined}
        onChange={(e) => onChange({ from: e.target.value, to })}
        className="h-6 px-1 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] text-[9px] leading-none text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-400 w-[86px]"
        title="From date"
      />
      <span className="text-[9px] text-[var(--muted)]">–</span>
      <input
        type="date"
        value={to || ''}
        min={from || undefined}
        onChange={(e) => onChange({ from, to: e.target.value })}
        className="h-6 px-1 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] text-[9px] leading-none text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-400 w-[86px]"
        title="To date"
      />
      {(from || to) && (
        <button
          onClick={() => onChange({ from: '', to: '' })}
          className="w-4 h-4 flex items-center justify-center rounded text-[var(--muted)] hover:text-red-500 flex-shrink-0"
          title="Clear date filter"
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}

// Inclusive date-range check. If no filter is set, everything passes.
function inDateRange(dateVal, from, to) {
  if (!from && !to) return true;
  if (!dateVal) return false;
  const d = new Date(dateVal).getTime();
  if (Number.isNaN(d)) return false;
  if (from && d < new Date(from).getTime()) return false;
  if (to && d > new Date(to).getTime() + 86399999) return false; // include entire "to" day
  return true;
}

// Best-effort date field lookup for records whose shape we don't fully control.
function guessDateValue(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = [
    'createdAt', 'created_at', 'updatedAt', 'updated_at', 'timestamp',
    'date', 'eventTime', 'event_time', 'detectedAt', 'lastSeen', 'last_seen',
    'firstSeen', 'first_seen', 'lastActiveDate', 'registeredAt',
  ];
  for (const c of candidates) if (obj[c]) return obj[c];
  return null;
}

const tooltipStyle = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8 };

const NEWS_SECTIONS = [
  { key: 'cyber', q: 'cybersecurity', label: 'Cybersecurity', sublabel: 'News & Alerts', gradientFrom: '#3b82f6', gradientTo: '#2563eb', textColor: 'text-blue-500', bgColor: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-blue-600 dark:text-blue-400', lineFrom: 'from-blue-200 dark:from-blue-800' },
  { key: 'threats', q: 'malware ransomware exploit', label: 'Threats & Vulnerabilities', sublabel: 'Attack Intelligence', gradientFrom: '#ef4444', gradientTo: '#dc2626', textColor: 'text-red-500', bgColor: 'bg-red-100 dark:bg-red-900/40', iconColor: 'text-red-600 dark:text-red-400', lineFrom: 'from-red-200 dark:from-red-800' },
  { key: 'breaches', q: 'data breach hack leak', label: 'Data Breaches', sublabel: 'Incidents', gradientFrom: '#f97316', gradientTo: '#ea580c', textColor: 'text-orange-500', bgColor: 'bg-orange-100 dark:bg-orange-900/40', iconColor: 'text-orange-600 dark:text-orange-400', lineFrom: 'from-orange-200 dark:from-orange-800' },
];

function NewsSkeletonCard() {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden animate-pulse">
      <div className="h-40 bg-[var(--muted-bg)]" />
      <div className="p-4 space-y-2">
        <div className="h-3 bg-[var(--muted-bg)] rounded w-1/3" />
        <div className="h-4 bg-[var(--muted-bg)] rounded w-full" />
        <div className="h-4 bg-[var(--muted-bg)] rounded w-4/5" />
        <div className="h-3 bg-[var(--muted-bg)] rounded w-2/3 mt-2" />
      </div>
    </div>
  );
}

function NewsArticleCard({ article }) {
  const diffMs = Date.now() - new Date(article.published_at).getTime();
  const h = Math.floor(diffMs / 3_600_000);
  const timeLabel = h < 1 ? `${Math.floor(diffMs / 60000)}m ago` : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
  return (
    <a href={article.url} target="_blank" rel="noopener noreferrer"
      className="group bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-indigo-400 transition-all flex flex-col">
      <div className="h-40 bg-[var(--muted-bg)] overflow-hidden flex-shrink-0">
        {article.url_to_image
          ? <img src={article.url_to_image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { e.target.style.display = 'none'; }} />
          : <div className="w-full h-full flex items-center justify-center"><svg className="w-10 h-10 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-.586-1.414l-4.5-4.5A2 2 0 0014.5 3H12" /></svg></div>
        }
      </div>
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide truncate max-w-[120px]">{article.source_name || 'Unknown'}</span>
          <span className="text-[10px] text-[var(--muted)] flex-shrink-0 ml-2">{timeLabel}</span>
        </div>
        <h2 className="text-sm font-bold text-[var(--foreground)] leading-snug line-clamp-3 mb-2 group-hover:text-indigo-500 transition-colors">{article.title}</h2>
        {article.description && <p className="text-xs text-[var(--muted)] line-clamp-2 flex-1">{article.description}</p>}
        {article.author && <p className="text-[10px] text-[var(--muted)] mt-3 truncate">By {article.author}</p>}
      </div>
    </a>
  );
}

function mapCpEvent(e) {
  return {
    eventId: e.event_id,
    type: e.type,
    state: e.state,
    severity: e.severity,
    confidenceIndicator: e.confidence_indicator,
    description: e.description,
    senderAddress: e.sender_address,
    saas: e.saas,
    entityId: e.entity_id,
    entityLink: e.entity_link,
    additionalData: e.additional_data,
    actions: e.actions,
    eventCreated: e.event_created,
  };
}

// ── Main Dashboard ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();

  // ── S1 data ─────────────────────────────────────────────────────────────────
  const [s1Data, setS1Data] = useState([]);
  const [s1Loading, setS1Loading] = useState(true);
  const [s1Error] = useState('');
  const [agentData, setAgentData] = useState([]);
  const [agentLoading, setAgentLoading] = useState(true);
  const [agentError] = useState('');
  const [appAgentData, setAppAgentData] = useState([]);
  const [appAgentLoading, setAppAgentLoading] = useState(true);
  const [appCveData, setAppCveData] = useState([]);
  const [appCveLoading, setAppCveLoading] = useState(true);
  const [deviceControlData, setDeviceControlData] = useState([]);
  const [deviceControlLoading, setDeviceControlLoading] = useState(true);
  const [rssData, setRssData] = useState([]);
  const [rssLoading, setRssLoading] = useState(true);
  const [mitigationChart, setMitigationChart] = useState('donut');

  // ── Checkpoint ──────────────────────────────────────────────────────────────
  const [cpEvents, setCpEvents] = useState([]);
  const [cpEventsLoading, setCpEventsLoading] = useState(true);

  // ── Firewall ─────────────────────────────────────────────────────────────────
  const [fwWidgets, setFwWidgets] = useState([]);
  const [fwReport, setFwReport] = useState('bandwidth-trend');
  const [fwRaw, setFwRaw] = useState(null);
  const [fwLoading, setFwLoading] = useState(false);
  const [fwError, setFwError] = useState('');
  const [fwXAxis, setFwXAxis] = useState([]);
  const [fwYAxis, setFwYAxis] = useState([]);
  const [fwChartType, setFwChartType] = useState('bar');
  const [showFwX, setShowFwX] = useState(false);
  const [showFwY, setShowFwY] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState(null);

  // ── S1 sync ──────────────────────────────────────────────────────────────────
  const [s1Syncing, setS1Syncing] = useState(false);
  const [s1SyncMsg, setS1SyncMsg] = useState(null);

  // ── News ─────────────────────────────────────────────────────────────────────
  const [newsData, setNewsData] = useState({ cyber: [], threats: [], breaches: [] });
  const [newsLoading, setNewsLoading] = useState({ cyber: true, threats: true, breaches: true });

  // ── Per-card date filters ───────────────────────────────────────────────────
  // Keyed by a stable card id, e.g. 's1-mitigation', `cp-${widgetId}`, `fw-${widgetId}`, `news-${sectionKey}`.
  const [cardRanges, setCardRanges] = useState({});
  const cardRangesRef = useRef({});
  useEffect(() => { cardRangesRef.current = cardRanges; }, [cardRanges]);
  const getRange = useCallback((key) => cardRanges[key] || { from: '', to: '' }, [cardRanges]);
  const setRange = useCallback((key, val) => {
    setCardRanges((prev) => ({ ...prev, [key]: val }));
  }, []);

  // ── Grid layout ──────────────────────────────────────────────────────────────
  const [boxes, setBoxes] = useState(DEFAULT_BOXES);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [activeGridBreakpoint, setActiveGridBreakpoint] = useState('lg');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef(null);

  // ── Edit mode / Add Widget modal ──────────────────────────────────────────────
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [widgetSource, setWidgetSource] = useState('firewall');
  const [cpSelected, setCpSelected] = useState([]);
  const [s1Selected, setS1Selected] = useState([]);

  // ── Section ordering ─────────────────────────────────────────────────────────
  const [sectionOrder, setSectionOrder] = useState(['checkpoint', 'sentinelone', 'firewall']);
  const sectionOrderRef = useRef(['checkpoint', 'sentinelone', 'firewall']);
  const dragSectionRef = useRef(null);

  // ── Visible widget sets ───────────────────────────────────────────────────────
  const [visibleS1Widgets, setVisibleS1Widgets] = useState(['s1-mitigation', 's1-severity', 's1-threats', 's1-agents']);
  const [s1WidgetConfigs, setS1WidgetConfigs] = useState({
    's1-mitigation': { id: 's1-mitigation', viewMode: 'stat' },
    's1-severity': { id: 's1-severity', viewMode: 'stat' },
    's1-threats': { id: 's1-threats', viewMode: 'table' },
    's1-agents': { id: 's1-agents', viewMode: 'table' },
  });
  const [visibleCpWidgets, setVisibleCpWidgets] = useState([]);

  // keep refs in sync for debounced persist
  const visibleS1Ref = useRef(['s1-mitigation', 's1-severity', 's1-threats', 's1-agents']);
  const s1ConfigsRef = useRef(s1WidgetConfigs);
  const visibleCpRef = useRef([]);

  useEffect(() => { visibleS1Ref.current = visibleS1Widgets; }, [visibleS1Widgets]);
  useEffect(() => { s1ConfigsRef.current = s1WidgetConfigs; }, [s1WidgetConfigs]);
  useEffect(() => { visibleCpRef.current = visibleCpWidgets; }, [visibleCpWidgets]);
  useEffect(() => { sectionOrderRef.current = sectionOrder; }, [sectionOrder]);

  // ── Container width (for react-grid-layout) ───────────────────────────────────
  const [containerWidth, setContainerWidth] = useState(typeof window !== 'undefined' ? window.innerWidth - 240 : 1200);
  const containerRef = useRef(null);
  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (el) { const w = el.getBoundingClientRect().width; if (w > 0) setContainerWidth(w); }
      else setContainerWidth(window.innerWidth - 240);
    };
    update();
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { window.removeEventListener('resize', update); ro.disconnect(); };
  }, []);

  // ── Persist layout (debounced) ─────────────────────────────────────────────────
  const persistLayout = useCallback((nextBoxes, nextSectionOrder) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaving(true);
    saveTimerRef.current = setTimeout(() => {
      const orderToSave = nextSectionOrder ?? sectionOrderRef.current;
      api.put('/dashboard/layout', {
        layout: {
          pgboxes: nextBoxes,
          sectionOrder: orderToSave,
          visibleS1Widgets: visibleS1Ref.current,
          s1WidgetConfigs: s1ConfigsRef.current,
          visibleCpWidgets: visibleCpRef.current,
        },
      })
        .then(() => { setSaved(true); setTimeout(() => setSaved(false), 2500); })
        .catch(() => { })
        .finally(() => setSaving(false));
    }, 800);
  }, []);

  // ── Aggregate data fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentOrg) return;
    api.get('/dashboard/aggregate')
      .then((r) => {
        const agg = r.data;

        // Layout
        if (agg.layout) {
          const saved = Array.isArray(agg.layout?.pgboxes) ? agg.layout.pgboxes : [];
          setBoxes(normalizeSavedBoxes(saved));
          const savedOrder = agg.layout?.sectionOrder;
          if (Array.isArray(savedOrder) && savedOrder.length === 3) {
            setSectionOrder(savedOrder);
            sectionOrderRef.current = savedOrder;
          }
          if (Array.isArray(agg.layout?.visibleS1Widgets) && agg.layout.visibleS1Widgets.length > 0) {
            setVisibleS1Widgets(agg.layout.visibleS1Widgets);
            visibleS1Ref.current = agg.layout.visibleS1Widgets;
          }
          if (agg.layout?.s1WidgetConfigs && typeof agg.layout.s1WidgetConfigs === 'object') {
            setS1WidgetConfigs((prev) => ({ ...prev, ...agg.layout.s1WidgetConfigs }));
            s1ConfigsRef.current = { ...s1ConfigsRef.current, ...agg.layout.s1WidgetConfigs };
          }
          if (Array.isArray(agg.layout?.visibleCpWidgets)) {
            setVisibleCpWidgets(agg.layout.visibleCpWidgets);
            visibleCpRef.current = agg.layout.visibleCpWidgets;
          }
        }
        setLayoutLoaded(true);

        // S1
        if (Array.isArray(agg.sentinelone?.threats)) setS1Data(agg.sentinelone.threats);
        if (Array.isArray(agg.sentinelone?.agents)) setAgentData(agg.sentinelone.agents);
        if (Array.isArray(agg.sentinelone?.applicationAgent)) setAppAgentData(agg.sentinelone.applicationAgent);
        if (Array.isArray(agg.sentinelone?.applicationCve)) setAppCveData(agg.sentinelone.applicationCve);
        if (Array.isArray(agg.sentinelone?.deviceControl)) setDeviceControlData(agg.sentinelone.deviceControl);
        if (Array.isArray(agg.sentinelone?.rss)) setRssData(agg.sentinelone.rss);

        // Harmony
        if (Array.isArray(agg.harmony?.events)) setCpEvents(agg.harmony.events.map(mapCpEvent));

        // Firewall
        if (Array.isArray(agg.firewall?.widgets)) {
          setFwWidgets(agg.firewall.widgets.map((w) => ({
            ...w,
            x: Number(w.x ?? 0), y: Number(w.y ?? 45),
            w: Number(w.w ?? 7), h: Number(w.h ?? 44),
          })));
        }

        // Clear loading
        setS1Loading(false); setAgentLoading(false); setAppAgentLoading(false);
        setAppCveLoading(false); setDeviceControlLoading(false); setRssLoading(false);
        setCpEventsLoading(false);
      })
      .catch(() => {
        setS1Loading(false); setAgentLoading(false); setAppAgentLoading(false);
        setAppCveLoading(false); setDeviceControlLoading(false); setRssLoading(false);
        setCpEventsLoading(false); setLayoutLoaded(true);
      });
  }, [currentOrg?.id]);

  // ── Firewall report preview (for Add Widget modal) ─────────────────────────────
  useEffect(() => {
    if (!currentOrg || !fwReport) return;
    setFwLoading(true); setFwError(''); setFwRaw(null);
    api.get(`/firewall/reports/${fwReport}`)
      .then((r) => {
        const d = r.data;
        if (d.message && d.data === undefined) setFwError(d.message);
        else setFwRaw(d.data ?? null);
      })
      .catch(() => setFwError('Network error'))
      .finally(() => setFwLoading(false));
  }, [currentOrg?.id, fwReport]);

  // Auto-select axes when firewall data loads
  useEffect(() => {
    const table = fwRaw ? extractTable(fwRaw) : null;
    if (!table?.columns?.length) return;
    const cols = table.columns;
    const numCol = cols.find((c) => table.rows.some((r) => getNum(r[c]) > 0)) || cols[1] || cols[0];
    setFwXAxis((prev) => prev.length ? prev : [cols[0]]);
    setFwYAxis((prev) => prev.length ? prev : [numCol]);
  }, [fwRaw]);

  // ── News feed ──────────────────────────────────────────────────────────────────
  // Refetches whenever a news section's own per-card date range changes.
  const newsRangesKey = JSON.stringify(NEWS_SECTIONS.map((s) => cardRanges[`news-${s.key}`] || {}));
  useEffect(() => {
    if (!currentOrg) return;
    NEWS_SECTIONS.forEach(({ key, q }) => {
      const range = cardRangesRef.current[`news-${key}`] || {};
      setNewsLoading((prev) => ({ ...prev, [key]: true }));
      const params = new URLSearchParams({ q, limit: '8' });
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      api.get(`/news?${params.toString()}`)
        .then((r) => setNewsData((prev) => ({ ...prev, [key]: r.data?.articles ?? [] })))
        .catch(() => setNewsData((prev) => ({ ...prev, [key]: [] })))
        .finally(() => setNewsLoading((prev) => ({ ...prev, [key]: false })));
    });
  }, [currentOrg?.id, newsRangesKey]);

  // ── Section drag-to-reorder ────────────────────────────────────────────────────
  function moveSection(target) {
    const dragged = dragSectionRef.current;
    if (!dragged || dragged === target) return;
    setSectionOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(dragged);
      const to = next.indexOf(target);
      next.splice(from, 1);
      next.splice(to, 0, dragged);
      sectionOrderRef.current = next;
      persistLayout(boxes, next);
      return next;
    });
  }

  // ── Grid layout change ─────────────────────────────────────────────────────────
  function handleLayoutChange(newLayout, allLayouts) {
    if (!isEditMode) return;
    const layoutToSave = activeGridBreakpoint === 'lg' ? newLayout : (allLayouts.lg ?? []);
    if (layoutToSave.length === 0) return;
    const nextBoxes = boxes.map((box) => {
      const l = layoutToSave.find((n) => n.i === box.i);
      if (!l) return box;
      if (box.i.startsWith('s1-') && !visibleS1Ref.current.includes(box.i)) return box;
      return clampLayoutItem({ ...box, x: l.x, y: l.y, w: l.w, h: l.h }, GRID_COLS.lg);
    });
    setFwWidgets((prev) => prev.map((widget) => {
      const l = layoutToSave.find((n) => n.i === widget.id);
      if (!l) return widget;
      const next = clampLayoutItem({ ...widget, x: l.x, y: l.y, w: l.w, h: l.h }, GRID_COLS.lg);
      api.put(`/firewall/widgets/${widget.id}`, { x: next.x, y: next.y, w: next.w, h: next.h }).catch(() => { });
      return next;
    }));
    setBoxes(nextBoxes);
    persistLayout(nextBoxes);
  }

  function handleDoneEditing() {
    setIsEditMode(false);
    persistLayout(boxes);
  }

  // ── Sync handlers ──────────────────────────────────────────────────────────────
  async function handleS1Sync() {
    setS1Syncing(true); setS1SyncMsg(null);
    try {
      const r = await api.post('/sentinelone/sync');
      setS1SyncMsg({ text: r.data?.message || 'Done', ok: r.status < 400 });
      if (r.status < 400) {
        setS1Loading(true);
        api.get('/sentinelone/threats').then((x) => { setS1Data(x.data?.data || []); }).finally(() => setS1Loading(false));
        setAgentLoading(true);
        api.get('/sentinelone/sentinalone_agentinfo').then((x) => { setAgentData(Array.isArray(x.data?.data) ? x.data.data : []); }).finally(() => setAgentLoading(false));
      }
    } catch (e) {
      setS1SyncMsg({ text: e.response?.data?.message || 'Sync failed', ok: false });
    } finally {
      setS1Syncing(false);
    }
  }

  async function handleCollect() {
    setCollecting(true); setCollectMsg(null);
    try {
      const r = await api.post('/firewall/collect');
      setCollectMsg({ text: r.data?.message || 'Done', ok: r.status < 400 });
    } catch (e) {
      setCollectMsg({ text: e.response?.data?.message || 'Collection failed', ok: false });
    } finally {
      setCollecting(false);
    }
  }

  // ── Add firewall widget ────────────────────────────────────────────────────────
  async function handleAddFwWidget() {
    if (!fwXAxis.length || !fwYAxis.length) return;
    const nextY = fwWidgets.length > 0 ? Math.max(...fwWidgets.map((w) => Number(w.y ?? 0) + Number(w.h ?? 44))) : 0;
    const payload = { reportName: fwReport, xAxis: fwXAxis, yAxis: fwYAxis, chartType: fwYAxis.length > 1 ? 'mixed' : fwChartType, x: 0, y: nextY, w: 7, h: 44 };
    const r = await api.post('/firewall/widgets', payload);
    if (r.status < 400 && r.data?.widget) {
      const w = r.data.widget;
      setFwWidgets((prev) => [...prev, { ...w, x: Number(w.x ?? 0), y: Number(w.y ?? nextY), w: Number(w.w ?? 7), h: Number(w.h ?? 44) }]);
    }
  }

  async function handleDeleteFwWidget(id) {
    await api.delete(`/firewall/widgets/${id}`).catch(() => { });
    setFwWidgets((prev) => prev.filter((w) => w.id !== id));
  }

  // ── Widget visibility togglers ─────────────────────────────────────────────────
  function removeS1Widget(id) {
    const next = visibleS1Ref.current.filter((w) => w !== id);
    visibleS1Ref.current = next;
    setVisibleS1Widgets(next);
    persistLayout(boxes);
  }
  function removeCpWidget(id) {
    const next = visibleCpRef.current.filter((w) => w !== id);
    visibleCpRef.current = next;
    setVisibleCpWidgets(next);
    persistLayout(boxes);
  }

  function toggleAxis(col, list, setter, max = 2) {
    setter((prev) => {
      if (prev.includes(col)) return prev.filter((v) => v !== col);
      if (prev.length >= max) return prev;
      return [...prev, col];
    });
  }

  // ── Derived data (each per-card, filtered by that card's own date range) ──────
  const mitigationRange = getRange('s1-mitigation');
  const mitigationSourceData = s1Data.filter((t) => inDateRange(t.threatInfo?.createdAt, mitigationRange.from, mitigationRange.to));
  const mitigationCounts = {};
  mitigationSourceData.forEach((t) => { const s = t.threatInfo?.mitigationStatus || 'unknown'; mitigationCounts[s] = (mitigationCounts[s] || 0) + 1; });
  const mitigationData = Object.entries(mitigationCounts).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
  const mitigationTotal = mitigationData.reduce((s, d) => s + d.value, 0);

  const severityRange = getRange('s1-severity');
  const severitySourceData = s1Data.filter((t) => inDateRange(t.threatInfo?.createdAt, severityRange.from, severityRange.to));
  const severityCounts = {};
  severitySourceData.forEach((t) => { const s = t.threatInfo?.confidenceLevel || 'unknown'; severityCounts[s] = (severityCounts[s] || 0) + 1; });
  const severityData = Object.entries(severityCounts).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));

  const threatsRange = getRange('s1-threats');
  const recentThreats = [...s1Data]
    .filter((t) => inDateRange(t.threatInfo?.createdAt, threatsRange.from, threatsRange.to))
    .sort((a, b) => new Date(b.threatInfo?.createdAt || 0) - new Date(a.threatInfo?.createdAt || 0))
    .slice(0, 15);

  const agentsRange = getRange('s1-agents');
  const filteredAgentData = agentData.filter((a) => inDateRange(guessDateValue(a), agentsRange.from, agentsRange.to));
  const activeAgents = filteredAgentData.filter((a) => a.isActive).length;
  const inactiveAgents = filteredAgentData.filter((a) => !a.isActive).length;

  const appAgentRange = getRange('s1-app-agent');
  const filteredAppAgentData = appAgentData.filter((a) => inDateRange(guessDateValue(a), appAgentRange.from, appAgentRange.to));

  const appCveRange = getRange('s1-app-cve');
  const filteredAppCveData = appCveData.filter((a) => inDateRange(guessDateValue(a), appCveRange.from, appCveRange.to));

  const deviceControlRange = getRange('s1-device-control');
  const filteredDeviceControlData = deviceControlData.filter((a) => inDateRange(guessDateValue(a), deviceControlRange.from, deviceControlRange.to));

  const rssRange = getRange('s1-rss');
  const filteredRssData = rssData.filter((item) => inDateRange(item.published || item.pubDate || item.date || guessDateValue(item), rssRange.from, rssRange.to));

  const fwTable = fwRaw ? extractTable(fwRaw) : null;
  const fwColumns = fwTable?.columns ?? [];

  // ── Grid items ─────────────────────────────────────────────────────────────────
  const s1AllItems = boxes
    .filter((b) => b.i.startsWith('s1-') && visibleS1Widgets.includes(b.i))
    .map((b) => ({ i: b.i, x: b.x, y: b.y, w: b.w, h: b.h, minW: 2, minH: 20, static: false }));

  const fwGridItems = fwWidgets.map((w) => ({
    i: w.id, x: Number(w.x ?? 0), y: Number(w.y ?? 45), w: Number(w.w ?? 7), h: Number(w.h ?? 44), minW: 3, minH: 20,
  }));

  const s1Layouts = makeResponsiveLayouts(s1AllItems);
  const fwLayouts = makeResponsiveLayouts(fwGridItems);

  // ── Early return — no org ──────────────────────────────────────────────────────
  if (!currentOrg) {
    return (
      <div className="p-8">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6">
          <h3 className="font-semibold text-amber-800 dark:text-amber-300">No Organization Selected</h3>
          <p className="text-amber-700 dark:text-amber-400 mt-1 text-sm">Select an organization from the top bar to view the dashboard.</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-5 lg:p-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">Dashboard</h1>
          {isEditMode && <p className="text-xs text-indigo-500 mt-0.5">Edit mode — drag sections &amp; resize widgets</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saving && <span className="text-xs text-[var(--muted)] flex items-center gap-1.5"><div className="animate-spin w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full" />Saving…</span>}
          {saved && <span className="text-xs text-green-600 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Saved</span>}
          <button
            onClick={() => isEditMode ? handleDoneEditing() : setIsEditMode(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${isEditMode ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-[var(--card-bg)] text-[var(--foreground)] border-[var(--card-border)] hover:border-indigo-400 hover:text-indigo-600'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            {isEditMode ? 'Done Editing' : 'Edit Layout'}
          </button>
          <button
            onClick={() => setShowAddWidget(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-600 transition-all shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            Add Widget
          </button>
        </div>
      </div>

      {/* Edit mode banner */}
      {isEditMode && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 flex items-center gap-2.5">
          <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">Drag section headers to reorder · Drag widget title bars to move · Pull widget edges to resize</p>
          <button onClick={handleDoneEditing} className="ml-auto text-indigo-500 hover:text-indigo-700 text-xs font-semibold">Done</button>
        </div>
      )}

      {/* ── Add Widget Modal ──────────────────────────────────────────────────── */}
      {showAddWidget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowAddWidget(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-widest">Dashboard</p>
                  <p className="text-sm font-bold text-[var(--foreground)]">Add Widget</p>
                </div>
              </div>
              <button onClick={() => setShowAddWidget(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--muted)] hover:bg-[var(--card-border)] hover:text-[var(--foreground)] transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-[var(--card-border)] bg-[var(--muted-bg)]">
              {[
                { key: 'checkpoint', label: 'Checkpoint', color: 'indigo', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
                { key: 'sentinelone', label: 'SentinelOne', color: 'emerald', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
                { key: 'firewall', label: 'Palo Alto Firewall', color: 'orange', icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
              ].map((tab) => {
                const isActive = widgetSource === tab.key;
                const clsMap = {
                  indigo: isActive ? 'border-b-2 border-indigo-500 text-indigo-600 bg-[var(--card-bg)]' : 'text-[var(--muted)] hover:text-indigo-500 hover:bg-[var(--card-bg)]',
                  emerald: isActive ? 'border-b-2 border-emerald-500 text-emerald-600 bg-[var(--card-bg)]' : 'text-[var(--muted)] hover:text-emerald-500 hover:bg-[var(--card-bg)]',
                  orange: isActive ? 'border-b-2 border-orange-500 text-orange-600 bg-[var(--card-bg)]' : 'text-[var(--muted)] hover:text-orange-500 hover:bg-[var(--card-bg)]',
                };
                return (
                  <button key={tab.key} onClick={() => setWidgetSource(tab.key)}
                    className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold transition-all flex-1 justify-center ${clsMap[tab.color]}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} /></svg>
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab body */}
            <div className="max-h-[65vh] overflow-y-auto">
              {widgetSource === 'checkpoint' && (
                <CheckpointWidgetPicker
                  selected={cpSelected}
                  onToggle={(id) => setCpSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
                  onAdd={(ids) => {
                    setVisibleCpWidgets((prev) => { const next = Array.from(new Set([...prev, ...ids])); visibleCpRef.current = next; return next; });
                    setCpSelected([]); setShowAddWidget(false); persistLayout(boxes);
                  }}
                  onCancel={() => setShowAddWidget(false)}
                />
              )}

              {widgetSource === 'sentinelone' && (
                <SentinelOneWidgetPicker
                  selected={s1Selected}
                  onToggle={(id) => setS1Selected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
                  onAdd={(configs) => {
                    const ids = configs.map((c) => c.id);
                    const nextVisible = Array.from(new Set([...visibleS1Ref.current, ...ids]));
                    visibleS1Ref.current = nextVisible; setVisibleS1Widgets(nextVisible);
                    const nextConfigs = { ...s1ConfigsRef.current };
                    configs.forEach((c) => { nextConfigs[c.id] = c; });
                    s1ConfigsRef.current = nextConfigs; setS1WidgetConfigs(nextConfigs);
                    setBoxes((prev) => {
                      const existingIds = new Set(prev.map((b) => b.i));
                      const newBoxes = ids.filter((id) => !existingIds.has(id)).map((id, idx) => {
                        const s1Boxes = prev.filter((b) => b.i.startsWith('s1-'));
                        const maxY = s1Boxes.length > 0 ? Math.max(...s1Boxes.map((b) => b.y + b.h)) : 0;
                        return { i: id, x: (idx % 4) * 3, y: maxY + Math.floor(idx / 4) * 33, w: 3, h: 33 };
                      });
                      const finalBoxes = newBoxes.length > 0 ? [...prev, ...newBoxes] : prev;
                      persistLayout(finalBoxes);
                      return finalBoxes;
                    });
                    setS1Selected([]); setShowAddWidget(false);
                  }}
                  onCancel={() => setShowAddWidget(false)}
                />
              )}

              {widgetSource === 'firewall' && (
                <div className="p-5 space-y-4">
                  {/* Report selector */}
                  <div>
                    <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider block mb-1.5">Report</label>
                    <select value={fwReport} onChange={(e) => { setFwReport(e.target.value); setFwXAxis([]); setFwYAxis([]); }}
                      className="w-full h-9 border border-[var(--input-border)] rounded-lg px-3 text-sm font-medium text-[var(--foreground)] bg-[var(--card-bg)] focus:outline-none focus:ring-2 focus:ring-indigo-400">
                      {FIREWALL_REPORTS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  {/* Axis row */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* X-Axis */}
                    <div className="relative">
                      <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider block mb-1.5">X-Axis</label>
                      <button type="button" onClick={() => { setShowFwX((p) => !p); setShowFwY(false); }}
                        className={`w-full h-9 border rounded-lg px-3 text-sm font-medium flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors ${fwXAxis.length ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'border-[var(--input-border)] bg-[var(--card-bg)] text-[var(--muted)]'}`}>
                        <span className="truncate flex-1 text-left text-xs">{fwXAxis.length === 0 ? 'Select column…' : fwXAxis.length === 1 ? fwXAxis[0] : `${fwXAxis.length} selected`}</span>
                        <svg className="w-3 h-3 flex-shrink-0 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {showFwX && (
                        <div className="absolute z-50 top-full mt-1 left-0 right-0 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] shadow-2xl overflow-hidden">
                          <div className="px-3 py-2 bg-[var(--muted-bg)] border-b border-[var(--card-border)] flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">X-Axis Columns</span>
                            {fwXAxis.length > 0 && <button onClick={() => setFwXAxis([])} className="text-[10px] text-red-500 hover:text-red-700 font-medium">Clear</button>}
                          </div>
                          <div className="max-h-44 overflow-auto p-1.5">
                            {fwColumns.length === 0
                              ? <p className="text-xs text-[var(--muted)] px-3 py-2">No columns — select a report first</p>
                              : fwColumns.map((col) => {
                                const isChecked = fwXAxis.includes(col);
                                const isDisabled = !isChecked && fwXAxis.length >= 2;
                                return (
                                  <label key={col} className={`flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg transition-colors ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--muted-bg)]'} ${isChecked ? 'text-blue-700 dark:text-blue-300 font-semibold' : 'text-[var(--foreground)]'}`}>
                                    <input type="checkbox" checked={isChecked} disabled={isDisabled} onChange={() => toggleAxis(col, fwXAxis, setFwXAxis)} className="w-3.5 h-3.5 accent-indigo-500" />
                                    <span className="truncate">{col}</span>
                                  </label>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Y-Axis */}
                    <div className="relative">
                      <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider block mb-1.5">Y-Axis</label>
                      <button type="button" onClick={() => { setShowFwY((p) => !p); setShowFwX(false); }}
                        className={`w-full h-9 border rounded-lg px-3 text-sm font-medium flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors ${fwYAxis.length ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'border-[var(--input-border)] bg-[var(--card-bg)] text-[var(--muted)]'}`}>
                        <span className="truncate flex-1 text-left text-xs">{fwYAxis.length === 0 ? 'Select column…' : fwYAxis.length === 1 ? fwYAxis[0] : `${fwYAxis.length} selected`}</span>
                        <svg className="w-3 h-3 flex-shrink-0 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {showFwY && (
                        <div className="absolute z-50 top-full mt-1 left-0 right-0 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] shadow-2xl overflow-hidden">
                          <div className="px-3 py-2 bg-[var(--muted-bg)] border-b border-[var(--card-border)] flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Y-Axis Columns</span>
                            {fwYAxis.length > 0 && <button onClick={() => setFwYAxis([])} className="text-[10px] text-red-500 hover:text-red-700 font-medium">Clear</button>}
                          </div>
                          <div className="max-h-44 overflow-auto p-1.5">
                            {fwColumns.length === 0
                              ? <p className="text-xs text-[var(--muted)] px-3 py-2">No columns — select a report first</p>
                              : fwColumns.map((col) => {
                                const isChecked = fwYAxis.includes(col);
                                const isDisabled = !isChecked && fwYAxis.length >= 2;
                                return (
                                  <label key={col} className={`flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg transition-colors ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--muted-bg)]'} ${isChecked ? 'text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-[var(--foreground)]'}`}>
                                    <input type="checkbox" checked={isChecked} disabled={isDisabled} onChange={() => toggleAxis(col, fwYAxis, setFwYAxis)} className="w-3.5 h-3.5 accent-indigo-500" />
                                    <span className="truncate">{col}</span>
                                  </label>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chart type */}
                  <div>
                    <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider block mb-1.5">Chart Type</label>
                    <div className="flex rounded-lg border border-[var(--input-border)] overflow-hidden bg-[var(--card-bg)] w-fit">
                      {['bar', 'line', 'mixed'].map((ct) => (
                        <button key={ct} type="button" onClick={() => setFwChartType(ct)} disabled={fwYAxis.length > 1}
                          className={`px-4 py-2 text-xs font-semibold transition-colors border-r last:border-r-0 border-[var(--input-border)] disabled:opacity-40 ${(fwYAxis.length > 1 ? 'mixed' : fwChartType) === ct ? 'bg-indigo-600 text-white' : 'text-[var(--muted)] hover:bg-[var(--muted-bg)]'}`}>
                          {ct === 'bar' ? 'Bar' : ct === 'line' ? 'Line' : 'Mixed'}
                        </button>
                      ))}
                    </div>
                    {fwYAxis.length > 1 && <p className="text-[10px] text-[var(--muted)] mt-1">Mixed chart auto-selected for multiple Y columns</p>}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-[var(--card-border)] pt-4 flex items-center justify-end gap-2">
                    <button onClick={() => setShowAddWidget(false)} className="px-4 py-2 rounded-lg text-xs font-semibold text-[var(--muted)] hover:bg-[var(--card-border)] transition-colors">Cancel</button>
                    <button onClick={async () => { await handleAddFwWidget(); setShowAddWidget(false); }} disabled={!fwXAxis.length || !fwYAxis.length}
                      className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-indigo-900 text-white transition-colors shadow-sm disabled:cursor-not-allowed">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                      Add Widget
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ── Section Grid ────────────────────────────────────────────────────── */}
      <div className="flex flex-col divide-y divide-[var(--card-border)]">
        {sectionOrder.map((section) => {

          /* ─ CHECKPOINT ─ */
          if (section === 'checkpoint') return (
            <div key="checkpoint" onDragOver={(e) => { e.preventDefault(); moveSection('checkpoint'); }} className="group/sec">
              <div className="pt-4 pb-5">
                {/* Section header */}
                <div
                  draggable={isEditMode}
                  onDragStart={(e) => { if (!isEditMode) return; e.stopPropagation(); dragSectionRef.current = 'checkpoint'; }}
                  onDragEnd={(e) => { e.stopPropagation(); dragSectionRef.current = null; }}
                  className={`flex items-center gap-3 mb-4 select-none rounded-xl px-3 py-2 transition-all duration-200 ${isEditMode ? 'cursor-move bg-indigo-50/50 dark:bg-indigo-900/10 border border-dashed border-indigo-300 dark:border-indigo-700' : 'cursor-default'}`}
                >
                  <div className="w-1.5 h-7 rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600 flex-shrink-0 shadow-sm" />
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest leading-none">Security</p>
                      <h2 className="text-sm font-bold text-[var(--foreground)] leading-tight">Checkpoint Harmony</h2>
                    </div>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-indigo-200 via-[var(--card-border)] to-transparent dark:from-indigo-800" />
                  {isEditMode && <span className="text-[10px] text-indigo-400 font-medium flex items-center gap-1 flex-shrink-0"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>drag</span>}
                </div>

                {/* Checkpoint widget cards */}
                {visibleCpWidgets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-indigo-200 dark:border-indigo-800 rounded-2xl bg-indigo-50/30 dark:bg-indigo-900/10">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center mb-3">
                      <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                    </div>
                    <p className="text-sm font-semibold text-[var(--foreground)] mb-1">No widgets added yet</p>
                    <p className="text-xs text-[var(--muted)]">Click "Add Widget" → Checkpoint to add cards here</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {visibleCpWidgets.map((id, idx) => {
                      const opt = WIDGET_OPTIONS.find((w) => w.id === id);
                      if (!opt) return null;
                      const cpRange = getRange(`cp-${id}`);
                      const filtered = cpEvents.filter((e) => opt.eventTypes.includes(e.type) && inDateRange(e.eventCreated, cpRange.from, cpRange.to));
                      const total = filtered.length;
                      const pending = filtered.filter((e) => e.state === 'new' || e.state === 'pending').length;
                      const remediated = filtered.filter((e) => ['remediated', 'closed', 'done'].includes(e.state)).length;
                      const remPct = total > 0 ? Math.round((remediated / total) * 100) : 0;
                      const pendPct = total > 0 ? Math.round((pending / total) * 100) : 0;
                      return (
                        <div key={id} className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200" style={{ animationDelay: `${idx * 60}ms` }}>
                          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-50 to-transparent dark:from-indigo-900/20 dark:to-transparent border-b border-[var(--card-border)]">
                            <div>
                              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Checkpoint</p>
                              <p className="text-sm font-bold text-[var(--foreground)]">{opt.label}</p>
                            </div>
                            <button onClick={() => removeCpWidget(id)}
                              className={`w-6 h-6 flex items-center justify-center rounded-lg text-[var(--muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                              title="Remove widget">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                          <div className="px-4 pt-2.5 pb-1 flex items-center justify-between">
                            <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Date range</span>
                            <DateRangeMini from={cpRange.from} to={cpRange.to} onChange={(v) => setRange(`cp-${id}`, v)} />
                          </div>
                          <div className="p-4 pt-2">
                            {cpEventsLoading ? (
                              <div className="flex items-center justify-center py-4"><div className="animate-spin w-5 h-5 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
                            ) : total === 0 ? (
                              <p className="text-xs text-[var(--muted)] text-center py-3">No events</p>
                            ) : (
                              <>
                                <div className="flex items-end justify-between mb-3">
                                  <span className="text-3xl font-bold text-[var(--foreground)]">{total}</span>
                                  <span className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wide pb-1">Total Events</span>
                                </div>
                                <div className="space-y-2">
                                  <div>
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className="text-green-600 dark:text-green-400 font-medium">Remediated</span>
                                      <span className="font-semibold text-[var(--foreground)]">{remPct}%</span>
                                    </div>
                                    <div className="w-full bg-[var(--muted-bg)] rounded-full h-1.5 overflow-hidden">
                                      <div className="h-1.5 rounded-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-700" style={{ width: `${remPct}%` }} />
                                    </div>
                                  </div>
                                  <div>
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className="text-red-500 font-medium">Pending</span>
                                      <span className="font-semibold text-[var(--foreground)]">{pendPct}%</span>
                                    </div>
                                    <div className="w-full bg-[var(--muted-bg)] rounded-full h-1.5 overflow-hidden">
                                      <div className="h-1.5 rounded-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-700" style={{ width: `${pendPct}%` }} />
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-1">
                                  {opt.eventTypes.map((t) => (
                                    <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 capitalize">{t.replace(/_/g, ' ')}</span>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );

          /* ─ SENTINELONE ─ */
          if (section === 'sentinelone') return (
            <div key="sentinelone" onDragOver={(e) => { e.preventDefault(); moveSection('sentinelone'); }} className="group/sec">
              <div className="pt-4 pb-2">
                {/* Section header */}
                <div
                  draggable
                  onDragStart={(e) => { e.stopPropagation(); dragSectionRef.current = 'sentinelone'; }}
                  onDragEnd={(e) => { e.stopPropagation(); dragSectionRef.current = null; }}
                  className="flex items-center gap-3 mb-3 cursor-move select-none rounded-xl px-3 py-2 transition-all duration-200 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10"
                >
                  <div className="w-1.5 h-7 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 flex-shrink-0 shadow-sm" />
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest leading-none">Endpoint</p>
                      <h2 className="text-sm font-bold text-[var(--foreground)] leading-tight">SentinelOne</h2>
                    </div>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 via-[var(--card-border)] to-transparent dark:from-emerald-800" />
                  <button onClick={(e) => { e.stopPropagation(); handleS1Sync(); }} disabled={s1Syncing}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-50 transition-all duration-150 flex-shrink-0 border border-emerald-200 dark:border-emerald-700">
                    {s1Syncing
                      ? <><div className="animate-spin w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full" />Syncing…</>
                      : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Sync</>
                    }
                  </button>
                </div>

                {s1SyncMsg && (
                  <div className={`mb-3 px-3 py-2 rounded-lg text-xs border flex items-center gap-2 ${s1SyncMsg.ok ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'}`}>
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s1SyncMsg.ok ? 'M5 13l4 4L19 7' : 'M12 9v2m0 4h.01'} /></svg>
                    {s1SyncMsg.text}
                  </div>
                )}
              </div>

              {/* S1 widget grid */}
              {visibleS1Widgets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-emerald-200 dark:border-emerald-800 rounded-2xl bg-emerald-50/30 dark:bg-emerald-900/10 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                  </div>
                  <p className="text-sm font-semibold text-[var(--foreground)] mb-1">No widgets added yet</p>
                  <p className="text-xs text-[var(--muted)]">Click "Add Widget" → SentinelOne to add widgets here</p>
                </div>
              ) : (
                <div ref={containerRef} className="w-full min-w-0" onDragStart={(e) => e.stopPropagation()}>
                  <ResponsiveGridLayout
                    className="layout"
                    layouts={s1Layouts}
                    breakpoints={GRID_BREAKPOINTS}
                    cols={GRID_COLS}
                    rowHeight={10}
                    width={containerWidth}
                    onLayoutChange={handleLayoutChange}
                    onBreakpointChange={(bp) => setActiveGridBreakpoint(bp)}
                    compactor={noCompactor}
                    dragConfig={{ enabled: isEditMode, handle: '.drag-handle' }}
                    resizeConfig={{ enabled: isEditMode, handles: ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne'] }}
                    margin={[10, 10]}
                  >
                    {/* Mitigation Status */}
                    <div key="s1-mitigation" className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-sm flex flex-col overflow-hidden" style={visibleS1Widgets.includes('s1-mitigation') ? {} : { visibility: 'hidden', pointerEvents: 'none' }}>
                      <div className="drag-handle cursor-grab active:cursor-grabbing bg-[var(--muted-bg)] border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0 select-none">
                        <div><p className="text-xs text-[var(--muted)] font-medium">SentinelOne</p><p className="text-sm font-bold text-[var(--foreground)]">Mitigation Status</p></div>
                        <div className="flex gap-1 items-center">
                          {['donut', 'probability', 'bar'].map((ct) => (
                            <button key={ct} onClick={(e) => { e.stopPropagation(); setMitigationChart(ct); }}
                              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${mitigationChart === ct ? 'bg-indigo-600 text-white' : 'bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] hover:bg-[var(--muted-bg)]'}`}>
                              {ct === 'donut' ? 'Donut' : ct === 'probability' ? '%' : 'Bar'}
                            </button>
                          ))}
                          <button onClick={(e) => { e.stopPropagation(); removeS1Widget('s1-mitigation'); }}
                            className={`w-5 h-5 flex items-center justify-center rounded text-[var(--muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors ml-1 flex-shrink-0 ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                          
                        </div>
                      </div>
                      <div className="px-4 pt-2 pb-0 flex items-center justify-between flex-shrink-0">
                        <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Date range</span>
                        <DateRangeMini from={mitigationRange.from} to={mitigationRange.to} onChange={(v) => setRange('s1-mitigation', v)} />
                      </div>
                      <div className="flex-1 min-h-0 p-3 relative">
                        {s1Loading ? <Spin /> : s1Error ? <Err msg={s1Error} /> : mitigationData.length === 0 ? <Empty msg="No mitigation data" /> :
                          mitigationChart === 'bar' ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={mitigationData} margin={{ top: 8, right: 8, left: -10, bottom: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} angle={-20} textAnchor="end" />
                                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'mitigationStatus', value: data.name, title: `Threats with ${data.name} mitigation status` } })}>{mitigationData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          ) : mitigationChart === 'probability' ? (
                            <div className="h-full overflow-auto space-y-3 pt-2 px-1">
                              {mitigationData.map((d) => (
                                <div key={d.name} className="cursor-pointer" onClick={() => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'mitigationStatus', value: d.name, title: `Threats with ${d.name} mitigation status` } })}>
                                  <div className="flex justify-between text-xs text-[var(--muted)] mb-1"><span className="font-medium capitalize">{d.name}</span><span>{mitigationTotal > 0 ? ((d.value / mitigationTotal) * 100).toFixed(1) : 0}%</span></div>
                                  <div className="w-full bg-[var(--muted-bg)] rounded-full h-2.5"><div className="h-2.5 rounded-full" style={{ width: mitigationTotal > 0 ? `${(d.value / mitigationTotal) * 100}%` : '0%', backgroundColor: d.fill }} /></div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="relative h-full flex items-center justify-center">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={mitigationData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="50%" outerRadius="70%" paddingAngle={2} cursor="pointer" onClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'mitigationStatus', value: data.name, title: `Threats with ${data.name} mitigation status` } })}>{mitigationData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Pie>
                                  <Tooltip contentStyle={tooltipStyle} />
                                  <Legend iconSize={9} wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                                </PieChart>
                              </ResponsiveContainer>
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <p className="text-xs text-[var(--muted)]">Total</p>
                                <p className="text-2xl font-bold text-[var(--foreground)]">{mitigationTotal}</p>
                              </div>
                            </div>
                          )
                        }
                      </div>
                    </div>

                    {/* Threat Severity */}
                    <div key="s1-severity" className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-sm flex flex-col overflow-hidden" style={visibleS1Widgets.includes('s1-severity') ? {} : { visibility: 'hidden', pointerEvents: 'none' }}>
                      <div className="drag-handle cursor-grab active:cursor-grabbing bg-[var(--muted-bg)] border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0 select-none">
                        <div><p className="text-xs text-[var(--muted)] font-medium">SentinelOne</p><p className="text-sm font-bold text-[var(--foreground)]">Threat Severity</p></div>
                        <button onClick={(e) => { e.stopPropagation(); removeS1Widget('s1-severity'); }} className={`w-5 h-5 flex items-center justify-center rounded text-[var(--muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors ml-1 flex-shrink-0 ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="px-4 pt-2 pb-0 flex items-center justify-between flex-shrink-0">
                        <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Date range</span>
                        <DateRangeMini from={severityRange.from} to={severityRange.to} onChange={(v) => setRange('s1-severity', v)} />
                      </div>
                      <div className="flex-1 min-h-0 p-3">
                        {s1Loading ? <Spin /> : s1Error ? <Err msg={s1Error} /> : severityData.length === 0 ? <Empty msg="No severity data" /> : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={severityData} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
                              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={65} />
                              <Tooltip contentStyle={tooltipStyle} />
                              <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'confidenceLevel', value: data.name, title: `Threats with ${data.name} confidence` } })}>{severityData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    {/* Recent Threats */}
                    <div key="s1-threats" className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-sm flex flex-col overflow-hidden" style={visibleS1Widgets.includes('s1-threats') ? {} : { visibility: 'hidden', pointerEvents: 'none' }}>
                      <div className="drag-handle cursor-grab active:cursor-grabbing bg-[var(--muted-bg)] border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0 select-none">
                        <div><p className="text-xs text-[var(--muted)] font-medium">SentinelOne</p><p className="text-sm font-bold text-[var(--foreground)]">Recent Threats</p></div>
                        <button onClick={(e) => { e.stopPropagation(); removeS1Widget('s1-threats'); }} className={`w-5 h-5 flex items-center justify-center rounded text-[var(--muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors ml-1 flex-shrink-0 ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="px-4 pt-2 pb-0 flex items-center justify-between flex-shrink-0">
                        <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Date range</span>
                        <DateRangeMini from={threatsRange.from} to={threatsRange.to} onChange={(v) => setRange('s1-threats', v)} />
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto">
                        {s1Loading ? <Spin /> : s1Error ? <Err msg={s1Error} /> : recentThreats.length === 0 ? <Empty msg="No threats found" /> : (
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                              <tr>
                                <th className="text-left px-3 py-2 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Threat</th>
                                <th className="text-left px-3 py-2 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentThreats.map((t, i) => {
                                const status = t.threatInfo?.mitigationStatus || 'unknown';
                                const cls = status === 'mitigated' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                  : status === 'active' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                    : status === 'not_mitigated' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                                      : 'bg-[var(--muted-bg)] text-[var(--muted)]';
                                return (
                                  <tr key={i} className={i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'}>
                                    <td className="px-3 py-2 border-b border-[var(--card-border)]">
                                      <p className="font-medium text-[var(--foreground)] truncate max-w-[110px]">{t.threatInfo?.threatName || 'Unknown'}</p>
                                      <p className="text-[var(--muted)] truncate max-w-[110px]">{t.agentRealtimeInfo?.agentComputerName || '—'}</p>
                                    </td>
                                    <td className="px-3 py-2 border-b border-[var(--card-border)]">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>{status.replace(/_/g, ' ')}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* Agent Status */}
                    <div key="s1-agents" className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-sm flex flex-col overflow-hidden" style={visibleS1Widgets.includes('s1-agents') ? {} : { visibility: 'hidden', pointerEvents: 'none' }}>
                      <div className="drag-handle cursor-grab active:cursor-grabbing bg-[var(--muted-bg)] border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0 select-none">
                        <div><p className="text-xs text-[var(--muted)] font-medium">SentinelOne</p><p className="text-sm font-bold text-[var(--foreground)]">Agent Status</p></div>
                        <div className="flex gap-1 items-center">
                          <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">{activeAgents} Active</span>
                          <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{inactiveAgents} Inactive</span>
                          <button onClick={(e) => { e.stopPropagation(); removeS1Widget('s1-agents'); }} className={`w-5 h-5 flex items-center justify-center rounded text-[var(--muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors ml-1 flex-shrink-0 ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="px-4 pt-2 pb-0 flex items-center justify-between flex-shrink-0">
                        <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Date range</span>
                        <DateRangeMini from={agentsRange.from} to={agentsRange.to} onChange={(v) => setRange('s1-agents', v)} />
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto">
                        {agentLoading ? <Spin /> : agentError ? <Err msg={agentError} /> : filteredAgentData.length === 0 ? <Empty msg="No agent info found" /> : (
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                              <tr>
                                <th className="text-left px-3 py-2 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Computer</th>
                                <th className="text-left px-3 py-2 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Active</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredAgentData.map((a, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'}>
                                  <td className="px-3 py-2 border-b border-[var(--card-border)] text-[var(--muted)] whitespace-nowrap">{a.computerName || '—'}</td>
                                  <td className="px-3 py-2 border-b border-[var(--card-border)]">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${a.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{a.isActive ? 'Active' : 'Inactive'}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* App Agent */}
                    <div key="s1-app-agent" className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-sm flex flex-col overflow-hidden" style={visibleS1Widgets.includes('s1-app-agent') ? {} : { visibility: 'hidden', pointerEvents: 'none' }}>
                      <div className="drag-handle cursor-grab active:cursor-grabbing bg-[var(--muted-bg)] border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0 select-none">
                        <div><p className="text-xs text-[var(--muted)] font-medium">SentinelOne</p><p className="text-sm font-bold text-[var(--foreground)]">Application Agents</p></div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{filteredAppAgentData.length} records</span>
                          <div className="flex items-center gap-0.5 bg-[var(--card-bg)] rounded-lg p-0.5 border border-[var(--card-border)]">
                            <button onClick={(e) => { e.stopPropagation(); setS1WidgetConfigs((p) => ({ ...p, 's1-app-agent': { ...(p['s1-app-agent'] ?? { id: 's1-app-agent', viewMode: 'table' }), viewMode: 'graph' } })); }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${s1WidgetConfigs['s1-app-agent']?.viewMode === 'graph' ? 'bg-emerald-500 text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>Graph</button>
                            <button onClick={(e) => { e.stopPropagation(); setS1WidgetConfigs((p) => ({ ...p, 's1-app-agent': { ...(p['s1-app-agent'] ?? { id: 's1-app-agent', viewMode: 'table' }), viewMode: 'table' } })); }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${(s1WidgetConfigs['s1-app-agent']?.viewMode ?? 'table') === 'table' ? 'bg-blue-500 text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>Table</button>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeS1Widget('s1-app-agent'); }} className={`w-5 h-5 flex items-center justify-center rounded text-[var(--muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors ml-1 flex-shrink-0 ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="px-4 pt-2 pb-0 flex items-center justify-between flex-shrink-0">
                        <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Date range</span>
                        <DateRangeMini from={appAgentRange.from} to={appAgentRange.to} onChange={(v) => setRange('s1-app-agent', v)} />
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <S1ConfigWidget data={filteredAppAgentData} loading={appAgentLoading} config={s1WidgetConfigs['s1-app-agent'] ?? { id: 's1-app-agent', viewMode: 'table' }} onConfigChange={(patch) => setS1WidgetConfigs((p) => ({ ...p, 's1-app-agent': { ...(p['s1-app-agent'] ?? { id: 's1-app-agent', viewMode: 'table' }), ...patch } }))} accentColor="#a855f7" />
                      </div>
                    </div>

                    {/* App CVE */}
                    <div key="s1-app-cve" className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-sm flex flex-col overflow-hidden" style={visibleS1Widgets.includes('s1-app-cve') ? {} : { visibility: 'hidden', pointerEvents: 'none' }}>
                      <div className="drag-handle cursor-grab active:cursor-grabbing bg-[var(--muted-bg)] border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0 select-none">
                        <div><p className="text-xs text-[var(--muted)] font-medium">SentinelOne</p><p className="text-sm font-bold text-[var(--foreground)]">Application CVEs</p></div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{filteredAppCveData.length} CVEs</span>
                          <div className="flex items-center gap-0.5 bg-[var(--card-bg)] rounded-lg p-0.5 border border-[var(--card-border)]">
                            <button onClick={(e) => { e.stopPropagation(); setS1WidgetConfigs((p) => ({ ...p, 's1-app-cve': { ...(p['s1-app-cve'] ?? { id: 's1-app-cve', viewMode: 'table' }), viewMode: 'graph' } })); }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${s1WidgetConfigs['s1-app-cve']?.viewMode === 'graph' ? 'bg-emerald-500 text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>Graph</button>
                            <button onClick={(e) => { e.stopPropagation(); setS1WidgetConfigs((p) => ({ ...p, 's1-app-cve': { ...(p['s1-app-cve'] ?? { id: 's1-app-cve', viewMode: 'table' }), viewMode: 'table' } })); }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${(s1WidgetConfigs['s1-app-cve']?.viewMode ?? 'table') === 'table' ? 'bg-blue-500 text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>Table</button>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeS1Widget('s1-app-cve'); }} className={`w-5 h-5 flex items-center justify-center rounded text-[var(--muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors ml-1 flex-shrink-0 ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="px-4 pt-2 pb-0 flex items-center justify-between flex-shrink-0">
                        <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Date range</span>
                        <DateRangeMini from={appCveRange.from} to={appCveRange.to} onChange={(v) => setRange('s1-app-cve', v)} />
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <S1ConfigWidget data={filteredAppCveData} loading={appCveLoading} config={s1WidgetConfigs['s1-app-cve'] ?? { id: 's1-app-cve', viewMode: 'table' }} onConfigChange={(patch) => setS1WidgetConfigs((p) => ({ ...p, 's1-app-cve': { ...(p['s1-app-cve'] ?? { id: 's1-app-cve', viewMode: 'table' }), ...patch } }))} accentColor="#ef4444" />
                      </div>
                    </div>

                    {/* Device Control */}
                    <div key="s1-device-control" className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-sm flex flex-col overflow-hidden" style={visibleS1Widgets.includes('s1-device-control') ? {} : { visibility: 'hidden', pointerEvents: 'none' }}>
                      <div className="drag-handle cursor-grab active:cursor-grabbing bg-[var(--muted-bg)] border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0 select-none">
                        <div><p className="text-xs text-[var(--muted)] font-medium">SentinelOne</p><p className="text-sm font-bold text-[var(--foreground)]">Device Control</p></div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{filteredDeviceControlData.length} events</span>
                          <div className="flex items-center gap-0.5 bg-[var(--card-bg)] rounded-lg p-0.5 border border-[var(--card-border)]">
                            <button onClick={(e) => { e.stopPropagation(); setS1WidgetConfigs((p) => ({ ...p, 's1-device-control': { ...(p['s1-device-control'] ?? { id: 's1-device-control', viewMode: 'table' }), viewMode: 'graph' } })); }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${s1WidgetConfigs['s1-device-control']?.viewMode === 'graph' ? 'bg-emerald-500 text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>Graph</button>
                            <button onClick={(e) => { e.stopPropagation(); setS1WidgetConfigs((p) => ({ ...p, 's1-device-control': { ...(p['s1-device-control'] ?? { id: 's1-device-control', viewMode: 'table' }), viewMode: 'table' } })); }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${(s1WidgetConfigs['s1-device-control']?.viewMode ?? 'table') === 'table' ? 'bg-blue-500 text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>Table</button>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeS1Widget('s1-device-control'); }} className={`w-5 h-5 flex items-center justify-center rounded text-[var(--muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors ml-1 flex-shrink-0 ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="px-4 pt-2 pb-0 flex items-center justify-between flex-shrink-0">
                        <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Date range</span>
                        <DateRangeMini from={deviceControlRange.from} to={deviceControlRange.to} onChange={(v) => setRange('s1-device-control', v)} />
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <S1ConfigWidget data={filteredDeviceControlData} loading={deviceControlLoading} config={s1WidgetConfigs['s1-device-control'] ?? { id: 's1-device-control', viewMode: 'table' }} onConfigChange={(patch) => setS1WidgetConfigs((p) => ({ ...p, 's1-device-control': { ...(p['s1-device-control'] ?? { id: 's1-device-control', viewMode: 'table' }), ...patch } }))} accentColor="#6366f1" />
                      </div>
                    </div>

                    {/* RSS Feed */}
                    <div key="s1-rss" className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-sm flex flex-col overflow-hidden" style={visibleS1Widgets.includes('s1-rss') ? {} : { visibility: 'hidden', pointerEvents: 'none' }}>
                      <div className="drag-handle cursor-grab active:cursor-grabbing bg-[var(--muted-bg)] border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0 select-none">
                        <div><p className="text-xs text-[var(--muted)] font-medium">SentinelOne</p><p className="text-sm font-bold text-[var(--foreground)]">RSS Feed</p></div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{filteredRssData.length} items</span>
                          <button onClick={(e) => { e.stopPropagation(); removeS1Widget('s1-rss'); }} className={`w-5 h-5 flex items-center justify-center rounded text-[var(--muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors ml-1 flex-shrink-0 ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="px-4 pt-2 pb-0 flex items-center justify-between flex-shrink-0">
                        <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Date range</span>
                        <DateRangeMini from={rssRange.from} to={rssRange.to} onChange={(v) => setRange('s1-rss', v)} />
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto">
                        {rssLoading ? <Spin /> : filteredRssData.length === 0 ? <Empty msg="No RSS data — sync first" /> : (
                          <div className="divide-y divide-[var(--card-border)]">
                            {filteredRssData.slice(0, 20).map((item, i) => {
                              const title = item.title || item.name || 'Untitled';
                              const desc = item.summary || item.description || item.content || '';
                              const link = item.link || item.url || item.guid || null;
                              const date = item.published || item.pubDate || item.date || '';
                              const image = item?.media_thumbnail ?? item?.enclosure?.url ?? item?.image?.url ?? item?.thumbnail ?? null;
                              const displayDate = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                              return (
                                <div key={i} className="flex items-start gap-3 px-3 py-2.5 hover:bg-[var(--muted-bg)] transition-colors group">
                                  <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-[var(--muted-bg)] flex items-center justify-center border border-[var(--card-border)]">
                                    {image ? <img src={image} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} /> : <svg className="w-5 h-5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9" /></svg>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline line-clamp-2 block leading-snug">{title}</a> : <p className="text-xs font-semibold text-[var(--foreground)] line-clamp-2 leading-snug">{title}</p>}
                                    {desc && <p className="text-[10px] text-[var(--muted)] mt-0.5 line-clamp-1">{String(desc).replace(/<[^>]+>/g, '')}</p>}
                                    {displayDate && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">{displayDate}</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </ResponsiveGridLayout>
                </div>
              )}
            </div>
          );

          /* ─ FIREWALL ─ */
          return (
            <div key="firewall" onDragOver={(e) => { e.preventDefault(); moveSection('firewall'); }} className="group/sec">
              <div className="pt-4 pb-5 relative z-10">
                {/* Section header */}
                <div
                  draggable
                  onDragStart={(e) => { e.stopPropagation(); dragSectionRef.current = 'firewall'; }}
                  onDragEnd={(e) => { e.stopPropagation(); dragSectionRef.current = null; }}
                  className="flex items-center gap-3 mb-3 cursor-move select-none rounded-xl px-3 py-2 transition-all duration-200 hover:bg-orange-50/50 dark:hover:bg-orange-900/10"
                >
                  <div className="w-1.5 h-7 rounded-full bg-gradient-to-b from-orange-400 to-orange-600 flex-shrink-0 shadow-sm" />
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest leading-none">Network</p>
                      <h2 className="text-sm font-bold text-[var(--foreground)] leading-tight">Palo Alto Firewall</h2>
                    </div>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-orange-200 via-[var(--card-border)] to-transparent dark:from-orange-800" />
                  <button onClick={(e) => { e.stopPropagation(); handleCollect(); }} disabled={collecting}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 disabled:opacity-50 transition-all duration-150 flex-shrink-0 border border-orange-200 dark:border-orange-700">
                    {collecting
                      ? <><div className="animate-spin w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full" />Collecting…</>
                      : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Collect</>
                    }
                  </button>
                </div>

                {collectMsg && (
                  <div className={`mb-3 px-3 py-2 rounded-lg text-xs border flex items-center gap-2 ${collectMsg.ok ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'}`}>
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={collectMsg.ok ? 'M5 13l4 4L19 7' : 'M12 9v2m0 4h.01'} /></svg>
                    {collectMsg.text}
                  </div>
                )}
              </div>

              {/* Firewall widget grid */}
              {fwWidgets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-orange-200 dark:border-orange-800 rounded-2xl bg-orange-50/30 dark:bg-orange-900/10 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                  </div>
                  <p className="text-sm font-semibold text-[var(--foreground)] mb-1">No firewall widgets</p>
                  <p className="text-xs text-[var(--muted)]">Click "Add Widget" → Palo Alto Firewall to create charts</p>
                </div>
              ) : (
                <div className="w-full min-w-0" onDragStart={(e) => e.stopPropagation()}>
                  <ResponsiveGridLayout
                    className="layout"
                    layouts={fwLayouts}
                    breakpoints={GRID_BREAKPOINTS}
                    cols={GRID_COLS}
                    rowHeight={10}
                    width={containerWidth}
                    onLayoutChange={handleLayoutChange}
                    onBreakpointChange={(bp) => setActiveGridBreakpoint(bp)}
                    compactor={noCompactor}
                    dragConfig={{ enabled: isEditMode, handle: '.drag-handle' }}
                    resizeConfig={{ enabled: isEditMode, handles: ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne'] }}
                    margin={[10, 10]}
                  >
                    {fwWidgets.map((widget) => {
                      const fwRange = getRange(`fw-${widget.id}`);
                      return (
                        <div key={widget.id} className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-sm overflow-hidden flex flex-col">
                          <div className="flex items-center justify-between px-3 pt-2 pb-1 flex-shrink-0">
                            <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Date range</span>
                            <DateRangeMini from={fwRange.from} to={fwRange.to} onChange={(v) => setRange(`fw-${widget.id}`, v)} />
                          </div>
                          <div className="flex-1 min-h-0">
                            <FwGraphWidget widget={widget} onDelete={handleDeleteFwWidget} isEditMode={isEditMode} dateFrom={fwRange.from} dateTo={fwRange.to} />
                          </div>
                        </div>
                      );
                    })}
                  </ResponsiveGridLayout>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── MTTR Summary Card ───────────────────────────────────────────────── */}
      <div className="mt-8 mb-2 w-1/2">
        <h2 className="text-sm font-bold text-[var(--foreground)] mb-4">Health Score</h2>
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-sm overflow-hidden ">
          <AllCommonmttr />
        </div>
      </div>

      {/* ── Zoho Ticket Matrix ──────────────────────────────────────────────── */}
      <div className="mt-8 mb-2">
        <h2 className="text-sm font-bold text-[var(--foreground)] mb-4">Zoho Ticket Dashboard</h2>
        <ZohoTicketMatrix />
      </div>


      {/* ── News Sections ───────────────────────────────────────────────────── */}
      {NEWS_SECTIONS.map((section) => {
        const newsRange = getRange(`news-${section.key}`);
        return (
        <div key={section.key} className="mt-8 mb-2">
          {/* Section header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1.5 h-7 rounded-full flex-shrink-0 shadow-sm" style={{ background: `linear-gradient(to bottom, ${section.gradientFrom}, ${section.gradientTo})` }} />
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg ${section.bgColor} flex items-center justify-center flex-shrink-0`}>
                <svg className={`w-4 h-4 ${section.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-.586-1.414l-4.5-4.5A2 2 0 0014.5 3H12" />
                </svg>
              </div>
              <div>
                <p className={`text-[10px] font-bold ${section.textColor} uppercase tracking-widest leading-none`}>{section.sublabel}</p>
                <h2 className="text-sm font-bold text-[var(--foreground)] leading-tight">{section.label}</h2>
              </div>
            </div>
            <div className={`flex-1 h-px bg-gradient-to-r ${section.lineFrom} via-[var(--card-border)] to-transparent`} />
            <DateRangeMini from={newsRange.from} to={newsRange.to} onChange={(v) => setRange(`news-${section.key}`, v)} />
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {newsLoading[section.key]
              ? Array.from({ length: 4 }).map((_, i) => <NewsSkeletonCard key={i} />)
              : newsData[section.key].length === 0
                ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-10 text-center border border-dashed border-[var(--card-border)] rounded-2xl bg-[var(--muted-bg)]/30">
                    <p className="text-sm font-semibold text-[var(--foreground)] mb-1">No articles yet</p>
                    <p className="text-xs text-[var(--muted)]">Articles will appear here once synced</p>
                  </div>
                )
                : newsData[section.key].map((article, i) => <NewsArticleCard key={i} article={article} />)
            }
          </div>
        </div>
        );
      })}


    </div>
  );
}