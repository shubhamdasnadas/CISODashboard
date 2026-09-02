import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

const PAGE_SIZE = 25;

const fmt = (d) => d ? new Date(d).toLocaleString() : '—';

// Every dataset here is a Microsoft Graph collection endpoint synced by
// backend/routes/microsoft.js into its own ms_* table; GET /microsoft/data/:key
// returns { data: { value: [...] }, syncedAt } for whichever key is requested.
const DATASET_CONFIG = {
  riskyUsers: {
    endpoint: '/microsoft/data/riskyUsers',
    extract: (r) => r.data?.data?.value ?? [],
    cols: ['User Principal Name', 'Risk Level', 'Risk State', 'Risk Detail', 'Last Updated'],
    rowFn: (u) => [u.userPrincipalName, u.riskLevel, u.riskState, u.riskDetail, fmt(u.riskLastUpdatedDateTime)],
  },
  riskDetections: {
    endpoint: '/microsoft/data/riskDetections',
    extract: (r) => r.data?.data?.value ?? [],
    cols: ['User', 'Risk Event Type', 'Risk Level', 'Detected'],
    rowFn: (r) => [r.userDisplayName || r.userPrincipalName, r.riskEventType, r.riskLevel, fmt(r.detectedDateTime)],
  },
  auditSignIns: {
    endpoint: '/microsoft/data/auditSignIns',
    extract: (r) => r.data?.data?.value ?? [],
    cols: ['User', 'Application', 'Status', 'IP Address', 'Date'],
    rowFn: (s) => [s.userPrincipalName, s.appDisplayName, s.status?.errorCode === 0 ? 'Success' : (s.status?.failureReason || 'Failed'), s.ipAddress, fmt(s.createdDateTime)],
  },
  auditDirectory: {
    endpoint: '/microsoft/data/auditDirectory',
    extract: (r) => r.data?.data?.value ?? [],
    cols: ['Activity', 'Initiated By', 'Category', 'Date'],
    rowFn: (a) => [a.activityDisplayName, a.initiatedBy?.user?.userPrincipalName || a.initiatedBy?.app?.displayName, a.category, fmt(a.activityDateTime)],
  },
  securityIncidents: {
    endpoint: '/microsoft/data/securityIncidents',
    extract: (r) => r.data?.data?.value ?? [],
    cols: ['Name', 'Severity', 'Status', 'Created'],
    rowFn: (i) => [i.displayName, i.severity, i.status, fmt(i.createdDateTime)],
  },
  securityAlerts: {
    endpoint: '/microsoft/data/securityAlerts',
    extract: (r) => r.data?.data?.value ?? [],
    cols: ['Title', 'Severity', 'Status', 'Category', 'Created'],
    rowFn: (a) => [a.title, a.severity, a.status, a.category, fmt(a.createdDateTime)],
  },
  managedDevices: {
    endpoint: '/microsoft/data/managedDevices',
    extract: (r) => r.data?.data?.value ?? [],
    cols: ['Device Name', 'OS', 'Compliance State', 'Last Sync'],
    rowFn: (d) => [d.deviceName, d.operatingSystem, d.complianceState, fmt(d.lastSyncDateTime)],
  },
  applications: {
    endpoint: '/microsoft/data/applications',
    extract: (r) => r.data?.data?.value ?? [],
    cols: ['Display Name', 'App ID', 'Created'],
    rowFn: (a) => [a.displayName, a.appId, fmt(a.createdDateTime)],
  },
  riskyServicePrincipals: {
    endpoint: '/microsoft/data/riskyServicePrincipals',
    extract: (r) => r.data?.data?.value ?? [],
    cols: ['Display Name', 'Risk Level', 'Risk State'],
    rowFn: (sp) => [sp.displayName, sp.riskLevel, sp.riskState],
  },
  serviceIssues: {
    endpoint: '/microsoft/data/serviceIssues',
    extract: (r) => r.data?.data?.value ?? [],
    cols: ['Title', 'Service', 'Severity', 'Status'],
    rowFn: (i) => [i.title, i.service, i.severity || i.classification, i.status],
  },
};

const FILTERS = {
  id: (r, value) => String(r.id) === String(value),
  riskLevel: (r, value) => (r.riskLevel || 'unknown') === value,
  riskEventType: (r, value) => (r.riskEventType || 'unknown') === value,
  severity: (r, value) => (r.severity || 'unknown') === value,
  complianceState: (r, value) => (r.complianceState || 'unknown') === value,
};

export default function Microsoft365DetailView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { dataset, filterId, value, title } = location.state || {};

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const config = dataset ? DATASET_CONFIG[dataset] : null;
  const filterFn = filterId ? FILTERS[filterId] : null;

  useEffect(() => {
    if (!config) { setLoading(false); return; }
    setLoading(true);
    api.get(config.endpoint)
      .then((r) => setRows(config.extract(r)))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [dataset]);

  useEffect(() => { setPage(1); }, [filterId, value]);

  const processedRows = useMemo(() => {
    if (!config || !filterFn) return [];
    return rows.filter((r) => filterFn(r, value));
  }, [rows, config, filterFn, value]);

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
        <p className="text-sm text-[var(--muted)] mt-1">Navigate here by clicking a widget or chart segment on the Microsoft 365 page.</p>
        <Link to="/microsoft365" className="mt-4 text-sm text-indigo-500 hover:text-indigo-700 font-semibold">Back to Microsoft 365</Link>
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

  // Row clicks (filterId: 'id') match exactly one record — show it as a
  // label/value list built from the same cols/rowFn as the multi-row table,
  // rather than duplicating a separate field list per dataset.
  const isSingleRecord = filterId === 'id';

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <button onClick={() => navigate(-1)} className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold mb-1">
            ← Back
          </button>
          <h1 className="text-xl font-bold text-[var(--foreground)]">{title || 'Details'}</h1>
          {!isSingleRecord && (
            <p className="text-sm text-[var(--muted)] mt-0.5">{processedRows.length} row{processedRows.length === 1 ? '' : 's'}</p>
          )}
        </div>
      </div>

      {isSingleRecord ? (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
          {processedRows.length === 0
            ? <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">Record not found</div>
            : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-[var(--card-border)]">
                  {config.cols.map((label, i) => (
                    <tr key={label}>
                      <td className="px-4 py-2.5 font-medium text-[var(--muted)] w-56 align-top">{label}</td>
                      <td className="px-4 py-2.5 text-[var(--foreground)] break-all">{config.rowFn(processedRows[0])[i] ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      ) : (
      <>
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
        {processedRows.length === 0
          ? <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">No matching records</div>
          : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[var(--muted-bg)]">
                    {config.cols.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-semibold text-[var(--muted)] uppercase tracking-wide whitespace-nowrap border-b border-[var(--card-border)]">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--card-border)]">
                  {pageRows.map((row, i) => (
                    <tr key={i} className="hover:bg-[var(--muted-bg)]/60">
                      {config.rowFn(row).map((cell, j) => (
                        <td key={j} className="px-3 py-2 whitespace-nowrap max-w-[220px] truncate text-[var(--foreground)]">{cell ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
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
            <button disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted-bg)]">
              Previous
            </button>
            <button disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--muted-bg)]">
              Next
            </button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
