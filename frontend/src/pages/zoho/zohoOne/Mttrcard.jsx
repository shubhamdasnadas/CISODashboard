import { useMemo } from 'react';

const getCreatedDate = (t) => t.createdTime || t.created_at || '';
const getClosedDate  = (t) => t.closedTime || t.closed_at || t.closedAt || t.closeTime || t.closedDate || '';

const getMttrScore = (hours) => {
  if (hours < 12) return 100;
  if (hours < 24) return 90;
  if (hours < 36) return 75;
  if (hours < 48) return 60;
  if (hours < 60) return 40;
  return 20;
};

const calculateMttrScore = (hours) => Math.max(0, Math.min(100, Math.round(((100 - hours) / 100) * 100)));

const getScoreColor = (score) => {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#84cc16';
  if (score >= 40) return '#eab308';
  return '#ef4444';
};

function MttrGauge({ title, score, hours, subtitle }) {
  const rotation = (score / 100) * 180 - 90;
  const scoreColor = getScoreColor(score);
  return (
    <div className="w-full max-w-sm flex flex-col items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--muted-bg)]/50 p-4 sm:p-5 shadow-inner">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{title}</h3>
      <div className="relative h-[160px] w-[280px] sm:w-[300px] flex items-center justify-center">
        <svg viewBox="0 0 320 180" className="w-full h-full">
          <path d="M40 150 A120 120 0 0 1 90 60"   stroke="#ef4444" strokeWidth="26" fill="none" strokeLinecap="round" />
          <path d="M90 60 A120 120 0 0 1 145 35"   stroke="#f59e0b" strokeWidth="26" fill="none" strokeLinecap="round" />
          <path d="M145 35 A120 120 0 0 1 175 35"  stroke="#eab308" strokeWidth="26" fill="none" strokeLinecap="round" />
          <path d="M175 35 A120 120 0 0 1 230 60"  stroke="#84cc16" strokeWidth="26" fill="none" strokeLinecap="round" />
          <path d="M230 60 A120 120 0 0 1 280 150" stroke="#22c55e" strokeWidth="26" fill="none" strokeLinecap="round" />
        </svg>
        <div className="absolute left-1/2 bottom-[24px] origin-bottom" style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}>
          <div className="h-[96px] w-[4px] rounded-full shadow-md" style={{ backgroundColor: scoreColor }} />
        </div>
        <div className="absolute bottom-[14px] left-1/2 h-7 w-7 -translate-x-1/2 rounded-full bg-[var(--card-bg)] border-2 border-[var(--card-border)] shadow-md" />
      </div>
      <div className="text-center mt-1">
        <div className="text-4xl font-extrabold" style={{ color: scoreColor }}>{score}</div>
        <div className="text-xs font-semibold text-[var(--muted)] mt-0.5">MTTR Score</div>
        <div className="mt-2 text-base font-bold text-[var(--foreground)]">{hours.toFixed(2)} Hours</div>
        <div className="text-xs text-[var(--muted)]">{subtitle}</div>
      </div>
    </div>
  );
}

export default function Mttrcard({ tickets, onCardClick }) {
  const { avgResolutionTime, avgScore } = useMemo(() => {
    const times = tickets.map(t => {
      const created = new Date(getCreatedDate(t));
      const closed  = new Date(getClosedDate(t));
      if (isNaN(created.getTime()) || isNaN(closed.getTime()) || closed < created) return null;
      return (closed - created) / (1000 * 60 * 60);
    }).filter(v => v !== null);

    const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    return { avgResolutionTime: avg, avgScore: getMttrScore(avg) };
  }, [tickets]);

  return (
    <div className="w-full h-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm flex flex-col overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => { if (onCardClick) onCardClick(); }}>
      <div className="px-5 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex-shrink-0">
        <h2 className="text-base font-bold text-[var(--foreground)]">MTTR Score</h2>
        <p className="text-xs text-[var(--muted)] mt-1">Mean Time To Resolution &amp; SLA</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 min-h-[380px]">
        <MttrGauge title="Average MTTR" score={calculateMttrScore(avgScore)} hours={avgResolutionTime} subtitle="Mean Time To Resolution" />
      </div>
    </div>
  );
}
