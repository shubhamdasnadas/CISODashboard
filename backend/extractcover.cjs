const fs = require('fs');
const p = 'C:/Users/Shubham/Downloads/techsec_global_private_ltd_security_report_2026-08-20 (12).pdf';
const buf = fs.readFileSync(p);
const data = buf.toString('latin1');
// page count
const pages = (data.match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log('Page objects (/Type /Page):', pages);
// MediaBox occurrences
const mb = data.match(/\/MediaBox\s*\[([^\]]+)\]/g);
console.log('MediaBoxes:', mb ? mb.slice(0, 12) : 'none');
// Count /Page (with kids?) — count "Type /Page" vs "Type /Pages"
const tp = (data.match(/\/Type\s*\/Pages/g) || []).length;
console.log('/Type /Pages:', tp);
// Look for image object placement on page 1: find first "/XObject"
const xo = data.indexOf('/XObject');
console.log('first /XObject at', xo, 'context:', data.slice(xo-60, xo+120).replace(/\n/g,' '));
// Check for text showing org name anywhere in raw (maybe as hex/encoded) — search literal
['Techsec','Security Report','CONFIDENTIAL','Confidential','2026'].forEach(t => {
  console.log(t, '->', data.includes(t));
});
