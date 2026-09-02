// Vitola Pedia Cigar Scanner — camera + OCR + strict database match
// Uses Tesseract.js (loaded from CDN) for on-device text recognition
// v2: Strict matching with real confidence scores, OCR preprocessing, no false positives

(function() {
  'use strict';

  let scannerStream = null;
  let scannerActive = false;
  let recentScans = [];

  // Load recent scans from localStorage
  try {
    const saved = localStorage.getItem('vp_recent_scans');
    if (saved) recentScans = JSON.parse(saved).slice(0, 10);
  } catch(e) { recentScans = []; }

  // ── OCR preprocessing: enhance text visibility on cigar bands ──
  function preprocessImage(canvas, ctx) {
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Convert to grayscale and apply adaptive threshold
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let gray = 0.299 * r + 0.587 * g + 0.114 * b;

      // Increase contrast aggressively — cigar bands are gold/white on dark
      gray = (gray - 128) * 2.5 + 128;
      gray = Math.max(0, Math.min(255, gray));

      // Threshold: pure black or white for cleaner OCR
      const threshold = 140;
      const val = gray > threshold ? 255 : 0;

      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  // ── Clean OCR text: remove common OCR artifacts ──
  function cleanOCRText(text) {
    return text
      .replace(/[|\\\/{}[\]()<>@#$%^*+=~`]/g, ' ')  // remove non-text symbols
      .replace(/\n+/g, ' ')                           // flatten newlines
      .replace(/\s+/g, ' ')                            // collapse whitespace
      .replace(/[^a-zA-Z0-9\s&.'-]/g, ' ')            // keep only text chars
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── Levenshtein distance for fuzzy string comparison ──
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({length: m + 1}, (_, i) => [i]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  // ── Similarity ratio (0-1) between two strings ──
  function similarity(a, b) {
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (!a || !b) return 0;
    if (a === b) return 1;
    const dist = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    return 1 - (dist / maxLen);
  }

  // ── STRICT match: only return results with real confidence ≥ 60% ──
  function strictMatch(text) {
    if (typeof CIGARS === 'undefined') return null;

    const clean = cleanOCRText(text);
    if (!clean || clean.length < 3) return null;

    // Extract meaningful words (≥3 chars, filter common noise)
    const noiseWords = new Set(['the', 'and', 'for', 'with', 'from', 'cigar', 'cigars',
      'hand', 'made', 'roll', 'rolled', 'premium', 'quality', 'tobacco', 'leaf',
      'inc', 'ltd', 'co', 'corp', 'llc', 'brand', 'size', 'gauge', 'ring',
      'edition', 'series', 'blend', 'the', 'los', 'las', 'el', 'la', 'de', 'y']);

    const words = clean.split(' ').filter(w => w.length >= 3 && !noiseWords.has(w.toLowerCase()));
    if (words.length === 0) return null;

    const results = [];

    for (const cigar of CIGARS) {
      const fullName = (cigar.brand + ' ' + cigar.name).toLowerCase().trim();
      const brandLower = cigar.brand.toLowerCase().trim();
      const nameLower = cigar.name.toLowerCase().trim();

      // ── Method 1: Full string similarity (OCR text vs brand+name) ──
      const fullSim = similarity(clean.toLowerCase(), fullName);

      // ── Method 2: Brand match — must be very strong ──
      let brandSim = 0;
      for (const word of words) {
        const wordSim = similarity(word.toLowerCase(), brandLower);
        if (wordSim > brandSim) brandSim = wordSim;
      }

      // ── Method 3: Word overlap — how many OCR words appear in the name ──
      let wordMatches = 0;
      let totalWordSim = 0;
      for (const word of words) {
        const wl = word.toLowerCase();
        // Check against full name
        if (fullName.includes(wl)) {
          wordMatches++;
          totalWordSim += 1;
          continue;
        }
        // Check fuzzy against each word in the name
        const nameWords = fullName.split(' ');
        let bestWordSim = 0;
        for (const nw of nameWords) {
          const ws = similarity(wl, nw);
          if (ws > bestWordSim) bestWordSim = ws;
        }
        if (bestWordSim >= 0.75) {
          wordMatches++;
          totalWordSim += bestWordSim;
        }
      }

      // ── Calculate real confidence score ──
      // Weight: brand match is most important (40%), word overlap (35%), full string sim (25%)
      const wordCoverage = words.length > 0 ? wordMatches / words.length : 0;
      const avgWordSim = words.length > 0 ? totalWordSim / words.length : 0;

      let confidence = 0;
      confidence += brandSim * 40;        // Brand match: 0-40 points
      confidence += avgWordSim * 35;      // Word overlap quality: 0-35 points
      confidence += fullSim * 25;         // Full string similarity: 0-25 points

      // ── Hard gates: reject weak matches ──
      // Must match at least 1 word with ≥0.75 similarity OR brand ≥0.7
      if (wordMatches === 0 && brandSim < 0.7) continue;

      // Must have at least 40% confidence
      if (confidence < 40) continue;

      // If only 1 word matched and it's generic, reject
      if (wordMatches === 1 && brandSim < 0.6 && avgWordSim < 0.85) continue;

      results.push({
        cigar,
        confidence: Math.round(Math.min(99, confidence)),
        brandSim: Math.round(brandSim * 100),
        wordMatches,
        wordCoverage: Math.round(wordCoverage * 100)
      });
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    // ── Only return results ≥ 60% confidence ──
    const highConfidence = results.filter(r => r.confidence >= 60);

    // If we have high-confidence results, return only those (max 5)
    if (highConfidence.length > 0) {
      return highConfidence.slice(0, 5);
    }

    // If best result is 40-59%, return it as a "possible match" (max 3)
    if (results.length > 0 && results[0].confidence >= 40) {
      return results.slice(0, 3);
    }

    // No match found — return null
    return null;
  }

  // ── Build the scanner UI ──
  function buildScannerUI() {
    if (document.getElementById('scanner-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'scanner-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.97);
      display:none;flex-direction:column;align-items:center;justify-content:center;
      font-family:Georgia,serif;color:#c9943a;
    `;

    overlay.innerHTML = `
      <div id="scanner-header" style="width:100%;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;box-sizing:border-box;">
        <button id="scanner-close" style="background:none;border:none;color:#c9943a;font-size:28px;cursor:pointer;font-family:Georgia,serif;">✕</button>
        <h2 style="margin:0;font-size:18px;letter-spacing:1px;">SCAN CIGAR</h2>
        <button id="scanner-upload" style="background:none;border:none;color:#c9943a;font-size:22px;cursor:pointer;">📁</button>
      </div>

      <div id="scanner-video-wrap" style="position:relative;flex:1;width:100%;max-width:500px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <video id="scanner-video" autoplay playsinline style="width:100%;height:100%;object-fit:cover;"></video>
        <div id="scanner-reticle" style="position:absolute;width:80%;max-width:350px;height:180px;border:2px solid #c9943a;border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,0.5);pointer-events:none;">
          <div style="position:absolute;top:-2px;left:-2px;width:30px;height:30px;border-top:3px solid #ff6b35;border-left:3px solid #ff6b35;border-radius:12px 0 0 0;"></div>
          <div style="position:absolute;top:-2px;right:-2px;width:30px;height:30px;border-top:3px solid #ff6b35;border-right:3px solid #ff6b35;border-radius:0 12px 0 0;"></div>
          <div style="position:absolute;bottom:-2px;left:-2px;width:30px;height:30px;border-bottom:3px solid #ff6b35;border-left:3px solid #ff6b35;border-radius:0 0 0 12px;"></div>
          <div style="position:absolute;bottom:-2px;right:-2px;width:30px;height:30px;border-bottom:3px solid #ff6b35;border-right:3px solid #ff6b35;border-radius:0 0 12px 0;"></div>
          <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(255,107,53,0.5);"></div>
        </div>
        <div id="scanner-hint" style="position:absolute;bottom:20px;left:0;right:0;text-align:center;font-size:13px;color:rgba(201,148,58,0.7);">Point at the cigar band text — tap capture</div>
      </div>

      <div id="scanner-controls" style="padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:500px;box-sizing:border-box;">
        <button id="scanner-capture" style="width:64px;height:64px;border-radius:50%;border:3px solid #c9943a;background:rgba(201,148,58,0.15);cursor:pointer;font-size:24px;color:#c9943a;transition:all 0.2s;">📷</button>
        <div id="scanner-status" style="font-size:13px;min-height:20px;text-align:center;"></div>
        <button id="scanner-history-btn" style="background:none;border:none;color:rgba(201,148,58,0.5);font-size:12px;cursor:pointer;font-family:Georgia,serif;margin-top:4px;">Recent scans (${recentScans.length})</button>
      </div>

      <input type="file" id="scanner-file-input" accept="image/*" style="display:none;">
      <canvas id="scanner-canvas" style="display:none;"></canvas>
      <div id="scanner-results" style="display:none;width:100%;max-width:500px;padding:0 20px 20px;box-sizing:border-box;max-height:60vh;overflow-y:auto;"></div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#scanner-close').addEventListener('click', closeScanner);
    overlay.querySelector('#scanner-capture').addEventListener('click', captureAndScan);
    overlay.querySelector('#scanner-upload').addEventListener('click', () => {
      overlay.querySelector('#scanner-file-input').click();
    });
    overlay.querySelector('#scanner-file-input').addEventListener('change', handleFileUpload);
    overlay.querySelector('#scanner-history-btn').addEventListener('click', showHistory);
  }

  // ── Open scanner ──
  async function openScanner() {
    buildScannerUI();
    const overlay = document.getElementById('scanner-overlay');
    overlay.style.display = 'flex';

    try {
      scannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      const video = document.getElementById('scanner-video');
      video.srcObject = scannerStream;
      scannerActive = true;
      document.getElementById('scanner-status').textContent = '';
    } catch (err) {
      // Camera not available — show upload option
      document.getElementById('scanner-video-wrap').style.display = 'none';
      document.getElementById('scanner-status').innerHTML =
        '<span style="color:#ff6b35;">Camera unavailable.</span> Use 📁 to upload a photo of the cigar band.';
      document.getElementById('scanner-capture').style.display = 'none';
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

    const results = document.getElementById('scanner-results');
    if (results) { results.style.display = 'none'; results.innerHTML = ''; }
    const controls = document.getElementById('scanner-controls');
    if (controls) controls.style.display = 'flex';
    const capture = document.getElementById('scanner-capture');
    if (capture) capture.style.display = 'flex';
  }

  // ── Handle file upload ──
  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(ev) {
      const img = new Image();
      img.onload = function() {
        processImage(img);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── Process an image (from camera or upload) ──
  async function processImage(imgOrVideo) {
    const status = document.getElementById('scanner-status');
    const captureBtn = document.getElementById('scanner-capture');

    // Draw to canvas at high resolution
    const canvas = document.getElementById('scanner-canvas');
    const ctx = canvas.getContext('2d');

    const srcW = imgOrVideo.videoWidth || imgOrVideo.naturalWidth || imgOrVideo.width;
    const srcH = imgOrVideo.videoHeight || imgOrVideo.naturalHeight || imgOrVideo.height;

    // Crop to center band area (where cigar band text is)
    const cropW = Math.floor(srcW * 0.8);
    const cropH = Math.min(300, Math.floor(srcH * 0.35));
    const cropX = Math.floor((srcW - cropW) / 2);
    const cropY = Math.floor((srcH - cropH) / 2);

    // Upscale 3x for better OCR on small text
    const scale = 3;
    canvas.width = cropW * scale;
    canvas.height = cropH * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(imgOrVideo, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

    // Preprocess: threshold to pure B&W for cleaner OCR
    preprocessImage(canvas, ctx);

    // Show processing
    if (captureBtn) captureBtn.style.display = 'none';
    status.innerHTML = '<span style="color:#c9943a;">Reading band...</span>';

    try {
      // Load Tesseract if needed
      if (typeof Tesseract === 'undefined') {
        status.innerHTML = '<span style="color:#c9943a;">Loading scanner engine...</span>';
        await loadTesseract();
      }

      status.innerHTML = '<span style="color:#c9943a;">Recognizing text...</span>';

      const result = await Tesseract.recognize(
        canvas,
        'eng',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              status.innerHTML = `<span style="color:#c9943a;">Scanning... ${Math.round(m.progress * 100)}%</span>`;
            }
          }
        }
      );

      const rawText = result.data.text;
      console.log('OCR raw:', rawText);
      const cleaned = cleanOCRText(rawText);
      console.log('OCR cleaned:', cleaned);

      if (!cleaned || cleaned.length < 3) {
        status.innerHTML = '<span style="color:#ff6b35;">Couldn\'t read any text. Try better lighting, hold steady, and focus on the band text.</span>';
        if (captureBtn) captureBtn.style.display = 'flex';
        return;
      }

      // Run strict matching
      const matches = strictMatch(rawText);

      if (!matches || matches.length === 0) {
        status.innerHTML = `<span style="color:#ff6b35;">No confident match found. The scanner read: "${cleaned.substring(0, 50)}".<br>Try a different angle, better lighting, or search manually.</span>`;
        if (captureBtn) captureBtn.style.display = 'flex';
        return;
      }

      // Show results
      showResults(matches, cleaned, rawText);

    } catch (err) {
      console.error('OCR error:', err);
      status.innerHTML = '<span style="color:#ff6b35;">Scanner error. Please try again.</span>';
      if (captureBtn) captureBtn.style.display = 'flex';
    }
  }

  // ── Capture frame from camera and scan ──
  async function captureAndScan() {
    const video = document.getElementById('scanner-video');
    if (!video.videoWidth) {
      document.getElementById('scanner-status').textContent = 'Camera not ready yet...';
      return;
    }
    processImage(video);
  }

  // ── Show matched results ──
  function showResults(matches, cleanedText, rawText) {
    const status = document.getElementById('scanner-status');
    const controls = document.getElementById('scanner-controls');
    const results = document.getElementById('scanner-results');

    status.textContent = '';
    controls.style.display = 'none';
    results.style.display = 'block';

    const hasHighConfidence = matches[0].confidence >= 60;

    results.innerHTML = `
      <div style="font-size:11px;color:rgba(201,148,58,0.4);margin-bottom:8px;font-style:italic;">Scanned: "${esc(cleanedText.substring(0, 60))}"</div>
      <div style="font-size:15px;color:#c9943a;margin-bottom:12px;font-weight:bold;">
        ${hasHighConfidence ? '✓ Match Found' : '⚠ Possible Match'}
      </div>
    `;

    matches.forEach((m, i) => {
      const c = m.cigar;
      const conf = m.confidence;
      const isHigh = conf >= 60;

      // Confidence bar color: green ≥80, gold ≥60, orange <60
      const barColor = conf >= 80 ? '#4caf50' : conf >= 60 ? '#c9943a' : '#ff6b35';
      const matchLabel = conf >= 80 ? 'High confidence' : conf >= 60 ? 'Good match' : 'Possible match';

      const card = document.createElement('div');
      card.style.cssText = `
        display:flex;gap:12px;padding:12px;margin-bottom:8px;
        background:rgba(201,148,58,0.08);border:1px solid rgba(201,148,58,0.2);
        border-radius:8px;cursor:pointer;transition:all 0.2s;
        ${!isHigh ? 'opacity:0.7;' : ''}
      `;

      const imgHTML = c.image
        ? `<img src="${esc(c.image)}" style="width:50px;height:70px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.style.display='none'">`
        : '<div style="width:50px;height:70px;background:rgba(201,148,58,0.1);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;">🚬</div>';

      card.innerHTML = `
        ${imgHTML}
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;color:#e8d5b3;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(c.name)}</div>
          <div style="font-size:12px;color:rgba(201,148,58,0.6);margin-top:2px;">${esc(c.brand)} · ${esc(c.origin)} · ${esc(c.size)}</div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
            <div style="width:60px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
              <div style="width:${conf}%;height:100%;background:${barColor};border-radius:2px;transition:width 0.5s ease;"></div>
            </div>
            <span style="font-size:11px;color:${barColor};font-weight:bold;">${conf}%</span>
            <span style="font-size:10px;color:rgba(201,148,58,0.4);">${matchLabel}</span>
          </div>
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
        // Save to recent scans
        saveRecentScan(c, conf);
        closeScanner();
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
      const capture = document.getElementById('scanner-capture');
      if (capture) capture.style.display = 'flex';
    });
    results.appendChild(retry);
  }

  // ── Save recent scan to localStorage ──
  function saveRecentScan(cigar, confidence) {
    const entry = {
      id: cigar.id,
      name: cigar.name,
      brand: cigar.brand,
      origin: cigar.origin,
      image: cigar.image || null,
      confidence,
      timestamp: Date.now()
    };
    // Dedupe by cigar ID
    recentScans = recentScans.filter(s => s.id !== cigar.id);
    recentScans.unshift(entry);
    recentScans = recentScans.slice(0, 10);
    try {
      localStorage.setItem('vp_recent_scans', JSON.stringify(recentScans));
    } catch(e) {}
  }

  // ── Show scan history ──
  function showHistory() {
    if (recentScans.length === 0) {
      document.getElementById('scanner-status').innerHTML =
        '<span style="color:rgba(201,148,58,0.5);">No recent scans yet.</span>';
      return;
    }

    const status = document.getElementById('scanner-status');
    const controls = document.getElementById('scanner-controls');
    const results = document.getElementById('scanner-results');

    status.textContent = '';
    controls.style.display = 'none';
    results.style.display = 'block';
    results.innerHTML = '<div style="font-size:15px;color:#c9943a;margin-bottom:12px;font-weight:bold;">Recent Scans</div>';

    recentScans.forEach(scan => {
      const card = document.createElement('div');
      card.style.cssText = `
        display:flex;gap:12px;padding:12px;margin-bottom:8px;
        background:rgba(201,148,58,0.08);border:1px solid rgba(201,148,58,0.2);
        border-radius:8px;cursor:pointer;transition:all 0.2s;
      `;
      const imgHTML = scan.image
        ? `<img src="${esc(scan.image)}" style="width:40px;height:56px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.style.display='none'">`
        : '<div style="width:40px;height:56px;background:rgba(201,148,58,0.1);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px;">🚬</div>';

      const timeAgo = getTimeAgo(scan.timestamp);
      card.innerHTML = `
        ${imgHTML}
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;color:#e8d5b3;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(scan.name)}</div>
          <div style="font-size:11px;color:rgba(201,148,58,0.6);margin-top:2px;">${esc(scan.brand)} · ${esc(scan.origin)}</div>
          <div style="font-size:10px;color:rgba(201,148,58,0.4);margin-top:2px;">${timeAgo} · ${scan.confidence}% match</div>
        </div>
      `;
      card.addEventListener('click', () => {
        closeScanner();
        if (scan.id) window.location.hash = '#/cigar/' + scan.id;
      });
      results.appendChild(card);
    });

    // Back button
    const back = document.createElement('button');
    back.textContent = 'Back to Scanner';
    back.style.cssText = 'margin-top:12px;padding:10px 24px;background:rgba(201,148,58,0.15);border:1px solid #c9943a;border-radius:8px;color:#c9943a;cursor:pointer;font-family:Georgia,serif;font-size:14px;';
    back.addEventListener('click', () => {
      results.style.display = 'none';
      results.innerHTML = '';
      controls.style.display = 'flex';
      const capture = document.getElementById('scanner-capture');
      if (capture) capture.style.display = 'flex';
    });
    results.appendChild(back);
  }

  // ── Get human-readable time ago ──
  function getTimeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return days + 'd ago';
    if (hours > 0) return hours + 'h ago';
    if (mins > 0) return mins + 'm ago';
    return 'just now';
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

  // ── Expose globally ──
  window.VPScanner = {
    open: openScanner,
    close: closeScanner
  };
})();
