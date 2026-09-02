import React from 'react';
import { Svg, Path, Rect, Circle, Line, G, Polygon, Text as SvgText, View, Text } from '@react-pdf/renderer';

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

// ── Zoho status-count cards ───────────────────────────────────────────────────
export function ZohoCountCards({ cards = [] }) {
  if (!cards.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {cards.slice(0).map((c, i) => (
        <View key={i} style={{
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, minWidth: 56,
        }}>
          <Text style={{ fontSize: 16, fontWeight: 700, color: c.color || '#111827' }}>{c.value}</Text>
          <Text style={{ fontSize: 7, color: '#6b7280', marginTop: 2 }}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Heatmap (7 days × 24 hours) ───────────────────────────────────────────────
export function VHeatmap({ matrix = [], max = 1, dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }) {
  if (!matrix.length) return null;
  const cell = 9;
  const gap = 1.5;
  const cellColor = (v) => {
    if (!v) return '#f3f4f6';
    const r = Math.round(255 - (v / max) * (255 - 59));
    const g = Math.round(255 - (v / max) * (255 - 130));
    const b = Math.round(255 - (v / max) * (255 - 246));
    return `rgb(${r},${g},${b})`;
  };
  return (
    <View style={{ flexDirection: 'column' }}>
      <View style={{ flexDirection: 'row', marginBottom: 2 }}>
        <View style={{ width: 22 }} />
        {Array.from({ length: 24 }).map((_, h) => (
          <Text key={h} style={{ width: cell + gap, fontSize: 4.5, color: '#9ca3af', textAlign: 'center' }}>{h % 6 === 0 ? h : ''}</Text>
        ))}
      </View>
      {matrix.map((row, d) => (
        <View key={d} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: gap }}>
          <Text style={{ width: 22, fontSize: 5.5, color: '#6b7280' }}>{dayNames[d] || d}</Text>
          {row.map((v, h) => (
            <View key={h} style={{ width: cell, height: cell, backgroundColor: cellColor(v), marginRight: gap, borderRadius: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Funnel (status stages) ────────────────────────────────────────────────────
export function VFunnel({ stages = [], counts = {}, max = 1, colors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e'] }) {
  if (!stages.length) return null;
  const width = 260;
  return (
    <View style={{ flexDirection: 'column', width }}>
      {stages.map((s, i) => {
        const v = counts[s] || 0;
        const w = Math.max(6, (v / max) * width);
        return (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
            <Text style={{ width: 56, fontSize: 6.5, color: '#6b7280' }}>{s}</Text>
            <View style={{ width: w, height: 12, backgroundColor: colors[i % colors.length], borderRadius: 2 }} />
            <Text style={{ fontSize: 6.5, color: '#374151', marginLeft: 4 }}>{v}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Corporation Assignee Distribution (circle pack) ──────────────────────────
// Faithful, PDF-safe recreation of the dashboard Circlemember component:
// one card per corporation, each showing assignee "bubbles" sized by ticket count
// plus the corporation name.
export function VCorpMember({ corps = [], size = 220 }) {
  if (!Array.isArray(corps) || corps.length === 0) return null;
  const initials = (name) => {
    if (!name || name === 'Unassigned') return 'UA';
    return name.trim().split(/\s+/).filter(Boolean).map(w => (w[0] || '').toUpperCase()).join('').slice(0, 2);
  };
  const ASSIGNEE_COLORS = ['#e84a3a', '#e06050', '#d04040', '#e07060', '#d05545', '#e04030'];

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {corps.map((corp, ci) => {
        const assignees = (corp.assignees || []).slice().sort((a, b) => b.count - a.count);
        const maxC = Math.max(1, ...assignees.map(a => a.count));
        return (
          <View key={corp.corporation || ci} style={{
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: '#fdf4f2', borderWidth: 1.5, borderColor: 'rgba(220,100,80,0.30)',
            alignItems: 'center', justifyContent: 'center', padding: 6,
          }}>
            <Text style={{ position: 'absolute', top: size / 2 - 12, fontSize: 8, fontWeight: 700, color: '#c04030', textAlign: 'center', width: size - 12 }}>{corp.corporation}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 14 }}>
              {assignees.length === 0 ? (
                <Text style={{ fontSize: 7, color: '#9ca3af' }}>No assignees</Text>
              ) : assignees.map((a, ai) => {
                const r = 14 + Math.round((a.count / maxC) * 12);
                return (
                  <View key={a.name || ai} style={{
                    width: r * 2, height: r * 2, borderRadius: r,
                    backgroundColor: ASSIGNEE_COLORS[ai % ASSIGNEE_COLORS.length],
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: Math.max(6, r * 0.5), fontWeight: 800, color: '#fff' }}>{initials(a.name)}</Text>
                    <Text style={{ fontSize: 5, color: 'rgba(255,255,255,0.9)' }}>{a.count}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Volcano (hour-bucket bar chart) ───────────────────────────────────────────
export function VVolcano({ buckets = [], max = 1, height = 160, width = 300 }) {
  if (!buckets.length) return null;
  const n = buckets.length;
  const gap = 2;
  const bw = (width - (n - 1) * gap) / n;
  return (
    <Svg width={width} height={height}>
      {buckets.map((b, i) => {
        const h = Math.max(0, (b.value / max) * (height - 14));
        const x = i * (bw + gap);
        const y = height - h - 12;
        return (
          <G key={i}>
            <Rect x={x} y={y} width={bw} height={h} fill="#6366f1" rx={1} />
            {(i % 3 === 0 || i === n - 1) && (
              <SvgText x={x + bw / 2} y={height - 3} fontSize={5} fill="#9ca3af" textAnchor="middle">{b.hour}</SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}

// ── Top performers table ──────────────────────────────────────────────────────
export function VTopTable({ rows = [], headers = [] }) {
  if (!rows.length) return <Text style={{ fontSize: 8, color: '#9ca3af' }}>No data available</Text>;
  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 3, marginBottom: 3 }}>
        {headers.map((h, i) => (
          <Text key={i} style={{ flex: i === 0 ? 2 : 1, fontSize: 6.5, fontWeight: 700, color: '#6b7280' }}>{h}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.5, borderColor: '#f3f4f6' }}>
          <Text style={{ flex: 2, fontSize: 6.5, color: '#374151' }}>{r.engineer || '—'}</Text>
          <Text style={{ flex: 1, fontSize: 6.5, color: '#374151' }}>{r.closed ?? '—'}</Text>
          <Text style={{ flex: 1, fontSize: 6.5, color: '#374151' }}>{r.score ?? '—'}</Text>
          <Text style={{ flex: 1, fontSize: 6.5, color: '#374151' }}>{r.hours ?? '—'}</Text>
        </View>
      ))}
    </View>
  );
}

// ── MTTR score card ───────────────────────────────────────────────────────────
export function VMttrCard({ avg = 0, score = 0, scoreColor = '#22c55e' }) {
  return (
    <View style={{ flexDirection: 'column', alignItems: 'center' }}>
      <View style={{
        width: 64, height: 64, borderRadius: 32, borderWidth: 5, borderColor: scoreColor,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 18, fontWeight: 800, color: scoreColor }}>{score}</Text>
      </View>
      <Text style={{ fontSize: 7, color: '#6b7280', marginTop: 4 }}>Avg {avg}h</Text>
    </View>
  );
}

// ── Radar / spider chart ───────────────────────────────────────────────────────
// A multivariate "posture" view — each axis is a 0–100 normalised metric. Distinct
// from the donut/bar vocabulary used elsewhere. Draws concentric grid rings, axis
// spokes, the filled data polygon, and labelled vertices.
export function VRadar({ axes = [], size = 200, color = '#4f46e5', max = 100, levels = 4 }) {
  if (!axes || axes.length < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 30; // leave room for vertex labels
  const n = axes.length;
  const step = (Math.PI * 2) / n;
  // Angle starts at the top (-90°) and goes clockwise.
  const ang = (i) => -Math.PI / 2 + i * step;
  const pt = (i, rad) => [cx + rad * Math.cos(ang(i)), cy + rad * Math.sin(ang(i))];

  const ring = (frac) =>
    axes.map((_, i) => pt(i, R * frac).join(',')).join(' ');

  const dataPts = axes.map((a, i) => {
    const v = Math.min(Math.max((Number(a.value) || 0) / (max || 100), 0), 1);
    return pt(i, R * v);
  });
  const dataPoly = dataPts.map(p => p.join(',')).join(' ');

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Concentric grid rings */}
      {Array.from({ length: levels }).map((_, l) => {
        const frac = (l + 1) / levels;
        return <Polygon key={l} points={ring(frac)} fill="none" stroke={GRID_GRAY} strokeWidth={0.6} />;
      })}
      {/* Axis spokes */}
      {axes.map((_, i) => {
        const [x, y] = pt(i, R);
        return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={AXIS_GRAY} strokeWidth={0.6} />;
      })}
      {/* Data polygon */}
      <Polygon points={dataPoly} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      {dataPts.map((p, i) => (
        <Circle key={i} cx={p[0]} cy={p[1]} r={2} fill={color} />
      ))}
      {/* Vertex labels */}
      {axes.map((a, i) => {
        const [x, y] = pt(i, R + 16);
        const anchor = Math.abs(x - cx) < 6 ? 'middle' : (x > cx ? 'start' : 'end');
        return (
          <SvgText key={i} x={x} y={y + 2.5} fontSize={6.5} fill={LABEL_GRAY} textAnchor={anchor}>
            {String(a.label).slice(0, 14)}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ── Stacked 100% composition bar ───────────────────────────────────────────────
// Shows part-to-whole share across segments of one measure (e.g. threat
// classification mix). Distinct from the ranked HBar list. Renders one full-width
// segmented bar plus an inline percentage legend.
export function VStackedBar({ segments = [], width = 320, height = 18, gap = 1.5 }) {
  if (!segments.length) return null;
  const total = segments.reduce((s, d) => s + (Number(d.value) || 0), 0) || 1;
  let x = 0;
  return (
    <View style={{ width }}>
      <View style={{ flexDirection: 'row', width, height, borderRadius: 4, overflow: 'hidden' }}>
        {segments.map((d, i) => {
          const w = Math.max(0, (Number(d.value) || 0) / total * (width - gap * (segments.length - 1)));
          const fill = d.fill || (d.color) || '#3b82f6';
          const el = (
            <View key={i} style={{ width: w, height, backgroundColor: fill, marginRight: i < segments.length - 1 ? gap : 0 }} />
          );
          x += w + (i < segments.length - 1 ? gap : 0);
          return el;
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
        {segments.map((d, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: d.fill || d.color || '#3b82f6', marginRight: 3 }} />
            <Text style={{ fontSize: 6.5, color: LABEL_GRAY }}>
              {String(d.label || d.name).slice(0, 20)} · {Math.round((Number(d.value) || 0) / total * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Linear score meter ─────────────────────────────────────────────────────────
// A labelled horizontal progress meter (value / max). Reads as a "severity /
// score" gauge rather than a plot. Used for risk levels and severity mix.
export function VScoreBar({ label, value = 0, max = 100, color = '#4f46e5', sub, width = 300, height = 10 }) {
  const pct = max > 0 ? Math.min(Math.max((Number(value) || 0) / max, 0), 1) : 0;
  return (
    <View style={{ width, marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
        <Text style={{ fontSize: 7.5, color: '#374151', fontWeight: 600 }}>{label}</Text>
        <Text style={{ fontSize: 7.5, color: '#6b7280' }}>
          {value}{max !== 100 ? ` / ${max}` : ''}{' '}{Math.round(pct * 100)}%
        </Text>
      </View>
      <View style={{ width, height, backgroundColor: '#f1f5f9', borderRadius: height / 2 }}>
        <View style={{ width: `${pct * 100}%`, height, backgroundColor: color, borderRadius: height / 2 }} />
      </View>
      {sub ? <Text style={{ fontSize: 6.5, color: '#9ca3af', marginTop: 1 }}>{sub}</Text> : null}
    </View>
  );
}
