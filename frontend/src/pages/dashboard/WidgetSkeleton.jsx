// ── Skeleton loading placeholder ─────────────────────────────────────────
// Renders shimmering placeholder blocks while a widget's data loads, so the
// card keeps its box/border/shadow and doesn't collapse to a blank spinner.
// `variant` roughly matches the widget's content so the box doesn't jerk on
// swap-in: 'chart' shows a bar-chart shape, 'table' shows header + rows.
export default function WidgetSkeleton({ variant = 'table', height = '' }) {
  const bar = 'rounded bg-[var(--muted-bg)]';
  return (
    <div className={`p-4 flex flex-col gap-3 ${height}`}>
      {/* header hint */}
      <div className={`${bar} h-3 w-1/3 mb-1 animate-pulse`} />
      <div className={`${bar} h-2.5 w-2/3 animate-pulse`} />
      {variant === 'chart' ? (
        /* chart-shaped skeleton: bars of varying heights */
        <div className="flex items-end gap-2 h-40 mt-2">
          {[40, 70, 55, 85, 60, 45, 75, 65, 90, 50, 70, 60].map((h, i) => (
            <div key={i} className={`${bar} flex-1 animate-pulse`} style={{ height: `${h}%` }} />
          ))}
        </div>
      ) : (
        /* table-shaped skeleton: header row + a few content rows */
        <div className="flex flex-col gap-2.5 mt-2">
          <div className="flex gap-3">
            <div className={`${bar} h-2.5 w-16 animate-pulse`} />
            <div className={`${bar} h-2.5 w-24 animate-pulse`} />
            <div className={`${bar} h-2.5 flex-1 animate-pulse`} />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`${bar} h-3 w-full animate-pulse`} style={{ opacity: 1 - i * 0.16 }} />
          ))}
        </div>
      )}
      <div className={`${bar} h-2 w-1/2 mt-1 animate-pulse`} />
    </div>
  );
}
