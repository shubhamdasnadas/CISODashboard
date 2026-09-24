import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { VDonut, VBarChart, VHBarList, VLineChart, VLegendRow, VStackedBar, VScoreBar } from './pdfChartComponents';
import { fmtNum } from './reportConfig';

// ── Theme tokens helper ───────────────────────────────────────────────────────
function getTokens(theme = 'dark') {
  const isLight = theme === 'light';
  return {
    pageBg: isLight ? '#f8fafc' : '#0f172a',
    cardBg: isLight ? '#ffffff' : '#1e293b',
    ink: isLight ? '#0f172a' : '#f1f5f9',
    sub: isLight ? '#334155' : '#cbd5e1',
    muted: isLight ? '#64748b' : '#94a3b8',
    faint: isLight ? '#94a3b8' : '#64748b',
    line: isLight ? '#e2e8f0' : '#334155',
    bg: isLight ? '#ffffff' : '#1e293b',
    brand: '#818cf8',
    green: isLight ? '#16a34a' : '#4ade80',
    red: isLight ? '#dc2626' : '#f87171',
    amber: isLight ? '#d97706' : '#fbbf24',
    sky: isLight ? '#0284c7' : '#38bdf8',
    violet: isLight ? '#7c3aed' : '#a78bfa',
    slate: '#94a3b8',
  };
}

function getDynamicStyles(C) {
  return StyleSheet.create({
    page: { fontSize: 9, color: C.ink, backgroundColor: C.pageBg, paddingTop: 22, paddingBottom: 38, paddingLeft: 36, paddingRight: 36 },
    header: { marginBottom: 10 },
    headerTopBar: { height: 3.5, borderRadius: 2, marginBottom: 8 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { fontSize: 9.5, fontWeight: 700, color: C.ink },
    headerMeta: { flexDirection: 'row', alignItems: 'center' },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, fontSize: 7, fontWeight: 700 },
    sectionDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 2 },
    sectionNumber: { width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    sectionNumberText: { color: '#ffffff', fontSize: 11, fontWeight: 800, textAlign: 'center' },
    sectionTitle: { fontSize: 14, fontWeight: 700, color: C.ink },
    sectionSubtitle: { fontSize: 8, color: C.muted, marginTop: 1 },
    sectionRule: { flex: 1, height: 1.5, backgroundColor: C.line, marginLeft: 14 },
    lead: { fontSize: 9, color: C.sub, lineHeight: 1.45, marginBottom: 10 },
    kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    kpiTile: {
      flex: 1,
      minWidth: 0,
      minHeight: 68,
      borderWidth: 1,
      borderColor: C.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: C.cardBg,
      flexDirection: 'column',
      justifyContent: 'space-between',
    },
    kpiLabel: {
      fontSize: 8,
      fontWeight: 700,
      color: C.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    kpiValue: {
      fontSize: 20,
      fontWeight: 800,
      lineHeight: 1.2,
      marginBottom: 4,
    },
    kpiSub: {
      fontSize: 7.5,
      color: C.faint,
    },
    card: { borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: C.cardBg, padding: 12, marginBottom: 10 },
    cardTitle: { fontSize: 10, fontWeight: 700, color: C.ink, marginBottom: 8 },
    grid2: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    chartCard: {
      flex: 1,
      minWidth: 0,
      minHeight: 180,
      borderWidth: 1,
      borderColor: C.line,
      borderRadius: 8,
      backgroundColor: C.cardBg,
      padding: 12,
      flexDirection: 'column',
      justifyContent: 'space-between',
    },
    chartCardTitle: { fontSize: 10, fontWeight: 700, color: C.ink, marginBottom: 8 },
    footer: {
      position: 'absolute',
      bottom: 12,
      left: 36,
      right: 36,
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: C.line,
      paddingTop: 6,
      fontSize: 7.5,
      color: C.faint,
    },
  });
}

// ── Dynamic Delta Badge ───────────────────────────────────────────────────────
function deltaPct(cur, prev) {
  if (cur == null || prev == null) return null;
  const c = Number(cur);
  const p = Number(prev);
  if (isNaN(c) || isNaN(p)) return null;
  if (p === 0) {
    if (c === 0) return { pct: 0, diff: 0, dir: 'flat' };
    return { pct: 100, diff: c, dir: 'up' };
  }
  const diff = c - p;
  const pct = Math.round((Math.abs(diff) / p) * 100);
  return {
    pct,
    diff,
    dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
  };
}

function VDeltaBadge({ cur, prev, goodWhenUp = true }) {
  const d = deltaPct(cur, prev);
  if (!d) return null;

  if (d.dir === 'flat') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#334155', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
        <Text style={{ fontSize: 7, color: '#94a3b8', fontWeight: 600 }}>0% (prev: {fmtNum(prev)})</Text>
      </View>
    );
  }

  const good = d.dir === 'up' ? goodWhenUp : !goodWhenUp;
  const arrow = d.dir === 'up' ? '↑' : '↓';
  const color = good ? '#10b981' : '#ef4444';
  const bg = good ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: bg, borderWidth: 0.5, borderColor: color, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
      <Text style={{ fontSize: 7, color, fontWeight: 700 }}>{arrow} {d.pct}%</Text>
      <Text style={{ fontSize: 6.5, color: '#cbd5e1', marginLeft: 4 }}>prev: {fmtNum(prev)}</Text>
    </View>
  );
}

