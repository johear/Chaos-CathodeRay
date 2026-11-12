# Chaos CathodeRay Plugin & Extension API Specification (`v2.0`)

Chaos CathodeRay is designed with clean, open extension points so visualists, shader authors, hardware hackers, and toolmakers can create, share, or sell **Generators**, **GPU Post-FX**, **Custom Modulators**, **Hardware Controllers**, and **Optional AI Assistants** without forking the core engine.

---

## 1. Declarative `.chaosplugin.json` File Format

Users can drag-and-drop (or load via the **Shader Studio** / **FX Rack**) standalone `.chaosplugin.json` files (older `.wmplugin.json` files still load)—or raw ISF v2 `.fs` files—directly into `Chaos-CathodeRay.html`.

### Schema (`chaosplugin` v1)

```json
{
  "format": "chaoscathode-plugin",
  "version": 1,
  "kind": "effect",
  "id": "prism_refract",
  "name": "Prism Refraction",
  "author": "Studio Example",
  "license": "MIT",
  "isfCode": "/*{\n  \"DESCRIPTION\": \"3-way chromatic prism offset\",\n  \"INPUTS\": [\n    { \"NAME\": \"inputImage\", \"TYPE\": \"image\" },\n    { \"NAME\": \"spread\", \"LABEL\": \"Prism Spread\", \"TYPE\": \"float\", \"DEFAULT\": 0.015, \"MIN\": 0.0, \"MAX\": 0.08 }\n  ]\n}*/\nvoid main() {\n  vec2 uv = isf_FragNormCoord;\n  float r = IMG_NORM_PIXEL(inputImage, uv + vec2(spread, 0.0)).r;\n  vec4 g = IMG_NORM_PIXEL(inputImage, uv);\n  float b = IMG_NORM_PIXEL(inputImage, uv - vec2(spread, 0.0)).b;\n  gl_FragColor = vec4(r, g.g, b, g.a);\n}"
}
```

- **`kind`**:
  - `"generator"` — Appears in the **Media Bin** as a live procedural source with auto-generated Inspector controls.
  - `"effect"` — Appears in both **Per-Surface GPU Post-FX** and **Master Output GPU Post-FX** dropdowns (receives upstream `sampler2D inputImage`).

### Supported ISF v2 Input Types & Built-In Uniforms

| ISF `TYPE` | Generated UI Control | GLSL Uniform Type |
| :--- | :--- | :--- |
| `"float"` | Range Slider (`MIN`..`MAX`, modulatable via LFO/Audio/MIDI/OSC) | `uniform float <NAME>;` |
| `"point2D"` | Dual X/Y normalized sliders | `uniform vec2 <NAME>;` |
| `"color"` | RGBA Color Picker | `uniform vec4 <NAME>;` |
| `"bool"` | Toggle Button | `uniform bool <NAME>;` |
| `"long"` | `<select>` Dropdown (`VALUES` + `LABELS`) | `uniform int <NAME>;` |
| `"event"` | Momentary Trigger Pulse Button (1-frame `true`) | `uniform bool <NAME>;` |
| `"image"` | Upstream texture (`inputImage` in FX; media slot in Generators) | `uniform sampler2D <NAME>;` |

Built-in ISF uniforms automatically injected into every shader:
- `TIME` (`float`, seconds), `TIMEDELTA` (`float`), `FRAMEINDEX` (`int`), `RENDERSIZE` (`vec2` pixels), `PASSINDEX` (`int`), `isf_FragNormCoord` (`vec2` `0..1`), plus `IMG_NORM_PIXEL(tex, uv)`, `IMG_PIXEL(tex, px)`, `IMG_THIS_PIXEL(tex)`, and `IMG_SIZE(tex)`.

---

**Licensing your plugin:** plugins, shaders and external tools that use only these public interfaces are yours. You may license them however you like, including proprietary licences (see [NOTICE.md](./NOTICE.md), Permission 2). Put your choice in the `license` field; if you leave it out, it is recorded as `unspecified`.

## 2. Runtime JavaScript Extension API (`window.ChaosCathodeRayAPI`)

When `Chaos-CathodeRay.html` boots, it exposes a frozen `window.ChaosCathodeRayAPI` (`v2.0.0`) for browser userscripts, companion Electron/Tauri wrappers, custom show controllers, and optional Phase 7 AI plugins.

### Registering Generators, Effects & Custom Modulators

