import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// @react-pdf/renderer ships a Node build (lib/react-pdf.js) and a browser
// build (lib/react-pdf.browser.js) selected via the package's `browser` field.
// Vite prefers `module`/`exports` and ignores the `browser` field, so it loads
// the Node build — whose renderToBuffer/renderToFile stubs throw "Node specific
// API" at runtime. Alias the package to the browser build explicitly, and give
// it the globals its pdfkit engine needs in the browser.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@react-pdf/renderer',
        replacement: fileURLToPath(new URL('./node_modules/@react-pdf/renderer/lib/react-pdf.browser.js', import.meta.url)),
      },
      // 'buffer' polyfill used by @react-pdf/pdfkit — bundled directly.
      { find: 'buffer/', replacement: 'buffer/' },
      { find: 'buffer', replacement: 'buffer/' },
    ],
  },
  define: {
    // pdfkit references process.env.NODE_ENV in a couple of spots.
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    // Provide a minimal `window.process` for any UA sniffing inside react-pdf.
    'global': 'globalThis',
  },
  optimizeDeps: {
    include: ['@react-pdf/renderer', 'react', 'react-dom'],
    esbuildOptions: {
      define: { global: 'globalThis' },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // your actual backend port
        changeOrigin: true,
      },
    },
  },
});