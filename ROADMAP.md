# Chaos CathodeRay — Open-Source Projection Mapping & Visual Performance Studio

Forked from **Still, Rising** (`Shader-test_Still-Rising.html`) to build the ultimate browser-based, zero-server portable, open-source projection mapping, multi-surface warping, shader synthesis, and show-control studio.

---

## Source & Build
- [`src/`](./src/) + [`scripts/build.js`](./scripts/build.js) → [`Chaos-CathodeRay.html`](./Chaos-CathodeRay.html) — Modular zero-dependency source files compiled into a 100% self-contained, venue-offline HTML studio (`file://` compatible).

---

## Product Strategy & Open-Source Ecosystem Vision
- **License**: **AGPL-3.0-or-later** for the 100% full-featured free-software core, with additional terms in `NOTICE.md`. These cover attribution and trademarks, and they keep shows and plugins the author's. A CLA (`CLA.md`) lets the project also offer commercial licences and paid extensions, and the official *Chaos CathodeRay* name is protected by `TRADEMARK.md`.
- **Hold Nothing Back (100% Full-Featured FOSS Core)**: Every professional projection-mapping, curved-mesh, Bezier-masking, ISF/GLSL shader, live spatial mixing, optical camera calibration, audio/MIDI/OSC modulation, multi-projector edge-blending, and DMX pixel-mapping capability ships free, unwatermarked, and open-source.
- **Open Plugin & Hardware Bridge Ecosystem**: Clean declarative `.wmplugin.json` and ISF v2 (`.fs`) hooks, direct browser `WebMIDI` + `WebSerial` USB-DMX, and a zero-dependency `scripts/bridge.js` local UDP relay for Art-Net, sACN, and native UDP OSC.
- **Optional Future AI Layer**: Only cloud/API AI enhancements (Prompt-to-ISF Shader, Geometry-Aware Stage UV Content Generation, Vision Auto-Masking) remain reserved for an optional paid extension layer via `window.ChaosCathodeRayAPI`—never compromising offline venue reliability.

---

## Completed Foundation (v1.0 — Phases 1–4)

### Phase 1 — Multi-Surface 2D Engine & Scene Graph *(Completed)*
- Surface scene graph with Quad (4-corner projective homography), Triangle (barycentric), and Circle/Ellipse (radial iris) surfaces, layer Z-ordering, solo, visibility, lock, calibration grids, blend modes, feathering, and color grading.

### Phase 2 — Media Bin, Video Playback & UV Input Slicing *(Completed)*
- Local Video (`MP4`/`WebM`/`MOV` via `requestVideoFrameCallback`), Still Images, Live Camera (`getUserMedia`), and Procedural GLSL Generators (*Voronoi Shards, Cosmic Cloud, Laser Truss, Calibration Card*), paired with a Split Input UV / Output Stage workspace.

### Phase 3 — Masks, Curved Mesh Warping & Followspot Layer *(Completed)*
- Euclidean signed-distance (`sdPolygon`) N-point additive/subtractive masks, subdivided Catmull-Rom Spline & Bicubic Bezier mesh warping with soft proportional brush falloff, and inertial trackpad Cosmic Cloud Followspot (`veil`, `additive`, `screen`, `reveal`, `occlude`).

### Phase 4 — Dual-Screen Show Control, Cues & Project Files *(Completed)*
- 2nd-Screen Projector output (`?role=projector`, `getScreenDetails`, zero-copy `File` Structured Cloning, `45ms` phase-locked video sync, Laptop GPU Eco Mode), Dual-FBO S-curve Cue crossfades, and `.webmapper.json` project save/load + batch media relinking.

---

## Chaos CathodeRay v2.0 Master Roadmap — "Better, Not Just More"

### Milestone 1 — Core Engine, Optical Fidelity & Tactile Ergonomics *(Completed)*
1. **Canonical Stage Resolution & Zero-Allocation Viewport Zoom**:
   - Decoupled Stage & Generator FBOs (`1920×1080`, `1920×1200` WUXGA, `2560×1440`, `3840×2160` 4K, `3840×1080` Dual-Wide, `1080×1920` Portrait, `1440×1080` 4:3, or Custom `W×H`) for sub-pixel sharpness and zero GPU reallocation across `0.2×–16×` zoom.
