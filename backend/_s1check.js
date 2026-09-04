(async () => {
  const { getOrgPool } = require('./db');
  const pool = getOrgPool('techsec');
  const { rows } = await pool.query("SELECT credentials FROM integration_credentials WHERE integration='sentinelone' LIMIT 1");
  if (!rows[0]) { console.log('NO S1 CREDS for techsec'); process.exit(0); }
  const creds = rows[0].credentials;
  console.log('creds keys:', Object.keys(creds));
  console.log('baseUrl:', creds.baseUrl);
  const { syncSentinelOne } = require('./services/sentinelone');
  try {
    const r = await syncSentinelOne('techsec', creds);
    console.log('SYNC RESULT: agents=', (r.agents||[]).length, 'threats=', (r.threats||[]).length);
    if ((r.threats||[]).length) console.log('threat sample:', JSON.stringify(r.threats[0], null, 2).slice(0,1200));
  } catch(e) {
    console.log('SYNC ERROR:', e.message);
  }
  process.exit(0);
})();
