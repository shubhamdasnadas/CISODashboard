// Orbital bubble chart that shows every integrated tool as a bubble with its
// live count, orbiting a central "total" bubble — matching the All Tools card.

// tools: [{ key, label, value, color }]
export default function ToolBubbleChart({ tools = [] }) {
  const valid = tools.filter((t) => t && t.value != null);
  const total = valid.reduce((s, t) => s + (Number(t.value) || 0), 0);
  const n = valid.length;

  const W = 560;
  const H = 340;
  const cx = W / 2;
  const cy = H / 2;
  const ringR = 140; // radius of orbit ring (centre-to-centre of outer bubbles)

  // Outer bubble radius scales with value share (sqrt-based, capped).
  // Range ~20–40 px — no single bubble dominates or overlaps neighbours.
  const minR = 20, maxR = 40;
  const radiusOf = (v) => {
    if (total <= 0 || n === 0) return minR;
    const ratio = v / total;
    return Math.round(minR + Math.sqrt(ratio) * (maxR - minR));
  };

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN');

  const outer = valid.map((t, i) => {
    const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      ...t,
      r: radiusOf(t.value),
      x: cx + ringR * Math.cos(ang),
      y: cy + ringR * Math.sin(ang),
    };
  });

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', borderRadius: '8px', padding: '8px 4px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', maxHeight: 480, display: 'block' }}>
        <defs>
          <radialGradient id="toolBubbleEmptyGrad" cx="35%" cy="35%">
            <stop offset="0%" stopColor="#1e2c48" />
            <stop offset="100%" stopColor="#0f1a30" />
          </radialGradient>
        </defs>

        {/* orbit guide */}
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 5" />

        {/* connecting spokes */}
        {outer.map((t) => (
          <line key={t.key + '-spoke'} x1={cx} y1={cy} x2={t.x} y2={t.y} stroke="#1e293b" strokeWidth="1" strokeDasharray="2 4" />
        ))}

        {/* central total bubble */}
        <circle cx={cx} cy={cy} r={46} fill="url(#toolBubbleEmptyGrad)" stroke="#38bdf8" strokeWidth="2.5" />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#7dd3fc" fontSize="10" fontWeight="600" letterSpacing="0.12em">TOTAL</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill="#f1f5f9" fontSize="26" fontWeight="700">{fmt(total)}</text>
        <text x={cx} y={cy + 30} textAnchor="middle" fill="#94a3b8" fontSize="9">records · {n} tools</text>

        {/* outer tool bubbles */}
        {outer.map((t) => {
          const innerR = Math.max(t.r - 7, 4);
          return (
            <g key={t.key}>
              {/* matching ring */}
              <circle cx={t.x} cy={t.y} r={t.r + 5} fill="none" stroke={t.color} strokeWidth="1.5" opacity="0.6" />
              {/* bubble body */}
              <circle cx={t.x} cy={t.y} r={t.r} fill="#16233b" stroke={t.color} strokeWidth="2" />
              <circle cx={t.x - innerR * 0.3} cy={t.y - innerR * 0.3} r={innerR} fill={t.color} opacity="0.28" />
              {/* value */}
              <text x={t.x} y={t.y + 1} textAnchor="middle" fill="#f8fafc" fontSize="15" fontWeight="700">{fmt(t.value)}</text>
              <text x={t.x} y={t.y + (t.label.length > 12 ? 22 : 20)} textAnchor="middle" fill={t.color} fontSize="10" fontWeight="600" style={{ textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {t.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
