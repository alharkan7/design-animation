---
name: threejs-mograph-authoring
description: Use when the user wants to create a new 3D motion graphics animation using Three.js for the ThreeJS Player application. Covers best practices for Three.js scene setup, animation loops, lighting, composite video export rules, and manifest registration.
---

# Three.js Mograph Sequence Authoring

This skill guides the creation of 3D motion graphics sequences for the ThreeJS Player (`/threejs/animations/`). The player features a 3D viewer, playback controls (via custom requestAnimationFrame overriding), composite background rendering, and high-quality WebM video export.

To ensure the sequences work smoothly and can be exported as video correctly, specific architectural rules must be followed.

## 1. The Architecture Contract (Three.js & Canvas)

The player controls animation playback by hijacking the `requestAnimationFrame` loop of the iframe. It also composites the background and WebGL canvas together during video export. 
Because of this, you MUST adhere to the following rules:

**CRITICAL RULES:**
1. **Always enable preserveDrawingBuffer**: 
   - You MUST set `preserveDrawingBuffer: true` when initializing the `THREE.WebGLRenderer`.
   - `const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });`
   - If this is missing, the canvas pixels will clear immediately after presentation, resulting in completely blank/black frames during video export!
2. **Transparent Backgrounds**: 
   - Keep the renderer background transparent (`alpha: true`) and DO NOT set `scene.background = new THREE.Color(...)` in the Three.js code itself.
   - The player handles the background (Solid, Blueprint Grid, Dots, Transparent) via CSS and the composite canvas logic. Let the player manage the background.
3. **Use the Standard Animation Loop**: 
   - All animation logic (rotations, GSAP updates, mixer updates) MUST happen inside the `requestAnimationFrame(animate)` loop. 
   - Do NOT use `setInterval` or `setTimeout` for critical timing, as they will ignore the player's Pause/Play/Rewind controls.

## 2. Animation & Timing Techniques

### A. Three.js Native Animation
If you are doing simple continuous rotations or procedural generation (e.g. moving objects across the screen):
- Define an `animate()` loop using `requestAnimationFrame`.
- You can use standard elapsed time (e.g., `performance.now()`) or simply increment variables on each frame (`cube.rotation.x += 0.01`). 

### B. Fixed Duration & Looping (Highly Recommended for Export)
For video export, knowing when the animation ends is helpful. If you build a complex sequence:
- If using `GSAP` to tween Three.js properties, ensure GSAP hooks into the Three.js render loop or relies on `requestAnimationFrame` naturally.
- The player calculates `duration` via `document.getAnimations()` in the DOM. Since Three.js doesn't expose duration this way natively, the user might need to manually stop recording for complex scenes, OR you can apply dummy Web Animations API calls to an invisible DOM element (e.g. `<div id="timing-dummy"></div>`) just so the player knows the exact total duration for automatic stop.

### C. Controls & Interactivity
- Use `OrbitControls` for preview interactivity, but use `controls.autoRotate = true` combined with `controls.autoRotateSpeed` to provide cinematic sweeping camera movements during video export.

## 3. Lighting & Shading Aesthetics

To maintain a highly premium motion graphics aesthetic (e.g., sleek explainer videos):
1. **Soft Shadows**: Enable shadows on the renderer (`renderer.shadowMap.enabled = true`) and use `THREE.PCFSoftShadowMap`.
2. **Lighting Setup**: 
   - Use an `AmbientLight` for soft fill.
   - Use a `DirectionalLight` to cast sharp, dramatic shadows. Configure the shadow camera bounds (`shadow.camera.left`, `right`, `top`, `bottom`) carefully to cover the scene without losing resolution.
3. **Materials**: 
   - Use `MeshStandardMaterial` or `MeshPhysicalMaterial` for high-end rendering. 
   - Use `flatShading: true` if you are aiming for a stylized, low-poly, or voxel art look. 

## 4. Bare Imports & Vite Compatibility

This project uses Vite. Do not use CDNs with import maps for Three.js. 
- You MUST import Three.js and its addons via bare module specifiers.
- **Correct**:
  ```javascript
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  // or 'three/examples/jsm/controls/OrbitControls.js'
  ```
- **Incorrect**:
  ```javascript
  import * as THREE from 'https://unpkg.com/...';
  ```
- Never inject `<script type="importmap">`. Let Vite resolve the modules naturally from `node_modules`.

