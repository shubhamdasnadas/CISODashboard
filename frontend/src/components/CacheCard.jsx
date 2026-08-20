import { useState, useEffect, useCallback } from 'react';
import api from '../api.js';

/**
 * CacheCard — a reusable dashboard card backed by the Redis cache-aside layer.
 *
 * - Reads from GET /api/cache/:resourceKey (Redis first → Postgres fallback).
 * - Shows a subtle badge: "Live (cached)" when source === 'redis',
 *   "Refreshed just now" right after a manual sync, "DB (fallback)" when Redis
 *   is down and data came from Postgres.
 * - A manual Refresh button calls POST /api/cache/:resourceKey/refresh to
 *   trigger an immediate sync job.
 *
 * `render` receives the cached `data` payload and renders the card body.
 */
export default function CacheCard({
  title,
  resourceKey,
  render,
  pollIntervalMs = 0,
  className = '',
}) {
  const [data, setData] = useState(null);
  const [source, setSource] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/cache/${encodeURIComponent(resourceKey)}`);
      setData(r.data.data);
      setSource(r.data.source);
      setUpdatedAt(r.data.updatedAt);
      setError(null);
      setJustRefreshed(false);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [resourceKey]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.post(`/cache/${encodeURIComponent(resourceKey)}/refresh`);
      await load();
      setJustRefreshed(true);
      // Clear the "just refreshed" highlight after a few seconds.
      setTimeout(() => setJustRefreshed(false), 4000);
    } catch (e) {
      setError(e.response?.data?.message || 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, [resourceKey, load]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!pollIntervalMs) return;
    const id = setInterval(load, pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs, load]);

  // Source badge
  let badge = null;
  let badgeClass = '';
  if (justRefreshed) {
    badge = 'Refreshed just now';
    badgeClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  } else if (source === 'redis') {
    badge = 'Live (cached)';
    badgeClass = 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300';
  } else if (source === 'postgres') {
    badge = 'DB (fallback)';
    badgeClass = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  } else if (source === 'miss' || error) {
    badge = 'No data';
    badgeClass = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
  }

  return (
    <div className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
          {updatedAt && (
            <p className="text-[10px] text-[var(--muted)] mt-0.5">
              updated {new Date(updatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
              {badge}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Refresh now"
            className="p-1.5 rounded-lg border border-[var(--card-border)] text-[var(--muted)] hover:bg-[var(--muted-bg)] disabled:opacity-50 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3M20 15a8 8 0 01-14 3" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[var(--muted)] text-xs">
          <div className="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
          Loading…
        </div>
      ) : error ? (
        <p className="text-xs text-red-500 py-2">{error}</p>
      ) : data != null ? (
        render(data)
      ) : (
        <p className="text-xs text-[var(--muted)] py-2">No data synced yet.</p>
      )}
    </div>
  );
}
