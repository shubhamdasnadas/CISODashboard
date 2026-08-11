import { useMemo } from 'react';

const getClosedDate = (t) => t.closedTime || t.closed_at || t.closedAt || t.closeTime || t.closedDate || '';

const isSameMonth = (date, ref) => date.getMonth() === ref.getMonth() && date.getFullYear() === ref.getFullYear();

const getMonthName = (date) => date.toLocaleString('en-IN', { month: 'short' });

export default function Zohoticketcount({ tickets = [], loading = false, onCardClick }) {

  const counts = useMemo(() => {
    let open = 0, wip = 0, onHold = 0, revertAwaited = 0, closed = 0;
    let currentMonthClosed = 0, previousMonthClosed = 0;
    const now = new Date();
    const currentMonth  = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    tickets.forEach(t => {
      const s = String(t.status || '').trim().toLowerCase();
      if (s === 'open' || s === 're-open') open++;
      if (s === 'wip') wip++;
      if (s === 'on hold' || s === 'on hold by customer') onHold++;
      if (s === 'revert awaited - customer' || s === 'revert awaited - oem' || s === 'revert awaited - vendor') revertAwaited++;
      if (s === 'closed' || s === 'technically closed') {
        closed++;
        const d = new Date(getClosedDate(t));
        if (!isNaN(d.getTime())) {
          if (isSameMonth(d, currentMonth))  currentMonthClosed++;
          if (isSameMonth(d, previousMonth)) previousMonthClosed++;
        }
      }
    });

    const diff = currentMonthClosed - previousMonthClosed;
    const pct  = previousMonthClosed > 0 ? (diff / previousMonthClosed) * 100 : currentMonthClosed > 0 ? 100 : 0;

    return { open, wip, onHold, revertAwaited, closed, currentMonthClosed, previousMonthClosed, closedDifference: diff, closedPercentage: pct, currentMonthName: getMonthName(currentMonth), previousMonthName: getMonthName(previousMonth) };
  }, [tickets]);

  const cards = [
    { title: 'Open',            count: counts.open,          color: '#2563eb', bg: '#dbeafe' },
    { title: 'WIP',             count: counts.wip,           color: '#d97706', bg: '#fef3c7' },
    { title: 'On Hold',         count: counts.onHold,        color: '#f59e0b', bg: '#fef3c7' },
    { title: 'Revert Awaited',  count: counts.revertAwaited, color: '#7c3aed', bg: '#ede9fe' },
    { title: 'Closed',          count: counts.closed,        color: '#16a34a', bg: '#dcfce7', isClosedCard: true },
  ];

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map(card => {
          const isIncrease = counts.closedDifference > 0;
          const isDecrease = counts.closedDifference < 0;
          return (
            <div key={card.title} className="rounded-2xl border shadow-sm p-4 relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              style={{ backgroundColor: card.bg, borderColor: card.color }}
              onClick={() => { if (card.count > 0 && onCardClick) onCardClick(card); }}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold mb-2" style={{ color: card.color }}>{card.title}</p>
                {card.isClosedCard && (
                  <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${isIncrease ? 'bg-green-100 text-green-700' : isDecrease ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                    <span>{isIncrease ? '↑' : isDecrease ? '↓' : '→'}</span>
                    <span>{Math.abs(counts.closedDifference)}</span>
                    <span>({Math.abs(counts.closedPercentage).toFixed(1)}%)</span>
                  </div>
                )}
              </div>
              <h2 className="text-3xl font-bold" style={{ color: card.color }}>{loading ? '...' : card.count}</h2>
              {card.isClosedCard && (
                <div className="mt-2 text-[11px] font-medium text-green-700">
                  {counts.currentMonthName}: {counts.currentMonthClosed} | {counts.previousMonthName}: {counts.previousMonthClosed}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
