/**
 * Server-side PPTX export using Puppeteer DOM traversal + PptxGenJS.
 *
 * Inspired by presenton's pipeline:
 *   1. Render HTML in headless Chrome (1280×720)
 *   2. Walk every visible DOM element and extract computed styles + positions
 *   3. Convert extracted attributes to PPTX shape models
 *   4. Build the .pptx with PptxGenJS using per-element positioned shapes
 */

import puppeteer from 'puppeteer';
import PptxGenJS from 'pptxgenjs';

const SLIDE_W_PX = 1280;
const SLIDE_H_PX = 720;
const SLIDE_W_IN = 10;
const SLIDE_H_IN = 5.625;

function pxToInchX(px) { return (px / SLIDE_W_PX) * SLIDE_W_IN; }
function pxToInchY(px) { return (px / SLIDE_H_PX) * SLIDE_H_IN; }
function pxToPt(px) { return Math.round(px * 0.75); }

// ---------------------------------------------------------------------------
// Stage 1 — Puppeteer DOM traversal (runs inside page.evaluate)
// ---------------------------------------------------------------------------

/**
 * This function is serialised and executed inside headless Chrome.
 * It returns an array of slide objects, each with background + elements.
 */
function extractSlidesInBrowser() {
  // ---- helpers (must be defined inside evaluate) ----

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
      offsetX: ox, offsetY: oy,
      blur,
      angle: Math.round(Math.atan2(oy, ox) * 180 / Math.PI),
      dist: Math.round(Math.sqrt(ox * ox + oy * oy)),
    };
  }

  function getElementAttrs(el) {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'link', 'meta', 'head'].includes(tag)) return null;

    const bgc = colorToHex(cs.backgroundColor);
    const fontColor = colorToHex(cs.color);
    const borderColor = colorToHex(cs.borderColor);
    const borderWidth = parseFloat(cs.borderWidth) || 0;

    const fontName = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
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
      font: { name: fontName, size: fontSize, weight: fontWeight, color: fontColor.hex || '000000', italic },
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

  function collectElements(parent, rootRect, inherited) {
    const results = [];
    for (const child of parent.children) {
      const attrs = getElementAttrs(child);
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
        results.push({ ...attrs, position: relPos, type: 'screenshot', font });
        continue;
      }

      if (tag === 'img' && attrs.imageSrc) {
        results.push({ ...attrs, position: relPos, type: 'image', font });
        continue;
      }

      const textContent = child.textContent ? child.textContent.trim() : '';
      if (textContent && hasOnlyInlineChildren(child)) {
        const innerHTML = child.innerHTML;
        results.push({
          ...attrs,
          position: relPos,
          type: 'text',
          innerHTML,
          plainText: textContent,
          font,
          background: attrs.background,
        });
        continue;
      }

      const occupiesRoot = relPos.left <= 1 && relPos.top <= 1 &&
        Math.abs(relPos.width - rootRect.width) < 2 &&
        Math.abs(relPos.height - rootRect.height) < 2;

      if (!occupiesRoot && (attrs.background || attrs.border || attrs.shadow)) {
        results.push({ ...attrs, position: relPos, type: 'shape', font });
      }

      const childResults = collectElements(child, rootRect, { font, background: bg });
      results.push(...childResults);
    }
    return results;
  }

  // ---- override animations/transitions for accurate reading ----
  const override = document.createElement('style');
  override.textContent = `
    *, *::before, *::after {
      transition: none !important;
      animation: none !important;
    }
    section.slide, .slide {
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
      pointer-events: auto !important;
    }
  `;
  document.head.appendChild(override);

  const sections = document.querySelectorAll('section');
  const slides = [];

  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const cs = window.getComputedStyle(section);
    let bgHex = colorToHex(cs.backgroundColor).hex;
    if (!bgHex) {
      bgHex = colorToHex(window.getComputedStyle(document.body).backgroundColor).hex
           || colorToHex(window.getComputedStyle(document.documentElement).backgroundColor).hex
           || '000000';
    }

    const elements = collectElements(section, rect, { font: null, background: null });

    slides.push({ background: bgHex, elements });
  }

  override.remove();
  return slides;
}

// ---------------------------------------------------------------------------
// Stage 2 — Screenshot complex elements (SVG, canvas, table, pre.mermaid)
// ---------------------------------------------------------------------------

