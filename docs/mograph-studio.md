# Mograph Studio — Development Plan

Standalone **human-directed motion graphics studio**: craft sequences one at a time (with optional agent assist), manage assets, assemble sequences into compositions with sound, and export fixed-resolution video up to 4K.

Spin out **mograph** (2D) and **threejs** (3D) from `design-animation`. Use HyperFrames as **render/composition infrastructure inspiration** (and optionally libraries), not as an agent-to-final-video product flow.

---

## 1. Product positioning

| This product is | This product is not |
| --------------- | ------------------- |
| Human-led sequence craft + human-led edit | One-shot agent film factory |
| Asset-backed HTML/3D motion library | Timeline of stock clips only |
| Studio that may use HyperFrames under the hood | HyperFrames Studio re-skin or Remotion rewrite |
| Stepwise instruct → approve → compose | Script → storyboard → SFX → final autopilot |

**Mental model**

- **Sequence** = shot / graphic card (atomic motion piece)
- **Composition** = edit / final cut (sequences + audio on a timeline)
- **Asset** = reusable media from the project library
- **Agent** = assistant scoped to the active sequence (or optional non-destructive suggestions later)

---

## 2. Goals

| Goal | Detail |
| ---- | ------ |
| Human in the loop | User directs every sequence and the final composition; agent never owns the full pipeline |
| Sequence-first craft | Create, preview, revise, and approve sequences one at a time |
| Composition | Arrange approved sequences + SFX/music into a final video |
| Asset management | Project library of user uploads (images first) embeddable in sequence HTML |
| WYSIWYG export | Video matches the player (same renderer + timeline) |
| Fixed resolution | Export 720p / 1080p / 2K / **4K**, independent of monitor size |
| Two engines | 2D HTML/CSS (and seekable contracts over time) + 3D Three.js |
| Deployable | UI + long-running render host (Chrome + FFmpeg); not tied to Vercel |
| Preserve catalog | Migrate existing mograph/threejs content with path/skill updates |
| Avoid reinventing render | Prefer HyperFrames engine/producer (or equivalent) over a custom Puppeteer stack long-term |

### Non-goals

- Handing script, storyboard, SFX, and final video entirely to an agent
- Accounts, billing, multi-tenant SaaS (unless added later)
- Rewriting everything into Remotion / React for v1
- Screen / tab recording as the primary export path
- Pulling monorepo TTS, slides, Gemini, or unrelated apps into this product

---

## 3. Core objects

```text
Project
├── Assets/           # user uploads (images first; audio for composition)
├── Sequences/        # one motion graphic each (HTML 2D or Three 3D)
└── Compositions/     # timeline of sequences + audio → final video
```

| Object | Definition | User work |
| ------ | ---------- | --------- |
| **Project** | Container for brand/campaign work | Create, open, organize |
| **Asset** | File in project library | Upload, tag, reuse in sequences/compositions |
| **Sequence** | Self-contained motion graphic on a fixed stage | Instruct → preview → tweak → approve |
| **Composition** | Timeline of sequence clips + audio tracks | Arrange, trim, layer SFX/music, export film |

### Data model (sketch)

```text
Project {
  id, name, createdAt
}

Asset {
  id, projectId, filename, mime, path, width?, height?, tags[]
}

Sequence {
  id, projectId, name
  engine: "css2d" | "three3d"
  aspect, durationMs, bgPreset
  sourcePath                 // HTML file or scene folder
  assetRefs: AssetId[]
  revisions: [{ id, pathOrHtml, prompt?, createdAt }]
  status: draft | approved
}

Composition {
  id, projectId, name, width, height, fps
  tracks: [
    { type: "video", clips: [
      { sequenceId, startMs, inMs, outMs, transition? }
    ]},
    { type: "audio", clips: [
      { assetId, startMs, inMs, outMs, volume }
    ]}
  ]
}
```

**Asset embedding in sequences**

- Stable project URLs, e.g. `/projects/{projectId}/assets/{assetId}` (or equivalent static path).
- HTML references assets by **id or stable path**, not ephemeral blob URLs.
- Agent generation may only use assets from the project allowlist.
- Preview and render resolve the same URL so WYSIWYG holds.

```html
<img src="/projects/{projectId}/assets/{assetId}" data-asset-id="{assetId}" alt="" />
```

