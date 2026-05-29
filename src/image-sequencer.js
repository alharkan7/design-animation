import './style.css';
import { VideoRecorder } from './recorder.js';

// Initialize Lucide icons
if (typeof lucide !== 'undefined') {
  lucide.createIcons();
}

// State
const state = {
  images: [], // Array of { id, file, url, element }
  isPlaying: false,
  isPaused: false,
  isRecording: false,
  currentIndex: 0,
  transitionProgress: 0, // 0 to 1
  transitionDirection: 1, // 1 for forward, -1 for backward
  lastFrameTime: 0,
  settings: {
    transition: 'fade', // fade, slide-left, slide-right, slide-up, slide-down, zoom-in, zoom-out, cut
    duration: 1000, // ms per image
    easing: 'easeInOut', // linear, easeIn, easeOut, easeInOut, easeInQuick, custom
    aspectRatio: '16:9', // 16:9, 9:16, 1:1, 4:3, original
    backgroundColor: '#0f172a',
    // Custom easing parameters
    customEasing: {
      startSpeed: 0,    // 0-1, initial velocity
      endSpeed: 0,      // 0-1, final velocity
      threshold: 0.5    // 0.1-0.9, portion for accel phase
    }
  },
  canvasSize: { width: 1920, height: 1080 },
  animationId: null
};

// Easing functions
const easingFunctions = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => t * (2 - t),
  easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  // Quick acceleration at start, then linear (threshold at 25%)
  easeInQuick: t => {
    const threshold = 0.25;
    if (t < threshold) {
      const u = t / threshold;
      return u * u * threshold;
    }
    return t;
  },
  // Custom easing with configurable start/end speeds and threshold
  custom: (t, startSpeed = 0, endSpeed = 0, threshold = 0.5) => {
    // Clamp inputs
    const s = Math.max(0, Math.min(1, startSpeed));
    const e = Math.max(0, Math.min(1, endSpeed));
    const k = Math.max(0.1, Math.min(0.9, threshold));

    if (t < k) {
      // Acceleration phase: curve from startSpeed to linear
      const u = t / k;
      // Cubic easing: h00(t)*p0 + h10(t)*m0 + h01(t)*p1 + h11(t)*m1
      // But simplified: we want to go from (0,0) with tangent s to (k,k) with tangent 1
      // Using cubic Hermite
      const h00 = 2*u*u*u - 3*u*u + 1;
      const h10 = u*u*u - 2*u*u + u;
      const h01 = -2*u*u*u + 3*u*u;
      return h00 * 0 + h10 * (s * k) + h01 * k;
    } else {
      // Deceleration phase: curve from linear to endSpeed
      const u = (t - k) / (1 - k);
      // Go from (k,k) with tangent 1 to (1,1) with tangent e
      const h00 = 2*u*u*u - 3*u*u + 1;
      const h10 = u*u*u - 2*u*u + u;
      const h01 = -2*u*u*u + 3*u*u;
      return k + h10 * ((1 - k) * 1) + h01 * (1 - k);
    }
  }
};

// Create cached custom easing function with current settings
function getCustomEasingFn(startSpeed, endSpeed, threshold) {
  return (t) => easingFunctions.custom(t, startSpeed, endSpeed, threshold);
}

// Aspect ratio presets
const aspectRatios = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  'original': null // Will be set based on first image
};

