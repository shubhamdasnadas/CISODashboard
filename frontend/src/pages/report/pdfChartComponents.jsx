import React from 'react';
import { Svg, Path, Rect, Circle, Line, G, Text as SvgText, View, Text } from '@react-pdf/renderer';

// Minimal vector chart primitives built directly on react-pdf <Svg>.
// No Chart.js, no canvas, no raster — crisp at any zoom.

const AXIS_GRAY = '#9ca3af';
const GRID_GRAY = '#f3f4f6';
const LABEL_GRAY = '#6b7280';

// ── Donut chart ───────────────────────────────────────────────────────────────
// react-pdf has no reliable "transparent" fill — empty SVG areas render BLACK.
// So we draw a full pie then overlay a WHITE center circle (matching the page
// background) to carve out the hole. This guarantees a white center, never black.
export function VDonut({ data, width = 180, height = 150, thickness = 22, colors }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  if (total <= 0) return null;

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 2;
  const innerR = r - thickness;
  const pageWhite = '#ffffff';

  // Full pie sector from the center to the outer radius.
  const sector = (a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
  };

  let angle = -Math.PI / 2;
  const segments = data.map((d, i) => {
    const frac = (d.value || 0) / total;
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
  });

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {segments}
      {/* White center hole — never "transparent" (that renders black in react-pdf). */}
      <Circle cx={cx} cy={cy} r={innerR} fill={pageWhite} stroke={pageWhite} strokeWidth={0} />
    </Svg>
  );
}

// ── Simple vertical bar chart ─────────────────────────────────────────────────
export function VBarChart({ data, width = 320, height = 180, color = '#4f46e5', labelKey = 'name', valueKey = 'value' }) {
  if (!data || data.length === 0) return null;
  const padL = 8, padR = 20, padT = 12, padB = 30;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  const n = data.length;
  const slot = chartW / n;
  const barW = Math.max(4, Math.min(36, slot * 0.55));

  const bars = data.map((d, i) => {
    const h = Math.max(2, (Number(d[valueKey]) || 0) / max * chartH);
    const x = padL + i * slot + (slot - barW) / 2;
    const y = padT + chartH - h;
    return (
      <G key={i}>
        <Rect x={x} y={y} width={barW} height={h} rx={2} fill={color} />
        <SvgText
          x={x + barW / 2} y={y - 4} fontSize={9} fill={LABEL_GRAY} textAnchor="middle"
        >{d[valueKey]}</SvgText>
        <SvgText
          x={x + barW / 2} y={height - 10} fontSize={8} fill={LABEL_GRAY} textAnchor="middle"
        >{String(d[labelKey]).slice(0, 6)}</SvgText>
      </G>
    );
  });

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Line x1={padL} y1={padT + chartH} x2={width - padR} y2={padT + chartH} stroke={AXIS_GRAY} strokeWidth={0.5} />
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <Line key={i} x1={padL} y1={padT + chartH - f * chartH} x2={width - padR} y2={padT + chartH - f * chartH} stroke={GRID_GRAY} strokeWidth={0.5} strokeDasharray="2 2" />
      ))}
      {bars}
    </Svg>
  );
}

