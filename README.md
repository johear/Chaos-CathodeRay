# Chaos CathodeRay

**Projection mapping, video-as-light and show control, all in one HTML file.**
There's nothing to install, no server and no account; it runs offline from a laptop or a USB stick.

[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-34e89e.svg)](./LICENSE) ![Status: public beta 0.1.0](https://img.shields.io/badge/status-public%20beta%200.1.0-ffcb7d.svg)

**▶ [Open it online](https://www.jonathan.ohear.com/Chaos/CathodeRay/Chaos-CathodeRay.html)** · **⬇ [Download `Chaos-CathodeRay.html`](https://github.com/johear/Chaos-CathodeRay/raw/main/Chaos-CathodeRay.html)** · **🧪 [Beta tester guide](./TESTERS.md)**

---

## What it is

Chaos CathodeRay lets you map video, shaders and light onto real things and then play them as a show:
- a wall, a window or a box;
- a theatre set with performers and a followspot;
- a club with a live VJ mix;
- a building facade lit by several projectors.

You work in three rooms, from left to right:

| Room | Key | What you do there |
|---|---|---|
| **1 · BUILD** | F1 | Set up the real space: venue, stage, set parts, screens, projectors, people and lights. Calibrate projectors precisely by clicking known points. |
| **2 · MAP** | F2 | Put light onto it: media, shaders, shapes, masks, colour, FX and framing shutters. Store cues. Edits made after a show is live stay **Blind** until you **TAKE** them, with a fade. |
| **3 · LIVE** | F3 | Run the show: GO through cues, fire out-of-sequence action cues, mix sources on the spatial radar, drive followspots, and control DMX and projector shutters. |

Every view of the space has the same view bar:
- **Plan · 3D · Walk · POV**;
- the six sides, **Top … Right**;
- a **Lines / Light** look. Lines gives a measured drawing; Light gives the rendered venue, with every projector's light and haze.

## Highlights

- **Warping:**
  - quads (perspective and curved mesh), triangles, circles and arcs, polygons and lines;
  - 3D meshes, including `.obj` import;
  - 6-point camera-to-projector calibration.
- **The venue in 3D:**
  - venue types from black box to open ground;
  - custom platforms, steps, walls, columns, truss and facades;
  - people, and DMX lights placed in the space.
  - **Map onto** a face or a person in one click, and the mapping follows when it moves.
- **Several projectors:** soft edge blending, constant-brightness overlap and frame-delay sync. Projector output windows support multi-screen placement.
- **Video as light:** followspots that converge from several projectors onto a performer, plus gobos and framing shutters.
- **Live mixing:** a spatial radar mixer, a cue constellation pad, a keyframe timeline, and modulation from audio, LFOs, MIDI, OSC and gamepads.
- **Shaders:** a live ISF/GLSL shader studio, a GPU post-FX rack, HDR compositing, keying and colour grading.
- **Lighting control:** an LED pixel mapper, USB-DMX (WebSerial), Art-Net through a small included bridge, and PJLink projector shutters.
- **Built for real shows:**
  - Program/Preview editing with TAKE;
  - a two-stage blackout and show lock;
  - autosave;
  - a **Show Check** that lists what would go wrong in front of an audience.

## Try it

1. Open **[the online version](https://www.jonathan.ohear.com/Chaos/CathodeRay/Chaos-CathodeRay.html)**, or download **`Chaos-CathodeRay.html`** and double-click it.
2. Use desktop **Chrome or Edge** for everything. Firefox and Safari run the mapping, but not multi-screen placement, MIDI or USB-DMX.
3. Press **▶ Start mapping** on the Start screen, then follow the 💡 tip line. Panels appear as your show grows, and **＋** in the top bar lists what you can add next. Kits give a ready-made start for a theatre play, a VJ set, a rehearsal or a facade.

**Beta testers:** please read the **[beta tester guide](./TESTERS.md)**. It covers what to try and how to report a problem in one click.

## Building from source

The app is built from `src/` into the single file `Chaos-CathodeRay.html`. You need Node.js 18 or later; there are no npm dependencies.

```bash
npm run build    # check every module, bundle Chaos-CathodeRay.html, render the README/TESTERS/licence pages
npm test         # run the automated test suites
npm run bridge   # optional OSC / Art-Net / PJLink bridge (browsers can't send UDP themselves)
```

- **Plugins, shaders or controller integrations:** see **[PLUGIN_SPEC.md](./PLUGIN_SPEC.md)**.
- **Contributing:** see **[CONTRIBUTING.md](./CONTRIBUTING.md)** and **[ROADMAP.md](./ROADMAP.md)**. Pull requests need the **[CLA](./CLA.md)**.

## License & commercial use

Copyright © 2026 Jonathan O'Hear. **Chaos CathodeRay is free software**, licensed under the **[GNU Affero General Public License v3.0 or later](./LICENSE)** (AGPL-3.0-or-later). Additional terms and permissions are in **[NOTICE.md](./NOTICE.md)**.

- **Use it, study it, change it.** You may run it for any purpose, including paid shows. Private changes that only you use don't have to be published.
- **Share alike.** If you **distribute** it, or **let other people use a modified version over a network**, you must give those users the complete source of your version under the same licence.
- **Keep the credit.** Modified versions must keep the copyright notice and "Based on Chaos CathodeRay" in their legal notices (the About screen).
- **Your work is yours.** The AGPL doesn't cover shows, media and output made with Chaos CathodeRay. It doesn't cover plugins or shaders that only use the public plugin interfaces either.
- **The name is not included.** "Chaos CathodeRay" and its logos are trademarks, so modified versions must use a different name. See **[TRADEMARK.md](./TRADEMARK.md)**.
- **Commercial licences.** To build it into a proprietary product or white-label it without the AGPL obligations, contact **talk.to.chaos.productions@gmail.com**.

This program comes with **absolutely no warranty**, to the extent permitted by law.

*Formerly WebMapper. Older `.webmapper.json` shows, `.wmplugin.json` plugins and `/webmapper/…` OSC addresses still work.*
