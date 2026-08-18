/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — ANALYTICS
   ══════════════════════════════════════════════════════════════════

   One interface, swappable providers. Nothing here loads or sends
   anything until a provider is configured below, so the site ships with
   no third-party requests by default.

   ── A LIMITATION WORTH KNOWING ────────────────────────────────────
   Cloudflare Web Analytics counts *pageviews only*. It exposes no
   JavaScript API, so custom events ("picker completed", "buy link
   clicked") cannot reach it. They are recorded here and held in a
   local ring buffer regardless, so:

     • VPAnalytics.recent() shows them in the console right away
     • adding Plausible, GA4 or Cloudflare Zaraz later starts sending
       them with no further changes to any calling code

   The two ways to actually collect events:
     1. Cloudflare Zaraz — free, but needs the domain proxied through
        Cloudflare (DNS moved, orange cloud). Then zaraz.track() works.
     2. Plausible — ~$9/mo, custom events out of the box.
   ══════════════════════════════════════════════════════════════════ */

const VPAnalytics = (function () {
  'use strict';

  const CONFIG = {
    /* Cloudflare Web Analytics.
       Dashboard → Analytics & Logs → Web Analytics → Add a site.
       It hands you a token; paste it here. No DNS change required. */
    cloudflareToken: '463a1d0b0ffc46959a25955c1eb71d7e',

    /* Optional extras — leave null unless you add them. */
    plausibleDomain: null,     // e.g. 'vitolapedia.com'
    zaraz: false,              // true once the domain is proxied by Cloudflare

    debug: false,              // log every hit to the console
  };

  const RING = 60;
  const recent = [];
  let lastPath = null;

  function remember(kind, name, props) {
    recent.push({ kind, name, props: props || null, at: Date.now() });
    if (recent.length > RING) recent.shift();
    if (CONFIG.debug) console.log('[analytics]', kind, name, props || '');
  }

  /* ── PAGEVIEWS ──────────────────────────────────────────────────
     Cloudflare's beacon watches the History API, so a real pushState
     is what registers. Views and cigar modals are genuine navigation
     and already push; this only reports what happened.
  ─────────────────────────────────────────────────────────────── */
  function pageview(path, title) {
    if (path === lastPath) return;      // don't double-count a re-render
    lastPath = path;
    remember('pageview', path);

    if (CONFIG.plausibleDomain && window.plausible) {
      window.plausible('pageview', { u: location.origin + path });
    }
    if (CONFIG.zaraz && window.zaraz && window.zaraz.track) {
      window.zaraz.track('pageview', { path, title: title || document.title });
    }
  }

  /* ── EVENTS ─────────────────────────────────────────────────────
     Always recorded locally; forwarded to whichever provider can
     actually take them. Cloudflare Web Analytics cannot, by design.
  ─────────────────────────────────────────────────────────────── */
  function track(name, props) {
    remember('event', name, props);

    if (window.plausible) window.plausible(name, { props: props || {} });
    if (CONFIG.zaraz && window.zaraz && window.zaraz.track) window.zaraz.track(name, props || {});
  }

  /* ── LOADERS ────────────────────────────────────────────────── */
  function load() {
    if (CONFIG.cloudflareToken) {
      const s = document.createElement('script');
      s.defer = true;
      s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
      s.setAttribute('data-cf-beacon', JSON.stringify({ token: CONFIG.cloudflareToken }));
      document.head.appendChild(s);
    }
    if (CONFIG.plausibleDomain) {
      const s = document.createElement('script');
      s.defer = true;
      s.dataset.domain = CONFIG.plausibleDomain;
      s.src = 'https://plausible.io/js/script.manual.js';
      document.head.appendChild(s);
      window.plausible = window.plausible || function () {
        (window.plausible.q = window.plausible.q || []).push(arguments);
      };
    }
  }

  /* ── INSTRUMENTATION ────────────────────────────────────────────
     Wrapping rather than editing each feature keeps the tracking in
     one file, and means removing analytics is deleting one script tag.
  ─────────────────────────────────────────────────────────────── */
  function instrument() {
    const wrap = (name, before) => {
      const orig = window[name];
      if (typeof orig !== 'function') return;
      window[name] = function (...args) {
        const out = orig.apply(this, args);
        try { before(...args); } catch (e) { /* never break the site for a metric */ }
        return out;
      };
    };

    wrap('switchView', view => pageview('/' + view, document.title));

    wrap('openModal', id => {
      const c = (typeof CIGARS !== 'undefined' ? CIGARS : []).find(x => x.id === id);
      pageview('/cigar/' + id);
      if (c) track('cigar_opened', { cigar: c.name, brand: c.brand, origin: c.origin, price: c.price });
    });

    wrap('openPTModal', id => pageview('/tobacco/' + id));

    // Buy-link clicks — the closest thing this site has to a conversion.
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="http"]');
      if (!a) return;
      if (a.closest('.modal-buy-section, .buy-section, .buy-links, .buy-grid')) {
        let host = '';
        try { host = new URL(a.href).hostname.replace(/^www\./, ''); } catch (err) {}
        track('buy_click', { retailer: host });
      }
    }, { capture: true });

    document.addEventListener('click', e => {
      if (e.target.closest('.card-heart-btn, .modal-heart-btn')) track('humidor_save');
      if (e.target.closest('.jn-log-btn')) track('journal_open');
      if (e.target.closest('#lgSparkBtn')) track('lounge_spark');
      if (e.target.closest('#compareGoBtn')) track('compare_open');
      if (e.target.closest('#quizTriggerBtn')) track('picker_start');
    }, { capture: true });

    pageview(location.hash.startsWith('#/cigar/') ? '/cigar' : '/', document.title);
  }

  /* Hooks the features can call directly for things a click can't infer. */
  const api = {
    pageview, track,
    recent: () => recent.slice(),
    config: CONFIG,
    pickerResult: (exp, top) => track('picker_complete', { experience: exp, top: top }),
    journalLogged: rating => track('journal_logged', { rating: rating }),
  };

  document.addEventListener('DOMContentLoaded', () => {
    load();
    setTimeout(instrument, 400);   // after the feature modules have wrapped
  });

  return api;
})();
