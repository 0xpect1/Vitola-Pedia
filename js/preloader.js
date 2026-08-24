/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — PREMIUM PRELOADER (instant)
   Fades out the curtain as fast as possible — no artificial delay.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var pre = document.getElementById('vp-preloader');
  if (!pre) return;

  var bar = pre.querySelector('.vp-pre-bar');
  var loaded = false;
  var FADE_MS = 300;

  function finish() {
    if (loaded) return;
    loaded = true;
    if (bar) bar.style.width = '100%';
    pre.classList.add('vp-pre-hidden');
    document.body.classList.add('vp-loaded');
    setTimeout(function () {
      if (pre && pre.parentNode) pre.parentNode.removeChild(pre);
    }, FADE_MS + 50);
  }

  // Fire immediately if DOM is already ready, otherwise on DOMContentLoaded
  if (document.readyState !== 'loading') {
    finish();
  } else {
    document.addEventListener('DOMContentLoaded', finish);
  }
  // Safety net
  setTimeout(finish, 2000);
})();
