import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const TARGET_COLOR = '#60a5fa';
const CURRENT_COLOR = '#0f2f55';
const RADAR_DATA = {
  target: 'Target Score',
  current: 'Current Score',
};

function RadarTooltip({ active, payload, label, currentLabel, previousLabel }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px 10px', fontSize: 11 }}>
      <p style={{ color: '#f8fafc', fontWeight: 700, margin: '0 0 5px' }}>{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} style={{ color: '#cbd5e1', margin: '2px 0' }}>
          <span style={{ color: item.color, marginRight: 5 }}>●</span>
          {item.dataKey === RADAR_DATA.target ? `Target Score (${previousLabel})` : `Current Score (${currentLabel})`}: <b>{item.value}%</b>
        </p>
      ))}
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

export default function FrameworkScore({ threats = [], agents = [], cves = [] }) {
  const navigate = useNavigate();

  // Current and previous calendar months, based on "today"
  const now = new Date();
  const cur = { y: now.getFullYear(), m: now.getMonth() };            // e.g. 2026-08 (0-indexed)
  const prev = { y: cur.m === 0 ? cur.y - 1 : cur.y, m: cur.m === 0 ? 11 : cur.m - 1 };

  const scores = useMemo(() => {
    const monthScore = (cy, cm, py, pm) => {
      // ---- Identify: asset inventory coverage (active agents / total agents) ----
      const totalAgents = agents.length;
      const knownMkt = totalAgents > 0 ? totalAgents : 1;
      const agentsActiveCur = agents.filter((a) => inMonth(a.lastActiveDate, cy, cm)).length;
      const agentsActivePrev = agents.filter((a) => inMonth(a.lastActiveDate, py, pm)).length;
      const identifyCur = clamp((agentsActiveCur / knownMkt) * 100);
      const identifyPrev = clamp((agentsActivePrev / knownMkt) * 100);

      // ---- Detect: threats detected this month (normalized against total) ----
      const totalThreats = threats.length || 1;
      const detectedCur = threats.filter((t) => inMonth(t.threatInfo?.createdAt, cy, cm)).length;
      const detectedPrev = threats.filter((t) => inMonth(t.threatInfo?.createdAt, py, pm)).length;
      // Detection "score" = share of this month's threats relative to all-time peak activity
      const detectCur = clamp((detectedCur / totalThreats) * 100);
      const detectPrev = clamp((detectedPrev / totalThreats) * 100);

      // ---- Respond / Protect: mitigation effectiveness (mitigated vs total) ----
      const MITIGATED = ['mitigated', 'blocked', 'resolved', 'remediated', 'remediated by admin', 'blocked_mitigation'];
      const isMitigated = (t) => {
        const s = (t.threatInfo?.mitigationStatus || '').toLowerCase();
        return MITIGATED.some((k) => s.includes(k));
      };
      const baseCu = threats.filter((t) => inMonth(t.threatInfo?.createdAt, cy, cm));
      const basePr = threats.filter((t) => inMonth(t.threatInfo?.createdAt, py, pm));
      const cuMit = baseCu.filter(isMitigated).length;
      const prMit = basePr.filter(isMitigated).length;
      const protectCur = clamp(baseCu.length > 0 ? (cuMit / baseCu.length) * 100 : 100);
      const protectPrev = clamp(basePr.length > 0 ? (prMit / basePr.length) * 100 : 100);

      // ---- Detect/Protect tie-ins (respond = mitigation ratio, recover = CVE remediation) ----
      const respondCur = protectCur;
      const respondPrev = protectPrev;

      // ---- Recover: CVE triage/remediation completion this month ----
      const totalCves = cves.length || 1;
      const cveCur = cves.filter((c) => inMonth(c.detectionDate, cy, cm)).length;
      const cvePrev = cves.filter((c) => inMonth(c.detectionDate, py, pm)).length;
      const recoverCur = clamp(100 - (cveCur / totalCves) * 50); // fewer new CVEs → higher score
      const recoverPrev = clamp(100 - (cvePrev / totalCves) * 50);

      return {
        cur: [identifyCur, protectCur, detectCur, respondCur, recoverCur],
        prev: [identifyPrev, protectPrev, detectPrev, respondPrev, recoverPrev],
      };
    };

    const s = monthScore(cur.y, cur.m, prev.y, prev.m);
    const LABELS = ['Identify', 'Protect', 'Detect', 'Respond', 'Recover'];
    return LABELS.map((name, i) => ({
      name,
      current: s.cur[i],
      previous: s.prev[i],
    }));
  }, [threats, agents, cves, cur.y, cur.m, prev.y, prev.m]);

  const monthLabel = (d) => d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });

  const currentLabel = monthLabel(new Date(cur.y, cur.m));
  const previousLabel = monthLabel(new Date(prev.y, prev.m));
  const radarData = scores.map((item) => ({
    name: item.name,
    [RADAR_DATA.target]: item.previous,
    [RADAR_DATA.current]: item.current,
  }));
  const avgCurrent = scores.reduce((sum, item) => sum + item.current, 0) / scores.length;
  const avgPrevious = scores.reduce((sum, item) => sum + item.previous, 0) / scores.length;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', padding: '18px 16px',
      backgroundColor: '#0f172a', borderRadius: '8px', width: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <svg style={{ width: '15px', height: '15px', color: '#38bdf8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: '#38bdf8', textTransform: 'uppercase' }}>
          Framework Score
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 600, color: '#94a3b8', background: '#1e293b', borderRadius: '6px', padding: '2px 8px' }}>
          NIST CSF
        </span>
      </div>

      <div style={{ width: '100%', height: 340, minHeight: 340, flex: '0 0 340px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} cx="50%" cy="46%" outerRadius="72%" margin={{ top: 16, right: 28, bottom: 18, left: 28 }}>
            <PolarGrid stroke="#334155" strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 12, fontWeight: 600 }} tickLine={false} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} tickCount={6} axisLine={false} tickLine={false} />
            <Radar
              name={RADAR_DATA.target}
              dataKey={RADAR_DATA.target}
              stroke={TARGET_COLOR}
              fill={TARGET_COLOR}
              fillOpacity={0.34}
              strokeWidth={2}
              dot={{ r: 3, fill: TARGET_COLOR, stroke: '#e0f2fe', strokeWidth: 1 }}
            />
            <Radar
              name={RADAR_DATA.current}
              dataKey={RADAR_DATA.current}
              stroke={CURRENT_COLOR}
              fill={CURRENT_COLOR}
              fillOpacity={0.82}
              strokeWidth={2}
              dot={{ r: 3, fill: CURRENT_COLOR, stroke: '#dbeafe', strokeWidth: 1 }}
            />
            <Tooltip content={<RadarTooltip currentLabel={currentLabel} previousLabel={previousLabel} />} />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              wrapperStyle={{ color: '#cbd5e1', fontSize: 11, paddingTop: 4 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
        <span>Current: <b style={{ color: '#60a5fa' }}>{avgCurrent.toFixed(0)}%</b></span>
        <span>Target: <b style={{ color: '#bfdbfe' }}>{avgPrevious.toFixed(0)}%</b></span>
        <button
          onClick={() => navigate('/analytics')}
          style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 10 }}
        >
          View report →
        </button>
      </div>
    </div>
  );
}