## 5. Lessons Learned & Best Practices (From Recent Sessions)

- **Model Orientation for OrbitControls**: `OrbitControls` locks the camera's Y-axis ("up" vector) to prevent rolling. If you need a horizontal panning view of a tall object (e.g., an exploded flashlight), do not try to fight the camera. Instead, rotate the entire object group horizontally (`assemblyGroup.rotation.z = -Math.PI / 2;`). The default Y-axis auto-rotation will then beautifully circle the length of the object.
- **True Flat Shading for Procedural Low-Poly**: When generating procedural terrain via `PlaneGeometry`, faces share vertices by default. To achieve a crisp, faceted low-poly aesthetic where each face has distinct lighting and vertex colors, you MUST convert the geometry using `geometry = geometry.toNonIndexed();` before displacing vertices.
- **Native Math Tweening over GSAP**: To keep dependencies light and guarantee perfect loops for video export, write native math-based easing functions (e.g., `easeInOutExpo`) inside `requestAnimationFrame`. Use `(time % loopDuration)` to drive the timeline phases instead of complex timeline libraries.
- **CAD / Blueprint Overlays**: For engineering or "exploded view" aesthetics, using `THREE.EdgesGeometry` paired with `THREE.LineSegments` yields a vastly superior, glowing CAD wireframe look compared to simply using `material.wireframe = true`.
- **Contrast & Default Backgrounds**: The default composite background color in the player is white. When adding in-scene text labels or sprites via `CanvasTexture`, ensure you use high-contrast colors (e.g., `#1a2639` or vibrant colors) and subtle white halos (`shadowColor = 'rgba(255,255,255,0.9)'`) so the text remains completely legible against both the default white background and the 3D models.
- **Local Font Loading**: When using `TextGeometry`, always host the typeface JSON file locally in `/public/fonts/` (e.g., downloading it via `curl`) rather than relying on external CDNs which can break due to CORS or Vite pathing.
- **Dual Materials for Text Legibility**: Highly reflective (chrome) text can become unreadable in dark scenes. `TextGeometry` natively supports material arrays: `[frontMat, sideMat]`. Apply a bright, flat (or slightly emissive) material to the front face, and the highly reflective/neon material to the extruded sides to automatically generate a perfect, legible outline.
- **Kinetic Shaders & Readable States**: Use `material.onBeforeCompile` to inject highly performant GLSL vertex modifications (like cylinder wrapping or sine waves). However, always program a "readable state" into your animation timeline (e.g., driving a `uStrength` uniform to `0` for 5 seconds) so the text flattens out and stops spinning long enough to be read. Never let the motion completely stop—leave a subtle 10-15% base wave or vertical hover active even during the readable state to maintain the kinetic aesthetic.
- **GPU Particle Morphing (`MeshSurfaceSampler`)**: To morph thousands of particles at 60FPS, extract vertex coordinates from geometries using `MeshSurfaceSampler`, load them into custom `BufferAttribute` arrays (`posA`, `posB`), and handle the `mix()` interpolation entirely within a custom `ShaderMaterial` vertex shader. 
- **Particle Sizing (`gl_PointSize`)**: In custom shaders, WebGL enforces a hard 1px minimum limit. If you use perspective attenuation (`/ -mvPosition.z`), ensure your base size multiplier is massive (e.g., `300.0 * pixelRatio`) so particles evaluate to distinct 4-10px orbs rather than collapsing into a chaotic 1px dust cloud.
- **Particle Blending & Custom Glows**: Never use `THREE.AdditiveBlending` if the user might export against the default white background (it renders invisible). Use `THREE.NormalBlending` with highly saturated colors. To draw elegant glowing orbs instead of default square points, use a simple math-based alpha fade in the fragment shader (`float alpha = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));`) rather than loading external PNG textures.

## Workflow / Checklist

When adding a new 3D animation sequence:
1. Create a new directory inside `/threejs/animations/<name>/`.
2. Add the `index.html` file containing the Three.js scene.
3. Ensure `preserveDrawingBuffer: true` and `alpha: true` are set on the `WebGLRenderer`.
4. Update `/threejs/animations/manifest.json` by adding the new sequence to the array:
   ```json
   { "folder": "<name>", "name": "Beautiful Name" }
   ```
5. Inform the user they can test it in the ThreeJS player and use the **Export Video** button to capture it with the background overlays!
