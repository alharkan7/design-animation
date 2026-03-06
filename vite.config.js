import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { GoogleGenAI } from '@google/genai';
import { Readable } from 'node:stream';
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
3. **Production Quality** — Code must be well-commented, accessible, and performant.
4. **Show, Don't Tell** — Let the design speak for itself through thoughtful typography, color, and animation.

# Technical Requirements

## HTML Structure
- Single self-contained HTML file
- All CSS must be inline in <style> tags
- All JavaScript must be inline in <script> tags
- Use semantic HTML (<section>, <h1>, <h2>, <article>)
- Each slide should be a <section> element

## CSS Requirements
- Use CSS variables for colors and fonts in :root
- Include responsive breakpoints (@media queries)
- Support reduced motion preference
- Use proper contrast ratios for accessibility
- Include smooth scroll behavior

## JavaScript Requirements
Every presentation MUST include:
1. **SlidePresentation Class** — Main controller with:
   - Keyboard navigation (arrow keys, space)
   - Touch/swipe support for mobile
   - Mouse wheel navigation
   - Progress bar updates
   - Navigation dots
   - Track current slide index

2. **Parent Window Communication** — For iframe navigation controls:
   - Listen for 'message' events from parent window
   - Handle actions: 'getSlideCount', 'prevSlide', 'nextSlide', 'goToSlide'
   - Send back messages: { action: 'slideCount', data: { count, current } }
   - Send back messages: { action: 'slideChanged', data: { current } }

3. **Intersection Observer** — For scroll-triggered animations:
   - Add .visible class when slides enter viewport
   - Trigger CSS animations efficiently

4. **Optional enhancements based on style**:
   - Custom cursor effects
   - Particle system backgrounds
   - Parallax effects
   - Counter animations

# Mermaid Diagrams
Include Mermaid.js CDN for rendering diagrams. Use when content would benefit from visualization:
- Flowcharts for processes
- Sequence diagrams for interactions
- Mind maps for hierarchies
- Gantt charts for timelines
- ER diagrams for relationships

