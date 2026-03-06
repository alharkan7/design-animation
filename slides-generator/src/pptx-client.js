/**
 * Client-side PPTX export using iframe DOM traversal + PptxGenJS.
 *
 * Same presenton-style pipeline as lib/pptx-export.js but runs entirely
 * in the browser by walking the iframe DOM directly (no Puppeteer needed).
 */

const SLIDE_W_PX = 1280;
const SLIDE_H_PX = 720;
const SLIDE_W_IN = 10;
const SLIDE_H_IN = 5.625;

function pxToInchX(px) { return (px / SLIDE_W_PX) * SLIDE_W_IN; }
function pxToInchY(px) { return (px / SLIDE_H_PX) * SLIDE_H_IN; }
function pxToPt(px) { return Math.round(px * 0.75); }

// ---------------------------------------------------------------------------
// Web font → PowerPoint-safe font mapping
// ---------------------------------------------------------------------------

const FONT_MAP = {
  // Serif fonts
  'libre baskerville': 'Georgia',
  'cormorant garamond': 'Palatino Linotype',
  'playfair display': 'Georgia',
  'source serif 4': 'Palatino Linotype',
  'source serif pro': 'Palatino Linotype',
  'merriweather': 'Georgia',
  'lora': 'Palatino Linotype',
  'crimson text': 'Georgia',
  'eb garamond': 'Garamond',
  'gelasio': 'Georgia',
  'fraunces': 'Georgia',
  'roboto slab': 'Rockwell',

  // Sans-serif fonts
  'inter': 'Segoe UI',
  'dm sans': 'Segoe UI',
  'source sans 3': 'Segoe UI',
  'source sans pro': 'Segoe UI',
  'work sans': 'Candara',
  'outfit': 'Candara',
  'nunito': 'Trebuchet MS',
  'archivo': 'Franklin Gothic Medium',
  'space grotesk': 'Century Gothic',
  'cabinet grotesk': 'Century Gothic',
  'clash display': 'Century Gothic',
  'satoshi': 'Century Gothic',
  'overpass': 'Segoe UI',
  'barlow': 'Segoe UI',
  'instrument sans': 'Segoe UI',
  'poppins': 'Segoe UI',
  'open sans': 'Segoe UI',
  'lato': 'Segoe UI',
  'raleway': 'Trebuchet MS',
  'montserrat': 'Trebuchet MS',
  'roboto': 'Segoe UI',
  'prompt': 'Trebuchet MS',
  'kanit': 'Trebuchet MS',
  'corben': 'Rockwell',

  // Monospace fonts
  'jetbrains mono': 'Consolas',
  'fira code': 'Consolas',
  'source code pro': 'Consolas',
  'inconsolata': 'Consolas',
  'ibm plex mono': 'Consolas',
  'cascadia code': 'Consolas',
  'courier new': 'Courier New',
};

const CATEGORY_FALLBACKS = {
  serif: 'Georgia',
  'sans-serif': 'Segoe UI',
  monospace: 'Consolas',
  cursive: 'Segoe UI',
  fantasy: 'Trebuchet MS',
  'system-ui': 'Segoe UI',
};

