// Vitola Pedia Cigar Scanner — camera + OCR + database match
// Uses Tesseract.js (loaded from CDN) for on-device text recognition

(function() {
  'use strict';

  let scannerStream = null;
  let scannerActive = false;

  // ── Fuzzy match cigar name against database ──
  function fuzzyMatch(text) {
    if (typeof CIGARS === 'undefined') return null;

    // Clean OCR text: lowercase, remove extra chars, collapse whitespace
    const clean = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean || clean.length < 3) return null;

    const words = clean.split(' ').filter(w => w.length > 2);
    if (words.length === 0) return null;

    // Score each cigar by how many query words appear in its name/brand
    const scored = CIGARS.map(cigar => {
      const nameText = (cigar.name + ' ' + cigar.brand).toLowerCase();
      let score = 0;
      let matchedWords = 0;

      for (const word of words) {
        if (nameText.includes(word)) {
          matchedWords++;
          // Bonus for exact brand match
          if (cigar.brand.toLowerCase().includes(word)) score += 3;
          else score += 1;
        }
      }

      // Require at least 2 words to match, or 1 word if it's a brand
      if (matchedWords === 0) return { cigar, score: 0 };
      
      // Bonus for matching all words
      if (matchedWords === words.length) score += 5;
      
      // Bonus for shorter cigar names (more likely exact match)
      score += Math.max(0, 10 - cigar.name.split(' ').length);

      return { cigar, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

    return scored.length > 0 ? scored.slice(0, 5) : null;
  }

  // ── Build the scanner UI ──
  function buildScannerUI() {
    if (document.getElementById('scanner-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'scanner-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.95);
      display:none;flex-direction:column;align-items:center;justify-content:center;
      font-family:Georgia,serif;color:#c9943a;
    `;

    overlay.innerHTML = `
      <div id="scanner-header" style="width:100%;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;box-sizing:border-box;">
        <button id="scanner-close" style="background:none;border:none;color:#c9943a;font-size:28px;cursor:pointer;font-family:Georgia,serif;">✕</button>
        <h2 style="margin:0;font-size:18px;letter-spacing:1px;">SCAN CIGAR</h2>
        <div style="width:28px"></div>
      </div>
      
      <div id="scanner-video-wrap" style="position:relative;flex:1;width:100%;max-width:500px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <video id="scanner-video" autoplay playsinline style="width:100%;height:100%;object-fit:cover;"></video>
        <div id="scanner-reticle" style="position:absolute;width:80%;max-width:350px;height:200px;border:2px solid #c9943a;border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,0.4);pointer-events:none;">
          <div style="position:absolute;top:-2px;left:-2px;width:30px;height:30px;border-top:3px solid #ff6b35;border-left:3px solid #ff6b35;border-radius:12px 0 0 0;"></div>
          <div style="position:absolute;top:-2px;right:-2px;width:30px;height:30px;border-top:3px solid #ff6b35;border-right:3px solid #ff6b35;border-radius:0 12px 0 0;"></div>
          <div style="position:absolute;bottom:-2px;left:-2px;width:30px;height:30px;border-bottom:3px solid #ff6b35;border-left:3px solid #ff6b35;border-radius:0 0 0 12px;"></div>
          <div style="position:absolute;bottom:-2px;right:-2px;width:30px;height:30px;border-bottom:3px solid #ff6b35;border-right:3px solid #ff6b35;border-radius:0 0 12px 0;"></div>
          <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(255,107,53,0.5);"></div>
        </div>
        <div id="scanner-hint" style="position:absolute;bottom:20px;left:0;right:0;text-align:center;font-size:13px;color:rgba(201,148,58,0.7);">Point at the cigar band — tap capture</div>
      </div>
      
      <div id="scanner-controls" style="padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:500px;box-sizing:border-box;">
        <button id="scanner-capture" style="width:64px;height:64px;border-radius:50%;border:3px solid #c9943a;background:rgba(201,148,58,0.15);cursor:pointer;font-size:24px;color:#c9943a;transition:all 0.2s;">📷</button>
        <div id="scanner-status" style="font-size:13px;min-height:20px;text-align:center;"></div>
      </div>
      
      <canvas id="scanner-canvas" style="display:none;"></canvas>
      <div id="scanner-results" style="display:none;width:100%;max-width:500px;padding:0 20px 20px;box-sizing:border-box;"></div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#scanner-close').addEventListener('click', closeScanner);
    overlay.querySelector('#scanner-capture').addEventListener('click', captureAndScan);
  }

  // ── Open scanner ──
  async function openScanner() {
    buildScannerUI();
    const overlay = document.getElementById('scanner-overlay');
    overlay.style.display = 'flex';

    try {
      scannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      const video = document.getElementById('scanner-video');
      video.srcObject = scannerStream;
      scannerActive = true;
      document.getElementById('scanner-status').textContent = '';
    } catch (err) {
      document.getElementById('scanner-status').innerHTML = 
        '<span style="color:#ff6b35;">Camera access denied. Please enable camera permissions.</span>';
      console.error('Scanner camera error:', err);
    }
  }

  // ── Close scanner ──
  function closeScanner() {
    scannerActive = false;
    if (scannerStream) {
      scannerStream.getTracks().forEach(t => t.stop());
      scannerStream = null;
    }
    const overlay = document.getElementById('scanner-overlay');
    if (overlay) overlay.style.display = 'none';
    
    // Reset results
    const results = document.getElementById('scanner-results');
    if (results) { results.style.display = 'none'; results.innerHTML = ''; }
    document.getElementById('scanner-controls').style.display = 'flex';
  }

  // ── Capture frame and run OCR ──
  async function captureAndScan() {
    const video = document.getElementById('scanner-video');
    const canvas = document.getElementById('scanner-canvas');
    const status = document.getElementById('scanner-status');
    const captureBtn = document.getElementById('scanner-capture');

    if (!video.videoWidth) {
      status.textContent = 'Camera not ready yet...';
      return;
    }

    // Draw video frame to canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Crop to reticle area (center 80% width, middle 200px band)
    const cropW = Math.floor(video.videoWidth * 0.8);
    const cropH = Math.min(300, Math.floor(video.videoHeight * 0.4));
    const cropX = Math.floor((video.videoWidth - cropW) / 2);
    const cropY = Math.floor((video.videoHeight - cropH) / 2);
    
    // Create a temp canvas for the cropped region
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = cropW;
    tmpCanvas.height = cropH;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    
    // Upscale 2x for better OCR
    const bigCanvas = document.createElement('canvas');
    bigCanvas.width = cropW * 2;
    bigCanvas.height = cropH * 2;
    const bigCtx = bigCanvas.getContext('2d');
    bigCtx.imageSmoothingEnabled = true;
    bigCtx.drawImage(tmpCanvas, 0, 0, bigCanvas.width, bigCanvas.height);
    
    // Convert to image data
    const imgData = bigCtx.getImageData(0, 0, bigCanvas.width, bigCanvas.height);

    // Show processing state
    captureBtn.style.display = 'none';
    status.innerHTML = '<span style="color:#c9943a;">Reading band...</span>';

    try {
      // Load Tesseract.js if not already loaded
      if (typeof Tesseract === 'undefined') {
        status.innerHTML = '<span style="color:#c9943a;">Loading scanner engine...</span>';
        await loadTesseract();
      }

      status.innerHTML = '<span style="color:#c9943a;">Recognizing text...</span>';

      const result = await Tesseract.recognize(
        bigCanvas,
        'eng',
        { logger: m => {
          if (m.status === 'recognizing text') {
            status.innerHTML = `<span style="color:#c9943a;">Scanning... ${Math.round(m.progress * 100)}%</span>`;
          }
        }}
      );

      const rawText = result.data.text;
      console.log('OCR result:', rawText);

      if (!rawText || rawText.trim().length < 2) {
        status.innerHTML = '<span style="color:#ff6b35;">Couldn\'t read the band. Try again with better lighting and focus on the band text.</span>';
        captureBtn.style.display = 'flex';
        return;
      }

      // Match against database
      const matches = fuzzyMatch(rawText);

      if (!matches || matches.length === 0) {
        status.innerHTML = `<span style="color:#ff6b35;">No match found for "${rawText.trim().substring(0, 40)}". Try a different angle or search manually.</span>`;
        captureBtn.style.display = 'flex';
        return;
      }

      // Show results
      showResults(matches, rawText);

    } catch (err) {
      console.error('OCR error:', err);
      status.innerHTML = '<span style="color:#ff6b35;">Scanner error. Please try again.</span>';
      captureBtn.style.display = 'flex';
    }
  }

  // ── Show matched results ──
  function showResults(matches, rawText) {
    const status = document.getElementById('scanner-status');
    const controls = document.getElementById('scanner-controls');
    const results = document.getElementById('scanner-results');

    status.textContent = '';
    controls.style.display = 'none';
    results.style.display = 'block';
    results.innerHTML = `
      <div style="font-size:12px;color:rgba(201,148,58,0.5);margin-bottom:12px;">OCR: "${rawText.trim().substring(0, 60)}"</div>
      <div style="font-size:15px;color:#c9943a;margin-bottom:12px;font-weight:bold;">Top Matches</div>
    `;

    matches.forEach((m, i) => {
      const c = m.cigar;
      const confidence = Math.min(99, Math.round(m.score * 10));
      const card = document.createElement('div');
      card.style.cssText = `
        display:flex;gap:12px;padding:12px;margin-bottom:8px;
        background:rgba(201,148,58,0.08);border:1px solid rgba(201,148,58,0.2);
        border-radius:8px;cursor:pointer;transition:all 0.2s;
      `;
      card.innerHTML = `
        <div style="flex:1;">
          <div style="font-size:14px;color:#e8d5b3;font-weight:bold;">${esc(c.name)}</div>
          <div style="font-size:12px;color:rgba(201,148,58,0.6);margin-top:2px;">${esc(c.brand)} · ${esc(c.origin)} · ${esc(c.size)}</div>
          <div style="font-size:11px;color:rgba(255,107,53,0.8);margin-top:4px;">${confidence}% match</div>
        </div>
      `;
      card.addEventListener('mouseenter', () => {
        card.style.background = 'rgba(201,148,58,0.15)';
        card.style.borderColor = '#c9943a';
      });
      card.addEventListener('mouseleave', () => {
        card.style.background = 'rgba(201,148,58,0.08)';
        card.style.borderColor = 'rgba(201,148,58,0.2)';
      });
      card.addEventListener('click', () => {
        closeScanner();
        // Navigate to the cigar
        if (typeof window.openModal === 'function' && c) {
          window.openModal(c);
        } else if (c.id) {
          window.location.hash = '#/cigar/' + c.id;
        }
      });
      results.appendChild(card);
    });

    // Add retry button
    const retry = document.createElement('button');
    retry.textContent = 'Scan Again';
    retry.style.cssText = 'margin-top:12px;padding:10px 24px;background:rgba(201,148,58,0.15);border:1px solid #c9943a;border-radius:8px;color:#c9943a;cursor:pointer;font-family:Georgia,serif;font-size:14px;';
    retry.addEventListener('click', () => {
      results.style.display = 'none';
      results.innerHTML = '';
      controls.style.display = 'flex';
      document.getElementById('scanner-capture').style.display = 'flex';
    });
    results.appendChild(retry);
  }

  // ── Load Tesseract.js from CDN ──
  function loadTesseract() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
      document.head.appendChild(script);
    });
  }

  // ── Escape HTML ──
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ── Register service worker for PWA ──
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('SW registered:', reg.scope);
      }).catch(err => console.log('SW registration failed:', err));
    });
  }

  // ── PWA install prompt handling ──
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  function showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = `
      position:fixed;bottom:0;left:0;right:0;z-index:9998;
      background:linear-gradient(180deg,rgba(26,18,9,0.98),rgba(26,18,9,1));
      border-top:1px solid #c9943a;padding:12px 16px;
      display:flex;align-items:center;gap:12px;
      font-family:Georgia,serif;transform:translateY(100%);
      transition:transform 0.3s ease;
    `;
    banner.innerHTML = `
      <div style="font-size:24px;">🚬</div>
      <div style="flex:1;">
        <div style="font-size:14px;color:#c9943a;font-weight:bold;">Install Vitola Pedia</div>
        <div style="font-size:12px;color:rgba(201,148,58,0.6);">Add to your home screen for the full app experience</div>
      </div>
      <button id="pwa-install-btn" style="background:#c9943a;color:#1a1209;border:none;padding:8px 16px;border-radius:6px;font-weight:bold;cursor:pointer;font-family:Georgia,serif;font-size:13px;">Install</button>
      <button id="pwa-dismiss-btn" style="background:none;border:none;color:rgba(201,148,58,0.4);font-size:20px;cursor:pointer;padding:0 4px;">✕</button>
    `;
    document.body.appendChild(banner);
    
    setTimeout(() => banner.style.transform = 'translateY(0)', 100);

    banner.querySelector('#pwa-install-btn').addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          console.log('PWA installed');
        }
        deferredPrompt = null;
        banner.remove();
      }
    });

    banner.querySelector('#pwa-dismiss-btn').addEventListener('click', () => {
      banner.remove();
    });
  }

  // ── Expose globally ──
  window.VPScanner = {
    open: openScanner,
    close: closeScanner
  };
})();
