import api from '../../api';
import { extractTable } from './dataUtils';

/**
 * Fetch report data. If `forDate` is supplied (YYYY-MM-DD string) only data
 * that falls on that calendar day is returned so the PDF reflects a single-day
 * snapshot.  When omitted the full dataset is returned (existing behaviour).
 */
export async function fetchReportData(orgName, forDate, section, dateFilter) {
  const safe = (promise) => promise.catch(() => null);

  // Build an optional query-string param so backends that support date
  // filtering can narrow their result set.  The current DB endpoints
  // return all data, so we also do client-side filtering below.
  const dateQs = forDate ? `?date=${forDate}` : '';
  const nvdQs = (dateFilter?.from && dateFilter?.to)
    ? `?from=${encodeURIComponent(dateFilter.from)}&to=${encodeURIComponent(dateFilter.to)}`
    : (forDate ? `?from=${forDate}&to=${forDate}` : '');

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
    nvdRowsRes,
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
    safe(api.get(`/nvd/stats${nvdQs}`)),
    safe(api.get('/nvd/analytics-rows')),
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
  let harmonyRaw    = harmonyRes?.data?.events ?? harmonyRes?.data?.responseData ?? [];
  let zohoTickets   = zohoRes?.data?.responseData ?? zohoRes?.data?.tickets ?? [];

  const mapHarmonyEvent = (e) => {
    if (!e) return e;
    const ad = e.additional_data || e.additionalData || {};
    return {
      ...e,
      eventId: e.event_id || e.eventId,
      type: e.type,
      state: e.state,
      severity: e.severity,
      description: e.description,
      senderAddress: e.sender_address || e.senderAddress,
      receiverAddress: ad.receiver_address || ad.recipient_address || ad.receiverAddress || ad.recipientAddress || ad.to || null,
      subject: ad.subject || ad.email_subject || ad.mail_subject || null,
      threatType: e.threat_type || ad.threat_type || null,
      mitigation: e.mitigation_action || ad.mitigation_action || null,
      confidenceIndicator: (e.confidence_indicator ?? ad.confidence_indicator ?? ad.confidenceIndicator ?? e.threat_confidence ?? ad.threat_confidence ?? null) || null,
      platform: e.mail_domain ?? e.platform ?? ad.platform ?? e.saas ?? ad.mail_domain ?? null,
      eventCreated: e.event_created || e.eventCreated || e.created_at || e.createdAt,
      saas: e.saas,
    };
  };

  let harmonyEvents = Array.isArray(harmonyRaw) ? harmonyRaw.map(mapHarmonyEvent) : [];

  const FW_REPORT_NAMES = [
    'risk-trend',
    'top-attacker-sources',
    'top-attacker-destinations',
    'top-denied-destinations',
    'top-denied-sources',
    'top-denied-applications',
    'risky-users',
    'top-attacks',
    'top-connections',
  ];

  const fwRawMap = {
    'risk-trend': fwRiskRes?.data,
    'top-attacker-sources': fwAttackersRes?.data,
    'top-attacker-destinations': fwAttackerDestRes?.data,
    'top-denied-destinations': fwDeniedDestRes?.data,
    'top-denied-sources': fwDeniedSourceRes?.data,
    'top-denied-applications': fwDeniedAppRes?.data,
    'risky-users': fwRiskyUsersRes?.data,
    'top-attacks': fwTopAttacksRes?.data,
    'top-connections': fwConnectionsRes?.data,
  };

  const fwReports = FW_REPORT_NAMES.map((name) => {
    const raw = fwRawMap[name]?.data ?? fwRawMap[name];
    const table = extractTable(raw);
    return { report: name, rows: table?.rows ?? [], columns: table?.columns ?? [] };
  });

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
    harmonyEvents = harmonyEvents.filter(e => matchesDate(e.eventCreated || e.event_created || e.created_at));
    zohoTickets   = zohoTickets.filter(t => matchesDate(t.created_time || t.createdTime));
  }

  return {
    generatedAt: forDate ? new Date(`${forDate}T23:59:59`) : new Date(),
    orgName: orgName || 'Organisation',
    section: section || null,
    s1Threats,
    s1ThreatsPrev:      null,
    s1Agents:           agentsRes?.data?.agents    ?? [],
    s1AgentsPrev:       null,
    s1Cves:             cveRes?.data?.data ?? cveRes?.data?.cves ?? [],
    s1CvesPrev:         null,
    s1DeviceControl:    deviceRes?.data?.data      ?? [],
    harmonyEvents,
    harmonyEventsPrev:  null,
    fwWidgets:          fwWidgetsRes?.data?.widgets ?? fwWidgetsRes?.data?.data ?? [],
    fwReports,
    fwReportsPrev:      null,
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
    zohoTicketsPrev:    null,
    mttr,
    // MDM (Hexnode)
    mdmDevices:         Array.isArray(mdmDevicesRes?.data?.data) ? mdmDevicesRes.data.data : [],
    mdmDevicesPrev:     null,
    mdmApps:            Array.isArray(mdmAppsRes?.data?.data) ? mdmAppsRes.data.data : [],
    // NVD
    nvdStats:           nvdStatsRes?.data ?? null,
    nvdRows:            nvdRowsRes?.data?.rows ?? [],
    nvdRowsPrev:        null,
    // Microsoft 365
    msData:             msDataRes?.data ?? {},
    msDataPrev:         null,
  };
}
