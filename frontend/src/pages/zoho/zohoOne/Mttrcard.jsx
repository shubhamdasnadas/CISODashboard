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
    <div className="flex flex-col items-center rounded-xl border border-slate-700 bg-slate-950/40 p-4">
      <h3 className="mb-3 text-sm font-bold text-white">{title}</h3>
      <div className="relative h-[180px] w-[320px]">
        <svg viewBox="0 0 320 180" className="absolute inset-0">
          <path d="M40 150 A120 120 0 0 1 90 60"   stroke="#ef4444" strokeWidth="28" fill="none" strokeLinecap="round" />
          <path d="M90 60 A120 120 0 0 1 145 35"   stroke="#f59e0b" strokeWidth="28" fill="none" strokeLinecap="round" />
          <path d="M145 35 A120 120 0 0 1 175 35"  stroke="#eab308" strokeWidth="28" fill="none" strokeLinecap="round" />
          <path d="M175 35 A120 120 0 0 1 230 60"  stroke="#84cc16" strokeWidth="28" fill="none" strokeLinecap="round" />
          <path d="M230 60 A120 120 0 0 1 280 150" stroke="#22c55e" strokeWidth="28" fill="none" strokeLinecap="round" />
        </svg>
        <div className="absolute left-1/2 bottom-[28px] origin-bottom" style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}>
          <div className="h-[110px] w-[4px] rounded-full" style={{ backgroundColor: scoreColor }} />
        </div>
        <div className="absolute bottom-[15px] left-1/2 h-8 w-8 -translate-x-1/2 rounded-full bg-slate-200 shadow-lg" />
      </div>
      <div className="text-center">
        <div className="text-5xl font-bold" style={{ color: scoreColor }}>{score}</div>
        <div className="mt-1 text-xs text-slate-400">MTTR Score</div>
        <div className="mt-2 text-base font-semibold text-white">{hours.toFixed(2)} Hours</div>
        <div className="text-xs text-slate-400">{subtitle}</div>
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
    <div className="w-full rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-lg cursor-pointer hover:shadow-xl transition-shadow" onClick={() => { if (onCardClick) onCardClick(); }}>
      <h2 className="mb-6 text-xl font-bold text-white">MTTR Score</h2>
      <MttrGauge title="Average MTTR" score={calculateMttrScore(avgScore)} hours={avgResolutionTime} subtitle="Mean Time To Resolution" />
    </div>
  );
}
