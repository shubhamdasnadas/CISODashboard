import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import React from 'react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'scripts', '_smoke', 'diagBundle.cjs');

await build({
  entryPoints: [path.join(root, 'src/pages/report/pdfChartComponents.jsx')],
  bundle: true, format: 'cjs', platform: 'node',
  loader: { '.jsx': 'jsx', '.js': 'jsx' }, jsx: 'automatic', logLevel: 'silent',
  outfile: OUT,
  external: ['@react-pdf/renderer', 'react', 'react/jsx-runtime', 'react-dom'],
  alias: { react: 'react' },
});

const mod = await import(pathToFileURL(OUT).href);
const bundle = mod.default;
const C = bundle;

const { renderToBuffer } = await import('@react-pdf/renderer');
const { Document, Page, View } = await import('@react-pdf/renderer');

const h = React.createElement;
const charts = {
  VDonut: h(C.VDonut, { data: [{ name: 'A', value: 3 }, { name: 'B', value: 7 }], width: 130, height: 130 }),
  VBarChart: h(C.VBarChart, { data: [{ name: 'x', value: 5 }, { name: 'y', value: 9 }] }),
  VLineChart: h(C.VLineChart, { data: [{ date: 'd1', avg: 3 }, { date: 'd2', avg: 8 }] }),
  VHBarList: h(C.VHBarList, { data: [{ name: 'a', value: 4 }, { name: 'b', value: 2 }] }),
  VGauge: h(C.VGauge, { pct: 72 }),
};

for (const [name, node] of Object.entries(charts)) {
  try {
    const buf = await renderToBuffer(
      h(Document, null, h(Page, { size: 'A4' }, h(View, { style: { padding: 20 } }, node))));
    console.log(`OK   ${name} -> ${buf.length} bytes`);
  } catch (e) {
    console.log(`FAIL ${name} -> ${e.message}`);
  }
}
writeFileSync(path.join(root, 'scripts', '_smoke', 'diag.pdf'), Buffer.from(''));
console.log('done');
