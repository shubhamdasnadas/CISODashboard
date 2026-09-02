import { useState, useEffect } from 'react';
import api from '../api';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = () => {
    setLoading(true);
    api.get('/notifications').then(r => setNotifications(r.data.notifications || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const markRead = async id => {
    await api.put(`/notifications/${id}/read`).catch(() => {});
    fetch();
  };

  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Notifications</h1>
          <p className="text-sm text-[var(--muted)] mt-1">{unread} unread</p>
        </div>
        {unread > 0 && (
          <button onClick={async () => { await Promise.all(notifications.filter(n => !n.is_read).map(n => api.put(`/notifications/${n.id}/read`))); fetch(); }}
            className="text-sm text-indigo-600 hover:underline font-medium">Mark all read</button>
        )}
      </div>
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        {loading ? (
          <WidgetSkeleton variant="table" />
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)]">No notifications.</div>
        ) : (
          <div className="divide-y divide-[var(--card-border)]">
            {notifications.map(n => (
              <div key={n.id} className={`flex items-start gap-4 px-6 py-4 hover:bg-[var(--muted-bg)] ${!n.is_read ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''}`}>
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-indigo-600'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.is_read ? 'text-[var(--muted)]' : 'text-[var(--foreground)] font-medium'}`}>{n.message || n.title}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                {!n.is_read && (
                  <button onClick={() => markRead(n.id)} className="text-xs text-indigo-600 hover:underline flex-shrink-0">Mark read</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