---

## 4. Human-in-the-loop flows

### 4.1 End-to-end

```text
1. Project
2. Upload assets (optional)
3. Create Sequence A   ← instruct → generate/edit → preview → approve
4. Create Sequence B   ← same
5. Create Sequence C   ← same
6. Composition         ← place A/B/C + SFX/music
7. Export              ← single sequence or full composition
```

Every step is a **user decision**. No silent multi-step agent pipeline from brief to final film.

### 4.2 Sequence loop (tight HITL)

```text
User prompt for THIS sequence only
        ↓
Agent (optional) proposes or edits HTML / scene
        ↓
Preview on fixed logical stage
        ↓
User: accept | revise prompt | edit source | bind assets
        ↓
Save revision → mark draft or approved
```

**New sequence steps**

1. **+ Sequence** → engine (2D / 3D), aspect, rough duration  
2. Instruction for this sequence only  
3. Optionally attach assets from library  
4. Agent or template produces first version under skill rules  
5. Preview, iterate, approve  
6. Approved sequences appear in the composition media bin  

### 4.3 Composition loop

```text
Pick approved sequences
        ↓
Drop on timeline (order, in/out, transitions)
        ↓
Add audio (SFX, music, VO files from assets)
        ↓
Preview full cut
        ↓
Export composition
```

### 4.4 Agent role

| Step | Owner |
| ---- | ----- |
| Project goals | Human |
| Which sequences exist | Human |
| Prompt for sequence N | Human |
| HTML / scene draft | Agent (optional) or human |
| Approve sequence | Human |
| Timeline order + SFX | Human |
| Export | System (render) |

**Agent may**

- Rewrite **one** active sequence  
- Respect asset allowlist and skill contracts  
- Later: non-destructive composition suggestions (never auto-commit)

**Agent must not**

- Auto-generate the full video  
- Own storyboard + SFX + final cut unprompted  
- Use undeclared external assets

---

## 5. Application UI

### 5.1 Shell

Three top-level modes:

1. **Sequences** — craft single graphics  
2. **Composition** — assemble the film  
3. **Assets** — library  

```text
┌─────────────────────────────────────────────────────────────────┐
│  Project: …          [Sequences] [Composition] [Assets]         │
├──────────┬──────────────────────────────────────────────────────┤
│ Sidebar  │              Main stage / workspace                  │
│ list +   │                                                      │
│ tools +  │                                                      │
│ agent    │                                                      │
├──────────┴──────────────────────────────────────────────────────┤
│  Transport / timeline (context-dependent)                       │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Sequences mode

```text
┌────────────┬────────────────────────────┬───────────────────────┐
│ Sequence   │   Fixed logical stage      │  Inspector            │
│ list       │   (letterboxed preview)    │  name, aspect, dur    │
│            │                            │  BG preset            │
│ [+ New]    │   play / scrub             │  linked assets        │
│            │                            │  export resolution    │
│            │                            │  ── Agent assist ──   │
│            │                            │  prompt → this seq    │
└────────────┴────────────────────────────┴───────────────────────┘
│  Optional: source panel (HTML) for power users                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Composition mode

```text
┌───────────────┬──────────────────────────────────────────────────┐
│ Media bin     │  Stage preview (follows playhead)                │
│ sequences +   │                                                  │
│ audio assets  │                                                  │
└───────────────┴──────────────────────────────────────────────────┘
│ V1  [==== Seq A ====][== Seq B ==][==== Seq C ====]              │
│ A1       [whoosh]        [hit]                                   │
│ A2  [=========== music bed =====================]                │
│     playhead ─────────────────────────────────────               │
└──────────────────────────────────────────────────────────────────┘
```

**v1 composition**

- Video track: ordered/trimmed sequence clips  
- Audio track(s): volume, simple fades  
- Export full composition  

**Later**

- Transitions, multi-track video, beat markers  
- Agent “suggest SFX placement” as proposals only  

### 5.4 Assets mode

- Upload images (v1); audio for composition  
- Grid/list with metadata and “used in” sequences  
- Optional folders/tags  
- **Insert asset** into active sequence (`img` / CSS `url`)  

---

## 6. Current state (source monorepo)

### 6.1 Apps

