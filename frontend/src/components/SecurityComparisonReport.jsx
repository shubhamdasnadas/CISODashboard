import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../api';

const COLORS = ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
const SEV_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];

const TOOLTIP_STYLE = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--foreground)',
};

function WidgetCard({ title, children, className = '' }) {
  return (
    <div className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm ${className}`}>
      <div className="px-5 py-3.5 border-b border-[var(--card-border)]">
        <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function ChangeIndicator({ value }) {
  const num = parseFloat(value);
  const isPositive = num > 0;
  const isNegative = num < 0;
  const isNeutral = num === 0 || isNaN(num);

  if (isNeutral) return <span className="text-[var(--muted)]">—</span>;

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isPositive ? 'text-red-500' : 'text-green-500'}`}>
      {isPositive ? '▲' : '▼'} {Math.abs(num)}%
    </span>
  );
}

function SummaryMetricsTable({ metrics }) {
  const { previous, current, changes } = metrics;

  const rows = [
    { label: 'Total Events', prev: previous.total, curr: current.total, change: changes.total },
    { label: 'DLP Events', prev: previous.dlp, curr: current.dlp, change: changes.dlp },
    { label: 'Phishing Events', prev: previous.phishing, curr: current.phishing, change: changes.phishing },
    { label: 'Malware Events', prev: previous.malware, curr: current.malware, change: changes.malware },
    { label: 'High Severity (Sev 4)', prev: previous.highSeverity, curr: current.highSeverity, change: changes.highSeverity },
    { label: 'Remediated', prev: `${previous.remediated} (${previous.remediatedRate}%)`, curr: `${current.remediated} (${current.remediatedRate}%)`, change: changes.remediatedRate, isPercent: true },
  ];

  return (
    <WidgetCard title="Summary Metrics">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--card-border)]">
              <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--muted)]">Metric</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--muted)]">Previous</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--muted)]">Current</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--muted)]">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--card-border)]">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-[var(--muted-bg)]/50">
                <td className="px-3 py-2.5 text-[var(--foreground)]">{row.label}</td>
                <td className="px-3 py-2.5 text-right text-[var(--foreground)]">{row.prev}</td>
                <td className="px-3 py-2.5 text-right text-[var(--foreground)]">{row.curr}</td>
                <td className="px-3 py-2.5 text-right"><ChangeIndicator value={row.change} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetCard>
  );
}

function MonthlyTrendChart({ monthly }) {
  const allMonths = useMemo(() => {
    const months = new Set();
    monthly.previous.forEach(m => months.add(m.month));
    monthly.current.forEach(m => months.add(m.month));
    return Array.from(months).sort();
  }, [monthly]);

  const data = allMonths.map(month => {
    const prev = monthly.previous.find(m => m.month === month);
    const curr = monthly.current.find(m => m.month === month);
    return {
      month,
      prevDLP: prev?.dlp || 0,
      prevPhishing: prev?.phishing || 0,
      prevMalware: prev?.malware || 0,
      prevTotal: prev?.total || 0,
      currDLP: curr?.dlp || 0,
      currPhishing: curr?.phishing || 0,
      currMalware: curr?.malware || 0,
      currTotal: curr?.total || 0,
    };
  });

  return (
    <WidgetCard title="Monthly Event Trend">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="prevTotal" name="Prev Total" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="currTotal" name="Curr Total" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="prevDLP" name="Prev DLP" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="currDLP" name="Curr DLP" stroke="#10b981" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </WidgetCard>
  );
}

function EventTypeBreakdown({ metrics }) {
  const data = [
    { name: 'DLP', prev: metrics.previous.dlp, curr: metrics.current.dlp },
    { name: 'Phishing', prev: metrics.previous.phishing, curr: metrics.current.phishing },
    { name: 'Malware', prev: metrics.previous.malware, curr: metrics.current.malware },
  ];

  const totalCurr = metrics.current.total;

  return (
    <WidgetCard title="Event Type Breakdown (Current)">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
            dataKey="curr"
            nameKey="name"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => [`${v} (${Math.round((v / totalCurr) * 100)}%)`, '']}
            contentStyle={TOOLTIP_STYLE}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </WidgetCard>
  );
}

