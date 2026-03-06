import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { GoogleGenAI } from '@google/genai';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import puppeteer from 'puppeteer';
import PptxGenJS from 'pptxgenjs';

function readJsonBody(req, limitBytes = 100_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function toNodeReadableStream(audio) {
  if (!audio) return null;
  if (typeof audio.pipe === 'function') return audio;
  if (typeof audio.getReader === 'function') return Readable.fromWeb(audio);
  if (audio instanceof ArrayBuffer) return Readable.from([Buffer.from(audio)]);
  if (ArrayBuffer.isView(audio)) return Readable.from([Buffer.from(audio.buffer)]);
  return Readable.from(audio);
}

function ttsApiPlugin() {
  let client = null;

  async function handler(req, res) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Method not allowed');
      return;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY || process.env.VITE_ELEVENLABS_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Missing ELEVENLABS_API_KEY');
      return;
    }

    if (!client) client = new ElevenLabsClient({ apiKey });

    try {
      const body = await readJsonBody(req);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      const voiceId = typeof body.voiceId === 'string' ? body.voiceId : 'JBFqnCBsd6RMkjVDRZzb';
      const modelId = typeof body.modelId === 'string' ? body.modelId : 'eleven_multilingual_v2';
      const outputFormat = typeof body.outputFormat === 'string' ? body.outputFormat : 'mp3_44100_128';

      if (!text) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Missing text');
        return;
      }

      const audio = await client.textToSpeech.convert(voiceId, { text, modelId, outputFormat });
      const audioStream = toNodeReadableStream(audio);
      if (!audioStream) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Unexpected audio response');
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');

      audioStream.on('error', (err) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        }
        res.end(err?.message || 'Audio stream error');
      });

      audioStream.pipe(res);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(err?.message || 'TTS error');
    }
  }

  return {
    name: 'tts-api',
    configureServer(server) {
      server.middlewares.use('/api/tts', (req, res) => {
        handler(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/tts', (req, res) => {
        handler(req, res);
      });
    },
  };
}

// Style presets configuration for slides
const STYLE_PRESETS = {
  'neon-cyber': {
    name: 'Neon Cyber',
    description: 'Futuristic, techy, confident',
    vibe: 'Futuristic, techy, confident, cutting-edge with neon glow effects',
    colors: { bg: '#0a0f1c', bgSecondary: '#111827', accent: '#00ffcc', accentSecondary: '#ff00aa' },
    typography: { display: 'Clash Display', body: 'Satoshi' }
  },
  'midnight-executive': {
    name: 'Midnight Executive',
    description: 'Premium, trustworthy, sophisticated',
    vibe: 'Premium, trustworthy, sophisticated, corporate with subtle gradients',
    colors: { bg: '#0f172a', bgSecondary: '#1e293b', accent: '#3b82f6', accentSecondary: '#818cf8' },
    typography: { display: 'Libre Baskerville', body: 'Source Sans 3' }
  },
  'deep-space': {
    name: 'Deep Space',
    description: 'Inspiring, vast, contemplative',
    vibe: 'Inspiring, vast, contemplative, visionary with starfield backgrounds',
    colors: { bg: '#030712', bgSecondary: '#111827', accent: '#818cf8', accentSecondary: '#c084fc' },
    typography: { display: 'Space Grotesk', body: 'DM Sans' }
  },
  'terminal-green': {
    name: 'Terminal Green',
    description: 'Developer-focused, hacker aesthetic',
    vibe: 'Developer-focused, hacker aesthetic, retro-tech with monospace fonts',
    colors: { bg: '#0d1117', bgSecondary: '#161b22', accent: '#39d353', accentSecondary: '#2ea043' },
    typography: { display: 'JetBrains Mono', body: 'JetBrains Mono' }
  },
  'paper-ink': {
    name: 'Paper & Ink',
    description: 'Editorial, literary, thoughtful',
    vibe: 'Editorial, literary, thoughtful, refined with elegant serif typography',
    colors: { bg: '#faf9f7', bgSecondary: '#f5f3ef', accent: '#c41e3a', accentSecondary: '#8b1a2e' },
    typography: { display: 'Cormorant Garamond', body: 'Source Serif 4' }
  },
  'swiss-modern': {
    name: 'Swiss Modern',
    description: 'Clean, precise, Bauhaus-inspired',
    vibe: 'Clean, precise, Bauhaus-inspired, geometric with strong black typography',
    colors: { bg: '#ffffff', bgSecondary: '#f7f7f7', accent: '#ff3300', accentSecondary: '#000000' },
    typography: { display: 'Archivo', body: 'Nunito' }
  },
  'soft-pastel': {
    name: 'Soft Pastel',
    description: 'Friendly, approachable, creative',
    vibe: 'Friendly, approachable, creative, playful with rounded corners and soft colors',
    colors: { bg: '#fef3f2', bgSecondary: '#fef9f5', accent: '#f472b6', accentSecondary: '#a78bfa' },
    typography: { display: 'Nunito', body: 'Nunito' }
  },
  'warm-editorial': {
    name: 'Warm Editorial',
    description: 'Human, storytelling, photographic',
    vibe: 'Human, storytelling, photographic, magazine with warm photography',
    colors: { bg: '#fffbf5', bgSecondary: '#f5efe6', accent: '#b45309', accentSecondary: '#0369a1' },
    typography: { display: 'Playfair Display', body: 'Work Sans' }
  },
  'gradient-wave': {
    name: 'Gradient Wave',
    description: 'Modern SaaS, energetic',
    vibe: 'Modern SaaS, energetic, approachable with animated gradient meshes',
    colors: { bg: '#0f0f1a', bgSecondary: '#1a1a2e', accent: '#667eea', accentSecondary: '#764ba2' },
    typography: { display: 'Cabinet Grotesk', body: 'Inter' }
  }
};

