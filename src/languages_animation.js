import './style.css';

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

let width, height;
const circles = [];
const numCircles = 718;
let langList = [];
let islandData = [];
let provinceData = [];

// Colors
const COLOR_MAIN_1 = '#38bdf8'; // Sky blue
const COLOR_MAIN_2 = '#818cf8'; // Indigo
const COLOR_ACCENT = '#f472b6'; // Pink
const COLOR_BG = '#0f172a'; // Dark slate
const COLOR_TEXT = '#94a3b8'; // Slate 400

const tooltip = document.getElementById('tooltip');

// Global animation state
let globalZoom = 2.0;
let targetZoom = 1.0;
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

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 12.0;

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
    this.color = hsla(this.hue, 92, 64, 1);

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
    ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.font = this.kind === 'root' ? '16px Outfit' : (this.kind === 'province' ? '7px Outfit' : '10px Outfit');
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
  const centerX = width / 2 + panX;
  const centerY = height / 2 + panY;
  const minZoom = 1.7;

  const items = [];
  for (const n of treeNodes) {
    if (n.kind !== 'language') continue;
    if (n.alpha < 0.35) continue;
    items.push(n);
  }

  items.sort((a, b) => a.y - b.y);

  const placed = [];
  const limit = Math.floor(clamp(120 + (globalZoom - 1.8) * 520, 120, 1800));
  let count = 0;

  for (const n of items) {
    if (globalZoom < minZoom) continue;
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

    ctx.font = '7px Outfit';
    ctx.textBaseline = 'middle';
    ctx.textAlign = dx >= 0 ? 'left' : 'right';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.70)';
    ctx.shadowColor = 'rgba(2, 6, 23, 0.7)';
    ctx.shadowBlur = 6;

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

  ctx.font = '12px Outfit';
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

  ctx.fillStyle = 'rgba(2, 6, 23, 0.84)';
  roundRect(ctx, x1, y1, x2 - x1, y2 - y1, 7);
  ctx.fill();
  ctx.strokeStyle = hsla(n.hue, 96, 72, 0.65);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.fillText(text, textX, textY);
}

async function loadData() {
  try {
    const resList = await fetch('/languages/lang_list.json');
    const list = await resList.json();
    langList = Array.isArray(list) ? list : [];

    const aggregatedIslands = aggregateCounts(list, 'wilayah', 'wilayah');
    const aggregatedProvinces = aggregateCounts(list, 'provinsi', 'provinsi');

    islandData = allocateCircles(aggregatedIslands, numCircles);
    provinceData = allocateCircles(aggregatedProvinces, numCircles);

    init();
  } catch (e) {
    console.error("Failed to load data", e);
  }
}

function aggregateCounts(list, field, outKey) {
  const map = new Map();

  for (const item of list) {
    const raw = item?.[field];
    if (!raw || typeof raw !== 'string') continue;
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
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
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  // We handle scaling in draw loop to support globalZoom
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

window.addEventListener('resize', resize);
resize();

function init() {
  for (let i = 0; i < numCircles; i++) {
    circles.push(new Circle(i));
  }
  
  // Start with Grid Layout
  layoutGrid();
  
  loop();
}

function layoutGrid() {
  mode = 'grid';
  labels = [];
  targetZoom = 1.0;
  globalZoom = 3.0; // Start zoomed in
  panX = 0;
  panY = 0;
  targetPanX = 0;
  targetPanY = 0;
  focusNode = null;

  const cols = Math.ceil(Math.sqrt(numCircles * (width / height)));
  const rows = Math.ceil(numCircles / cols);
  const gap = 20;
  const offsetX = (width - cols * gap) / 2;
  const offsetY = (height - rows * gap) / 2;

  circles.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    
    // Random start position near center for "explosion" or just center
    c.x = width/2 + (Math.random() - 0.5) * 100;
    c.y = height/2 + (Math.random() - 0.5) * 100;
    
    c.tx = offsetX + col * gap;
    c.ty = offsetY + row * gap;
    c.tr = 6;
    c.color = COLOR_MAIN_1;
    c.group = `Language ${i + 1}`;
    c.alpha = 0;
    c.tAlpha = 1;
    // Cascade effect
    c.delay = i * 0.5; // fast cascade
  });
}