// ── Simple line chart ─────────────────────────────────────────────────────────
export function VLineChart({ data, width = 320, height = 160, stroke = '#f97316', labelKey = 'date', valueKey = 'avg', valueFormat }) {
  if (!data || data.length === 0) return null;
  const padL = 26, padR = 10, padT = 10, padB = 24;
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
      <Line x1={padL} y1={padT + chartH} x2={width - padR} y2={padT + chartH} stroke={AXIS_GRAY} strokeWidth={0.5} />
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <Line key={i} x1={padL} y1={padT + chartH - f * chartH} x2={width - padR} y2={padT + chartH - f * chartH} stroke={GRID_GRAY} strokeWidth={0.5} strokeDasharray="2 2" />
      ))}
      <Path d={areaPath} fill={stroke} fillOpacity={0.12} />
      <Path d={linePath} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={stroke} />
      ))}
      {xTicks.map((i) => (
        <SvgText key={i} x={pts[i].x} y={height - 8} fontSize={7.5} fill={LABEL_GRAY} textAnchor="middle">
          {String(data[i][labelKey])}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Horizontal bar row (rankings) ────────────────────────────────────────────
export function VHBarList({ data, width = 320, barHeight = 16, color = '#4f46e5', labelKey = 'name', valueKey = 'value', maxItems = 8 }) {
  if (!data || data.length === 0) return null;
  const list = data.slice(0, maxItems);
  const max = Math.max(...list.map(d => Number(d[valueKey]) || 0), 1);
  const rowH = barHeight + 10;
  const height = list.length * rowH + 6;
  const labelW = Math.min(150, width * 0.42);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {list.map((d, i) => {
        const y = 4 + i * rowH;
        const bw = Math.max(2, (Number(d[valueKey]) || 0) / max * (width - labelW - 30));
        return (
          <G key={i}>
            <SvgText x={0} y={y + barHeight / 2 + 1} fontSize={8} fill={LABEL_GRAY} textAnchor="start" style={{ fontFamily: 'Helvetica' }}>
              {String(d[labelKey]).slice(0, 28)}
            </SvgText>
            <Rect x={labelW} y={y} width={bw} height={barHeight} rx={2} fill={color} />
            <SvgText x={labelW + bw + 6} y={y + barHeight / 2 + 1} fontSize={8.5} fill="#374151" fontWeight="bold">
              {d[valueKey]}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── Legend for donuts ─────────────────────────────────────────────────────────
export function VLegendRow({ data, colors, stacked = true }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + (d.value || 0), 0) || 1;
  if (stacked) {
    return (
      <View style={{ flexDirection: 'column', marginTop: 6 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: (colors && colors[i]) || d.fill || '#3b82f6', marginRight: 6 }} />
            <Text style={{ fontSize: 8, color: LABEL_GRAY }}>
              {String(d.name).slice(0, 30)} — {d.value} ({Math.round((d.value / total) * 100)}%)
            </Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
      {data.map((d, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: (colors && colors[i]) || d.fill || '#3b82f6', marginRight: 4 }} />
          <Text style={{ fontSize: 8, color: LABEL_GRAY }}>
            {String(d.name).slice(0, 26)} ({d.value} · {Math.round((d.value / total) * 100)}%)
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── Semicircle gauge (MTTR / compliance health) ───────────────────────────────
// PDF-native analogue of the DOM CyberHygen MTTR widgets. No fetch, no hooks —
// the percentage is passed in, so it renders synchronously inside react-pdf.
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

export function VGauge({ pct = 0, size = 150, title, goodLabel = 'Resolved', badLabel = 'Open', goodCount, badCount }) {
  const p = Math.min(Math.max(pct, 0), 100);
  const cx = size / 2;
  const cy = size - 12;
  const R = size / 2 - 12;
  const L = R - 6;

  // Point on the upper semicircle for a given degree (0=right, 180=left).
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
      </Svg>
      <Text style={{ fontSize: 15, fontWeight: 800, color: needleColor, marginTop: 2 }}>{Math.round(p)}%</Text>
      {title ? <Text style={{ fontSize: 8, fontWeight: 700, color: '#374151', marginTop: 2, textAlign: 'center' }}>{title}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: '#2ED573', marginRight: 3 }} />
          <Text style={{ fontSize: 7, color: '#6b7280' }}>{goodLabel}{goodCount !== undefined && goodCount !== '' ? ` (${goodCount})` : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: '#FF4757', marginRight: 3 }} />
          <Text style={{ fontSize: 7, color: '#6b7280' }}>{badLabel}{badCount !== undefined && badCount !== '' ? ` (${badCount})` : ''}</Text>
        </View>
      </View>
    </View>
  );
}