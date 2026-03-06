# Presenton vs Our Slides Generator — Research Comparison

## 1. Architecture Overview

| Aspect | Our `/slides-generator` | Presenton |
|--------|------------------------|-----------|
| **Stack** | Single Vite app (JS only) | FastAPI (Python) + Next.js (React/TS) |
| **AI generation** | Single Gemini call → complete self-contained HTML with inline CSS/JS | Multi-step pipeline: outlines → structure → per-slide JSON → React template rendering |
| **Slide rendering** | AI-generated raw HTML in an iframe | 125+ pre-built React component templates filled with AI-generated structured JSON |
| **PPTX library** | `pptxgenjs` (JS, browser-side) | `python-pptx` (Python, server-side) |
| **PDF export** | Client: `html2canvas` + `jsPDF`; Server: Puppeteer | Puppeteer screenshots → PDF |

## 2. How Each System Styles Slides

### Our system: AI-driven monolithic HTML

- Styling is **entirely AI-generated**. The system instruction (`lib/slides-config.js`) tells Gemini to produce a complete HTML file with inline `<style>`.
- **Style presets** (`STYLE_PRESETS`) are passed as text to the AI: hex colors, font names, and a "vibe" string. The LLM interprets these freely.
- Fidelity depends on LLM output quality. No guaranteed pixel-perfect layouts.

### Presenton: Template-driven with CSS variable theming

- **125+ hand-crafted React component templates** with fixed pixel-perfect layouts (e.g. `TitleDescriptionBulletList`, `TitleMetricsChart`).
- Each template has a **Zod schema** with character limits. AI fills content only, never layout.
- Theming via CSS custom properties at runtime:
  - `--primary-color`, `--background-color`, `--card-color`, `--stroke`, `--primary-text`, `--background-text`, `--graph-0`…`--graph-9`
  - `--body-font-family`, `--heading-font-family`
- Templates reference variables inline: `backgroundColor: 'var(--background-color, #FFFFFF)'`.
- Five built-in themes + user-created custom themes.

**Key difference:** Presenton styling is deterministic. Ours is probabilistic (LLM-generated each time).

## 3. How Each System Converts Web Slides to PowerPoint

### Our system (before improvement): Flat text extraction

Flow in `slides-app.js`:

1. `parseAllSlides()` — iterates `<section>` elements, makes all visible, calls `parseSlide()`.
2. `parseSlide()` — extracts `backgroundColor`/`color` via `getComputedStyle()`, then `collectSlideElements()`.
3. `collectSlideElements()` — walks DOM children:
   - `h1`/`h2` → title, `h3`–`h6` → subtitle, `p` → text, `ul`/`ol` → list, `img` → base64 capture
4. `downloadPptx()` — PptxGenJS: title in top 30%, **all remaining content concatenated into a single `addText()` block**.

**Limitations:** No positional awareness, no shapes/backgrounds, single text block per slide, spatial layout lost.

### Presenton: Pixel-perfect DOM-to-PPTX pipeline

**Stage 1 — Puppeteer DOM Traversal** (`presentation_to_pptx_model/route.ts`):
- Opens rendered slides in headless Chrome (1280×720).
- Recursively walks every child DOM element via `getAllChildElementsAttributes()`.
- For each element, `getElementAttributes()` extracts via `getComputedStyle()`:
  - Position: `getBoundingClientRect()` relative to slide root.
  - Font: name, size, weight, color, italic.
  - Background: color + opacity (RGBA parsing).
  - Border: color, width, opacity.
  - Shadow: offset, blur, spread, color, opacity, angle.
  - Border radius, z-index, opacity, text-align, line-height, object-fit, filters.
  - Images: `src` or `background-image`.
- SVG/canvas/table → screenshotted as PNG.
- `<p>` with inline formatting (`<strong>`, `<em>`, etc.) → captures `innerHTML` for rich text.

**Stage 2 — Element-to-PPTX Model Conversion** (`pptx_models_utils.ts`):
- Maps `ElementAttributes` → 4 PPTX shape types:
  - `PptxTextBoxModel` — text + position + font.
  - `PptxAutoShapeBoxModel` — shapes with fill, border, shadow, rounded corners + text.
  - `PptxPictureBoxModel` — images with object-fit, clip, border-radius, opacity.
  - `PptxConnectorModel` — `<hr>` → lines.

**Stage 3 — PPTX Creation** (`pptx_presentation_creator.py` via `python-pptx`):
- 1280×720pt presentation on blank layouts.
- Per shape: `add_textbox()`, `add_shape()`, `add_picture()`, `add_connector()` at exact positions.
- Shadow via raw XML `<a:outerShdw>`, border-radius via `shape.adjustments[0]`.
- Image processing: border-radius rounding, object-fit, circle crop, invert, opacity (Pillow).

**Stage 4 — HTML Rich Text Parsing** (`html_to_text_runs_service.py`):
- Python `HTMLParser` with tag stack tracking bold/italic/underline/strike/code.
- Produces `PptxTextRunModel` per formatted run.

**Result:** Every element retains its exact pixel position. Shapes are editable. Text is editable with correct formatting. Complex visuals (SVG, charts) are gracefully screenshotted.

## 4. Migration Plan (PPTX Export Only)

We keep our creative AI-generated HTML approach for preview and upgrade only the PPTX export pipeline.

| Priority | What to copy | Source | Effort | Impact |
|----------|-------------|--------|--------|--------|
| 1 | DOM traversal for positioned elements | `route.ts` `getElementAttributes()` | Medium | Correct x/y/w/h positions |
| 2 | Per-element PPTX shape creation | `pptx_models_utils.ts` | Medium | Independent editable objects |
| 3 | AutoShape support (rounded rect + fill/border/shadow) | `pptx_presentation_creator.py` | Medium | Styled cards preserved |
| 4 | Inline HTML → text runs | `html_to_text_runs_service.py` | Low | Rich text formatting |
| 5 | SVG/canvas screenshot fallback | `route.ts` `screenshotElement()` | Low | Mermaid diagrams export |
| 6 | Image handling (object-fit, border-radius) | `pptx_presentation_creator.py` | Medium | Image styling retained |
| 7 | Shadow XML manipulation | `pptx_presentation_creator.py` | Low | Box-shadows in PPTX |

### Implementation approach

Since our stack is JS-only (Vite + Node), we implement the full pipeline in JavaScript:
- **Server-side Puppeteer** (already available for PDF export) does the DOM traversal.
- **`pptxgenjs`** is enhanced to create positioned shapes per element instead of flat text blocks.
- The entire pipeline runs in the existing `slidesExportPlugin()` Vite server plugin.

## 5. Deferred: Template-based Slide Styling

Adopting presenton's 125+ React template system is deferred. It would require:
- Building a React rendering layer.
- Creating template components with Zod schemas.
- Changing the AI pipeline to output structured JSON instead of HTML.
- Much larger architectural change for uncertain benefit (we'd lose the creative variety of AI-generated layouts).
