/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — No preloader. Straight to the page.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var pre = document.getElementById('vp-preloader');
  if (pre && pre.parentNode) pre.parentNode.removeChild(pre);
  document.body.classList.add('vp-loaded');
})();
