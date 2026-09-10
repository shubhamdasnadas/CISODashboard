import { useMemo, useEffect, useRef, useState } from 'react';

const CORP_COLORS = [
  { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.55)', label: '#fca5a5', glow: 'rgba(239, 68, 68, 0.25)' },
  { bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.55)', label: '#fdba74', glow: 'rgba(249, 115, 22, 0.25)' },
  { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.55)', label: '#d8b4fe', glow: 'rgba(168, 85, 247, 0.25)' },
  { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.55)', label: '#93c5fd', glow: 'rgba(59, 130, 246, 0.25)' },
  { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.55)', label: '#6ee7b7', glow: 'rgba(16, 185, 129, 0.25)' },
];

const ASSIGNEE_COLORS = [
  { from: '#f87171', to: '#dc2626', shadow: 'rgba(220, 38, 38, 0.45)' },
  { from: '#fb923c', to: '#ea580c', shadow: 'rgba(234, 88, 12, 0.45)' },
  { from: '#fbbf24', to: '#d97706', shadow: 'rgba(217, 119, 6, 0.45)' },
  { from: '#c084fc', to: '#9333ea', shadow: 'rgba(147, 51, 234, 0.45)' },
  { from: '#60a5fa', to: '#2563eb', shadow: 'rgba(37, 99, 235, 0.45)' },
  { from: '#34d399', to: '#059669', shadow: 'rgba(5, 150, 105, 0.45)' },
  { from: '#f472b6', to: '#db2777', shadow: 'rgba(219, 39, 119, 0.45)' },
];

function packCircles(n, containerR, corpR) {
  if (n <= 1) return [{ x: 0, y: 0 }];
  if (n === 2) {
    const dist = Math.max(containerR * 0.42, containerR - corpR - 12);
    return [
      { x: -dist * 0.7, y: 0 },
      { x: dist * 0.7, y: 0 },
    ];
  }
  if (n === 3) {
    const dist = Math.max(containerR * 0.48, containerR - corpR - 10);
    return [
      { x: 0, y: -dist },
      { x: -dist * 0.866, y: dist * 0.5 },
      { x: dist * 0.866, y: dist * 0.5 },
    ];
  }
  if (n === 4) {
    const dist = Math.max(containerR * 0.48, containerR - corpR - 10);
    return [
      { x: -dist * 0.707, y: -dist * 0.707 },
      { x: dist * 0.707, y: -dist * 0.707 },
      { x: -dist * 0.707, y: dist * 0.707 },
      { x: dist * 0.707, y: dist * 0.707 },
    ];
  }
  const dist = Math.max(containerR * 0.52, containerR - corpR - 8);
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
    };
  });
}

function packAssigneeCircles(assignees, corpR) {
  const n = assignees.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{ x: 0, y: corpR * 0.44, r: Math.min(22, corpR * 0.28), idx: 0 }];
  }

  const sorted = assignees.map((a, i) => ({ ...a, originalIndex: i })).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...sorted.map(a => a.count), 1);

  return sorted.map((a, si) => {
    const r = Math.max(16, Math.min(corpR * 0.26, 16 + (a.count / maxCount) * (corpR * 0.08)));
    const ring = Math.max(corpR * 0.58, corpR - r - 6);

    let angle;
    if (n === 2) {
      angle = si === 0 ? -Math.PI / 2 : Math.PI / 2;
    } else if (n === 3) {
      angle = -Math.PI / 2 + (si * (Math.PI * 2 / 3));
    } else if (n === 4) {
      angle = -Math.PI / 4 + (si * (Math.PI / 2));
    } else {
      angle = (si / n) * Math.PI * 2 - Math.PI / 2;
    }

    return {
      x: Math.cos(angle) * ring,
      y: Math.sin(angle) * ring,
      r,
      idx: a.originalIndex,
    };
  });
}

