/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — 3D GLOBE v4 (Simple, Working, Sharp)
   No custom shaders. No tile loading. Just Three.js built-in materials
   with high-res textures, real lighting, and clear presence markers.
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let T = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let globe = null;
  let nightGlobe = null;
  let clouds = null;
  let atmosphere = null;
  let starField = null;
  let sunLight = null;
  let emberGroup = null;
  let terroirGroup = null;
  let arcGroup = null;

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let velRotY = 0;
  let velRotX = 0;
  let rotY = 0;
  let rotX = 0.35;
  let targetRotY = 0;
  let targetRotX = 0.35;
  let zoom = 2.8;
  let targetZoom = 2.8;
  let autoRotate = false;
  let lastInteraction = 0;

  const R = 1;

  // NASA GIBS satellite imagery — 8K (8192×4096), self-hosted for speed
  // Real-time clouds fetched dynamically from GIBS WMS API
  const TEX = {
    earth:  'img/earth-nasa-8k.jpg',
    night:  'img/earth-night-8k.jpg',
    bump:   'https://unpkg.com/three-globe/example/img/earth-topology.png',
    clouds: 'https://unpkg.com/three-globe/example/img/clouds.png',
    spec:   'https://unpkg.com/three-globe/example/img/earth-water.png',
  };

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

  function latLonToVec3(lat, lon, radius) {
    const r = radius || R;
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new T.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(theta),
    );
  }

  function sunDirection() {
    const d = new Date();
    const dayMs = 86400000;
    const yearStart = Date.UTC(d.getUTCFullYear(), 0, 0);
    const dayOfYear = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - yearStart) / dayMs;
    const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
    const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60;
    const subsolarLon = -15 * (utcHours - 12);
    const declRad = decl * Math.PI / 180;
    const lonRad = subsolarLon * Math.PI / 180;
    return new T.Vector3(
      Math.cos(declRad) * Math.cos(lonRad),
      Math.sin(declRad),
      Math.cos(declRad) * Math.sin(lonRad),
    );
  }

  function cameraToLatLon() {
    const dir = new T.Vector3();
    camera.getWorldPosition(dir);
    dir.normalize();
    const lat = 90 - Math.acos(dir.y) * 180 / Math.PI;
    let lon = Math.atan2(dir.z, -dir.x) * 180 / Math.PI - 180;
    while (lon < -180) lon += 360;
    while (lon > 180) lon -= 360;
    return { lat, lon };
  }

  /* ── INIT ────────────────────────────────────────────────────── */
  function init(container) {
    if (!container) return false;
    T = window.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    if (!T) return false;

    try {
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 300;

      renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      // ACES Filmic tone mapping — cinema-grade color reproduction
      if (T.ACESFilmicToneMapping) {
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
      }
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
      container.appendChild(renderer.domElement);

      scene = new T.Scene();
      camera = new T.PerspectiveCamera(40, w / h, 0.1, 200);
      camera.position.set(0, 0, zoom);

      // Set up lights — warm sun + subtle ambient (realistic, not flat)
      sunLight = new T.DirectionalLight(0xffffff, 2.0);
      scene.add(sunLight);
      scene.add(new T.AmbientLight(0x222233, 0.3));

      // Stars
      const starGeom = new T.BufferGeometry();
      const starCount = 3000;
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const r = 40 + Math.random() * 60;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        starPos[i * 3 + 1] = r * Math.cos(phi);
        starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      starGeom.setAttribute('position', new T.BufferAttribute(starPos, 3));
      starField = new T.Points(starGeom, new T.PointsMaterial({
        color: 0xffffff, size: 0.12, sizeAttenuation: true,
        transparent: true, opacity: 0.7, blending: T.AdditiveBlending,
        depthWrite: false,
      }));
      scene.add(starField);

      // Atmosphere — subtle, thin, realistic (not a cartoon glow)
      const atmoMat = new T.ShaderMaterial({
        uniforms: { glowColor: { value: new T.Color(0.4, 0.6, 0.8) } },
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 glowColor;
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 3.0);
            gl_FragColor = vec4(glowColor, intensity * 0.25);
          }
        `,
        side: T.BackSide, blending: T.AdditiveBlending,
        transparent: true, depthWrite: false,
      });
      atmosphere = new T.Mesh(new T.SphereGeometry(R * 1.05, 64, 64), atmoMat);
      scene.add(atmosphere);

      // Start render loop immediately (renders stars + atmosphere while textures load)
      animate();

      // ── LOAD TEXTURES THEN BUILD GLOBE ────────────────────
      const loader = new T.TextureLoader();
      loader.setCrossOrigin('anonymous');
      const maxA = renderer.capabilities.getMaxAnisotropy();

      // Load all textures, then build the globe
      let loadedCount = 0;
      const totalTextures = 5;
      const tex = {};

      function onAllLoaded() {
        for (const t of Object.values(tex)) {
          t.anisotropy = maxA;
          t.minFilter = T.LinearMipmapLinearFilter;
          t.magFilter = T.LinearFilter;
          t.generateMipmaps = true;
        }

        // EARTH — PBR with specular ocean reflections (Google Earth style)
        // The water mask makes oceans reflective and land matte.
        tex.earth.colorSpace = T.SRGBColorSpace;
        const earthMat = new T.MeshStandardMaterial({
          map: tex.earth,
          bumpMap: tex.bump,
          bumpScale: 0.02,
          roughnessMap: tex.spec,    // water = dark pixel = smooth = reflective
          roughness: 0.7,            // base roughness, overridden by map
          metalness: 0.1,
          metalnessMap: tex.spec,    // water gets slight metalness for sun glint
          emissive: new T.Color(0x0a0a12),
          emissiveIntensity: 0.03,
        });
        globe = new T.Mesh(new T.SphereGeometry(R, 128, 128), earthMat);
        scene.add(globe);

        // NIGHT GLOBE
        tex.night.colorSpace = T.SRGBColorSpace;
        nightGlobe = new T.Mesh(
          new T.SphereGeometry(R * 1.002, 128, 128),
          new T.MeshBasicMaterial({
            map: tex.night,
            transparent: true,
            opacity: 0,
            blending: T.AdditiveBlending,
            depthWrite: false,
          })
        );
        globe.add(nightGlobe);

        // CLOUDS (may have failed — skip if so)
        if (tex.clouds && tex.clouds.image) {
          tex.clouds.colorSpace = T.SRGBColorSpace;
          clouds = new T.Mesh(
            new T.SphereGeometry(R * 1.008, 64, 64),
            new T.MeshStandardMaterial({
              map: tex.clouds,
              transparent: true,
              opacity: 0.15,
              roughness: 1.0,
              metalness: 0.0,
              depthWrite: false,
            })
          );
          globe.add(clouds);
        }

        // CONTENT GROUPS
        emberGroup = new T.Group(); globe.add(emberGroup);
        terroirGroup = new T.Group(); globe.add(terroirGroup);
        arcGroup = new T.Group(); globe.add(arcGroup);

        // TERROIR
        const counts = {};
        if (typeof CIGARS !== 'undefined') {
          CIGARS.forEach(c => { counts[c.origin] = (counts[c.origin] || 0) + 1; });
        }
        TERROIR.forEach(t => {
          const n = counts[t.origin] || 0;
          if (n) terroirGroup.add(createTerroirMarker(t.lat, t.lon, n, t));
        });

        // EVENTS
        const el = renderer.domElement;
        el.addEventListener('mousedown', onDragStart);
        el.addEventListener('touchstart', (e) => { if (e.touches.length < 2) onDragStart(e); }, { passive: true });
        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('touchmove', (e) => { if (e.touches.length < 2) onDragMove(e); }, { passive: true });
        window.addEventListener('mouseup', onDragEnd);
        window.addEventListener('touchend', onDragEnd);
        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: true });

        const ro = new ResizeObserver(() => onResize(container));
        ro.observe(container);
      }

      loader.load(TEX.earth, (t) => { tex.earth = t; loadedCount++; if (loadedCount >= totalTextures) onAllLoaded(); }, undefined, () => { loadedCount++; if (loadedCount >= totalTextures) onAllLoaded(); });
      loader.load(TEX.night, (t) => { tex.night = t; loadedCount++; if (loadedCount >= totalTextures) onAllLoaded(); }, undefined, () => { loadedCount++; if (loadedCount >= totalTextures) onAllLoaded(); });
      loader.load(TEX.bump,  (t) => { tex.bump = t;  loadedCount++; if (loadedCount >= totalTextures) onAllLoaded(); }, undefined, () => { loadedCount++; if (loadedCount >= totalTextures) onAllLoaded(); });
      loader.load(TEX.clouds, (t) => { tex.clouds = t; loadedCount++; if (loadedCount >= totalTextures) onAllLoaded(); }, undefined, () => { loadedCount++; if (loadedCount >= totalTextures) onAllLoaded(); });
      loader.load(TEX.spec,   (t) => { tex.spec = t;   loadedCount++; if (loadedCount >= totalTextures) onAllLoaded(); }, undefined, () => { loadedCount++; if (loadedCount >= totalTextures) onAllLoaded(); });

      return true;
    } catch (e) {
      console.error('Globe init failed:', e);
      return false;
    }
  }

  /* ── EMBER (presence marker with label) ─────────────────────── */
  function createEmber(lat, lon, isMe, handle, itemName) {
    const group = new T.Group();
    const pos = latLonToVec3(lat, lon, R * 1.01);

    // Core — bright glowing dot
    const coreColor = isMe ? 0xffd700 : 0xff6020;
    const core = new T.Mesh(
      new T.SphereGeometry(0.018, 16, 16),
      new T.MeshBasicMaterial({ color: coreColor, transparent: true, opacity: 0.95, blending: T.AdditiveBlending })
    );
    group.add(core);

    // Outer glow
    const glow = new T.Mesh(
      new T.SphereGeometry(0.04, 16, 16),
      new T.MeshBasicMaterial({
        color: coreColor, transparent: true, opacity: 0.3,
        blending: T.AdditiveBlending, depthWrite: false,
      })
    );
    group.add(glow);

    // Vertical beam — visible pillar of light
    const beamH = 0.08;
    const beam = new T.Mesh(
      new T.CylinderGeometry(0.004, 0.01, beamH, 8, 1, true),
      new T.MeshBasicMaterial({
        color: coreColor, transparent: true, opacity: 0.5,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide,
      })
    );
    beam.position.copy(latLonToVec3(lat, lon, R + beamH / 2));
    beam.lookAt(0, 0, 0);
    beam.rotateX(Math.PI / 2);
    group.add(beam);

    // Label sprite — shows handle and cigar name
    const label = createLabel(handle + (itemName ? '\n' + itemName : ''));
    label.position.copy(latLonToVec3(lat, lon, R + beamH + 0.04));
    group.add(label);

    group.position.copy(pos);
    group.userData = { core, glow, beam, label, pulse: Math.random() * Math.PI * 2 };
    return group;
  }

  /* ── TEXT LABEL SPRITE ──────────────────────────────────────── */
  function createLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(13, 11, 9, 0.85)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 254, 62);
    ctx.fillStyle = '#e0c070';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? '#e0c070' : '#a89b7a';
      ctx.font = i === 0 ? 'bold 16px Inter, sans-serif' : '13px Inter, sans-serif';
      ctx.fillText(line, 128, 20 + i * 20);
    });

    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace;
    const mat = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new T.Sprite(mat);
    sprite.scale.set(0.3, 0.075, 1);
    return sprite;
  }

  /* ── TERROIR MARKER ─────────────────────────────────────────── */
  function createTerroirMarker(lat, lon, count, terroir) {
    const group = new T.Group();
    const pos = latLonToVec3(lat, lon, R * 1.005);
    const sz = Math.max(0.01, Math.min(0.022, 0.008 + Math.log10(count + 1) * 0.008));

    const diamond = new T.Mesh(
      new T.OctahedronGeometry(sz, 0),
      new T.MeshBasicMaterial({ color: 0xc9a84c, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false })
    );
    group.add(diamond);

    const ring = new T.Mesh(
      new T.RingGeometry(sz * 1.6, sz * 2.2, 24),
      new T.MeshBasicMaterial({ color: 0xc9a84c, transparent: true, opacity: 0.15, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false })
    );
    ring.lookAt(0, 0, 0);
    group.add(ring);

    // Label with terroir name and cigar count
    const label = createLabel(terroir.origin + '\n' + terroir.region + ' · ' + count + ' cigars');
    label.position.copy(latLonToVec3(lat, lon, R + 0.05));
    group.add(label);

    group.position.copy(pos);
    group.lookAt(0, 0, 0);
    group.userData = { diamond, ring, label, pulse: Math.random() * Math.PI * 2 };
    return group;
  }

  /* ── ARC ─────────────────────────────────────────────────────── */
  function createArc(fromLat, fromLon, toLat, toLon) {
    const from = latLonToVec3(fromLat, fromLon, R);
    const to = latLonToVec3(toLat, toLon, R);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(R * 1.25);
    const curve = new T.QuadraticBezierCurve3(from, mid, to);
    const geom = new T.BufferGeometry().setFromPoints(curve.getPoints(50));
    return new T.Line(geom, new T.LineBasicMaterial({
      color: 0xc9a84c, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false,
    }));
  }

  /* ── CONTROLS ────────────────────────────────────────────────── */
  function onDragStart(e) {
    isDragging = true; autoRotate = false; lastInteraction = Date.now();
    const p = e.touches ? e.touches[0] : e;
    dragStartX = p.clientX; dragStartY = p.clientY;
    targetRotY = rotY; targetRotX = rotX;
    velRotY = 0; velRotX = 0;
  }
  function onDragMove(e) {
    if (!isDragging) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - dragStartX;
    const dy = p.clientY - dragStartY;
    targetRotY = rotY + dx * 0.005;
    targetRotX = Math.max(-1.3, Math.min(1.3, rotX + dy * 0.005));
    velRotY = dx * 0.005 * 0.3 + velRotY * 0.7;
    velRotX = dy * 0.005 * 0.3 + velRotX * 0.7;
    dragStartX = p.clientX; dragStartY = p.clientY;
  }
  function onDragEnd() {
    isDragging = false; lastInteraction = Date.now();
    targetRotY += velRotY * 8;
    targetRotX = Math.max(-1.3, Math.min(1.3, targetRotX + velRotX * 8));
  }
  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY * 0.0015;
    targetZoom = Math.max(1.1, Math.min(6, targetZoom + delta));
    lastInteraction = Date.now();
  }
  let pinchStartDist = 0;
  let pinchStartZoom = 0;
  function onTouchStart(e) {
    if (e.touches && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.hypot(dx, dy);
      pinchStartZoom = targetZoom;
      isDragging = false;
    }
  }
  function onTouchMove(e) {
    if (e.touches && e.touches.length === 2 && pinchStartDist > 0) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = pinchStartDist / dist;
      targetZoom = Math.max(1.1, Math.min(6, pinchStartZoom * scale));
      lastInteraction = Date.now();
    }
  }
  function onResize(container) {
    if (!renderer || !container) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* ── ANIMATE ─────────────────────────────────────────────────── */
  function animate() {
    if (!renderer) return;
    requestAnimationFrame(animate);

    if (!isDragging && Date.now() - lastInteraction > 8000) autoRotate = true;
    if (isDragging) autoRotate = false;
    if (autoRotate) targetRotY += 0.0005;

    // Globe doesn't exist yet (textures still loading) — skip until ready
    if (!globe) { renderer.render(scene, camera); return; }

    if (!isDragging) {
      velRotY *= 0.92;
      velRotX *= 0.92;
      if (Math.abs(velRotY) > 0.0001) targetRotY += velRotY;
      if (Math.abs(velRotX) > 0.0001) targetRotX = Math.max(-1.3, Math.min(1.3, targetRotX + velRotX));
    }

    rotY += (targetRotY - rotY) * 0.12;
    rotX += (targetRotX - rotX) * 0.12;
    zoom += (targetZoom - zoom) * 0.1;

    globe.rotation.y = rotY;
    globe.rotation.x = rotX;
    camera.position.z = zoom;

    // Sun position — controls day/night
    const sun = sunDirection();
    sunLight.position.copy(sun).multiplyScalar(5);

    // Night globe: always show city lights at moderate opacity.
    // They're more visible on the dark side (where the day texture is dark)
    // and less visible on the lit side (where the day texture is bright).
    // This is a simple approximation that looks correct without per-pixel shader math.
    if (nightGlobe && nightGlobe.material) {
      nightGlobe.material.opacity = 0.8;
    }

    // Clouds drift
    if (clouds) clouds.rotation.y += 0.0003;

    // Pulse embers + keep labels facing camera
    if (emberGroup) {
      emberGroup.children.forEach(e => {
        const ud = e.userData; if (!ud) return;
        ud.pulse += 0.04;
        const p = 0.7 + Math.sin(ud.pulse) * 0.3;
        if (ud.core) ud.core.scale.setScalar(p);
        if (ud.glow) { ud.glow.scale.setScalar(p * 1.5); ud.glow.material.opacity = 0.15 + Math.sin(ud.pulse) * 0.2; }
        if (ud.beam) ud.beam.material.opacity = 0.3 + Math.sin(ud.pulse * 0.7) * 0.2;
      });
    }

    // Pulse terroir
    if (terroirGroup) {
      terroirGroup.children.forEach(m => {
        const ud = m.userData; if (!ud) return;
        ud.pulse += 0.02;
        const s = 1 + Math.sin(ud.pulse) * 0.15;
        if (ud.diamond) { ud.diamond.scale.setScalar(s); ud.diamond.rotation.y += 0.01; ud.diamond.rotation.x += 0.005; }
        if (ud.ring) { ud.ring.scale.setScalar(1 + Math.sin(ud.pulse + Math.PI) * 0.2); ud.ring.material.opacity = 0.08 + Math.sin(ud.pulse) * 0.12; }
      });
    }

    if (starField) starField.rotation.y += 0.00008;
    renderer.render(scene, camera);
  }

  /* ── UPDATE PRESENCE ─────────────────────────────────────────── */
  function updatePresence(sessions) {
    if (!emberGroup || !arcGroup) return;
    while (emberGroup.children.length) emberGroup.remove(emberGroup.children[0]);
    while (arcGroup.children.length) arcGroup.remove(arcGroup.children[0]);
    if (!sessions || !sessions.length) return;
    sessions.forEach(s => {
      if (!s.loc || typeof s.loc.lat !== 'number') return;
      const ember = createEmber(s.loc.lat, s.loc.lon, s.isMe, s.handle || 'Someone', s.itemName || 'here, not lit');
      emberGroup.add(ember);
      if (s.itemId && typeof CIGARS !== 'undefined') {
        const cigar = CIGARS.find(c => c.id === s.itemId);
        if (cigar) {
          const terroir = TERROIR.find(t => t.origin === cigar.origin);
          if (terroir) arcGroup.add(createArc(terroir.lat, terroir.lon, s.loc.lat, s.loc.lon));
        }
      }
    });
  }

  /* ── PUBLIC API ──────────────────────────────────────────────── */
  window.VPGlobe = {
    init, updatePresence,
    isReady: () => renderer !== null,
    destroy: () => { if (renderer) { renderer.dispose(); renderer.domElement.remove(); renderer = null; } },
  };

  /* ── INTEGRATION ─────────────────────────────────────────────── */
  let globeInitialized = false;
  let globeContainer = null;

  function tryInitGlobe() {
    const mapEl = document.getElementById('lgMap');
    if (!mapEl || globeInitialized) return;
    if (typeof THREE === 'undefined' && typeof window.THREE === 'undefined') { setTimeout(tryInitGlobe, 500); return; }
    T = window.THREE || THREE;
    if (!T) { setTimeout(tryInitGlobe, 500); return; }

    globeContainer = document.createElement('div');
    globeContainer.className = 'lg-map-globe-wrap';
    globeContainer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:6;';
    mapEl.appendChild(globeContainer);

    if (init(globeContainer) !== false) {
      // init returns false on hard failure, true (or undefined) on loading
      globeInitialized = true;
      const svg = mapEl.querySelector('.lg-map-svg');
      const dots = document.getElementById('lgMapDots');
      if (svg) svg.style.opacity = '0';
      if (dots) dots.style.display = 'none';
    } else {
      globeContainer.remove();
    }
  }

  let initRetries = 0;
  function checkAndInit() {
    if (globeInitialized) return;
    if (initRetries > 60) return;
    initRetries++;
    const mapEl = document.getElementById('lgMap');
    if (mapEl && mapEl.offsetParent !== null) tryInitGlobe();
    if (!globeInitialized) setTimeout(checkAndInit, 500);
  }

  document.addEventListener('click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.view === 'lounge') {
      initRetries = 0;
      setTimeout(checkAndInit, 800);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkAndInit, 1000));
  } else {
    setTimeout(checkAndInit, 1000);
  }

  // Presence polling
  let lastPresenceCount = -1;
  setInterval(() => {
    if (!globeInitialized || !window.VPGlobe) return;
    const dots = document.querySelectorAll('.lg-ember');
    if (dots.length !== lastPresenceCount) {
      lastPresenceCount = dots.length;
      const sessions = [];
      dots.forEach(dot => {
        const style = dot.getAttribute('style') || '';
        const leftMatch = style.match(/left:\s*([\d.]+)%/);
        const topMatch = style.match(/top:\s*([\d.]+)%/);
        if (leftMatch && topMatch) {
          const lon = (parseFloat(leftMatch[1]) / 100) * 360 - 180;
          const lat = 90 - (parseFloat(topMatch[1]) / 100) * 180;
          const isMe = dot.classList.contains('is-me');
          const handleEl = dot.querySelector('.lg-ec-head');
          const handle = handleEl ? handleEl.textContent.replace('(you)', '').trim() : 'Someone';
          const itemEl = dot.querySelector('.lg-ec-item');
          const itemName = itemEl ? itemEl.textContent.trim() : '';
          const itemMatch = itemEl ? itemEl.dataset.item : null;
          sessions.push({ loc: { lat, lon }, isMe, handle, itemId: itemMatch, itemName });
        }
      });
      updatePresence(sessions);
    }
  }, 2000);

})();
