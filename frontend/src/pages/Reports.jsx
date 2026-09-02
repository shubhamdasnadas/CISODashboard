import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { useOrg } from '../context/OrgContext.jsx';
import { fetchReportData } from './report/fetchReportData.js';
import { generatePdfFromElement, generatePdfOnServer } from './report/generatePdf.jsx';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

const TYPE_CONFIG = {
  sales:      { label: 'Sales',      bg: 'bg-green-100 dark:bg-green-900/30',   text: 'text-green-700 dark:text-green-400' },
  finance:    { label: 'Finance',    bg: 'bg-blue-100 dark:bg-blue-900/30',     text: 'text-blue-700 dark:text-blue-400' },
  hr:         { label: 'HR',         bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
  operations: { label: 'Operations', bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  security:   { label: 'Security',   bg: 'bg-red-100 dark:bg-red-900/30',       text: 'text-red-700 dark:text-red-400' },
  compliance: { label: 'Compliance', bg: 'bg-sky-100 dark:bg-sky-900/30',       text: 'text-sky-700 dark:text-sky-400' },
  incident:   { label: 'Incident',   bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-700 dark:text-amber-400' },
  general:    { label: 'General',    bg: 'bg-[var(--muted-bg)]',                text: 'text-[var(--muted)]' },
  custom:     { label: 'Custom',     bg: 'bg-[var(--muted-bg)]',                text: 'text-[var(--muted)]' },
};

const STATUS_CONFIG = {
  published: { label: 'Published', bg: 'bg-green-100 dark:bg-green-900/30',   text: 'text-green-700 dark:text-green-400',   dot: 'bg-green-500' },
  draft:     { label: 'Draft',     bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  archived:  { label: 'Archived',  bg: 'bg-[var(--muted-bg)]',                text: 'text-[var(--muted)]',                   dot: 'bg-gray-400' },
};

const STATUS_TABS = ['all', 'published', 'draft', 'archived'];

function TypeBadge({ type }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.custom;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export default function Reports() {
  const { currentOrg } = useOrg();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter]   = useState('all');
  const [form, setForm] = useState({ title: '', content: '', type: 'general', status: 'draft' });
  const [saving, setSaving]   = useState(false);

  // Date filter state (YYYY-MM-DD string or '' for all)
  const [dateFilter, setDateFilter] = useState('');

  // PDF generation state
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep]       = useState('');
  const [genError, setGenError]     = useState('');
  const [reportData, setReportData] = useState(null);

  // When true the current generation is a re-download of an old report —
  // skip creating a new DB entry and use the original date in the filename.
  const isRedownloadRef = useRef(false);
  const redownloadDateRef = useRef('');

  /** Generate PDF — optionally scoped to a single date (YYYY-MM-DD).
   *  `skipSave` = true when re-downloading a previous report (no new DB row). */
  const handleGeneratePdf = useCallback(async (forDate, skipSave = false) => {
    isRedownloadRef.current = skipSave;
    redownloadDateRef.current = forDate || '';
    setGenerating(true);
    setGenError('');
    setGenStep('Fetching data…');
    try {
      const data = await fetchReportData(
        currentOrg?.org_name || 'Organisation',
        forDate || undefined,
      );
      setReportData(data);
      setGenStep('Rendering report…');
    } catch (err) {
      setGenError('Failed to fetch report data. Please try again.');
      setGenerating(false);
      setGenStep('');
    }
  }, [currentOrg]);

  // After reportData is set, generate the vector PDF directly
  useEffect(() => {
    if (!reportData) return;

    const run = async () => {
      setGenStep('Generating PDF…');
      console.log('[Reports] Starting PDF generation (vector @react-pdf/renderer)...');

      try {
        const orgSlug = (currentOrg?.org_name || 'report').replace(/\s+/g, '_').toLowerCase();
        // Use the original report date for re-downloads, today for fresh generates
        const date    = redownloadDateRef.current || new Date().toISOString().slice(0, 10);

        let fileName;
        if (!isRedownloadRef.current) {
          // FRESH generate → render + store on the SERVER.
          // The backend writes the PDF to reportList/<orgSlug>/<username>_<orgSlug>_<stamp>.pdf
          // and records a row in the per-org reports table.
          console.log('[Reports] Generating & storing PDF on server...');
          const result = await generatePdfOnServer(reportData, currentOrg?.org_name || 'Organisation');
          fileName = result.fileName;
          console.log('[Reports] PDF generated & saved server-side:', result);
          loadReports();
        } else {
          // RE-DOWNLOAD of a previous report → render locally (no new DB row,
          // no new file). Uses the original report date in the filename.
          fileName = `${orgSlug}_security_report_${date}.pdf`;
          console.log('[Reports] Re-downloading (local render), filename:', fileName);
          await generatePdfFromElement(reportData, fileName);
          console.log('[Reports] Re-download — skipped creating new report entry');
        }

        // Show success notification
        alert(`✓ PDF Report Downloaded Successfully!\n\nFilename: ${fileName}\n\nThe PDF has been saved to your downloads folder.`);

      } catch (err) {
        console.error('[Reports] PDF generation failed:', err);
        console.error('[Reports] Error details:', {
          message: err?.message,
          stack: err?.stack,
          name: err?.name
        });
        setGenError(`PDF generation failed: ${err?.message || err}. Check console for details.`);
      } finally {
        setReportData(null);
        setGenerating(false);
        setGenStep('');
        isRedownloadRef.current = false;
        redownloadDateRef.current = '';
      }
    };

    run();
  }, [reportData, currentOrg]);

  const loadReports = () => {
    setLoading(true);
    api.get('/reports').then((r) => setReports(r.data.reports || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadReports(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await api.post('/reports', form);
      setForm({ title: '', content: '', type: 'general', status: 'draft' });
      setShowForm(false);
      loadReports();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this report?')) return;
    await api.delete(`/reports/${id}`);
    loadReports();
  };

  // Apply both status filter AND date filter
  const visible = reports.filter((r) => {
    if (filter !== 'all' && (r.status || 'draft') !== filter) return false;
    if (dateFilter && r.created_at) {
      const reportDate = new Date(r.created_at).toISOString().slice(0, 10);
      if (reportDate !== dateFilter) return false;
    }
    return true;
  });

  /** Download (re-generate) a PDF for a specific report date — NO new DB entry */
  const handleDownloadForDate = (createdAt) => {
    const reportDate = new Date(createdAt).toISOString().slice(0, 10);
    handleGeneratePdf(reportDate, true);   // skipSave = true
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">

      {/* PDF generating overlay */}
      {generating && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4 min-w-[260px]">
            <div className="w-12 h-12 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
            <div className="text-center">
              <p className="font-semibold text-[var(--foreground)]">Generating PDF Report</p>
              <p className="text-sm text-[var(--muted)] mt-1">{genStep}</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Reports</h1>
          <p className="text-sm text-[var(--muted)] mt-1">{reports.length} report{reports.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleGeneratePdf()}
            disabled={generating}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Generate PDF
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            {showForm ? 'Cancel' : 'New Report'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {genError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-400">{genError}</p>
          <button onClick={() => setGenError('')} className="text-red-400 hover:text-red-600 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider block mb-1.5">Title</label>
            <input required placeholder="Report title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--foreground)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider block mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {Object.entries(TYPE_CONFIG).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider block mb-1.5">Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider block mb-1.5">Content</label>
            <textarea placeholder="Report content…" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={4}
              className="w-full px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--foreground)] resize-none" />
          </div>
          <button disabled={saving} type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors">
            {saving ? 'Saving…' : 'Create Report'}
          </button>
        </form>
      )}

      {/* Filter tabs + Date filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_TABS.map((tab) => {
            const count = tab === 'all' ? reports.length : reports.filter((r) => (r.status || 'draft') === tab).length;
            return (
              <button key={tab} onClick={() => setFilter(tab)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                  filter === tab
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)]'
                }`}>
                {tab}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filter === tab ? 'bg-white/20 text-white' : 'bg-[var(--card-border)] text-[var(--muted)]'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Date filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Date:</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--foreground)]"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Clear date filter"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <WidgetSkeleton variant="table" />
        ) : visible.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)]">No reports{filter !== 'all' ? ` with status "${filter}"` : ''}{dateFilter ? ` on ${dateFilter}` : ''} yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted-bg)] border-b border-[var(--card-border)]">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide hidden sm:table-cell">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide hidden sm:table-cell">Date</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {visible.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--muted-bg)]/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[var(--foreground)]">{r.title}</p>
                      {r.content && <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-1">{r.content}</p>}
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <TypeBadge type={r.type} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[var(--muted)] hidden sm:table-cell whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        {/* Download button — re-generates PDF for this report's date */}
                        <button
                          onClick={() => handleDownloadForDate(r.created_at)}
                          disabled={generating || !r.created_at}
                          title="Download report for this date"
                          className="p-1.5 rounded-lg text-[var(--muted)] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        {/* Delete button */}
                        <button onClick={() => handleDelete(r.id)}
                          className="p-1.5 rounded-lg text-[var(--muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
