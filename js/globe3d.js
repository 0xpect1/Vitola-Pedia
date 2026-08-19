/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — 3D GLOBE
   A hyper-realistic Three.js earth sphere for the lounge map.

   - Realistic earth sphere with procedural day/night texture
   - Atmospheric rim glow (Fresnel shader)
   - Day/night terminator as a real shader on the sphere
   - Presence embers as 3D glowing points with vertical beams
   - Terroir markers as gold diamond points
   - Leaf-journey arcs as golden curves through 3D space
   - Auto-rotate, drag-to-rotate, scroll-to-zoom
   - Falls back to existing 2D SVG map if WebGL unavailable
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let THREE = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let globe = null;
  let atmosphere = null;
  let starField = null;
  let emberGroup = null;
  let terroirGroup = null;
  let arcGroup = null;
  let raycaster = null;
  let mouse = null;

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let rotY = 0;
  let rotX = 0.3;
  let targetRotY = 0;
  let targetRotX = 0.3;
  let zoom = 3.2;
  let targetZoom = 3.2;
  let autoRotate = true;
  let lastInteraction = 0;

  const GLOBE_RADIUS = 1;

  // Terroir data (mirrored from lounge.js)
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

  /* ── LAT/LON → 3D VECTOR ─────────────────────────────────────── */
  function latLonToVec3(lat, lon, radius) {
    const r = radius || GLOBE_RADIUS;
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return {
      x: -r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.cos(phi),
      z: r * Math.sin(phi) * Math.sin(theta),
    };
  }

  /* ── PROCEDURAL EARTH TEXTURE (canvas) ──────────────────────── */
  function createEarthTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Ocean base — deep blue-black with subtle variation
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, 1024);
    oceanGrad.addColorStop(0, '#0a1420');
    oceanGrad.addColorStop(0.3, '#0d1a28');
    oceanGrad.addColorStop(0.5, '#0f1d2e');
    oceanGrad.addColorStop(0.7, '#0d1a28');
    oceanGrad.addColorStop(1, '#08101a');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, 2048, 1024);

    // Draw country outlines from world data
    if (typeof WORLD_COUNTRY_PATHS !== 'undefined') {
      // Parse the pipe-separated paths
      const paths = WORLD_COUNTRY_PATHS.split('|');
      ctx.strokeStyle = 'rgba(201, 168, 76, 0.25)';
      ctx.fillStyle = 'rgba(201, 168, 76, 0.10)';
      ctx.lineWidth = 0.8;

      paths.forEach(d => {
        ctx.beginPath();
        // Parse SVG path commands
        const cmds = d.match(/[MLZ]/g) || [];
        const nums = d.match(/-?[\d.]+/g) || [];
        let ni = 0;
        let first = true;
        for (let ci = 0; ci < cmds.length; ci++) {
          const cmd = cmds[ci];
          if (cmd === 'M' || cmd === 'L') {
            const x = parseFloat(nums[ni++]);
            const y = parseFloat(nums[ni++]);
            // World coords: x=0..360, y=0..180 → canvas 0..2048, 0..1024
            const cx = (x / 360) * 2048;
            const cy = (y / 180) * 1024;
            if (cmd === 'M' && first) {
              ctx.moveTo(cx, cy);
              first = false;
            } else {
              ctx.lineTo(cx, cy);
            }
          }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
    }

    // Subtle noise texture for ocean depth
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * 2048;
      const y = Math.random() * 1024;
      const r = Math.random() * 3 + 1;
      ctx.fillStyle = `rgba(20, 40, 60, ${Math.random() * 0.15})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight tobacco-growing regions with warm gold tint
    TERROIR.forEach(t => {
      const v = latLonToVec3(t.lat, t.lon, 1);
      const x = ((v.x + 1) / 2) * 2048;
      const y = ((1 - v.y) / 2) * 1024;
      // Simpler: use lat/lon directly
      const cx = ((t.lon + 180) / 360) * 2048;
      const cy = ((90 - t.lat) / 180) * 1024;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
      grad.addColorStop(0, 'rgba(201, 168, 76, 0.15)');
      grad.addColorStop(1, 'rgba(201, 168, 76, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.fill();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /* ── NIGHT TEXTURE (city lights) ────────────────────────────── */
  function createNightTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Dark base
    ctx.fillStyle = '#020410';
    ctx.fillRect(0, 0, 1024, 512);

    // City lights — random clusters representing urban areas
    const cities = [
      // North America
      [0.15, 0.32], [0.17, 0.35], [0.20, 0.30], [0.22, 0.33], [0.14, 0.28],
      [0.25, 0.35], [0.19, 0.38],
      // Europe
      [0.48, 0.28], [0.50, 0.30], [0.52, 0.27], [0.49, 0.32], [0.51, 0.25],
      [0.47, 0.30], [0.53, 0.29],
      // Asia
      [0.62, 0.32], [0.65, 0.35], [0.70, 0.33], [0.72, 0.30], [0.68, 0.38],
      [0.75, 0.35], [0.78, 0.32],
      // South America
      [0.28, 0.55], [0.30, 0.60], [0.32, 0.52], [0.26, 0.58],
      // Africa
      [0.52, 0.45], [0.55, 0.48], [0.50, 0.42], [0.53, 0.52],
      // Australia
      [0.82, 0.62], [0.85, 0.65],
    ];

    cities.forEach(([fx, fy]) => {
      const cx = fx * 1024;
      const cy = fy * 512;
      // Cluster of lights
      for (let i = 0; i < 12; i++) {
        const x = cx + (Math.random() - 0.5) * 30;
        const y = cy + (Math.random() - 0.5) * 20;
        const r = Math.random() * 1.5 + 0.5;
        const brightness = Math.random() * 0.6 + 0.3;
        ctx.fillStyle = `rgba(255, 220, 150, ${brightness})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /* ── DAY/NIGHT SHADER ────────────────────────────────────────── */
  function createDayNightMaterial(dayTex, nightTex) {
    return new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: dayTex },
        nightTexture: { value: nightTex },
        sunDirection: { value: new THREE.Vector3(1, 0, 0) },
        atmosphereColor: { value: new THREE.Color(0.3, 0.4, 0.6) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec3 sunDirection;
        uniform vec3 atmosphereColor;
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
          float intensity = dot(normalize(vNormal), normalize(sunDirection));

          // Smooth transition between day and night
          float dayAmount = smoothstep(-0.15, 0.25, intensity);

          vec3 dayColor = texture2D(dayTexture, vUv).rgb;
          vec3 nightColor = texture2D(nightTexture, vUv).rgb;

          // Blend day and night
          vec3 color = mix(nightColor, dayColor, dayAmount);

          // Add atmosphere tint on the day side
          float atmosphereAmount = pow(1.0 - abs(intensity), 2.0) * 0.3;
          color += atmosphereColor * atmosphereAmount * (1.0 - dayAmount);

          // Slight glow on the terminator line
          float terminator = 1.0 - abs(intensity - 0.05);
          terminator = max(0.0, terminator);
          color += vec3(0.4, 0.3, 0.15) * terminator * 0.15;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }

  /* ── ATMOSPHERE GLOW (Fresnel) ───────────────────────────────── */
  function createAtmosphere() {
    const geom = new THREE.SphereGeometry(GLOBE_RADIUS * 1.15, 64, 64);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0.4, 0.5, 0.7) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          float intensity = pow(0.5 - dot(vNormal, vec3(0, 0, 1.0)), 2.5);
          gl_FragColor = vec4(glowColor, intensity * 0.5);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    return new THREE.Mesh(geom, mat);
  }

  /* ── STAR FIELD ──────────────────────────────────────────────── */
  function createStarField() {
    const geom = new THREE.BufferGeometry();
    const count = 2000;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = 50 + Math.random() * 50;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      sizes[i] = Math.random() * 1.5 + 0.5;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return new THREE.Points(geom, mat);
  }

  /* ── EMBER (presence marker) ────────────────────────────────── */
  function createEmber(lat, lon, isMe, label) {
    const group = new THREE.Group();
    const pos = latLonToVec3(lat, lon, GLOBE_RADIUS * 1.01);

    // Core glow sprite
    const coreGeom = new THREE.SphereGeometry(0.012, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({
      color: isMe ? 0xe0c070 : 0xff8040,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    group.add(core);

    // Outer glow
    const glowGeom = new THREE.SphereGeometry(0.025, 12, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: isMe ? 0xc9a84c : 0xe07b3a,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    group.add(glow);

    // Vertical beam — light rising off the surface
    const beamHeight = 0.08;
    const beamGeom = new THREE.CylinderGeometry(0.003, 0.008, beamHeight, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: isMe ? 0xe0c070 : 0xff8040,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeom, beamMat);
    // Orient beam outward from globe center
    const beamPos = latLonToVec3(lat, lon, GLOBE_RADIUS + beamHeight / 2);
    beam.position.set(beamPos.x, beamPos.y, beamPos.z);
    beam.lookAt(0, 0, 0);
    beam.rotateX(Math.PI / 2);
    group.add(beam);

    group.position.set(pos.x, pos.y, pos.z);
    group.userData = { lat, lon, isMe, label, core, glow, beam, pulse: Math.random() * Math.PI * 2 };

    return group;
  }

  /* ── TERROIR MARKER ──────────────────────────────────────────── */
  function createTerroirMarker(lat, lon, count) {
    const group = new THREE.Group();
    const pos = latLonToVec3(lat, lon, GLOBE_RADIUS * 1.005);

    const r = Math.max(0.008, Math.min(0.018, 0.006 + Math.log10(count + 1) * 0.006));

    // Diamond marker
    const geom = new THREE.OctahedronGeometry(r, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc9a84c,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const diamond = new THREE.Mesh(geom, mat);
    group.add(diamond);

    // Halo ring
    const ringGeom = new THREE.RingGeometry(r * 1.5, r * 2, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc9a84c,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.lookAt(0, 0, 0);
    group.add(ring);

    group.position.set(pos.x, pos.y, pos.z);
    group.lookAt(0, 0, 0);
    group.userData = { diamond, ring, pulse: Math.random() * Math.PI * 2 };

    return group;
  }

  /* ── LEAF-JOURNEY ARC ────────────────────────────────────────── */
  function createArc(fromLat, fromLon, toLat, toLon) {
    const from = latLonToVec3(fromLat, fromLon, GLOBE_RADIUS);
    const to = latLonToVec3(toLat, toLon, GLOBE_RADIUS);

    // Midpoint lifted off the surface
    const mid = {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      z: (from.z + to.z) / 2,
    };
    const midDist = Math.sqrt(mid.x * mid.x + mid.y * mid.y + mid.z * mid.z);
    const lift = 1 + Math.min(0.3, Math.sqrt(
      Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2) + Math.pow(to.z - from.z, 2)
    ) * 0.3);
    const scale = lift / midDist;
    mid.x *= scale;
    mid.y *= scale;
    mid.z *= scale;

    // Quadratic bezier curve
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(mid.x, mid.y, mid.z),
      new THREE.Vector3(to.x, to.y, to.z),
    );

    const points = curve.getPoints(40);
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0xc9a84c,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return new THREE.Line(geom, mat);
  }

  /* ── SUN DIRECTION (for day/night) ───────────────────────────── */
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

    return new THREE.Vector3(
      Math.cos(declRad) * Math.cos(lonRad),
      Math.sin(declRad),
      Math.cos(declRad) * Math.sin(lonRad),
    );
  }

  /* ── INIT ────────────────────────────────────────────────────── */
  function init(container) {
    if (!container) return false;

    // Load Three.js from CDN if not already loaded
    if (typeof window.THREE !== 'undefined') {
      THREE = window.THREE;
    }

    if (!THREE) {
      // Load dynamically
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
      script.onload = () => { THREE = window.THREE; init(container); };
      script.onerror = () => { return false; };
      document.head.appendChild(script);
      return 'loading';
    }

    try {
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 300;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      camera.position.set(0, 0, zoom);

      // Globe
      const earthTex = createEarthTexture();
      const nightTex = createNightTexture();
      const globeGeom = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
      const globeMat = createDayNightMaterial(earthTex, nightTex);
      globe = new THREE.Mesh(globeGeom, globeMat);
      scene.add(globe);

      // Atmosphere
      atmosphere = createAtmosphere();
      scene.add(atmosphere);

      // Stars
      starField = createStarField();
      scene.add(starField);

      // Groups for dynamic content
      emberGroup = new THREE.Group();
      globe.add(emberGroup);
      terroirGroup = new THREE.Group();
      globe.add(terroirGroup);
      arcGroup = new THREE.Group();
      globe.add(arcGroup);

      // Terroir markers
      const cigarCounts = {};
      if (typeof CIGARS !== 'undefined') {
        CIGARS.forEach(c => { cigarCounts[c.origin] = (cigarCounts[c.origin] || 0) + 1; });
      }
      TERROIR.forEach(t => {
        const n = cigarCounts[t.origin] || 0;
        if (!n) return;
        const marker = createTerroirMarker(t.lat, t.lon, n);
        terroirGroup.add(marker);
      });

      // Raycaster for interactions
      raycaster = new THREE.Raycaster();
      mouse = new THREE.Vector2();

      // Event listeners
      const el = renderer.domElement;
      el.addEventListener('mousedown', onDragStart);
      el.addEventListener('touchstart', onDragStart, { passive: true });
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('touchmove', onDragMove, { passive: true });
      window.addEventListener('mouseup', onDragEnd);
      window.addEventListener('touchend', onDragEnd);
      el.addEventListener('wheel', onWheel, { passive: false });
      el.addEventListener('click', onClick);

      // Resize observer
      const ro = new ResizeObserver(() => onResize(container));
      ro.observe(container);

      // Start render loop
      animate();

      return true;
    } catch (e) {
      console.error('3D globe init failed:', e);
      return false;
    }
  }

  /* ── CONTROLS ────────────────────────────────────────────────── */
  function onDragStart(e) {
    isDragging = true;
    autoRotate = false;
    lastInteraction = Date.now();
    const p = e.touches ? e.touches[0] : e;
    dragStartX = p.clientX;
    dragStartY = p.clientY;
    targetRotY = rotY;
    targetRotX = rotX;
  }

  function onDragMove(e) {
    if (!isDragging) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - dragStartX;
    const dy = p.clientY - dragStartY;
    targetRotY = rotY + dx * 0.005;
    targetRotX = Math.max(-1.2, Math.min(1.2, rotX + dy * 0.005));
  }

  function onDragEnd() {
    isDragging = false;
    lastInteraction = Date.now();
  }

  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.2 : -0.2;
    targetZoom = Math.max(1.5, Math.min(6, targetZoom + delta));
    lastInteraction = Date.now();
  }

  function onClick(e) {
    // Resume auto-rotate after 3s of no interaction
    lastInteraction = Date.now();
  }

  function onResize(container) {
    if (!renderer || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* ── ANIMATION LOOP ──────────────────────────────────────────── */
  function animate() {
    if (!renderer || !scene || !camera) return;
    requestAnimationFrame(animate);

    // Auto-rotate after 4s of no interaction
    if (!isDragging && Date.now() - lastInteraction > 4000) {
      autoRotate = true;
    }
    if (autoRotate) {
      targetRotY += 0.0015;
    }

    // Smooth interpolation
    rotY += (targetRotY - rotY) * 0.08;
    rotX += (targetRotX - rotX) * 0.08;
    zoom += (targetZoom - zoom) * 0.08;

    globe.rotation.y = rotY;
    globe.rotation.x = rotX;
    camera.position.z = zoom;

    // Update sun direction
    if (globe && globe.material && globe.material.uniforms) {
      globe.material.uniforms.sunDirection.value.copy(sunDirection());
    }

    // Pulse embers
    if (emberGroup) {
      emberGroup.children.forEach(ember => {
        const ud = ember.userData;
        if (!ud) return;
        ud.pulse += 0.04;
        const pulse = 0.7 + Math.sin(ud.pulse) * 0.3;
        if (ud.core) ud.core.scale.setScalar(pulse);
        if (ud.glow) {
          ud.glow.scale.setScalar(pulse * 1.5);
          ud.glow.material.opacity = 0.15 + Math.sin(ud.pulse) * 0.2;
        }
        if (ud.beam) {
          ud.beam.material.opacity = 0.2 + Math.sin(ud.pulse * 0.7) * 0.2;
        }
      });
    }

    // Pulse terroir markers
    if (terroirGroup) {
      terroirGroup.children.forEach(m => {
        const ud = m.userData;
        if (!ud) return;
        ud.pulse += 0.02;
        const s = 1 + Math.sin(ud.pulse) * 0.15;
        if (ud.diamond) {
          ud.diamond.scale.setScalar(s);
          ud.diamond.rotation.y += 0.01;
          ud.diamond.rotation.x += 0.005;
        }
        if (ud.ring) {
          ud.ring.scale.setScalar(1 + Math.sin(ud.pulse + Math.PI) * 0.2);
          ud.ring.material.opacity = 0.1 + Math.sin(ud.pulse) * 0.15;
        }
      });
    }

    // Slowly rotate star field
    if (starField) {
      starField.rotation.y += 0.0001;
    }

    renderer.render(scene, camera);
  }

  /* ── UPDATE PRESENCE ─────────────────────────────────────────── */
  function updatePresence(sessions) {
    if (!emberGroup || !arcGroup) return;

    // Clear old embers and arcs
    while (emberGroup.children.length) emberGroup.remove(emberGroup.children[0]);
    while (arcGroup.children.length) arcGroup.remove(arcGroup.children[0]);

    if (!sessions || !sessions.length) return;

    const myId = (typeof LoungeBackend !== 'undefined' && LoungeBackend.getMe) ? null : null;

    sessions.forEach(s => {
      if (!s.loc || typeof s.loc.lat !== 'number') return;

      const isMe = false; // Will be set by caller
      const ember = createEmber(s.loc.lat, s.loc.lon, isMe, s.handle);
      emberGroup.add(ember);

      // Create arc from terroir to smoker if they're smoking something
      if (s.itemId && s.itemName) {
        // Try to find the cigar's origin
        let origin = null;
        if (typeof CIGARS !== 'undefined') {
          const cigar = CIGARS.find(c => c.id === s.itemId);
          if (cigar) origin = cigar.origin;
        }
        if (origin) {
          const terroir = TERROIR.find(t => t.origin === origin);
          if (terroir) {
            const arc = createArc(terroir.lat, terroir.lon, s.loc.lat, s.loc.lon);
            arcGroup.add(arc);
          }
        }
      }
    });
  }

  /* ── PUBLIC API ──────────────────────────────────────────────── */
  window.VPGlobe = {
    init: init,
    updatePresence: updatePresence,
    isReady: () => renderer !== null,
    destroy: () => {
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
        renderer = null;
      }
    },
  };

  // Hook into lounge renderPresence — replace the 2D map when WebGL is available
  let globeInitialized = false;
  let globeContainer = null;

  function tryInitGlobe() {
    const mapEl = document.getElementById('lgMap');
    if (!mapEl || globeInitialized) return;

    // Create a container for the 3D globe inside the map
    globeContainer = document.createElement('div');
    globeContainer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:6;';
    mapEl.appendChild(globeContainer);

    const result = init(globeContainer);
    if (result === true) {
      globeInitialized = true;
      // Hide the SVG and dots layer
      const svg = mapEl.querySelector('.lg-map-svg');
      const dots = document.getElementById('lgMapDots');
      if (svg) svg.style.opacity = '0';
      if (dots) dots.style.display = 'none';
    } else if (result === 'loading') {
      // Will retry when Three.js loads
      setTimeout(() => {
        const r = init(globeContainer);
        if (r === true) {
          globeInitialized = true;
          const svg = mapEl.querySelector('.lg-map-svg');
          const dots = document.getElementById('lgMapDots');
          if (svg) svg.style.opacity = '0';
          if (dots) dots.style.display = 'none';
        } else {
          globeContainer.remove();
        }
      }, 500);
    } else {
      globeContainer.remove();
    }
  }

  // Watch for lounge view becoming visible
  const observer = new MutationObserver(() => {
    const mapEl = document.getElementById('lgMap');
    if (mapEl && mapEl.offsetParent !== null && !globeInitialized) {
      tryInitGlobe();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

  // Also try on lounge nav click
  document.addEventListener('click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.view === 'lounge') {
      setTimeout(tryInitGlobe, 800);
    }
  });

  // Intercept renderPresence to update the globe
  const origRenderPresence = window.Lounge ? null : null;
  if (window.LoungeBackend) {
    const checkAndHook = () => {
      if (window.Lounge && typeof window.Lounge.refresh === 'function') {
        // Lounge is initialized — hook will be via polling updatePresence
      }
    };
    setTimeout(checkAndHook, 1000);
  }

  // Poll for presence data to feed the globe
  let lastPresenceCount = -1;
  setInterval(() => {
    if (!globeInitialized || !window.VPGlobe) return;
    // The globe reads presence from the DOM dots or we can call the backend
    // Check if new embers appeared
    const dots = document.querySelectorAll('.lg-ember');
    if (dots.length !== lastPresenceCount) {
      lastPresenceCount = dots.length;
      // Parse presence from the dot elements
      const sessions = [];
      dots.forEach(dot => {
        const style = dot.getAttribute('style') || '';
        const leftMatch = style.match(/left:\s*([\d.]+)%/);
        const topMatch = style.match(/top:\s*([\d.]+)%/);
        if (leftMatch && topMatch) {
          const left = parseFloat(leftMatch[1]);
          const top = parseFloat(topMatch[1]);
          // Convert percentage back to lat/lon
          const lon = (left / 100) * 360 - 180;
          const lat = 90 - (top / 100) * 180;
          const isMe = dot.classList.contains('is-me');
          const label = dot.querySelector('.lg-ec-head') ? dot.querySelector('.lg-ec-head').textContent.trim() : '';
          const itemMatch = dot.querySelector('.lg-ec-item');
          const itemId = itemMatch ? itemMatch.dataset.item : null;
          sessions.push({ loc: { lat, lon }, isMe, handle: label, itemId: null, itemName: itemMatch ? itemMatch.textContent.trim() : null });
        }
      });
      updatePresence(sessions);
    }
  }, 2000);

})();