2. **Cinema-Grade Texture Filtering, HDR Linear Light & 4-Edge Optical Blending**:
   - `16×` anisotropic filtering (`EXT_texture_filter_anisotropic`) + trilinear mipmaps on oblique walls, optional `RGBA16F` half-float linear compositing, independent **4-Edge Feathering (`L, R, T, B`)**, **Optical Blend Gamma (`1.0–2.8`)**, and **Black-Level Uplift**.
3. **Perspective-Correct Curved Meshes (`2×2`–`16×16`) & Indexed VBOs**:
   - Homography-composed curved spline/Bezier displacement + projective `q`-weighted UV interpolation (`vMeshUvQ`) eliminating foreshortened texture swimming, backed by indexed `gl.ELEMENT_ARRAY_BUFFER` geometry and `Corner-Pin` mesh transport.
4. **Projector Setup Alignment vs. Show Lock (`Shift+P`) & Master Output Keystone**:
   - Live physical-wall **Calibration Grids** and **Hardware Vertex Alignment Crosshairs** during setup, instant **Show Lock (`Shift+P`)** for guaranteed clean live output, downstream **Master Output 4-Corner Keystone + Lens Barrel/Pincushion Trim**, and single-channel dirty-revision Projector sync.
5. **50-Step Coalesced Undo/Redo, Sub-Pixel Nudging, Precision Loupe & Surface Groups**:
   - `Cmd+Z` / `Cmd+Shift+Z` gesture-coalesced history, persistent vertex selection with `0.2px` / `1px` / `10px` Arrow-key nudging, `Alt`-drag `10×` fine precision gear, `6×` **Magnifier Loupe**, magnetic **Shared-Vertex Welding**, multi-surface marquee + transform box, collapsible **Surface Groups**, and Keyboard Shortcut Cheat-Sheet (`?`).

### Milestone 2 — Complete Geometry: N-Gons, Architectural Lines, Bezier Masks, SVG & Space Scanner *(Completed)*
1. **Freeform N-Gon Polygons, Architectural Line / Chase Surfaces & Grid Cloner**:
   - Arbitrary concave/convex N-Gon surfaces (ear-clipped triangulation + Euclidean perimeter feathering + per-vertex Input UV mapping), multi-segment vector **Architectural Lines** & **Surface Perimeter Chase FX** (neon glow, dashes, chasing beams, boomerangs), Circle **Arc/Ring Sectors** (`startAngle`..`endAngle`), and perspective-true `N×M` **Quad Splitter / Grid Cloner**.
2. **Smooth Bezier Curved Masks (128-pt GPU SDF), Mask Choke & SVG / UV Template I/O**:
   - Double-click per-vertex smooth Bezier/Catmull-Rom curves on masks, inward/outward Euclidean **Mask Choke**, `.svg` architectural elevation import (`<path>`, `<polygon>`, `<polyline>`, `<rect>`, `<circle>`), and pixel-exact **Stage UV Wireframe Template Export** (`.png` & `.svg`).
3. **Optical Structured-Light "Space Scanner" (Zero-AI Camera Calibration)**:
   - Pure-browser Gray-code structured-light camera-to-projector correspondence scanner generating a Projector-POV background reference photo underneath the Stage Editor for effortless 1:1 tracing.

### Milestone 3 — Live ISF v2 / GLSL Shader Studio, Virtual Mix Bus, FX Rack & Plugin Spec *(Completed)*
1. **Native ISF v2 (`.fs`) Parser & Dockable Live GLSL Editor**:
   - Auto-generated Inspector controls from ISF JSON headers (`float`, `point2D`, `color`, `bool`, `long`, `event`, `image`), live WebGL2 `#version 300 es` hot-swap compiler with exact line-number diagnostics (never blanking the live output on syntax error), multi-pass `PASSES` & persistent ping-pong buffers, 4 starter ISF templates, and 5 new built-in procedural generators (*Architectural Grid Scan*, *Water Caustics*, *Simplex Liquid Metal*, *Geometric Strobe*, *Multi-Stop Gradient*).
