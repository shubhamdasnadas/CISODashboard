import { useMemo, useState } from 'react';

const FUNNEL_STATUSES = [
  'Open', 'Re-Open', 'Acknowledge', 'WIP', 'On Hold', 'On Hold by Customer',
  'Revert Awaited - Customer', 'Revert Awaited - OEM', 'Revert Awaited - Vendor',
  'Escalated', 'Technically Closed', 'Duplicate', 'Closed',
];

const SLICE_COLORS = [
  '#F6D365', '#F4A460', '#C8A2C8', '#B0C4DE', '#9B7FC7', '#8470A8',
  '#6B8E6B', '#4CAF50', '#3E9C42', '#2E7D32', '#E57373', '#880E4F', '#D32F2F',
];

const SVG_W = 900, SVG_H = 680;
const FUNNEL_TOP_Y = 30, FUNNEL_BOT_Y = 490;
const FUNNEL_TOP_HALF_W = 180, FUNNEL_NECK_HALF_W = 40;
const STEM_H = 130, STEM_HALF_W = 40;
const CX = SVG_W / 2;
const LABEL_MARGIN = 20;
const LABEL_COL_X_R = CX + FUNNEL_TOP_HALF_W + LABEL_MARGIN + 80;
const LABEL_COL_X_L = CX - FUNNEL_TOP_HALF_W - LABEL_MARGIN - 80;

function edgeX(y) {
  const t = (y - FUNNEL_TOP_Y) / (FUNNEL_BOT_Y - FUNNEL_TOP_Y);
  return FUNNEL_TOP_HALF_W - t * (FUNNEL_TOP_HALF_W - FUNNEL_NECK_HALF_W);
}

function buildSlices(counts) {
  const active = counts.filter(c => c.count > 0);
  if (!active.length) return [];
  const total   = active.reduce((s, c) => s + c.count, 0);
  const funnelH = FUNNEL_BOT_Y - FUNNEL_TOP_Y;
  let currentY  = FUNNEL_TOP_Y;
  return active.map(item => {
    const sliceH   = (item.count / total) * funnelH;
    const statusIdx = FUNNEL_STATUSES.indexOf(item.status);
    const slice = { status: item.status, count: item.count, color: SLICE_COLORS[statusIdx] ?? '#aaa', y1: currentY, y2: currentY + sliceH };
    currentY += sliceH;
    return slice;
  });
}

function slicePath(y1, y2) {
  const lx1 = CX - edgeX(y1), rx1 = CX + edgeX(y1);
  const lx2 = CX - edgeX(y2), rx2 = CX + edgeX(y2);
  return `M ${lx1} ${y1} L ${rx1} ${y1} L ${rx2} ${y2} L ${lx2} ${y2} Z`;
}

export default function Funneldiagram({ tickets = [], loading = false, onSliceClick }) {
  const [tooltip, setTooltip]   = useState(null);

  const statusCounts = useMemo(() => {
    const counts = {};
    FUNNEL_STATUSES.forEach(s => (counts[s] = 0));
    tickets.forEach(t => {
      const raw = String(t?.status || '').trim();
      const matched = FUNNEL_STATUSES.find(s => s.toLowerCase() === raw.toLowerCase());
      if (matched) counts[matched]++;
    });
    return FUNNEL_STATUSES.map(status => ({ status, count: counts[status] }));
  }, [tickets]);

  const slices   = useMemo(() => buildSlices(statusCounts), [statusCounts]);
  const stemColor = slices.length > 0 ? slices[slices.length - 1].color : '#D32F2F';

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '24px 12px 20px', fontFamily: "'Inter','Segoe UI',sans-serif", maxWidth: 960, margin: '0 auto', boxShadow: '0 2px 20px rgba(0,0,0,0.09)' }}>
      <h2 style={{ textAlign: 'center', fontWeight: 700, fontSize: 20, marginBottom: 12, color: '#1a1a2e', letterSpacing: 0.3 }}>Ticket Status Funnel</h2>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#888', fontSize: 15 }}>Loading tickets…</div>
      ) : (
        <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{ display: 'block', minWidth: 600 }}>
            {slices.map(s => (
              <path key={s.status} d={slicePath(s.y1, s.y2)} fill={s.color} stroke="#fff" strokeWidth={1.5} style={{ cursor: 'pointer' }}
                onClick={() => { if (s.count > 0 && onSliceClick) onSliceClick(s); }}
                onMouseEnter={e => {
                  const svg = e.target.ownerSVGElement;
                  const rect = svg.getBoundingClientRect();
                  const midY = (s.y1 + s.y2) / 2;
                  setTooltip({ x: CX * (rect.width / SVG_W) + rect.left, y: midY * (rect.height / SVG_H) + rect.top, status: s.status, count: s.count });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
            <rect x={CX - STEM_HALF_W} y={FUNNEL_BOT_Y} width={STEM_HALF_W * 2} height={STEM_H} fill={stemColor} rx={5} />
            {slices.map((s, i) => {
              const midY   = (s.y1 + s.y2) / 2;
              const isRight = i % 2 === 0;
              const ex     = edgeX(midY);
              const startX = isRight ? CX + ex : CX - ex;
              const elbowX = isRight ? CX + FUNNEL_TOP_HALF_W + LABEL_MARGIN : CX - FUNNEL_TOP_HALF_W - LABEL_MARGIN;
              const textColX = isRight ? LABEL_COL_X_R : LABEL_COL_X_L;
              return (
                <g key={`lbl-${s.status}`}>
                  <line x1={startX} y1={midY} x2={elbowX} y2={midY} stroke="#888" strokeWidth={1} />
                  <line x1={elbowX} y1={midY} x2={textColX} y2={midY} stroke="#888" strokeWidth={1} />
                  <circle cx={elbowX} cy={midY} r={2.5} fill="#888" />
                  <text x={isRight ? textColX + 6 : textColX - 6} y={midY + 5} fontSize={13} fontWeight={500} fill="#222" textAnchor={isRight ? 'start' : 'end'} fontFamily="'Inter','Segoe UI',sans-serif">
                    {s.status} : {s.count}
                  </text>
                </g>
              );
            })}
          </svg>
          {tooltip && (
            <div style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 22, background: 'rgba(15,15,25,0.90)', color: '#fff', padding: '7px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500, pointerEvents: 'none', zIndex: 9999, whiteSpace: 'nowrap', boxShadow: '0 3px 12px rgba(0,0,0,0.35)' }}>
              <strong>{tooltip.status}</strong>: {tooltip.count} ticket{tooltip.count !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {!loading && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 22, justifyContent: 'center', padding: '0 12px' }}>
          {statusCounts.filter(c => c.count > 0).map(c => {
            const idx = FUNNEL_STATUSES.indexOf(c.status);
            return (
              <div key={c.status} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: c.count > 0 ? 'pointer' : 'default' }}
                onClick={() => { if (c.count > 0 && onSliceClick) onSliceClick(c); }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: SLICE_COLORS[idx] ?? '#aaa', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#333', fontWeight: 500 }}>{c.status} ({c.count})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
