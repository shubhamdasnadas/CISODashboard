import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

// Polyfill Buffer for @react-pdf/renderer: pdfkit's browser build checks
// `typeof Buffer` and throws "Blob is not supported" when it's missing.
import { Buffer } from 'buffer';
if (!globalThis.Buffer) globalThis.Buffer = Buffer;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);