/**
 * buildReportTemplate.cjs
 * ------------------------
 * Bundles the FRONTEND React-PDF report template (ReportTemplate.jsx) into a
 * single CommonJS file the backend can `require()` and render with
 * @react-pdf/renderer's Node API (renderToBuffer).
 *
 * Why this exists:
 *   - ReportTemplate.jsx, its data helpers (dataUtils.js) and the chart
 *     primitives (pdfChartComponents.jsx) live in the frontend. They are the
 *     ONLY source of truth for the PDF's layout/numbers.
 *   - @react-pdf/renderer is NOT a Vite/JSX-aware bundler, so the backend can't
 *     import .jsx directly. esbuild compiles the JSX + bundles everything
 *     (including react, react-pdf) into one CJS file with the react-pdf
 *     Node build inlined (no DOM globals needed).
 *
 * Output: backend/dist/reportTemplate.cjs
 *
 * Re-build after editing the template:  npm run build:report
 */
const { build } = require('esbuild');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // backend/.. = repo root
const FRONTEND_REPORT = path.join(ROOT, 'frontend', 'src', 'pages', 'report');
const OUT_DIR = path.join(__dirname, '..', 'dist');
const OUT_FILE = path.join(OUT_DIR, 'reportTemplate.cjs');

async function main() {
  console.log('[build:report] Bundling ReportTemplate.jsx →', OUT_FILE);
  await build({
    entryPoints: [path.join(FRONTEND_REPORT, 'ReportTemplate.jsx')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    loader: { '.jsx': 'jsx', '.js': 'jsx' },
    jsx: 'automatic',
    mainFields: ['main', 'module'],
    conditions: ['node', 'require'],
    logLevel: 'info',
    outfile: OUT_FILE,
    // Keep react/react-pdf external so the backend's own installed copies are
    // used at runtime (avoids dual React instances / and the browser build).
    external: ['react', 'react-dom', '@react-pdf/renderer', 'react/jsx-runtime'],
    absWorkingDir: ROOT,
  });
  console.log('[build:report] ✓ done');
}

main().catch((err) => {
  console.error('[build:report] FAILED:', err);
  process.exit(1);
});
