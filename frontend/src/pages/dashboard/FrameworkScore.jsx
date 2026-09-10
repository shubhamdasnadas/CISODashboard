import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProviders } from '../../context/ProviderContext.jsx';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const PREVIOUS_COLOR = '#94a3b8';  // Lighter color for previous month
const CURRENT_COLOR = '#6366f1';   // Indigo for current month
const RADAR_DATA = {
  previous: 'Previous Month',
  current: 'Current Month',
};

// Tool name mapping based on provider selection
const TOOL_LABELS = {
  emailSecurity: 'Email Security',
  firewall: 'Firewall',
  edr: 'EDR',
  ticketing: 'Ticketing',
  deviceManagement: 'MDM',
};

const TOOL_SHORT_NAMES = {
  'Mimecast': 'Mimecast',
  'Harmony': 'Harmony',
  'Palo Alto': 'Palo Alto',
  'Fortinet': 'Fortinet',
  'SentinelOne': 'SentinelOne',
  'CrowdStrike': 'CrowdStrike',
  'Zoho Desk': 'Zoho',
  'Zoho': 'Zoho',
  'Hexnode': 'Hexnode',
};

function RadarTooltip({ active, payload, label, currentLabel, previousLabel, scores }) {
  if (!active || !payload?.length) return null;

  // Find the index of this tool in the data
  const toolIndex = scores?.findIndex((s) => s.name === label) ?? -1;
  const currentCount = toolIndex >= 0 ? scores[toolIndex].current : 0;
  const previousCount = toolIndex >= 0 ? scores[toolIndex].previous : 0;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-2 text-xs shadow-lg text-[var(--foreground)]">
      <p className="font-bold mb-1 text-[var(--foreground)]">{label}</p>
      {payload.map((item) => {
        const isPrevious = item.dataKey === RADAR_DATA.previous;
        const count = isPrevious ? previousCount : currentCount;
        return (
          <p key={item.dataKey} className="text-[var(--muted)] my-0.5">
            <span style={{ color: item.color, marginRight: 5 }}>●</span>
            {isPrevious ? `Previous Month (${previousLabel})` : `Current Month (${currentLabel})`}: <b className="text-[var(--foreground)]">{item.value}%</b>
          </p>
        );
      })}
    </div>
  );
}

// ── Framework Score: current vs previous month, across the 5 NIST CSF functions ──
// Derives a 0-100 score per function from the actual security data on the dashboard
// (threats, agents, CVEs), split by calendar month so the current month is compared
// against the previous month — mirroring the grouped-bar mockup the user provided.
//
// props (all optional arrays):
//   threats  — SentinelOne threats (threatInfo.createdAt, threatInfo.mitigationStatus)
//   agents   — SentinelOne agents (lastActiveDate)
//   cves     — application-vulnerability rows (detectionDate)

// Helper: true if a timestamp falls within calendar month `year`-`month` (1-12)
const inMonth = (ts, year, month) => {
  if (!ts) return false;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() === month;
};

const clamp = (v) => Math.min(100, Math.max(0, Math.round(v)));

