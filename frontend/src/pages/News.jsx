import { useState, useEffect, useCallback } from 'react';
import api from '../api';

// ── News sections (mirror of the former dashboard news feed) ───────────────────
const NEWS_SECTIONS = [
  { key: 'cyber', q: 'cybersecurity', label: 'Cybersecurity', sublabel: 'News & Alerts', gradientFrom: '#3b82f6', gradientTo: '#2563eb', textColor: 'text-blue-500', bgColor: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-blue-600 dark:text-blue-400', lineFrom: 'from-blue-200 dark:from-blue-800' },
  { key: 'threats', q: 'malware ransomware exploit', label: 'Threats & Vulnerabilities', sublabel: 'Attack Intelligence', gradientFrom: '#ef4444', gradientTo: '#dc2626', textColor: 'text-red-500', bgColor: 'bg-red-100 dark:bg-red-900/40', iconColor: 'text-red-600 dark:text-red-400', lineFrom: 'from-red-200 dark:from-red-800' },
  { key: 'breaches', q: 'data breach hack leak', label: 'Data Breaches', sublabel: 'Incidents', gradientFrom: '#f97316', gradientTo: '#ea580c', textColor: 'text-orange-500', bgColor: 'bg-orange-100 dark:bg-orange-900/40', iconColor: 'text-orange-600 dark:text-orange-400', lineFrom: 'from-orange-200 dark:from-orange-800' },
];

const PER_SECTION_LIMIT = 50;

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

export default function News() {
  const [newsData, setNewsData] = useState({ cyber: [], threats: [], breaches: [] });
  const [newsLoading, setNewsLoading] = useState({ cyber: true, threats: true, breaches: true });

  const refresh = useCallback(() => {
    NEWS_SECTIONS.forEach(({ key, q }) => {
      setNewsLoading((prev) => ({ ...prev, [key]: true }));
      api.get(`/news?q=${encodeURIComponent(q)}&limit=${PER_SECTION_LIMIT}`)
        .then((r) => setNewsData((prev) => ({ ...prev, [key]: r.data?.articles ?? [] })))
        .catch(() => setNewsData((prev) => ({ ...prev, [key]: [] })))
        .finally(() => setNewsLoading((prev) => ({ ...prev, [key]: false })));
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const totalArticles = NEWS_SECTIONS.reduce((sum, s) => sum + (newsData[s.key]?.length || 0), 0);
  const anyLoading = NEWS_SECTIONS.some((s) => newsLoading[s.key]);

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">News</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Security news, threats &amp; breach alerts{anyLoading || totalArticles ? ` · ${totalArticles} articles` : ''}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={anyLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <svg className={`w-4 h-4 ${anyLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {anyLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* News sections */}
      {NEWS_SECTIONS.map((section) => (
        <div key={section.key} className="mt-8 mb-2 first:mt-0">
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
            {newsData[section.key]?.length > 0 && (
              <span className="text-xs text-[var(--muted)]">{newsData[section.key].length} articles</span>
            )}
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {newsLoading[section.key]
              ? Array.from({ length: 8 }).map((_, i) => <NewsSkeletonCard key={i} />)
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
      ))}
    </div>
  );
}
