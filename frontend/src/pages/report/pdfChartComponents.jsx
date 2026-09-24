import { Svg, Path, Rect, Circle, Line, G, Text as SvgText, View, Text } from '@react-pdf/renderer';

// Minimal vector chart primitives built directly on react-pdf <Svg>.
// No Chart.js, no canvas, no raster — crisp at any zoom on dark dashboard theme.

// ── Donut chart ───────────────────────────────────────────────────────────────
export function VDonut({ data, width = 160, height = 130, colors }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  if (total <= 0) return null;

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 2;

  // Single active slice fallback: render full circle to prevent SVG arc coincident point bug
  const activeSlices = data.filter((d) => (Number(d.value) || 0) > 0);
  if (activeSlices.length === 1) {
    const segFill = colors && colors[0] ? colors[0] : activeSlices[0].fill || '#3b82f6';
    return (
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Circle cx={cx} cy={cy} r={r} fill={segFill} stroke={segFill} strokeWidth={0.5} />
      </Svg>
    );
  }

  // Full pie sector from the center to the outer radius.
  const sector = (a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
  };

  let angle = -Math.PI / 2;
  const segments = data.map((d, i) => {
    const val = Number(d.value) || 0;
    if (val <= 0) return null;
    const frac = val / total;
    if (frac >= 0.9999) {
      const segFill = colors && colors[i] ? colors[i] : d.fill || '#3b82f6';
      return <Circle key={i} cx={cx} cy={cy} r={r} fill={segFill} stroke={segFill} strokeWidth={0.5} />;
    }
    const a1 = angle + frac * 2 * Math.PI;
    const segFill = colors && colors[i] ? colors[i] : d.fill || '#3b82f6';
    const seg = (
      <Path
        key={i}
        d={sector(angle, a1)}
        fill={segFill}
        stroke={segFill}
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
    );
    angle = a1;
    return seg;
  }).filter(Boolean);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {segments}
    </Svg>
  );
}

// ── Simple vertical bar chart ─────────────────────────────────────────────────
export function VBarChart({ data, width = 320, height = 135, color = '#4f46e5', labelKey = 'name', valueKey = 'value' }) {
  if (!data || data.length === 0) return null;
  const padL = 12, padR = 16, padT = 16, padB = 26;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  const n = data.length;
  const slot = chartW / n;
  const barW = Math.max(8, Math.min(32, slot * 0.5));

  const bars = data.map((d, i) => {
    const val = Number(d[valueKey]) || 0;
    const h = Math.max(2, (val / max) * chartH);
    const x = padL + i * slot + (slot - barW) / 2;
    const y = padT + chartH - h;
    const barFill = d.fill || color;
    return (
      <G key={i}>
        <Rect x={x} y={y} width={barW} height={h} rx={2} fill={barFill} />
        <SvgText
          x={x + barW / 2} y={y - 4} fontSize={8.5} fill="#f8fafc" fontWeight="bold" textAnchor="middle"
        >{val}</SvgText>
        <SvgText
          x={x + barW / 2} y={height - 8} fontSize={7.5} fill="#94a3b8" textAnchor="middle"
        >{String(d[labelKey]).slice(0, 14)}</SvgText>
      </G>
    );
  });

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Line x1={padL} y1={padT + chartH} x2={width - padR} y2={padT + chartH} stroke="#334155" strokeWidth={0.75} />
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <Line key={i} x1={padL} y1={padT + chartH - f * chartH} x2={width - padR} y2={padT + chartH - f * chartH} stroke="#1e293b" strokeWidth={0.5} strokeDasharray="2 2" />
      ))}
      {bars}
    </Svg>
  );
}