// Transition types
const transitions = [
  { value: 'cut', label: 'Cut (No Transition)' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-left', label: 'Slide Left' },
  { value: 'slide-right', label: 'Slide Right' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'slide-down', label: 'Slide Down' },
  { value: 'zoom-in', label: 'Zoom In' },
  { value: 'zoom-out', label: 'Zoom Out' }
];

const easingOptions = [
  { value: 'linear', label: 'Linear (Constant)' },
  { value: 'easeInQuick', label: 'Quick Start (Fast accel, then linear)' },
  { value: 'easeIn', label: 'Ease In (Accelerate)' },
  { value: 'easeOut', label: 'Ease Out (Decelerate)' },
  { value: 'easeInOut', label: 'Ease In-Out' },
  { value: 'custom', label: 'Custom (Configurable)' }
];

// Create unique ID
function generateId() {
  return 'img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Update canvas size based on aspect ratio
function updateCanvasSize() {
  const ratio = state.settings.aspectRatio;
  if (ratio === 'original' && state.images.length > 0) {
    const img = state.images[0];
    const tempImg = new Image();
    tempImg.src = img.url;
    if (tempImg.complete) {
      state.canvasSize = { width: tempImg.width, height: tempImg.height };
    }
  } else if (aspectRatios[ratio]) {
    state.canvasSize = { ...aspectRatios[ratio] };
  }

  // Update preview canvas
  const previewCanvas = document.getElementById('preview-canvas');
  if (previewCanvas) {
    previewCanvas.width = state.canvasSize.width;
    previewCanvas.height = state.canvasSize.height;
  }

  // Update recorder canvas size
  if (window.recorder) {
    window.recorder.canvas.width = state.canvasSize.width;
    window.recorder.canvas.height = state.canvasSize.height;
  }
}

// Calculate image dimensions to fit within canvas while maintaining aspect ratio
function calculateImageDimensions(imgWidth, imgHeight, canvasWidth, canvasHeight) {
  const imgAspect = imgWidth / imgHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let drawWidth, drawHeight, offsetX, offsetY;

  if (imgAspect > canvasAspect) {
    // Image is wider than canvas
    drawWidth = canvasWidth;
    drawHeight = canvasWidth / imgAspect;
    offsetX = 0;
    offsetY = (canvasHeight - drawHeight) / 2;
  } else {
    // Image is taller than canvas
    drawHeight = canvasHeight;
    drawWidth = canvasHeight * imgAspect;
    offsetX = (canvasWidth - drawWidth) / 2;
    offsetY = 0;
  }

  return { drawWidth, drawHeight, offsetX, offsetY };
}

// Draw image to canvas
function drawImage(canvas, ctx, img, progress = 1, nextImg = null, transition = 'fade', isForward = true) {
  const { width: canvasWidth, height: canvasHeight } = state.canvasSize;

  // Clear canvas
  ctx.fillStyle = state.settings.backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Get image dimensions
  const dims1 = calculateImageDimensions(img.element.width, img.element.height, canvasWidth, canvasHeight);

  // Draw current image
  let easingFn;
  if (state.settings.easing === 'custom') {
    easingFn = getCustomEasingFn(
      state.settings.customEasing.startSpeed,
      state.settings.customEasing.endSpeed,
      state.settings.customEasing.threshold
    );
  } else {
    easingFn = easingFunctions[state.settings.easing];
  }
  const easedProgress = easingFn(isForward ? progress : 1 - progress);

  switch (transition) {
    case 'cut':
      ctx.globalAlpha = 1;
      ctx.drawImage(img.element, dims1.offsetX, dims1.offsetY, dims1.drawWidth, dims1.drawHeight);
      break;

    case 'fade':
      // Draw current image
      ctx.globalAlpha = 1 - easedProgress;
      ctx.drawImage(img.element, dims1.offsetX, dims1.offsetY, dims1.drawWidth, dims1.drawHeight);

      // Draw next image
      if (nextImg) {
        const dims2 = calculateImageDimensions(nextImg.element.width, nextImg.element.height, canvasWidth, canvasHeight);
        ctx.globalAlpha = easedProgress;
        ctx.drawImage(nextImg.element, dims2.offsetX, dims2.offsetY, dims2.drawWidth, dims2.drawHeight);
      }
      break;

    case 'slide-left':
      ctx.globalAlpha = 1;
      ctx.drawImage(img.element, dims1.offsetX - easedProgress * canvasWidth, dims1.offsetY, dims1.drawWidth, dims1.drawHeight);
      if (nextImg) {
        const dims2 = calculateImageDimensions(nextImg.element.width, nextImg.element.height, canvasWidth, canvasHeight);
        ctx.drawImage(nextImg.element, dims2.offsetX + (1 - easedProgress) * canvasWidth, dims2.offsetY, dims2.drawWidth, dims2.drawHeight);
      }
      break;

    case 'slide-right':
      ctx.globalAlpha = 1;
      ctx.drawImage(img.element, dims1.offsetX + easedProgress * canvasWidth, dims1.offsetY, dims1.drawWidth, dims1.drawHeight);
      if (nextImg) {
        const dims2 = calculateImageDimensions(nextImg.element.width, nextImg.element.height, canvasWidth, canvasHeight);
        ctx.drawImage(nextImg.element, dims2.offsetX - (1 - easedProgress) * canvasWidth, dims2.offsetY, dims2.drawWidth, dims2.drawHeight);
      }
      break;

    case 'slide-up':
      ctx.globalAlpha = 1;
      ctx.drawImage(img.element, dims1.offsetX, dims1.offsetY - easedProgress * canvasHeight, dims1.drawWidth, dims1.drawHeight);
      if (nextImg) {
        const dims2 = calculateImageDimensions(nextImg.element.width, nextImg.element.height, canvasWidth, canvasHeight);
        ctx.drawImage(nextImg.element, dims2.offsetX, dims2.offsetY + (1 - easedProgress) * canvasHeight, dims2.drawWidth, dims2.drawHeight);
      }
      break;

    case 'slide-down':
      ctx.globalAlpha = 1;
      ctx.drawImage(img.element, dims1.offsetX, dims1.offsetY + easedProgress * canvasHeight, dims1.drawWidth, dims1.drawHeight);
      if (nextImg) {
        const dims2 = calculateImageDimensions(nextImg.element.width, nextImg.element.height, canvasWidth, canvasHeight);
        ctx.drawImage(nextImg.element, dims2.offsetX, dims2.offsetY - (1 - easedProgress) * canvasHeight, dims2.drawWidth, dims2.drawHeight);
      }
      break;

    case 'zoom-in':
      ctx.globalAlpha = 1 - easedProgress;
      const scale1 = 1 + (1 - easedProgress) * 0.5;
      const w1 = dims1.drawWidth * scale1;
      const h1 = dims1.drawHeight * scale1;
      ctx.drawImage(img.element, dims1.offsetX - (w1 - dims1.drawWidth) / 2, dims1.offsetY - (h1 - dims1.drawHeight) / 2, w1, h1);
      if (nextImg) {
        const dims2 = calculateImageDimensions(nextImg.element.width, nextImg.element.height, canvasWidth, canvasHeight);
        ctx.globalAlpha = easedProgress;
        const scale2 = 1.5 - easedProgress * 0.5;
        const w2 = dims2.drawWidth * scale2;
        const h2 = dims2.drawHeight * scale2;
        ctx.drawImage(nextImg.element, dims2.offsetX - (w2 - dims2.drawWidth) / 2, dims2.offsetY - (h2 - dims2.drawHeight) / 2, w2, h2);
      }
      break;

    case 'zoom-out':
      ctx.globalAlpha = 1 - easedProgress;
      const scaleOut1 = 1.5 - easedProgress * 0.5;
      const wOut1 = dims1.drawWidth * scaleOut1;
      const hOut1 = dims1.drawHeight * scaleOut1;
      ctx.drawImage(img.element, dims1.offsetX - (wOut1 - dims1.drawWidth) / 2, dims1.offsetY - (hOut1 - dims1.drawHeight) / 2, wOut1, hOut1);
      if (nextImg) {
        const dims2 = calculateImageDimensions(nextImg.element.width, nextImg.element.height, canvasWidth, canvasHeight);
        ctx.globalAlpha = easedProgress;
        const scaleOut2 = 1 + (1 - easedProgress) * 0.5;
        const wOut2 = dims2.drawWidth * scaleOut2;
        const hOut2 = dims2.drawHeight * scaleOut2;
        ctx.drawImage(nextImg.element, dims2.offsetX - (wOut2 - dims2.drawWidth) / 2, dims2.offsetY - (hOut2 - dims2.drawHeight) / 2, wOut2, hOut2);
      }
      break;

    default:
      ctx.globalAlpha = 1;
      ctx.drawImage(img.element, dims1.offsetX, dims1.offsetY, dims1.drawWidth, dims1.drawHeight);
  }

  ctx.globalAlpha = 1;
}

// Animation loop
function animate(timestamp) {
  if (state.isPaused || (!state.isPlaying && !state.isRecording)) return;

  if (!state.lastFrameTime) state.lastFrameTime = timestamp;
  const deltaTime = timestamp - state.lastFrameTime;
  state.lastFrameTime = timestamp;

  const previewCanvas = document.getElementById('preview-canvas');
  const previewCtx = previewCanvas?.getContext('2d');

  if (!previewCtx) return;

  const transitionDuration = state.settings.duration;
  const durationPerImage = transitionDuration;

  // Calculate progress
  state.transitionProgress += deltaTime / durationPerImage;

  if (state.transitionProgress >= 1) {
    // Move to next image
    state.transitionProgress = 0;
    state.currentIndex = (state.currentIndex + 1) % state.images.length;
  }

  // Update progress bar
  updateProgressBar();

  const currentImg = state.images[state.currentIndex];
  const nextImg = state.images[(state.currentIndex + 1) % state.images.length];

  // Draw to preview
  drawImage(previewCanvas, previewCtx, currentImg, state.transitionProgress, nextImg, state.settings.transition, true);

  // Draw to recorder if recording
  if (state.isRecording && window.recorder) {
    const recorderCanvas = window.recorder.canvas;
    const recorderCtx = window.recorder.ctx;
    drawImage(recorderCanvas, recorderCtx, currentImg, state.transitionProgress, nextImg, state.settings.transition, true);
  }

  if (state.isPlaying || state.isRecording) {
    state.animationId = requestAnimationFrame(animate);
  }
}

// Update progress bar
function updateProgressBar() {
  const progressBar = document.getElementById('progress-bar-fill');
  if (!progressBar || state.images.length === 0) return;

  const totalProgress = (state.currentIndex + state.transitionProgress) / state.images.length;
  progressBar.style.width = `${totalProgress * 100}%`;
}

// Start playback
function startPlayback() {
  if (state.images.length === 0) return;
  state.isPlaying = true;
  state.isPaused = false;
  state.lastFrameTime = 0;
  requestAnimationFrame(animate);
  updatePlaybackButtons();
}

// Pause playback
function pausePlayback() {
  state.isPaused = true;
  updatePlaybackButtons();
}

// Resume playback
function resumePlayback() {
  if (!state.isPlaying) return;
  state.isPaused = false;
  state.lastFrameTime = 0;
  requestAnimationFrame(animate);
  updatePlaybackButtons();
}

// Stop and reset playback
function resetPlayback() {
  state.isPlaying = false;
  state.isPaused = false;
  state.currentIndex = 0;
  state.transitionProgress = 0;
  state.lastFrameTime = 0;
  if (state.animationId) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }

  // Redraw initial frame
  if (state.images.length > 0) {
    const previewCanvas = document.getElementById('preview-canvas');
    const previewCtx = previewCanvas?.getContext('2d');
    if (previewCtx) {
      const currentImg = state.images[0];
      const nextImg = state.images[1] || state.images[0];
      drawImage(previewCanvas, previewCtx, currentImg, 0, nextImg, state.settings.transition, true);
    }
  }

  updateProgressBar();
  updatePlaybackButtons();
}

// Go to previous image
function previousImage() {
  if (state.images.length === 0) return;
  state.currentIndex = (state.currentIndex - 1 + state.images.length) % state.images.length;
  state.transitionProgress = 0;

  // Redraw
  const previewCanvas = document.getElementById('preview-canvas');
  const previewCtx = previewCanvas?.getContext('2d');
  if (previewCtx && state.images.length > 0) {
    const currentImg = state.images[state.currentIndex];
    const nextImg = state.images[(state.currentIndex + 1) % state.images.length];
    drawImage(previewCanvas, previewCtx, currentImg, 0, nextImg, state.settings.transition, true);
  }

  updateProgressBar();
}

// Go to next image
function nextImage() {
  if (state.images.length === 0) return;
  state.currentIndex = (state.currentIndex + 1) % state.images.length;
  state.transitionProgress = 0;

  // Redraw
  const previewCanvas = document.getElementById('preview-canvas');
  const previewCtx = previewCanvas?.getContext('2d');
  if (previewCtx && state.images.length > 0) {
    const currentImg = state.images[state.currentIndex];
    const nextImg = state.images[(state.currentIndex + 1) % state.images.length];
    drawImage(previewCanvas, previewCtx, currentImg, 0, nextImg, state.settings.transition, true);
  }

  updateProgressBar();
}

// Update playback button states
function updatePlaybackButtons() {
  const hasImages = state.images.length > 0;

  const playBtn = document.getElementById('play-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const resetBtn = document.getElementById('reset-btn');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const exportBtn = document.getElementById('export-btn');

  // Play button: disabled if playing or no images
  if (playBtn) playBtn.disabled = state.isPlaying || !hasImages;

  // Pause button: disabled if not playing or already paused
  if (pauseBtn) pauseBtn.disabled = !state.isPlaying || state.isPaused;

  // Resume button: disabled if not paused
  if (resumeBtn) resumeBtn.disabled = !state.isPaused;

  // Reset button: always enabled if has images
  if (resetBtn) resetBtn.disabled = !hasImages;

  // Prev/Next buttons: disabled if no images or playing (not paused)
  const canNavigate = !state.isPlaying || state.isPaused;
  if (prevBtn) prevBtn.disabled = !hasImages || !canNavigate;
  if (nextBtn) nextBtn.disabled = !hasImages || !canNavigate;

  // Export button: disabled if recording or no images
  if (exportBtn) exportBtn.disabled = state.isRecording || !hasImages;
}

// Handle file selection
async function handleFiles(files) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      const id = generateId();
      const img = new Image();
      img.onload = () => {
        if (state.images.length === 0 && state.settings.aspectRatio === 'original') {
          updateCanvasSize();
        }
      };
      img.src = url;

      state.images.push({ id, file, url, element: img });
    }
  }

  if (state.images.length > 0 && state.settings.aspectRatio === 'original') {
    updateCanvasSize();
  }

  renderImageGrid();
  updatePlaybackButtons();
}