2. **Virtual "Mix Circle" Bus Source (`src_mixbus`)**:
   - Multi-source polar mixing deck FBO (`src_mixbus`) with draggable radial Source Orbs (center = `100%`, rim = `0%`, double-click Solo rim-parking, `Shift+Drag` collective orbit, `Alt` `10×` fine gear, auto-orbit inertia) allowing VJs to blend N video clips, live cameras, and generative shaders radially onto any mapped 3D surface without duplicating calibration meshes.
3. **12 Blend Modes, Luma/Chroma Keying & Stackable GPU Post-FX Rack**:
   - 12 blend modes (hardware + programmable `gl.blitFramebuffer` backdrop compositing), Luma Key + YCbCr Chroma Key with spill suppression, expanded Color Science (Gamma, Rodrigues Hue Shift, Tint, RGB/BGR/Solo/Luma Channel Modes, Invert), stackable per-surface + Master Output GPU Post-FX Rack (*Bloom, Sobel Edge-Trace, Kaleidoscope, LED Pixelate, Chromatic Aberration, Glitch Slice, Temporal Feedback Trails, Strobe* + custom ISF `inputImage` filter FX), and open `.wmplugin.json` plugin import/export.

### Milestone 4 — Pro Media Pipeline, Window / Screen Capture (`getDisplayMedia`), Typography & Persistence *(Completed)*
1. **Zero-Install Window / Screen Capture (`getDisplayMedia`)**:
   - 60fps desktop window / creative-coding app capture (visual apps, 3D tools, browser tabs) directly into the Media Bin, with graceful slate fallback, `↻ Re-Capture`, and same-origin 2nd-Screen Projector `MediaStream` sharing.
2. **Pro Video Trim Handles, Frame-Step, Seamless Loop Crossfade, BPM Sync & Audio Waveforms**:
   - Non-destructive In/Out loop trim (`trimIn`..`trimOut`), frame-step (`◀|` / `|▶`), zero-lag GPU FBO seamless loop crossfade (`⇄ XFade`), BPM playback rate sync + Tap Tempo, and live WebAudio peak waveform rendering behind the scrubber.
3. **Dynamic Canvas Typography / Clock / Countdown Generator & `IndexedDB` Persistence**:
   - Crisp 1920×1080 Canvas-to-WebGL2 RGBA Typography Studio (`{TIME}`, `{TIME24}`, `{DATE}`, `{COUNTDOWN}`, `{FPS}`, 6 motion modes, stroke/neon glow, transparent or tinted backdrop), 1-click `IndexedDB` `FileSystemFileHandle` show media reconnect (`⚡ Reconnect`), and self-contained `.wmshow.json` archive export/import (`📦 Pack`).

### Milestone 5 — Live Spatial Mixing Radar, Universal Modulation, Audio FFT, MIDI/OSC & Timeline *(Completed)*
1. **`◎ Mix` Spatial Mixing Radar Viewport & 2D Cue Constellation Pad**:
   - Dedicated `◎ Mix` performance viewport (`4` / `V`) decoupling live radial presence (center = `100%`, rim = `0%`, magnetic Standby Orbit `r = 1.12`, damped flick-throw velocity inertia, `Shift+Drag` collective orbit, double-click Solo, 1-click `Route → Surf` / `Route → All`) from locked physical Stage geometry, plus a Shepard inverse-distance **2D Cue Constellation Pad** (`⟳ Circle` / `⊞ Grid`) for continuous multi-cue vector morphing.
2. **WebAudio Multi-Band FFT + Beat Engine & Universal Modulation Matrix**:
   - Built-in Kick/Hat/Pad **Synth Beat Engine** + Live Mic / Video / Screen Capture `AnalyserNode` (`Sub`, `Low`, `Mid`, `High`, `RMS`, `Beat` onset gate + Auto/Tap BPM + 32-bar spectrum canvas) driving **LFOs** (`Sine`, `Tri`, `Saw`, `Square`, `Perlin`, `Beat`), **Audio Band Envelopes**, and **8-Step Beat Sequencers** on any parameter via right-click `#mod-quick-popover` or the `Mod/IO` Inspector tab.
