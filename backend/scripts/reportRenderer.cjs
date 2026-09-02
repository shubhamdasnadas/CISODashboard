/**
 * reportRenderer.cjs
 * ------------------
 * Server-side renderer for the CISO security PDF.
 *
 * It loads the pre-built template bundle (backend/dist/reportTemplate.cjs,
 * produced by scripts/buildReportTemplate.cjs) and renders it with
 * @react-pdf/renderer's Node API (renderToBuffer). The template is authored in
 * the FRONTEND (frontend/src/pages/report/ReportTemplate.jsx) and is the single
 * source of truth — we only bundle it for backend use, never fork it.
 *
 * Usage:
 *   const { renderReportPdf } = require('./scripts/reportRenderer');
 *   const buffer = await renderReportPdf(reportData); // <Buffer ...>
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderToBuffer } = require('@react-pdf/renderer');

const BUNDLE = path.join(__dirname, '..', 'dist', 'reportTemplate.cjs');

// The frontend source files that feed the bundle. If ANY of these is newer than
// the bundle, we rebuild so the PDF always reflects the latest ReportTemplate.jsx
// edits — no manual `npm run build:report` needed.
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_FILES = [
  path.join(REPO_ROOT, 'frontend', 'src', 'pages', 'report', 'ReportTemplate.jsx'),
  path.join(REPO_ROOT, 'frontend', 'src', 'pages', 'report', 'dataUtils.js'),
  path.join(REPO_ROOT, 'frontend', 'src', 'pages', 'report', 'pdfChartComponents.jsx'),
];

let _cachedTemplate = null;

/**
 * Rebuild the bundle from the frontend source via esbuild.
 * Errors are surfaced so the caller can report a clear message.
 */
function rebuildBundle() {
  console.log('[reportRenderer] Rebuilding template bundle from source…');
  execFileSync('node', [path.join(__dirname, 'buildReportTemplate.cjs')], {
    cwd: __dirname,
    stdio: 'inherit',
  });
}

/** True if the bundle is missing or older than any source file. */
function bundleNeedsRebuild() {
  if (!fs.existsSync(BUNDLE)) return true;
  const bundleMtime = fs.statSync(BUNDLE).mtimeMs;
  return SOURCE_FILES.some(
    (f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > bundleMtime
  );
}

/**
 * Resolve the ReportTemplate component from the bundle. The esbuild CJS bundle
 * exports the default export as `.default` (or `__esModule` interop), so we
 * handle both shapes. Returns the React component function.
 */
function loadTemplate() {
  // Always stay in sync with the frontend source — rebuild when stale.
  if (bundleNeedsRebuild()) {
    rebuildBundle();
    _cachedTemplate = null; // source changed; drop any cached component
  }

  if (!fs.existsSync(BUNDLE)) {
    throw new Error(
      'Report template bundle not found. Run `npm run build:report` in the ' +
      'backend to build backend/dist/reportTemplate.cjs from the frontend ' +
      'ReportTemplate.jsx.'
    );
  }

  // CRITICAL: bust Node's require cache for the bundle path. Node caches modules
  // by resolved absolute path, so even after rebuildBundle() rewrites the file on
  // disk, a bare require(BUNDLE) would return the OLD in-memory module — meaning
  // every edit to ReportTemplate.jsx / pdfChartComponents.jsx silently never
  // appears in the generated PDF until a full server restart. Deleting the cache
  // entry forces the freshly-written file to be loaded. We also clear any cached
  // sub-modules the bundle pulls in so deep edits (chart primitives) take effect.
  const resolved = require.resolve(BUNDLE);
  if (require.cache[resolved]) {
    const walk = (id) => {
      const m = require.cache[id];
      if (!m) return;
      (m.children || []).forEach((c) => walk(c.id));
      delete require.cache[id];
    };
    walk(resolved);
  }

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const mod = require(BUNDLE);
  const ReportTemplate = mod.default || mod.ReportTemplate || mod;
  if (typeof ReportTemplate !== 'function') {
    throw new Error('Report template bundle did not export a valid React component.');
  }
  _cachedTemplate = ReportTemplate;
  return ReportTemplate;
}

/**
 * Render the security report to a PDF Buffer.
 * @param {object} data - the report data object (same shape fetchReportData returns)
 * @returns {Promise<Buffer>}
 */
async function renderReportPdf(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('renderReportPdf: report data is required.');
  }
  const ReportTemplate = loadTemplate();
  const element = require('react').createElement(ReportTemplate, { data });
  const buffer = await renderToBuffer(element);
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

module.exports = { renderReportPdf, loadTemplate };