// Render image grid
function renderImageGrid() {
  const grid = document.getElementById('image-grid');
  if (!grid) return;

  grid.innerHTML = '';

  state.images.forEach((img, index) => {
    const item = document.createElement('div');
    item.className = 'grid-item';
    item.draggable = true;
    item.dataset.index = index;
    item.dataset.id = img.id;

    item.innerHTML = `
      <div class="grid-item-number">${index + 1}</div>
      <img src="${img.url}" alt="${img.file.name}">
      <button class="remove-btn" data-id="${img.id}" title="Remove">
        <i data-lucide="x"></i>
      </button>
    `;

    // Drag events
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', handleDragEnd);

    grid.appendChild(item);
  });

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Update empty state
  const emptyState = document.getElementById('empty-state');
  if (emptyState) {
    emptyState.style.display = state.images.length === 0 ? 'flex' : 'none';
  }

  // Update image count
  const imageCount = document.querySelector('.image-count');
  if (imageCount) {
    imageCount.textContent = `${state.images.length} images`;
  }

  // Show first image on canvas if not playing
  if (!state.isPlaying && state.images.length > 0) {
    const previewCanvas = document.getElementById('preview-canvas');
    const previewCtx = previewCanvas?.getContext('2d');
    if (previewCtx) {
      const currentImg = state.images[0];
      const nextImg = state.images[1] || state.images[0];
      drawImage(previewCanvas, previewCtx, currentImg, 0, nextImg, state.settings.transition, true);
    }
  }

  // Reset progress bar
  updateProgressBar();
}

