# Contributing to Chaos CathodeRay

Thank you for helping make **Chaos CathodeRay** the flagship open-source, portable projection-mapping and live visual performance studio!

---

## Core Architectural Principles

1. **100% Full-Featured Free-Software Core (`AGPL-3.0-or-later`)**:
   - Core mapping, warping, masking, shader, live mixing, modulation, multi-projector edge-blending, and DMX pixel-mapping capabilities are never crippled or watermarked.
2. **Zero Runtime Dependencies & `file://` Portability**:
   - [`Chaos-CathodeRay.html`](./Chaos-CathodeRay.html) **must** work offline when double-clicked directly from disk (`file:///...`) without any local HTTP server, bundler daemon, or CDN fetch.
   - Never add external `<script src="https://...">`, `@import url(...)`, or npm runtime packages.

---

## Modular Source Layout (`src/`)

All edits happen in [`src/`](./src/) and compile into [`Chaos-CathodeRay.html`](./Chaos-CathodeRay.html) via [`scripts/build.js`](./scripts/build.js) in strict lexical order:

| File | Responsibility |
| :--- | :--- |
| `src/styles.css` | Dark-stage console variables, responsive panes, native `<dialog>`, `[popover]`, `<details>`, and range slider styles |
| `src/body.html` | Accessible HTML5 studio markup, workspace viewports, inspectors, timeline drawer, shader drawer, and modals |
| `src/01-shaders.js` | Core WebGL2 `#version 300 es` shaders (warping, 128-pt SDF masks, followspot, cue crossfade + multi-projector edge blend) |
| `src/01b-isf-fx-shaders.js` | Built-in procedural generators, GPU Post-FX shaders, and the ISF v2 → WebGL2 transpiler |
| `src/02-math-mesh.js` | 3×3 projective homography, Catmull-Rom / Bezier curved meshes, ear-clipping polygon triangulator, and hit-testing |
| `src/03-state-media.js` | Central `state` store, surface/mask factories, video/image/camera pipeline, and demo/blank scenes |
| `src/03b-mixbus-plugins.js` | `src_mixbus` polar mixing bus, GPU Post-FX rack instances, and `.chaosplugin.json` registry |
| `src/03c-capture-text-idb.js` | Window / screen capture (`getDisplayMedia`), video loop crossfade/waveform, Canvas Typography Studio, and `IndexedDB` handles |
| `src/04-webgl-engine.js` | Multi-pass WebGL2 HDR/SDR compositor, ping-pong FBOs, GPU 14-frame delay ring buffer, and DMX stage downsample |
| `src/05-show-sync-io.js` | 50-step Undo/Redo, Cue crossfades, multi-window Projector sync (`BroadcastChannel` + `postMessage`), and Show JSON I/O |
| `src/05b-svg-templates-scanner.js` | SVG importer, Stage UV `.png`/`.svg` template exporter, Quad `N×M` Grid Cloner, and Gray-Code Space Scanner |
| `src/05c-modulators-audio-midi-osc.js` | Unified parameter target resolver, WebAudio FFT + Synth Beat Engine, LFO/Env/Seq matrix, `WebMIDI`, Gamepad, and Binary OSC |
| `src/05d-mix-constellation-timeline.js` | `◎ Mix` Spatial Radar UI/physics, 2D Cue Constellation morphing, Keyframe Show Timeline, and 60fps `MediaRecorder` |
| `src/05e-multiproj-dmx-api.js` | Multi-Projector Edge-Blend math/launcher, LED Pixel Mapper (`WebSerial` ENTTEC/OpenDMX + Art-Net), and `window.ChaosCathodeRayAPI` |
| `src/06-overlays-interaction.js` | 2D Input UV & Output Stage interactive overlays, handles, snapping, precision loupe, and pointer gestures |
| `src/07-ui-lists-inspectors.js` | DOM list renderers and Inspector synchronization |
| `src/08-events-boot.js` | Event bindings, keyboard shortcuts, `requestAnimationFrame` main loop, and `bootWebMapper()` |

---

## Development & Verification Workflow

Requires **Node.js 18+** (used solely as a zero-dependency build & test runner):

```bash
# 1. Edit modular files under src/
# 2. Syntax-check every module (node --check) and bundle Chaos-CathodeRay.html:
npm run build

# 3. Run the automated verification suite (DOM, CSS, Math, Shaders, OSC/Art-Net, Edge-Blend, DMX & API):
npm test
```

### Pull Request Checklist
- [ ] `npm run build` succeeds and updates `Chaos-CathodeRay.html` cleanly.
- [ ] `npm test` exits with code `0` (add unit assertions in `scripts/test.js` for new math, protocol, or state features).
- [ ] UI controls use semantic HTML (`<dialog closedby="any">`, `[popover]`, `<details>` with `<summary>` as first child, labeled `<input type="range">`, and `aria-pressed` / `aria-expanded` on toggles).
- [ ] Unrelated comments and docstrings are preserved.

Chaos CathodeRay is licensed under the **[GNU Affero General Public License v3.0 or later](./LICENSE)**, with the additional terms and permissions in **[NOTICE.md](./NOTICE.md)**.

Before your first pull request is merged, please sign the **[Contributor Licence Agreement](./CLA.md)**. To sign, add this line to your pull request description:

`I have read the Chaos CathodeRay CLA and I hereby sign it.`

You keep the copyright in your contribution. The CLA lets the project stay free software while also offering commercial licences. Please also read the **[trademark policy](./TRADEMARK.md)** before publishing a fork.
