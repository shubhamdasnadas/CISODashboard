const puppeteer = require('puppeteer');

/**
 * Render the live Analytics page to a pixel-perfect PDF via headless Chrome (Puppeteer).
 *
 * @param {object} params
 * @param {string} params.token - JWT session token of the requesting user
 * @param {string} params.orgSlug - Active organisation slug
 * @param {number|string} params.orgId - Numeric ID of active organisation
 * @param {string} params.orgName - Active organisation display name
 * @param {object} [params.user] - User object
 * @param {string} [params.section] - Active section or 'all'
 * @param {string} [params.from] - Date filter start (YYYY-MM-DD)
 * @param {string} [params.to] - Date filter end (YYYY-MM-DD)
 * @param {string} [params.dayPreset] - Preset (e.g. '7D', '10D', '30D')
 * @param {object} [params.chartViews] - Custom chart type map per widget
 * @returns {Promise<Buffer>} PDF Buffer
 */
async function generateLiveAnalyticsPdf({
  token,
  orgSlug,
  orgId,
  orgName,
  user,
  section = 'all',
  from,
  to,
  dayPreset,
  chartViews = {},
  theme = 'dark',
}) {
  const baseUrl = process.env.APP_URL || 'http://localhost:5173';
  const query = new URLSearchParams();
  if (token) query.set('token', token);
  if (orgSlug) query.set('orgSlug', orgSlug);
  if (orgId) query.set('orgId', String(orgId));
  if (orgName) query.set('orgName', orgName);
  if (section) query.set('section', section);
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  if (dayPreset) query.set('dayPreset', String(dayPreset));
  if (theme) query.set('theme', theme);
  if (chartViews && Object.keys(chartViews).length > 0) {
    query.set('chartViews', JSON.stringify(chartViews));
  }
  query.set('print', 'true');

  const targetUrl = `${baseUrl}/analytics-print?${query.toString()}`;
  console.log('[Puppeteer] Launching headless browser for URL:', targetUrl);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--font-render-hinting=medium',
    ],
  });

  try {
    const page = await browser.newPage();
    // A3 Landscape resolution at 2x DPI for crisp vectors and text
    await page.setViewport({ width: 1754, height: 1240, deviceScaleFactor: 2 });

    // Enable detailed diagnostics from headless Chrome
    page.on('console', (msg) => {
      const txt = msg.text();
      if (!txt.includes('Download the React DevTools')) {
        console.log('[Puppeteer Console]', msg.type(), txt);
      }
    });
    page.on('pageerror', (err) => console.error('[Puppeteer PageError]', err.message));
    page.on('requestfailed', (req) => {
      console.warn('[Puppeteer RequestFailed]', req.url(), req.failure()?.errorText);
    });

    // Set HTTP headers directly on the headless browser session
    const extraHeaders = {};
    if (token) extraHeaders['Authorization'] = `Bearer ${token}`;
    if (orgId) extraHeaders['X-Org-Id'] = String(orgId);
    if (orgSlug) extraHeaders['X-Org-Slug'] = String(orgSlug);
    if (Object.keys(extraHeaders).length > 0) {
      await page.setExtraHTTPHeaders(extraHeaders);
    }

    // Pre-populate session storage and local storage with authentication, numeric org ID, and theme
    await page.evaluateOnNewDocument((tokenVal, orgSlugVal, orgIdVal, userObj, chartViewsObj, themeVal) => {
      const sessId = 'print_session';
      sessionStorage.setItem('ciso_active_session', sessId);
      if (tokenVal) {
        localStorage.setItem(`ciso_s_${sessId}_token`, tokenVal);
        localStorage.setItem('ciso_token', tokenVal);
        localStorage.setItem('token', tokenVal);
      }
      if (orgIdVal) {
        localStorage.setItem(`ciso_s_${sessId}_org`, String(orgIdVal));
        localStorage.setItem('ciso_current_org_id', String(orgIdVal));
        localStorage.setItem('ciso_org_id', String(orgIdVal));
        localStorage.setItem('currentOrg', String(orgIdVal));
      }
      if (orgSlugVal) {
        localStorage.setItem(`ciso_s_${sessId}_org_slug`, String(orgSlugVal));
        localStorage.setItem('ciso_org_slug', String(orgSlugVal));
      }
      if (userObj) {
        localStorage.setItem(`ciso_s_${sessId}_user`, JSON.stringify(userObj));
        localStorage.setItem('ciso_user', JSON.stringify(userObj));
      }
      if (chartViewsObj && typeof chartViewsObj === 'object') {
        Object.entries(chartViewsObj).forEach(([k, v]) => {
          if (k && v) localStorage.setItem(k, v);
        });
      }
      if (themeVal === 'light') {
        localStorage.setItem('theme', 'light');
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        localStorage.setItem('theme', 'dark');
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    }, token, orgSlug, orgId, user, chartViews, theme);

    // Navigate to print page (domcontentloaded avoids hanging on Vite HMR WebSocket)
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait until the report signals that all API data & charts have rendered
    try {
      await page.waitForFunction(
        () => window.__REPORT_READY__ === true || document.body.getAttribute('data-report-ready') === 'true',
        { timeout: 30000 }
      );
    } catch (waitErr) {
      console.warn('[Puppeteer] Timeout waiting for __REPORT_READY__, proceeding with current render state:', waitErr.message);
    }

    // Give a brief pause for SVG layout settlement
    await new Promise((r) => setTimeout(r, 800));

    // Capture PDF in A3 landscape
    const pdfBuffer = await page.pdf({
      format: 'A3',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '10mm',
        bottom: '10mm',
        left: '10mm',
        right: '10mm',
      },
    });

    console.log(`[Puppeteer] Successfully generated PDF (${pdfBuffer.length} bytes)`);
    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

module.exports = { generateLiveAnalyticsPdf };
