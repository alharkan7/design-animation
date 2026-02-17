const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

let width, height;
const circles = [];
const numCircles = 718;
let langList = [];
let islandLangMap = new Map();
let provinceLangMap = new Map();
let islandData = [];
let provinceData = [];

// Colors - Dark Theme Data Art
const COLOR_MAIN_1 = '#38bdf8'; // Sky 400
const COLOR_MAIN_2 = '#818cf8'; // Indigo 400
const COLOR_ACCENT = '#f472b6'; // Pink 400
const COLOR_BG = '#0f172a'; // Slate 900
const COLOR_TEXT = '#f1f5f9'; // Slate 100

const tooltip = document.getElementById('tooltip');
const resetBtn = document.getElementById('reset-btn');
const infoBtn = document.getElementById('info-btn');
const infoModal = document.getElementById('info-modal');
const modalClose = document.getElementById('modal-close');
let canvasRect = { left: 0, top: 0 };

// Global animation state
let globalZoom = 2.0;
let targetZoom = 1.0;
let defaultZoom = 1.0; // Base zoom for the current scene
let labels = []; // {x, y, text}

let hoveredCircle = null;

let mode = 'grid'; // grid | bar | tree
let panX = 0;
let panY = 0;
let targetPanX = 0;
let targetPanY = 0;
let focusNode = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartPanX = 0;
let dragStartPanY = 0;
let dragMoved = false;
let suppressClick = false;

const treeNodes = [];
const treeEdges = [];
let hoveredNode = null;
let labelOccupancy = null;
let languageLabelCount = 0;
let treeView = null;
let provinceLabelBoxes = null;
let treeFrame = 0;

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 12.0;

let barScrollable = false;
let barMinPanX = 0;
let barMaxPanX = 0;
let barIsDragging = false;
let barDragStartX = 0;
let barDragStartPanX = 0;

let textAnim = {
  // Incoming
  opacity: 1,
  yOffset: 0,
  // Outgoing
  prevScene: null,
  prevOpacity: 0,
  prevYOffset: 0,
  // Visibility
  visible: true,
  tVisible: 1
};

let sceneIndex = 0;
let textHitBox = null;
let textPointerId = null;
const scenes = [
  {
    key: 'grid',
    align: 'center',
    title: '718 Bahasa Nusantara',
    caption: 'Setiap titik di sini mewakili satu bahasa di Indonesia. Data ini dihimpun oleh Badan Pengembangan dan Pembinaan Bahasa, Kementerian Pendidikan Dasar dan Menengah, melalui riset yang dilakukan selama hampir 28 tahun (1991 - 2019) pada 2.560 daerah pengamatan. Tanpa menghitung dialek & subdialek, keragaman bahasa daerah di Indonesia mencapai 718 bahasa.',
    apply: () => layoutGrid()
  },
  {
    key: 'island',
    align: 'right',
    title: 'Pulau dan Bahasa',
    caption: 'Meski Jawa adalah pulau terpadat, ia bukan pulau dengan kekayaan bahasa tertinggi. Predikat ini diemban oleh Papua, dengan 428 bahasa, melebihi setengah dari keragaman bahasa di Indonesia.',
    apply: () => layoutBarChart(islandData, 'wilayah')
  },
  {
    key: 'province',
    align: 'right',
    title: 'Papua yang Terkaya',
    caption: 'Di antara provinsi yang lain (tahun 2019), Papua adalah daerah dengan kekayaan bahasa tertinggi, mencapai 326 bahasa, atau hampir setengah dari seluruh keragaman bahasa di Indonesia.',
    apply: () => layoutBarChart(provinceData, 'provinsi')
  },
  {
    key: 'tree',
    align: 'center',
    title: 'Pohon Kekerabatan Bahasa',
    caption: 'Keragaman bahasa di Indonesia ini mewakili 10% dari keseluruhan bahasa yang ada di dunia, menjadikan Indonesia sebagai negara dengan keragaman bahasa terbanyak kedua di dunia (setelah Papua Nugini).',
    apply: () => layoutTree()
  }
];
let nextHitBox = null;
let nextPointerId = null;

function isCoarsePointer() {
  return window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
}

function uiScale() {
  const s = (Math.min(width || 1, height || 1) / 720);
  return clamp(s, 0.75, 1.05);
}

function pickBarPacking({ effectiveBarWidth, chartHeight, maxCount }) {
  const maxR = 6.2;
  const minR = 1.6;
  for (let k = 0; k <= 46; k++) {
    const r = maxR - (k * (maxR - minR)) / 46;
    const diameter = r * 2.2;
    const cols = Math.max(1, Math.floor(effectiveBarWidth / diameter));
    const requiredHeight = Math.ceil((maxCount || 1) / cols) * diameter;
    if (requiredHeight <= chartHeight) return { r, diameter, cols };
  }
  const r = minR;
  const diameter = r * 2.2;
  const cols = Math.max(1, Math.floor(effectiveBarWidth / diameter));
  return { r, diameter, cols };
}

class Circle {
  constructor(id) {
    this.id = id;
    this.x = width / 2;
    this.y = height / 2;
    this.tx = width / 2;
    this.ty = height / 2;
    this.r = 0;
    this.tr = 4;
    this.color = COLOR_MAIN_1;
    this.alpha = 0;
    this.tAlpha = 1;
    this.delay = 0;
    this.group = '';
  }

  update() {
    if (this.delay > 0) {
      this.delay--;
      return;
    }

    // Ease out
    this.x += (this.tx - this.x) * 0.1;
    this.y += (this.ty - this.y) * 0.1;
    this.r += (this.tr - this.r) * 0.1;
    this.alpha += (this.tAlpha - this.alpha) * 0.1;
  }