// ── KPI Tile Primitive ────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, color, cur, prev, goodWhenUp = true, isFiltered = false, C, S }) {
  const textColor = color || C.ink;
  return (
    <View style={S.kpiTile} wrap={false}>
      <Text style={S.kpiLabel}>{label}</Text>
      <Text style={[S.kpiValue, { color: textColor }]}>{value}</Text>
      <View style={{ minHeight: 14, justifyContent: 'flex-start' }}>
        {isFiltered && cur != null && prev != null ? (
          <VDeltaBadge cur={cur} prev={prev} goodWhenUp={goodWhenUp} />
        ) : sub ? (
          <Text style={S.kpiSub}>{sub}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Widget Card Primitive ─────────────────────────────────────────────────────
function GenericWidgetCard({ widget, width, C, S }) {
  const { title, type, data, color = C.brand, half = true, valueFmt, labelKey, valueKey } = widget;
  if (!data || (Array.isArray(data) && data.length === 0)) return null;

  const wrapStyle = half ? S.chartCard : S.card;
  const titleStyle = half ? S.chartCardTitle : S.cardTitle;

  return (
    <View style={wrapStyle} wrap={false}>
      <Text style={titleStyle}>{title}</Text>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {type === 'donut' && (
          <View style={{ alignItems: 'center' }}>
            <VDonut data={data} width={width || 130} height={width || 130} colors={data.map((d) => d.fill || color)} />
          </View>
        )}
        {type === 'hbar' && <VHBarList data={data} width={width || 340} maxItems={8} color={color} valueFormat={valueFmt} />}
        {type === 'bar' && <VBarChart data={data} width={width || 340} height={135} color={color} />}
        {type === 'line' && <VLineChart data={data} width={width || 720} height={135} stroke={color} labelKey={labelKey || 'date'} valueKey={valueKey || 'count'} />}
        {type === 'stacked' && (
          <View style={{ gap: 6 }}>
            {['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'].map((sevColor, si) => {
              const sevLabel = ['Info', 'Low', 'Med', 'High', 'Crit'][si];
              const sevKey = ['Informational', 'Low', 'Medium', 'High', 'Critical'][si];
              const segments = data.map((row) => ({ name: row.name, value: row[sevKey] || 0, fill: sevColor }));
              return (
                <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 7, color: C.muted, width: 36 }}>{sevLabel}</Text>
                  <VStackedBar segments={segments} width={width || 340} height={14} />
                </View>
              );
            })}
          </View>
        )}
      </View>
      {type === 'donut' && (
        <View style={{ marginTop: 6, width: '100%' }}>
          <VLegendRow data={data} colors={data.map((d) => d.fill || color)} />
        </View>
      )}
    </View>
  );
}

// ── Generic Config-Driven Dynamic Section Page ────────────────────────────────
export function DynamicSectionPage({ config, data }) {
  const { number, title, subtitle, color, getLead, getKpis, getProgress, getWidgets } = config;

  const C = getTokens(data?.theme || 'dark');
  const S = getDynamicStyles(C);

  const leadText = getLead ? getLead(data) : null;
  const kpiRows = getKpis ? getKpis(data) : [];
  const progress = getProgress ? getProgress(data) : null;
  const widgets = getWidgets ? getWidgets(data) : [];
  const dateStr = new Date(data.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Separate full-width widgets from 2-column or 3-column widgets
  const fullWidthWidgets = widgets.filter((w) => w.half === false);
  const gridWidgets = widgets.filter((w) => w.half !== false);

  // Group grid widgets into rows of 3 (or 2 if 2 or 4 widgets in total)
  const perRow = gridWidgets.length === 2 || gridWidgets.length === 4 ? 2 : 3;
  const widgetRows = [];
  for (let i = 0; i < gridWidgets.length; i += perRow) {
    widgetRows.push(gridWidgets.slice(i, i + perRow));
  }

  return (
    <Page size="A3" orientation="landscape" style={S.page} wrap id={`sec-${config.id}`}>
      {/* Fixed Header on every page of this section */}
      <View style={S.header} fixed>
        <View style={[S.headerTopBar, { backgroundColor: color || C.brand }]} />
        <View style={S.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={S.headerTitle}>{data.orgName}</Text>
            <Text style={{ fontSize: 8, color: C.faint, marginLeft: 8 }}>· CISO Analytics Report</Text>
          </View>
          <View style={S.headerMeta}>
            {data.isFiltered && data.periodLabel && (
              <View style={[S.badge, { backgroundColor: '#4f46e5', marginRight: 8 }]}>
                <Text style={{ color: '#ffffff', fontSize: 7, fontWeight: 700 }}>Period: {data.periodLabel}</Text>
              </View>
            )}
            <Text style={{ fontSize: 8, color: C.muted, marginRight: 10 }}>{title}</Text>
            <View style={[S.badge, { backgroundColor: '#dc2626' }]}>
              <Text style={{ color: '#ffffff', fontSize: 7, fontWeight: 700 }}>CONFIDENTIAL</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Section Heading & Rule */}
      <View id={`sec-${config.id}`} style={S.sectionDivider} wrap={false}>
        <View style={[S.sectionNumber, { backgroundColor: color || C.brand }]}>
          <Text style={S.sectionNumberText}>{number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={S.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
        <View style={S.sectionRule} />
      </View>

      {/* Lead summary text */}
      {leadText && <Text style={S.lead}>{leadText}</Text>}

      {/* Dynamic KPI Rows */}
      {kpiRows.map((row, rIdx) => (
        <View key={rIdx} style={S.kpiRow} wrap={false}>
          {row.map((kpi, kIdx) => (
            <KpiTile
              key={kIdx}
              label={kpi.label}
              value={kpi.value}
              cur={kpi.cur}
              prev={kpi.prev}
              color={kpi.color}
              sub={kpi.sub}
              goodWhenUp={kpi.goodWhenUp}
              isFiltered={data.isFiltered}
              C={C}
              S={S}
            />
          ))}
        </View>
      ))}

      {/* Optional Progress Bar */}
      {progress && (
        <View style={S.card} wrap={false}>
          <Text style={S.cardTitle}>{progress.title}</Text>
          <VScoreBar
            label={progress.label}
            value={progress.value}
            max={progress.max || 100}
            color={progress.color || '#10b981'}
            sub={progress.sub}
            width={720}
            height={12}
          />
        </View>
      )}

      {/* Full-width widgets (such as line charts / daily trends) */}
      {fullWidthWidgets.map((widget, wIdx) => (
        <GenericWidgetCard key={`fw-${wIdx}`} widget={widget} width={720} C={C} S={S} />
      ))}

      {/* Grid widgets chunked in auto-wrapping rows */}
      {widgetRows.map((row, rIdx) => (
        <View key={`grid-${rIdx}`} style={S.grid2} wrap={false}>
          {row.map((widget, wIdx) => (
            <GenericWidgetCard key={`w-${rIdx}-${wIdx}`} widget={widget} width={perRow === 2 ? 520 : 340} C={C} S={S} />
          ))}
        </View>
      ))}

      {/* Dynamic Footer with auto page numbers */}
      <View style={S.footer} fixed>
        <Text>CISO Analytics Report · {data.orgName}</Text>
        <Text
          render={({ pageNumber, totalPages }) =>
            `${dateStr} · Section ${number} · Page ${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}
