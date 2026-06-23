/* ================================================================
   MOGRAPH PLAYER — Application Logic
   ================================================================ */

const SEQUENCES_DIR = '/mograph/sequences/';

// ---- State ----
const state = {
  sequences: [],
  currentSequence: null,
  isPlaying: false,
  isRecording: false,
  aspectRatio: '16:9',
  quality: '1080p',
  fps: 30,
  startTime: 0,
  elapsedTime: 0,
  timerInterval: null,
  duration: 0,
};

// ---- DOM Refs ----
const dom = {};

function cacheDom() {
  dom.sequenceSelect    = document.getElementById('sequence-select');
  dom.viewportFrame     = document.getElementById('viewport-frame');
  dom.viewportIframe    = document.getElementById('viewport-iframe');
  dom.viewportInfo      = document.getElementById('viewport-info');
  dom.emptyState        = document.getElementById('empty-state');

  dom.playBtn           = document.getElementById('play-btn');
  dom.stopBtn           = document.getElementById('stop-btn');
  dom.rewindBtn         = document.getElementById('rewind-btn');
  dom.skipForwardBtn    = document.getElementById('skip-forward-btn');

  dom.scrubberWrap      = document.getElementById('scrubber-wrap');
  dom.scrubberFill      = document.getElementById('scrubber-fill');
  dom.scrubberHead      = document.getElementById('scrubber-head');
  dom.timeDisplay       = document.getElementById('time-display');
  dom.fpsDisplay        = document.getElementById('fps-display');

  dom.qualitySelect     = document.getElementById('quality-select');
  dom.fpsSelect         = document.getElementById('fps-select');
  dom.exportBtn         = document.getElementById('export-btn');
  dom.exportProgress    = document.getElementById('export-progress');
  dom.progressBarFill   = document.getElementById('progress-bar-fill');
  dom.progressText      = document.getElementById('progress-text');
  dom.recordingIndicator = document.getElementById('recording-indicator');

  // Aspect ratio buttons
  dom.ratioButtons = document.querySelectorAll('.mg-ratio-btn');
  dom.bgColorPicker = document.getElementById('bg-color-picker');
  dom.bgColorPresets = document.getElementById('bg-color-presets');
}

// ---- Sequence Discovery ----
async function discoverSequences() {
  try {
    const resp = await fetch(SEQUENCES_DIR + 'manifest.json');
    if (!resp.ok) throw new Error('Cannot load manifest');

    const manifest = await resp.json();
    state.sequences = manifest.map(entry => ({
      file: entry.file,
      name: entry.name,
      url: SEQUENCES_DIR + entry.file,
    }));

    populateSequenceSelect();
    
    // Automatically select the latest sequence
    if (state.sequences.length > 0) {
      const latestSequence = state.sequences[state.sequences.length - 1];
      dom.sequenceSelect.value = latestSequence.url;
      loadSequence(latestSequence.url);
    }
  } catch (err) {
    console.warn('Could not load sequence manifest:', err);
    state.sequences = [];
    populateSequenceSelect();
  }
}

function populateSequenceSelect() {
  dom.sequenceSelect.innerHTML = '<option value="">— Select a sequence —</option>';
  state.sequences.forEach(seq => {
    const opt = document.createElement('option');
    opt.value = seq.url;
    opt.textContent = seq.name;
    dom.sequenceSelect.appendChild(opt);
  });
}

// ---- Load Sequence ----
function loadSequence(url) {
  if (!url) {
    state.currentSequence = null;
    dom.viewportFrame.style.display = 'none';
    dom.emptyState.style.display = 'flex';
    dom.viewportInfo.style.opacity = '0';
    dom.exportBtn.disabled = true;
    stopPlayback();
    return;
  }

  state.currentSequence = url;
  dom.emptyState.style.display = 'none';
  dom.viewportFrame.style.display = 'block';
  dom.exportBtn.disabled = false;

  // Set iframe source
  dom.viewportIframe.src = url;

  // Once loaded, hook keyboard forwarding from the iframe
  dom.viewportIframe.onload = () => {
    hookIframeKeyboard();
    applyBackgroundColor();
    calculateDuration();
  };

  applyAspectRatio();
  updateViewportInfo();

  // Reset timer and start playing
  state.elapsedTime = 0;
  updateTimeDisplay();
  state.isPlaying = true;
  state.startTime = performance.now();
  updatePlayButton();
  startTimer();
}

