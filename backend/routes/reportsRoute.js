const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Render + save a security-report PDF to the active organisation's folder.
//
// POST /api/reports/generate
//   Body: { data: <reportData>, orgName?: string }
//   - reportData is the same object frontend fetchReportData() returns.
//   - Renders server-side via @react-pdf/renderer (backend/dist/reportTemplate.cjs)
//     and writes the file to:
//        backend/reportList/<orgSlug>/<username>_<orgSlug>_YYYY-MM-DD_HH-MM-SS.pdf
//   - ALSO records a row in the per-org `reports` table (file_path, org_slug,
//     created_by, generated_at) so the PDF is stored/referenced in the DB.
//   - Responds with the PDF bytes (Content-Disposition: attachment) so the
//     browser can ALSO download it directly.
//
// The per-org sub-folder under reportList keeps every organisation's PDFs
// isolated in its own directory on disk.
const { renderReportPdf } = require('../scripts/reportRenderer.cjs');

// backend/reportList/<orgSlug>/  — repo-root-relative, safe across machines.
const REPORT_LIST_ROOT = path.join(__dirname, '..', 'reportList');

// Strip anything that isn't alphanumeric / underscore / hyphen / dot so an org
// slug or name can never escape its folder or break the filesystem.
const safeName = (s) => String(s || 'org').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

router.post('/generate', async (req, res) => {
  try {
    const { data, orgName } = req.body || {};
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ message: 'report data is required in the request body' });
    }
    if (!req.orgSlug) {
      return res.status(400).json({ message: 'active organisation not resolved' });
    }

    // 1. Render the PDF buffer on the server.
    const pdfBuffer = await renderReportPdf(data);

    // 2. Build the per-organisation sub-folder path: reportList/<orgSlug>/
    const orgFolderName = safeName(req.orgSlug);
    const orgDir = path.join(REPORT_LIST_ROOT, orgFolderName);
    fs.mkdirSync(orgDir, { recursive: true });

    // 3. Filename: <username>_<orgSlug>_YYYY-MM-DD_HH-MM-SS.pdf
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const userName = safeName(req.user?.username || req.user?.userId || 'user');
    const fileName = `${userName}_${orgFolderName}_${stamp}.pdf`;
    const filePath = path.join(orgDir, fileName);

    // 4. Persist to disk.
    fs.writeFileSync(filePath, pdfBuffer);

    // 5. Record a row in the org DB so the PDF is ALSO stored/referenced in the
    //    database. Use ADD COLUMN IF NOT EXISTS-safe columns and fail loud if
    //    the row can't be written — the user asked for reliable DB storage.
    const dbTitle = `Security Report — ${data.orgName || req.orgSlug} — ${stamp}`;
    const dbDesc = `Auto-generated PDF security report. File: ${fileName}.`;
    try {
      await req.orgPool.query(
        `INSERT INTO reports
           (title, description, type, status, file_path, org_slug, created_by, generated_at)
         VALUES ($1, $2, 'security', 'published', $3, $4, $5, NOW())`,
        [
          dbTitle,
          dbDesc,
          filePath,
          req.orgSlug,
          req.user?.username || req.user?.userId || 'system',
        ]
      );
    } catch (dbErr) {
      // If the new columns don't exist yet (older per-org DB), try the legacy
      // insert (title/description/type/status/created_by) so the request still
      // succeeds. A startup migration adds the new columns — see migrate.js.
      console.warn('[reports/generate] Primary DB insert failed, trying legacy insert:', dbErr.message);
      try {
        await req.orgPool.query(
          `INSERT INTO reports (title, description, type, status, created_by)
           VALUES ($1, $2, 'security', 'published', $3)`,
          [dbTitle, dbDesc, req.user?.username || req.user?.userId || 'system']
        );
      } catch (dbErr2) {
        console.error('[reports/generate] DB insert failed:', dbErr2.message);
        return res.status(500).json({ message: 'PDF saved to disk but failed to record in database.' });
      }
    }

    console.log(`[reports/generate] Saved ${filePath} (${pdfBuffer.length} bytes)`);

    // 6. Stream the PDF back to the browser for direct download.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('X-Saved-Path', encodeURIComponent(filePath));
    return res.end(pdfBuffer);
  } catch (err) {
    console.error('[reports/generate] Failed:', err);
    return res.status(500).json({ message: err.message || 'PDF generation failed' });
  }
});

