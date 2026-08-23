import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

window.initCigar3DWebGL = function(container) {

// Expand container chain for proper sizing
const sceneEl = container.closest('.cigar-scene');
if (sceneEl) { sceneEl.style.height = '380px'; sceneEl.style.maxWidth = '700px'; }
const floatEl = container.parentElement;
if (floatEl) { floatEl.style.cssText = 'width:100%;height:100%;animation:none'; }
container.style.cssText = 'width:100%;height:100%;animation:none;transform:none;transform-style:flat';
const shadow = sceneEl && sceneEl.querySelector('.cigar-shadow');
if (shadow) shadow.style.display = 'none';
document.body.classList.add('webgl-cigar');
container.innerHTML = '';

const CW = container.clientWidth || 680;
const CH = container.clientHeight || 380;

// Scene setup
const scene = new THREE.Scene();
// No background — transparent, landing page bg shows through

// Procedural environment cubemap for reflections
const cubeRT = new THREE.WebGLCubeRenderTarget(256);
const cubeCamera = new THREE.CubeCamera(0.1, 10, cubeRT);
// Build a tiny env scene with warm gradient sphere
const envScene = new THREE.Scene();
const envGeo = new THREE.SphereGeometry(5, 32, 16);
const envCanvas = document.createElement('canvas');
envCanvas.width = 512; envCanvas.height = 256;
const envCtx = envCanvas.getContext('2d');
const envGrad = envCtx.createLinearGradient(0, 0, 0, 256);
envGrad.addColorStop(0, '#1a1008');
envGrad.addColorStop(0.3, '#0d0906');
envGrad.addColorStop(0.5, '#080604');
envGrad.addColorStop(0.7, '#0d0906');
envGrad.addColorStop(1, '#1a1008');
envCtx.fillStyle = envGrad;
envCtx.fillRect(0, 0, 512, 256);
// Add warm highlights
for (let i = 0; i < 6; i++) {
  const x = 80 + Math.random() * 350;
  const y = 60 + Math.random() * 130;
  const g = envCtx.createRadialGradient(x, y, 0, x, y, 40 + Math.random() * 60);
  g.addColorStop(0, `rgba(${180 + Math.random()*40}, ${120 + Math.random()*40}, ${50 + Math.random()*30}, 0.15)`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  envCtx.fillStyle = g;
  envCtx.fillRect(0, 0, 512, 256);
}
const envTex = new THREE.CanvasTexture(envCanvas);
envTex.mapping = THREE.EquirectangularReflectionMapping;
const envMat = new THREE.MeshBasicMaterial({ map: envTex, side: THREE.BackSide });
envScene.add(new THREE.Mesh(envGeo, envMat));

const camera = new THREE.PerspectiveCamera(32, CW / CH, 0.1, 100);
camera.position.set(0.3, 0.15, 3.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(CW, CH);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// Render env map once
cubeCamera.update(renderer, envScene);
scene.environment = cubeRT.texture;

// Post-processing — vignette
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const colorGradeVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDarkness: { value: 1.4 },
    uOffset: { value: 0.95 },
    uSepiaStrength: { value: 0.12 },
    uWarmShadows: { value: new THREE.Vector3(1.06, 0.98, 0.88) },
    uCoolHighlights: { value: new THREE.Vector3(0.97, 0.98, 1.04) },
    uContrast: { value: 1.05 },
    uSaturation: { value: 0.95 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uDarkness;
    uniform float uOffset;
    uniform float uSepiaStrength;
    uniform vec3 uWarmShadows;
    uniform vec3 uCoolHighlights;
    uniform float uContrast;
    uniform float uSaturation;
    varying vec2 vUv;

    vec3 adjustSaturation(vec3 col, float sat) {
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(luma), col, sat);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = texel.rgb;

      // Subtle contrast boost — lift midtones slightly
      col = (col - 0.5) * uContrast + 0.5;
      col = clamp(col, 0.0, 1.0);

      // Slight desaturation for cinematic feel
      col = adjustSaturation(col, uSaturation);

      // Luminance-based split toning: warm shadows, cool highlights
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float shadowMask = 1.0 - smoothstep(0.0, 0.35, luma);
      float highlightMask = smoothstep(0.55, 1.0, luma);

      // Warm amber push in shadows
      col *= mix(vec3(1.0), uWarmShadows, shadowMask);

      // Cool blue-steel push in highlights
      col *= mix(vec3(1.0), uCoolHighlights, highlightMask);

      // Very subtle sepia overlay blended by luminance
      vec3 sepia = vec3(
        dot(col, vec3(0.393, 0.769, 0.189)),
        dot(col, vec3(0.349, 0.686, 0.168)),
        dot(col, vec3(0.272, 0.534, 0.131))
      );
      col = mix(col, sepia, uSepiaStrength * (1.0 - luma * 0.5));

      // Vignette
      vec2 uv = (vUv - 0.5) * 2.0;
      float vig = 1.0 - smoothstep(uOffset - 0.5, uOffset + 0.3, length(uv));
      vig = mix(1.0, vig, uDarkness);
      col *= vig;

      gl_FragColor = vec4(col, texel.a);
    }
  `,
};
composer.addPass(new ShaderPass(colorGradeVignetteShader));
composer.addPass(new OutputPass());

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2.5;
controls.maxDistance = 8;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;
controls.target.set(0, 0.05, 0);
controls.enableZoom = true;
controls.enablePan = false;
controls.minPolarAngle = Math.PI * 0.2;
controls.maxPolarAngle = Math.PI * 0.8;



// Lighting — dramatic cinematic three-point + accent
const ambientLight = new THREE.AmbientLight(0xffe8d0, 1.4);
scene.add(ambientLight);

// Key light — warm, strong, from upper right
const keyLight = new THREE.SpotLight(0xffe0b0, 5.0, 25, Math.PI * 0.25, 0.4, 0.6);
keyLight.position.set(3, 4, 4);
keyLight.target.position.set(0, 0, 0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0005;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight);
scene.add(keyLight.target);

// Fill light — cool, lifted to reveal more detail on the shadow side
const fillLight = new THREE.DirectionalLight(0xc8b8a0, 1.2);
fillLight.position.set(-4, 1, -2);
scene.add(fillLight);

// Front fill — eliminates dark face toward camera
const frontFill = new THREE.DirectionalLight(0xfde8c8, 1.0);
frontFill.position.set(0, 0.5, 5);
scene.add(frontFill);

// Low side fills — illuminate the underside and flanks
const leftFill = new THREE.DirectionalLight(0xffe0b8, 0.8);
leftFill.position.set(-5, -1, 2);
scene.add(leftFill);

const rightFill = new THREE.DirectionalLight(0xffe0b8, 0.8);
rightFill.position.set(5, -1, 2);
scene.add(rightFill);

// Rim/back light — defines the cigar silhouette
const rimLight = new THREE.SpotLight(0xffd090, 5.0, 20, Math.PI * 0.22, 0.3, 0.6);
rimLight.position.set(-2, 2, -4);
rimLight.target.position.set(0, 0, 0);
scene.add(rimLight);
scene.add(rimLight.target);

// Second rim light — opposite side for full silhouette definition
const rimLight2 = new THREE.SpotLight(0xffe8c0, 3.5, 18, Math.PI * 0.20, 0.4, 0.6);
rimLight2.position.set(2, 1.5, -4);
rimLight2.target.position.set(0, 0, 0);
scene.add(rimLight2);
scene.add(rimLight2.target);

// Warm under-bounce — simulates mahogany table reflection
const bounceLight = new THREE.PointLight(0xc08030, 1.0, 10);
bounceLight.position.set(0, -2, 1);
scene.add(bounceLight);

// Under-cigar fill — prevents the bottom from going pure black
const underFill = new THREE.PointLight(0xddc090, 0.8, 8);
underFill.position.set(0, -1, 3);
scene.add(underFill);

// Back fill — broad warm wash from behind to lift the cigar out of darkness
const backFill = new THREE.DirectionalLight(0xffdcb0, 1.5);
backFill.position.set(0, 0.5, -6);
scene.add(backFill);

// Overhead spot — broader and brighter to illuminate the full cigar length
const topLight = new THREE.SpotLight(0xfff0dd, 2.5, 15, Math.PI * 0.22, 0.5, 0.6);
topLight.position.set(0, 5, 1);
topLight.target.position.set(0, 0, 0);
scene.add(topLight);
scene.add(topLight.target);

// Cigar wrapper canvas texture — hyper-realistic
function createCigarWrapperTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 4096;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // Rich base — golden-brown Connecticut Shade wrapper with warm honey tones
  // Deeper contrast between shadow edges and highlight center
  const baseGradient = ctx.createLinearGradient(0, 0, W, 0);
  baseGradient.addColorStop(0,    '#2E1C0C');
  baseGradient.addColorStop(0.04, '#3A2410');
  baseGradient.addColorStop(0.10, '#4E3419');
  baseGradient.addColorStop(0.18, '#6B4A28');
  baseGradient.addColorStop(0.26, '#8A6438');
  baseGradient.addColorStop(0.34, '#A57B45');
  baseGradient.addColorStop(0.42, '#BA8E52');
  baseGradient.addColorStop(0.47, '#CCa468');
  baseGradient.addColorStop(0.50, '#D8B882');
  baseGradient.addColorStop(0.53, '#CCa468');
  baseGradient.addColorStop(0.58, '#BA8E52');
  baseGradient.addColorStop(0.66, '#A57B45');
  baseGradient.addColorStop(0.74, '#8A6438');
  baseGradient.addColorStop(0.82, '#6B4A28');
  baseGradient.addColorStop(0.90, '#4E3419');
  baseGradient.addColorStop(0.96, '#3A2410');
  baseGradient.addColorStop(1,    '#2E1C0C');
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, W, H);

  // Longitudinal color shift — deeper golden-brown at foot, lighter toward cap
  const longGrad = ctx.createLinearGradient(0, 0, 0, H);
  longGrad.addColorStop(0, 'rgba(70,40,15,0.45)');
  longGrad.addColorStop(0.03, 'rgba(60,35,12,0.30)');
  longGrad.addColorStop(0.08, 'rgba(50,30,10,0.15)');
  longGrad.addColorStop(0.15, 'rgba(40,25,10,0.06)');
  longGrad.addColorStop(0.3, 'rgba(0,0,0,0.0)');
  longGrad.addColorStop(0.5, 'rgba(0,0,0,0.0)');
  longGrad.addColorStop(0.7, 'rgba(0,0,0,0.0)');
  longGrad.addColorStop(0.85, 'rgba(40,25,10,0.05)');
  longGrad.addColorStop(0.93, 'rgba(55,32,12,0.18)');
  longGrad.addColorStop(1, 'rgba(70,40,15,0.35)');
  ctx.fillStyle = longGrad;
  ctx.fillRect(0, 0, W, H);

  // Cross-body warm/cool variation — simulates uneven fermentation and aging
  for (let band = 0; band < 12; band++) {
    const yStart = (band / 12) * H;
    const yEnd = ((band + 1) / 12) * H;
    const bandGrad = ctx.createLinearGradient(0, yStart, 0, yEnd);
    const warmShift = Math.random() > 0.5;
    if (warmShift) {
      bandGrad.addColorStop(0, 'rgba(180,120,50,0)');
      bandGrad.addColorStop(0.3 + Math.random() * 0.3, `rgba(180,120,50,${0.03 + Math.random() * 0.04})`);
      bandGrad.addColorStop(1, 'rgba(180,120,50,0)');
    } else {
      bandGrad.addColorStop(0, 'rgba(60,40,20,0)');
      bandGrad.addColorStop(0.3 + Math.random() * 0.3, `rgba(60,40,20,${0.04 + Math.random() * 0.05})`);
      bandGrad.addColorStop(1, 'rgba(60,40,20,0)');
    }
    ctx.fillStyle = bandGrad;
    ctx.fillRect(0, yStart, W, yEnd - yStart);
  }

  // Additional warm highlight band in the center — oil sheen on golden wrapper
  const highlightGrad = ctx.createLinearGradient(0, 0, W, 0);
  highlightGrad.addColorStop(0, 'rgba(0,0,0,0)');
  highlightGrad.addColorStop(0.35, 'rgba(0,0,0,0)');
  highlightGrad.addColorStop(0.44, 'rgba(232,212,168,0.06)');
  highlightGrad.addColorStop(0.5,  'rgba(240,228,194,0.08)');
  highlightGrad.addColorStop(0.56, 'rgba(232,212,168,0.06)');
  highlightGrad.addColorStop(0.65, 'rgba(0,0,0,0)');
  highlightGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = highlightGrad;
  ctx.fillRect(0, 0, W, H);

  // Oil sheen patches — golden lustre, richer and more varied
  for (let i = 0; i < 70; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const rx = 40 + Math.random() * 180;
    const ry = 20 + Math.random() * 80;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    const brightness = Math.random() > 0.5 ? 0.09 : 0.055;
    grad.addColorStop(0, `rgba(235,215,170,${brightness})`);
    grad.addColorStop(0.4, `rgba(212,176,126,${brightness * 0.5})`);
    grad.addColorStop(0.7, `rgba(180,140,80,${brightness * 0.2})`);
    grad.addColorStop(1, 'rgba(200,169,111,0)');
    ctx.fillStyle = grad;
    ctx.save();
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(cx, cy * (rx / ry), rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Natural mottling — darker tan and lighter cream patches (Connecticut Shade characteristic)
  // More patches, stronger opacity for visible color variation
  for (let i = 0; i < 55; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.random() * Math.PI);
    ctx.scale(1 + Math.random(), 0.5 + Math.random() * 0.5);
    const r = 30 + Math.random() * 100;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const patchType = Math.random();
    if (patchType < 0.35) {
      // Dark tan spots — deeper aging marks
      grad.addColorStop(0, `rgba(140,105,55,${0.12 + Math.random() * 0.08})`);
      grad.addColorStop(0.6, 'rgba(140,105,55,0.03)');
      grad.addColorStop(1, 'rgba(140,105,55,0)');
    } else if (patchType < 0.65) {
      // Light cream highlights — sun-cured patches
      grad.addColorStop(0, `rgba(245,232,200,${0.08 + Math.random() * 0.06})`);
      grad.addColorStop(0.6, 'rgba(245,232,200,0.02)');
      grad.addColorStop(1, 'rgba(245,232,200,0)');
    } else {
      // Warm reddish-amber undertone patches
      grad.addColorStop(0, `rgba(180,120,65,${0.08 + Math.random() * 0.06})`);
      grad.addColorStop(0.6, 'rgba(180,120,65,0.02)');
      grad.addColorStop(1, 'rgba(180,120,65,0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // === PROMINENT VEIN NETWORK — realistic tobacco leaf structure ===

  // Central/midrib veins — BOLD raised spines with strong highlight edges
  for (let i = 0; i < 30; i++) {
    const x0 = Math.random() * W;
    const y0 = Math.random() * H;
    const length = 600 + Math.random() * 1200;
    const baseAngle = 0.12 + (Math.random() - 0.5) * 0.2;
    const curve = (Math.random() - 0.5) * 0.0006;
    for (let pass = 0; pass < 4; pass++) {
      const offset = (pass - 1.5) * 1.5;
      let col, alpha, lw;
      if (pass === 0) { col = '45,25,8'; alpha = 0.28; lw = 4.5 + Math.random() * 2.0; }
      else if (pass === 1) { col = '80,50,18'; alpha = 0.32 + Math.random() * 0.10; lw = 3.0 + Math.random() * 2.0; }
      else if (pass === 2) { col = '40,22,6'; alpha = 0.22; lw = 2.2 + Math.random() * 1.2; }
      else { col = '230,205,150'; alpha = 0.16; lw = 1.2 + Math.random() * 0.8; }
      ctx.strokeStyle = `rgba(${col}, ${alpha})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      let cx2 = x0, cy2 = y0, a = baseAngle;
      ctx.moveTo(cx2 + offset, cy2);
      for (let s = 0; s < length; s += 3) {
        a += curve + (Math.random() - 0.5) * 0.0015;
        cx2 += Math.cos(a) * 3;
        cy2 += Math.sin(a) * 3;
        ctx.lineTo(cx2 + offset, cy2);
      }
      ctx.stroke();
    }
  }

  // Primary lateral veins — branch off midribs at 30-45 degree angles — denser
  for (let i = 0; i < 700; i++) {
    const x0 = Math.random() * W;
    const y0 = Math.random() * H;
    const length = 80 + Math.random() * 350;
    const baseAngle = 0.15 + (Math.random() - 0.5) * 0.5;
    const curve = (Math.random() - 0.5) * 0.002;
    const thickness = 1.0 + Math.random() * 2.8;
    const darkness = 0.12 + Math.random() * 0.18;
    // Warm brown vein line — bolder and richer
    ctx.strokeStyle = `rgba(90, 55, 18, ${darkness})`;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    let cx2 = x0, cy2 = y0, a = baseAngle;
    for (let s = 0; s < length; s += 3) {
      a += curve + (Math.random() - 0.5) * 0.003;
      cx2 += Math.cos(a) * 3;
      cy2 += Math.sin(a) * 3;
      ctx.lineTo(cx2, cy2);
    }
    ctx.stroke();
    // Golden highlight edge — brighter and more prominent
    ctx.strokeStyle = `rgba(235, 215, 155, ${darkness * 0.65})`;
    ctx.lineWidth = thickness * 0.55;
    ctx.beginPath();
    cx2 = x0; cy2 = y0; a = baseAngle;
    ctx.moveTo(cx2 + 0.8, cy2 - 0.6);
    for (let s = 0; s < length; s += 3) {
      a += curve + (Math.random() - 0.5) * 0.003;
      cx2 += Math.cos(a) * 3;
      cy2 += Math.sin(a) * 3;
      ctx.lineTo(cx2 + 0.8, cy2 - 0.6);
    }
    ctx.stroke();
  }

  // Secondary veins — finer but clearly visible network
  for (let i = 0; i < 1800; i++) {
    const x0 = Math.random() * W;
    const y0 = Math.random() * H;
    const length = 15 + Math.random() * 60;
    const angle = -1.2 + Math.random() * 2.4;
    ctx.strokeStyle = `rgba(110, 70, 30, ${0.07 + Math.random() * 0.10})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    let a = angle;
    let px = x0, py = y0;
    for (let s = 0; s < length; s += 4) {
      a += (Math.random() - 0.5) * 0.08;
      px += Math.cos(a) * 4;
      py += Math.sin(a) * 4;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // Tertiary micro-vein network — dense web between larger veins
  for (let i = 0; i < 3500; i++) {
    const x0 = Math.random() * W;
    const y0 = Math.random() * H;
    const length = 4 + Math.random() * 22;
    const angle = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(120, 80, 35, ${0.035 + Math.random() * 0.045})`;
    ctx.lineWidth = 0.3 + Math.random() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(angle) * length, y0 + Math.sin(angle) * length);
    ctx.stroke();
  }

  // Leaf cell texture — visible polygonal patches (tobacco tooth)
  for (let i = 0; i < 1200; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const sides = 4 + Math.floor(Math.random() * 3);
    const r = 3 + Math.random() * 8;
    ctx.strokeStyle = `rgba(110, 70, 30, ${0.04 + Math.random() * 0.04})`;
    ctx.lineWidth = 0.4 + Math.random() * 0.4;
    ctx.beginPath();
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2 + Math.random() * 0.3;
      const pr = r + (Math.random() - 0.5) * 3;
      const px = cx + Math.cos(a) * pr;
      const py = cy + Math.sin(a) * pr;
      s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Micro-pore tooth texture — small dark dots scattered across surface
  for (let i = 0; i < 8000; i++) {
    const px = Math.random() * W;
    const py = Math.random() * H;
    const pr = 0.5 + Math.random() * 2.0;
    ctx.fillStyle = `rgba(40,22,8,${0.05 + Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Surface bumps — tiny raised spots (golden highlights)
  for (let i = 0; i < 4500; i++) {
    const px = Math.random() * W;
    const py = Math.random() * H;
    const pr = 0.3 + Math.random() * 1.5;
    ctx.fillStyle = `rgba(220,195,140,${0.03 + Math.random() * 0.04})`;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Micro-grain noise — stronger natural tooth texture
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  for (let p = 0; p < data.length; p += 4) {
    const n = (Math.random() - 0.5) * 22;
    data[p]     = Math.min(255, Math.max(0, data[p] + n));
    data[p + 1] = Math.min(255, Math.max(0, data[p + 1] + n * 0.85));
    data[p + 2] = Math.min(255, Math.max(0, data[p + 2] + n * 0.6));
  }
  ctx.putImageData(imgData, 0, 0);

  // Spiral wrap seam lines — the key visual signature of a rolled cigar
  ctx.globalCompositeOperation = 'multiply';
  const seamSpacing = 32;
  for (let y = -W * 2; y < H + W * 2; y += seamSpacing + (Math.random() - 0.5) * 8) {
    // Three-pass seam: shadow, dark crease, highlight
    const passes = [
      { offset: -2.0, col: '45, 25, 8', alpha: 0.18, lw: 2.8 },
      { offset: -0.8, col: '70, 42, 15', alpha: 0.22, lw: 1.6 },
      { offset: 0.4, col: '60, 35, 12', alpha: 0.15, lw: 1.0 },
      { offset: 1.5, col: '210, 190, 140', alpha: 0.10, lw: 0.9 },
    ];
    for (const p of passes) {
      ctx.strokeStyle = `rgba(${p.col}, ${p.alpha + Math.random() * 0.02})`;
      ctx.lineWidth = p.lw + Math.random() * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, y + p.offset);
      for (let x = 0; x < W; x += 5) {
        ctx.lineTo(x, y + p.offset + x * 0.1 + Math.sin(x * 0.018) * 2.5 + (Math.random() - 0.5) * 0.5);
      }
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // Aging spots — stronger amber and brown variations
  for (let i = 0; i < 35; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const r = 15 + Math.random() * 60;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const spotType = Math.random();
    if (spotType < 0.4) {
      grad.addColorStop(0, `rgba(${110 + Math.random()*30},${75 + Math.random()*20},${30 + Math.random()*15},0.10)`);
      grad.addColorStop(0.5, `rgba(${120 + Math.random()*20},${80 + Math.random()*15},${35},0.04)`);
    } else {
      grad.addColorStop(0, `rgba(${160 + Math.random()*30},${120 + Math.random()*20},${60 + Math.random()*15},0.08)`);
      grad.addColorStop(0.5, `rgba(${150 + Math.random()*20},${110 + Math.random()*15},${55},0.03)`);
    }
    grad.addColorStop(1, 'rgba(130,90,40,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tiny lighter flecks — golden specks on Connecticut Shade
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    ctx.fillStyle = `rgba(245,232,200,${0.015 + Math.random() * 0.03})`;
    ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }

  // Water stain blotches — faint rings from fermentation/aging
  for (let i = 0; i < 12; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const r = 40 + Math.random() * 120;
    ctx.strokeStyle = `rgba(100,70,30,${0.04 + Math.random() * 0.04})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.random() * Math.PI, Math.random() * Math.PI + Math.PI * (0.5 + Math.random() * 0.8));
    ctx.stroke();
  }

  // Rolling finger marks — very subtle longitudinal smudges
  for (let i = 0; i < 8; i++) {
    const cx = W * 0.3 + Math.random() * W * 0.4;
    const cy = Math.random() * H;
    const w = 60 + Math.random() * 120;
    const h = 200 + Math.random() * 600;
    const smudgeGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.5);
    smudgeGrad.addColorStop(0, `rgba(160,120,60,${0.03 + Math.random() * 0.03})`);
    smudgeGrad.addColorStop(1, 'rgba(160,120,60,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(w / h, 1);
    ctx.fillStyle = smudgeGrad;
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 16;
  return texture;
}