| App | Role | Content | Player |
| --- | ---- | ------- | ------ |
| `mograph/` | 2D player + export | ~42 HTML sequences + `manifest.json` | Vanilla JS/CSS, iframe stage |
| `threejs/` | 3D player + export | 13 animation folders + `manifest.json` | Near-identical shell |

Shared UI (toolbar, sidebar, BG presets, aspect ratio) is duplicated almost line-for-line.

### 6.2 Export today

| Engine | Method | Localhost | Typical static host |
| ------ | ------ | --------- | ------------------- |
| **2D** | Vite middleware + Puppeteer: WAAPI frame-step → screenshots → MediaRecorder → WebM | Yes | **No** (API never ships; long Chromium jobs unfit for classic serverless) |
| **3D** | Client composite canvas + `captureStream` + MediaRecorder | Yes | Yes, but resolution is viewport-coupled |

### 6.3 Problems to fix

**2D**

1. Export only exists in Vite `configureServer` / `configurePreviewServer`.  
2. Long Chromium + encode jobs need a real host (Docker/VPS/Fly/etc.), not a static-only deploy.  
3. Buffering **all frames as base64** OOMs at 4K (≈33MB RGBA/frame).  

**3D**

1. Records live preview canvas size, not a logical export size.  
2. Realtime MediaRecorder can drop frames.  
3. No fixed 1080p/4K offline path.  

### 6.4 Carry over / leave behind

**Carry over**

- `mograph/` (player, sequences, manifest)  
- `threejs/` (player, animations, manifest)  
- `public/models`, `textures`, `draco`, `fonts`  
- WAAPI frame-step ideas from `motionGraphicsExportPlugin`  
- Skills: `2d-motion-graphics`, `3d-motion-graphics` (evolve toward studio contracts)  

**Leave behind**

- Other monorepo apps (counter, languages, TTS, slides, citation, etc.)  
- Gemini / ElevenLabs plugins as core deps  
- `api/generate-slides.js` and unrelated APIs  

---

## 7. Architecture decisions

### 7.1 Product architecture

```text
┌──────────────────────────────────────────────────────────────┐
│  Mograph Studio (product)                                    │
│  • Projects / assets / sequences / compositions              │
│  • HITL agent scoped to active sequence                      │
│  • Timeline composition editor                               │
│  • Storage + manifests                                       │
└───────────────┬──────────────────────────┬───────────────────┘
                │                          │
                ▼                          ▼
┌───────────────────────────┐  ┌───────────────────────────────┐
│  Sequence runtime         │  │  Composition runtime          │
│  Fixed stage player       │  │  Timeline + playhead preview  │
│  2D HTML / 3D Three       │  │  Sequence clips + audio graph │
└─────────────┬─────────────┘  └───────────────┬───────────────┘
              │                                │
              └────────────┬───────────────────┘
                           ▼
              ┌────────────────────────────┐
              │  Render layer              │
              │  Prefer HyperFrames        │
              │  engine/producer (or CLI)  │
              │  Chrome seek + FFmpeg      │
              │  Optional client WebCodecs │
              │  for pure Three clips      │
              └────────────────────────────┘
```

| Layer | Build in-house | Borrow |
| ----- | -------------- | ------ |
| Project UX, HITL, assets, composition timeline | **Yes** | — |
| Sequence player chrome | **Yes** (evolve mograph/threejs shell) | HF player concepts later if useful |
| Frame-accurate HTML capture + encode | Prefer **HyperFrames engine/producer** | Do not long-term reinvent Puppeteer+MediaRecorder |
| Seekable timeline contract | Adopt HF-like rules over time | `@hyperframes/*` packages as evaluated |
| Agent “full video factory” skills | **Do not adopt as product flow** | Craft references only |

### 7.2 Framework: Vite (not Next.js / not React-required)

| Need | Choice |
| ---- | ------ |
| Bundler / UI host | **Vite** |
| UI framework | Vanilla first; React/Svelte only if shell complexity demands it |
| Sequences | Static HTML / Three scenes, not a forced React rewrite |
| Remotion | Not required for v1 |

React is **not** used in mograph/threejs today and is **not** required to scale this product. Scale is about render compute, assets, and composition—not React.

### 7.3 Export model: offline render, not screen record

