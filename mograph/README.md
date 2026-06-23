# Mograph Player & Exporter

The Mograph Player is a custom web-based motion graphics viewer and video exporter. It allows you to preview HTML/CSS-based animation sequences and export them as perfectly smooth, frame-stepped WebM videos.

## Features
- **Responsive Preview:** Change aspect ratios (16:9, 1:1, 9:16, 4:3) to see how fluid sequences adapt.
- **Playback Controls:** Play, pause, rewind, and fast-forward through animations.
- **Frame-Perfect Export:** Uses a backend Puppeteer process (via a custom Vite plugin) to step through animations frame-by-frame and record them. This guarantees no dropped frames or lag, regardless of the complexity of the animation.

## How to Use the App
1. Run the dev server: `npm run dev`
2. Navigate to `http://localhost:5173/mograph/`
3. Select an animation sequence from the dropdown menu.
4. Preview the animation and adjust the aspect ratio if needed.
5. Click **Download Video**, select your quality, and wait for the export to complete. The video will be downloaded to your machine automatically.

---

## Creating a New Sequence

Sequences are standalone HTML files located in the `/mograph/sequences/` directory.

### Step 1: Create the Sequence File
Create a new HTML file (e.g., `my-sequence.html`) inside the `sequences` directory. You must rely exclusively on **CSS Animations (`@keyframes`)** or the native **Web Animations API (`element.animate`)**.

**CRITICAL RULES:**
1. **No GSAP or JS timing loops:** `requestAnimationFrame` and `setInterval` will break during the Puppeteer frame-stepping export. Stick to CSS animations.
2. **No infinite animations:** Do not use `infinite` repeats. The exporter calculates the recording duration based on the longest animation's end time. Use fixed repeats (`animation-iteration-count`) or `forwards` fills.
3. **Fill Modes:** Use `animation-fill-mode: forwards` or `both` so elements hold their final frame state.
4. **Scale for Video:** Video frames are not web pages. Everything must be scaled up (e.g., Headlines should be 64-120px). Use viewport-relative units (`vw`, `vh`, `clamp()`) so the sequence remains fluid across aspect ratios.

### Step 2: Register the Sequence
Add your new sequence to the `manifest.json` file located at `/mograph/sequences/manifest.json`:
```json
{
  "sequences": [
    ...
    { "file": "my-sequence.html", "name": "My Awesome Sequence" }
  ]
}
```

---

## Agentic Workflows & Skills

If you are using an AI agent (like Codex/Antigravity) to generate new motion graphics sequences for this app, **you must use the custom skill provided in this repository**.

**Skill Name:** `mograph-sequence-authoring`  
**Location:** `.agents/skills/mograph-sequence-authoring/SKILL.md`

This skill contains the complete set of architectural constraints, advanced motion graphic patterns (kinetic typography, karaoke highlights, data-in-motion rules), and design aesthetics (density, scale, easing) required to build premium sequences for this platform. 

**Prompt Example for Agents:**
> "Use the mograph-sequence-authoring skill to create a new motion graphics sequence called 'product-launch' in the mograph app. It should feature a bold kinetic typography entrance..."
