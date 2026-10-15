const { getOrgPool } = require('../db');
const redis = require('../lib/redis');

const CHECKPOINT_AUTH_URL =
  'https://cloudinfra-gw.in.portal.checkpoint.com/auth/external';
const CHECKPOINT_EVENTS_URL =
  'https://cloudinfra-gw.in.portal.checkpoint.com/app/hec-api/v1.0/event/query';

const DEFAULT_EVENT_TYPES = ['phishing', 'malware', 'dlp'];
const MAX_PAGES = 200;

async function getHarmonyToken(clientId, accessKey) {
  const res = await fetch(CHECKPOINT_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: clientId.trim(), accessKey: accessKey.trim() }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Harmony auth failed (${res.status}): ${JSON.stringify(data)}`);
  }

  const token = data?.data?.token ?? data?.token ?? data?.access_token;
  if (!token) {
    throw new Error('No token returned from Checkpoint auth endpoint');
  }
  return token;
}

async function syncHarmony(orgSlug, creds, eventTypes = DEFAULT_EVENT_TYPES) {
  const pool = getOrgPool(orgSlug);
  const harmonyToken = await getHarmonyToken(creds.clientId, creds.accessKey);

  const allRecords = [];
  let scrollId;
  let page = 0;

  do {
    const requestData = { eventTypes };
    if (scrollId) requestData.scrollId = scrollId;

    const upstream = await fetch(CHECKPOINT_EVENTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${harmonyToken}`,
        'x-av-req-id': `harmony-cron-org${orgSlug}-page-${page}`,
      },
      body: JSON.stringify({ requestData }),
    });

    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      throw new Error(
        `Checkpoint API failed on page ${page} (${upstream.status}): ${JSON.stringify(data)}`
      );
    }
    if (!data) throw new Error('Empty response from Checkpoint API');

    const pageRecords = data.responseData ?? [];
    allRecords.push(...pageRecords);
    scrollId = data.responseEnvelope?.scrollId || undefined;
    page++;
    if (pageRecords.length === 0) break;
  } while (scrollId && page < MAX_PAGES);

  let upserted = 0;
  for (const record of allRecords) {
    const eventId =
      record.eventId ||
      record.id ||
      record.event_id ||
      `${Date.now()}-${Math.random()}`;
    try {
      await pool.query(
        `INSERT INTO checkpoint_events (
           event_id, customer_id, type, state, severity, confidence_indicator,
           description, sender_address, saas, entity_id, entity_link,
           event_created, actions, additional_data, raw
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (event_id) DO UPDATE SET
           state = EXCLUDED.state,
           actions = EXCLUDED.actions,
           raw = EXCLUDED.raw,
           synced_at = NOW()`,
        [
          eventId,
          record.customerId || null,
          record.type || null,
          record.state || null,
          record.severity || null,
          record.confidenceIndicator || null,
          record.description || null,
          record.senderAddress || null,
          record.saas || null,
          record.entityId || null,
          record.entityLink || null,
          record.eventCreated ? new Date(record.eventCreated) : null,
          record.actions ? JSON.stringify(record.actions) : null,
          record.additionalData ? JSON.stringify(record.additionalData) : null,
          JSON.stringify(record),
        ]
      );
      upserted++;
    } catch (err) {
      console.error(`[Harmony sync][org=${orgSlug}] upsert error:`, err.message);
    }
  }

  const { rows } = await pool.query('SELECT COUNT(*) FROM checkpoint_events');
  const totalInDb = parseInt(rows[0].count, 10);

  console.log(
    `[Harmony sync][org=${orgSlug}] Fetched ${allRecords.length}, upserted ${upserted}`
  );

  // Invalidate Redis cache on fresh sync
  if (orgSlug) {
    try {
      const client = await redis.getRedisClient();
      if (client) {
        const cacheKey = redis.buildCacheKey(orgSlug, 'harmony-events');
        await client.del(cacheKey);
      }
    } catch (_) {}
  }

  return {
    fetched: allRecords.length,
    upserted,
    totalInDb,
    syncedAt: new Date().toISOString(),
  };
}

module.exports = { syncHarmony, getHarmonyToken };
