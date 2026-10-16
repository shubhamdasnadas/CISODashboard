import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api.js';
import DynChart from './DynChart.jsx';
import WidgetSkeleton from './WidgetSkeleton.jsx';
import { extractTable, parseAxis } from './helpers.js';

export default function FwGraphWidget({ widget, onDelete, isEditMode }) {
  const navigate = useNavigate();
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

  const handleDataClick = (payload, metric) => {
    const filterKey = xList[0] || 'app';
    const val = payload?._rawLabel || payload?.label || payload?.[filterKey];
    navigate('/dashboard/detail', {
      state: {
        dataset: 'firewall',
        filterId: filterKey === 'risk' ? 'risk' : (filterKey.includes('threat') ? 'threat' : 'app'),
        value: val,
        title: `${widget.report_name}: ${val || metric || 'Details'}`,
        rows: rows,
      },
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--card-bg)]">
      <div className="drag-handle cursor-grab active:cursor-grabbing bg-[var(--muted-bg)] border-b border-[var(--card-border)] px-4 py-3 flex items-start justify-between flex-shrink-0">
        <div
          className="min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => {
            navigate('/dashboard/detail', {
              state: {
                dataset: 'firewall',
                filterId: xList[0] === 'risk' ? 'risk' : (xList[0]?.includes('threat') ? 'threat' : 'all'),
                value: '',
                title: `Palo Alto Firewall: ${widget.report_name}`,
                rows: rows,
              },
            });
          }}
          title="Click to view report details"
        >
          <p className="text-xs text-[var(--muted)] font-medium">Palo Alto Firewall</p>
          <p className="text-sm font-bold text-[var(--foreground)] truncate flex items-center gap-1.5">
            {widget.report_name}
            <svg className="w-3 h-3 text-[var(--muted)] opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </p>
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
          <DynChart
            rows={rows}
            xList={xList}
            yList={yList}
            chartType={yList.length > 1 ? 'mixed' : chartType}
            onDataClick={handleDataClick}
          />
        )}
      </div>
    </div>
  );
}
