import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Orbital bubble chart that shows every integrated security tool as a clean,
// perfectly-proportioned bubble with live counts orbiting a central hub.
export default function ToolBubbleChart({ tools = [] }) {
  const navigate = useNavigate();
  const [hoveredKey, setHoveredKey] = useState(null);

  const valid = tools.filter((t) => t && t.value != null);
  const total = valid.reduce((s, t) => s + (Number(t.value) || 0), 0);
  const n = valid.length;

  const W = 460;
  const H = 340;
  const cx = W / 2;
  const cy = H / 2;
  const ringR = 120; // Radius of orbital guide ring

  // Smooth, balanced bubble radius (27px to 33px) to guarantee clean, unclipped text
  const minR = 27;
  const maxR = 33;
  const radiusOf = (v) => {
    if (total <= 0 || n === 0) return minR;
    const ratio = Math.max(0, Math.min(1, v / total));
    // Log-like curve so smaller tools still get adequate text area
    return Math.round(minR + Math.pow(ratio, 0.4) * (maxR - minR));
  };

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN');

  const outer = valid.map((t, i) => {
    const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = radiusOf(t.value);
    return {
      ...t,
      r,
      x: cx + ringR * Math.cos(ang),
      y: cy + ringR * Math.sin(ang),
    };
  });

  return (
    <div className="w-full h-full flex items-center justify-center bg-white dark:bg-[#0b1329] rounded-xl p-2 select-none overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full max-h-[360px] block"
        style={{ filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))' }}
      >
        <defs>
          {/* Central Hub Gradient */}
          <radialGradient id="centerHubGrad" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#312e81" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </radialGradient>

          {/* Dynamic Tool Bubble Gradients */}
          {outer.map((t) => (
            <radialGradient key={`grad-${t.key}`} id={`grad-${t.key}`} cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="70%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#090d1a" />
            </radialGradient>
          ))}
        </defs>

        {/* Orbit track guide */}
        <circle
          cx={cx}
          cy={cy}
          r={ringR}
          fill="none"
          stroke="currentColor"
          className="text-slate-300 dark:text-slate-700"
          strokeWidth="1.2"
          strokeDasharray="4 4"
          opacity="0.8"
        />

        {/* Connecting spokes from center to each tool node */}
        {outer.map((t) => {
          const isHovered = hoveredKey === t.key;
          return (
            <line
              key={t.key + '-spoke'}
              x1={cx}
              y1={cy}
              x2={t.x}
              y2={t.y}
              stroke={isHovered ? t.color : 'currentColor'}
              className={isHovered ? '' : 'text-slate-300 dark:text-slate-700'}
              strokeWidth={isHovered ? 1.5 : 1}
              strokeDasharray={isHovered ? 'none' : '3 4'}
              opacity={isHovered ? 0.9 : 0.6}
            />
          );
        })}

        {/* Central Total Hub */}
        <g
          onClick={() => navigate('/dashboard/detail', { state: { dataset: 'threats', filterId: 'all', title: 'All Integrated Security Telemetry' } })}
          className="cursor-pointer group"
        >
          {/* Ambient Glow */}
          <circle cx={cx} cy={cy} r={48} fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.25" className="group-hover:opacity-60 transition-opacity" />
          {/* Main Core */}
          <circle cx={cx} cy={cy} r={44} fill="url(#centerHubGrad)" stroke="#38bdf8" strokeWidth="2.2" className="group-hover:stroke-sky-300 transition-colors" />
          {/* Labels */}
          <text x={cx} y={cy - 10} textAnchor="middle" fill="#38bdf8" fontSize="9" fontWeight="700" letterSpacing="0.14em">
            TOTAL
          </text>
          <text x={cx} y={cy + 7} textAnchor="middle" fill="#ffffff" fontSize="20" fontWeight="800" letterSpacing="-0.02em">
            {fmt(total)}
          </text>
          <text x={cx} y={cy + 21} textAnchor="middle" fill="#94a3b8" fontSize="8.5" fontWeight="500">
            records · {n} tools
          </text>
        </g>

        {/* Orbiting Tool Bubbles */}
        {outer.map((t) => {
          const isHovered = hoveredKey === t.key;
          const currentR = isHovered ? t.r + 2 : t.r;

          return (
            <g
              key={t.key}
              onMouseEnter={() => setHoveredKey(t.key)}
              onMouseLeave={() => setHoveredKey(null)}
              onClick={() => t.path && navigate(t.path, { state: t.state })}
              className="cursor-pointer group"
              style={{ transformOrigin: `${t.x}px ${t.y}px` }}
            >
              {/* Outer decorative aura ring */}
              <circle
                cx={t.x}
                cy={t.y}
                r={currentR + 4}
                fill="none"
                stroke={t.color}
                strokeWidth={isHovered ? 2 : 1.2}
                opacity={isHovered ? 0.9 : 0.45}
                className="transition-all duration-200"
              />

              {/* Main bubble body */}
              <circle
                cx={t.x}
                cy={t.y}
                r={currentR}
                fill={`url(#grad-${t.key})`}
                stroke={t.color}
                strokeWidth={isHovered ? 2.5 : 1.8}
                className="transition-all duration-200"
              />

              {/* Inner soft accent glow badge */}
              <circle
                cx={t.x}
                cy={t.y}
                r={currentR - 3}
                fill={t.color}
                opacity={isHovered ? 0.22 : 0.12}
                className="transition-all duration-200"
              />

              {/* Metric Count Number (Cleanly positioned on top half) */}
              <text
                x={t.x}
                y={t.y - 3}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={t.value > 9999 ? '11.5' : '13'}
                fontWeight="800"
                letterSpacing="-0.01em"
              >
                {fmt(t.value)}
              </text>

              {/* Tool Name Label (Cleanly positioned on bottom half, well within the bubble) */}
              <text
                x={t.x}
                y={t.y + 11}
                textAnchor="middle"
                fill={t.color}
                fontSize="9"
                fontWeight="700"
                letterSpacing="0.05em"
                style={{ textTransform: 'uppercase' }}
              >
                {t.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
