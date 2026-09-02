import { useState, useEffect } from 'react';
import api from '../../api.js';
import DynChart from './DynChart.jsx';
import WidgetSkeleton from './WidgetSkeleton.jsx';
import { extractTable, parseAxis } from './helpers.js';

export default function FwGraphWidget({ widget, onDelete, isEditMode }) {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!widget?.report_name) return;
    let cancelled = false;
    function loadWidget() {
      setLoading(true); setError(''); setRaw(null);
      api.get(`/firewall/reports/${widget.report_name}`)
        .then((r) => {
          if (cancelled) return;
          const d = r.data;
          if (d.message && d.data === undefined) setError(d.message);
          else setRaw(d.data ?? null);
        })
        .catch(() => { if (!cancelled) setError('Network error'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    loadWidget();
    const id = setInterval(loadWidget, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [widget?.report_name]);

  const table = raw ? extractTable(raw) : null;
  const rows = table?.rows ?? [];
  const xList = parseAxis(widget.x_axis);
  const yList = parseAxis(widget.y_axis);
  const chartType = widget.chart_type || 'bar';

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--card-bg)]">
      <div className="drag-handle cursor-grab active:cursor-grabbing bg-[var(--muted-bg)] border-b border-[var(--card-border)] px-4 py-3 flex items-start justify-between flex-shrink-0">
        <div className="min-w-0">
          <p className="text-xs text-[var(--muted)] font-medium">Palo Alto Firewall</p>
          <p className="text-sm font-bold text-[var(--foreground)] truncate">{widget.report_name}</p>
          <p className="text-[10px] text-[var(--muted)] mt-0.5 truncate">
            X: {xList.join(', ') || '—'} · Y: {yList.join(', ') || '—'}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(widget.id); }}
          className={`ml-2 flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ${isEditMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          title="Delete widget"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 min-h-0 p-3">
        {loading ? (
          <WidgetSkeleton variant="chart" height="h-full" />
        ) : error ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : !xList.length || !yList.length ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-[var(--muted)]">X or Y axis not configured</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-[var(--muted)]">No data — sync first</p>
          </div>
        ) : (
          <DynChart rows={rows} xList={xList} yList={yList} chartType={yList.length > 1 ? 'mixed' : chartType} />
        )}
      </div>
    </div>
  );
}
