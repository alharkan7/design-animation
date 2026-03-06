export const STYLE_PRESETS = {
  'neon-cyber': {
    name: 'Neon Cyber',
    vibe: 'Futuristic, techy, confident, cutting-edge with neon glow effects',
    colors: { bg: '#0a0f1c', bgSecondary: '#111827', accent: '#00ffcc', accentSecondary: '#ff00aa' },
    typography: { display: 'Clash Display', body: 'Satoshi' }
  },
  'midnight-executive': {
    name: 'Midnight Executive',
    vibe: 'Premium, trustworthy, sophisticated, corporate with subtle gradients',
    colors: { bg: '#0f172a', bgSecondary: '#1e293b', accent: '#3b82f6', accentSecondary: '#818cf8' },
    typography: { display: 'Libre Baskerville', body: 'Source Sans 3' }
  },
  'deep-space': {
    name: 'Deep Space',
    vibe: 'Inspiring, vast, contemplative, visionary with starfield backgrounds',
    colors: { bg: '#030712', bgSecondary: '#111827', accent: '#818cf8', accentSecondary: '#c084fc' },
    typography: { display: 'Space Grotesk', body: 'DM Sans' }
  },
  'terminal-green': {
    name: 'Terminal Green',
    vibe: 'Developer-focused, hacker aesthetic, retro-tech with monospace fonts',
    colors: { bg: '#0d1117', bgSecondary: '#161b22', accent: '#39d353', accentSecondary: '#2ea043' },
    typography: { display: 'JetBrains Mono', body: 'JetBrains Mono' }
  },
  'paper-ink': {
    name: 'Paper & Ink',
    vibe: 'Editorial, literary, thoughtful, refined with elegant serif typography',
    colors: { bg: '#faf9f7', bgSecondary: '#f5f3ef', accent: '#c41e3a', accentSecondary: '#8b1a2e' },
    typography: { display: 'Cormorant Garamond', body: 'Source Serif 4' }
  },
  'swiss-modern': {
    name: 'Swiss Modern',
    vibe: 'Clean, precise, Bauhaus-inspired, geometric with strong black typography',
    colors: { bg: '#ffffff', bgSecondary: '#f7f7f7', accent: '#ff3300', accentSecondary: '#000000' },
    typography: { display: 'Archivo', body: 'Nunito' }
  },
  'soft-pastel': {
    name: 'Soft Pastel',
    vibe: 'Friendly, approachable, creative, playful with rounded corners and soft colors',
    colors: { bg: '#fef3f2', bgSecondary: '#fef9f5', accent: '#f472b6', accentSecondary: '#a78bfa' },
    typography: { display: 'Nunito', body: 'Nunito' }
  },
  'warm-editorial': {
    name: 'Warm Editorial',
    vibe: 'Human, storytelling, photographic, magazine with warm photography',
    colors: { bg: '#fffbf5', bgSecondary: '#f5efe6', accent: '#b45309', accentSecondary: '#0369a1' },
    typography: { display: 'Playfair Display', body: 'Work Sans' }
  },
  'gradient-wave': {
    name: 'Gradient Wave',
    vibe: 'Modern SaaS, energetic, approachable with animated gradient meshes',
    colors: { bg: '#0f0f1a', bgSecondary: '#1a1a2e', accent: '#667eea', accentSecondary: '#764ba2' },
    typography: { display: 'Cabinet Grotesk', body: 'Inter' }
  }
};

export const SLIDES_SYSTEM_INSTRUCTION = `You are an expert presentation designer specializing in creating stunning, animation-rich HTML presentations. Your task is to convert document content into beautiful, zero-dependency HTML slides.

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

export function buildPrompt(stylePreset, additionalPrompt) {
  return `Analyze this document and create a presentation from it.

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
}

export function sanitizeGeneratedHtml(text) {
  let html = text;

  const codeBlockMatch = html.match(/```(?:html)?\n?([\s\S]+)```/);
  if (codeBlockMatch) html = codeBlockMatch[1];

  const doctypeIndex = html.toLowerCase().indexOf('<!doctype');
  if (doctypeIndex > 0) html = html.substring(doctypeIndex);

  const htmlEndIndex = html.toLowerCase().lastIndexOf('</html>');
  if (htmlEndIndex !== -1) html = html.substring(0, htmlEndIndex + 7);

  return html.trim();
}

export function validateGeneratedHtml(html) {
  const trimmed = html.trim();
  if (trimmed.length < 500) throw new Error('Generated content is too short');
  if (!trimmed.toLowerCase().includes('<!doctype')) throw new Error('Generated content is missing DOCTYPE');
  if (!trimmed.toLowerCase().includes('<body')) throw new Error('Generated content is missing body tag');
  const sections = trimmed.match(/<section/gi);
  if (!sections || sections.length < 2) throw new Error('Generated content should have at least 2 slide sections');
}
