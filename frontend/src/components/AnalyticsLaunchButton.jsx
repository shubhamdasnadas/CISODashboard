import { useNavigate } from 'react-router-dom';
import { openInAnalytics } from '../pages/Analytics.jsx';

/**
 * Small "View in Analytics" button used across module pages (Checkpoint, MDM,
 * NVD, SentinelOne, Microsoft365, Zoho, Firewall). Opens the Analytics page
 * pre-filtered to this module over the last `days` days so users can compare
 * activity day-wise against the rest of the platform.
 */
export default function AnalyticsLaunchButton({ moduleKey, days = 7, label = 'View in Analytics' }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => openInAnalytics(navigate, moduleKey, days)}
      title="Open Analytics comparison for this module"
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] hover:text-indigo-500 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      {label}
    </button>
  );
}
