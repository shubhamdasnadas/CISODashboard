const { getOrgPool } = require('../db');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeDevice(d, idx = 0) {
  if (!d || typeof d !== 'object') return {};
  const obj = (d.device && typeof d.device === 'object') ? { ...d.device, ...d } : { ...d };

  const id = obj.id != null ? String(obj.id) : (obj.device_id || obj.imei || obj.serial_number || obj.wifi_mac || `sf-device-${idx}`);
  const name = obj.name || obj.device_name || obj.model_name || obj.model || `Device ${id}`;
  const model = obj.model || obj.model_name || obj.device_model || '—';
  const os = obj.os || obj.os_name || obj.platform || obj.os_type || 'Unknown';
  const os_version = obj.os_version || obj.os_version_name || obj.firmware_version || '—';
  const platform = obj.platform || obj.os_name || os;

  const last_reported = obj.last_connected_at || obj.last_seen || obj.last_reported || obj.updated_at || obj.created_at || null;

  let compliant = true;
  if (obj.compliant !== undefined) {
    compliant = Boolean(obj.compliant);
  } else if (obj.compliance_status !== undefined) {
    const cs = String(obj.compliance_status).toLowerCase();
    compliant = cs.includes('compliant') && !cs.includes('non') && !cs.includes('violat');
  } else if (obj.is_compliant !== undefined) {
    compliant = Boolean(obj.is_compliant);
  } else if (obj.compliance_state !== undefined) {
    const cs = String(obj.compliance_state).toLowerCase();
    compliant = cs.includes('compliant') && !cs.includes('non');
  }

  const compliance_state = obj.compliance_status || (compliant ? 'Compliant' : 'Non-compliant');

  const device_type = obj.device_type || obj.device_type_name || (
    platform.toLowerCase().includes('android') ? 'Android' :
    platform.toLowerCase().includes('ios') ? 'iOS' :
    platform.toLowerCase().includes('windows') ? 'Windows' :
    platform.toLowerCase().includes('mac') ? 'macOS' : 'Device'
  );

  const status = obj.status || obj.device_status || (obj.is_active === false ? 'inactive' : 'active');

  return {
    ...obj,
    id,
    device_id: id,
    name,
    device_name: name,
    model,
    model_name: model,
    os,
    os_name: os,
    os_version,
    platform,
    last_reported,
    last_connected_at: obj.last_connected_at || last_reported,
    compliant,
    compliance_state,
    compliance_status: compliance_state,
    device_type,
    status,
  };
}

function extractDevices(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json.map((d, i) => normalizeDevice(d, i));
  if (typeof json !== 'object') return [];

  for (const key of ['devices', 'data', 'results', 'device_list', 'items']) {
    if (Array.isArray(json[key])) {
      return json[key].map((d, i) => normalizeDevice(d, i));
    }
  }

  const firstArray = Object.values(json).find((v) => Array.isArray(v));
  if (firstArray) return firstArray.map((d, i) => normalizeDevice(d, i));

  return [];
}

function extractApplications(json, devices = []) {
  const appMap = new Map();

  if (json && typeof json === 'object') {
    for (const key of ['applications', 'apps', 'app_list']) {
      if (Array.isArray(json[key])) {
        json[key].forEach((a, i) => {
          const item = (a.app && typeof a.app === 'object') ? { ...a.app, ...a } : { ...a };
          const name = item.name || item.app_name || item.application_name || `App ${i + 1}`;
          const id = String(item.id || item.app_id || item.package_name || item.bundle_id || name);
          if (!appMap.has(id)) {
            appMap.set(id, {
              id,
              name,
              app_name: name,
              package_name: item.package_name || item.bundle_id || '—',
              version: item.version || item.version_name || item.app_version || '—',
              platform: item.platform || item.os_type || 'Unknown',
              category: item.category || 'General',
              ...item,
            });
          }
        });
      }
    }
  }

  devices.forEach((d) => {
    const devApps = d.installed_apps || d.applications || d.apps || [];
    if (Array.isArray(devApps)) {
      devApps.forEach((a, i) => {
        const item = typeof a === 'string' ? { name: a, app_name: a, package_name: a } : ((a.app && typeof a.app === 'object') ? { ...a.app, ...a } : { ...a });
        const name = item.name || item.app_name || item.application_name || `App ${i + 1}`;
        const id = String(item.id || item.app_id || item.package_name || item.bundle_id || name);
        if (!appMap.has(id)) {
          appMap.set(id, {
            id,
            name,
            app_name: name,
            package_name: item.package_name || item.bundle_id || '—',
            version: item.version || item.version_name || item.app_version || '—',
            platform: item.platform || item.os_type || d.platform || 'Unknown',
            category: item.category || 'Installed App',
            ...item,
          });
        }
      });
    }
  });

  return Array.from(appMap.values());
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
 * Sync Scale Fusion — fetches the API response, normalizes devices/apps, and stores them in the DB.
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

  const devices = extractDevices(rawResponse);
  const applications = extractApplications(rawResponse, devices);

  // Store raw response
  await pool.query(
    `INSERT INTO scalefusion_devices (device_id, data) VALUES ('__raw_response__', $1::jsonb)
     ON CONFLICT (device_id) DO UPDATE SET data = EXCLUDED.data, synced_at = NOW()`,
    [JSON.stringify(rawResponse)]
  );

  // Clean old device records and insert newly normalized device records
  await pool.query("DELETE FROM scalefusion_devices WHERE device_id != '__raw_response__'");
  for (const d of devices) {
    const id = d.id != null ? String(d.id) : null;
    if (!id) continue;
    await pool.query(
      `INSERT INTO scalefusion_devices (device_id, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (device_id) DO UPDATE SET data = EXCLUDED.data, synced_at = NOW()`,
      [id, JSON.stringify(d)]
    );
  }

  // Insert applications
  await pool.query('TRUNCATE TABLE scalefusion_applications');
  for (const a of applications) {
    const id = a.id != null ? String(a.id) : null;
    if (!id) continue;
    await pool.query(
      `INSERT INTO scalefusion_applications (app_id, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (app_id) DO UPDATE SET data = EXCLUDED.data, synced_at = NOW()`,
      [id, JSON.stringify(a)]
    );
  }

  console.log(`[Scalefusion sync][org=${orgSlug}] Done. Synced ${devices.length} devices, ${applications.length} applications.`);
  return {
    success: true,
    devices: devices.length,
    applications: applications.length,
    syncedAt: new Date().toISOString(),
  };
}

module.exports = {
  syncScalefusion,
  extractDevices,
  extractApplications,
  normalizeDevice,
};
