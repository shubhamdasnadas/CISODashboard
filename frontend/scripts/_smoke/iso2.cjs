const esbuild = require('esbuild');
const path = require('path');
const React = require('react');
const root = path.resolve(__dirname, '..', '..');
(async () => {
  await esbuild.build({
    entryPoints: [path.join(root, 'src/pages/report/ReportTemplate.jsx')],
    bundle: true, format: 'cjs', platform: 'node',
    loader: { '.jsx': 'jsx', '.js': 'jsx' }, jsx: 'automatic',
    logLevel: 'silent', outfile: path.join(root,'scripts','_smoke','isoBundle2.cjs'),
    external: ['@react-pdf/renderer','react','react/jsx-runtime','react-dom'],
  });
  const mod = require(path.join(root,'scripts','_smoke','isoBundle2.cjs'));
  const RT = mod.default || mod;
  const data = {
    generatedAt: '2026-08-20T12:00:00.000Z', orgName: 'X',
    s1Threats:[], s1Agents:[], s1Cves:[], s1AppAgent:[], harmonyEvents:[],
    zohoTickets:[], removedAgentsCount:0, mttr:{},
    fwRiskRaw:null, fwAttackersRaw:null, fwAttackerDestRaw:null, fwDeniedDestRaw:null,
    fwDeniedSourceRaw:null, fwDeniedAppRaw:null, fwRiskyUsersRaw:null, fwTopAttacksRaw:null, fwConnectionsRaw:null,
  };
  const { renderToBuffer } = await import('@react-pdf/renderer');
  try {
    const buf = await renderToBuffer(React.createElement(RT, { data }));
    console.log('OK bytes', buf.length);
  } catch(e) { console.error('ERR', e && e.stack ? e.stack.split('\n').slice(0,6).join('\n') : e); }
})().catch(e=>console.error(e));
