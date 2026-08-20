# CISO Dashboard — Report Generation Module

## Overview
This module generates comprehensive security reports in PDF format, combining data from multiple security platforms (SentinelOne, Checkpoint Harmony, Palo Alto Firewall, and Zoho Desk).

## File Structure

```
report/
├── README.md                 # This file
├── fetchReportData.js        # Data fetching from all security sources
├── generatePdf.jsx           # Vector PDF generation (react-pdf renderer)
├── ReportTemplate.jsx        # New vector PDF document template
├── pdfChartComponents.jsx    # Vector chart primitives (Svg-based)
└── dataUtils.js              # Pure data-derivation helpers (shared)
```

## Components

### 1. fetchReportData.js
**Purpose**: Fetches data from all integrated security platforms

**Data Sources**:
- SentinelOne: Threats, Agents, CVEs, Device Control, Application Data
- Checkpoint Harmony: Email security events
- Palo Alto Firewall: Risk trends, Attackers, Connections
- Zoho Desk: Support tickets

**Returns**: Consolidated data object with all security metrics
(`{ s1Threats, s1Agents, harmonyEvents, fwRiskRaw, ..., zohoTickets }`)

### 2. ReportTemplate.jsx
**Purpose**: New vector PDF document built with `@react-pdf/renderer`.

- True vector output — text is selectable and crisp at any zoom (no raster JPEG slicing).
- Portrait A4 (210×297 mm), classic corporate-light theme (indigo brand accent, navy text, subtle dividers).
- Each section starts on its own page with a slim divider header and a fixed footer (org name + date).
- Consumes the exact shape returned by `fetchReportData`.

**Sections**:
1. Cover
2. Executive Summary  *(NEW)*
3. Checkpoint Harmony — Email & Cloud Security
4. SentinelOne — Threat Analytics / Agent Analytics / Most At-Risk / Application CVEs / Application Insights
5. Zoho Desk — Support Tickets
6. Palo Alto Firewall — Network Security
7. Weekly Insights — 7-Day Comparison

**Open Action Items section removed** (per request).

### 3. pdfChartComponents.jsx
**Purpose**: Minimal vector chart primitives built directly on `@react-pdf/renderer`'s `<Svg>`.
No Chart.js, no canvas, no raster.

- `VDonut` — donut/severity mix
- `VBarChart` — vertical bar chart
- `VLineChart` — line/area trend chart
- `VHBarList` — horizontal ranking bars
- `VLegendRow` — legend row

Used sparingly; the default presentation is styled tables + KPI tiles.

### 4. dataUtils.js
**Purpose**: Pure, React-free data-derivation helpers extracted from the old template.
Reused by the vector template so the same numbers appear everywhere:
`extractTable`, `parseNumber`, `makeTopChartData`, `makeRiskTrendData`, `makeRiskDistribution`, `buildCveData`, `computeWeeklyStats`, `buildThreatAnalytics`, `buildAgentAnalytics`, `buildAtRisk`, `buildZohoSummary`, `buildFirewallSummary`, color palettes, etc.

### 5. generatePdf.jsx
**Purpose**: Entry point used by the Reports page.

```javascript
import { generatePdfFromElement } from './report/generatePdf.jsx';

const result = await generatePdfFromElement(data, 'acme_security_report.pdf');
// result = { success: true, fileName: 'acme_security_report.pdf' }
```

Renders `<ReportTemplate data={data} />` to a Buffer via `renderToBuffer`,
creates a Blob, and triggers a browser download. Returns the same public API
shape the Reports page already consumed.

## Usage

```javascript
import { fetchReportData } from './report/fetchReportData.js';
import { generatePdfFromElement } from './report/generatePdf.jsx';

const data = await fetchReportData(orgName);
await generatePdfFromElement(data, 'security_report.pdf');
```

No off-screen DOM render, no html-to-image, no jsPDF slicing.

## Dependencies

```json
{
  "@react-pdf/renderer": "^4.6.1"
}
```

## Version History

### v3.0 (2026-08-20)
- Rebuilt from scratch as a true vector PDF via `@react-pdf/renderer`.
- New classic-corporate-light layout, portrait A4, page numbers.
- New Executive Summary section.
- Removed Open Action Items section.
- Deleted html-to-image/jsPDF raster-slicing pipeline.

### v2.0 (2026-08-19)
- Legacy raster-based pipeline (jsPDF + html-to-image). Replaced in v3.0.

---

**Last Updated**: August 20, 2026