function SeverityDistribution({ severityDistribution }) {
  const data = severityDistribution.current.map((item, i) => ({
    ...item,
    color: SEV_COLORS[i]
  }));

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <WidgetCard title="Severity Distribution (Current)">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
            dataKey="count"
            nameKey="severity"
          >
            {data.map((item, i) => (
              <Cell key={i} fill={item.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => [`${v} (${Math.round((v / total) * 100)}%)`, '']}
            contentStyle={TOOLTIP_STYLE}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </WidgetCard>
  );
}

function TopPhishingSenders({ topPhishingSenders }) {
  const data = topPhishingSenders.current.slice(0, 10).map((item, i) => ({
    ...item,
    rank: i + 1
  }));

  if (data.length === 0) {
    return (
      <WidgetCard title="Top Malicious Phishing Senders">
        <div className="flex items-center justify-center h-32 text-sm text-[var(--muted)]">No data available</div>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard title="Top Malicious Phishing Senders">
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="sender"
            tick={{ fontSize: 9, fill: 'var(--foreground)' }}
            tickLine={false}
            axisLine={false}
            width={150}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" name="Events" fill="#ef4444" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </WidgetCard>
  );
}

function Recommendations({ metrics, topPhishingSenders }) {
  const topSender = topPhishingSenders.current[0]?.sender || 'N/A';
  const topSenderCount = topPhishingSenders.current[0]?.count || 0;

  const recommendations = [
    `Investigate and lock down ${topSender} — high-volume malicious phishing source (${topSenderCount} events)`,
    'Scale remediation capacity to match event growth; the open-event backlog is widening',
    'Apply targeted DLP coaching / auto-redaction policy for top financial-data mailboxes',
    'Maintain current malware/attachment scanning posture — it is working',
    'Review phishing spikes to harden against repeat seasonal campaigns',
  ];

  return (
    <WidgetCard title="Recommendations">
      <ul className="space-y-2">
        {recommendations.map((rec, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[var(--foreground)]">
            <span className="text-amber-500 mt-0.5">•</span>
            <span>{rec}</span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

function ExecutiveSummary({ metrics, periods }) {
  const { previous, current, changes } = metrics;
  const totalChange = parseFloat(changes.total);
  const phishingChange = parseFloat(changes.phishing);
  const remediationChange = parseFloat(changes.remediatedRate);

  return (
    <WidgetCard title="Executive Summary">
      <div className="space-y-3 text-sm text-[var(--foreground)]">
        <p>
          Total security events rose from <strong>{previous.total.toLocaleString()}</strong> in the previous period to{' '}
          <strong>{current.total.toLocaleString()}</strong> in the current period, a{' '}
          <span className={totalChange > 0 ? 'text-red-500 font-semibold' : 'text-green-500 font-semibold'}>
            {totalChange > 0 ? '+' : ''}{totalChange}%
          </span>{' '}
          increase.
        </p>
        <p>
          Phishing volume grew the fastest (
          <span className={phishingChange > 0 ? 'text-red-500 font-semibold' : 'text-green-500 font-semibold'}>
            {phishingChange > 0 ? '+' : ''}{phishingChange}%
          </span>
          ), driven largely by repeated campaigns. DLP detections also grew, while malware detections declined,
          suggesting improved email gateway filtering.
        </p>
        <p>
          Remediation rate held roughly flat at ~{current.remediatedRate}% across both periods, indicating that
          response capacity has not scaled with event volume.
        </p>
        <div className="pt-2 border-t border-[var(--card-border)]">
          <p className="text-xs text-[var(--muted)]">
            <strong>Period:</strong> {periods.previous.start} – {periods.previous.end} (Previous){' '}
            <span className="mx-2">|</span>
            {periods.current.start} – {periods.current.end} (Current)
          </p>
        </div>
      </div>
    </WidgetCard>
  );
}

// Mock data for demo purposes when database is empty
const MOCK_DATA = {
  periods: {
    previous: { start: '2025-09-26', end: '2026-01-31' },
    current: { start: '2026-02-01', end: '2026-06-10' }
  },
  metrics: {
    previous: { total: 1513, dlp: 1271, phishing: 209, malware: 33, highSeverity: 131, remediated: 241, remediatedRate: 16 },
    current: { total: 2154, dlp: 1653, phishing: 487, malware: 14, highSeverity: 353, remediated: 353, remediatedRate: 16 },
    changes: { total: '42.4', dlp: '30.1', phishing: '133.0', malware: '-57.6', highSeverity: '241.2', remediatedRate: '0.5' }
  },
  monthly: {
    previous: [
      { month: '2025-09', dlp: 19, phishing: 29, malware: 23, total: 71 },
      { month: '2025-10', dlp: 215, phishing: 65, malware: 10, total: 290 },
      { month: '2025-11', dlp: 397, phishing: 52, malware: 0, total: 449 },
      { month: '2025-12', dlp: 341, phishing: 33, malware: 0, total: 374 },
      { month: '2026-01', dlp: 299, phishing: 30, malware: 0, total: 329 },
    ],
    current: [
      { month: '2026-02', dlp: 312, phishing: 20, malware: 2, total: 334 },
      { month: '2026-03', dlp: 487, phishing: 284, malware: 8, total: 779 },
      { month: '2026-04', dlp: 435, phishing: 93, malware: 3, total: 531 },
      { month: '2026-05', dlp: 331, phishing: 88, malware: 1, total: 420 },
      { month: '2026-06', dlp: 88, phishing: 2, malware: 0, total: 90 },
    ]
  },
  topPhishingSenders: {
    previous: [],
    current: [
      { sender: 'network.tjsb@techsecdigital.com', count: 150 },
      { sender: 'infgfgfg9964fgtttggg@teamkurofune.com', count: 16 },
      { sender: 'sdsdsdsdsdsdsdsdsdsdsdsdsdsdsd@capturesoul.com', count: 12 },
      { sender: 'infsd99336dkkhs7822sdeeee@rizhaokq.com', count: 11 },
      { sender: 'systemgenerated@mailer.zohochat.in', count: 11 },
      { sender: 'inrefghd66@yuanzhevip.com', count: 11 },
    ]
  },
  severityDistribution: {
    previous: [
      { severity: 'Sev 1', count: 200 },
      { severity: 'Sev 2', count: 450 },
      { severity: 'Sev 3', count: 732 },
      { severity: 'Sev 4', count: 100 },
      { severity: 'Sev 5', count: 31 },
    ],
    current: [
      { severity: 'Sev 1', count: 280 },
      { severity: 'Sev 2', count: 620 },
      { severity: 'Sev 3', count: 807 },
      { severity: 'Sev 4', count: 380 },
      { severity: 'Sev 5', count: 67 },
    ]
  }
};

export default function SecurityComparisonReport() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(MOCK_DATA); // Default to mock data
  const [useMockData, setUseMockData] = useState(true);
  const [dataSource, setDataSource] = useState('demo');

  useEffect(() => {
    api.get('/reports/comparison')
      .then(r => {
        // Check if we got valid data with events
        const hasData = r.data?.metrics?.current?.total > 0;
        if (hasData) {
          setData(r.data);
          setUseMockData(false);
          setDataSource('database');
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading comparison data:', err);
        // Keep using mock data on error
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-500">Error loading comparison data: {error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--foreground)]">Security Posture Report — Checkpoint Email & Collaboration</h2>
          <span className={`text-xs px-2 py-1 rounded-full ${useMockData ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>
            {dataSource === 'demo' ? 'Demo Data' : 'Live Data'}
          </span>
        </div>
        <p className="text-sm text-[var(--muted)] mt-1">
          Prepared for: TechSec Digital Global Pvt Ltd | Generated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Executive Summary + Metrics Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExecutiveSummary metrics={data.metrics} periods={data.periods} />
        <SummaryMetricsTable metrics={data.metrics} />
      </div>

      {/* Monthly Trend */}
      <MonthlyTrendChart monthly={data.monthly} />

      {/* Event Type + Severity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EventTypeBreakdown metrics={data.metrics} />
        <SeverityDistribution severityDistribution={data.severityDistribution} />
      </div>

      {/* Top Phishing Senders */}
      <TopPhishingSenders topPhishingSenders={data.topPhishingSenders} />

      {/* Recommendations */}
      <Recommendations metrics={data.metrics} topPhishingSenders={data.topPhishingSenders} />
    </div>
  );
}