/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — PREMIUM PRELOADER
   ══════════════════════════════════════════════════════════════════
   Shows the #vp-preloader curtain while the page loads, advances a
   thin gold progress bar, and fades the curtain out over 800ms once
   window.onload fires. A 500ms minimum prevents a sub-perceptual
   flash on fast connections. Adding .vp-loaded to <body> re-triggers
   the cigar-card stagger entrance as the site is revealed.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var pre = document.getElementById('vp-preloader');
  if (!pre) return;

  var bar = pre.querySelector('.vp-pre-bar');
  var progress = 0;
  var loaded = false;
  var startTime = Date.now();
  var MIN_DISPLAY_MS = 500;   // flash prevention
  var FADE_MS = 800;

  // Simulated progress while assets load — eases toward 95% so the bar
  // always feels alive without falsely claiming completion.
  var tick = setInterval(function () {
    if (loaded) return;
    if (progress < 80) {
      progress += Math.max(0.8, (90 - progress) * 0.035);
    } else {
      progress += 0.15;
    }
    if (progress > 95) progress = 95;
    if (bar) bar.style.width = progress.toFixed(2) + '%';
  }, 120);

  function finish() {
    if (loaded) return;
    loaded = true;
    if (bar) bar.style.width = '100%';
    clearInterval(tick);

    var elapsed = Date.now() - startTime;
    var wait = Math.max(0, MIN_DISPLAY_MS - elapsed);

    setTimeout(function () {
      pre.classList.add('vp-pre-hidden');
      document.body.classList.add('vp-loaded');
      // Remove from the DOM after the fade completes.
      setTimeout(function () {
        if (pre && pre.parentNode) pre.parentNode.removeChild(pre);
      }, FADE_MS + 60);
    }, wait);
  }

  // Fire on DOMContentLoaded (much earlier than load) — the preloader
  // should disappear as soon as the DOM is interactive, not after all
  // images/subresources finish. Fall back to load if DOMContentLoaded
  // already fired. Final safety net at 5s.
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    finish();
  } else {
    document.addEventListener('DOMContentLoaded', finish);
    window.addEventListener('load', finish);
    setTimeout(finish, 5000);
  }
})();
