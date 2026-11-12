# Chaos CathodeRay 0.1.0 (public beta)

**Projection mapping, video-as-light and show control in one HTML file. It has no install, no server and no cloud, and it runs offline from a USB stick.**

*Formerly WebMapper. Old `.webmapper.json` shows, `.wmplugin.json` plugins and `/webmapper/…` OSC addresses still work.*

[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-34e89e.svg)](./LICENSE)

---

## Beta testers: start here

1. Open **[`Chaos-CathodeRay.html`](./Chaos-CathodeRay.html)** in desktop **Chrome or Edge**.
   - Firefox and Safari run the mapping, but not multi-screen placement, MIDI or USB-DMX.
   - The file needs nothing else; you can copy it anywhere on its own.
2. The **Start screen** asks *what are you making?* Pick one of: quick 2D map · theatre play · VJ set / club · rehearsal · architectural mapping. You can also explore the demo show or open a show file.
3. The three rooms, left to right:
   - **1 · BUILD** (F1): the real space. Venue, screens, projectors, set parts and people.
   - **2 · MAP** (F2): put light onto it. Media, shapes, FX and cues. When you come from LIVE, edits stay **Blind** until you **TAKE**.
   - **3 · LIVE** (F3): play the show. GO, the action deck, the mix and followspots.
4. Every world view has the same **view bar**: **Plan · 3D · Walk · POV**, the six sides (**Top … Right**), and a **Lines / Light** look. Lines gives a measured drawing; Light gives the rendered venue.
5. **✓ / ⚠ Show Check** (top right) lists what would go wrong in front of an audience, each with a one-click fix.
6. **Found a problem?** Click the **β 0.1** badge, or use Show ▾ → Report a problem. Describe what happened and press **✉ Send**: the report goes straight to the Chaos CathodeRay team and you get a report number (e.g. *Chaos CathodeRay Report 251112-1415*). If you're offline, use **Email instead**, **Copy report** or **Download .txt**.
   - Nothing is sent until you press Send.
   - The report has counts only, no file names.

**Your work stays in your browser.** Chaos CathodeRay autosaves into the browser you use, on your computer only; other testers never see it. When you come back, a **Welcome back** bar offers **Keep working** or **⟲ Start fresh**. You can also start fresh any time from Show ▾ → **⟲ Start fresh…**, which offers a backup download first. On a shared demo computer, open the app with **`?fresh`** at the end of the link (e.g. `Chaos-CathodeRay.html?fresh`) to start clean without restoring the last session.

**Output:** plug in a projector and press **Proj** on the right rail. In the projector window, press **F** for fullscreen. When calibration is done, press **Shift + P** to lock the show.

**Files:**
- **Save Show** writes `*.chaos.json`. Media stays where it is on disk.
- **Pack Show** writes `*.chaospack.json` with the media embedded, for moving to another computer.

---

## Highlight Capabilities

### 1. 2D/3D Precision Warping, `.obj` Meshes & 6-Point `solvePnP` Calibration
- **6 Hybrid 2D & 3D Surface Types**:
  - **Perspective Quad**: Exact 3×3 projective homography (`q`-weighted perspective-correct UV) + optional **`2×2`–`16×16` Catmull-Rom Spline / Bicubic Bezier Curved Mesh** with soft proportional brush falloff and Corner-Pin transport.
  - **Triangle**: Exact barycentric UV slicing for geodesic domes & low-poly sculptures.
  - **Circle / Radial Ring / Arc Sector**: Inner hole radius + start/end sweep angles.
  - **Freeform N-Gon Polygon**: Concave/convex ear-clipped polygons with Euclidean perimeter feathering and independent Input UV vertices.
  - **Architectural Line & Perimeter Chase FX**: Multi-segment neon ribbons, animated dashes, chasing beams, and boomerangs.
  - **3D Scenic Mesh (`+ 3D` / `🧊 OBJ`)**: 7 built-in 3D scenic primitives (*Box, Stage Steps, Column, Dome, Obelisk, Torus, Curved Stage Cyclorama*) + zero-dependency `.obj` import, hardware 24-bit depth buffering, 3D studio lighting, neon wireframe chase, interactive **`🧊 3D Orbit`** viewport, and **6-Point `solvePnP` Camera-Projector Calibration**.
- **Architectural & Theatrical Tooling**:
  - **Theatrical 4-Blade Framing Shutters**: Independent Left/Right/Top/Bottom optical gate cuts with `±45°` blade swivel and focus frost across every 2D and 3D surface.
  - **Perspective Quad `N×M` Grid Cloner** (`⊞ Split Grid…`) for window facades, brick matrices, and coffered ceilings.
  - **Smooth Bezier Additive/Subtractive Masks** (128-point GPU SDF + Mask Choke), **`.svg` Elevation Import**, and **1:1 Stage UV Template Export** (`.png` / `.svg`).
  - **Optical Structured-Light "Space Scanner"**: Pure-browser Reflected Gray-Code camera-to-projector correspondence scanner generating a Projector-POV reference background.