function CorpCircle({ corp, corpR, colorScheme, onCircleClick }) {
  const packed = useMemo(() => packAssigneeCircles(corp.assignees, corpR), [corp.assignees, corpR]);

  const getInitials = (name) => {
    if (!name || name === 'Unassigned') return 'UA';
    return name.trim().split(/\s+/).filter(Boolean).map(w => w[0]?.toUpperCase()).join('').slice(0, 3);
  };

  return (
    <div
      style={{
        width: corpR * 2,
        height: corpR * 2,
        borderRadius: '50%',
        background: colorScheme.bg,
        border: `1.5px solid ${colorScheme.border}`,
        position: 'relative',
        flexShrink: 0,
        boxShadow: `0 0 24px ${colorScheme.glow || colorScheme.border}`,
        overflow: 'hidden',
      }}
    >
      {/* Department Name Tag */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 10,
          maxWidth: corpR * 1.15,
          padding: '0 4px',
        }}
      >
        <span
          className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold leading-tight shadow-sm text-center bg-white/95 dark:bg-slate-900/85 text-slate-800 dark:text-slate-100"
          style={{
            border: `1px solid ${colorScheme.border}`,
            backdropFilter: 'blur(4px)',
            wordBreak: 'break-word',
          }}
        >
          {corp.corporation}
        </span>
      </div>

      {/* Assignee Sub-bubbles */}
      {packed.map((p) => {
        const assignee = corp.assignees[p.idx];
        const color = ASSIGNEE_COLORS[p.idx % ASSIGNEE_COLORS.length];
        return (
          <div
            key={assignee.name}
            title={`${assignee.name}: ${assignee.count} Tickets (${corp.corporation})`}
            style={{
              position: 'absolute',
              width: p.r * 2,
              height: p.r * 2,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${color.from}, ${color.to})`,
              border: '1.5px solid rgba(255, 255, 255, 0.4)',
              boxShadow: `0 2px 8px ${color.shadow || 'rgba(0,0,0,0.35)'}`,
              left: corpR + p.x - p.r,
              top: corpR + p.y - p.r,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              zIndex: 20,
              cursor: 'pointer',
              transition: 'transform 0.18s ease, box-shadow 0.18s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.15)';
              e.currentTarget.style.zIndex = '30';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.zIndex = '20';
            }}
            onClick={() => {
              if (onCircleClick) onCircleClick(assignee.name, corp.corporation);
            }}
          >
            <span
              className="font-extrabold text-white leading-none tracking-tight"
              style={{ fontSize: Math.max(10, Math.min(14, p.r * 0.65)) }}
            >
              {getInitials(assignee.name)}
            </span>
            <span
              className="font-bold text-white/95 leading-none mt-0.5 rounded-full bg-black/30 px-1 py-[1px]"
              style={{ fontSize: Math.max(8, Math.min(10, p.r * 0.45)) }}
            >
              {assignee.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Circlemember({ tickets, onCircleClick }) {
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState(380);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth || 380;
        const height = containerRef.current.offsetHeight || 380;
        setContainerSize(Math.min(width - 24, height - 24, 400));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const corporationData = useMemo(() => {
    const grouped = {};
    tickets.forEach(t => {
      const corp = t.department?.name || t.departmentName || 'Unknown Department';
      const name = `${t.assignee?.firstName ?? ''} ${t.assignee?.lastName ?? ''}`.trim() || 'Unassigned';
      if (!grouped[corp]) grouped[corp] = {};
      grouped[corp][name] = (grouped[corp][name] || 0) + 1;
    });
    return Object.entries(grouped).map(([corporation, assignees]) => ({
      corporation,
      total: Object.values(assignees).reduce((a, b) => a + b, 0),
      assignees: Object.entries(assignees).map(([name, count]) => ({ name, count })),
    }));
  }, [tickets]);

  const circleR = Math.max(140, Math.min(containerSize * 0.48, 185));
  const nCorps = corporationData.length;

  const corpR = useMemo(() => {
    if (nCorps <= 1) return Math.round(circleR * 0.65);
    if (nCorps === 2) return Math.round(circleR * 0.48);
    if (nCorps === 3) return Math.round(circleR * 0.44);
    if (nCorps === 4) return Math.round(circleR * 0.40);
    return Math.round(circleR * 0.35);
  }, [nCorps, circleR]);

  const corpPositions = useMemo(() => packCircles(nCorps, circleR, corpR), [nCorps, circleR, corpR]);

  if (corporationData.length === 0) {
    return (
      <div className="w-full h-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex-shrink-0">
          <h2 className="text-base font-bold text-[var(--foreground)]">Corporation Assignee Distribution</h2>
          <p className="text-xs text-[var(--muted)] mt-1">Assignee distribution across corporate departments</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 text-center text-sm text-[var(--muted)] min-h-[380px]">
          No ticket data available
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm flex flex-col overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--card-border)] bg-[var(--muted-bg)] flex-shrink-0">
        <h2 className="text-base font-bold text-[var(--foreground)]">Corporation Assignee Distribution</h2>
        <p className="text-xs text-[var(--muted)] mt-1">Assignee distribution across corporate departments</p>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 min-h-[380px]" ref={containerRef}>
        <div
          style={{
            position: 'relative',
            width: circleR * 2,
            height: circleR * 2,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 40%, rgba(244,63,94,0.12), rgba(244,63,94,0.03))',
            border: '2px solid rgba(244,63,94,0.28)',
            boxShadow: '0 0 40px rgba(244,63,94,0.10)',
            margin: 'auto',
            overflow: 'hidden',
          }}
        >
          {corporationData.map((corp, idx) => {
            const pos = corpPositions[idx] ?? { x: 0, y: 0 };
            return (
              <div
                key={corp.corporation}
                style={{
                  position: 'absolute',
                  left: circleR + pos.x - corpR,
                  top: circleR + pos.y - corpR,
                }}
              >
                <CorpCircle
                  corp={corp}
                  corpR={corpR}
                  colorScheme={CORP_COLORS[idx % CORP_COLORS.length]}
                  onCircleClick={onCircleClick}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
