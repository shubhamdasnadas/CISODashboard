import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { VDonut, VBarChart, VHBarList, VLineChart, VLegendRow, VStackedBar, VScoreBar, ZohoCountCards } from './pdfChartComponents';
import { buildFirewallSummary, buildCveData, formatBytes } from './dataUtils';

// ── Theme (dark, matches existing ReportTemplate) ─────────────────────────────
const PAGE_BG = '#0f172a';
const CARD_BG = '#1e293b';
const C = {
  ink: '#f1f5f9', sub: '#cbd5e1', muted: '#94a3b8', faint: '#64748b',
  line: '#334155', bg: '#1e293b',
  brand: '#818cf8', green: '#4ade80', red: '#f87171', amber: '#fbbf24',
  sky: '#38bdf8', violet: '#a78bfa', slate: '#94a3b8',
};

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
const SEV_LABELS_FULL = ['Informational', 'Low', 'Medium', 'High', 'Critical'];
const SEV_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: { fontSize: 9, color: C.ink, backgroundColor: PAGE_BG, paddingTop: 26, paddingBottom: 34, paddingLeft: 40, paddingRight: 40 },
  coverPage: { fontSize: 9, color: C.ink, backgroundColor: PAGE_BG, padding: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  brandBar: { height: 4, backgroundColor: C.brand, marginBottom: 12, borderRadius: 2 },
  title: { fontSize: 18, fontWeight: 700, color: C.ink },
  subtitle: { fontSize: 10, color: C.muted, marginTop: 2 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  kpiTile: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 8, backgroundColor: CARD_BG },
  kpiLabel: { fontSize: 7.5, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  kpiValue: { fontSize: 17, fontWeight: 800, color: C.ink },
  kpiSub: { fontSize: 7.5, color: C.faint, marginTop: 1 },
  block: { marginBottom: 12 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: CARD_BG, padding: 10 },
  cardTitle: { fontSize: 10.5, fontWeight: 700, color: C.ink, marginBottom: 8 },
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  chartHalf: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: CARD_BG, padding: 10 },
  chartHalfTitle: { fontSize: 10.5, fontWeight: 700, color: C.ink, marginBottom: 8 },
  sectionDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 4 },
  sectionNumber: { width: 26, height: 26, borderRadius: 6, backgroundColor: C.brand, color: '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center', paddingTop: 6, marginRight: 10 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: C.ink },
  sectionRule: { flex: 1, height: 2, backgroundColor: C.line, marginLeft: 14 },
  footer: { position: 'absolute', bottom: 14, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, fontSize: 7.5, color: C.faint },
  badge: { padding: '2px 6px', borderRadius: 3, fontSize: 7, fontWeight: 700, color: '#fff' },
  lead: { fontSize: 10, color: C.sub, lineHeight: 1.55, marginBottom: 10 },
});

// ── Helper: numbers & labels ──────────────────────────────────────────────────
const fmtNum = (v) => Number(v || 0).toLocaleString('en-IN');
const truncateLabel = (label, maxLen = 20) => {
  if (!label || label === '-') return label;
  return String(label).length > maxLen ? String(label).slice(0, maxLen) + '...' : String(label);
};

// ── Data transformation helpers ───────────────────────────────────────────────
const bucket = (arr, keyFn, fallback = 'unknown') => {
  const counts = {};
  arr.forEach((item) => { const k = keyFn(item) || fallback; counts[k] = (counts[k] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
};

const topN = (arr, keyFn, n = 8) => {
  const c = {};
  arr.forEach((item) => { const k = keyFn(item); if (k) c[k] = (c[k] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, value]) => ({ name: truncateLabel(name), value }));
};

const parseDate = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };

const formatDuration = (minutes) => {
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) { const h = Math.floor(minutes / 60); const m = Math.round(minutes % 60); return m > 0 ? `${h}h ${m}m` : `${h}h`; }
  const d = Math.floor(minutes / 1440); const h = Math.round((minutes % 1440) / 60);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
};

const parseDuration = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) { const n = parseFloat(s); return isNaN(n) ? null : n; }
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/i);
  const m = s.match(/(\d+(?:\.\d+)?)\s*m/i);
  if (h || m) { let total = 0; if (h) total += parseFloat(h[1]) * 60; if (m) total += parseFloat(m[1]); return total; }
  const parts = s.split(':').map((p) => parseFloat(p));
  if (parts.length === 3 && parts.every((p) => !isNaN(p))) return parts[0] * 60 + parts[1] + parts[2] / 60;
  return null;
};

// ── Shared layout primitives ──────────────────────────────────────────────────
function SectionDivider({ number, title, color = C.brand }) {
  return (
    <View style={S.sectionDivider} wrap={false}>
      <View style={[S.sectionNumber, { backgroundColor: color }]}><Text>{number}</Text></View>
      <Text style={S.sectionTitle}>{title}</Text>
      <View style={S.sectionRule} />
    </View>
  );
}

