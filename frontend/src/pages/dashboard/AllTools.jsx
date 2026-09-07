import ToolBubbleChart from './ToolBubbleChart.jsx';

// Catalog of every security tool / data source integrated into SecureHub.
// `value` is the live count, injected from the Dashboard aggregate data.
export const TOOL_CATALOG = [
  { key: 'security',   label: 'EDR',      category: 'Threats',        path: '/security',     color: '#10b981',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /> },
  { key: 'agent',      label: 'Agents',   category: 'Endpoints',      path: '/security/s1agent', color: '#22c55e',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /> },
  { key: 'checkpoint', label: 'Email',     category: 'Security Events', path: '/checkpoint',   color: '#6366f1',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l3.5-1m0 0L10 8M6.5 7V4l3.5 1-3.5 1zm0 2v6m0 0c0-1-2-1.5-2-3m2 3c0-1 2-1.5 2-3M3 8h7m6 2a2 2 0 100-4 2 2 0 000 4zm-3 7a2 2 0 100-4 2 2 0 000 4z" /> },
  { key: 'nvd',        label: 'NVD',      category: 'Vulnerabilities', path: '/nvd',          color: '#8b5cf6',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /> },
  { key: 'paloalto',   label: 'Firewall',  category: 'Network Events',  path: '/paloalto',     color: '#f59e0b',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /> },
  { key: 'mdm',        label: 'MDM',      category: 'Devices',         path: '/mdm',          color: '#06b6d4',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /> },
  { key: 'microsoft365',label: 'M365',    category: 'Identity',        path: '/microsoft365', color: '#3b82f6',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /> },
  { key: 'zoho',       label: 'Ticketing', category: 'Zoho Tickets',   path: '/zoho',         color: '#ec4899',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
  { key: 'analytics',  label: 'OSINT',    category: 'Intel',           path: '/analytics',    color: '#f97316',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" /> },
];

// Renders the card body: orbital bubble chart (counts per tool) + a clickable
// stat row beneath. `tools` entries = { key, value } filled by the Dashboard.
export default function AllTools({ tools = [] }) {
  const mapped = TOOL_CATALOG.map((t) => {
    const found = tools.find((x) => x.key === t.key);
    return { ...t, value: found ? Number(found.value) || 0 : 0 };
  });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', padding: '10px 14px',
      backgroundColor: '#0f172a', borderRadius: '8px', width: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <svg style={{ width: '14px', height: '14px', color: '#38bdf8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h10" />
        </svg>
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: '#38bdf8', textTransform: 'uppercase' }}>
          Integrated Tools
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '9px', fontWeight: 600, color: '#94a3b8', background: '#1e293b', borderRadius: '6px', padding: '1px 7px' }}>
          {mapped.length} tools
        </span>
      </div>

      {/* bubble chart */}
      <div style={{ flex: 1, minHeight: 190 }}>
        <ToolBubbleChart tools={mapped} />
      </div>

    </div>
  );
}
