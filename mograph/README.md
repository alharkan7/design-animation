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
3. **Fill Modes & Flickering Fix:** Use `animation-fill-mode: both` for entry animations. Using `forwards` alone will cause a flicker because elements display their default visible state during the `animation-delay` period before snapping to their 0% keyframe. `both` ensures the 0% keyframe is applied backward during the delay period. Use `forwards` for exit animations.
4. **Scale for Video:** Video frames are not web pages. Everything must be scaled up (e.g., Headlines should be 64-120px). Use viewport-relative units (`vw`, `vh`, `clamp()`) so the sequence remains fluid across aspect ratios.
5. **Transparent Backgrounds:** Do not define a `background` color on the `body` or `html` of your sequence, and avoid full-screen background divs. The background color is configured and controlled dynamically by the Mograph Player UI.
6. **Always Use Easing:** Never use standard `linear` or `ease` for primary motion. Always use custom easing (e.g., `cubic-bezier`) to ensure animations feel premium and intentional.
7. **Responsive & Vertical Support:** Sequences must look good on any aspect ratio, including vertical (9:16). Use `@media (max-aspect-ratio: 1/1)` queries to stack elements, adjust widths to use `vmin` rather than `vw`, and scale fonts down so the layout remains organized on mobile screens.
8. **Fluid Scene Transitions & Exits:** Do not use simple global container fade-outs. Apply specific, modern exit animations (like `slideUpOut`, `scaleOut`) to individual elements before their scene fades. **Most importantly, always animate the exit of the final scene!** Do not let the sequence abruptly stop with the final object still frozen on screen. Furthermore, **overlap the scenes!** Do not wait for the disappearance animation of the previous object to fully complete before starting the appearance animation of the next object. The next scene's entry should begin while the previous scene's exit is still in motion, creating a fluid, uninterrupted sequence.
9. **Chroma Key (Green Screen) Safe Design:** Sequences must export cleanly against a green screen for NLEs like CapCut.
   - **No Opacity Fades:** Do NOT use `opacity` interpolation. Use `transform: scale()` or translations. Use `visibility: hidden` for scene containers instead of `opacity: 0`.
   - **No Soft Shadows:** Remove `box-shadow` properties to prevent muddy green fringes. Use solid borders instead.
   - **Safe Colors:** Avoid using green in your elements. Ensure graphics have strong contrast against the background so edges key out sharply.

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