// ---- Playback Controls ----
function togglePlayPause() {
  if (!state.currentSequence) return;

  if (state.isPlaying) {
    pausePlayback();
  } else {
    resumePlayback();
  }
}

/**
 * Inject a style into the iframe to freeze all CSS animations and
 * also pause any requestAnimationFrame-driven JS animations by
 * overwriting rAF on the iframe's window.
 */
function pauseIframeAnimations() {
  try {
    const iframeWin = dom.viewportIframe.contentWindow;
    const iframeDoc = iframeWin.document;

    // Freeze CSS animations & transitions
    let pauseStyle = iframeDoc.getElementById('mg-pause-style');
    if (!pauseStyle) {
      pauseStyle = iframeDoc.createElement('style');
      pauseStyle.id = 'mg-pause-style';
      iframeDoc.head.appendChild(pauseStyle);
    }
    pauseStyle.textContent = `
      *, *::before, *::after {
        animation-play-state: paused !important;
        transition: none !important;
      }
    `;

    // Pause JS-driven canvas animations by replacing rAF
    if (!iframeWin.__mg_origRAF) {
      iframeWin.__mg_origRAF = iframeWin.requestAnimationFrame.bind(iframeWin);
      iframeWin.__mg_rafQueue = [];
    }
    iframeWin.requestAnimationFrame = (cb) => {
      const id = iframeWin.__mg_rafQueue.length;
      iframeWin.__mg_rafQueue.push(cb);
      return id;
    };
  } catch (e) {
    console.warn('Could not pause iframe animations:', e);
  }
}

function resumeIframeAnimations() {
  try {
    const iframeWin = dom.viewportIframe.contentWindow;
    const iframeDoc = iframeWin.document;

    // Un-freeze CSS
    const pauseStyle = iframeDoc.getElementById('mg-pause-style');
    if (pauseStyle) pauseStyle.remove();

    // Restore rAF and flush queued callbacks
    if (iframeWin.__mg_origRAF) {
      const origRAF = iframeWin.__mg_origRAF;
      const queued = iframeWin.__mg_rafQueue || [];
      iframeWin.requestAnimationFrame = origRAF;
      delete iframeWin.__mg_origRAF;
      delete iframeWin.__mg_rafQueue;
      // Re-schedule any queued callbacks so the animation loop resumes
      queued.forEach(cb => origRAF(cb));
    }
  } catch (e) {
    console.warn('Could not resume iframe animations:', e);
  }
}

function pausePlayback() {
  state.isPlaying = false;
  updatePlayButton();
  stopTimer();
  pauseIframeAnimations();
}

function resumePlayback() {
  state.isPlaying = true;
  state.startTime = performance.now() - state.elapsedTime;
  updatePlayButton();
  startTimer();
  resumeIframeAnimations();
}

function rewindPlayback() {
  if (!state.currentSequence) return;
  state.elapsedTime = 0;
  updateTimeDisplay();
  updateScrubber(0);

  // Reload the iframe to restart all animations from scratch
  dom.viewportIframe.src = state.currentSequence;
  dom.viewportIframe.onload = () => {
    hookIframeKeyboard();
    applyBackgroundColor();
    calculateDuration();
  };

  state.isPlaying = true;
  state.startTime = performance.now();
  updatePlayButton();
  startTimer();
}

/**
 * Stop = pause + reset to frame 0.
 * Reloads the iframe to get a fresh animation state, then immediately
 * freezes it so the user sees the first frame.
 */
