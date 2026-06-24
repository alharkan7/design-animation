# Design Animation

A collection of interactive data visualization templates built with Vite. Each visualization is self-contained in its own directory with its own `index.html`, making it easy to use and modify.

## Visualizations

### Number Counter (`/counter/`)
Animated number counter with customizable styling, easing functions, and video export capabilities.

### Text to Speech (`/tts/`)
Convert text to lifelike speech using the ElevenLabs API.

### Language Distribution (`/languages/`)
Minimalist motion graphics visualizing 718 Indonesian languages by island and province. Features multiple view modes and multi-touch gestures for zoom/pan on mobile.

### APBN Education Budget (`/apbn-pendidikan/`)
Visualization of Indonesia's education budget allocation and growth from 2005 to 2025.

### Document to Slides (`/slides-generator/`)
Upload PDF or DOCX files and generate beautiful HTML slides using AI. Powered by Google Gemini.

### IDR Exchange Tracker (`/currency/`)
Interactive financial visualization of Indonesian Rupiah (IDR) exchange rates against major global currencies from 1996 to 2026.

### Mograph Player (`/mograph/`)
A professional motion graphics player and exporter. Allows previewing, controlling, and exporting HTML/CSS animation sequences as frame-perfect video. Features include:
- **Cinematic Authoring:** Strict reliance on CSS keyframes and deterministic Web Animations API.
- **Advanced Motion Techniques:** Use of clip-path masks, iris wipes, and virtual camera diagram-panning over generic bounce animations.
- **Broadcast Standards:** Hardcoded themes (no dynamic OS color shifts), SVGs over emojis, solid visual weights, and clean loop canvas exits.

## Development

### Prerequisites
- Node.js 18+ and npm

### Installation
```bash
npm install
```

### Environment Variables
Create a `.env` file in the root directory for API keys:
```
ELEVENLABS_API_KEY=your_elevenlabs_api_key
GOOGLE_GENAI_API_KEY=your_google_gemini_api_key
```

### Commands
```bash
npm run dev     # Start development server on all interfaces
npm run build   # Production build
npm run preview # Preview production build
```

## Project Structure

```
design-animation/
├── counter/             # Number counter visualization
├── languages/           # Indonesian languages visualization
├── tts/                 # Text-to-speech converter
├── apbn-pendidikan/     # Education budget visualization
├── slides-generator/    # Document to slides converter
├── currency/            # IDR exchange rate tracker
├── src/                 # Shared resources (styles, utilities)
├── public/              # Static assets and data files
├── data/                # CSV data files
├── scripts/             # Build and data processing scripts
└── api/                 # API endpoints
```

## Key Technologies

- **Vite 7.x** - Build tool with hot module replacement
- **Chart.js** - Data visualization charts
- **CountUp.js** - Animated number counting
- **ElevenLabs JS SDK** - Text-to-speech synthesis
- **Google GenAI SDK** - AI-powered content generation
- **Canvas API** - Custom rendering for complex animations
- **html2canvas & jsPDF** - Screenshot and PDF generation
- **PptxGenJS** - PowerPoint presentation generation

## License

MIT
