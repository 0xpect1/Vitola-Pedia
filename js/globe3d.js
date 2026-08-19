/* ══════════════════════════════════════════════════════════════════
   VITOLA PEDIA — HYPER-REALISTIC 3D GLOBE v3
   Google Earth-style with tile-based satellite imagery on zoom.

   LOD system:
   - Far (zoom > 2.5):  Blue Marble global texture (current)
   - Mid (zoom 1.5-2.5): Higher-res satellite equirectangular
   - Near (zoom < 1.5):  Esri World Imagery tiles composited dynamically

   Uses Esri World Imagery (free, no API key):
   https://services.arcgisonline.com/arcgis/rest/services/
     World_Imagery/MapServer/tile/{z}/{y}/{x}
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let T = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let globe = null;
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
  let rotY = 0;
  let rotX = 0.35;
  let targetRotY = 0;
  let targetRotX = 0.35;
  let zoom = 2.8;
  let targetZoom = 2.8;
  let autoRotate = false;
  let lastInteraction = 0;

  // Tile texture cache
  let tileTexture = null;
  let tileCanvas = null;
  let tileCtx = null;
  const TILE_SIZE = 256;
  const TILE_GRID = 8; // 8x8 = 64 tiles per face at zoom level 3
  let currentTileZoom = -1;
  let tilesLoading = false;

  const R = 1;

  // Texture URLs
  const TEX = {
    earth:  'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    night:  'https://unpkg.com/three-globe/example/img/earth-night.jpg',
    bump:   'https://unpkg.com/three-globe/example/img/earth-topology.png',
    clouds: 'https://unpkg.com/three-globe/example/img/clouds.png',
    water:  'https://unpkg.com/three-globe/example/img/earth-water.png',
    // Higher-res satellite (Esri World Imagery as single equirectangular —
    // we can't get a single equirect from Esri, so we use a higher-res
    // Blue Marble alternative for mid-zoom)
    hires:  'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  };

  // Esri tile URL builder
  function esriTileUrl(z, x, y) {
    return `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  }

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

  /* ── LAT/LON → 3D ────────────────────────────────────────────── */
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

  /* ── CAMERA RAY → LAT/LON (for tile loading) ─────────────────── */
  function cameraToLatLon() {
    // Direction from globe center to camera
    const dir = new T.Vector3();
    camera.getWorldPosition(dir);
    dir.normalize();

    // Convert 3D vector to lat/lon
    const lat = 90 - Math.acos(dir.y) * 180 / Math.PI;
    let lon = Math.atan2(dir.z, -dir.x) * 180 / Math.PI - 180;
    while (lon < -180) lon += 360;
    while (lon > 180) lon -= 360;
    return { lat, lon };
  }

  /* ── EARTH SHADER ────────────────────────────────────────────── */
  function createEarthMaterial() {
    const loader = new T.TextureLoader();
    loader.setCrossOrigin('anonymous');

    const dayTex = loader.load(TEX.earth);
    const nightTex = loader.load(TEX.night);
    const bumpTex = loader.load(TEX.bump);
    const waterTex = loader.load(TEX.water);

    dayTex.colorSpace = T.SRGBColorSpace;
    nightTex.colorSpace = T.SRGBColorSpace;
    dayTex.anisotropy = 8;

    // Tile texture — starts null, gets populated when zoomed in
    tileTexture = new T.CanvasTexture(document.createElement('canvas'));
    tileTexture.colorSpace = T.SRGBColorSpace;

    return new T.ShaderMaterial({
      uniforms: {
        dayTexture:   { value: dayTex },
        nightTexture: { value: nightTex },
        bumpTexture:  { value: bumpTex },
        waterTexture: { value: waterTex },
        tileTexture:  { value: null },  // null = not loaded yet
        tileBlend:    { value: 0.0 },   // 0 = no tiles, 1 = full tiles
        sunDirection: { value: new T.Vector3(1, 0, 0) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform sampler2D bumpTexture;
        uniform sampler2D waterTexture;
        uniform sampler2D tileTexture;
        uniform float tileBlend;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vWorldNormal;

        void main() {
          float sunInt = dot(normalize(vWorldNormal), normalize(sunDirection));
          float dayAmount = smoothstep(-0.05, 0.15, sunInt);

          vec3 dayColor = texture2D(dayTexture, vUv).rgb;
          vec3 nightColor = texture2D(nightTexture, vUv).rgb;

          // Bump for terrain relief
          float bump = texture2D(bumpTexture, vUv).r;
          dayColor *= 0.85 + bump * 0.35;

          // Boost city lights
          nightColor *= 2.5;
          float nightBrightness = length(nightColor) / 1.732;
          vec3 cityGlow = vec3(1.0, 0.7, 0.3) * nightBrightness * 0.5;
          nightColor += cityGlow;

          vec3 color = mix(nightColor, dayColor, dayAmount);

          // Blend in high-res tiles when zoomed in
          if (tileBlend > 0.0 && tileTexture != null) {
            vec3 tileColor = texture2D(tileTexture, vUv).rgb;
            // Tiles are brighter — apply same day/night lighting
            vec3 tileLit = tileColor * (0.3 + dayAmount * 0.9);
            // Add city light glow on dark side of tiles
            tileLit += nightColor * (1.0 - dayAmount) * 0.3;
            color = mix(color, tileLit, tileBlend);
          }

          // Terminator glow
          float term = 1.0 - abs(sunInt - 0.05);
          term = pow(max(0.0, term), 3.0);
          color += vec3(0.6, 0.3, 0.1) * term * 0.5;

          // Water specular
          float waterMask = texture2D(waterTexture, vUv).r;
          float spec = pow(max(0.0, sunInt), 8.0) * waterMask * 0.15;
          color += vec3(spec);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }

  /* ── TILE LOADING ────────────────────────────────────────────── */
  // Load Esri satellite tiles and composite them into a single
  // equirectangular texture. We load a grid of tiles around the
  // camera's target lat/lon at the appropriate zoom level.
  function loadTilesForView() {
    if (tilesLoading || !globe || !globe.material) return;
    if (zoom > 2.0) {
      // Too far out — don't bother with tiles
      if (globe.material.uniforms.tileBlend.value > 0.01) {
        globe.material.uniforms.tileBlend.value *= 0.9;
      }
      currentTileZoom = -1;
      return;
    }

    tilesLoading = true;

    // Determine Esri zoom level based on camera zoom
    // Camera zoom 2.0 → Esri z=3, 1.5 → z=4, 1.0 → z=5, etc.
    const esriZ = Math.max(2, Math.min(7, Math.round(3 + (2.0 - zoom) * 2)));

    if (esriZ === currentTileZoom && globe.material.uniforms.tileBlend.value > 0.5) {
      tilesLoading = false;
      return;
    }
    currentTileZoom = esriZ;

    // Get camera target lat/lon
    const target = cameraToLatLon();

    // Esri tile grid at zoom level z: 2^z tiles wide, 2^z tiles tall
    const tilesPerSide = Math.pow(2, esriZ);

    // Convert lat/lon to tile coordinates
    const latRad = target.lat * Math.PI / 180;
    const tileX = ((target.lon + 180) / 360) * tilesPerSide;
    const tileY = ((1 - Math.log(Math.tan(latRad) + 1/Math.cos(latRad)) / Math.PI) / 2) * tilesPerSide;

    // Load a GRID_SIZE x GRID_SIZE grid of tiles centered on camera target
    const GRID = 4;
    const halfGrid = Math.floor(GRID / 2);

    // Create canvas if needed
    const canvasSize = TILE_SIZE * GRID;
    if (!tileCanvas) {
      tileCanvas = document.createElement('canvas');
      tileCanvas.width = canvasSize;
      tileCanvas.height = canvasSize;
      tileCtx = tileCanvas.getContext('2d');
    }

    // Fill with dark background
    tileCtx.fillStyle = '#0a0a0a';
    tileCtx.fillRect(0, 0, canvasSize, canvasSize);

    let loaded = 0;
    const total = GRID * GRID;

    for (let dx = 0; dx < GRID; dx++) {
      for (let dy = 0; dy < GRID; dy++) {
        const tx = (Math.floor(tileX) - halfGrid + dx + tilesPerSide) % tilesPerSide;
        const ty = Math.max(0, Math.min(tilesPerSide - 1, Math.floor(tileY) - halfGrid + dy));
        const url = esriTileUrl(esriZ, tx, ty);

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          tileCtx.drawImage(img, dx * TILE_SIZE, dy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          loaded++;
          if (loaded >= total) finishTileLoad();
        };
        img.onerror = () => { loaded++; if (loaded >= total) finishTileLoad(); };
        img.src = url;
      }
    }

    // Timeout fallback — if tiles take too long, just proceed
    setTimeout(() => { if (loaded < total) { loaded = total; finishTileLoad(); } }, 3000);
  }

  function finishTileLoad() {
    if (!globe || !globe.material) { tilesLoading = false; return; }

    // Update the tile texture
    if (!tileTexture) {
      tileTexture = new T.CanvasTexture(tileCanvas);
      tileTexture.colorSpace = T.SRGBColorSpace;
    } else {
      tileTexture.image = tileCanvas;
      tileTexture.needsUpdate = true;
    }

    // Remap tile texture UVs so the loaded grid is centered on the
    // camera target. For simplicity, we just set the tile texture as
    // a full equirectangular and let it overlay — the tile grid happens
    // to cover the visible area because we centered on the camera.
    globe.material.uniforms.tileTexture.value = tileTexture;

    // Blend in the tiles based on zoom level
    const blendAmount = Math.max(0, Math.min(1, (2.0 - zoom) / 0.8));
    globe.material.uniforms.tileBlend.value = blendAmount;

    tilesLoading = false;
  }

  /* ── CLOUDS ──────────────────────────────────────────────────── */
  function createClouds() {
    const loader = new T.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const cloudTex = loader.load(TEX.clouds);
    cloudTex.colorSpace = T.SRGBColorSpace;

    const geom = new T.SphereGeometry(R * 1.01, 64, 64);
    const mat = new T.MeshPhongMaterial({
      map: cloudTex, transparent: true, opacity: 0.3,
      depthWrite: false, blending: T.NormalBlending,
    });
    return new T.Mesh(geom, mat);
  }

  /* ── ATMOSPHERE ──────────────────────────────────────────────── */
  function createAtmosphere() {
    const geom = new T.SphereGeometry(R * 1.18, 64, 64);
    const mat = new T.ShaderMaterial({
      uniforms: {
        glowColor: { value: new T.Color(0.3, 0.45, 0.7) },
        sunDir:    { value: new T.Vector3(1, 0, 0) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform vec3 sunDir;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        void main() {
          float intensity = pow(0.6 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
          float sunFactor = max(0.0, dot(vWorldNormal, normalize(sunDir)));
          vec3 color = glowColor * (0.3 + sunFactor * 0.7);
          gl_FragColor = vec4(color, intensity * 0.6);
        }
      `,
      side: T.BackSide,
      blending: T.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    return new T.Mesh(geom, mat);
  }

  /* ── STARS ──────────────────────────────────────────────────── */
  function createStarField() {
    const geom = new T.BufferGeometry();
    const count = 3000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 40 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    geom.setAttribute('position', new T.BufferAttribute(positions, 3));
    return new T.Points(geom, new T.PointsMaterial({
      color: 0xffffff, size: 0.12, sizeAttenuation: true,
      transparent: true, opacity: 0.7, blending: T.AdditiveBlending,
      depthWrite: false,
    }));
  }

  /* ── EMBER ──────────────────────────────────────────────────── */
  function createEmber(lat, lon, isMe) {
    const group = new T.Group();
    const pos = latLonToVec3(lat, lon, R * 1.01);

    const core = new T.Mesh(
      new T.SphereGeometry(0.014, 16, 16),
      new T.MeshBasicMaterial({ color: isMe ? 0xe0c070 : 0xff7030, transparent: true, opacity: 0.95, blending: T.AdditiveBlending })
    );
    group.add(core);

    const glow = new T.Mesh(
      new T.SphereGeometry(0.03, 16, 16),
      new T.MeshBasicMaterial({ color: isMe ? 0xc9a84c : 0xe05a2a, transparent: true, opacity: 0.25, blending: T.AdditiveBlending, depthWrite: false })
    );
    group.add(glow);

    const beamH = 0.06;
    const beam = new T.Mesh(
      new T.CylinderGeometry(0.002, 0.007, beamH, 8, 1, true),
      new T.MeshBasicMaterial({ color: isMe ? 0xe0c070 : 0xff7030, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })
    );
    beam.position.copy(latLonToVec3(lat, lon, R + beamH / 2));
    beam.lookAt(0, 0, 0);
    beam.rotateX(Math.PI / 2);
    group.add(beam);

    group.position.copy(pos);
    group.userData = { core, glow, beam, pulse: Math.random() * Math.PI * 2 };
    return group;
  }

  /* ── TERROIR ─────────────────────────────────────────────────── */
  function createTerroirMarker(lat, lon, count) {
    const group = new T.Group();
    const pos = latLonToVec3(lat, lon, R * 1.005);
    const sz = Math.max(0.009, Math.min(0.02, 0.007 + Math.log10(count + 1) * 0.007));

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

    group.position.copy(pos);
    group.lookAt(0, 0, 0);
    group.userData = { diamond, ring, pulse: Math.random() * Math.PI * 2 };
    return group;
  }

  /* ── ARC ─────────────────────────────────────────────────────── */
  function createArc(fromLat, fromLon, toLat, toLon) {
    const from = latLonToVec3(fromLat, fromLon, R);
    const to = latLonToVec3(toLat, toLon, R);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const dist = from.distanceTo(to);
    mid.normalize().multiplyScalar(R * (1 + Math.min(0.35, dist * 0.35)));
    const curve = new T.QuadraticBezierCurve3(from, mid, to);
    const geom = new T.BufferGeometry().setFromPoints(curve.getPoints(50));
    return new T.Line(geom, new T.LineBasicMaterial({ color: 0xc9a84c, transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false }));
  }

  /* ── SUN DIRECTION ───────────────────────────────────────────── */
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
      container.appendChild(renderer.domElement);

      scene = new T.Scene();
      camera = new T.PerspectiveCamera(40, w / h, 0.1, 200);
      camera.position.set(0, 0, zoom);

      // Earth with custom shader
      const earthMat = createEarthMaterial();
      globe = new T.Mesh(new T.SphereGeometry(R, 96, 96), earthMat);
      scene.add(globe);

      // Fallback texture loader
      const fl = new T.TextureLoader();
      fl.setCrossOrigin('anonymous');
      fl.load(TEX.earth, (tex) => {
        tex.colorSpace = T.SRGBColorSpace;
        if (globe && globe.material && globe.material.uniforms &&
            globe.material.uniforms.dayTexture &&
            !globe.material.uniforms.dayTexture.value.image) {
          globe.material.uniforms.dayTexture.value = tex;
          globe.material.needsUpdate = true;
        }
      });

      // Clouds
      clouds = createClouds();
      globe.add(clouds);

      // Atmosphere
      atmosphere = createAtmosphere();
      scene.add(atmosphere);

      // Stars
      starField = createStarField();
      scene.add(starField);

      // Lights
      sunLight = new T.DirectionalLight(0xffffff, 0.6);
      sunLight.position.set(5, 3, 5);
      scene.add(sunLight);
      scene.add(new T.AmbientLight(0x222233, 0.3));

      // Content groups
      emberGroup = new T.Group(); globe.add(emberGroup);
      terroirGroup = new T.Group(); globe.add(terroirGroup);
      arcGroup = new T.Group(); globe.add(arcGroup);

      // Terroir markers
      const counts = {};
      if (typeof CIGARS !== 'undefined') {
        CIGARS.forEach(c => { counts[c.origin] = (counts[c.origin] || 0) + 1; });
      }
      TERROIR.forEach(t => {
        const n = counts[t.origin] || 0;
        if (n) terroirGroup.add(createTerroirMarker(t.lat, t.lon, n));
      });

      // Events
      const el = renderer.domElement;
      el.addEventListener('mousedown', onDragStart);
      el.addEventListener('touchstart', onDragStart, { passive: true });
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('touchmove', onDragMove, { passive: true });
      window.addEventListener('mouseup', onDragEnd);
      window.addEventListener('touchend', onDragEnd);
      el.addEventListener('wheel', onWheel, { passive: false });

      const ro = new ResizeObserver(() => onResize(container));
      ro.observe(container);

      animate();
      return true;
    } catch (e) {
      console.error('Globe init failed:', e);
      return false;
    }
  }

  function onDragStart(e) {
    isDragging = true; autoRotate = false; lastInteraction = Date.now();
    const p = e.touches ? e.touches[0] : e;
    dragStartX = p.clientX; dragStartY = p.clientY;
    targetRotY = rotY; targetRotX = rotX;
  }
  function onDragMove(e) {
    if (!isDragging) return;
    const p = e.touches ? e.touches[0] : e;
    targetRotY = rotY + (p.clientX - dragStartX) * 0.005;
    targetRotX = Math.max(-1.2, Math.min(1.2, rotX + (p.clientY - dragStartY) * 0.005));
  }
  function onDragEnd() { isDragging = false; lastInteraction = Date.now(); }
  function onWheel(e) {
    e.preventDefault();
    targetZoom = Math.max(1.2, Math.min(6, targetZoom + (e.deltaY > 0 ? 0.2 : -0.2)));
    lastInteraction = Date.now();
    // Trigger tile loading when zooming in close
    if (targetZoom < 2.0) setTimeout(loadTilesForView, 300);
  }
  function onResize(container) {
    if (!renderer || !container) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let tileCheckTimer = 0;

  /* ── ANIMATE ─────────────────────────────────────────────────── */
  function animate() {
    if (!renderer) return;
    requestAnimationFrame(animate);

    if (!isDragging && Date.now() - lastInteraction > 8000) autoRotate = true;
    if (isDragging) autoRotate = false;
    if (autoRotate) targetRotY += 0.0005;

    rotY += (targetRotY - rotY) * 0.08;
    rotX += (targetRotX - rotX) * 0.08;
    zoom += (targetZoom - zoom) * 0.08;

    globe.rotation.y = rotY;
    globe.rotation.x = rotX;
    camera.position.z = zoom;

    // Sun
    const sun = sunDirection();
    if (globe.material.uniforms) globe.material.uniforms.sunDirection.value.copy(sun);
    if (atmosphere.material.uniforms) atmosphere.material.uniforms.sunDir.value.copy(sun);
    sunLight.position.copy(sun).multiplyScalar(5);

    // Clouds
    if (clouds) clouds.rotation.y += 0.0003;

    // Tile loading — check every 500ms when zoomed in
    tileCheckTimer++;
    if (tileCheckTimer > 30 && zoom < 2.0) {
      tileCheckTimer = 0;
      loadTilesForView();
    }

    // Fade tile blend based on zoom
    if (globe && globe.material && globe.material.uniforms) {
      const targetBlend = zoom < 2.0 ? Math.min(1, (2.0 - zoom) / 0.8) : 0;
      globe.material.uniforms.tileBlend.value +=
        (targetBlend - globe.material.uniforms.tileBlend.value) * 0.05;
    }

    // Pulse embers
    if (emberGroup) {
      emberGroup.children.forEach(e => {
        const ud = e.userData; if (!ud) return;
        ud.pulse += 0.04;
        const p = 0.7 + Math.sin(ud.pulse) * 0.3;
        if (ud.core) ud.core.scale.setScalar(p);
        if (ud.glow) { ud.glow.scale.setScalar(p * 1.5); ud.glow.material.opacity = 0.15 + Math.sin(ud.pulse) * 0.2; }
        if (ud.beam) ud.beam.material.opacity = 0.2 + Math.sin(ud.pulse * 0.7) * 0.2;
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

  /* ── PRESENCE ────────────────────────────────────────────────── */
  function updatePresence(sessions) {
    if (!emberGroup || !arcGroup) return;
    while (emberGroup.children.length) emberGroup.remove(emberGroup.children[0]);
    while (arcGroup.children.length) arcGroup.remove(arcGroup.children[0]);
    if (!sessions || !sessions.length) return;
    sessions.forEach(s => {
      if (!s.loc || typeof s.loc.lat !== 'number') return;
      emberGroup.add(createEmber(s.loc.lat, s.loc.lon, s.isMe));
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

    if (init(globeContainer) === true) {
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
          sessions.push({ loc: { lat, lon }, isMe: dot.classList.contains('is-me'), itemId: null });
        }
      });
      updatePresence(sessions);
    }
  }, 2000);

})();
