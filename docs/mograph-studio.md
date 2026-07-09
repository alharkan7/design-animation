# Mograph Studio — Development Plan

Spin out the **mograph** (2D) and **threejs** (3D) apps from `design-animation` into a standalone product: one player shell, two engines, offline video export up to 4K.

---

## 1. Goals


| Goal             | Detail                                                                |
| ---------------- | --------------------------------------------------------------------- |
| WYSIWYG export   | Video matches what the player shows (same renderer + timeline)        |
| Fixed resolution | Export at 720p / 1080p / 2K / **4K**, independent of monitor size     |
| Two engines      | 2D HTML/CSS sequences and 3D Three.js scenes under one app            |
| Deployable       | Static UI on Vercel (or equivalent); heavy render off the static host |
| Preserve catalog | Keep existing sequences and agent skills with path updates only       |
| Clean deps       | No TTS, slides, Gemini, or other monorepo APIs                        |




### Non-goals

- Accounts, billing, multi-user projects
- Rewriting sequences into Remotion / React / Rive
- Putting Chromium export on Vercel serverless
- Screen / tab recording as the primary export path

---



## 2. Current state (source monorepo)



### 2.1 Apps


| App        | Role               | Content                                | Player                       |
| ---------- | ------------------ | -------------------------------------- | ---------------------------- |
| `mograph/` | 2D player + export | ~42 HTML sequences + `manifest.json`   | Vanilla JS/CSS, iframe stage |
| `threejs/` | 3D player + export | 13 animation folders + `manifest.json` | Near-identical shell         |


Shared UI (toolbar, sidebar, BG presets, aspect ratio) is duplicated almost line-for-line.

### 2.2 Export today


| Engine | Method                                                                                     | Works on localhost | Works on Vercel                                                     |
| ------ | ------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------- |
| **2D** | Vite middleware + Puppeteer: WAAPI frame-step → screenshots → in-page MediaRecorder → WebM | Yes                | **No** (API never ships; serverless cannot host long Chromium jobs) |
| **3D** | Client: composite canvas + `captureStream` + MediaRecorder                                 | Yes                | Yes (static), but resolution is viewport-coupled                    |




### 2.3 Why 2D breaks when deployed

1. Export lives only in `vite.config.js` (`configureServer` / `configurePreviewServer`), not as a deployable API.
2. Puppeteer + multi-minute encodes do not fit Vercel serverless (timeouts, binary size, memory).
3. Current pipeline buffers **all frames as base64** then re-encodes; at 4K this OOMs (≈33MB RGBA per frame).



### 2.4 Why 3D export is incomplete

- Records the **live preview canvas** size, not a logical export size.
- Realtime MediaRecorder can drop frames under GPU load.
- No quality picker / fixed 4K path.



### 2.5 Assets and skills to keep

**Carry over**

- `mograph/` (player, sequences, manifest)
- `threejs/` (player, animations, manifest)
- `public/models`, `public/textures`, `public/draco`, `public/fonts`
- WAAPI frame-step logic in `motionGraphicsExportPlugin` (`vite.config.js`)
- Skills: `2d-motion-graphics`, `3d-motion-graphics`

**Leave behind**

- Other apps (counter, languages, TTS, slides, citation, etc.)
- Gemini / ElevenLabs plugins
- `api/generate-slides.js` and monorepo-only APIs

---



## 3. Product shape

**One product, two engines, one export contract.**


| Piece                   | Responsibility                                                            |
| ----------------------- | ------------------------------------------------------------------------- |
| **2D engine**           | HTML/CSS/WAAPI sequences (`sequences/2d/`)                                |
| **3D engine**           | Three.js scenes (`sequences/3d/`)                                         |
| **Shared shell**        | Toolbar, sidebar, BG presets, aspect ratio, playhead, progress, export UX |
| **Fixed logical stage** | Design resolution for preview **and** export; monitor is only a viewer    |




### UX outline

1. **Home** — enter 2D or 3D (tabs or routes).
2. **Shared controls** — aspect ratio, BG (solid / grid / dots / paper / transparent), play/pause/scrub, fullscreen.
3. **Export** — resolution (720p–4K), fps, background include toggle; progress UI.
4. **Catalog** (later) — search/filter across both manifests.

Preview always **letterboxes/scales** the stage into the viewport. Aspect ratio changes the **stage**, not “whatever the window is.”

