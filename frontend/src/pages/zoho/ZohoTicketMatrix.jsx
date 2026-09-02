import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import WidgetSkeleton from '../dashboard/WidgetSkeleton.jsx';

const LIST_STATUS = [
  'Open', 'On Hold', 'Escalated', 'Technically Closed', 'Closed',
  'Duplicate', 'On Hold by Customer', 'Acknowledge', 'WIP', 'Re-Open',
  'Revert Awaited - Customer', 'Revert Awaited - OEM', 'Revert Awaited - Vendor',
];

const STATUS_COLORS = {
  'Open': '#6b8df7',
  'On Hold': '#ff9f43',
  'Escalated': '#ef6c57',
  'Technically Closed': '#2fb344',
  'Closed': '#2fb344',
  'Duplicate': '#2fb344',
  'On Hold by Customer': '#ff9f43',
  'Acknowledge': '#111827',
  'WIP': '#111827',
  'Re-Open': '#111827',
  'Revert Awaited - Customer': '#ff9f43',
  'Revert Awaited - OEM': '#ff9f43',
  'Revert Awaited - Vendor': '#ff9f43',
};

const DARK_TEXT_STATUSES = new Set(['Acknowledge', 'WIP', 'Re-Open']);

const normalizeText = (value) => String(value || '').trim();

const formatDateTime = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
};

/**
 * Department x status matrix from Zoho ticket data. Rendered on the
 * main /dashboard page.
 */
export default function ZohoTicketMatrix() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/zoho/tickets-db')
      .then(r => setTickets(r.data.responseData || []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, []);

  const departmentWiseData = useMemo(() => {
    const map = {};
    tickets.forEach(ticket => {
      const departmentName =
        normalizeText(ticket?.department?.name) ||
        normalizeText(ticket?.departmentName) ||
        'Unknown Department';
      const ticketStatus = normalizeText(ticket?.status);
      const matchedStatus = LIST_STATUS.find(s => s.toLowerCase() === ticketStatus.toLowerCase());
      if (!matchedStatus) return;
      if (!map[departmentName]) {
        map[departmentName] = { departmentName, statuses: {} };
        LIST_STATUS.forEach(s => { map[departmentName].statuses[s] = []; });
      }
      map[departmentName].statuses[matchedStatus].push(ticket);
    });
    return Object.values(map);
  }, [tickets]);

  if (loading) {
    return <WidgetSkeleton variant="table" />;
  }

  return (
    <div className="overflow-auto rounded-lg border border-[var(--card-border)] shadow-sm">
      <table className="w-max min-w-full border-collapse text-xs table-fixed">
        <thead>
          <tr className="bg-[var(--muted-bg)]">
            <th className="sticky left-0 z-20 bg-[var(--muted-bg)] text-left px-3 py-2.5 border-b border-[var(--card-border)] w-[180px] min-w-[180px] font-semibold text-[var(--foreground)]">
              Department Name
            </th>
            {LIST_STATUS.map(status => (
              <th key={status} className="px-2 py-2.5 border-b border-[var(--card-border)] text-left w-[115px] min-w-[115px] max-w-[115px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis text-[var(--foreground)]" title={status}>
                {status}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {departmentWiseData.map(row => (
            <tr key={row.departmentName} className="border-b border-[var(--card-border)] hover:bg-[var(--muted-bg)/50]">
              <td className="sticky left-0 z-10 bg-[var(--card-bg)] px-3 py-2 font-semibold text-indigo-600 w-[180px] min-w-[180px] whitespace-nowrap overflow-hidden text-ellipsis">
                {row.departmentName}
              </td>
              {LIST_STATUS.map(status => {
                const statusTickets = row.statuses?.[status] || [];
                const count = statusTickets.length;
                return (
                  <td key={status} className="relative px-0 py-0 w-[115px] min-w-[115px] max-w-[115px] border-l border-[var(--card-border)]">
                    {count > 0 ? (
                      <div className="group relative">
                        <div className="px-2 py-2 font-bold cursor-pointer h-[36px] flex items-center"
                          style={{ backgroundColor: STATUS_COLORS[status] || '#e5e7eb', color: DARK_TEXT_STATUSES.has(status) ? '#ffffff' : '#111827' }}>
                          {count}
                        </div>
                        <div className="hidden group-hover:block absolute z-50 top-full left-0 w-[760px] max-h-[360px] overflow-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-xl p-3">
                          <p className="font-bold mb-2 text-[var(--foreground)]">{row.departmentName} — {status} Tickets</p>
                          <table className="w-full text-xs border-collapse text-[var(--foreground)]">
                            <thead>
                              <tr className="bg-[var(--muted-bg)]">
                                {['Ticket No', 'Subject', 'Created Time', 'Assignee', 'Status'].map(h => (
                                  <th key={h} className="border border-[var(--card-border)] px-2 py-1 text-left">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {statusTickets.map((ticket, i) => {
                                const assigneeName = ticket?.assignee
                                  ? `${ticket.assignee.firstName || ''} ${ticket.assignee.lastName || ''}`.trim()
                                  : '-';
                                return (
                                  <tr key={ticket.id || ticket.ticketNumber || i}>
                                    <td className="border border-[var(--card-border)] px-2 py-1">{ticket.ticketNumber || '-'}</td>
                                    <td className="border border-[var(--card-border)] px-2 py-1">{ticket.subject || '-'}</td>
                                    <td className="border border-[var(--card-border)] px-2 py-1">{formatDateTime(ticket.createdTime)}</td>
                                    <td className="border border-[var(--card-border)] px-2 py-1">{assigneeName || '-'}</td>
                                    <td className="border border-[var(--card-border)] px-2 py-1">{ticket.status || '-'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="px-2 py-2 h-[36px] flex items-center text-[var(--muted)]">-</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {!departmentWiseData.length && (
            <tr>
              <td colSpan={LIST_STATUS.length + 1} className="px-4 py-8 text-center text-[var(--muted)]">
                No tickets found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