function KpiTile({ label, value, sub, color = C.ink }) {
  return (
    <View style={S.kpiTile} wrap={false}>
      <Text style={S.kpiLabel}>{label}</Text>
      <Text style={[S.kpiValue, { color }]}>{value}</Text>
      {sub ? <Text style={S.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function KpiRow({ children }) {
  return <View style={S.kpiRow} wrap={false}>{children}</View>;
}

function ChartCard({ title, data, color = C.brand, type = 'donut', half = true, valueFmt, width }) {
  if (!data || data.length === 0) return null;
  const wrap = half ? S.chartHalf : S.block;
  const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
  return (
    <View style={wrap} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      {type === 'donut' && (
        <View style={{ alignItems: 'center' }}>
          <VDonut data={data} width={width || 130} height={width || 130} colors={data.map(d => d.fill)} />
        </View>
      )}
      {type === 'hbar' && <VHBarList data={data} width={width || 300} maxItems={8} color={color} valueFormat={valueFmt} />}
      {type === 'bar' && <VBarChart data={data} width={width || 300} height={160} color={color} />}
      {type === 'line' && <VLineChart data={data} width={width || 300} height={160} stroke={color} />}
      {type === 'stacked' && (
        <View style={{ gap: 6 }}>
          {SEV_COLORS.map((sevColor, si) => {
            const sevLabel = ['Info', 'Low', 'Med', 'High', 'Crit'][si];
            const segments = data.map((row) => ({ name: row.name, value: row[SEV_LABELS_FULL[si]] || 0, fill: sevColor }));
            return (
              <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 7, color: C.muted, width: 36 }}>{sevLabel}</Text>
                <VStackedBar segments={segments} width={width || 300} height={14} />
              </View>
            );
          })}
        </View>
      )}
      {type !== 'stacked' && (
        <View style={{ marginTop: 8, width: '100%' }}>
          <VLegendRow data={data} colors={data.map(d => d.fill)} />
        </View>
      )}
    </View>
  );
}

// ── Analytics Cover Page ──────────────────────────────────────────────────────
function AnalyticsCover({ orgName, generatedAt }) {
  const date = new Date(generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <View style={{ backgroundColor: PAGE_BG, flex: 1, fontSize: 9, padding: 40 }}>
      <View style={{ height: 6, backgroundColor: '#818cf8', borderRadius: 3, marginBottom: 32 }} />
      <View style={{ alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', textAlign: 'center' }}>{orgName || 'Organisation'}</Text>
      </View>
      <View style={{ alignItems: 'center', marginBottom: 36 }}>
        <View style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#475569', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 18 }}>
          <Text style={{ fontSize: 10, fontWeight: 600, color: '#e2e8f0', letterSpacing: 0.5 }}>{date}</Text>
        </View>
      </View>
      <View style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 24, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <View style={{ width: 4, height: 20, backgroundColor: '#818cf8', borderRadius: 2, marginRight: 10 }} />
          <Text style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', letterSpacing: 2, textTransform: 'uppercase' }}>Analytics Report</Text>
        </View>
        {[
          { num: '1', label: 'SentinelOne', sub: 'Endpoint protection, agents, CVEs, threats', color: '#10b981' },
          { num: '2', label: 'MDM / Hexnode', sub: 'Mobile device management', color: '#06b6d4' },
          { num: '3', label: 'NVD', sub: 'National Vulnerability Database', color: '#8b5cf6' },
          { num: '4', label: 'Checkpoint Harmony', sub: 'Email & cloud security', color: '#6366f1' },
          { num: '5', label: 'Palo Alto Firewall', sub: 'Network security events', color: '#f59e0b' },
          { num: '6', label: 'Zoho Desk', sub: 'Support ticket analytics', color: '#3b82f6' },
          { num: '7', label: 'Microsoft 365', sub: 'Cloud identity & security', color: '#3b82f6' },
        ].map((e, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#334155' }}>
            <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: e.color, justifyContent: 'center', alignItems: 'center', marginRight: 14 }}>
              <Text style={{ fontSize: 9, fontWeight: 800, color: '#ffffff' }}>{e.num}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{e.label}</Text>
              <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 2 }}>{e.sub}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#dc2626', borderRadius: 4, paddingVertical: 2, paddingHorizontal: 8, marginRight: 10 }}>
            <Text style={{ fontSize: 7.5, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>CONFIDENTIAL</Text>
          </View>
          <Text style={{ fontSize: 8, color: '#64748b' }}>CISO Analytics Report</Text>
        </View>
        <Text style={{ fontSize: 8, color: '#64748b' }}>{orgName}</Text>
      </View>
    </View>
  );
}

// ── 1. SentinelOne Section ────────────────────────────────────────────────────
// ── 1.1 SentinelOne — Agent Analytics ─────────────────────────────────────────
function S1AgentSection({ agents }) {
  const agentList = Array.isArray(agents) ? agents : [];
  const kpis = {
    total: agentList.length,
    active: agentList.filter(a => a.isActive).length,
    inactive: agentList.length - agentList.filter(a => a.isActive).length,
    threats: agentList.filter(a => (a.activeThreats || 0) > 0).length,
    outdated: agentList.filter(a => !a.isUpToDate).length,
  };
  kpis.health = kpis.total ? Math.round((kpis.active / kpis.total) * 100) : 0;

  const osDist = bucket(agentList, a => a.osName || 'Unknown');
  const activeStatus = [
    { name: 'Active', value: kpis.active, fill: '#10b981' },
    { name: 'Inactive', value: kpis.inactive, fill: '#ef4444' },
  ].filter(d => d.value > 0);
  const fwStatus = [
    { name: 'Enabled', value: agentList.filter(a => a.firewallEnabled).length, fill: '#3b82f6' },
    { name: 'Disabled', value: agentList.filter(a => !a.firewallEnabled).length, fill: '#f59e0b' },
  ].filter(d => d.value > 0);
  const versionStatus = [
    { name: 'Up to Date', value: agentList.filter(a => a.isUpToDate).length, fill: '#10b981' },
    { name: 'Outdated', value: agentList.filter(a => !a.isUpToDate).length, fill: '#f59e0b' },
  ].filter(d => d.value > 0);
  const siteDist = bucket(agentList, a => a.siteName || 'Unknown').slice(0, 8);
  const networkStatus = bucket(agentList, a => a.networkStatus || 'Unknown');
  const scanStatus = bucket(agentList, a => a.scanStatus || 'Unknown');

  return (
    <View>
      <SectionDivider number="1.1" title="SentinelOne - Agent Analytics" color="#10b981" />
      <Text style={S.lead}>
        {kpis.total} agents · {kpis.active} active ({kpis.health}% health) · {kpis.inactive} inactive · {kpis.threats} with active threats · {kpis.outdated} outdated.
      </Text>

      <KpiRow>
        <KpiTile label="Total Agents" value={kpis.total} color="#3b82f6" />
        <KpiTile label="Active" value={kpis.active} color="#10b981" sub={`${kpis.health}% health`} />
        <KpiTile label="Inactive" value={kpis.inactive} color="#ef4444" />
        <KpiTile label="Active Threats" value={kpis.threats} color="#f59e0b" />
        <KpiTile label="Outdated" value={kpis.outdated} color="#ef4444" />
      </KpiRow>

      <View style={S.row2}>
        <ChartCard title="OS Distribution" data={osDist} />
        <ChartCard title="Active Status" data={activeStatus} />
        <ChartCard title="Firewall Status" data={fwStatus} />
        <ChartCard title="Agent Version" data={versionStatus} />
      </View>
      <View style={S.row2}>
        <ChartCard title="Site Distribution" data={siteDist} />
        <ChartCard title="Network Status" data={networkStatus} />
        {scanStatus.length > 0 && <ChartCard title="Scan Status" data={scanStatus} />}
      </View>
    </View>
  );
}

// ── 1.2 SentinelOne — Application CVEs ────────────────────────────────────────
function S1CveSection({ cves }) {
  const cveList = Array.isArray(cves) ? cves : [];
  const cveData = buildCveData(cveList);

  // CVSS range buckets (mirrors the page's "CVSS Base Score Range" widget)
  const scoreRange = cveData.scoreRange.length
    ? cveData.scoreRange.map(x => ({ name: x.name, value: x.count, fill: x.fill }))
    : [];

  const endpointImpact = cveData.endpointImpact.length
    ? cveData.endpointImpact.slice(0, 6).map(x => ({ name: x.name, value: x.endpoints, fill: COLORS[1] }))
    : [];

  const vendorRisk = cveData.vendorRisk.length
    ? cveData.vendorRisk.slice(0, 6).map(x => ({ name: x.name, value: x.cves, fill: COLORS[3] }))
    : [];

  const agingData = cveData.cveAging.length
    ? cveData.cveAging.map(x => ({ name: x.name, value: x.count, fill: COLORS[2] }))
    : [];

  return (
    <View>
      <SectionDivider number="1.2" title="SentinelOne - Application CVEs" color="#7c3aed" />
      <Text style={S.lead}>
        {cveData.totalApplications} applications · {cveData.totalCves} CVEs · {cveData.totalEndpoints} endpoints affected · average CVSS {cveData.avgScore}.
      </Text>

      <KpiRow>
        <KpiTile label="Applications" value={cveData.totalApplications} color={C.violet} />
        <KpiTile label="Total CVEs" value={cveData.totalCves} color={C.brand} />
        <KpiTile label="Endpoints Affected" value={cveData.totalEndpoints} color="#3b82f6" />
        <KpiTile label="Avg Score" value={cveData.avgScore} color={C.slate} />
      </KpiRow>
      <KpiRow>
        <KpiTile label="Critical" value={cveData.severityMap.CRITICAL} color="#a855f7" />
        <KpiTile label="High" value={cveData.severityMap.HIGH} color="#ef4444" />
        <KpiTile label="Medium" value={cveData.severityMap.MEDIUM} color="#f59e0b" />
        <KpiTile label="Low" value={cveData.severityMap.LOW} color="#3b82f6" />
      </KpiRow>

      <View style={S.row2}>
        <ChartCard title="CVE Severity Distribution" data={cveData.severityDistribution} />
        <ChartCard title="CVSS Base Score Range" data={scoreRange} />
        <ChartCard title="Top Risky Applications" data={cveData.topRiskyApps.slice(0, 8).map(x => ({ name: x.name, value: x.cves, fill: COLORS[0] }))} type="hbar" color="#ef4444" />
      </View>
      <View style={S.row2}>
        <ChartCard title="CVE Aging" data={agingData} type="bar" color="#06b6d4" />
        <ChartCard title="Endpoint Impact" data={endpointImpact} type="hbar" color="#f59e0b" />
        <ChartCard title="Top Vendors by Risk" data={vendorRisk} type="hbar" color="#8b5cf6" />
      </View>
    </View>
  );
}

// ── 1.3 SentinelOne — Threat Analytics ────────────────────────────────────────
function S1ThreatSection({ threats }) {
  const threatList = Array.isArray(threats) ? threats : [];
  const threatTotal = threatList.length;
  const mitigated = threatList.filter(t => t.threatInfo?.mitigationStatus === 'mitigated').length;
  const unresolved = threatList.filter(t => ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus)).length;
  const fileless = threatList.filter(t => t.threatInfo?.isFileless).length;

  let mttdSum = 0, mttdCount = 0, mttmSum = 0, mttmCount = 0;
  threatList.forEach(t => {
    const created = parseDate(t.threatInfo?.createdAt);
    const identified = parseDate(t.threatInfo?.identifiedAt);
    if (created && identified) { mttdSum += (created - identified) / 60000; mttdCount++; }
    const successEntry = (t.mitigationStatus || []).find(s => s.status === 'success');
    if (successEntry && identified) {
      const ended = parseDate(successEntry.mitigationEndedAt);
      if (ended) { mttmSum += (ended - identified) / 60000; mttmCount++; }
    }
  });
  const avgMttd = mttdCount ? mttdSum / mttdCount : 0;
  const avgMttm = mttmCount ? mttmSum / mttmCount : 0;

  const threatTrend = (() => {
    const counts = {};
    threatList.forEach(t => {
      const d = parseDate(t.threatInfo?.createdAt);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-20).map(([date, count]) => ({ date, count }));
  })();

  const classData = bucket(threatList, t => t.threatInfo?.classification || 'Unknown');
  const filelessData = [
    { name: 'Fileless', value: fileless, fill: '#ef4444' },
    { name: 'File-based', value: threatList.length - fileless, fill: '#3b82f6' },
  ].filter(d => d.value > 0);
  const mitData = (() => {
    const counts = {};
    threatList.forEach(t => (t.mitigationStatus || []).forEach(s => { if (s.status) counts[s.status] = (counts[s.status] || 0) + 1; }));
    return Object.entries(counts).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
  })();
  const topEndpoints = topN(threatList, t => t.agentRealtimeInfo?.agentComputerName || t.agentDetectionInfo?.agentComputerName || '');
  const topUsers = topN(threatList, t => t.threatInfo?.initiatingUsername || t.threatInfo?.processUser || '');
  const threatsBySite = topN(threatList, t => t.agentRealtimeInfo?.siteName || t.siteName || t.agentDetectionInfo?.siteName || '');

  return (
    <View>
      <SectionDivider number="1.3" title="SentinelOne - Threat Analytics" color="#dc2626" />
      <Text style={S.lead}>
        {threatTotal} threats · {mitigated} mitigated · {unresolved} unresolved · {fileless} fileless · avg MTTD {formatDuration(avgMttd)} · avg MTTM {formatDuration(avgMttm)}.
      </Text>

      <KpiRow>
        <KpiTile label="Total Threats" value={threatTotal} color="#3b82f6" />
        <KpiTile label="Mitigated" value={mitigated} color="#10b981" sub={threatTotal ? `${Math.round((mitigated / threatTotal) * 100)}%` : ''} />
        <KpiTile label="Unresolved" value={unresolved} color="#ef4444" />
        <KpiTile label="Fileless" value={fileless} color="#f59e0b" />
        <KpiTile label="Avg MTTD" value={formatDuration(avgMttd)} color="#8b5cf6" />
        <KpiTile label="Avg MTTM" value={formatDuration(avgMttm)} color="#06b6d4" />
      </KpiRow>

      {threatTrend.length > 0 && (
        <View style={S.block} wrap={false}>
          <Text style={S.cardTitle}>Threat Trend Over Time</Text>
          <VLineChart data={threatTrend} width={680} height={140} stroke="#3b82f6" labelKey="date" valueKey="count" />
        </View>
      )}
      <View style={S.row2}>
        <ChartCard title="Classification" data={classData} />
        <ChartCard title="Fileless vs File-based" data={filelessData} />
        <ChartCard title="Mitigation Outcomes" data={mitData} />
      </View>
      <View style={S.row2}>
        <ChartCard title="Top Affected Endpoints" data={topEndpoints} type="hbar" color="#3b82f6" />
        <ChartCard title="Top Users by Threat" data={topUsers} type="hbar" color="#f59e0b" />
        <ChartCard title="Threats by Site" data={threatsBySite} type="hbar" color="#dc2626" />
      </View>
    </View>
  );
}

// ── 2. MDM / Hexnode ─────────────────────────────────────────────────────────
function MdmSection({ devices, apps }) {
  const devList = Array.isArray(devices) ? devices : [];
  const appList = Array.isArray(apps) ? apps : [];
  const staleCount = devList.filter(d => d.last_reported && (Date.now() - new Date(d.last_reported).getTime()) > 7 * 86400000).length;
  const nonCompliant = devList.filter(d => d.compliant !== true).length;
  const compliantCount = devList.filter(d => d.compliant === true).length;
  const osData = bucket(devList, d => d.os_name || d.os_type || d.platform || d.os || 'Unknown');
  const complianceData = devList.length === 0 ? [] : [
    { name: 'Compliant', value: compliantCount, fill: '#10b981' },
    { name: 'Non-compliant', value: nonCompliant, fill: '#ef4444' },
  ].filter(d => d.value > 0);
  const deviceType = bucket(devList, d => d.device_type || 'Unknown');
  const appPlatform = bucket(appList, a => a.platform || a.os_type || a.os_name || 'Unknown');

  return (
    <View>
      <SectionDivider number="2" title="MDM / Hexnode - Mobile Device Management" color="#06b6d4" />
      <Text style={S.lead}>{devList.length} devices, {appList.length} apps, {nonCompliant} non-compliant.</Text>
      <KpiRow>
        <KpiTile label="Enrolled Devices" value={devList.length} color="#3b82f6" />
        <KpiTile label="Applications" value={appList.length} color="#8b5cf6" />
        <KpiTile label="Non-compliant" value={nonCompliant} color="#ef4444" />
        <KpiTile label="Stale (>7d)" value={staleCount} color="#ef4444" />
      </KpiRow>
      <View style={S.row2}>
        <ChartCard title="Device OS / Platform" data={osData} />
        <ChartCard title="Compliance Status" data={complianceData} />
        <ChartCard title="Device Type" data={deviceType} />
        {appPlatform.length > 0 && <ChartCard title="App Platform" data={appPlatform} />}
      </View>
    </View>
  );
}

// ── 3. NVD ────────────────────────────────────────────────────────────────────
function NvdSection({ stats }) {
  const sevCount = (name) => ((stats?.severityCounts || []).find(s => s.severity === name))?.count ?? 0;
  const highRisk = sevCount('CRITICAL') + sevCount('HIGH');
  const highRiskPct = stats?.total ? Math.round((highRisk / stats.total) * 100) : 0;
  const severityData = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].filter(s => sevCount(s) > 0).map((s, i) => ({ name: s, value: sevCount(s), fill: ['#a855f7', '#ef4444', '#eab308', '#3b82f6'][i] }));
  const statusData = (stats?.statusCounts || []).filter(s => s.status).sort((a, b) => b.count - a.count).map((s, i) => ({ name: s.status, value: s.count, fill: COLORS[i % COLORS.length] }));

  return (
    <View>
      <SectionDivider number="3" title="NVD - National Vulnerability Database" color="#8b5cf6" />
      <Text style={S.lead}>{stats ? `${fmtNum(stats.total)} CVEs stored.` : 'No NVD data synced yet.'}</Text>
      <KpiRow>
        <KpiTile label="Total CVEs" value={stats ? fmtNum(stats.total) : '—'} color={C.brand} />
        <KpiTile label="CRITICAL" value={sevCount('CRITICAL')} color="#a855f7" />
        <KpiTile label="HIGH" value={sevCount('HIGH')} color="#ef4444" />
        <KpiTile label="MEDIUM" value={sevCount('MEDIUM')} color="#eab308" />
        <KpiTile label="LOW" value={sevCount('LOW')} color="#3b82f6" />
        <KpiTile label="Critical + High" value={highRisk} color="#ef4444" sub={`${highRiskPct}%`} />
      </KpiRow>
      <View style={S.row2}>
        <ChartCard title="CVEs by Severity" data={severityData} />
        <ChartCard title="CVEs by Status" data={statusData} type="hbar" color={C.brand} />
      </View>
    </View>
  );
}

// ── 4. Checkpoint Harmony ─────────────────────────────────────────────────────
function CheckpointSection({ events }) {
  const list = Array.isArray(events) ? events : [];
  const total = list.length;

  // ── KPI stats ─────────────────────────────────────────────────────────────
  const remediated = list.filter(e => ['remediated', 'closed', 'done'].includes(e.state)).length;
  const pending = list.filter(e => e.state === 'pending' || e.state === 'new').length;
  const detected = total - pending - remediated;
  const remediatedPct = total ? Math.round((remediated / total) * 100) : 0;
  const pendingPct = total ? Math.round((pending / total) * 100) : 0;
  const detectedPct = total ? Math.round((detected / total) * 100) : 0;
  const avgSevValid = list.filter(e => e.severity !== '' && e.severity != null && !isNaN(Number(e.severity)));
  const avgSev = avgSevValid.length ? (avgSevValid.reduce((s, e) => s + Number(e.severity), 0) / avgSevValid.length).toFixed(1) : '—';
  const criticalCount = list.filter(e => Number(e.severity) >= 4).length;

  // ── Severity donut ────────────────────────────────────────────────────────
  const severityData = (() => {
    const SEV_LBL = { 0: 'Informational', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' };
    const counts = {};
    list.forEach(e => { const s = e.severity ?? '?'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).sort(([a], [b]) => Number(a) - Number(b)).map(([sev, value]) => ({ name: SEV_LBL[sev] ?? `Sev ${sev}`, value, fill: SEV_COLORS[Number(sev) % 5] }));
  })();

  // ── State donut ───────────────────────────────────────────────────────────
  const stateData = (() => {
    const STATE_COLORS = { new: '#ef4444', pending: '#f97316', detected: '#f59e0b', remediated: '#22c55e', closed: '#3b82f6', done: '#10b981' };
    const counts = {};
    list.forEach(e => { const s = e.state ?? 'unknown'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: STATE_COLORS[name] ?? '#6366f1' }));
  })();

  // ── Confidence donut ──────────────────────────────────────────────────────
  const confidenceData = (() => {
    const CONF_COLORS = { malicious: '#ef4444', suspicious: '#f97316', detected: '#f59e0b', unknown: '#94a3b8' };
    const counts = {};
    list.forEach(e => { const c = (e.confidenceIndicator ?? 'unknown').toLowerCase(); counts[c] = (counts[c] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: CONF_COLORS[name] ?? '#6366f1' }));
  })();

  // ── Event Type donut ──────────────────────────────────────────────────────
  const eventTypes = bucket(list, e => e.type || 'Unknown');

  // ── SaaS / platform donut ─────────────────────────────────────────────────
  const saasData = (() => {
    const counts = {};
    list.forEach(e => { const p = e.platform || e.saas || 'Unknown'; counts[p] = (counts[p] || 0) + 1; });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([name, value], idx) => ({ name, value, fill: COLORS[idx % COLORS.length] }));
  })();

  // ── Top Sender Domains ────────────────────────────────────────────────────
  const topDomains = (() => {
    const counts = {};
    list.forEach(e => {
      if (!e.senderAddress) return;
      const parts = e.senderAddress.split('@');
      if (parts.length < 2) return;
      const domain = parts[parts.length - 1].toLowerCase();
      counts[domain] = (counts[domain] || 0) + 1;
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, value]) => ({ name, value }));
  })();

  // ── Daily trend (bar chart) ───────────────────────────────────────────────
  const dailyTrend = (() => {
    const counts = {};
    list.forEach(e => {
      const d = parseDate(e.eventCreated);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-25).map(([date, count]) => ({ name: date.slice(5), value: count }));
  })();

  // ── Event Type × Severity matrix ──────────────────────────────────────────
  const typeSevData = (() => {
    const types = [...new Set(list.map(e => e.type || 'unknown'))];
    return types.map(type => {
      const row = { name: type };
      ['4', '3', '2', '1', '0'].forEach(s => {
        row[SEV_LABELS_FULL[s]] = list.filter(e => (e.type || 'unknown') === type && String(e.severity) === s).length;
      });
      return row;
    });
  })();

  // ── Cumulative timeline ───────────────────────────────────────────────────
  const cumulativeTimeline = (() => {
    const counts = {};
    list.forEach(e => {
      const d = parseDate(e.eventCreated);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });
    let cumulative = 0;
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => { cumulative += count; return { name: date.slice(5), value: cumulative }; });
  })();

  // ── Remediation rate over time ────────────────────────────────────────────
  const remediationRateOverTime = (() => {
    const byDay = {};
    list.forEach(e => {
      const d = parseDate(e.eventCreated);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      if (!byDay[key]) byDay[key] = { total: 0, remediated: 0 };
      byDay[key].total++;
      if (['remediated', 'closed', 'done'].includes(e.state)) byDay[key].remediated++;
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { total: t, remediated: r }]) => ({ name: date.slice(5), value: t > 0 ? Math.round((r / t) * 100) : 0 }));
  })();

  return (
    <View>
      <SectionDivider number="4" title="Checkpoint Harmony - Email & Cloud Security" color="#6366f1" />
      <Text style={S.lead}>{total} events, {pending} pending, {remediated} resolved.</Text>

      {/* ── KPI row ────────────────────────────────────────────────────── */}
      <KpiRow>
        <KpiTile label="Total Events" value={fmtNum(total)} color="#3b82f6" />
        <KpiTile label="Remediated" value={`${fmtNum(remediated)}  (${remediatedPct}%)`} color="#10b981" />
        <KpiTile label="Pending" value={`${fmtNum(pending)}  (${pendingPct}%)`} color="#ef4444" />
        <KpiTile label="Avg Severity" value={avgSev} color="#f59e0b" sub="out of 5" />
        <KpiTile label="Critical Events" value={fmtNum(criticalCount)} color="#ef4444" sub="severity >= 4" />
        <KpiTile label="Detected" value={`${fmtNum(detected)}  (${detectedPct}%)`} color="#f97316" />
      </KpiRow>

      {/* ── Daily trend (full-width bar) ───────────────────────────────── */}
      {dailyTrend.length > 0 && (
        <ChartCard title="Security Events Over Time" data={dailyTrend} type="bar" color="#6366f1" half={false} />
      )}

      {/* ── Severity + Event Type donuts ───────────────────────────────── */}
      <View style={S.row2} wrap={false}>
        <ChartCard title="Severity Distribution" data={severityData} />
        <ChartCard title="Event Type" data={eventTypes} />
      </View>

      {/* ── Event State + Confidence donuts ────────────────────────────── */}
      <View style={S.row2} wrap={false}>
        <ChartCard title="Event State" data={stateData} />
        <ChartCard title="Confidence Indicator" data={confidenceData} />
      </View>

      {/* ── SaaS Platform + Top Sender Domains ─────────────────────────── */}
      <View style={S.row2} wrap={false}>
        {saasData.length > 0 && <ChartCard title="SaaS Platform Distribution" data={saasData} />}
        <ChartCard title="Top Sender Domains" data={topDomains} type="hbar" color="#6366f1" half />
      </View>

      {/* ── Event Type × Severity matrix ───────────────────────────────── */}
      {typeSevData.length > 0 && (
        <ChartCard title="Event Type × Severity" subtitle="severity mix within each event type" data={typeSevData} type="stacked" half={false} />
      )}

      {/* ── Cumulative + Remediation Rate lines ────────────────────────── */}
      <View style={S.row2} wrap={false}>
        <ChartCard title="Cumulative Events" subtitle="running total" data={cumulativeTimeline} type="line" color="#6366f1" half />
        <ChartCard title="Remediation Rate" subtitle="% remediated per day" data={remediationRateOverTime} type="line" color="#22c55e" half />
      </View>
    </View>
  );
}

// ── 5. Palo Alto Firewall ─────────────────────────────────────────────────────
function FirewallSection({ fwData }) {
  const fw = buildFirewallSummary(fwData);
  const riskDist = (fw.riskDistribution || []).map(d => ({ ...d, fill: { '5': '#ef4444', '4': '#f97316', '3': '#f59e0b', '2': '#84cc16', '1': '#22c55e' }[String(d.risk)] || '#94a3b8' }));

  // Risk trend: bars = traffic (bytes), line = sessions (mirrors the page's ComposedChart)
  const trendTraffic = (fw.riskTrend || []).map(r => ({ name: truncateLabel(r.name, 12), value: Number(r.traffic) || 0, fill: '#3b82f6' }));
  const trendSessions = (fw.riskTrend || []).map(r => ({ name: truncateLabel(r.name, 12), value: Number(r.sessions) || 0, fill: '#f59e0b' }));

  return (
    <View>
      <SectionDivider number="5" title="Palo Alto Firewall - Network Security" color="#f59e0b" />
      <Text style={S.lead}>
        {fw.totalSessions > 0 ? `${fmtNum(fw.totalSessions)} sessions, ${formatBytes(fw.totalTraffic)} traffic.` : 'No firewall data.'}
        {' '}{fw.highRiskEvents} high-risk events.
      </Text>
      <KpiRow>
        <KpiTile label="Total Sessions" value={fmtNum(fw.totalSessions)} color="#3b82f6" />
        <KpiTile label="Total Traffic" value={formatBytes(fw.totalTraffic)} color="#06b6d4" />
        <KpiTile label="High Risk" value={fmtNum(fw.highRiskEvents)} color="#ef4444" />
        <KpiTile label="Top Destination" value={truncateLabel(fw.topDestination, 14)} color={C.green} />
        <KpiTile label="Security Score" value={`${fw.securityScore}/100`} color={C.green} />
      </KpiRow>
      <View style={S.row2}>
        <ChartCard title="Risk Distribution" data={riskDist} />
        <ChartCard title="Top Attacks" data={fw.topAttacks} type="hbar" color="#ef4444" />
        <ChartCard title="Top Sources" data={fw.topAttackers} type="hbar" color="#3b82f6" />
      </View>
      <View style={S.row2}>
        <ChartCard title="Top Denied Destinations" data={fw.topDeniedDestinations} type="hbar" color="#f59e0b" />
        <ChartCard title="Top Denied Sources" data={fw.topDeniedSources} type="hbar" color="#06b6d4" />
        <ChartCard title="Top Denied Applications" data={fw.topDeniedApps} type="hbar" color="#8b5cf6" />
      </View>
      <View style={S.row2}>
        <ChartCard title="Top Connections" data={fw.topConnections} type="hbar" color="#10b981" />
        <ChartCard title="Risky Users" data={fw.riskyUsers} type="hbar" color="#ef4444" />
      </View>
      {(trendTraffic.length > 0 || trendSessions.length > 0) && (
        <View style={S.block} wrap={false}>
          <Text style={S.cardTitle}>Risk Trend Over Time — traffic (bars) · sessions (line)</Text>
          <View style={S.row2}>
            <ChartCard title="Traffic" data={trendTraffic} type="bar" color="#3b82f6" width={330} />
            <ChartCard title="Sessions" data={trendSessions} type="line" color="#f59e0b" width={330} />
          </View>
        </View>
      )}
    </View>
  );
}

// ── 6. Zoho Desk ──────────────────────────────────────────────────────────────
function ZohoSection({ tickets }) {
  const list = Array.isArray(tickets) ? tickets : [];
  const STATUS_COLORS = { Open: '#3b82f6', Closed: '#22c55e', 'Technically Closed': '#22c55e', Resolved: '#10b981', Pending: '#f59e0b' };
  const PRIORITY_COLORS = { High: '#ef4444', Critical: '#dc2626', Medium: '#f59e0b', Low: '#22c55e' };
  const isClosed = (t) => ['closed', 'technically closed', 'resolved'].includes(String(t.status || '').toLowerCase());
  const normText = (v) => String(v || '').trim();
  const getDept = (t) => normText(t.department?.name) || normText(t.departmentName) || 'Unknown';
  const getCreated = (t) => parseDate(t.created_at || t.createdTime || t.createdAt);
  const getClosed = (t) => parseDate(t.closed_at || t.closedTime || t.closedAt || t.closeTime);

  const highPriority = list.filter(t => t.priority === 'High' || t.priority === 'Critical').length;
  const closed = list.filter(t => ['Closed', 'Technically Closed', 'Resolved'].includes(t.status)).length;
  const openTickets = list.filter(t => t.status === 'Open').length;
  const closedPct = list.length ? Math.round((closed / list.length) * 100) : 0;
  const onHold = list.filter(t => /on hold/i.test(t.status || '')).length;
  const deptCount = new Set(list.map(getDept)).size;

  const statusData = Object.entries(list.reduce((acc, t) => { const s = t.status || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {}))
    .map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || '#6366f1' })).sort((a, b) => b.value - a.value);
  const priorityData = Object.entries(list.reduce((acc, t) => { const p = t.priority || 'Unknown'; acc[p] = (acc[p] || 0) + 1; return acc; }, {}))
    .map(([name, value]) => ({ name, value, fill: PRIORITY_COLORS[name] || '#6b7280' })).sort((a, b) => b.value - a.value);
  const departmentData = Object.entries(list.reduce((acc, t) => { const d = getDept(t); acc[d] = (acc[d] || 0) + 1; return acc; }, {}))
    .map(([name, value]) => ({ name: truncateLabel(name), value })).sort((a, b) => b.value - a.value).slice(0, 8);

  // Time-based metrics (mirrors the page's Avg Response / Avg Resolution KPIs)
  let respSum = 0, respCount = 0, resSum = 0, resCount = 0;
  list.forEach((t) => {
    const created = getCreated(t);
    if (!created) return;
    const respRaw = t.customerResponseTime || t.customer_response_time || t.responseTime;
    if (respRaw) { const resp = parseDuration(respRaw); if (resp != null) { respSum += resp; respCount++; } }
    const closedAt = getClosed(t);
    if (closedAt && isClosed(t)) { resSum += (closedAt.getTime() - created.getTime()) / 60000; resCount++; }
  });
  const avgResponse = respCount ? respSum / respCount : null;
  const avgResolution = resCount ? resSum / resCount : null;

  // Ticket volume trend (daily created)
  const ticketTrend = (() => {
    const counts = {};
    list.forEach((t) => { const d = getCreated(t); if (!d) return; const key = d.toISOString().slice(0, 10); counts[key] = (counts[key] || 0) + 1; });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-20).map(([date, count]) => ({ date, count }));
  })();

  // Open-ticket aging buckets
  const agingBuckets = { '< 1 day': 0, '1-3 days': 0, '3-7 days': 0, '7-14 days': 0, '> 14 days': 0 };
  list.forEach((t) => {
    if (!['Open', 'Pending', 'On Hold'].some((s) => normText(t.status).toLowerCase() === s.toLowerCase()) && !/pending|on hold/.test(normText(t.status).toLowerCase())) return;
    const d = getCreated(t); if (!d) return;
    const days = (Date.now() - d.getTime()) / 86400000;
    if (days < 1) agingBuckets['< 1 day']++; else if (days < 3) agingBuckets['1-3 days']++; else if (days < 7) agingBuckets['3-7 days']++; else if (days < 14) agingBuckets['7-14 days']++; else agingBuckets['> 14 days']++;
  });
  const openAging = Object.entries(agingBuckets).filter(([, v]) => v > 0).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));

  // Assignment / contact / dept-resolution data
  const assigneeMap = {};
  list.forEach((t) => { const a = `${normText(t.assignee?.firstName)} ${normText(t.assignee?.lastName)}`.trim() || 'Unassigned'; assigneeMap[a] = (assigneeMap[a] || 0) + 1; });
  const assigneeData = Object.entries(assigneeMap).map(([name, value]) => ({ name: truncateLabel(name), value })).sort((a, b) => b.value - a.value).slice(0, 8);

  const contactMap = {};
  list.forEach((t) => { const c = `${normText(t.contact?.firstName)} ${normText(t.contact?.lastName)}`.trim() || normText(t.contact?.email) || 'Unknown'; contactMap[c] = (contactMap[c] || 0) + 1; });
  const contactData = Object.entries(contactMap).map(([name, value]) => ({ name: truncateLabel(name), value })).sort((a, b) => b.value - a.value).slice(0, 8);

  const resByDeptMap = {};
  list.forEach((t) => {
    const created = getCreated(t); const closedAt = getClosed(t);
    if (!created || !closedAt || !isClosed(t)) return;
    const dept = getDept(t); const mins = (closedAt.getTime() - created.getTime()) / 60000;
    if (!resByDeptMap[dept]) resByDeptMap[dept] = { sum: 0, count: 0 };
    resByDeptMap[dept].sum += mins; resByDeptMap[dept].count++;
  });
  const resolutionByDept = Object.entries(resByDeptMap).map(([name, { sum, count }]) => ({ name: truncateLabel(name), value: sum / count }))
    .sort((a, b) => b.value - a.value).slice(0, 8);

  // Status × Priority stacked segments
  const states = [...new Set(list.map((t) => normText(t.status) || 'Unknown'))].slice(0, 6);
  const prios = [...new Set(list.map((t) => normText(t.priority) || 'Unknown'))]
    .sort((a, b) => ['Critical', 'High', 'Medium', 'Low'].indexOf(a) - ['Critical', 'High', 'Medium', 'Low'].indexOf(b));
  const statusPriority = states.map((status) => {
    const total = list.filter((t) => normText(t.status) === status).length;
    const segs = prios.map((p) => ({
      label: p, value: list.filter((t) => normText(t.status) === status && normText(t.priority) === p).length,
      fill: PRIORITY_COLORS[p] || '#6b7280',
    })).filter((s) => s.value > 0);
    return { status: truncateLabel(status), total, segments: segs };
  }).filter((s) => s.total > 0);

  return (
    <View>
      <SectionDivider number="6" title="Zoho Desk - Ticketing" color="#3b82f6" />
      <Text style={S.lead}>{list.length} tickets, {openTickets} open, {closed} closed, {highPriority} high priority.</Text>

      {/* Primary KPIs */}
      <KpiRow>
        <KpiTile label="Total" value={list.length} color="#8b5cf6" />
        <KpiTile label="Open" value={openTickets} color="#3b82f6" />
        <KpiTile label="High Priority" value={highPriority} color="#ef4444" />
        <KpiTile label="Closed" value={closed} color="#10b981" sub={`${closedPct}% of total`} />
      </KpiRow>
      {/* Secondary KPIs (time-based) */}
      <KpiRow>
        <KpiTile label="On Hold" value={onHold} color="#f59e0b" />
        <KpiTile label="Departments" value={deptCount} color={C.slate} />
        <KpiTile label="Avg Response" value={avgResponse != null ? formatDuration(avgResponse) : '—'} color="#06b6d4" sub="time to first reply" />
        <KpiTile label="Avg Resolution" value={avgResolution != null ? formatDuration(avgResolution) : '—'} color="#10b981" sub="open → closed" />
      </KpiRow>

      {/* Ticket Volume Trend + Open Aging */}
      <View style={S.row2}>
        <View style={[S.chartHalf, { flex: 1.6 }]} wrap={false}>
          <Text style={S.chartHalfTitle}>Ticket Volume Trend</Text>
          <VLineChart data={ticketTrend} width={470} height={140} stroke="#3b82f6" labelKey="date" valueKey="count" />
        </View>
        <ChartCard title="Open Ticket Aging" data={openAging} />
      </View>

      {/* Status / Priority / Department */}
      <View style={S.row2}>
        <ChartCard title="By Status" data={statusData} />
        <ChartCard title="By Priority" data={priorityData} />
        <ChartCard title="By Department" data={departmentData} type="hbar" color="#8b5cf6" />
      </View>

      {/* Assignees / Contacts / Avg Resolution by Dept */}
      <View style={S.row2}>
        <ChartCard title="Top Assignees" data={assigneeData} type="hbar" color="#06b6d4" />
        <ChartCard title="Top Contacts" data={contactData} type="hbar" color="#ec4899" />
        <ChartCard title="Avg Resolution by Dept" data={resolutionByDept} type="hbar" color="#f59e0b" valueFmt={formatDuration} />
      </View>

      {/* Status × Priority stacked */}
      {statusPriority.length > 0 && (
        <View style={S.block} wrap={false}>
          <Text style={S.cardTitle}>Status × Priority</Text>
          {statusPriority.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ width: 110, fontSize: 7.5, color: C.sub }}>{row.status} ({row.total})</Text>
              <View style={{ flex: 1 }}>
                <VStackedBar segments={row.segments} width={520} height={16} />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Section cover page (full-page divider) ────────────────────────────────────
function SectionCoverPage({ number, title, subtitle, color, orgName, generatedAt }) {
  const date = (() => {
    try {
      return new Date(generatedAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch { return '—'; }
  })();
  return (
    <Page size="A3" orientation="landscape" style={{ backgroundColor: PAGE_BG, flex: 1, fontSize: 9, padding: 40 }}>
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
        <Text style={{ fontSize: 9, color: '#64748b' }}>CISO Analytics Report · {orgName}</Text>
        <Text style={{ fontSize: 9, color: '#64748b' }}>{date} · Section {number}</Text>
      </View>

      <View style={{ flex: 1 }} />

      {/* Bottom rule + page label */}
      <View style={{ height: 1, backgroundColor: '#334155', marginBottom: 8 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 7.5, color: '#475569' }}>CISO Analytics Report · {orgName}</Text>
        <Text style={{ fontSize: 7.5, color: '#475569' }}>{date}</Text>
      </View>
    </Page>
  );
}

const SECTION_META = {
  // SentinelOne is split into three separate cover-sections (1.1 / 1.2 / 1.3)
  s1agents:  { number: '1.1', title: 'SentinelOne — Agent Analytics',   subtitle: 'Endpoint protection & agent health',          color: '#10b981' },
  s1cves:    { number: '1.2', title: 'SentinelOne — Application CVEs',  subtitle: 'Known vulnerabilities & CVSS analysis',      color: '#7c3aed' },
  s1threats: { number: '1.3', title: 'SentinelOne — Threat Analytics',  subtitle: 'Threat detection, trends & mitigation',       color: '#dc2626' },
  mdm:       { number: '2',   title: 'MDM / Hexnode',                   subtitle: 'Mobile Device Management',                   color: '#06b6d4' },
  nvd:       { number: '3',   title: 'NVD',                             subtitle: 'National Vulnerability Database',            color: '#8b5cf6' },
  checkpoint:{ number: '4',   title: 'Checkpoint Harmony',              subtitle: 'Email & Cloud Security',                     color: '#6366f1' },
  firewall:  { number: '5',   title: 'Palo Alto Firewall',              subtitle: 'Network Security',                           color: '#f59e0b' },
  zoho:      { number: '6',   title: 'Zoho Desk',                       subtitle: 'Ticketing',                                  color: '#3b82f6' },
  microsoft: { number: '7',   title: 'Microsoft 365',                   subtitle: 'Cloud Identity & Security',                  color: '#3b82f6' },
};

// ── 7. Microsoft 365 ──────────────────────────────────────────────────────────
function MicrosoftSection({ msData }) {
  const arr = (key) => msData?.[key]?.data?.value ?? [];
  const riskyUsers = arr('riskyUsers');
  const users = arr('users');
  const riskDetections = arr('riskDetections');
  const signIns = arr('auditSignIns');
  const securityAlerts = arr('securityAlerts');
  const secureScore = arr('secureScores')[0] || null;
  const managedDevices = arr('managedDevices');
  const serviceIssues = arr('serviceIssues');
  const subscribedSkus = arr('subscribedSkus');
  const authMeta = msData?.['organization']?.data?.value?.[0];
  const tenantName = authMeta?.displayName || authMeta?.userPrincipalName || '—';
  const failedSignIns = signIns.filter(s => s.status?.errorCode !== 0);
  const failedPct = signIns.length ? Math.round((failedSignIns.length / signIns.length) * 100) : 0;
  const assignedLicenses = subscribedSkus.reduce((s, sku) => s + (sku.consumedUnits || 0), 0);
  const totalLicenses = subscribedSkus.reduce((s, sku) => s + (sku.prepaidUnits?.enabled || 0), 0);
  const licenseUtil = totalLicenses ? Math.round((assignedLicenses / totalLicenses) * 100) : 0;
  const unassignedLicenses = Math.max(0, totalLicenses - assignedLicenses);

  const riskEvtData = bucket(riskDetections, r => r.riskEventType || 'Unknown').slice(0, 8);
  const riskLvlData = bucket(riskyUsers, u => u.riskLevel || 'Unknown');
  const alertSevData = bucket(securityAlerts, a => a.severity || 'Unknown');
  const complianceData = bucket(managedDevices, d => d.complianceState || 'Unknown');

  // Sign-in trend: last 15 days — success vs failure (stacked columns)
  const signInTrend = (() => {
    const map = {};
    signIns.forEach((s) => {
      const day = s.createdDateTime ? s.createdDateTime.slice(0, 10) : null;
      if (!day) return;
      if (!map[day]) map[day] = { date: day, success: 0, failure: 0 };
      if (s.status?.errorCode === 0) map[day].success += 1; else map[day].failure += 1;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-15).map((r) => ({ ...r, total: r.success + r.failure }));
  })();
  const signInSegs = signInTrend
    .filter((r) => r.total > 0)
    .map((r) => ({
      label: r.date.slice(5),
      segments: [
        { label: 'Success', value: r.success, fill: '#10b981' },
        { label: 'Failure', value: r.failure, fill: '#ef4444' },
      ],
    }));

  const numSkus = subscribedSkus.length;

  return (
    <View>
      <SectionDivider number="7" title="Microsoft 365 - Cloud Identity & Security" color="#3b82f6" />
      <Text style={S.lead}>
        Tenant: {tenantName} · {users.length} users · {signIns.length} sign-ins · {failedSignIns.length} failed.
        {secureScore ? ` Secure Score: ${secureScore.currentScore ?? '—'}.` : ''}
      </Text>
      <KpiRow>
        <KpiTile label="Sign-ins" value={signIns.length} color="#3b82f6" />
        <KpiTile label="Failed Sign-ins" value={failedSignIns.length} color="#ef4444" sub={`${failedPct}%`} />
        <KpiTile label="Risky Users" value={riskyUsers.length} color="#ef4444" />
        <KpiTile label="Total Users" value={users.length} color={C.brand} />
        <KpiTile label="Secure Score" value={secureScore?.currentScore ?? '—'} color="#10b981" sub={secureScore?.maxScore ? `/ ${secureScore.maxScore}` : ''} />
        <KpiTile label="Alerts" value={securityAlerts.length} color="#f59e0b" />
      </KpiRow>
      <KpiRow>
        <KpiTile label="License Utilization" value={`${licenseUtil}%`} color="#8b5cf6" sub={`${fmtNum(assignedLicenses)} / ${fmtNum(totalLicenses)}`} />
        <KpiTile label="Unassigned Licenses" value={fmtNum(unassignedLicenses)} color={C.slate} />
        <KpiTile label="Managed Devices" value={managedDevices.length} color="#3b82f6" />
        <KpiTile label="Service Issues" value={serviceIssues.length} color="#f97316" />
      </KpiRow>
      <View style={S.row2}>
        {riskEvtData.length > 0 && <ChartCard title="Risk Detections by Type" data={riskEvtData} />}
        {riskLvlData.length > 0 && <ChartCard title="Risky Users by Level" data={riskLvlData} />}
        {alertSevData.length > 0 && <ChartCard title="Alerts by Severity" data={alertSevData} />}
        {complianceData.length > 0 && <ChartCard title="Device Compliance" data={complianceData} />}
      </View>

      {/* Sign-in Trend (success vs failure) */}
      {signInSegs.length > 0 && (
        <View style={S.block} wrap={false}>
          <Text style={S.cardTitle}>Sign-in Trend — last 15 days (success vs failure)</Text>
          {signInSegs.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ width: 46, fontSize: 6.5, color: C.muted }}>{row.label}</Text>
              <View style={{ flex: 1 }}>
                <VStackedBar segments={row.segments} width={540} height={14} />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Assigned vs Unassigned Licenses */}
      <View style={S.row2}>
        <View style={[S.chartHalf, { flex: 1.4 }]} wrap={false}>
          <Text style={S.chartHalfTitle}>Assigned vs Unassigned Licenses</Text>
          <VScoreBar
            label="License Utilization"
            value={licenseUtil}
            max={100}
            color="#6366f1"
            sub={`${fmtNum(assignedLicenses)} assigned · ${fmtNum(unassignedLicenses)} unassigned`}
            width={460}
            height={12}
          />
          <View style={{ marginTop: 10 }}>
            <ZohoCountCards cards={[
              { label: 'SKUs', value: numSkus, color: C.ink },
              { label: 'Assigned', value: fmtNum(assignedLicenses), color: '#22c55e' },
              { label: 'Unassigned', value: fmtNum(unassignedLicenses), color: '#ef4444' },
            ]} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Main Report Template ──────────────────────────────────────────────────────
export default function AnalyticsReportTemplate({ data }) {
  if (!data) return null;

  const section = data.section || 'all';

  const renderContent = (sec) => {
    switch (sec) {
      case 's1agents': return <S1AgentSection agents={data.s1Agents} />;
      case 's1cves': return <S1CveSection cves={data.s1Cves} />;
      case 's1threats': return <S1ThreatSection threats={data.s1Threats} />;
      case 'mdm': return <MdmSection devices={data.mdmDevices} apps={data.mdmApps} />;
      case 'nvd': return <NvdSection stats={data.nvdStats} />;
      case 'checkpoint': return <CheckpointSection events={data.harmonyEvents} />;
      case 'firewall': return <FirewallSection fwData={data} />;
      case 'zoho': return <ZohoSection tickets={data.zohoTickets} />;
      case 'microsoft': return <MicrosoftSection msData={data.msData} />;
      default: return null;
    }
  };

  const renderSectionPage = (sec) => {
    const meta = SECTION_META[sec];
    if (!meta) return null;
    const { number, title, subtitle, color } = meta;
    return (
      <>
        {/* Section cover page — full-page divider */}
        <SectionCoverPage
          number={number}
          title={title}
          subtitle={subtitle}
          color={color}
          orgName={data.orgName}
          generatedAt={data.generatedAt}
        />

        {/* Section content page */}
        <Page size="A3" orientation="landscape" style={S.page} wrap>
          <View style={S.header} fixed>
            <View style={S.brandBar} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 9, fontWeight: 700, color: C.ink }}>{data.orgName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 7.5, color: C.muted, marginRight: 10 }}>{title}</Text>
                <View style={[S.badge, { backgroundColor: '#dc2626' }]}><Text>CONFIDENTIAL</Text></View>
              </View>
            </View>
          </View>
          {renderContent(sec)}
          <View style={S.footer} fixed>
            <Text>CISO Analytics Report · {data.orgName}</Text>
            <Text>{new Date(data.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · Section {number}</Text>
          </View>
        </Page>
      </>
    );
  };

  return (
    <Document title={`CISO Analytics Report - ${data.orgName}`} author="CISO Dashboard" creator="CISO Dashboard">
      {/* Main cover page */}
      <Page size="A3" orientation="landscape" style={S.coverPage} wrap>
        <AnalyticsCover orgName={data.orgName} generatedAt={data.generatedAt} />
      </Page>

      {section === 'all' && (
        <>
          {/* SentinelOne is split into three cover-sections */}
          {renderSectionPage('s1agents')}
          {renderSectionPage('s1cves')}
          {renderSectionPage('s1threats')}
          {renderSectionPage('mdm')}
          {renderSectionPage('nvd')}
          {renderSectionPage('checkpoint')}
          {renderSectionPage('firewall')}
          {renderSectionPage('zoho')}
          {renderSectionPage('microsoft')}
        </>
      )}

      {section !== 'all' && renderSectionPage(section)}
    </Document>
  );
}
