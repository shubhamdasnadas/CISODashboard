/**
 * Multi-Tier Dashboard Caching Architecture (Redis + IndexedDB + UI)
 *
 * Tier 1 (Backend): Backend Database / PostgreSQL -> Accelerated by Redis cache layer
 * Tier 2 (Client Storage): IndexedDB ('ciso_dashboard_db', store 'dashboard_widgets')
 * Tier 3 (Client Presentation): Dashboard UI components rendering from IndexedDB
 *
 * Flow:
 * 1. Initial load / revisits: Dashboard UI immediately loads and renders from IndexedDB.
 * 2. First-time load: Data fetched from Redis (/api/dashboard/aggregate) ->
 *    stored into IndexedDB -> rendered in UI from IndexedDB.
 * 3. Background synchronization: Client polls Redis every 5 to 7 seconds (6s).
 *    When Redis has updated data, data transfers from Redis to IndexedDB,
 *    and the UI re-renders with the fresh data from IndexedDB.
 * 4. User actions (layout edit, add/delete widgets) update IndexedDB and backend.
 * 5. LocalStorage widget cache is completely eliminated.
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
  TOP_APPLICATIONS: 'top_applications',
  THREAT_INTEL_CVES: 'threat_intel_cves',
  META: 'meta',
  AGGREGATE: 'aggregate',
};

const DB_NAME = 'ciso_dashboard_db';
const DB_VERSION = 3;
export const STORE_NAME = 'dashboard_widgets';
export const EDR_STORE_NAME = 'edr_widget';

export const EDR_SECTION_KEYS = {
  THREATS: 'threats',
  CVE: 'cve',
  AGENTS: 'agents',
};

let dbInstance = null;
let dbOpenPromise = null;

// Synchronous in-memory mirror so React components have 0ms instant data access
// during rapid re-renders while IndexedDB completes its asynchronous read/write.
const memoryCache = new Map();

/**
 * Safely serialize any payload to ensure pure JSON compliance
 * (guarantees IndexedDB structured clone algorithm will never throw DataCloneError).
 */
export function safeSerialize(data) {
  if (data === undefined || data === null) return null;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (err) {
    console.warn('[IndexedDB] Serialization error:', err?.message);
    return null;
  }
}

/**
 * Open or initialize the IndexedDB database
 */
export function openDashboardDb() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('orgKey', 'orgKey', { unique: false });
          store.createIndex('widgetId', 'widgetId', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(EDR_STORE_NAME)) {
          const edrStore = db.createObjectStore(EDR_STORE_NAME, { keyPath: 'key' });
          edrStore.createIndex('orgKey', 'orgKey', { unique: false });
          edrStore.createIndex('section', 'section', { unique: false });
          edrStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        // Remove duplicate edr_widgets object store so only edr_widget exists
        if (db.objectStoreNames.contains('edr_widgets')) {
          db.deleteObjectStore('edr_widgets');
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        dbInstance.onversionchange = () => {
          dbInstance.close();
          dbInstance = null;
          dbOpenPromise = null;
        };
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.error('[IndexedDB] Open error:', event.target.error);
        dbOpenPromise = null;
        resolve(null);
      };
    } catch (err) {
      console.error('[IndexedDB] Initialization exception:', err);
      dbOpenPromise = null;
      resolve(null);
    }
  });

  return dbOpenPromise;
}

/**
 * Purge any legacy localStorage widget cache keys to ensure zero localStorage usage
 */
export function purgeLegacyLocalStorageWidgetCache() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith('ciso_widget_') || k.includes('_threat_intel_cves') || k.includes('_top_applications'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch (_) {}
}

/**
 * Read a single widget from IndexedDB
 */
export async function readWidgetDb(orgKey, widgetId) {
  const safeOrg = String(orgKey || 'default');
  const cacheKey = `${safeOrg}_${widgetId}`;

  // Check in-memory mirror first
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  const db = await openDashboardDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);

      req.onsuccess = () => {
        const val = req.result?.data ?? null;
        if (val !== null) {
          memoryCache.set(cacheKey, val);
        }
        resolve(val);
      };
      req.onerror = () => resolve(null);
    } catch (err) {
      console.warn(`[IndexedDB] Read error for ${widgetId}:`, err?.message);
      resolve(null);
    }
  });
}

/**
 * Write a single widget to IndexedDB
 */