3. **1-Click WebMIDI Learn (`Cmd/Ctrl+M`), Wireless Gamepad Control & Bi-Directional OSC**:
   - 1-click WebMIDI CC / Note / Pitch-Bend Learn + motorized fader CC feedback, PS5/Xbox wireless Gamepad steering (Followspot, Constellation Puck & sub-pixel Setup corner nudging), and Binary OSC 1.0 (`#bundle` + float/int/string) + JSON-OSC over WebSocket (`ws://127.0.0.1:8080`) paired with zero-dependency local relay `scripts/osc-artnet-bridge.js`.
4. **Selective Cue Attribute Filters, Auto-Follow Timers, Keyframe Show Timeline (`T`) & 60fps `MediaRecorder` Stage Capture (`● Rec`)**.

### Milestone 6 — Multi-Projector Edge Blending, LED Pixel Mapping & Open-Source Launch *(Completed)*
1. **Multi-Projector Screen Routing, Optical Edge-Blend Wizard & GPU Frame Delay (`0–200ms`)**:
   - Route cropped Stage slices across up to 4 independent Projector Windows (`?role=projector&screen=1..4` via `getScreenDetails()`, grid presets `1×1`, `2×1`, `3×1`, `1×2`, `2×2`, `custom`) with exact raised-cosine gamma unity blending (`I₁ᵞ + I₂ᵞ = 1.000`), black-floor compensation, per-screen Luminance/Kelvin/4-Corner Keystone, Stage overlap guides, seam alignment hairlines, and a 14-slot GPU frame-delay ring buffer (`0–200ms`).
2. **Real-Time LED Pixel Mapper & Direct Browser USB-DMX (`WebSerial` + Art-Net Bridge)**:
   - Interactive Stage **LED Strips, Serpentine Matrices, & Rings** sampling live GPU Stage pixels (`RGB`, `GRB` WS2812, `BGR` APA102, `RGBW`, `Luma`, `RGB16`) with perceptual LED gamma, automatic multi-universe rollover without splitting pixels, live collision detection, 44Hz `WebSerial` output (**ENTTEC DMX USB Pro** + **OpenDMX FTDI 250k 8N2**), and binary **Art-Net `OpDmx (0x5000)`** over `scripts/osc-artnet-bridge.js`.
3. **Public Extension API (`window.ChaosCathodeRayAPI`), Automated Test Suite (`scripts/test.js`) & OSS Release Docs**:
   - Frozen `window.ChaosCathodeRayAPI` (`v2.0.0`) exposing generator, effect, custom modulator, parameter, cue, Stage SVG template, DMX snapshot, and Phase 7 AI Assistant Provider hooks, backed by a zero-dependency automated verification suite (`scripts/test.js`) and complete open-source documentation (`LICENSE`, `README.md`, `CONTRIBUTING.md`, `PLUGIN_SPEC.md`).

### Milestone 7A — 3D Engine Core, `.obj` Mesh Surfaces & 6-Point `solvePnP` Calibration *(Completed)*
1. **Hybrid 2D + 3D Stage Scene Graph (`mesh3d` Surfaces)**:
   - First-class 3D Surfaces (`surface.type === 'mesh3d'`) composited with hardware 24-bit depth buffering (`gl.DEPTH_COMPONENT24`) into the canonical Stage FBO alongside 2D Quads, Curved Meshes, Triangles, Circles, Polygons, Lines, and Bezier Masks—inheriting all 12 Blend Modes, Luma/Chroma Keying, Color Grading, Per-Surface GPU FX, Cues, Modulators, and Dual-Screen Projector Sync.
2. **Built-In 3D Stage Primitives & Zero-Dependency `.obj` Importer**:
   - 7 parametric 3D scenic primitives (*Box / Cube*, *Stage Steps / Riser*, *Cylinder / Column*, *Icosphere / Dome*, *Pyramid / Obelisk*, *Torus*, *3D Curved Stage Cyclorama*) plus drag-and-drop / file-picker `.obj` mesh import (`v`, `vt`, `vn`, `f` N-gon fan triangulation, auto-normalization, smooth/face normals, and box-projected UV fallback).
