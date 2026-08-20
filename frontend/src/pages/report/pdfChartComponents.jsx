import React from 'react';
import { Svg, Path, Rect, Circle, Line, G, Text as SvgText, View, Text } from '@react-pdf/renderer';

// Minimal vector chart primitives built directly on react-pdf <Svg>.
// No Chart.js, no canvas, no raster — crisp at any zoom.

const AXIS_GRAY = '#9ca3af';
const GRID_GRAY = '#f3f4f6';
const LABEL_GRAY = '#6b7280';

// ── Donut chart ───────────────────────────────────────────────────────────────
export function VDonut({ data, width = 180, height = 150, thickness = 22, colors }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  if (total <= 0) return null;

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - thickness - 2;
  const innerR = r - thickness;
  const centerLabel = data[0]?.value;

  // Segment path: donut arc from a0 to a1
  const arc = (a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + innerR * Math.cos(a0), y0 = cy + innerR * Math.sin(a0);
    const x1 = cx + innerR * Math.cos(a1), y1 = cy + innerR * Math.sin(a1);
    const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
    const x3 = cx + r * Math.cos(a0), y3 = cy + r * Math.sin(a0);
    return `M ${x0} ${y0} A ${innerR} ${innerR} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`;
  };

  let angle = -Math.PI / 2;
  const segments = data.map((d, i) => {
    const frac = (d.value || 0) / total;
    const a1 = angle + frac * 2 * Math.PI;
    const seg = (
      <Path
        key={i}
        d={arc(angle, a1)}
        fill={colors && colors[i] ? colors[i] : d.fill || '#3b82f6'}
      />
    );
    angle = a1;
    return seg;
  });

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {segments}
      <Circle cx={cx} cy={cy} r={(innerR + r) / 2} fill="transparent" />
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

// ── Legend row for donuts ─────────────────────────────────────────────────────
export function VLegendRow({ data, colors, itemWidth }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + (d.value || 0), 0) || 1;
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