function handleStop() {
  if (!state.currentSequence) return;

  state.isPlaying = false;
  state.elapsedTime = 0;
  updatePlayButton();
  updateTimeDisplay();
  updateScrubber(0);
  stopTimer();

  // Reload iframe then freeze immediately on load
  dom.viewportIframe.src = state.currentSequence;
  dom.viewportIframe.onload = () => {
    hookIframeKeyboard();
    applyBackgroundColor();
    calculateDuration();
    // Small delay so the first frame renders, then freeze
    setTimeout(() => pauseIframeAnimations(), 50);
  };
}

/**
 * Skip forward 5 seconds — advances CSS animations using the
 * Web Animations API and bumps the elapsed timer.
 */
function skipForward() {
  if (!state.currentSequence) return;
  const skipMs = 5000;
  seekTo(Math.min(state.elapsedTime + skipMs, state.duration || state.elapsedTime + skipMs));
}

function seekTo(targetMs) {
  if (!state.currentSequence) return;
  state.elapsedTime = targetMs;
  state.startTime = performance.now() - state.elapsedTime;
  updateTimeDisplay();
  
  if (state.duration > 0) {
    updateScrubber((state.elapsedTime / state.duration) * 100);
  }
  
  try {
    const iframeDoc = dom.viewportIframe.contentDocument || dom.viewportIframe.contentWindow.document;
    if (!iframeDoc) return;
    const animations = iframeDoc.getAnimations();
    animations.forEach(anim => {
      if (anim.currentTime != null) {
        anim.currentTime = targetMs;
      }
    });
  } catch (e) {}
}



function stopPlayback() {
  state.isPlaying = false;
  state.elapsedTime = 0;
  updatePlayButton();
  updateTimeDisplay();
  updateScrubber(0);
  stopTimer();
}

