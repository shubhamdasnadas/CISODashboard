const path = require('path');
const React = require('react');
const root = path.resolve(__dirname, '..', '..');
(async () => {
  const RT = require(path.join(root,'scripts','_smoke','secBundle3.cjs'));
  const { Document, Page } = require(path.join(root,'node_modules','@react-pdf','renderer'));
  const du = require(path.join(root,'src/pages/report/dataUtils.js'));
  const fwRows=(e)=>({report:{result:{entry:e}}});
  const data = {
    generatedAt: '2026-08-20T12:00:00.000Z', orgName: 'X',
    s1Threats:[], s1Agents:[], s1Cves:[], s1AppAgent:[], harmonyEvents:[],
    zohoTickets:[], removedAgentsCount:0, mttr:{overall:{},sentinelOne:{},email:{},ticketing:{}},
    fwRiskRaw: fwRows([{risk:'4',nsess:'24',nbytes:'1048576','slabbed-receive_time':'2026-08-19T22:00:00Z'},{risk:'2',nsess:'11',nbytes:'2097152','slabbed-receive_time':'2026-08-20T08:00:00Z'},{risk:'5',nsess:'7',nbytes:'524288','slabbed-receive_time':'2026-08-18T15:00:00Z'}]),
    fwAttackersRaw: fwRows([{'@name':'203.0.113.1',count:'42'},{'@name':'198.51.100.9',count:'17'}]),
    fwAttackerDestRaw: fwRows([{'@name':'10.0.0.5',count:'33'}]),
    fwDeniedDestRaw: fwRows([{'@name':'8.8.8.8',count:'50'}]),
    fwDeniedSourceRaw: fwRows([{'@name':'203.0.113.1',count:'21'}]),
    fwDeniedAppRaw: fwRows([{'@name':'web-browsing',count:'35'}]),
    fwRiskyUsersRaw: fwRows([{'@name':'john.doe',count:'19'},{'@name':'jane.roe',count:'8'}]),
    fwTopAttacksRaw: fwRows([{'@name':'SMB:TCP/445',count:'30'},{'@name':'RDP:TCP/3389',count:'12'}]),
    fwConnectionsRaw: fwRows([{'@name':'10.0.0.1',count:'120'}]),
  };
  const weekly = du.computeWeeklyStats();
  const fw = du.buildFirewallSummary(data);
  const mk = {
    p10: ()=>React.createElement(RT.FirewallSection,{fw}),
  };
  for (const [n,fn] of Object.entries(mk)) {
    try { const doc=React.createElement(Document,null,React.createElement(Page,{size:'A3',orientation:'landscape'},fn())); await (await import('@react-pdf/renderer')).renderToBuffer(doc); console.log('OK  ',n); }
    catch(e){ console.log('FAIL',n,'::',e.message); }
  }
})().catch(e=>console.error(e));