| Problem | Wrong model | Correct model |
| ------- | ----------- | ------------- |
| Composition | Whatever is on the monitor | Logical stage at fixed `W×H` |
| Rasterization | Film the preview panel | Render target of size `W×H` |
| Encoding | Buffer all frames | Stream-encode one frame at a time |

**WYSIWYG** = preview and export share renderer + clock; only `W×H` and encode settings change.

```text
Logical stage:  export bitmap (e.g. 3840×2160)
Preview:        scale(fit) into UI
```

- **3D:** `renderer.setSize(exportW, exportH)` or render target; stepped `t = frame / fps`; prefer WebCodecs → MP4.  
- **2D:** stage at export size; Chromium screenshots + seekable timeline; ffmpeg → MP4.  

Never hold all frames in memory at 4K.

### 7.4 HyperFrames: what to use vs ignore

HyperFrames (HeyGen, open source) = HTML compositions → deterministic Chrome capture → FFmpeg. Strong fit for **render**, weak fit as **product flow** (agent-first full video pipelines).

| Use / inspire | Do not adopt as product default |
| ------------- | -------------------------------- |
| Frame seek + capture + ffmpeg pipeline | Script → storyboard → SFX → final autopilot |
| Fixed `width` / `height` / duration contracts | Replacing human sequence approval |
| Lint/inspect ideas for compositions | Mandatory GSAP for every legacy sequence on day one |
| CLI/Docker/cloud render adapters | Handing creative ownership to the agent |
| Three seek adapter patterns (`hf-seek` style) | Dropping custom sequence/composition UX |

**Existing mograph HTML is not drop-in.** Migration means adopting composition contracts (or dual pipeline: legacy WAAPI scrub + new HF-compatible sequences).

**Remotion** remains optional only if the team later wants React frame-as-code at scale. It is less aligned than HyperFrames for HTML/agent-assisted sequences.

### 7.5 Encoding

| Encoder | Where | Role |
| ------- | ----- | ---- |
| WebCodecs + mp4-muxer / mediabunny | Browser | Primary for 3D (optional draft elsewhere) |
| ffmpeg (via HF producer or worker) | Render host | Primary for 2D and composition export |
| MediaRecorder | Fallback only | Avoid as default |

Prefer **MP4 (H.264)** for NLE compatibility.

### 7.6 Deploy (platform-flexible)

Not strict on Vercel. Any host that can run **Chrome + FFmpeg** for multi-minute jobs is fine.

| Component | Host type | Notes |
| --------- | --------- | ----- |
| Studio UI + API + asset storage | App platform or VPS | Projects, uploads, sequence files |
| Preview | Same as UI | Fixed-stage player |
| Render | Same box or sibling worker | `hyperframes render` / producer / custom worker wrapping it |
| Scale later | HF Lambda / Cloud Run adapters or more workers | Queue concurrent jobs |

Light traffic: **UI + render on one Docker host**. Split when load or isolation requires it.

**Rejected**

- Primary export via screen/tab recording  
- Puppeteer inside Vite plugins as production architecture  
- All-frames-in-RAM encode  
- Assuming classic serverless alone can do studio export  

---

## 8. Target repository layout

```text
motion-studio/   # or mograph-studio/
├── package.json
├── apps/
│   └── web/                          # Vite app (product UI)
│       ├── index.html
│       ├── src/
│       │   ├── shell/                # chrome, routing, project switcher
│       │   ├── sequences/            # sequence list + player + agent panel
│       │   ├── composition/          # timeline editor
│       │   ├── assets/               # library UI + upload
│       │   ├── engines/
│       │   │   ├── css2d/
│       │   │   └── three3d/
│       │   └── export/               # client + remote job client
│       ├── sequences/                # seed/migrated catalog (optional)
│       │   ├── 2d/
│       │   └── 3d/
│       └── public/                   # models, textures, draco, fonts
├── services/
│   ├── api/                          # projects, assets, sequence storage (if not embedded)
│   └── render-worker/                # Chrome + FFmpeg / HyperFrames producer
│       ├── Dockerfile
│       └── ...
├── skills/
│   ├── 2d-motion-graphics/           # sequence craft, HITL, assets allowlist
│   └── 3d-motion-graphics/
└── docs/
    └── mograph-studio.md
```

### Dependencies (direction)