// System instruction for Gemini AI (based on frontend-slides skill)
const SLIDES_SYSTEM_INSTRUCTION = `You are an expert presentation designer specializing in creating stunning, animation-rich HTML presentations. Your task is to convert document content into beautiful, zero-dependency HTML slides.

# Core Philosophy
1. **Zero Dependencies** — Single HTML files with inline CSS/JS. No external frameworks, no npm, no build tools.
2. **Distinctive Design** — Avoid generic "AI slop" aesthetics. Every presentation should feel custom-crafted.
3. **Production Quality** — Code must be accessible and performant.
4. **Show, Don't Tell** — Let the design speak through thoughtful typography, color, and animation.

# CRITICAL: Slide Layout Architecture

These slides are embedded in an IFRAME. You MUST use absolute-positioned, class-toggled slides. DO NOT use scroll-based navigation, scroll-snap, or scrollIntoView.

## Container Structure
- Wrap ALL slides inside \`<div class="slides-container">\`
- The container fills 100vw × 100vh with overflow: hidden
- Each slide is a \`<section class="slide">\` element
- Slides stack via position: absolute; inset: 0
- ONLY the slide with class "active" is visible
- The FIRST slide MUST have class="slide active" in the HTML

## REQUIRED CSS Pattern
\`\`\`css
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
.slides-container { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
.slide {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; justify-content: center;
  padding: 3rem 5rem;
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity 0.6s ease, transform 0.6s ease;
  transform: translateX(30px);
}
.slide.active {
  opacity: 1; visibility: visible; pointer-events: auto;
  transform: translateX(0); z-index: 1;
}
.slide.exit-left {
  opacity: 0; transform: translateX(-30px);
}
\`\`\`

## REQUIRED JavaScript — SlidePresentation Class
Every presentation MUST include this exact class with parent-window communication:
\`\`\`javascript
class SlidePresentation {
  constructor() {
    this.slides = document.querySelectorAll('.slide');
    this.currentSlide = 0;
    this.totalSlides = this.slides.length;
    this.init();
  }
  init() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.nextSlide(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.prevSlide(); }
    });
    let touchStartX = 0;
    document.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
    document.addEventListener('touchend', (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) { diff > 0 ? this.nextSlide() : this.prevSlide(); }
    });
    window.addEventListener('message', (e) => {
      if (!e.data || !e.data.action) return;
      switch (e.data.action) {
        case 'getSlideCount': this.sendSlideCount(); break;
        case 'prevSlide': this.prevSlide(); break;
        case 'nextSlide': this.nextSlide(); break;
        case 'goToSlide': this.goToSlide(e.data.index); break;
      }
    });
    this.goToSlide(0);
    this.sendSlideCount();
  }
  goToSlide(index) {
    if (index < 0 || index >= this.totalSlides) return;
    this.slides.forEach((slide, i) => {
      slide.classList.remove('active', 'exit-left');
      if (i === index) slide.classList.add('active');
      else if (i < index) slide.classList.add('exit-left');
    });
    this.currentSlide = index;
    this.sendSlideChanged();
  }
  nextSlide() { if (this.currentSlide < this.totalSlides - 1) this.goToSlide(this.currentSlide + 1); }
  prevSlide() { if (this.currentSlide > 0) this.goToSlide(this.currentSlide - 1); }
  sendSlideCount() {
    window.parent.postMessage({ action: 'slideCount', data: { count: this.totalSlides, current: this.currentSlide + 1 } }, '*');
  }
  sendSlideChanged() {
    window.parent.postMessage({ action: 'slideChanged', data: { current: this.currentSlide + 1 } }, '*');
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SlidePresentation());
} else {
  new SlidePresentation();
}
\`\`\`

# FORBIDDEN Patterns
- DO NOT use scroll-based navigation (no scrollIntoView, no scroll-snap, no wheel events for navigation)
- DO NOT use vertical scrolling between slides
- DO NOT rely on IntersectionObserver for showing content — active slide content must be immediately visible
- DO NOT hide text content behind animations that require scroll triggers
- DO NOT use display:none to hide inactive slides (use opacity/visibility for smooth transitions)

# Technical Requirements

## HTML Structure
- Single self-contained HTML file
- All CSS in \`<style>\` tags, all JS in \`<script>\` tags
- Semantic HTML (\`<section>\`, \`<h1>\`, \`<h2>\`, etc.)
- Each slide is a \`<section class="slide">\` (first one also gets class "active")
- All slides wrapped in \`<div class="slides-container">\`

## CSS Requirements
- CSS variables in :root for colors and fonts
- Responsive breakpoints (@media queries)
- Support prefers-reduced-motion
- Proper contrast ratios

## Content Visibility
- All text/content in the active slide MUST be visible immediately
- Entrance animations are allowed but MUST use CSS animation with forwards fill (not JS-triggered visibility)
- Example: elements can animate in with staggered delays, but they must reach opacity:1 automatically

# Optional: Mermaid Diagrams
Include Mermaid.js CDN when diagrams would help. Customize the theme to match slide colors:
\`\`\`html
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
\`\`\`

# Animation Patterns

## Entrance Animations (within active slide, auto-playing)
- Fade + Slide Up: translateY(30px) → translateY(0) with staggered delays
- Scale In: scale(0.9) → scale(1)
- Use @keyframes and animation property, NOT JS class toggling

## Timing
- Professional: 0.3–0.5s
- Dramatic: 0.8–1.2s
- Playful: 0.5–0.8s with bouncy easing

# Style Guidelines

## Dark Themes
- Background: #0a0f1c to #1e293b
- Text: #ffffff primary, #94a3b8 secondary
- Accent: Neon/electric colors
- Effects: Glow, grid patterns, subtle particles

## Light Themes
- Background: #faf9f7 to #ffffff
- Text: #1a1a1a primary, #666666 secondary
- Accent: Muted distinctive colors
- Effects: Paper textures, clean lines, whitespace

# Fonts (via Google Fonts)
Libre Baskerville, Space Grotesk, JetBrains Mono, Cormorant Garamond, Archivo, Nunito, Playfair Display

# Content Processing
1. Extract main topics from the document
2. Create 5–15 slides with logical structure
3. Title slide → Content slides → Summary/closing
4. ONE main idea per slide
5. Bullet points over paragraphs
6. Clear visual hierarchy

# Output Format
Return ONLY the complete HTML file. No markdown wrapping, no explanation. Start with \`<!DOCTYPE html>\` and end with \`</html>\`.`;