function updatePlayButton() {
  const icon = state.isPlaying
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>`;
  dom.playBtn.innerHTML = icon;
}

// ---- Timer ----
function startTimer() {
  stopTimer();
  state.timerInterval = setInterval(() => {
    if (state.isPlaying) {
      state.elapsedTime = performance.now() - state.startTime;
      
      // Auto-loop
      if (state.duration > 0 && state.elapsedTime >= state.duration) {
        seekTo(0);
      }
      
      updateTimeDisplay();
      if (state.duration > 0) {
        updateScrubber((state.elapsedTime / state.duration) * 100);
      }
    }
  }, 100);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateTimeDisplay() {
  const totalMs = Math.floor(state.elapsedTime);
  const totalSec = Math.floor(totalMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const ms = Math.floor((totalMs % 1000) / 10);

  const current = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;

  dom.timeDisplay.innerHTML = `<span class="current">${current}</span>`;
}

function updateScrubber(pct) {
  dom.scrubberFill.style.width = `${pct}%`;
  dom.scrubberHead.style.left = `${pct}%`;
}

// ---- Aspect Ratio ----
function setAspectRatio(ratio) {
  state.aspectRatio = ratio;

  dom.ratioButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratio === ratio);
  });

  applyAspectRatio();
}

function applyAspectRatio() {
  const viewport = document.querySelector('.mg-viewport');
  const vpRect = viewport.getBoundingClientRect();
  const padding = 48;
  const maxW = vpRect.width - padding;
  const maxH = vpRect.height - padding;

  let w, h;
  const [rw, rh] = state.aspectRatio.split(':').map(Number);
  const ratio = rw / rh;

  // Fit within viewport bounds
  if (maxW / maxH > ratio) {
    h = maxH;
    w = h * ratio;
  } else {
    w = maxW;
    h = w / ratio;
  }

  dom.viewportFrame.style.width = `${Math.round(w)}px`;
  dom.viewportFrame.style.height = `${Math.round(h)}px`;

  updateViewportInfo();
}

function updateViewportInfo() {
  if (!dom.viewportFrame || dom.viewportFrame.style.display === 'none') return;
  const w = parseInt(dom.viewportFrame.style.width) || 0;
  const h = parseInt(dom.viewportFrame.style.height) || 0;
  dom.viewportInfo.textContent = `${state.aspectRatio}  •  ${w}×${h}`;
}

function applyBackgroundColor() {
  if (!dom.viewportIframe) return;
  try {
    const iframeDoc = dom.viewportIframe.contentDocument;
    if (iframeDoc && iframeDoc.body) {
      const color = dom.bgColorPicker ? dom.bgColorPicker.value : '#ffffff';
      iframeDoc.body.style.backgroundColor = color;
      iframeDoc.body.style.backgroundImage = 'none';
    }
  } catch(e) {}
}

function calculateDuration() {
  state.duration = 0;
  try {
    const iframeDoc = dom.viewportIframe.contentDocument;
    if (!iframeDoc) return;
    const animations = iframeDoc.getAnimations();
    let maxEnd = 0;
    animations.forEach(anim => {
      const effect = anim.effect;
      if (effect) {
        const timing = effect.getTiming();
        const delay = timing.delay || 0;
        const duration = timing.duration === 'auto' ? 0 : timing.duration;
        const iterations = timing.iterations || 1;
        if (iterations === Infinity) return;
        const end = delay + (duration * iterations);
        if (end > maxEnd) maxEnd = end;
      }
    });
    if (maxEnd > 0) {
      state.duration = maxEnd + 500; // Add 500ms buffer at the end
    }
  } catch (e) {}
}

// ---- Video Export (Server-side via Puppeteer) ----
async function exportVideo() {
  if (!state.currentSequence || state.isRecording) return;

  state.isRecording = true;
  dom.exportBtn.disabled = true;
  dom.exportProgress.classList.add('active');
  dom.recordingIndicator.classList.add('active');

  const quality = dom.qualitySelect.value;

  // Determine export dimensions from aspect ratio + quality
  const [rw, rh] = state.aspectRatio.split(':').map(Number);
  const ratio = rw / rh;
  let exportH;
  switch (quality) {
    case '720p':  exportH = 720;  break;
    case '4k':    exportH = 2160; break;
    case '1080p':
    default:      exportH = 1080; break;
  }
  let exportW = Math.round(exportH * ratio);
  // Ensure even dimensions
  exportW = exportW % 2 === 0 ? exportW : exportW + 1;
  exportH = exportH % 2 === 0 ? exportH : exportH + 1;

  try {
    updateExportProgress(5, 'Fetching sequence HTML...');

    // 1. Fetch the raw HTML content of the sequence file
    const htmlResp = await fetch(state.currentSequence);
    if (!htmlResp.ok) throw new Error('Could not fetch sequence HTML');
    const html = await htmlResp.text();

    updateExportProgress(15, `Rendering ${exportW}×${exportH} video on server...`);

    // 2. POST to the server-side Puppeteer export endpoint
    const exportResp = await fetch('/api/export-motion-graphics-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        width: exportW,
        height: exportH,
      }),
    });

    if (!exportResp.ok) {
      const errJson = await exportResp.json().catch(() => ({}));
      throw new Error(errJson.error || `Server error: ${exportResp.status}`);
    }

    updateExportProgress(85, 'Downloading video...');

    // 3. Download the returned WebM blob
    const videoBlob = await exportResp.blob();
    const downloadUrl = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const seqName = state.currentSequence.split('/').pop().replace('.html', '');
    a.download = `mograph-${seqName}-${quality}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

    updateExportProgress(100, 'Complete!');

    setTimeout(() => {
      dom.exportProgress.classList.remove('active');
      dom.exportBtn.disabled = false;
      dom.recordingIndicator.classList.remove('active');
      state.isRecording = false;
    }, 2000);

  } catch (err) {
    console.error('Export failed:', err);
    updateExportProgress(0, `Error: ${err.message}`);
    setTimeout(() => {
      dom.exportProgress.classList.remove('active');
      dom.exportBtn.disabled = false;
      dom.recordingIndicator.classList.remove('active');
      state.isRecording = false;
    }, 3000);
  }
}

