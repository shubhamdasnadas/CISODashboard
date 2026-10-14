/**
 * Multi-tier dashboard cache (Redis + localStorage)
 *
 * Tier 1: Browser localStorage per-widget storage for 0ms instantaneous UI hydration.
 * Tier 2: Backend Redis cache layer serving aggregated responses in 5–7 second polling cycles.
 *
 * Flow:
 * 1. On page mount, read from localStorage to immediately show all widgets.
 * 2. If no localStorage cache exists (first time), fetch from Redis via /api/dashboard/aggregate.
 * 3. Save incoming data into localStorage for EACH and EVERY widget of the dashboard.
 * 4. Background polling runs every 5 to 7 seconds checking Redis.
 * 5. If data updated in Redis, automatically update localStorage and refresh the widgets.
 */

export const WIDGET_KEYS = {
  S1_THREATS: 's1_threats',
  S1_AGENTS: 's1_agents',
  S1_APP_AGENT: 's1_app_agent',
  S1_APP_CVE: 's1_app_cve',
  S1_DEVICE_CONTROL: 's1_device_control',
  S1_RSS: 's1_rss',
  S1_CUSTOM_ALERTS: 's1_custom_alerts',
  CP_EVENTS: 'cp_events',
  TICKET_DATA: 'ticket_data',
  MDM_DATA: 'mdm_data',
  FW_WIDGETS: 'fw_widgets',
  LAYOUT: 'layout',
  ALL_TOOLS: 'all_tools',
  META: 'meta',
  AGGREGATE: 'aggregate',
};

const STORAGE_PREFIX = 'ciso_widget_';

export function getWidgetStorageKey(orgKey, widgetId) {
  const safeOrg = orgKey || 'default';
  return `${STORAGE_PREFIX}${safeOrg}_${widgetId}`;
}