function layoutBarChart(data, labelKey) {
  mode = 'bar';
  targetZoom = 1.0; // Reset zoom
  labels = [];
  panX = 0;
  panY = 0;
  targetPanX = 0;
  targetPanY = 0;
  focusNode = null;
  
  const margin = 60;
  const chartWidth = width - margin * 2;
  const chartHeight = height * 0.6; // Max height of bars
  const startY = height - 100; // Bottom of bars
  
  const barWidth = chartWidth / data.length;
  const barGap = Math.max(2, barWidth * 0.1);
  const effectiveBarWidth = barWidth - barGap;

  // Calculate radius based on the dataset's max count
  // to ensure consistency across all bars in this chart.
  const maxCount = Math.max(...data.map(d => d.circle_count ?? d.jumlah_bahasa));
  
  // Try to fit the largest bar into chartHeight
  // maxCount * (2r)^2 <= effectiveBarWidth * chartHeight
  let r = Math.sqrt((effectiveBarWidth * chartHeight) / maxCount) / 2.5;
  
  // Apply constraints
  r = Math.min(r, effectiveBarWidth / 2.5); // At least 1 column
  r = Math.min(r, 6); // Max radius
  r = Math.max(r, 2); // Min radius (ensure visibility)
  
  const diameter = r * 2.2; 
  const cols = Math.floor(effectiveBarWidth / diameter);
  const actualCols = Math.max(1, cols);

  let circleIndex = 0;

  data.forEach((item, i) => {
    const count = item.circle_count ?? item.jumlah_bahasa;
    const centerX = margin + i * barWidth + effectiveBarWidth / 2;
    
    // Add label
    labels.push({
      x: centerX,
      y: startY + 20,
      text: item[labelKey],
      rotation: data.length > 10 ? -45 : 0 // Rotate labels if many
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
      c.group = `${item[labelKey]}: ${item.jumlah_bahasa} languages`;
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

function layoutTree() {
  mode = 'tree';
  labels = [];
  panX = 0;
  panY = 0;
  targetPanX = 0;
  targetPanY = 0;
  focusNode = null;
  targetZoom = 1.0;
  globalZoom = 1.7;
  targetZoom = globalZoom;
  tooltip.style.display = 'none';

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

    const wilayah = splitParts(wilayahRaw)[0] ?? 'Unknown';
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
  const maxR = Math.min(width, height) / 2 - 90;
  const r3 = Math.max(0, maxR);
  const r2 = Math.max(0, r3 * 0.72);
  const r1 = Math.max(0, r3 * 0.44);
  const LANG_ARC_SPACING = 10;
  const LANG_RADIAL_STEP = 9;
  const PROV_ARC_SPACING = 34;
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
    cpy: my + ny * bend + (cy - my) * pullToCenter
  };
}

function loop() {
  globalZoom += (targetZoom - globalZoom) * 0.05;
  if (mode === 'tree' && focusNode) {
    targetPanX = -(focusNode.x - width / 2) * globalZoom;
    targetPanY = -(focusNode.y - height / 2) * globalZoom;
  }
  panX += (targetPanX - panX) * 0.12;
  panY += (targetPanY - panY) * 0.12;

  // Clear
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height); // use raw canvas size

  ctx.save();
  const dpr = window.devicePixelRatio;
  ctx.scale(dpr, dpr);
  
  // Apply zoom centered
  ctx.translate(width/2 + panX, height/2 + panY);
  ctx.scale(globalZoom, globalZoom);
  ctx.translate(-width/2, -height/2);

  if (mode === 'tree') {
    for (const n of treeNodes) n.update();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const e of treeEdges) {
      const a = e.a;
      const b = e.b;
      const alpha = Math.min(a.alpha, b.alpha) * 0.55;
      if (alpha <= 0.02) continue;

      const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, hsla(a.hue, 95, 68, alpha * 0.35));
      grad.addColorStop(0.5, hsla((a.hue + b.hue) / 2, 98, 72, alpha * 0.55));
      grad.addColorStop(1, hsla(b.hue, 95, 68, alpha * 0.35));

      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(e.cpx, e.cpy, b.x, b.y);
      ctx.stroke();
    }

    ctx.restore();

    for (const n of treeNodes) n.drawDot();
    provinceLabelBoxes = [];
    for (const n of treeNodes) n.drawLabel();
    provinceLabelBoxes = null;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTreeLanguageLabelsScreenSpace();
    drawTreeHoverChipScreenSpace();
    ctx.restore();
  } else {
    // Draw Circles
    circles.forEach(c => {
      c.update();
      c.draw();
    });

    // Draw Labels
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = '12px Outfit';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    labels.forEach(l => {
      ctx.save();
      ctx.translate(l.x, l.y);
      if (l.rotation) {
        ctx.rotate(l.rotation * Math.PI / 180);
        ctx.textAlign = 'right';
      }
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    });
  }

  ctx.restore();

  requestAnimationFrame(loop);
}

// Controls
document.getElementById('btn-grid').addEventListener('click', layoutGrid);
document.getElementById('btn-island').addEventListener('click', () => layoutBarChart(islandData, 'wilayah'));
document.getElementById('btn-province').addEventListener('click', () => layoutBarChart(provinceData, 'provinsi'));
document.getElementById('btn-tree').addEventListener('click', layoutTree);

// Mouse Interaction needs to account for Zoom
window.addEventListener('mousemove', (e) => {
  if (mode === 'tree' && isDragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (!dragMoved && (dx * dx + dy * dy) > 16) dragMoved = true;
    panX = dragStartPanX + dx;
    panY = dragStartPanY + dy;
    targetPanX = panX;
    targetPanY = panY;
    focusNode = null;
  }

  const rect = canvas.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;
  
  // Transform mouse coordinates to world space
  // worldX = (screenX - width/2) / zoom + width/2
  const worldX = (rawX - width/2 - panX) / globalZoom + width/2;
  const worldY = (rawY - height/2 - panY) / globalZoom + height/2;
  
  if (mode === 'tree') {
    let found = null;
    for (let i = treeNodes.length - 1; i >= 0; i--) {
      const n = treeNodes[i];
      if (n.alpha < 0.4) continue;
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (dx * dx + dy * dy < (n.r + 3) * (n.r + 3)) {
        found = n;
        break;
      }
    }

    hoveredNode = found;
    hoveredCircle = null;
    tooltip.style.display = 'none';
  } else {
    let found = null;
    for (let c of circles) {
      if (c.alpha < 0.5) continue;
      const dx = worldX - c.x;
      const dy = worldY - c.y;
      if (dx*dx + dy*dy < c.r * c.r + 4) {
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY + 15) + 'px';
        tooltip.innerText = c.group;
        found = c;
        break;
      }
    }
    
    hoveredCircle = found;
    hoveredNode = null;
    
    if (!found) tooltip.style.display = 'none';
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (mode !== 'tree') return;
  isDragging = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartPanX = panX;
  dragStartPanY = panY;
  focusNode = null;
});

window.addEventListener('mouseup', () => {
  isDragging = false;
  suppressClick = dragMoved;
  dragMoved = false;
});

window.addEventListener('wheel', (e) => {
  if (mode !== 'tree') return;
  e.preventDefault();
  const factor = Math.exp((-e.deltaY) * 0.0015);
  targetZoom = clamp(targetZoom * factor, ZOOM_MIN, ZOOM_MAX);
  focusNode = null;
}, { passive: false });

canvas.addEventListener('click', () => {
  if (mode !== 'tree') return;
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (!hoveredNode) return;

  focusNode = hoveredNode;
  let z = targetZoom;
  if (focusNode.kind === 'root') z = 2.0;
  else if (focusNode.kind === 'island') z = 2.8;
  else if (focusNode.kind === 'province') z = 4.2;
  else z = 7.0;
  targetZoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
});

loadData();
