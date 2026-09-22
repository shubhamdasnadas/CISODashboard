import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

const PAGE_SIZE = 25;

const fmt = (d) => d ? new Date(d).toLocaleString() : '—';
const yesNo = (v) => v === true ? 'Yes' : v === false ? 'No' : '—';

const DATASET_CONFIG = {
  devices: {
    endpoint: '/hexnode/db/devices',
    scalefusionEndpoint: '/scalefusion/db/devices',
    extract: (r) => r.data?.data || [],
    cols: ['Device Name', 'Model', 'OS', 'OS Version', 'Type', 'Owner / Group', 'Compliant', 'Status', 'Serial Number', 'Last Reported'],
    rowFn: (d) => [
      d.device_name || d.name || `Device ${d.id}`,
      d.model_name || d.model || '—',
      d.os_name || d.os_type || d.platform || d.os || '—',
      d.os_version || '—',
      d.device_type || '—',
      d.user?.name || d.group_name || d.policy_name || '—',
      yesNo(d.compliant),
      d.status || d.compliance_state || d.enrollment_status || '—',
      d.serial_number || d.serial_no || '—',
      fmt(d.last_reported || d.last_connected_at || d.last_seen),
    ],
  },
  apps: {
    endpoint: '/hexnode/db/applications',
    scalefusionEndpoint: '/scalefusion/db/applications',
    extract: (r) => r.data?.data || [],
    cols: ['Name', 'Platform', 'Category', 'Vendor / Package', 'Version', 'Price', 'License', 'Device Count', 'Rating'],
    rowFn: (a) => [
      a.name || a.app_name,
      a.platform || a.os_type || '—',
      a.category || '—',
      a.vendor || a.package_name || '—',
      a.version || '—',
      a.price || '—',
      a.license || '—',
      a.device_count || '—',
      a.average_user_rating?.trim?.() || a.average_user_rating || '—',
    ],
  },
};

const FILTERS = {
  os: (d, value) => (d.os_name || d.os_type || d.platform || d.os || 'Unknown') === value,
  compliant: (d, value) => d.compliant === value,
  platform: (a, value) => (a.platform || a.os_type || 'unknown') === value,
  deviceId: (d, value) => String(d.id || d.device_id) === String(value),
  appId: (a, value) => String(a.id || a.app_id || a.package_name) === String(value),
};

// Single-record drill-downs (filterId: 'deviceId' / 'appId') show every field
// as a label/value row instead of the multi-row columns table — one row of
// 10+ columns would be unreadable, a key/value list isn't.
const DEVICE_FIELDS = [
  ['Device Name', (d) => d.device_name || d.name || `Device ${d.id}`],
  ['Model', (d) => d.model_name || d.model],
  ['OS', (d) => d.os_name || d.os_type || d.platform || d.os],
  ['OS Version', (d) => d.os_version || d.os_version_name],
  ['Type', (d) => d.device_type],
  ['Owner / Group', (d) => d.user?.name || d.group_name || d.policy_name],
  ['Compliant', (d) => yesNo(d.compliant)],
  ['Status', (d) => d.status || d.compliance_state || d.enrollment_status],
  ['Serial Number', (d) => d.serial_number || d.serial_no],
  ['IMEI', (d) => d.imei || d.imei_no],
  ['UDID', (d) => d.udid],
  ['WiFi MAC', (d) => d.wifi_mac || d.mac_address],
  ['IP Address', (d) => d.ip_address || d.ip],
  ['Battery Level', (d) => d.battery_level != null ? `${d.battery_level}%` : undefined],
  ['Asset Tag', (d) => d.asset_tag],
  ['Device Notes', (d) => d.device_notes],
  ['Enrolled Time', (d) => fmt(d.enrolled_time || d.created_at)],
  ['Last Reported', (d) => fmt(d.last_reported || d.last_connected_at || d.last_seen)],
];

const APP_FIELDS = [
  ['Name', (a) => a.name || a.app_name],
  ['Platform', (a) => a.platform || a.os_type],
  ['Category', (a) => a.category],
  ['Package / Bundle ID', (a) => a.package_name || a.bundle_id || a.identifier],
  ['Vendor', (a) => a.vendor],
  ['Version', (a) => a.version],
  ['Price', (a) => a.price],
  ['License', (a) => a.license],
  ['App Type', (a) => a.app_type],
  ['Device Count', (a) => a.device_count],
  ['Uploaded Status', (a) => a.uploaded_status],
  ['Rating', (a) => a.average_user_rating?.trim?.() || a.average_user_rating],
  ['Description', (a) => a.description],
  ['Webapp URL', (a) => a.webapp_url],
  ['Bundle Size', (a) => a.bundle_size],
];

const SINGLE_RECORD_FILTERS = { deviceId: DEVICE_FIELDS, appId: APP_FIELDS };

export default function MDMDetailView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { dataset, filterId, value, title, provider } = location.state || {};

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const config = dataset ? DATASET_CONFIG[dataset] : null;
  const filterFn = filterId ? FILTERS[filterId] : null;

  useEffect(() => {
    if (!config) { setLoading(false); return; }
    setLoading(true);
    const targetEndpoint = provider === 'scalefusion' ? config.scalefusionEndpoint : config.endpoint;
    api.get(targetEndpoint)
      .then((r) => setRows(config.extract(r)))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [dataset, provider]);

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
        <p className="text-sm text-[var(--muted)] mt-1">Navigate here by clicking a widget or chart segment on the MDM page.</p>
        <Link to="/mdm" className="mt-4 text-sm text-indigo-500 hover:text-indigo-700 font-semibold">Back to MDM</Link>
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

  const singleRecordFields = SINGLE_RECORD_FILTERS[filterId] || null;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <button onClick={() => navigate(-1)} className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold mb-1">
            ← Back
          </button>
          <h1 className="text-xl font-bold text-[var(--foreground)]">{title || 'Details'}</h1>
          {!singleRecordFields && (
            <p className="text-sm text-[var(--muted)] mt-0.5">{processedRows.length} row{processedRows.length === 1 ? '' : 's'}</p>
          )}
        </div>
      </div>

      {singleRecordFields ? (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
          {processedRows.length === 0
            ? <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">Record not found</div>
            : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-[var(--card-border)]">
                  {singleRecordFields.map(([label, getValue]) => (
                    <tr key={label}>
                      <td className="px-4 py-2.5 font-medium text-[var(--muted)] w-56 align-top">{label}</td>
                      <td className="px-4 py-2.5 text-[var(--foreground)] break-all">{getValue(processedRows[0]) ?? '—'}</td>
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
