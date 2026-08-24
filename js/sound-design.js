/* ================================================================
   VITOLA PEDIA — Sound Design
   ────────────────────────────────────────────────────────────────
   Subtle UI click sounds · auto-enable fireplace ambience on first
   interaction · lounge ambient hum · notification chime.

   All sounds are synthesised with the Web Audio API — no external
   audio files, zero network requests.
   ================================================================ */

(function () {
  'use strict';

  /* ── Shared AudioContext (created lazily on first user gesture) ── */
  let ctx = null;

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // Browsers suspend AudioContext until a gesture resumes it.
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
    return ctx;
  }

  /* ══════════════════════════════════════════════════════════════
     1. UI CLICK SOUND
     ── Soft gold/crystal tone: 1200 Hz sine wave with an ADSR
        envelope (0.05 s attack · 0.10 s decay · 0.02 s sustain ·
        short release) at very low volume (0.03).
     ══════════════════════════════════════════════════════════════ */
  function playClick() {
    const ac = getCtx();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1200;

    const vol = 0.03;
    // Attack — 0.05 s ramp from silence to peak
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    // Decay — 0.10 s ramp down to sustain level
    gain.gain.linearRampToValueAtTime(vol * 0.3, now + 0.15);
    // Sustain — hold for 0.02 s
    gain.gain.setValueAtTime(vol * 0.3, now + 0.17);
    // Release — quick fade out
    gain.gain.linearRampToValueAtTime(0, now + 0.22);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  function attachClickSounds() {
    // Event delegation (capture phase) so dynamically added buttons
    // also receive click sounds.
    document.addEventListener('click', function (e) {
      var el = e.target.closest(
        '.nav-btn, .landing-cta, #enterSite, .pill'
      );
      if (el) playClick();
    }, true);
  }

  /* ══════════════════════════════════════════════════════════════
     2. AUTO-ENABLE FIREPLACE AMBIENCE ON FIRST INTERACTION
     ── Browsers block autoplay audio, so we wait for the first user
        interaction, show a small toast prompting a click, then enable
        the fireplace ambience (from immersive.js) on the next click.
        The existing toggle remains for manual on/off.
     ══════════════════════════════════════════════════════════════ */
  var _firstInteractionDone = false;
  var _ambienceToast = null;

  function _injectToastCSS() {
    var style = document.createElement('style');
    style.textContent = [
      '.vp-ambience-toast{',
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);',
        'background:rgba(26,18,9,0.92);color:var(--gold-light,#e8b86d);',
        'padding:10px 22px;border-radius:10px;border:1px solid rgba(201,148,58,0.35);',
        'font:500 13px/1.4 "Inter",system-ui,sans-serif;letter-spacing:0.02em;',
        'box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:99999;opacity:0;',
        'transition:opacity 0.4s ease,transform 0.4s ease;pointer-events:none;',
        'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);',
      '}',
      '.vp-ambience-toast.is-visible{opacity:1;transform:translateX(-50%) translateY(0);}'
    ].join('');
    document.head.appendChild(style);
  }

  function showAmbienceToast() {
    if (_ambienceToast) return;
    _injectToastCSS();
    var el = document.createElement('div');
    el.className = 'vp-ambience-toast';
    el.textContent = '🔊 Click for ambient sound';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
    _ambienceToast = el;
    requestAnimationFrame(function () { el.classList.add('is-visible'); });
    // Auto-dismiss after 8 s if the user never clicks.
    setTimeout(function () { hideAmbienceToast(); }, 8000);
  }

  function hideAmbienceToast() {
    if (_ambienceToast && _ambienceToast.parentNode) {
      var el = _ambienceToast;
      el.classList.remove('is-visible');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }
    _ambienceToast = null;
  }

  function initAutoAmbience() {
    function onFirstInteraction() {
      if (_firstInteractionDone) return;
      _firstInteractionDone = true;
      showAmbienceToast();
      // Enable the fireplace on the next click.
      document.addEventListener('click', function enableFire() {
        document.removeEventListener('click', enableFire, true);
        var btn = document.getElementById('soundToggle');
        // Only toggle on if it's currently off (no 'active' class).
        if (btn && !btn.classList.contains('active')) {
          btn.click();
        }
        hideAmbienceToast();
      }, true);
    }
    ['click', 'keydown', 'touchstart'].forEach(function (evt) {
      document.addEventListener(evt, onFirstInteraction, { once: true });
    });
    window.addEventListener('scroll', onFirstInteraction, { once: true, passive: true });
  }

  /* ══════════════════════════════════════════════════════════════
     3. LOUNGE AMBIENT HUM
     ── When the Lounge view is active, play a very subtle 50 Hz
        sine wave at 0.01 volume to give a "room" feel.  Stop when
        leaving the Lounge view.
     ══════════════════════════════════════════════════════════════ */
  var _humOsc = null;
  var _humGain = null;

  function humStart() {
    var ac = getCtx();
    if (!ac) return;
    if (_humOsc) return; // already playing
    _humOsc = ac.createOscillator();
    _humGain = ac.createGain();
    _humOsc.type = 'sine';
    _humOsc.frequency.value = 50;
    _humGain.gain.value = 0;
    _humOsc.connect(_humGain);
    _humGain.connect(ac.destination);
    _humOsc.start();
    _humGain.gain.linearRampToValueAtTime(0.01, ac.currentTime + 1.5);
  }

  function humStop() {
    if (!_humOsc) return;
    var ac = ctx;
    if (ac && _humGain) {
      _humGain.gain.cancelScheduledValues(ac.currentTime);
      _humGain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.8);
    }
    var osc = _humOsc;
    setTimeout(function () { try { osc.stop(); } catch (e) { /* already stopped */ } }, 900);
    _humOsc = null;
    _humGain = null;
  }

  function initLoungeHum() {
    var loungeEl = document.getElementById('view-lounge');
    if (!loungeEl) return;
    // Check initial state (user might land directly on the Lounge).
    if (!loungeEl.classList.contains('hidden')) humStart();
    // Observe class changes — switchView toggles .hidden on the view.
    var observer = new MutationObserver(function () {
      if (loungeEl.classList.contains('hidden')) humStop();
      else humStart();
    });
    observer.observe(loungeEl, { attributes: true, attributeFilter: ['class'] });
  }

  /* ══════════════════════════════════════════════════════════════
     4. NOTIFICATION CHIME
     ── When the "someone lit up" notification fires (js/notify.js
        creates a .lg-notify-toast element), play a soft two-tone
        chime: 800 Hz then 1200 Hz, 0.10 s each, low volume.
     ══════════════════════════════════════════════════════════════ */
  function playChime() {
    var ac = getCtx();
    if (!ac) return;
    var now = ac.currentTime;
    var vol = 0.05;

    // Tone 1: 800 Hz, 0.10 s
    var o1 = ac.createOscillator();
    var g1 = ac.createGain();
    o1.type = 'sine';
    o1.frequency.value = 800;
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(vol, now + 0.01);
    g1.gain.setValueAtTime(vol, now + 0.09);
    g1.gain.linearRampToValueAtTime(0, now + 0.10);
    o1.connect(g1);
    g1.connect(ac.destination);
    o1.start(now);
    o1.stop(now + 0.12);

    // Tone 2: 1200 Hz, starts at 0.10 s, 0.10 s
    var o2 = ac.createOscillator();
    var g2 = ac.createGain();
    o2.type = 'sine';
    o2.frequency.value = 1200;
    g2.gain.setValueAtTime(0, now + 0.10);
    g2.gain.linearRampToValueAtTime(vol, now + 0.11);
    g2.gain.setValueAtTime(vol, now + 0.19);
    g2.gain.linearRampToValueAtTime(0, now + 0.20);
    o2.connect(g2);
    g2.connect(ac.destination);
    o2.start(now + 0.10);
    o2.stop(now + 0.22);
  }

  function initNotifyChime() {
    // js/notify.js appends a <div class="lg-notify-toast"> to body
    // when someone lights up and the tab is focused.  Watch for it.
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

  /* ══════════════════════════════════════════════════════════════
     BOOT
     ══════════════════════════════════════════════════════════════ */
  function init() {
    attachClickSounds();
    initAutoAmbience();
    initLoungeHum();
    initNotifyChime();
  }

  // Expose for debugging / external triggering.
  window.VPSound = {
    playClick: playClick,
    playChime: playChime,
    humStart:  humStart,
    humStop:   humStop
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
