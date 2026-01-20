import './style.css';
import { CountUp } from 'countup.js';
import { VideoRecorder } from './recorder.js';

document.querySelector('#app').innerHTML = `
  <div class="controls">
    <h1>Animation Settings</h1>
    
    <div class="control-group">
      <label for="endVal">Target Number</label>
      <input type="number" id="endVal" value="2024" placeholder="Enter a number">
    </div>

    <div class="options-row">
      <div class="control-group" style="flex: 0 0 40%;">
        <label for="duration">Duration (sec)</label>
        <input type="number" id="duration" value="2.5" step="0.1" min="0.1">
      </div>
      <div class="toggle-group-wrapper">
        <div class="toggle-group">
          <input type="checkbox" id="useEasing" checked>
          <label for="useEasing">Use Easing</label>
        </div>
        <div class="toggle-group">
          <input type="checkbox" id="useGrouping" checked>
          <label for="useGrouping">Use Grouping</label>
        </div>
      </div>
    </div>

    <div class="options-grid">
      <div class="control-group">
        <label for="prefix">Prefix</label>
        <input type="text" id="prefix" placeholder="e.g. $">
      </div>
      <div class="control-group">
        <label for="suffix">Suffix</label>
        <input type="text" id="suffix" placeholder="e.g. %">
      </div>
    </div>
    
    <div class="options-grid">
      <div class="control-group">
        <label for="color">Text Color</label>
        <input type="color" id="color" value="#38bdf8">
      </div>
      <div class="control-group">
        <label for="bgColor">Background Color</label>
        <div class="color-toggle-row">
            <input type="checkbox" id="useBgColor" title="Enable Background">
            <input type="color" id="bgColor" value="#0f172a" disabled style="opacity: 0.5; width: 100%;">
        </div>
      </div>
    </div>

    <div class="button-group">
      <button id="animateBtn">Animate</button>
      <button id="downloadBtn" class="secondary">Download Video</button>
    </div>
    <div id="status" class="status-text hidden">Recording...</div>
  </div>

  <div class="anim-preview">
    <div class="glow"></div>
    <div id="counter">0</div>
  </div>
`;

// State
let countUp;
let isRecording = false;
const recorder = new VideoRecorder(1920, 1080); // Full HD default

function getOptions() {
  return {
    duration: Number(document.getElementById('duration').value),
    prefix: document.getElementById('prefix').value,
    suffix: document.getElementById('suffix').value,
    useEasing: document.getElementById('useEasing').checked,
    useGrouping: document.getElementById('useGrouping').checked,
  };
}

function updateStyles() {
  const color = document.getElementById('color').value;
  const useBg = document.getElementById('useBgColor').checked;
  const bgColor = document.getElementById('bgColor').value;

  document.getElementById('counter').style.color = color;
  document.querySelector('.glow').style.background = color;
  document.documentElement.style.setProperty('--accent-color', color);

  // Update preview background and glow
  const preview = document.querySelector('.anim-preview');
  const glow = document.querySelector('.glow');

  if (useBg) {
    preview.style.background = bgColor;
    preview.style.borderRadius = '24px';
    glow.style.display = 'none';
  } else {
    preview.style.background = 'transparent';
    glow.style.display = 'block';
  }
}

function initCountUp(onComplete) {
  const endVal = Number(document.getElementById('endVal').value);
  const options = {
    ...getOptions(),
    onCompleteCallback: onComplete
  };

  updateStyles();

  if (countUp) {
    countUp.reset();
  }

  countUp = new CountUp('counter', endVal, options);

  if (!countUp.error) {
    countUp.start();
  } else {
    console.error(countUp.error);
  }
}

async function startRecordingSequence() {
  if (isRecording) return;
  isRecording = true;

  const btn = document.getElementById('downloadBtn');
  const status = document.getElementById('status');
  const originalText = btn.innerText;

  btn.disabled = true;
  btn.innerText = 'Recording...';
  status.classList.remove('hidden');

  // Start the recorder
  const success = recorder.start();
  if (!success) {
    alert('Failed to start recording. Browser might not support VP9/WebM.');
    isRecording = false;
    btn.disabled = false;
    btn.innerText = originalText;
    status.classList.add('hidden');
    return;
  }

  // Hook into the animation loop to drive the recorder
  // We can't easily hook cleanly into every frame of countUp.js solely via callbacks
  // So we run a parallel requestAnimationFrame loop that copies text from the DOM to the canvas recorder

  const endVal = Number(document.getElementById('endVal').value);
  const duration = Number(document.getElementById('duration').value);
  const color = document.getElementById('color').value;
  const useBg = document.getElementById('useBgColor').checked;
  const bgColor = document.getElementById('bgColor').value;

  // Font size calculation: Try to match the 8rem visual.
  // 8rem at standard base 16px = 128px. Let's make it bigger for the 1080p video: 250px.
  // Or we can dynamically measure, but fixed large size is usually better for video assets.
  const style = {
    color: color,
    backgroundColor: useBg ? bgColor : 'transparent',
    font: '700 250px "Outfit", sans-serif',
    // We could add shadow matching if we wanted:
    // shadowColor: color,
    // shadowBlur: 20
  };

  let recordingAnimId;
  const syncLoop = () => {
    // Current text from the DOM element which CountUp is updating
    const text = document.getElementById('counter').innerText;
    recorder.renderFrame(text, style);

    if (isRecording) {
      recordingAnimId = requestAnimationFrame(syncLoop);
    }
  };

  // Start the loop
  recordingAnimId = requestAnimationFrame(syncLoop);

  // Restart animation
  initCountUp(async () => {
    // On Complete
    // Give it a few extra frames to settle
    setTimeout(async () => {
      cancelAnimationFrame(recordingAnimId);
      isRecording = false;
      await recorder.stop(`counter-${endVal}.webm`);

      btn.disabled = false;
      btn.innerText = originalText;
      status.classList.add('hidden');
    }, 500);
  });
}

// Event Listeners
document.getElementById('animateBtn').addEventListener('click', () => initCountUp());
document.getElementById('downloadBtn').addEventListener('click', startRecordingSequence);
document.getElementById('color').addEventListener('input', updateStyles);
document.getElementById('bgColor').addEventListener('input', updateStyles);

document.getElementById('useBgColor').addEventListener('change', (e) => {
  const picker = document.getElementById('bgColor');
  if (e.target.checked) {
    picker.disabled = false;
    picker.style.opacity = '1';
  } else {
    picker.disabled = true;
    picker.style.opacity = '0.5';
  }
  updateStyles();
});

// Initial Load
setTimeout(() => initCountUp(), 500);