| Package / tool | Purpose |
| -------------- | ------- |
| `three` | 3D engine |
| `mp4-muxer` or `mediabunny` | Client MP4 for 3D |
| HyperFrames engine/producer/CLI (evaluate pin) | HTML frame capture + ffmpeg |
| Playwright/Puppeteer only if interim before HF | Legacy bridge |
| Object storage or local disk | Project assets |

Do not pull monorepo Gemini/ElevenLabs/pptx into the core studio unless a later feature needs them.

---

## 9. Export pipelines

### 9.1 Shared player contract

- Stage has design resolution (e.g. 1920×1080 for 16:9).  
- Export sets absolute `W×H` from quality + aspect.  
- Duration from WAAPI / seekable timeline / 3D timing dummy.  
- Background applied the same in preview and export.  

### 9.2 Sequence export (2D)

Prefer HyperFrames-style seek + screenshot + ffmpeg stream. Interim: port current WAAPI scrub, but **stream frames** (no full base64 array).

### 9.3 Sequence export (3D)

```text
setSize(exportW, exportH)
for i in 0..totalFrames:
  setTime(i / fps)
  render()
  videoEncoder.encode(frame)
mux → MP4
```

Skill contract: `preserveDrawingBuffer`, transparent clear, bare `three` imports, finite duration.

### 9.4 Composition export

1. Resolve timeline to a single render graph (stitched sequence renders + audio mix), **or**  
2. One HTML/composition document that references sequence subclips (longer-term, HF-like).  

v1 may **pre-render approved sequences** then concatenate/mux with ffmpeg (simpler). Later: single-pass composition render.

### 9.5 Job API (render host)

```text
POST /export  → { jobId }
GET  /export/:id → progress | download
```

Inputs: project id, sequence or composition id, `W`, `H`, fps, bg. Prefer ids over raw HTML in production.

---

## 10. Skills updates

| Skill | Changes |
| ----- | ------- |
| `2d-motion-graphics` | Paths under project sequences; **HITL** (one sequence); asset allowlist; fixed stage; export notes; no full-film agent pipeline |
| `3d-motion-graphics` | Same project paths; assets under project/public; stepped export; `preserveDrawingBuffer` |

**Unchanged craft rules (initial)**

- **2D:** Prefer CSS/WAAPI (or documented seekable runtime); no infinite loops; fill-mode discipline.  
- **3D:** Transparent clear; bare imports; timing dummy when needed.  

Evolve toward HyperFrames seek contracts as new sequences are authored that way.

Ship skills inside the studio repo.

---

## 11. Migration from monorepo

| Source | Destination |
| ------ | ----------- |
| `mograph/sequences/*` | Project seed or `sequences/2d/` |
| `threejs/animations/*` | `sequences/3d/` |
| Players `app.js` / `style.css` | `engines/*` + `shell` |
| `public/models`, `textures`, `draco`, `fonts` | `apps/web/public/` |
| `motionGraphicsExportPlugin` capture loop | Interim worker or replaced by HF producer |

Path rewrites: `/mograph/sequences/` → project/sequence URLs; `/threejs/animations/` → same pattern.

---

## 12. Phased development

### Phase 0 — Scaffold and migrate

**Outcome:** Standalone app plays 2D + 3D catalogs on a fixed stage.

1. Vite app shell; project concept (even single default project).  
2. Lift sequences, manifests, 3D public assets.  
3. Deduplicate player chrome.  
4. Deploy UI on chosen platform (render optional).  

**Exit**

- [ ] Both catalogs load and play  
- [ ] Fixed stage + aspect + BG presets  
- [ ] No monorepo-only API deps  

### Phase 1 — Assets + HITL sequence craft

**Outcome:** Project asset library; sequence instruct/revise/approve loop.

1. Asset upload + storage + stable URLs.  
2. Insert/bind assets into active sequence.  
3. Agent panel scoped to one sequence + allowlist.  
4. Revisions + draft/approved status.  
5. Skills path + HITL wording updates.  

**Exit**

- [ ] Upload image → embed in sequence → preview shows it  
- [ ] Agent cannot reference non-allowlisted files  
- [ ] Approved sequences listed for composition (even if composition is stub)  

### Phase 2 — Fixed-stage export (sequence)

**Outcome:** 1080p/4K sequence export independent of monitor.

1. Logical stage export sizing.  
2. 3D stepped WebCodecs path.  
3. 2D render host (HF producer preferred; interim stream capture OK).  
4. Progress UI + download.  

