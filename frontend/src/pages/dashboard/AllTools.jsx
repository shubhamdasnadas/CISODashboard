import ToolBubbleChart from './ToolBubbleChart.jsx';

// Catalog of every security tool / data source integrated into SecureHub.
// `value` is the live count, injected from the Dashboard aggregate data.
export const TOOL_CATALOG = [
  { key: 'security',    label: 'EDR',       category: 'Threats',         path: '/dashboard/detail', state: { dataset: 'threats', filterId: 'all', title: 'SentinelOne Threat Telemetry' }, color: '#10b981' },
  { key: 'agent',       label: 'Agents',    category: 'Endpoints',       path: '/dashboard/detail', state: { dataset: 'agents', filterId: 'all', title: 'SentinelOne Protected Fleet' }, color: '#22c55e' },
  { key: 'checkpoint',  label: 'Email',     category: 'Security Events', path: '/dashboard/detail', state: { dataset: 'checkpoint', filterId: 'all', title: 'Checkpoint Email Security Events' }, color: '#6366f1' },
  { key: 'nvd',         label: 'NVD',       category: 'Vulnerabilities', path: '/dashboard/detail', state: { dataset: 'nvd', filterId: 'all', title: 'NVD Vulnerability Database' }, color: '#8b5cf6' },
  { key: 'paloalto',    label: 'Firewall',  category: 'Network Events',  path: '/paloalto',     color: '#f59e0b' },
  { key: 'mdm',         label: 'MDM',       category: 'Devices',         path: '/dashboard/detail', state: { dataset: 'mdm', filterId: 'all', title: 'Hexnode MDM Devices' }, color: '#06b6d4' },
  { key: 'microsoft365',label: 'M365',      category: 'Identity',        path: '/microsoft365', color: '#38bdf8' },
  { key: 'zoho',        label: 'Ticketing', category: 'Zoho Tickets',    path: '/dashboard/detail', state: { dataset: 'zoho', filterId: 'zohoAll', title: 'Zoho ServiceDesk Tickets' }, color: '#ec4899' },
  { key: 'analytics',   label: 'OSINT',     category: 'Intel',           path: '/analytics',    color: '#f97316' },
];

export default function AllTools({ tools = [] }) {
  const mapped = TOOL_CATALOG.map((t) => {
    const found = tools.find((x) => x.key === t.key);
    return { ...t, value: found ? Number(found.value) || 0 : 0 };
  });

  return (
    <div className="flex flex-col h-full w-full bg-[#0b1329] p-3 rounded-2xl">
      <div className="flex items-center justify-between gap-2 mb-1 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          <span className="text-[10px] font-bold tracking-wider text-sky-400 uppercase">
            Orbital Tool Matrix
          </span>
        </div>
        <span className="text-[9px] font-semibold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700/50">
          {mapped.length} Active Nodes
        </span>
      </div>

      {/* Bubble Chart */}
      <div className="flex-1 min-h-[220px] flex items-center justify-center">
        <ToolBubbleChart tools={mapped} />
      </div>
    </div>
  );
}
