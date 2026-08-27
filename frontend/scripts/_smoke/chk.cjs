const esbuild = require('esbuild');
const path = require('path');
const React = require('react');
const root = path.resolve(__dirname, '..', '..');
(async () => {
  await esbuild.build({
    entryPoints: [path.join(root, 'src/pages/report/pdfChartComponents.jsx')],
    bundle: true, format: 'cjs', platform: 'node',
    loader: { '.jsx': 'jsx', '.js': 'jsx' }, jsx: 'automatic',
    logLevel: 'silent', outfile: path.join(root,'scripts','_smoke','chkBundle.cjs'),
    external: ['@react-pdf/renderer','react','react/jsx-runtime','react-dom'],
  });
  const C = require(path.join(root,'scripts','_smoke','chkBundle.cjs'));
  const { renderToBuffer } = await import('@react-pdf/renderer');
  const Doc = (el) => React.createElement(require(path.join(root,'node_modules','@react-pdf','renderer')).Document, null,
    React.createElement(require(path.join(root,'node_modules','@react-pdf','renderer')).Page, {size:'A4'}, el));
  const tests = {
    VGauge_empty: ()=>React.createElement(C.VGauge, {pct:0}),
    VGauge_undef: ()=>React.createElement(C.VGauge, {}),
    VMttrCard_undef: ()=>React.createElement(C.VMttrCard, {}),
    VFunnel_empty: ()=>React.createElement(C.VFunnel, {slices:[]}),
    VVolcano_empty: ()=>React.createElement(C.VVolcano, {buckets:[]}),
    VHeatmap_empty: ()=>React.createElement(C.VHeatmap, {matrix:[]}),
    VCorpMember_empty: ()=>React.createElement(C.VCorpMember, {data:[]}),
  };
  for (const [name, make] of Object.entries(tests)) {
    try { const b = await renderToBuffer(Doc(make())); console.log('OK  ', name, b.length); }
    catch(e){ console.log('FAIL', name, e.message); }
  }
})().catch(e=>console.error(e));