**Exit**

- [ ] 3D 1080p and 4K from a non-4K display  
- [ ] 2D export matches preview fidelity  
- [ ] Memory stable (no full-frame buffer)  

### Phase 3 — Composition + audio

**Outcome:** Timeline of sequences + SFX/music → export film.

1. Composition editor (video + audio tracks).  
2. Trim, order, volume, simple fades.  
3. Composition export (stitch/mux v1).  
4. Audio assets in library.  

**Exit**

- [ ] Multi-sequence cut with SFX exports  
- [ ] Only approved (or explicitly allowed draft) sequences on timeline  

### Phase 4 — Render maturity + polish

**Outcome:** Production-grade render path and ops.

1. Prefer HyperFrames engine/producer fully; drop interim Puppeteer hacks.  
2. Dual format policy: legacy sequences vs HF-compatible new ones (or migrate).  
3. Queue, API key, max duration, concurrency.  
4. Optional CLI for local/agent render of a single sequence.  
5. CI smoke exports.  

**Exit**

- [ ] Documented deploy (UI + render)  
- [ ] Chrome-first export notes; Safari caveats if any  
- [ ] README + skills match product flow  

### Phase 5 — Optional later

| Idea | When |
| ---- | ---- |
| Agent timeline suggestions (proposals only) | After composition v1 is solid |
| Transitions, multi video tracks | Editorial demand |
| Parametric sequence variables (HF-style) | Template reuse |
| Auth / multi-user projects | Productization |
| Remotion | Only if React frame-as-code becomes a team requirement |

---

## 13. Implementation order (first slices)

1. Scaffold + migrate catalogs (Phase 0).  
2. Fixed logical stage in shell.  
3. Assets library + embed (Phase 1).  
4. HITL sequence agent panel (Phase 1).  
5. 3D stepped export (Phase 2).  
6. 2D render worker / HF producer (Phase 2).  
7. Composition timeline + audio (Phase 3).  
8. Harden render ops (Phase 4).  

---

## 14. Success criteria

- [ ] Human creates and approves sequences one at a time  
- [ ] Agent never auto-produces the full film without human steps  
- [ ] Project assets embed in sequences and resolve in preview + export  
- [ ] Composition assembles sequences + sound into one export  
- [ ] Preview uses fixed stage; export 1080p/4K independent of monitor  
- [ ] 2D and 3D engines live in one studio shell  
- [ ] Render runs on a host with Chrome + FFmpeg (not “static only”)  
- [ ] Long-term capture/encode does not depend on inventing a full private HyperFrames clone  
- [ ] Existing catalog playable after migration  
- [ ] Skills document HITL + assets + paths  

---

## 15. Risks and mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Rebuilding HF from scratch | Evaluate engine/producer early; interim capture only |
| Legacy CSS sequences vs seek contracts | Dual pipeline or gradual migration |
| Safari WebCodecs | Chrome-first for client 3D; server render for delivery |
| 4K cost/time | Stream encode; queue; draft vs high quality |
| Agent ignores asset allowlist | Server-side validation + skill + prompt injection of allowlist |
| Composition export complexity | v1 stitch pre-rendered sequences + ffmpeg audio mux |
| Scope creep into full NLE | Sequence-first; composition stays “arrange + sound” until demand |

---

## 16. Summary

| Decision | Choice |
| -------- | ------ |
| Product | Human-directed Mograph Studio: sequences → composition → export |
| Agent | Per-sequence assist only; no autopilot film pipeline |
| Assets | Project library; stable URLs; allowlisted embeds |
| Engines | 2D HTML + 3D Three under one shell |
| Stage | Fixed logical resolution; monitor is viewer only |
| Bundler | Vite; React not required |
| Render | Chrome + FFmpeg on a real host; prefer HyperFrames libraries |
| HyperFrames product flow | Do not adopt; infrastructure only |
| Remotion | Not required for v1 |
| Deploy | Platform-flexible; UI and render may colocate or split |
| Monorepo | Spin out mograph + threejs + assets; leave the rest |

**Core constraint**

> Humans own every creative gate. Sequences are the unit of craft. Compositions are the unit of delivery. Preview and export share a logical resolution and clock. Render infrastructure may be HyperFrames-class; the product experience is not an agent film factory.