function slidesGeneratorPlugin() {
  let ai = null;

  async function handler(req, res) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Missing GEMINI_API_KEY in environment' }));
      return;
    }

    if (!ai) ai = new GoogleGenAI({ apiKey });

    try {
      const body = await readJsonBody(req, 50_000_000);
      const { fileData, fileType, fileName, style, additionalPrompt } = body;

      if (!fileData) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Missing fileData' }));
        return;
      }

      const styleKey = style || 'midnight-executive';
      const stylePreset = STYLE_PRESETS[styleKey] || STYLE_PRESETS['midnight-executive'];

      // Create prompt with style instructions
      const prompt = `Analyze this document and create a presentation from it.

**Style Preset:** ${stylePreset.name}
**Vibe:** ${stylePreset.vibe}
**Colors:** Background ${stylePreset.colors.bg}, Secondary ${stylePreset.colors.bgSecondary}, Accent ${stylePreset.colors.accent}, Accent Secondary ${stylePreset.colors.accentSecondary}
**Typography:** Display font "${stylePreset.typography.display}", Body font "${stylePreset.typography.body}"

${additionalPrompt ? `**Additional Instructions:** ${additionalPrompt}` : ''}

Generate a complete, self-contained HTML presentation file. CRITICAL REQUIREMENTS:
- Single HTML file with inline CSS and JavaScript
- Use absolute-positioned slides with class toggling (NOT scroll-based navigation)
- Each slide is a <section class="slide"> inside a <div class="slides-container">
- First slide must have class="slide active"
- Include the SlidePresentation class with parent window postMessage communication
- Include keyboard navigation (arrow keys) and touch swipe support
- Include Mermaid.js CDN for diagrams when content would benefit from visualization
- Use the specified style colors and typography
- All content on the active slide must be immediately visible
- Make it visually distinctive, not generic

Return ONLY the HTML code, no markdown formatting, no explanation.`;

      // Use Gemini 2.5 Pro with file upload support
      // New SDK: ai.models.generateContent() with systemInstruction
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [
          { role: 'user', parts: [
            { text: prompt },
            { inlineData: { mimeType: fileType, data: fileData } }
          ]}
        ],
        config: {
          systemInstruction: SLIDES_SYSTEM_INSTRUCTION
        }
      });

      const generatedText = result.text;

      // Clean and sanitize the generated HTML
      let html = generatedText;

      // Remove markdown code blocks if present
      const codeBlockMatch = html.match(/```(?:html)?\n?([\s\S]+)```/);
      if (codeBlockMatch) {
        html = codeBlockMatch[1];
      }

      // Remove any conversational text before <!DOCTYPE
      const doctypeIndex = html.toLowerCase().indexOf('<!doctype');
      if (doctypeIndex > 0) {
        html = html.substring(doctypeIndex);
      }

      // Remove any text after </html>
      const htmlEndIndex = html.toLowerCase().lastIndexOf('</html>');
      if (htmlEndIndex !== -1) {
        html = html.substring(0, htmlEndIndex + 7);
      }

      // Basic validation
      const trimmed = html.trim();
      if (trimmed.length < 500) {
        throw new Error('Generated content is too short');
      }
      if (!trimmed.toLowerCase().includes('<!doctype')) {
        throw new Error('Generated content is missing DOCTYPE');
      }
      if (!trimmed.toLowerCase().includes('<body')) {
        throw new Error('Generated content is missing body tag');
      }
      if (!trimmed.match(/<section/gi) || trimmed.match(/<section/gi).length < 2) {
        throw new Error('Generated content should have at least 2 slide sections');
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ html }));

    } catch (err) {
      console.error('Slides generation error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: err?.message || 'Failed to generate slides' }));
    }
  }

  return {
    name: 'slides-generator-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-slides', (req, res) => {
        handler(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/generate-slides', (req, res) => {
        handler(req, res);
      });
    },
  };
}

