const esbuild = require('esbuild');
const path = require('path');
const React = require('react');
const root = path.resolve(__dirname, '..', '..');
(async () => {
  await esbuild.build({
    entryPoints: [path.join(root, 'src/pages/report/ReportTemplate.jsx')],
    bundle: true, format: 'cjs', platform: 'node',
    loader: { '.jsx': 'jsx', '.js': 'jsx' }, jsx: 'automatic',
    logLevel: 'silent', outfile: path.join(root,'scripts','_smoke','secBundle.cjs'),
    external: ['@react-pdf/renderer','react','react/jsx-runtime','react-dom'],
  });
  const mod = require(path.join(root,'scripts','_smoke','secBundle.cjs'));
  const { Document, Page } = require(path.join(root,'node_modules','@react-pdf','renderer'));
  const RT = mod.default || mod;
  const names = ['CoverPage','ExecutiveSummary','CheckpointSection','ThreatAnalytics','AgentAnalytics','AtRiskSection','CveSection','AppInsightsSection','ZohoSection','FirewallSection','WeeklyInsights'];
  const data = {
    generatedAt: '2026-08-20T12:00:00.000Z', orgName: 'X',
    s1Threats:[], s1Agents:[], s1Cves:[], s1AppAgent:[], harmonyEvents:[], s1DeviceControl:[], s1Cves:[],
    zohoTickets:[], removedAgentsCount:0, mttr:{overall:{},sentinelOne:{},email:{},ticketing:{}},
    fwRiskRaw:null,fwAttackersRaw:null,fwAttackerDestRaw:null,fwDeniedDestRaw:null,fwDeniedSourceRaw:null,fwDeniedAppRaw:null,fwRiskyUsersRaw:null,fwTopAttacksRaw:null,fwConnectionsRaw:null,
  };
  const { buildAgentAnalytics, buildFirewallSummary, computeWeeklyStats, buildZohoSummary, buildAtRisk, buildThreatAnalytics, buildCveData } = require(path.join(root,'src/pages/report/dataUtils.js'));
  for (const n of names) {
    const Comp = RT[n];
    if (typeof Comp !== 'function') { console.log('skip', n, 'not exported'); continue; }
    let props = {};
    try {
      if (n==='ExecutiveSummary') props={d:data, weekly:computeWeeklyStats()};
      else if (n==='CheckpointSection') props={events:data.harmonyEvents, weekly:computeWeeklyStats(), mttr:data.mttr};
      else if (n==='ThreatAnalytics') props={threats:data.s1Threats, mttr:data.mttr};
      else if (n==='AgentAnalytics') props={agents:data.s1Agents, generatedAt:data.generatedAt, removed:0};
      else if (n==='AtRiskSection') props={threats:data.s1Threats};
      else if (n==='CveSection') props={cves:data.s1Cves};
      else if (n==='AppInsightsSection') props={apps:data.s1AppAgent};
      else if (n==='ZohoSection') props={tickets:data.zohoTickets, mttr:data.mttr};
      else if (n==='FirewallSection') props={fw:buildFirewallSummary(data)};
      else if (n==='WeeklyInsights') props={weekly:computeWeeklyStats()};
      else props={};
      const doc = React.createElement(Document, null, React.createElement(Page, {size:'A4'}, React.createElement(Comp, props)));
      await (await import('@react-pdf/renderer')).renderToBuffer(doc);
      console.log('OK  ', n);
    } catch(e) { console.log('FAIL', n, e.message); }
  }
})().catch(e=>console.error(e));
