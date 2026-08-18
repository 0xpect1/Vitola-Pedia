/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — AVATARS
   Three kinds, one string.

     "🥃"                     an emoji
     "mark:ember"             a drawn emblem from the set below
     "data:image/webp;base64…" an uploaded picture

   Storing all three as a single `avatar` string means nothing else in
   the lounge has to know the difference — every render site calls
   VPAvatar.render() and gets markup back.
   ══════════════════════════════════════════════════════════════════ */

const VPAvatar = (function () {
  'use strict';

  const S = 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  const wrap = d => `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" class="av-mark">${d}</svg>`;

  /* Heraldic rather than illustrative — these sit beside a handle as a
     seal would, and read at 24px as well as at 54px. */
  const MARKS = {
    ember:    wrap(`<circle cx="16" cy="18" r="6.4" ${S}/><circle cx="16" cy="18" r="2.6" fill="currentColor"/><path d="M16 8.4c2.4-1.6 1.4-3.8.2-4.8" ${S} opacity=".7"/>`),
    leaf:     wrap(`<path d="M16 27V13" ${S}/><path d="M16 14.6C16 9 12 5.4 5.6 5.4c0 5.6 4 9.2 10.4 9.2z" ${S}/><path d="M16 12.4c0-5 3.6-8.2 9.4-8.2 0 5-3.6 8.2-9.4 8.2z" ${S} opacity=".75"/>`),
    crest:    wrap(`<path d="M16 4.2 26 8v7.6c0 5.6-4 10-10 12.2C10 25.6 6 21.2 6 15.6V8z" ${S}/><path d="M16 10.6v9.8M11.8 15.4h8.4" ${S} opacity=".7"/>`),
    spade:    wrap(`<path d="M16 4.6c0 5-8.4 6.6-8.4 12.2A4.6 4.6 0 0 0 16 19a4.6 4.6 0 0 0 8.4-2.2C24.4 11.2 16 9.6 16 4.6z" ${S}/><path d="M16 19v6.4M12.6 27h6.8" ${S}/>`),
    anchor:   wrap(`<circle cx="16" cy="6.6" r="2.6" ${S}/><path d="M16 9.2V27" ${S}/><path d="M10 13.6h12" ${S}/><path d="M6.4 19.4c0 5 4.4 7.6 9.6 7.6s9.6-2.6 9.6-7.6" ${S}/>`),
    compass:  wrap(`<circle cx="16" cy="16" r="11.4" ${S}/><path d="m20.8 11.2-3 7.6-7.6 3 3-7.6z" ${S}/><circle cx="16" cy="16" r="1.3" fill="currentColor"/>`),
    horseshoe:wrap(`<path d="M9.4 26V16a6.6 6.6 0 0 1 13.2 0v10" ${S}/><path d="M9.4 26h3.4M19.2 26h3.4" ${S}/><circle cx="12" cy="12.4" r="1" fill="currentColor"/><circle cx="20" cy="12.4" r="1" fill="currentColor"/>`),
    key:      wrap(`<circle cx="11" cy="11" r="5.4" ${S}/><path d="M14.8 14.8 26 26" ${S}/><path d="M21.4 21.4l2.6-2.6M18.6 18.6l2.6-2.6" ${S}/>`),
    quill:    wrap(`<path d="M6 26c0-9 6-16 20-19-1.6 11-8 16-15 16z" ${S}/><path d="M6 26 14 18" ${S}/>`),
    hourglass:wrap(`<path d="M9 4.6h14M9 27.4h14" ${S}/><path d="M10.6 4.6v4L16 16l-5.4 7.4v4M21.4 4.6v4L16 16l5.4 7.4v4" ${S}/>`),
    ring:     wrap(`<circle cx="16" cy="16" r="11" ${S}/><circle cx="16" cy="16" r="6" ${S} opacity=".6"/><circle cx="16" cy="16" r="1.6" fill="currentColor"/>`),
    tower:    wrap(`<path d="M8.6 27V12l7.4-6 7.4 6v15z" ${S}/><path d="M13 27v-7h6v7" ${S}/><path d="M8.6 12h14.8" ${S} opacity=".6"/>`),
  };

  const MARK_IDS = Object.keys(MARKS);

  const EMOJI = ['🚬','🥃','🍷','☕','🔥','🌿','🎩','♠️','🦅','🐺','⚓','🎷','📚','🍺','🥂','🧭','🎻','🏆','🌹','🕯️'];

  const isMark   = v => typeof v === 'string' && v.startsWith('mark:');
  const isUpload = v => typeof v === 'string' && v.startsWith('data:image/');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* One call site for every avatar on the site. `alt` is used only for
     uploads, where a real image needs a real description. */
  function render(avatar, alt) {
    if (isUpload(avatar)) {
      return `<img class="av-photo" src="${esc(avatar)}" alt="${esc(alt || '')}" loading="lazy">`;
    }
    if (isMark(avatar)) {
      const m = MARKS[avatar.slice(5)];
      if (m) return m;
    }
    return `<span class="av-emoji">${esc(avatar || '🚬')}</span>`;
  }

  /* ── UPLOAD ─────────────────────────────────────────────────────
     Everything happens in the browser: the file is decoded, centre-
     cropped square, scaled to 160px and re-encoded. Nothing is
     uploaded anywhere, and the original never leaves the machine.
     The output is capped so it can't blow the localStorage budget or,
     later, a database row.
  ─────────────────────────────────────────────────────────────── */
  const MAX_INPUT = 12 * 1024 * 1024;   // refuse absurd files outright
  const OUT_SIZE  = 160;
  const MAX_BYTES = 60 * 1024;

  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file chosen.'));
      if (!/^image\//.test(file.type)) return reject(new Error('That file is not an image.'));
      if (file.size > MAX_INPUT) return reject(new Error('That image is very large — try one under 12MB.'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Couldn't read that file."));
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image couldn't be decoded."));
      img.src = src;
    });
  }

  async function fromFile(file) {
    const dataUrl = await readFile(file);
    const img = await loadImage(dataUrl);

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('That image has no dimensions.');

    const c = document.createElement('canvas');
    c.width = c.height = OUT_SIZE;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    // Centre crop to a square, then scale down.
    ctx.drawImage(img,
      (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
      0, 0, OUT_SIZE, OUT_SIZE);

    // WebP where supported, JPEG otherwise; step quality down until it fits.
    const type = c.toDataURL('image/webp', 0.5).startsWith('data:image/webp')
      ? 'image/webp' : 'image/jpeg';
    for (const q of [0.86, 0.74, 0.62, 0.5, 0.4]) {
      const out = c.toDataURL(type, q);
      if (out.length * 0.75 <= MAX_BYTES) return out;
    }
    throw new Error("Couldn't compress that image small enough — try a simpler picture.");
  }

  return { MARKS, MARK_IDS, EMOJI, render, fromFile, isMark, isUpload, OUT_SIZE };
})();
