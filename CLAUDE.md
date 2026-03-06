# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collection of interactive data visualization templates built with Vite. Each visualization is self-contained in its own directory with its own `index.html`. The project includes:

- **counter/** - Animated number counter with video export
- **languages/** - Interactive visualization of 718 Indonesian languages with multiple view modes
- **tts/** - Text-to-speech conversion using ElevenLabs API
- **apbn-pendidikan/** - Indonesia education budget visualization (2005-2025)

## Development Commands

```bash
npm run dev     # Start development server on all interfaces
npm run build   # Production build
npm run preview # Preview production build
```

## Architecture

### Project Structure
- Each visualization is a standalone page with its own `index.html`
- Shared resources are in `/src/` (styles, utilities)
- Data files are in `/public/` (JSON for languages) and `/data/` (CSV for budgets)
- Static assets are in `/public/`

### Key Technologies
- **Vite 7.x** - Build tool with hot module replacement
- **Chart.js** - Data visualization charts
- **CountUp.js** - Animated number counting
- **ElevenLabs JS SDK** - Text-to-speech synthesis
- **Canvas API** - Custom rendering for complex animations

### Shared Resources
- `/src/style.css` - Global styles with CSS variables for theming
- `/src/recorder.js` - VideoRecorder class for canvas-to-video export (WebM format)

### Vite Configuration
The `vite.config.js` includes a custom plugin that provides a `/api/tts` endpoint for ElevenLabs text-to-speech conversion. This endpoint runs on both dev and preview servers.

The plugin reads API keys from `ELEVENLABS_API_KEY` or `VITE_ELEVENLABS_API_KEY` environment variables (set in `.env`).

## Data Processing

### Languages Data
- Raw data in `/public/languages/` (lang_list.json, lang_by_island.json, lang_by_province.json)
- Data bundled via scripts in `/scripts/`

### Budget Data
- CSV files in `/data/`
- Parsed client-side with custom formatting for currency (Trillions IDR)

## Common Patterns

### Visualization Pages
- Load shared CSS from `/src/style.css`
- Use ES modules with `type="module"` scripts
- Implement glassmorphism design with backdrop filters
- Support multi-touch gestures for zoom/pan on mobile

### Theming
CSS variables in `:root` define the color scheme:
- `--bg-gradient`, `--card-bg`, `--text-primary`, `--accent-color`
- Light/dark theme variants in specific pages

### Video Export
The `VideoRecorder` class (`/src/recorder.js`) captures canvas frames and exports as WebM. Used by the counter visualization for recording animations.