function mapFont(fontFamily) {
  if (!fontFamily) return 'Segoe UI';
  const parts = fontFamily.split(',').map(f => f.trim().replace(/['"]/g, ''));
  const primary = parts[0].toLowerCase();

  if (FONT_MAP[primary]) return FONT_MAP[primary];

  for (const part of parts) {
    const lower = part.toLowerCase().trim();
    if (CATEGORY_FALLBACKS[lower]) return CATEGORY_FALLBACKS[lower];
  }

  return 'Segoe UI';
}

// ---------------------------------------------------------------------------
// Stage 1 — DOM traversal (runs directly on iframe document)
// ---------------------------------------------------------------------------

function colorToHex(color) {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
    return { hex: null, opacity: null };
  }
  if (color.startsWith('rgba(')) {
    const m = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
    if (m) {
      const hex = ((+m[1] << 16) | (+m[2] << 8) | +m[3]).toString(16).padStart(6, '0');
      return { hex, opacity: parseFloat(m[4]) };
    }
  }
  if (color.startsWith('rgb(')) {
    const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      const hex = ((+m[1] << 16) | (+m[2] << 8) | +m[3]).toString(16).padStart(6, '0');
      return { hex, opacity: null };
    }
  }
  if (color.startsWith('#')) {
    let h = color.slice(1);
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return { hex: h.substring(0, 6), opacity: null };
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  const out = ctx.fillStyle;
  if (out.startsWith('#')) return { hex: out.slice(1), opacity: null };
  return { hex: null, opacity: null };
}

function parseBorderRadius(cs, el) {
  const br = cs.borderRadius;
  if (!br || br === '0px') return null;
  const parts = br.split(' ').map(parseFloat).filter(v => !isNaN(v));
  let arr;
  if (parts.length === 1) arr = [parts[0], parts[0], parts[0], parts[0]];
  else if (parts.length === 2) arr = [parts[0], parts[1], parts[0], parts[1]];
  else if (parts.length === 3) arr = [parts[0], parts[1], parts[2], parts[1]];
  else arr = parts.slice(0, 4);
  const rect = el.getBoundingClientRect();
  const mX = rect.width / 2, mY = rect.height / 2;
  return arr.map((r, i) => Math.max(0, Math.min(r, i % 2 === 0 ? mX : mY)));
}

function parseShadow(cs) {
  const raw = cs.boxShadow;
  if (!raw || raw === 'none') return null;
  const m = raw.match(/(rgba?\([^)]+\))\s+([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px/);
  if (!m) return null;
  const col = colorToHex(m[1]);
  if (!col.hex) return null;
  const ox = parseFloat(m[2]), oy = parseFloat(m[3]), blur = parseFloat(m[4]);
  return {
    color: col.hex,
    opacity: col.opacity != null ? col.opacity : 0.5,
    offsetX: ox, offsetY: oy, blur,
    angle: Math.round(Math.atan2(oy, ox) * 180 / Math.PI),
    dist: Math.round(Math.sqrt(ox * ox + oy * oy)),
  };
}

function getElementAttrs(el, win) {
  const cs = win.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  const tag = el.tagName.toLowerCase();
  if (['script', 'style', 'link', 'meta', 'head'].includes(tag)) return null;

  const bgc = colorToHex(cs.backgroundColor);
  const fontColor = colorToHex(cs.color);
  const borderColor = colorToHex(cs.borderColor);
  const borderWidth = parseFloat(cs.borderWidth) || 0;
  const fontFamily = cs.fontFamily;
  const fontName = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
  const fontSize = parseFloat(cs.fontSize) || 16;
  const fontWeight = parseInt(cs.fontWeight) || 400;
  const italic = cs.fontStyle === 'italic';
  const opacity = parseFloat(cs.opacity);

  return {
    tag,
    position: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    background: bgc.hex ? { color: bgc.hex, opacity: bgc.opacity } : null,
    border: borderWidth > 0 && borderColor.hex ? { color: borderColor.hex, width: borderWidth, opacity: borderColor.opacity } : null,
    shadow: parseShadow(cs),
    borderRadius: parseBorderRadius(cs, el),
    font: { name: fontName, family: fontFamily, size: fontSize, weight: fontWeight, color: fontColor.hex || '000000', italic },
    textAlign: cs.textAlign,
    lineHeight: parseFloat(cs.lineHeight) || fontSize * 1.2,
    opacity: isNaN(opacity) ? 1 : opacity,
    zIndex: parseInt(cs.zIndex) || 0,
    imageSrc: tag === 'img' ? el.src : null,
    objectFit: tag === 'img' ? cs.objectFit : null,
  };
}

function hasOnlyInlineChildren(el) {
  const allowed = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'del', 'strike', 'code', 'span', 'br', 'sub', 'sup', 'a']);
  for (const child of el.children) {
    if (!allowed.has(child.tagName.toLowerCase())) return false;
  }
  return true;
}

function collectElements(parent, rootRect, inherited, win) {
  const results = [];
  for (const child of parent.children) {
    const attrs = getElementAttrs(child, win);
    if (!attrs) continue;

    const relPos = {
      left: attrs.position.left - rootRect.left,
      top: attrs.position.top - rootRect.top,
      width: attrs.position.width,
      height: attrs.position.height,
    };
    if (relPos.width <= 0 || relPos.height <= 0) continue;

    const font = attrs.font || inherited.font;
    const bg = attrs.background || inherited.background;
    const tag = attrs.tag;

    if (tag === 'svg' || tag === 'canvas' || tag === 'table' || tag === 'pre') {
      results.push({ ...attrs, position: relPos, type: 'screenshot', element: child, font });
      continue;
    }

    if (tag === 'img' && attrs.imageSrc) {
      results.push({ ...attrs, position: relPos, type: 'image', element: child, font });
      continue;
    }

    const textContent = child.textContent ? child.textContent.trim() : '';
    if (textContent && hasOnlyInlineChildren(child)) {
      results.push({
        ...attrs, position: relPos, type: 'text',
        innerHTML: child.innerHTML, plainText: textContent,
        font, background: attrs.background,
      });
      continue;
    }

    const occupiesRoot = relPos.left <= 1 && relPos.top <= 1 &&
      Math.abs(relPos.width - rootRect.width) < 2 &&
      Math.abs(relPos.height - rootRect.height) < 2;

    if (!occupiesRoot && (attrs.background || attrs.border || attrs.shadow)) {
      results.push({ ...attrs, position: relPos, type: 'shape', font });
    }

    const childResults = collectElements(child, rootRect, { font, background: bg }, win);
    results.push(...childResults);
  }
  return results;
}

function captureImageElement(imgEl) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth || imgEl.width || 200;
    canvas.height = imgEl.naturalHeight || imgEl.height || 200;
    canvas.getContext('2d').drawImage(imgEl, 0, 0);
    return canvas.toDataURL('image/png');
  } catch { return null; }
}

