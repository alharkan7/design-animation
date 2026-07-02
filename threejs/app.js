/* ================================================================
   THREE.JS PLAYER — Application Logic
   ================================================================ */

const SEQUENCES_DIR = '/threejs/animations/';

// ---- State ----
const state = {
  sequences: [],
  currentSequence: null,
  isPlaying: false,
  aspectRatio: '16:9',
  fps: 30,
  startTime: 0,
  elapsedTime: 0,
  timerInterval: null,
  duration: 0, // In three.js, duration might be infinite, but we can default to 0
  isRecording: false,
  mediaRecorder: null,
  recordedChunks: []
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
  dom.recordBtn         = document.getElementById('record-btn');

  dom.scrubberWrap      = document.getElementById('scrubber-wrap');
  dom.scrubberFill      = document.getElementById('scrubber-fill');
  dom.scrubberHead      = document.getElementById('scrubber-head');
  dom.timeDisplay       = document.getElementById('time-display');
  dom.fpsDisplay        = document.getElementById('fps-display');
  dom.fullscreenBtn     = document.getElementById('fullscreen-btn');
  dom.viewport          = document.querySelector('.mg-viewport');

  // Aspect ratio buttons
  dom.ratioButtons = document.querySelectorAll('.mg-ratio-btn');
  dom.bgColorPicker = document.getElementById('bg-color-picker');
  dom.bgPresetSelect = document.getElementById('bg-preset-select');
}

