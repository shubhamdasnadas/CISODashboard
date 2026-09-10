import { useMemo, useState } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const getHeatmapColor = (count, max) => {
  if (count === 0) return 'rgba(148, 163, 184, 0.12)';
  const i = count / max;
  if (i <= 0.2) return '#fed7aa';
  if (i <= 0.4) return '#fb923c';
  if (i <= 0.6) return '#f97316';
  if (i <= 0.8) return '#ea580c';
  return '#dc2626';
};

const formatHour = (h) => {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const d = h % 12 === 0 ? 12 : h % 12;
  return `${d} ${suffix}`;
};

const formatShortHour = (h) => {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
};

const fmt = (s, opts) => (s ? new Date(s).toLocaleString('en-GB', opts) : '-');

export default function Hourbasedset({ tickets = [], onCellClick }) {
  const [activeTooltip, setActiveTooltip] = useState(null);

  const heatmapData = useMemo(() => {
    const matrix = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ count: 0, tickets: [] }))
    );
    tickets.forEach((t) => {
      const val = t.createdTime || t.created_at;
      if (!val) return;
      const d = new Date(val);
      if (isNaN(d.getTime())) return;
      let day = d.getDay();
      day = day === 0 ? 6 : day - 1;
      const hour = d.getHours();
      matrix[day][hour].count++;
      matrix[day][hour].tickets.push(t);
    });
    return matrix;
  }, [tickets]);

  const maxCount = Math.max(...heatmapData.flat().map((c) => c.count), 1);
  const totalTickets = useMemo(() => heatmapData.flat().reduce((s, c) => s + c.count, 0), [heatmapData]);

  return (
    <div className="w-full h-full min-h-[480px] sm:min-h-[520px] rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm p-5 sm:p-6 flex flex-col justify-between overflow-hidden">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--foreground)]">Ticket Creation Heatmap</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">24-hour creation patterns across days of the week</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
            {totalTickets} Tickets
          </span>
        </div>

        {/* Heatmap Grid - 100% Fluid Width with Prominent Row Height */}
        <div className="w-full my-auto py-3">
          {/* Hour Milestone Header */}
          <div className="flex items-center mb-2">
            <div className="w-9 sm:w-11 flex-shrink-0" />
            <div
              className="flex-1 gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-[var(--muted)] font-semibold text-center select-none"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
            >
              {HOURS.map((h) => (
                <div key={h} className="truncate">
                  {h % 3 === 0 ? formatShortHour(h) : ''}
                </div>
              ))}
            </div>
          </div>

          {/* 7 Day Rows */}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex items-center mb-2 sm:mb-2.5">
              <div className="w-9 sm:w-11 text-xs sm:text-sm font-bold text-[var(--muted)] flex-shrink-0 select-none">
                {day}
              </div>
              <div
                className="flex-1 gap-1 sm:gap-1.5"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
              >
                {HOURS.map((hour) => {
                  const bucket = heatmapData[dayIdx][hour];
                  const count = bucket.count;
                  const key = `${dayIdx}-${hour}`;
                  const isSelected = activeTooltip === key;

                  return (
                    <div key={key} className="relative w-full h-8 sm:h-9">
                      <div
                        onClick={() => {
                          setActiveTooltip(isSelected ? null : key);
                          if (count > 0 && onCellClick) onCellClick(day, hour);
                        }}
                        title={`${day} • ${formatHour(hour)}: ${count} Ticket${count !== 1 ? 's' : ''}`}
                        className={`w-full h-full rounded-md sm:rounded-lg cursor-pointer transition-all duration-150 ${
                          count > 0 ? 'hover:scale-115 hover:z-20 hover:ring-2 hover:ring-indigo-400 shadow-sm' : 'hover:opacity-80'
                        }`}
                        style={{
                          backgroundColor: getHeatmapColor(count, maxCount),
                        }}
                      />

                      {/* Tooltip Popup on Click */}
                      {isSelected && count > 0 && (
                        <div className="absolute z-[9999] bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 max-h-64 overflow-y-auto rounded-xl bg-[var(--card-bg)] text-[var(--foreground)] text-xs shadow-2xl border border-[var(--card-border)] p-3.5 backdrop-blur-md">
                          <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-[var(--card-border)]">
                            <div className="font-bold text-amber-500 dark:text-amber-400">
                              {day} • {formatHour(hour)}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTooltip(null);
                              }}
                              className="text-[var(--muted)] hover:text-[var(--foreground)] font-bold px-1 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="mb-2 font-semibold text-[var(--foreground)]">Total: {count} tickets</div>
                          <div className="space-y-1.5">
                            {bucket.tickets.slice(0, 5).map((t, i) => {
                              const created = t.createdTime || t.created_at;
                              return (
                                <div key={i} className="rounded bg-[var(--muted-bg)] p-1.5 text-[11px] border border-[var(--card-border)]">
                                  <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                    #{t.ticketNumber || t.ticket_no || '-'}
                                  </div>
                                  <div className="text-[var(--muted)] text-[10px]">
                                    {fmt(created, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                  <div className="text-[var(--foreground)] truncate">{t.subject || '-'}</div>
                                </div>
                              );
                            })}
                            {bucket.tickets.length > 5 && (
                              <p className="text-[10px] text-[var(--muted)] text-center">
                                +{bucket.tickets.length - 5} more tickets
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Heatmap Legend */}
      <div className="flex justify-between items-center pt-3 border-t border-[var(--card-border)] text-xs text-[var(--muted)] flex-wrap gap-2">
        <span className="font-medium">Creation Intensity</span>
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          {['rgba(148, 163, 184, 0.12)', '#fed7aa', '#fb923c', '#f97316', '#ea580c', '#dc2626'].map((c, i) => (
            <div key={i} className="w-3.5 h-3.5 rounded-[3px]" style={{ backgroundColor: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