export default function FrameworkScore({ threats = [], agents = [], cves = [], tickets = [], mdmDevices = [] }) {
  const navigate = useNavigate();
  const { selectedProviders } = useProviders();

  // Get tool names from provider selection
  const toolNames = useMemo(() => {
    const emailTool = TOOL_SHORT_NAMES[selectedProviders.emailSecurity] || TOOL_LABELS.emailSecurity;
    const firewallTool = TOOL_SHORT_NAMES[selectedProviders.firewall] || TOOL_LABELS.firewall;
    const edrTool = TOOL_SHORT_NAMES[selectedProviders.edr] || TOOL_LABELS.edr;
    const ticketingTool = TOOL_SHORT_NAMES[selectedProviders.ticketing] || TOOL_LABELS.ticketing;
    const mdmTool = TOOL_SHORT_NAMES[selectedProviders.deviceManagement] || TOOL_LABELS.deviceManagement;
    return [emailTool, firewallTool, edrTool, ticketingTool, mdmTool];
  }, [selectedProviders]);

  // Current and previous calendar months, based on "today"
  const now = new Date();
  const cur = { y: now.getFullYear(), m: now.getMonth() };            // e.g. 2026-08 (0-indexed)
  const prev = { y: cur.m === 0 ? cur.y - 1 : cur.y, m: cur.m === 0 ? 11 : cur.m - 1 };

  const scores = useMemo(() => {
    const monthScore = (cy, cm, py, pm) => {
      // ---- Email Security: based on all threats (assuming all threats relate to email security) ----
      const emailTotal = threats.length || 1;
      const emailCur = threats.filter((t) => inMonth(t.threatInfo?.createdAt, cy, cm)).length;
      const emailPrev = threats.filter((t) => inMonth(t.threatInfo?.createdAt, py, pm)).length;
      // Score based on relative activity - higher count = higher score
      const maxEmail = Math.max(emailCur, emailPrev, 1);
      const emailSecurityCur = clamp((emailCur / maxEmail) * 100);
      const emailSecurityPrev = clamp((emailPrev / maxEmail) * 100);

      // ---- Firewall: based on all threats (firewall detects threats) ----
      const fwCur = threats.filter((t) => inMonth(t.threatInfo?.createdAt, cy, cm)).length;
      const fwPrev = threats.filter((t) => inMonth(t.threatInfo?.createdAt, py, pm)).length;
      const maxFw = Math.max(fwCur, fwPrev, 1);
      const firewallCur = clamp((fwCur / maxFw) * 100);
      const firewallPrev = clamp((fwPrev / maxFw) * 100);

      // ---- EDR: based on endpoint agent activity ----
      const totalAgents = agents.length || 1;
      const agentsActiveCur = agents.filter((a) => inMonth(a.lastActiveDate, cy, cm)).length;
      const agentsActivePrev = agents.filter((a) => inMonth(a.lastActiveDate, py, pm)).length;
      const edrCur = clamp(totalAgents > 0 ? (agentsActiveCur / totalAgents) * 100 : 0);
      const edrPrev = clamp(totalAgents > 0 ? (agentsActivePrev / totalAgents) * 100 : 0);

      // ---- Ticketing: based on ticket count (current vs previous month) ----
      const ticketTotal = tickets.length || 1;
      const ticketsCur = tickets.filter((t) => inMonth(t.created_at || t.createdTime || t.createdAt, cy, cm)).length;
      const ticketsPrev = tickets.filter((t) => inMonth(t.created_at || t.createdTime || t.createdAt, py, pm)).length;
      // Score based on relative activity - higher count = higher score
      const maxTickets = Math.max(ticketsCur, ticketsPrev, 1);
      const ticketingCur = clamp((ticketsCur / maxTickets) * 100);
      const ticketingPrev = clamp((ticketsPrev / maxTickets) * 100);

      // ---- MDM: based on device activity ----
      const mdmTotal = mdmDevices.length || 1;
      const mdmActiveCur = mdmDevices.filter((d) => inMonth(d.lastSeen || d.last_check_in, cy, cm)).length;
      const mdmActivePrev = mdmDevices.filter((d) => inMonth(d.lastSeen || d.last_check_in, py, pm)).length;
      const mdmCur = clamp(mdmTotal > 0 ? (mdmActiveCur / mdmTotal) * 100 : 0);
      const mdmPrev = clamp(mdmTotal > 0 ? (mdmActivePrev / mdmTotal) * 100 : 0);

      return {
        cur: [emailSecurityCur, firewallCur, edrCur, ticketingCur, mdmCur],
        prev: [emailSecurityPrev, firewallPrev, edrPrev, ticketingPrev, mdmPrev],
        curCounts: [emailCur, fwCur, agentsActiveCur, ticketsCur, mdmActiveCur],
        prevCounts: [emailPrev, fwPrev, agentsActivePrev, ticketsPrev, mdmActivePrev],
      };
    };

    const s = monthScore(cur.y, cur.m, prev.y, prev.m);
    return {
      scores: toolNames.map((name, i) => ({
        name,
        current: s.cur[i],
        previous: s.prev[i],
      })),
      currentCounts: s.curCounts,
      previousCounts: s.prevCounts,
    };
  }, [threats, agents, cves, tickets, mdmDevices, cur.y, cur.m, prev.y, prev.m, toolNames]);

  const monthLabel = (d) => d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });

  const currentLabel = monthLabel(new Date(cur.y, cur.m));
  const previousLabel = monthLabel(new Date(prev.y, prev.m));
  const radarData = scores.scores.map((item) => ({
    name: item.name,
    [RADAR_DATA.previous]: item.previous,
    [RADAR_DATA.current]: item.current,
  }));
  const avgCurrent = scores.scores.reduce((sum, item) => sum + item.current, 0) / scores.scores.length;
  const avgPrevious = scores.scores.reduce((sum, item) => sum + item.previous, 0) / scores.scores.length;

  return (
    <div className="flex flex-col h-full p-4 rounded-2xl bg-white dark:bg-[#0b1329] border border-[var(--card-border)] w-full">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-4 h-4 text-indigo-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="text-[11px] font-bold tracking-wider text-indigo-600 dark:text-sky-400 uppercase">
          Framework Score
        </span>
        <span className="ml-auto text-[10px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-md px-2 py-0.5 border border-slate-200 dark:border-slate-700/50">
          NIST CSF
        </span>
      </div>

      <div style={{ width: '100%', height: 340, minHeight: 340, flex: '0 0 340px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} cx="50%" cy="46%" outerRadius="72%" margin={{ top: 16, right: 28, bottom: 18, left: 28 }}>
            <PolarGrid stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="name" tick={{ fill: 'currentColor', fontSize: 11, fontWeight: 600 }} className="text-slate-700 dark:text-slate-300" tickLine={false} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} tickCount={6} axisLine={false} tickLine={false} />
            <Radar
              name={RADAR_DATA.previous}
              dataKey={RADAR_DATA.previous}
              stroke={PREVIOUS_COLOR}
              fill={PREVIOUS_COLOR}
              fillOpacity={0.25}
              strokeWidth={2}
              dot={{ r: 3, fill: PREVIOUS_COLOR, stroke: '#e2e8f0', strokeWidth: 1 }}
            />
            <Radar
              name={RADAR_DATA.current}
              dataKey={RADAR_DATA.current}
              stroke={CURRENT_COLOR}
              fill={CURRENT_COLOR}
              fillOpacity={0.65}
              strokeWidth={2}
              dot={{ r: 3, fill: CURRENT_COLOR, stroke: '#c7d2fe', strokeWidth: 1 }}
            />
            <Tooltip content={<RadarTooltip currentLabel={currentLabel} previousLabel={previousLabel} scores={scores.scores} />} />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
        <span>Current: <b className="text-indigo-600 dark:text-indigo-400">{avgCurrent.toFixed(0)}%</b></span>
        <span>Previous: <b className="text-slate-500 dark:text-slate-400">{avgPrevious.toFixed(0)}%</b></span>
        <button
          onClick={() => navigate('/analytics')}
          className="text-indigo-600 dark:text-sky-400 font-semibold hover:underline cursor-pointer"
        >
          View report →
        </button>
      </div>
    </div>
  );
}
