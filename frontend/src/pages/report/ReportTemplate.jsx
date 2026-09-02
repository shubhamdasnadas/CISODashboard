import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import {
  formatNumber, formatBytes, getSecurityScoreStatus, shortName,
  buildCveData, computeWeeklyStats, buildThreatAnalytics, buildAgentAnalytics,
  buildAtRisk, buildZohoSummary, buildFirewallSummary,
  buildZohoTicketCounts, buildZohoFunnel, buildZohoHeatmap, buildZohoVolcano,
  buildZohoTopPerformance, buildZohoMttr, buildZohoCorpMembers,
  ZOHO_STATUS_COLORS, ZOHO_PRIORITY_COLORS, SEV_COLORS, CVE_COLORS, COLORS, RISK_COLORS,
} from './dataUtils';
import { VDonut, VLineChart, VBarChart, VHBarList, VLegendRow, VGauge, ZohoCountCards, VHeatmap, VFunnel, VVolcano, VTopTable, VMttrCard, VCorpMember, VRadar, VStackedBar, VScoreBar } from './pdfChartComponents';

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
// Dark navy page background matching the reference design.
const PAGE_BG = '#0f172a';
const CARD_BG = '#1e293b';
const CARD_BORDER = '#334155';
const C = {
  ink: '#f1f5f9', sub: '#cbd5e1', muted: '#94a3b8', faint: '#64748b',
  line: '#334155', lighter: '#334155', bg: '#1e293b',
  brand: '#818cf8', brandDark: '#6366f1',
  green: '#4ade80', red: '#f87171', amber: '#fbbf24', sky: '#38bdf8', violet: '#a78bfa', slate: '#94a3b8',
};

// Cover page palette — dark navy with bright accent colours.
const TC = {
  yellow: '#f6c500', yellowDeep: '#e0a800',
  ink: '#f8fafc', sub: '#cbd5e1', muted: '#94a3b8',
  line: '#334155', panel: '#1e293b',
  red: '#f87171', bg: PAGE_BG,
};

const S = StyleSheet.create({
  page: { fontSize: 9, color: C.ink, backgroundColor: PAGE_BG, paddingTop: 26, paddingBottom: 34, paddingLeft: 40, paddingRight: 40 },
  // Cover page uses a flush layout so the accent rule sits at the very
  // top edge; the cover renders its own internal header/footer, so no padding
  // and no running PageFooter are applied.
  coverPage: { fontSize: 9, color: C.ink, backgroundColor: PAGE_BG, paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  brandBar: { height: 4, backgroundColor: C.brand, marginBottom: 12, borderRadius: 2 },
  // Running letterhead at the top of every content page (below the brand rule).
  contentHeader: { marginBottom: 10 },
  confidentialTag: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, backgroundColor: C.red },
  title: { fontSize: 18, fontWeight: 700, color: C.ink },
  subtitle: { fontSize: 10, color: C.muted, marginTop: 2 },
  sectionDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 4 },
  sectionNumber: { width: 26, height: 26, borderRadius: 6, backgroundColor: C.brand, color: '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center', paddingTop: 6, marginRight: 10 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: C.ink },
  sectionRule: { flex: 1, height: 2, backgroundColor: C.line, marginLeft: 14 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  kpiTile: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 8, backgroundColor: CARD_BG },
  kpiLabel: { fontSize: 7.5, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  kpiValue: { fontSize: 17, fontWeight: 800, color: C.ink },
  kpiSub: { fontSize: 7.5, color: C.faint, marginTop: 1 },
  block: { marginBottom: 12 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: CARD_BG, padding: 10 },
  cardTitle: { fontSize: 10.5, fontWeight: 700, color: C.ink, marginBottom: 8 },
  // Row holding two chart cards side-by-side (each child flexes to half width).
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  // Row holding four chart cards side-by-side (each child flexes to quarter width).
  row4: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, marginBottom: 12 },
  chartHalf: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: CARD_BG, padding: 10 },
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