// Drag and drop handlers
let draggedItem = null;

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('drag-over');

  if (draggedItem !== this) {
    const fromIndex = parseInt(draggedItem.dataset.index);
    const toIndex = parseInt(this.dataset.index);

    // Reorder images array
    const [moved] = state.images.splice(fromIndex, 1);
    state.images.splice(toIndex, 0, moved);

    renderImageGrid();
  }
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.grid-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

// Remove image
function removeImage(id) {
  const index = state.images.findIndex(img => img.id === id);
  if (index > -1) {
    URL.revokeObjectURL(state.images[index].url);
    state.images.splice(index, 1);
    renderImageGrid();
    updatePlaybackButtons();
  }
}

// Start recording
async function startRecording() {
  if (state.images.length === 0) return;

  state.isRecording = true;
  state.isPlaying = true;
  state.currentIndex = 0;
  state.transitionProgress = 0;
  state.lastFrameTime = 0;

  const btn = document.getElementById('export-btn');
  const status = document.getElementById('status');
  const originalText = btn?.innerText;

  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Recording...';
  }
  if (status) status.classList.remove('hidden');

  // Start recorder
  const success = window.recorder.start(60);
  if (!success) {
    alert('Failed to start recording. Browser might not support WebM.');
    state.isRecording = false;
    state.isPlaying = false;
    if (btn) {
      btn.disabled = false;
      btn.innerText = originalText;
    }
    if (status) status.classList.add('hidden');
    return;
  }

  // Calculate total duration
  const totalDuration = state.images.length * state.settings.duration;

  // Start animation loop
  requestAnimationFrame(animate);

  // Stop after total duration
  setTimeout(async () => {
    state.isPlaying = false;
    state.isRecording = false;

    if (window.recorder) {
      await window.recorder.stop('image-sequence.webm');
    }

    if (btn) {
      btn.disabled = false;
      btn.innerText = originalText;
    }
    if (status) status.classList.add('hidden');

    updatePlaybackButtons();
  }, totalDuration + 500);

  updatePlaybackButtons();
}