function parseHtmlSlides(html) {
  const slides = [];
  let slideIndex = 0;

  for (const match of html.matchAll(/<section[^>]*>([\s\S]*?)<\/section>/gi)) {
    slideIndex++;
    const sectionContent = match[1];

    let title = '';
    let titleMatch = sectionContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (!titleMatch) titleMatch = sectionContent.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    let subtitle = '';
    if (titleMatch && titleMatch[0].includes('h1')) {
      const subMatch = sectionContent.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      if (subMatch) subtitle = subMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    const bullets = [];
    for (const ulMatch of sectionContent.matchAll(/<ul[^>]*>([\s\S]*?)<\/ul>/gi)) {
      for (const liMatch of ulMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
        const bulletText = liMatch[1].replace(/<[^>]*>/g, '').trim();
        if (bulletText) bullets.push(bulletText);
      }
    }

    const content = [];
    for (const pMatch of sectionContent.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const pText = pMatch[1].replace(/<[^>]*>/g, '').trim();
      if (pText) content.push(pText);
    }

    if (bullets.length === 0 && content.length === 0) {
      const allText = sectionContent
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (allText && allText.length > 10) {
        content.push(allText.substring(0, 500));
      }
    }

    slides.push({
      title: title || `Slide ${slideIndex}`,
      subtitle: subtitle || '',
      bullets: bullets.length > 0 ? bullets : content,
      content: sectionContent
    });

    if (slideIndex >= 50) break;
  }

  return slides;
}

// Export plugin for PDF and PPTX generation
function slidesExportPlugin() {
  let browser = null;

  async function getBrowser() {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    }
    return browser;
  }

  async function generatePdf(html) {
    const br = await getBrowser();
    const page = await br.newPage();

    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));

    const slideCount = await page.evaluate(() => {
      return document.querySelectorAll('section').length || 1;
    });

    const screenshots = [];
    for (let i = 0; i < slideCount; i++) {
      await page.evaluate((idx) => {
        const sections = document.querySelectorAll('section');
        sections.forEach((s, j) => {
          s.classList.remove('active', 'exit-left');
          s.style.transition = 'none';
          if (j === idx) {
            s.classList.add('active');
            s.style.opacity = '1';
            s.style.visibility = 'visible';
            s.style.transform = 'none';
            s.style.zIndex = '1';
            s.style.pointerEvents = 'auto';
          } else {
            s.style.opacity = '0';
            s.style.visibility = 'hidden';
            s.style.zIndex = '0';
            s.style.pointerEvents = 'none';
          }
        });
      }, i);

      await new Promise(r => setTimeout(r, 300));
      const screenshot = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1280, height: 720 }
      });
      screenshots.push(screenshot);
    }
    await page.close();

    const pdfPage = await br.newPage();
    const imagesHtml = screenshots.map((s) =>
      `<div class="pg"><img src="data:image/png;base64,${s.toString('base64')}" /></div>`
    ).join('');

    await pdfPage.setContent(`<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  @page { size: 1280px 720px; margin: 0; }
  .pg { width: 1280px; height: 720px; page-break-after: always; overflow: hidden; }
  .pg img { width: 100%; height: 100%; display: block; }
</style></head>
<body>${imagesHtml}</body></html>`, { waitUntil: 'load' });

    const pdfBuffer = await pdfPage.pdf({
      width: '1280px',
      height: '720px',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    await pdfPage.close();
    return pdfBuffer;
  }

  async function generatePptx(html) {
    const slides = parseHtmlSlides(html);

    const pptx = new PptxGenJS();
    pptx.author = 'AI Slides Generator';
    pptx.title = 'Generated Presentation';
    pptx.subject = 'AI Generated Slides';
    pptx.layout = 'LAYOUT_16x9';

    slides.forEach((slide) => {
      const presSlide = pptx.addSlide();
      let yPosition = 0.5;

      if (slide.title) {
        presSlide.addText(slide.title, {
          x: 0.5, y: yPosition, w: '90%', h: 0.8,
          fontSize: 32, bold: true, color: '363636', fontFace: 'Arial'
        });
        yPosition += 1.2;
      }

      if (slide.subtitle) {
        presSlide.addText(slide.subtitle, {
          x: 0.5, y: yPosition, w: '90%', h: 0.5,
          fontSize: 20, color: '666666', fontFace: 'Arial'
        });
        yPosition += 0.8;
      }

      if (slide.bullets && slide.bullets.length > 0) {
        const bulletPoints = slide.bullets.slice(0, 8);
        bulletPoints.forEach((bullet, idx) => {
          presSlide.addText(bullet, {
            x: 0.5, y: yPosition + (idx * 0.4), w: '90%', h: 0.4,
            fontSize: 16, color: '333333', fontFace: 'Arial', bullet: true
          });
        });
      }
    });

    return await pptx.write({ outputType: 'nodebuffer' });
  }

  async function handler(req, res) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const body = await readJsonBody(req, 10_000_000);
      const { html, format } = body;

      if (!html) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Missing html content' }));
        return;
      }

      if (format === 'pdf') {
        const pdfBuffer = await generatePdf(html);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="slides.pdf"');
        res.end(pdfBuffer);
      } else if (format === 'pptx') {
        const pptxBuffer = await generatePptx(html);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', 'attachment; filename="slides.pptx"');
        res.end(pptxBuffer);
      } else {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Invalid format. Use "pdf" or "pptx"' }));
      }

    } catch (err) {
      console.error('Export error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: err?.message || 'Export failed' }));
    }
  }

  // Cleanup browser on process exit
  process.on('beforeExit', async () => {
    if (browser) {
      await browser.close();
    }
  });

  return {
    name: 'slides-export-api',
    configureServer(server) {
      server.middlewares.use('/api/export-slides', (req, res) => {
        handler(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/export-slides', (req, res) => {
        handler(req, res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] == null) process.env[k] = v;
  }

  return {
    plugins: [ttsApiPlugin(), slidesGeneratorPlugin(), slidesExportPlugin()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          counter: resolve(__dirname, 'counter/index.html'),
          languages: resolve(__dirname, 'languages/index.html'),
          tts: resolve(__dirname, 'tts/index.html'),
          'apbn-pendidikan': resolve(__dirname, 'apbn-pendidikan/index.html'),
          'slides-generator': resolve(__dirname, 'slides-generator/index.html'),
        },
      },
    },
    server: {
      host: '::',
    },
    preview: {
      host: '::',
    },
  };
});
