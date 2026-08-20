import React from 'react';
import { Document, Page, View, Text, Svg, StyleSheet, Image as PdfImage } from '@react-pdf/renderer';
import {
  formatNumber, formatBytes, getSecurityScoreStatus, shortName,
  buildCveData, computeWeeklyStats, buildThreatAnalytics, buildAgentAnalytics,
  buildAtRisk, buildZohoSummary, buildFirewallSummary,
  ZOHO_STATUS_COLORS, ZOHO_PRIORITY_COLORS, SEV_COLORS, CVE_COLORS,
} from './dataUtils';
import { VDonut, VLineChart, VBarChart, VHBarList } from './pdfChartComponents';

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
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 8.5 },
  th: { backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.line, padding: '4px 6px', textAlign: 'left', fontSize: 7.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { padding: '3px 6px', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', fontSize: 8.5, color: C.ink },
  tdAlt: { backgroundColor: '#fafafa' },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: '#fff', padding: 10 },
  cardTitle: { fontSize: 10.5, fontWeight: 700, color: C.ink, marginBottom: 8 },
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

// Resolve a cell value from a row object, tolerant of many data shapes:
// exact key → case-insensitive key → `name` for first column / `value` for the
// rest → numeric fallback for count-like columns. So `{ name, value }` rows
// render correctly under any column header, and raw API rows work too.
function cellValue(row, col, isFirst) {
  if (row == null) return '-';
  if (row[col] !== undefined && row[col] !== null && row[col] !== '') return row[col];
  const lower = String(col).toLowerCase();
  const match = Object.keys(row).find((k) => String(k).toLowerCase() === lower);
  if (match !== undefined) return row[match];
  if (isFirst && row.name !== undefined) return row.name;
  if (!isFirst && row.value !== undefined) return row.value;
  if (!isFirst && row.count !== undefined) return row.count;
  return '-';
}

// True if a row set is effectively empty (zero rows, or every cell dash/blank) —
// used to swap a hollow table for a chart.
function isHollow(rows) {
  if (!rows || rows.length === 0) return true;
  return rows.every((r) => Object.values(r).every((v) => v === undefined || v === null || v === '' || v === '-'));
}

export function PdfTable({ columns, rows, widths, strip = true, maxRows = 20 }) {
  const display = (rows || []).slice(0, maxRows);
  if (!columns || columns.length === 0 || display.length === 0) return null;
  return (
    <View wrap={false} style={{ marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 4 }}>
        {columns.map((c) => (
          <Text key={c} style={{ flex: 1, paddingHorizontal: 6, fontSize: 7.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{c}</Text>
        ))}
      </View>
      {display.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', backgroundColor: strip && i % 2 === 1 ? '#fafafa' : '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 3 }}>
          {columns.map((c, ci) => (
            <Text key={c} style={{ flex: 1, paddingHorizontal: 6, fontSize: 8, color: C.ink, fontWeight: ci === 0 ? 600 : 400 }}>{String(cellValue(r, c, ci === 0))}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function ChartFrame({ title, children, desc }) {
  return (
    <View style={S.block} wrap={false}>
      <Text style={S.cardTitle}>{title}</Text>
      <View style={S.chartFrame}>{children}</View>
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

// When a dashboards table comes back empty, show the chart from that metric's
// individual dashboard page in its place (so the PDF page is never blank).
function EmptyChart({ kind, data, color = C.brand, width = 300, height = 150, labelKey = 'name', valueKey = 'value' }) {
  if (!data || data.length === 0) return (
    <Text style={{ fontSize: 8.5, color: C.faint, fontStyle: 'italic' }}>No data available for this period.</Text>
  );
  switch (kind) {
    case 'donut':
      return <VDonut data={data} width={width} height={height} />;
    case 'hbar':
      return <VHBarList data={data} width={width} maxItems={10} color={color} labelKey={labelKey} valueKey={valueKey} />;
    case 'line':
      return <VLineChart data={data} width={width} height={height} labelKey={labelKey} valueKey={valueKey} />;
    default:
      return <VBarChart data={data} width={width} height={height} color={color} labelKey={labelKey} valueKey={valueKey} />;
  }
}

export function PageFooter({ orgName, generatedAt }) {
  const date = new Date(generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <View style={S.footer} fixed>
      <Text>CISO Security Report · {orgName}</Text>
      <Text>{date}</Text>
    </View>
  );
}

// ── Cover ─────────────────────────────────────────────────────────────────────
function CoverPage({ orgName, generatedAt }) {
  const date = new Date(generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const index = [
    ['1', 'Executive Summary'],
    ['2', 'Checkpoint Harmony — Email & Cloud Security'],
    ['3', 'SentinelOne — Endpoint Security'],
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
function ExecutiveSummary({ d, weekly }) {
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
        <KpiTile label="Security Score" value={`${risk.securityScore}/100`} sub={scoreStatus.label} color={scoreStatus.color} />
        <KpiTile label="Threats Detected" value={formatNumber(threats.length)} color={C.red} />
        <KpiTile label="Mitigated" value={formatNumber(mitigated)} color={C.green} />
        <KpiTile label="Known CVEs" value={formatNumber(cve.totalCves)} color={C.amber} />
        <KpiTile label="Open Tickets" value={formatNumber(tickets.filter(t => t.status === 'Open').length)} color={C.sky} />
        <KpiTile label="Email Events" value={formatNumber(events.length)} color={C.violet} />
      </View>

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
function CheckpointSection({ events, weekly }) {
  const list = Array.isArray(events) ? events : [];
  const states = {};
  list.forEach(e => { const s = e.state || 'unknown'; states[s] = (states[s] || 0) + 1; });
  const stateRows = Object.entries(states).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const sev = {};
  list.forEach(e => { const s = e.severity ?? 'Unknown'; sev[s] = (sev[s] || 0) + 1; });
  const sevRows = Object.entries(sev).map(([name, value]) => ({ name: name === '3' ? 'High' : name === '4' ? 'Critical' : name, value }));
  const pending = list.filter(e => e.state === 'pending').length;
  const resolved = list.filter(e => ['remediated', 'done', 'closed'].includes(e.state)).length;

  return (
    <View>
      <SectionDivider number="2" title="Checkpoint Harmony — Email & Cloud Security" />
      <Text style={S.lead}>
        {list.length} email and cloud security events recorded. {pending} pending review, {resolved} resolved.
      </Text>
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Total Events" value={formatNumber(list.length)} color={C.brand} />
        <KpiTile label="Pending" value={formatNumber(pending)} color={C.amber} />
        <KpiTile label="Resolved" value={formatNumber(resolved)} color={C.green} />
      </View>

      <View style={S.block}>
        <Text style={S.cardTitle}>Event State Breakdown</Text>
        {!isHollow(stateRows)
          ? <PdfTable columns={['State', 'Events']} rows={stateRows} />
          : <EmptyChart kind="donut" data={sevRows.map((d, i) => ({ ...d, fill: SEV_COLORS[i % SEV_COLORS.length] }))} width={150} height={140} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Severity Mix</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <VDonut data={sevRows.map((d, i) => ({ ...d, fill: SEV_COLORS[i % SEV_COLORS.length] }))} width={150} height={140} />
          <View style={{ flex: 1, marginLeft: 16 }}>
            {sevRows.map((d, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: SEV_COLORS[i % SEV_COLORS.length], marginRight: 6 }} />
                <Text style={{ fontSize: 8.5, color: C.sub }}>{d.name} — {d.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {weekly && (
        <View style={S.block}>
          <Text style={S.cardTitle}>Top Senders — Week-over-Week</Text>
          {!isHollow(weekly.topSenders)
            ? <PdfTable columns={['Sender', 'This Week', 'Last Week', 'Change']} rows={weekly.topSenders.slice(0, 10)} />
            : <EmptyChart kind="hbar" data={weekly.remComp.map(r => ({ name: r.day, value: r['This Week'] }))} color={C.brand} />}
        </View>
      )}
      {weekly && (
        <View style={S.block}>
          <Text style={S.cardTitle}>Event Volume — This Week vs Last Week</Text>
          <VBarChart data={weekly.remComp.map(r => ({ name: r.day, value: r['This Week'] }))} color={C.brand} width={300} height={150} />
        </View>
      )}
    </View>
  );
}

// ── SentinelOne Threat Analytics ──────────────────────────────────────────────
function ThreatAnalytics({ threats }) {
  const t = buildThreatAnalytics(threats);
  return (
    <View>
      <SectionDivider number="3" title="SentinelOne — Threat Analytics" color="#dc2626" />
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
        <KpiTile label="Avg MTTM" value={t.avgMttm !== null ? `${Math.round(t.avgMttm)}m` : 'N/A'} color={C.slate} />
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Mitigation Status</Text>
        {!isHollow(t.mitigationData)
          ? <PdfTable columns={['Status', 'Count']} rows={t.mitigationData} maxRows={8} />
          : <EmptyChart kind="donut" data={t.confidenceData} width={150} height={140} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Classification</Text>
        {!isHollow(t.classData)
          ? <PdfTable columns={['Classification', 'Count']} rows={t.classData} maxRows={8} />
          : <EmptyChart kind="hbar" data={t.confidenceData.slice(0, 8)} color={C.violet} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Detection Engines</Text>
        {!isHollow(t.engineData)
          ? <PdfTable columns={['Engine', 'Count']} rows={t.engineData.slice(0, 8)} />
          : <EmptyChart kind="hbar" data={t.confidenceData.slice(0, 8)} color={C.sky} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>MITRE ATT&amp;CK Tactics</Text>
        {!isHollow(t.tacticData)
          ? <PdfTable columns={['Tactic', 'Count']} rows={t.tacticData.slice(0, 8)} />
          : <EmptyChart kind="hbar" data={t.confidenceData.slice(0, 6)} color={C.slate} />}
      </View>
    </View>
  );
}

// ── SentinelOne Agent Analytics ───────────────────────────────────────────────
function AgentAnalytics({ agents, generatedAt, removed }) {
  const a = buildAgentAnalytics(agents, generatedAt);
  const agentRows = (Array.isArray(agents) ? agents : []).slice(0, 10).map(x => ({
    name: x.computer_name || x.computerName || '-',
    os: x.os_type || x.osType || x.os || '-',
    status: x.network_status || x.networkStatus || '-',
    version: x.agent_version || x.agentVersion || '-',
  }));
  return (
    <View>
      <SectionDivider number="3" title="SentinelOne — Agent Analytics" color="#0ea5e9" />
      <Text style={S.lead}>
        {a.total} agents registered. {a.connected} connected ({Math.round(a.connected / Math.max(a.total, 1) * 100)}%), {a.disconnected} disconnected, {a.newAgents} new in 30 days.
      </Text>
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Total Agents" value={formatNumber(a.total)} color={C.sky} />
        <KpiTile label="Connected" value={formatNumber(a.connected)} color={C.green} />
        <KpiTile label="Disconnected" value={formatNumber(a.disconnected)} color={C.red} />
        <KpiTile label="New (30d)" value={formatNumber(a.newAgents)} color={C.violet} />
        <KpiTile label="Removed" value={formatNumber(removed ?? 0)} color={C.slate} />
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Operating System Distribution</Text>
        {!isHollow(a.osData)
          ? <PdfTable columns={['OS', 'Agents']} rows={a.osData} />
          : <EmptyChart kind="donut" data={(a.machineTypeData.length ? a.machineTypeData : [{ name: 'No OS data', value: 0 }]).filter(x => x.value > 0)} width={150} height={140} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Machine Types</Text>
        {!isHollow(a.machineTypeData)
          ? <PdfTable columns={['Type', 'Agents']} rows={a.machineTypeData} />
          : <EmptyChart kind="hbar" data={a.osData.slice(0, 8)} color={C.sky} />}
      </View>
      {agentRows.length > 0 && (
        <View style={S.block}>
          <Text style={S.cardTitle}>Recent Agents</Text>
          <PdfTable columns={['Name', 'OS', 'Status', 'Version']} rows={agentRows} />
        </View>
      )}
      {agentRows.length === 0 && (
        <View style={S.block}>
          <Text style={S.cardTitle}>Agent Status</Text>
          <EmptyChart kind="donut" data={a.statusData.filter(x => x.value > 0)} width={150} height={140} />
        </View>
      )}
    </View>
  );
}

// ── SentinelOne Most At-Risk ─────────────────────────────────────────────────
function AtRiskSection({ threats }) {
  const a = buildAtRisk(threats);
  const cards = [
    ['Most At-Risk Device', a.topDevice, '#dc2626'],
    ['Most At-Risk User', a.topUser, '#d97706'],
    ['Most At-Risk Group', a.topGroup, '#7c3aed'],
  ];
  return (
    <View>
      <SectionDivider number="3" title="SentinelOne — Most At-Risk Entities" color="#d97706" />
      <View style={S.kpiRow} wrap={false}>
        {cards.map(([label, entry, color]) => (
          <View key={label} style={[S.kpiTile, { borderLeftWidth: 4, borderLeftColor: color }]}>
            <Text style={S.kpiLabel}>{label}</Text>
            <Text style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 2 }}>{entry ? entry[0] : 'No data'}</Text>
            <Text style={{ fontSize: 9, color }}>{entry ? `${entry[1]} threats` : ''}</Text>
          </View>
        ))}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Ranked Devices</Text>
        {!isHollow(a.devices)
          ? <PdfTable columns={['Device', 'Threats']} rows={a.devices.slice(0, 8)} />
          : <EmptyChart kind="hbar" data={a.users.length ? a.users.slice(0, 8) : a.groups.slice(0, 8)} color={C.red} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Ranked Users</Text>
        {!isHollow(a.users)
          ? <PdfTable columns={['User', 'Threats']} rows={a.users.slice(0, 8)} />
          : <EmptyChart kind="hbar" data={a.groups.length ? a.groups.slice(0, 8) : a.devices.slice(0, 8)} color={C.amber} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Ranked Groups</Text>
        {!isHollow(a.groups)
          ? <PdfTable columns={['Group', 'Threats']} rows={a.groups.slice(0, 8)} />
          : <EmptyChart kind="hbar" data={a.devices.length ? a.devices.slice(0, 8) : a.users.slice(0, 8)} color={C.violet} />}
      </View>
    </View>
  );
}

// ── SentinelOne Application CVEs ──────────────────────────────────────────────
function CveSection({ cves }) {
  const d = buildCveData(Array.isArray(cves) ? cves : []);
  if (d.totalApplications === 0) return (
    <View><SectionDivider number="3" title="SentinelOne — Application CVEs" color="#7c3aed" /><Text style={{ color: C.muted }}>No CVE data available.</Text></View>
  );
  return (
    <View>
      <SectionDivider number="3" title="SentinelOne — Application CVEs" color="#7c3aed" />
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Applications" value={formatNumber(d.totalApplications)} color={C.violet} />
        <KpiTile label="Total CVEs" value={formatNumber(d.totalCves)} color={C.brand} />
        <KpiTile label="Critical" value={formatNumber(d.severityMap.CRITICAL)} color={C.red} />
        <KpiTile label="High" value={formatNumber(d.severityMap.HIGH)} color={C.amber} />
        <KpiTile label="Endpoints" value={formatNumber(d.totalEndpoints)} color={C.sky} />
        <KpiTile label="Avg Score" value={d.avgScore} color={C.slate} />
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Severity Distribution</Text>
        <VDonut data={d.severityDistribution.map(x => ({ ...x, fill: CVE_COLORS[x.name] }))} width={150} height={140} />
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Top Risky Applications</Text>
        {d.topRiskyApps.length > 0
          ? <PdfTable columns={['Application', 'CVEs', 'Max Score']} rows={d.topRiskyApps.slice(0, 10).map(x => ({ 'Application': x.name, 'CVEs': x.cves, 'Max Score': Number(x.score).toFixed(1) }))} />
          : <EmptyChart kind="hbar" data={d.severityDistribution.slice(0, 8)} color={C.violet} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>CVE Aging</Text>
        {!isHollow(d.cveAging)
          ? <PdfTable columns={['Age (days)', 'Count']} rows={d.cveAging.map(x => ({ 'Age (days)': x.name, 'Count': x.count }))} />
          : <EmptyChart kind="bar" data={d.severityDistribution} color={C.amber} />}
      </View>
      {d.severityDistribution.length > 0 && (
        <View style={S.block}>
          <Text style={S.cardTitle}>CVE Exposure Funnel</Text>
          <PdfTable columns={['Severity', 'CVEs', 'Endpoints', 'Fleet %']} rows={d.severityDistribution.map(x => ({
            'Severity': x.name, 'CVEs': x.value,
            'Endpoints': new Set((Array.isArray(cves) ? cves : []).filter(r => String(r.severity || 'UNKNOWN').toUpperCase() === x.name).map(r => r.endpointId || r.endpointName).filter(Boolean)).size,
            'Fleet %': d.totalEndpoints > 0 ? Math.round(new Set((Array.isArray(cves) ? cves : []).filter(r => String(r.severity || 'UNKNOWN').toUpperCase() === x.name).map(r => r.endpointId || r.endpointName).filter(Boolean)).size / d.totalEndpoints * 100) + '%' : '0%',
          }))} />
        </View>
      )}
      {d.criticalApps.length > 0 && (
        <View style={S.block}>
          <Text style={S.cardTitle}>Critical Applications</Text>
          <PdfTable columns={['Application', 'CVEs', 'Score', 'Endpoints']} rows={d.criticalApps.map(x => ({
            'Application': x.name, 'CVEs': x.cveCount, 'Score': Number(x.highestNvdBaseScore).toFixed(1), 'Endpoints': x.endpointCount,
          }))} />
        </View>
      )}
    </View>
  );
}

// ── SentinelOne Application Insights ──────────────────────────────────────────
function AppInsightsSection({ apps }) {
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
      <SectionDivider number="3" title="SentinelOne — Application Insights" color="#0ea5e9" />
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Unique Apps" value={formatNumber(names.size)} color={C.sky} />
        <KpiTile label="Records" value={formatNumber(list.length)} color={C.brand} />
        <KpiTile label="Publishers" value={formatNumber(publishers.size)} color={C.violet} />
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>By Operating System</Text>
        {!isHollow(osRows)
          ? <PdfTable columns={['OS', 'Records']} rows={osRows} />
          : <EmptyChart kind="donut" data={(sevRows.length ? sevRows : appRows.slice(0, 6)).filter(x => x.value > 0)} width={150} height={140} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>By Severity</Text>
        {!isHollow(sevRows)
          ? <PdfTable columns={['Severity', 'Records']} rows={sevRows} />
          : <EmptyChart kind="hbar" data={osRows.slice(0, 8)} color={C.sky} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Top Installed Applications</Text>
        {!isHollow(appRows)
          ? <PdfTable columns={['Application', 'Installs']} rows={appRows} />
          : <EmptyChart kind="hbar" data={osRows.slice(0, 8)} color={C.brand} />}
      </View>
    </View>
  );
}

// ── Zoho Desk ─────────────────────────────────────────────────────────────────
function ZohoSection({ tickets }) {
  const z = buildZohoSummary(tickets);
  const recent = (Array.isArray(tickets) ? tickets : []).slice(0, 10).map(t => ({
    Subject: (t.subject || '—').slice(0, 60), Status: t.status || '—', Priority: t.priority || '—',
    Contact: t.contact_name || '—', Created: t.created_time ? new Date(t.created_time).toLocaleDateString() : '—',
  }));
  return (
    <View>
      <SectionDivider number="4" title="Zoho Desk — Support Tickets" color="#d97706" />
      <Text style={S.lead}>
        {z.total} tickets recorded. {z.open} open, {z.closed} closed, {z.highPri} high/critical priority, {z.overdue} overdue.
      </Text>
      <View style={S.kpiRow} wrap={false}>
        <KpiTile label="Total" value={formatNumber(z.total)} color={C.brand} />
        <KpiTile label="Open" value={formatNumber(z.open)} color={C.sky} />
        <KpiTile label="High Priority" value={formatNumber(z.highPri)} color={C.red} />
        <KpiTile label="Closed" value={formatNumber(z.closed)} color={C.green} />
        <KpiTile label="Overdue" value={formatNumber(z.overdue)} color={C.amber} />
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>By Status</Text>
        {!isHollow(z.statusData)
          ? <PdfTable columns={['Status', 'Tickets']} rows={z.statusData} />
          : <EmptyChart kind="donut" data={(z.priorityData.length ? z.priorityData : z.agingData).filter(x => x.value > 0)} width={150} height={140} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>By Priority</Text>
        {!isHollow(z.priorityData)
          ? <PdfTable columns={['Priority', 'Tickets']} rows={z.priorityData} />
          : <EmptyChart kind="donut" data={(z.statusData.length ? z.statusData : z.agingData).filter(x => x.value > 0)} width={150} height={140} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Resolution Time Aging</Text>
        {!isHollow(z.agingData)
          ? <PdfTable columns={['Age', 'Tickets']} rows={z.agingData} />
          : <EmptyChart kind="hbar" data={z.departmentData.slice(0, 8)} color={C.amber} />}
      </View>
      {z.engineerPerformance.length > 0 && (
        <View style={S.block}>
          <Text style={S.cardTitle}>Engineer Performance</Text>
          <PdfTable columns={['Engineer', 'Open', 'Closed']} rows={z.engineerPerformance} />
        </View>
      )}
      {recent.length > 0 && (
        <View style={S.block}>
          <Text style={S.cardTitle}>Recent Tickets</Text>
          <PdfTable columns={['Subject', 'Status', 'Priority', 'Contact', 'Created']} rows={recent} />
        </View>
      )}
    </View>
  );
}

// ── Palo Alto Firewall ────────────────────────────────────────────────────────
function FirewallSection({ fw }) {
  const f = fw;
  const scoreStatus = getSecurityScoreStatus(f.securityScore);
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
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Risk Distribution</Text>
        {!isHollow(f.riskDistribution)
          ? <PdfTable columns={['Risk Level', 'Events']} rows={f.riskDistribution.map(x => ({ 'Risk Level': x.name, 'Events': x.value }))} />
          : (f.riskTrend.length > 0
              ? <EmptyChart kind="line" data={f.riskTrend} color={C.red} labelKey="date" valueKey="sessions" />
              : <EmptyChart kind="donut" data={f.topAttacks.slice(0, 6)} width={150} height={140} />)}
      </View>
      {f.riskTrend.length > 0 && (
        <View style={S.block}>
          <Text style={S.cardTitle}>Risk/Session Trend</Text>
          <VLineChart data={f.riskTrend} width={300} height={130} labelKey="date" valueKey="sessions" />
        </View>
      )}
      <View style={S.block}>
        <Text style={S.cardTitle}>Top Attacks</Text>
        {!isHollow(f.topAttacks)
          ? <PdfTable columns={['Attack', 'Count']} rows={f.topAttacks} />
          : <EmptyChart kind="hbar" data={f.topAttackers.slice(0, 8)} color={C.red} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Top Attacker Sources</Text>
        {!isHollow(f.topAttackers)
          ? <PdfTable columns={['Source', 'Count']} rows={f.topAttackers} />
          : <EmptyChart kind="hbar" data={f.riskyUsers.slice(0, 8)} color={C.sky} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Risky Users</Text>
        {!isHollow(f.riskyUsers)
          ? <PdfTable columns={['User', 'Count']} rows={f.riskyUsers} />
          : <EmptyChart kind="hbar" data={f.topDeniedSources.slice(0, 8)} color={C.violet} />}
      </View>
    </View>
  );
}

// ── Weekly Insights ───────────────────────────────────────────────────────────
function WeeklyInsights({ weekly, d }) {
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
      <View style={S.block}>
        <Text style={S.cardTitle}>Threat Recurrence</Text>
        {!isHollow(weekly.newVsRecurring)
          ? <PdfTable columns={['Type', 'Count']} rows={weekly.newVsRecurring.map(x => ({ 'Type': x.name, 'Count': x.value }))} />
          : <EmptyChart kind="donut" data={(weekly.topEndpoints.length ? weekly.topEndpoints.map(x => ({ name: x.endpoint, value: x['This Week'] })) : weekly.remComp.map(r => ({ name: r.day, value: r['This Week'] }))).slice(0, 8).filter(x => x.value > 0)} width={150} height={140} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Top Endpoints by Threats</Text>
        {!isHollow(weekly.topEndpoints)
          ? <PdfTable columns={['Endpoint', 'This Week', 'Last Week']} rows={weekly.topEndpoints} />
          : <EmptyChart kind="hbar" data={(weekly.topUsers.length ? weekly.topUsers.map(x => ({ name: x.user, value: x['This Week'] })) : weekly.remComp.map(r => ({ name: r.day, value: r['This Week'] }))).slice(0, 8)} color={C.red} />}
      </View>
      <View style={S.block}>
        <Text style={S.cardTitle}>Top Users by Threats</Text>
        {!isHollow(weekly.topUsers)
          ? <PdfTable columns={['User', 'This Week', 'Last Week']} rows={weekly.topUsers} />
          : <EmptyChart kind="hbar" data={weekly.remComp.map(r => ({ name: r.day, value: r['This Week'] }))} color={C.amber} />}
      </View>
    </View>
  );
}

// ── Root document ─────────────────────────────────────────────────────────────
export default function ReportTemplate({ data }) {
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
      <Page size="A4" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <CoverPage orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>

      <Page size="A4" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <ExecutiveSummary d={data} weekly={weekly} />
      </Page>

      <Page size="A4" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <CheckpointSection events={data.harmonyEvents} weekly={weekly} />
      </Page>

      <Page size="A4" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <ThreatAnalytics threats={data.s1Threats} />
      </Page>

      <Page size="A4" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <AgentAnalytics agents={data.s1Agents} generatedAt={data.generatedAt} removed={data.removedAgentsCount} />
      </Page>

      <Page size="A4" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <AtRiskSection threats={data.s1Threats} />
      </Page>

      <Page size="A4" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <CveSection cves={data.s1Cves} />
      </Page>

      <Page size="A4" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <AppInsightsSection apps={data.s1AppAgent} />
      </Page>

      <Page size="A4" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <ZohoSection tickets={data.zohoTickets} />
      </Page>

      <Page size="A4" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <FirewallSection fw={fw} />
      </Page>

      <Page size="A4" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} />
        <WeeklyInsights weekly={weekly} d={data} />
      </Page>
    </Document>
  );
}