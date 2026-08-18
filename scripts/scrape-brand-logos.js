/* Find brand logos from each house's own website.
   Strategy per brand:
     1. Generate candidate domains from the brand name (+ a hand map for
        the ones whose domain isn't derivable).
     2. Fetch the homepage; follow redirects.
     3. Score every <img>/<link> candidate; prefer things that look like a
        header logo, prefer SVG, prefer "logo" in the path.
     4. Download the winner, sanity-check it's a real image.
   Writes results.json for review; downloads into img/brands/.
*/
const fs = require('fs');
const path = require('path');

const ROOT = '/Users/xc/Documents/GitHub/Cigar Picker';
const OUTDIR = path.join(ROOT, 'img/brands');
const SCRATCH = __dirname;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const brands = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'brands.json'), 'utf8'));

const norm = s => String(s).toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, 'and');

const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bare = s => norm(s).replace(/[^a-z0-9]/g, '');

/* Domains that can't be derived from the brand name. */
const MANUAL = {
  'Drew Estate': 'drewestate.com',
  'Montecristo': 'montecristocigars.com',
  'Romeo y Julieta': 'romeoyjulietacigars.com',
  'Arturo Fuente': 'arturofuente.com',
  'Rocky Patel': 'rockypatel.com',
  'H. Upmann': 'hupmann.com',
  'Joya de Nicaragua': 'joyacigars.com',
  'Espinosa Cigars': 'espinosacigars.com',
  'E.P. Carrillo': 'epcarrillo.com',
  'Partagás': 'partagas.com',
  'Padrón': 'padron.com',
  'Crowned Heads': 'crownedheads.com',
  'Dunbarton Tobacco & Trust': 'dunbartoncigars.com',
  'My Father Cigars': 'myfathercigars.com',
  'La Flor Dominicana': 'laflordominicana.com',
  'Foundation Cigar Co.': 'foundationcigarcompany.com',
  'Alec Bradley': 'alecbradley.com',
  'Oliva': 'olivacigar.com',
  'Perdomo': 'perdomocigars.com',
  'Davidoff': 'davidoffgeneva.com',
  'Camacho': 'camachocigars.com',
  'Cohiba': 'cohiba.com',
  'Macanudo': 'macanudo.com',
  'CAO': 'caocigars.com',
  'AVO': 'avocigars.com',
  'Gurkha': 'gurkhacigars.com',
  'Quesada': 'quesadacigars.com',
  'Punch': 'punchcigars.com',
  'Tatuaje': 'tatuajecigars.com',
  'Bolívar': 'bolivarcigars.com',
  'Ashton': 'ashtoncigar.com',
  'La Aroma de Cuba': 'laaromadecuba.com',
  'San Cristobal': 'sancristobalcigars.com',
  'Illusione': 'illusionecigars.com',
  'Herrera Esteli': 'drewestate.com',
  'Liga Privada': 'drewestate.com',
  'Undercrown': 'drewestate.com',
  'Acid': 'drewestate.com',
  'Warped': 'warpedcigars.com',
  'RoMa Craft': 'romacrafttobac.com',
  'RoMa Craft Tobac': 'romacrafttobac.com',
  'Aganorsa Leaf': 'aganorsaleaf.com',
  'Plasencia': 'plasenciacigars.com',
  'Nub': 'nubcigars.com',
  'Cain': 'olivacigar.com',
  'Diesel': 'dieselcigars.com',
  'Room101': 'room101brand.com',
  'Room 101': 'room101brand.com',
  'Southern Draw': 'southerndrawcigars.com',
  'Black Label Trading Co.': 'blacklabeltradingcompany.com',
  'Ezra Zion': 'ezrazioncigars.com',
  'Cornelius & Anthony': 'corneliusanthony.com',
  'Caldwell Cigar Co.': 'caldwellcigarco.com',
  'Caldwell': 'caldwellcigarco.com',
  'Hoyo de Monterrey': 'hoyodemonterrey.com',
  'Trinidad': 'trinidadcigars.com',
  'Vegas Robaina': 'habanos.com',
  'Ramón Allones': 'habanos.com',
  'Ramon Allones': 'habanos.com',
  'Sancho Panza': 'habanos.com',
  'Rafael Gonzalez': 'habanos.com',
  'Por Larrañaga': 'habanos.com',
  'Juan Lopez': 'habanos.com',
  'La Gloria Cubana': 'lagloriacubana.com',
  'Fonseca': 'habanos.com',
  'Quintero y Hno.': 'habanos.com',
  'Quintero y Hno': 'habanos.com',
  'La Flor de Caño': 'habanos.com',
  'La Flor de Cano': 'habanos.com',
  'Saint Luis Rey': 'habanos.com',
  'Diplomaticos': 'habanos.com',
  'El Rey del Mundo': 'habanos.com',
  'Vega Fina': 'vegafina.com',
  'VegaFina': 'vegafina.com',
  'Nat Sherman': 'natsherman.com',
  'Ace Prime': 'aceprimecigars.com',
  'ACE Prime': 'aceprimecigars.com',
  'Kristoff': 'kristoffcigars.com',
  'Xikar': 'xikar.com',
  'JC Newman': 'jcnewman.com',
  'J.C. Newman': 'jcnewman.com',
  'Brick House': 'jcnewman.com',
  'Diamond Crown': 'jcnewman.com',
  '*Oliva Serie V': 'olivacigar.com',
};