function captureSvgElement(svgEl, width, height) {
  try {
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!clone.getAttribute('width')) clone.setAttribute('width', String(Math.round(width)));
    if (!clone.getAttribute('height')) clone.setAttribute('height', String(Math.round(height)));

    const styles = svgEl.ownerDocument.querySelectorAll('style');
    let cssText = '';
    for (const s of styles) { cssText += s.textContent; }
    if (cssText) {
      const defs = clone.querySelector('defs') || clone.insertBefore(
        svgEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'defs'), clone.firstChild
      );
      const style = svgEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = cssText;
      defs.appendChild(style);
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clone);
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
  } catch { return null; }
}

function captureCanvasElement(canvasEl) {
  try { return canvasEl.toDataURL('image/png'); } catch { return null; }
}

export function extractSlidesFromIframe(iframeDoc, iframeWin) {
  const override = iframeDoc.createElement('style');
  override.textContent = `
    *, *::before, *::after { transition: none !important; animation: none !important; }
    section.slide, .slide {
      opacity: 1 !important; visibility: visible !important;
      transform: none !important; pointer-events: auto !important;
    }
  `;
  iframeDoc.head.appendChild(override);

  const sections = iframeDoc.querySelectorAll('section');
  const slides = [];

  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const cs = iframeWin.getComputedStyle(section);
    let bgHex = colorToHex(cs.backgroundColor).hex;
    if (!bgHex) {
      bgHex = colorToHex(iframeWin.getComputedStyle(iframeDoc.body).backgroundColor).hex
           || colorToHex(iframeWin.getComputedStyle(iframeDoc.documentElement).backgroundColor).hex
           || '000000';
    }

    const elements = collectElements(section, rect, { font: null, background: null }, iframeWin);

    for (const el of elements) {
      if (el.type === 'image' && el.element && el.element.tagName === 'IMG') {
        const dataUrl = captureImageElement(el.element);
        if (dataUrl) el.imageData = dataUrl;
      }

      if (el.type === 'screenshot' && el.element) {
        const tag = el.element.tagName.toLowerCase();
        let dataUrl = null;

        if (tag === 'svg') {
          dataUrl = captureSvgElement(el.element, el.position.width, el.position.height);
        } else if (tag === 'canvas') {
          dataUrl = captureCanvasElement(el.element);
        } else {
          const innerSvg = el.element.querySelector('svg');
          if (innerSvg) {
            dataUrl = captureSvgElement(innerSvg, el.position.width, el.position.height);
          }
        }

        if (dataUrl) {
          el.imageData = dataUrl;
          el.type = 'image';
        }
      }

      delete el.element;
    }

    slides.push({ background: bgHex, elements });
  }

  override.remove();
  return slides;
}

// ---------------------------------------------------------------------------
// Stage 2 — Parse inline HTML to text runs
// ---------------------------------------------------------------------------

function parseHtmlToTextRuns(html, baseFont) {
  const runs = [];
  const tagStack = [];

  function currentFont() {
    const f = { ...baseFont };
    for (const t of tagStack) {
      if (t === 'strong' || t === 'b') f.bold = true;
      if (t === 'em' || t === 'i') f.italic = true;
      if (t === 'u') f.underline = true;
      if (t === 's' || t === 'del' || t === 'strike') f.strike = true;
      if (t === 'code') f.fontFace = 'Courier New';
    }
    return f;
  }

  const decoded = html
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g;
  let match;
  let lastIndex = 0;

  while ((match = tagRegex.exec(decoded)) !== null) {
    const beforeText = decoded.substring(lastIndex, match.index);
    if (beforeText) runs.push({ text: beforeText, options: currentFont() });
    lastIndex = match.index + match[0].length;

    const fullTag = match[0];
    const tagName = match[1].toLowerCase();

    if (tagName === 'br') {
      runs.push({ text: '\n', options: {} });
    } else if (fullTag.startsWith('</')) {
      for (let j = tagStack.length - 1; j >= 0; j--) {
        if (tagStack[j] === tagName) { tagStack.splice(j, 1); break; }
      }
    } else if (!fullTag.endsWith('/>')) {
      tagStack.push(tagName);
    }
  }

  const trailing = decoded.substring(lastIndex);
  if (trailing) runs.push({ text: trailing, options: currentFont() });
  return runs;
}