// Initialize recorder
window.recorder = new VideoRecorder(1920, 1080);

// Build UI
document.querySelector('#app').innerHTML = `
  <div class="sequencer-container">
    <!-- Sidebar -->
    <div class="sidebar">
      <h1>
        <i data-lucide="film"></i>
        Image Sequence Animator
      </h1>

      <!-- Upload Section -->
      <div class="control-group">
        <label>Upload Images</label>
        <div id="drop-zone" class="drop-zone">
          <input type="file" id="file-input" accept="image/*" multiple hidden>
          <div class="drop-zone-content">
            <i data-lucide="upload-cloud"></i>
            <span>Drag & drop images or click to browse</span>
          </div>
        </div>
      </div>

      <!-- Transition -->
      <div class="control-group">
        <label for="transition">Transition</label>
        <select id="transition">
          ${transitions.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
      </div>

      <!-- Duration -->
      <div class="control-group">
        <label for="duration">Duration per Image (ms)</label>
        <input type="number" id="duration" value="${state.settings.duration}" min="100" step="100">
      </div>

      <!-- Easing -->
      <div class="control-group">
        <label for="easing">Acceleration</label>
        <select id="easing">
          ${easingOptions.map(e => `<option value="${e.value}">${e.label}</option>`).join('')}
        </select>
      </div>

      <!-- Custom Easing Controls (hidden by default) -->
      <div id="custom-easing-controls" style="display: none;">
        <div class="control-group">
          <label for="start-speed">Start Speed (0-1)</label>
          <input type="range" id="start-speed" min="0" max="1" step="0.1" value="${state.settings.customEasing.startSpeed}">
          <span class="range-value">${state.settings.customEasing.startSpeed}</span>
        </div>
        <div class="control-group">
          <label for="end-speed">End Speed (0-1)</label>
          <input type="range" id="end-speed" min="0" max="1" step="0.1" value="${state.settings.customEasing.endSpeed}">
          <span class="range-value">${state.settings.customEasing.endSpeed}</span>
        </div>
        <div class="control-group">
          <label for="threshold">Accel Portion</label>
          <select id="threshold">
            <option value="0.2">1/5 (First 20%)</option>
            <option value="0.25">1/4 (First 25%)</option>
            <option value="0.33">1/3 (First 33%)</option>
            <option value="0.5" selected>1/2 (First 50%)</option>
            <option value="0.66">2/3 (First 66%)</option>
          </select>
        </div>

        <!-- Curve Visualization -->
        <div class="curve-editor">
          <div class="curve-header">
            <span>Easing Curve</span>
            <span class="curve-legend">
              <span class="legend-item"><span class="legend-dot curve-dot"></span> Progress</span>
              <span class="legend-item"><span class="legend-dot speed-dot"></span> Speed</span>
            </span>
          </div>
          <canvas id="curve-canvas" width="280" height="180"></canvas>
        </div>
      </div>

      <!-- Aspect Ratio -->
      <div class="control-group">
        <label for="aspect-ratio">Aspect Ratio</label>
        <select id="aspect-ratio">
          <option value="16:9">16:9 (Landscape)</option>
          <option value="9:16">9:16 (Portrait)</option>
          <option value="1:1">1:1 (Square)</option>
          <option value="4:3">4:3 (Standard)</option>
          <option value="original">Original (uses first image)</option>
        </select>
      </div>

      <!-- Background Color -->
      <div class="control-group">
        <label for="bg-color">Background Color (for letterboxing)</label>
        <input type="color" id="bg-color" value="${state.settings.backgroundColor}">
      </div>

      <!-- Export -->
      <div class="button-group">
        <button id="export-btn" class="secondary">
          <i data-lucide="download"></i>
          Export Video
        </button>
      </div>
      <div id="status" class="status-text hidden">Recording...</div>
    </div>

    <!-- Preview Section -->
    <div class="preview-section">
      <!-- Playback Controls -->
      <div class="playback-controls">
        <button id="reset-btn" title="Reset to start">
          <i data-lucide="skip-back"></i>
        </button>
        <button id="prev-btn" title="Previous image">
          <i data-lucide="chevron-left"></i>
        </button>
        <button id="play-btn" class="primary" title="Play">
          <i data-lucide="play"></i>
        </button>
        <button id="pause-btn" title="Pause">
          <i data-lucide="pause"></i>
        </button>
        <button id="resume-btn" title="Resume">
          <i data-lucide="play"></i>
        </button>
        <button id="next-btn" title="Next image">
          <i data-lucide="chevron-right"></i>
        </button>
        <button id="export-btn-sm" title="Export video">
          <i data-lucide="download"></i>
        </button>
      </div>
      <div class="progress-bar">
        <div id="progress-bar-fill" class="progress-bar-fill" style="width: 0%"></div>
      </div>

      <div class="canvas-container">
        <canvas id="preview-canvas" width="${state.canvasSize.width}" height="${state.canvasSize.height}"></canvas>
      </div>

      <!-- Image Grid -->
      <div class="images-panel">
        <div class="panel-header">
          <h3>Sequence Order</h3>
          <span class="image-count">${state.images.length} images</span>
        </div>
        <div id="image-grid" class="image-grid"></div>
        <div id="empty-state" class="empty-state">
          <i data-lucide="image"></i>
          <p>No images added yet. Upload images to get started.</p>
        </div>
      </div>
    </div>
  </div>
`;

