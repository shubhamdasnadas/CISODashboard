const esbuild = require('esbuild');
const path = require('path');
const React = require('react');
const root = path.resolve(__dirname, '..', '..');
(async () => {
  await esbuild.build({
    entryPoints: [path.join(root, 'src/pages/report/_RTTest.jsx')],
    bundle: true, format: 'cjs', platform: 'node',
    loader: { '.jsx': 'jsx', '.js': 'jsx' }, jsx: 'automatic',
    logLevel: 'silent', outfile: path.join(root,'scripts','_smoke','secBundle3.cjs'),
    external: ['@react-pdf/renderer','react','react/jsx-runtime','react-dom'],
  });
  const RT = require(path.join(root,'scripts','_smoke','secBundle3.cjs'));
  const { Document, Page } = require(path.join(root,'node_modules','@react-pdf','renderer'));
  const du = require(path.join(root,'src/pages/report/dataUtils.js'));
  const data = {
    generatedAt: '2026-08-20T12:00:00.000Z', orgName: 'X',
    s1Threats:[], s1Agents:[], s1Cves:[], s1AppAgent:[], harmonyEvents:[],
    zohoTickets:[], removedAgentsCount:0, mttr:{overall:{},sentinelOne:{},email:{},ticketing:{}},
    fwRiskRaw:null,fwAttackersRaw:null,fwAttackerDestRaw:null,fwDeniedDestRaw:null,fwDeniedSourceRaw:null,fwDeniedAppRaw:null,fwRiskyUsersRaw:null,fwTopAttacksRaw:null,fwConnectionsRaw:null,
  };
  const secs = {
    CoverPage: {},
    ExecutiveSummary: { d:data, weekly:du.computeWeeklyStats() },
    CheckpointSection: { events:data.harmonyEvents, weekly:du.computeWeeklyStats(), mttr:data.mttr },
    ThreatAnalytics: { threats:data.s1Threats, mttr:data.mttr },
    AgentAnalytics: { agents:data.s1Agents, generatedAt:data.generatedAt, removed:0 },
    AtRiskSection: { threats:data.s1Threats },
    CveSection: { cves:data.s1Cves },
    AppInsightsSection: { apps:data.s1AppAgent },
    ZohoSection: { tickets:data.zohoTickets, mttr:data.mttr },
    FirewallSection: { fw:du.buildFirewallSummary(data) },
    WeeklyInsights: { weekly:du.computeWeeklyStats() },
  };
  for (const [n, props] of Object.entries(secs)) {
    const Comp = RT[n];
    if (typeof Comp!=='function'){ console.log('skip',n); continue; }
    try {
      const doc = React.createElement(Document,null,React.createElement(Page,{size:'A4'},React.createElement(Comp,props)));
      await (await import('@react-pdf/renderer')).renderToBuffer(doc);
      console.log('OK  ',n);
    } catch(e){ console.log('FAIL',n,'::',e.message); }
  }
})().catch(e=>console.error(e));
