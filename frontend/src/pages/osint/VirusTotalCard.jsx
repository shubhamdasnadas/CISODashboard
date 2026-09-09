import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Badge } from '../../components/UI.jsx';
import DynChart from '../dashboard/DynChart.jsx';
import { historyToTrendRows } from './osintChartUtils.js';

const STATUS_COLORS = { malicious: '#ef4444', suspicious: '#f59e0b', harmless: '#10b981', undetected: '#64748b' };

export default function VirusTotalCard({ latest, history }) {
  if (!latest) return <div className="text-xs text-muted">Not fetched yet.</div>;
  if (latest.response_data?.error) {
    return <div className="text-xs text-rose-400">{latest.response_data.message}</div>;
  }

  const data = latest.response_data?.data || {};
  const statusRows = ['malicious', 'suspicious', 'harmless', 'undetected']
    .map((k) => ({ name: k, value: data[k] || 0, fill: STATUS_COLORS[k] }))
    .filter((r) => r.value > 0);
  const trendRows = historyToTrendRows(history, 'malicious');

  return (
    <>
      <div className="flex gap-2 mb-3 flex-wrap">
        <Badge color={data.malicious > 0 ? 'red' : 'gray'}>{data.malicious ?? 0} malicious</Badge>
        <Badge color={data.suspicious > 0 ? 'amber' : 'gray'}>{data.suspicious ?? 0} suspicious</Badge>
        <Badge color="green">{data.harmless ?? 0} harmless</Badge>
        <Badge color="gray">{data.undetected ?? 0} undetected</Badge>
      </div>

      {statusRows.length > 0 && (
        <div className="h-40 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={statusRows} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="45%" outerRadius="70%" paddingAngle={2}>
                {statusRows.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {trendRows.length > 1 && (
        <div className="h-32 mb-3">
          <DynChart rows={trendRows} xList={['date']} yList={['malicious']} chartType="line" />
        </div>
      )}

      <div className="text-xs text-muted">
        Fetched: <Badge color="green">{new Date(latest.fetched_at).toLocaleString()}</Badge>
      </div>
    </>
  );
}