// Initialize Lucide icons
if (typeof lucide !== 'undefined') {
  lucide.createIcons();
}

// Initialize canvas
const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');
previewCtx.fillStyle = state.settings.backgroundColor;
previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

// Curve visualization
const curveCanvas = document.getElementById('curve-canvas');
const curveCtx = curveCanvas?.getContext('2d');

let isDraggingStart = false;
let isDraggingEnd = false;

function drawCurve() {
  if (!curveCanvas || !curveCtx) return;

  const width = curveCanvas.width;
  const height = curveCanvas.height;
  const padding = 20;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;

  // Clear
  curveCtx.clearRect(0, 0, width, height);

  // Draw grid
  curveCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  curveCtx.lineWidth = 1;

  // Vertical lines
  for (let i = 0; i <= 5; i++) {
    const x = padding + (graphWidth / 5) * i;
    curveCtx.beginPath();
    curveCtx.moveTo(x, padding);
    curveCtx.lineTo(x, height - padding);
    curveCtx.stroke();
  }

  // Horizontal lines
  for (let i = 0; i <= 5; i++) {
    const y = padding + (graphHeight / 5) * i;
    curveCtx.beginPath();
    curveCtx.moveTo(padding, y);
    curveCtx.lineTo(width - padding, y);
    curveCtx.stroke();
  }

  // Draw diagonal (linear reference)
  curveCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  curveCtx.setLineDash([5, 5]);
  curveCtx.beginPath();
  curveCtx.moveTo(padding, height - padding);
  curveCtx.lineTo(width - padding, padding);
  curveCtx.stroke();
  curveCtx.setLineDash([]);

  // Draw easing curve
  const easingFn = getCustomEasingFn(
    state.settings.customEasing.startSpeed,
    state.settings.customEasing.endSpeed,
    state.settings.customEasing.threshold
  );

  curveCtx.strokeStyle = '#38bdf8';
  curveCtx.lineWidth = 2;
  curveCtx.beginPath();

  const startSpeed = state.settings.customEasing.startSpeed;
  const endSpeed = state.settings.customEasing.endSpeed;

  // Draw curve from (0,0) to (1,1)
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    const eased = easingFn(t);
    const x = padding + t * graphWidth;
    const y = height - padding - eased * graphHeight;

    if (i === 0) {
      curveCtx.moveTo(x, y);
    } else {
      curveCtx.lineTo(x, y);
    }
  }
  curveCtx.stroke();

  // Draw speed curve (derivative visualization)
  // Speed is represented as the slope tangent at points
  curveCtx.strokeStyle = '#f59e0b';
  curveCtx.lineWidth = 1;
  curveCtx.setLineDash([3, 3]);

  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const delta = 0.01;
    const eased1 = easingFn(t - delta);
    const eased2 = easingFn(t + delta);
    const slope = (eased2 - eased1) / (2 * delta);

    // Draw tangent line at this point
    const cx = padding + t * graphWidth;
    const cy = height - padding - easingFn(t) * graphHeight;

    // Scale the tangent for visibility
    const tangentLength = 20;
    const angle = Math.atan(-slope * graphHeight / graphWidth);

    curveCtx.beginPath();
    curveCtx.moveTo(
      cx - Math.cos(angle) * tangentLength / 2,
      cy - Math.sin(angle) * tangentLength / 2
    );
    curveCtx.lineTo(
      cx + Math.cos(angle) * tangentLength / 2,
      cy + Math.sin(angle) * tangentLength / 2
    );
    curveCtx.stroke();
  }
  curveCtx.setLineDash([]);

  // Draw handles at start and end
  const handleRadius = 8;

  // Start handle
  const startHandleX = padding;
  const startHandleY = height - padding;

  curveCtx.fillStyle = '#38bdf8';
  curveCtx.beginPath();
  curveCtx.arc(startHandleX, startHandleY, handleRadius, 0, Math.PI * 2);
  curveCtx.fill();

  // Start speed indicator (line showing slope)
  const startAngle = Math.atan(-startSpeed * graphHeight / graphWidth);
  curveCtx.strokeStyle = '#38bdf8';
  curveCtx.lineWidth = 2;
  curveCtx.beginPath();
  curveCtx.moveTo(startHandleX, startHandleY);
  curveCtx.lineTo(
    startHandleX + Math.cos(startAngle) * 25,
    startHandleY + Math.sin(startAngle) * 25
  );
  curveCtx.stroke();

  // End handle
  const endHandleX = width - padding;
  const endHandleY = padding;

  curveCtx.fillStyle = '#38bdf8';
  curveCtx.beginPath();
  curveCtx.arc(endHandleX, endHandleY, handleRadius, 0, Math.PI * 2);
  curveCtx.fill();

  // End speed indicator (line showing slope)
  const endAngle = Math.atan(-endSpeed * graphHeight / graphWidth);
  curveCtx.strokeStyle = '#38bdf8';
  curveCtx.beginPath();
  curveCtx.moveTo(endHandleX, endHandleY);
  curveCtx.lineTo(
    endHandleX - Math.cos(endAngle) * 25,
    endHandleY + Math.sin(endAngle) * 25
  );
  curveCtx.stroke();

  // Threshold indicator (vertical line)
  const thresholdX = padding + state.settings.customEasing.threshold * graphWidth;
  curveCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  curveCtx.setLineDash([2, 2]);
  curveCtx.beginPath();
  curveCtx.moveTo(thresholdX, padding);
  curveCtx.lineTo(thresholdX, height - padding);
  curveCtx.stroke();
  curveCtx.setLineDash([]);

  // Labels
  curveCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  curveCtx.font = '10px sans-serif';
  curveCtx.textAlign = 'center';
  curveCtx.fillText('Time', width / 2, height - 5);
  curveCtx.save();
  curveCtx.translate(10, height / 2);
  curveCtx.rotate(-Math.PI / 2);
  curveCtx.fillText('Progress', 0, 0);
  curveCtx.restore();
}

