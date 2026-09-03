import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { useOrg } from '../context/OrgContext.jsx';
import { fetchReportData } from './report/fetchReportData.js';
import { generatePdfFromElement, generatePdfOnServer } from './report/generatePdf.jsx';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

export default function Reports() {
  const { currentOrg } = useOrg();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

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

      try {
        const orgSlug = (currentOrg?.org_name || 'report').replace(/\s+/g, '_').toLowerCase();
        const date    = redownloadDateRef.current || new Date().toISOString().slice(0, 10);

        let fileName;
        if (!isRedownloadRef.current) {
          const result = await generatePdfOnServer(reportData, currentOrg?.org_name || 'Organisation');
          fileName = result.fileName;
          loadReports();
        } else {
          fileName = `${orgSlug}_security_report_${date}.pdf`;
          await generatePdfFromElement(reportData, fileName);
        }

        alert(`✓ PDF Report Downloaded Successfully!\n\nFilename: ${fileName}\n\nThe PDF has been saved to your downloads folder.`);

      } catch (err) {
        console.error('[Reports] PDF generation failed:', err);
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

  const handleDelete = async (id) => {
    if (!confirm('Delete this report?')) return;
    await api.delete(`/reports/${id}`);
    loadReports();
  };

  /** Re-download a PDF for a specific report date — NO new DB entry */
  const handleDownloadForDate = (createdAt) => {
    const reportDate = new Date(createdAt).toISOString().slice(0, 10);
    handleGeneratePdf(reportDate, true);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Reports</h1>
          <p className="text-sm text-[var(--muted)] mt-1">{reports.length} generated report{reports.length !== 1 ? 's' : ''}</p>
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

      {/* Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <WidgetSkeleton variant="table" />
        ) : reports.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)]">No reports generated yet. Click "Generate PDF" to create your first report.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted-bg)] border-b border-[var(--card-border)]">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide hidden sm:table-cell">Generated</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--muted-bg)]/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[var(--foreground)]">{r.title}</p>
                      {r.description && <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-1">{r.description}</p>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        r.status === 'published'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${r.status === 'published' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                        {r.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[var(--muted)] hidden sm:table-cell whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
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