// A donut chart with a percentage legend beside it. The whole card is hidden
// when the dataset is empty (no empty placeholder is shown in the PDF).
function DonutBlock({ title, data, colors, width = 130, height = 130, desc, half }) {
  if (!data || data.length === 0) return null;
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      <View style={{ alignItems: 'center' }}>
        <VDonut data={data} width={width} height={height} colors={colors} />
        {/* Legend below the chart (per request): donut content, then legend. */}
        <View style={{ marginTop: 8, width: '100%' }}>
          <VLegendRow data={data} colors={colors} />
        </View>
      </View>
      {desc ? <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 4 }}>{desc}</Text> : null}
    </View>
  );
}

// Donut rendered side-by-side with its legend (donut left, legend right),
// mirroring the live SentinelOne "ImprovedDonut" look where every slice shows
// its name + count + percentage. Used by the Agent Overview section so the 7
// agent donuts read clearly instead of a tiny chart with a stacked legend.
// Hidden entirely when there is no data.
function DonutSide({ title, data, colors, donutSize = 110, maxLegend = 7, desc, half }) {
  if (!data || data.length === 0) return null;
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  const total = data.reduce((s, d) => s + (d.value || 0), 0) || 1;
  const items = data.slice(0, maxLegend);
  const colorOf = (d, i) => (colors && colors[i]) || d.fill || '#3b82f6';
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <VDonut data={data} width={donutSize} height={donutSize} colors={colors} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {items.map((d, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: colorOf(d, i), marginRight: 5 }} />
              <Text style={{ fontSize: 7.5, color: '#6b7280', flex: 1, minWidth: 0 }} wrap={false}>
                {String(d.name).slice(0, 28)}
              </Text>
              <Text style={{ fontSize: 7.5, color: '#374151', fontWeight: 'bold', marginLeft: 4 }} wrap={false}>
                {d.value} ({Math.round((d.value / total) * 100)}%)
              </Text>
            </View>
          ))}
          {data.length > items.length && (
            <Text style={{ fontSize: 7, color: '#9ca3af' }}>+{data.length - items.length} more</Text>
          )}
        </View>
      </View>
      {desc ? <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 4 }}>{desc}</Text> : null}
    </View>
  );
}

// Horizontal ranked bars. Used wherever the old template had a two-column table.
// Hidden entirely when there is no data.
function HBarBlock({ title, data, color = C.brand, width = 320, maxItems = 10, desc, half }) {
  if (!data || data.length === 0) return null;
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      <VHBarList data={data} width={width} maxItems={maxItems} color={color} />
      {desc ? <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 4 }}>{desc}</Text> : null}
    </View>
  );
}

// Vertical bar chart block (used for aging / volume distributions).
// Hidden entirely when there is no data.
function BarBlock({ title, data, color = C.brand, width = 320, height = 160, desc, half }) {
  if (!data || data.length === 0) return null;
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      <VBarChart data={data} width={width} height={height} color={color} />
      {desc ? <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 4 }}>{desc}</Text> : null}
    </View>
  );
}

// Line chart block (used for the Checkpoint cumulative-events-over-time trend).
// Hidden entirely when there is no data.
function LineBlock({ title, data, color = C.brand, width = 320, height = 160, labelKey = 'date', valueKey = 'value', desc, half }) {
  if (!data || data.length === 0) return null;
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      <VLineChart data={data} width={width} height={height} stroke={color} labelKey={labelKey} valueKey={valueKey} />
      {desc ? <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 4 }}>{desc}</Text> : null}
    </View>
  );
}

// Radar / spider block (multivariate posture view).
// Hidden entirely when fewer than 3 axes are available.
function RadarBlock({ title, axes, color = C.brand, size = 210, desc, half }) {
  if (!axes || axes.length < 3) return null;
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      <View style={{ alignItems: 'center' }}>
        <VRadar axes={axes} size={size} color={color} />
      </View>
      {desc ? <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 4 }}>{desc}</Text> : null}
    </View>
  );
}