function updateExportProgress(pct, text) {
  dom.progressBarFill.style.width = `${pct}%`;
  dom.progressText.textContent = text;
}

// ---- Keyboard Shortcuts ----

/**
 * Central keyboard handler — shared between the parent document
 * and the iframe's contentWindow so hotkeys work regardless of
 * which element has focus.
 */
function handleKeydown(e) {
  // Don't override form interactions
  const tag = e.target.tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePlayPause();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      rewindPlayback();
      break;
    case 'ArrowRight':
      e.preventDefault();
      skipForward();
      break;
    case 'r':
    case 'R':
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        rewindPlayback();
      }
      break;
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeydown);
}

/**
 * Attach a keydown listener inside the iframe's contentWindow so
 * that hotkeys still work even when the iframe has focus.
 */
function hookIframeKeyboard() {
  try {
    const iframeWin = dom.viewportIframe.contentWindow;
    // Remove previous listener if any (in case of iframe reload)
    iframeWin.removeEventListener('keydown', handleKeydown);
    iframeWin.addEventListener('keydown', handleKeydown);
  } catch (e) {
    // Cross-origin or not yet loaded — silently ignore
  }
}

// ---- Window Resize ----
function setupResize() {
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (state.currentSequence) {
        applyAspectRatio();
      }
    }, 100);
  });
}

// ---- Event Binding ----
function bindEvents() {
  // Sequence select
  dom.sequenceSelect.addEventListener('change', (e) => {
    loadSequence(e.target.value);
  });

  // Transport controls
  dom.playBtn.addEventListener('click', togglePlayPause);
  dom.stopBtn.addEventListener('click', handleStop);
  dom.rewindBtn.addEventListener('click', rewindPlayback);
  dom.skipForwardBtn.addEventListener('click', skipForward);

  // Aspect ratio
  dom.ratioButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setAspectRatio(btn.dataset.ratio);
    });
  });

  // Background Color
  if (dom.bgColorPresets && dom.bgColorPicker) {
    dom.bgColorPresets.addEventListener('change', (e) => {
      if (e.target.value !== 'custom') {
        dom.bgColorPicker.value = e.target.value;
        applyBackgroundColor();
      }
    });

    dom.bgColorPicker.addEventListener('input', () => {
      dom.bgColorPresets.value = 'custom';
      applyBackgroundColor();
    });
  }

  // Export
  dom.exportBtn.addEventListener('click', exportVideo);

  // Scrubber interactive dragging
  let isScrubbing = false;
  
  function handleScrub(e) {
    const rect = dom.scrubberWrap.getBoundingClientRect();
    let pct = ((e.clientX - rect.left) / rect.width) * 100;
    pct = Math.min(100, Math.max(0, pct));
    updateScrubber(pct);
    if (state.duration > 0) {
      seekTo((pct / 100) * state.duration);
    }
  }

  dom.scrubberWrap.addEventListener('mousedown', (e) => {
    isScrubbing = true;
    handleScrub(e);
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isScrubbing) {
      e.preventDefault();
      handleScrub(e);
    }
  });
  
  document.addEventListener('mouseup', () => {
    isScrubbing = false;
  });
}

// ---- FPS Counter ----
function setupFPSCounter() {
  let frameCount = 0;
  let lastTime = performance.now();

  function countFrame() {
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
      dom.fpsDisplay.textContent = `${frameCount} fps`;
      frameCount = 0;
      lastTime = now;
    }
    requestAnimationFrame(countFrame);
  }

  requestAnimationFrame(countFrame);
}

// ---- Init ----
function init() {
  cacheDom();
  bindEvents();
  setupKeyboardShortcuts();
  setupResize();
  setupFPSCounter();
  discoverSequences();
  updateTimeDisplay();
  updatePlayButton();

  // Set initial active ratio button
  dom.ratioButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratio === state.aspectRatio);
  });
}

document.addEventListener('DOMContentLoaded', init);