export async function writeWidgetDb(orgKey, widgetId, data) {
  const safeOrg = String(orgKey || 'default');
  const cacheKey = `${safeOrg}_${widgetId}`;

  // Update memory mirror immediately for 0ms access
  if (data === null || data === undefined) {
    memoryCache.delete(cacheKey);
  } else {
    memoryCache.set(cacheKey, data);
  }

  const db = await openDashboardDb();
  if (!db) return false;

  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (!finished) {
        finished = true;
        resolve(result);
      }
    };
    const timer = setTimeout(() => finish(false), 2000);

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      if (data === null || data === undefined) {
        store.delete(cacheKey);
      } else {
        const cleanData = safeSerialize(data);
        store.put({
          key: cacheKey,
          orgKey: safeOrg,
          widgetId,
          data: cleanData,
          updatedAt: new Date().toISOString(),
        });
      }

      tx.oncomplete = () => {
        clearTimeout(timer);
        finish(true);
      };
      tx.onerror = () => {
        clearTimeout(timer);
        finish(false);
      };
      tx.onabort = () => {
        clearTimeout(timer);
        finish(false);
      };
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[IndexedDB] Write error for ${widgetId}:`, err?.message);
      finish(false);
    }
  });
}

/**
 * Read an EDR section from IndexedDB ('edr_widget' store)
 */
export async function readEdrWidgetDb(orgKey, sectionKey) {
  const safeOrg = String(orgKey || 'default');
  const cacheKey = `${safeOrg}_edr_${sectionKey}`;

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  const db = await openDashboardDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const storeName = db.objectStoreNames.contains(EDR_STORE_NAME)
        ? EDR_STORE_NAME
        : STORE_NAME;

      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(cacheKey);

      req.onsuccess = () => {
        const val = req.result?.data ?? null;
        if (val !== null) {
          memoryCache.set(cacheKey, val);
        }
        resolve(val);
      };
      req.onerror = () => resolve(null);
    } catch (err) {
      console.warn(`[IndexedDB] Read error for edr ${sectionKey}:`, err?.message);
      resolve(null);
    }
  });
}

/**
 * Write an EDR section to IndexedDB ('edr_widget' store)
 */
export async function writeEdrWidgetDb(orgKey, sectionKey, data) {
  const safeOrg = String(orgKey || 'default');
  const cacheKey = `${safeOrg}_edr_${sectionKey}`;

  if (data === null || data === undefined) {
    memoryCache.delete(cacheKey);
  } else {
    memoryCache.set(cacheKey, data);
  }

  const db = await openDashboardDb();
  if (!db) return false;

  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (!finished) {
        finished = true;
        resolve(result);
      }
    };
    const timer = setTimeout(() => finish(false), 2000);

    try {
      const storeName = db.objectStoreNames.contains(EDR_STORE_NAME)
        ? EDR_STORE_NAME
        : STORE_NAME;

      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      if (data === null || data === undefined) {
        store.delete(cacheKey);
      } else {
        const cleanData = safeSerialize(data);
        store.put({
          key: cacheKey,
          orgKey: safeOrg,
          section: sectionKey,
          data: cleanData,
          updatedAt: new Date().toISOString(),
        });
      }

      tx.oncomplete = () => {
        clearTimeout(timer);
        finish(true);
      };
      tx.onerror = () => {
        clearTimeout(timer);
        finish(false);
      };
      tx.onabort = () => {
        clearTimeout(timer);
        finish(false);
      };
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[IndexedDB] Write error for edr ${sectionKey}:`, err?.message);
      finish(false);
    }
  });
}

/**
 * Load all widget data from IndexedDB for a given organization
 */
export async function loadAllWidgetsFromDb(orgKey) {
  const safeOrg = String(orgKey || 'default');
  const db = await openDashboardDb();
  if (!db) {
    return { hasCache: false };
  }

  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (!finished) {
        finished = true;
        resolve(result);
      }
    };
    const timer = setTimeout(() => finish({ hasCache: false }), 2000);

    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        clearTimeout(timer);
        const allItems = req.result || [];
        const items = allItems.filter(
          (item) => String(item.orgKey) === safeOrg || String(item.key || '').startsWith(`${safeOrg}_`)
        );
        const map = {};
        items.forEach((item) => {
          map[item.widgetId] = item.data;
          memoryCache.set(item.key, item.data);
        });

        const hasCache = items.length > 0;

        finish({
          hasCache,
          meta: map[WIDGET_KEYS.META] ?? null,
          s1Threats: map[WIDGET_KEYS.S1_THREATS] ?? null,
          s1Agents: map[WIDGET_KEYS.S1_AGENTS] ?? null,
          s1AppAgent: map[WIDGET_KEYS.S1_APP_AGENT] ?? null,
          s1AppCve: map[WIDGET_KEYS.S1_APP_CVE] ?? null,
          s1DeviceControl: map[WIDGET_KEYS.S1_DEVICE_CONTROL] ?? null,
          s1Rss: map[WIDGET_KEYS.S1_RSS] ?? null,
          s1CustomAlerts: map[WIDGET_KEYS.S1_CUSTOM_ALERTS] ?? null,
          cpEvents: map[WIDGET_KEYS.CP_EVENTS] ?? null,
          ticketData: map[WIDGET_KEYS.TICKET_DATA] ?? null,
          mdmData: map[WIDGET_KEYS.MDM_DATA] ?? null,
          fwWidgets: map[WIDGET_KEYS.FW_WIDGETS] ?? null,
          layout: map[WIDGET_KEYS.LAYOUT] ?? null,
          allTools: map[WIDGET_KEYS.ALL_TOOLS] ?? null,
          topApplications: map[WIDGET_KEYS.TOP_APPLICATIONS] ?? null,
          threatIntelCves: map[WIDGET_KEYS.THREAT_INTEL_CVES] ?? null,
          aggregate: map[WIDGET_KEYS.AGGREGATE] ?? null,
        });
      };

      req.onerror = () => {
        clearTimeout(timer);
        finish({ hasCache: false });
      };
      tx.onabort = () => {
        clearTimeout(timer);
        finish({ hasCache: false });
      };
    } catch (err) {
      clearTimeout(timer);
      console.warn('[IndexedDB] Load all error:', err?.message);
      finish({ hasCache: false });
    }
  });
}