function candidates(brand) {
  const out = [];
  if (MANUAL[brand]) out.push(MANUAL[brand]);
  const b = bare(brand);
  const s = slug(brand);
  out.push(`${b}.com`, `${b}cigars.com`, `${b}cigar.com`, `${s}.com`, `${s}cigars.com`);
  return [...new Set(out)].slice(0, 5);
}

async function get(url, timeout = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,image/*,*/*' },
      redirect: 'follow', signal: ctl.signal,
    });
    return r;
  } catch (e) {
    return null;
  } finally { clearTimeout(t); }
}

function absolutize(src, base) {
  try { return new URL(src, base).href; } catch (e) { return null; }
}

/* Score a candidate image URL/attribute blob as "probably the site logo". */
function scoreCandidate(tag, url) {
  const t = tag.toLowerCase();
  const u = url.toLowerCase();
  let s = 0;
  if (/logo/.test(u)) s += 50;
  if (/logo/.test(t)) s += 30;
  if (/\bheader\b|site-header|navbar|brand/.test(t)) s += 12;
  if (/\.svg(\?|$)/.test(u)) s += 22;
  else if (/\.png(\?|$)/.test(u)) s += 12;
  else if (/\.webp(\?|$)/.test(u)) s += 8;
  else if (/\.(jpe?g)(\?|$)/.test(u)) s += 3;
  if (/sprite|icon-|favicon|placeholder|loader|spinner|payment|visa|mastercard|paypal|amex|discover|instagram|facebook|twitter|youtube|tiktok|badge|seal|award|flag/.test(u)) s -= 60;
  if (/footer/.test(t)) s -= 18;
  if (/apple-touch/.test(u)) s -= 10;
  return s;
}

function extractLogos(html, baseUrl) {
  const out = [];
  const imgTags = html.match(/<img[^>]*>/gi) || [];
  for (const tag of imgTags) {
    const m = tag.match(/(?:data-src|data-lazy-src|srcset|src)\s*=\s*["']([^"']+)["']/i);
    if (!m) continue;
    let src = m[1].split(/\s|,/)[0];
    const abs = absolutize(src, baseUrl);
    if (!abs || /^data:/.test(abs)) continue;
    out.push({ url: abs, score: scoreCandidate(tag, abs), tag: tag.slice(0, 120) });
  }
  // <link rel="...icon"> as a weak fallback
  const linkTags = html.match(/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/gi) || [];
  for (const tag of linkTags) {
    const m = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!m) continue;
    const abs = absolutize(m[1], baseUrl);
    if (!abs) continue;
    const sz = (tag.match(/sizes=["'](\d+)/i) || [])[1];
    out.push({ url: abs, score: -5 + (sz && Number(sz) >= 180 ? 12 : 0), tag: 'link-icon' });
  }
  return out.sort((a, b) => b.score - a.score);
}

const MIN_BYTES = 700;
const MAX_BYTES = 900 * 1024;

async function tryDownload(url, slugName) {
  const r = await get(url, 15000);
  if (!r || r.status !== 200) return null;
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (!/image\//.test(ct)) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < MIN_BYTES || buf.length > MAX_BYTES) return null;

  let ext = /svg/.test(ct) ? 'svg' : /png/.test(ct) ? 'png' : /webp/.test(ct) ? 'webp'
    : /jpe?g/.test(ct) ? 'jpg' : null;
  if (!ext) return null;
  // An SVG that is really an HTML error page
  if (ext === 'svg' && !/<svg/i.test(buf.toString('utf8').slice(0, 2000))) return null;

  const file = path.join(OUTDIR, `${slugName}.${ext}`);
  fs.writeFileSync(file, buf);
  return { file: `img/brands/${slugName}.${ext}`, bytes: buf.length, ct, url };
}

async function processBrand(entry) {
  const { brand } = entry;
  const s = slug(brand);
  for (const domain of candidates(brand)) {
    for (const scheme of ['https://www.', 'https://']) {
      const home = scheme + domain;
      const r = await get(home);
      if (!r || r.status !== 200) continue;
      const ctype = (r.headers.get('content-type') || '');
      if (!/text\/html/i.test(ctype)) continue;
      const html = await r.text();
      if (html.length < 500) continue;

      const cands = extractLogos(html, r.url).filter(c => c.score > 0).slice(0, 6);
      for (const c of cands) {
        const dl = await tryDownload(c.url, s);
        if (dl) return { brand, slug: s, domain, site: r.url, ...dl, score: c.score };
      }
      return { brand, slug: s, domain, site: r.url, error: 'no usable logo on page',
               tried: cands.slice(0, 3).map(c => c.url) };
    }
  }
  return { brand, slug: s, error: 'no reachable site' };
}

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const results = [];
  const CONCURRENCY = 6;
  let i = 0;

  async function worker() {
    while (i < brands.length) {
      const entry = brands[i++];
      const res = await processBrand(entry).catch(e => ({ brand: entry.brand, error: e.message }));
      results.push(res);
      const mark = res.file ? '✓' : '·';
      console.log(`${mark} ${String(results.length).padStart(3)}/${brands.length} ${entry.brand} → ${res.file || res.error}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fs.writeFileSync(path.join(SCRATCH, 'logo-results.json'), JSON.stringify(results, null, 1));
  const ok = results.filter(r => r.file);
  console.log(`\nDONE: ${ok.length}/${brands.length} logos downloaded`);
})();
