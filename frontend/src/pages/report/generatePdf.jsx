import React from 'react';
import { pdf } from '@react-pdf/renderer';
import ReportTemplate from './ReportTemplate';

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