/**
 * Persist every single widget from the Redis aggregate payload into IndexedDB
 */
export async function saveAllWidgetsToDb(orgKey, agg, source = 'redis') {
  if (!orgKey || !agg) return false;
  const safeOrg = String(orgKey || 'default');

  const root = agg.data || agg;
  const s1 = root.sentinelone || {};
  const harmony = root.harmony || {};
  const firewall = root.firewall || {};
  const ticketing = root.ticketing || {};
  const mdm = root.mdm || {};

  // 1. SentinelOne threats & endpoint postures
  const threats = s1.threats ?? root.threats ?? root.s1Threats ?? [];
  const agents = s1.agents ?? root.agents ?? root.s1Agents ?? [];
  const appAgent = s1.applicationAgent ?? root.applicationAgent ?? root.appAgent ?? root.apps ?? [];
  const appCve = s1.applicationCve ?? root.applicationCve ?? root.appCve ?? root.cves ?? [];
  const deviceControl = s1.deviceControl ?? root.deviceControl ?? [];
  const rss = s1.rss ?? root.rss ?? [];
  const customAlerts = s1.customAlerts ?? root.customAlerts ?? [];

  // 2. Harmony Checkpoint events
  const cpEvents = harmony.events ?? root.events ?? root.cpEvents ?? [];

  // 3. Ticketing tickets
  const tickets = ticketing.tickets ?? root.tickets ?? root.zohoTickets ?? [];

  // 4. MDM devices
  const devices = mdm.devices ?? root.devices ?? root.mdmDevices ?? [];

  // 5. Firewall widgets
  const fwWidgets = firewall.widgets ?? root.widgets ?? root.fwWidgets ?? [];

  // 6. Layout
  const layout = root.layout ?? agg.layout ?? null;

  // 7. All Tools summary
  const allTools = root.allTools ?? agg.allTools ?? null;

  // 8. Firewall Top Applications
  const topApps = root.topApplications ?? root.firewall?.topApplications ?? agg.topApplications ?? firewall.topApplications ?? null;

  // 9. Threat Intel CVEs
  const cves = root.threatIntelCves ?? root.nvdCves ?? agg.threatIntelCves ?? null;

  // 10. Meta info
  const meta = {
    syncedAt: root.syncedAt || agg.syncedAt || null,
    source: source || root.source || agg.source || 'redis',
    cachedAt: new Date().toISOString(),
  };

  const widgetMap = {
    [WIDGET_KEYS.S1_THREATS]: threats,
    [WIDGET_KEYS.S1_AGENTS]: agents,
    [WIDGET_KEYS.S1_APP_AGENT]: appAgent,
    [WIDGET_KEYS.S1_APP_CVE]: appCve,
    [WIDGET_KEYS.S1_DEVICE_CONTROL]: deviceControl,
    [WIDGET_KEYS.S1_RSS]: rss,
    [WIDGET_KEYS.S1_CUSTOM_ALERTS]: customAlerts,
    [WIDGET_KEYS.CP_EVENTS]: cpEvents,
    [WIDGET_KEYS.TICKET_DATA]: tickets,
    [WIDGET_KEYS.MDM_DATA]: devices,
    [WIDGET_KEYS.FW_WIDGETS]: fwWidgets,
    [WIDGET_KEYS.META]: meta,
  };
  if (layout) widgetMap[WIDGET_KEYS.LAYOUT] = layout;
  if (allTools) widgetMap[WIDGET_KEYS.ALL_TOOLS] = allTools;
  if (topApps) widgetMap[WIDGET_KEYS.TOP_APPLICATIONS] = topApps;
  if (cves) widgetMap[WIDGET_KEYS.THREAT_INTEL_CVES] = cves;
  widgetMap[WIDGET_KEYS.AGGREGATE] = {
    syncedAt: meta.syncedAt,
    source: meta.source,
    cachedAt: meta.cachedAt,
    widgetCount: Object.keys(widgetMap).length,
  };

  // Immediate in-memory cache update for 0ms instant UI rendering
  Object.entries(widgetMap).forEach(([widgetId, data]) => {
    if (data !== undefined && data !== null) {
      memoryCache.set(`${safeOrg}_${widgetId}`, data);
    }
  });

  const db = await openDashboardDb();
  if (!db) return false;

  // Asynchronous persistent write to IndexedDB
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (!finished) {
        finished = true;
        resolve(result);
      }
    };
    // Safety watchdog timer: never block the background sync loop
    const timer = setTimeout(() => finish(false), 2500);

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const now = new Date().toISOString();

      Object.entries(widgetMap).forEach(([widgetId, rawData]) => {
        if (rawData === undefined || rawData === null) return;
        try {
          const cleanData = safeSerialize(rawData);
          store.put({
            key: `${safeOrg}_${widgetId}`,
            orgKey: safeOrg,
            widgetId,
            data: cleanData,
            updatedAt: now,
          });
        } catch (cloneErr) {
          console.warn(`[IndexedDB] Serialization put error for ${widgetId}:`, cloneErr?.message);
        }
      });

      tx.oncomplete = () => {
        // Also populate the dedicated edr_widget store
        try {
          const edrStoreName = db.objectStoreNames.contains(EDR_STORE_NAME)
            ? EDR_STORE_NAME
            : null;
          if (edrStoreName) {
            const edrTx = db.transaction(edrStoreName, 'readwrite');
            const edrStore = edrTx.objectStore(edrStoreName);
            const edrSections = [
              { key: EDR_SECTION_KEYS.THREATS, data: threats },
              { key: EDR_SECTION_KEYS.CVE, data: appCve },
              { key: EDR_SECTION_KEYS.AGENTS, data: agents },
            ];
            edrSections.forEach(({ key, data }) => {
              if (data !== undefined && data !== null) {
                const clean = safeSerialize(data);
                edrStore.put({
                  key: `${safeOrg}_edr_${key}`,
                  orgKey: safeOrg,
                  section: key,
                  data: clean,
                  updatedAt: now,
                });
                memoryCache.set(`${safeOrg}_edr_${key}`, clean);
              }
            });
          }
        } catch (edrErr) {
          console.warn('[IndexedDB] edr_widget save error in saveAllWidgetsToDb:', edrErr?.message);
        }

        clearTimeout(timer);
        finish(true);
      };
      tx.onerror = (e) => {
        clearTimeout(timer);
        console.warn('[IndexedDB] Transaction error in saveAllWidgetsToDb:', e?.target?.error);
        // Fallback: write individually so failure of one does not lose the others
        Promise.all(
          Object.entries(widgetMap).map(([id, d]) => writeWidgetDb(safeOrg, id, d))
        ).then(() => finish(true)).catch(() => finish(false));
      };
      tx.onabort = (e) => {
        clearTimeout(timer);
        console.warn('[IndexedDB] Transaction abort in saveAllWidgetsToDb:', e?.target?.error);
        // Fallback: write individually
        Promise.all(
          Object.entries(widgetMap).map(([id, d]) => writeWidgetDb(safeOrg, id, d))
        ).then(() => finish(true)).catch(() => finish(false));
      };
    } catch (err) {
      clearTimeout(timer);
      console.warn('[IndexedDB] Save all exception:', err?.message);
      // Fallback: write individually
      Promise.all(
        Object.entries(widgetMap).map(([id, d]) => writeWidgetDb(safeOrg, id, d))
      ).then(() => finish(true)).catch(() => finish(false));
    }
  });
}

/**
 * Synchronous in-memory lookup for instant rendering if the database has already loaded
 */
export function getInMemoryWidget(orgKey, widgetId) {
  const safeOrg = String(orgKey || 'default');
  return memoryCache.get(`${safeOrg}_${widgetId}`) || null;
}

/**
 * Fast comparison to determine if data from Redis has changed
 */
export function isDifferentData(a, b) {
  if (a === b) return false;
  if (!a || !b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return true;
    if (a.length === 0) return false;
    const firstSame = JSON.stringify(a[0]) === JSON.stringify(b[0]);
    if (!firstSame) return true;
    const lastSame = JSON.stringify(a[a.length - 1]) === JSON.stringify(b[b.length - 1]);
    if (!lastSame) return true;
    const midIdx = Math.floor(a.length / 2);
    return JSON.stringify(a[midIdx]) !== JSON.stringify(b[midIdx]);
  }
  return JSON.stringify(a) !== JSON.stringify(b);
}

// Purge any stale localStorage widget items on module initialization
purgeLegacyLocalStorageWidgetCache();