// ── Simple line chart ─────────────────────────────────────────────────────────
export function VLineChart({ data, width = 680, height = 135, stroke = '#f97316', labelKey = 'date', valueKey = 'avg' }) {
  if (!data || data.length === 0) return null;
  const padL = 26, padR = 10, padT = 12, padB = 24;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  const n = data.length;
  const step = n > 1 ? chartW / (n - 1) : 0;

  const pts = data.map((d, i) => ({
    x: padL + i * step,
    y: padT + chartH - (Number(d[valueKey]) || 0) / max * chartH,
  }));

  const linePath = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${padT + chartH} L ${pts[0].x} ${padT + chartH} Z`;

  const xTicks = [];
  for (let i = 0; i < n; i += Math.max(1, Math.ceil(n / 7))) {
    xTicks.push(i);
  }

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Line x1={padL} y1={padT + chartH} x2={width - padR} y2={padT + chartH} stroke="#334155" strokeWidth={0.75} />
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <Line key={i} x1={padL} y1={padT + chartH - f * chartH} x2={width - padR} y2={padT + chartH - f * chartH} stroke="#1e293b" strokeWidth={0.5} strokeDasharray="2 2" />
      ))}
      <Path d={areaPath} fill={stroke} fillOpacity={0.15} />
      <Path d={linePath} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={stroke} />
      ))}
      {xTicks.map((i) => (
        <SvgText key={i} x={pts[i].x} y={height - 8} fontSize={7.5} fill="#94a3b8" textAnchor="middle">
          {String(data[i][labelKey])}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Horizontal bar row (rankings & categorical bars) ───────────────────────────
export function VHBarList({ data, width = 320, barHeight = 15, color = '#4f46e5', labelKey = 'name', valueKey = 'value', maxItems = 8, valueFormat }) {
  if (!data || data.length === 0) return null;
  const list = data.slice(0, maxItems);
  const max = Math.max(...list.map(d => Number(d[valueKey]) || 0), 1);
  const rowH = barHeight + 10;
  const height = list.length * rowH + 6;
  const labelW = Math.min(120, width * 0.35);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {list.map((d, i) => {
        const y = 4 + i * rowH;
        const barFill = d.fill || color;
        const val = Number(d[valueKey]) || 0;
        const bw = Math.max(4, (val / max) * (width - labelW - 36));
        return (
          <G key={i}>
            <SvgText x={0} y={y + barHeight / 2 + 3} fontSize={8} fill="#cbd5e1" textAnchor="start">
              {String(d[labelKey]).slice(0, 22)}
            </SvgText>
            <Rect x={labelW} y={y} width={bw} height={barHeight} rx={3} fill={barFill} />
            <SvgText x={labelW + bw + 6} y={y + barHeight / 2 + 3} fontSize={8.5} fill="#f8fafc" fontWeight="bold">
              {valueFormat ? valueFormat(val) : val}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── Legend for charts ─────────────────────────────────────────────────────────
export function VLegendRow({ data, colors }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + (Number(d?.value) || Number(d?.count) || 0), 0);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
      {data.map((d, i) => {
        const val = Number(d?.value) || Number(d?.count) || 0;
        const pct = total > 0 ? Math.round((val / total) * 100) : 0;
        const swatchColor = (colors && colors[i]) || d.fill || '#3b82f6';
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6, marginBottom: 2 }}>
            <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: swatchColor, marginRight: 4 }} />
            <Text style={{ fontSize: 7.5, color: '#cbd5e1' }}>
              {String(d.name).slice(0, 20)}
            </Text>
            <Text style={{ fontSize: 7, color: '#94a3b8', marginLeft: 3 }}>
              ({val}{total > 0 ? ` · ${pct}%` : ''})
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Semicircle gauge (MTTR / compliance health) ───────────────────────────────
const MTTR_STOPS = [
  { p: 0, c: [255, 71, 87] },   // red
  { p: 33, c: [255, 165, 2] },  // orange
  { p: 66, c: [255, 211, 42] }, // yellow
  { p: 100, c: [46, 213, 115] },// green
];
const mttrColor = (pct) => {
  let lower = MTTR_STOPS[0], upper = MTTR_STOPS[MTTR_STOPS.length - 1];
  for (let i = 0; i < MTTR_STOPS.length - 1; i++) {
    if (pct >= MTTR_STOPS[i].p && pct <= MTTR_STOPS[i + 1].p) { lower = MTTR_STOPS[i]; upper = MTTR_STOPS[i + 1]; break; }
  }
  const range = (upper.p - lower.p) || 1;
  const r = (pct - lower.p) / range;
  const ch = (n) => Math.round(lower.c[n] + r * (upper.c[n] - lower.c[n]));
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
};

export function VGauge({ pct = 0, size = 140, title, goodLabel = 'Resolved', badLabel = 'Open', goodCount, badCount }) {
  const p = Math.min(Math.max(pct, 0), 100);
  const cx = size / 2;
  const cy = size - 12;
  const R = size / 2 - 12;
  const L = R - 6;

  const pt = (deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + R * Math.cos(a), cy - R * Math.sin(a)];
  };
  const arcSeg = (d0, d1) => {
    const [x0, y0] = pt(d0);
    const [x1, y1] = pt(d1);
    const large = Math.abs(d1 - d0) > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
  };

  const segs = [
    { d0: 180, d1: 135, color: '#FF4757' },
    { d0: 135, d1: 90, color: '#FFA502' },
    { d0: 90, d1: 45, color: '#FFD32A' },
    { d0: 45, d1: 0, color: '#2ED573' },
  ];

  const needleDeg = 180 - (p / 100) * 180;
  const [nx, ny] = (() => {
    const a = (needleDeg * Math.PI) / 180;
    return [cx + L * Math.cos(a), cy - L * Math.sin(a)];
  })();
  const needleColor = mttrColor(p);

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segs.map((s, i) => (
          <Path key={i} d={arcSeg(s.d0, s.d1)} fill="none" stroke={s.color} strokeWidth={12} strokeLinecap="round" />
        ))}
        <Line x1={cx} y1={cy} x2={nx} y2={ny} stroke={needleColor} strokeWidth={3} strokeLinecap="round" />
        <Circle cx={cx} cy={cy} r={4} fill="#111827" />
        <SvgText x={cx} y={cy - 16} fontSize={18} fill="#f8fafc" fontWeight="bold" textAnchor="middle">
          {Math.round(p)}%
        </SvgText>
      </Svg>
      {title && <Text style={{ fontSize: 9.5, fontWeight: 'bold', color: '#f8fafc', marginTop: 4 }}>{title}</Text>}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 4 }}>
        {goodCount !== undefined && goodCount !== '' && (
          <Text style={{ fontSize: 7.5, color: '#22c55e' }}>{goodLabel}: {goodCount}</Text>
        )}
        {badCount !== undefined && badCount !== '' && (
          <Text style={{ fontSize: 7.5, color: '#ef4444' }}>{badLabel}: {badCount}</Text>
        )}
      </View>
    </View>
  );
}

// ── Multi-segment horizontal stacked bar ──────────────────────────────────────
export function VStackedBar({ segments, width = 320, height = 14 }) {
  if (!segments || segments.length === 0) return null;
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  if (total <= 0) return null;

  let currentX = 0;
  const rects = segments.map((seg, i) => {
    const w = (seg.value / total) * width;
    const x = currentX;
    currentX += w;
    return (
      <Rect key={i} x={x} y={0} width={w} height={height} fill={seg.fill || '#3b82f6'} rx={i === 0 || i === segments.length - 1 ? 2 : 0} />
    );
  });

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {rects}
    </Svg>
  );
}

// ── Score progress bar with label ─────────────────────────────────────────────
export function VScoreBar({ label, value, max = 100, color = '#10b981', sub, width = 680, height = 12 }) {
  const v = Number(value) || 0;
  const m = Number(max) || 100;
  const pct = m > 0 ? Math.min(Math.max((v / m) * 100, 0), 100) : 0;
  const fillW = Math.max(0, Math.min(width, (pct / 100) * width));

  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 8.5, fontWeight: 700, color: '#e2e8f0' }}>{label}</Text>
        <Text style={{ fontSize: 8.5, fontWeight: 800, color }}>{Math.round(pct)}%</Text>
      </View>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Rect x={0} y={0} width={width} height={height} rx={height / 2} fill="#334155" />
        <Rect x={0} y={0} width={fillW} height={height} rx={height / 2} fill={color} />
      </Svg>
      {sub && <Text style={{ fontSize: 7.5, color: '#94a3b8', marginTop: 4 }}>{sub}</Text>}
    </View>
  );
}
