/* ================================================================
   VITOLA PEDIA — Sound Design (simplified)
   Lounge ambient hum + notification chime only.
   No click sounds, no auto-ambience toast.
   ================================================================ */

(function () {
  'use strict';

  let ctx = null;

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) {}
    }
    return ctx;
  }

  /* ── LOUNGE AMBIENT HUM ── */
  var _humOsc = null, _humGain = null;

  function humStart() {
    var ac = getCtx();
    if (!ac || _humOsc) return;
    _humOsc = ac.createOscillator();
    _humGain = ac.createGain();
    _humOsc.type = 'sine';
    _humOsc.frequency.value = 50;
    _humGain.gain.value = 0;
    _humOsc.connect(_humGain);
    _humGain.connect(ac.destination);
    _humOsc.start();
    _humGain.gain.linearRampToValueAtTime(0.008, ac.currentTime + 1.5);
  }

  function humStop() {
    if (!_humOsc) return;
    if (ctx && _humGain) {
      _humGain.gain.cancelScheduledValues(ctx.currentTime);
      _humGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    }
    var osc = _humOsc;
    setTimeout(function () { try { osc.stop(); } catch (e) {} }, 900);
    _humOsc = null; _humGain = null;
  }

  function initLoungeHum() {
    var loungeEl = document.getElementById('view-lounge');
    if (!loungeEl) return;
    if (!loungeEl.classList.contains('hidden')) humStart();
    var observer = new MutationObserver(function () {
      if (loungeEl.classList.contains('hidden')) humStop();
      else humStart();
    });
    observer.observe(loungeEl, { attributes: true, attributeFilter: ['class'] });
  }

  /* ── NOTIFICATION CHIME ── */
  function playChime() {
    var ac = getCtx();
    if (!ac) return;
    var now = ac.currentTime, vol = 0.04;
    var o1 = ac.createOscillator(), g1 = ac.createGain();
    o1.type = 'sine'; o1.frequency.value = 800;
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(vol, now + 0.01);
    g1.gain.linearRampToValueAtTime(0, now + 0.15);
    o1.connect(g1); g1.connect(ac.destination);
    o1.start(now); o1.stop(now + 0.17);
  }

  function initNotifyChime() {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.classList && node.classList.contains('lg-notify-toast') ||
              (node.querySelector && node.querySelector('.lg-notify-toast'))) {
            playChime();
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    initLoungeHum();
    initNotifyChime();
  }

  window.VPSound = { playChime: playChime, humStart: humStart, humStop: humStop };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