// Save a client-rendered PDF (from the Analytics page) into reportList/<orgSlug>/
// AND record it in the `reports` table, so it shows on the Reports page.
//
// POST /api/reports/save
//   Body: raw PDF bytes (Content-Type: application/pdf)
//   - The Analytics page renders its PDF client-side (AnalyticsReportTemplate),
//     so the browser POSTs the generated bytes here to persist them on disk and
//     in the DB — mirroring the server-side /generate flow.
//   - The active org comes from `req.orgSlug` (set by orgMiddleware from the
//     X-Org-Id header), so switching orgs auto-creates that org's own folder.
router.post('/save', async (req, res) => {
  try {
    if (!req.orgSlug) {
      return res.status(400).json({ message: 'active organisation not resolved' });
    }

    // Body may arrive as a raw Buffer or (with express.json) as an array of numbers.
    const buf = Buffer.isBuffer(req.body) || Array.isArray(req.body)
      ? Buffer.from(req.body)
      : Buffer.from('');
    if (buf.length === 0) {
      return res.status(400).json({ message: 'no PDF body received' });
    }

    // 1. Build the per-organisation sub-folder: reportList/<orgSlug>/
    const orgFolderName = safeName(req.orgSlug);
    const orgDir = path.join(REPORT_LIST_ROOT, orgFolderName);
    fs.mkdirSync(orgDir, { recursive: true });

    // 2. Filename: <username>_<orgSlug>_YYYY-MM-DD_HH-MM-SS.pdf
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const userName = safeName(req.user?.username || req.user?.userId || 'user');
    const fileName = `${userName}_${orgFolderName}_${stamp}.pdf`;
    const filePath = path.join(orgDir, fileName);

    // 3. Persist to disk.
    fs.writeFileSync(filePath, buf);

    // 4. Record a row in the org DB so the PDF appears on the Reports page.
    const dbTitle = `Analytics Report — ${req.orgSlug} — ${stamp}`;
    const dbDesc = `Auto-generated Analytics PDF. File: ${fileName}.`;
    try {
      await req.orgPool.query(
        `INSERT INTO reports
           (title, description, type, status, file_path, org_slug, created_by, generated_at)
         VALUES ($1, $2, 'analytics', 'published', $3, $4, $5, NOW())`,
        [
          dbTitle,
          dbDesc,
          filePath,
          req.orgSlug,
          req.user?.username || req.user?.userId || 'system',
        ]
      );
    } catch (dbErr) {
      // Older per-org DBs may lack the newer columns — fall back to legacy insert.
      console.warn('[reports/save] Primary DB insert failed, trying legacy insert:', dbErr.message);
      try {
        await req.orgPool.query(
          `INSERT INTO reports (title, description, type, status, created_by)
           VALUES ($1, $2, 'analytics', 'published', $3)`,
          [dbTitle, dbDesc, req.user?.username || req.user?.userId || 'system']
        );
      } catch (dbErr2) {
        console.error('[reports/save] DB insert failed:', dbErr2.message);
        return res.status(500).json({ message: 'PDF saved to disk but failed to record in database.' });
      }
    }

    console.log(`[reports/save] Saved ${filePath} (${buf.length} bytes)`);
    return res.json({ success: true, fileName, filePath });
  } catch (err) {
    console.error('[reports/save] Failed:', err);
    return res.status(500).json({ message: err.message || 'Analytics PDF save failed' });
  }
});

// List every saved PDF for the active organisation's folder.
// GET /api/reports/files
router.get('/files', (req, res) => {
  try {
    if (!req.orgSlug) return res.status(400).json({ message: 'active organisation not resolved' });
    const orgDir = path.join(REPORT_LIST_ROOT, safeName(req.orgSlug));
    if (!fs.existsSync(orgDir)) return res.json({ files: [] });
    const files = fs.readdirSync(orgDir)
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .map((f) => {
        const stat = fs.statSync(path.join(orgDir, f));
        return { name: f, size: stat.size, createdAt: stat.birthtimeMs };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ files });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// Download a previously-saved PDF by filename from the active org's folder.
// GET /api/reports/files/:filename
router.get('/files/:filename', (req, res) => {
  try {
    if (!req.orgSlug) return res.status(400).json({ message: 'active organisation not resolved' });
    const fileName = path.basename(req.params.filename); // prevent path traversal
    const filePath = path.join(REPORT_LIST_ROOT, safeName(req.orgSlug), fileName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'file not found' });
    const buf = fs.readFileSync(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buf.length);
    return res.end(buf);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// GET /api/reports
// Only return reports that were generated as PDFs (have a file_path on disk),
// so the frontend table shows only auto-generated security reports.
router.get('/', async (req, res) => {
  try {
    const { rows } = await req.orgPool.query(
      'SELECT * FROM reports WHERE file_path IS NOT NULL ORDER BY created_at DESC'
    );
    res.json({ reports: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/reports
router.post('/', async (req, res) => {
  try {
    const { title, description, type, data, status } = req.body;
    if (!title) return res.status(400).json({ message: 'title is required' });

    const { rows } = await req.orgPool.query(
      `INSERT INTO reports (title, description, type, data, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, description || null, type || 'custom', data ? JSON.stringify(data) : null, status || 'draft', req.user.username || req.user.userId]
    );
    res.status(201).json({ report: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/reports/:id
router.delete('/:id', async (req, res) => {
  try {
    await req.orgPool.query('DELETE FROM reports WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
