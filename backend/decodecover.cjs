const fs = require('fs');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const raw = fs.readFileSync('cover_img_0.jpg');
const img = jpeg.decode(raw, { useTArray: true });
console.log('decoded', img.width, 'x', img.height);

// Image ~ the whole report stacked vertically. One A4 page ≈ 1520 image px tall.
// Page width 595.28 pt maps to image width 1073 -> scale = 595.28/1073 = 0.5553.
// So one page tall in image px = 841.89 / 0.5553 ≈ 1517.
const pageImgH = 1517;
const outW = 595, outH = 842;
const scaleX = img.width / outW; // ~1.804
const scaleY = pageImgH / outH;  // ~1.803

const png = new PNG({ width: outW, height: outH });
for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    const sx = Math.min(Math.floor(x * scaleX), img.width - 1);
    const sy = Math.min(Math.floor(y * scaleY), img.height - 1);
    const si = (sy * img.width + sx) * 4;
    const di = (y * outW + x) * 4;
    png.data[di] = img.data[si];
    png.data[di+1] = img.data[si+1];
    png.data[di+2] = img.data[si+2];
    png.data[di+3] = 255;
  }
}
fs.writeFileSync('cover_page1.png', PNG.sync.write(png));
console.log('wrote cover_page1.png', outW, 'x', outH);
