import React from 'react';
import { pdf } from '@react-pdf/renderer';
import ReportTemplate from './ReportTemplate';
import AnalyticsReportTemplate from './AnalyticsReportTemplate';

// Persist a client-rendered Analytics PDF to the server: it's saved into
// backend/reportList/<orgSlug>/ and recorded in the per-org `reports` table,
// so the PDF also appears on the Reports page. The active org is auto-resolved
// server-side from the X-Org-Id header (set by the api client), so switching
// organisations auto-creates/uses that org's folder.
// Non-fatal: if the server save fails we still keep the local download.
async function saveAnalyticsToServer(blob, orgName) {
  try {
    const { default: api } = await import('../../api');
    const res = await api.post('/reports/save', blob, {
      headers: { 'Content-Type': 'application/pdf' },
      params: { orgName: orgName || '' },
    });
    return res.data?.fileName || null;
  } catch (err) {
    console.warn('[PDF] Analytics PDF saved locally but server save failed:', err?.message || err);
    return null;
  }
}

// True vector PDF generation using @react-pdf/renderer.
// No html-to-image, no jsPDF raster slicing — text and charts stay crisp at any zoom.
//
// IMPORTANT (browser): react-pdf ships two builds. The "browser" build lazily
// stubs `renderToBuffer`/`renderToFile`/`renderToStream` with a "Node specific
// API" error, so in Vite we must use the browser-native `pdf(...).toBlob()` flow.
// The Node (SSR) flow keeps `renderToBuffer` for scripts/smoke-tests.
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

export async function generatePdfFromElement(data, filename) {
  console.log('[PDF] Starting vector PDF generation...');
  console.log('[PDF] Target filename:', filename);

  let buffer;
  let blob;

  if (!isBrowser) {
    // Node SSR path — used by smoke tests / scripts.
    const { renderToBuffer } = await import('@react-pdf/renderer');
    buffer = await renderToBuffer(<ReportTemplate data={data} />);
    blob = new Blob([buffer], { type: 'application/pdf' });
  } else {
    // Browser path — render to a Blob directly; no Node globals required.
    const doc = pdf(<ReportTemplate data={data} />);
    blob = await doc.toBlob();
  }

  // Trigger the download.
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  const size = blob.size || buffer?.length || 0;
  console.log(`[PDF] ✓ Saved as ${filename} (${size} bytes)`);
  return { success: true, fileName: filename, size, pageCount: 0 };
}

// Backwards-compat alias used elsewhere.
export async function generatePdfFromData(data, filename) {
  return generatePdfFromElement(data, filename);
}

/**
 * Server-side PDF generation.
 *
 * POSTs the report `data` to the backend (POST /api/reports/generate), which
 * renders the PDF on the server, stores it in:
 *    backend/reportList/<orgSlug>/<username>_<orgSlug>_YYYY-MM-DD_HH-MM-SS.pdf
 * AND records a row in the per-org `reports` table, then streams the PDF back
 * as a blob. The browser then downloads it under the server-chosen filename.
 */
export async function generatePdfOnServer(data, orgName) {
  const api = (await import('../../api')).default;
  const res = await api.post(
    '/reports/generate',
    { data, orgName },
    { responseType: 'blob' }
  );

  // Filename comes from the Content-Disposition header the server sets.
  const cd = res.headers['content-disposition'] || '';
  let fileName = `security_report_${Date.now()}.pdf`;
  const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (m) fileName = decodeURIComponent(m[1] || m[2] || fileName).trim();

  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.log(`[PDF] ✓ Generated & saved server-side as ${fileName} (${blob.size} bytes)`);
  return { success: true, fileName, size: blob.size };
}

/**
 * Generate a PDF scoped to a single Analytics section/tab.
 *
 * @param {object} data     - The full report data object (from fetchReportData)
 * @param {string} orgName  - Organisation name
 * @param {string} section  - Section key: 'security', 'checkpoint', 'zoho',
 *                            'firewall', 'mdm', 'nvd', 'microsoft'
 * @returns {Promise<{success,fileName,size}>}
 */
export async function generatePdfForSection(data, orgName, section) {
  const sectionData = { ...data, section };
  const result = await generatePdfOnServer(sectionData, orgName);
  return result;
}

// ── Client-side Analytics PDF (mirrors Analytics page layout) ──────────────────

/**
 * Generate a client-side PDF that mirrors the Analytics page content.
 * Uses AnalyticsReportTemplate instead of the server-side ReportTemplate.
 *
 * @param {object} data  - The full report data object (from fetchReportData)
 * @param {string} filename - Desired PDF filename
 */
export async function generateAnalyticsPdf(data, filename) {
  console.log('[PDF] Starting analytics PDF generation (client-side)...');
  console.log('[PDF] Target filename:', filename);

  if (isBrowser) {
    const doc = pdf(<AnalyticsReportTemplate data={data} />);
    const blob = await doc.toBlob();

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Persist a server copy + Reports-page record (best-effort).
    const serverFile = await saveAnalyticsToServer(blob, data?.orgName);
    console.log(serverFile ? `[PDF] ✓ Server copy: ${serverFile}` : '[PDF] Server save skipped/failed');
    console.log(`[PDF] ✓ Analytics PDF saved as ${filename} (${blob.size} bytes)`);
    return { success: true, fileName: filename, size: blob.size, serverFile };
  }

  // Node SSR fallback
  const { renderToBuffer } = await import('@react-pdf/renderer');
  const buffer = await renderToBuffer(<AnalyticsReportTemplate data={data} />);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  console.log(`[PDF] ✓ Analytics PDF generated (server fallback, ${buffer.length} bytes)`);
  return { success: true, fileName: filename, size: buffer.length };
}

/**
 * Generate a client-side section-scoped Analytics PDF.
 *
 * @param {object} data     - The full report data object
 * @param {string} filename - Desired PDF filename
 * @param {string} section  - Section key: 'security', 'mdm', 'nvd',
 *                            'checkpoint', 'firewall', 'zoho', 'microsoft'
 */
export async function generateAnalyticsPdfForSection(data, filename, section) {
  const sectionData = { ...data, section };
  return generateAnalyticsPdf(sectionData, filename);
}