import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ExecutiveKpiStrip({
  s1Threats = [],
  s1Agents = [],
  cpEvents = [],
  appCves = [],
  tickets = [],
  mdmDevices = [],
}) {
  const navigate = useNavigate();

  // ── Metrics Calculation ────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    // 1. SentinelOne Threats
    const totalThreats = s1Threats.length;
    const mitigatedThreats = s1Threats.filter((t) => {
      const s = String(t.threatInfo?.mitigationStatus || '').toLowerCase();
      return s.includes('mitigated') || s.includes('resolved') || s.includes('fixed');
    }).length;
    const threatMitigationRate = totalThreats > 0 ? Math.round((mitigatedThreats / totalThreats) * 100) : 100;

    // 2. SentinelOne Agents
    const totalAgents = s1Agents.length;
    const activeAgents = s1Agents.filter((a) => a.isActive).length;
    const agentHealthRate = totalAgents > 0 ? Math.round((activeAgents / totalAgents) * 100) : 100;

    // 3. Email Protection (Checkpoint Harmony)
    const totalEmailEvents = cpEvents.length;
    const remediatedEmail = cpEvents.filter((e) => ['remediated', 'closed', 'done'].includes(String(e.state || '').toLowerCase())).length;
    const emailRemediationRate = totalEmailEvents > 0 ? Math.round((remediatedEmail / totalEmailEvents) * 100) : 100;
    const highSevEmail = cpEvents.filter((e) => ['high', 'critical'].includes(String(e.severity || '').toLowerCase())).length;

    // 4. Vulnerabilities / Application CVEs
    const totalCves = appCves.length;
    const critHighCves = appCves.filter((c) => {
      const sev = String(c.severity || '').toUpperCase();
      const score = parseFloat(c.baseScore || 0);
      return sev === 'CRITICAL' || sev === 'HIGH' || score >= 7.0;
    }).length;

    // 5. Service Desk / Zoho SLA
    const totalTickets = tickets.length;
    const resolvedTickets = tickets.filter((t) => {
      const st = String(t.status || t.statusType || '').toLowerCase();
      return st.includes('closed') || st.includes('resolved') || st.includes('completed');
    }).length;
    const ticketResolutionRate = totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 100;

    // 6. MDM Fleet Compliance
    const totalMdm = mdmDevices.length;
    const compliantMdm = mdmDevices.filter((d) => d.is_compliant || d.compliant || String(d.status || '').toLowerCase() === 'compliant').length;
    const mdmComplianceRate = totalMdm > 0 ? Math.round((compliantMdm / totalMdm) * 100) : 100;

    // Composite Cyber Health Score (0 - 100)
    const compositeScore = Math.round(
      (threatMitigationRate * 0.3) +
      (agentHealthRate * 0.2) +
      (emailRemediationRate * 0.2) +
      (mdmComplianceRate * 0.15) +
      (ticketResolutionRate * 0.15)
    );

    return {
      totalThreats,
      mitigatedThreats,
      threatMitigationRate,
      totalAgents,
      activeAgents,
      agentHealthRate,
      totalEmailEvents,
      remediatedEmail,
      emailRemediationRate,
      highSevEmail,
      totalCves,
      critHighCves,
      totalTickets,
      resolvedTickets,
      ticketResolutionRate,
      totalMdm,
      compliantMdm,
      mdmComplianceRate,
      compositeScore: Math.min(100, Math.max(0, compositeScore || 85)),
    };
  }, [s1Threats, s1Agents, cpEvents, appCves, tickets, mdmDevices]);

  const getScoreColor = (score) => {
    if (score >= 80) return { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', gradient: 'from-emerald-500 to-teal-600', ring: '#10b981' };
    if (score >= 60) return { text: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', gradient: 'from-amber-500 to-orange-600', ring: '#f59e0b' };
    return { text: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', gradient: 'from-red-500 to-rose-600', ring: '#ef4444' };
  };

  const scoreTheme = getScoreColor(metrics.compositeScore);

  const kpis = [
    {
      id: 'score',
      title: 'CISO Health Score',
      value: `${metrics.compositeScore}/100`,
      sub: metrics.compositeScore >= 80 ? 'Optimal Posture' : metrics.compositeScore >= 60 ? 'Moderate Risk' : 'High Exposure',
      progress: metrics.compositeScore,
      accent: 'emerald',
      gradient: 'from-emerald-500 to-teal-500',
      path: '/dashboard/detail',
      state: { dataset: 'threats', filterId: 'all', title: 'Executive Cyber Posture & Threat Telemetry' },
      icon: (
        <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      id: 'threats',
      title: 'Threat Mitigation',
      value: `${metrics.threatMitigationRate}%`,
      sub: `${metrics.mitigatedThreats} of ${metrics.totalThreats} mitigated`,
      progress: metrics.threatMitigationRate,
      accent: 'teal',
      gradient: 'from-teal-500 to-emerald-600',
      path: '/dashboard/detail',
      state: { dataset: 'threats', filterId: 'mitigated', value: 'mitigated', title: 'Mitigated Threat Incidents' },
      icon: (
        <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
    {
      id: 'endpoints',
      title: 'Fleet Protection',
      value: `${metrics.agentHealthRate}%`,
      sub: `${metrics.activeAgents} of ${metrics.totalAgents} active agents`,
      progress: metrics.agentHealthRate,
      accent: 'blue',
      gradient: 'from-blue-500 to-indigo-600',
      path: '/dashboard/detail',
      state: { dataset: 'agents', filterId: 'active', title: 'Active Protected Endpoint Fleet' },
      icon: (
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'email',
      title: 'Email Threat Defense',
      value: `${metrics.emailRemediationRate}%`,
      sub: `${metrics.remediatedEmail} of ${metrics.totalEmailEvents} remediated`,
      progress: metrics.emailRemediationRate,
      accent: 'indigo',
      gradient: 'from-indigo-500 to-violet-600',
      path: '/dashboard/detail',
      state: { dataset: 'checkpoint', filterId: 'checkpointState', value: 'remediated', title: 'Remediated & Neutralized Email Threats' },
      icon: (
        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'cve',
      title: 'Vulnerability Posture',
      value: `${metrics.totalCves}`,
      sub: `${metrics.critHighCves} Critical/High CVEs`,
      progress: metrics.totalCves > 0 ? Math.max(10, Math.min(100, Math.round(((metrics.totalCves - metrics.critHighCves) / metrics.totalCves) * 100))) : 100,
      accent: 'rose',
      gradient: 'from-rose-500 to-red-600',
      path: '/dashboard/detail',
      state: { dataset: 'cve', filterId: 'scoreRange', value: 'Crit (9-10)', title: 'Critical & High Vulnerabilities (CVEs)' },
      icon: (
        <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      id: 'sla',
      title: 'ITSM SLA Resolution',
      value: `${metrics.ticketResolutionRate}%`,
      sub: `${metrics.resolvedTickets} of ${metrics.totalTickets} resolved`,
      progress: metrics.ticketResolutionRate,
      accent: 'fuchsia',
      gradient: 'from-fuchsia-500 to-purple-600',
      path: '/dashboard/detail',
      state: { dataset: 'zoho', filterId: 'zohoClosed', value: 'Closed', title: 'Resolved Service Desk Tickets', rows: tickets },
      icon: (
        <svg className="w-5 h-5 text-fuchsia-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="mb-8">
      {/* Top Section Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-6 rounded-full bg-gradient-to-b from-indigo-500 to-purple-600 shadow-sm" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
            Executive Security Posture Strip
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              Live Telemetry
            </span>
          </h2>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            onClick={() => navigate(kpi.path, { state: kpi.state })}
            className="group relative cursor-pointer card-surface card-surface--hover rounded-2xl p-4 border border-[var(--card-border)] overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
          >
            {/* Ambient Background Accent */}
            <div
              className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${kpi.gradient} opacity-5 group-hover:opacity-15 rounded-full blur-xl transition-opacity pointer-events-none -mr-8 -mt-8`}
            />

            {/* Header Icon + Title */}
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider truncate max-w-[100px]">
                {kpi.title}
              </span>
              <div className="w-8 h-8 rounded-xl bg-[var(--muted-bg)] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                {kpi.icon}
              </div>
            </div>

            {/* Value & Subtext */}
            <div className="mb-3">
              <div className="text-xl sm:text-2xl font-black text-[var(--foreground)] tracking-tight">
                {kpi.value}
              </div>
              <p className="text-[11px] text-[var(--muted)] truncate mt-0.5 font-medium">
                {kpi.sub}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[var(--muted-bg)] rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${kpi.gradient} transition-all duration-700`}
                style={{ width: `${Math.min(100, Math.max(4, kpi.progress))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
