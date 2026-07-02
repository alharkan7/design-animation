# Three.js Exploration To-Do List

A curated list of 3D aesthetic styles and technical implementations to build for the `/threejs` player. These styles are specifically chosen for their effectiveness in **storytelling, narration, and explainer videos**.

## 1. Isometric Dioramas & Mini-Worlds
* **Concept:** Render a floating, orthographic "slice" of a world or room on a clean background.
* **Why it's useful:** Perfect for setting a scene in a narrative or explaining a localized ecosystem (e.g., a smart home, a server room).
* **Technical focus:** `OrthographicCamera`, clean soft shadows, baked ambient occlusion.

## 2. Exploded View Assemblies
* **Concept:** A mechanical or product model that pulls apart its individual components to reveal how it's built, usually triggered by scroll or timeline.
* **Why it's useful:** The holy grail for product explainer videos and engineering breakdowns.
* **Technical focus:** Object grouping, precise `GSAP` tweening of positions, and wireframe overlays.

## 3. Kinetic 3D Typography
* **Concept:** Massive, bold text that exists in 3D space. The text can twist, shatter, wave, or wrap around invisible cylinders.
* **Why it's useful:** High-impact title cards, hook animations, and highlighting key words during a voiceover narration.
* **Technical focus:** `TextGeometry`, custom shaders for wave/distortion effects, environment mapping for reflections.

## 4. Abstract Particle Morphing
* **Concept:** Thousands of tiny glowing particles that swarm and morph from one distinct shape (e.g., a brain) into another (e.g., a lightbulb).
* **Why it's useful:** Excellent for explaining abstract concepts like "AI", "networks", or "ideas" where physical objects don't apply.
* **Technical focus:** `InstancedMesh` or `Points`, GPU compute shaders, `THREE.BufferGeometry` transitions.

## 5. Low-Poly Landscapes & Flythroughs
* **Concept:** A stylized, faceted terrain with simple colors and no complex textures, viewed from a sweeping camera path.
* **Why it's useful:** Great for background "B-roll" during long narrative segments. It gives a sense of journey and progression.
* **Technical focus:** `PlaneGeometry` with displaced vertices, `CatmullRomCurve3` for smooth camera tracking, `flatShading`.

## 6. Data Topography (3D Maps & Spikes)
* **Concept:** A geographical map where regions extrude upward based on data values, or spikes emerge from a flat surface.
* **Why it's useful:** Data-driven journalism, demographic explainers, and financial storytelling.
* **Technical focus:** SVG extrusion (`SVGLoader`), mapping GeoJSON to 3D meshes, color gradients based on height.

## 7. Line Art & Schematic Blueprints
* **Concept:** Rendering 3D objects as glowing wireframes or clean vector-like lines without solid faces.
* **Why it's useful:** Pairs perfectly with the "Blueprint Grid" background to explain software architecture, blueprints, or sci-fi UI elements.
* **Technical focus:** `EdgesGeometry`, `LineBasicMaterial`, post-processing (Bloom).

## 8. Glassmorphism / Refractive Objects
* **Concept:** Crystal, glass, or acrylic objects that beautifully distort the environment and objects behind them.
* **Why it's useful:** Highly premium, modern aesthetic for luxury product explainers or sleek UI mockups.
* **Technical focus:** `MeshPhysicalMaterial` (transmission, thickness, roughness), Environment Maps (HDRI).

## 9. Cel-Shading (Toon Style)
* **Concept:** Non-photorealistic rendering that makes 3D models look like flat, 2D comic books or anime art with heavy outlines.
* **Why it's useful:** Fantastic for stylized narrative storytelling, character-driven videos, or giving a unique "hand-drawn" feel.
* **Technical focus:** `MeshToonMaterial`, OutlineEffect post-processing, custom gradient maps.

## 10. Soft Body & Cloth Simulation
* **Concept:** Objects that squish, bounce, or ripple like fabric, jelly, or balloons in the wind.
* **Why it's useful:** Extremely satisfying visual "B-roll", playful brand identities, or explaining physics/tension concepts.
* **Technical focus:** Ammo.js or Cannon-es physics engines, verlet integration, `PlaneGeometry` vertex manipulation.

## 11. Volumetrics (Fog, Smoke & Lasers)
* **Concept:** Cinematic scenes filled with dense fog where light beams visibly scatter (god rays) or neon lasers cut through the mist.
* **Why it's useful:** Creating dramatic, moody atmospheres, or explaining optics and light-based technology.
* **Technical focus:** `THREE.FogExp2`, Volumetric Light shaders, Post-processing (GodRays effect).

## 12. Raymarching & SDFs (Signed Distance Fields)
* **Concept:** Mathematical, infinitely smooth blobs that melt together seamlessly (like a lava lamp) or infinite fractal worlds.
* **Why it's useful:** Sci-fi concepts, cellular biology (cells dividing), or mesmerizing background abstractions.
* **Technical focus:** Custom GLSL Fragment Shaders, raymarching algorithms, skipping traditional geometry entirely.

---

### How to use this list:
To create a new entry:
1. Create a new folder in `/threejs/animations/` (e.g., `isometric-room`).
2. Add the `index.html` file with the logic.
3. Register the folder in `/threejs/animations/manifest.json`.
4. Hit the **Export Video** button in the player to use it in your final video!