---



## 4. Architecture decisions



### 4.1 Framework: Vite (not Next.js)


| Need                                | Vite            | Next.js                           |
| ----------------------------------- | --------------- | --------------------------------- |
| Static players + sequence HTML      | Excellent       | Overhead                          |
| Three.js ES modules                 | Native          | Fine but no gain                  |
| Client 4K WebCodecs export          | Browser-only    | No help                           |
| Frame-perfect 2D Chromium export    | Separate worker | API routes still bad for Chromium |
| Agent-authored plain HTML sequences | Simple          | Extra ceremony                    |


**Decision:** Vite multi-page or light SPA for the studio. No Next.js unless product chrome (auth, billing) is added later.

**UI:** Keep vanilla JS initially (or light framework later if shell complexity grows). Do not rewrite sequences into a component framework.

### 4.2 Export model: offline render, not screen record

Export is three problems:


| Problem       | Wrong model                  | Correct model                     |
| ------------- | ---------------------------- | --------------------------------- |
| Composition   | Whatever is on the monitor   | Logical stage at fixed `W×H`      |
| Rasterization | Film the preview panel       | Render target of size `W×H`       |
| Encoding      | Buffer all frames, then hope | Stream-encode one frame at a time |


**WYSIWYG** means preview and export share the same renderer and clock; only `W×H` and encode settings change.

Resolution is **not** tied to the user’s screen:

```text
Logical stage:  3840 × 2160   ← export bitmap
Preview:        scale(fit)    ← display only
```

- **3D:** `renderer.setSize(exportW, exportH)` (or a `WebGLRenderTarget`).
- **2D:** stage/iframe laid out at `exportW×exportH`, previewed with `transform: scale(...)`.



### 4.3 Rasterization: split by engine


| Engine | Rasterizer                                  | Why                                                                                                                   |
| ------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **3D** | WebGL canvas at export size, stepped time   | Already a bitmap source; true pixels at any res in the browser                                                        |
| **2D** | Headless Chromium screenshots + WAAPI scrub | Free-form CSS has no silent “exact compositor pixels” web API; Chromium screenshots remain the fidelity gold standard |


Client DOM libraries (html2canvas / modern-screenshot) are optional **draft** only; they drift on glass, filters, and complex CSS.

### 4.4 Encoding: streaming, prefer MP4


| Encoder                                | Where         | Role                                                   |
| -------------------------------------- | ------------- | ------------------------------------------------------ |
| **WebCodecs + mp4-muxer / mediabunny** | Browser       | Primary for 3D (and optional 2D draft)                 |
| **ffmpeg**                             | Worker / CLI  | Primary for 2D studio export (H.264 MP4, NLE-friendly) |
| MediaRecorder                          | Fallback only | Weaker timing; avoid as default                        |


**Rules**

- Never buffer all frames in memory (especially 4K).
- Prefer **MP4 (H.264)** over WebM-only for editor compatibility.
- Offline render may be slower than realtime; quality wins over live capture.



### 4.5 Chosen end-state architecture

```text
                    ┌──────────────────────┐
   Preview UI  ───► │ Fixed logical stage  │◄── aspect + quality
                    │ shared timeline t    │
                    └──────────┬───────────┘
           ┌───────────────────┼───────────────────┐
           ▼                                       ▼
   2D: Chromium screenshots                 3D: WebGL @ W×H
   (worker / CLI)                           stepped clock (client)
           └───────────────────┬───────────────────┘
                               ▼
                    Streaming encoder
                    ffmpeg (2D) / WebCodecs (3D)
                               ▼
                           MP4 file
```


| Engine | Rasterize                         | Encode           | Runs on                    |
| ------ | --------------------------------- | ---------------- | -------------------------- |
| 3D     | WebGL at `W×H`, `t = frame / fps` | WebCodecs → MP4  | User browser (static host) |
| 2D     | Chromium viewport + WAAPI scrub   | ffmpeg → MP4     | Render worker or local CLI |
| UI     | Scaled stage                      | Shared export UX | Vercel / CF Pages          |




### 4.6 Explicitly rejected

- Primary export via screen/tab recording or Element Capture
- Puppeteer inside Vite plugins as production architecture
- All-frames-in-RAM encode path
- Forcing Chromium jobs onto Vercel serverless
- Full rewrite to Remotion/scene-graph in v1 (optional later only)

