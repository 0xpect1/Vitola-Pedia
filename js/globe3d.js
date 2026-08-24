/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — MapLibre 3D Globe (replaces Three.js globe)
   Uses MapLibre GL JS v5 globe projection with satellite imagery.
   Zoom from "see the whole Earth" to "see a specific street in Havana."
   Free satellite tiles from ESRI World Imagery (no API key needed).
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let map = null;
  let initialized = false;
  let markers = [];

  const TERROIR = [
    { origin: 'Cuba',               region: 'Vuelta Abajo',           lat: 22.4,  lon: -83.7 },
    { origin: 'Nicaragua',          region: 'Esteli & Jalapa',        lat: 13.1,  lon: -86.35 },
    { origin: 'Dominican Republic', region: 'Cibao Valley',           lat: 19.45, lon: -70.7 },
    { origin: 'Honduras',           region: 'Jamastran & Danli',      lat: 14.0,  lon: -86.6 },
    { origin: 'Guatemala',          region: 'Jalapa Valley',          lat: 15.5,  lon: -90.3 },
    { origin: 'Mexico',             region: 'San Andres, Veracruz',   lat: 18.3,  lon: -95.2 },
    { origin: 'Brazil',             region: 'Reconcavo, Bahia',       lat: -12.5, lon: -39.0 },
    { origin: 'Costa Rica',         region: 'Central Valley',         lat: 10.0,  lon: -84.1 },
    { origin: 'United States',      region: 'Connecticut River Valley', lat: 41.8, lon: -72.6 },
    { origin: 'Ecuador',            region: 'Los Rios (wrapper leaf)', lat: -1.0, lon: -79.5 },
  ];

  /* ── ESRI World Imagery — free satellite tiles, no API key ── */
  const SATELLITE_STYLE = {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
        maxzoom: 19,
      },
      'osm-labels': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#050508' } },
      { id: 'satellite', type: 'raster', source: 'esri-satellite' },
      { id: 'labels', type: 'raster', source: 'osm-labels', paint: { 'raster-opacity': 0.8 } },
    ],
    projection: { type: 'globe' },
    sky: {
      'sky-color': '#0a0a1a',
      'sky-horizon-blend': 0.5,
      'horizon-color': '#1a1a2e',
      'horizon-fog-blend': 0.3,
      'fog-color': '#0a0a1a',
    },
  };

  function init(container) {
    if (!container || initialized) return;
    if (typeof maplibregl === 'undefined') return;

    try {
      // Dark background so the container isn't white while tiles load
      container.style.background = '#0a0a0a';

      map = new maplibregl.Map({
        container: container,
        style: SATELLITE_STYLE,
        center: [-75, 20],  // centered on Caribbean cigar countries
        zoom: 1.5,
        maxZoom: 19,
        minZoom: 0,
        maxPitch: 85,
        dragRotate: true,
        attributionControl: { compact: true },
      });

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

      map.on('style.load', function () {
        map.setProjection({ type: 'globe' });

        // Add terroir markers after style loads
        addTerroirMarkers();
      });

      // Log errors for debugging
      map.on('error', function(e) {
        console.error('MapLibre error:', e);
      });

      initialized = true;

      // Hide the old SVG map dots
      var svg = container.querySelector('.lg-map-svg');
      var dots = document.getElementById('lgMapDots');
      if (svg) svg.style.opacity = '0';
      if (dots) dots.style.display = 'none';

      return true;
    } catch (e) {
      console.error('MapLibre globe init failed:', e);
      return false;
    }
  }

  /* ── TERROIR MARKERS ── */
  function addTerroirMarkers() {
    if (!map) return;
    markers.forEach(m => m.remove());
    markers = [];

    var counts = {};
    if (typeof CIGARS !== 'undefined') {
      CIGARS.forEach(function(c) { counts[c.origin] = (counts[c.origin] || 0) + 1; });
    }

    TERROIR.forEach(function(t) {
      var n = counts[t.origin] || 0;
      if (!n) return;

      var el = document.createElement('div');
      el.className = 'vp-terroir-marker';
      el.style.cssText = [
        'width:14px;height:14px;border-radius:50%',
        'background:rgba(201,148,58,0.9)',
        'border:2px solid rgba(255,215,100,0.6)',
        'box-shadow:0 0 12px rgba(201,148,58,0.5)',
        'cursor:pointer',
      ].join(';');

      var popup = new maplibregl.Popup({ offset: 15, closeButton: false })
        .setHTML(
          '<div style="font:500 13px/1.4 Inter,sans-serif;color:#e8b86d;' +
          'background:rgba(13,11,9,0.92);padding:8px 12px;border-radius:6px;' +
          'border:1px solid rgba(201,148,58,0.3);white-space:nowrap;">' +
          '<strong>' + t.origin + '</strong><br>' +
          '<span style="color:#a89b7a;font-size:11px;">' + t.region + '</span><br>' +
          '<span style="color:#e8b86d;font-size:12px;">' + n + ' cigars</span>' +
          '</div>'
        );

      var marker = new maplibregl.Marker(el)
        .setLngLat([t.lon, t.lat])
        .setPopup(popup)
        .addTo(map);

      markers.push(marker);
    });
  }

  /* ── UPDATE PRESENCE (live smokers) ── */
  function updatePresence(sessions) {
    if (!map) return;

    // Remove old presence markers (keep terroir ones)
    var toRemove = markers.filter(function(m) { return m._vpPresence; });
    toRemove.forEach(function(m) { m.remove(); });
    markers = markers.filter(function(m) { return !m._vpPresence; });

    if (!sessions || !sessions.length) return;

    sessions.forEach(function(s) {
      if (!s.loc || typeof s.loc.lat !== 'number') return;

      var isMe = s.isMe;
      var el = document.createElement('div');
      el.className = 'vp-presence-marker';
      el.style.cssText = [
        'width:12px;height:12px;border-radius:50%',
        isMe ? 'background:#ffd700' : 'background:#ff6020',
        'border:2px solid rgba(255,200,100,0.6)',
        'box-shadow:0 0 15px ' + (isMe ? 'rgba(255,215,0,0.6)' : 'rgba(255,96,32,0.6)'),
        'cursor:pointer',
      ].join(';');

      var popup = new maplibregl.Popup({ offset: 15, closeButton: false })
        .setHTML(
          '<div style="font:500 12px/1.4 Inter,sans-serif;' +
          'background:rgba(13,11,9,0.92);padding:6px 10px;border-radius:6px;' +
          'border:1px solid rgba(201,148,58,0.3);white-space:nowrap;">' +
          '<strong style="color:' + (isMe ? '#ffd700' : '#ff8040') + ';">' +
          (s.handle || 'Someone') + '</strong>' +
          (s.itemName ? '<br><span style="color:#a89b7a;font-size:11px;">' + s.itemName + '</span>' : '') +
          '</div>'
        );

      var marker = new maplibregl.Marker(el)
        .setLngLat([s.loc.lon, s.loc.lat])
        .setPopup(popup)
        .addTo(map);

      marker._vpPresence = true;
      markers.push(marker);
    });
  }

  /* ── PUBLIC API ── */
  window.VPGlobe = {
    init: init,
    updatePresence: updatePresence,
    isReady: function() { return initialized; },
    destroy: function() {
      if (map) { map.remove(); map = null; initialized = false; }
    },
  };

  /* ── INTEGRATION ── */
  let globeInitialized = false;

  function tryInitGlobe() {
    var mapEl = document.getElementById('lgMap');
    if (!mapEl || globeInitialized) return;
    if (typeof maplibregl === 'undefined') {
      setTimeout(tryInitGlobe, 500);
      return;
    }

    var globeContainer = document.createElement('div');
    globeContainer.className = 'lg-map-globe-wrap';
    globeContainer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:6;';
    mapEl.appendChild(globeContainer);

    if (init(globeContainer)) {
      globeInitialized = true;
      var svg = mapEl.querySelector('.lg-map-svg');
      var dots = document.getElementById('lgMapDots');
      if (svg) svg.style.opacity = '0';
      if (dots) dots.style.display = 'none';
    }
  }

  let initRetries = 0;
  function checkAndInit() {
    if (globeInitialized) return;
    if (initRetries > 60) return;
    initRetries++;
    var mapEl = document.getElementById('lgMap');
    if (mapEl && mapEl.offsetParent !== null) tryInitGlobe();
    if (!globeInitialized) setTimeout(checkAndInit, 500);
  }

  document.addEventListener('click', function(e) {
    if (e.target && e.target.dataset && e.target.dataset.view === 'lounge') {
      initRetries = 0;
      setTimeout(checkAndInit, 800);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(checkAndInit, 1000); });
  } else {
    setTimeout(checkAndInit, 1000);
  }

  // Presence polling — same as before
  var lastPresenceCount = -1;
  setInterval(function() {
    if (!globeInitialized || !window.VPGlobe) return;
    var dots = document.querySelectorAll('.lg-ember');
    if (dots.length !== lastPresenceCount) {
      lastPresenceCount = dots.length;
      var sessions = [];
      dots.forEach(function(dot) {
        var style = dot.getAttribute('style') || '';
        var leftMatch = style.match(/left:\s*([\d.]+)%/);
        var topMatch = style.match(/top:\s*([\d.]+)%/);
        if (leftMatch && topMatch) {
          var lon = (parseFloat(leftMatch[1]) / 100) * 360 - 180;
          var lat = 90 - (parseFloat(topMatch[1]) / 100) * 180;
          var isMe = dot.classList.contains('is-me');
          var handleEl = dot.querySelector('.lg-ec-head');
          var handle = handleEl ? handleEl.textContent.replace('(you)', '').trim() : 'Someone';
          var itemEl = dot.querySelector('.lg-ec-item');
          var itemName = itemEl ? itemEl.textContent.trim() : '';
          var itemMatch = itemEl ? itemEl.dataset.item : null;
          sessions.push({ loc: { lat: lat, lon: lon }, isMe: isMe, handle: handle, itemId: itemMatch, itemName: itemName });
        }
      });
      updatePresence(sessions);
    }
  }, 2000);

})();