  draw() {
    if (this.alpha <= 0.01) return;
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = (this === hoveredCircle) ? COLOR_ACCENT : this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

class Node {
  constructor({ id, kind, label, hue, tooltipText }) {
    this.id = id;
    this.kind = kind; // root | island | province | language
    this.label = label;
    this.tooltipText = tooltipText ?? label;
    this.hue = hue;
    this.color = hsla(this.hue, 85, 65, 1);

    this.x = width / 2;
    this.y = height / 2;
    this.tx = width / 2;
    this.ty = height / 2;
    this.r = 0;
    this.tr = 3;
    this.alpha = 0;
    this.tAlpha = 1;
    this.delay = 0;

    this._angle = 0;
  }

  update() {
    if (this.delay > 0) {
      this.delay--;
      return;
    }
    this.x += (this.tx - this.x) * 0.12;
    this.y += (this.ty - this.y) * 0.12;
    this.r += (this.tr - this.r) * 0.12;
    this.alpha += (this.tAlpha - this.alpha) * 0.12;
  }

  drawDot() {
    if (this.alpha <= 0.01 || this.r <= 0.01) return;
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = (this === hoveredNode) ? COLOR_ACCENT : this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawLabel() {
    if (this.alpha <= 0.02) return;

    const labelAlpha = labelVisibility(this.kind, globalZoom) * this.alpha;
    if (labelAlpha <= 0.02) return;

    if (this.kind === 'language') return;

    const dist = Math.hypot(this.x - width / 2, this.y - height / 2);
    const outward = dist > 1 ? 1 : 0;
    const dx = outward ? (this.x - width / 2) / dist : 0;
    const dy = outward ? (this.y - height / 2) / dist : 0;
    const pad = Math.max(6, this.r + 3);

    ctx.globalAlpha = labelAlpha;
    ctx.fillStyle = 'rgba(241, 245, 249, 0.9)';
    const s = uiScale();
    const rootPx = Math.round(16 * s);
    const islandPx = Math.round(10 * s);
    const provPx = Math.round(7 * s);
    ctx.font = this.kind === 'root' ? `${rootPx}px Outfit` : (this.kind === 'province' ? `${provPx}px Outfit` : `${islandPx}px Outfit`);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    if (this.kind === 'province' && provinceLabelBoxes) {
      const centerX = width / 2 + panX;
      const centerY = height / 2 + panY;
      const sx = (this.x - width / 2) * globalZoom + centerX;
      const sy = ((this.y - pad) - height / 2) * globalZoom + centerY;
      const w = ctx.measureText(this.label).width;
      const h = 9;
      const x1 = sx - w / 2 - 6;
      const x2 = sx + w / 2 + 6;
      const y1 = sy - h / 2 - 4;
      const y2 = sy + h / 2 + 4;

      for (let i = provinceLabelBoxes.length - 1; i >= 0; i--) {
        const b = provinceLabelBoxes[i];
        if (x1 <= b.x2 && x2 >= b.x1 && y1 <= b.y2 && y2 >= b.y1) return;
      }

      provinceLabelBoxes.push({ x1, y1, x2, y2 });
    }

    ctx.fillText(this.label, this.x, this.y - pad);

    ctx.globalAlpha = 1;
  }
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function hsla(h, s, l, a) {
  const hue = ((h % 360) + 360) % 360;
  return `hsla(${hue} ${s}% ${l}% / ${a})`;
}

function hueFromT(t) {
  const base = 200 - 160 * t;
  const wobble = 38 * Math.sin(Math.PI * 2 * t);
  return base + wobble;
}

function labelVisibility(kind, zoom) {
  if (kind === 'root') return 1;
  if (kind === 'island') return clamp((zoom - 0.8) / 0.4, 0, 1);
  if (kind === 'province') return clamp((zoom - 2.05) / 0.85, 0, 1);
  if (kind === 'language') return clamp((zoom - 2.6) / 1.4, 0, 1);
  return 0;
}

function shortenLanguageName(name) {
  const s = (name ?? '').toString();
  const idx = s.indexOf('(');
  return (idx >= 0 ? s.slice(0, idx) : s).trim();
}

function ellipsize(text, maxLen) {
  const s = (text ?? '').toString();
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.max(1, maxLen - 1)).trimEnd() + '…';
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawTreeLanguageLabelsScreenSpace() {
  const minZoom = 2.6;
  if (globalZoom < minZoom && treeFrame < 240) return;
  if (globalZoom < minZoom) return;

  const centerX = width / 2 + panX;
  const centerY = height / 2 + panY;

  const items = [];
  for (const n of treeNodes) {
    if (n.kind !== 'language') continue;
    if (n.alpha < 0.35) continue;
    items.push(n);
  }

  items.sort((a, b) => a.y - b.y);

  const placed = [];
  const limit = Math.floor(clamp(110 + (globalZoom - 2.6) * 720, 110, 1600));
  let count = 0;
  ctx.font = `${Math.round(7 * uiScale())}px Outfit`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 6;

  for (const n of items) {
    if (count >= limit) break;

    const sx = (n.x - width / 2) * globalZoom + centerX;
    const sy = (n.y - height / 2) * globalZoom + centerY;

    if (sx < -80 || sx > width + 80 || sy < -80 || sy > height + 80) continue;

    const vx = sx - centerX;
    const vy = sy - centerY;
    const vLen = Math.hypot(vx, vy) || 1;
    const dx = vx / vLen;
    const dy = vy / vLen;

    const pad = (n.r * globalZoom) + 8;
    const textX = sx + dx * pad;
    const textY = sy + dy * pad;

    ctx.textAlign = dx >= 0 ? 'left' : 'right';

    const text = ellipsize(n.label, 20);
    const w = ctx.measureText(text).width;
    const h = 9;

    const x1 = textX + (dx >= 0 ? 0 : -w) - 2;
    const x2 = x1 + w + 4;
    const y1 = textY - h / 2 - 2;
    const y2 = y1 + h + 4;

    let hit = false;
    for (let i = placed.length - 1; i >= 0; i--) {
      const b = placed[i];
      if (x1 <= b.x2 && x2 >= b.x1 && y1 <= b.y2 && y2 >= b.y1) {
        hit = true;
        break;
      }
    }
    if (hit) continue;

    placed.push({ x1, y1, x2, y2 });

    ctx.fillText(text, textX, textY);
    count++;
  }

  ctx.shadowBlur = 0;
}

function drawTreeHoverChipScreenSpace() {
  if (!hoveredNode) return;
  if (hoveredNode.alpha < 0.25) return;

  const n = hoveredNode;
  const centerX = width / 2 + panX;
  const centerY = height / 2 + panY;
  const sx = (n.x - width / 2) * globalZoom + centerX;
  const sy = (n.y - height / 2) * globalZoom + centerY;

  const vx = sx - centerX;
  const vy = sy - centerY;
  const vLen = Math.hypot(vx, vy) || 1;
  const dx = vx / vLen;
  const dy = vy / vLen;

  const pad = (n.r * globalZoom) + (n.kind === 'language' ? 14 : 12);
  const textX = sx + dx * pad;
  const textY = sy + dy * pad;

  ctx.font = `${Math.round(12 * uiScale())}px Outfit`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = dx >= 0 ? 'left' : 'right';
  ctx.shadowBlur = 0;

  const text = ellipsize(n.tooltipText ?? n.label, 96);
  const w = ctx.measureText(text).width;
  const h = 14;
  const padX = 7;
  const padY = 5;

  const x1 = textX + (dx >= 0 ? 0 : -w) - padX;
  const x2 = x1 + w + padX * 2;
  const y1 = textY - h / 2 - padY;
  const y2 = y1 + h + padY * 2;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  roundRect(ctx, x1, y1, x2 - x1, y2 - y1, 7);
  ctx.fill();
  ctx.strokeStyle = hsla(n.hue, 96, 46, 0.55);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fillText(text, textX, textY);
}

async function loadData() {
  try {
    const resList = await fetch('/languages/lang_list.json');
    const list = await resList.json();
    langList = Array.isArray(list) ? list : [];

    islandLangMap = new Map();
    provinceLangMap = new Map();
    for (const item of langList) {
      const bahasa = item?.bahasa?.toString?.() ?? '';
      if (!bahasa) continue;

      const wilayahParts = splitParts(item?.wilayah?.toString?.() ?? '');
      const uniqueWilayah = new Set();
      for (let w of wilayahParts) {
        if (w === 'Nusa Tenggara Barat' || w === 'Nusa Tenggara Timur') w = 'Nusa Tenggara';
        uniqueWilayah.add(w);
      }
      
      for (const w of uniqueWilayah) {
        if (!islandLangMap.has(w)) islandLangMap.set(w, []);
        islandLangMap.get(w).push(bahasa);
      }

      const provParts = splitParts(item?.provinsi?.toString?.() ?? '');
      for (const p of provParts) {
        if (!provinceLangMap.has(p)) provinceLangMap.set(p, []);
        provinceLangMap.get(p).push(bahasa);
      }
    }

    const aggregatedIslands = aggregateCounts(list, 'wilayah', 'wilayah', (w) => {
      if (w === 'Nusa Tenggara Barat' || w === 'Nusa Tenggara Timur') return 'Nusa Tenggara';
      return w;
    });
    const aggregatedProvinces = aggregateCounts(list, 'provinsi', 'provinsi');

    islandData = allocateCircles(aggregatedIslands, numCircles);
    provinceData = allocateCircles(aggregatedProvinces, numCircles);

    init();
  } catch (e) {
    console.error("Failed to load data", e);
  }
}

function aggregateCounts(list, field, outKey, normalizer) {
  const map = new Map();

  for (const item of list) {
    const raw = item?.[field];
    if (!raw || typeof raw !== 'string') continue;
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const unique = new Set();
    for (let part of parts) {
      if (normalizer) part = normalizer(part);
      unique.add(part);
    }
    
    for (const part of unique) {
      map.set(part, (map.get(part) ?? 0) + 1);
    }
  }

  const data = Array.from(map.entries()).map(([label, count]) => ({
    [outKey]: label,
    jumlah_bahasa: count
  }));

  data.sort((a, b) => b.jumlah_bahasa - a.jumlah_bahasa);
  return data;
}

function allocateCircles(data, totalCircles) {
  const total = data.reduce((sum, d) => sum + d.jumlah_bahasa, 0) || 1;

  const allocations = data.map((d, idx) => {
    const exact = (d.jumlah_bahasa / total) * totalCircles;
    const floored = Math.floor(exact);
    return {
      idx,
      exact,
      floored,
      frac: exact - floored
    };
  });

  let used = allocations.reduce((sum, a) => sum + a.floored, 0);
  let remaining = totalCircles - used;

  allocations.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < allocations.length && remaining > 0; i++) {
    allocations[i].floored += 1;
    remaining -= 1;
  }
  allocations.sort((a, b) => a.idx - b.idx);

  return data.map((d, i) => ({
    ...d,
    circle_count: allocations[i]?.floored ?? 0
  }));
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  // We handle scaling in draw loop to support globalZoom
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvasRect = canvas.getBoundingClientRect();
}

window.addEventListener('resize', resize);
resize();

function init() {
  for (let i = 0; i < numCircles; i++) {
    circles.push(new Circle(i));
  }

  applyScene(0);
  loop();
}

function applyScene(nextIndex) {
  const n = scenes.length || 1;
  const prevIndex = sceneIndex;
  sceneIndex = ((nextIndex % n) + n) % n;
  
  // Text Transition Animation
  if (prevIndex !== sceneIndex) {
     textAnim.prevScene = scenes[prevIndex];
     textAnim.prevOpacity = 1;
     textAnim.prevYOffset = 0;
     
     textAnim.opacity = 0;
     textAnim.yOffset = 30; // Start from below
  }

  const scene = scenes[sceneIndex];
  scene.apply();
}

function wrapText(ctx, text, maxWidth) {
  const words = (text ?? '').toString().trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawSceneText(scene, opacity, yOffset) {
  if (opacity <= 0.01) return;
  
  const s = uiScale();
  const alignRight = scene.align === 'right';
  
  // Position text lower down and with more breathing room
  const topMargin = Math.max(60, height * 0.12);
  const sideMargin = Math.max(24, width * 0.08);
  
  const maxTextW = Math.min(Math.round(580 * s), width - sideMargin * 2);
  
  const textBoxX = alignRight 
    ? (width - sideMargin - maxTextW) 
    : (width - maxTextW) / 2;
    
  const textX = alignRight ? (textBoxX + maxTextW) : (textBoxX + maxTextW / 2);
  
  const titleSize = Math.round(32 * s);
  const titleFont = `400 ${titleSize}px "Playfair Display", serif`;
  
  const bodySize = Math.round(15 * s);
  const bodyFont = `300 ${bodySize}px Outfit, sans-serif`;
  
  const lineH = Math.round(bodySize * 1.5);
  const gap = Math.round(16 * s);
  const titleY = topMargin + yOffset;
  const captionY = titleY + titleSize + gap;
  
  const maxLines = width < 520 ? 4 : 5;

  const nextText = (sceneIndex === scenes.length - 1) ? 'Kembali ↺' : 'Selanjutnya →';
  
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = bodyFont;
  const capLines = wrapText(ctx, scene.caption, maxTextW);
  const lines = capLines.slice(0, maxLines);
  
  // Only draw gradient bg for the main scene, or if we want transition to include bg?
  // Let's draw BG only if opacity > 0.5 to avoid double dark overlay?
  // Actually, we should probably separate BG from text.
  // But for now let's draw it with alpha.
  
  const fadeH = (captionY - yOffset) + (lines.length + 1) * lineH + 60;
  // Use fixed height for gradient based on layout, ignore offset for the gradient box?
  // Or move gradient with text?
  // Let's move gradient with text.
  
  const grad = ctx.createLinearGradient(0, yOffset, 0, fadeH + yOffset);
  grad.addColorStop(0, `rgba(15, 23, 42, ${0.98 * opacity})`);
  grad.addColorStop(0.7, `rgba(15, 23, 42, ${0.9 * opacity})`);
  grad.addColorStop(1, `rgba(15, 23, 42, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, fadeH + Math.abs(yOffset) + 100); // Fill large enough area

  // Text Rendering
  ctx.textBaseline = 'top';
  ctx.textAlign = alignRight ? 'right' : 'center';
  
  // Title
  ctx.shadowColor = `rgba(0, 0, 0, ${0.8 * opacity})`;
  ctx.shadowBlur = 12;
  ctx.fillStyle = `rgba(248, 250, 252, ${opacity})`; // Light text
  ctx.font = titleFont;
  ctx.fillText(scene.title, textX, titleY);
  
  // Caption
  ctx.shadowBlur = 4;
  ctx.font = bodyFont;
  ctx.fillStyle = `rgba(203, 213, 225, ${opacity})`; // Slate 300
  let y = captionY;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], textX, y);
    y += lineH;
  }
  
  // Update textHitBox for active scene
  if (scene === scenes[sceneIndex]) {
     textHitBox = {
       x1: canvasRect.left + (alignRight ? (textX - maxTextW) : (textX - maxTextW/2)),
       y1: canvasRect.top + titleY - 10,
       x2: canvasRect.left + (alignRight ? (textX) : (textX + maxTextW/2)),
       y2: canvasRect.top + y + 10
     };
  }
  
  // Next Button
  const nextW = ctx.measureText(nextText).width;
  const nextY = y + gap;
  let nextX = alignRight ? (textX) : (textX); 
  
  // Next button hitbox - Only update for the ACTIVE scene
  if (scene === scenes[sceneIndex] && opacity > 0.8) {
    const nh = lineH;
    nextHitBox = {
      x1: canvasRect.left + (nextX - nextW/2 - 20),
      y1: canvasRect.top + (nextY - 10),
      x2: canvasRect.left + (nextX + nextW/2 + 20),
      y2: canvasRect.top + (nextY + nh + 10)
    };
  }
  
  ctx.fillStyle = COLOR_MAIN_1; // We can fade this too if we want, but it uses globalAlpha
  ctx.shadowBlur = 8;
  ctx.shadowColor = COLOR_MAIN_1;
  ctx.fillText(nextText, nextX, nextY);
  
  ctx.restore();
}

function drawStoryOverlayScreenSpace() {
  // Draw Outgoing
  if (textAnim.prevScene && textAnim.prevOpacity > 0.01) {
      // Apply visibility to outgoing as well
      const combinedPrevOpacity = textAnim.prevOpacity * textAnim.tVisible;
      // We can also apply the hiding offset to the outgoing text for consistency, 
      // but strictly speaking just opacity is enough to hide it.
      // Let's keep it simple and just modulate opacity.
      if (combinedPrevOpacity > 0.01) {
          drawSceneText(textAnim.prevScene, combinedPrevOpacity, textAnim.prevYOffset);
      }
  }
  
  // Draw Incoming
  const currentScene = scenes[sceneIndex];
  if (currentScene) {
      // Modulate opacity by tVisible
      const combinedOpacity = textAnim.opacity * textAnim.tVisible;
      const combinedY = textAnim.yOffset + (1 - textAnim.tVisible) * -20;
      drawSceneText(currentScene, combinedOpacity, combinedY);
  }
}

function layoutGrid() {
  mode = 'grid';
  labels = [];
  targetZoom = 1.0;
  defaultZoom = 1.0;
  globalZoom = width < 520 ? 1.6 : 1.2; 
  panX = 0;
  panY = 0;
  targetPanX = 0;
  targetPanY = 0;
  focusNode = null;
  barScrollable = false;

  const cx = width / 2;
  const cy = height / 2;
  const s = uiScale();
  // Phyllotaxis spiral layout
  const cScale = Math.round(16 * s);

  circles.forEach((c, i) => {
    const angle = i * 2.399963; // Golden angle in radians
    const r = cScale * Math.sqrt(i);
    
    c.tx = cx + r * Math.cos(angle);
    c.ty = cy + r * Math.sin(angle);
    c.tr = clamp(Math.round(5 * s), 3, 7);
    
    // Colorful spiral gradient
    const hue = (200 + i * 0.5) % 360;
    c.color = hsla(hue, 85, 65, 1);
    
    c.group = (langList[i]?.bahasa?.toString?.() ?? `Language ${i + 1}`);
    c.alpha = 0;
    c.tAlpha = 1;
    c.delay = i * 0.8; 
  });
}

function layoutBarChart(data, labelKey) {
  mode = 'bar';
  targetZoom = 1.0; // Reset zoom
  defaultZoom = 1.0;
  labels = [];
  panX = 0;
  panY = 0;
  targetPanX = 0;
  targetPanY = 0;
  focusNode = null;
  
  const s = uiScale();
  const margin = clamp(Math.round(width * 0.06), 14, 60);
  const chartInnerWidth = width - margin * 2;
  const minBarWidth = clamp(Math.round((width < 520 ? 52 : 36) * s), 26, 64);
  const virtualChartWidth = Math.max(chartInnerWidth, data.length * minBarWidth);
  const topInset = clamp(Math.round((width < 520 ? 108 : 92) * s), 72, 140);
  const labelRotation = (data.length > 10 || width < 520) ? -45 : 0;
  const labelFont = `${Math.round(11 * s)}px Outfit`;
  ctx.save();
  ctx.font = labelFont;
  const maxLabelW = data.reduce((m, d) => Math.max(m, ctx.measureText((d?.[labelKey] ?? '').toString()).width), 0);
  ctx.restore();
  const isMobile = width < 520;
  const extraBottom = (labelRotation && isMobile)
    ? Math.round(Math.min(92, maxLabelW * 0.34))
    : (labelRotation ? Math.round(Math.min(120, maxLabelW * 0.46)) : Math.round(Math.min(44, maxLabelW * 0.10)));
  const bottomPad = (labelRotation && isMobile)
    ? clamp(Math.round(92 * s) + extraBottom, 76, 190)
    : clamp(Math.round(104 * s) + extraBottom, 88, 240);
  const chartHeight = clamp(Math.round(height - bottomPad - topInset), 160, Math.round(height * 0.82));
  const startY = height - bottomPad; // Bottom of bars
  
  const barWidth = virtualChartWidth / data.length;
  const barGap = clamp(Math.round(barWidth * 0.14), 2, 12);
  const effectiveBarWidth = barWidth - barGap;

  const maxCount = Math.max(...data.map(d => d.circle_count ?? d.jumlah_bahasa));
  const packing = pickBarPacking({ effectiveBarWidth, chartHeight, maxCount });
  const r = packing.r;
  const diameter = packing.diameter;
  const actualCols = packing.cols;

  barScrollable = virtualChartWidth > chartInnerWidth + 1;
  barMinPanX = Math.min(0, chartInnerWidth - virtualChartWidth);
  barMaxPanX = 0;
  panX = clamp(panX, barMinPanX, barMaxPanX);
  targetPanX = panX;

  let circleIndex = 0;

  data.forEach((item, i) => {
    const count = item.circle_count ?? item.jumlah_bahasa;
    const centerX = margin + i * barWidth + effectiveBarWidth / 2;
    const groupLabel = item[labelKey];
    const candidates = (labelKey === 'wilayah' ? islandLangMap : provinceLangMap).get(groupLabel) ?? [];
    
    const totalCount = item.jumlah_bahasa ?? count;
    const countY = startY + Math.round(12 * s);
    const labelY = startY + Math.round(30 * s);

    labels.push({
      x: centerX,
      y: countY,
      text: `${totalCount}`,
      rotation: 0,
      font: labelFont,
      fillStyle: 'rgba(203, 213, 225, 0.8)'
    });

    // Add label
    labels.push({
      x: centerX,
      y: labelY,
      text: item[labelKey],
      rotation: labelRotation, // Rotate labels if many
      font: labelFont,
      fillStyle: 'rgba(241, 245, 249, 0.9)'
    });

    // Assign circles
    for (let j = 0; j < count; j++) {
      if (circleIndex >= circles.length) break;
      
      const c = circles[circleIndex];
      const col = j % actualCols;
      const row = Math.floor(j / actualCols);
      
      c.tx = centerX - (actualCols * diameter)/2 + col * diameter + diameter/2;
      c.ty = startY - row * diameter - diameter/2;
      c.tr = r;
      c.color = (i % 2 === 0) ? COLOR_MAIN_1 : COLOR_MAIN_2;
      c.group = candidates.length ? candidates[j % candidates.length] : `${groupLabel}`;
      c.delay = j * 0.2; // Ripple up effect? Or just 0
      c.tAlpha = 1;
      
      circleIndex++;
    }
  });

  // Hide unused
  for (let i = circleIndex; i < circles.length; i++) {
    circles[i].tAlpha = 0;
    circles[i].tr = 0;
  }
}

function splitParts(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function drawCircleHoverChipScreenSpace() {
  if (!hoveredCircle) return;
  if (hoveredCircle.alpha < 0.25) return;

  const c = hoveredCircle;
  const centerX = width / 2 + panX;
  const centerY = height / 2 + panY;
  const sx = (c.x - width / 2) * globalZoom + centerX;
  const sy = (c.y - height / 2) * globalZoom + centerY;

  const vx = sx - centerX;
  const vy = sy - centerY;
  const vLen = Math.hypot(vx, vy) || 1;
  const dx = vx / vLen;
  const dy = vy / vLen;

  const pad = (c.r * globalZoom) + 12;
  const textX = sx + dx * pad;
  const textY = sy + dy * pad;

  ctx.font = `${Math.round(12 * uiScale())}px Outfit`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = dx >= 0 ? 'left' : 'right';
  ctx.shadowBlur = 0;

  const text = ellipsize(c.group ?? '', 96);
  const w = ctx.measureText(text).width;
  const h = 14;
  const padX = 7;
  const padY = 5;

  const x1 = textX + (dx >= 0 ? 0 : -w) - padX;
  const x2 = x1 + w + padX * 2;
  const y1 = textY - h / 2 - padY;
  const y2 = y1 + h + padY * 2;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  roundRect(ctx, x1, y1, x2 - x1, y2 - y1, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.75)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fillText(text, textX, textY);
}

function layoutTree() {
  mode = 'tree';
  labels = [];
  panX = 0;
  panY = 0;
  targetPanX = 0;
  targetPanY = 0;
  focusNode = null;
  targetZoom = 1.0;
  globalZoom = width < 520 ? 1.35 : 1.7;
  targetZoom = globalZoom;
  defaultZoom = globalZoom;
  tooltip.style.display = 'none';
  barScrollable = false;
  treeFrame = 0;

  for (const c of circles) {
    c.tAlpha = 0;
    c.tr = 0;
  }

  treeNodes.length = 0;
  treeEdges.length = 0;

  const islands = new Map();

  for (const item of langList) {
    const bahasa = item?.bahasa?.toString?.() ?? '';
    if (!bahasa) continue;
    const wilayahRaw = item?.wilayah?.toString?.() ?? '';
    const provRaw = item?.provinsi?.toString?.() ?? '';

    let wilayah = splitParts(wilayahRaw)[0] ?? 'Unknown';
    if (wilayah === 'Nusa Tenggara Barat' || wilayah === 'Nusa Tenggara Timur') wilayah = 'Nusa Tenggara';
    const provinsi = splitParts(provRaw)[0] ?? 'Unknown';

    if (!islands.has(wilayah)) islands.set(wilayah, { name: wilayah, count: 0, provinces: new Map() });
    const island = islands.get(wilayah);
    island.count += 1;

    if (!island.provinces.has(provinsi)) island.provinces.set(provinsi, { name: provinsi, count: 0, languages: [] });
    const prov = island.provinces.get(provinsi);
    prov.count += 1;
    prov.languages.push({ name: bahasa, no: item?.no });
  }

  const islandList = Array.from(islands.values()).sort((a, b) => b.count - a.count);
  const totalLang = islandList.reduce((sum, i) => sum + i.count, 0) || 1;

  const cx = width / 2;
  const cy = height / 2;
  const inset = clamp(Math.round(Math.min(width, height) * 0.085), 40, 90);
  const maxR = Math.min(width, height) / 2 - inset;
  const r3 = Math.max(0, maxR);
  const r2 = Math.max(0, r3 * 0.72);
  const r1 = Math.max(0, r3 * 0.44);
  const s = uiScale();
  const LANG_ARC_SPACING = 10 * s;
  const LANG_RADIAL_STEP = 9 * s;
  const PROV_ARC_SPACING = 34 * s;
  const ISLAND_BASE_HUES = [196, 264, 322, 36, 86, 142, 170, 214, 292];
  const PROV_HUE_SPREAD = 26;
  const LANG_HUE_SPREAD = 16;

  const ROOT_TO_ISLAND_DELAY = 18;
  const ISLAND_STAGGER = 10;
  const ISLAND_TO_PROV_DELAY = 14;
  const PROV_STAGGER = 3.8;
  const PROV_TO_LANG_DELAY = 10;
  const LANG_STAGGER = 0.7;

  const root = new Node({
    id: 'root',
    kind: 'root',
    label: 'Bahasa Nusantara',
    hue: 190,
    tooltipText: `Total languages: ${langList.length}`
  });
  root.tr = 9;
  root.tAlpha = 1;
  root.tx = cx;
  root.ty = cy;
  root.alpha = 0;
  root.delay = 0;
  treeNodes.push(root);

  let startAngle = -Math.PI / 2;

  for (let islandIdx = 0; islandIdx < islandList.length; islandIdx++) {
    const island = islandList[islandIdx];
    const span = (island.count / totalLang) * Math.PI * 2;
    const mid = startAngle + span / 2;
    const islandHue = ISLAND_BASE_HUES[islandIdx % ISLAND_BASE_HUES.length];

    const islandNode = new Node({
      id: `island:${island.name}`,
      kind: 'island',
      label: island.name,
      hue: islandHue,
      tooltipText: `${island.name} (${island.count})`
    });
    islandNode.tr = 5.2;
    islandNode.tAlpha = 1;
    islandNode.tx = cx + Math.cos(mid) * r1;
    islandNode.ty = cy + Math.sin(mid) * r1;
    islandNode.x = cx + (Math.random() - 0.5) * 40;
    islandNode.y = cy + (Math.random() - 0.5) * 40;
    islandNode.alpha = 0;
    islandNode.delay = ROOT_TO_ISLAND_DELAY + islandIdx * ISLAND_STAGGER;
    islandNode._angle = mid;
    treeNodes.push(islandNode);

    treeEdges.push(makeEdge(root, islandNode, cx, cy));

    const provList = Array.from(island.provinces.values()).sort((a, b) => b.count - a.count);
    const arcLenProv = r2 * span;
    const provPerRing = clamp(Math.floor(arcLenProv / PROV_ARC_SPACING), 1, provList.length || 1);
    const provRings = Math.ceil((provList.length || 1) / provPerRing);
    const maxProvRadius = r3 * 0.94;
    const provStep = provRings <= 1 ? 0 : clamp((maxProvRadius - r2) / (provRings - 1), 8, 26);
    const MIN_PROV_SPAN = 0.10;

    const provSpanRaw = provList.map(p => Math.max((p.count / island.count) * span, MIN_PROV_SPAN));
    const provSpanSum = provSpanRaw.reduce((s, v) => s + v, 0) || 1;
    const provSpanScale = span / provSpanSum;

    let provAngle = startAngle;

    for (let pIdx = 0; pIdx < provList.length; pIdx++) {
      const prov = provList[pIdx];
      const pSpan = provSpanRaw[pIdx] * provSpanScale;
      const pMid = provAngle + pSpan / 2;
      const pFrac = (pMid - startAngle) / (span || 1);
      const provHue = islandHue + (pFrac - 0.5) * PROV_HUE_SPREAD;

      const provNode = new Node({
        id: `province:${island.name}:${prov.name}`,
        kind: 'province',
        label: prov.name,
        hue: provHue,
        tooltipText: `${prov.name} (${prov.count})`
      });
      provNode.tr = 3.8;
      provNode.tAlpha = 1;
      const provRing = Math.floor(pIdx / provPerRing);
      const ringOffset = (provRing - (provRings - 1) / 2) * 0.012;
      const provA = pMid + ringOffset;
      const provR = r2 + provRing * provStep;
      provNode.tx = cx + Math.cos(provA) * provR;
      provNode.ty = cy + Math.sin(provA) * provR;
      provNode.x = cx + (Math.random() - 0.5) * 50;
      provNode.y = cy + (Math.random() - 0.5) * 50;
      provNode.alpha = 0;
      provNode.delay = islandNode.delay + ISLAND_TO_PROV_DELAY + pIdx * PROV_STAGGER;
      provNode._angle = provA;
      treeNodes.push(provNode);

      treeEdges.push(makeEdge(islandNode, provNode, cx, cy));

      const langCount = prov.languages.length || 1;
      const arcLen = r3 * pSpan;
      const perRing = clamp(Math.floor(arcLen / LANG_ARC_SPACING), 1, langCount);
      const langStartA = provAngle;

      for (let lIdx = 0; lIdx < prov.languages.length; lIdx++) {
        const lang = prov.languages[lIdx];
        const ring = Math.floor(lIdx / perRing);
        const pos = lIdx % perRing;
        const a = langStartA + pSpan * ((pos + 0.5) / perRing);
        const lFrac = (a - startAngle) / (span || 1);
        const langHue = islandHue + (lFrac - 0.5) * (PROV_HUE_SPREAD + LANG_HUE_SPREAD) + ring * 3;
        const jitter = (Math.random() - 0.5) * 4;
        const rr = r3 + ring * LANG_RADIAL_STEP + jitter;

        const langNode = new Node({
          id: `lang:${lang.no ?? `${island.name}:${prov.name}:${lang.name}`}`,
          kind: 'language',
          label: shortenLanguageName(lang.name),
          hue: langHue,
          tooltipText: lang.name
        });
        langNode.tr = 2.1;
        langNode.tAlpha = 1;
        langNode.tx = cx + Math.cos(a) * rr;
        langNode.ty = cy + Math.sin(a) * rr;
        langNode.x = cx + (Math.random() - 0.5) * 60;
        langNode.y = cy + (Math.random() - 0.5) * 60;
        langNode.alpha = 0;
        langNode.delay = provNode.delay + PROV_TO_LANG_DELAY + lIdx * LANG_STAGGER;
        langNode._angle = a;
        treeNodes.push(langNode);

        treeEdges.push(makeEdge(provNode, langNode, cx, cy));
      }

      provAngle += pSpan;
    }

    startAngle += span;
  }
}

function makeEdge(a, b, cx, cy) {
  const mx = (a.tx + b.tx) / 2;
  const my = (a.ty + b.ty) / 2;
  const vx = b.tx - a.tx;
  const vy = b.ty - a.ty;
  const len = Math.hypot(vx, vy) || 1;
  const nx = -vy / len;
  const ny = vx / len;
  const bend = (Math.random() - 0.5) * 90;
  const pullToCenter = 0.12;

  return {
    a,
    b,
    cpx: mx + nx * bend + (cx - mx) * pullToCenter,
    cpy: my + ny * bend + (cy - my) * pullToCenter,
    stroke: hsla((a.hue + b.hue) / 2, 75, 55, 1)
  };
}

function loop() {
  globalZoom += (targetZoom - globalZoom) * 0.05;
  if (mode === 'tree') treeFrame++;
  else treeFrame = 0;
  
  // Center camera on focusNode if set (works for both Tree nodes and Circles now)
  if (focusNode) {
    targetPanX = -(focusNode.x - width / 2) * globalZoom;
    targetPanY = -(focusNode.y - height / 2) * globalZoom;
    // Smoothly interpolate panX/panY to target
    panX += (targetPanX - panX) * 0.12;
    panY += (targetPanY - panY) * 0.12;
  } else {
    // When NOT focusing, we are likely dragging or just sitting there.
    // If we are dragging, panX/panY are set directly by pointer events.
    // If we just released drag, targetPanX is set to last panX.
    // So we should just interpolate to targetPanX normally.
    panX += (targetPanX - panX) * 0.12;
    panY += (targetPanY - panY) * 0.12;
  }

  // Animate text
  textAnim.opacity += (1 - textAnim.opacity) * 0.08;
  textAnim.yOffset += (0 - textAnim.yOffset) * 0.08;
  
  // Visibility Animation
  const targetVis = textAnim.visible ? 1 : 0;
  textAnim.tVisible += (targetVis - textAnim.tVisible) * 0.12;

  if (textAnim.prevOpacity > 0) {
      textAnim.prevOpacity += (0 - textAnim.prevOpacity) * 0.15; // Fade out faster
      textAnim.prevYOffset += (-20 - textAnim.prevYOffset) * 0.1; // Move up
  }

  // Reset Button Visibility
  if (resetBtn) {
    const isZoomed = Math.abs(targetZoom - defaultZoom) > 0.05 || Math.abs(targetPanX) > 10 || Math.abs(targetPanY) > 10 || focusNode !== null;
    if (isZoomed) resetBtn.classList.add('visible');
    else resetBtn.classList.remove('visible');
  }

  // Clear
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height); // use raw canvas size

  ctx.save();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.scale(dpr, dpr);
  
  // Apply zoom centered
  ctx.translate(width/2 + panX, height/2 + panY);
  ctx.scale(globalZoom, globalZoom);
  ctx.translate(-width/2, -height/2);

  if (mode === 'tree') {
    for (const n of treeNodes) n.update();

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const e of treeEdges) {
      const a = e.a;
      const b = e.b;
      const alpha = Math.min(a.alpha, b.alpha) * 0.75;
      if (alpha <= 0.02) continue;

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = e.stroke;
      const screenW = clamp(0.35 + 0.12 * globalZoom, 0.42, 1.05);
      ctx.lineWidth = screenW / globalZoom;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(e.cpx, e.cpy, b.x, b.y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();

    for (const n of treeNodes) n.drawDot();
    provinceLabelBoxes = [];
    for (const n of treeNodes) n.drawLabel();
    provinceLabelBoxes = null;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTreeLanguageLabelsScreenSpace();
    drawTreeHoverChipScreenSpace();
    drawStoryOverlayScreenSpace();
    ctx.restore();
  } else {
    // Draw Circles
    circles.forEach(c => {
      c.update();
      c.draw();
    });

    // Draw Labels
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = `${Math.round(12 * uiScale())}px Outfit`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    labels.forEach(l => {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.font = l.font ?? ctx.font;
      ctx.fillStyle = l.fillStyle ?? ctx.fillStyle;
      if (l.rotation) {
        ctx.rotate(l.rotation * Math.PI / 180);
        ctx.textAlign = 'right';
      } else {
        ctx.textAlign = 'center';
      }
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    });

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCircleHoverChipScreenSpace();
    drawStoryOverlayScreenSpace();
    ctx.restore();
  }

  ctx.restore();

  requestAnimationFrame(loop);
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const rawX = clientX - rect.left;
  const rawY = clientY - rect.top;
  const worldX = (rawX - width / 2 - panX) / globalZoom + width / 2;
  const worldY = (rawY - height / 2 - panY) / globalZoom + height / 2;
  return { worldX, worldY };
}

function updateHoverAt(clientX, clientY, extraRadius) {
  const { worldX, worldY } = screenToWorld(clientX, clientY);
  const extra = extraRadius ?? 0;

  if (mode === 'tree') {
    let found = null;
    for (let i = treeNodes.length - 1; i >= 0; i--) {
      const n = treeNodes[i];
      if (n.alpha < 0.4) continue;
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      const r = n.r + 3 + extra;
      if (dx * dx + dy * dy < r * r) {
        found = n;
        break;
      }
    }
    hoveredNode = found;
    hoveredCircle = null;
    tooltip.style.display = 'none';
    return;
  }

  let found = null;
  for (let i = 0; i < circles.length; i++) {
    const c = circles[i];
    if (c.alpha < 0.5) continue;
    const dx = worldX - c.x;
    const dy = worldY - c.y;
    const r = c.r + 2 + extra;
    if (dx * dx + dy * dy < r * r + 4) {
      found = c;
      break;
    }
  }
  hoveredCircle = found;
  hoveredNode = null;
  tooltip.style.display = 'none';
}

function focusCircle(c) {
  if (!c) return;
  // Calculate target pan to center the circle
  // We want: (c.x - width/2) * zoom + panX = 0 => panX = -(c.x - width/2) * zoom
  // But we animate to targetPanX
  const z = 4.0; // Zoom level for individual circle
  targetZoom = z;
  focusNode = { x: c.x, y: c.y }; // Reuse focusNode concept for centering logic in loop()
}

function focusHoveredNode() {
  if (!hoveredNode) return;
  focusNode = hoveredNode;
  let z = targetZoom;
  if (focusNode.kind === 'root') z = 2.0;
  else if (focusNode.kind === 'island') z = 2.8;
  else if (focusNode.kind === 'province') z = 4.2;
  else z = 7.0;
  targetZoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
}

const pointers = new Map();
let pinchStartDist = null;
let pinchStartZoom = null;
let hoverClearTimer = null;
let navStartX = 0;
let navStartY = 0;
let navStartT = 0;

canvas.addEventListener('pointerdown', (e) => {
  if (nextHitBox && e.clientX >= nextHitBox.x1 && e.clientX <= nextHitBox.x2 && e.clientY >= nextHitBox.y1 && e.clientY <= nextHitBox.y2) {
    nextPointerId = e.pointerId;
    return;
  }
  
  // Check if clicked on text box
  if (textAnim.visible && textHitBox && e.clientX >= textHitBox.x1 && e.clientX <= textHitBox.x2 && e.clientY >= textHitBox.y1 && e.clientY <= textHitBox.y2) {
     textPointerId = e.pointerId;
     return;
  }
  
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture?.(e.pointerId);

  if (pointers.size === 1) {
    navStartX = e.clientX;
    navStartY = e.clientY;
    navStartT = performance.now();
  }

  const extra = isCoarsePointer() ? 7 : 0;
  updateHoverAt(e.clientX, e.clientY, extra);

  if (mode === 'tree') {
    isDragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panX;
    dragStartPanY = panY;
    focusNode = null;
  } else if (mode === 'grid') {
    isDragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panX;
    dragStartPanY = panY;
    focusNode = null;
  } else if (mode === 'bar') {
    isDragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panX;
    dragStartPanY = panY;
    focusNode = null;
    barIsDragging = true;
    barDragStartX = e.clientX;
    barDragStartPanX = panX;
  } else if (isCoarsePointer()) {
    // Only if NOT dragging
    if (hoverClearTimer) window.clearTimeout(hoverClearTimer);
    hoverClearTimer = window.setTimeout(() => {
      hoveredCircle = null;
    }, 2200);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  const extra = isCoarsePointer() ? 7 : 0;

  if (mode === 'tree' && pointers.size >= 2) {
    const pts = Array.from(pointers.values());
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    const dist = Math.hypot(dx, dy);
    if (pinchStartDist == null) {
      pinchStartDist = dist || 1;
      pinchStartZoom = targetZoom;
    } else {
      const factor = (dist || 1) / pinchStartDist;
      targetZoom = clamp((pinchStartZoom || targetZoom) * factor, ZOOM_MIN, ZOOM_MAX);
      focusNode = null;
    }
    updateHoverAt(e.clientX, e.clientY, extra);
    return;
  }

  pinchStartDist = null;
  pinchStartZoom = null;

  if ((mode === 'tree' || mode === 'grid') && isDragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (!dragMoved && (dx * dx + dy * dy) > 16) dragMoved = true;
    
    // Direct manipulation of panX/panY
    panX = dragStartPanX + dx;
    panY = dragStartPanY + dy;
    
    // IMPORTANT: Sync targetPanX to current panX so that when we release, 
    // it doesn't try to tween back to an old target or focus point.
    targetPanX = panX;
    targetPanY = panY;
    
    // Explicitly clear focusNode to stop the loop() from overriding our pan
    focusNode = null; 
  }

  if (mode === 'bar' && isDragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (!dragMoved && (dx * dx + dy * dy) > 16) dragMoved = true;
    // Allow X panning
    panX = dragStartPanX + dx;
    panY = dragStartPanY + dy; 
    
    targetPanX = panX;
    targetPanY = panY;
    focusNode = null;
  }

  updateHoverAt(e.clientX, e.clientY, extra);
});

function endPointerInteraction(e) {
  if (nextPointerId === e.pointerId) {
    if (nextHitBox && e.clientX >= nextHitBox.x1 && e.clientX <= nextHitBox.x2 && e.clientY >= nextHitBox.y1 && e.clientY <= nextHitBox.y2) {
      applyScene(sceneIndex + 1);
    }
    nextPointerId = null;
    return;
  }
  
  if (textPointerId === e.pointerId) {
     if (textAnim.visible && textHitBox && e.clientX >= textHitBox.x1 && e.clientX <= textHitBox.x2 && e.clientY >= textHitBox.y1 && e.clientY <= textHitBox.y2) {
         textAnim.visible = false;
     }
     textPointerId = null;
     return;
  }
  
  pointers.delete(e.pointerId);
  if (pointers.size < 2) {
    pinchStartDist = null;
    pinchStartZoom = null;
  }
  if (mode === 'tree') {
    isDragging = false;
    suppressClick = dragMoved;
    dragMoved = false;
    if (!suppressClick) focusHoveredNode();
    return;
  }
  
  if (mode === 'grid' || mode === 'bar') {
    isDragging = false;
    suppressClick = dragMoved;
    dragMoved = false;
    barIsDragging = false;
    if (!suppressClick && hoveredCircle) {
      focusCircle(hoveredCircle);
    }
    return;
  }

  if (!isCoarsePointer()) return;
  if (mode === 'tree') return;
  if (mode === 'bar' && barScrollable && Math.abs((e.clientX ?? 0) - navStartX) > Math.abs((e.clientY ?? 0) - navStartY)) return;

  const dt = performance.now() - (navStartT || 0);
  const dx = (e.clientX ?? 0) - navStartX;
  const dy = (e.clientY ?? 0) - navStartY;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (dt > 900) return;
  if (ady < 52) return;
  if (ady < adx * 1.25) return;

  if (dy < 0) applyScene(sceneIndex + 1);
  else applyScene(sceneIndex - 1);
}

canvas.addEventListener('pointerup', endPointerInteraction);
canvas.addEventListener('pointercancel', endPointerInteraction);

window.addEventListener('wheel', (e) => {
  if (mode !== 'tree') return;
  e.preventDefault();
  const factor = Math.exp((-e.deltaY) * 0.0015);
  targetZoom = clamp(targetZoom * factor, ZOOM_MIN, ZOOM_MAX);
  focusNode = null;
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  if (e.key === 'ArrowRight') applyScene(sceneIndex + 1);
  else if (e.key === 'ArrowLeft') applyScene(sceneIndex - 1);
});

if (resetBtn) {
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    targetZoom = defaultZoom;
    targetPanX = 0;
    targetPanY = 0;
    focusNode = null;
  });
}

if (infoBtn && infoModal) {
  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!textAnim.visible) {
       textAnim.visible = true;
    } else {
       infoModal.classList.add('open');
    }
  });
}

if (modalClose && infoModal) {
  modalClose.addEventListener('click', (e) => {
    e.stopPropagation();
    infoModal.classList.remove('open');
  });
}

if (infoModal) {
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) {
      infoModal.classList.remove('open');
    }
  });
}

loadData();