// ---- Sequence Discovery ----
async function discoverSequences() {
  try {
    const resp = await fetch(SEQUENCES_DIR + 'manifest.json');
    if (!resp.ok) throw new Error('Cannot load manifest');

    const manifest = await resp.json();
    state.sequences = manifest.map(entry => ({
      folder: entry.folder,
      name: entry.name,
      url: SEQUENCES_DIR + entry.folder + '/index.html',
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
  dom.sequenceSelect.innerHTML = '<option value="">— Select a 3D animation —</option>';
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
    stopPlayback();
    return;
  }

  state.currentSequence = url;
  dom.emptyState.style.display = 'none';
  dom.viewportFrame.style.display = 'block';

  // Set iframe source
  dom.viewportIframe.src = url;

  // Once loaded, hook keyboard forwarding from the iframe
  dom.viewportIframe.onload = () => {
    hookIframeKeyboard();
    applyBackground();
    calculateDuration(); // Usually 0 or infinity for ThreeJS unless defined
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

    // Pause Web Animations API (element.animate)
    if (typeof iframeDoc.getAnimations === 'function') {
      iframeDoc.getAnimations().forEach(anim => anim.pause());
    }
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

    // Resume Web Animations API (element.animate)
    if (typeof iframeDoc.getAnimations === 'function') {
      iframeDoc.getAnimations().forEach(anim => anim.play());
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
    applyBackground();
    calculateDuration();
  };

  state.isPlaying = true;
  state.startTime = performance.now();
  updatePlayButton();
  startTimer();
}

function handleStop() {
  if (!state.currentSequence) return;

  state.isPlaying = false;
  state.elapsedTime = 0;
  updatePlayButton();
  updateTimeDisplay();
  updateScrubber(0);
  stopTimer();
  stopRecording();

  // Reload iframe then freeze immediately on load
  dom.viewportIframe.src = state.currentSequence;
  dom.viewportIframe.onload = () => {
    hookIframeKeyboard();
    applyBackground();
    calculateDuration();
    // Small delay so the first frame renders, then freeze
    setTimeout(() => pauseIframeAnimations(), 50);
  };
}

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
  stopRecording();
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

// ---- Export / Recording ----
function toggleRecording() {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  if (!state.currentSequence || state.isRecording) return;
  
  state.isRecording = true;
  state.recordedChunks = [];
  dom.recordBtn.style.animation = "mg-blink 1s infinite alternate";
  
  if (!document.getElementById('mg-blink-style')) {
    const style = document.createElement('style');
    style.id = 'mg-blink-style';
    style.textContent = `@keyframes mg-blink { from { opacity: 1; } to { opacity: 0.3; } }`;
    document.head.appendChild(style);
  }
  
  // Rewind logic with a callback hook to capture the fresh canvas
  state.elapsedTime = 0;
  updateTimeDisplay();
  updateScrubber(0);
  
  dom.viewportIframe.src = state.currentSequence;
  dom.viewportIframe.onload = () => {
    hookIframeKeyboard();
    applyBackground();
    calculateDuration();
    
    // Slight delay to ensure canvas is mounted by the threejs script
    setTimeout(() => {
      const canvas = dom.viewportIframe.contentDocument?.querySelector('canvas');
      if (!canvas) {
        alert("Could not find a 3D canvas to record.");
        state.isRecording = false;
        dom.recordBtn.style.animation = "none";
        return;
      }
      
      // Create composite canvas to capture both background and 3D scene
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = canvas.width || 1920;
      compositeCanvas.height = canvas.height || 1080;
      
      const preset = dom.bgPresetSelect.value;
      const color = dom.bgColorPicker.value;
      const ctx = compositeCanvas.getContext('2d', { alpha: preset === 'transparent' });
      
      let isRecordingFrame = true;
      function renderComposite() {
          if (!isRecordingFrame) return;
          
          ctx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
          
          if (preset === 'solid') {
              ctx.fillStyle = color;
              ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
          } else if (preset === 'grid') {
              ctx.fillStyle = '#164282';
              ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
              
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
              ctx.lineWidth = 1;
              const pan = (performance.now() / 1000 * 10) % 40;
              
              ctx.beginPath();
              for(let x = pan; x < compositeCanvas.width; x += 40) {
                  ctx.moveTo(x, 0); ctx.lineTo(x, compositeCanvas.height);
              }
              for(let y = pan; y < compositeCanvas.height; y += 40) {
                  ctx.moveTo(0, y); ctx.lineTo(compositeCanvas.width, y);
              }
              ctx.stroke();
          } else if (preset === 'dots') {
              ctx.fillStyle = '#2a2a2a';
              ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
              
              ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
              const pan = (performance.now() / 1000 * 5) % 30;
              for(let x = pan; x < compositeCanvas.width; x += 30) {
                  for(let y = pan; y < compositeCanvas.height; y += 30) {
                      ctx.beginPath();
                      ctx.arc(x, y, 1, 0, Math.PI * 2);
                      ctx.fill();
                  }
              }
          }
          
          // Draw WebGL on top
          ctx.drawImage(canvas, 0, 0, compositeCanvas.width, compositeCanvas.height);
          
          if (state.isRecording) {
              requestAnimationFrame(renderComposite);
          }
      }
      renderComposite();
      
      const stream = compositeCanvas.captureStream(60);
      const mimeTypes = ['video/webm; codecs=vp9', 'video/webm; codecs=vp8', 'video/webm'];
      let selectedType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
      
      try {
        state.mediaRecorder = new MediaRecorder(stream, { mimeType: selectedType, videoBitsPerSecond: 25000000 });
      } catch (e) {
        state.mediaRecorder = new MediaRecorder(stream);
      }
      
      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) state.recordedChunks.push(e.data);
      };
      
      state.mediaRecorder.onstop = () => {
        isRecordingFrame = false;
        const blob = new Blob(state.recordedChunks, { type: state.mediaRecorder.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `3d-export-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
        
        state.recordedChunks = [];
        state.isRecording = false;
        dom.recordBtn.style.animation = "none";
      };
      
      state.mediaRecorder.start(100);
    }, 150);
  };
  
  state.isPlaying = true;
  state.startTime = performance.now();
  updatePlayButton();
  startTimer();
}

function stopRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
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

const BG_PRESET_CSS = `
#mg-bg-container { position: fixed; inset: 0; z-index: -9999; pointer-events: none; background: #ffffff; overflow: hidden; }

@keyframes gridPan { 0% { background-position: 0px 0px; } 100% { background-position: 40px 40px; } }
.bg-preset-grid { background-color: #164282 !important; background-image: linear-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.3) 1px, transparent 1px) !important; background-size: 40px 40px !important; animation: gridPan 4s linear infinite !important; }
@keyframes dotsPan { 0% { background-position: 0px 0px; } 100% { background-position: 30px 30px; } }
.bg-preset-dots { background-color: #2a2a2a !important; background-image: radial-gradient(rgba(255, 255, 255, 0.2) 2px, transparent 2px) !important; background-size: 30px 30px !important; animation: dotsPan 6s linear infinite !important; }
.bg-preset-transparent { background-color: #f0f0f0 !important; background-image: linear-gradient(45deg, #cccccc 25%, transparent 25%, transparent 75%, #cccccc 75%, #cccccc), linear-gradient(45deg, #cccccc 25%, transparent 25%, transparent 75%, #cccccc 75%, #cccccc) !important; background-size: 20px 20px !important; background-position: 0 0, 10px 10px !important; }
`;

function applyBackground() {
  if (!dom.viewportIframe) return;
  try {
    const iframeDoc = dom.viewportIframe.contentDocument;
    if (iframeDoc && iframeDoc.body) {
      // Inject CSS
      let styleTag = iframeDoc.getElementById('mg-bg-presets');
      if (!styleTag) {
        styleTag = iframeDoc.createElement('style');
        styleTag.id = 'mg-bg-presets';
        styleTag.textContent = BG_PRESET_CSS;
        iframeDoc.head.appendChild(styleTag);
      }
      
      // Inject complex background container
      let bgContainer = iframeDoc.getElementById('mg-bg-container');
      if (!bgContainer) {
        bgContainer = iframeDoc.createElement('div');
        bgContainer.id = 'mg-bg-container';
        iframeDoc.body.prepend(bgContainer);
      }

      const preset = dom.bgPresetSelect.value;
      const color = dom.bgColorPicker.value;

      iframeDoc.body.className = '';
      iframeDoc.body.style.backgroundColor = 'transparent';
      iframeDoc.body.style.backgroundImage = 'none';
      iframeDoc.body.style.animation = 'none';
      
      bgContainer.innerHTML = '';
      bgContainer.style.display = 'none';

      if (preset === 'solid') {
        iframeDoc.body.style.backgroundColor = color;
      } else {
        iframeDoc.body.classList.add(`bg-preset-${preset}`);
      }
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

// ---- Keyboard Shortcuts ----

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
    case 'f':
    case 'F':
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleFullscreen();
      }
      break;
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeydown);
}

function hookIframeKeyboard() {
  try {
    const iframeWin = dom.viewportIframe.contentWindow;
    iframeWin.removeEventListener('keydown', handleKeydown);
    iframeWin.addEventListener('keydown', handleKeydown);
  } catch (e) {
    // Cross-origin or not yet loaded
  }
}

// ---- Fullscreen ----
function toggleFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (dom.viewport.requestFullscreen) {
      dom.viewport.requestFullscreen();
    } else if (dom.viewport.webkitRequestFullscreen) {
      dom.viewport.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

['fullscreenchange', 'webkitfullscreenchange'].forEach(evt => {
  document.addEventListener(evt, () => {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    if (isFullscreen) {
      dom.fullscreenBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`;
      dom.fullscreenBtn.setAttribute('data-tooltip', 'Exit Full Screen');
    } else {
      dom.fullscreenBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
      dom.fullscreenBtn.setAttribute('data-tooltip', 'Full Screen');
    }
    if (state.currentSequence) {
      setTimeout(applyAspectRatio, 50);
    }
  });
});

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
  dom.sequenceSelect.addEventListener('change', (e) => {
    loadSequence(e.target.value);
  });

  dom.playBtn.addEventListener('click', togglePlayPause);
  dom.stopBtn.addEventListener('click', handleStop);
  dom.rewindBtn.addEventListener('click', rewindPlayback);
  dom.skipForwardBtn.addEventListener('click', skipForward);
  
  if (dom.recordBtn) {
    dom.recordBtn.addEventListener('click', toggleRecording);
  }

  dom.ratioButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setAspectRatio(btn.dataset.ratio);
    });
  });

  dom.bgPresetSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'solid') {
      dom.bgColorPicker.style.visibility = 'visible';
    } else {
      dom.bgColorPicker.style.visibility = 'hidden';
    }
    applyBackground();
  });

  dom.bgColorPicker.addEventListener('input', applyBackground);
  dom.fullscreenBtn.addEventListener('click', toggleFullscreen);

  // Scrubber seeking
  let isDragging = false;
  
  dom.scrubberWrap.addEventListener('mousedown', (e) => {
    isDragging = true;
    handleScrub(e);
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) handleScrub(e);
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  function handleScrub(e) {
    if (!state.currentSequence || state.duration <= 0) return;
    
    const rect = dom.scrubberWrap.getBoundingClientRect();
    let x = e.clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width));
    
    const pct = x / rect.width;
    const targetMs = pct * state.duration;
    
    seekTo(targetMs);
  }
}

// ---- Init ----
function init() {
  cacheDom();
  bindEvents();
  setupKeyboardShortcuts();
  setupResize();

  setAspectRatio('16:9');
  dom.bgColorPicker.style.visibility = 'visible';

  discoverSequences();
}

document.addEventListener('DOMContentLoaded', init);
