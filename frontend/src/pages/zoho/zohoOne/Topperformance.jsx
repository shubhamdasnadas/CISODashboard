import { useMemo } from 'react';

const getCreatedDate = (t) => t.createdTime || t.created_at || '';
const getClosedDate  = (t) => t.closedTime || t.closed_at || t.closedAt || t.closeTime || t.closedDate || '';

const getAssignee = (t) => {
  const first = t.assignee?.firstName || '';
  const last  = t.assignee?.lastName  || '';
  return `${first} ${last}`.trim();
};

const isClosedTicket = (t) => {
  const s = String(t.status || '').trim().toLowerCase();
  return s === 'closed' || s === 'close' || s === 'technically closed';
};

const calcResolvedHours = (t) => {
  const created = getCreatedDate(t);
  const closed  = getClosedDate(t);
  if (!created || !closed) return null;
  const c = new Date(created), cl = new Date(closed);
  if (isNaN(c.getTime()) || isNaN(cl.getTime())) return null;
  const diff = cl - c;
  return diff < 0 ? null : diff / (1000 * 60 * 60);
};

const getScore = (hours) => {
  let s = 100 - Math.floor(hours / 10) * 10;
  if (hours > 100) s = 10;
  return Math.max(10, Math.min(100, s));
};

export default function Topperformance({ tickets, onRowClick }) {
  const tableData = useMemo(() => {
    const map = {};
    tickets.forEach(t => {
      if (!isClosedTicket(t)) return;
      const hours = calcResolvedHours(t);
      if (hours === null) return;
      const name = getAssignee(t);
      if (!name || name === 'Unassigned') return;
      if (!map[name]) map[name] = { engineerName: name, totalHours: 0, ticketCount: 0 };
      map[name].totalHours += hours;
      map[name].ticketCount++;
    });
    return Object.values(map).sort((a, b) => a.totalHours - b.totalHours).slice(0, 5);
  }, [tickets]);

  return (
    <div className="w-full h-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm flex flex-col overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex-shrink-0">
        <h2 className="text-base font-bold text-[var(--foreground)]">Top Lowest 5 Performance</h2>
        <p className="text-xs text-[var(--muted)] mt-1">Engineer wise total time taken from created to closed</p>
      </div>
      <div className="flex-1 p-4 overflow-y-auto min-h-[380px] flex flex-col justify-start">
        <div className="overflow-hidden rounded-xl border border-[var(--card-border)]">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-[var(--muted-bg)]">
              <tr>
                {['Engineer Name', 'Closed Tickets', 'Score Point', 'Total Time (h)'].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 border-b border-[var(--card-border)] text-xs font-semibold text-[var(--muted)] ${i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'} whitespace-nowrap`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {tableData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-[var(--muted)]">
                    No closed tickets found
                  </td>
                </tr>
              ) : tableData.map((row, idx) => (
                <tr key={row.engineerName} className="hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
                  onClick={() => { if (onRowClick) onRowClick(row.engineerName); }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-xs text-[var(--foreground)] truncate max-w-[130px]" title={row.engineerName}>
                        {row.engineerName}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-xs text-[var(--foreground)]">
                    {row.ticketCount}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-xs text-red-600 dark:text-red-400">
                    {getScore(row.totalHours).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-xs text-red-600 dark:text-red-400">
                    {row.totalHours.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