**Mermaid Styling:**
- ALWAYS customize Mermaid theme to match slide style
- Use themeVariables to override colors with slide palette
- Apply custom CSS classes to mermaid containers
- Example custom theme:
\`\`\`javascript
mermaid.initialize({
  theme: 'base',
  themeVariables: {
    primaryColor: 'var(--accent-color)',
    primaryTextColor: 'var(--bg-primary)',
    primaryBorderColor: 'var(--accent-secondary)',
    lineColor: 'var(--accent-color)',
    secondaryColor: 'var(--bg-secondary)',
    tertiaryColor: 'var(--bg-primary)',
    fontSize: '16px'
  }
});
\`\`\`

**CDN to include:**
\`\`\`html
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
\`\`\`

# Animation Patterns

## Entrance Animations (choose based on style vibe)
- Fade + Slide Up (most common): opacity 0 + translateY(30px) → opacity 1 + translateY(0)
- Scale In: opacity 0 + scale(0.9) → opacity 1 + scale(1)
- Blur In: opacity 0 + blur(10px) → opacity 1 + blur(0)
- Slide from Left: opacity 0 + translateX(-50px) → opacity 1 + translateX(0)

## Timing
- Dramatic/Cinematic: 0.8-1.2s
- Professional: 0.3-0.5s (fast, subtle)
- Playful: 0.5-0.8s with bouncy easing
- Minimal: 0.4-0.6s gentle fades

# Style Guidelines

## Dark Themes (professional, confident, tech)
- Background: #0a0f1c to #1e293b range
- Text: #ffffff primary, #94a3b8 secondary
- Accent: Electric blue (#00ffcc, #3b82f6), neon (#ff00aa)
- Effects: Glow, grid patterns, particles

## Light Themes (editorial, friendly)
- Background: #faf9f7 to #ffffff range
- Text: #1a1a1a primary, #666666 secondary
- Accent: Muted but distinctive (#c41e3a, #ff3300, #b45309)
- Effects: Paper textures, clean lines, whitespace

# Fonts to Use (via Google Fonts)
- Clash Display (tech, bold) - use @import from Fontshare or similar
- Libre Baskerville (professional, serif)
- Space Grotesk (futuristic)
- JetBrains Mono (developer)
- Cormorant Garamond (editorial, elegant)
- Archivo (geometric, strong)
- Nunito (friendly, rounded)
- Playfair Display (magazine, elegant)
- Cabinet Grotesk (modern SaaS)
- Satoshi (clean, technical) - via Fontshare

# AVOID (Generic AI Patterns)
- Inter (unless specified in Gradient Wave style)
- Roboto, Arial, Helvetica as display fonts
- Purple/violet gradients on white backgrounds
- Generic blue (#6366f1) as primary
- Standard 3-column feature grids
- Rounded rectangles with shadows everywhere

# Content Processing
1. Extract the main topics/sections from the document
2. Create a logical slide structure (typically 5-15 slides)
3. Title slide with document title
4. Content slides with key points
5. Each slide should have ONE main idea
6. Use bullet points, not paragraphs
7. Include visual hierarchy (h1, h2, h3, p)

# Output Format
Return ONLY the complete HTML file. No markdown, no explanation. Just the HTML code starting with <!DOCTYPE html> and ending with </html>.

# Example Slide Structure
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Presentation Title</title>
  <link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    /* CSS variables for colors */
    :root {
      --bg-primary: ...;
      --text-primary: ...;
      --accent-color: ...;
    }
    /* Reset and base styles */
    /* Slide styles with scroll-snap */
    /* Animation classes (.reveal, .visible) */
    /* Mermaid styling */
    .mermaid {
      display: flex;
      justify-content: center;
      margin: 2rem 0;
    }
    /* Responsive breakpoints */
  </style>
</head>
<body>
  <section class="slide">
    <h1>Title</h1>
    <p class="reveal">Content</p>
  </section>
  <!-- More slides... -->
  <script>
    // Initialize Mermaid with custom theme
    mermaid.initialize({
      theme: 'base',
      themeVariables: {
        primaryColor: 'var(--accent-color)',
        primaryTextColor: 'var(--bg-primary)',
        primaryBorderColor: 'var(--accent-secondary)',
        lineColor: 'var(--accent-color)',
        secondaryColor: 'var(--bg-secondary)',
        tertiaryColor: 'var(--bg-primary)',
        fontSize: '16px'
      },
      startOnLoad: true
    });

    // SlidePresentation class
    class SlidePresentation {
      constructor() {
        this.slides = document.querySelectorAll('.slide');
        this.currentSlide = 0;
        this.totalSlides = this.slides.length;
        this.init();
      }

      init() {
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight' || e.key === ' ') this.nextSlide();
          if (e.key === 'ArrowLeft') this.prevSlide();
        });

        // Touch support
        let touchStartX = 0;
        document.addEventListener('touchstart', (e) => {
          touchStartX = e.touches[0].clientX;
        });
        document.addEventListener('touchend', (e) => {
          const touchEndX = e.changedTouches[0].clientX;
          const diff = touchStartX - touchEndX;
          if (Math.abs(diff) > 50) {
            if (diff > 0) this.nextSlide();
            else this.prevSlide();
          }
        });

        // Parent window communication
        window.addEventListener('message', (e) => {
          const { action } = e.data;
          switch (action) {
            case 'getSlideCount':
              this.sendSlideCount();
              break;
            case 'prevSlide':
              this.prevSlide();
              break;
            case 'nextSlide':
              this.nextSlide();
              break;
            case 'goToSlide':
              this.goToSlide(e.data.index);
              break;
          }
        });

        // Intersection Observer for animations
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
            }
          });
        }, { threshold: 0.5 });

        this.slides.forEach(slide => observer.observe(slide));

        // Initial slide count
        this.sendSlideCount();
      }

      nextSlide() {
        if (this.currentSlide < this.totalSlides - 1) {
          this.currentSlide++;
          this.goToSlide(this.currentSlide);
        }
      }

      prevSlide() {
        if (this.currentSlide > 0) {
          this.currentSlide--;
          this.goToSlide(this.currentSlide);
        }
      }

      goToSlide(index) {
        this.currentSlide = index;
        this.slides[index].scrollIntoView({ behavior: 'smooth' });
        this.sendSlideChanged();
      }

      sendSlideCount() {
        window.parent.postMessage({
          action: 'slideCount',
          data: { count: this.totalSlides, current: this.currentSlide + 1 }
        }, '*');
      }

      sendSlideChanged() {
        window.parent.postMessage({
          action: 'slideChanged',
          data: { current: this.currentSlide + 1 }
        }, '*');
      }
    }

    // Initialize immediately if DOM is ready, otherwise wait for DOMContentLoaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => new SlidePresentation());
    } else {
      new SlidePresentation();
    }
  </script>
</body>
</html>
\`\`\``;

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

