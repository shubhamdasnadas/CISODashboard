/**
 * Canonical page registry — single source of truth shared by the sidebar
 * (AppLayout) and the Members page-access editor so the two lists can't
 * drift apart. Keys must stay stable: they are what gets stored in
 * allowed_pages columns in the database.
 */
export const PAGES = [
  { key: 'dashboard',     label: 'Dashboard' },
  { key: 'security',      label: 'EDR' },
  { key: 'checkpoint',    label: 'Email Security' },
  { key: 'nvd',           label: 'NVD' },
  { key: 'updated-nvd',    label: 'Updated NVD' },
  { key: 'updated-cpes',   label: 'Updated CPEs' },
  { key: 'paloalto',      label: 'Firewall' },
  { key: 'mdm',           label: 'MDM' },
  { key: 'microsoft365',  label: 'Microsoft 365' },
  { key: 'zoho-one',      label: 'Ticketing' },
  { key: 'reports',       label: 'Reports' },
  { key: 'analytics',     label: 'Analytics' },
  { key: 'news',          label: 'News' },
  { key: 'settings',      label: 'Settings' },
  { key: 'members',       label: 'Users' },
];
