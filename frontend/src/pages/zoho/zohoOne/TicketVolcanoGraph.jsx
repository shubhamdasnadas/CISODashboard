import { useMemo } from 'react';

const BAR_W = 54;
const DEPTH_X = 18;
const DEPTH_Y = 18;

const buckets = [
  { label: '0 - 3h',   min: 0,   max: 3,        color: '#2563eb', light: '#60a5fa', dark: '#1d4ed8' },
  { label: '3 - 7h',   min: 3,   max: 7,        color: '#22c55e', light: '#4ade80', dark: '#15803d' },
  { label: '7 - 15h',  min: 7,   max: 15,       color: '#eab308', light: '#facc15', dark: '#ca8a04' },
  { label: '15 - 30h', min: 15,  max: 30,       color: '#f97316', light: '#fb923c', dark: '#c2410c' },
  { label: '> 30h',    min: 30,  max: Infinity, color: '#ef4444', light: '#f87171', dark: '#b91c1c' },
];

const normalizeText = (v) => String(v || '').trim();

const getCreatedAt = (t) => normalizeText(t.created_at) || normalizeText(t.createdTime);
const getClosedAt  = (t) => normalizeText(t.closed_at) || normalizeText(t.closedTime) || normalizeText(t.closedAt) || normalizeText(t.closeTime) || normalizeText(t.closedDate);

function getTicketHours(ticket) {
  const createdAt = getCreatedAt(ticket);
  const closedAt  = getClosedAt(ticket);
  const createdDate = new Date(createdAt);
  const endDate = closedAt ? new Date(closedAt) : new Date();
  if (!createdAt || isNaN(createdDate.getTime()) || isNaN(endDate.getTime()) || endDate < createdDate) return null;
  return (endDate - createdDate) / (1000 * 60 * 60);
}

export default function TicketVolcanoGraph({ tickets, onBarClick }) {
  const graphBuckets = useMemo(() => {
    const counts = buckets.map(b => ({ ...b, count: 0 }));
    tickets.forEach(ticket => {
      const hours = getTicketHours(ticket);
      if (hours === null) return;
      const bucket = counts.find(b => hours >= b.min && hours < b.max);
      if (bucket) bucket.count++;
    });
    return counts;
  }, [tickets]);

  const totalTickets = graphBuckets.reduce((s, b) => s + b.count, 0);
  const maxCount = Math.max(...graphBuckets.map(b => b.count), 1);
  const axisValues = Array.from({ length: 6 }, (_, i) => Math.round((maxCount / 5) * (5 - i)));

  return (
    <section className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">Ticket Hour Bucket Graph</h2>
          <p className="text-sm text-[var(--muted)]">3D style ticket count graph based on resolution hours.</p>
        </div>
        <div className="text-sm font-semibold text-[var(--muted)]">{totalTickets} tickets</div>
      </div>

      <div className="relative min-h-[540px] overflow-hidden rounded-lg border border-slate-800 bg-[#06101e] p-5 text-slate-200">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#08162a_0%,#050b15_100%)]" />
        <div className="absolute left-6 top-8 z-20 text-xs font-bold uppercase tracking-wide text-slate-300">Number of Tickets</div>
        <div className="absolute left-8 top-20 bottom-24 z-20 flex flex-col justify-between text-xs font-semibold text-slate-400">
          {axisValues.map(v => <span key={v}>{v}</span>)}
        </div>
        <div className="absolute left-20 right-10 bottom-24 top-20 z-0 border-b border-l border-slate-500/40">
          <div className="h-full w-full bg-[linear-gradient(0deg,rgba(148,163,184,0.13)_1px,transparent_1px)] bg-[size:100%_20%]" />
        </div>
        <div className="absolute left-24 right-16 bottom-24 top-20 z-10 flex items-end justify-around gap-8">
          {graphBuckets.map(bucket => {
            const heightPercent = Math.max(bucket.count > 0 ? 12 : 2, (bucket.count / maxCount) * 82);
            return (
              <div key={bucket.label} className="flex h-full flex-1 flex-col items-center justify-end cursor-pointer" onClick={() => { if (bucket.count > 0 && onBarClick) onBarClick(bucket.label, bucket.min, bucket.max); }}>
                <div className="relative flex h-full w-full items-end justify-center">
                  <div className="relative" style={{ width: BAR_W + DEPTH_X, height: `${heightPercent}%` }}>
                    <svg viewBox={`0 0 ${BAR_W + DEPTH_X} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                      <polygon points={`0,${DEPTH_Y} ${BAR_W},${DEPTH_Y} ${BAR_W},100 0,100`} fill={bucket.color} />
                      <polygon points={`${BAR_W},${DEPTH_Y} ${BAR_W + DEPTH_X},0 ${BAR_W + DEPTH_X},${100 - DEPTH_Y} ${BAR_W},100`} fill={bucket.dark} />
                      <polygon points={`0,${DEPTH_Y} ${BAR_W},${DEPTH_Y} ${BAR_W + DEPTH_X},0 ${DEPTH_X},0`} fill={bucket.light} />
                    </svg>
                    <div className="absolute -top-10 left-[27px] -translate-x-1/2 text-sm font-bold text-white">{bucket.count}</div>
                  </div>
                </div>
                <div className="mt-5 text-center text-xs font-bold text-slate-300">{bucket.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        {graphBuckets.map(bucket => (
          <div key={bucket.label} className="rounded-md border border-[var(--card-border)] bg-[var(--muted-bg)] px-3 py-2 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => { if (bucket.count > 0 && onBarClick) onBarClick(bucket.label, bucket.min, bucket.max); }}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: bucket.color }} />
              <span className="text-xs font-bold uppercase text-[var(--muted)]">{bucket.label}</span>
            </div>
            <div className="mt-1 text-lg font-bold text-[var(--foreground)]">{bucket.count}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
