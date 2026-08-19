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
  let velRotY = 0;    // momentum velocity for rotation
  let velRotX = 0;
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

  // Texture URLs — high-resolution sources for Google Earth richness
  const TEX = {
    // Three.js example textures — known to work with WebGL, CORS-enabled
    earth:  'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
    night:  'https://threejs.org/examples/textures/planets/earth_lights_2048.png',
    bump:   'https://threejs.org/examples/textures/planets/earth_normal_2048.jpg',
    clouds: 'https://threejs.org/examples/textures/planets/earth_clouds_1024.png',
    water:  'https://unpkg.com/three-globe/example/img/earth-water.png',
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
    bumpTex.colorSpace = T.SRGBColorSpace;

    // High-quality texture filtering for crisp continents
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    [dayTex, nightTex, bumpTex, waterTex].forEach(tex => {
      tex.anisotropy = maxAniso;
      tex.minFilter = T.LinearMipmapLinearFilter;
      tex.magFilter = T.LinearFilter;
      tex.generateMipmaps = true;
    });

    // Create a 1x1 placeholder texture for the tile sampler so WebGL
    // doesn't break when tileBlend is 0. Never leave a sampler null.
    const placeholderCanvas = document.createElement('canvas');
    placeholderCanvas.width = 1; placeholderCanvas.height = 1;
    const pCtx = placeholderCanvas.getContext('2d');
    pCtx.fillStyle = '#000000';
    pCtx.fillRect(0, 0, 1, 1);
    const placeholderTex = new T.CanvasTexture(placeholderCanvas);
    placeholderTex.colorSpace = T.SRGBColorSpace;

    // Tile texture — starts null, gets populated when zoomed in
    tileTexture = new T.CanvasTexture(document.createElement('canvas'));
    tileTexture.colorSpace = T.SRGBColorSpace;

    return new T.ShaderMaterial({
      uniforms: {
        dayTexture:   { value: dayTex },
        nightTexture: { value: nightTex },
        bumpTexture:  { value: bumpTex },
        waterTexture: { value: waterTex },
        sunDirection: { value: new T.Vector3(1, 0, 0) },
        // Tile texture starts as a 1x1 black pixel — NOT null.
        // A null sampler in WebGL silently breaks the entire shader.
        tileTexture:  { value: placeholderTex },
        tileBlend:    { value: 0.0 },
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
          vec3 N = normalize(vWorldNormal);
          float sunInt = dot(N, normalize(sunDirection));

          // Sharper terminator — Google Earth has a crisp day/night line
          float dayAmount = smoothstep(-0.03, 0.12, sunInt);
          float nightAmount = 1.0 - dayAmount;

          // ── DAY SIDE ──────────────────────────────────────────
          vec3 dayColor = texture2D(dayTexture, vUv).rgb;
          float bump = texture2D(bumpTexture, vUv).r;

          // Saturation boost — continents pop like Google Earth
          float dayLum = dot(dayColor, vec3(0.299, 0.587, 0.114));
          vec3 daySat = mix(vec3(dayLum), dayColor, 1.35);
          dayColor = mix(dayColor, daySat, 0.6);

          // Terrain relief — darker in valleys, brighter on peaks
          dayColor *= 0.7 + bump * 0.6;

          // Slight contrast curve for richer land
          dayColor = pow(dayColor, vec3(0.88));

          // Ocean specular — sun glint on water (Google Earth signature look)
          float waterMask = texture2D(waterTexture, vUv).r;
          vec3 viewDir = normalize(cameraPosition);
          vec3 reflectDir = reflect(-normalize(sunDirection), N);
          float specAngle = max(0.0, dot(reflectDir, viewDir));
          float oceanSpec = pow(specAngle, 40.0) * waterMask * 2.0;
          float oceanGlint = pow(specAngle, 8.0) * waterMask * 0.3;
          vec3 specColor = vec3(1.0, 0.95, 0.85) * (oceanSpec + oceanGlint);

          // ── NIGHT SIDE ───────────────────────────────────────
          vec3 nightColor = texture2D(nightTexture, vUv).rgb;
          // Boost city lights 3.5x with sharp threshold for visible outlines
          float cityMask = step(0.08, nightColor.r + nightColor.g + nightColor.b);
          nightColor *= 3.5;
          // Warm amber city glow — lights read as warm, not white
          float cityBright = length(nightColor) / 1.732;
          vec3 cityWarm = vec3(1.0, 0.65, 0.25) * cityBright * 0.8;
          nightColor += cityWarm * cityMask;
          // Subtle deep blue ambient on the dark side — never pure black
          nightColor += vec3(0.015, 0.025, 0.05) * (1.0 - waterMask);

          // ── BLEND ────────────────────────────────────────────
          vec3 color = mix(nightColor, dayColor, dayAmount);
          // Add specular only on day side
          color += specColor * dayAmount;

          // ── TWILIGHT BAND ────────────────────────────────────
          float twilight = 1.0 - abs(sunInt - 0.06);
          twilight = pow(max(0.0, twilight), 2.5);
          vec3 twilightColor = vec3(0.85, 0.4, 0.15) * twilight * 0.7;
          color += twilightColor;

          // ── HIGH-RES TILES ───────────────────────────────────
          if (tileBlend > 0.001) {
            vec3 tileColor = texture2D(tileTexture, vUv).rgb;
            // Saturation boost on tiles too
            float tileLum = dot(tileColor, vec3(0.299, 0.587, 0.114));
            vec3 tileSat = mix(vec3(tileLum), tileColor, 1.25);
            tileColor = mix(tileColor, tileSat, 0.5);
            vec3 tileDay = tileColor * (0.75 + bump * 0.4);
            vec3 tileNight = tileColor * 0.02 + nightColor * 0.5;
            vec3 tileLit = mix(tileNight, tileDay, dayAmount);
            tileLit += specColor * waterMask * dayAmount * 0.5;
            tileLit += twilightColor * 0.5;
            color = mix(color, tileLit, tileBlend);
          }

          // ── ATMOSPHERIC SCATTERING (limb darkening + blue tint) ──
          float limbFactor = 1.0 - abs(dot(N, normalize(cameraPosition)));
          limbFactor = pow(limbFactor, 3.0);
          vec3 atmoTint = vec3(0.15, 0.25, 0.45) * limbFactor * dayAmount * 0.3;
          color += atmoTint;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }

  /* ── TILE LOADING ────────────────────────────────────────────── */
  // Load Esri satellite tiles and composite them into a full
  // equirectangular canvas at the correct lat/lon positions.
  // The canvas is 2048x1024 (same UV space as the globe) so tiles
  // land exactly where they should on the sphere.
  function loadTilesForView() {
    if (tilesLoading || !globe || !globe.material) return;
    if (zoom > 2.2) {
      if (globe.material.uniforms.tileBlend.value > 0.01) {
        globe.material.uniforms.tileBlend.value *= 0.88;
      }
      currentTileZoom = -1;
      return;
    }

    tilesLoading = true;

    // Esri zoom level based on camera zoom
    const esriZ = Math.max(2, Math.min(8, Math.round(3 + (2.2 - zoom) * 2.5)));

    if (esriZ === currentTileZoom && globe.material.uniforms.tileBlend.value > 0.5) {
      tilesLoading = false;
      return;
    }
    currentTileZoom = esriZ;

    const target = cameraToLatLon();

    // Esri tile grid: 2^z tiles per side
    const tilesPerSide = Math.pow(2, esriZ);

    // The equirectangular canvas — full world width
    const ECTW = 2048, ECTH = 1024;
    if (!tileCanvas) {
      tileCanvas = document.createElement('canvas');
      tileCanvas.width = ECTW;
      tileCanvas.height = ECTH;
      tileCtx = tileCanvas.getContext('2d');
    }

    // Fill with transparent (we only want tiles where they load)
    tileCtx.clearRect(0, 0, ECTW, ECTH);

    // Each Esri tile covers 360/tilesPerSide degrees of longitude
    // and 180/tilesPerSide degrees of latitude
    const degPerTileX = 360 / tilesPerSide;
    const degPerTileY = 180 / tilesPerSide;

    // Determine which tiles to load — a window centered on the camera target
    // At low zoom (z=3, 8 tiles), load ALL tiles. At high zoom, load a grid.
    const windowSize = Math.min(tilesPerSide, esriZ <= 3 ? tilesPerSide : 6);
    const halfWin = Math.floor(windowSize / 2);

    // Camera target in tile coordinates
    const latRad = target.lat * Math.PI / 180;
    const camTileX = ((target.lon + 180) / 360) * tilesPerSide;
    const camTileY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tilesPerSide;

    // Clamp tile Y range
    const startY = Math.max(0, Math.min(tilesPerSide - 1, Math.floor(camTileY) - halfWin));
    const endY = Math.max(0, Math.min(tilesPerSide - 1, startY + windowSize - 1));

    let loaded = 0;
    let total = 0;

    // Count total first
    for (let ty = startY; ty <= endY; ty++) {
      for (let dx = 0; dx < windowSize; dx++) {
        total++;
      }
    }

    for (let ty = startY; ty <= endY; ty++) {
      for (let dx = 0; dx < windowSize; dx++) {
        const tx = (Math.floor(camTileX) - halfWin + dx + tilesPerSide) % tilesPerSide;

        // Calculate where this tile goes on the equirectangular canvas
        // Esri tiles use Web Mercator (EPSG:3857), but we're placing them
        // on an equirectangular grid. For low zoom levels (z <= 6) the
        // distortion is minimal and acceptable for a visual overlay.
        const tileLonStart = (tx / tilesPerSide) * 360 - 180;
        const tileLonEnd = ((tx + 1) / tilesPerSide) * 360 - 180;

        // For Y, Web Mercator projects latitude non-linearly.
        // Tile row ty covers latitudes from top to bottom:
        const n = Math.PI - (2 * Math.PI * ty) / tilesPerSide;
        const tileLatTop = (180 / Math.PI) * Math.atan(Math.sinh(n));
        const n2 = Math.PI - (2 * Math.PI * (ty + 1)) / tilesPerSide;
        const tileLatBottom = (180 / Math.PI) * Math.atan(Math.sinh(n2));

        // Convert to canvas pixel positions (equirectangular)
        const pxStart = ((tileLonStart + 180) / 360) * ECTW;
        const pxEnd = ((tileLonEnd + 180) / 360) * ECTW;
        const pyStart = ((90 - tileLatTop) / 180) * ECTH;
        const pyEnd = ((90 - tileLatBottom) / 180) * ECTH;

        const pxW = pxEnd - pxStart;
        const pyH = pyEnd - pyStart;

        const url = esriTileUrl(esriZ, tx, ty);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // Draw the tile at the correct equirectangular position
          tileCtx.drawImage(img, pxStart, pyStart, pxW, pyH);
          loaded++;
          if (loaded >= total) finishTileLoad();
        };
        img.onerror = () => { loaded++; if (loaded >= total) finishTileLoad(); };
        img.src = url;
      }
    }

    // Timeout fallback
    setTimeout(() => { if (loaded < total) { loaded = total; finishTileLoad(); } }, 4000);
  }

  function finishTileLoad() {
    if (!globe || !globe.material) { tilesLoading = false; return; }

    if (!tileTexture) {
      tileTexture = new T.CanvasTexture(tileCanvas);
      tileTexture.colorSpace = T.SRGBColorSpace;
    } else {
      tileTexture.image = tileCanvas;
      tileTexture.needsUpdate = true;
    }

    // High quality filtering on tile texture
    tileTexture.minFilter = T.LinearMipmapLinearFilter;
    tileTexture.magFilter = T.LinearFilter;
    tileTexture.generateMipmaps = true;
    const maxA = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
    tileTexture.anisotropy = maxA;

    globe.material.uniforms.tileTexture.value = tileTexture;

    const blendAmount = Math.max(0, Math.min(1, (2.2 - zoom) / 0.7));
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
    const geom = new T.SphereGeometry(R * 1.2, 64, 64);
    const mat = new T.ShaderMaterial({
      uniforms: {
        glowColor: { value: new T.Color(0.25, 0.4, 0.8) },
        warmColor: { value: new T.Color(0.9, 0.4, 0.15) },
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
        uniform vec3 warmColor;
        uniform vec3 sunDir;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        void main() {
          // Fresnel — stronger at the edges
          float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);

          // Sun-facing side is brighter and bluer
          float sunFactor = max(0.0, dot(vWorldNormal, normalize(sunDir)));

          // Terminator gets warm orange (sunset colors)
          float terminator = 1.0 - abs(dot(vWorldNormal, normalize(sunDir)) - 0.05);
          terminator = pow(max(0.0, terminator), 2.0);

          // Blend blue glow with warm sunset at the terminator
          vec3 color = glowColor * (0.2 + sunFactor * 0.8);
          color = mix(color, warmColor, terminator * 0.5);

          gl_FragColor = vec4(color, intensity * 0.65);
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
      globe = new T.Mesh(new T.SphereGeometry(R, 128, 128), earthMat);
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
      el.addEventListener('touchstart', (e) => { onTouchStart(e); if (e.touches.length < 2) onDragStart(e); }, { passive: false });
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('touchmove', (e) => { onTouchMove(e); if (e.touches.length < 2) onDragMove(e); }, { passive: false });
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
    // Kill any residual velocity
    velRotY = 0; velRotX = 0;
  }
  function onDragMove(e) {
    if (!isDragging) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - dragStartX;
    const dy = p.clientY - dragStartY;
    targetRotY = rotY + dx * 0.005;
    targetRotX = Math.max(-1.3, Math.min(1.3, rotX + dy * 0.005));
    // Track velocity for momentum (exponential moving average)
    velRotY = dx * 0.005 * 0.3 + velRotY * 0.7;
    velRotX = dy * 0.005 * 0.3 + velRotX * 0.7;
    dragStartX = p.clientX; dragStartY = p.clientY;
  }
  function onDragEnd() {
    isDragging = false; lastInteraction = Date.now();
    // Apply momentum to target so it keeps spinning and decays
    targetRotY += velRotY * 8;
    targetRotX = Math.max(-1.3, Math.min(1.3, targetRotX + velRotX * 8));
  }
  function onWheel(e) {
    e.preventDefault();
    // Smaller steps for smooth scroll + normalize across browsers
    const delta = e.deltaY * 0.0015;
    targetZoom = Math.max(1.1, Math.min(6, targetZoom + delta));
    lastInteraction = Date.now();
    if (targetZoom < 2.0) setTimeout(loadTilesForView, 200);
  }
  // Touch pinch-to-zoom
  let pinchStartDist = 0;
  let pinchStartZoom = 0;
  function onTouchStart(e) {
    if (e.touches && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.hypot(dx, dy);
      pinchStartZoom = targetZoom;
      isDragging = false; // stop drag while pinching
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
      if (targetZoom < 2.0) setTimeout(loadTilesForView, 200);
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

  let tileCheckTimer = 0;

  /* ── ANIMATE ─────────────────────────────────────────────────── */
  function animate() {
    if (!renderer) return;
    requestAnimationFrame(animate);

    if (!isDragging && Date.now() - lastInteraction > 8000) autoRotate = true;
    if (isDragging) autoRotate = false;
    if (autoRotate) targetRotY += 0.0005;

    // Decay velocity (momentum friction)
    if (!isDragging) {
      velRotY *= 0.92;
      velRotX *= 0.92;
      if (Math.abs(velRotY) > 0.0001) targetRotY += velRotY;
      if (Math.abs(velRotX) > 0.0001) {
        targetRotX = Math.max(-1.3, Math.min(1.3, targetRotX + velRotX));
      }
    }

    // Higher lerp factor = more responsive but still smooth
    rotY += (targetRotY - rotY) * 0.12;
    rotX += (targetRotX - rotX) * 0.12;
    zoom += (targetZoom - zoom) * 0.1;

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
