import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import {
  formatNumber, formatBytes, getSecurityScoreStatus, shortName,
  buildCveData, computeWeeklyStats, buildThreatAnalytics, buildAgentAnalytics,
  buildAtRisk, buildZohoSummary, buildFirewallSummary,
  buildZohoTicketCounts, buildZohoFunnel, buildZohoHeatmap, buildZohoVolcano,
  buildZohoTopPerformance, buildZohoCorpMembers, buildZohoMttr,
  ZOHO_STATUS_COLORS, ZOHO_PRIORITY_COLORS, SEV_COLORS, CVE_COLORS, COLORS, RISK_COLORS,
} from './dataUtils';
import { VDonut, VLineChart, VBarChart, VHBarList, VLegendRow, VGauge, ZohoCountCards, VHeatmap, VFunnel, VVolcano, VTopTable, VCorpMember, VMttrCard } from './pdfChartComponents';

// ── MTTR / compliance-health gauge (single card) ─────────────────────────────
// The live CyberHygen widgets (AllCommonmttr / S1Mttr / Emailsecuritymttr /
// Ticketingmttr) are DOM components (api.get + localStorage + <div>) that
// @react-pdf/renderer cannot render. So we render faithful PDF-native replicas
// from the real compliance-health data (d.mttr). Each gauge lives on its own
// page: overall → Section 1 (Exec Summary), email → Section 2 (Checkpoint),
// sentinelOne → Section 3 (Threats), ticketing → Section 4 (Zoho).
const clampPct = (n) => Math.min(Math.max(n || 0, 0), 100);

const MTTR_CARDS = {
  overall: { label: 'Overall MTTR', good: 'Avg Resolved', bad: 'Avg Open' },
  sentinelOne: { label: 'SentinelOne', good: 'Mitigated', bad: 'Unmitigated' },
  email: { label: 'Email Security', good: 'Remediated', bad: 'Unremediated' },
  ticketing: { label: 'Ticketing', good: 'Closed', bad: 'Open' },
};

function MttrGaugeCard({ cfgKey, mttr }) {
  const cfg = MTTR_CARDS[cfgKey];
  if (!cfg) return null;
  const m = mttr?.[cfgKey] || { pct: 0, goodCount: '', badCount: '' };
  return (
    <View style={S.block} wrap={false}>
      <Text style={S.cardTitle}>{cfg.label} — MTTR / Compliance Health</Text>
      <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10, backgroundColor: C.bg, alignItems: 'center' }}>
        <VGauge
          pct={clampPct(m.pct)}
          goodLabel={cfg.good}
          badLabel={cfg.bad}
          goodCount={m.goodCount}
          badCount={m.badCount}
        />
        {cfgKey === 'email' && m.total !== undefined && m.total !== '' ? (
          <Text style={{ fontSize: 7, color: C.faint, marginTop: 2 }}>Total Events: {m.total}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Theme tokens ──────────────────────────────────────────────────────────────
const C = {
  ink: '#111827', sub: '#4b5563', muted: '#6b7280', faint: '#9ca3af',
  line: '#e5e7eb', lighter: '#f3f4f6', bg: '#f9fafb',
  brand: '#4f46e5', brandDark: '#4338ca',
  green: '#16a34a', red: '#dc2626', amber: '#d97706', sky: '#0284c7', violet: '#7c3aed', slate: '#64748b',
};

const S = StyleSheet.create({
  page: { fontSize: 9, color: C.ink, backgroundColor: '#ffffff', paddingTop: 34, paddingBottom: 34, paddingLeft: 40, paddingRight: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  brandBar: { height: 4, backgroundColor: C.brand, marginBottom: 12, borderRadius: 2 },
  title: { fontSize: 18, fontWeight: 700, color: C.ink },
  subtitle: { fontSize: 10, color: C.muted, marginTop: 2 },
  sectionDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 4 },
  sectionNumber: { width: 26, height: 26, borderRadius: 6, backgroundColor: C.brand, color: '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center', paddingTop: 6, marginRight: 10 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: C.ink },
  sectionRule: { flex: 1, height: 2, backgroundColor: C.line, marginLeft: 14 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  kpiTile: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 8, backgroundColor: C.bg },
  kpiLabel: { fontSize: 7.5, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  kpiValue: { fontSize: 17, fontWeight: 800, color: C.ink },
  kpiSub: { fontSize: 7.5, color: C.faint, marginTop: 1 },
  block: { marginBottom: 12 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: '#fff', padding: 10 },
  cardTitle: { fontSize: 10.5, fontWeight: 700, color: C.ink, marginBottom: 8 },
  // Row holding two chart cards side-by-side (each child flexes to half width).
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  // Row holding four chart cards side-by-side (each child flexes to quarter width).
  row4: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, marginBottom: 12 },
  chartHalf: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: '#fff', padding: 10 },
  chartHalfTitle: { fontSize: 10.5, fontWeight: 700, color: C.ink, marginBottom: 8 },
  // Full-width, vertically centered column (used for the two weekly charts that
  // should stack one-below-the-other and sit centered on the page).
  colCenter: { alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  chartFrame: { alignItems: 'center', marginBottom: 4 },
  footer: { position: 'absolute', bottom: 14, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, fontSize: 7.5, color: C.faint },
  badge: { padding: '2px 6px', borderRadius: 3, fontSize: 7, fontWeight: 700, color: '#fff' },
  lead: { fontSize: 10, color: C.sub, lineHeight: 1.55, marginBottom: 10 },
  bullet: { flexDirection: 'row', marginBottom: 4 },
  bulletDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.brand, marginTop: 4, marginRight: 8 },
});

// ── Shared layout primitives ──────────────────────────────────────────────────
export function SectionDivider({ number, title, color = C.brand }) {
  return (
    <View style={S.sectionDivider} wrap={false}>
      <View style={[S.sectionNumber, { backgroundColor: color }]}><Text>{number}</Text></View>
      <Text style={S.sectionTitle}>{title}</Text>
      <View style={S.sectionRule} />
    </View>
  );
}

export function KpiTile({ label, value, sub, color = C.ink }) {
  return (
    <View style={S.kpiTile} wrap={false}>
      <Text style={S.kpiLabel}>{label}</Text>
      <Text style={[S.kpiValue, { color }]}>{value}</Text>
      {sub ? <Text style={S.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

const EMPTY_STYLE = { fontSize: 8.5, color: C.faint, fontStyle: 'italic' };
function EmptyNote({ text = 'No data available for this period.' }) {
  return <Text style={EMPTY_STYLE}>{text}</Text>;
}

// A donut chart with a percentage legend beside it. Falls back to an accurate
// "no data" note (never a phantom chart) when the dataset is empty.
function DonutBlock({ title, data, colors, width = 130, height = 130, desc, half }) {
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      {data && data.length > 0 ? (
        <View style={{ alignItems: 'center' }}>
          <VDonut data={data} width={width} height={height} colors={colors} />
          {/* Legend below the chart (per request): donut content, then legend. */}
          <View style={{ marginTop: 8, width: '100%' }}>
            <VLegendRow data={data} colors={colors} />
          </View>
        </View>
      ) : <EmptyNote />}
      {desc ? <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 4 }}>{desc}</Text> : null}
    </View>
  );
}

// Horizontal ranked bars. Used wherever the old template had a two-column table.
function HBarBlock({ title, data, color = C.brand, width = 320, maxItems = 10, desc, half }) {
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      {data && data.length > 0 ? (
        <VHBarList data={data} width={width} maxItems={maxItems} color={color} />
      ) : <EmptyNote />}
      {desc ? <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 4 }}>{desc}</Text> : null}
    </View>
  );
}