### 2. Cinema-Grade WebGL2 Optical Pipeline & Live ISF v2 Shader Studio
- **16-Bit Half-Float HDR Compositing (`RGBA16F`)** + `16×` anisotropic mipmapped texture filtering.
- **12 Blend Modes**, **Luma & YCbCr Chroma Keying**, Rodrigues Hue/Kelvin/Gamma color science, and stackable **Per-Surface + Master Output GPU Post-FX Racks** (*Bloom, Sobel Edge-Trace, Kaleidoscope, LED Pixelate, Chromatic Aberration, Glitch Slice, Feedback Trails, Strobe*, plus custom ISF effects).
- **Dockable Live ISF v2 (`.fs`) GLSL Shader Studio** with auto-generated Inspector sliders, multi-pass ping-pong `PASSES`, and non-destructive hot-compile diagnostics.
- **Pro Media Sources**: Local Video (non-destructive In/Out trim, GPU seamless loop crossfade, BPM rate sync, audio waveform), Still Images, Live Camera, **Zero-Install Window / Screen Capture (`getDisplayMedia`)**, **Dynamic Canvas Typography / `{COUNTDOWN}` Generator**, and 9 built-in shaders.

### 3. Spatial Live Mixing, Audio/MIDI/OSC Modulation & Show Timeline
- **`◎ Mix` Spatial Radar (`4` / `V`)**: Decouples live VJ source mixing (center = `100%`, rim = `0%`, Standby Orbit `r = 1.12`, flick-throw inertia, double-click Solo) from calibrated Stage geometry.
- **2D Cue Constellation Pad**: Shepard inverse-distance multi-cue vector morphing across any number of stored show cues.
- **Universal Modulation Matrix**: Built-in **WebAudio Synth Beat Engine** + Live Mic/Media FFT (`Sub`, `Low`, `Mid`, `High`, `RMS`, `Beat`) driving **LFOs**, **Audio Envelopes**, and **8-Step Beat Sequencers** on any slider (`Right-Click` any slider to bind).
- **1-Click `WebMIDI` Learn (`Cmd/Ctrl + M`)**, **Wireless Gamepad Steering**, **Bi-Directional Binary OSC 1.0**, **Selective Cue Recall Filters** (protecting live warp geometry!), and **Keyframe Show Timeline (`T`)**.

### 4. 2D/3D Stage Plan Constant-Brightness Solver, Video-as-Light & LED Pixel Mapping
- **Multi-Projector Array Routing (`1..N` Screens) & 2D/3D Visual Stage Plan**:
  - Slice or cross-project the Canonical Stage across **unbounded `1..N` Projector Windows** (`?role=projector&screen=1..N`, grid presets `1×1`..`6×1`, `3×2`, `2×`/`3×` tandem stacks, or full 3D Stage Plan rigs via `getScreenDetails()`).
  - **2D Top Plan + 3D Elevation Orbit Rigging Studio (`📐 2D/3D Stage Plan & Constant Brightness…`)**: Place projectors in real stage meters (`X, Y trim height, Z throw`, Throw Ratio, Lens Shift, ANSI Lumens) with exact 3×3 perspective homography, cos θ / d² constant-brightness GPU `RGBA16F` LUT equalization, and automatic **3D Scenic Mesh Shadow Fill** when `mesh3d` props block one projector's sightline.
  - **"Video as Light" Live Performance**: **3D-Convergent Multi-Projector Followspot** converging beams from opposing wings onto a 3D performer volume while masking wall spill, plus dedicated **`💡 Light` Stage Gobo & Prism Instruments** and **GPU 14-Frame Ring-Buffer Delay (`0–200ms`)**.
- **Real-Time LED Pixel Mapper**:
  - Place **LED Strips, Serpentine Matrices, and Rings** directly on the Stage to sample live WebGL pixels (`RGB`, `GRB` WS2812, `BGR` APA102, `RGBW`, `Luma`, `RGB16`) with automatic multi-universe rollover and collision detection.
  - Stream 44Hz DMX512 directly from Chrome/Edge via **`WebSerial`** (**ENTTEC DMX USB Pro** & **OpenDMX FTDI 250k 8N2**) or over **Art-Net UDP `6454`** via the zero-dependency local Node relay.

---

## Essential Keyboard Shortcuts

