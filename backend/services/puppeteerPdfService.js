const fs = require('fs');
const puppeteer = require('puppeteer');

/**
 * Gather potential Chrome / Chromium executable paths.
 */
function getCandidateExecutablePaths() {
  const candidates = [];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  }
  if (process.env.CHROME_BIN) {
    candidates.push(process.env.CHROME_BIN);
  }

  // Common Linux Chrome / Chromium paths
  const commonLinuxPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/chromium/chrome',
  ];
  for (const p of commonLinuxPaths) {
    if (fs.existsSync(p) && !candidates.includes(p)) {
      candidates.push(p);
    }
  }

  // Also allow Puppeteer's default bundled browser as a candidate
  candidates.push(undefined);
  return candidates;
}

/**
 * Attempt to launch Puppeteer safely across candidate executable paths.
 */
async function launchBrowserSafely() {
  const candidates = getCandidateExecutablePaths();
  const baseArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-first-run',
    '--safebrowsing-disable-auto-update',
    '--disable-web-security',
    '--allow-running-insecure-content',
    '--font-render-hinting=medium',
    '--disable-features=IsolateOrigins,site-per-process,AudioServiceOutOfProcess',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-domain-reliability',
    '--disable-ipc-flooding-protection',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
    '--force-color-profile=srgb',
  ];

  let lastError = null;

  for (const executablePath of candidates) {
    try {
      const launchOptions = {
        headless: true,
        args: baseArgs,
        ignoreHTTPSErrors: true,
      };
      if (executablePath) {
        launchOptions.executablePath = executablePath;
      }

      console.log('[Puppeteer] Attempting browser launch with executable:', executablePath || 'bundled default');
      const browser = await puppeteer.launch(launchOptions);
      console.log('[Puppeteer] Successfully launched browser process.');
      return browser;
    } catch (err) {
      lastError = err;
      console.warn(`[Puppeteer] Launch failed with executable "${executablePath || 'bundled default'}":`, err.message);
    }
  }

  console.error(
    '[Puppeteer] Fatal: Failed to launch headless Chrome/Chromium on this machine.\n' +
    'If running on Linux, ensure required system libraries are installed:\n' +
    '  sudo apt-get update && sudo apt-get install -y \\\n' +
    '    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \\\n' +
    '    libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 \\\n' +
    '    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \\\n' +
    '    libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \\\n' +
    '    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 chromium-browser\n'
  );

  throw new Error(
    `Puppeteer browser launch failed (missing Linux OS libraries or Chromium): ${lastError?.message || 'unknown error'}`
  );
}

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
  baseUrl,
  token,
  orgSlug,
  orgId,
  orgName,
  user,
  section = 'all',
  from,
  to,
  dayPreset,
  isCustom,
  periodLabel,
  chartViews = {},
  theme = 'dark',
}) {
  const resolvedBaseUrl = (baseUrl || process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const query = new URLSearchParams();
  if (token && token !== 'undefined' && token !== 'null') query.set('token', token);
  if (orgSlug && orgSlug !== 'undefined' && orgSlug !== 'null') query.set('orgSlug', orgSlug);
  if (orgId && orgId !== 'undefined' && orgId !== 'null') query.set('orgId', String(orgId));
  if (orgName && orgName !== 'undefined' && orgName !== 'null') query.set('orgName', orgName);
  if (section && section !== 'undefined' && section !== 'null') query.set('section', section);
  if (from && from !== 'undefined' && from !== 'null') query.set('from', from);
  if (to && to !== 'undefined' && to !== 'null') query.set('to', to);
  if (dayPreset != null && dayPreset !== 'undefined' && dayPreset !== 'null') query.set('dayPreset', String(dayPreset));
  if (isCustom) query.set('isCustom', 'true');
  if (periodLabel && periodLabel !== 'undefined' && periodLabel !== 'null') query.set('periodLabel', periodLabel);
  if (theme && theme !== 'undefined' && theme !== 'null') query.set('theme', theme);
  if (chartViews && Object.keys(chartViews).length > 0) {
    query.set('chartViews', JSON.stringify(chartViews));
  }
  query.set('print', 'true');

  const targetUrl = `${resolvedBaseUrl}/analytics-print?${query.toString()}`;
  console.log('[Puppeteer] Target print URL:', targetUrl);

  const browser = await launchBrowserSafely();

  try {
    const page = await browser.newPage();
    // A3 Landscape resolution (1x DPI avoids Linux headless OOM crash on Page.printToPDF)
    await page.setViewport({ width: 1754, height: 1240, deviceScaleFactor: 1 });

    // Emulate screen media so dark theme backgrounds & colors render as intended
    await page.emulateMediaType('screen');

    // Enable detailed diagnostics from headless Chrome
    page.on('console', (msg) => {
      const txt = msg.text();
      if (!txt.includes('Download the React DevTools')) {
        console.log('[Puppeteer Console]', msg.type(), txt);
      }
    });
    page.on('pageerror', (err) => console.error('[Puppeteer PageError]', err.message));
    page.on('requestfailed', (req) => {
      const errText = req.failure()?.errorText || '';
      if (errText && errText !== 'net::ERR_ABORTED') {
        console.warn('[Puppeteer RequestFailed]', req.url(), errText);
      }
    });

    // Set HTTP headers directly on the headless browser session
    const extraHeaders = {};
    if (token && token !== 'undefined' && token !== 'null') extraHeaders['Authorization'] = `Bearer ${token}`;
    if (orgId && orgId !== 'undefined' && orgId !== 'null') extraHeaders['X-Org-Id'] = String(orgId);
    if (orgSlug && orgSlug !== 'undefined' && orgSlug !== 'null') extraHeaders['X-Org-Slug'] = String(orgSlug);
    if (Object.keys(extraHeaders).length > 0) {
      await page.setExtraHTTPHeaders(extraHeaders);
    }

    // Pre-populate session storage and local storage with authentication, numeric org ID, and theme
    await page.evaluateOnNewDocument((tokenVal, orgSlugVal, orgIdVal, userObj, chartViewsObj, themeVal) => {
      try {
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
          const userStr = typeof userObj === 'string' ? userObj : JSON.stringify(userObj);
          localStorage.setItem(`ciso_s_${sessId}_user`, userStr);
          localStorage.setItem('ciso_user', userStr);
        }
        if (chartViewsObj && typeof chartViewsObj === 'object') {
          Object.entries(chartViewsObj).forEach(([k, v]) => {
            if (k && v) localStorage.setItem(k, v);
          });
        }
        localStorage.setItem('theme', themeVal === 'light' ? 'light' : 'dark');
      } catch (err) {
        // non-fatal
      }
    }, token, orgSlug, orgId, user, chartViews, theme);

    // Navigate to print page (domcontentloaded avoids hanging on Vite HMR WebSocket)
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Apply theme class safely after DOM is loaded
    try {
      await page.evaluate((themeVal) => {
        if (document && document.documentElement) {
          if (themeVal === 'light') {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
          } else {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
          }
        }
      }, theme);
    } catch (e) {
      // non-fatal
    }

    // Wait until the report signals that all API data & charts have rendered
    try {
      await page.waitForFunction(
        () => Boolean(window.__REPORT_READY__ === true || (document.body && document.body.getAttribute('data-report-ready') === 'true')),
        { timeout: 8000, polling: 100 }
      );
    } catch (waitErr) {
      console.warn('[Puppeteer] Fast-forwarding to render state:', waitErr.message);
    }

    // Disable all CSS animations and transitions, and ensure html/body/#root have height: auto and overflow: visible for multi-page flow
    try {
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            -webkit-animation: none !important;
            animation: none !important;
            -webkit-transition: none !important;
            transition: none !important;
          }
          html, body, #root {
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            max-width: none !important;
          }
          .pdf-print-container {
            height: auto !important;
            min-height: 100vh !important;
            overflow: visible !important;
          }
          .print-page-break, .pdf-print-section {
            page-break-after: always !important;
            break-after: page !important;
            display: block !important;
          }
          .pdf-print-subpage {
            page-break-before: always !important;
            break-before: page !important;
            display: block !important;
          }
          .pdf-print-container section {
            break-inside: auto !important;
            page-break-inside: auto !important;
          }
          .pdf-print-section:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        `,
      });
    } catch (styleErr) {
      // non-fatal
    }

    // Give a brief pause for SVG layout settlement
    await new Promise((r) => setTimeout(r, 600));

    // Capture PDF in A3 landscape
    const pdfBuffer = await page.pdf({
      format: 'A3',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: false,
      margin: {
        top: '10mm',
        bottom: '10mm',
        left: '10mm',
        right: '10mm',
      },
      timeout: 60000,
    });

    console.log(`[Puppeteer] Successfully generated PDF (${pdfBuffer.length} bytes)`);
    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.warn('[Puppeteer] Error closing browser:', closeErr.message);
      }
    }
  }
}

module.exports = { generateLiveAnalyticsPdf };