// Normal map for wrapper — high detail
function createCigarNormalMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 4096;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // Neutral normal
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, W, H);

  // Prominent midrib veins — very strong normal perturbation
  for (let i = 0; i < 40; i++) {
    const x0 = Math.random() * W;
    const y0 = Math.random() * H;
    const length = 500 + Math.random() * 1000;
    const angle = 0.12 + (Math.random() - 0.5) * 0.2;
    const curve = (Math.random() - 0.5) * 0.0008;
    for (let side = -1; side <= 1; side += 2) {
      const val = side > 0 ? 165 : 95;
      ctx.strokeStyle = `rgba(${val}, ${val}, 255, ${0.6 + Math.random() * 0.25})`;
      ctx.lineWidth = 4.5 + Math.random() * 2.5;
      ctx.beginPath();
      let cx2 = x0, cy2 = y0, a = angle;
      ctx.moveTo(cx2 + side * 2, cy2);
      for (let s = 0; s < length; s += 3) {
        a += curve + (Math.random() - 0.5) * 0.001;
        cx2 += Math.cos(a) * 3;
        cy2 += Math.sin(a) * 3;
        ctx.lineTo(cx2 + side * 2, cy2);
      }
      ctx.stroke();
    }
  }

  // Primary lateral veins — strong bumps
  for (let i = 0; i < 650; i++) {
    const x0 = Math.random() * W;
    const y0 = Math.random() * H;
    const length = 60 + Math.random() * 300;
    const angle = -0.3 + Math.random() * 0.6;
    const curve = (Math.random() - 0.5) * 0.002;
    for (let side = -1; side <= 1; side += 2) {
      const val = side > 0 ? 158 : 100;
      ctx.strokeStyle = `rgba(${val}, ${val}, 255, ${0.45 + Math.random() * 0.22})`;
      ctx.lineWidth = 2.2 + Math.random() * 3.0;
      ctx.beginPath();
      let cx2 = x0, cy2 = y0, a = angle;
      ctx.moveTo(cx2 + side * 1.5, cy2);
      for (let s = 0; s < length; s += 4) {
        a += curve;
        cx2 += Math.cos(a) * 4;
        cy2 += Math.sin(a) * 4;
        ctx.lineTo(cx2 + side * 1.5, cy2);
      }
      ctx.stroke();
    }
  }

  // Fine secondary veins
  for (let i = 0; i < 1600; i++) {
    const x0 = Math.random() * W;
    const y0 = Math.random() * H;
    const length = 10 + Math.random() * 55;
    const angle = -1 + Math.random() * 2;
    const val = Math.random() > 0.5 ? 148 : 112;
    ctx.strokeStyle = `rgba(${val}, ${val}, 255, ${0.28 + Math.random() * 0.22})`;
    ctx.lineWidth = 0.8 + Math.random() * 2.0;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(angle) * length, y0 + Math.sin(angle) * length);
    ctx.stroke();
  }

  // Wrap-seam ridges — diagonal, stronger and more pronounced
  for (let y = -W; y < H + W; y += 20 + Math.random() * 10) {
    ctx.strokeStyle = `rgba(150, 150, 255, ${0.18 + Math.random() * 0.14})`;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < W; x += 10) {
      ctx.lineTo(x, y + x * 0.12 + (Math.random() - 0.5) * 1);
    }
    ctx.stroke();
  }

  // Add bump dots for micro-pore normal relief
  for (let i = 0; i < 7000; i++) {
    const px = Math.random() * W;
    const py = Math.random() * H;
    const pr = 1 + Math.random() * 3.5;
    const val = Math.random() > 0.5 ? 160 : 100;
    ctx.fillStyle = `rgba(${val},${val},255,${0.10 + Math.random() * 0.14})`;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pixel-level grain — stronger for more visible texture
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  for (let p = 0; p < data.length; p += 4) {
    const n = (Math.random() - 0.5) * 22;
    data[p]     = Math.min(255, Math.max(0, data[p] + n));
    data[p + 1] = Math.min(255, Math.max(0, data[p + 1] + n));
    // Keep blue channel mostly intact
    data[p + 2] = Math.min(255, Math.max(0, data[p + 2] + n * 0.25));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 16;
  return texture;
}

// Roughness map — oily patches are smoother, veins rougher
function createCigarRoughnessMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // Base roughness — high with strong variation for matte tobacco
  ctx.fillStyle = '#999999';
  ctx.fillRect(0, 0, W, H);

  // Large matte patches — high roughness zones (flat wrapper areas)
  for (let i = 0; i < 40; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const r = 60 + Math.random() * 200;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(${180 + Math.random()*40},${180 + Math.random()*40},${180 + Math.random()*40},0.25)`);
    grad.addColorStop(1, 'rgba(160,160,160,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Oily smooth patches — LOWER roughness in creases and vein channels
  for (let i = 0; i < 80; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const r = 20 + Math.random() * 100;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(30,30,30,0.4)');
    grad.addColorStop(0.5, 'rgba(40,40,40,0.2)');
    grad.addColorStop(1, 'rgba(50,50,50,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rough vein ridges — strong roughness spikes along veins
  for (let i = 0; i < 350; i++) {
    const x0 = Math.random() * W;
    const y0 = Math.random() * H;
    const length = 30 + Math.random() * 180;
    const angle = -0.3 + Math.random() * 0.6;
    const curve = (Math.random() - 0.5) * 0.002;
    ctx.strokeStyle = `rgba(${200 + Math.random()*30}, ${200 + Math.random()*30}, ${200 + Math.random()*30}, ${0.18 + Math.random() * 0.18})`;
    ctx.lineWidth = 1.2 + Math.random() * 3.5;
    ctx.beginPath();
    let px = x0, py = y0, a = angle;
    ctx.moveTo(px, py);
    for (let s = 0; s < length; s += 4) {
      a += curve + (Math.random() - 0.5) * 0.003;
      px += Math.cos(a) * 4;
      py += Math.sin(a) * 4;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // Rough patches for tooth texture — denser
  for (let i = 0; i < 500; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const r = 3 + Math.random() * 15;
    const val = 170 + Math.random() * 60;
    ctx.fillStyle = `rgba(${val},${val},${val},${0.08 + Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Seam roughness lines — diagonal
  for (let y = -W; y < H + W; y += 22 + Math.random() * 12) {
    ctx.strokeStyle = `rgba(200,200,200,${0.08 + Math.random() * 0.08})`;
    ctx.lineWidth = 1.5 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < W; x += 8) {
      ctx.lineTo(x, y + x * 0.1 + (Math.random() - 0.5) * 1.5);
    }
    ctx.stroke();
  }

  // Noise — strong contrast for real texture feel
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  for (let p = 0; p < data.length; p += 4) {
    const n = (Math.random() - 0.5) * 36;
    data[p] = data[p + 1] = data[p + 2] = Math.min(255, Math.max(0, data[p] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// Cap bump map
function createCapBumpMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  // Spiral pattern for pigtail cap
  const cx = 128, cy = 128;
  for (let a = 0; a < Math.PI * 8; a += 0.02) {
    const r = a * 4;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    ctx.fillStyle = `rgba(${130 + Math.sin(a * 3) * 20}, ${130 + Math.sin(a * 3) * 20}, ${130 + Math.sin(a * 3) * 20}, 0.5)`;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

const wrapperTexture = createCigarWrapperTexture();
const normalMap = createCigarNormalMap();
const roughnessMap = createCigarRoughnessMap();
const capBump = createCapBumpMap();

// Cigar group
const cigarGroup = new THREE.Group();

// Cigar body — belicoso proportions, elegant 54 ring gauge
const cigarRadius = 0.105;
const cigarLength = 3.8;

// Profile points for lathe — high-res with natural irregularities
const points = [];
const segments = 160;

// Pre-compute subtle random bumps for organic feel (seeded by index)
const bumpOffsets = [];
for (let i = 0; i <= segments; i++) {
  bumpOffsets.push((Math.sin(i * 7.3) * 0.3 + Math.sin(i * 13.7) * 0.2 + Math.sin(i * 23.1) * 0.15) * 0.0015);
}

for (let i = 0; i <= segments; i++) {
  const t = i / segments;
  const y = t * cigarLength - cigarLength / 2;
  let r;

  if (t < 0.006) {
    // Foot tip — clean cut edge
    const ft = t / 0.006;
    r = cigarRadius * (1.005 - ft * 0.005);
  } else if (t < 0.02) {
    // Foot transition — ash zone
    const ft = (t - 0.006) / 0.014;
    r = cigarRadius * (1.0 + (1 - ft) * 0.003);
  } else if (t > 0.97) {
    // Robusto cap — simple rounded dome, full radius
    const capT = (t - 0.97) / 0.03;
    const dome = Math.cos(capT * Math.PI * 0.5);
    r = cigarRadius * dome;
    r = Math.max(r, 0.003);
  } else if (t > 0.95) {
    // Slight shoulder rounding into the cap — very subtle
    const st = (t - 0.95) / 0.02;
    const ease = st * st;
    r = cigarRadius * (1.0 - ease * 0.005);
  } else {
    // Main body — near-cylindrical with very subtle barrel
    const bodyT = (t - 0.02) / 0.80;
    r = cigarRadius * (1.0 + Math.sin(bodyT * Math.PI) * 0.005);
  }

  // Add organic imperfection
  r += bumpOffsets[i];
  points.push(new THREE.Vector2(Math.max(0.001, r), y));
}

const cigarGeometry = new THREE.LatheGeometry(points, 128);

// Vertex displacement — strong physical bumps for veins, seams, wrinkles, tooth
const cigarPos = cigarGeometry.attributes.position;
const cigarNormals = cigarGeometry.attributes.normal;
for (let i = 0; i < cigarPos.count; i++) {
  const x = cigarPos.getX(i);
  const y = cigarPos.getY(i);
  const z = cigarPos.getZ(i);
  const nx = cigarNormals.getX(i);
  const nz = cigarNormals.getZ(i);
  const angle = Math.atan2(z, x);
  const t = (y + cigarLength / 2) / cigarLength;
  
  // Skip foot/ash and cap zones
  if (t < 0.05 || t > 0.94) continue;
  
  let disp = 0;
  
  // Primary vein ridges — 16 bold veins with natural wobble, stronger displacement
  for (let v = 0; v < 16; v++) {
    const veinAngle = v * Math.PI * 2 / 16 + 0.3 + Math.sin(v * 2.7) * 0.18;
    const angleDist = Math.abs(Math.sin(angle - veinAngle));
    if (angleDist < 0.14) {
      const veinStrength = (0.14 - angleDist) / 0.14;
      const along = 1.0 + Math.sin(t * 45 + v * 7.3) * 0.35 + Math.sin(t * 90 + v * 13.1) * 0.2;
      disp += veinStrength * veinStrength * 0.0018 * along;
    }
  }
  
  // Secondary vein network — 32 finer veins, still visible
  for (let v = 0; v < 32; v++) {
    const veinAngle = v * Math.PI * 2 / 32 + 0.17 + Math.sin(v * 5.3) * 0.2;
    const angleDist = Math.abs(Math.sin(angle - veinAngle));
    if (angleDist < 0.07) {
      disp += (0.07 - angleDist) * 0.006 * (1.0 + Math.sin(t * 80 + v * 11) * 0.45);
    }
  }
  
  // Wrap seam bumps — diagonal ridges, more prominent
  const seamPhase = (angle / (Math.PI * 2) + t * 8) % 1.0;
  if (seamPhase < 0.05 || seamPhase > 0.95) {
    disp += 0.0012;
  }
  
  // Micro-wrinkling — stronger high frequency organic surface undulation
  const wrinkle1 = Math.sin(angle * 30 + t * 200) * 0.00025;
  const wrinkle2 = Math.sin(angle * 17 + t * 130 + 2.3) * 0.00035;
  const wrinkle3 = Math.sin(angle * 45 + t * 310 + 5.1) * 0.00018;
  const wrinkle4 = Math.sin(angle * 8 + t * 60 + 0.7) * 0.0004;
  disp += wrinkle1 + wrinkle2 + wrinkle3 + wrinkle4;
  
  // Tooth texture — pock marks and micro-pores, stronger
  const hash1 = Math.sin(i * 127.1 + y * 311.7) * 43758.5453;
  const h1 = hash1 - Math.floor(hash1);
  const hash2 = Math.sin(i * 269.3 + y * 183.1) * 28461.7231;
  const h2 = hash2 - Math.floor(hash2);
  disp += (h1 - 0.5) * 0.0012;
  // Occasional deeper pore
  if (h2 > 0.90) disp -= 0.0006;
  // Additional tooth bumps
  const hash3 = Math.sin(i * 73.7 + y * 197.3) * 19283.4561;
  const h3 = hash3 - Math.floor(hash3);
  disp += (h3 - 0.5) * 0.0005;
  
  // Rolling irregularity — broader gentle waves from hand-rolling, stronger
  disp += Math.sin(angle * 2.3 + 1.7) * Math.sin(t * 12 + 0.8) * 0.0005;
  disp += Math.sin(angle * 3.7 + 0.5) * Math.sin(t * 7 + 2.1) * 0.0003;
  
  cigarPos.setX(i, x + nx * disp);
  cigarPos.setZ(i, z + nz * disp);
}
cigarGeometry.computeVertexNormals();

const cigarMaterial = new THREE.MeshPhysicalMaterial({
  map: wrapperTexture,
  normalMap: normalMap,
  normalScale: new THREE.Vector2(2.2, 2.2),
  roughnessMap: roughnessMap,
  roughness: 0.94,
  metalness: 0.0,
  color: new THREE.Color(0xB08A55),
  clearcoat: 0.0,
  clearcoatRoughness: 1.0,
  sheen: 0.0,
  sheenRoughness: 1.0,
  sheenColor: new THREE.Color(0x000000),
  envMap: cubeRT.texture,
  envMapIntensity: 0.03,
  bumpMap: normalMap,
  bumpScale: 0.012,
});

const cigarMesh = new THREE.Mesh(cigarGeometry, cigarMaterial);
cigarMesh.castShadow = true;
cigarMesh.receiveShadow = true;
cigarGroup.add(cigarMesh);

// Cap seam lines — three concentric cap leaves, sized to match the tapered profile
// Must match the lathe profile exactly (72% min radius, gentle taper from 0.90)
function getRadiusAtT(t) {
  if (t > 0.97) {
    // Robusto cap dome — full radius, simple rounded end
    const capT = (t - 0.97) / 0.03;
    const dome = Math.cos(capT * Math.PI * 0.5);
    return Math.max(0.003, cigarRadius * dome);
  } else if (t > 0.95) {
    // Slight shoulder rounding
    const st = (t - 0.95) / 0.02;
    const ease = st * st;
    return cigarRadius * (1.0 - ease * 0.005);
  }
  return cigarRadius;
}

const capSeamMat = new THREE.MeshStandardMaterial({
  color: 0x8B6535,
  roughness: 0.88,
  metalness: 0,
  transparent: true,
  opacity: 0.4,
});

// First seam (innermost) — near the rounded cap
const seam1T = 0.968;
const seam1R = getRadiusAtT(seam1T);
const seam1Y = seam1T * cigarLength - cigarLength / 2;
const capSeam1Geo = new THREE.TorusGeometry(seam1R, 0.0012, 8, 64);
const capSeam1 = new THREE.Mesh(capSeam1Geo, capSeamMat);
capSeam1.name = 'capSeam1';
capSeam1.position.y = seam1Y;
capSeam1.rotation.x = Math.PI / 2;
cigarGroup.add(capSeam1);

// Second seam — second cap leaf
const seam2T = 0.958;
const seam2R = getRadiusAtT(seam2T);
const seam2Y = seam2T * cigarLength - cigarLength / 2;
const capSeam2Geo = new THREE.TorusGeometry(seam2R, 0.0012, 8, 64);
const capSeam2 = new THREE.Mesh(capSeam2Geo, capSeamMat.clone());
capSeam2.name = 'capSeam2';
capSeam2.position.y = seam2Y;
capSeam2.rotation.x = Math.PI / 2;
cigarGroup.add(capSeam2);

// Third seam (outermost) — where cap meets the body
const seam3T = 0.948;
const seam3R = getRadiusAtT(seam3T);
const seam3Y = seam3T * cigarLength - cigarLength / 2;
const capSeam3Geo = new THREE.TorusGeometry(seam3R, 0.001, 8, 64);
const capSeam3Mat = new THREE.MeshStandardMaterial({
  color: 0x8B6535,
  roughness: 0.88,
  metalness: 0,
  transparent: true,
  opacity: 0.28,
});
const capSeam3 = new THREE.Mesh(capSeam3Geo, capSeam3Mat);
capSeam3.name = 'capSeam3';
capSeam3.position.y = seam3Y;
capSeam3.rotation.x = Math.PI / 2;
cigarGroup.add(capSeam3);

// Cap leaf overlay — slightly different material on the tapered section
// Simulates the smoother, tighter-grained cap wrapper applied by the torcedor
const capOverlayPoints = [];
const capStartT = 0.94;
const capSegs = 40;
for (let i = 0; i <= capSegs; i++) {
  const t = capStartT + (i / capSegs) * (1.0 - capStartT);
  const y = t * cigarLength - cigarLength / 2;
  const r = getRadiusAtT(t) + 0.0005; // hair above the body surface
  capOverlayPoints.push(new THREE.Vector2(Math.max(0.001, r), y));
}
const capOverlayGeo = new THREE.LatheGeometry(capOverlayPoints, 64);
const capOverlayMat = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0xB89060),
  roughness: 0.88,
  metalness: 0.0,
  transparent: true,
  opacity: 0.15,
  normalMap: normalMap,
  normalScale: new THREE.Vector2(0.3, 0.3), // smoother cap texture
  depthWrite: false,
});
const capOverlay = new THREE.Mesh(capOverlayGeo, capOverlayMat);
capOverlay.name = 'capOverlay';
cigarGroup.add(capOverlay);

// === LIT FOOT — multi-layer ash, ember glow, burn line, filler cross-section ===
const ashLength = 0.22;

// Ash texture — firm white-grey Connecticut Shade ash with fine layering
const ashCanvas = document.createElement('canvas');
ashCanvas.width = 1024;
ashCanvas.height = 1024;
const ashCtx = ashCanvas.getContext('2d');
// Layered white-grey base — Connecticut wrapper produces lighter, firmer ash
const ashBase = ashCtx.createLinearGradient(0, 0, 0, 1024);
ashBase.addColorStop(0, '#A8A8A8');
ashBase.addColorStop(0.1, '#BEBEBE');
ashBase.addColorStop(0.2, '#B0B0B0');
ashBase.addColorStop(0.35, '#C8C8C8');
ashBase.addColorStop(0.5, '#B5B5B5');
ashBase.addColorStop(0.65, '#D0D0D0');
ashBase.addColorStop(0.8, '#C0C0C0');
ashBase.addColorStop(0.9, '#AAAAAA');
ashBase.addColorStop(1, '#9E9E9E');
ashCtx.fillStyle = ashBase;
ashCtx.fillRect(0, 0, 1024, 1024);
// Circumferential grey variation
const ashCircGrad = ashCtx.createLinearGradient(0, 0, 1024, 0);
ashCircGrad.addColorStop(0, 'rgba(40,40,40,0.15)');
ashCircGrad.addColorStop(0.3, 'rgba(0,0,0,0)');
ashCircGrad.addColorStop(0.5, 'rgba(50,50,50,0.08)');
ashCircGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
ashCircGrad.addColorStop(1, 'rgba(40,40,40,0.15)');
ashCtx.fillStyle = ashCircGrad;
ashCtx.fillRect(0, 0, 1024, 1024);
// Horizontal flaky crack lines — dense layered cracking
for (let i = 0; i < 160; i++) {
  const y = Math.random() * 1024;
  const depth = Math.random();
  ashCtx.strokeStyle = depth > 0.6 
    ? `rgba(15,12,10,${0.15 + Math.random() * 0.25})` 
    : `rgba(40,38,35,${0.08 + Math.random() * 0.15})`;
  ashCtx.lineWidth = 0.2 + Math.random() * 2.5;
  ashCtx.beginPath();
  ashCtx.moveTo(0, y);
  for (let x = 0; x < 1024; x += 3 + Math.random() * 4) {
    ashCtx.lineTo(x, y + (Math.random() - 0.5) * 3.5);
  }
  ashCtx.stroke();
}

// Vertical micro-fractures — realistic ash splitting
for (let i = 0; i < 60; i++) {
  const x = Math.random() * 1024;
  const yStart = Math.random() * 900;
  const length = 20 + Math.random() * 120;
  ashCtx.strokeStyle = `rgba(20,18,15,${0.12 + Math.random() * 0.18})`;
  ashCtx.lineWidth = 0.3 + Math.random() * 1.5;
  ashCtx.beginPath();
  ashCtx.moveTo(x, yStart);
  let px = x;
  for (let dy = 0; dy < length; dy += 4) {
    px += (Math.random() - 0.5) * 3;
    ashCtx.lineTo(px, yStart + dy);
  }
  ashCtx.stroke();
}

// Flaky ash chunks — lighter patches with more variety
for (let i = 0; i < 120; i++) {
  const cx = Math.random() * 1024;
  const cy = Math.random() * 1024;
  const w = 8 + Math.random() * 55;
  const h = 2 + Math.random() * 14;
  const brightness = 150 + Math.random() * 60;
  ashCtx.fillStyle = `rgba(${brightness},${brightness - 5},${brightness - 12},${0.06 + Math.random() * 0.10})`;
  ashCtx.save();
  ashCtx.translate(cx, cy);
  ashCtx.rotate((Math.random() - 0.5) * 0.4);
  ashCtx.fillRect(-w/2, -h/2, w, h);
  ashCtx.restore();
}

// Darker ash pockets — shadowed recesses between flakes
for (let i = 0; i < 80; i++) {
  const cx = Math.random() * 1024;
  const cy = Math.random() * 1024;
  const r = 5 + Math.random() * 25;
  const grad = ashCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, `rgba(30,28,25,${0.15 + Math.random() * 0.15})`);
  grad.addColorStop(1, 'rgba(30,28,25,0)');
  ashCtx.fillStyle = grad;
  ashCtx.beginPath();
  ashCtx.arc(cx, cy, r, 0, Math.PI * 2);
  ashCtx.fill();
}

// Potassium carbonate white salt deposits — bright white specks
for (let i = 0; i < 200; i++) {
  const px = Math.random() * 1024;
  const py = Math.random() * 1024;
  const pr = 0.5 + Math.random() * 2.5;
  ashCtx.fillStyle = `rgba(240,238,232,${0.08 + Math.random() * 0.12})`;
  ashCtx.beginPath();
  ashCtx.arc(px, py, pr, 0, Math.PI * 2);
  ashCtx.fill();
}

// Layered ring structure — ash forms in concentric layers as the cigar burns
for (let band = 0; band < 18; band++) {
  const yPos = (band / 18) * 1024;
  const bandH = 1024 / 18;
  const bandGrad = ashCtx.createLinearGradient(0, yPos, 0, yPos + bandH);
  const shade = Math.random() > 0.5 ? 0.06 : -0.04;
  bandGrad.addColorStop(0, `rgba(${shade > 0 ? 220 : 30},${shade > 0 ? 218 : 28},${shade > 0 ? 215 : 25},${Math.abs(shade)})`);
  bandGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
  bandGrad.addColorStop(1, `rgba(${shade > 0 ? 30 : 220},${shade > 0 ? 28 : 218},${shade > 0 ? 25 : 215},${Math.abs(shade) * 0.7})`);
  ashCtx.fillStyle = bandGrad;
  ashCtx.fillRect(0, yPos, 1024, bandH);
}

// Warm tint near burn line (bottom of texture = near burn) — stronger ember bleed
const ashWarmGrad = ashCtx.createLinearGradient(0, 0, 0, 1024);
ashWarmGrad.addColorStop(0, 'rgba(0,0,0,0)');
ashWarmGrad.addColorStop(0.55, 'rgba(0,0,0,0)');
ashWarmGrad.addColorStop(0.72, 'rgba(50,15,2,0.06)');
ashWarmGrad.addColorStop(0.82, 'rgba(100,30,5,0.12)');
ashWarmGrad.addColorStop(0.90, 'rgba(160,45,8,0.22)');
ashWarmGrad.addColorStop(0.95, 'rgba(200,60,10,0.30)');
ashWarmGrad.addColorStop(1, 'rgba(220,70,12,0.40)');
ashCtx.fillStyle = ashWarmGrad;
ashCtx.fillRect(0, 0, 1024, 1024);

// Glowing ember hotspots bleeding through the ash near the burn line
for (let i = 0; i < 25; i++) {
  const cx = Math.random() * 1024;
  const cy = 850 + Math.random() * 174;
  const r = 8 + Math.random() * 30;
  const grad = ashCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, `rgba(255,${60 + Math.random()*40},0,${0.15 + Math.random() * 0.20})`);
  grad.addColorStop(0.4, `rgba(200,${30 + Math.random()*20},0,${0.08})`);
  grad.addColorStop(1, 'rgba(150,20,0,0)');
  ashCtx.fillStyle = grad;
  ashCtx.beginPath();
  ashCtx.arc(cx, cy, r, 0, Math.PI * 2);
  ashCtx.fill();
}
// Noise
const ashImgData = ashCtx.getImageData(0, 0, 1024, 1024);
for (let p = 0; p < ashImgData.data.length; p += 4) {
  const n = (Math.random() - 0.5) * 20;
  ashImgData.data[p] = Math.min(255, Math.max(0, ashImgData.data[p] + n));
  ashImgData.data[p + 1] = Math.min(255, Math.max(0, ashImgData.data[p + 1] + n));
  ashImgData.data[p + 2] = Math.min(255, Math.max(0, ashImgData.data[p + 2] + n));
}
ashCtx.putImageData(ashImgData, 0, 0);
const ashTexture = new THREE.CanvasTexture(ashCanvas);
ashTexture.wrapS = THREE.RepeatWrapping;
ashTexture.wrapT = THREE.ClampToEdgeWrapping;

// Ash normal map for flaky surface
const ashNormCanvas = document.createElement('canvas');
ashNormCanvas.width = 512;
ashNormCanvas.height = 512;
const ashNormCtx = ashNormCanvas.getContext('2d');
ashNormCtx.fillStyle = '#8080ff';
ashNormCtx.fillRect(0, 0, 512, 512);
for (let i = 0; i < 120; i++) {
  const y = Math.random() * 512;
  const val = Math.random() > 0.5 ? 150 : 110;
  ashNormCtx.strokeStyle = `rgba(${val},${val},255,${0.15 + Math.random() * 0.2})`;
  ashNormCtx.lineWidth = 0.5 + Math.random() * 2;
  ashNormCtx.beginPath();
  ashNormCtx.moveTo(0, y);
  for (let x = 0; x < 512; x += 6) {
    ashNormCtx.lineTo(x, y + (Math.random() - 0.5) * 2);
  }
  ashNormCtx.stroke();
}
const ashNormTex = new THREE.CanvasTexture(ashNormCanvas);
ashNormTex.wrapS = THREE.RepeatWrapping;

// Ash geometry — slightly wider than cigar (ash expands), with segments for detail
const ashGeometry = new THREE.CylinderGeometry(cigarRadius * 1.012, cigarRadius * 1.028, ashLength, 64, 32, true);
// Displace ash vertices slightly for organic crumbling look
const ashPos = ashGeometry.attributes.position;
for (let i = 0; i < ashPos.count; i++) {
  const x = ashPos.getX(i);
  const y = ashPos.getY(i);
  const z = ashPos.getZ(i);
  const dist = Math.sqrt(x * x + z * z);
  if (dist > 0.01) {
    const noise = (Math.sin(i * 7.3) * 0.3 + Math.sin(i * 17.1) * 0.2 + Math.sin(i * 31.9) * 0.15) * 0.003;
    // Add vertical crumbling — ash edges curl slightly
    const yNorm = (y + ashLength / 2) / ashLength;
    const edgeCurl = yNorm > 0.7 ? (yNorm - 0.7) * 0.008 * Math.sin(Math.atan2(z, x) * 5 + 1.3) : 0;
    const scale = 1 + noise + edgeCurl;
    ashPos.setX(i, x * scale);
    ashPos.setZ(i, z * scale);
  }
}
ashGeometry.computeVertexNormals();

const ashMaterial = new THREE.MeshStandardMaterial({
  map: ashTexture,
  normalMap: ashNormTex,
  normalScale: new THREE.Vector2(0.5, 0.5),
  roughness: 0.98,
  metalness: 0.0,
  color: new THREE.Color(0xC8C0B8),
});
const ashMesh = new THREE.Mesh(ashGeometry, ashMaterial);
ashMesh.name = 'ashSection';
ashMesh.position.y = -cigarLength / 2 + ashLength / 2 + 0.01;
ashMesh.castShadow = true;
cigarGroup.add(ashMesh);

// === BURN LINE ZONE — multi-layered glowing ember between ash and wrapper ===
const burnY = -cigarLength / 2 + ashLength + 0.008;

// Inner hot burn ring — bright cherry-red core
const burnGeo = new THREE.TorusGeometry(cigarRadius * 1.005, 0.006, 16, 64);
const burnMat = new THREE.MeshBasicMaterial({ color: 0xFF2800, transparent: true, opacity: 0.55 });
const burnRing = new THREE.Mesh(burnGeo, burnMat);
burnRing.name = 'burnRing';
burnRing.position.y = burnY;
burnRing.rotation.x = Math.PI / 2;
cigarGroup.add(burnRing);

// Mid glow ring — orange ember halo
const burnMidGeo = new THREE.TorusGeometry(cigarRadius * 1.012, 0.012, 16, 64);
const burnMidMat = new THREE.MeshBasicMaterial({ color: 0xDD4400, transparent: true, opacity: 0.3 });
const burnMidRing = new THREE.Mesh(burnMidGeo, burnMidMat);
burnMidRing.name = 'burnMidRing';
burnMidRing.position.y = burnY;
burnMidRing.rotation.x = Math.PI / 2;
cigarGroup.add(burnMidRing);

// Outer soft glow ring — wide warm diffusion
const burnGlowGeo = new THREE.TorusGeometry(cigarRadius * 1.025, 0.022, 16, 64);
const burnGlowMat = new THREE.MeshBasicMaterial({ color: 0xCC3300, transparent: true, opacity: 0.12 });
const burnGlowRing = new THREE.Mesh(burnGlowGeo, burnGlowMat);
burnGlowRing.name = 'burnGlowRing';
burnGlowRing.position.y = burnY;
burnGlowRing.rotation.x = Math.PI / 2;
cigarGroup.add(burnGlowRing);

// Char line — dark charred wrapper edge just above the burn
const charGeo = new THREE.TorusGeometry(cigarRadius * 1.003, 0.004, 12, 64);
const charMat = new THREE.MeshBasicMaterial({ color: 0x1A0800, transparent: true, opacity: 0.6 });
const charRing = new THREE.Mesh(charGeo, charMat);
charRing.name = 'charRing';
charRing.position.y = burnY + 0.012;
charRing.rotation.x = Math.PI / 2;
cigarGroup.add(charRing);

// Ember point light — warm orange glow illuminating surroundings
const emberGlow = new THREE.PointLight(0xFF4500, 0.35, 1.2);
emberGlow.name = 'emberGlow';
emberGlow.position.y = burnY;
cigarGroup.add(emberGlow);

// Secondary softer ember light — wider reach, dimmer
const emberGlow2 = new THREE.PointLight(0xCC2200, 0.15, 2.5);
emberGlow2.name = 'emberGlow2';
emberGlow2.position.y = burnY;
cigarGroup.add(emberGlow2);

// Foot face — detailed ember/ash cross-section with visible filler strands
const footCanvas = document.createElement('canvas');
footCanvas.width = 1024;
footCanvas.height = 1024;
const footCtx = footCanvas.getContext('2d');
const fc = 512;

// === LIT FOOT CROSS-SECTION — glowing ember with visible burning filler ===

// Deep black base — the core of the burning filler
footCtx.fillStyle = '#0E0805';
footCtx.beginPath();
footCtx.arc(fc, fc, 500, 0, Math.PI * 2);
footCtx.fill();

// Glowing ember core — bright orange-red center where filler is actively combusting
const emberCoreGrad = footCtx.createRadialGradient(fc + 20, fc - 15, 0, fc, fc, 420);
emberCoreGrad.addColorStop(0, '#FF6A00');
emberCoreGrad.addColorStop(0.08, '#FF4500');
emberCoreGrad.addColorStop(0.18, '#E03000');
emberCoreGrad.addColorStop(0.30, '#B82000');
emberCoreGrad.addColorStop(0.45, '#801500');
emberCoreGrad.addColorStop(0.60, '#4A0C00');
emberCoreGrad.addColorStop(0.75, '#2A0800');
emberCoreGrad.addColorStop(0.90, '#150400');
emberCoreGrad.addColorStop(1, '#0A0200');
footCtx.fillStyle = emberCoreGrad;
footCtx.beginPath();
footCtx.arc(fc, fc, 420, 0, Math.PI * 2);
footCtx.fill();

// Outer ash ring — firm white-grey ash with warm ember bleed underneath
const ashRingGrad = footCtx.createRadialGradient(fc, fc, 380, fc, fc, 500);
ashRingGrad.addColorStop(0, 'rgba(80,25,5,0.6)');
ashRingGrad.addColorStop(0.15, 'rgba(120,110,100,0.7)');
ashRingGrad.addColorStop(0.3, '#A8A4A0');
ashRingGrad.addColorStop(0.5, '#BCBAB5');
ashRingGrad.addColorStop(0.7, '#B0ADA8');
ashRingGrad.addColorStop(0.85, '#A5A2A0');
ashRingGrad.addColorStop(1, '#989590');
footCtx.fillStyle = ashRingGrad;
footCtx.beginPath();
footCtx.arc(fc, fc, 500, 0, Math.PI * 2);
footCtx.fill();

// Bright hotspot veins — oxygen channels where the ember burns brightest
for (let i = 0; i < 35; i++) {
  const a = Math.random() * Math.PI * 2;
  const rStart = 20 + Math.random() * 80;
  const rEnd = rStart + 80 + Math.random() * 200;
  const grad = footCtx.createLinearGradient(
    fc + Math.cos(a) * rStart, fc + Math.sin(a) * rStart,
    fc + Math.cos(a) * rEnd, fc + Math.sin(a) * rEnd
  );
  const brightness = Math.random();
  if (brightness > 0.7) {
    // White-hot channels
    grad.addColorStop(0, `rgba(255,220,150,${0.3 + Math.random() * 0.3})`);
    grad.addColorStop(0.5, `rgba(255,140,40,${0.2 + Math.random() * 0.2})`);
    grad.addColorStop(1, 'rgba(200,60,0,0)');
  } else {
    // Orange-red channels
    grad.addColorStop(0, `rgba(255,${80 + Math.random()*60},0,${0.2 + Math.random() * 0.25})`);
    grad.addColorStop(0.6, `rgba(180,${30 + Math.random()*30},0,${0.1})`);
    grad.addColorStop(1, 'rgba(100,15,0,0)');
  }
  footCtx.strokeStyle = grad;
  footCtx.lineWidth = 2 + Math.random() * 6;
  footCtx.beginPath();
  let px = fc + Math.cos(a) * rStart;
  let py = fc + Math.sin(a) * rStart;
  footCtx.moveTo(px, py);
  const curve = (Math.random() - 0.5) * 0.003;
  let angle = a;
  for (let s = rStart; s < rEnd; s += 4) {
    angle += curve + (Math.random() - 0.5) * 0.04;
    px += Math.cos(angle) * 4;
    py += Math.sin(angle) * 4;
    footCtx.lineTo(px, py);
  }
  footCtx.stroke();
}

// Individual burning filler leaf cross-sections — glowing and charring
for (let i = 0; i < 120; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.random() * 360;
  const sx = fc + Math.cos(a) * r;
  const sy = fc + Math.sin(a) * r;
  const sw = 6 + Math.random() * 30;
  const sh = 2 + Math.random() * 14;
  const rot = Math.random() * Math.PI;
  
  const distFromCenter = r / 360;
  let leafR, leafG, leafB, leafA;
  
  if (distFromCenter < 0.3) {
    // Core — white-hot to bright orange
    leafR = 255; leafG = 150 + Math.random() * 80; leafB = 30 + Math.random() * 50;
    leafA = 0.4 + Math.random() * 0.4;
  } else if (distFromCenter < 0.55) {
    // Mid — cherry red to deep orange
    leafR = 200 + Math.random() * 55; leafG = 40 + Math.random() * 50; leafB = Math.random() * 15;
    leafA = 0.35 + Math.random() * 0.35;
  } else if (distFromCenter < 0.8) {
    // Outer — dark red, charring
    leafR = 100 + Math.random() * 80; leafG = 15 + Math.random() * 25; leafB = Math.random() * 8;
    leafA = 0.25 + Math.random() * 0.3;
  } else {
    // Edge — mostly charred/ash
    leafR = 50 + Math.random() * 40; leafG = 10 + Math.random() * 15; leafB = Math.random() * 5;
    leafA = 0.2 + Math.random() * 0.2;
  }
  
  footCtx.save();
  footCtx.translate(sx, sy);
  footCtx.rotate(rot);
  const strandGrad = footCtx.createRadialGradient(0, 0, 0, 0, 0, sw * 0.6);
  strandGrad.addColorStop(0, `rgba(${leafR},${leafG},${leafB},${leafA})`);
  strandGrad.addColorStop(0.7, `rgba(${leafR*0.6|0},${leafG*0.4|0},${leafB*0.3|0},${leafA*0.4})`);
  strandGrad.addColorStop(1, `rgba(${leafR*0.3|0},${leafG*0.2|0},0,0)`);
  footCtx.fillStyle = strandGrad;
  footCtx.beginPath();
  footCtx.ellipse(0, 0, sw, sh, 0, 0, Math.PI * 2);
  footCtx.fill();
  footCtx.restore();
}

// Bright ember pinpoints — individual glowing tobacco particles
for (let i = 0; i < 60; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.random() * 350;
  const hx = fc + Math.cos(a) * r;
  const hy = fc + Math.sin(a) * r;
  const hr = 2 + Math.random() * 10;
  const hg = footCtx.createRadialGradient(hx, hy, 0, hx, hy, hr);
  const temp = Math.random();
  if (temp > 0.7) {
    // Yellow-white hotspots
    hg.addColorStop(0, `rgba(255,240,180,${0.5 + Math.random() * 0.4})`);
    hg.addColorStop(0.3, `rgba(255,180,60,${0.3})`);
    hg.addColorStop(1, 'rgba(200,80,0,0)');
  } else if (temp > 0.3) {
    // Orange bright spots
    hg.addColorStop(0, `rgba(255,${100 + Math.random()*60},0,${0.4 + Math.random() * 0.3})`);
    hg.addColorStop(0.5, `rgba(220,50,0,${0.15})`);
    hg.addColorStop(1, 'rgba(150,20,0,0)');
  } else {
    // Deep red embers
    hg.addColorStop(0, `rgba(200,${30 + Math.random()*30},0,${0.3 + Math.random() * 0.2})`);
    hg.addColorStop(1, 'rgba(100,10,0,0)');
  }
  footCtx.fillStyle = hg;
  footCtx.beginPath();
  footCtx.arc(hx, hy, hr, 0, Math.PI * 2);
  footCtx.fill();
}

// Dark char gaps between burning leaves
for (let i = 0; i < 70; i++) {
  const a = Math.random() * Math.PI * 2;
  const r1 = 10 + Math.random() * 250;
  const r2 = r1 + 15 + Math.random() * 60;
  footCtx.strokeStyle = `rgba(5,2,0,${0.25 + Math.random() * 0.35})`;
  footCtx.lineWidth = 0.5 + Math.random() * 2.5;
  footCtx.beginPath();
  const curve = (Math.random() - 0.5) * 0.4;
  footCtx.moveTo(fc + Math.cos(a) * r1, fc + Math.sin(a) * r1);
  footCtx.quadraticCurveTo(
    fc + Math.cos(a + curve) * ((r1 + r2) / 2), 
    fc + Math.sin(a + curve) * ((r1 + r2) / 2),
    fc + Math.cos(a + curve * 0.5) * r2, 
    fc + Math.sin(a + curve * 0.5) * r2
  );
  footCtx.stroke();
}

// Ash ring cracks radiating outward from ember to ash
for (let i = 0; i < 40; i++) {
  const a = Math.random() * Math.PI * 2;
  const rInner = 340 + Math.random() * 40;
  const rOuter = 440 + Math.random() * 50;
  footCtx.strokeStyle = `rgba(25,22,20,${0.15 + Math.random() * 0.2})`;
  footCtx.lineWidth = 0.3 + Math.random() * 1.5;
  footCtx.beginPath();
  footCtx.moveTo(fc + Math.cos(a) * rInner, fc + Math.sin(a) * rInner);
  const wobble = (Math.random() - 0.5) * 0.15;
  footCtx.lineTo(fc + Math.cos(a + wobble) * rOuter, fc + Math.sin(a + wobble) * rOuter);
  footCtx.stroke();
}

// Concentric ash rings in the outer ash zone
for (let r = 390; r < 490; r += 4 + Math.random() * 4) {
  footCtx.strokeStyle = `rgba(50,48,45,${0.06 + Math.random() * 0.08})`;
  footCtx.lineWidth = 0.3 + Math.random() * 0.8;
  footCtx.beginPath();
  footCtx.arc(fc, fc, r, 0, Math.PI * 2);
  footCtx.stroke();
}

// Ember bleed ring — transition zone between hot ember and cool ash
const emberBleedGrad = footCtx.createRadialGradient(fc, fc, 330, fc, fc, 410);
emberBleedGrad.addColorStop(0, 'rgba(200,60,0,0.25)');
emberBleedGrad.addColorStop(0.3, 'rgba(150,30,0,0.15)');
emberBleedGrad.addColorStop(0.6, 'rgba(80,15,0,0.08)');
emberBleedGrad.addColorStop(1, 'rgba(0,0,0,0)');
footCtx.fillStyle = emberBleedGrad;
footCtx.beginPath();
footCtx.arc(fc, fc, 410, 0, Math.PI * 2);
footCtx.fill();

// Noise on foot
const footImgData = footCtx.getImageData(0, 0, 1024, 1024);
for (let p = 0; p < footImgData.data.length; p += 4) {
  const n = (Math.random() - 0.5) * 14;
  footImgData.data[p] = Math.min(255, Math.max(0, footImgData.data[p] + n));
  footImgData.data[p+1] = Math.min(255, Math.max(0, footImgData.data[p+1] + n * 0.9));
  footImgData.data[p+2] = Math.min(255, Math.max(0, footImgData.data[p+2] + n * 0.7));
}
footCtx.putImageData(footImgData, 0, 0);
const footTex = new THREE.CanvasTexture(footCanvas);

// Foot cap — recessed into the ash end, not a flat disc
const footGeometry = new THREE.CircleGeometry(cigarRadius * 0.98, 64);
const footMaterial = new THREE.MeshStandardMaterial({
  map: footTex,
  roughness: 0.85,
  metalness: 0.0,
  emissiveMap: footTex,
  emissive: new THREE.Color(0xFF4500),
  emissiveIntensity: 0.4,
});
const footMesh = new THREE.Mesh(footGeometry, footMaterial);
footMesh.name = 'footFiller';
footMesh.position.y = -cigarLength / 2 + ashLength * 0.5;
footMesh.rotation.x = Math.PI / 2;
cigarGroup.add(footMesh);

// Inner shadow ring — ember glow bleeding through with dark depth
const innerShadowCanvas = document.createElement('canvas');
innerShadowCanvas.width = 512;
innerShadowCanvas.height = 512;
const isc = innerShadowCanvas.getContext('2d');
const isCx = 256, isCy = 256;
// Warm ember center fading to dark shadow at edges
const innerShadowGrad = isc.createRadialGradient(isCx, isCy, 0, isCx, isCy, 256);
innerShadowGrad.addColorStop(0, 'rgba(255,100,20,0.08)');
innerShadowGrad.addColorStop(0.2, 'rgba(180,50,5,0.05)');
innerShadowGrad.addColorStop(0.4, 'rgba(40,10,0,0.1)');
innerShadowGrad.addColorStop(0.6, 'rgba(8,3,0,0.3)');
innerShadowGrad.addColorStop(0.75, 'rgba(5,2,0,0.55)');
innerShadowGrad.addColorStop(0.88, 'rgba(3,1,0,0.78)');
innerShadowGrad.addColorStop(1, 'rgba(2,1,0,0.92)');
isc.fillStyle = innerShadowGrad;
isc.beginPath();
isc.arc(isCx, isCy, 256, 0, Math.PI * 2);
isc.fill();
// Warm ember rim glow — stronger, visible ring of heat
const emberRimGrad = isc.createRadialGradient(isCx, isCy, 180, isCx, isCy, 255);
emberRimGrad.addColorStop(0, 'rgba(0,0,0,0)');
emberRimGrad.addColorStop(0.4, 'rgba(200,50,5,0.08)');
emberRimGrad.addColorStop(0.7, 'rgba(255,70,10,0.14)');
emberRimGrad.addColorStop(0.9, 'rgba(200,40,5,0.10)');
emberRimGrad.addColorStop(1, 'rgba(100,20,3,0.04)');
isc.fillStyle = emberRimGrad;
isc.beginPath();
isc.arc(isCx, isCy, 256, 0, Math.PI * 2);
isc.fill();
const innerShadowTex = new THREE.CanvasTexture(innerShadowCanvas);

const innerShadowGeo = new THREE.CircleGeometry(cigarRadius * 1.02, 64);
const innerShadowMat = new THREE.MeshBasicMaterial({
  map: innerShadowTex,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.NormalBlending,
});
const innerShadowMesh = new THREE.Mesh(innerShadowGeo, innerShadowMat);
innerShadowMesh.name = 'footInnerShadow';
// Position just in front of the foot face so it overlays
innerShadowMesh.position.y = -cigarLength / 2 + ashLength * 0.5 - 0.001;
innerShadowMesh.rotation.x = Math.PI / 2;
cigarGroup.add(innerShadowMesh);

// Recessed depth disc — glowing ember depth with emissive
const depthDiscGeo = new THREE.CircleGeometry(cigarRadius * 0.75, 64);
const depthDiscMat = new THREE.MeshStandardMaterial({
  color: 0x2A0800,
  roughness: 0.9,
  metalness: 0.0,
  emissive: new THREE.Color(0xFF3000),
  emissiveIntensity: 0.15,
});
const depthDisc = new THREE.Mesh(depthDiscGeo, depthDiscMat);
depthDisc.name = 'footDepthDisc';
depthDisc.position.y = -cigarLength / 2 + ashLength * 0.45;
depthDisc.rotation.x = Math.PI / 2;
cigarGroup.add(depthDisc);

// Cigar band — procedural texture (gold + red Opus X Angel's Share)
const bandCanvas = document.createElement('canvas');
bandCanvas.width = 1024; bandCanvas.height = 256;
const bCtx = bandCanvas.getContext('2d');
const bW = 1024, bH = 256;
// Gold section (top half)
const gg = bCtx.createLinearGradient(0, 0, 0, bH / 2);
[[0,'#1a1206'],[.08,'#4a3410'],[.25,'#8a6818'],[.4,'#c8a030'],[.5,'#f0d050'],[.6,'#c8a030'],[.75,'#8a6818'],[.92,'#4a3410'],[1,'#1a1206']].forEach(s => gg.addColorStop(s[0], s[1]));
bCtx.fillStyle = gg; bCtx.fillRect(0, 0, bW, bH / 2);
// Red section (bottom half)
const rg = bCtx.createLinearGradient(0, bH / 2, 0, bH);
[[0,'#1a0404'],[.08,'#4a0808'],[.25,'#8a1010'],[.4,'#c01818'],[.5,'#d82020'],[.6,'#c01818'],[.75,'#8a1010'],[.92,'#4a0808'],[1,'#1a0404']].forEach(s => rg.addColorStop(s[0], s[1]));
bCtx.fillStyle = rg; bCtx.fillRect(0, bH / 2, bW, bH / 2);
// Gold borders and divider
bCtx.fillStyle = '#e8c040';
bCtx.fillRect(0, 0, bW, 5); bCtx.fillRect(0, bH - 5, bW, 5); bCtx.fillRect(0, bH / 2 - 2, bW, 4);
// Ornamental circles on gold section
for (let bi = 0; bi < 8; bi++) {
  const bcx = (bi / 8) * bW + bW / 16;
  bCtx.strokeStyle = 'rgba(240,200,60,0.35)'; bCtx.lineWidth = 1.5;
  bCtx.beginPath(); bCtx.arc(bcx, bH / 4, 18, 0, Math.PI * 2); bCtx.stroke();
  bCtx.beginPath(); bCtx.arc(bcx, bH / 4, 12, 0, Math.PI * 2); bCtx.stroke();
}
const bandTexture = new THREE.CanvasTexture(bandCanvas);
bandTexture.wrapS = THREE.RepeatWrapping;

// Band geometry - slightly larger than cigar, positioned near cap
const bandWidth = 0.30;
const bandRadius = cigarRadius + 0.003;
const bandGeometry = new THREE.CylinderGeometry(bandRadius, bandRadius, bandWidth, 64, 1, true);
const bandMaterial = new THREE.MeshPhysicalMaterial({
  map: bandTexture,
  roughness: 0.25,
  metalness: 0.2,
  side: THREE.DoubleSide,
  clearcoat: 0.3,
  clearcoatRoughness: 0.2,
});

const bandMesh = new THREE.Mesh(bandGeometry, bandMaterial);
  bandMesh.position.y = cigarLength / 2 - 0.65;
bandMesh.castShadow = true;
cigarGroup.add(bandMesh);

// Thin gold ring above band
const ringGeometry = new THREE.TorusGeometry(bandRadius + 0.002, 0.003, 8, 64);
const ringMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xDAA520,
  roughness: 0.15,
  metalness: 0.9,
  clearcoat: 0.5,
  clearcoatRoughness: 0.1,
});

