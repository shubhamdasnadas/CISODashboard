const { renderReportPdf } = require('./scripts/reportRenderer.cjs');
const fs = require('fs');
const data = {
  orgName: 'Acme Corporation Ltd',
  generatedAt: '2026-08-20T10:00:00.000Z',
  harmonyEvents: [], s1Threats: [], s1Agents: [], s1Cves: [],
  s1AppAgent: [], zohoTickets: [], fw: null,
  mttr: { overall:{pct:0,goodCount:'',badCount:''}, sentinelOne:{pct:0,goodCount:'',badCount:''}, email:{pct:0,goodCount:'',badCount:'',total:''}, ticketing:{pct:0,goodCount:'',badCount:''} },
};
(async () => {
  const buf = await renderReportPdf(data);
  fs.writeFileSync('cover_test.pdf', buf);
  console.log('wrote cover_test.pdf', buf.length, 'bytes');
})().catch(e => { console.error('ERR', e); process.exit(1); });