---



## 5. Target repository layout

```text
motion-studio/
├── package.json
├── apps/
│   └── web/                          # Vite app
│       ├── index.html                # home: 2D / 3D
│       ├── 2d/index.html
│       ├── 3d/index.html
│       ├── src/
│       │   ├── shell/                # shared chrome
│       │   ├── engines/
│       │   │   ├── css2d/            # 2D player
│       │   │   └── three3d/          # 3D player
│       │   └── export/
│       │       ├── client/           # WebCodecs path (3D, optional 2D draft)
│       │       └── remote/           # job client for worker
│       ├── sequences/
│       │   ├── 2d/                   # from mograph/sequences
│       │   └── 3d/                   # from threejs/animations
│       └── public/                   # models, textures, draco, fonts
├── services/
│   └── render-worker/
│       ├── src/
│       │   ├── browser.ts            # Playwright pool
│       │   ├── capture.ts            # WAAPI frame-step (from current plugin)
│       │   ├── encode.ts             # ffmpeg stream encode
│       │   └── server.ts             # HTTP job API
│       ├── Dockerfile
│       └── package.json
├── skills/                           # or .agents/skills/
│   ├── 2d-motion-graphics/
│   └── 3d-motion-graphics/
└── README.md
```



### Dependencies


| Package                     | App    | Purpose              |
| --------------------------- | ------ | -------------------- |
| `three`                     | web    | 3D runtime           |
| `mp4-muxer` or `mediabunny` | web    | Client MP4 mux       |
| `playwright` (or puppeteer) | worker | Chromium screenshots |
| system / image `ffmpeg`     | worker | Stream encode to MP4 |


Do not pull monorepo deps (Gemini, ElevenLabs, pptx, etc.) into this repo.

---



## 6. Export pipelines (implementation targets)



### 6.1 Shared player contract

- Stage has a base design size (e.g. 1920×1080 for 16:9).
- Export multiplies or sets absolute `W×H` from quality + aspect.
- Duration comes from WAAPI `getAnimations()` (2D) or timing dummy + animations (3D skill contract).
- Background (solid / preset / transparent) applied the same way in preview and export.



### 6.2 3D export (client)

```text
setSize(exportW, exportH)
for i in 0..totalFrames:
  setTime(i / fps)
  renderer.render(scene, camera)
  videoEncoder.encode(canvasFrame)
  free frame
mux → download motion-3d-{res}.mp4
```

Requirements on scenes (existing skill, keep):

- `WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })`
- Transparent clear; player owns background
- Bare `three` imports (no CDN)
- Finite duration via WAAPI dummy when pure rAF math loops



### 6.3 2D export (worker / CLI)

```text
browser.setViewport(exportW, exportH)
page.setContent(sequenceHtml)  # or load by sequence id
inject bg if requested
pause all WAAPI animations
for i in 0..totalFrames:
  set currentTime = i / fps
  force compositor sample (play/pause + rAF pattern as today)
  screenshot → pipe to ffmpeg stdin (or temp frame file)
ffmpeg → motion-2d-{res}.mp4
```

Port from `motionGraphicsExportPlugin`, then change:

1. Stream frames (no full base64 array).
2. Replace second-page MediaRecorder with **ffmpeg**.
3. Prefer sequence **id + params** over raw HTML from the client in production.
4. Job API: `POST /export` → `{ jobId }` → poll `GET /export/:id` → download.

Worker ops:

- Memory ≥ 2GB
- Concurrency 1–2 pages per instance; queue the rest
- Timeouts 5–15 minutes for 4K
- Optional API key so the worker is not an open Chromium farm



### 6.4 Optional local CLI

```bash
npx motion-export sequences/2d/kinetic-typography.html --out out.mp4 --res 4k
```

Same capture/encode as the worker. Strong fit for agent workflows without paying for cloud render.

---



## 7. Deployment


| Component                   | Host                               | Notes                        |
| --------------------------- | ---------------------------------- | ---------------------------- |
| Web UI + sequences + models | Vercel / Cloudflare Pages          | Static CDN only              |
| 3D export                   | Browser                            | Free; no server              |
| 2D studio export            | Fly.io / Railway / Cloud Run / VPS | Docker + Playwright + ffmpeg |
| Job artifacts (if needed)   | R2 / S3, short TTL                 | Large 4K files               |