async function screenshotComplexElements(page, slidesData) {
  for (let slideIdx = 0; slideIdx < slidesData.length; slideIdx++) {
    const slide = slidesData[slideIdx];
    const hasScreenshots = slide.elements.some(el => el.type === 'screenshot');
    if (!hasScreenshots) continue;

    await page.evaluate((idx) => {
      const sections = document.querySelectorAll('section');
      sections.forEach((s, j) => {
        s.style.transition = 'none';
        s.style.animation = 'none';
        if (j === idx) {
          s.style.opacity = '1';
          s.style.visibility = 'visible';
          s.style.transform = 'none';
          s.style.zIndex = '10';
        } else {
          s.style.opacity = '0';
          s.style.visibility = 'hidden';
          s.style.zIndex = '0';
        }
      });
    }, slideIdx);
    await new Promise(r => setTimeout(r, 300));

    for (let i = 0; i < slide.elements.length; i++) {
      const el = slide.elements[i];
      if (el.type !== 'screenshot') continue;

      try {
        const clip = {
          x: Math.max(0, el.position.left),
          y: Math.max(0, el.position.top),
          width: Math.min(el.position.width, SLIDE_W_PX),
          height: Math.min(el.position.height, SLIDE_H_PX),
        };

        const buf = await page.screenshot({ type: 'png', clip, encoding: 'base64' });
        el.screenshotBase64 = buf;
        el.type = 'image';
        el.imageSrc = null;
      } catch {
        slide.elements.splice(i, 1);
        i--;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 3 — Parse inline HTML to text runs
// ---------------------------------------------------------------------------

function parseHtmlToTextRuns(html, baseFont) {
  const runs = [];
  let pos = 0;
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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g;
  let match;
  let lastIndex = 0;

  const reHtml = decoded;

  while ((match = tagRegex.exec(reHtml)) !== null) {
    const beforeText = reHtml.substring(lastIndex, match.index);
    if (beforeText) {
      runs.push({ text: beforeText, options: currentFont() });
    }
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

  const trailing = reHtml.substring(lastIndex);
  if (trailing) {
    runs.push({ text: trailing, options: currentFont() });
  }

  return runs;
}

// ---------------------------------------------------------------------------
// Stage 4 — Build PPTX with positioned shapes using PptxGenJS
// ---------------------------------------------------------------------------

function buildPptx(slidesData) {
  const pptx = new PptxGenJS();
  pptx.author = 'AI Slides Generator';
  pptx.title = 'Generated Presentation';
  pptx.layout = 'LAYOUT_WIDE';
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

      if (el.type === 'image') {
        const imgData = el.screenshotBase64
          ? `data:image/png;base64,${el.screenshotBase64}`
          : el.imageSrc;
        if (!imgData) continue;
        try {
          const imgOpts = { x, y, w, h, sizing: { type: 'contain', w, h } };
          if (el.borderRadius && el.borderRadius.some(r => r > 0)) {
            imgOpts.rounding = true;
          }
          slide.addImage({ data: imgData.startsWith('data:') ? imgData : undefined, path: !imgData.startsWith('data:') ? imgData : undefined, ...imgOpts });
        } catch { /* skip images that fail */ }
        continue;
      }

      if (el.type === 'shape' && !el.plainText) {
        const shapeOpts = { x, y, w, h };
        if (el.background) {
          shapeOpts.fill = { color: el.background.color };
          if (el.background.opacity != null && el.background.opacity < 1) {
            shapeOpts.fill.transparency = Math.round((1 - el.background.opacity) * 100);
          }
        }
        if (el.border) {
          shapeOpts.line = { color: el.border.color, width: el.border.width || 1 };
          if (el.border.opacity != null && el.border.opacity < 1) {
            shapeOpts.line.transparency = Math.round((1 - el.border.opacity) * 100);
          }
        }
        if (el.shadow) {
          shapeOpts.shadow = {
            type: 'outer',
            blur: el.shadow.blur || 3,
            offset: el.shadow.dist || 2,
            angle: el.shadow.angle || 0,
            color: el.shadow.color || '000000',
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
          fontFace: el.font?.name || 'Arial',
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
          x, y, w, h,
          valign: 'top',
          align: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'right' : 'left',
          wrap: true,
          shrinkText: false,
          margin: 0,
        };

        if (el.background) {
          textOpts.fill = { color: el.background.color };
          if (el.background.opacity != null && el.background.opacity < 1) {
            textOpts.fill.transparency = Math.round((1 - el.background.opacity) * 100);
          }
        }
        if (el.border) {
          textOpts.line = { color: el.border.color, width: el.border.width || 1 };
        }
        if (el.shadow) {
          textOpts.shadow = {
            type: 'outer',
            blur: el.shadow.blur || 3,
            offset: el.shadow.dist || 2,
            angle: el.shadow.angle || 0,
            color: el.shadow.color || '000000',
            opacity: el.shadow.opacity != null ? el.shadow.opacity : 0.4,
          };
        }
        if (el.borderRadius && el.borderRadius.some(r => r > 0)) {
          textOpts.rectRadius = Math.max(...el.borderRadius) / 50;
          textOpts.shape = pptx.ShapeType ? pptx.ShapeType.roundRect : 'roundRect';
        }

        slide.addText(textRuns, textOpts);
      }
    }
  }

  return pptx;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generatePptxBuffer(html) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: SLIDE_W_PX, height: SLIDE_H_PX });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    await new Promise(r => setTimeout(r, 2000));

    const slidesData = await page.evaluate(extractSlidesInBrowser);

    if (!slidesData || slidesData.length === 0) {
      throw new Error('No slides found in the HTML content');
    }

    await screenshotComplexElements(page, slidesData);

    await page.close();

    const pptx = buildPptx(slidesData);
    const buffer = await pptx.write({ outputType: 'nodebuffer' });
    return buffer;
  } finally {
    if (browser) await browser.close();
  }
}
