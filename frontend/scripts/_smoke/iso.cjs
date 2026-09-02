const React = require("react");
const esbuild = require('esbuild');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
(async () => {
  await esbuild.build({
    entryPoints: [path.join(root, 'src/pages/report/ReportTemplate.jsx')],
    bundle: true, format: 'cjs', platform: 'node',
    loader: { '.jsx': 'jsx', '.js': 'jsx' }, jsx: 'automatic',
    logLevel: 'silent', outfile: path.join(root,'scripts','_smoke','isoBundle.cjs'),
    external: ['@react-pdf/renderer','react','react/jsx-runtime','react-dom'],
  });
  const mod = require(path.join(root,'scripts','_smoke','isoBundle.cjs'));
  const RT = mod.default || mod;
  // pull builder
  const du = require(path.join(root,'src/pages/report/dataUtils.js'));
  const fwRows = (e) => ({ report: { result: { entry: e } } });
  const data = {
    generatedAt: '2026-08-20T12:00:00.000Z', orgName: 'X',
    s1Threats:[], s1Agents:[], s1Cves:[], s1AppAgent:[], harmonyEvents:[],
    zohoTickets:[], removedAgentsCount:0, mttr:{},
    fwRiskRaw: fwRows([{risk:'4',nsess:'24',nbytes:'1048576','slabbed-receive_time':'2026-08-19T22:00:00Z'},{risk:'2',nsess:'11',nbytes:'2097152','slabbed-receive_time':'2026-08-20T08:00:00Z'},{risk:'5',nsess:'7',nbytes:'524288','slabbed-receive_time':'2026-08-18T15:00:00Z'}]),
    fwAttackersRaw: fwRows([{count:'42'}]),
    fwAttackerDestRaw: fwRows([{count:'33'}]),
    fwDeniedDestRaw: fwRows([{'@name':'8.8.8.8',count:'50'}]),
    fwDeniedSourceRaw: fwRows([{count:'21'}]),
    fwDeniedAppRaw: fwRows([{count:'35'}]),
    fwRiskyUsersRaw: fwRows([{count:'19'},{count:'8'}]),
    fwTopAttacksRaw: fwRows([{'@name':'SMB',count:'30'}]),
    fwConnectionsRaw: fwRows([{'@name':'10.0.0.1',count:'120'}]),
  };
  const { renderToBuffer } = await import('@react-pdf/renderer');
  try {
    const buf = await renderToBuffer(React.createElement(RT, { data }));
    console.log('OK bytes', buf.length);
  } catch(e) { console.error('ERR', e && e.stack ? e.stack.split('\n').slice(0,8).join('\n') : e); }
})().catch(e=>console.error(e));