| Action | Shortcut |
| :--- | :--- |
| **Command Palette & Flash-to-Location** | `/` or `Cmd/Ctrl + K` |
| **GO Next Cue / Previous Cue** (stops safely at End of List) | `Space` or `]` / `Shift + Space` or `[` |
| **Stage Blackout (DBO)** (`0ms` Out • Hold `0.6s` or `Shift+B` Restore) | `B` |
| **Show Lock** (protects calibration & hides guides on projectors) | `Shift + P` |
| **Split / Input UV / Stage / `◎ Mix` / `◪ Rig` Workspace** | `1` / `2` / `3` / `4` (`V`) / `5` |
| **Radial Add-Surface Menu / Precision Snap Pie** | Hold `A` / Hold `S` |
| **Followspot Live Stage Steer** (`Tab` stays pure WAI-ARIA focus!) | `` ` `` (Backquote) |
| **Sub-Pixel Vertex Nudge** (`1px` / `10px` / `0.2px`) | `Arrow Keys` / `Shift+Arrows` / `Alt+Arrows` |
| **10× Fine Drag Gear & Cycle Active Vertex** | Hold `Alt` while dragging / `,` and `.` |
| **Undo / Redo** (50-step gesture-coalesced) | `Cmd/Ctrl + Z` / `Cmd/Ctrl + Shift + Z` |
| **Launch 2nd-Screen Projector / Laptop GPU Eco Mode** | `Shift + W` / `Shift + 9` |
| **Keyframe Show Timeline / 1-Click MIDI Learn** | `T` / `Cmd/Ctrl + M` |
| **Clean Local Stage Mode / Fullscreen / Cheat-Sheet** | `P` then `F` / `?` |

---

## Optional Local OSC & Art-Net UDP Bridge

While `Chaos-CathodeRay.html` runs 100% standalone over `file://` (including `WebMIDI` and `WebSerial` USB-DMX), browsers cannot send raw UDP packets directly. To connect **OSC controllers, show-control and music software** over UDP OSC or **Art-Net LED Pixel Controllers** over UDP `6454`, run the included zero-dependency Node.js relay:

```bash
npm run bridge
# or with custom ports / Art-Net target IP:
WS_PORT=8080 OSC_IN_PORT=9000 OSC_OUT_PORT=9001 ARTNET_HOST=255.255.255.255 ARTNET_PORT=6454 node scripts/osc-artnet-bridge.js
```

Then click **Connect Bridge** in the **`Mod/IO`** tab (or toggle **`Art-Net WS → UDP 6454`** in **`Output → LED Pixel Map`**).

---

## Architecture, Building & Testing

Source files live under [`src/`](./src/) (`styles.css`, `body.html`, and modular scripts `01-shaders.js` .. `08-events-boot.js`) and compile into the single-file [`Chaos-CathodeRay.html`](./Chaos-CathodeRay.html) bundle:

```bash
# Syntax-check all JS modules and rebuild the portable Chaos-CathodeRay.html
npm run build

# Run the full zero-dependency automated verification suite (21 suites)
npm test
```

- Extending Chaos CathodeRay with custom `.chaosplugin.json` packs, ISF shaders, custom modulators, or external controllers? Read **[`PLUGIN_SPEC.md`](./PLUGIN_SPEC.md)**.
- Contributing code or bug fixes? Read **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** and **[`ROADMAP.md`](./ROADMAP.md)**.

---

## License & commercial use

Copyright © 2026 Jonathan O'Hear. **Chaos CathodeRay is free software**, licensed under the **[GNU Affero General Public License v3.0 or later](./LICENSE)** (AGPL-3.0-or-later). Additional terms and permissions are in **[NOTICE.md](./NOTICE.md)**.

- **Use it, study it, change it.** You may run Chaos CathodeRay for any purpose, including paid shows, and modify it. Private changes you use yourself don't have to be published.
- **Share alike.** If you **distribute** Chaos CathodeRay, or **let other people use a modified version over a network** (for example a hosted service), you must give those users the complete corresponding source of your version under the same licence.
- **Keep the credit.** Modified versions must keep the copyright notice and "Based on Chaos CathodeRay" in their legal notices (About screen).
- **Your work is yours.** Shows, media and output made with Chaos CathodeRay, and plugins or shaders that use its public plugin interfaces, are not covered by the AGPL. License them however you like.
- **The name is not included.** "Chaos CathodeRay" and its logos are trademarks. Modified versions must use a different name; see **[TRADEMARK.md](./TRADEMARK.md)**.
- **Commercial licences.** To build Chaos CathodeRay into a proprietary product or white-label it without the AGPL obligations, contact **jonathan@ohear.com**.
- **Contributing.** Pull requests need the **[Contributor Licence Agreement](./CLA.md)**.

This program comes with **absolutely no warranty**, to the extent permitted by law.
