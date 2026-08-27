const esbuild = require('esbuild');
const path = require('path');
const React = require('react');
const root = path.resolve(__dirname, '..', '..');
(async () => {
  const RT = require(path.join(root,'scripts','_smoke','secBundle3.cjs'));
  const rpdf = require(path.join(root,'node_modules','@react-pdf','renderer'));
  const { Document, Page } = rpdf;
  const du = require(path.join(root,'src/pages/report/dataUtils.js'));
  const data = {
    generatedAt: '2026-08-20T12:00:00.000Z', orgName: 'X',
    s1Threats:[], s1Agents:[], s1Cves:[], s1AppAgent:[], harmonyEvents:[],
    zohoTickets:[], removedAgentsCount:0, mttr:{overall:{},sentinelOne:{},email:{},ticketing:{}},
    fwRiskRaw:null,fwAttackersRaw:null,fwAttackerDestRaw:null,fwDeniedDestRaw:null,fwDeniedSourceRaw:null,fwDeniedAppRaw:null,fwRiskyUsersRaw:null,fwTopAttacksRaw:null,fwConnectionsRaw:null,
  };
  const weekly = du.computeWeeklyStats();
  const fw = du.buildFirewallSummary(data);
  const mk = {
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
  const order=['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11'];
  for (let i=1;i<=order.length;i++){
    const chosen=order.slice(0,i);
    const doc=React.createElement(Document,null,...chosen.map(n=>React.createElement(Page,{size:'A3',orientation:'landscape',key:n},mk[n]())));
    try { await (await import('@react-pdf/renderer')).renderToBuffer(doc); console.log('OK pages',i); }
    catch(e){ console.log('FAIL at',i,'::',e.message); break; }
  }
})().catch(e=>console.error(e));
