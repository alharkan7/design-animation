---
name: mograph-sequence-authoring
description: Use when the user wants to create a new motion graphics animation HTML sequence for the Mograph Player application. Covers best practices for CSS animation timing, responsiveness, design aesthetics, specific motion patterns, and the Mograph export contract.
---

# Mograph Sequence Authoring

This skill guides the creation of motion graphics sequences for the Mograph Player (`/mograph/sequences/`). The Mograph Player is a custom viewer and video exporter that renders HTML sequences perfectly frame-by-frame. 

To ensure the sequences work smoothly and can be exported as video, strict rules regarding layout, CSS animations, and design must be followed.

## 1. The Architecture Contract (WAAPI / CSS)

The Mograph Player uses the **Web Animations API** (`document.getAnimations()`) to step through frames perfectly during video export. 
Because of this, you MUST rely exclusively on **CSS Animations** (`@keyframes`) or the native Web Animations API (`element.animate`).

**Never do the following:**
- 🚫 **No GSAP or external animation libraries** unless explicitly requested and tested. Stick to CSS `@keyframes` or WAAPI.
- 🚫 **No `infinite` animations**. Video export calculates duration based on the longest animation end time. If an animation is infinite, the duration will default to maximum and the recording will capture endless loops. Use fixed repeats (`animation-iteration-count: 3`) or forwards fills.
- 🚫 **No `requestAnimationFrame` or `setInterval`**. JS-driven custom timing loops will break during the frame-stepping export process.
- 🚫 **No videos or heavy external assets** that load unpredictably.
- 🚫 **Don't calculate layout dynamically at runtime** (e.g. `getBoundingClientRect()`). Measure everything with CSS relative units (`vw`, `vh`, `%`) so it's deterministic.

## 2. Animation & Timing Rules

1. **Fill Modes & 0% Keyframes**: Use `animation-fill-mode: both` for entry animations with `animation-delay`! 
   - **CRITICAL BUG AVOIDANCE**: The `0%` keyframe MUST fully define the absolute invisible state (e.g. `transform: scale(0)` or `clip-path: inset(100% 0 0 0)`). If your `0%` keyframe is merely `scale(0.8)`, the element will sit partially visible on the screen during the delay period, creating visual bugs where it overlaps earlier scenes. Use `forwards` only for exit animations.
2. **Chain with `animation-delay`**: Orchestrate your scenes by staggering `animation-delay` across elements.
   ```css
   .word-1 { animation: slideUp 1.2s 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
   .word-2 { animation: scaleIn 0.8s 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
   ```
3. **End State First (Layout Before Animation)**: 
   - Position elements where they belong in their final visible state using static CSS.
   - Animate *from* a hidden/offset state (`opacity: 0`, `transform: translateY(80px)`) *to* the normal state (`opacity: 1`, `transform: translateY(0)`).
   - This ensures layout doesn't break regardless of screen size.
4. **Don't start at t=0**: Offset the first animation by 0.1-0.3s. A zero-delay entrance feels like a jump cut.
5. **Vary your entrances**: Do not enter every element from the same direction (e.g., everything sliding up). Mix it up: slide from left, scale up, opacity fade, blur reveal. Use at least 3 different directions/eases per scene.
6. **Asymmetry in Speed**: 
   - Entrances should take longer (0.4s - 0.8s) than exits (0.2s - 0.3s). 
   - Use `ease-out` (starts fast, decelerates) for entrances.
   - Use `ease-in` (starts slow, accelerates) for exits.
7. **Clean Loops & Fluid Exits**: Do not use simple global container fade-outs to end a scene. Apply specific, modern exit animations (like `slideUpOut`, `exitShrink`, `shiftDownOut`) to individual elements before their scene container hides. **Always animate the exit of the final scene back to a pristine blank canvas**, so the video loops seamlessly and does not abruptly end on a static frame.
8. **Overlap Scene Transitions**: Do not wait for the disappearance animation of the previous scene to fully complete before starting the appearance animation of the next scene. The next scene's entry should begin *while* the previous scene's exit is still in motion, creating a fluid, uninterrupted sequence.

## 3. Specific Motion Graphics Patterns

Motion graphics often involve kinetic typography, data visualization, and stylish overlays. Move beyond generic "popping up" or sliding DOM nodes by applying professional broadcast techniques:

### Cinematic Reveals & Masking
- **Clip-Path Wipes**: Do not use generic bouncy scales or spinning (`spinScaleIn`) for UI elements. Use `clip-path: inset(...)` or `wipeUpIn` with a snappy ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`) to mask elements as they slide in. This is much more elegant and cinematic.
- **Iris Reveals**: Use `clip-path: circle(0% at center)` to `100%` for dramatic circular expansions that feel very "digital" or "processing" oriented.

### Flowcharts & SVG Paths
- **Orthogonal Connections**: For a clean, symmetrical flowchart aesthetic, ensure SVG bezier curves (`C`) start and end with perfectly vertical or horizontal tangents. They should connect exactly at the center of the node edges (e.g., leaving a node from the absolute bottom center and entering the next node at the top center).
- **Beware the Default Fill**: When upgrading straight SVG lines (`L`) to Bezier curves (`C`, `Q`), the browser will automatically apply a black `fill` to the curve's interior. You MUST explicitly set `fill="none"` on all curved `<path>` elements to prevent ugly black shapes.
- **Path Tracing Easing**: When animating SVG `stroke-dashoffset` for glowing traces or drawing paths, NEVER use bouncy easing (`cubic-bezier(0.34, 1.56...)`). This causes the drawn line to "rubber-band" and shoot past the endpoint. Always use strict `ease-in-out` or `linear` easing for path drawing to keep the coloring smooth and simple.

### The Virtual Camera (Diagram Panning)
Instead of destroying and recreating DOM scenes chronologically, build a single massive flowchart or diagram inside a `.canvas` wrapper (e.g. `300vmin x 200vmin`). Then, animate a `.camera` wrapper using deterministic `transform: scale(...) translate(...)` to physically pan and zoom across the diagram in sync with the voiceover. Use `cubic-bezier(0.64, 0, 0.36, 1)` for buttery smooth ease-in-out camera moves.
- **Persistent Centerpieces**: To keep a hero element or watermark visible throughout a camera pan, place it at the absolute center of the `.canvas` and omit any exit animations. It will act as a fixed focal point that only vanishes when the entire `.camera` scales to 0 at the end of the sequence.

### Design Elements & Visual Weight
- **No Emojis**: 🚫 Do not use emojis for icons. Always use crisp, scalable inline SVGs.
- **Solid Visual Weight**: Ensure animated objects (like labels, badges, or pills) have solid background fill colors mapped from the palette. Outlined elements with transparent backgrounds lack the necessary visual weight to punch through during rapid motion graphics.

### Kinetic Typography & Emphasis
- **Karaoke Highlights**: Animate colors of words sequentially. To make it high-energy, add an accent glow and a 15% scale pop to the active word.
- **Marker Sweep (Highlight Mode)**: A yellow (or accent color) marker sweep behind text. Achieve this with an absolutely positioned `.highlight-bar` behind the text, `transform-origin: left center;`, and animating `transform: scaleX(0)` to `scaleX(1)`.
- **Hand-drawn Circle (Circle Mode)**: Create an organic circle around a key metric or word. Use `border-radius: 50%`, slightly rotate it (`rotate(-3deg)`), and animate `transform: scale(0)` to `scale(1)` with a bouncy `cubic-bezier(0.34, 1.56, 0.64, 1)` ease.
- **Burst Lines**: Radiating lines from the center of a text element to add impact ("WOW"). Use multiple absolutely positioned `.burst-line` elements rotated around the center, animating their `scaleY` and `opacity`.

### Data in Motion (Stats & Charts)
- **Visual Weight**: A number on its own floats in empty space. Pair every metric with a visual element that gives it presence—a proportional fill bar, a background color shift, or a progress ring.
- **Visual Continuity**: When showing successive stats of the same concept (e.g., Q1 -> Q2 -> Q3), keep the visual aesthetic the same. Only change the aesthetic when shifting to a completely new concept.
- **Avoid Web Dashboards**: 
  - 🚫 **No pie charts** (hard to read in motion).
  - 🚫 **No multi-axis charts**.
  - 🚫 **No gridlines, tick marks, or legends** (visual noise).
  - 🚫 **No 6-panel dashboards** (2-3 metrics side-by-side maximum).

## 4. Video Composition & Scale

Video frames are not web pages. Web sizes are invisible on video.

1. **Scale Everything Up**:
   - Headlines: `64px` - `120px` (use `clamp(4rem, 10vw, 8rem)`)
   - Body Text: `28px` - `42px` (use `clamp(1.5rem, 4vw, 3rem)`)
   - Padding: `60px` - `140px`
   - Borders: `2px` - `4px`
2. **Density (8-10 elements per scene)**: A frame with 3 elements feels empty. Every scene needs:
   - **Background texture**: Radial glow, grain, grid, oversized ghost type. *Never solid flat color.*
   - **Midground content**: The actual message.
   - **Foreground accents**: Dividers, labels, data bars, registration marks, monospace metadata. These make it feel "produced".
3. **Frame Composition**:
   - Minimum two focal points so the eye can travel.
   - Anchor content to edges (left/top or right/bottom) rather than always floating in the center.
   - Use structural elements like rules and border panels to guide the eye.

## 5. Design Aesthetics & Color

1. **Theme Locking**: 🚫 Do not leave coloring to dynamic browser/OS theme adjustments. Explicitly hardcode your CSS variables using hex colors and enforce `color-scheme: light` or `color-scheme: dark` on the body. This guarantees the video exporter renders the exact intended design regardless of the host machine's settings.
2. **Typography**: Use modern Google Fonts. Pair a bold, expressive font (e.g., `Space Grotesk`, `Outfit`, `Syne`) with a clean sans-serif (`Inter`, `Roboto`).
3. **Color Presence**: 
   - Muted is fine, flat is not. Every scene must have a highly visible accent color.
   - Favor dark modes (`#0a0a0f`) for maximum contrast.
   - **WARNING:** Do NOT use full-screen linear gradients on dark backgrounds (they cause banding under video compression). Use radial gradients or solid fills + localized glows instead.
   - Use CSS text gradients for premium typography:
     ```css
     background: linear-gradient(135deg, #ff6600, #ffcc00);
     -webkit-background-clip: text;
     -webkit-text-fill-color: transparent;
     ```
