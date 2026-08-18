/* Draw each logo to a canvas and measure the mean luminance of its
   non-transparent pixels. Light marks need a dark plate; dark marks need
   the cream one. Doing it in a browser handles PNG/WebP/JPG/SVG alike. */
const puppeteer = require('/Users/xc/Documents/GitHub/Cigar Picker/node_modules/puppeteer');
const fs = require('fs');
const SC = '/private/tmp/claude-501/-Users-xc-Documents-GitHub-Cigar-Picker/f7535c57-c820-402b-bddc-625cd59b1a0a/scratchpad';

(async () => {
  const kept = JSON.parse(fs.readFileSync(SC + '/logo-kept.json', 'utf8'));
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:8478/_sheet.html', { waitUntil: 'domcontentloaded' });

  const out = [];
  for (const r of kept) {
    const file = '/img/brands/' + r.file.split('/').pop();
    const m = await p.evaluate(async (src) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const ok = await new Promise(res => { img.onload = () => res(true); img.onerror = () => res(false); img.src = src; });
      if (!ok) return null;
      const W = 120, H = 120;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      const d = ctx.getImageData(0, 0, W, H).data;
      let sum = 0, n = 0, opaque = 0, total = W * H;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        if (a < 40) continue;
        opaque++;
        const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += lum; n++;
      }
      return n ? { lum: sum / n, coverage: opaque / total } : null;
    }, file);

    if (!m) { out.push({ ...r, plate: 'cream', lum: null }); continue; }
    // A mostly-opaque image is a solid rectangle (its own background) —
    // leave those on cream, the plate never shows anyway.
    const solid = m.coverage > 0.92;
    const plate = (!solid && m.lum > 150) ? 'dark' : 'cream';
    out.push({ ...r, plate, lum: Math.round(m.lum), coverage: +m.coverage.toFixed(2) });
    console.log(String(Math.round(m.lum)).padStart(3), (m.coverage * 100).toFixed(0).padStart(3) + '%', plate.padEnd(5), r.brand);
  }

  fs.writeFileSync(SC + '/logo-final.json', JSON.stringify(out, null, 1));
  console.log('\ndark plate:', out.filter(x => x.plate === 'dark').length, ' cream plate:', out.filter(x => x.plate === 'cream').length);
  await b.close();
})();