```js
// 1. Register a procedural ISF Generator into the Media Bin
window.ChaosCathodeRayAPI.registerGenerator({
  id: 'aurora_ribbons',
  name: 'Aurora Ribbons',
  author: 'Open VJ Pack',
  isfCode: `/*{
    "DESCRIPTION": "Harmonic Northern Lights",
    "INPUTS": [{ "NAME": "rate", "TYPE": "float", "DEFAULT": 1.2, "MIN": 0.1, "MAX": 5.0 }]
  }*/
  void main() {
    vec2 uv = isf_FragNormCoord;
    float w = 0.5 + 0.5 * sin(uv.x * 12.0 + TIME * rate);
    gl_FragColor = vec4(0.1 * w, 0.85 * w * uv.y, 0.65 * w, 1.0);
  }`
});

// 2. Register a custom JavaScript Modulator curve (returns normalized 0..1)
window.ChaosCathodeRayAPI.registerModulator(
  'euclidean_gate',
  (mod, dt, ctx) => ((ctx.beatCount % 3 === 0 && ctx.beatPhase < 0.5) ? 1.0 : 0.0),
  { label: 'Euclidean 3-Step Gate', author: 'Rhythm Lab' }
);

// Attach the custom modulator to DMX Master Dimmer (or any surface/FX/followspot target!)
window.ChaosCathodeRayAPI.addModulator({
  targetKey: 'dmx:masterDimmer',
  kind: 'euclidean_gate',
  minVal: 0.15,
  maxVal: 1.0
});
```

### Controlling Parameters, Cues, Stage SVG Templates & DMX

```js
// Inspect live show topology
const summary = window.ChaosCathodeRayAPI.getStateSummary();

// Export pixel-accurate Stage UV wireframe SVG for content creation or AI UV conditioning
const stageSvg = window.ChaosCathodeRayAPI.getStageUvTemplateSvg();

// Read / write any modulatable parameter target
const targets = window.ChaosCathodeRayAPI.listParamTargets();
window.ChaosCathodeRayAPI.setParam('followspot:spotX', 0.5);
window.ChaosCathodeRayAPI.setParam('master:opacity', 0.95);

// Recall Cue by 0-based index, ID, or name
window.ChaosCathodeRayAPI.triggerCue(0);

// Inspect live 512-byte DMX universe buffer
const uni0 = window.ChaosCathodeRayAPI.getDmxUniverseSnapshot(0);

// Subscribe to live studio events ('beat', 'cue', 'param', 'dmxFrame', 'pluginRegistered', 'showLoaded')
const unsubscribe = window.ChaosCathodeRayAPI.on('beat', ({ bpm, beatCount }) => {
  console.log('Beat!', beatCount, 'at', bpm, 'BPM');
});
```

### 3D Surfaces, `solvePnP` Calibration, 2D/3D Stage Plan & Video-as-Light API

```js
// 1. Add built-in 3D scenic primitives ('cube', 'steps', 'cylinder', 'sphere', 'pyramid', 'torus', 'stage_cyc')
//    or import .OBJ text directly into the 24-bit depth-buffered Stage
const surfId = window.ChaosCathodeRayAPI.add3DSurface('stage_cyc', { shade3d: 'lit_wire' });
const objId = window.ChaosCathodeRayAPI.importObjSurface(objFileText, 'ScenicWedge.obj');
window.ChaosCathodeRayAPI.solveSurfacePnP(objId);

// 2. Configure the 2D/3D Stage Plan & Shadow-Aware Constant-Brightness Solver
window.ChaosCathodeRayAPI.applyStagePlanPreset('opposing_wings_constant', true);
window.ChaosCathodeRayAPI.setProjectorPose(1, { posM: [-3.25, 2.55, 2.35], throwRatio: 0.68, lumens: 10000 });
const planReport = window.ChaosCathodeRayAPI.getStagePlanReport(0.5, 0.5);

// 3. Drive the 3D-Convergent Performer Followspot & 4-Blade Theatrical Framing Shutters
window.ChaosCathodeRayAPI.setFollowspot3DTarget({
  mode: 'veil',
  converge3D: true,
  maskBgSpill: true,
  spotX: 0.45,
  spotY: 0.50,
  performerDepthM: 1.65
});
window.ChaosCathodeRayAPI.setSurfaceShutters(surfId, { shutterL: 0.15, shutterR: 0.15, shutterAngL: 14, shutterAngR: -14 });
```

### Phase 8 Optional AI Assistant Provider Hook

Core Chaos CathodeRay contains zero cloud calls or API keys. Optional local or cloud AI extensions can register themselves cleanly through `registerAssistantProvider`:

```js
window.ChaosCathodeRayAPI.registerAssistantProvider({
  id: 'my-shader-copilot',
  name: 'ISF Shader & Stage UV Assistant',
  capabilities: ['prompt-to-isf', 'stage-uv-texture', 'vision-automask'],
  async generateIsfShader(prompt) {
    // Custom local Ollama / WebGPU / Cloud API implementation...
  }
});
```
