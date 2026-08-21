// Render-smoke test for the new vector ReportTemplate.
// Compiles the .jsx through esbuild, pumps in realistic mock data shaped like
// fetchReportData's output, renders with @react-pdf/renderer and asserts the
// resulting PDF isn't a 0-byte failure. Also reports per-page sizes.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import React from 'react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'scripts', '_smoke', 'reportTemplateBundle.cjs');

// 1. Compile the JSX files + generatePdf down to a single CJS bundle.
await build({
  entryPoints: [path.join(root, 'src/pages/report/ReportTemplate.jsx')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  loader: { '.jsx': 'jsx', '.js': 'jsx' },
  jsx: 'automatic',
  logLevel: 'silent',
  outfile: OUT,
  // react-pdf ships its own svg/emoji data; keep external so Node resolves it
  // from node_modules at require time (~like the browser build path).
  external: [
    '@react-pdf/renderer',
    'react',
    'react/jsx-runtime',
    'react-dom',
  ],
  alias: { react: 'react' },
});

// 2. Load the compiled template (CJS interop nests the real component).
const mod = await import(pathToFileURL(OUT).href);
const bundle = mod.default;
const ReportTemplate = (typeof bundle === 'function') ? bundle
  : bundle?.default || bundle?.ReportTemplate;

// 3. Build mock data matching fetchReportData's return shape.
const nowIso = '2026-08-20T12:00:00.000Z';
const today = '2026-08-20';
const t = (minsAgo) => new Date(Date.UTC(2026, 7, 20, 12, 0, 0) - minsAgo * 60000).toISOString();

const mockData = {
  generatedAt: nowIso,
  orgName: 'Acme Global Ltd.',
  s1Threats: Array.from({ length: 8 }, (_, i) => ({
    threatInfo: {
      threatName: `Trojan.TestThreat.${i}`,
      classification: i % 2 ? 'Malware' : 'Suspicious',
      mitigationStatus: i % 3 ? 'mitigated' : 'unresolved',
      incidentStatus: i % 3 ? 'resolved' : 'active',
      isFileless: i % 4 === 0,
      createdAt: t(120 + i * 5),
      identifiedAt: t(110 + i * 5),
      engines: ['APICloud', 'Behavior'].slice(0, (i % 2) + 1),
      processUser: `user${i}`,
      initiatingUsername: `user${i}`,
    },
    agentRealtimeInfo: { agentComputerName: `DESKTOP-${i}`, siteName: 'HQ', groupName: `grp-${i % 3}` },
    agentComputerName: `DESKTOP-${i}`,
    mitigationStatus: i % 3 ? [{ status: 'success', mitigationEndedAt: t(95 + i * 5) }] : [],
    indicators: [ { tactics: [{ name: 'Initial Access' }] } ],
  })),
  s1Agents: Array.from({ length: 5 }, (_, i) => ({
    computer_name: `WIN-${i}`,
    os_type: i % 2 ? 'Windows' : 'macOS',
    network_status: i === 0 ? 'disconnected' : 'connected',
    agent_version: '23.2.1.1',
    machineType: i % 2 ? 'Server' : 'Laptop',
    registeredAt: i < 2 ? nowIso : '2026-05-01T00:00:00.000Z',
  })),
  s1Cves: [
    { severity: 'CRITICAL', baseScore: 9.8, daysDetected: 3, name: 'CVE-2026-0001', applicationName: 'Adobe', endpointName: 'WIN-0' },
    { severity: 'HIGH', baseScore: 8.1, daysDetected: 10, name: 'CVE-2026-0002', applicationName: 'Chrome', endpointName: 'WIN-1' },
    { severity: 'MEDIUM', baseScore: 5.4, daysDetected: 2, name: 'CVE-2026-0003', applicationName: 'Firefox', endpointName: 'WIN-2' },
    { severity: 'CRITICAL', baseScore: 9.2, daysDetected: 12, name: 'CVE-2026-0004', applicationName: 'Acrobat', endpointName: 'WIN-1' },
  ],
  s1DeviceControl: [],
  s1AppAgent: [
    { applicationName: 'Chrome', osType: 'Windows', severity: 'CRITICAL', applicationVendor: 'Google' },
    { applicationName: 'Adobe', osType: 'Windows', severity: 'HIGH', applicationVendor: 'Adobe' },
    { applicationName: 'Slack', osType: 'macOS', severity: 'MEDIUM', applicationVendor: 'Slack' },
  ],
  harmonyEvents: [
    { event_created: `${today}T09:00:00Z`, state: 'pending', severity: '4', type: 'phishing', sender_address: 'phish@evil.net' },
    // Sender NOT on the top-level column — only nested in additional_data (real DB shape).
    { event_created: `${today}T09:30:00Z`, state: 'remediated', severity: '3', type: 'malware', additional_data: { sender_address: 'nested@evil.io', receiver_address: 'user@acme.com' } },
    { event_created: `${today}T10:00:00Z`, state: 'done', severity: '4', type: 'dlp', additional_data: JSON.stringify({ senderAddress: 'leak2@corp.com' }) },
    { event_created: `${today}T11:00:00Z`, state: 'pending', severity: '2', type: 'suspicious_phishing', sender_address: 'phish2@evil.net' },
    { event_created: `${today}T11:30:00Z`, state: 'blocked', severity: '1', type: 'spam' }, // no sender at all -> Unknown
  ],
  removedAgentsCount: 2,
  mttr: {
    overall:     { pct: 72, goodCount: '', badCount: '' },
    sentinelOne: { pct: 88, goodCount: 7, badCount: 1 },
    email:       { pct: 64, goodCount: 32, badCount: 18, total: 50 },
    ticketing:   { pct: 75, goodCount: 3, badCount: 1 },
  },
  zohoTickets: [
    { subject: 'Cannot open attachment', status: 'Open', priority: 'High', contact_name: 'Alice', created_time: `${today}T08:00:00Z`, department: { name: 'IT' }, assignee: { name: 'Bob' } },
    { subject: 'Firewall rule request', status: 'Closed', priority: 'Low', contact_name: 'Carol', created_time: `${today}T07:00:00Z`, closed_time: `${today}T09:00:00Z`, department: { name: 'NetSec' }, assignee: { name: 'Bob' } },
    { subject: 'VPN down for remote staff', status: 'Open', priority: 'Critical', contact_name: 'Dave', created_time: `${today}T06:00:00Z`, department: { name: 'IT' }, assignee: { name: 'Eve' } },
    { subject: 'Antivirus update failed', status: 'On Hold', priority: 'Medium', contact_name: 'Alice', created_time: `${today}T05:00:00Z`, department: { name: 'IT' }, assignee: { name: 'Eve' } },
  ],
  // Firewall raw payloads — shaped like the XML->JSON the backend serves.
  fwRiskRaw: {
    data: null,
  },
};

// Firewall endpoint payloads use the report.result.entry shape extractTable reads.
const fwRows = (entries) => ({
  report: { result: { entry: entries } },
});
mockData.fwRiskRaw = fwRows([
  { '@name': 'Risk 4', risk: '4', nsess: '24', nbytes: '1048576', 'slabbed-receive_time': '2026-08-19T22:00:00Z' },
  { '@name': 'Risk 2', risk: '2', nsess: '11', nbytes: '2097152', 'slabbed-receive_time': '2026-08-20T08:00:00Z' },
  { '@name': 'Risk 5', risk: '5', nsess: '7', nbytes: '524288', 'slabbed-receive_time': '2026-08-18T15:00:00Z' },
]);
mockData.fwAttackersRaw = fwRows([{ '@name': '203.0.113.1', count: '42' }, { '@name': '198.51.100.9', count: '17' }]);
mockData.fwAttackerDestRaw = fwRows([{ '@name': '10.0.0.5', count: '33' }]);
mockData.fwDeniedDestRaw = fwRows([{ '@name': '8.8.8.8', count: '50' }]);
mockData.fwDeniedSourceRaw = fwRows([{ '@name': '203.0.113.1', count: '21' }]);
mockData.fwDeniedAppRaw = fwRows([{ '@name': 'web-browsing', count: '35' }]);
mockData.fwRiskyUsersRaw = fwRows([{ '@name': 'john.doe', count: '19' }, { '@name': 'jane.roe', count: '8' }]);
mockData.fwTopAttacksRaw = fwRows([{ '@name': 'SMB:TCP/445', count: '30' }, { '@name': 'RDP:TCP/3389', count: '12' }]);
mockData.fwConnectionsRaw = fwRows([{ '@name': '10.0.0.1', count: '120' }]);
mockData.fwWidgets = []; // not used by template directly

// 4. Render the multi-page document.
const { renderToBuffer } = await import('@react-pdf/renderer');
console.log('[smoke] Rendering ReportTemplate with mock data...', typeof ReportTemplate);
if (typeof ReportTemplate !== 'function') {
  console.error('[smoke] ✗ Could not resolve ReportTemplate component from bundle');
  console.error('[smoke] bundle keys:', Object.keys(bundle));
  process.exit(1);
}
const start = Date.now();
let buffer;
try {
  buffer = await renderToBuffer(React.createElement(ReportTemplate, { data: mockData }));
} catch (e) {
  console.error('[smoke] ✗ render threw:', e && e.stack ? e.stack : e);
  process.exit(2);
}
const ms = Date.now() - start;

console.log(`[smoke] ✓ Rendered a ${buffer.length.toLocaleString()}-byte PDF in ${ms}ms`);
if (buffer.length < 20000) {
  console.error('[smoke] ✗ PDF suspiciously small — likely missing sections');
  process.exit(1);
}

writeFileSync(path.join(root, 'scripts', '_smoke', 'smoke-report.pdf'), buffer);
console.log('[smoke] ✓ Wrote scripts/_smoke/smoke-report.pdf');

// 5. Second pass — empty data arrays EXERCISE the empty-table -> chart fallbacks.
const emptyData = {
  generatedAt: nowIso,
  orgName: 'Empty Org',
  s1Threats: [],
  s1Agents: [],
  s1Cves: [],
  s1DeviceControl: [],
  s1AppAgent: [],
  harmonyEvents: [],
  zohoTickets: [],
  removedAgentsCount: 0,
  mttr: {
    overall:     { pct: 0, goodCount: '', badCount: '' },
    sentinelOne: { pct: 0, goodCount: 0, badCount: 0 },
    email:       { pct: 0, goodCount: 0, badCount: 0, total: 0 },
    ticketing:   { pct: 0, goodCount: 0, badCount: 0 },
  },
  fwRiskRaw: null,
  fwAttackersRaw: null,
  fwAttackerDestRaw: null,
  fwDeniedDestRaw: null,
  fwDeniedSourceRaw: null,
  fwDeniedAppRaw: null,
  fwRiskyUsersRaw: null,
  fwTopAttacksRaw: null,
  fwConnectionsRaw: null,
  fwWidgets: [],
};
console.log('[smoke] Rendering EMPTY-data pass (exercises chart fallbacks)...');
const start2 = Date.now();
const buffer2 = await renderToBuffer(React.createElement(ReportTemplate, { data: emptyData }));
console.log(`[smoke] ✓ Empty-pass rendered a ${buffer2.length.toLocaleString()}-byte PDF in ${Date.now() - start2}ms`);
if (buffer2.length < 10000) {
  console.error('[smoke] ✗ Empty-pass PDF too small');
  process.exit(1);
}
writeFileSync(path.join(root, 'scripts', '_smoke', 'smoke-report-empty.pdf'), buffer2);
console.log('[smoke] ✓ Wrote scripts/_smoke/smoke-report-empty.pdf');
console.log('[smoke] PASSED');