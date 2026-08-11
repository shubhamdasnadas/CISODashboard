import { useMemo, useState } from 'react';

const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const CELL_SIZE   = 40;
const LABEL_WIDTH = 70;

const getColor = (count, max) => {
  if (count === 0) return '#F5EFE6';
  const i = count / max;
  if (i <= 0.2) return '#F8D48B';
  if (i <= 0.4) return '#F3BE52';
  if (i <= 0.6) return '#EDA41B';
  if (i <= 0.8) return '#C97A05';
  return '#000000';
};

const formatHour = (h) => {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const d = h % 12 === 0 ? 12 : h % 12;
  return `${d} ${suffix}`;
};

const fmt = (s, opts) => s ? new Date(s).toLocaleString('en-GB', opts) : '-';

export default function Hourbasedset({ tickets, onCellClick }) {
  const [activeTooltip, setActiveTooltip] = useState(null);

  const heatmapData = useMemo(() => {
    const matrix = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ count: 0, tickets: [] }))
    );
    tickets.forEach(t => {
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

  const maxCount = Math.max(...heatmapData.flat().map(c => c.count), 1);

  return (
    <div className="w-full bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-6">Ticket Creation Heatmap</h2>

      {/* Scroll container — no flex/centering here, or overflowing content gets clipped on both edges */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_WIDTH + HOURS.length * (CELL_SIZE + 4) }}>
          <div className="flex mb-4">
            <div style={{ width: LABEL_WIDTH }} />
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(24, ${CELL_SIZE}px)` }}>
              {HOURS.map(h => (
                <div key={h} className="text-[11px] font-medium text-center text-gray-600" style={{ width: CELL_SIZE }}>{formatHour(h)}</div>
              ))}
            </div>
          </div>

          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex items-center mb-2">
              <div className="font-semibold text-gray-700 flex items-center" style={{ width: LABEL_WIDTH, height: CELL_SIZE }}>{day}</div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(24, ${CELL_SIZE}px)` }}>
                {HOURS.map(hour => {
                  const bucket = heatmapData[dayIdx][hour];
                  const key = `${dayIdx}-${hour}`;
                  return (
                    <div key={key} className="relative">
                      <div
                        onClick={() => { setActiveTooltip(activeTooltip === key ? null : key); if (bucket.count > 0 && onCellClick) onCellClick(day, hour); }}
                        className="rounded-md border border-white hover:scale-105 transition-all duration-200 cursor-pointer"
                        style={{ width: CELL_SIZE, height: CELL_SIZE, backgroundColor: getColor(bucket.count, maxCount) }}
                      />
                      {activeTooltip === key && bucket.count > 0 && (
                        <div className="absolute z-[99999] top-0 left-full ml-3 w-[450px] max-h-[450px] overflow-y-auto rounded-lg bg-slate-900 text-white text-xs shadow-2xl border border-slate-700 p-4">
                          <div className="flex justify-between items-center mb-3">
                            <div className="font-semibold text-sm text-yellow-300">{day} • {formatHour(hour)}</div>
                            <button onClick={() => setActiveTooltip(null)} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
                          </div>
                          <div className="mb-3"><strong>Total Tickets:</strong> {bucket.count}</div>
                          {bucket.tickets.map((t, i) => {
                            const created = t.createdTime || t.created_at;
                            return (
                              <div key={i} className="border-t border-slate-700 pt-2 mt-2">
                                <div><strong>Ticket:</strong> {t.ticketNumber || t.ticket_no || '-'}</div>
                                <div><strong>Date:</strong> {fmt(created, { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                <div><strong>Time:</strong> {fmt(created, { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                                <div className="break-words"><strong>Subject:</strong> {t.subject || '-'}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex justify-end items-center gap-2 mt-6">
            <span className="text-sm text-gray-500">Less</span>
            {['#F5EFE6', '#F8D48B', '#F3BE52', '#EDA41B', '#000000'].map((c, i) => (
              <div key={i} className="rounded" style={{ width: 18, height: 18, backgroundColor: c }} />
            ))}
            <span className="text-sm text-gray-500">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}