export function readWidgetStorage(orgKey, widgetId) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(getWidgetStorageKey(orgKey, widgetId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[dashboard-cache] Failed to read ${widgetId}:`, err?.message);
    return null;
  }
}

export function writeWidgetStorage(orgKey, widgetId, data) {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const key = getWidgetStorageKey(orgKey, widgetId);
    if (data === undefined || data === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(data));
    }
    return true;
  } catch (err) {
    console.warn(`[dashboard-cache] Failed to write ${widgetId}:`, err?.message);
    return false;
  }
}

/**
 * Load all widget data from localStorage for instant 0ms dashboard hydration.
 */
export function loadAllWidgetsFromStorage(orgKey) {
  const meta = readWidgetStorage(orgKey, WIDGET_KEYS.META);
  const s1Threats = readWidgetStorage(orgKey, WIDGET_KEYS.S1_THREATS);
  const s1Agents = readWidgetStorage(orgKey, WIDGET_KEYS.S1_AGENTS);
  const s1AppAgent = readWidgetStorage(orgKey, WIDGET_KEYS.S1_APP_AGENT);
  const s1AppCve = readWidgetStorage(orgKey, WIDGET_KEYS.S1_APP_CVE);
  const s1DeviceControl = readWidgetStorage(orgKey, WIDGET_KEYS.S1_DEVICE_CONTROL);
  const s1Rss = readWidgetStorage(orgKey, WIDGET_KEYS.S1_RSS);
  const s1CustomAlerts = readWidgetStorage(orgKey, WIDGET_KEYS.S1_CUSTOM_ALERTS);
  const cpEvents = readWidgetStorage(orgKey, WIDGET_KEYS.CP_EVENTS);
  const ticketData = readWidgetStorage(orgKey, WIDGET_KEYS.TICKET_DATA);
  const mdmData = readWidgetStorage(orgKey, WIDGET_KEYS.MDM_DATA);
  const fwWidgets = readWidgetStorage(orgKey, WIDGET_KEYS.FW_WIDGETS);
  const layout = readWidgetStorage(orgKey, WIDGET_KEYS.LAYOUT);
  const allTools = readWidgetStorage(orgKey, WIDGET_KEYS.ALL_TOOLS);

  const hasCache = Boolean(
    (Array.isArray(s1Threats) && s1Threats.length > 0) ||
    (Array.isArray(s1Agents) && s1Agents.length > 0) ||
    (Array.isArray(cpEvents) && cpEvents.length > 0) ||
    (Array.isArray(ticketData) && ticketData.length > 0) ||
    (Array.isArray(mdmData) && mdmData.length > 0) ||
    (Array.isArray(fwWidgets) && fwWidgets.length > 0) ||
    layout !== null ||
    meta !== null
  );

  return {
    hasCache,
    meta,
    s1Threats: Array.isArray(s1Threats) ? s1Threats : null,
    s1Agents: Array.isArray(s1Agents) ? s1Agents : null,
    s1AppAgent: Array.isArray(s1AppAgent) ? s1AppAgent : null,
    s1AppCve: Array.isArray(s1AppCve) ? s1AppCve : null,
    s1DeviceControl: Array.isArray(s1DeviceControl) ? s1DeviceControl : null,
    s1Rss: Array.isArray(s1Rss) ? s1Rss : null,
    s1CustomAlerts: Array.isArray(s1CustomAlerts) ? s1CustomAlerts : null,
    cpEvents: Array.isArray(cpEvents) ? cpEvents : null,
    ticketData: Array.isArray(ticketData) ? ticketData : null,
    mdmData: Array.isArray(mdmData) ? mdmData : null,
    fwWidgets: Array.isArray(fwWidgets) ? fwWidgets : null,
    layout: layout || null,
    allTools: allTools || null,
  };
}

/**
 * Persist every single widget from the aggregate payload into its dedicated localStorage key.
 */
export function saveAllWidgetsToStorage(orgKey, agg, source = 'redis') {
  if (!orgKey || !agg) return;

  const sentinelone = agg.sentinelone || {};
  const harmony = agg.harmony || {};
  const firewall = agg.firewall || {};
  const ticketing = agg.ticketing || {};
  const mdm = agg.mdm || {};

  // 1. SentinelOne threats & widgets
  if (Array.isArray(sentinelone.threats)) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.S1_THREATS, sentinelone.threats);
  }
  if (Array.isArray(sentinelone.agents)) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.S1_AGENTS, sentinelone.agents);
  }
  if (Array.isArray(sentinelone.applicationAgent)) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.S1_APP_AGENT, sentinelone.applicationAgent);
  }
  if (Array.isArray(sentinelone.applicationCve)) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.S1_APP_CVE, sentinelone.applicationCve);
  }
  if (Array.isArray(sentinelone.deviceControl)) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.S1_DEVICE_CONTROL, sentinelone.deviceControl);
  }
  if (Array.isArray(sentinelone.rss)) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.S1_RSS, sentinelone.rss);
  }
  if (Array.isArray(sentinelone.customAlerts)) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.S1_CUSTOM_ALERTS, sentinelone.customAlerts);
  }

  // 2. Checkpoint events
  if (Array.isArray(harmony.events)) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.CP_EVENTS, harmony.events);
  }

  // 3. Ticketing tickets
  if (Array.isArray(ticketing.tickets)) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.TICKET_DATA, ticketing.tickets);
  }

  // 4. MDM devices
  if (Array.isArray(mdm.devices)) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.MDM_DATA, mdm.devices);
  }

  // 5. Firewall widgets
  if (Array.isArray(firewall.widgets)) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.FW_WIDGETS, firewall.widgets);
  }

  // 6. Layout
  if (agg.layout) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.LAYOUT, agg.layout);
  }

  // 7. All Tools summary
  if (agg.allTools) {
    writeWidgetStorage(orgKey, WIDGET_KEYS.ALL_TOOLS, agg.allTools);
  }

  // 8. Meta info
  const meta = {
    syncedAt: agg.syncedAt || null,
    source: source || agg.source || 'redis',
    cachedAt: new Date().toISOString(),
  };
  writeWidgetStorage(orgKey, WIDGET_KEYS.META, meta);

  // 9. Aggregate raw snapshot
  writeWidgetStorage(orgKey, WIDGET_KEYS.AGGREGATE, agg);
}

/**
 * Fast comparison to determine if data has changed between polling intervals
 */
export function isDifferentData(a, b) {
  if (a === b) return false;
  if (!a || !b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return true;
    if (a.length === 0) return false;
    // Compare first, middle, and last item for high-performance detection
    const firstSame = JSON.stringify(a[0]) === JSON.stringify(b[0]);
    if (!firstSame) return true;
    const lastSame = JSON.stringify(a[a.length - 1]) === JSON.stringify(b[b.length - 1]);
    if (!lastSame) return true;
    const midIdx = Math.floor(a.length / 2);
    return JSON.stringify(a[midIdx]) !== JSON.stringify(b[midIdx]);
  }
  return JSON.stringify(a) !== JSON.stringify(b);
}
