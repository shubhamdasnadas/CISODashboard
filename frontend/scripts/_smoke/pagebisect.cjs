const esbuild = require('esbuild');
const path = require('path');
const React = require('react');
const root = path.resolve(__dirname, '..', '..');
(async () => {
  const RT = require(path.join(root,'scripts','_smoke','secBundle3.cjs'));
  const { Document } = require(path.join(root,'node_modules','@react-pdf','renderer'));
  const du = require(path.join(root,'src/pages/report/dataUtils.js'));
  const data = {
    generatedAt: '2026-08-20T12:00:00.000Z', orgName: 'X',
    s1Threats:[], s1Agents:[], s1Cves:[], s1AppAgent:[], harmonyEvents:[],
    zohoTickets:[], removedAgentsCount:0, mttr:{overall:{},sentinelOne:{},email:{},ticketing:{}},
    fwRiskRaw:null,fwAttackersRaw:null,fwAttackerDestRaw:null,fwDeniedDestRaw:null,fwDeniedSourceRaw:null,fwDeniedAppRaw:null,fwRiskyUsersRaw:null,fwTopAttacksRaw:null,fwConnectionsRaw:null,
  };
  const weekly = du.computeWeeklyStats();
  const fw = du.buildFirewallSummary(data);
  // Replicate the Page contents from ReportTemplate manually, each in its own Document.
  const pages = {
    p1: ()=>React.createElement(RT.CoverPage,{orgName:data.orgName,generatedAt:data.generatedAt}),
    p2: ()=>React.createElement(RT.ExecutiveSummary,{d:data,weekly}),
    p3: ()=>React.createElement(RT.CheckpointSection,{events:data.harmonyEvents,weekly,mttr:data.mttr}),
    p4: ()=>React.createElement(RT.ThreatAnalytics,{threats:data.s1Threats,mttr:data.mttr}),
    p5: ()=>React.createElement(RT.AgentAnalytics,{agents:data.s1Agents,generatedAt:data.generatedAt,removed:0}),
    p6: ()=>React.createElement(RT.AtRiskSection,{threats:data.s1Threats}),
    p7: ()=>React.createElement(RT.CveSection,{cves:data.s1Cves}),
    p8: ()=>React.createElement(RT.AppInsightsSection,{apps:data.s1AppAgent}),
    p9: ()=>React.createElement(RT.ZohoSection,{tickets:data.zohoTickets,mttr:data.mttr}),
    p10: ()=>React.createElement(RT.FirewallSection,{fw}),
    p11: ()=>React.createElement(RT.WeeklyInsights,{weekly,d:data}),
  };
  for (const [n,fn] of Object.entries(pages)) {
    try {
      const doc = React.createElement(Document,null,React.createElement(require(path.join(root,'node_modules','@react-pdf','renderer')).Page,{size:'A3',orientation:'landscape'},fn()));
      await (await import('@react-pdf/renderer')).renderToBuffer(doc);
      console.log('OK  ',n);
    } catch(e){ console.log('FAIL',n,'::',e.message); }
  }
})().catch(e=>console.error(e));