// ---------------------------------------------------------------------------
// Stage 3 — Build PPTX with PptxGenJS (positioned shapes)
// ---------------------------------------------------------------------------

export async function buildPptxFromSlides(slidesData) {
  const { default: PptxGenJS } = await import('pptxgenjs');

  const pptx = new PptxGenJS();
  pptx.author = 'AI Slides Generator';
  pptx.title = 'Generated Presentation';
  pptx.defineLayout({ name: 'CUSTOM_16x9', width: SLIDE_W_IN, height: SLIDE_H_IN });
  pptx.layout = 'CUSTOM_16x9';

  for (const slideData of slidesData) {
    const slide = pptx.addSlide();
    slide.background = { color: slideData.background };

    const sortedElements = slideData.elements
      .filter(el => el.position)
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    for (const el of sortedElements) {
      const x = pxToInchX(el.position.left);
      const y = pxToInchY(el.position.top);
      const w = pxToInchX(el.position.width);
      const h = pxToInchY(el.position.height);
      if (w < 0.05 || h < 0.05) continue;

      if (el.type === 'image' || el.type === 'screenshot') {
        const imgData = el.imageData || el.imageSrc;
        if (!imgData) continue;
        try {
          const imgOpts = { x, y, w, h, sizing: { type: 'contain', w, h } };
          if (el.borderRadius && el.borderRadius.some(r => r > 0)) imgOpts.rounding = true;
          if (imgData.startsWith('data:')) slide.addImage({ data: imgData, ...imgOpts });
          else slide.addImage({ path: imgData, ...imgOpts });
        } catch { /* skip */ }
        continue;
      }

      if (el.type === 'shape' && !el.plainText) {
        const shapeOpts = { x, y, w, h };
        if (el.background) {
          shapeOpts.fill = { color: el.background.color };
          if (el.background.opacity != null && el.background.opacity < 1)
            shapeOpts.fill.transparency = Math.round((1 - el.background.opacity) * 100);
        }
        if (el.border) {
          shapeOpts.line = { color: el.border.color, width: el.border.width || 1 };
          if (el.border.opacity != null && el.border.opacity < 1)
            shapeOpts.line.transparency = Math.round((1 - el.border.opacity) * 100);
        }
        if (el.shadow) {
          shapeOpts.shadow = {
            type: 'outer', blur: el.shadow.blur || 3, offset: el.shadow.dist || 2,
            angle: el.shadow.angle || 0, color: el.shadow.color || '000000',
            opacity: el.shadow.opacity != null ? el.shadow.opacity : 0.4,
          };
        }
        if (el.borderRadius && el.borderRadius.some(r => r > 0)) {
          shapeOpts.rectRadius = Math.max(...el.borderRadius) / 50;
          slide.addShape(pptx.ShapeType.roundRect, shapeOpts);
        } else {
          slide.addShape(pptx.ShapeType.rect, shapeOpts);
        }
        continue;
      }

      if (el.type === 'text' && (el.innerHTML || el.plainText)) {
        const baseFont = {
          fontFace: mapFont(el.font?.family || el.font?.name),
          fontSize: pxToPt(el.font?.size || 16),
          color: el.font?.color || '000000',
          bold: el.font?.weight >= 600,
          italic: el.font?.italic || false,
        };

        let textRuns;
        if (el.innerHTML && el.innerHTML !== el.plainText) {
          textRuns = parseHtmlToTextRuns(el.innerHTML, baseFont);
        } else {
          textRuns = [{ text: el.plainText, options: baseFont }];
        }
        if (textRuns.length === 0) continue;

        const textOpts = {
          x, y, w, h, valign: 'top',
          align: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'right' : 'left',
          wrap: true, shrinkText: false, margin: 0,
        };

        if (el.background) {
          textOpts.fill = { color: el.background.color };
          if (el.background.opacity != null && el.background.opacity < 1)
            textOpts.fill.transparency = Math.round((1 - el.background.opacity) * 100);
        }
        if (el.border) textOpts.line = { color: el.border.color, width: el.border.width || 1 };
        if (el.shadow) {
          textOpts.shadow = {
            type: 'outer', blur: el.shadow.blur || 3, offset: el.shadow.dist || 2,
            angle: el.shadow.angle || 0, color: el.shadow.color || '000000',
            opacity: el.shadow.opacity != null ? el.shadow.opacity : 0.4,
          };
        }
        if (el.borderRadius && el.borderRadius.some(r => r > 0)) {
          textOpts.rectRadius = Math.max(...el.borderRadius) / 50;
          textOpts.shape = 'roundRect';
        }

        slide.addText(textRuns, textOpts);
      }
    }
  }

  return pptx;
}
