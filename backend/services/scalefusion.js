const { getOrgPool } = require('../db');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Fetch the full raw response from the Scale Fusion API.
async function fetchScalefusionRaw(url, token) {
  let res = null;
  for (let retry = 0; retry <= 3; retry++) {
    res = await fetch(url, {
      headers: {
        'Authorization': `Token ${token}`,
        'accept': 'application/json',
        'user-agent': 'ciso-dashboard-sync',
      },
      signal: AbortSignal.timeout(60000),
    });
    if (res.status !== 429 && res.status !== 503) break;
    const wait = Number(res.headers.get('retry-after') || 0) * 1000 || 3000 * Math.pow(2, retry);
    console.warn(`[Scalefusion sync] ${res.status} — waiting ${wait}ms`);
    await sleep(wait);
  }

  if (!res || !res.ok) {
    if (res?.status === 404) return { data: [], error: 'Endpoint not found (404)' };
    const body = (await res?.text())?.slice(0, 500);
    if (res?.status === 401) {
      throw new Error(`Scale Fusion auth failed (401): ${body} — check your API key`);
    }
    throw new Error(`Scale Fusion API ${res?.status}: ${body}`);
  }

  const json = await res.json();
  if (json.success === false) {
    throw new Error(`Scale Fusion API error: ${json.message || 'request failed'}`);
  }
  return json;
}

/**
 * Sync Scale Fusion — fetches the full raw API response and stores it in the DB.
 */
async function syncScalefusion(orgSlug, creds) {
  const token = creds.apiToken;
  if (!token) {
    throw new Error('Scale Fusion not configured — provide apiToken');
  }

  let devicesUrl = creds.baseUrl;
  if (!devicesUrl) {
    devicesUrl = 'https://api-in.scalefusion.com/api/v1/devices.json';
  }

  const pool = getOrgPool(orgSlug);

  console.log(`[Scalefusion sync][org=${orgSlug}] Fetching from ${devicesUrl}`);
  const rawResponse = await fetchScalefusionRaw(devicesUrl, token);
  console.log(`[Scalefusion sync][org=${orgSlug}] Got response`);

  // Store the full raw response in scalefusion_devices table
  await pool.query('DELETE FROM scalefusion_devices');
  await pool.query(
    `INSERT INTO scalefusion_devices (device_id, data) VALUES ('__raw_response__', $1::jsonb)
     ON CONFLICT (device_id) DO UPDATE SET data = EXCLUDED.data, synced_at = NOW()`,
    [JSON.stringify(rawResponse)]
  );

  console.log(`[Scalefusion sync][org=${orgSlug}] Done.`);
  return {
    success: true,
    syncedAt: new Date().toISOString(),
  };
}

module.exports = { syncScalefusion };