// Handle interaction on curve canvas
if (curveCanvas) {
  curveCanvas.addEventListener('mousedown', (e) => {
    const rect = curveCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padding = 20;
    const handleRadius = 12; // Larger hit area

    // Check start handle
    if (Math.abs(x - padding) < handleRadius * 2) {
      isDraggingStart = true;
    }
    // Check end handle
    else if (Math.abs(x - (curveCanvas.width - padding)) < handleRadius * 2) {
      isDraggingEnd = true;
    }
  });

  curveCanvas.addEventListener('mousemove', (e) => {
    if (!isDraggingStart && !isDraggingEnd) return;

    const rect = curveCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padding = 20;
    const graphHeight = curveCanvas.height - padding * 2;

    if (isDraggingStart) {
      // Calculate start speed from y position relative to start point
      const startY = curveCanvas.height - padding;
      const dy = y - startY;
      const dx = 30; // Reference distance for speed calculation
      let newSpeed = Math.max(0, Math.min(1, -dy / dx));

      state.settings.customEasing.startSpeed = Math.round(newSpeed * 10) / 10;

      // Update slider
      const slider = document.getElementById('start-speed');
      if (slider) {
        slider.value = state.settings.customEasing.startSpeed;
        slider.nextElementSibling.textContent = state.settings.customEasing.startSpeed;
      }
    }

    if (isDraggingEnd) {
      // Calculate end speed from y position relative to end point
      const endY = padding;
      const dy = y - endY;
      const dx = 30;
      let newSpeed = Math.max(0, Math.min(1, dy / dx));

      state.settings.customEasing.endSpeed = Math.round(newSpeed * 10) / 10;

      // Update slider
      const slider = document.getElementById('end-speed');
      if (slider) {
        slider.value = state.settings.customEasing.endSpeed;
        slider.nextElementSibling.textContent = state.settings.customEasing.endSpeed;
      }
    }

    drawCurve();
  });

  curveCanvas.addEventListener('mouseup', () => {
    isDraggingStart = false;
    isDraggingEnd = false;
  });

  curveCanvas.addEventListener('mouseleave', () => {
    isDraggingStart = false;
    isDraggingEnd = false;
  });
}