3. **Ambient Motion**: Static decoratives feel dead. Every decorative element (glows, lines, grids) should have slow ambient motion (breathe, drift, pulse). 
4. **Custom Easing**: Never use standard `ease` or `linear` for primary motion. Subtle reads as static at 30fps. Use custom `cubic-bezier` curves for snappy, professional motion.
   ```css
   /* Snappy entrance */
   cubic-bezier(0.16, 1, 0.3, 1)
   /* Bouncy entrance */
   cubic-bezier(0.34, 1.56, 0.64, 1)
   ```

## 6. Chroma Key (Green Screen) Safe Design

To support users who edit videos in basic NLEs like CapCut (which do not support WebM alpha channels), sequences must be perfectly compatible with Green Screen / Chroma Key removal.

1. **No Opacity Fades**: 
   - 🚫 Do NOT use `opacity` transitions (`fadeIn`, `fadeOut`).
   - Fading elements blend with the green background, creating a muddy green ghosting effect when keyed out.
   - ✅ Instead, make elements appear and disappear physically using `transform: scale()` (scaling 0 to 1) or sliding them off-screen.
   - ✅ Use `visibility: hidden` to `visibility: visible` for scene containers instead of `opacity: 0` to `1`.
2. **No Soft Shadows**:
   - 🚫 Remove all `box-shadow` properties from objects. Soft, semi-transparent drop shadows cannot be cleanly keyed out and will leave dark green fringes.
   - ✅ Use solid, hard borders (`border: 2px solid`) to provide contrast and separation instead of shadows.
3. **Safe Colors & Contrast**:
   - 🚫 Avoid using greens or any colors that are close to standard chroma key green (`#00FF00`, `#00B140`).
   - ✅ Ensure all text and graphics have strong contrast against bright backgrounds so the edges key out with absolute sharpness.

## Workflow / Checklist

When adding a new sequence:
1. Create the new HTML file in `/mograph/sequences/<name>.html`.
2. Follow the design and animation rules above.
3. Update `/mograph/sequences/manifest.json` by adding the new sequence to the array:
   ```json
   { "file": "<name>.html", "name": "Beautiful Name" }
   ```
4. Inform the user they can test it in the Mograph player and export it as video.