3. **3D Studio Lighting, Anti-Aliased 3D Wireframe Chase & Interactive 3D Orbit Viewport**:
   - Real-time 3D directional lighting (Key Azimuth/Elevation, Ambient, Specular, Fresnel Rim Glow) + `fwidth` screen-space barycentric **3D Neon Wireframe & Edge Chase** across 5 shading modes (*Lit + Neon Wire*, *Lit Textured*, *Pure 3D Wireframe*, *Unlit UV*, *Normal/Depth Calibration*), paired with an interactive **`🧊 3D Orbit`** model viewport in the Left Editor Pane.
4. **6-Point `solvePnP` Physical Camera-Projector Calibration**:
   - Click 3D model vertices in the Left `🧊 3D Orbit` pane (or 1-click **Auto-Seed 6 Pins**) and drag their corresponding `①..⑥+` target crosshairs onto the physical object corners on the Stage / Projector wall; Hartley-Zisserman normalized Direct Linear Transform (`solvePnP` $3\times 4$ projection matrix + Givens RQ decomposition) solves exact projector pose, throw ratio, and off-axis lens shift with live RMS pixel reprojection error feedback.

### Milestone 7B — Visual 2D/3D Stage Plan & Constant-Brightness Multi-Projector Solver *(Completed)*
1. **Interactive `2D Floor Plan` + `3D Elevation Orbit` Venue Rigging Studio (`<dialog id="stageplan-dialog">`)**:
   - Visual venue CAD viewport (`X × Z` 1m stage floor plan + `Y` trim height + 3D perspective orbit) for placing $N$ unbounded physical projectors (`1..N`), stage screens, and 3D scenic meshes with real optical Throw Ratio (`0.28:1`–`5.0:1`), H/V Lens Shift, Roll, ANSI Lumens, 5 stage rigging presets (*1× Front FOH*, *2×1 Panorama*, *Opposing Cross-Stage Wings*, *2× Tandem Stack*, *3× Concert Stage Wrap*), live perspective frustum footprints, and constant-brightness vs raw lux profile curves.
2. **Shadow-Aware Constant-Brightness Cross-Projection Solver (`128×72 RGBA16F` GPU LUT + 3×3 Homography)**:
   - Exact $3\times 3$ planar-perspective Stage-to-Projector homography (including oblique keystone, lens shift, and optical roll) + $\cos\theta_i / d_i^2$ physical irradiance normalization + Möller–Trumbore 3D ray-mesh occlusion raycasting against `mesh3d` props, uploading hardware-linear `RGBA16F` per-projector gain LUTs so opposing/overlapping projectors deliver uniform physical wall lux while automatically boosting un-occluded projectors to fill 3D shadows.

### Milestone 7C — "Video as Light" Live Stage Performance Mode *(Completed)*
1. **3D-Convergent Multi-Projector Performer Followspot & Spill Mask**:
   - Steer a 3D performer volume $(X, Y, \text{Depth}, \text{Height}, \text{Radius})$ via Mouse, Touch, Gamepad, MIDI, or OSC; `computeConvergentSpotForProjector` solves exact Euclidean ray-plane parallax intersections per projector (`?role=projector&screen=1..N`) so beams from opposite stage wings converge onto the 3D performer in mid-air while `uConvergentMask` attenuates out-of-beam background wall spill.
2. **Stage Gobo Light (`FS_VIDEOLIGHT`) & 4-Blade Theatrical Framing Shutters**:
   - Dedicated **`💡 Light`** procedural Video-as-Light source (*Open Ellipsoidal, Radial Breakup, Linear Blinds, Star Wheel, Concentric Iris, 3-Facet & 5-Facet Rotating Prisms*, chromatic halation, frost diffusion, volumetric haze, Kelvin/dichroic triad) + universal **4-Blade Theatrical Framing Shutters** (`shutterL/R/T/B`, `±45°` blade swivel, focus frost) across every 2D and 3D surface with full Modulation Matrix, Cue, and `.wmshow.json` support.

### Phase 8 — Optional AI Studio Extension Layer *(Future Commercial / Cloud Add-On)*
1. **Prompt-to-ISF Shader & FX Synthesizer**.
2. **Geometry-Aware Stage UV Trompe-l'Œil Content Generation**.
3. **Single-Shot Vision Auto-Masking & Surface Suggestion**.