// Initial draw
setTimeout(drawCurve, 100);

// Redraw when custom easing controls are shown
const originalUpdateCustomControls = () => {
  drawCurve();
};

// Event Listeners
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

// Drop zone click
dropZone.addEventListener('click', () => fileInput.click());

// File input change
fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
  fileInput.value = '';
});

// Drag and drop on drop zone
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

// Settings changes
document.getElementById('transition').addEventListener('change', (e) => {
  state.settings.transition = e.target.value;
});

document.getElementById('duration').addEventListener('change', (e) => {
  state.settings.duration = Math.max(100, parseInt(e.target.value) || 1000);
});

document.getElementById('easing').addEventListener('change', (e) => {
  state.settings.easing = e.target.value;
  // Show/hide custom easing controls
  const customControls = document.getElementById('custom-easing-controls');
  if (customControls) {
    customControls.style.display = e.target.value === 'custom' ? 'block' : 'none';
    // Redraw curve when showing
    if (e.target.value === 'custom') {
      setTimeout(drawCurve, 50);
    }
  }
});

// Custom easing controls
document.getElementById('start-speed').addEventListener('input', (e) => {
  state.settings.customEasing.startSpeed = parseFloat(e.target.value);
  e.target.nextElementSibling.textContent = e.target.value;
  drawCurve();
});

document.getElementById('end-speed').addEventListener('input', (e) => {
  state.settings.customEasing.endSpeed = parseFloat(e.target.value);
  e.target.nextElementSibling.textContent = e.target.value;
  drawCurve();
});

document.getElementById('threshold').addEventListener('change', (e) => {
  state.settings.customEasing.threshold = parseFloat(e.target.value);
  drawCurve();
});

document.getElementById('aspect-ratio').addEventListener('change', (e) => {
  state.settings.aspectRatio = e.target.value;
  updateCanvasSize();
});

document.getElementById('bg-color').addEventListener('change', (e) => {
  state.settings.backgroundColor = e.target.value;
});

// Playback controls
document.getElementById('play-btn').addEventListener('click', startPlayback);
document.getElementById('pause-btn').addEventListener('click', pausePlayback);
document.getElementById('resume-btn').addEventListener('click', resumePlayback);
document.getElementById('reset-btn').addEventListener('click', resetPlayback);
document.getElementById('prev-btn').addEventListener('click', previousImage);
document.getElementById('next-btn').addEventListener('click', nextImage);
document.getElementById('export-btn').addEventListener('click', startRecording);
document.getElementById('export-btn-sm')?.addEventListener('click', startRecording);

// Remove image button (delegated)
document.getElementById('image-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-btn');
  if (btn) {
    removeImage(btn.dataset.id);
  }
});

// Initialize
updatePlaybackButtons();
