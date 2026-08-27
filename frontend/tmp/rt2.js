(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // src/pages/report/ReportTemplate.jsx
  var import_react2 = __toESM(__require("react"), 1);
  var import_renderer2 = __require("@react-pdf/renderer");

  // src/pages/report/dataUtils.js
  var COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
  var SEV_COLORS = ["#22c55e", "#84cc16", "#f59e0b", "#f97316", "#ef4444"];
  var CVE_COLORS = { CRITICAL: "#a855f7", HIGH: "#ef4444", MEDIUM: "#eab308", LOW: "#3b82f6", UNKNOWN: "#64748b" };
  var SEVER_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];
  var ZOHO_STATUS_COLORS = { Open: "#3b82f6", Closed: "#22c55e", "On Hold": "#f59e0b", Escalated: "#ef4444", "In Progress": "#8b5cf6", Resolved: "#10b981" };
  var ZOHO_PRIORITY_COLORS = { High: "#ef4444", Critical: "#dc2626", Medium: "#f59e0b", Low: "#22c55e" };
  var toArray = (v) => {
    if (Array.isArray(v) && v.length > 0) return v;
    if (v && typeof v === "object" && !Array.isArray(v)) return [v];
    return void 0;
  };
  var parseNumber = (v) => {
    if (v === null || v === void 0 || v === "") return 0;
    const n = Number(String(v).replace(/,/g, "").replace(/[^\d.-]/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  };
  var getFirstValue = (row, cols, fallback = "-") => {
    for (const col of cols) {
      const v = row?.[col];
      if (v !== void 0 && v !== null && v !== "") return v;
    }
    return fallback;
  };
  var extractTable = (raw) => {
    if (!raw) return null;
    try {
      const entry = toArray(raw?.report?.result?.entry) || toArray(raw?.report?.result?.report?.entry) || toArray(raw?.response?.result?.report?.entry) || toArray(raw?.response?.result?.entry) || toArray(raw?.result?.report?.entry) || toArray(raw?.result?.entry) || toArray(raw?.entry);
      if (entry && entry.length > 0) {
        const colSet = /* @__PURE__ */ new Set();
        entry.forEach((item) => {
          if (typeof item === "object" && item !== null)
            Object.keys(item).forEach((k) => {
              if (k === "@name") colSet.add("name");
              else if (!k.startsWith("@")) colSet.add(k);
            });
        });
        const columns = Array.from(colSet);
        const rows = entry.map((item) => {
          const row = {};
          columns.forEach((col) => {
            const rk = col === "name" ? "@name" : col;
            const value = item?.[rk] ?? item?.[col];
            row[col] = typeof value === "object" && value !== null && "#text" in value ? value["#text"] : value ?? "";
          });
          return row;
        });
        return { columns, rows };
      }
      if (Array.isArray(raw)) {
        const columns = Array.from(new Set(raw.flatMap((item) => Object.keys(item || {}))));
        return { columns, rows: raw };
      }
    } catch {
    }
    return null;
  };
  var formatNumber = (num) => {
    if (num === null || num === void 0) return "0";
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  var formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };
  var getSumByColumn = (rows, cols) => {
    return rows.reduce((sum, row) => sum + parseNumber(getFirstValue(row, cols, 0)), 0);
  };
  var makeTopChartData = (rows, cols, limit = 8) => {
    const map = /* @__PURE__ */ new Map();
    rows.forEach((row) => {
      const value = String(getFirstValue(row, cols, "")).trim();
      if (!value || value === "-") return;
      const n = parseNumber(getFirstValue(row, ["count", "nrepeat", "nsess", "sessions", "threats"], 1));
      map.set(value, (map.get(value) || 0) + (n || 1));
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, value]) => ({ name: name.length > 30 ? name.slice(0, 30) + "\u2026" : name, value }));
  };
  var makeRiskTrendData = (rows) => {
    const map = /* @__PURE__ */ new Map();
    rows.forEach((row) => {
      const rawDate = getFirstValue(row, ["slabbed-receive_time", "receive_time", "time", "date", "updatedAt"]);
      const date = rawDate && rawDate !== "-" ? new Date(rawDate).toLocaleDateString("en-CA") : null;
      if (!date || date === "Invalid Date") return;
      const old = map.get(date) || { date, sessions: 0 };
      old.sessions += parseNumber(getFirstValue(row, ["nsess", "sessions", "session", "count"], 1));
      map.set(date, old);
    });
    return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-14);
  };
  var makeRiskDistribution = (rows) => {
    const map = /* @__PURE__ */ new Map();
    rows.forEach((row) => {
      const risk = String(getFirstValue(row, ["risk", "severity", "name"], "-"));
      const count = parseNumber(getFirstValue(row, ["count", "nrepeat", "nsess", "sessions"], 1));
      map.set(risk, (map.get(risk) || 0) + count);
    });
    return Array.from(map.entries()).map(([risk, value]) => ({
      risk,
      name: risk === "-" ? "Unknown" : `Risk ${risk}`,
      value
    })).sort((a, b) => b.risk === "-" ? -1 : a.risk === "-" ? 1 : Number(b.risk) - Number(a.risk));
  };
  var getSecurityScoreStatus = (score) => {
    if (score >= 80) return { label: "Excellent", color: "#22c55e" };
    if (score >= 60) return { label: "Good", color: "#84cc16" };
    if (score >= 40) return { label: "Fair", color: "#f59e0b" };
    return { label: "At Risk", color: "#ef4444" };
  };
  var ZOHO_AGING_BUCKETS = ["<1h", "1-4h", "4-24h", "1-3d", "3+d"];
  var getResolutionTimeBucket = (t) => {
    const ca = t?.created_at || t?.createdTime || t?.createdAt;
    const cl = t?.closed_at || t?.closedTime || t?.closedAt || t?.closeTime || t?.close_time;
    if (!ca || !cl) return null;
    try {
      const ms = new Date(cl).getTime() - new Date(ca).getTime();
      if (ms < 36e5) return "<1h";
      if (ms < 144e5) return "1-4h";
      if (ms < 864e5) return "4-24h";
      if (ms < 2592e5) return "1-3d";
      return "3+d";
    } catch {
      return null;
    }
  };
  var getDeptName = (t) => t?.department?.name || t?.departmentName || "Unknown";
  var getAssigneeName = (t) => t?.assignee?.name || t?.assigneeName || t?.owner?.name || "Unassigned";
  var isClosedTicket = (t) => ["closed", "technically closed", "resolved", "duplicate"].includes(String(t.status || "").toLowerCase());
  function shortName(v, max = 18) {
    return v && v.length > max ? v.slice(0, max) + "\u2026" : v || "";
  }
  function buildCveData(apps) {
    const sc = (r) => parseFloat(r.baseScore) || 0;
    const appMap = {};
    apps.forEach((r) => {
      const key = r.applicationName || r.application || "Unknown";
      if (!appMap[key]) appMap[key] = { name: key, vendor: r.applicationVendor || "", cves: /* @__PURE__ */ new Set(), endpoints: /* @__PURE__ */ new Set(), severities: [], scores: [], daysDetected: 0 };
      const a = appMap[key];
      if (r.cveId) a.cves.add(r.cveId);
      if (r.endpointId || r.endpointName) a.endpoints.add(r.endpointId || r.endpointName);
      if (r.severity) a.severities.push(String(r.severity).toUpperCase());
      a.scores.push(sc(r));
      a.daysDetected = Math.max(a.daysDetected, r.daysDetected || 0);
    });
    const appList = Object.values(appMap).map((a) => ({
      name: a.name,
      vendor: a.vendor,
      cveCount: a.cves.size,
      endpointCount: a.endpoints.size,
      highestSeverity: SEVER_ORDER.find((s) => a.severities.includes(s)) || "UNKNOWN",
      highestNvdBaseScore: a.scores.length ? Math.max(...a.scores) : 0,
      daysDetected: a.daysDetected
    }));
    const totalCves = new Set(apps.map((r) => r.cveId).filter(Boolean)).size || apps.length;
    const totalEndpoints = new Set(apps.map((r) => r.endpointId || r.endpointName).filter(Boolean)).size;
    const avgScore = apps.length ? (apps.reduce((s, r) => s + sc(r), 0) / apps.length).toFixed(1) : 0;
    const severityMap = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    apps.forEach((r) => {
      const s = String(r.severity || "UNKNOWN").toUpperCase();
      severityMap[s in severityMap ? s : "UNKNOWN"]++;
    });
    const severityDistribution = Object.entries(severityMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value, fill: CVE_COLORS[name] }));
    const topRiskyApps = [...appList].sort((a, b) => b.cveCount - a.cveCount).slice(0, 10).map((a) => ({ name: shortName(a.name), fullName: a.name, cves: a.cveCount, score: a.highestNvdBaseScore }));
    const agingBuckets = { "0-30": 0, "31-90": 0, "91-180": 0, "180+": 0 };
    apps.forEach((r) => {
      const d = parseInt(r.daysDetected, 10) || 0;
      if (d <= 30) agingBuckets["0-30"]++;
      else if (d <= 90) agingBuckets["31-90"]++;
      else if (d <= 180) agingBuckets["91-180"]++;
      else agingBuckets["180+"]++;
    });
    const cveAging = Object.entries(agingBuckets).map(([name, count]) => ({ name, count }));
    const endpointImpact = [...appList].sort((a, b) => b.endpointCount - a.endpointCount).slice(0, 10).map((a) => ({ name: shortName(a.name), endpoints: a.endpointCount }));
    const scoreRangeBuckets = [
      { name: "Low (0-3.9)", fill: "#3b82f6", count: 0 },
      { name: "Med (4-6.9)", fill: "#eab308", count: 0 },
      { name: "High (7-8.9)", fill: "#ef4444", count: 0 },
      { name: "Crit (9-10)", fill: "#a855f7", count: 0 }
    ];
    apps.forEach((r) => {
      const s = sc(r);
      if (s < 4) scoreRangeBuckets[0].count++;
      else if (s < 7) scoreRangeBuckets[1].count++;
      else if (s < 9) scoreRangeBuckets[2].count++;
      else scoreRangeBuckets[3].count++;
    });
    const scoreRange = scoreRangeBuckets.filter((b) => b.count > 0).map((b) => ({ name: b.name, value: b.count, fill: b.fill }));
    const vendorCounts = {};
    apps.forEach((r) => {
      const v = r.applicationVendor || "";
      if (v) vendorCounts[v] = (vendorCounts[v] || 0) + 1;
    });
    const vendorRisk = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, cves]) => ({ name: shortName(name), cves, fullName: name }));
    const statusCounts = {};
    apps.forEach((r) => {
      const s = r.status || "Unknown";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    const estimateStatus = Object.entries(statusCounts).map(([name, value], i) => ({ name, value, fill: ["#f97316", "#22c55e", "#3b82f6", "#a855f7"][i % 4] }));
    const criticalApps = appList.filter((a) => a.highestSeverity === "CRITICAL" && a.name !== "Microsoft Office Standard 2016").sort((a, b) => b.cveCount - a.cveCount).slice(0, 6);
    return { totalApplications: appList.length, totalCves, totalEndpoints, avgScore, severityMap, severityDistribution, topRiskyApps, cveAging, endpointImpact, scoreRange, vendorRisk, estimateStatus, criticalApps };
  }
  function parseTs(v) {
    if (!v) return null;
    const d = new Date(typeof v === "string" ? v.replace(" ", "T") : v);
    return isNaN(d.getTime()) ? null : d;
  }
  function toWDateKey(d) {
    const dt = d instanceof Date ? d : parseTs(d);
    if (!dt) return null;
    return dt.toISOString().slice(0, 10);
  }
  function computeWeeklyStats(harmonyEvents, s1Threats, s1Agents = [], s1Cves = []) {
    const events = Array.isArray(harmonyEvents) ? harmonyEvents : [];
    const threats = Array.isArray(s1Threats) ? s1Threats : [];
    const agents = Array.isArray(s1Agents) ? s1Agents : [];
    const cves = Array.isArray(s1Cves) ? s1Cves : [];
    let anchor = null;
    events.forEach((e) => {
      const d = parseTs(e.event_created);
      if (d && (!anchor || d > anchor)) anchor = d;
    });
    threats.forEach((t) => {
      const d = parseTs(t.threatInfo?.createdAt);
      if (d && (!anchor || d > anchor)) anchor = d;
    });
    if (!anchor) anchor = /* @__PURE__ */ new Date();
    const thisEnd = new Date(anchor);
    thisEnd.setHours(23, 59, 59, 999);
    const thisStart = new Date(thisEnd);
    thisStart.setDate(thisEnd.getDate() - 6);
    thisStart.setHours(0, 0, 0, 0);
    const lastEnd = new Date(thisStart);
    const lastStart = new Date(lastEnd);
    lastStart.setDate(lastEnd.getDate() - 7);
    const fmtDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const periodLabel = `${fmtDate(thisStart)} \u2013 ${fmtDate(thisEnd)}`;
    const thisWeekEvents = events.filter((e) => {
      const d = parseTs(e.event_created);
      return d && d >= thisStart && d <= thisEnd;
    });
    const lastWeekEvents = events.filter((e) => {
      const d = parseTs(e.event_created);
      return d && d >= lastStart && d < lastEnd;
    });
    const thisWeekThreats = threats.filter((t) => {
      const d = parseTs(t.threatInfo?.createdAt);
      return d && d >= thisStart && d <= thisEnd;
    });
    const lastWeekThreats = threats.filter((t) => {
      const d = parseTs(t.threatInfo?.createdAt);
      return d && d >= lastStart && d < lastEnd;
    });
    const sevLabel = (s) => {
      const n = Number(s);
      if (isNaN(n)) return String(s || "unknown").toLowerCase();
      if (n >= 4) return "critical";
      if (n === 3) return "high";
      if (n === 2) return "medium";
      return "low";
    };
    const remStates = ["remediated", "closed", "done"];
    const thisRem = thisWeekEvents.filter((e) => remStates.includes(e.state)).length;
    const lastRem = lastWeekEvents.filter((e) => remStates.includes(e.state)).length;
    const thisCrit = thisWeekEvents.filter((e) => {
      const n = Number(e.severity);
      return !isNaN(n) && n >= 3;
    }).length;
    const lastCrit = lastWeekEvents.filter((e) => {
      const n = Number(e.severity);
      return !isNaN(n) && n >= 3;
    }).length;
    const last14 = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(thisEnd);
      d.setDate(thisEnd.getDate() - i);
      d.setHours(12, 0, 0, 0);
      last14.push({ key: toWDateKey(d), label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) });
    }
    const eventTypesSet = /* @__PURE__ */ new Set();
    const eventByDay = {};
    last14.forEach(({ key, label }) => {
      eventByDay[key] = { date: label };
    });
    events.forEach((e) => {
      if (!e.event_created) return;
      const k = toWDateKey(e.event_created);
      if (!eventByDay[k]) return;
      const type = e.type || "unknown";
      eventTypesSet.add(type);
      eventByDay[k][type] = (eventByDay[k][type] || 0) + 1;
    });
    const trend14dEvents = last14.map(({ key }) => eventByDay[key]);
    const eventTypes = [...eventTypesSet];
    const threatByDay = {};
    last14.forEach(({ key, label }) => {
      threatByDay[key] = { date: label, detected: 0, mitigated: 0 };
    });
    threats.forEach((t) => {
      const k = t.threatInfo?.createdAt ? toWDateKey(t.threatInfo.createdAt) : null;
      if (!k || !threatByDay[k]) return;
      threatByDay[k].detected++;
      if (t.threatInfo?.mitigationStatus === "mitigated") threatByDay[k].mitigated++;
    });
    const trend14dThreats = last14.map(({ key }) => threatByDay[key]);
    const remComp = [];
    for (let i = 6; i >= 0; i--) {
      const td = new Date(thisEnd);
      td.setDate(thisEnd.getDate() - i);
      td.setHours(12, 0, 0, 0);
      const tk = toWDateKey(td);
      const ld = new Date(td);
      ld.setDate(ld.getDate() - 7);
      const lk = toWDateKey(ld);
      remComp.push({
        day: td.toLocaleDateString("en-GB", { weekday: "short" }),
        "This Week": thisWeekEvents.filter((e) => e.event_created && toWDateKey(e.event_created) === tk).length,
        "Last Week": lastWeekEvents.filter((e) => e.event_created && toWDateKey(e.event_created) === lk).length
      });
    }
    const sevLevels = ["critical", "high", "medium", "low"];
    const severityShift = sevLevels.map((sev) => ({
      severity: sev.charAt(0).toUpperCase() + sev.slice(1),
      thisWeek: thisWeekEvents.filter((e) => sevLabel(e.severity) === sev).length,
      lastWeek: lastWeekEvents.filter((e) => sevLabel(e.severity) === sev).length
    })).filter((d) => d.thisWeek > 0 || d.lastWeek > 0);
    const senderOf = (e) => {
      if (e.sender_address && e.sender_address !== "Unknown") return e.sender_address;
      const ad = (typeof e.additional_data === "string" ? JSON.parse(e.additional_data) : e.additional_data) || {};
      const inner = ad.additional_data || ad;
      const fromHeap = inner.sender_address || inner.senderAddress || inner.from_email || inner.fromEmail || inner.mail_from || inner.source_address || inner.mailFrom || inner.sender || inner.from || inner.from_address;
      if (fromHeap) return fromHeap;
      const toHeap = inner.receiver_address || inner.recipient_address || inner.receiverAddress || inner.recipientAddress || inner.to;
      if (toHeap) return `\u2192 ${toHeap}`;
      return "Unknown";
    };
    const sThis = {}, sLast = {};
    thisWeekEvents.forEach((e) => {
      const s = senderOf(e);
      sThis[s] = (sThis[s] || 0) + 1;
    });
    lastWeekEvents.forEach((e) => {
      const s = senderOf(e);
      sLast[s] = (sLast[s] || 0) + 1;
    });
    const topSenders = Object.entries(sThis).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, tw]) => ({ sender_address: s.length > 45 ? s.slice(0, 45) + "\u2026" : s, "This Week": tw, "Last Week": sLast[s] || 0, Change: tw - (sLast[s] || 0) }));
    const getEp = (t) => t.agentRealtimeInfo?.agentComputerName || t.agentDetectionInfo?.agentComputerName || "";
    const epThis = {}, epLast = {};
    thisWeekThreats.forEach((t) => {
      const ep = getEp(t);
      if (ep) epThis[ep] = (epThis[ep] || 0) + 1;
    });
    lastWeekThreats.forEach((t) => {
      const ep = getEp(t);
      if (ep) epLast[ep] = (epLast[ep] || 0) + 1;
    });
    const topEndpoints = Object.entries(epThis).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ep, tw]) => ({ endpoint: ep.length > 40 ? ep.slice(0, 40) + "\u2026" : ep, "This Week": tw, "Last Week": epLast[ep] || 0 }));
    const thisNames = new Set(thisWeekThreats.map((t) => t.threatInfo?.threatName).filter(Boolean));
    const lastNames = new Set(lastWeekThreats.map((t) => t.threatInfo?.threatName).filter(Boolean));
    const newCount = [...thisNames].filter((n) => !lastNames.has(n)).length;
    const recCount = [...thisNames].filter((n) => lastNames.has(n)).length;
    const newVsRecurring = [
      { name: "New", value: newCount, fill: "#ef4444" },
      { name: "Recurring", value: recCount, fill: "#f97316" }
    ].filter((d) => d.value > 0);
    const getUser = (t) => t.threatInfo?.initiatingUsername || t.threatInfo?.processUser || t.agentDetectionInfo?.agentLastLoggedInUserName || "";
    const userThis = {}, userLast = {};
    thisWeekThreats.forEach((t) => {
      const u = getUser(t);
      if (u) userThis[u] = (userThis[u] || 0) + 1;
    });
    lastWeekThreats.forEach((t) => {
      const u = getUser(t);
      if (u) userLast[u] = (userLast[u] || 0) + 1;
    });
    const topUsers = Object.entries(userThis).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([u, tw]) => ({ user: u.length > 40 ? u.slice(0, 40) + "\u2026" : u, "This Week": tw, "Last Week": userLast[u] || 0 }));
    const getAgentDate = (a) => a.registeredAt || a.createdAt || a.registered_at || a.created_at;
    const newAgentsThis = agents.filter((a) => {
      const d = parseTs(getAgentDate(a));
      return d && d >= thisStart && d <= thisEnd;
    }).length;
    const newAgentsLast = agents.filter((a) => {
      const d = parseTs(getAgentDate(a));
      return d && d >= lastStart && d < lastEnd;
    }).length;
    const inCveWindowThis = (c) => {
      const n = Number(c.daysDetected);
      return !isNaN(n) && n >= 0 && n <= 7;
    };
    const inCveWindowLast = (c) => {
      const n = Number(c.daysDetected);
      return !isNaN(n) && n > 7 && n <= 14;
    };
    const newCvesThis = cves.filter(inCveWindowThis).length;
    const newCvesLast = cves.filter(inCveWindowLast).length;
    const critCvesThis = cves.filter((c) => inCveWindowThis(c) && (String(c.severity || "").toUpperCase() === "CRITICAL" || Number(c.baseScore) >= 9)).length;
    const mttdMap = {};
    last14.forEach(({ key }) => {
      mttdMap[key] = { sum: 0, count: 0 };
    });
    threats.forEach((t) => {
      const created = parseTs(t.threatInfo?.createdAt);
      const identified = parseTs(t.threatInfo?.identifiedAt);
      if (!created || !identified) return;
      const k = toWDateKey(created);
      if (!mttdMap[k]) return;
      mttdMap[k].sum += (created - identified) / 6e4;
      mttdMap[k].count += 1;
    });
    const mttdTrend = last14.map(({ key, label }) => mttdMap[key]?.count > 0 ? { date: label, avg: Math.round(mttdMap[key].sum / mttdMap[key].count) } : null).filter(Boolean);
    const mttmMap = {};
    last14.forEach(({ key }) => {
      mttmMap[key] = { sum: 0, count: 0 };
    });
    threats.forEach((t) => {
      const identified = parseTs(t.threatInfo?.identifiedAt);
      const successEntry = (t.mitigationStatus || []).find((s) => s.status === "success");
      if (!identified || !successEntry) return;
      const ended = parseTs(successEntry.mitigationEndedAt);
      if (!ended) return;
      const k = toWDateKey(identified);
      if (!mttmMap[k]) return;
      mttmMap[k].sum += (ended - identified) / 6e4;
      mttmMap[k].count += 1;
    });
    const mttmTrend = last14.map(({ key, label }) => mttmMap[key]?.count > 0 ? { date: label, avg: Math.round(mttmMap[key].sum / mttmMap[key].count) } : null).filter(Boolean);
    return {
      kpi: {
        harmonyThis: thisWeekEvents.length,
        harmonyLast: lastWeekEvents.length,
        threatsThis: thisWeekThreats.length,
        threatsLast: lastWeekThreats.length,
        remRateThis: thisWeekEvents.length > 0 ? Math.round(thisRem / thisWeekEvents.length * 100) : 0,
        remRateLast: lastWeekEvents.length > 0 ? Math.round(lastRem / lastWeekEvents.length * 100) : 0,
        critThis: thisCrit,
        critLast: lastCrit,
        newAgentsThis,
        newAgentsLast,
        newCvesThis,
        newCvesLast,
        critCvesThis
      },
      periodLabel,
      trend14dEvents,
      eventTypes,
      trend14dThreats,
      remComp,
      severityShift,
      topSenders,
      topEndpoints,
      topUsers,
      newVsRecurring,
      thisNameCount: thisNames.size,
      newCount,
      mttdTrend,
      mttmTrend
    };
  }
  function buildThreatAnalytics(threats) {
    const t = Array.isArray(threats) ? threats : [];
    const byCount = (fn) => {
      const counts = {};
      t.forEach((x) => {
        const k = fn(x);
        counts[k] = (counts[k] || 0) + 1;
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
    };
    const mitigationData = byCount((x) => String(x.threatInfo?.mitigationStatus || "unknown")).map((d) => ({ ...d, name: d.name.length > 20 ? d.name.slice(0, 20) + "\u2026" : d.name }));
    const classData = byCount((x) => x.threatInfo?.classification || "Unknown").slice(0, 8).map((d) => ({ ...d, name: d.name.length > 20 ? d.name.slice(0, 20) + "\u2026" : d.name }));
    const incidentStatusData = byCount((x) => x.threatInfo?.incidentStatus || "unknown");
    const confidenceData = byCount((x) => x.threatInfo?.confidenceLevel || x.threatInfo?.classification || "Unknown").map((d, i) => ({ ...d, fill: SEV_COLORS[i % SEV_COLORS.length] }));
    const engineData = (() => {
      const counts = {};
      const add = (n) => {
        if (n) counts[n] = (counts[n] || 0) + 1;
      };
      t.forEach((x) => {
        const engines = (x.threatInfo?.engines || []).map((e) => typeof e === "string" ? e : e?.name || "").filter(Boolean);
        if (engines.length === 0) add("Unspecified");
        else engines.forEach(add);
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
    })();
    const tacticData = (() => {
      const counts = {};
      const add = (n) => {
        if (n) counts[n] = (counts[n] || 0) + 1;
      };
      t.forEach((x) => {
        const tactics = (x.indicators || []).flatMap((i) => (i.tactics || []).map((tc) => tc.name)).filter(Boolean);
        if (tactics.length === 0) add("Unspecified");
        else tactics.forEach(add);
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, value]) => ({ name, value }));
    })();
    const siteData = byCount((x) => x.agentRealtimeInfo?.siteName || "Unknown").slice(0, 10).map((d) => ({ ...d, name: d.name.length > 22 ? d.name.slice(0, 22) + "\u2026" : d.name }));
    const topUsersData = byCount((x) => x.threatInfo?.processUser || "Unknown").slice(0, 10).map((d) => ({ ...d, name: d.name.length > 22 ? d.name.slice(0, 22) + "\u2026" : d.name }));
    const groupData = byCount((x) => x.agentRealtimeInfo?.groupName || x.group_name || "Unknown").slice(0, 10).map((d) => ({ ...d, name: d.name.length > 22 ? d.name.slice(0, 22) + "\u2026" : d.name }));
    const mitigated = t.filter((x) => x.threatInfo?.mitigationStatus === "mitigated").length;
    const mitigatedAll = t.filter((x) => ["mitigated", "mitigated_preemptively"].includes(x.threatInfo?.mitigationStatus)).length;
    const unresolved = t.filter((x) => ["unresolved", "active"].includes(x.threatInfo?.incidentStatus)).length;
    const notMitigatedCount = t.filter((x) => ["not_mitigated", "unmitigated", "active"].includes(x.threatInfo?.mitigationStatus)).length;
    const benignCount = t.filter((x) => x.threatInfo?.mitigationStatus === "marked_as_benign").length;
    const affectedEndpoints = new Set(t.map((x) => x.agentComputerName || x.computerName || x.agentId).filter(Boolean)).size;
    const filelessData = (() => {
      const f = t.filter((x) => x.threatInfo?.isFileless).length;
      return [
        { name: "File-based", value: t.length - f, fill: "#3b82f6" },
        { name: "Fileless", value: f, fill: "#ef4444" }
      ];
    })();
    let mttdSum = 0, mttdCount = 0, mttmSum = 0, mttmCount = 0;
    t.forEach((x) => {
      const created = parseTs(x.threatInfo?.createdAt);
      const identified = parseTs(x.threatInfo?.identifiedAt);
      if (created && identified) {
        mttdSum += Math.abs(created - identified) / 6e4;
        mttdCount++;
      }
      const successEntry = (x.mitigationStatus || []).find((s) => s.status === "success");
      if (successEntry && identified) {
        const ended = parseTs(successEntry.mitigationEndedAt);
        if (ended) {
          mttmSum += (ended - identified) / 6e4;
          mttmCount++;
        }
      }
    });
    const avgMttd = mttdCount > 0 ? mttdSum / mttdCount : null;
    const avgMttm = mttmCount > 0 ? mttmSum / mttmCount : null;
    return {
      mitigationData,
      classData,
      incidentStatusData,
      confidenceData,
      engineData,
      tacticData,
      siteData,
      topUsersData,
      groupData,
      mitigated,
      mitigatedAll,
      unresolved,
      notMitigatedCount,
      benignCount,
      affectedEndpoints,
      filelessData,
      avgMttd,
      avgMttm,
      mitPct: t.length > 0 ? Math.round(mitigated / t.length * 100) : 0
    };
  }
  function buildAgentAnalytics(agents, generatedAt) {
    const list = Array.isArray(agents) ? agents : [];
    const cutoff = (() => {
      const c = new Date(generatedAt);
      c.setDate(c.getDate() - 30);
      return c;
    })();
    const newAgents = list.filter((a) => {
      const d = a.registeredAt || a.createdAt || a.registered_at || a.created_at;
      return d && new Date(d) >= cutoff;
    }).length;
    const byCount = (fn) => {
      const counts = {};
      list.forEach((a) => {
        const k = fn(a);
        counts[k] = (counts[k] || 0) + 1;
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
    };
    const statusData = byCount((a) => String(a.network_status || a.networkStatus || "unknown"));
    const osData = byCount((a) => a.os_type || a.osType || a.os || "Unknown");
    const machineTypeData = byCount((a) => a.machineType || a.machine_type || "Unknown").map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }));
    const osDistribution = byCount((a) => a.osName || a.os_name || a.os || "Unknown").map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }));
    const siteDistribution = byCount((a) => a.siteName || a.site_name || "Unknown").map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }));
    const activeCount = list.filter((a) => a.isActive).length;
    const activeStatusDistribution = [
      { name: "Active", value: activeCount, fill: "#16a34a" },
      { name: "Inactive", value: list.length - activeCount, fill: "#dc2626" }
    ].filter((d) => d.value > 0);
    const fwEnabled = list.filter((a) => a.firewallEnabled).length;
    const firewallStatusDistribution = [
      { name: "Enabled", value: fwEnabled, fill: "#16a34a" },
      { name: "Disabled", value: list.length - fwEnabled, fill: "#dc2626" }
    ].filter((d) => d.value > 0);
    const upToDate = list.filter((a) => a.isUpToDate).length;
    const agentVersionStatus = [
      { name: "Up to Date", value: upToDate, fill: "#16a34a" },
      { name: "Outdated", value: list.length - upToDate, fill: "#d97706" }
    ].filter((d) => d.value > 0);
    const networkStatusDistribution = byCount((a) => a.networkStatus || a.network_status || "Unknown").map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }));
    const scanStatusDistribution = byCount((a) => a.scanStatus || a.scan_status || "Unknown").map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }));
    const connected = list.filter((a) => String(a.network_status || a.networkStatus || "").toLowerCase() === "connected").length;
    const disconnected = list.filter((a) => String(a.network_status || a.networkStatus || "").toLowerCase() === "disconnected").length;
    const kpis = {
      total: list.length,
      active: list.filter((a) => a.isActive).length,
      inactive: list.length - list.filter((a) => a.isActive).length,
      threats: list.filter((a) => (a.activeThreats || 0) > 0).length,
      outdated: list.filter((a) => !a.isUpToDate).length,
      health: list.length > 0 ? Math.round(list.filter((a) => a.isActive).length / list.length * 100) : 0
    };
    return {
      total: list.length,
      newAgents,
      statusData,
      osData,
      machineTypeData,
      connected,
      disconnected,
      kpis,
      osDistribution,
      siteDistribution,
      activeStatusDistribution,
      firewallStatusDistribution,
      agentVersionStatus,
      networkStatusDistribution,
      scanStatusDistribution
    };
  }
  function buildAtRisk(threats) {
    const t = Array.isArray(threats) ? threats : [];
    const byDevice = {}, byUser = {}, byGroup = {};
    t.forEach((x) => {
      const dev = x.agentRealtimeInfo?.agentComputerName;
      const usr = x.threatInfo?.processUser;
      const grp = x.agentRealtimeInfo?.groupName || x.group_name;
      if (dev) byDevice[dev] = (byDevice[dev] || 0) + 1;
      if (usr) byUser[usr] = (byUser[usr] || 0) + 1;
      if (grp) byGroup[grp] = (byGroup[grp] || 0) + 1;
    });
    const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
    const entries = { devices: top(byDevice), users: top(byUser), groups: top(byGroup) };
    return {
      devices: entries.devices.map(([name, value]) => ({ name: name.length > 30 ? name.slice(0, 30) + "\u2026" : name, value })),
      users: entries.users.map(([name, value]) => ({ name: name.length > 30 ? name.slice(0, 30) + "\u2026" : name, value })),
      groups: entries.groups.map(([name, value]) => ({ name: name.length > 30 ? name.slice(0, 30) + "\u2026" : name, value })),
      topDevice: entries.devices[0],
      topUser: entries.users[0],
      topGroup: entries.groups[0]
    };
  }
  function buildZohoSummary(tickets) {
    const list = Array.isArray(tickets) ? tickets : [];
    const open = list.filter((t) => t.status === "Open").length;
    const closed = list.filter((t) => isClosedTicket(t)).length;
    const highPri = list.filter((t) => t.priority === "High" || t.priority === "Critical").length;
    const overdue = list.filter((t) => {
      const ca = t?.created_at || t?.createdTime || t?.createdAt;
      if (!ca) return false;
      return /* @__PURE__ */ new Date() - new Date(ca).getTime() > 24 * 60 * 60 * 1e3 && !isClosedTicket(t);
    }).length;
    const byCount = (fn) => {
      const counts = {};
      list.forEach((t) => {
        const k = fn(t);
        counts[k] = (counts[k] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    };
    const statusData = byCount((t) => t.status || "Unknown").map((d) => ({ ...d, fill: ZOHO_STATUS_COLORS[d.name] || "#6366f1" }));
    const priorityData = byCount((t) => t.priority || "Unknown").map((d) => ({ ...d, fill: ZOHO_PRIORITY_COLORS[d.name] || "#6b7280" }));
    const departmentData = byCount((t) => getDeptName(t)).sort((a, b) => b.value - a.value).slice(0, 8);
    const agingCounts = {};
    ZOHO_AGING_BUCKETS.forEach((b) => agingCounts[b] = 0);
    list.forEach((t) => {
      const b = getResolutionTimeBucket(t);
      if (b) agingCounts[b] = (agingCounts[b] || 0) + 1;
    });
    const agingData = ZOHO_AGING_BUCKETS.map((b) => ({ name: b, value: agingCounts[b] }));
    const engineerPerformance = (() => {
      const grouped = {};
      list.forEach((t) => {
        const eng = getAssigneeName(t);
        if (eng === "Unassigned") return;
        if (!grouped[eng]) grouped[eng] = { engineer: eng, open: 0, closed: 0 };
        isClosedTicket(t) ? grouped[eng].closed++ : grouped[eng].open++;
      });
      return Object.values(grouped).sort((a, b) => b.closed - a.closed || a.engineer.localeCompare(b.engineer));
    })();
    return { total: list.length, open, closed, highPri, overdue, statusData, priorityData, departmentData, agingData, engineerPerformance };
  }
  var FUNNEL_STATUSES = [
    "Open",
    "Re-Open",
    "Acknowledge",
    "WIP",
    "On Hold",
    "On Hold by Customer",
    "Revert Awaited - Customer",
    "Revert Awaited - OEM",
    "Revert Awaited - Vendor",
    "Escalated",
    "Technically Closed",
    "Duplicate",
    "Closed"
  ];
  var FUNNEL_COLORS = [
    "#F6D365",
    "#F4A460",
    "#C8A2C8",
    "#B0C4DE",
    "#9B7FC7",
    "#8470A8",
    "#6B8E6B",
    "#4CAF50",
    "#3E9C42",
    "#2E7D32",
    "#E57373",
    "#880E4F",
    "#D32F2F"
  ];
  function buildZohoTicketCounts(tickets) {
    const list = Array.isArray(tickets) ? tickets : [];
    const now = /* @__PURE__ */ new Date();
    const curMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const closedDate = (t) => t.closedTime || t.closed_at || t.closedAt || t.closeTime || t.closedDate || "";
    const sameMonth = (d, ref) => d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
    let open = 0, wip = 0, onHold = 0, revertAwaited = 0, closed = 0;
    let currentMonthClosed = 0, previousMonthClosed = 0;
    list.forEach((t) => {
      const s = String(t.status || "").trim().toLowerCase();
      if (s === "open" || s === "re-open") open++;
      if (s === "wip") wip++;
      if (s === "on hold" || s === "on hold by customer") onHold++;
      if (s.startsWith("revert awaited")) revertAwaited++;
      if (s === "closed" || s === "technically closed") {
        closed++;
        const d = new Date(closedDate(t));
        if (!isNaN(d.getTime())) {
          if (sameMonth(d, curMonth)) currentMonthClosed++;
          if (sameMonth(d, prevMonth)) previousMonthClosed++;
        }
      }
    });
    const diff = currentMonthClosed - previousMonthClosed;
    const pct = previousMonthClosed > 0 ? diff / previousMonthClosed * 100 : currentMonthClosed > 0 ? 100 : 0;
    return {
      cards: [
        { title: "Open", count: open, color: "#2563eb" },
        { title: "WIP", count: wip, color: "#d97706" },
        { title: "On Hold", count: onHold, color: "#f59e0b" },
        { title: "Revert Awaited", count: revertAwaited, color: "#7c3aed" },
        { title: "Closed", count: closed, color: "#16a34a" }
      ],
      currentMonthClosed,
      previousMonthClosed,
      closedDifference: diff,
      closedPercentage: pct
    };
  }
  function buildZohoFunnel(tickets) {
    const list = Array.isArray(tickets) ? tickets : [];
    const counts = {};
    FUNNEL_STATUSES.forEach((s) => counts[s] = 0);
    list.forEach((t) => {
      const raw = String(t?.status || "").trim();
      const matched = FUNNEL_STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
      if (matched) counts[matched]++;
    });
    const statusCounts = FUNNEL_STATUSES.map((status, i) => ({ status, count: counts[status], color: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }));
    const slices = statusCounts.filter((c) => c.count > 0);
    return { statusCounts, slices };
  }
  function buildZohoHeatmap(tickets) {
    const list = Array.isArray(tickets) ? tickets : [];
    const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    list.forEach((t) => {
      const val = t.createdTime || t.created_at;
      if (!val) return;
      const d = new Date(val);
      if (isNaN(d.getTime())) return;
      let day = d.getDay();
      day = day === 0 ? 6 : day - 1;
      matrix[day][d.getHours()]++;
    });
    const max = Math.max(...matrix.flat(), 1);
    return { matrix, max, DAY_NAMES };
  }
  var VOLCANO_BUCKETS = [
    { label: "0 - 3h", min: 0, max: 3, color: "#2563eb" },
    { label: "3 - 7h", min: 3, max: 7, color: "#22c55e" },
    { label: "7 - 15h", min: 7, max: 15, color: "#eab308" },
    { label: "15 - 30h", min: 15, max: 30, color: "#f97316" },
    { label: "> 30h", min: 30, max: Infinity, color: "#ef4444" }
  ];
  function buildZohoVolcano(tickets) {
    const list = Array.isArray(tickets) ? tickets : [];
    const createdAt = (t) => t.created_at || t.createdTime || "";
    const closedAt = (t) => t.closed_at || t.closedTime || t.closedAt || t.closeTime || t.closedDate || "";
    const buckets = VOLCANO_BUCKETS.map((b) => ({ ...b, count: 0 }));
    list.forEach((t) => {
      const c = new Date(createdAt(t)), cl = new Date(closedAt(t));
      if (isNaN(c.getTime()) || isNaN(cl.getTime()) || cl < c) return;
      const hrs = (cl - c) / (1e3 * 60 * 60);
      const b = buckets.find((b2) => hrs >= b2.min && hrs < b2.max);
      if (b) b.count++;
    });
    const total = buckets.reduce((s, b) => s + b.count, 0);
    const max = Math.max(...buckets.map((b) => b.count), 1);
    return { buckets, total, max };
  }
  function buildZohoTopPerformance(tickets) {
    const list = Array.isArray(tickets) ? tickets : [];
    const createdDate = (t) => t.createdTime || t.created_at || "";
    const closedDate = (t) => t.closedTime || t.closed_at || t.closedAt || t.closeTime || t.closedDate || "";
    const assignee = (t) => `${t.assignee?.firstName || ""} ${t.assignee?.lastName || ""}`.trim();
    const isClosed = (t) => ["closed", "close", "technically closed"].includes(String(t.status || "").trim().toLowerCase());
    const scoreOf = (h) => {
      let s = 100 - Math.floor(h / 10) * 10;
      if (h > 100) s = 10;
      return Math.max(10, Math.min(100, s));
    };
    const map = {};
    list.forEach((t) => {
      if (!isClosed(t)) return;
      const c = new Date(createdDate(t)), cl = new Date(closedDate(t));
      if (isNaN(c.getTime()) || isNaN(cl.getTime()) || cl < c) return;
      const hrs = (cl - c) / (1e3 * 60 * 60);
      const name = assignee(t);
      if (!name || name === "Unassigned") return;
      if (!map[name]) map[name] = { engineer: name, totalHours: 0, ticketCount: 0 };
      map[name].totalHours += hrs;
      map[name].ticketCount++;
    });
    const rows = Object.values(map).sort((a, b) => a.totalHours - b.totalHours).slice(0, 5).map((r) => ({ ...r, score: scoreOf(r.totalHours).toFixed(2), totalHours: r.totalHours.toFixed(2) }));
    return { rows };
  }
  function buildZohoCorpMembers(tickets) {
    const list = Array.isArray(tickets) ? tickets : [];
    const grouped = {};
    list.forEach((t) => {
      const corp = t.department?.name || t.departmentName || "Unknown Department";
      const name = `${t.assignee?.firstName ?? ""} ${t.assignee?.lastName ?? ""}`.trim() || "Unassigned";
      if (!grouped[corp]) grouped[corp] = {};
      grouped[corp][name] = (grouped[corp][name] || 0) + 1;
    });
    const data = Object.entries(grouped).map(([corporation, assignees]) => ({
      corporation,
      total: Object.values(assignees).reduce((a, b) => a + b, 0),
      assignees: Object.entries(assignees).map(([name, count]) => ({ name, count }))
    })).sort((a, b) => b.total - a.total);
    return { data };
  }
  function buildZohoMttr(tickets) {
    const list = Array.isArray(tickets) ? tickets : [];
    const createdDate = (t) => t.createdTime || t.created_at || "";
    const closedDate = (t) => t.closedTime || t.closed_at || t.closedAt || t.closeTime || t.closedDate || "";
    const times = list.map((t) => {
      const c = new Date(createdDate(t)), cl = new Date(closedDate(t));
      if (isNaN(c.getTime()) || isNaN(cl.getTime()) || cl < c) return null;
      return (cl - c) / (1e3 * 60 * 60);
    }).filter((v) => v !== null);
    const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const getScore = (h) => h < 12 ? 100 : h < 24 ? 90 : h < 36 ? 75 : h < 48 ? 60 : h < 60 ? 40 : 20;
    const score = getScore(avg);
    const scoreColor = score >= 80 ? "#22c55e" : score >= 60 ? "#84cc16" : score >= 40 ? "#eab308" : "#ef4444";
    return { avg, score, scoreColor };
  }
  function buildFirewallSummary({
    fwRiskRaw,
    fwAttackersRaw,
    fwAttackerDestRaw,
    fwDeniedDestRaw,
    fwDeniedSourceRaw,
    fwDeniedAppRaw,
    fwRiskyUsersRaw,
    fwTopAttacksRaw,
    fwConnectionsRaw
  }) {
    const riskTable = extractTable(fwRiskRaw?.data);
    const attackersTable = extractTable(fwAttackersRaw?.data);
    const attackerDestTable = extractTable(fwAttackerDestRaw?.data);
    const deniedDestTable = extractTable(fwDeniedDestRaw?.data);
    const deniedSourceTable = extractTable(fwDeniedSourceRaw?.data);
    const deniedAppTable = extractTable(fwDeniedAppRaw?.data);
    const riskyUsersTable = extractTable(fwRiskyUsersRaw?.data);
    const topAttacksTable = extractTable(fwTopAttacksRaw?.data);
    const connTable = extractTable(fwConnectionsRaw?.data);
    const riskRows = riskTable?.rows || [];
    const riskTrend = makeRiskTrendData(riskRows);
    const riskDistribution = makeRiskDistribution(riskRows);
    const topAttackers = attackersTable ? makeTopChartData(attackersTable.rows, ["from", "source", "src", "attacker", "name"]) : [];
    const topAttacks = topAttacksTable ? makeTopChartData(topAttacksTable.rows, ["threatid", "threat", "name", "category"]) : [];
    const topDeniedDestinations = deniedDestTable ? makeTopChartData(deniedDestTable.rows, ["dst", "destination", "destination_ip", "name"]) : [];
    const topDeniedSources = deniedSourceTable ? makeTopChartData(deniedSourceTable.rows, ["src", "source", "source_ip", "name"]) : [];
    const topDeniedApps = deniedAppTable ? makeTopChartData(deniedAppTable.rows, ["app", "application", "name"]) : [];
    const riskyUsers = riskyUsersTable ? makeTopChartData(riskyUsersTable.rows, ["user", "srcuser", "name"]) : [];
    const totalSessions = getSumByColumn(riskRows, ["nsess", "sessions", "session", "count"]);
    const totalTraffic = getSumByColumn(riskRows, ["nbytes", "bytes", "byte"]);
    const highRiskEvents = riskRows.reduce((sum, row) => {
      const risk = parseNumber(getFirstValue(row, ["risk", "name", "severity"], 0));
      return risk >= 4 ? sum + parseNumber(getFirstValue(row, ["count", "nrepeat", "nsess", "sessions"], 1)) : sum;
    }, 0);
    const blockedConnections = deniedDestTable?.rows?.length || riskRows.filter((row) => {
      const action = String(getFirstValue(row, ["action", "category", "name"], "")).toLowerCase();
      return action.includes("block") || action.includes("deny") || action.includes("drop");
    }).length;
    const criticalUsers = riskyUsersTable?.rows?.length || 0;
    const securityScore = Math.max(0, Math.min(100, Math.round(100 - highRiskEvents * 0.05 - criticalUsers * 2 - blockedConnections * 0.1)));
    return {
      riskTable,
      attackersTable,
      attackerDestTable,
      deniedDestTable,
      deniedSourceTable,
      deniedAppTable,
      riskyUsersTable,
      topAttacksTable,
      connTable,
      riskRows,
      riskTrend,
      riskDistribution,
      topAttackers,
      topAttacks,
      topDeniedDestinations,
      topDeniedSources,
      topDeniedApps,
      riskyUsers,
      totalSessions,
      totalTraffic,
      highRiskEvents,
      blockedConnections,
      criticalUsers,
      securityScore
    };
  }

  // src/pages/report/pdfChartComponents.jsx
  var import_react = __toESM(__require("react"), 1);
  var import_renderer = __require("@react-pdf/renderer");
  var import_jsx_runtime = __require("react/jsx-runtime");
  var AXIS_GRAY = "#9ca3af";
  var GRID_GRAY = "#f3f4f6";
  var LABEL_GRAY = "#6b7280";
  function VDonut({ data, width = 180, height = 150, thickness = 22, colors }) {
    if (!data || data.length === 0) return null;
    const total = data.reduce((s, d) => s + (d.value || 0), 0);
    if (total <= 0) return null;
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2 - 2;
    const innerR = r - thickness;
    const pageWhite = "#ffffff";
    const sector = (a0, a1) => {
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    };
    let angle = -Math.PI / 2;
    const segments = data.map((d, i) => {
      const frac = (d.value || 0) / total;
      const a1 = angle + frac * 2 * Math.PI;
      const segFill = colors && colors[i] ? colors[i] : d.fill || "#3b82f6";
      const seg = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_renderer.Path,
        {
          d: sector(angle, a1),
          fill: segFill,
          stroke: segFill,
          strokeWidth: 0.5,
          strokeLinejoin: "round"
        },
        i
      );
      angle = a1;
      return seg;
    });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Svg, { width, height, viewBox: `0 0 ${width} ${height}`, children: [
      segments,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Circle, { cx, cy, r: innerR, fill: pageWhite, stroke: pageWhite, strokeWidth: 0 })
    ] });
  }
  function VBarChart({ data, width = 320, height = 180, color = "#4f46e5", labelKey = "name", valueKey = "value" }) {
    if (!data || data.length === 0) return null;
    const padL = 8, padR = 20, padT = 12, padB = 30;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
    const n = data.length;
    const slot = chartW / n;
    const barW = Math.max(4, Math.min(36, slot * 0.55));
    const bars = data.map((d, i) => {
      const h = Math.max(2, (Number(d[valueKey]) || 0) / max * chartH);
      const x = padL + i * slot + (slot - barW) / 2;
      const y = padT + chartH - h;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.G, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Rect, { x, y, width: barW, height: h, rx: 2, fill: color }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_renderer.Text,
          {
            x: x + barW / 2,
            y: y - 4,
            fontSize: 9,
            fill: LABEL_GRAY,
            textAnchor: "middle",
            children: d[valueKey]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_renderer.Text,
          {
            x: x + barW / 2,
            y: height - 10,
            fontSize: 8,
            fill: LABEL_GRAY,
            textAnchor: "middle",
            children: String(d[labelKey]).slice(0, 6)
          }
        )
      ] }, i);
    });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Svg, { width, height, viewBox: `0 0 ${width} ${height}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Line, { x1: padL, y1: padT + chartH, x2: width - padR, y2: padT + chartH, stroke: AXIS_GRAY, strokeWidth: 0.5 }),
      [0.25, 0.5, 0.75, 1].map((f, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Line, { x1: padL, y1: padT + chartH - f * chartH, x2: width - padR, y2: padT + chartH - f * chartH, stroke: GRID_GRAY, strokeWidth: 0.5, strokeDasharray: "2 2" }, i)),
      bars
    ] });
  }
  function VLineChart({ data, width = 320, height = 160, stroke = "#f97316", labelKey = "date", valueKey = "avg", valueFormat }) {
    if (!data || data.length === 0) return null;
    const padL = 26, padR = 10, padT = 10, padB = 24;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
    const n = data.length;
    const step = n > 1 ? chartW / (n - 1) : 0;
    const pts = data.map((d, i) => ({
      x: padL + i * step,
      y: padT + chartH - (Number(d[valueKey]) || 0) / max * chartH
    }));
    const linePath = pts.map((p, i) => i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`).join(" ");
    const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${padT + chartH} L ${pts[0].x} ${padT + chartH} Z`;
    const xTicks = [];
    for (let i = 0; i < n; i += Math.max(1, Math.ceil(n / 7))) {
      xTicks.push(i);
    }
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Svg, { width, height, viewBox: `0 0 ${width} ${height}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Line, { x1: padL, y1: padT + chartH, x2: width - padR, y2: padT + chartH, stroke: AXIS_GRAY, strokeWidth: 0.5 }),
      [0.25, 0.5, 0.75, 1].map((f, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Line, { x1: padL, y1: padT + chartH - f * chartH, x2: width - padR, y2: padT + chartH - f * chartH, stroke: GRID_GRAY, strokeWidth: 0.5, strokeDasharray: "2 2" }, i)),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Path, { d: areaPath, fill: stroke, fillOpacity: 0.12 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Path, { d: linePath, fill: "none", stroke, strokeWidth: 2, strokeLinejoin: "round" }),
      pts.map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Circle, { cx: p.x, cy: p.y, r: 2.5, fill: stroke }, i)),
      xTicks.map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { x: pts[i].x, y: height - 8, fontSize: 7.5, fill: LABEL_GRAY, textAnchor: "middle", children: String(data[i][labelKey]) }, i))
    ] });
  }
  function VHBarList({ data, width = 320, barHeight = 16, color = "#4f46e5", labelKey = "name", valueKey = "value", maxItems = 8 }) {
    if (!data || data.length === 0) return null;
    const list = data.slice(0, maxItems);
    const max = Math.max(...list.map((d) => Number(d[valueKey]) || 0), 1);
    const rowH = barHeight + 10;
    const height = list.length * rowH + 6;
    const labelW = Math.min(150, width * 0.42);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Svg, { width, height, viewBox: `0 0 ${width} ${height}`, children: list.map((d, i) => {
      const y = 4 + i * rowH;
      const bw = Math.max(2, (Number(d[valueKey]) || 0) / max * (width - labelW - 30));
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.G, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { x: 0, y: y + barHeight / 2 + 1, fontSize: 8, fill: LABEL_GRAY, textAnchor: "start", style: { fontFamily: "Helvetica" }, children: String(d[labelKey]).slice(0, 28) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Rect, { x: labelW, y, width: bw, height: barHeight, rx: 2, fill: color }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { x: labelW + bw + 6, y: y + barHeight / 2 + 1, fontSize: 8.5, fill: "#374151", fontWeight: "bold", children: d[valueKey] })
      ] }, i);
    }) });
  }
  function VLegendRow({ data, colors, stacked = true }) {
    if (!data || data.length === 0) return null;
    const total = data.reduce((s, d) => s + (d.value || 0), 0) || 1;
    if (stacked) {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { flexDirection: "column", marginTop: 6 }, children: data.map((d, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flexDirection: "row", alignItems: "center", marginBottom: 3 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { width: 8, height: 8, borderRadius: 2, backgroundColor: colors && colors[i] || d.fill || "#3b82f6", marginRight: 6 } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Text, { style: { fontSize: 8, color: LABEL_GRAY }, children: [
          String(d.name).slice(0, 30),
          " \u2014 ",
          d.value,
          " (",
          Math.round(d.value / total * 100),
          "%)"
        ] })
      ] }, i)) });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }, children: data.map((d, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flexDirection: "row", alignItems: "center", marginRight: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { width: 8, height: 8, borderRadius: 2, backgroundColor: colors && colors[i] || d.fill || "#3b82f6", marginRight: 4 } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Text, { style: { fontSize: 8, color: LABEL_GRAY }, children: [
        String(d.name).slice(0, 26),
        " (",
        d.value,
        " \xB7 ",
        Math.round(d.value / total * 100),
        "%)"
      ] })
    ] }, i)) });
  }
  var MTTR_STOPS = [
    { p: 0, c: [255, 71, 87] },
    // red
    { p: 33, c: [255, 165, 2] },
    // orange
    { p: 66, c: [255, 211, 42] },
    // yellow
    { p: 100, c: [46, 213, 115] }
    // green
  ];
  var mttrColor = (pct) => {
    let lower = MTTR_STOPS[0], upper = MTTR_STOPS[MTTR_STOPS.length - 1];
    for (let i = 0; i < MTTR_STOPS.length - 1; i++) {
      if (pct >= MTTR_STOPS[i].p && pct <= MTTR_STOPS[i + 1].p) {
        lower = MTTR_STOPS[i];
        upper = MTTR_STOPS[i + 1];
        break;
      }
    }
    const range = upper.p - lower.p || 1;
    const r = (pct - lower.p) / range;
    const ch = (n) => Math.round(lower.c[n] + r * (upper.c[n] - lower.c[n]));
    return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
  };
  function VGauge({ pct = 0, size = 150, title, goodLabel = "Resolved", badLabel = "Open", goodCount, badCount }) {
    const p = Math.min(Math.max(pct, 0), 100);
    const cx = size / 2;
    const cy = size - 12;
    const R = size / 2 - 12;
    const L = R - 6;
    const pt = (deg) => {
      const a = deg * Math.PI / 180;
      return [cx + R * Math.cos(a), cy - R * Math.sin(a)];
    };
    const arcSeg = (d0, d1) => {
      const [x0, y0] = pt(d0);
      const [x1, y1] = pt(d1);
      const large = Math.abs(d1 - d0) > 180 ? 1 : 0;
      return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
    };
    const segs = [
      { d0: 180, d1: 135, color: "#FF4757" },
      { d0: 135, d1: 90, color: "#FFA502" },
      { d0: 90, d1: 45, color: "#FFD32A" },
      { d0: 45, d1: 0, color: "#2ED573" }
    ];
    const needleDeg = 180 - p / 100 * 180;
    const [nx, ny] = (() => {
      const a = needleDeg * Math.PI / 180;
      return [cx + L * Math.cos(a), cy - L * Math.sin(a)];
    })();
    const needleColor = mttrColor(p);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { alignItems: "center" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Svg, { width: size, height: size, viewBox: `0 0 ${size} ${size}`, children: [
        segs.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Path, { d: arcSeg(s.d0, s.d1), fill: "none", stroke: s.color, strokeWidth: 12, strokeLinecap: "round" }, i)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Line, { x1: cx, y1: cy, x2: nx, y2: ny, stroke: needleColor, strokeWidth: 3, strokeLinecap: "round" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Circle, { cx, cy, r: 4, fill: "#111827" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Text, { style: { fontSize: 15, fontWeight: 800, color: needleColor, marginTop: 2 }, children: [
        Math.round(p),
        "%"
      ] }),
      title ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontSize: 8, fontWeight: 700, color: "#374151", marginTop: 2, textAlign: "center" }, children: title }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flexDirection: "row", gap: 8, marginTop: 4 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flexDirection: "row", alignItems: "center" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { width: 7, height: 7, borderRadius: 2, backgroundColor: "#2ED573", marginRight: 3 } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Text, { style: { fontSize: 7, color: "#6b7280" }, children: [
            goodLabel,
            goodCount !== void 0 && goodCount !== "" ? ` (${goodCount})` : ""
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flexDirection: "row", alignItems: "center" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { width: 7, height: 7, borderRadius: 2, backgroundColor: "#FF4757", marginRight: 3 } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Text, { style: { fontSize: 7, color: "#6b7280" }, children: [
            badLabel,
            badCount !== void 0 && badCount !== "" ? ` (${badCount})` : ""
          ] })
        ] })
      ] })
    ] });
  }
  var HEAT_STOPS = ["#F5EFE6", "#F8D48B", "#F3BE52", "#EDA41B", "#000000"];
  var heatColor = (count, max) => {
    if (count === 0) return HEAT_STOPS[0];
    const i = count / max;
    if (i <= 0.2) return HEAT_STOPS[1];
    if (i <= 0.4) return HEAT_STOPS[2];
    if (i <= 0.6) return HEAT_STOPS[3];
    return HEAT_STOPS[4];
  };
  function ZohoCountCards({ cards }) {
    if (!cards || cards.length === 0) return null;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }, children: cards.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: c.color, borderRadius: 8, padding: 8, backgroundColor: c.bg || "#f9fafb", alignItems: "center" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontSize: 7.5, fontWeight: 700, color: c.color, textTransform: "uppercase", marginBottom: 3 }, children: c.title }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontSize: 16, fontWeight: 800, color: c.color }, children: c.count })
    ] }, c.title)) });
  }
  function VHeatmap({ matrix, max, dayNames, cell = 18, labelW = 30 }) {
    if (!matrix || !matrix.length) return null;
    const HEAT_LABEL = "#6b7280";
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flexDirection: "row", marginBottom: 3 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { width: labelW } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { flexDirection: "row" }, children: Array.from({ length: 24 }).map((_, h) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { width: cell, fontSize: 5, color: HEAT_LABEL, textAlign: "center" }, children: h % 3 === 0 ? String(h === 0 ? 12 : h % 12 || 12) + (h < 12 ? "a" : "p") : "" }, h)) })
      ] }),
      matrix.map((row, di) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flexDirection: "row", alignItems: "center", marginBottom: 2 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { width: labelW, fontSize: 6.5, color: "#374151", fontWeight: 600 }, children: dayNames[di] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { flexDirection: "row" }, children: row.map((v, hi) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { width: cell, height: cell, backgroundColor: heatColor(v, max), borderRadius: 1.5, marginRight: 1.5 } }, hi)) })
      ] }, di)),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 6, gap: 4 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontSize: 6.5, color: HEAT_LABEL }, children: "Less" }),
        HEAT_STOPS.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { width: 10, height: 10, backgroundColor: c, borderRadius: 2 } }, i)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontSize: 6.5, color: HEAT_LABEL }, children: "More" })
      ] })
    ] });
  }
  function VFunnel({ slices, width = 300, height = 230 }) {
    if (!slices || slices.length === 0) return null;
    const total = slices.reduce((s, d) => s + d.count, 0) || 1;
    const topW = width * 0.42, neckW = width * 0.1;
    const padT = 8, padB = 8;
    const funnelH = height - padT - padB;
    const cy = padT;
    let y = cy;
    const edgeX = (yy) => topW - (yy - cy) / funnelH * (topW - neckW);
    const segs = slices.map((d, i) => {
      const sliceH = d.count / total * funnelH;
      const y1 = y, y2 = y + sliceH;
      const wx1 = edgeX(y1), wx2 = edgeX(y2);
      const path = `M ${width / 2 - wx1} ${y1} L ${width / 2 + wx1} ${y1} L ${width / 2 + wx2} ${y2} L ${width / 2 - wx2} ${y2} Z`;
      y = y2;
      const midY = (y1 + y2) / 2;
      return { d, path, color: d.color, midY };
    });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Svg, { width, height, viewBox: `0 0 ${width} ${height}`, children: segs.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.G, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Path, { d: s.path, fill: s.color, stroke: "#fff", strokeWidth: 0.8 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Text, { x: width / 2, y: s.midY + 3, fontSize: 8, fill: "#fff", fontWeight: "bold", textAnchor: "middle", children: [
        s.d.status,
        ": ",
        s.d.count
      ] })
    ] }, i)) });
  }
  function VVolcano({ buckets, max, height = 150, width = 320 }) {
    if (!buckets || buckets.length === 0) return null;
    const padB = 26, padT = 14;
    const chartH = height - padB - padT;
    const n = buckets.length;
    const slot = width / n;
    const barW = Math.min(46, slot * 0.6);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Svg, { width, height, viewBox: `0 0 ${width} ${height}`, children: buckets.map((b, i) => {
      const h = b.count > 0 ? Math.max(4, b.count / max * chartH) : 2;
      const x = i * slot + (slot - barW) / 2;
      const y = padT + chartH - h;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.G, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Rect, { x, y, width: barW, height: h, rx: 2, fill: b.color }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { x: x + barW / 2, y: y - 3, fontSize: 8, fill: "#374151", fontWeight: "bold", textAnchor: "middle", children: b.count }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { x: x + barW / 2, y: height - 12, fontSize: 6.5, fill: "#6b7280", textAnchor: "middle", children: b.label })
      ] }, i);
    }) });
  }
  function VTopTable({ rows, headers }) {
    if (!rows || rows.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontSize: 8.5, color: "#9ca3af", fontStyle: "italic" }, children: "No closed tickets found" });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6, overflow: "hidden" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { flexDirection: "row", backgroundColor: "#f3f4f6", paddingVertical: 4, paddingHorizontal: 6 }, children: headers.map((h, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { flex: i === 0 ? 2 : 1, fontSize: 7, fontWeight: 700, color: "#374151", textAlign: i === 0 ? "left" : "right" }, children: h }, i)) }),
      rows.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: "#f3f4f6" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { flex: 2, fontSize: 8, color: "#111827" }, children: r.engineer }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { flex: 1, fontSize: 8, color: "#111827", textAlign: "right" }, children: r.ticketCount }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { flex: 1, fontSize: 8, color: "#dc2626", fontWeight: 700, textAlign: "right" }, children: r.score }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { flex: 1, fontSize: 8, color: "#dc2626", fontWeight: 700, textAlign: "right" }, children: r.totalHours })
      ] }, i))
    ] });
  }
  function VCorpMember({ data, size = 260 }) {
    if (!data || data.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontSize: 8.5, color: "#9ca3af", fontStyle: "italic" }, children: "No ticket data available" });
    const cx = size / 2, cy = size / 2;
    const R = size / 2 - 6;
    const circ = data.map((c, i) => {
      const angle = i / data.length * Math.PI * 2 - Math.PI / 2;
      const dist = data.length === 1 ? 0 : R - 34;
      const cr = Math.max(26, Math.min(46, 30 + c.total / Math.max(...data.map((d) => d.total), 1) * 16));
      return {
        ...c,
        cr,
        cx: cx + Math.cos(angle) * dist,
        cy: cy + Math.sin(angle) * dist
      };
    });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Svg, { width: size, height: size, viewBox: `0 0 ${size} ${size}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Circle, { cx, cy, r: R, fill: "#fdf4f2", stroke: "#f0b4a8", strokeWidth: 1.5 }),
      circ.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.G, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Circle, { cx: c.cx, cy: c.cy, r: c.cr, fill: "#fbe3dc", stroke: "#e8604a", strokeWidth: 1 }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { x: c.cx, y: c.cy - 2, fontSize: 7, fill: "#c04030", fontWeight: "bold", textAnchor: "middle", children: c.corporation.slice(0, 14) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { x: c.cx, y: c.cy + 9, fontSize: 6.5, fill: "#c04030", textAnchor: "middle", children: c.total })
      ] }, i))
    ] });
  }
  function VMttrCard({ avg, score, scoreColor, size = 150 }) {
    const cx = size / 2, cy = size - 12, R = size / 2 - 12, L = R - 6;
    const pt = (deg) => {
      const a = deg * Math.PI / 180;
      return [cx + R * Math.cos(a), cy - R * Math.sin(a)];
    };
    const arcSeg = (d0, d1) => {
      const [x0, y0] = pt(d0), [x1, y1] = pt(d1);
      const large = Math.abs(d1 - d0) > 180 ? 1 : 0;
      return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
    };
    const segs = [
      { d0: 180, d1: 135, color: "#FF4757" },
      { d0: 135, d1: 90, color: "#FFA502" },
      { d0: 90, d1: 45, color: "#FFD32A" },
      { d0: 45, d1: 0, color: "#2ED573" }
    ];
    const needleDeg = 180 - score / 100 * 180;
    const [nx, ny] = (() => {
      const a = needleDeg * Math.PI / 180;
      return [cx + L * Math.cos(a), cy - L * Math.sin(a)];
    })();
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { alignItems: "center" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Svg, { width: size, height: size, viewBox: `0 0 ${size} ${size}`, children: [
        segs.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Path, { d: arcSeg(s.d0, s.d1), fill: "none", stroke: s.color, strokeWidth: 12, strokeLinecap: "round" }, i)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Line, { x1: cx, y1: cy, x2: nx, y2: ny, stroke: scoreColor, strokeWidth: 3, strokeLinecap: "round" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Circle, { cx, cy, r: 4, fill: "#111827" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontSize: 15, fontWeight: 800, color: scoreColor, marginTop: 2 }, children: score }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontSize: 8, color: "#6b7280", marginTop: 1 }, children: "MTTR Score" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Text, { style: { fontSize: 9, fontWeight: 700, color: "#111827", marginTop: 2 }, children: [
        avg.toFixed(2),
        " Hours"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontSize: 6.5, color: "#9ca3af" }, children: "Mean Time To Resolution" })
    ] });
  }

  // src/pages/report/ReportTemplate.jsx
  var import_jsx_runtime2 = __require("react/jsx-runtime");
  var clampPct = (n) => Math.min(Math.max(n || 0, 0), 100);
  var MTTR_CARDS = {
    overall: { label: "Overall MTTR", good: "Avg Resolved", bad: "Avg Open" },
    sentinelOne: { label: "SentinelOne", good: "Mitigated", bad: "Unmitigated" },
    email: { label: "Email Security", good: "Remediated", bad: "Unremediated" },
    ticketing: { label: "Ticketing", good: "Closed", bad: "Open" }
  };
  function MttrGaugeCard({ cfgKey, mttr }) {
    const cfg = MTTR_CARDS[cfgKey];
    if (!cfg) return null;
    const m = mttr?.[cfgKey] || { pct: 0, goodCount: "", badCount: "" };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.block, wrap: false, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: S.cardTitle, children: [
        cfg.label,
        " \u2014 MTTR / Compliance Health"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10, backgroundColor: C.bg, alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          VGauge,
          {
            pct: clampPct(m.pct),
            goodLabel: cfg.good,
            badLabel: cfg.bad,
            goodCount: m.goodCount,
            badCount: m.badCount
          }
        ),
        cfgKey === "email" && m.total !== void 0 && m.total !== "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontSize: 7, color: C.faint, marginTop: 2 }, children: [
          "Total Events: ",
          m.total
        ] }) : null
      ] })
    ] });
  }
  var C = {
    ink: "#111827",
    sub: "#4b5563",
    muted: "#6b7280",
    faint: "#9ca3af",
    line: "#e5e7eb",
    lighter: "#f3f4f6",
    bg: "#f9fafb",
    brand: "#4f46e5",
    brandDark: "#4338ca",
    green: "#16a34a",
    red: "#dc2626",
    amber: "#d97706",
    sky: "#0284c7",
    violet: "#7c3aed",
    slate: "#64748b"
  };
  var S = import_renderer2.StyleSheet.create({
    page: { fontSize: 9, color: C.ink, backgroundColor: "#ffffff", paddingTop: 34, paddingBottom: 34, paddingLeft: 40, paddingRight: 40 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    brandBar: { height: 4, backgroundColor: C.brand, marginBottom: 12, borderRadius: 2 },
    title: { fontSize: 18, fontWeight: 700, color: C.ink },
    subtitle: { fontSize: 10, color: C.muted, marginTop: 2 },
    sectionDivider: { flexDirection: "row", alignItems: "center", marginBottom: 12, marginTop: 4 },
    sectionNumber: { width: 26, height: 26, borderRadius: 6, backgroundColor: C.brand, color: "#fff", fontSize: 12, fontWeight: 700, textAlign: "center", paddingTop: 6, marginRight: 10 },
    sectionTitle: { fontSize: 15, fontWeight: 700, color: C.ink },
    sectionRule: { flex: 1, height: 2, backgroundColor: C.line, marginLeft: 14 },
    kpiRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    kpiTile: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 8, backgroundColor: C.bg },
    kpiLabel: { fontSize: 7.5, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
    kpiValue: { fontSize: 17, fontWeight: 800, color: C.ink },
    kpiSub: { fontSize: 7.5, color: C.faint, marginTop: 1 },
    block: { marginBottom: 12 },
    card: { borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: "#fff", padding: 10 },
    cardTitle: { fontSize: 10.5, fontWeight: 700, color: C.ink, marginBottom: 8 },
    // Row holding two chart cards side-by-side (each child flexes to half width).
    row2: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
    // Row holding four chart cards side-by-side (each child flexes to quarter width).
    row4: { flexDirection: "row", flexWrap: "nowrap", gap: 8, marginBottom: 12 },
    chartHalf: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: "#fff", padding: 10 },
    chartHalfTitle: { fontSize: 10.5, fontWeight: 700, color: C.ink, marginBottom: 8 },
    // Full-width, vertically centered column (used for the two weekly charts that
    // should stack one-below-the-other and sit centered on the page).
    colCenter: { alignItems: "center", justifyContent: "center", marginBottom: 12 },
    chartFrame: { alignItems: "center", marginBottom: 4 },
    footer: { position: "absolute", bottom: 14, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, fontSize: 7.5, color: C.faint },
    badge: { padding: "2px 6px", borderRadius: 3, fontSize: 7, fontWeight: 700, color: "#fff" },
    lead: { fontSize: 10, color: C.sub, lineHeight: 1.55, marginBottom: 10 },
    bullet: { flexDirection: "row", marginBottom: 4 },
    bulletDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.brand, marginTop: 4, marginRight: 8 }
  });
  function SectionDivider({ number, title, color = C.brand }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.sectionDivider, wrap: false, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: [S.sectionNumber, { backgroundColor: color }], children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { children: number }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.sectionTitle, children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: S.sectionRule })
    ] });
  }
  function KpiTile({ label, value, sub, color = C.ink }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.kpiTile, wrap: false, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.kpiLabel, children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [S.kpiValue, { color }], children: value }),
      sub ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.kpiSub, children: sub }) : null
    ] });
  }
  var EMPTY_STYLE = { fontSize: 8.5, color: C.faint, fontStyle: "italic" };
  function EmptyNote({ text = "No data available for this period." }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: EMPTY_STYLE, children: text });
  }
  function DonutBlock({ title, data, colors, width = 130, height = 130, desc, half }) {
    const wrap = half ? S.chartHalf : S.block;
    const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: wrap, wrap: false, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: titleStyle, children: title }),
      data && data.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VDonut, { data, width, height, colors }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { marginTop: 8, width: "100%" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VLegendRow, { data, colors }) })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyNote, {}),
      desc ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 7.5, color: C.faint, marginTop: 4 }, children: desc }) : null
    ] });
  }
  function HBarBlock({ title, data, color = C.brand, width = 320, maxItems = 10, desc, half }) {
    const wrap = half ? S.chartHalf : S.block;
    const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: wrap, wrap: false, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: titleStyle, children: title }),
      data && data.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VHBarList, { data, width, maxItems, color }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyNote, {}),
      desc ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 7.5, color: C.faint, marginTop: 4 }, children: desc }) : null
    ] });
  }
  function BarBlock({ title, data, color = C.brand, width = 320, height = 160, desc, half }) {
    const wrap = half ? S.chartHalf : S.block;
    const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: wrap, wrap: false, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: titleStyle, children: title }),
      data && data.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VBarChart, { data, width, height, color }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyNote, {}),
      desc ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 7.5, color: C.faint, marginTop: 4 }, children: desc }) : null
    ] });
  }
  function LineBlock({ title, data, color = C.brand, width = 320, height = 160, labelKey = "date", valueKey = "value", desc, half }) {
    const wrap = half ? S.chartHalf : S.block;
    const titleStyle = half ? S.chartHalfTitle : S.cardTitle;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: wrap, wrap: false, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: titleStyle, children: title }),
      data && data.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VLineChart, { data, width, height, stroke: color, labelKey, valueKey }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyNote, {}),
      desc ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 7.5, color: C.faint, marginTop: 4 }, children: desc }) : null
    ] });
  }
  function BulletList({ items }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: S.block, children: items.map((it, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.bullet, wrap: false, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: S.bulletDot }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 9, color: C.sub, lineHeight: 1.5 }, children: it })
    ] }, i)) });
  }
  function PageFooter({ orgName, generatedAt, sectionNumber }) {
    const date = new Date(generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.footer, fixed: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { children: [
        "CISO Security Report \xB7 ",
        orgName
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { render: ({ subPageNumber, subPageTotalPages }) => {
        const sec = sectionNumber !== void 0 && sectionNumber !== null ? ` \xB7 Section ${sectionNumber}${subPageTotalPages > 1 ? `.${subPageNumber}` : ""}` : "";
        return `${date}${sec}`;
      } })
    ] });
  }
  var palette = (data) => (data || []).map((_, i) => COLORS[i % COLORS.length]);
  function CoverPage({ orgName, generatedAt }) {
    const date = new Date(generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const index = [
      ["1", "Executive Summary"],
      ["2", "Checkpoint Harmony \u2014 Email & Cloud Security"],
      ["3.1", "SentinelOne \u2014 Threat Analytics"],
      ["3.2", "SentinelOne \u2014 Agent Analytics"],
      ["3.3", "SentinelOne \u2014 Most At-Risk Entities"],
      ["3.4", "SentinelOne \u2014 Application CVEs"],
      ["3.5", "SentinelOne \u2014 Application Insights"],
      ["4", "Zoho Desk \u2014 Support Tickets"],
      ["5", "Palo Alto Firewall \u2014 Network Security"],
      ["6", "Weekly Insights \u2014 7-Day Comparison"]
    ];
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { backgroundColor: "#1e1b4b", padding: 40, flex: 1, justifyContent: "space-between" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { height: 4, backgroundColor: C.brand, width: 48 } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 12, color: "#a5b4fc", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }, children: "CISO Dashboard" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 30, fontWeight: 800, color: "#ffffff" }, children: "Security Report" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 14, color: "#c7d2fe", marginTop: 6 }, children: orgName }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 11, color: "#818cf8", marginTop: 14 }, children: date }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 12px", marginTop: 14, alignSelf: "flex-start" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 9, color: "#c7d2fe" }, children: "Confidential \u2014 For Management Use" }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 20 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 10, color: "#818cf8", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }, children: "Report Index" }),
        index.map(([num, title]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", alignItems: "center", marginBottom: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { width: 22, height: 22, borderRadius: 5, backgroundColor: C.brand, alignItems: "center", justifyContent: "center", marginRight: 10 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { color: "#fff", fontSize: 10, fontWeight: 700 }, children: num }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { color: "#e0e7ff", fontSize: 10 }, children: title })
        ] }, num))
      ] })
    ] });
  }
  function ExecutiveSummary({ d, weekly }) {
    const risk = buildFirewallSummary(d);
    const scoreStatus = getSecurityScoreStatus(risk.securityScore);
    const threats = Array.isArray(d.s1Threats) ? d.s1Threats : [];
    const tickets = Array.isArray(d.zohoTickets) ? d.zohoTickets : [];
    const cve = buildCveData(Array.isArray(d.s1Cves) ? d.s1Cves : []);
    const events = Array.isArray(d.harmonyEvents) ? d.harmonyEvents : [];
    const mitigated = threats.filter((t) => t.threatInfo?.mitigationStatus === "mitigated").length;
    const unresolved = threats.filter((t) => ["unresolved", "active"].includes(t.threatInfo?.incidentStatus)).length;
    const findings = [];
    if (threats.length > 0) findings.push(`${threats.length} threats detected across the endpoint fleet; ${mitigated} mitigated, ${unresolved} unresolved.`);
    if (cve.totalCves > 0) findings.push(`${cve.totalCves} known CVEs across ${cve.totalApplications} applications; ${cve.severityMap.CRITICAL} rated CRITICAL.`);
    if (events.length > 0) findings.push(`${events.length} email/cloud security events logged; ${events.filter((e) => e.state === "pending").length} pending review.`);
    if (tickets.length > 0) {
      const open = tickets.filter((t) => t.status === "Open").length;
      findings.push(`${tickets.length} support tickets recorded; ${open} currently open.`);
    }
    if (tickets.length === 0 && threats.length === 0 && events.length === 0 && cve.totalCves === 0) {
      findings.push("No active security events recorded for the reporting period.");
    }
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SectionDivider, { number: "1", title: "Executive Summary" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.lead, children: "Strategic overview of the organisation's security posture for the reporting period. This summary consolidates signals from endpoint protection, email/cloud security, vulnerability management, helpdesk operations, and the perimeter firewall." }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.kpiRow, wrap: false, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Threats Detected", value: formatNumber(threats.length), color: C.red }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Mitigated", value: formatNumber(mitigated), color: C.green }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Known CVEs", value: formatNumber(cve.totalCves), color: C.amber }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Open Tickets", value: formatNumber(tickets.filter((t) => t.status === "Open").length), color: C.sky }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Email Events", value: formatNumber(events.length), color: C.violet })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MttrGaugeCard, { cfgKey: "overall", mttr: d.mttr }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.block, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.cardTitle, children: "Key Findings" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BulletList, { items: findings })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.block, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.cardTitle, children: "Recommended Focus" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BulletList, { items: [
          `Remediate the ${cve.severityMap.CRITICAL} critical-rated application vulnerabilities without delay.`,
          `Investigate the ${unresolved} unresolved threats and complete pending mitigation actions.`,
          tickets.filter((t) => t.status === "Open").length > 0 ? `Clear the currently open helpdesk backlog (${tickets.filter((t) => t.status === "Open").length} tickets).` : "Maintain the current ticket state \u2014 no open backlog at period end.",
          `Review firewall high-risk events and suspicious sources to confirm nothing was missed.`
        ] })
      ] })
    ] });
  }
  var evtSender = (e) => (e.senderAddress ?? e.sender_address ?? "").toLowerCase();
  var evtDesc = (e) => e.description ?? e.event_description ?? "";
  var evtCreated = (e) => e.eventCreated ?? e.event_created ?? "";
  var evtSeverity = (e) => e.severity ?? e.severity ?? "";
  var evtConfidence = (e) => e.confidenceIndicator ?? e.confidence_indicator ?? "unknown";
  var CONF_COLORS = { malicious: "#ef4444", suspicious: "#f97316", detected: "#f59e0b", unknown: "#94a3b8" };
  var SEV_LABELS = { 0: "Informational", 1: "Low", 2: "Medium", 3: "High", 4: "Critical" };
  var DAY_MS = 864e5;
  function formatDuration(minutes) {
    if (minutes == null) return "N/A";
    if (minutes < 1) return "<1m";
    if (minutes < 60) return `${Math.round(minutes)}m`;
    if (minutes < 1440) {
      const h2 = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      return m > 0 ? `${h2}h ${m}m` : `${h2}h`;
    }
    const d = Math.floor(minutes / 1440);
    const h = Math.round(minutes % 1440 / 60);
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }
  function CheckpointSection({ events, weekly, mttr }) {
    const list = Array.isArray(events) ? events : [];
    const states = {};
    list.forEach((e) => {
      const s = e.state || "unknown";
      states[s] = (states[s] || 0) + 1;
    });
    const stateRows = Object.entries(states).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
    const pending = list.filter((e) => e.state === "pending").length;
    const resolved = list.filter((e) => ["remediated", "done", "closed"].includes(e.state)).length;
    const domainCounts = {};
    const senderCounts = {};
    list.forEach((e) => {
      const s = evtSender(e);
      if (!s) return;
      const parts = s.split("@");
      if (parts.length >= 2) {
        const domain = parts[parts.length - 1];
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      }
      senderCounts[s] = (senderCounts[s] || 0) + 1;
    });
    const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
    const topSenders = Object.entries(senderCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
    const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const targetCounts = {};
    list.forEach((e) => {
      const matches = evtDesc(e).match(EMAIL_RE);
      if (!matches) return;
      const sender = evtSender(e);
      matches.forEach((m) => {
        const lm = m.toLowerCase();
        if (lm !== sender) targetCounts[lm] = (targetCounts[lm] || 0) + 1;
      });
    });
    const topTargets = Object.entries(targetCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
    const dayCounts = {};
    list.forEach((e) => {
      const ts = evtCreated(e);
      if (!ts) return;
      const d = new Date(ts).toISOString().slice(0, 10);
      dayCounts[d] = (dayCounts[d] || 0) + 1;
    });
    let cumulative = 0;
    const cumulativeSeries = Object.entries(dayCounts).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => {
      cumulative += value;
      return { date, value: cumulative };
    });
    const nowMs = Date.now();
    const curWeek = list.filter((e) => {
      const d = evtCreated(e);
      return d && nowMs - new Date(d).getTime() < 7 * DAY_MS;
    }).length;
    const prevWeek = list.filter((e) => {
      const d = evtCreated(e);
      if (!d) return false;
      const age = nowMs - new Date(d).getTime();
      return age >= 7 * DAY_MS && age < 14 * DAY_MS;
    }).length;
    const weekPct = prevWeek === 0 ? null : Math.round((curWeek - prevWeek) / prevWeek * 100);
    const avgSevValid = list.filter((e) => {
      const s = evtSeverity(e);
      return s !== "" && !isNaN(Number(s));
    });
    const avgSev = avgSevValid.length === 0 ? null : (avgSevValid.reduce((s, e) => s + Number(evtSeverity(e)), 0) / avgSevValid.length).toFixed(1);
    const criticalCount = list.filter((e) => Number(evtSeverity(e)) >= 4).length;
    const sevDist = {};
    list.forEach((e) => {
      const s = evtSeverity(e) ?? "?";
      sevDist[s] = (sevDist[s] || 0) + 1;
    });
    const sevDistRows = Object.entries(sevDist).sort(([a], [b]) => Number(a) - Number(b)).map(([sev, value]) => ({ name: SEV_LABELS[sev] ?? `Sev ${sev}`, value }));
    const confDist = {};
    list.forEach((e) => {
      const c = String(evtConfidence(e)).toLowerCase();
      confDist[c] = (confDist[c] || 0) + 1;
    });
    const confRows = Object.entries(confDist).map(([name, value]) => ({ name, value }));
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SectionDivider, { number: "2", title: "Checkpoint Harmony \u2014 Email & Cloud Security" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: S.lead, children: [
        list.length,
        " email and cloud security events recorded. ",
        pending,
        " pending review, ",
        resolved,
        " resolved."
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.kpiRow, wrap: false, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Events This Week", value: formatNumber(curWeek), sub: weekPct === null ? "no prior-week data" : `vs ${prevWeek} last wk`, color: weekPct !== null && weekPct > 0 ? C.red : C.green }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Avg Severity", value: avgSev ?? "\u2014", sub: "out of 5", color: C.amber }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Critical Events", value: formatNumber(criticalCount), sub: "severity \u2265 4", color: C.red }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Total Events", value: formatNumber(list.length), color: C.brand }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Pending", value: formatNumber(pending), color: C.amber }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Resolved", value: formatNumber(resolved), color: C.green })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MttrGaugeCard, { cfgKey: "email", mttr }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Severity Distribution", data: sevDistRows, colors: sevDistRows.map((_, i) => SEV_COLORS[i % SEV_COLORS.length]), half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Event State Breakdown", data: stateRows, colors: palette(stateRows), half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Confidence Indicator", data: confRows, colors: confRows.map((d) => CONF_COLORS[d.name] ?? "#6366f1"), half: true })
      ] }),
      weekly && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          HBarBlock,
          {
            title: "Top Senders \u2014 Week-over-Week",
            data: weekly.topSenders.slice(0, 10).map((r) => ({ name: String(r.sender_address || "Unknown").slice(0, 28), value: r["This Week"] || 0 })),
            color: C.brand,
            half: true
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          BarBlock,
          {
            title: "Event Volume \u2014 This Week vs Last Week",
            data: weekly.remComp.map((r) => ({ name: r.day, value: r["This Week"] || 0 })),
            color: C.brand,
            half: true
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Top Sender Domains", data: topDomains, color: "#6366f1", half: true, desc: "By source email domain" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Top Individual Senders", data: topSenders, color: "#f97316", half: true, desc: "By full sender address" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Most Targeted Mailboxes", data: topTargets, color: "#8b5cf6", half: true, desc: "Recipients most frequently targeted" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(LineBlock, { title: "Cumulative Events Over Time", data: cumulativeSeries, color: "#6366f1", half: true, labelKey: "date", valueKey: "value" })
      ] })
    ] });
  }
  function ThreatAnalytics({ threats, mttr }) {
    const t = buildThreatAnalytics(threats);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SectionDivider, { number: "3.1", title: "SentinelOne \u2014 Threat Analytics", color: "#dc2626" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: S.lead, children: [
        t.total,
        " threats detected. ",
        t.mitigated,
        " mitigated (",
        t.mitPct,
        "%), ",
        t.unresolved,
        " unresolved.",
        t.avgMttd !== null ? ` Avg time to detect: ${Math.round(t.avgMttd)} min.` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.kpiRow, wrap: false, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Total Threats", value: formatNumber(t.total), color: C.red }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Mitigated", value: formatNumber(t.mitigated), color: C.green }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Unresolved", value: formatNumber(t.unresolved), color: C.amber }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Endpoints Affected", value: formatNumber(t.affectedEndpoints), color: C.sky }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Avg MTTD", value: t.avgMttd !== null ? `${Math.round(t.avgMttd)}m` : "N/A", color: C.violet }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Avg MTTM", value: t.avgMttm !== null ? formatDuration(t.avgMttm) : "N/A", sub: "time to mitigate", color: "#06b6d4" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row4, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Classification", data: t.classData, color: C.violet, width: 220, half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Detection Engines", data: t.engineData.slice(0, 8), color: C.sky, width: 220, half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "MITRE ATTACK Tactics", data: t.tacticData.slice(0, 8), color: C.slate, width: 220, half: true })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row4, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Mitigation Status", data: t.mitigationData, colors: palette(t.mitigationData), half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MttrGaugeCard, { cfgKey: "sentinelOne", mttr, half: true })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Top Users by Threat Count", data: t.topUsersData, color: "#f59e0b", half: true, desc: "Threats per process user" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Severity / Confidence Distribution", data: t.confidenceData, colors: t.confidenceData.map((d) => d.fill || C.slate), half: true })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Threats by Site", data: t.siteData, color: "#10b981", half: true, desc: "Threats per site" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Threats by Group", data: t.groupData, color: "#ec4899", half: true, desc: "Threats per group" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Classification", data: t.classData, colors: palette(t.classData), half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Fileless vs File-based", data: t.filelessData, colors: t.filelessData.map((d) => d.fill || C.slate), half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Mitigation Outcomes", data: t.mitigationData, colors: palette(t.mitigationData), half: true })
      ] })
    ] });
  }
  function AgentAnalytics({ agents, generatedAt, removed }) {
    const a = buildAgentAnalytics(agents, generatedAt);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SectionDivider, { number: "3.2", title: "SentinelOne \u2014 Agent Analytics", color: "#0ea5e9" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: S.lead, children: [
        a.total,
        " agents registered. ",
        a.connected,
        " connected (",
        Math.round(a.connected / Math.max(a.total, 1) * 100),
        "%), ",
        a.disconnected,
        " disconnected, ",
        a.newAgents,
        " new in 30 days."
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.kpiRow, wrap: false, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Total Agents", value: formatNumber(a.kpis.total), color: "#3b82f6" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Active", value: formatNumber(a.kpis.active), color: "#10b981", sub: `${a.kpis.health}% health` }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Inactive", value: formatNumber(a.kpis.inactive), color: "#ef4444" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Active Threats", value: formatNumber(a.kpis.threats), color: "#f59e0b" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Outdated", value: formatNumber(a.kpis.outdated), color: "#8b5cf6" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Health Score", value: `${a.kpis.health}%`, color: "#06b6d4", sub: "active/total" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Operating System Distribution", data: a.osDistribution, colors: a.osDistribution.map((d) => d.fill), half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Active Status", data: a.activeStatusDistribution, colors: a.activeStatusDistribution.map((d) => d.fill), half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Firewall Status", data: a.firewallStatusDistribution, colors: a.firewallStatusDistribution.map((d) => d.fill), half: true })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row4, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Agent Version", data: a.agentVersionStatus, colors: a.agentVersionStatus.map((d) => d.fill), half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Site Distribution", data: a.siteDistribution, colors: a.siteDistribution.map((d) => d.fill), half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Network Status", data: a.networkStatusDistribution, colors: a.networkStatusDistribution.map((d) => d.fill), half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Scan Status", data: a.scanStatusDistribution, colors: a.scanStatusDistribution.map((d) => d.fill), half: true })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: S.row2, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Machine Types", data: a.machineTypeData, color: C.sky, half: true }) })
    ] });
  }
  function AtRiskSection({ threats }) {
    const a = buildAtRisk(threats);
    const cards = [
      ["Most At-Risk Device", a.topDevice, "#dc2626"],
      ["Most At-Risk User", a.topUser, "#d97706"],
      ["Most At-Risk Group", a.topGroup, "#7c3aed"]
    ];
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SectionDivider, { number: "3.3", title: "SentinelOne \u2014 Most At-Risk Entities", color: "#d97706" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: S.kpiRow, wrap: false, children: cards.map(([label, entry, color]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: [S.kpiTile, { borderLeftWidth: 4, borderLeftColor: color }], children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.kpiLabel, children: label }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 2 }, children: entry ? entry[0] : "No data" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 9, color }, children: entry ? `${entry[1]} threats` : "" })
      ] }, label)) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Ranked Devices", data: a.devices.slice(0, 8), color: C.red, half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Ranked Users", data: a.users.slice(0, 8), color: C.amber, half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Ranked Groups", data: a.groups.slice(0, 8), color: C.violet, half: true })
      ] })
    ] });
  }
  function CveSection({ cves }) {
    const d = buildCveData(Array.isArray(cves) ? cves : []);
    if (d.totalApplications === 0) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SectionDivider, { number: "3.4", title: "SentinelOne \u2014 Application CVEs", color: "#7c3aed" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { color: C.muted }, children: "No CVE data available." })
    ] });
    const cveList = Array.isArray(cves) ? cves : [];
    const exposureData = d.severityDistribution.map((x) => ({
      name: x.name,
      value: new Set(cveList.filter((r) => String(r.severity || "UNKNOWN").toUpperCase() === x.name).map((r) => r.endpointId || r.endpointName).filter(Boolean)).size
    }));
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SectionDivider, { number: "3.4", title: "SentinelOne \u2014 Application CVEs", color: "#7c3aed" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.kpiRow, wrap: false, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Applications", value: formatNumber(d.totalApplications), color: C.violet }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Total CVEs", value: formatNumber(d.totalCves), color: C.brand }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Critical", value: formatNumber(d.severityMap.CRITICAL), color: C.red }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "High", value: formatNumber(d.severityMap.HIGH), color: C.amber }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Endpoints", value: formatNumber(d.totalEndpoints), color: C.sky }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Avg Score", value: d.avgScore, color: C.slate })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Severity Distribution", data: d.severityDistribution, half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Top Risky Applications", data: d.topRiskyApps.slice(0, 10).map((x) => ({ name: x.name, value: x.cves })), color: C.violet, half: true })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BarBlock, { title: "CVE Aging (days since detection)", data: d.cveAging.map((x) => ({ name: x.name, value: x.count })), color: C.amber, half: true }),
        d.severityDistribution.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "CVE Exposure by Severity (endpoints affected)", data: exposureData, color: C.sky, half: true }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: S.chartHalf }),
        d.criticalApps.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Critical Applications by CVE count", data: d.criticalApps.map((x) => ({ name: x.name, value: x.cveCount })), color: C.red })
      ] })
    ] });
  }
  function AppInsightsSection({ apps }) {
    const list = Array.isArray(apps) ? apps : [];
    if (list.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { color: C.muted }, children: "No application inventory data available." });
    const names = new Set(list.map((a) => a.applicationName || a.name || a.appName || "Unknown"));
    const osC = {}, sevC = {}, appC = {};
    list.forEach((a) => {
      const n = a.applicationName || a.name || a.appName || "Unknown";
      osC[a.osType || a.os || a.operatingSystem || "Unknown"] = (osC[a.osType || a.os || a.operatingSystem || "Unknown"] || 0) + 1;
      sevC[a.severity || "Unknown"] = (sevC[a.severity || "Unknown"] || 0) + 1;
      appC[n] = (appC[n] || 0) + 1;
    });
    const osRows = Object.entries(osC).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
    const sevRows = Object.entries(sevC).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
    const appRows = Object.entries(appC).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name: name.length > 40 ? name.slice(0, 40) + "\u2026" : name, value }));
    const publishers = new Set(list.map((a) => a.applicationVendor || a.publisher || a.vendor || "").filter(Boolean));
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SectionDivider, { number: "3.5", title: "SentinelOne \u2014 Application Insights", color: "#0ea5e9" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.kpiRow, wrap: false, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Unique Apps", value: formatNumber(names.size), color: C.sky }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Records", value: formatNumber(list.length), color: C.brand }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Publishers", value: formatNumber(publishers.size), color: C.violet })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "By Operating System", data: osRows, colors: palette(osRows), half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Top Installed Applications", data: appRows, color: C.brand })
      ] })
    ] });
  }
  function ZohoSection({ tickets, mttr }) {
    const z = buildZohoSummary(tickets);
    const counts = buildZohoTicketCounts(tickets);
    const funnel = buildZohoFunnel(tickets);
    const heatmap = buildZohoHeatmap(tickets);
    const volcano = buildZohoVolcano(tickets);
    const topPerf = buildZohoTopPerformance(tickets);
    const corp = buildZohoCorpMembers(tickets);
    const mttrCard = buildZohoMttr(tickets);
    const isIncrease = counts.closedDifference > 0;
    const isDecrease = counts.closedDifference < 0;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SectionDivider, { number: "4", title: "Zoho Desk \u2014 Support Tickets", color: "#d97706" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: S.lead, children: [
        z.total,
        " tickets recorded. ",
        z.open,
        " open, ",
        z.closed,
        " closed, ",
        z.highPri,
        " high/critical priority, ",
        z.overdue,
        " overdue."
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.kpiRow, wrap: false, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Total", value: formatNumber(z.total), color: C.brand }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Open", value: formatNumber(z.open), color: C.sky }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "High Priority", value: formatNumber(z.highPri), color: C.red }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Closed", value: formatNumber(z.closed), color: C.green }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Overdue", value: formatNumber(z.overdue), color: C.amber })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.block, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ZohoCountCards, { cards: counts.cards }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontSize: 7.5, color: C.faint }, children: [
          "Closed this month: ",
          counts.currentMonthClosed,
          " ",
          "(",
          isIncrease ? "\u2191" : isDecrease ? "\u2193" : "\u2192",
          " ",
          Math.abs(counts.closedDifference),
          " \xB7 ",
          Math.abs(counts.closedPercentage).toFixed(1),
          "% vs last month)"
        ] }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "By Status", data: z.statusData, half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "By Priority", data: z.priorityData, half: true })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.block, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.cardTitle, children: "Ticket Status Funnel" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { alignItems: "center" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VFunnel, { slices: funnel.slices, width: 300, height: 220 }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.chartHalf, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.chartHalfTitle, children: "Ticket Creation Heatmap" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VHeatmap, { matrix: heatmap.matrix, max: heatmap.max, dayNames: heatmap.DAY_NAMES })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.chartHalf, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.chartHalfTitle, children: "Ticket Hour Bucket Graph" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { alignItems: "center", marginTop: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VVolcano, { buckets: volcano.buckets, max: volcano.max, height: 160, width: 300 }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontSize: 7.5, color: C.faint, marginTop: 2 }, children: [
              volcano.total,
              " tickets resolved"
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Resolution Time Aging", data: z.agingData, color: C.amber, half: true }),
        z.engineerPerformance.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Engineer Performance (tickets closed)", data: z.engineerPerformance.map((e) => ({ name: e.engineer, value: e.closed })), color: C.brand, half: true }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: S.chartHalf })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Tickets by Department", data: z.departmentData, color: C.violet, half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.chartHalf, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.chartHalfTitle, children: "Top Lowest 5 Performance" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontSize: 7, color: C.faint, marginBottom: 4 }, children: "Engineer-wise total time from created to closed" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VTopTable, { rows: topPerf.rows, headers: ["Engineer Name", "Closed", "Score", "Hours"] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.chartHalf, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.chartHalfTitle, children: "Corporation Assignee Distribution" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { alignItems: "center", marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VCorpMember, { data: corp.data, size: 240 }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.chartHalf, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.chartHalfTitle, children: "MTTR Score" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { alignItems: "center", marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VMttrCard, { avg: mttrCard.avg, score: mttrCard.score, scoreColor: mttrCard.scoreColor }) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: S.block, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MttrGaugeCard, { cfgKey: "ticketing", mttr }) })
    ] });
  }
  function FirewallSection({ fw }) {
    const f = fw;
    const scoreStatus = getSecurityScoreStatus(f.securityScore);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SectionDivider, { number: "5", title: "Palo Alto Firewall \u2014 Network Security", color: "#ea580c" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: S.lead, children: [
        f.totalSessions > 0 ? `${formatNumber(f.totalSessions)} sessions monitored, ${formatBytes(f.totalTraffic)} traffic.` : "No firewall telemetry data available.",
        " ",
        f.highRiskEvents,
        " high-risk events, ",
        f.blockedConnections,
        " blocked connections."
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.kpiRow, wrap: false, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Security Score", value: `${f.securityScore}/100`, sub: scoreStatus.label, color: scoreStatus.color }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Sessions", value: formatNumber(f.totalSessions), color: C.sky }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "High Risk", value: formatNumber(f.highRiskEvents), color: C.red }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Blocked", value: formatNumber(f.blockedConnections), color: C.amber }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Risky Users", value: formatNumber(f.criticalUsers), color: C.violet })
      ] }),
      f.riskTrend.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.block, wrap: false, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.cardTitle, children: "Risk / Session Trend" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(VLineChart, { data: f.riskTrend, width: 320, height: 140, labelKey: "date", valueKey: "sessions", stroke: C.red })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Risk Distribution", data: f.riskDistribution, colors: palette(f.riskDistribution) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Top Attacks", data: f.topAttacks, color: C.red, half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Top Attacker Sources", data: f.topAttackers, color: C.sky, half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Risky Users", data: f.riskyUsers, color: C.violet })
      ] })
    ] });
  }
  function WeeklyInsights({ weekly }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SectionDivider, { number: "6", title: "Weekly Insights \u2014 7-Day Comparison", color: "#7c3aed" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.block, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: S.cardTitle, children: "Period" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontSize: 9, color: C.sub }, children: [
          weekly.periodLabel,
          " \u2014 compared against the preceding 7 days."
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.kpiRow, wrap: false, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Threats This Week", value: formatNumber(weekly.kpi.threatsThis), sub: `last: ${weekly.kpi.threatsLast}`, color: C.red }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Harmony Events", value: formatNumber(weekly.kpi.harmonyThis), sub: `last: ${weekly.kpi.harmonyLast}`, color: C.violet }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Remediation Rate", value: `${weekly.kpi.remRateThis}%`, sub: `last: ${weekly.kpi.remRateLast}%`, color: C.green }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "New Agents", value: formatNumber(weekly.kpi.newAgentsThis), sub: `last: ${weekly.kpi.newAgentsLast}`, color: C.sky }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "New CVEs", value: formatNumber(weekly.kpi.newCvesThis), sub: `last: ${weekly.kpi.newCvesLast}`, color: C.amber }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(KpiTile, { label: "Critical CVEs", value: formatNumber(weekly.kpi.critCvesThis), color: C.red })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DonutBlock, { title: "Threat Recurrence (New vs Recurring)", data: weekly.newVsRecurring }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: S.row2, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Top Endpoints by Threats (this week)", data: weekly.topEndpoints.map((x) => ({ name: x.endpoint, value: x["This Week"] || 0 })), color: C.red, half: true }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(HBarBlock, { title: "Top Users by Threats (this week)", data: weekly.topUsers.map((x) => ({ name: x.user, value: x["This Week"] || 0 })), color: C.amber, half: true })
      ] })
    ] });
  }
  function ReportTemplate({ data }) {
    if (!data) return null;
    const weekly = computeWeeklyStats(data.harmonyEvents, data.s1Threats, data.s1Agents, data.s1Cves);
    const fw = buildFirewallSummary(data);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      import_renderer2.Document,
      {
        title: `CISO Security Report \u2014 ${data.orgName}`,
        author: "CISO Dashboard",
        creator: "CISO Dashboard",
        producer: "CISO Dashboard",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: "A3", orientation: "landscape", style: S.page, wrap: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PageFooter, { orgName: data.orgName, generatedAt: data.generatedAt }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CoverPage, { orgName: data.orgName, generatedAt: data.generatedAt })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: "A3", orientation: "landscape", style: S.page, wrap: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PageFooter, { orgName: data.orgName, generatedAt: data.generatedAt, sectionNumber: "1" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ExecutiveSummary, { d: data, weekly })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: "A3", orientation: "landscape", style: S.page, wrap: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PageFooter, { orgName: data.orgName, generatedAt: data.generatedAt, sectionNumber: "2" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CheckpointSection, { events: data.harmonyEvents, weekly, mttr: data.mttr })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: "A3", orientation: "landscape", style: S.page, wrap: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PageFooter, { orgName: data.orgName, generatedAt: data.generatedAt, sectionNumber: "3" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ThreatAnalytics, { threats: data.s1Threats, mttr: data.mttr })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: "A3", orientation: "landscape", style: S.page, wrap: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PageFooter, { orgName: data.orgName, generatedAt: data.generatedAt, sectionNumber: "4" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AgentAnalytics, { agents: data.s1Agents, generatedAt: data.generatedAt, removed: data.removedAgentsCount })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: "A3", orientation: "landscape", style: S.page, wrap: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PageFooter, { orgName: data.orgName, generatedAt: data.generatedAt, sectionNumber: "5" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AtRiskSection, { threats: data.s1Threats })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: "A3", orientation: "landscape", style: S.page, wrap: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PageFooter, { orgName: data.orgName, generatedAt: data.generatedAt, sectionNumber: "6" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CveSection, { cves: data.s1Cves })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: "A3", orientation: "landscape", style: S.page, wrap: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PageFooter, { orgName: data.orgName, generatedAt: data.generatedAt, sectionNumber: "7" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AppInsightsSection, { apps: data.s1AppAgent })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: "A3", orientation: "landscape", style: S.page, wrap: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PageFooter, { orgName: data.orgName, generatedAt: data.generatedAt, sectionNumber: "8" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ZohoSection, { tickets: data.zohoTickets, mttr: data.mttr })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: "A3", orientation: "landscape", style: S.page, wrap: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PageFooter, { orgName: data.orgName, generatedAt: data.generatedAt, sectionNumber: "9" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(FirewallSection, { fw })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: "A3", orientation: "landscape", style: S.page, wrap: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PageFooter, { orgName: data.orgName, generatedAt: data.generatedAt, sectionNumber: "10" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(WeeklyInsights, { weekly, d: data })
          ] })
        ]
      }
    );
  }
})();