Generate a complete, self-contained HTML presentation file. Remember:
- Single HTML file with inline CSS and JavaScript
- Include keyboard navigation, touch support, and scroll animations
- Include Mermaid.js CDN for diagrams when content would benefit from visualization
- Customize Mermaid theme to match the style colors (use themeVariables with the provided colors)
- Implement parent window message handling for navigation controls (getSlideCount, prevSlide, nextSlide)
- Use the specified style colors and typography
- Make it visually distinctive, not generic
- Add comments explaining the code
- Ensure it works in any modern browser

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

// HTML parser for extracting slide content
function parseHtmlSlides(html) {
  // Create a DOM parser environment
  const slides = [];

  // Extract slide sections
  const sectionRegex = /<section[^>]*class=["']([^"']*)slide[^"']*["'][^>]*>([\s\S]*?)<\/section>/gi;
  const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
  const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/i;
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/i;
  const pRegex = /<p[^>]*class=["']([^"']*)reveal[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const ulRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/gi;

  let match;
  let slideIndex = 0;

  // Also match sections without class attribute
  const simpleSectionRegex = /<section[^>]*>([\s\S]*?)<\/section>/gi;

  while ((match = simpleSectionRegex.exec(html)) !== null) {
    slideIndex++;
    const sectionContent = match[1];

    // Extract title (h1 or h2)
    let title = '';
    let titleMatch = sectionContent.match(h1Regex);
    if (!titleMatch) titleMatch = sectionContent.match(h2Regex);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    // Extract subtitle (h2 if h1 was title, or h3)
    let subtitle = '';
    if (titleMatch && titleMatch[0].includes('h1')) {
      const subMatch = sectionContent.match(h2Regex);
      if (subMatch) {
        subtitle = subMatch[1].replace(/<[^>]*>/g, '').trim();
      }
    }

    // Extract bullet points from lists
    const bullets = [];
    let ulMatch;
    while ((ulMatch = ulRegex.exec(sectionContent)) !== null) {
      const ulContent = ulMatch[1];
      let liMatch;
      while ((liMatch = liRegex.exec(ulContent)) !== null) {
        const bulletText = liMatch[1].replace(/<[^>]*>/g, '').trim();
        if (bulletText) bullets.push(bulletText);
      }
      // Reset regex lastIndex
      ulRegex.lastIndex = 0;
    }

    // Extract paragraphs as content
    const content = [];
    let pMatch;
    while ((pMatch = pRegex.exec(sectionContent)) !== null) {
      const pText = pMatch[2].replace(/<[^>]*>/g, '').trim();
      if (pText) content.push(pText);
    }
    pRegex.lastIndex = 0;

    // If no bullets found in ul, try to find any text content
    if (bullets.length === 0 && content.length === 0) {
      // Get all text content, strip HTML tags
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

    // Limit to 50 slides to avoid overwhelming the PPTX
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

    // Set content and wait for it to fully render
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF with slide-sized pages
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm'
      },
      preferCSSPageSize: true
    });

    await page.close();
    return pdfBuffer;
  }

  function generatePptx(html) {
    const slides = parseHtmlSlides(html);

    const pptx = new PptxGenJS();
    pptx.author = 'AI Slides Generator';
    pptx.title = 'Generated Presentation';
    pptx.subject = 'AI Generated Slides';

    // Define slide layout
    pptx.layout = 'LAYOUT_16x9';

    slides.forEach((slide) => {
      const presSlide = pptx.addSlide();

      let yPosition = 0.5;

      // Add title
      if (slide.title) {
        presSlide.addText(slide.title, {
          x: 0.5,
          y: yPosition,
          w: '90%',
          h: 0.8,
          fontSize: 32,
          bold: true,
          color: '363636',
          fontFace: 'Arial'
        });
        yPosition += 1.2;
      }

      // Add subtitle if exists
      if (slide.subtitle) {
        presSlide.addText(slide.subtitle, {
          x: 0.5,
          y: yPosition,
          w: '90%',
          h: 0.5,
          fontSize: 20,
          color: '666666',
          fontFace: 'Arial'
        });
        yPosition += 0.8;
      }

      // Add bullets or content
      if (slide.bullets && slide.bullets.length > 0) {
        const bulletPoints = slide.bullets.slice(0, 8); // Limit bullets per slide
        bulletPoints.forEach((bullet, idx) => {
          presSlide.addText(bullet, {
            x: 0.5,
            y: yPosition + (idx * 0.4),
            w: '90%',
            h: 0.4,
            fontSize: 16,
            color: '333333',
            fontFace: 'Arial',
            bullet: true
          });
        });
      }
    });

    return pptx.write({ outputType: 'nodebuffer' });
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
        const pptxBuffer = generatePptx(html);
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
    server: {
      host: '::',
    },
    preview: {
      host: '::',
    },
  };
});
