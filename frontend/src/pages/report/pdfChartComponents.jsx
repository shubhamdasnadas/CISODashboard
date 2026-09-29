import { Svg, Path, Rect, Circle, Line, G, Text as SvgText, View, Text } from '@react-pdf/renderer';

// Minimal vector chart primitives built directly on react-pdf <Svg>.
// Safe calculations everywhere to prevent non-finite numbers (NaN, Infinity) in SVG viewBox and path commands.

// ── Donut chart ───────────────────────────────────────────────────────────────
export function VDonut({ data, width = 160, height = 130, colors }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const w = Math.max(10, Number(width) || 160);
  const h = Math.max(10, Number(height) || 130);

  const activeSlices = data.filter((d) => (Number(d?.value) || 0) > 0);
  if (activeSlices.length === 0) return null;

  const total = activeSlices.reduce((s, d) => s + (Math.max(0, Number(d?.value) || 0)), 0);
  if (!isFinite(total) || total <= 0) return null;

  const cx = w / 2;
  const cy = h / 2;
  const r = Math.max(5, Math.min(w, h) / 2 - 2);

  // Single active slice fallback: render full Circle to avoid arc coincident point singularities
  if (activeSlices.length === 1) {
    const segFill = colors && colors[0] ? colors[0] : activeSlices[0].fill || '#3b82f6';
    return (
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Circle cx={cx} cy={cy} r={r} fill={segFill} stroke={segFill} strokeWidth={0.5} />
      </Svg>
    );
  }

  // If one slice accounts for >= 99.9% of total, render as Circle
  const dominant = activeSlices.find((d) => (Number(d?.value) / total) >= 0.999);
  if (dominant) {
    const segFill = dominant.fill || (colors && colors[0]) || '#3b82f6';
    return (
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Circle cx={cx} cy={cy} r={r} fill={segFill} stroke={segFill} strokeWidth={0.5} />
      </Svg>
    );
  }

  // Sector generator with numeric precision and safe arc endpoints
  const sector = (a0, a1) => {
    const large = (a1 - a0 > Math.PI) ? 1 : 0;
    const x0 = Number((cx + r * Math.cos(a0)).toFixed(2));
    const y0 = Number((cy + r * Math.sin(a0)).toFixed(2));
    let x1 = Number((cx + r * Math.cos(a1)).toFixed(2));
    let y1 = Number((cy + r * Math.sin(a1)).toFixed(2));

    // Guard against coincident start/end points causing division by zero in arc parser
    if (Math.abs(x1 - x0) < 0.05 && Math.abs(y1 - y0) < 0.05) {
      x1 = Number((x0 + 0.1).toFixed(2));
    }
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
  };

  let angle = -Math.PI / 2;
  const segments = data.map((d, i) => {
    const val = Math.max(0, Number(d?.value) || 0);
    if (val <= 0) return null;
    const frac = val / total;
    const a1 = angle + frac * 2 * Math.PI;
    const segFill = (colors && colors[i]) ? colors[i] : d?.fill || '#3b82f6';
    const pathD = sector(angle, a1);
    angle = a1;
    return (
      <Path
        key={i}
        d={pathD}
        fill={segFill}
        stroke={segFill}
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
    );
  }).filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {segments}
    </Svg>
  );
}

// ── Simple vertical bar chart ─────────────────────────────────────────────────
export function VBarChart({ data, width = 320, height = 135, color = '#4f46e5', labelKey = 'name', valueKey = 'value' }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const w = Math.max(20, Number(width) || 320);
  const h = Math.max(20, Number(height) || 135);
  const padL = 12, padR = 16, padT = 16, padB = 26;
  const chartW = Math.max(10, w - padL - padR);
  const chartH = Math.max(10, h - padT - padB);
  const rawMax = Math.max(0, ...data.map(d => Number(d?.[valueKey]) || 0));
  const max = isFinite(rawMax) && rawMax > 0 ? rawMax : 1;
  const n = Math.max(1, data.length);
  const slot = chartW / n;
  const barW = Math.max(4, Math.min(32, slot * 0.5));

  const bars = data.map((d, i) => {
    const val = Math.max(0, Number(d?.[valueKey]) || 0);
    const barHeight = Math.max(2, Math.min(chartH, (val / max) * chartH));
    const x = Number((padL + i * slot + (slot - barW) / 2).toFixed(2));
    const y = Number((padT + chartH - barHeight).toFixed(2));
    const barFill = d?.fill || color;
    return (
      <G key={i}>
        <Rect x={x} y={y} width={barW} height={barHeight} rx={2} fill={barFill} />
        <SvgText
          x={Number((x + barW / 2).toFixed(2))} y={Math.max(8, y - 4)} fontSize={8.5} fill="#f8fafc" fontWeight="bold" textAnchor="middle"
        >{val}</SvgText>
        <SvgText
          x={Number((x + barW / 2).toFixed(2))} y={h - 8} fontSize={7.5} fill="#94a3b8" textAnchor="middle"
        >{String(d?.[labelKey] || '').slice(0, 14)}</SvgText>
      </G>
    );
  });

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Line x1={padL} y1={padT + chartH} x2={w - padR} y2={padT + chartH} stroke="#334155" strokeWidth={0.75} />
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <Line key={i} x1={padL} y1={Number((padT + chartH - f * chartH).toFixed(2))} x2={w - padR} y2={Number((padT + chartH - f * chartH).toFixed(2))} stroke="#1e293b" strokeWidth={0.5} strokeDasharray="2 2" />
      ))}
      {bars}
    </Svg>
  );
}