const topRing = new THREE.Mesh(ringGeometry, ringMaterial);
  topRing.position.y = cigarLength / 2 - 0.65 + bandWidth / 2;
topRing.rotation.x = Math.PI / 2;
cigarGroup.add(topRing);

const bottomRing = new THREE.Mesh(ringGeometry, ringMaterial);
  bottomRing.position.y = cigarLength / 2 - 0.65 - bandWidth / 2;
bottomRing.rotation.x = Math.PI / 2;
cigarGroup.add(bottomRing);

// Tilt the cigar at an elegant angle — slight diagonal, product-photography pose
cigarGroup.rotation.z = 0.22;
cigarGroup.rotation.x = 0.08;
scene.add(cigarGroup);

// No smoke — clean product photography look
const footY = -cigarLength / 2;





// (Title overlay removed — landing page has its own)

// Animation
const clock = new THREE.Clock();
const dt = 1 / 60;

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  // Gentle float — slow breathing motion
  cigarGroup.position.y = Math.sin(elapsed * 0.4) * 0.02 + Math.sin(elapsed * 0.17) * 0.01;



  // No smoke updates needed — clean product shot



  // Realistic ember flicker — organic pulsing like a real lit cigar
  const flick1 = Math.sin(elapsed * 1.8) * 0.08 + Math.sin(elapsed * 4.1) * 0.04 + Math.sin(elapsed * 7.3) * 0.02;
  const flick2 = Math.sin(elapsed * 1.2 + 0.5) * 0.06 + Math.sin(elapsed * 3.3) * 0.03;
  const breathe = Math.sin(elapsed * 0.3) * 0.05; // Slow breathing pulse like someone is drawing
  
  const burnRingMesh = cigarGroup.getObjectByName('burnRing');
  if (burnRingMesh) {
    burnRingMesh.material.opacity = 0.55 + flick1 + breathe;
  }
  const burnMid = cigarGroup.getObjectByName('burnMidRing');
  if (burnMid) {
    burnMid.material.opacity = 0.3 + flick2 * 0.6 + breathe * 0.5;
  }
  const burnGlow = cigarGroup.getObjectByName('burnGlowRing');
  if (burnGlow) {
    burnGlow.material.opacity = 0.12 + flick1 * 0.3 + breathe * 0.3;
  }
  const ember = cigarGroup.getObjectByName('emberGlow');
  if (ember) {
    ember.intensity = 0.35 + flick1 * 0.8 + breathe * 0.4;
  }
  const ember2 = cigarGroup.getObjectByName('emberGlow2');
  if (ember2) {
    ember2.intensity = 0.15 + flick2 * 0.4 + breathe * 0.2;
  }
  
  // Foot emissive pulse — the foot face glows brighter/dimmer
  const footFiller = cigarGroup.getObjectByName('footFiller');
  if (footFiller) {
    footFiller.material.emissiveIntensity = 0.4 + flick1 * 0.5 + breathe * 0.3;
  }
  const depthD = cigarGroup.getObjectByName('footDepthDisc');
  if (depthD) {
    depthD.material.emissiveIntensity = 0.15 + flick2 * 0.3 + breathe * 0.15;
  }

  controls.update();
  composer.render();
}

animate();

// Resize handler — observe container, not window
new ResizeObserver(() => {
  const w = container.clientWidth, h = container.clientHeight;
  if (w && h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
}).observe(container);

}; // end initCigar3DWebGL