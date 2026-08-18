/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — ICON SET
   Drawn marks rather than emoji.

   Emoji are the fastest way to make a considered site look assembled
   from a template: they carry another vendor's illustration style, they
   render differently on every platform, and they cannot inherit colour
   or stroke weight. These are thin-stroke line marks on a 24-grid that
   take currentColor, so they sit in the type rather than on top of it.
   ══════════════════════════════════════════════════════════════════ */

const VPIcons = (function () {
  'use strict';

  const svg = (d, extra) =>
    `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="vpi">${extra || ''}${d}</svg>`;

  const S = 'stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';

  const ICONS = {
    /* A lit cigar, seen side on — the house mark. */
    cigar: svg(`<path d="M3 13.6h13.2a2.4 2.4 0 0 0 0-4.8H3z" ${S}/>
                <path d="M16.2 8.8h2.2a2.4 2.4 0 0 1 0 4.8h-2.2" ${S}/>
                <path d="M20.6 11.2h1.2" ${S}/>
                <path d="M6.4 8.8v4.8M9.4 8.8v4.8" ${S} opacity=".45"/>
                <path d="M19.4 6.4c.9-.7.4-1.7-.2-2.3" ${S} opacity=".6"/>`),

    pipe: svg(`<path d="M3 10v3a5 5 0 0 0 5 5h1a5 5 0 0 0 5-5v-3z" ${S}/>
               <path d="M14 10h5a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4h-2" ${S}/>
               <path d="M6 7c.8-.8.4-1.9-.3-2.6" ${S} opacity=".6"/>`),

    /* Taste families */
    coffee: svg(`<path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" ${S}/>
                 <path d="M16 9.5h2.2a2.3 2.3 0 0 1 0 4.6H16" ${S}/>
                 <path d="M7.5 4.6c.7.7.7 1.5 0 2.2M11.5 4.6c.7.7.7 1.5 0 2.2" ${S} opacity=".6"/>`),
    cream:  svg(`<path d="M7 10a5 5 0 0 1 10 0" ${S}/>
                 <path d="M6.2 10.6h11.6L15.4 20H8.6z" ${S}/>
                 <path d="M9.6 14h4.8" ${S} opacity=".5"/>`),
    nuts:   svg(`<path d="M12 3.6c3.2 2 5 4.9 5 8.1 0 3.3-2.2 5.7-5 5.7s-5-2.4-5-5.7c0-3.2 1.8-6.1 5-8.1z" ${S}/>
                 <path d="M12 7.4v9M9.6 10.4c1.2.6 1.8 1.6 2.4 2.6M14.4 10.4c-1.2.6-1.8 1.6-2.4 2.6" ${S} opacity=".55"/>`),
    pepper: svg(`<path d="M8 9h8l-1 9a2 2 0 0 1-2 1.8h-2A2 2 0 0 1 9 18z" ${S}/>
                 <path d="M9.4 9V6.6a2.6 2.6 0 0 1 5.2 0V9" ${S}/>
                 <path d="M11 13v3M13 13v3" ${S} opacity=".5"/>`),
    wood:   svg(`<path d="M12 3.4 18.4 15H5.6z" ${S}/>
                 <path d="M12 8.6 15.8 15H8.2z" ${S} opacity=".5"/>
                 <path d="M12 15v5.2M9.6 20.2h4.8" ${S}/>`),
    fruit:  svg(`<circle cx="9.6" cy="14.4" r="4.6" ${S}/>
                 <circle cx="15" cy="11.4" r="3.6" ${S} opacity=".65"/>
                 <path d="M11.4 9.6c.4-2.6 1.8-4.4 4-5.2" ${S}/>`),

    /* Drinks */
    whiskey: svg(`<path d="M6.6 8h10.8l-1 10.2a2 2 0 0 1-2 1.8h-4.8a2 2 0 0 1-2-1.8z" ${S}/>
                  <path d="M7.3 14h9.4" ${S} opacity=".5"/>
                  <path d="M9 4.6c.8.8.8 1.7 0 2.4M13 3.8c.9.9.9 2 0 2.8" ${S} opacity=".5"/>`),
    rum:     svg(`<path d="M9.5 3.6h5v3l2.2 3.4a4 4 0 0 1 .6 2.1v6a1.8 1.8 0 0 1-1.8 1.8H8.5a1.8 1.8 0 0 1-1.8-1.8v-6c0-.75.2-1.48.6-2.1L9.5 6.6z" ${S}/>
                  <path d="M7.3 13.4h9.4" ${S} opacity=".5"/>`),
    beer:    svg(`<path d="M5.6 8.6h9.8V19a1.6 1.6 0 0 1-1.6 1.6H7.2A1.6 1.6 0 0 1 5.6 19z" ${S}/>
                  <path d="M15.4 10.6h2.2a2 2 0 0 1 2 2v2.4a2 2 0 0 1-2 2h-2.2" ${S}/>
                  <path d="M5.6 8.6a2.4 2.4 0 0 1 1.6-4 2.6 2.6 0 0 1 4.2-1 2.4 2.4 0 0 1 4 2.2 2.2 2.2 0 0 1 0 2.8" ${S}/>`),
    wine:    svg(`<path d="M7.4 3.6h9.2l-.7 6a4 4 0 0 1-4 3.6 4 4 0 0 1-4-3.6z" ${S}/>
                  <path d="M12 13.2v6M9 19.6h6" ${S}/>`),
    water:   svg(`<path d="M12 3.4c3.4 4 5.4 6.9 5.4 9.6A5.4 5.4 0 0 1 12 18.4a5.4 5.4 0 0 1-5.4-5.4c0-2.7 2-5.6 5.4-9.6z" ${S}/>
                  <path d="M9.4 13.4a2.6 2.6 0 0 0 2.6 2.4" ${S} opacity=".55"/>`),

    /* Time */
    clockShort: svg(`<circle cx="12" cy="12.6" r="7.6" ${S}/><path d="M12 8.6v4l2.6 1.6" ${S}/><path d="M9.6 2.8h4.8" ${S}/>`),
    clockHour:  svg(`<circle cx="12" cy="12.6" r="7.6" ${S}/><path d="M12 7.6v5l3.4 2" ${S}/>`),
    moon:       svg(`<path d="M19 14.6A7.8 7.8 0 0 1 9.2 4.9a7.9 7.9 0 1 0 9.8 9.7z" ${S}/>
                     <path d="M17.4 4.2l.5 1.6 1.6.5-1.6.5-.5 1.6-.5-1.6-1.6-.5 1.6-.5z" ${S} opacity=".6"/>`),

    /* Budget */
    coin:  svg(`<circle cx="12" cy="12" r="8" ${S}/><path d="M12 7.6v8.8M14.2 9.6c-.5-.7-1.3-1-2.2-1-1.3 0-2.2.7-2.2 1.7 0 2.4 4.6 1.3 4.6 3.7 0 1-1 1.7-2.4 1.7-1 0-1.8-.35-2.3-1" ${S}/>`),
    card:  svg(`<rect x="3" y="6" width="18" height="12" rx="2.2" ${S}/><path d="M3 10h18" ${S}/><path d="M6.4 14.4h3.2" ${S} opacity=".6"/>`),
    crown: svg(`<path d="M4 8.4l3 3.4 3.4-5.2 3.2 5.2 3.4-3.4 1.4 9.6H5.4z" ${S}/><path d="M6.6 20h10.8" ${S}/>`),

    /* Experience */
    seedling: svg(`<path d="M12 20.4v-7.2" ${S}/>
                   <path d="M12 13.2C12 9.8 9.4 7.4 5.6 7.4c0 3.4 2.6 5.8 6.4 5.8z" ${S}/>
                   <path d="M12 12c0-3.1 2.4-5.4 6-5.4 0 3.1-2.4 5.4-6 5.4z" ${S} opacity=".7"/>`),
    flame:    svg(`<path d="M12 20.4c3.1 0 5.4-2.2 5.4-5.2 0-4.2-4.2-5.6-3.4-11.2-3 1.6-5 4.6-5 8 0 1.1.3 2 .9 2.8-.5-.3-1.1-1-1.4-1.9-1 1.2-1.5 2.6-1.5 4 0 2.3 2 3.5 5 3.5z" ${S}/>`),
    trophy:   svg(`<path d="M8 4.4h8v5a4 4 0 0 1-8 0z" ${S}/>
                   <path d="M8 6h-2.4a2 2 0 0 0 0 4H8M16 6h2.4a2 2 0 0 1 0 4H16" ${S}/>
                   <path d="M12 13.4v3.6M9 20h6" ${S}/>`),

    /* Bodies — one glyph, filled progressively, so the scale reads as a scale */
    body: n => svg(
      Array.from({ length: 5 }, (_, i) =>
        `<rect x="${2.4 + i * 4.2}" y="${14.4 - i * 2.2}" width="2.8" height="${5 + i * 2.2}" rx="1"
           ${i < n ? 'fill="currentColor"' : `${S} opacity=".35"`}/>`).join('')),

    search: svg(`<circle cx="11" cy="11" r="7" ${S}/><path d="M16.4 16.4 21 21" ${S}/>`),
    dice:   svg(`<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4" ${S}/>
                 <circle cx="8.6" cy="8.6" r="1.2" fill="currentColor"/><circle cx="15.4" cy="8.6" r="1.2" fill="currentColor"/>
                 <circle cx="12" cy="12" r="1.2" fill="currentColor"/>
                 <circle cx="8.6" cy="15.4" r="1.2" fill="currentColor"/><circle cx="15.4" cy="15.4" r="1.2" fill="currentColor"/>`),
  };

  return {
    get(name) { return ICONS[name] || ICONS.cigar; },
    body(n) { return ICONS.body(n); },
    all: ICONS,
  };
})();
