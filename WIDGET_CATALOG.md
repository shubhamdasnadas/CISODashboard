# 🛡️ CISO Dashboard — Comprehensive Page-Wise Widget Catalog & Logic Architecture Guide

This document provides a complete, pointwise architectural reference for every visual widget in the **SecureHub CISO Security Operations & Analytics Platform**, ordered page-by-page from **Dashboard** through **Ticketing**.

For every widget across all 8 core domains, this guide details:
1. **Widget Visual Layout / Mockup**: ASCII visual diagram showcasing structure, controls, metrics, badges, and layout dimensions.
2. **Widget Information**: Purpose, security scope, metrics calculated, tooltip interactions, multi-view modes, and executive value.
3. **Where the Logic Comes From**:
   - **Frontend**: Component file path, line numbers, React state/hooks, transformations, and charting libraries (`recharts`).
   - **Backend**: API route endpoint, controller/router files, database queries, and aggregation pipelines.
   - **Vendor Data Source & Sync**: Originating third-party APIs (SentinelOne, Checkpoint Harmony, NVD NIST, Palo Alto Networks, Hexnode MDM, Microsoft Graph, Zoho Desk), Redis caching, and background sync cron tasks.

---

## 📑 Table of Contents

- [1. Security Overview & Executive Dashboard (`/dashboard`)](#1-security-overview--executive-dashboard-dashboard)
  - [1.1 Executive CISO Health Posture KPI Strip](#11-executive-ciso-health-posture-kpi-strip)
  - [1.2 Email Security Telemetry & Targeted Mailboxes Section](#12-email-security-telemetry--targeted-mailboxes-section)
  - [1.3 SentinelOne Endpoint Health & EDR Posture Section](#13-sentinelone-endpoint-health--edr-posture-section)
  - [1.4 Cyber Hygiene, MTTR & Framework Scores](#14-cyber-hygiene-mttr--framework-scores)
  - [1.5 Palo Alto Firewall Bandwidth & Threat Traffic Graphs](#15-palo-alto-firewall-bandwidth--threat-traffic-graphs)
  - [1.6 Hexnode Identity & MDM Fleet Compliance Section](#16-hexnode-identity--mdm-fleet-compliance-section)
  - [1.7 Zoho Service Desk & Operations Matrix Section](#17-zoho-service-desk--operations-matrix-section)
  - [1.8 Threat Intelligence Feeds & Active Tools Bubble Chart](#18-threat-intelligence-feeds--active-tools-bubble-chart)
- [2. Endpoint Detection & Response (EDR / SentinelOne) (`/security`)](#2-endpoint-detection--response-edr--sentinelone-security)
  - [2.1 EDR Incident KPI Summary Cards](#21-edr-incident-kpi-summary-cards)
  - [2.2 Threats by Severity (MultiView Chart)](#22-threats-by-severity-multiview-chart)
  - [2.3 Threat Mitigation & Quarantine Status Breakdown](#23-threat-mitigation--quarantine-status-breakdown)
  - [2.4 Top Users by Threat Count (Compact Sized)](#24-top-users-by-threat-count-compact-sized)
  - [2.5 Threat Classification & Malware Types](#25-threat-classification--malware-types)
  - [2.6 Threats Over Time & Velocity Trend](#26-threats-over-time--velocity-trend)
  - [2.7 Application CVE Vulnerabilities & Top Impacted Software](#27-application-cve-vulnerabilities--top-impacted-software)
  - [2.8 Agent Fleet Inventory & Risky Endpoints Matrix](#28-agent-fleet-inventory--risky-endpoints-matrix)
  - [2.9 Threat Incident Log Table & Drill-Down Modal](#29-threat-incident-log-table--drill-down-modal)
- [3. Email Security (Checkpoint Harmony) (`/checkpoint`)](#3-email-security-checkpoint-harmony-checkpoint)
  - [3.1 Email Protection KPI Summary Cards](#31-email-protection-kpi-summary-cards)
  - [3.2 Severity Distribution Chart](#32-severity-distribution-chart)
  - [3.3 Event State Breakdown Chart](#33-event-state-breakdown-chart)
  - [3.4 Confidence Indicator Breakdown](#34-confidence-indicator-breakdown)
  - [3.5 Top Sender Domains](#35-top-sender-domains)
  - [3.6 Top Individual Senders (Full Y-Axis Rendered)](#36-top-individual-senders-full-y-axis-rendered)
  - [3.7 Most Targeted Mailboxes](#37-most-targeted-mailboxes)
  - [3.8 SaaS Platform Distribution](#38-saas-platform-distribution)
  - [3.9 Last 7 Days Activity Trend & Confidence Matrix](#39-last-7-days-activity-trend--confidence-matrix)
  - [3.10 Checkpoint Harmony Incident Log Table](#310-checkpoint-harmony-incident-log-table)
- [4. National Vulnerability Database (NVD CVEs) (`/nvd`)](#4-national-vulnerability-database-nvd-cves-nvd)
  - [4.1 NVD Overview & KEV Exploit KPI Cards](#41-nvd-overview--kev-exploit-kpi-cards)
  - [4.2 CVE Severity Distribution](#42-cve-severity-distribution)
  - [4.3 CVSS Base Score Distribution Range](#43-cvss-base-score-distribution-range)
  - [4.4 Vulnerability Analysis Status Breakdown](#44-vulnerability-analysis-status-breakdown)
  - [4.5 Top Attack & Exploit Vectors](#45-top-attack--exploit-vectors)
  - [4.6 Common Weakness Enumeration (CWE) Taxonomy](#46-common-weakness-enumeration-cwe-taxonomy)
  - [4.7 Top Discovery Authorities (CNA Sources)](#47-top-discovery-authorities-cna-sources)
  - [4.8 Vulnerability Aging Distribution](#48-vulnerability-aging-distribution)
  - [4.9 NVD CVE Intelligence Live Feed & Search Table](#49-nvd-cve-intelligence-live-feed--search-table)
- [5. Firewall & Network Security (Palo Alto) (`/paloalto`)](#5-firewall--network-security-palo-alto-paloalto)
  - [5.1 Network Perimeter KPI Summary Cards](#51-network-perimeter-kpi-summary-cards)
  - [5.2 Inbound & Outbound Bandwidth Velocity Trend](#52-inbound--outbound-bandwidth-velocity-trend)
  - [5.3 Threat & Attack Signature Velocity Trend](#53-threat--attack-signature-velocity-trend)
  - [5.4 Risk Score Categorization (Levels 1 - 5)](#54-risk-score-categorization-levels-1---5)
  - [5.5 Top Attacker Sources & Targeted Destinations](#55-top-attacker-sources--targeted-destinations)
  - [5.6 Top Denied Destinations (C2, Phishing & Botnets)](#56-top-denied-destinations-c2-phishing--botnets)
  - [5.7 Top Denied Applications & Blocked Protocols](#57-top-denied-applications--blocked-protocols)
  - [5.8 Top Blocked Websites & URL Categories](#58-top-blocked-websites--url-categories)
  - [5.9 Destination Countries & Geo-Traffic Distribution](#59-destination-countries--geo-traffic-distribution)
  - [5.10 Risky Users & Top Attack Signatures](#510-risky-users--top-attack-signatures)
  - [5.11 Palo Alto Interactive Report Table & Live Log Viewer](#511-palo-alto-interactive-report-table--live-log-viewer)
- [6. Mobile Device Management (MDM / Hexnode) (`/mdm`)](#6-mobile-device-management-mdm--hexnode-mdm)
  - [6.1 MDM Fleet Compliance & Inventory KPI Cards](#61-mdm-fleet-compliance--inventory-kpi-cards)
  - [6.2 OS & Platform Distribution (ImprovedDonut Split Legends)](#62-os--platform-distribution-improveddonut-split-legends)
  - [6.3 Compliance Status & Security Posture Breakdown](#63-compliance-status--security-posture-breakdown)
  - [6.4 Device Type Breakdown](#64-device-type-breakdown)
  - [6.5 Managed Application Platform Breakdown](#65-managed-application-platform-breakdown)
  - [6.6 Flagged Applications & Risky Device Apps](#66-flagged-applications--risky-device-apps)
  - [6.7 Hexnode Managed Fleet Inventory Table & Detail Modal](#67-hexnode-managed-fleet-inventory-table--detail-modal)
- [7. Microsoft 365 Cloud Security (`/microsoft365`)](#7-microsoft-365-cloud-security-microsoft365)
  - [7.1 Cloud Identity & Posture KPI Cards](#71-cloud-identity--posture-kpi-cards)
  - [7.2 Microsoft Secure Score Posture Ring](#72-microsoft-secure-score-posture-ring)
  - [7.3 Sign-In Activity & Authentication Trend (Success vs Failure)](#73-sign-in-activity--authentication-trend-success-vs-failure)
  - [7.4 Identity Risk Detections by Event Type](#74-identity-risk-detections-by-event-type)
  - [7.5 Defender Security Alerts Severity Distribution](#75-defender-security-alerts-severity-distribution)
  - [7.6 Intune Device Compliance State Breakdown](#76-intune-device-compliance-state-breakdown)
  - [7.7 Risky Users & Risk Detections Table](#77-risky-users--risk-detections-table)
  - [7.8 Microsoft 365 Service Health & Advisory Board](#78-microsoft-365-service-health--advisory-board)
- [8. Service Desk & Ticketing Operations (Zoho Desk) (`/zoho`)](#8-service-desk--ticketing-operations-zoho-desk-zoho)
  - [8.1 Service Desk Incident KPI Summary Cards](#81-service-desk-incident-kpi-summary-cards)
  - [8.2 MTTR & SLA Resolution Performance Cards](#82-mttr--sla-resolution-performance-cards)
  - [8.3 Top Performing Support Engineers (Leaderboard)](#83-top-performing-support-engineers-leaderboard)
  - [8.4 Incident Resolution Pipeline Funnel](#84-incident-resolution-pipeline-funnel)
  - [8.5 Ticket Density & Category Volcano Graph](#85-ticket-density--category-volcano-graph)
  - [8.6 Support Team Capacity & Workload Circle](#86-support-team-capacity--workload-circle)
  - [8.7 Hourly Incident Inflow Histogram](#87-hourly-incident-inflow-histogram)
  - [8.8 Department & Status Ticket Matrix](#88-department--status-ticket-matrix)
  - [8.9 Zoho Incident Tickets Inventory Table](#89-zoho-incident-tickets-inventory-table)

---

# 1. Security Overview & Executive Dashboard (`/dashboard`)

The **Dashboard** is the executive mission-control center of the platform. It unifies telemetry from all connected security vendors into a customizable, drag-and-drop grid layout with real-time Redis aggregate caching and deep-link drill-downs.

---

### 1.1 Executive CISO Health Posture KPI Strip

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────┐ ┌────────────────────────┐ ┌────────────────────────┐ ┌────────────────────────┐ ┌────────────────────────┐ │
│ │ 🛡️ CISO HEALTH SCORE   │ │ 💻 ENDPOINT FLEET      │ │ ✉️ EMAIL SECURITY      │ │ ⚠️ VULNERABILITY EXPOS │ │ 🎫 SERVICE DESK SLA    │ │
│ │ 94 / 100               │ │ 98% Health (142/145)   │ │ 99.4% Remediated       │ │ 4 Crit / 18 High       │ │ 96.2% Resolved         │ │
│ │ [████████████████░░]   │ │ [███████████████████░] │ │ [████████████████████] │ │ [████░░░░░░░░░░░░░░░░] │ │ [██████████████████░░] │ │
│ │ Status: Excellent      │ │ S1 Agents Online       │ │ Checkpoint Harmony     │ │ NVD & App CVEs         │ │ Zoho Desk Avg 2.1h     │ │
│ └────────────────────────┘ └────────────────────────┘ └────────────────────────┘ └────────────────────────┘ └────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Provides an instantaneous, single-pane-of-glass executive score and high-level health percentages across all domains.
- **Metrics Calculated**:
  - **CISO Composite Score**: Weighted composite calculation: `(threatMitigationRate * 0.3) + (agentHealthRate * 0.2) + (emailRemediationRate * 0.2) + (mdmComplianceRate * 0.15) + (ticketResolutionRate * 0.15)`.
  - **Endpoint Fleet**: Active vs total SentinelOne agents + active threat mitigation rate.
  - **Email Security**: Total inbound phishing/malware events vs remediated rate.
  - **Vulnerabilities**: Total critical & high CVSS application CVEs pending remediation.
  - **Service Desk**: Zoho ticket resolution velocity and SLA compliance rate.
- **Interactions**: Clicking any KPI card navigates directly to that domain's detail page (`/security`, `/checkpoint`, `/nvd`, `/zoho`, `/mdm`).

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/dashboard/ExecutiveKpiStrip.jsx` (Lines 1–175)
  - Evaluated inside `frontend/src/pages/Dashboard.jsx` (Lines 897–904).
  - Uses `useMemo` to aggregate raw datasets (`s1Threats`, `s1Agents`, `cpEvents`, `appCves`, `tickets`, `mdmDevices`).
- **Backend Route & Controller**:
  - `GET /api/cache/dashboard-aggregate` in `backend/routes/cache.js`.
  - Aggregates data from Redis key `dashboard:aggregate:<org_id>` or executes fallback queries across `s1_threats`, `s1_agents`, `cp_events`, `zoho_tickets`, and `mdm_devices`.
- **Vendor Data Origin**: Combined ingestion from SentinelOne, Checkpoint Harmony, NVD NIST, Hexnode MDM, and Zoho Desk.

---

### 1.2 Email Security Telemetry & Targeted Mailboxes Section

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ✉️ CHECKPOINT HARMONY EMAIL SECURITY                                                        [Date Filter] [Search] [View: MultiView ▼] │
│ ├─────────────────────────────────────────┬──────────────────────────────────────────┬───────────────────────────────────────────────┤ │
│ │ Threat Velocity Over Time               │ Top Targeted Mailboxes                   │ Security Severity Breakdown                   │ │
│ │ (Area / Line Chart)                     │ (Horizontal Bar Chart)                   │ (Interactive Donut Chart)                     │ │
│ │   ▲                                     │   ceo@domain.com  ████████████ 42        │   ■ Critical: 14%                             │ │
│ │   │    /\    /\                         │   cfo@domain.com  ████████ 28            │   ■ High:     38%                             │ │
│ │   │   /  \  /  \  /\                    │   hr@domain.com   ██████ 19              │   ■ Medium:   32%                             │ │
│ │   └──/────\/────\/──►                   │   it@domain.com   ████ 11                │   ■ Low:      16%                             │ │
│ └─────────────────────────────────────────┴──────────────────────────────────────────┴───────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Tracks email threat volume, identifies high-risk internal VIP targets, and evaluates phishing/malware severity distributions.
- **Metrics Displayed**:
  - Daily email security incident trend.
  - Top 10 internal recipient mailboxes parsed from event descriptions.
  - Event distribution across Critical (4), High (3), Medium (2), and Low (1) severities.
  - Remediation status (Quarantined vs Deleted vs Pending).
- **Controls**: `DateRangeMini` (date range selector), `WidgetSearch` (sender/recipient filter), `ChartViewDropdown` (Bar, Line, Area, Donut, Comparison).

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/dashboard/EmailSecurityWidgets.jsx` (Lines 1–280)
  - Invoked inside `frontend/src/pages/Dashboard.jsx` (Lines 1203–1211).
  - Uses Recharts `ResponsiveContainer`, `BarChart`, `AreaChart`, `PieChart`.
- **Backend Route & Controller**:
  - `GET /api/harmony/events` or aggregate payload in `backend/routes/harmony.js` & `backend/routes/cache.js`.
  - Database table: `cp_events` filtered by `org_id` and sorted by `event_created DESC`.
- **Vendor Data Origin**: Checkpoint Harmony Email & Collaboration API via `backend/services/harmony.js`.

---

### 1.3 SentinelOne Endpoint Health & EDR Posture Section

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 💻 SENTINELONE ENDPOINT & EDR                                                         [Sync Button] [Date Filter] [View: MultiView ▼]  │
│ ├─────────────────────────────────────────┬──────────────────────────────────────────┬───────────────────────────────────────────────┤ │
│ │ Threats by Severity                     │ Mitigation Status Breakdown              │ Top Impacted Users                            │ │
│ │ (MultiView: Bar / Donut / Line)         │ (Stacked Donut Chart)                    │ (Horizontal Bar Chart)                        │ │
│ │   Critical ████████ 12                  │   ■ Mitigated:   78%                     │   john.doe   ████████ 9                       │ │
│ │   High     ██████████████ 24            │   ■ Blocked:     16%                     │   sarah.c    ██████ 6                         │ │
│ │   Medium   ██████ 8                     │   ■ Pending:      6%                     │   admin_ops  ████ 4                           │ │
│ │   Low      ██ 2                         │                                          │   dev_user   ██ 2                             │ │
│ └─────────────────────────────────────────┴──────────────────────────────────────────┴───────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Displays endpoint fleet protection metrics, active infections, automated mitigation outcomes, and user threat hotspots.
- **Metrics Displayed**:
  - Threats grouped by engine type (DFI, Reputation, On-Write, Behavioral AI).
  - Threat mitigation rate (% of threats quarantined/mitigated vs active).
  - Top 10 usernames associated with detected malware files.
- **Controls**: S1 live sync trigger, date range filter, chart view selector.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/dashboard/EndpointPostureWidgets.jsx` & `frontend/src/pages/dashboard/S1ConfigWidget.jsx`
  - Rendered in `frontend/src/pages/Dashboard.jsx` (Lines 1338–1350).
- **Backend Route & Controller**:
  - `GET /api/sentinelone/threats` & `GET /api/sentinelone/agents` in `backend/routes/sentinelone.js`.
  - Tables: `s1_threats`, `s1_agents`, `s1_apps_cve`.
- **Vendor Data Origin**: SentinelOne 2.1 REST API (`/web/api/v2.1/threats`, `/web/api/v2.1/agents`).

---

### 1.4 Cyber Hygiene, MTTR & Framework Scores

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ CYBER HYGIENE & BENCHMARK POSTURE                                                                                                    │
│ ├─────────────────────────────────────────┬──────────────────────────────────────────┬───────────────────────────────────────────────┤ │
│ │ Common MTTR Overview                    │ S1 Threat MTTR                           │ Framework Compliance Score                    │ │
│ │ Avg Detection:  4.2 mins                │ Mean Time To Mitigate: 1.8 mins          │ NIST CSF:     92%  [██████████████████░]      │ │
│ │ Avg Response:   18.5 mins               │ Automated Remediations: 94.2%            │ CIS Controls: 88%  [████████████████░░░]      │ │
│ │ Avg Resolution: 1.4 hours               │ Analyst Triage Time:   12.0 mins         │ ISO 27001:    95%  [███████████████████]      │ │
│ └─────────────────────────────────────────┴──────────────────────────────────────────┴───────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Measures Mean Time to Detect (MTTD), Mean Time to Respond (MTTR), and regulatory framework posture (NIST, CIS, ISO).
- **Metrics Displayed**:
  - Cross-domain MTTR calculations for EDR, Email Security, and Ticketing.
  - Framework readiness score based on resolved incidents and hardened endpoint configurations.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/CyberHygen/AllCommonmttr.jsx` & `frontend/src/pages/dashboard/FrameworkScore.jsx`.
- **Backend Route**: `GET /api/compliance-health-scores` & `backend/routes/compliance_health_scores.js`.

---

### 1.5 Palo Alto Firewall Bandwidth & Threat Traffic Graphs

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🌐 NETWORK PERIMETER & FIREWALL TELEMETRY                                                 [Report Selector ▼] [View: MultiView ▼]      │
│ ├──────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────┤ │
│ │ Bandwidth Velocity Trend                             │ Top Application Traffic                                                     │ │
│ │ (Composed Line & Area Chart)                         │ (Horizontal Bar Chart)                                                      │ │
│ │   GB/s                                               │   SSL / HTTPS       ████████████████████ 4.2 TB                             │ │
│ │    ▲        /──\                                     │   Web Browsing      ████████████ 2.1 TB                                     │ │
│ │    │  /\   /    \  /\                                │   MS Teams          ████████ 1.4 TB                                         │ │
│ │    └──/─\-─/──────\─/──►                             │   DNS / UDP         ████ 450 GB                                             │ │
│ └──────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Real-time visibility into perimeter traffic volume, protocol distribution, and blocked intrusion attempts.
- **Metrics Displayed**: Ingress/egress throughput (Mbps/GB), session counts, top denied applications, blocked external IP addresses.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/dashboard/NetworkSecurityWidgets.jsx` & `frontend/src/pages/dashboard/FwGraphWidget.jsx`.
- **Backend Route**: `GET /api/firewall/reports` & `GET /api/firewall/graph` in `backend/routes/firewall.js`.
- **Vendor Data Origin**: Palo Alto PAN-OS XML API / Panorama reporting engine.

---

### 1.6 Hexnode Identity & MDM Fleet Compliance Section

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📱 MOBILE DEVICE MANAGEMENT (HEXNODE)                                                                [Date Filter] [Search]            │
│ ├─────────────────────────────────────────┬──────────────────────────────────────────┬───────────────────────────────────────────────┤ │
│ │ Fleet Compliance Rate                   │ OS Platform Distribution                 │ Device Ownership Breakdown                    │ │
│ │   Compliant:     138 (95.2%)            │   ■ Windows:  54%                        │   ■ Corporate Owned:  82%                     │ │
│ │   Non-Compliant:   7 (4.8%)             │   ■ macOS:    26%                        │   ■ BYOD:             18%                     │ │
│ │   [███████████████████░]                │   ■ iOS:      12%                        │                                               │ │
│ │                                         │   ■ Android:   8%                        │                                               │ │
│ └─────────────────────────────────────────┴──────────────────────────────────────────┴───────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Enforces mobile and endpoint device compliance, encryption, and jailbreak detection across the fleet.
- **Metrics Displayed**: Total managed devices, compliance status, platform breakdown, inactive/lost device count.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/dashboard/IdentityMdmWidgets.jsx`.
- **Backend Route**: `GET /api/hexnode/db/devices` in `backend/routes/hexnode.js`.
- **Vendor Data Origin**: Hexnode UEM REST API (`/api/v1/devices`).

---

### 1.7 Zoho Service Desk & Operations Matrix Section

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🎫 SERVICE DESK & INCIDENT OPERATIONS (ZOHO)                                              [Auto-Polling: 20s] [Search]                 │
│ ├─────────────────────────────────────────┬──────────────────────────────────────────┬───────────────────────────────────────────────┤ │
│ │ Ticket SLA Status                       │ Tickets by Priority                      │ Department Status Matrix                      │ │
│ │   Total Tickets:   248                  │   Critical: ████ 8                       │   Security:       12 Open / 48 Closed         │ │
│ │   Resolved:        232 (93.5%)          │   High:     ████████ 19                  │   IT Support:     24 Open / 112 Closed        │ │
│ │   Open / Pending:   16 (6.5%)           │   Medium:   ██████████████ 42            │   Infrastructure:  6 Open / 36 Closed         │ │
│ │                                         │   Low:      ████████████████████ 179     │                                               │ │
│ └─────────────────────────────────────────┴──────────────────────────────────────────┴───────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Tracks operational ticket turnaround, SLA violations, priority queues, and department workloads.
- **Metrics Displayed**: Open vs resolved tickets, SLA compliance rate, priority breakdown, department workload matrix.
- **Real-Time Feature**: Polls every 20 seconds automatically without full page reload.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/dashboard/ZohoServiceDeskWidgets.jsx` & `frontend/src/pages/zoho/ZohoTicketMatrix.jsx`.
- **Backend Route**: `GET /api/zoho/tickets-db` in `backend/routes/zoho.js`.
- **Vendor Data Origin**: Zoho Desk REST API (`/api/v1/tickets`).

---

### 1.8 Threat Intelligence Feeds & Active Tools Bubble Chart

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🌐 THREAT INTEL & INTEGRATED TOOLS CATALOG                                                                                             │
│ ├──────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────┤ │
│ │ Real-Time Cybersecurity News & Advisories            │ Active Security Ecosystem (Orbital Bubble Chart)                            │ │
│ │   • CISA Advisory: Active Exploitation of CVE-2024-X │             ( SentinelOne: 142 )                                            │ │
│ │   • Ransomware Variant Spreading via Malicious PDF   │     ( Harmony: 890 )      ( Palo Alto: 12.4k )                              │ │
│ │   • Zero-Day Vulnerability Discovered in Chromium    │             ( Hexnode: 145 )    ( Zoho: 248 )                               │ │
│ │   • Microsoft Security Advisory: Exchange Patch      │                     ( M365: 32 )                                            │ │
│ └──────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Displays live threat advisories and visualizes the relative telemetry volume across all connected tool providers.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/dashboard/ThreatIntelWidgets.jsx` & `frontend/src/pages/dashboard/AllTools.jsx`.
- **Backend Route**: `GET /api/news` in `backend/routes/news.js`.

---

# 2. Endpoint Detection & Response (EDR / SentinelOne) (`/security`)

The EDR module provides in-depth endpoint threat analysis, application vulnerability discovery, and agent fleet health monitoring.

---

### 2.1 EDR Incident KPI Summary Cards

#### 🖼️ Visual Layout Mockup
```text
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ TOTAL THREATS   │ │ ACTIVE THREATS  │ │ MITIGATED       │ │ BLOCKED         │ │ SUSPICIOUS      │
│ 142             │ │ 4               │ │ 118             │ │ 16              │ │ 4               │
│ All Detected    │ │ Requires Action │ │ Quarantined/Fix │ │ Policy Dropped  │ │ Under Analysis  │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Provides immediate executive totals for total detected threats, active incidents requiring triage, and automated mitigation rates.
- **Metrics**: Count of total threats, active threats, mitigated, blocked, and suspicious.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/security/Threats.jsx` (Lines 150–220).
- **Backend Route**: `GET /api/sentinelone/threats` in `backend/routes/sentinelone.js`.
- **Vendor Source**: SentinelOne API (`/web/api/v2.1/threats`).

---

### 2.2 Threats by Severity (MultiView Chart)

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Threats by Severity                                                    [View: Donut ▼] [30d ▼] │
│ ├─────────────────────────────────────────┬──────────────────────────────────────────────────┤ │
│ │ (Interactive Recharts Donut / Bar)      │ Legend & Metrics                                 │ │
│ │                                         │   ■ Critical: 18 (12.7%) - #ef4444               │ │
│ │                /────\                   │   ■ High:     48 (33.8%) - #f97316               │ │
│ │               |  48  |                  │   ■ Medium:   62 (43.7%) - #f59e0b               │ │
│ │                \────/                   │   ■ Low:      14 (9.8%)  - #22c55e               │ │
│ └─────────────────────────────────────────┴──────────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Groups endpoint threats by severity level to determine attack impact and SOC urgency.
- **Multi-View Modes**: Donut, Bar, Line, Area, Comparison.
- **Drill-Down**: Clicking a slice filters the threat inventory table below.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/security/Threats.jsx` & `frontend/src/pages/security/widgetViews.jsx`.
- **Backend Route**: `GET /api/sentinelone/threats`.

---

### 2.3 Threat Mitigation & Quarantine Status Breakdown

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Mitigation Status                                                      [View: Bar ▼]   [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ Mitigated (Quarantined)   ██████████████████████████████████ 118                           │ │
│ │ Blocked (Pre-execution)   ████████ 16                                                      │ │
│ │ Remediated (Rolled Back)  ████ 4                                                           │ │
│ │ Unresolved / Pending      ██ 4                                                             │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Analyzes automated kill-chain actions executed by the SentinelOne agent.
- **Metrics**: Counts of Mitigated, Blocked, Remediated, and Pending threats.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/security/Threats.jsx`.
- **Backend Route**: `GET /api/sentinelone/threats`.

---

### 2.4 Top Users by Threat Count (Compact Sized)

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Users by Threat Count                                  [Height: 280px] [View: Bar ▼] [30d] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ john.doe@corp.internal       ████████████████ 14                                           │ │
│ │ administrator                ██████████ 9                                                  │ │
│ │ dev.user@corp.internal       ██████ 6                                                      │ │
│ │ finance_dept                 ████ 4                                                        │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Identifies high-risk employees or accounts repeatedly compromised or targeted.
- **Optimization**: Sized to a compact `height={280}` with responsive dropdowns.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/security/Threats.jsx` (Lines 410–445).

---

### 2.5 Threat Classification & Malware Types

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Threat Classification                                                  [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Trojan: 45%   ■ Ransomware: 15%   ■ PUP/Adware: 25%   ■ Exploit: 10%   ■ Spyware: 5%     │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Categorizes malware families and payload behaviors.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/security/Threats.jsx`.

---

### 2.6 Threats Over Time & Velocity Trend

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Threat Velocity (30-Day Time Series)                                           [View: Area ▼]  │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │  Count                                                                                     │ │
│ │   ▲            /\                                                                          │ │
│ │   │     /\    /  \        /\                                                               │ │
│ │   └───/───\──/────\──────/──\────► Date                                                    │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Visualizes attack waves and outbreak velocity over a 7, 14, 30, or 90-day window.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `CategoryTimeSeriesChart` inside `frontend/src/pages/security/Threats.jsx`.

---

### 2.7 Application CVE Vulnerabilities & Top Impacted Software

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Application CVEs (SentinelOne Vulnerability Discovery)                                         │
│ ├─────────────────────────────────────────┬──────────────────────────────────────────────────┤ │
│ │ Top Impacted Applications               │ CVE Severity Distribution                        │ │
│ │   Google Chrome     ████████████ 45     │   ■ Critical: 8                                  │ │
│ │   Zoom Client       ████████ 28         │   ■ High:     34                                 │ │
│ │   Adobe Acrobat     ██████ 19           │   ■ Medium:   52                                 │ │
│ │   Oracle Java JRE   ████ 12             │   ■ Low:      18                                 │ │
└─────────────────────────────────────────┴──────────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Audits installed software packages across the fleet for published CVE vulnerabilities.
- **Metrics**: Application names, version numbers, CVSS base scores, CVE IDs, patch links.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/security/S1Cve.jsx` (Lines 1–350).
- **Backend Route**: `GET /api/sentinelone/application-cve` in `backend/routes/sentinelone.js`.
- **Vendor Source**: SentinelOne Application Inventory API.

---

### 2.8 Agent Fleet Inventory & Risky Endpoints Matrix

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Fleet Agent Health & Risky Endpoints                                                           │
│ ├─────────────────────────────────────────┬──────────────────────────────────────────────────┤ │
│ │ OS Distribution                         │ Agent Version Compliance                         │ │
│ │   Windows 11 / Server  ██████████ 62%   │   v23.2 (Latest):  ████████████ 88%              │ │
│ │   macOS Sonoma/Ventura ████ 24%         │   v22.4 (Outdated): ██ 12%                       │ │
│ │   Linux (Ubuntu/RHEL)  ██ 14%           │                                                  │ │
└─────────────────────────────────────────┴──────────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Audits fleet agent connection status, out-of-date agents, and high-risk endpoints.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/security/Agent.jsx`, `S1Agent.jsx`, `RiskyEndpoint.jsx`.
- **Backend Route**: `GET /api/sentinelone/agents`.

---

### 2.9 Threat Incident Log Table & Drill-Down Modal

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Incident Log Table                                         [Search Input] [Export CSV] [Filter]│
│ ├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤ │
│ │ THREAT ID    │ FILE NAME    │ USERNAME     │ SEVERITY     │ STATUS       │ DETECTED AT     │ │
│ ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────────────┤ │
│ │ #TH-8902     │ payload.exe  │ john.doe     │ Critical     │ Mitigated    │ 2026-09-11 14:22│ │
│ │ #TH-8901     │ invoice.pdf  │ sarah.c      │ High         │ Blocked      │ 2026-09-11 12:05│ │
└────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Full searchable and filterable incident table with modal drill-downs showing SHA256 hashes, process trees, and MITRE ATT&CK technique IDs.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/security/Threats.jsx` & `DetailView.jsx`.

---

# 3. Email Security (Checkpoint Harmony) (`/checkpoint`)

Provides full-spectrum email threat intelligence, phishing attack analytics, and inbound email inspection.

---

### 3.1 Email Protection KPI Summary Cards

#### 🖼️ Visual Layout Mockup
```text
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ TOTAL EVENTS    │ │ PHISHING THREATS│ │ MALWARE DETECTED│ │ SPAM / SPOOF    │ │ REMEDIATION RATE│
│ 890             │ │ 342             │ │ 128             │ │ 380             │ │ 99.4%           │
│ All Scanned     │ │ Impersonation   │ │ Attachments     │ │ Domain Spoofing │ │ Auto-Resolved   │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Key email telemetry summary highlighting phishing volumes and remediation success.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/checkpoint/CheckpointDashboard.jsx` (Lines 340–380).
- **Backend Route**: `GET /api/harmony/events` in `backend/routes/harmony.js`.

---

### 3.2 Severity Distribution Chart

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Severity Distribution                                                  [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Critical (Sev 4): 12%  ■ High (Sev 3): 38%  ■ Medium (Sev 2): 34%  ■ Low (Sev 1): 16%    │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Groups email events into 5 numerical severity tiers (0=Info, 1=Low, 2=Medium, 3=High, 4=Critical).

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `SeverityDistribution` in `frontend/src/pages/checkpoint/CheckpointDashboard.jsx`.

---

### 3.3 Event State Breakdown Chart

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Event State Breakdown                                                  [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Remediated: 82%   ■ Quarantined: 12%   ■ User Alerted: 4%   ■ Pending: 2%                │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Audits post-detection email workflow states.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `StateBreakdown` in `frontend/src/pages/checkpoint/CheckpointDashboard.jsx`.

---

### 3.4 Confidence Indicator Breakdown

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Confidence Indicator                                                   [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Malicious: 48% (Red)   ■ Suspicious: 36% (Orange)   ■ Detected: 12%   ■ Unknown: 4%      │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Displays detection engine confidence (Malicious, Suspicious, Detected, Unknown).

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `ConfidenceIndicator` in `frontend/src/pages/checkpoint/CheckpointDashboard.jsx`.

---

### 3.5 Top Sender Domains

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Sender Domains                                                       [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ mail-spoof.xyz               ████████████████ 48                                           │ │
│ │ phishing-portal.net          ██████████ 29                                                 │ │
│ │ external-relay.org           ██████ 18                                                     │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Identifies the top external domains generating malicious email traffic.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `SenderDomains` in `frontend/src/pages/checkpoint/CheckpointDashboard.jsx`.

---

### 3.6 Top Individual Senders (Full Y-Axis Rendered)

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Individual Senders (Full Label Rendering)                            [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ trupti.j@techsecdigital.com           ████████████████ 52                                  │ │
│ │ security-alert@external-verify.com    ██████████ 31                                        │ │
│ │ invoice-dept@spoofed-vendor.com       ██████ 19                                            │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Renders the specific email addresses of top attackers.
- **Y-Axis Optimization**: Dynamic width calculation (`Math.max(110, Math.min(260, Math.ceil(maxLen * 7.2) + 16))`) and `interval={0}` prevent long email addresses from clipping.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `IndividualSenders` in `frontend/src/pages/checkpoint/CheckpointDashboard.jsx` & `widgetViews.jsx`.

---

### 3.7 Most Targeted Mailboxes

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Most Targeted Mailboxes                                                  [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ceo@techsecdigital.com                ████████████████ 42                                  │ │
│ │ finance@techsecdigital.com            ██████████ 28                                        │ │
│ │ hr@techsecdigital.com                 ██████ 19                                            │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Identifies VIPs and high-value targets within the organization.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `TargetedMailboxes` in `frontend/src/pages/checkpoint/CheckpointDashboard.jsx`.

---

### 3.8 SaaS Platform Distribution

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SaaS Platform Distribution                                             [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Microsoft 365 (Exchange): 84%        ■ Google Workspace: 16%                             │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Compares scanned traffic across cloud email services.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `SaasPlatformDistribution` in `frontend/src/pages/checkpoint/CheckpointDashboard.jsx`.

---

### 3.9 Last 7 Days Activity Trend & Confidence Matrix

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 7-Day Inbound Threat Velocity & 2D Confidence-Severity Heatmap                                 │
│ ├─────────────────────────────────────────┬──────────────────────────────────────────────────┤ │
│ │ 7-Day Bar Histogram                    │ 2D Matrix Grid (Severity vs Confidence)          │ │
│ │   Mon Tue Wed Thu Fri Sat Sun           │                Malicious  Suspicious  Detected   │ │
│ │    █   █   █   █   █   ▄   ▄            │   Critical (4)    12          4          0       │ │
│ │                                         │   High     (3)    28         14          2       │ │
└─────────────────────────────────────────┴──────────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Correlates confidence levels against severity classifications in a cross-tabulated heatmap.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `LastSevenDays` in `frontend/src/pages/checkpoint/CheckpointDashboard.jsx`.

---

### 3.10 Checkpoint Harmony Incident Log Table

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Harmony Incident Log Table                                              [Search] [Filter State]│
│ ├─────────────┬─────────────┬─────────────┬─────────────┬──────────────┬─────────────────────┤ │
│ │ EVENT ID    │ TYPE        │ SENDER      │ RECIPIENT   │ CONFIDENCE   │ ACTIONS TAKEN       │ │
│ ├─────────────┼─────────────┼─────────────┼─────────────┼──────────────┼─────────────────────┤ │
│ │ #CP-4091    │ Phishing    │ bad@xyz.com │ ceo@org.com │ Malicious    │ Quarantined         │ │
│ │ #CP-4090    │ Malware PDF │ bill@spoof  │ hr@org.com  │ Suspicious   │ Link Neutralized    │ │
└─────────────┴─────────────┴─────────────┴─────────────┴──────────────┴─────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Complete tabular event log with drill-downs to inspect raw headers, quarantine status, and remediation buttons.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `CheckpointDashboard.jsx` & `CheckpointPage.jsx`.

---

# 4. National Vulnerability Database (NVD CVEs) (`/nvd`)

The NVD module tracks global vulnerability publications, CVSS score distributions, Known Exploited Vulnerabilities (KEV), and affected Common Platform Enumerations (CPEs).

---

### 4.1 NVD Overview & KEV Exploit KPI Cards

#### 🖼️ Visual Layout Mockup
```text
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ TOTAL CVES      │ │ CRITICAL (9.0+) │ │ HIGH (7.0-8.9)  │ │ KEV EXPLOITED   │ │ ANALYZED CVES   │
│ 24,810          │ │ 3,420           │ │ 8,910           │ │ 1,120           │ │ 22,400          │
│ In Database     │ │ CVSS v3.1       │ │ CVSS v3.1       │ │ Active Weapon   │ │ NIST Validated  │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### 📋 Widget Information
- **Purpose**: High-level exposure metrics for all CVEs tracked in NIST NVD with active KEV flags.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Nvd.jsx` (Lines 150–220).
- **Backend Route**: `GET /api/nvd/cves` & `GET /api/updated-nvd/cves` in `backend/routes/nvd.js`.
- **Vendor Source**: NIST NVD 2.0 REST API (`https://services.nvd.nist.gov/rest/json/cves/2.0`).

---

### 4.2 CVE Severity Distribution

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CVE Severity Distribution                                              [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Critical (Purple): 14%   ■ High (Red): 36%   ■ Medium (Amber): 40%   ■ Low (Blue): 10%   │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Categorizes vulnerabilities by qualitative severity ratings.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Nvd.jsx`.

---

### 4.3 CVSS Base Score Distribution Range

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CVSS Base Score Distribution                                             [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ 9.0 - 10.0 (Critical)        ████████ 3,420                                                │ │
│ │ 7.0 - 8.9  (High)            ████████████████ 8,910                                        │ │
│ │ 4.0 - 6.9  (Medium)          ████████████████████ 10,240                                   │ │
│ │ 0.1 - 3.9  (Low)             ████ 2,240                                                    │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Groups vulnerabilities by numerical CVSS v3.1 base score buckets.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Nvd.jsx`.

---

### 4.4 Vulnerability Analysis Status Breakdown

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Analysis Status Breakdown                                              [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Analyzed: 88%   ■ Undergoing Analysis: 6%   ■ Awaiting Analysis: 4%   ■ Rejected: 2%     │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Tracks NIST analyst validation progress for recently published CVEs.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Nvd.jsx`.

---

### 4.5 Top Attack & Exploit Vectors

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Attack Vectors                                                       [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ Network (Remote Exploit)     ████████████████████ 72%                                      │ │
│ │ Local (Privilege Escalation) ██████ 18%                                                    │ │
│ │ Adjacent Network             ██ 6%                                                         │ │
│ │ Physical Access              █ 4%                                                          │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Visualizes CVSS Attack Vector (`AV:N`, `AV:L`, `AV:A`, `AV:P`) metrics.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Nvd.jsx`.

---

### 4.6 Common Weakness Enumeration (CWE) Taxonomy

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top CWE Weaknesses                                                       [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ CWE-79 (Cross-Site Scripting)         ████████████ 1,840                                   │ │
│ │ CWE-89 (SQL Injection)                ████████ 1,210                                       │ │
│ │ CWE-787 (Out-of-bounds Write)         ██████ 940                                           │ │
│ │ CWE-20 (Improper Input Validation)    ████ 620                                             │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Groups vulnerabilities by root-cause software security flaws.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Nvd.jsx`.

---

### 4.7 Top Discovery Authorities (CNA Sources)

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top CVE Numbering Authorities (CNAs)                                     [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ Microsoft Corporation        ████████████ 840                                              │ │
│ │ MITRE Corporation            ████████ 620                                                  │ │
│ │ Google LLC / Chromium        ██████ 480                                                    │ │
│ │ Red Hat Inc                  ████ 310                                                      │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Identifies the primary enterprise vendors and research organizations submitting CVEs.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Nvd.jsx`.

---

### 4.8 Vulnerability Aging Distribution

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Vulnerability Age Breakdown                                            [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ < 7 Days (Fresh): 8%   ■ 8-30 Days: 22%   ■ 31-90 Days: 34%   ■ 180+ Days: 36%           │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Measures patch latency and vulnerability age in the wild.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Nvd.jsx`.

---

### 4.9 NVD CVE Intelligence Live Feed & Search Table

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ NVD Vulnerability Feed                                      [Search CVE/Keyword] [CVSS Filter] │
│ ├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤ │
│ │ CVE ID       │ PUBLISHED    │ CVSS v3      │ SEVERITY     │ CWE ID       │ EPSS EXPLOIT %  │ │
│ ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────────────┤ │
│ │ CVE-2024-8901│ 2026-09-10   │ 9.8          │ Critical     │ CWE-787      │ 84.2%           │ │
│ │ CVE-2024-8842│ 2026-09-08   │ 8.1          │ High         │ CWE-89       │ 32.5%           │ │
└────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Full searchable CVE database with EPSS exploit probability scores and MITRE cross-references.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Nvd.jsx` & `UpdatedNvd.jsx`.

---

# 5. Firewall & Network Security (Palo Alto) (`/paloalto`)

Perimeter network protection, traffic volume analysis, threat prevention, and URL filtering.

---

### 5.1 Network Perimeter KPI Summary Cards

#### 🖼️ Visual Layout Mockup
```text
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ TOTAL SESSIONS  │ │ THROUGHPUT IN   │ │ THROUGHPUT OUT  │ │ BLOCKED THREATS │ │ ACTIVE POLICIES │
│ 2.4M            │ │ 18.4 TB         │ │ 14.2 TB         │ │ 4,820           │ │ 142             │
│ Active Flows    │ │ Ingress         │ │ Egress          │ │ IPS / Antivirus │ │ Security Rules  │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### 📋 Widget Information
- **Purpose**: High-level network volume, throughput, and blocked intrusion statistics.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/paloalto/PaloAltoPage.jsx` (Lines 180–240).
- **Backend Route**: `GET /api/firewall/overview` in `backend/routes/firewall.js`.

---

### 5.2 Inbound & Outbound Bandwidth Velocity Trend

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Bandwidth Throughput Velocity (Mbps/Gbps)                                      [View: Area ▼]  │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │  Gbps                                                                                      │ │
│ │   ▲            /───\ (Ingress - Blue)                                                      │ │
│ │   │     /────\/     \───\ (Egress - Green)                                                 │ │
│ │   └────/─────────────────\────────► Time                                                   │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Dual-line area chart showing bandwidth consumption over time.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/paloalto/PaloAltoPage.jsx`.

---

### 5.3 Threat & Attack Signature Velocity Trend

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Blocked Intrusion Attempts Over Time                                           [View: Line ▼]  │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │  Attacks/hr                                                                                │ │
│ │   ▲      /\                                                                                │ │
│ │   │     /  \    /\    /\                                                                   │ │
│ │   └────/────\──/──\──/──\─────────► Date                                                   │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Tracks IPS/IDS trigger velocity over time.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/paloalto/PaloAltoPage.jsx`.

---

### 5.4 Risk Score Categorization (Levels 1 - 5)

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Session Risk Level Breakdown                                           [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Critical Risk (5): 4%  ■ High (4): 12%  ■ Med (3): 24%  ■ Low (2): 30%  ■ Safe (1): 30%  │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Categorizes network flows by Palo Alto App-ID risk factors.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/paloalto/PaloAltoPage.jsx`.

---

### 5.5 Top Attacker Sources & Targeted Destinations

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Attacker Source IPs                                                      [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ 198.51.100.42 (Malicious C2)         ████████████████ 1,840                                │ │
│ │ 203.0.113.195 (Phishing Gateway)     ██████████ 1,420                                      │ │
│ │ 185.220.101.5 (Tor Exit Node)        ██████ 1,180                                          │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Renders top attacking external IP addresses and their threat attribution.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/paloalto/PaloAltoPage.jsx`.

---

### 5.6 Top Denied Destinations (C2, Phishing & Botnets)

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Blocked Destination Endpoints                                            [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ 45.146.164.110 (Brute Force IP)      ████████████ 960                                      │ │
│ │ 91.240.118.242 (Botnet Drop)         ████████ 750                                          │ │
│ │ 194.26.29.114 (Cryptominer Host)     ████ 420                                              │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Identifies outbound connection attempts to known malicious destinations blocked by security policies.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/paloalto/PaloAltoPage.jsx`.

---

### 5.7 Top Denied Applications & Blocked Protocols

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Denied Application Protocols                                         [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ BitTorrent P2P               ████████████████ 2,410                                        │ │
│ │ Tor Anonymizer               ██████████ 1,620                                              │ │
│ │ Telnet (Insecure)            ██████ 890                                                    │ │
│ │ AnyDesk (Unauthorized)       ████ 410                                                      │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Audits shadow IT applications blocked by App-ID policies.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/paloalto/PaloAltoPage.jsx`.

---

### 5.8 Top Blocked Websites & URL Categories

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Blocked URL Categories                                                 [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Malware Domains: 42%   ■ Phishing: 28%   ■ Proxy Avoidance: 18%   ■ Adult/Gambling: 12%  │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Audits URL filtering violations and web access controls.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/paloalto/PaloAltoPage.jsx`.

---

### 5.9 Destination Countries & Geo-Traffic Distribution

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Geo-Traffic Distribution                                                 [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ United States                ████████████████████ 62%                                      │ │
│ │ Germany / EU                 ██████ 18%                                                    │ │
│ │ Singapore / APAC             ████ 12%                                                      │ │
│ │ Blocked High-Risk Jurisdict. █ 8%                                                          │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Displays international data transfer destinations.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/paloalto/PaloAltoPage.jsx`.

---

### 5.10 Risky Users & Top Attack Signatures

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Attack Signatures Blocked                                            [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ SQL Injection Attempt (ID: 30102)     ████████████ 1,240                                   │ │
│ │ Apache Log4j RCE (ID: 91990)          ████████ 810                                         │ │
│ │ SSH Brute Force Login (ID: 40012)     ██████ 620                                           │ │
│ │ DNS Tunneling Exfiltration (ID: 2011) ████ 390                                             │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Details specific exploit signatures intercepted by firewall security profiles.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/paloalto/PaloAltoPage.jsx`.

---

### 5.11 Palo Alto Interactive Report Table & Live Log Viewer

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Palo Alto Traffic Log Inspector                          [Report Type Selector] [Filter Rules] │
│ ├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤ │
│ │ SOURCE IP    │ DEST IP      │ APPLICATION  │ ACTION       │ RISK SCORE   │ RULE MATCHED    │ │
│ ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────────────┤ │
│ │ 192.168.1.45 │ 198.51.100.42│ ssl          │ Deny         │ 5 (Critical) │ Block-C2-Out    │ │
│ │ 192.168.1.10 │ 8.8.8.8      │ dns          │ Allow        │ 1 (Safe)     │ Allow-DNS-Corp  │ │
└────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Full searchable table allowing switching between 18 distinct pre-compiled Palo Alto reports.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/paloalto/PaloAltoPage.jsx`.

---

# 6. Mobile Device Management (MDM / Hexnode) (`/mdm`)

The MDM module manages smartphone, tablet, laptop, and desktop fleet compliance and app security.

---

### 6.1 MDM Fleet Compliance & Inventory KPI Cards

#### 🖼️ Visual Layout Mockup
```text
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ TOTAL DEVICES   │ │ COMPLIANT       │ │ NON-COMPLIANT   │ │ MANAGED APPS    │ │ FLAGGED APPS    │
│ 145             │ │ 138             │ │ 7               │ │ 42              │ │ 3               │
│ Enrolled Fleet  │ │ 95.2% Compliant │ │ Policy Breach   │ │ Enterprise Apps │ │ Risky/Blacklist │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Snapshot of device fleet size, compliance rate, and flagged malicious applications.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/MDM.jsx` (Lines 370–440).
- **Backend Route**: `GET /api/hexnode/db/devices` in `backend/routes/hexnode.js`.
- **Vendor Source**: Hexnode UEM REST API (`/api/v1/devices`).

---

### 6.2 OS & Platform Distribution (ImprovedDonut Split Legends)

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ OS Distribution (ImprovedDonut with Side-by-Side Split Legends)        [View: Donut ▼] [30d ▼] │
│ ├───────────────────────┬─────────────────────────────┬──────────────────────────────────────┤ │
│ │ Left Legend           │ Center Chart                │ Right Legend                         │ │
│ │   ● Windows  (78)     │            /────\           │   ● iOS      (18)                    │ │
│ │   ● macOS    (38)     │           |  145 |          │   ● Android  (11)                    │ │
│ │                       │            \────/           │                                      │ │
└─────────────────────────┴─────────────────────────────┴──────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Renders device counts across operating systems.
- **Layout Innovation**: Uses `ImprovedDonut` with left and right split legends for improved legibility without vertical overflow.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `ImprovedDonut` inside `frontend/src/pages/MDM.jsx` (Lines 167–240).

---

### 6.3 Compliance Status & Security Posture Breakdown

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Device Compliance Breakdown                                            [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Compliant: 138 (95.2% - Green)       ■ Non-Compliant: 7 (4.8% - Red)                     │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Audits encryption, passcode requirements, and OS patch levels.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/MDM.jsx`.

---

### 6.4 Device Type Breakdown

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Device Types                                                           [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Laptops: 62%   ■ Smartphones: 24%   ■ Desktops: 10%   ■ Tablets: 4%                      │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Categorizes fleet hardware form-factors.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/MDM.jsx`.

---

### 6.5 Managed Application Platform Breakdown

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Managed Applications by Platform                                         [View: Bar ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ Windows Enterprise Apps      ████████████████ 22                                           │ │
│ │ iOS Business Apps            ██████████ 12                                                 │ │
│ │ Android Work Apps            ██████ 8                                                      │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Tracks mandatory apps deployed by MDM.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/MDM.jsx`.

---

### 6.6 Flagged Applications & Risky Device Apps

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Flagged & Blacklisted Applications                                                             │
│ ├──────────────┬──────────────┬──────────────┬──────────────┬────────────────────────────────┤ │
│ │ APP NAME     │ BUNDLE ID    │ PLATFORM     │ RISK LEVEL   │ AFFECTED DEVICES               │ │
│ ├──────────────┼──────────────┼──────────────┼──────────────┼────────────────────────────────┤ │
│ │ TorrentApp   │ com.p2p.get  │ Android      │ High         │ 2 devices (John, Sarah)        │ │
│ │ UnknownVPN   │ com.free.vpn │ iOS          │ Critical     │ 1 device (Guest Tablet)        │ │
└────────────────┴──────────────┴──────────────┴──────────────┴────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Lists unapproved or sideloaded apps detected on managed devices.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/MDM.jsx`.
- **Backend Route**: `GET /api/hexnode/db/device-applications/flagged`.

---

### 6.7 Hexnode Managed Fleet Inventory Table & Detail Modal

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Device Inventory Fleet Table                                 [Search Serial/User] [Sync Fleet] │
│ ├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤ │
│ │ DEVICE NAME  │ ASSIGNED TO  │ OS & VERSION │ BATTERY      │ COMPLIANCE   │ LAST CHECK-IN   │ │
│ ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────────────┤ │
│ │ LAPTOP-W11-42│ John Doe     │ Win 11 23H2  │ 92% (AC)     │ Compliant    │ 5 mins ago      │ │
│ │ IPHONE-15-PRO│ Sarah Connor │ iOS 17.5.1   │ 74%          │ Compliant    │ 12 mins ago     │ │
└────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Searchable inventory table with deep-links to `MDMDetailView.jsx` for remote wipe/lock actions.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/MDM.jsx` & `MDMDetailView.jsx`.

---

# 7. Microsoft 365 Cloud Security (`/microsoft365`)

Integrates with Microsoft Graph API, Entra ID, Defender for Cloud Apps, and Intune.

---

### 7.1 Cloud Identity & Posture KPI Cards

#### 🖼️ Visual Layout Mockup
```text
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ ENTRA ID USERS  │ │ RISKY USERS     │ │ SECURITY ALERTS │ │ SECURE SCORE    │ │ MANAGED INTUNE  │
│ 184             │ │ 3               │ │ 12              │ │ 78.4%           │ │ 142             │
│ Total Directory │ │ Risk Level > 0  │ │ Active Incidents│ │ 628 / 801 Pts   │ │ Intune Synced   │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### 📋 Widget Information
- **Purpose**: High-level Microsoft 365 tenant health and identity risk indicators.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Microsoft365.jsx` (Lines 345–410).
- **Backend Route**: `GET /api/microsoft/dashboard` in `backend/routes/microsoft.js`.
- **Vendor Source**: Microsoft Graph API (`https://graph.microsoft.com/v1.0/`).

---

### 7.2 Microsoft Secure Score Posture Ring

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Microsoft Secure Score Posture                                                                 │
│ ├─────────────────────────────────────────┬──────────────────────────────────────────────────┤ │
│ │ Score Ring (78.4% - 628 / 801 Pts)      │ Category Progress Breakdown                      │ │
│ │                                         │   Identity Posture:       88% [████████████████] │ │
│ │                /────\                   │   Data Security:          74% [████████████░░░░] │ │
│ │               | 78%  |                  │   Device Security:        82% [██████████████░░] │ │
│ │                \────/                   │   Apps & Cloud:           68% [██████████░░░░░░] │ │
└─────────────────────────────────────────┴──────────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Visualizes Microsoft Secure Score benchmark against industry peers.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Microsoft365.jsx`.

---

### 7.3 Sign-In Activity & Authentication Trend (Success vs Failure)

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Sign-In Activity Trend (Success vs Failure)                                    [View: Line ▼]  │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │  Sign-ins                                                                                  │ │
│ │   ▲            /───\ (Success - Green)                                                     │ │
│ │   │     /────\/     \───\ (Failure/Blocked - Red)                                          │ │
│ │   └────/─────────────────\────────► Date                                                   │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Identifies brute force spikes and MFA fatigue attacks over time.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Microsoft365.jsx`.

---

### 7.4 Identity Risk Detections by Event Type

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Risk Detections by Event Type                                          [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Impossible Travel: 42%   ■ Anonymous IP: 28%   ■ Leaked Credentials: 18%   ■ Malware: 12%│ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Categorizes Entra ID Identity Protection alerts.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Microsoft365.jsx`.

---

### 7.5 Defender Security Alerts Severity Distribution

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Defender Security Alerts Severity                                      [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ High: 18% (Red)   ■ Medium: 42% (Orange)   ■ Low: 28% (Yellow)   ■ Informational: 12%    │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Groups Microsoft 365 Defender alerts by severity tier.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Microsoft365.jsx`.

---

### 7.6 Intune Device Compliance State Breakdown

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Intune Device Compliance State                                         [View: Donut ▼] [30d ▼] │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ■ Compliant: 92%   ■ Non-Compliant: 5%   ■ InGracePeriod: 2%   ■ Error: 1%                 │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Audits Intune policy compliance for enrolled endpoints.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Microsoft365.jsx`.

---

### 7.7 Risky Users & Risk Detections Table

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Entra ID Risky Users & Detections Table                                                        │
│ ├──────────────┬──────────────┬──────────────┬──────────────┬────────────────────────────────┤ │
│ │ USERNAME     │ RISK LEVEL   │ RISK STATE   │ RISK DETAIL  │ LAST DETECTED                  │ │
│ ├──────────────┼──────────────┼──────────────┼──────────────┼────────────────────────────────┤ │
│ │ user@org.com │ High         │ At Risk      │ Impos. Travel│ 2026-09-11 11:30 (Nigeria/US)  │ │
│ │ dev@org.com  │ Medium       │ Investigating│ Anonymous IP │ 2026-09-10 18:45 (Tor Relay)   │ │
└────────────────┴──────────────┴──────────────┴──────────────┴────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Actionable table for resetting credentials and enforcing MFA step-up authentication.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Microsoft365.jsx` & `Microsoft365DetailView.jsx`.

---

### 7.8 Microsoft 365 Service Health & Advisory Board

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Microsoft 365 Cloud Service Health                                                             │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ● Exchange Online: Normal Service    ● Microsoft Teams: Normal Service                     │ │
│ │ ● SharePoint Online: Normal Service  ● Entra ID Identity: Normal Service                   │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Real-time cloud service status board for Microsoft 365 infrastructure.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/Microsoft365.jsx`.

---

# 8. Service Desk & Ticketing Operations (Zoho Desk) (`/zoho`)

Comprehensive ITIL incident management, MTTR analysis, engineer performance tracking, and support ticket triage.

---

### 8.1 Service Desk Incident KPI Summary Cards

#### 🖼️ Visual Layout Mockup
```text
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ TOTAL TICKETS   │ │ OPEN TICKETS    │ │ IN PROGRESS     │ │ RESOLVED        │ │ ESCALATED / SLA │
│ 248             │ │ 16              │ │ 12              │ │ 220             │ │ 4               │
│ All Ingested    │ │ Requires Action │ │ Engineer Active │ │ Successfully Fix│ │ Breached SLA    │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Operational overview of active ticket queue and resolution velocity.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `Zohoticketcount.jsx` inside `frontend/src/pages/zoho/zohoOne/`.
- **Backend Route**: `GET /api/zoho/tickets-db` in `backend/routes/zoho.js`.
- **Vendor Source**: Zoho Desk REST API (`https://desk.zoho.com/api/v1/`).

---

### 8.2 MTTR & SLA Resolution Performance Cards

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ MTTR & SLA Performance Analytics                                                               │
│ ├─────────────────────────────────────────┬──────────────────────────────────────────────────┤ │
│ │ Mean Time to Resolution (MTTR)          │ Mean Time to First Response (MTTA)               │ │
│ │   2.1 Hours                             │   14.2 Minutes                                   │ │
│ │   -18% vs Last Month (Improved)         │   SLA Compliance: 96.4%                          │ │
└─────────────────────────────────────────┴──────────────────────────────────────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Evaluates SOC and IT team speed in resolving support and security incidents.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `Mttrcard.jsx` in `frontend/src/pages/zoho/zohoOne/` & `Ticketingmttr.jsx`.

---

### 8.3 Top Performing Support Engineers (Leaderboard)

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Performing Support Engineers                                                               │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ 1. Alex Rivers       ████████████████ 84 Resolved (Avg: 1.4h) ★ 4.9 Rating                 │ │
│ │ 2. Priya Sharma      ████████████ 62 Resolved (Avg: 1.8h)     ★ 4.8 Rating                 │ │
│ │ 3. Michael Chen      ████████ 48 Resolved (Avg: 2.2h)         ★ 4.7 Rating                 │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Staff leaderboard showing tickets resolved, turnaround time, and satisfaction ratings.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `Topperformance.jsx` in `frontend/src/pages/zoho/zohoOne/`.

---

### 8.4 Incident Resolution Pipeline Funnel

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Incident Resolution Pipeline Funnel                                                            │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ Created (248)       ██████████████████████████████ (100%)                                  │ │
│ │ Assigned (236)      ██████████████████████████ (95.1%)                                     │ │
│ │ In Progress (180)   ████████████████████ (72.5%)                                           │ │
│ │ Resolved (220)      ████████████████████████ (88.7%)                                       │ │
│ │ Closed (214)        ███████████████████████ (86.2%)                                        │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Visualizes triage conversion bottlenecks across lifecycle stages.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `Funneldiagram.jsx` in `frontend/src/pages/zoho/zohoOne/`.

---

### 8.5 Ticket Density & Category Volcano Graph

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Ticket Category Volcano Graph (Spike Density Matrix)                                           │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │   Category                                                                                 │ │
│ │   Security Alerts     ▲   ▲     ▲  (Spike cluster during attack window)                    │ │
│ │   Password Resets    ───┴───┴─────┴─── (Continuous baseline)                               │ │
│ │   Hardware/VPN        ▲        ▲                                                           │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Density graph highlighting incident spikes by category over time.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `TicketVolcanoGraph.jsx` in `frontend/src/pages/zoho/zohoOne/`.

---

### 8.6 Support Team Capacity & Workload Circle

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Support Team Workload Distribution (Radial Circle)                                            │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │               /── Alex (35%) ──\                                                           │ │
│ │              |                  |                                                          │ │
│ │         Michael (25%)       Priya (40%)                                                    │ │
│ │              \──────────────────/                                                          │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Radial chart displaying current active ticket capacity across team members.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `Circlemember.jsx` in `frontend/src/pages/zoho/zohoOne/`.

---

### 8.7 Hourly Incident Inflow Histogram

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Hourly Ticket Submission Frequency (00:00 - 23:00)                                             │
│ ├────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │  Tickets                                                                                   │ │
│ │   ▲                    ████ ████ ████ (Peak Hours: 09:00 - 16:00)                          │ │
│ │   │               ████ ████ ████ ████ ████                                                 │ │
│ │   │   ▄▄   ▄▄     ████ ████ ████ ████ ████   ▄▄                                            │ │
│ │   └───┴────┴───────┴────┴────┴────┴────┴─────┴────► Hour of Day (0 - 23)                   │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 📋 Widget Information
- **Purpose**: Histogram mapping hourly incident creation to optimize support shift staffing.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `Hourbasedset.jsx` in `frontend/src/pages/zoho/zohoOne/`.

---

### 8.8 Department & Status Ticket Matrix

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Department & Status Ticket Matrix Grid                                                         │
│ ├─────────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┤ │
│ │ DEPARTMENT      │ OPEN         │ IN PROGRESS  │ ON HOLD      │ RESOLVED     │ TOTAL        │ │
│ ├─────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤ │
│ │ Security Ops    │ 4            │ 2            │ 1            │ 48           │ 55           │ │
│ │ IT Support      │ 8            │ 6            │ 2            │ 112          │ 128          │ │
│ │ Infrastructure  │ 4            │ 4            │ 0            │ 60           │ 68           │ │
└─────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Cross-tabulated matrix showing open and resolved queues by department.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/zoho/ZohoTicketMatrix.jsx`.

---

### 8.9 Zoho Incident Tickets Inventory Table

#### 🖼️ Visual Layout Mockup
```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Zoho Tickets Table                                     [Search] [Filter Department] [Priority] │
│ ├──────────────┬──────────────────────────────┬──────────────┬──────────────┬────────────────┤ │
│ │ TICKET ID    │ SUBJECT                      │ DEPARTMENT   │ PRIORITY     │ STATUS         │ │
│ ├──────────────┼──────────────────────────────┼──────────────┼──────────────┼────────────────┤ │
│ │ #TIC-10492   │ Ransomware alert on Host-42  │ Security Ops │ Critical     │ In Progress    │ │
│ │ #TIC-10488   │ VPN certificate renewal      │ IT Support   │ Medium       │ Open           │ │
└────────────────┴──────────────────────────────┴──────────────┴──────────────┴────────────────┘ │
```

#### 📋 Widget Information
- **Purpose**: Live searchable tickets table with 20-second background polling and deep-links to Zoho Desk tickets.

#### ⚙️ Where the Logic Comes From
- **Frontend Component**: `frontend/src/pages/zoho/zohoOne/Zohoone.jsx`.
- **Backend Route**: `GET /api/zoho/tickets-db` in `backend/routes/zoho.js`.

---

## 🏛️ Summary Architecture Matrix: Pages, Endpoints & Vendors

| Domain / Page | Primary Route | React View Component | Backend Route / Controller | Database Tables / Redis Key | Vendor API Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Dashboard** | `/dashboard` | `Dashboard.jsx`, `ExecutiveKpiStrip.jsx` | `GET /api/cache/dashboard-aggregate` | `dashboard:aggregate:<org>`, multiple tables | Multi-Vendor Aggregation |
| **2. EDR** | `/security` | `Threats.jsx`, `S1Cve.jsx`, `Agent.jsx` | `GET /api/sentinelone/threats`, `agents` | `s1_threats`, `s1_agents`, `s1_apps_cve` | SentinelOne 2.1 API |
| **3. Email Security** | `/checkpoint` | `CheckpointDashboard.jsx` | `GET /api/harmony/events` | `cp_events` | Checkpoint Harmony API |
| **4. NVD CVEs** | `/nvd` | `Nvd.jsx`, `UpdatedNvd.jsx` | `GET /api/nvd/cves`, `updated-nvd` | `nvd_cves`, `cpes` | NIST NVD 2.0 REST API |
| **5. Firewall** | `/paloalto` | `PaloAltoPage.jsx` | `GET /api/firewall/reports`, `overview` | `firewall_reports`, `firewall_logs` | Palo Alto PAN-OS XML API |
| **6. MDM** | `/mdm` | `MDM.jsx`, `MDMDetailView.jsx` | `GET /api/hexnode/db/devices`, `apps` | `hexnode_devices`, `hexnode_apps` | Hexnode UEM REST API |
| **7. Microsoft 365** | `/microsoft365` | `Microsoft365.jsx` | `GET /api/microsoft/dashboard` | `m365_users`, `m365_alerts`, `m365_scores`| Microsoft Graph API |
| **8. Ticketing** | `/zoho` | `Zohoone.jsx`, `ZohoTicketMatrix.jsx` | `GET /api/zoho/tickets-db` | `zoho_tickets` | Zoho Desk REST API |

---
*Created as part of the SecureHub CISO Architecture Documentation.*
