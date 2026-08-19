/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — PREMIUM MAP
   Expandable, zoomable, pannable world map for the lounge.
   Enhances the existing SVG map with:
     - Fullscreen expand/collapse toggle
     - Mouse-wheel zoom with pan
     - Enhanced visual depth (terrain shading, atmosphere glow)
     - Smooth zoom controls
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let isExpanded = false;
  let zoomLevel = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 5;

  /* ── EXPAND TOGGLE ─────────────────────────────────────────────── */
  function toggleExpand() {
    const panel = document.querySelector('.lg-map-panel');
    if (!panel) return;
    isExpanded = !isExpanded;
    panel.classList.toggle('lg-map-expanded', isExpanded);
    document.body.style.overflow = isExpanded ? 'hidden' : '';

    const btn = document.querySelector('.lg-map-expand-btn');
    if (btn) {
      btn.classList.toggle('expanded', isExpanded);
      const label = btn.querySelector('.lg-map-expand-label');
      if (label) label.textContent = isExpanded ? 'Collapse' : 'Expand';
    }

    if (!isExpanded) {
      resetTransform();
    }

    // Show/hide close button
    let closeBtn = document.querySelector('.lg-map-close-btn');
    if (isExpanded && !closeBtn) {
      closeBtn = document.createElement('button');
      closeBtn.className = 'lg-map-close-btn';
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      closeBtn.onclick = toggleExpand;
      document.body.appendChild(closeBtn);
    } else if (!isExpanded && closeBtn) {
      closeBtn.remove();
    }
  }

  /* ── ZOOM ──────────────────────────────────────────────────────── */
  function applyTransform() {
    const svg = document.querySelector('.lg-map-svg');
    if (!svg) return;
    svg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  }

  function resetTransform() {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    applyTransform();
    updateZoomButtons();
  }

  function zoomIn() {
    zoomLevel = Math.min(MAX_ZOOM, zoomLevel + 0.5);
    applyTransform();
    updateZoomButtons();
  }

  function zoomOut() {
    zoomLevel = Math.max(MIN_ZOOM, zoomLevel - 0.5);
    if (zoomLevel <= 1) { panX = 0; panY = 0; }
    applyTransform();
    updateZoomButtons();
  }

  function updateZoomButtons() {
    const zoomInBtn = document.querySelector('.lg-map-zoom-in');
    const zoomOutBtn = document.querySelector('.lg-map-zoom-out');
    if (zoomInBtn) zoomInBtn.disabled = zoomLevel >= MAX_ZOOM;
    if (zoomOutBtn) zoomOutBtn.disabled = zoomLevel <= MIN_ZOOM;
  }

  /* ── WHEEL ZOOM ────────────────────────────────────────────────── */
  function onWheel(e) {
    if (!isExpanded) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.3 : 0.3;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel + delta));
    if (newZoom === zoomLevel) return;

    // Zoom toward cursor position
    const map = document.querySelector('.lg-map');
    if (map) {
      const rect = map.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const ratio = newZoom / zoomLevel - 1;
      panX -= cx * ratio;
      panY -= cy * ratio;
    }

    zoomLevel = newZoom;
    applyTransform();
    updateZoomButtons();
  }

  /* ── PAN (DRAG) ─────────────────────────────────────────────────── */
  function onDragStart(e) {
    if (!isExpanded || zoomLevel <= 1) return;
    isDragging = true;
    dragStartX = e.clientX || (e.touches && e.touches[0].clientX);
    dragStartY = e.clientY || (e.touches && e.touches[0].clientY);
    dragStartPanX = panX;
    dragStartPanY = panY;
    document.body.style.cursor = 'grabbing';
  }

  function onDragMove(e) {
    if (!isDragging) return;
    const x = e.clientX || (e.touches && e.touches[0].clientX);
    const y = e.clientY || (e.touches && e.touches[0].clientY);
    panX = dragStartPanX + (x - dragStartX);
    panY = dragStartPanY + (y - dragStartY);
    applyTransform();
  }

  function onDragEnd() {
    isDragging = false;
    document.body.style.cursor = '';
  }

  /* ── KEYBOARD ──────────────────────────────────────────────────── */
  function onKey(e) {
    if (!isExpanded) return;
    if (e.key === 'Escape') {
      toggleExpand();
    } else if (e.key === '+' || e.key === '=') {
      zoomIn();
    } else if (e.key === '-' || e.key === '_') {
      zoomOut();
    } else if (e.key === '0') {
      resetTransform();
    }
  }

  /* ── INIT ──────────────────────────────────────────────────────── */
  function init() {
    const panel = document.querySelector('.lg-map-panel');
    if (!panel) {
      // Retry — lounge might load after this script
      setTimeout(init, 500);
      return;
    }

    // Add expand button to the map header
    const head = panel.querySelector('.lg-map-head');
    if (head && !head.querySelector('.lg-map-expand-btn')) {
      const btn = document.createElement('button');
      btn.className = 'lg-map-expand-btn';
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg><span class="lg-map-expand-label">Expand</span>';
      btn.onclick = toggleExpand;
      head.appendChild(btn);
    }

    // Add zoom controls to the map
    const map = panel.querySelector('.lg-map');
    if (map && !map.querySelector('.lg-map-zoom-ctrl')) {
      const ctrl = document.createElement('div');
      ctrl.className = 'lg-map-zoom-ctrl';
      ctrl.innerHTML = `
        <button class="lg-map-zoom-btn lg-map-zoom-in" title="Zoom in">+</button>
        <button class="lg-map-zoom-btn lg-map-zoom-out" title="Zoom out">&minus;</button>
      `;
      ctrl.querySelector('.lg-map-zoom-in').onclick = zoomIn;
      ctrl.querySelector('.lg-map-zoom-out').onclick = zoomOut;
      map.appendChild(ctrl);
    }

    // Mark tobacco-growing countries for visual highlighting
    const tobaccoCountries = [
      'Cuba', 'Nicaragua', 'Dominican Republic', 'Honduras', 'Guatemala',
      'Mexico', 'Brazil', 'Costa Rica', 'Ecuador', 'United States',
      'Cameroon', 'Indonesia', 'Philippines'
    ];
    // The SVG paths don't have data-country attributes, but we can
    // approximate by checking if a terroir marker falls within a path.
    // For now, the visual enhancement is handled by the terroir layer itself.

    // Event listeners
    const mapEl = panel.querySelector('.lg-map');
    if (mapEl) {
      mapEl.addEventListener('wheel', onWheel, { passive: false });
      mapEl.addEventListener('mousedown', onDragStart);
      mapEl.addEventListener('touchstart', onDragStart, { passive: true });
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('touchmove', onDragMove, { passive: true });
      document.addEventListener('mouseup', onDragEnd);
      document.addEventListener('touchend', onDragEnd);
    }
    document.addEventListener('keydown', onKey);
  }

  // Wait for lounge to render, then enhance
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1000));
  } else {
    setTimeout(init, 1000);
  }

  // Also re-init when lounge view is switched to
  document.addEventListener('click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.view === 'lounge') {
      setTimeout(init, 500);
    }
  });

})();