**Do not** host multi-minute Chromium jobs on Vercel serverless. Vercel is for the player; the worker is for batch render.

### Worker Docker (sketch)

```dockerfile
FROM mcr.microsoft.com/playwright:v1.49.0-jammy
# install ffmpeg if not present
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV PORT=8080
CMD ["node", "src/server.js"]
```

---



## 8. Phased development plan



### Phase 0 — Scaffold and migrate (foundation)

**Outcome:** Standalone Vite app with both catalogs playable; no monorepo cruft.

1. Create `motion-studio` repo / package (Vite).
2. Routes or pages: `/`, `/2d`, `/3d`.
3. Lift sequences, manifests, public 3D assets.
4. Deduplicate shell into `src/shell/`.
5. Wire new base paths for manifests and assets.
6. Drop unrelated monorepo APIs and dependencies.
7. Copy skills into-repo; update paths only.
8. Deploy static UI to Vercel (preview/playback only is enough).

**Exit criteria**

- [ ] Both catalogs load from manifests
- [ ] Playback, aspect ratio, BG presets work for 2D and 3D
- [ ] `vite build` succeeds; static deploy serves sequences and models

---



### Phase 1 — Fixed stage + 3D offline export

**Outcome:** Prove resolution-independent export; 3D can ship 4K from the browser.

1. Introduce logical stage sizing (base res + letterbox preview).
2. Export UI: resolution, fps (even if 2D still incomplete).
3. Implement stepped 3D timeline (`t = frameIndex / fps`).
4. Client WebCodecs encoder + MP4 muxer.
5. Auto-stop using duration from WAAPI / skill timing dummy.
6. Composite background into export frames (same presets as preview).

**Exit criteria**

- [ ] Export 1080p and 4K from a small laptop display
- [ ] Frame count ≈ `duration * fps` (no realtime dependency)
- [ ] Output plays in Chrome and imports into a common NLE (or at least QuickTime/VLC)
- [ ] Memory stays flat during long exports (no full-frame buffer)

---



### Phase 2 — 2D studio export worker

**Outcome:** Frame-perfect 2D at fixed resolution, deployable separately from the UI.

1. Extract WAAPI scrub + screenshot loop from `motionGraphicsExportPlugin`.
2. Stream frames into ffmpeg (H.264 MP4).
3. Job API + progress polling (replace in-memory Vite progress map with worker job store).
4. Wire web UI “Export” for 2D to the worker (sequence id, `W`, `H`, fps, bg).
5. Docker deploy to Fly/Railway/etc.; document env and API key.
6. Smoke: short sequence @ 1080p and 4K.

**Exit criteria**

- [ ] 2D export matches localhost mograph quality (or better)
- [ ] No Vite plugin required for production export
- [ ] Worker survives concurrent queueing (1–2 active jobs)
- [ ] Static UI remains deployable without the worker (clear error if worker down)

---



### Phase 3 — Polish and agent workflow

**Outcome:** Production-usable studio + agent-friendly export.

1. Unified progress UX for client (3D) and remote (2D) jobs.
2. Optional local CLI sharing worker capture/encode code.
3. Skill docs: fixed stage, export resolutions, 2D worker vs 3D client.
4. CI: build web; build/push worker image; basic export smoke if secrets allow.
5. Optional: catalog search, last-export settings persistence.

**Exit criteria**

- [ ] README covers local dev, Vercel deploy, worker deploy, CLI
- [ ] Skills produce sequences that export cleanly under the new paths
- [ ] Documented limits (max duration, concurrency, Safari WebCodecs caveats)

---



### Phase 4 — Optional later

Only if product direction demands it:


| Idea                                                  | When                                                  |
| ----------------------------------------------------- | ----------------------------------------------------- |
| Client 2D “draft export” (screenshot lib)             | Want offline 2D without worker; accept fidelity drift |
| Auth / project library                                | Multi-user product                                    |
| Scene-graph authoring (Remotion, Motion Canvas, Rive) | Willing to migrate off free-form HTML                 |
| Single search catalog across 2D+3D                    | Catalog grows large                                   |


---



## 9. Skills updates

Keep contracts; update paths and export notes.


| Skill                | Changes                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `2d-motion-graphics` | Sequences → `sequences/2d/`; document studio export via Chromium worker/CLI; fixed stage rules        |
| `3d-motion-graphics` | Animations → `sequences/3d/`; assets under `public/`; stepped client export + `preserveDrawingBuffer` |


