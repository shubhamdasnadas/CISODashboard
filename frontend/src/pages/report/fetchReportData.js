import api from '../../api';

/**
 * Fetch report data. If `forDate` is supplied (YYYY-MM-DD string) only data
 * that falls on that calendar day is returned so the PDF reflects a single-day
 * snapshot.  When omitted the full dataset is returned (existing behaviour).
 */
export async function fetchReportData(orgName, forDate, section) {
  const safe = (promise) => promise.catch(() => null);

  // Build an optional query-string param so backends that support date
  // filtering can narrow their result set.  The current DB endpoints
  // return all data, so we also do client-side filtering below.
  const dateQs = forDate ? `?date=${forDate}` : '';

  const [
    threatsRes,
    agentsRes,
    cveRes,
    deviceRes,
    harmonyRes,
    fwWidgetsRes,
    fwRiskRes,
    fwAttackersRes,
    fwAttackerDestRes,
    fwDeniedDestRes,
    fwDeniedSourceRes,
    fwDeniedAppRes,
    fwRiskyUsersRes,
    fwTopAttacksRes,
    fwConnectionsRes,
    appAgentRes,
    removedAgentsRes,
    zohoRes,
    healthRes,
    // MDM (Hexnode)
    mdmDevicesRes,
    mdmAppsRes,
    // NVD
    nvdStatsRes,
    // Microsoft 365
    msDataRes,
  ] = await Promise.all([
    safe(api.get(`/sentinelone/db/threats${dateQs}`)),
    safe(api.get(`/sentinelone/db/agents${dateQs}`)),
    safe(api.get(`/sentinelone/db/application-cve${dateQs}`)),
    safe(api.get(`/sentinelone/db/device-control${dateQs}`)),
    safe(api.get(`/harmony/events-db${dateQs}`)),
    safe(api.get('/firewall/widgets')),
    safe(api.get('/firewall/reports/risk-trend')),
    safe(api.get('/firewall/reports/top-attacker-sources')),
    safe(api.get('/firewall/reports/top-attacker-destinations')),
    safe(api.get('/firewall/reports/top-denied-destinations')),
    safe(api.get('/firewall/reports/top-denied-sources')),
    safe(api.get('/firewall/reports/top-denied-applications')),
    safe(api.get('/firewall/reports/risky-users')),
    safe(api.get('/firewall/reports/top-attacks')),
    safe(api.get('/firewall/reports/top-connections')),
    safe(api.get(`/sentinelone/db/application-agent${dateQs}`)),
    safe(api.get('/sentinelone/db/agents/removed-count')),
    safe(api.get(`/zoho/tickets-db${dateQs}`)),
    safe(api.get('/compliance-health-scores')),
    // MDM
    safe(api.get('/hexnode/db/devices')),
    safe(api.get('/hexnode/db/applications')),
    // NVD
    safe(api.get('/nvd/stats')),
    // Microsoft 365
    safe(api.get('/microsoft/data')),
  ]);

  // --- client-side date filtering helper ---
  // Keeps only records whose primary timestamp falls on `forDate` (YYYY-MM-DD).
  const matchesDate = (timestamp) => {
    if (!forDate || !timestamp) return true;
    try {
      const d = new Date(typeof timestamp === 'string' ? timestamp.replace(' ', 'T') : timestamp);
      if (isNaN(d.getTime())) return true;          // unparseable → keep
      return d.toISOString().slice(0, 10) === forDate;
    } catch { return true; }
  };

  // ── Compliance-health / MTTR scores ────────────────────────────────────────
  // Pull the raw per-domain scores so the PDF gauges show the same numbers the
  // CyberHygen widgets show (mitigated/total etc.). Prefer the stored combined
  // score; otherwise derive from the raw endpoints.
  const [edrRes, emailRes, ticketingRes] = await Promise.all([
    safe(api.get('/compliance-health-scores/edr')),
    safe(api.get('/compliance-health-scores/email-security')),
    safe(api.get('/compliance-health-scores/ticketing')),
  ]);

  const storedScore = healthRes?.data?.score;
  const edr      = edrRes?.data      ?? {};
  const email    = emailRes?.data    ?? {};
  const ticketing = ticketingRes?.data ?? {};

  const num = (v) => Number(v) || 0;
  const pct = (part, whole) => (whole > 0 ? Math.min(Math.max((part / whole) * 100, 0), 100) : 0);

  const edrPct     = storedScore ? num(storedScore.edr_percentage)     : pct(num(edr.mitigated), num(edr.total));
  const emailPct   = storedScore ? num(storedScore.email_percentage)   : pct(num(email.remediated), num(email.total));
  const ticketPct  = storedScore ? num(storedScore.ticketing_percentage) : pct(num(ticketing.closed), num(ticketing.total));

  const avgPct = (edrPct + emailPct + ticketPct) / 3;

  const mttr = {
    overall:   { pct: avgPct,      goodCount: '',        badCount: '' },
    sentinelOne: { pct: edrPct,    goodCount: num(edr.mitigated),       badCount: num(edr.total) - num(edr.mitigated) },
    email:     { pct: emailPct,    goodCount: num(email.remediated),    badCount: num(email.total) - num(email.remediated), total: num(email.total) },
    ticketing: { pct: ticketPct,   goodCount: num(ticketing.closed),    badCount: num(ticketing.total) - num(ticketing.closed) },
  };

  let s1Threats     = threatsRes?.data?.threats  ?? [];
  let harmonyEvents = harmonyRes?.data?.events ?? harmonyRes?.data?.responseData ?? [];
  let zohoTickets   = zohoRes?.data?.responseData ?? zohoRes?.data?.tickets ?? [];

  // DEBUG: Log raw API responses to diagnose empty PDF data
  console.log('[fetchReportData] RAW API responses:', {
    forDate,
    s1ThreatsCount: s1Threats.length,
    harmonyEventsCount: harmonyEvents.length,
    zohoTicketsCount: zohoTickets.length,
    fwRiskRaw: fwRiskRes?.data,
    fwAttackersRaw: fwAttackersRes?.data,
    fwConnectionsRaw: fwConnectionsRes?.data,
    fwAttackerDestRaw: fwAttackerDestRes?.data,
    fwDeniedDestRaw: fwDeniedDestRes?.data,
    fwDeniedSourceRaw: fwDeniedSourceRes?.data,
    fwDeniedAppRaw: fwDeniedAppRes?.data,
    fwRiskyUsersRaw: fwRiskyUsersRes?.data,
    fwTopAttacksRaw: fwTopAttacksRes?.data,
    zohoRes: zohoRes?.data,
  });

  if (forDate) {
    s1Threats     = s1Threats.filter(t => matchesDate(t.threatInfo?.createdAt));
    harmonyEvents = harmonyEvents.filter(e => matchesDate(e.event_created || e.created_at));
    zohoTickets   = zohoTickets.filter(t => matchesDate(t.created_time || t.createdTime));
  }

  return {
    generatedAt: forDate ? new Date(`${forDate}T23:59:59`) : new Date(),
    orgName: orgName || 'Organisation',
    section: section || null,
    s1Threats,
    s1Agents:           agentsRes?.data?.agents    ?? [],
    s1Cves:             cveRes?.data?.data ?? cveRes?.data?.cves ?? [],
    s1DeviceControl:    deviceRes?.data?.data      ?? [],
    harmonyEvents,
    fwWidgets:          fwWidgetsRes?.data?.widgets ?? fwWidgetsRes?.data?.data ?? [],
    fwRiskRaw:          fwRiskRes?.data            ?? null,
    fwAttackersRaw:     fwAttackersRes?.data       ?? null,
    fwAttackerDestRaw:  fwAttackerDestRes?.data    ?? null,
    fwDeniedDestRaw:    fwDeniedDestRes?.data      ?? null,
    fwDeniedSourceRaw:  fwDeniedSourceRes?.data    ?? null,
    fwDeniedAppRaw:     fwDeniedAppRes?.data       ?? null,
    fwRiskyUsersRaw:    fwRiskyUsersRes?.data      ?? null,
    fwTopAttacksRaw:    fwTopAttacksRes?.data      ?? null,
    fwConnectionsRaw:   fwConnectionsRes?.data     ?? null,
    s1AppAgent:         appAgentRes?.data?.data    ?? [],
    removedAgentsCount: removedAgentsRes?.data?.count ?? 0,
    zohoTickets,
    mttr,
    // MDM (Hexnode)
    mdmDevices:         Array.isArray(mdmDevicesRes?.data?.data) ? mdmDevicesRes.data.data : [],
    mdmApps:            Array.isArray(mdmAppsRes?.data?.data) ? mdmAppsRes.data.data : [],
    // NVD
    nvdStats:           nvdStatsRes?.data ?? null,
    // Microsoft 365
    msData:             msDataRes?.data ?? {},
  };
}
