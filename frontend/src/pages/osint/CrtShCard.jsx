import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Badge } from '../../components/UI.jsx';
import DynChart from '../dashboard/DynChart.jsx';
import { historyToTrendRows } from './osintChartUtils.js';

const ISSUER_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];

export default function CrtShCard({ latest, history }) {
  if (!latest) return <div className="text-xs text-muted">Not fetched yet.</div>;
  if (latest.response_data?.error) {
    return <div className="text-xs text-rose-400">{latest.response_data.message}</div>;
  }

  const data = latest.response_data?.data || {};
  const trendRows = historyToTrendRows(history, 'subdomainCount');
  const issuerRows = Object.entries(data.issuers || {}).map(([name, value], i) => ({
    name, value, fill: ISSUER_COLORS[i % ISSUER_COLORS.length],
  }));

  return (
    <>
      <div className="flex gap-4 mb-3">
        <div>
          <div className="text-2xl font-bold">{data.subdomainCount ?? 0}</div>
          <div className="text-xs text-muted">Subdomains found</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{data.certCount ?? 0}</div>
          <div className="text-xs text-muted">Certificates</div>
        </div>
      </div>

      {trendRows.length > 1 && (
        <div className="h-32 mb-3">
          <DynChart rows={trendRows} xList={['date']} yList={['subdomainCount']} chartType="line" />
        </div>
      )}

      {issuerRows.length > 0 && (
        <div className="h-40 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={issuerRows} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="45%" outerRadius="70%" paddingAngle={2}>
                {issuerRows.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {(data.subdomains || []).length > 0 && (
        <div className="text-xs">
          <div className="text-muted mb-1">Latest subdomains</div>
          <div className="max-h-32 overflow-auto space-y-1">
            {data.subdomains.slice(0, 10).map((s) => (
              <div key={s} className="font-mono text-muted">{s}</div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-muted mt-2">
        Fetched: <Badge color="green">{new Date(latest.fetched_at).toLocaleString()}</Badge>
      </div>
    </>
  );
}