**Unchanged contracts**

- **2D:** CSS/WAAPI only; no infinite loops; fill-mode rules; no rAF timing for primary motion.
- **3D:** transparent clear; bare `three` imports; timing dummy for finite duration when needed.

Ship skills inside the new repo (e.g. `.agents/skills/` or `skills/`).

---



## 10. Migration checklist



### From monorepo → `apps/web`


| Source                                        | Destination                            |
| --------------------------------------------- | -------------------------------------- |
| `mograph/sequences/*`                         | `sequences/2d/`                        |
| `mograph/sequences/manifest.json`             | `sequences/2d/manifest.json`           |
| `threejs/animations/*`                        | `sequences/3d/`                        |
| `threejs/animations/manifest.json`            | `sequences/3d/manifest.json`           |
| `mograph/app.js` + `style.css` + `index.html` | Merge into `engines/css2d` + `shell`   |
| `threejs/app.js` + `style.css` + `index.html` | Merge into `engines/three3d` + `shell` |
| `public/models`, `textures`, `draco`, `fonts` | `apps/web/public/`                     |




### From monorepo → `services/render-worker`


| Source                                    | Destination                                    |
| ----------------------------------------- | ---------------------------------------------- |
| `motionGraphicsExportPlugin` capture loop | `capture.ts`                                   |
| BG preset injection for export            | shared helper with web or duplicated carefully |
| Progress map                              | job store with TTL                             |




### Path rewrites

- Sequence URLs: `/mograph/sequences/` → `/sequences/2d/`
- Animation URLs: `/threejs/animations/` → `/sequences/3d/`
- Model/texture paths remain under `/models`, `/textures`, `/draco`, `/fonts` if `public/` root is preserved

---



## 11. Implementation order (first slices)

Build in this order so each slice de-risks a hard problem:

1. **Scaffold + migrate catalogs** (Phase 0) — no export risk.
2. **Fixed logical stage in shell** — unlocks all later export work.
3. **3D stepped WebCodecs @ 1080p then 4K** (Phase 1) — proves resolution independence without a server.
4. **2D worker + ffmpeg stream encode** (Phase 2) — proves fidelity + deploy split.
5. **CLI + skills + CI** (Phase 3).

---



## 12. Success criteria (product)

- [ ] One app plays both 2D and 3D catalogs
- [ ] Preview uses a fixed stage; UI scales it; aspect ratio is intentional
- [ ] 3D export at 1080p and 4K from a non-4K display
- [ ] 2D export frame-perfect via worker/CLI at 1080p and 4K
- [ ] Exports stream-encode (stable memory)
- [ ] Static UI deploys without Chromium
- [ ] Worker is optional for browsing/preview
- [ ] Agent skills work with updated paths
- [ ] No dependency on parent monorepo APIs

---



## 13. Risks and mitigations


| Risk                                   | Mitigation                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Safari weak WebCodecs                  | Document Chrome-first; MediaRecorder or worker fallback later                                         |
| 4K GPU slow on client 3D               | Offline stepped render (OK if slower than realtime)                                                   |
| Worker cost / abuse                    | API key, concurrency limits, max duration                                                             |
| 2D HTML security if accepting raw HTML | Prefer sequence id from disk; sanitize if ever accepting arbitrary HTML                               |
| Sequence CSS that breaks headless      | Keep existing skill constraints; golden-export smoke tests on a few hard sequences (glass, SVG paths) |
| Dual shell drift during migrate        | Deduplicate shell in Phase 0 before new features                                                      |


---



## 14. Summary


| Decision          | Choice                                              |
| ----------------- | --------------------------------------------------- |
| Product           | Single Motion Studio: 2D + 3D                       |
| Bundler / UI host | **Vite** static app                                 |
| Framework         | Vanilla (or light UI later); **not** Next.js for v1 |
| Stage model       | Fixed logical resolution; preview scales            |
| 3D export         | Client, stepped, WebCodecs → MP4, up to 4K          |
| 2D export         | Chromium frame-step + ffmpeg on worker/CLI          |
| Deploy            | UI → Vercel; worker → Docker host                   |
| Catalog           | Migrate existing sequences; keep skill contracts    |


Core constraint for every feature:

> Preview and export share a logical resolution and clock. The monitor is only a viewer.