// Vertical bar chart block (used for aging / volume distributions).
function BarBlock({ title, data, color = C.brand, width = 320, height = 160, desc, half }) {
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      {data && data.length > 0 ? (
        <VBarChart data={data} width={width} height={height} color={color} />
      ) : <EmptyNote />}
      {desc ? <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 4 }}>{desc}</Text> : null}
    </View>
  );
}

// Line chart block (used for the Checkpoint cumulative-events-over-time trend).
function LineBlock({ title, data, color = C.brand, width = 320, height = 160, labelKey = 'date', valueKey = 'value', desc, half }) {
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      {data && data.length > 0 ? (
        <VLineChart data={data} width={width} height={height} stroke={color} labelKey={labelKey} valueKey={valueKey} />
      ) : <EmptyNote />}
      {desc ? <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 4 }}>{desc}</Text> : null}
    </View>
  );
}

export function BulletList({ items }) {
  return (
    <View style={S.block}>
      {items.map((it, i) => (
        <View key={i} style={S.bullet} wrap={false}>
          <View style={S.bulletDot} />
          <Text style={{ fontSize: 9, color: C.sub, lineHeight: 1.5 }}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

export function PageFooter({ orgName, generatedAt, sectionNumber }) {
  const date = new Date(generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <View style={S.footer} fixed>
      <Text>CISO Security Report · {orgName}</Text>
      {/* Right-hand label: logical section number, with a ".subPage" decimal
          when a section overflows across multiple physical pages
          (e.g. "Section 2.1", "Section 2.2"). Single-page sections show just
          "Section N". The cover page (no sectionNumber) shows date only. */}
      <Text render={({ subPageNumber, subPageTotalPages }) => {
        const sec = (sectionNumber !== undefined && sectionNumber !== null)
          ? ` · Section ${sectionNumber}${subPageTotalPages > 1 ? `.${subPageNumber}` : ''}`
          : '';
        return `${date}${sec}`;
      }} />
    </View>
  );
}

// Build a colour array for datasets that don't already carry a `fill`.
const palette = (data) => (data || []).map((_, i) => COLORS[i % COLORS.length]);

// ── Cover ─────────────────────────────────────────────────────────────────────
export function CoverPage({ orgName, generatedAt }) {
  const date = new Date(generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const index = [
    ['1', 'Executive Summary'],
    ['2', 'Checkpoint Harmony — Email & Cloud Security'],
    ['3.1', 'SentinelOne — Threat Analytics'],
    ['3.2', 'SentinelOne — Agent Analytics'],
    ['3.3', 'SentinelOne — Most At-Risk Entities'],
    ['3.4', 'SentinelOne — Application CVEs'],
    ['3.5', 'SentinelOne — Application Insights'],
    ['4', 'Zoho Desk — Support Tickets'],
    ['5', 'Palo Alto Firewall — Network Security'],
    ['6', 'Weekly Insights — 7-Day Comparison'],
  ];
  return (
    <View style={{ backgroundColor: '#1e1b4b', padding: 40, flex: 1, justifyContent: 'space-between' }}>
      <View style={{ height: 4, backgroundColor: C.brand, width: 48 }} />
      <View>
        <Text style={{ fontSize: 12, color: '#a5b4fc', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>CISO Dashboard</Text>
        <Text style={{ fontSize: 30, fontWeight: 800, color: '#ffffff' }}>Security Report</Text>
        <Text style={{ fontSize: 14, color: '#c7d2fe', marginTop: 6 }}>{orgName}</Text>
        <Text style={{ fontSize: 11, color: '#818cf8', marginTop: 14 }}>{date}</Text>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 12px', marginTop: 14, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 9, color: '#c7d2fe' }}>Confidential — For Management Use</Text>
        </View>
      </View>
      <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 20 }}>
        <Text style={{ fontSize: 10, color: '#818cf8', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Report Index</Text>
        {index.map(([num, title]) => (
          <View key={num} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{num}</Text>
            </View>
            <Text style={{ color: '#e0e7ff', fontSize: 10 }}>{title}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Executive Summary ─────────────────────────────────────────────────────────
export function ExecutiveSummary({ d, weekly }) {
  const risk = buildFirewallSummary(d);
  const scoreStatus = getSecurityScoreStatus(risk.securityScore);
  const threats = Array.isArray(d.s1Threats) ? d.s1Threats : [];
  const tickets = Array.isArray(d.zohoTickets) ? d.zohoTickets : [];
  const cve = buildCveData(Array.isArray(d.s1Cves) ? d.s1Cves : []);
  const events = Array.isArray(d.harmonyEvents) ? d.harmonyEvents : [];
  const mitigated = threats.filter(t => t.threatInfo?.mitigationStatus === 'mitigated').length;
  const unresolved = threats.filter(t => ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus)).length;

  const findings = [];
  if (threats.length > 0) findings.push(`${threats.length} threats detected across the endpoint fleet; ${mitigated} mitigated, ${unresolved} unresolved.`);
  if (cve.totalCves > 0) findings.push(`${cve.totalCves} known CVEs across ${cve.totalApplications} applications; ${cve.severityMap.CRITICAL} rated CRITICAL.`);
  if (events.length > 0) findings.push(`${events.length} email/cloud security events logged; ${events.filter(e => e.state === 'pending').length} pending review.`);
  if (tickets.length > 0) {
    const open = tickets.filter(t => t.status === 'Open').length;
    findings.push(`${tickets.length} support tickets recorded; ${open} currently open.`);
  }
  if (tickets.length === 0 && threats.length === 0 && events.length === 0 && cve.totalCves === 0) {
    findings.push('No active security events recorded for the reporting period.');
  }

  return (
    <View>
      <SectionDivider number="1" title="Executive Summary" />
      <Text style={S.lead}>
        Strategic overview of the organisation's security posture for the reporting period. This summary consolidates
        signals from endpoint protection, email/cloud security, vulnerability management, helpdesk operations, and the
        perimeter firewall.
      </Text>

      <View style={S.kpiRow} wrap={false}>
        {/* <KpiTile label="Security Score" value={`${risk.securityScore}/100`} sub={scoreStatus.label} color={scoreStatus.color} /> */}
        <KpiTile label="Threats Detected" value={formatNumber(threats.length)} color={C.red} />
        <KpiTile label="Mitigated" value={formatNumber(mitigated)} color={C.green} />
        <KpiTile label="Known CVEs" value={formatNumber(cve.totalCves)} color={C.amber} />
        <KpiTile label="Open Tickets" value={formatNumber(tickets.filter(t => t.status === 'Open').length)} color={C.sky} />
        <KpiTile label="Email Events" value={formatNumber(events.length)} color={C.violet} />
      </View>

      <MttrGaugeCard cfgKey="overall" mttr={d.mttr} />

      <View style={S.block}>
        <Text style={S.cardTitle}>Key Findings</Text>
        <BulletList items={findings} />
      </View>

      <View style={S.block}>
        <Text style={S.cardTitle}>Recommended Focus</Text>
        <BulletList items={[
          `Remediate the ${cve.severityMap.CRITICAL} critical-rated application vulnerabilities without delay.`,
          `Investigate the ${unresolved} unresolved threats and complete pending mitigation actions.`,
          tickets.filter(t => t.status === 'Open').length > 0 ? `Clear the currently open helpdesk backlog (${tickets.filter(t => t.status === 'Open').length} tickets).` : 'Maintain the current ticket state — no open backlog at period end.',
          `Review firewall high-risk events and suspicious sources to confirm nothing was missed.`,
        ]} />
      </View>
    </View>
  );
}

// ── Checkpoint Harmony ────────────────────────────────────────────────────────
// Defensive field accessors: the same harmony payload is sometimes camelCase
// (live dashboard) and sometimes snake_case (report data layer), so normalise.
const evtSender = (e) => (e.senderAddress ?? e.sender_address ?? '').toLowerCase();
const evtDesc = (e) => (e.description ?? e.event_description ?? '');
const evtCreated = (e) => (e.eventCreated ?? e.event_created ?? '');
const evtSeverity = (e) => (e.severity ?? e.severity ?? '');
const evtConfidence = (e) => (e.confidenceIndicator ?? e.confidence_indicator ?? 'unknown');

// Checkpoint color scales mirrored from CheckpointDashboard.jsx.
const STATE_COLORS = { new: '#ef4444', pending: '#f97316', detected: '#f59e0b', remediated: '#22c55e', closed: '#3b82f6', done: '#10b981' };
const CONF_COLORS = { malicious: '#ef4444', suspicious: '#f97316', detected: '#f59e0b', unknown: '#94a3b8' };
// Qualitative severity scale (0–4) used by the dashboard's SeverityDonut.
const SEV_LABELS = { 0: 'Informational', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' };
const DAY_MS = 86_400_000;

// Mirrors security/Threats.jsx formatDuration — renders a minute count as a
// human duration ("<1m", "45m", "2h 15m", "3d 4h") for the Avg MTTM KPI.
function formatDuration(minutes) {
  if (minutes == null) return 'N/A';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(minutes / 1440);
  const h = Math.round((minutes % 1440) / 60);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export function CheckpointSection({ events, weekly, mttr }) {
  const list = Array.isArray(events) ? events : [];
  const states = {};
  list.forEach(e => { const s = e.state || 'unknown'; states[s] = (states[s] || 0) + 1; });
  const stateRows = Object.entries(states).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const pending = list.filter(e => e.state === 'pending').length;
  const resolved = list.filter(e => ['remediated', 'done', 'closed'].includes(e.state)).length;

  // ── Sender analytics (mirrors TopSenderDomains / TopSenders widgets) ──
  const domainCounts = {};
  const senderCounts = {};
  list.forEach(e => {
    const s = evtSender(e);
    if (!s) return;
    const parts = s.split('@');
    if (parts.length >= 2) {
      const domain = parts[parts.length - 1];
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }
    senderCounts[s] = (senderCounts[s] || 0) + 1;
  });
  const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
  const topSenders = Object.entries(senderCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));

  // ── Most targeted mailboxes (mirrors TopTargetedMailboxes widget) ──
  const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const targetCounts = {};
  list.forEach(e => {
    const matches = evtDesc(e).match(EMAIL_RE);
    if (!matches) return;
    const sender = evtSender(e);
    matches.forEach(m => { const lm = m.toLowerCase(); if (lm !== sender) targetCounts[lm] = (targetCounts[lm] || 0) + 1; });
  });
  const topTargets = Object.entries(targetCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));

  // ── Cumulative events over time (mirrors CumulativeTimeline widget) ──
  const dayCounts = {};
  list.forEach(e => {
    const ts = evtCreated(e);
    if (!ts) return;
    const d = new Date(ts).toISOString().slice(0, 10);
    dayCounts[d] = (dayCounts[d] || 0) + 1;
  });
  let cumulative = 0;
  const cumulativeSeries = Object.entries(dayCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => { cumulative += value; return { date, value: cumulative }; });

  // ── KPI row (mirrors WeekOverWeek / AvgSeverity / CriticalEvents widgets) ──
  const nowMs = Date.now();
  const curWeek = list.filter(e => { const d = evtCreated(e); return d && nowMs - new Date(d).getTime() < 7 * DAY_MS; }).length;
  const prevWeek = list.filter(e => { const d = evtCreated(e); if (!d) return false; const age = nowMs - new Date(d).getTime(); return age >= 7 * DAY_MS && age < 14 * DAY_MS; }).length;
  const weekPct = prevWeek === 0 ? null : Math.round(((curWeek - prevWeek) / prevWeek) * 100);
  const avgSevValid = list.filter(e => { const s = evtSeverity(e); return s !== '' && !isNaN(Number(s)); });
  const avgSev = avgSevValid.length === 0 ? null : (avgSevValid.reduce((s, e) => s + Number(evtSeverity(e)), 0) / avgSevValid.length).toFixed(1);
  const criticalCount = list.filter(e => Number(evtSeverity(e)) >= 4).length;

  // ── Donut datasets (mirrors SeverityDonut / StateDonut / ConfidenceDonut) ──
  const sevDist = {};
  list.forEach(e => { const s = evtSeverity(e) ?? '?'; sevDist[s] = (sevDist[s] || 0) + 1; });
  const sevDistRows = Object.entries(sevDist)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([sev, value]) => ({ name: SEV_LABELS[sev] ?? `Sev ${sev}`, value }));
  const confDist = {};
  list.forEach(e => { const c = String(evtConfidence(e)).toLowerCase(); confDist[c] = (confDist[c] || 0) + 1; });
  const confRows = Object.entries(confDist).map(([name, value]) => ({ name, value }));

  return (
    <View>
      <SectionDivider number="2" title="Checkpoint Harmony — Email & Cloud Security" />
      <Text style={S.lead}>
        {list.length} email and cloud security events recorded. {pending} pending review, {resolved} resolved.
      </Text>
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Events This Week" value={formatNumber(curWeek)} sub={weekPct === null ? 'no prior-week data' : `vs ${prevWeek} last wk`} color={weekPct !== null && weekPct > 0 ? C.red : C.green} />
        <KpiTile label="Avg Severity" value={avgSev ?? '—'} sub="out of 5" color={C.amber} />
        <KpiTile label="Critical Events" value={formatNumber(criticalCount)} sub="severity ≥ 4" color={C.red} />
        <KpiTile label="Total Events" value={formatNumber(list.length)} color={C.brand} />
        <KpiTile label="Pending" value={formatNumber(pending)} color={C.amber} />
        <KpiTile label="Resolved" value={formatNumber(resolved)} color={C.green} />
      </View>
      <View style={S.row2}>
        <MttrGaugeCard cfgKey="email" mttr={mttr} />
        <DonutBlock title="Severity Distribution" data={sevDistRows} colors={sevDistRows.map((_, i) => SEV_COLORS[i % SEV_COLORS.length])} half />
        <DonutBlock title="Event State Breakdown" data={stateRows} colors={palette(stateRows)} half />
        <DonutBlock title="Confidence Indicator" data={confRows} colors={confRows.map((d) => CONF_COLORS[d.name] ?? '#6366f1')} half />
      </View>

      {weekly && (
        <View style={S.row2}>
          <HBarBlock
            title="Top Senders — Week-over-Week"
            data={weekly.topSenders.slice(0, 10).map(r => ({ name: String(r.sender_address || 'Unknown').slice(0, 28), value: r['This Week'] || 0 }))}
            color={C.brand}
            half
          />
          <BarBlock
            title="Event Volume — This Week vs Last Week"
            data={weekly.remComp.map(r => ({ name: r.day, value: r['This Week'] || 0 }))}
            color={C.brand}
            half
          />
        </View>
      )}

      {/* Sender analysis — top sender domains + top individual senders */}
      <View style={S.row2}>
        <HBarBlock title="Top Sender Domains" data={topDomains} color="#6366f1" half desc="By source email domain" />
        <HBarBlock title="Top Individual Senders" data={topSenders} color="#f97316" half desc="By full sender address" />
      </View>

      {/* Target + cumulative timeline */}
      <View style={S.row2}>
        <HBarBlock title="Most Targeted Mailboxes" data={topTargets} color="#8b5cf6" half desc="Recipients most frequently targeted" />
        {/* <LineBlock title="Cumulative Events Over Time" data={cumulativeSeries} color="#6366f1" half labelKey="date" valueKey="value" /> */}
      </View>
    </View >
  );
}

// ── SentinelOne Threat Analytics ──────────────────────────────────────────────
export function ThreatAnalytics({ threats, mttr }) {
  const t = buildThreatAnalytics(threats);
  return (
    <View>
      <SectionDivider number="3.1" title="SentinelOne — Threat Analytics" color="#dc2626" />
      <Text style={S.lead}>
        {t.total} threats detected. {t.mitigated} mitigated ({t.mitPct}%), {t.unresolved} unresolved.
        {t.avgMttd !== null ? ` Avg time to detect: ${Math.round(t.avgMttd)} min.` : ''}
      </Text>
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Total Threats" value={formatNumber(t.total)} color={C.red} />
        <KpiTile label="Mitigated" value={formatNumber(t.mitigated)} color={C.green} />
        <KpiTile label="Unresolved" value={formatNumber(t.unresolved)} color={C.amber} />
        <KpiTile label="Endpoints Affected" value={formatNumber(t.affectedEndpoints)} color={C.sky} />
        <KpiTile label="Avg MTTD" value={t.avgMttd !== null ? `${Math.round(t.avgMttd)}m` : 'N/A'} color={C.violet} />
        <KpiTile label="Avg MTTM" value={t.avgMttm !== null ? formatDuration(t.avgMttm) : 'N/A'} sub="time to mitigate" color="#06b6d4" />
      </View>
      {/* Four threat cards side-by-side (quarter width each) on the wide landscape page. */}
      <View style={S.row4}>
        <HBarBlock title="Classification" data={t.classData} color={C.violet} width={220} half />
        <HBarBlock title="Detection Engines" data={t.engineData.slice(0, 8)} color={C.sky} width={220} half />
        <HBarBlock title="MITRE ATTACK Tactics" data={t.tacticData.slice(0, 8)} color={C.slate} width={220} half />
      </View>
      <View style={S.row4}>
        <DonutBlock title="Mitigation Status" data={t.mitigationData} colors={palette(t.mitigationData)} half />
        <MttrGaugeCard cfgKey="sentinelOne" mttr={mttr} half />
      </View>

      {/* Top Users + Severity / Confidence distribution */}
      
      <View style={S.row2}>
        <HBarBlock title="Top Users by Threat Count" data={t.topUsersData} color="#f59e0b" half desc="Threats per process user" />
        <DonutBlock title="Severity / Confidence Distribution" data={t.confidenceData} colors={t.confidenceData.map(d => d.fill || C.slate)} half />
      </View>

      {/* Threats by Site + by Group */}
      <View style={S.row2}>
        <HBarBlock title="Threats by Site" data={t.siteData} color="#10b981" half desc="Threats per site" />
        <HBarBlock title="Threats by Group" data={t.groupData} color="#ec4899" half desc="Threats per group" />
      </View>

      {/* Classification + Fileless + Mitigation Outcomes */}
      <View style={S.row2}>
        <DonutBlock title="Classification" data={t.classData} colors={palette(t.classData)} half />
        <DonutBlock title="Fileless vs File-based" data={t.filelessData} colors={t.filelessData.map(d => d.fill || C.slate)} half />
        <DonutBlock title="Mitigation Outcomes" data={t.mitigationData} colors={palette(t.mitigationData)} half />
      </View>
    </View>
  );
}

// ── SentinelOne Agent Analytics ───────────────────────────────────────────────
export function AgentAnalytics({ agents, generatedAt, removed }) {
  const a = buildAgentAnalytics(agents, generatedAt);
  return (
    <View>
      <SectionDivider number="3.2" title="SentinelOne — Agent Analytics" color="#0ea5e9" />
      <Text style={S.lead}>
        {a.total} agents registered. {a.connected} connected ({Math.round(a.connected / Math.max(a.total, 1) * 100)}%), {a.disconnected} disconnected, {a.newAgents} new in 30 days.
      </Text>
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Total Agents" value={formatNumber(a.kpis.total)} color="#3b82f6" />
        <KpiTile label="Active" value={formatNumber(a.kpis.active)} color="#10b981" sub={`${a.kpis.health}% health`} />
        <KpiTile label="Inactive" value={formatNumber(a.kpis.inactive)} color="#ef4444" />
        <KpiTile label="Active Threats" value={formatNumber(a.kpis.threats)} color="#f59e0b" />
        <KpiTile label="Outdated" value={formatNumber(a.kpis.outdated)} color="#8b5cf6" />
        <KpiTile label="Health Score" value={`${a.kpis.health}%`} color="#06b6d4" sub="active/total" />
      </View>
      <View style={S.row2}>
        <DonutBlock title="Operating System Distribution" data={a.osDistribution} colors={a.osDistribution.map(d => d.fill)} half />
        <DonutBlock title="Active Status" data={a.activeStatusDistribution} colors={a.activeStatusDistribution.map(d => d.fill)} half />
        <DonutBlock title="Firewall Status" data={a.firewallStatusDistribution} colors={a.firewallStatusDistribution.map(d => d.fill)} half />
      </View>

      <View style={S.row4}>
        <DonutBlock title="Agent Version" data={a.agentVersionStatus} colors={a.agentVersionStatus.map(d => d.fill)} half />
        <DonutBlock title="Site Distribution" data={a.siteDistribution} colors={a.siteDistribution.map(d => d.fill)} half />
        <DonutBlock title="Network Status" data={a.networkStatusDistribution} colors={a.networkStatusDistribution.map(d => d.fill)} half />
        <DonutBlock title="Scan Status" data={a.scanStatusDistribution} colors={a.scanStatusDistribution.map(d => d.fill)} half />
      </View>

      <View style={S.row2}>
        <HBarBlock title="Machine Types" data={a.machineTypeData} color={C.sky} half />
      </View>

    </View>
  );
}

// ── SentinelOne Most At-Risk ─────────────────────────────────────────────────
export function AtRiskSection({ threats }) {
  const a = buildAtRisk(threats);
  const cards = [
    ['Most At-Risk Device', a.topDevice, '#dc2626'],
    ['Most At-Risk User', a.topUser, '#d97706'],
    ['Most At-Risk Group', a.topGroup, '#7c3aed'],
  ];
  return (
    <View>
      <SectionDivider number="3.3" title="SentinelOne — Most At-Risk Entities" color="#d97706" />
      <View style={S.kpiRow} wrap={false}>
        {cards.map(([label, entry, color]) => (
          <View key={label} style={[S.kpiTile, { borderLeftWidth: 4, borderLeftColor: color }]}>
            <Text style={S.kpiLabel}>{label}</Text>
            <Text style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 2 }}>{entry ? entry[0] : 'No data'}</Text>
            <Text style={{ fontSize: 9, color }}>{entry ? `${entry[1]} threats` : ''}</Text>
          </View>
        ))}
      </View>
      {/* Three ranked-at-risk charts side-by-side (third-width each) on the wide landscape page. */}
      <View style={S.row2}>
        <HBarBlock title="Ranked Devices" data={a.devices.slice(0, 8)} color={C.red} half />
        <HBarBlock title="Ranked Users" data={a.users.slice(0, 8)} color={C.amber} half />
        <HBarBlock title="Ranked Groups" data={a.groups.slice(0, 8)} color={C.violet} half />
      </View>
    </View>
  );

}

// ── SentinelOne Application CVEs ──────────────────────────────────────────────
export function CveSection({ cves }) {
  const d = buildCveData(Array.isArray(cves) ? cves : []);
  if (d.totalApplications === 0) return (
    <View><SectionDivider number="3.4" title="SentinelOne — Application CVEs" color="#7c3aed" /><Text style={{ color: C.muted }}>No CVE data available.</Text></View>
  );
  const cveList = Array.isArray(cves) ? cves : [];
  const exposureData = d.severityDistribution.map(x => ({
    name: x.name,
    value: new Set(cveList.filter(r => String(r.severity || 'UNKNOWN').toUpperCase() === x.name).map(r => r.endpointId || r.endpointName).filter(Boolean)).size,
  }));
  return (
    <View>
      <SectionDivider number="3.4" title="SentinelOne — Application CVEs" color="#7c3aed" />
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Applications" value={formatNumber(d.totalApplications)} color={C.violet} />
        <KpiTile label="Total CVEs" value={formatNumber(d.totalCves)} color={C.brand} />
        <KpiTile label="Critical" value={formatNumber(d.severityMap.CRITICAL)} color={C.red} />
        <KpiTile label="High" value={formatNumber(d.severityMap.HIGH)} color={C.amber} />
        <KpiTile label="Endpoints" value={formatNumber(d.totalEndpoints)} color={C.sky} />
        <KpiTile label="Avg Score" value={d.avgScore} color={C.slate} />
      </View>
      <View style={S.row2}>
        <DonutBlock title="Severity Distribution" data={d.severityDistribution} half />
        <HBarBlock title="Top Risky Applications" data={d.topRiskyApps.slice(0, 10).map(x => ({ name: x.name, value: x.cves }))} color={C.violet} half />
        {/* <HBarBlock title="Top Risky Applications" data={d.topRiskyApps.slice(0, 10).map(x => ({ name: x.name, value: x.cves }))} color={C.violet} half /> */}
      </View>

      <View style={S.row2}>
        <BarBlock title="CVE Aging (days since detection)" data={d.cveAging.map(x => ({ name: x.name, value: x.count }))} color={C.amber} half />
        {d.severityDistribution.length > 0 ? (
          <HBarBlock title="CVE Exposure by Severity (endpoints affected)" data={exposureData} color={C.sky} half />
        ) : <View style={S.chartHalf} />}
        {d.criticalApps.length > 0 && (
          <HBarBlock title="Critical Applications by CVE count" data={d.criticalApps.map(x => ({ name: x.name, value: x.cveCount }))} color={C.red} />
        )}
      </View>

    </View>
  );
}

// ── SentinelOne Application Insights ──────────────────────────────────────────
export function AppInsightsSection({ apps }) {
  const list = Array.isArray(apps) ? apps : [];
  if (list.length === 0) return <Text style={{ color: C.muted }}>No application inventory data available.</Text>;
  const names = new Set(list.map(a => a.applicationName || a.name || a.appName || 'Unknown'));
  const osC = {}, sevC = {}, appC = {};
  list.forEach(a => {
    const n = a.applicationName || a.name || a.appName || 'Unknown';
    osC[a.osType || a.os || a.operatingSystem || 'Unknown'] = (osC[a.osType || a.os || a.operatingSystem || 'Unknown'] || 0) + 1;
    sevC[a.severity || 'Unknown'] = (sevC[a.severity || 'Unknown'] || 0) + 1;
    appC[n] = (appC[n] || 0) + 1;
  });
  const osRows = Object.entries(osC).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const sevRows = Object.entries(sevC).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const appRows = Object.entries(appC).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name: name.length > 40 ? name.slice(0, 40) + '…' : name, value }));
  const publishers = new Set(list.map(a => a.applicationVendor || a.publisher || a.vendor || '').filter(Boolean));
  return (
    <View>
      <SectionDivider number="3.5" title="SentinelOne — Application Insights" color="#0ea5e9" />
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Unique Apps" value={formatNumber(names.size)} color={C.sky} />
        <KpiTile label="Records" value={formatNumber(list.length)} color={C.brand} />
        <KpiTile label="Publishers" value={formatNumber(publishers.size)} color={C.violet} />
      </View>
      <View style={S.row2}>
        <DonutBlock title="By Operating System" data={osRows} colors={palette(osRows)} half />
        {/* <HBarBlock title="By Severity" data={sevRows} color={C.sky} half /> */}
        <HBarBlock title="Top Installed Applications" data={appRows} color={C.brand} />
      </View>
    </View>
  );
}

// ── Zoho Desk ─────────────────────────────────────────────────────────────────
export function ZohoSection({ tickets, mttr }) {
  const z = buildZohoSummary(tickets);
  const counts = buildZohoTicketCounts(tickets);
  const funnel = buildZohoFunnel(tickets);
  const heatmap = buildZohoHeatmap(tickets);
  const volcano = buildZohoVolcano(tickets);
  const topPerf = buildZohoTopPerformance(tickets);
  const corp = buildZohoCorpMembers(tickets);
  const mttrCard = buildZohoMttr(tickets);
  const isIncrease = counts.closedDifference > 0;
  const isDecrease = counts.closedDifference < 0;

  return (
    <View>
      <SectionDivider number="4" title="Zoho Desk — Support Tickets" color="#d97706" />
      <Text style={S.lead}>
        {z.total} tickets recorded. {z.open} open, {z.closed} closed, {z.highPri} high/critical priority, {z.overdue} overdue.
      </Text>
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Total" value={formatNumber(z.total)} color={C.brand} />
        {/* <KpiTile label="Open" value={formatNumber(z.open)} color={C.sky} /> */}
        <KpiTile label="High Priority" value={formatNumber(z.highPri)} color={C.red} />
        <KpiTile label="Closed" value={formatNumber(z.closed)} color={C.green} />
        <KpiTile label="Overdue" value={formatNumber(z.overdue)} color={C.amber} />
      </View>

      {/* Status-count summary cards (Open / WIP / On Hold / Revert Awaited / Closed) */}
      <View style={S.block}>
        <ZohoCountCards cards={counts.cards} />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
          <Text style={{ fontSize: 7.5, color: C.faint }}>
            Closed this month: {counts.currentMonthClosed}{' '}
            ({isIncrease ? '↑' : isDecrease ? '↓' : '→'} {Math.abs(counts.closedDifference)} · {Math.abs(counts.closedPercentage).toFixed(1)}% vs last month)
          </Text>
        </View>
      </View>

      <View style={S.row2}>
        <DonutBlock title="By Status" data={z.statusData} half />
        <DonutBlock title="By Priority" data={z.priorityData} half />
      </View>

      {/* Ticket Status Funnel */}
     

      {/* Ticket Creation Heatmap + Hour-bucket resolution graph */}
      <View style={S.row2}>
        <View style={S.chartHalf}>
          <Text style={S.chartHalfTitle}>Ticket Creation Heatmap</Text>
          <VHeatmap matrix={heatmap.matrix} max={heatmap.max} dayNames={heatmap.DAY_NAMES} />
        </View>
        <View style={S.chartHalf}>
          <Text style={S.chartHalfTitle}>Ticket Hour Bucket Graph</Text>
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <VVolcano buckets={volcano.buckets} max={volcano.max} height={160} width={300} />
            <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 2 }}>{volcano.total} tickets resolved</Text>
          </View>
        </View>
      </View>

      <View style={S.row2}>
        <HBarBlock title="Resolution Time Aging" data={z.agingData} color={C.amber} half />
        {z.engineerPerformance.length > 0 ? (
          <HBarBlock title="Engineer Performance (tickets closed)" data={z.engineerPerformance.map(e => ({ name: e.engineer, value: e.closed }))} color={C.brand} half />
        ) : <View style={S.chartHalf} />}
      </View>

      <View style={S.row2}>
        <HBarBlock title="Tickets by Department" data={z.departmentData} color={C.violet} half />
        {/* Top Lowest 5 Performance */}
        <View style={S.chartHalf}>
          <Text style={S.chartHalfTitle}>Top Lowest 5 Performance</Text>
          <Text style={{ fontSize: 7, color: C.faint, marginBottom: 4 }}>Engineer-wise total time from created to closed</Text>
          <VTopTable rows={topPerf.rows} headers={['Engineer Name', 'Closed', 'Score', 'Hours']} />
        </View>
      </View>

      <View style={S.row2}>
        {/* <View style={S.chartHalf}>
          <Text style={S.chartHalfTitle}>Corporation Assignee Distribution</Text>
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <VCorpMember data={corp.data} size={240} />
          </View>
        </View> */}
        <View style={S.chartHalf}>
        <MttrGaugeCard cfgKey="ticketing" mttr={mttr} />
      </View>
        <View style={S.chartHalf}>
          <Text style={S.chartHalfTitle}>MTTR Score</Text>
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <VMttrCard avg={mttrCard.avg} score={mttrCard.score} scoreColor={mttrCard.scoreColor} />
          </View>
        </View>
      </View>

      
    </View>
  );
}

// ── Palo Alto Firewall ────────────────────────────────────────────────────────
export function FirewallSection({ fw }) {
  const f = fw;
  const scoreStatus = getSecurityScoreStatus(f.securityScore);
  // Risk Distribution donut uses the same severity palette as the dashboard
  // (RISK_COLORS keyed by risk level 5→1, plus '-' for unknown).
  const riskDist = (f.riskDistribution || []).map(d => ({ ...d, fill: RISK_COLORS[String(d.risk)] || '#94a3b8' }));
  return (
    <View>
      <SectionDivider number="5" title="Palo Alto Firewall — Network Security" color="#ea580c" />
      <Text style={S.lead}>
        {f.totalSessions > 0 ? `${formatNumber(f.totalSessions)} sessions monitored, ${formatBytes(f.totalTraffic)} traffic.` : 'No firewall telemetry data available.'}
        {' '}{f.highRiskEvents} high-risk events, {f.blockedConnections} blocked connections.
      </Text>
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Security Score" value={`${f.securityScore}/100`} sub={scoreStatus.label} color={scoreStatus.color} />
        <KpiTile label="Sessions" value={formatNumber(f.totalSessions)} color={C.sky} />
        <KpiTile label="High Risk" value={formatNumber(f.highRiskEvents)} color={C.red} />
        <KpiTile label="Blocked" value={formatNumber(f.blockedConnections)} color={C.amber} />
        <KpiTile label="Risky Users" value={formatNumber(f.criticalUsers)} color={C.violet} />
        <KpiTile label="Total Traffic" value={formatBytes(f.totalTraffic)} color="#06b6d4" />
        <KpiTile label="Top Destination" value={f.topDestination || '-'} color={C.green} />
      </View>

      <View style={S.row2}>
        <DonutBlock title="Risk Distribution" data={riskDist} half />
        <View style={S.chartHalf} wrap={false}>
          <Text style={S.chartHalfTitle}>Risk / Session Trend</Text>
          {f.riskTrend.length > 0 ? (
            <VLineChart data={f.riskTrend} width={320} height={150} labelKey="date" valueKey="sessions" stroke={C.red} />
          ) : <EmptyNote />}
        </View>
      </View>

      <View style={S.row2}>
        <HBarBlock title="Top Attacks" data={f.topAttacks} color={C.red} half />
        <HBarBlock title="Top Attacker Sources" data={f.topAttackers} color={C.sky} half />
      </View>

      <View style={S.row2}>
        <HBarBlock title="Top Denied Destinations" data={f.topDeniedDestinations} color="#ef4444" half />
        <HBarBlock title="Top Connections" data={f.topConnections} color="#10b981" half />
      </View>
    </View>
  );
}

// ── Weekly Insights ───────────────────────────────────────────────────────────
export function WeeklyInsights({ weekly }) {
  return (
    <View>
      <SectionDivider number="6" title="Weekly Insights — 7-Day Comparison" color="#7c3aed" />
      <View style={S.block}>
        <Text style={S.cardTitle}>Period</Text>
        <Text style={{ fontSize: 9, color: C.sub }}>{weekly.periodLabel} — compared against the preceding 7 days.</Text>
      </View>
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Threats This Week" value={formatNumber(weekly.kpi.threatsThis)} sub={`last: ${weekly.kpi.threatsLast}`} color={C.red} />
        <KpiTile label="Harmony Events" value={formatNumber(weekly.kpi.harmonyThis)} sub={`last: ${weekly.kpi.harmonyLast}`} color={C.violet} />
        <KpiTile label="Remediation Rate" value={`${weekly.kpi.remRateThis}%`} sub={`last: ${weekly.kpi.remRateLast}%`} color={C.green} />
        <KpiTile label="New Agents" value={formatNumber(weekly.kpi.newAgentsThis)} sub={`last: ${weekly.kpi.newAgentsLast}`} color={C.sky} />
        <KpiTile label="New CVEs" value={formatNumber(weekly.kpi.newCvesThis)} sub={`last: ${weekly.kpi.newCvesLast}`} color={C.amber} />
        <KpiTile label="Critical CVEs" value={formatNumber(weekly.kpi.critCvesThis)} color={C.red} />
      </View>
      <DonutBlock title="Threat Recurrence (New vs Recurring)" data={weekly.newVsRecurring} />
      <View style={S.row2}>
        <HBarBlock title="Top Endpoints by Threats (this week)" data={weekly.topEndpoints.map(x => ({ name: x.endpoint, value: x['This Week'] || 0 }))} color={C.red} half />
        <HBarBlock title="Top Users by Threats (this week)" data={weekly.topUsers.map(x => ({ name: x.user, value: x['This Week'] || 0 }))} color={C.amber} half />
      </View>
    </View>
  );
}

// ── Root document ─────────────────────────────────────────────────────────────
export default function
  ReportTemplate({ data }) {
  if (!data) return null;
  const weekly = computeWeeklyStats(data.harmonyEvents, data.s1Threats, data.s1Agents, data.s1Cves);
  const fw = buildFirewallSummary(data);

  return (
    <Document
      title={`CISO Security Report — ${data.orgName}`}
      author="CISO Dashboard"
      creator="CISO Dashboard"
      producer="CISO Dashboard"
    >
      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <CoverPage orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>

      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="1" />
        <ExecutiveSummary d={data} weekly={weekly} />
      </Page>

      <Page size="A3" orientation="landscape" style={S.page} wrap>
        {/* <CoverPage orgName={data.orgName} generatedAt={data.generatedAt} /> */}
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="2" />
        <CheckpointSection events={data.harmonyEvents} weekly={weekly} mttr={data.mttr} />
      </Page>

      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="3" />
        <ThreatAnalytics threats={data.s1Threats} mttr={data.mttr} />
      </Page>

      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="4" />
        <AgentAnalytics agents={data.s1Agents} generatedAt={data.generatedAt} removed={data.removedAgentsCount} />
      </Page>

      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="5" />
        <AtRiskSection threats={data.s1Threats} />
      </Page>

      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="6" />
        <CveSection cves={data.s1Cves} />
      </Page>

      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="7" />
        <AppInsightsSection apps={data.s1AppAgent} />
      </Page>

      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="8" />
        <ZohoSection tickets={data.zohoTickets} mttr={data.mttr} />
      </Page>

      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="9" />
        <FirewallSection fw={fw} />
      </Page>

      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="10" />
        <WeeklyInsights weekly={weekly} d={data} />
      </Page>
    </Document>
  );
}