// Stacked composition-bar block (part-to-whole mix of one measure).
// Hidden entirely when there are no segments.
function StackedBlock({ title, segments, width = 320, desc, half }) {
  if (!segments || segments.length === 0) return null;
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      <VStackedBar segments={segments} width={width} />
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

// Slim running header on every content page: brand rule, org name, the current
// section label, and a confidential tag. Gives the document a consistent,
// professional letterhead instead of starting each page straight into content.
export function ContentHeader({ orgName, sectionLabel }) {
  return (
    <View style={S.contentHeader} fixed wrap={false}>
      <View style={S.brandBar} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 9, fontWeight: 700, color: C.ink }}>{orgName}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {sectionLabel ? <Text style={{ fontSize: 7.5, color: C.muted, marginRight: 10 }}>{sectionLabel}</Text> : null}
          <View style={S.confidentialTag}>
            <Text style={{ fontSize: 6.5, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>CONFIDENTIAL</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// Build a colour array for datasets that don't already carry a `fill`.
const palette = (data) => (data || []).map((_, i) => COLORS[i % COLORS.length]);

// Format an ISO date string as "20 August 2026".
const fmtDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso || '');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

// ── Cover ─────────────────────────────────────────────────────────────────────
// Recreated from the Techsec Global reference title page (white, yellow accent):
// a confidential classification badge, the assessor/company header, a
// "Security Assessment Report" title, an Assessment Details table, a
// classification caveat, and a footer. The client name is dynamic (orgName).
function CoverPage({ orgName, generatedAt }) {
  const date = fmtDate(generatedAt);

  // Section index entries for the report index panel.
  const INDEX_ENTRIES = [
    { num: '1',  label: 'Executive Summary',            sub: 'Security posture overview',            color: '#818cf8' },
    { num: '2',  label: 'Checkpoint Harmony',           sub: 'Email & cloud security',              color: '#818cf8' },
    { num: '3.1',label: 'SentinelOne — Threats',        sub: 'Threat analytics & detection',        color: '#f87171' },
    { num: '3.2',label: 'SentinelOne — Agents',         sub: 'Agent health & OS distribution',      color: '#f87171' },
    { num: '3.3',label: 'Most At-Risk Entities',        sub: 'Highest-risk devices & users',        color: '#f87171' },
    { num: '3.4',label: 'Application CVEs',             sub: 'Known vulnerabilities',                color: '#a78bfa' },
    { num: '3.5',label: 'Application Insights',         sub: 'Installed software analysis',         color: '#38bdf8' },
    { num: '4',  label: 'Zoho Desk',                    sub: 'Support ticket analytics',            color: '#4ade80' },
    { num: '5',  label: 'Palo Alto Firewall',           sub: 'Network security events',             color: '#fbbf24' },
    { num: '6',  label: 'Weekly Insights',              sub: '7-day period comparison',             color: '#a78bfa' },
  ];

  return (
    <View style={{ backgroundColor: PAGE_BG, flex: 1, fontSize: 9, padding: 40 }}>
      {/* ── Top accent rule ── */}
      <View style={{ height: 6, backgroundColor: '#f6c500', borderRadius: 3, marginBottom: 32 }} />

      {/* ── Org name centered ── */}
      <View style={{ alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: 800, color: TC.ink, textAlign: 'center' }}>{orgName || 'Organisation'}</Text>
      </View>

      {/* ── Date badge centered ── */}
      <View style={{ alignItems: 'center', marginBottom: 36 }}>
        <View style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#475569', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 18 }}>
          <Text style={{ fontSize: 10, fontWeight: 600, color: '#e2e8f0', letterSpacing: 0.5 }}>{date}</Text>
        </View>
      </View>

      {/* ── Report Index panel ── */}
      <View style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 24, flex: 1 }}>
        {/* Index header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <View style={{ width: 4, height: 20, backgroundColor: '#f6c500', borderRadius: 2, marginRight: 10 }} />
          <Text style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', letterSpacing: 2, textTransform: 'uppercase' }}>Report Index</Text>
        </View>

        {/* Index rows */}
        {INDEX_ENTRIES.map((e, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#334155' }}>
            {/* Number badge */}
            <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: e.color, justifyContent: 'center', alignItems: 'center', marginRight: 14 }}>
              <Text style={{ fontSize: 9, fontWeight: 800, color: '#ffffff' }}>{e.num}</Text>
            </View>
            {/* Label + subtitle */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{e.label}</Text>
              <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 2 }}>{e.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── Bottom classification ── */}
      <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ backgroundColor: TC.red, borderRadius: 4, paddingVertical: 2, paddingHorizontal: 8, marginRight: 10 }}>
            <Text style={{ fontSize: 7.5, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>CONFIDENTIAL</Text>
          </View>
          <Text style={{ fontSize: 8, color: '#64748b' }}>CISO Security Report</Text>
        </View>
        <Text style={{ fontSize: 8, color: '#64748b' }}>{orgName}</Text>
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
        {/* <KpiTile label="Security Score" value={`${risk.securityScore}/100`} sub={scoreStatus.label} color={scoreStatus.color} /> */}
        <KpiTile label="Threats Detected" value={formatNumber(threats.length)} color={C.red} />
        <KpiTile label="Mitigated" value={formatNumber(mitigated)} color={C.green} />
        <KpiTile label="Known CVEs" value={formatNumber(cve.totalCves)} color={C.amber} />
        <KpiTile label="Open Tickets" value={formatNumber(tickets.filter(t => t.status === 'Open').length)} color={C.sky} />
        <KpiTile label="Email Events" value={formatNumber(events.length)} color={C.violet} />
      </View>

      <MttrGaugeCard cfgKey="overall" mttr={d.mttr} />

      {/* Posture radar (multivariate overview) + score meters (severity mix). */}
      <View style={S.row2}>
        <RadarBlock
          title="Security Posture Radar"
          color={C.brand}
          size={210}
          half
          axes={[
            { label: 'Threats', value: Math.min(threats.length * 4, 100) },
            { label: 'Mitigation', value: threats.length ? Math.round(mitigated / threats.length * 100) : 0 },
            { label: 'CVEs', value: Math.min(cve.totalCves * 3, 100) },
            { label: 'Tickets', value: Math.min(tickets.length * 3, 100) },
            { label: 'Email', value: Math.min(events.length * 5, 100) },
            { label: 'Firewall', value: Math.min((risk.highRiskEvents + risk.blockedConnections) * 2, 100) },
          ]}
        />
        <View style={S.chartHalf} wrap={false}>
          <Text style={S.chartHalfTitle}>Risk & Exposure Meters</Text>
          <View style={{ marginTop: 4 }}>
            <VScoreBar label="Mitigation Coverage" value={threats.length ? Math.round(mitigated / threats.length * 100) : 0} color={C.green} width={300} />
            <VScoreBar label="Critical CVE Share" value={cve.totalCves ? Math.round((cve.severityMap.CRITICAL / cve.totalCves) * 100) : 0} color={C.red} width={300} sub={`${cve.severityMap.CRITICAL} of ${cve.totalCves} rated CRITICAL`} />
            <VScoreBar label="Open Ticket Ratio" value={tickets.length ? Math.round((tickets.filter(t => t.status === 'Open').length / tickets.length) * 100) : 0} color={C.sky} width={300} />
            <VScoreBar label="Firewall High-Risk Load" value={Math.min((risk.highRiskEvents + risk.blockedConnections) * 2, 100)} color={C.amber} width={300} />
          </View>
        </View>
      </View>

      <View style={S.row2}>
        <View style={S.chartHalf} wrap={false}>
          <Text style={S.chartHalfTitle}>Key Findings</Text>
          <BulletList items={findings} />
        </View>
        <View style={S.chartHalf} wrap={false}>
          <Text style={S.chartHalfTitle}>Recommended Focus</Text>
          <BulletList items={[
            `Remediate the ${cve.severityMap.CRITICAL} critical-rated application vulnerabilities without delay.`,
            `Investigate the ${unresolved} unresolved threats and complete pending mitigation actions.`,
            tickets.filter(t => t.status === 'Open').length > 0 ? `Clear the currently open helpdesk backlog (${tickets.filter(t => t.status === 'Open').length} tickets).` : 'Maintain the current ticket state — no open backlog at period end.',
            `Review firewall high-risk events and suspicious sources to confirm nothing was missed.`,
          ]} />
        </View>
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

function CheckpointSection({ events, weekly, mttr }) {
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
function ThreatAnalytics({ threats, mttr }) {
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
          <HBarBlock title="MITRE ATTACK Tactics" data={t.tacticData.slice(0, 12)} color={C.slate} width={220} half />
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

      {/* Classification mix as a single part-to-whole composition bar. */}
      <StackedBlock
        title="Threat Classification Mix"
        width={680}
        segments={(t.classData || []).map((d, i) => ({ label: d.name, value: d.value, fill: COLORS[i % COLORS.length] }))}
        desc="Share of each threat classification across the full endpoint fleet"
      />
    </View>
  );
}

// ── SentinelOne Agent Analytics ───────────────────────────────────────────────
function AgentAnalytics({ agents, generatedAt, removed }) {
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
        <DonutSide title="Operating System Distribution" data={a.osDistribution} colors={a.osDistribution.map(d => d.fill)} donutSize={110} half />
        <DonutSide title="Active Status" data={a.activeStatusDistribution} colors={a.activeStatusDistribution.map(d => d.fill)} donutSize={110} half />
        <DonutSide title="Firewall Status" data={a.firewallStatusDistribution} colors={a.firewallStatusDistribution.map(d => d.fill)} donutSize={110} half />
      </View>

      <View style={S.row4}>
        <DonutSide title="Agent Version" data={a.agentVersionStatus} colors={a.agentVersionStatus.map(d => d.fill)} donutSize={92} half />
        <DonutSide title="Site Distribution" data={a.siteDistribution} colors={a.siteDistribution.map(d => d.fill)} donutSize={92} half />
        <DonutSide title="Network Status" data={a.networkStatusDistribution} colors={a.networkStatusDistribution.map(d => d.fill)} donutSize={92} half />
        <DonutSide title="Scan Status" data={a.scanStatusDistribution} colors={a.scanStatusDistribution.map(d => d.fill)} donutSize={92} half />
      </View>

      <View style={S.row2}>
        <HBarBlock title="Machine Types" data={a.machineTypeData} color={C.sky} half />
        <RadarBlock
          title="Agent Health Radar"
          color="#0ea5e9"
          size={200}
          half
          axes={[
            { label: 'Health', value: a.kpis.health || 0 },
            { label: 'Connectivity', value: a.total ? Math.round(a.connected / a.total * 100) : 0 },
            { label: 'Threat-Free', value: a.kpis.total ? Math.round((a.kpis.total - a.kpis.threats) / a.kpis.total * 100) : 0 },
            { label: 'Up-to-date', value: a.kpis.total ? Math.round((a.kpis.total - a.kpis.outdated) / a.kpis.total * 100) : 0 },
            { label: 'Active', value: a.kpis.total ? Math.round(a.kpis.active / a.kpis.total * 100) : 0 },
            { label: 'New (30d)', value: Math.min(a.newAgents * 5, 100) },
          ]}
        />
      </View>

      <View style={S.block}>
        <StackedBlock
          title="Agent Status Composition"
          width={680}
          segments={[
            { label: 'Active', value: a.kpis.active, fill: '#10b981' },
            { label: 'Inactive', value: a.kpis.inactive, fill: '#ef4444' },
            { label: 'Threats', value: a.kpis.threats, fill: '#f59e0b' },
            { label: 'Outdated', value: a.kpis.outdated, fill: '#8b5cf6' },
          ]}
        />
      </View>

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
function CveSection({ cves }) {
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
        {/* <KpiTile label="Critical" value={formatNumber(d.severityMap.CRITICAL)} color={C.red} /> */}
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
function ZohoSection({ tickets, mttr }) {
  const z = buildZohoSummary(tickets);
  const counts = buildZohoTicketCounts(tickets);
  const funnel = buildZohoFunnel(tickets);
  const heatmap = buildZohoHeatmap(tickets);
  const volcano = buildZohoVolcano(tickets);
  const topPerf = buildZohoTopPerformance(tickets);
  const mttrCard = buildZohoMttr(tickets);
  const corp = buildZohoCorpMembers(tickets);
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

      {/* Ticket Status Funnel — hidden entirely when there are no tickets. */}
      {tickets.length > 0 ? (
        <View style={S.block}>
          <Text style={S.chartHalfTitle}>Ticket Status Funnel</Text>
          <VFunnel stages={funnel.stages} counts={funnel.counts} max={funnel.max} colors={funnel.colors} />
        </View>
      ) : null}

      {/* Corporation Assignee Distribution (circle pack) */}
      {/* <View style={S.block}>
        <Text style={S.chartHalfTitle}>Corporation Assignee Distribution</Text>
        <VCorpMember corps={corp.corps} size={220} />
      </View> */}

      {/* Ticket Creation Heatmap + Hour-bucket resolution graph */}
      <View style={S.row2}>
        {tickets.length > 0 ? (
          <View style={S.chartHalf}>
            <Text style={S.chartHalfTitle}>Ticket Creation Heatmap</Text>
            <VHeatmap matrix={heatmap.matrix} max={heatmap.max} dayNames={heatmap.DAY_NAMES} />
          </View>
        ) : null}
        {volcano.total > 0 ? (
          <View style={S.chartHalf}>
            <Text style={S.chartHalfTitle}>Ticket Hour Bucket Graph</Text>
            <View style={{ alignItems: 'center', marginTop: 6 }}>
              <VVolcano buckets={volcano.buckets} max={volcano.max} height={160} width={300} />
              <Text style={{ fontSize: 7.5, color: C.faint, marginTop: 2 }}>{volcano.total} tickets resolved</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={S.row2}>
        <HBarBlock title="Resolution Time Aging" data={z.agingData} color={C.amber} half />
        {z.engineerPerformance.length > 0 ? (
          <HBarBlock title="Engineer Performance (tickets closed)" data={z.engineerPerformance.map(e => ({ name: e.engineer, value: e.closed }))} color={C.brand} half />
        ) : <View style={S.chartHalf} />}
      </View>

      <View style={S.row2}>
        <HBarBlock title="Tickets by Department" data={z.departmentData} color={C.violet} half />
        {/* Top Lowest 5 Performance — hidden when no engineer performance data. */}
        {topPerf.rows.length > 0 ? (
          <View style={S.chartHalf}>
            <Text style={S.chartHalfTitle}>Top Lowest 5 Performance</Text>
            <Text style={{ fontSize: 7, color: C.faint, marginBottom: 4 }}>Engineer-wise total time from created to closed</Text>
            <VTopTable rows={topPerf.rows} headers={['Engineer Name', 'Closed', 'Score', 'Hours']} />
          </View>
        ) : null}
      </View>

      <View style={S.row2}>
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
// Local re-derivation of "Top Denied Destinations".
//
// buildFirewallSummary() (in dataUtils.js) calls makeTopChartData() with a
// value-column list that is missing `nbytes`/`bytes`. The firewall's
// top-denied-destinations report stores its per-destination volume in those
// columns, so the summary came back EMPTY even though the live dashboard (which
// uses the fuller column list) shows the data. We recompute here from the raw
// `deniedDestTable.rows` that buildFirewallSummary already exposes, using the
// SAME value columns the dashboard's makeTopChartData uses, and only fall back
// to the (possibly empty) summary value when this produces nothing.
function buildDeniedDest(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const valCols = ['count', 'nrepeat', 'nsess', 'sessions', 'threats', 'nbytes', 'bytes'];
  const map = new Map();
  rows.forEach((row) => {
    const name = String(row?.dst ?? row?.destination ?? row?.destination_ip ?? row?.name ?? '').trim();
    if (!name || name === '-') return;
    const raw = valCols.map((c) => row?.[c]).find((v) => v !== undefined && v !== null && v !== '');
    const n = raw !== undefined ? (Number(String(raw).replace(/[^\d.-]/g, '')) || 1) : 1;
    map.set(name, (map.get(name) || 0) + (n > 0 ? n : 1));
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name: name.length > 30 ? name.slice(0, 30) + '…' : name, value }));
}

function FirewallSection({ fw }) {
  const f = fw;
  const scoreStatus = getSecurityScoreStatus(f.securityScore);
  // Risk Distribution donut uses the same severity palette as the dashboard
  // (RISK_COLORS keyed by risk level 5→1, plus '-' for unknown).
  const riskDist = (f.riskDistribution || []).map(d => ({ ...d, fill: RISK_COLORS[String(d.risk)] || '#94a3b8' }));
  // Prefer the freshly-derived chart; fall back to the summary value.
  const deniedDest = (f.topDeniedDestinations && f.topDeniedDestinations.length > 0)
    ? f.topDeniedDestinations
    : buildDeniedDest(f.deniedDestTable?.rows);
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
        {f.riskTrend.length > 0 ? (
          <View style={S.chartHalf} wrap={false}>
            <Text style={S.chartHalfTitle}>Risk / Session Trend</Text>
            <VLineChart data={f.riskTrend} width={320} height={150} labelKey="date" valueKey="sessions" stroke={C.red} />
          </View>
        ) : null}
      </View>

      <View style={S.row2}>
        <HBarBlock title="Top Attacks" data={f.topAttacks} color={C.red} half />
        <HBarBlock title="Top Attacker Sources" data={f.topAttackers} color={C.sky} half />
      </View>

      <View style={S.row2}>
        <HBarBlock title="Top Denied Destinations" data={deniedDest} color="#ef4444" half />
        <HBarBlock title="Top Connections" data={f.topConnections} color="#10b981" half />
      </View>
    </View>
  );
}

// ── Weekly Insights ───────────────────────────────────────────────────────────
function WeeklyInsights({ weekly }) {
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

// ── Section divider (cover) page ──────────────────────────────────────────────
// A full-page divider that introduces each major section with a large section
// number, title, subtitle, org name, and date. Rendered as a flush page (no
// content-header or page-footer) in the section's accent colour.
function SectionCoverPage({ number, title, subtitle, color, orgName, generatedAt }) {
  const date = fmtDate(generatedAt);
  const secCount = 10; // total sections (1 + 2 + 5 S1 subs + 4 + 5 + 6 = 10 divider pages)
  return (
    <View style={{ backgroundColor: PAGE_BG, flex: 1, fontSize: 9, padding: 40 }}>
      {/* Top accent rule in the section colour */}
      <View style={{ height: 6, backgroundColor: color, borderRadius: 3, marginBottom: 24 }} />

      {/* Org name + confidential tag */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <Text style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0' }}>{orgName}</Text>
        <View style={[S.badge, { backgroundColor: '#dc2626', color: '#fff', fontSize: 7, paddingVertical: 2, paddingHorizontal: 6 }]}>
          <Text>CONFIDENTIAL</Text>
        </View>
      </View>

      {/* Section number — large, in accent colour */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: color, justifyContent: 'center', alignItems: 'center', marginRight: 20 }}>
          <Text style={{ fontSize: 28, fontWeight: 800, color: '#ffffff' }}>{number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc' }}>{title}</Text>
          {subtitle ? <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{subtitle}</Text> : null}
        </View>
      </View>

      {/* Thin rule */}
      <View style={{ height: 2, backgroundColor: color, width: 80, borderRadius: 1, marginBottom: 20 }} />

      {/* Meta row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 9, color: '#64748b' }}>CISO Security Report · {orgName}</Text>
        <Text style={{ fontSize: 9, color: '#64748b' }}>{date} · Section {number}</Text>
      </View>

      <View style={{ flex: 1 }} />

      {/* Bottom rule + page label */}
      <View style={{ height: 1, backgroundColor: '#334155', marginBottom: 8 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 7.5, color: '#475569' }}>CISO Security Report · {orgName}</Text>
        <Text style={{ fontSize: 7.5, color: '#475569' }}>{date}</Text>
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
      {/* ── Front cover ── */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <CoverPage orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>

      {/* ── Section 1: Executive Summary ── */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <SectionCoverPage number="1" title="Executive Summary" subtitle="Strategic overview of the organisation's security posture for the reporting period" color="#4f46e5" orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>
      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="1" />
        <ContentHeader orgName={data.orgName} sectionLabel="1 · Executive Summary" />
        <ExecutiveSummary d={data} weekly={weekly} />
      </Page>

      {/* ── Section 2: Checkpoint Harmony ── */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <SectionCoverPage number="2" title="Checkpoint Harmony" subtitle="Email & cloud security events, severity analysis, and remediation tracking" color="#8b5cf6" orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>
      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="2" />
        <ContentHeader orgName={data.orgName} sectionLabel="2 · Checkpoint Harmony" />
        <CheckpointSection events={data.harmonyEvents} weekly={weekly} mttr={data.mttr} />
      </Page>

      {/* ── Section 3.1: SentinelOne Threats ── */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <SectionCoverPage number="3.1" title="SentinelOne — Threat Analytics" subtitle="Threat detection, classification, mitigation status, and attack surface analysis" color="#dc2626" orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>
      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="3.1" />
        <ContentHeader orgName={data.orgName} sectionLabel="3.1 · SentinelOne Threats" />
        <ThreatAnalytics threats={data.s1Threats} mttr={data.mttr} />
      </Page>

      {/* ── Section 3.2: SentinelOne Agents ── */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <SectionCoverPage number="3.2" title="SentinelOne — Agent Analytics" subtitle="Agent health, connectivity, OS distribution, and version management" color="#0ea5e9" orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>
      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="3.2" />
        <ContentHeader orgName={data.orgName} sectionLabel="3.2 · SentinelOne Agents" />
        <AgentAnalytics agents={data.s1Agents} generatedAt={data.generatedAt} removed={data.removedAgentsCount} />
      </Page>

      {/* ── Section 3.3: Most At-Risk ── */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <SectionCoverPage number="3.3" title="Most At-Risk Entities" subtitle="Highest-risk devices, users, and groups across the endpoint fleet" color="#d97706" orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>
      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="3.3" />
        <ContentHeader orgName={data.orgName} sectionLabel="3.3 · Most At-Risk" />
        <AtRiskSection threats={data.s1Threats} />
      </Page>

      {/* ── Section 3.4: Application CVEs ── */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <SectionCoverPage number="3.4" title="Application CVEs" subtitle="Known vulnerabilities across applications, severity distribution, and aging" color="#7c3aed" orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>
      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="3.4" />
        <ContentHeader orgName={data.orgName} sectionLabel="3.4 · Application CVEs" />
        <CveSection cves={data.s1Cves} />
      </Page>

      {/* ── Section 3.5: Application Insights ── */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <SectionCoverPage number="3.5" title="Application Insights" subtitle="Application inventory, OS breakdown, and installed software analysis" color="#0ea5e9" orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>
      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="3.5" />
        <ContentHeader orgName={data.orgName} sectionLabel="3.5 · Application Insights" />
        <AppInsightsSection apps={data.s1AppAgent} />
      </Page>

      {/* ── Section 4: Zoho Desk ── */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <SectionCoverPage number="4" title="Zoho Desk" subtitle="Support ticket analytics, resolution times, engineer performance, and MTTR" color="#d97706" orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>
      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="4" />
        <ContentHeader orgName={data.orgName} sectionLabel="4 · Zoho Desk" />
        <ZohoSection tickets={data.zohoTickets} mttr={data.mttr} />
      </Page>

      {/* ── Section 5: Palo Alto Firewall ── */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <SectionCoverPage number="5" title="Palo Alto Firewall" subtitle="Network sessions, high-risk events, attack sources, and firewall posture" color="#ea580c" orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>
      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="5" />
        <ContentHeader orgName={data.orgName} sectionLabel="5 · Palo Alto Firewall" />
        <FirewallSection fw={fw} />
      </Page>

      {/* ── Section 6: Weekly Insights ── */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <SectionCoverPage number="6" title="Weekly Insights" subtitle="7-day period comparison — threats, events, remediation rates, and new agents" color="#7c3aed" orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>
      <Page size="A3" orientation="landscape" style={S.page} wrap>
        <PageFooter orgName={data.orgName} generatedAt={data.generatedAt} sectionNumber="6" />
        <ContentHeader orgName={data.orgName} sectionLabel="6 · Weekly Insights" />
        <WeeklyInsights weekly={weekly} d={data} />
      </Page>
    </Document>
  );
}