// ── Simple line chart ─────────────────────────────────────────────────────────
export function VLineChart({ data, width = 680, height = 135, stroke = '#f97316', labelKey = 'date', valueKey = 'avg' }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const w = Math.max(20, Number(width) || 680);
  const h = Math.max(20, Number(height) || 135);
  const padL = 26, padR = 10, padT = 12, padB = 24;
  const chartW = Math.max(10, w - padL - padR);
  const chartH = Math.max(10, h - padT - padB);
  const rawMax = Math.max(0, ...data.map(d => Number(d?.[valueKey]) || 0));
  const max = isFinite(rawMax) && rawMax > 0 ? rawMax : 1;
  const n = data.length;

  let pts = [];
  let linePath = '';
  let areaPath = '';

  if (n === 1) {
    const singleVal = Math.max(0, Number(data[0]?.[valueKey]) || 0);
    const yVal = Number((padT + chartH - Math.min(chartH, (singleVal / max) * chartH)).toFixed(2));
    const xVal = Number((padL + chartW / 2).toFixed(2));
    pts = [{ x: xVal, y: yVal }];
    linePath = `M ${padL} ${yVal} L ${padL + chartW} ${yVal}`;
    areaPath = `M ${padL} ${yVal} L ${padL + chartW} ${yVal} L ${padL + chartW} ${padT + chartH} L ${padL} ${padT + chartH} Z`;
  } else {
    const step = chartW / Math.max(1, n - 1);
    pts = data.map((d, i) => {
      const val = Math.max(0, Number(d?.[valueKey]) || 0);
      const px = Number((padL + i * step).toFixed(2));
      const py = Number((padT + chartH - Math.min(chartH, (val / max) * chartH)).toFixed(2));
      return { x: px, y: py };
    });
    linePath = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
    areaPath = `${linePath} L ${pts[pts.length - 1].x} ${padT + chartH} L ${pts[0].x} ${padT + chartH} Z`;
  }

  const xTicks = [];
  const tickStep = Math.max(1, Math.ceil(n / 7));
  for (let i = 0; i < n; i += tickStep) {
    xTicks.push(i);
  }

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Line x1={padL} y1={padT + chartH} x2={w - padR} y2={padT + chartH} stroke="#334155" strokeWidth={0.75} />
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <Line key={i} x1={padL} y1={Number((padT + chartH - f * chartH).toFixed(2))} x2={w - padR} y2={Number((padT + chartH - f * chartH).toFixed(2))} stroke="#1e293b" strokeWidth={0.5} strokeDasharray="2 2" />
      ))}
      <Path d={areaPath} fill={stroke} fillOpacity={0.15} />
      <Path d={linePath} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={stroke} />
      ))}
      {xTicks.map((i) => (
        <G key={i}>
          <SvgText x={pts[i]?.x ?? padL} y={h - 8} fontSize={7.5} fill="#94a3b8" textAnchor="middle">
            {String(data[i]?.[labelKey] || '')}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}

// ── Horizontal bar row (rankings & categorical bars) ───────────────────────────
export function VHBarList({ data, width = 320, barHeight = 15, color = '#4f46e5', labelKey = 'name', valueKey = 'value', maxItems = 8, valueFormat }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const list = data.slice(0, maxItems);
  if (list.length === 0) return null;
  const w = Math.max(20, Number(width) || 320);
  const rawMax = Math.max(0, ...list.map(d => Number(d?.[valueKey]) || 0));
  const max = isFinite(rawMax) && rawMax > 0 ? rawMax : 1;
  const bh = Math.max(8, Number(barHeight) || 15);
  const rowH = bh + 10;
  const h = Math.max(20, list.length * rowH + 6);
  const labelW = Math.min(120, Math.max(40, w * 0.35));
  const maxBarWidth = Math.max(10, w - labelW - 36);

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {list.map((d, i) => {
        const y = Number((4 + i * rowH).toFixed(2));
        const barFill = d?.fill || color;
        const val = Math.max(0, Number(d?.[valueKey]) || 0);
        const bw = Math.max(4, Math.min(maxBarWidth, (val / max) * maxBarWidth));
        return (
          <G key={i}>
            <SvgText x={0} y={Number((y + bh / 2 + 3).toFixed(2))} fontSize={8} fill="#cbd5e1" textAnchor="start">
              {String(d?.[labelKey] || '').slice(0, 22)}
            </SvgText>
            <Rect x={labelW} y={y} width={bw} height={bh} rx={3} fill={barFill} />
            <SvgText x={Number((labelW + bw + 6).toFixed(2))} y={Number((y + bh / 2 + 3).toFixed(2))} fontSize={8.5} fill="#f8fafc" fontWeight="bold">
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
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const total = data.reduce((s, d) => s + (Math.max(0, Number(d?.value) || Number(d?.count) || 0)), 0);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
      {data.map((d, i) => {
        const val = Math.max(0, Number(d?.value) || Number(d?.count) || 0);
        const pct = isFinite(total) && total > 0 ? Math.round((val / total) * 100) : 0;
        const swatchColor = (colors && colors[i]) || d?.fill || '#3b82f6';
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6, marginBottom: 2 }}>
            <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: swatchColor, marginRight: 4 }} />
            <Text style={{ fontSize: 7.5, color: '#cbd5e1' }}>
              {String(d?.name || '').slice(0, 20)}
            </Text>
            <Text style={{ fontSize: 7, color: '#94a3b8', marginLeft: 3 }}>
              ({val}{total > 0 ? ` (${pct}%)` : ''})
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
  const safePct = isFinite(Number(pct)) ? Math.min(Math.max(Number(pct), 0), 100) : 0;
  let lower = MTTR_STOPS[0], upper = MTTR_STOPS[MTTR_STOPS.length - 1];
  for (let i = 0; i < MTTR_STOPS.length - 1; i++) {
    if (safePct >= MTTR_STOPS[i].p && safePct <= MTTR_STOPS[i + 1].p) { lower = MTTR_STOPS[i]; upper = MTTR_STOPS[i + 1]; break; }
  }
  const range = (upper.p - lower.p) || 1;
  const r = (safePct - lower.p) / range;
  const ch = (n) => Math.round(lower.c[n] + r * (upper.c[n] - lower.c[n]));
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
};

export function VGauge({ pct = 0, size = 140, title, goodLabel = 'Resolved', badLabel = 'Open', goodCount, badCount }) {
  const s = Math.max(30, Number(size) || 140);
  const numPct = Number(pct);
  const p = isFinite(numPct) ? Math.min(Math.max(numPct, 0), 100) : 0;
  const cx = s / 2;
  const cy = s - 12;
  const R = Math.max(5, s / 2 - 12);
  const L = Math.max(2, R - 6);

  const pt = (deg) => {
    const a = (deg * Math.PI) / 180;
    return [Number((cx + R * Math.cos(a)).toFixed(2)), Number((cy - R * Math.sin(a)).toFixed(2))];
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
    return [Number((cx + L * Math.cos(a)).toFixed(2)), Number((cy - L * Math.sin(a)).toFixed(2))];
  })();
  const needleColor = mttrColor(p);

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
        {segs.map((seg, i) => (
          <Path key={i} d={arcSeg(seg.d0, seg.d1)} fill="none" stroke={seg.color} strokeWidth={12} strokeLinecap="round" />
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
  if (!segments || !Array.isArray(segments) || segments.length === 0) return null;
  const w = Math.max(20, Number(width) || 320);
  const h = Math.max(4, Number(height) || 14);
  const activeSegments = segments.filter(seg => (Number(seg?.value) || 0) > 0);
  const total = activeSegments.reduce((s, seg) => s + (Math.max(0, Number(seg?.value) || 0)), 0);
  if (!isFinite(total) || total <= 0) return null;

  let currentX = 0;
  const rects = activeSegments.map((seg, i) => {
    const val = Math.max(0, Number(seg?.value) || 0);
    const segW = Math.max(1, (val / total) * w);
    const x = currentX;
    currentX += segW;
    return (
      <Rect key={i} x={x} y={0} width={segW} height={h} fill={seg?.fill || '#3b82f6'} rx={i === 0 || i === activeSegments.length - 1 ? 2 : 0} />
    );
  });

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {rects}
    </Svg>
  );
}

// ── Score progress bar with label ─────────────────────────────────────────────
export function VScoreBar({ label, value, max = 100, color = '#10b981', sub, width = 680, height = 12 }) {
  const v = Math.max(0, Number(value) || 0);
  const m = Math.max(1, Number(max) || 100);
  const pct = Math.min(Math.max((v / m) * 100, 0), 100);
  const w = Math.max(20, Number(width) || 680);
  const h = Math.max(4, Number(height) || 12);
  const fillW = Math.max(0, Math.min(w, (pct / 100) * w));
  const radius = Math.min(h / 2, 6);

  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 8.5, fontWeight: 700, color: '#e2e8f0' }}>{label}</Text>
        <Text style={{ fontSize: 8.5, fontWeight: 800, color }}>{Math.round(pct)}%</Text>
      </View>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Rect x={0} y={0} width={w} height={h} rx={radius} fill="#334155" />
        {fillW > 0 && <Rect x={0} y={0} width={fillW} height={h} rx={radius} fill={color} />}
      </Svg>
      {sub && <Text style={{ fontSize: 7.5, color: '#94a3b8', marginTop: 4 }}>{sub}</Text>}
    </View>
  );
}
