// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 01b-isf-fx-shaders.js — Milestone 3:
//   1. 5 Additional Built-In Procedural Generators (GridScan, Caustics, Liquid,
//      Geo Tunnel Strobe, Stage Cyclorama Gradient)
//   2. Native ISF v2 (.fs) Metadata Parser & GLSL ES 3.00 Hot-Swap Transpiler
//      (supporting float, bool, long, color, point2D, event, image, PASSES &
//       persistent ping-pong target buffers + exact line-number diagnostics)
//   3. Starter ISF v2 Templates & Built-In Generator Fork Templates
//   4. Stackable GPU Post-FX Shaders & Registry (Bloom, Edge-Trace, Kaleido,
//      Pixelate LED, Chromatic Aberration, Glitch, Feedback Trails, Strobe)
//   5. Virtual "Mix Circle" Bus Orb Compositor Shader
// ============================================================================

// ----------------------------------------------------------------------------
// 1. FIVE ADDITIONAL BUILT-IN PROCEDURAL GENERATORS (GLSL ES 3.00)
// ----------------------------------------------------------------------------

const FS_GRIDSCAN = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform float uDetail;
uniform float uTemp;
uniform int uPalette;
${SHADER_COMMON}

void main() {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float density = round(mix(6.0, 28.0, clamp(uScale * 0.48, 0.0, 1.0)));
  vec2 gUv = vec2(vUv.x * density * aspect, vUv.y * density);

  vec2 fw = max(fwidth(gUv), vec2(0.0008));
  vec2 cell = abs(fract(gUv) - 0.5);
  float minorGrid = 1.0 - min(min(cell.x / fw.x, cell.y / fw.y), 1.0);

  vec2 gMaj = gUv * 0.25;
  vec2 fwMaj = max(fwidth(gMaj), vec2(0.0004));
  vec2 cellMaj = abs(fract(gMaj) - 0.5);
  float majorGrid = 1.0 - min(min(cellMaj.x / fwMaj.x, cellMaj.y / fwMaj.y), 1.0);

  float crossDist = length(fract(gUv + 0.5) - 0.5);
  float nodes = smoothstep(0.09, 0.015, crossDist);

  float scanX = fract(uTime * 0.22);
  float scanY = fract(uTime * 0.14 + 0.37);
  float sweepX = exp(-abs(vUv.x - scanX) * mix(22.0, 60.0, clamp(uDetail * 0.5, 0.0, 1.0)));
  float sweepY = exp(-abs(vUv.y - scanY) * mix(22.0, 60.0, clamp(uDetail * 0.5, 0.0, 1.0)));

  float radarAng = atan(p.y, p.x);
  float radarSweep = fract((radarAng / TAU) - uTime * 0.18);
  float radarCone = pow(radarSweep, 5.0) * smoothstep(0.85, 0.08, length(p));
  float rings = smoothstep(0.012, 0.0, abs(fract(length(p) * (density * 0.25) - uTime * 0.25) - 0.5) - 0.46);

  vec3 baseCol = evalThemeTriad(uPalette, 0.25, 0.2, uTemp);
  vec3 hiCol = evalThemeTriad(uPalette, 0.82, 0.75, uTemp);

  vec3 col = vec3(0.012, 0.018, 0.03);
  col += baseCol * minorGrid * 0.32;
  col += hiCol * majorGrid * 0.78;
  col += mix(hiCol, vec3(1.0), 0.55) * nodes * (0.35 + 0.65 * max(sweepX, sweepY));
  col += hiCol * (sweepX + sweepY) * 0.58;
  col += baseCol * radarCone * clamp(uDetail * 0.55, 0.0, 1.1);
  col += mix(baseCol, vec3(1.0), 0.4) * rings * 0.35 * clamp(uDetail * 0.6, 0.0, 1.0);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const FS_CAUSTICS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform float uDetail;
uniform float uTemp;
uniform int uPalette;
${SHADER_COMMON}

float causticLayer(vec2 uv, float t, int iters) {
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.0052;
  for (int n = 0; n < 5; n++) {
    if (n >= iters) break;
    float fn = float(n);
    float tt = t * (1.0 - (3.2 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    vec2 denom = vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten));
    c += 1.0 / max(0.001, length(denom));
  }
  c /= float(iters);
  c = 1.17 - pow(max(0.0, c), 1.4);
  return pow(abs(c), 7.5);
}

void main() {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float sc = mix(0.45, 2.4, clamp(uScale * 0.48, 0.0, 1.0));
  int octaves = 3 + int(clamp(uDetail, 0.0, 2.0));

  float cA = causticLayer(p * sc, uTime * 0.65, octaves);
  float cB = causticLayer(p * sc * 1.18 + vec2(0.17, -0.11), -uTime * 0.52 + 2.4, max(3, octaves - 1));
  float energy = clamp(cA * 0.75 + cB * 0.55, 0.0, 2.2);

  vec3 deep = evalThemeTriad(uPalette, 0.14, 0.18, uTemp) * 0.18;
  vec3 mid = evalThemeTriad(uPalette, clamp(energy * 0.62, 0.08, 0.92), cA * 0.5, uTemp);
  vec3 cusp = mix(mid, vec3(1.0), 0.68) * pow(clamp(energy, 0.0, 1.4), 1.85);
  vec3 col = deep + mid * energy * 0.82 + cusp * (0.45 + 0.35 * clamp(uDetail * 0.5, 0.0, 1.0));

  vec3 mapped = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.15)), 1.0);
}`;

const FS_LIQUID = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform float uDetail;
uniform float uTemp;
uniform int uPalette;
${SHADER_COMMON}

float liquidField(vec2 uv, float t, float warpAmt) {
  vec2 q = vec2(
    fbmCosmic(uv + vec2(0.0, t * 0.24)),
    fbmCosmic(uv + vec2(4.1, 2.3) - vec2(t * 0.21, 0.0))
  );
  vec2 r = vec2(
    fbmCosmic(uv + warpAmt * q + vec2(1.9, 7.4) + t * 0.16),
    fbmCosmic(uv + warpAmt * q + vec2(6.7, 3.1) - t * 0.19)
  );
  return fbmCosmic(uv + warpAmt * 1.15 * r);
}

void main() {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float sc = 2.6 / max(0.15, uScale);
  vec2 uv = p * sc;
  float warp = mix(1.1, 3.8, clamp(uDetail * 0.55, 0.0, 1.0));

  float eps = 0.018;
  float h0 = liquidField(uv, uTime, warp);
  float hx = liquidField(uv + vec2(eps, 0.0), uTime, warp);
  float hy = liquidField(uv + vec2(0.0, eps), uTime, warp);

  vec3 norm = normalize(vec3((h0 - hx) / eps, (h0 - hy) / eps, 0.55));
  vec3 lightDir = normalize(vec3(cos(uTime * 0.4) * 0.6, sin(uTime * 0.35) * 0.6, 0.85));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfV = normalize(lightDir + viewDir);

  float diff = max(0.0, dot(norm, lightDir));
  float spec = pow(max(0.0, dot(norm, halfV)), 28.0);
  float fres = pow(1.0 - max(0.0, dot(norm, viewDir)), 2.6);

  vec3 c1 = evalThemeTriad(uPalette, clamp(h0 * 1.1, 0.05, 0.95), norm.x * 0.5 + 0.5, uTemp);
  vec3 c2 = evalThemeTriad(uPalette, clamp(1.0 - h0, 0.08, 0.92), norm.y * 0.5 + 0.5, uTemp);
  vec3 base = mix(c1, c2, fres);
  vec3 col = base * (0.24 + diff * 0.92) + mix(c2, vec3(1.0), 0.72) * spec * 1.15;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const FS_STROBEGEO = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform float uDetail;
uniform float uTemp;
uniform int uPalette;
${SHADER_COMMON}

float polyRadius(vec2 p, float sides) {
  float a = atan(p.y, p.x) + PI * 0.5;
  float seg = TAU / sides;
  return cos(floor(0.5 + a / seg) * seg - a) * length(p);
}

void main() {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float sides = round(mix(3.0, 8.0, clamp(uDetail * 0.5, 0.0, 1.0)));
  float freq = mix(4.0, 18.0, clamp(uScale * 0.5, 0.0, 1.0));

  vec2 rp = rot2(uTime * 0.22) * p;
  float d = mix(length(rp), polyRadius(rp, sides), 0.85);
  float tunnel = d * freq - uTime * 1.85;
  float ringIdx = floor(tunnel);
  float ringFrac = abs(fract(tunnel) - 0.5);

  float sharp = mix(14.0, 46.0, clamp(uDetail * 0.5, 0.0, 1.0));
  float line = exp(-ringFrac * sharp);
  float core = smoothstep(0.045, 0.008, ringFrac);

  float beatGate = 0.55 + 0.45 * sin(ringIdx * 1.7 + uTime * 5.0);
  vec3 colRing = evalThemeTriad(uPalette, fract(ringIdx * 0.19), fract(ringIdx * 0.37), uTemp);
  vec3 col = colRing * line * beatGate * 1.05 + mix(colRing, vec3(1.0), 0.65) * core * beatGate;
  col *= smoothstep(0.01, 0.12, d);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const FS_GRADIENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform float uDetail;
uniform float uTemp;
uniform int uPalette;
${SHADER_COMMON}

void main() {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);

  float radMix = clamp((uScale - 0.2) * 0.5, 0.0, 1.0);
  float wave = sin(vUv.x * PI * (1.0 + uDetail) + uTime * 0.65) * 0.08 * clamp(uDetail, 0.0, 1.5);
  float tLinear = clamp(vUv.y + wave, 0.0, 1.0);
  float tRadial = clamp(1.0 - length(p) * (0.85 + 0.35 * uDetail) + sin(uTime * 0.5) * 0.06, 0.0, 1.0);
  float g = mix(tLinear, tRadial, radMix);

  float drift = 0.5 + 0.5 * sin(uTime * 0.35);
  vec3 colLow = evalThemeTriad(uPalette, 0.08, drift * 0.3, uTemp);
  vec3 colMid = evalThemeTriad(uPalette, 0.52, 0.5, uTemp);
  vec3 colHigh = evalThemeTriad(uPalette, 0.94, 1.0 - drift * 0.3, uTemp);

  vec3 col = mix(colLow, colMid, smoothstep(0.0, 0.56, g));
  col = mix(col, colHigh, smoothstep(0.44, 1.0, g));

  // Subtle dither to eliminate 8-bit banding on theatrical cycloramas
  vec3 dither = (hash32(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  fragColor = vec4(clamp(col + dither, 0.0, 1.0), 1.0);
}`;

// ----------------------------------------------------------------------------
// 2. STARTER ISF v2 (.fs) TEMPLATES FOR LIVE SHADER STUDIO & PLUGIN AUTHORING
// ----------------------------------------------------------------------------

const ISF_STARTER_TEMPLATES = {
  neon_rings: {
    name: 'Neon Plasma Rings (ISF)',
    kind: 'generator',
    code: `/*{
  "DESCRIPTION": "Hypnotic interfered neon rings with customizable symmetry and glow",
  "CREDIT": "Chaos CathodeRay",
  "ISFVSN": "2",
  "CATEGORIES": ["Generator", "Geometric"],
  "INPUTS": [
    { "NAME": "ringFreq", "LABEL": "Ring Density", "TYPE": "float", "DEFAULT": 10.0, "MIN": 2.0, "MAX": 32.0 },
    { "NAME": "warpAmt", "LABEL": "Harmonic Warp", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.0, "MAX": 1.5 },
    { "NAME": "glowSharp", "LABEL": "Beam Focus", "TYPE": "float", "DEFAULT": 24.0, "MIN": 6.0, "MAX": 64.0 },
    { "NAME": "center", "LABEL": "Emitter XY", "TYPE": "point2D", "DEFAULT": [0.5, 0.5], "MIN": [0.0, 0.0], "MAX": [1.0, 1.0] },
    { "NAME": "primaryCol", "LABEL": "Primary Tint", "TYPE": "color", "DEFAULT": [0.20, 0.86, 1.0, 1.0] },
    { "NAME": "accentCol", "LABEL": "Accent Tint", "TYPE": "color", "DEFAULT": [1.0, 0.32, 0.58, 1.0] },
    { "NAME": "invertBg", "LABEL": "Invert Polarity", "TYPE": "bool", "DEFAULT": false }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  float aspect = RENDERSIZE.x / max(1.0, RENDERSIZE.y);
  vec2 p = (uv - center) * vec2(aspect, 1.0);

  float ang = atan(p.y, p.x);
  float r = length(p);
  float harmonic = sin(ang * 6.0 + TIME * 1.4) * warpAmt * 0.12
                 + cos(ang * 3.0 - TIME * 0.9) * warpAmt * 0.08;

  float wave = abs(fract((r + harmonic) * ringFreq - TIME * 0.85) - 0.5);
  float beam = exp(-wave * glowSharp);
  float core = smoothstep(0.05, 0.0, wave);

  vec3 col = mix(primaryCol.rgb, accentCol.rgb, 0.5 + 0.5 * sin(r * 8.0 - TIME)) * beam;
  col += vec3(1.0) * core * 0.55;
  if (invertBg) col = 1.0 - clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
  },

  reaction_pingpong: {
    name: 'Persistent Trail Attractor (Multi-Pass ISF)',
    kind: 'generator',
    code: `/*{
  "DESCRIPTION": "Multi-pass persistent ping-pong orbital emitter demonstrating ISF PASSES",
  "CREDIT": "Chaos CathodeRay",
  "ISFVSN": "2",
  "CATEGORIES": ["Generator", "Feedback"],
  "INPUTS": [
    { "NAME": "decay", "LABEL": "Trail Decay", "TYPE": "float", "DEFAULT": 0.93, "MIN": 0.60, "MAX": 0.99 },
    { "NAME": "orbitRadius", "LABEL": "Orbit Radius", "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.05, "MAX": 0.48 },
    { "NAME": "emitterCount", "LABEL": "Emitters", "TYPE": "long", "VALUES": [2, 3, 5, 7], "LABELS": ["Dual", "Triad", "Pentagram", "Septet"], "DEFAULT": 5 },
    { "NAME": "beamColor", "LABEL": "Beam Color", "TYPE": "color", "DEFAULT": [0.22, 0.95, 0.68, 1.0] },
    { "NAME": "burst", "LABEL": "Flash Ring", "TYPE": "event" }
  ],
  "PASSES": [
    { "TARGET": "trailBuf", "PERSISTENT": true, "FLOAT": true },
    {}
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  float aspect = RENDERSIZE.x / max(1.0, RENDERSIZE.y);

  if (PASSINDEX == 0) {
    vec2 centered = (uv - 0.5) * 0.988 + 0.5;
    vec3 prev = IMG_NORM_PIXEL(trailBuf, clamp(centered, 0.0, 1.0)).rgb * decay;

    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    vec3 emit = vec3(0.0);
    int n = max(1, emitterCount);
    for (int i = 0; i < 7; i++) {
      if (i >= n) break;
      float fi = float(i);
      float a = TIME * (1.1 + 0.17 * fi) + fi * 6.2831853 / float(n);
      vec2 orb = vec2(cos(a), sin(a * 1.3)) * orbitRadius;
      float d = length(p - orb);
      emit += beamColor.rgb * exp(-d * 48.0);
    }
    if (burst) {
      emit += vec3(1.0, 0.85, 0.55) * smoothstep(0.03, 0.0, abs(length(p) - orbitRadius));
    }
    gl_FragColor = vec4(clamp(prev + emit * 0.45, 0.0, 2.0), 1.0);
  } else {
    vec3 hdr = IMG_NORM_PIXEL(trailBuf, uv).rgb;
    vec3 mapped = hdr / (1.0 + hdr * 0.65);
    gl_FragColor = vec4(pow(clamp(mapped, 0.0, 1.0), vec3(0.9)), 1.0);
  }
}`
  },

  arch_scanlines: {
    name: 'Architectural Brutalist Laser Bars (ISF)',
    kind: 'generator',
    code: `/*{
  "DESCRIPTION": "Sharp architectural shutter bars and diagonal laser sweeps for facade projection",
  "CREDIT": "Chaos CathodeRay",
  "ISFVSN": "2",
  "CATEGORIES": ["Generator", "Architectural"],
  "INPUTS": [
    { "NAME": "columns", "LABEL": "Column Divisions", "TYPE": "float", "DEFAULT": 8.0, "MIN": 1.0, "MAX": 32.0 },
    { "NAME": "duty", "LABEL": "Shutter Width", "TYPE": "float", "DEFAULT": 0.28, "MIN": 0.04, "MAX": 0.90 },
    { "NAME": "diagTilt", "LABEL": "Diagonal Shear", "TYPE": "float", "DEFAULT": 0.25, "MIN": -1.0, "MAX": 1.0 },
    { "NAME": "barCol", "LABEL": "Laser Color", "TYPE": "color", "DEFAULT": [1.0, 0.68, 0.24, 1.0] }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  float x = uv.x * round(columns) + uv.y * diagTilt;
  float cellId = floor(x);
  float phase = fract(x - TIME * (mod(cellId, 2.0) == 0.0 ? 0.65 : -0.65));
  float aa = max(fwidth(x), 0.008);
  float bar = smoothstep(0.0, aa, phase) * (1.0 - smoothstep(duty - aa, duty + aa, phase));
  float vFade = 0.35 + 0.65 * sin(uv.y * 3.14159265);
  vec3 col = barCol.rgb * bar * vFade;
  gl_FragColor = vec4(col, 1.0);
}`
  },

  vhs_filter_fx: {
    name: 'FX Filter: Analog Scanline & Tape Warp (ISF FX)',
    kind: 'effect',
    code: `/*{
  "DESCRIPTION": "Custom ISF Filter FX with inputImage — can be loaded directly into any Surface or Master FX Rack!",
  "CREDIT": "Chaos CathodeRay",
  "ISFVSN": "2",
  "CATEGORIES": ["Filter", "Glitch"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "warp", "LABEL": "Tape Jitter", "TYPE": "float", "DEFAULT": 0.018, "MIN": 0.0, "MAX": 0.08 },
    { "NAME": "scanlines", "LABEL": "CRT Scanlines", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "chromaShift", "LABEL": "Color Bleed", "TYPE": "float", "DEFAULT": 0.008, "MIN": 0.0, "MAX": 0.04 }
  ]
}*/

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  float band = floor(uv.y * 42.0 + TIME * 7.0);
  float jitter = (hash11(band) - 0.5) * warp * step(0.72, hash11(band + 19.3));
  vec2 uvr = clamp(uv + vec2(jitter + chromaShift, 0.0), 0.0, 1.0);
  vec2 uvg = clamp(uv + vec2(jitter, 0.0), 0.0, 1.0);
  vec2 uvb = clamp(uv + vec2(jitter - chromaShift, 0.0), 0.0, 1.0);

  float r = IMG_NORM_PIXEL(inputImage, uvr).r;
  vec4 gSample = IMG_NORM_PIXEL(inputImage, uvg);
  float b = IMG_NORM_PIXEL(inputImage, uvb).b;

  float scan = 1.0 - scanlines * (0.5 + 0.5 * sin(uv.y * RENDERSIZE.y * 1.35));
  gl_FragColor = vec4(vec3(r, gSample.g, b) * scan, gSample.a);
}`
  }
};

// ----------------------------------------------------------------------------
// 3. NATIVE ISF v2 PARSER & #version 300 es TRANSPILER
// ----------------------------------------------------------------------------

function sanitizeGlslIdentifier(name) {
  const clean = String(name || 'param').replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[0-9]/.test(clean) ? `_${clean}` : clean;
}

function normalizeIsfInputDef(rawInp, idx) {
  if (!rawInp || typeof rawInp !== 'object') return null;
  const name = sanitizeGlslIdentifier(rawInp.NAME || `input_${idx}`);
  const type = String(rawInp.TYPE || 'float').toLowerCase();
  const label = String(rawInp.LABEL || rawInp.NAME || name);

  if (type === 'image') {
    return { name, label, type: 'image', defaultVal: null };
  }
  if (type === 'bool') {
    return { name, label, type: 'bool', defaultVal: !!rawInp.DEFAULT };
  }
  if (type === 'event') {
    return { name, label, type: 'event', defaultVal: false };
  }
  if (type === 'long') {
    const rawVals = Array.isArray(rawInp.VALUES) && rawInp.VALUES.length > 0
      ? rawInp.VALUES.map(v => Math.round(Number(v) || 0))
      : [0, 1, 2];
    const labels = Array.isArray(rawInp.LABELS) && rawInp.LABELS.length === rawVals.length
      ? rawInp.LABELS.map(String)
      : rawVals.map(String);
    const def = rawInp.DEFAULT !== undefined ? Math.round(Number(rawInp.DEFAULT) || 0) : rawVals[0];
    return { name, label, type: 'long', values: rawVals, labels, defaultVal: def };
  }
  if (type === 'color') {
    const d = Array.isArray(rawInp.DEFAULT) ? rawInp.DEFAULT : [1, 1, 1, 1];
    return {
      name,
      label,
      type: 'color',
      defaultVal: [
        Number(d[0] ?? 1),
        Number(d[1] ?? 1),
        Number(d[2] ?? 1),
        Number(d[3] ?? 1)
      ]
    };
  }
  if (type === 'point2d') {
    const minArr = Array.isArray(rawInp.MIN) ? rawInp.MIN : [0, 0];
    const maxArr = Array.isArray(rawInp.MAX) ? rawInp.MAX : [1, 1];
    const defArr = Array.isArray(rawInp.DEFAULT)
      ? rawInp.DEFAULT
      : [(Number(minArr[0]) + Number(maxArr[0])) * 0.5, (Number(minArr[1]) + Number(maxArr[1])) * 0.5];
    return {
      name,
      label,
      type: 'point2D',
      min: [Number(minArr[0] ?? 0), Number(minArr[1] ?? 0)],
      max: [Number(maxArr[0] ?? 1), Number(maxArr[1] ?? 1)],
      defaultVal: [Number(defArr[0] ?? 0.5), Number(defArr[1] ?? 0.5)]
    };
  }

  // Default: float
  const min = rawInp.MIN !== undefined ? Number(rawInp.MIN) : 0.0;
  const max = rawInp.MAX !== undefined ? Number(rawInp.MAX) : 1.0;
  const def = rawInp.DEFAULT !== undefined ? Number(rawInp.DEFAULT) : (min + max) * 0.5;
  return {
    name,
    label,
    type: 'float',
    min: Number.isFinite(min) ? min : 0.0,
    max: Number.isFinite(max) && max > min ? max : min + 1.0,
    defaultVal: Number.isFinite(def) ? def : min
  };
}

function parseIsfSource(rawText) {
  const src = String(rawText || '');
  const headerRegex = /\/\*(\{[\s\S]*?\})\*\//;
  const match = headerRegex.exec(src);

  let meta = {
    description: '',
    credit: '',
    categories: [],
    inputs: [],
    passes: [{}],
    hasHeader: false,
    headerError: null
  };

  let bodyText = src;
  let bodyStartLine = 1;

  if (match) {
    const prefix = src.slice(0, match.index);
    const matchedFull = match[0];
    const prefixLines = prefix.split('\n').length - 1;
    const headerLines = matchedFull.split('\n').length - 1;
    const afterIdx = match.index + matchedFull.length;

    // Preserve exact line alignment by replacing the /*{...}*/ block with blank lines of identical count!
    const blankHeader = '\n'.repeat(headerLines);
    bodyText = prefix + blankHeader + src.slice(afterIdx);
    bodyStartLine = 1;
    meta.hasHeader = true;

    try {
      // Allow trailing commas in hand-edited ISF JSON headers
      const cleanedJson = match[1].replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(cleanedJson);
      meta.description = String(parsed.DESCRIPTION || '');
      meta.credit = String(parsed.CREDIT || '');
      meta.categories = Array.isArray(parsed.CATEGORIES) ? parsed.CATEGORIES.map(String) : [];

      if (Array.isArray(parsed.INPUTS)) {
        meta.inputs = parsed.INPUTS
          .map((inp, idx) => normalizeIsfInputDef(inp, idx))
          .filter(Boolean);
      }

      if (Array.isArray(parsed.PASSES) && parsed.PASSES.length > 0) {
        meta.passes = parsed.PASSES.map((p, idx) => ({
          target: p && p.TARGET ? sanitizeGlslIdentifier(p.TARGET) : null,
          persistent: !!(p && (p.PERSISTENT || p.persistent)),
          float: !!(p && (p.FLOAT || p.float)),
          widthExpr: p && p.WIDTH ? String(p.WIDTH) : null,
          heightExpr: p && p.HEIGHT ? String(p.HEIGHT) : null,
          passIndex: idx
        }));
      }
    } catch (err) {
      meta.headerError = `ISF JSON Header Error (near line ${prefixLines + 1}): ${err.message}`;
    }
  }

  const isEffect = meta.inputs.some(inp => inp.type === 'image' && inp.name === 'inputImage');
  meta.isEffect = isEffect;
  return { meta, bodyText, bodyStartLine };
}

function transpileIsfToWebGL2(rawText) {
  const { meta, bodyText } = parseIsfSource(rawText);
  if (meta.headerError) {
    return { ok: false, error: meta.headerError, meta, fsSource: '', preambleLines: 0, uniformNames: [] };
  }

  // If the author wrote a raw #version 300 es shader without ISF header, support it cleanly too
  const trimmed = bodyText.trimStart();
  if (!meta.hasHeader && trimmed.startsWith('#version 300 es')) {
    const uniformNames = ['TIME', 'TIMEDELTA', 'RENDERSIZE', 'PASSINDEX', 'FRAMEINDEX', 'uTime', 'uResolution'];
    return {
      ok: true,
      meta,
      fsSource: bodyText,
      preambleLines: 0,
      uniformNames
    };
  }

  // Strip any legacy #version directive in body while keeping line count intact
  const cleanedBody = bodyText
    .replace(/^(\s*)#version\s+[^\n]*/m, '$1// [transpiled #version]')
    .replace(/\bgl_FragColor\b/g, '_wm_FragColor')
    .replace(/\btexture2D\s*\(/g, 'texture(')
    .replace(/\btexture2DRect\s*\(/g, 'texture(');

  const uniformNames = [
    'TIME', 'TIMEDELTA', 'RENDERSIZE', 'PASSINDEX', 'FRAMEINDEX',
    'uTime', 'uResolution'
  ];

  const inputDecls = [];
  const declaredTargets = new Set();

  for (const inp of meta.inputs) {
    uniformNames.push(inp.name);
    if (inp.type === 'float') inputDecls.push(`uniform float ${inp.name};`);
    else if (inp.type === 'bool' || inp.type === 'event') inputDecls.push(`uniform bool ${inp.name};`);
    else if (inp.type === 'long') inputDecls.push(`uniform int ${inp.name};`);
    else if (inp.type === 'color') inputDecls.push(`uniform vec4 ${inp.name};`);
    else if (inp.type === 'point2D') inputDecls.push(`uniform vec2 ${inp.name};`);
    else if (inp.type === 'image') {
      inputDecls.push(`uniform sampler2D ${inp.name};`);
      declaredTargets.add(inp.name);
    }
  }

  for (const pass of meta.passes) {
    if (pass.target && !declaredTargets.has(pass.target)) {
      declaredTargets.add(pass.target);
      uniformNames.push(pass.target);
      inputDecls.push(`uniform sampler2D ${pass.target};`);
    }
  }

  const preambleParts = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'in vec2 vUv;',
    'out vec4 _wm_FragColor;',
    'uniform float TIME;',
    'uniform float TIMEDELTA;',
    'uniform vec2 RENDERSIZE;',
    'uniform int PASSINDEX;',
    'uniform int FRAMEINDEX;',
    'uniform float uTime;',
    'uniform vec2 uResolution;',
    '#define isf_FragNormCoord vUv',
    '#define vv_FragNormCoord vUv',
    'vec2 IMG_SIZE(sampler2D s) { return max(vec2(1.0), vec2(textureSize(s, 0))); }',
    'vec4 IMG_NORM_PIXEL(sampler2D s, vec2 uv) { return texture(s, uv); }',
    'vec4 IMG_PIXEL(sampler2D s, vec2 px) { return texture(s, px / IMG_SIZE(s)); }',
    '#define IMG_THIS_PIXEL(s) texture((s), vUv)',
    '#define IMG_THIS_NORM_PIXEL(s) texture((s), vUv)',
    ...inputDecls,
    '// --- BEGIN USER SHADER BODY ---'
  ];

  const preamble = preambleParts.join('\n') + '\n';
  const preambleLines = preambleParts.length;
  const fsSource = preamble + cleanedBody;

  return {
    ok: true,
    meta,
    fsSource,
    preambleLines,
    uniformNames
  };
}

function formatGlShaderErrorLog(rawLog, preambleLines = 0) {
  if (!rawLog) return 'Unknown GLSL compiler error';
  const lines = String(rawLog).replace(/\0/g, '').trim().split('\n');
  const mapped = lines.map(line => {
    // Match WebGL2 ANGLE / Metal / Mesa format: ERROR: 0:42: '...'
    return line.replace(/(\b(?:ERROR|WARNING):\s*\d+:)(?:(\d+))/gi, (_, prefix, lineNumStr) => {
      const glLine = parseInt(lineNumStr, 10);
      if (!Number.isFinite(glLine)) return `${prefix}${lineNumStr}`;
      const userLine = Math.max(1, glLine - preambleLines);
      return `Line ${userLine}: `;
    });
  });
  return mapped.join('\n');
}

// ----------------------------------------------------------------------------
// 4. VIRTUAL "MIX CIRCLE" BUS ORB SHADER
// ----------------------------------------------------------------------------

const FS_MIXBUS_ORB = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uOrbTex;
uniform int uFlipY;
uniform int uMirrorX;
uniform float uWeight;

void main() {
  vec2 uv = vUv;
  if (uMirrorX == 1) uv.x = 1.0 - uv.x;
  if (uFlipY == 1) uv.y = 1.0 - uv.y;
  vec4 texel = texture(uOrbTex, uv);
  float a = clamp(uWeight * texel.a, 0.0, 1.0);
  fragColor = vec4(texel.rgb * a, a);
}`;

// ----------------------------------------------------------------------------
// 5. STACKABLE GPU POST-FX RACK SHADER & MODULE REGISTRY
//    Supports 8 built-in real-time FX:
//      0: bloom      (Optical Halation / Neon Bloom)
//      1: edgetrace  (Sobel Architectural Edge-Trace)
//      2: kaleido    (Kaleidoscope & Mirror Symmetry)
//      3: pixelate   (LED Matrix / Pixelate SMD Dots)
//      4: chromab    (Radial & Prism Chromatic Aberration)
//      5: glitch     (Digital Slice & RGB Tear Glitch)
//      6: feedback   (Temporal Echo / Feedback Trails)
//      7: strobe     (Theatrical Shutter / Color Strobe)
// ----------------------------------------------------------------------------

const FS_POST_FX = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uInputTex;
uniform sampler2D uHistoryTex;
uniform vec2 uTexSize;
uniform float uTime;
uniform int uFlipY;
uniform int uMirrorX;
uniform int uFxMode;
uniform vec4 uFxParams; // x=p0, y=p1, z=p2, w=p3
uniform vec3 uFxAccent;

vec2 orientUv(vec2 uv) {
  vec2 res = uv;
  if (uMirrorX == 1) res.x = 1.0 - res.x;
  if (uFlipY == 1) res.y = 1.0 - res.y;
  return clamp(res, 0.0, 1.0);
}

vec4 sampleIn(vec2 uv) {
  return texture(uInputTex, orientUv(uv));
}

float hashFx(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 shiftHueFx(vec3 col, float rad) {
  if (abs(rad) < 0.001) return col;
  vec3 k = vec3(0.577350269);
  float c = cos(rad);
  return col * c + cross(k, col) * sin(rad) + k * dot(k, col) * (1.0 - c);
}

void main() {
  vec2 aspectVec = vec2(uTexSize.x / max(1.0, uTexSize.y), 1.0);
  vec2 texelStep = 1.0 / max(vec2(1.0), uTexSize);

  if (uFxMode == 0) {
    // 0: OPTICAL HALATION / NEON BLOOM (threshold, intensity, radius)
    float thresh = uFxParams.x;
    float inten = uFxParams.y;
    float radius = uFxParams.z;
    vec4 base = sampleIn(vUv);

    vec3 glow = vec3(0.0);
    float wSum = 0.0;
    for (int i = 1; i <= 12; i++) {
      float fi = float(i);
      float ang = fi * 2.39996323; // Golden angle
      float rPx = sqrt(fi) * 3.2 * radius;
      vec2 off = vec2(cos(ang), sin(ang)) * rPx * texelStep;
      vec3 s = sampleIn(vUv + off).rgb;
      float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
      float hi = smoothstep(thresh, thresh + 0.35, lum);
      float w = 1.0 / (1.0 + fi * 0.22);
      glow += s * hi * w;
      wSum += w;
    }
    glow /= max(0.001, wSum);
    fragColor = vec4(base.rgb + glow * inten * 2.1, base.a);
    return;
  }

  if (uFxMode == 1) {
    // 1: SOBEL ARCHITECTURAL EDGE-TRACE (strength, mix, accentBlend)
    float strength = uFxParams.x;
    float edgeMix = uFxParams.y;
    float tintMix = uFxParams.z;
    vec4 base = sampleIn(vUv);

    vec3 tl = sampleIn(vUv + vec2(-texelStep.x,  texelStep.y)).rgb;
    vec3 tc = sampleIn(vUv + vec2( 0.0,          texelStep.y)).rgb;
    vec3 tr = sampleIn(vUv + vec2( texelStep.x,  texelStep.y)).rgb;
    vec3 ml = sampleIn(vUv + vec2(-texelStep.x,  0.0)).rgb;
    vec3 mr = sampleIn(vUv + vec2( texelStep.x,  0.0)).rgb;
    vec3 bl = sampleIn(vUv + vec2(-texelStep.x, -texelStep.y)).rgb;
    vec3 bc = sampleIn(vUv + vec2( 0.0,         -texelStep.y)).rgb;
    vec3 br = sampleIn(vUv + vec2( texelStep.x, -texelStep.y)).rgb;

    vec3 gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    vec3 gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
    vec3 mag = sqrt(gx * gx + gy * gy) * strength;
    float edgeLum = clamp(dot(mag, vec3(0.3333)), 0.0, 1.5);
    vec3 edgeCol = mix(mag, uFxAccent * edgeLum * 1.45, tintMix);
    fragColor = vec4(mix(base.rgb, clamp(edgeCol, 0.0, 1.5), edgeMix), base.a);
    return;
  }

  if (uFxMode == 2) {
    // 2: KALEIDOSCOPE & MIRROR SYMMETRY (segments, angleDeg, spin)
    float segs = max(2.0, round(uFxParams.x));
    float baseAng = radians(uFxParams.y) + uTime * uFxParams.z;
    vec2 p = (vUv - 0.5) * aspectVec;
    float r = length(p);
    float a = atan(p.y, p.x) - baseAng;
    float wedge = 6.28318530718 / segs;
    a = mod(a, wedge);
    a = abs(a - wedge * 0.5);
    vec2 kp = vec2(cos(a + baseAng), sin(a + baseAng)) * r / aspectVec + 0.5;
    fragColor = sampleIn(kp);
    return;
  }

  if (uFxMode == 3) {
    // 3: LED MATRIX / PIXELATE SMD DOTS (cells, roundness, gap)
    float cellsY = max(4.0, uFxParams.x);
    float roundness = uFxParams.y;
    float gap = uFxParams.z;
    vec2 gridDim = vec2(round(cellsY * aspectVec.x), round(cellsY));
    vec2 cellUv = (floor(vUv * gridDim) + 0.5) / gridDim;
    vec2 local = (fract(vUv * gridDim) - 0.5) * 2.0;

    float boxD = max(abs(local.x), abs(local.y));
    float circD = length(local);
    float d = mix(boxD, circD, roundness);
    float radius = clamp(1.0 - gap * 0.72, 0.22, 1.05);
    float aa = max(fwidth(d), 0.04);
    float diodeMask = 1.0 - smoothstep(radius - aa, radius + aa, d);

    vec4 col = sampleIn(cellUv);
    fragColor = vec4(col.rgb * diodeMask, col.a);
    return;
  }

  if (uFxMode == 4) {
    // 4: RADIAL & PRISM CHROMATIC ABERRATION (amount, angleDeg, radialMix)
    float amt = uFxParams.x;
    float ang = radians(uFxParams.y);
    float radMix = uFxParams.z;
    vec2 dirFixed = vec2(cos(ang), sin(ang)) / aspectVec;
    vec2 dirRad = (vUv - 0.5);
    vec2 disp = mix(dirFixed * 0.5, dirRad, radMix) * amt;

    float r = sampleIn(vUv + disp).r;
    vec4 g = sampleIn(vUv);
    float b = sampleIn(vUv - disp).b;
    fragColor = vec4(r, g.g, b, g.a);
    return;
  }

  if (uFxMode == 5) {
    // 5: DIGITAL SLICE & RGB TEAR GLITCH (amount, speed, blocks)
    float amt = uFxParams.x;
    float spd = uFxParams.y;
    float blocks = max(4.0, uFxParams.z);
    float tick = floor(uTime * spd * 4.0);
    float band = floor(vUv.y * blocks);
    float n1 = hashFx(vec2(band, tick));
    float gate = step(1.0 - amt * 0.65, n1);
    float shift = (hashFx(vec2(band + 13.7, tick)) - 0.5) * amt * 0.28 * gate;

    vec2 uvMain = vUv + vec2(shift, 0.0);
    float rgbSplit = amt * 0.035 * gate;
    float r = sampleIn(uvMain + vec2(rgbSplit, 0.0)).r;
    vec4 g = sampleIn(uvMain);
    float b = sampleIn(uvMain - vec2(rgbSplit, 0.0)).b;
    vec3 outCol = vec3(r, g.g, b);
    if (gate > 0.5 && hashFx(vec2(tick, band * 3.1)) > 0.88) {
      outCol = 1.0 - clamp(outCol, 0.0, 1.0);
    }
    fragColor = vec4(outCol, g.a);
    return;
  }

  if (uFxMode == 6) {
    // 6: TEMPORAL ECHO / FEEDBACK TRAILS (decay, zoom, hueDrift)
    float decay = clamp(uFxParams.x, 0.0, 0.985);
    float zoom = uFxParams.y;
    float hueDrift = uFxParams.z;
    vec4 cur = sampleIn(vUv);
    vec2 histUv = clamp((vUv - 0.5) * (1.0 - zoom) + 0.5, 0.0, 1.0);
    vec4 prev = texture(uHistoryTex, histUv);
    vec3 drifted = shiftHueFx(prev.rgb, hueDrift) * decay;
    vec3 combined = max(cur.rgb, drifted);
    fragColor = vec4(mix(cur.rgb + drifted * 0.55, combined, 0.65), max(cur.a, prev.a * decay));
    return;
  }

  // 7: THEATRICAL SHUTTER / COLOR STROBE (rateHz, duty, mode: 0=Blackout, 1=White, 2=Invert)
  float rate = max(0.2, uFxParams.x);
  float duty = clamp(uFxParams.y, 0.05, 0.98);
  int sMode = int(round(uFxParams.z));
  vec4 base = sampleIn(vUv);
  float on = fract(uTime * rate) < duty ? 1.0 : 0.0;
  if (sMode == 0) {
    fragColor = vec4(base.rgb * on, base.a);
  } else if (sMode == 1) {
    fragColor = vec4(mix(base.rgb, vec3(1.0), 1.0 - on), base.a);
  } else {
    fragColor = vec4(mix(1.0 - clamp(base.rgb, 0.0, 1.0), base.rgb, on), base.a);
  }
}`;

const FX_REGISTRY = {
  bloom: {
    type: 'bloom',
    code: 0,
    name: 'Optical Halation / Bloom',
    params: [
      { key: 'threshold', label: 'Threshold', min: 0.0, max: 0.95, step: 0.01, defaultVal: 0.42, fmt: v => `${Math.round(v * 100)}%` },
      { key: 'intensity', label: 'Intensity', min: 0.0, max: 2.5, step: 0.02, defaultVal: 0.85, fmt: v => v.toFixed(2) },
      { key: 'radius', label: 'Spread', min: 0.2, max: 4.0, step: 0.05, defaultVal: 1.25, fmt: v => `${v.toFixed(2)}×` }
    ]
  },
  edgetrace: {
    type: 'edgetrace',
    code: 1,
    name: 'Sobel Edge-Trace',
    params: [
      { key: 'strength', label: 'Edge Gain', min: 0.2, max: 4.0, step: 0.05, defaultVal: 1.60, fmt: v => `${v.toFixed(2)}×` },
      { key: 'mix', label: 'Dry / Wet', min: 0.0, max: 1.0, step: 0.01, defaultVal: 0.85, fmt: v => `${Math.round(v * 100)}%` },
      { key: 'tint', label: 'Accent Tint', min: 0.0, max: 1.0, step: 0.02, defaultVal: 0.40, fmt: v => `${Math.round(v * 100)}%` }
    ]
  },
  kaleido: {
    type: 'kaleido',
    code: 2,
    name: 'Kaleidoscope Mirror',
    params: [
      { key: 'segments', label: 'Segments', min: 2, max: 16, step: 1, defaultVal: 6, fmt: v => `${Math.round(v)}x` },
      { key: 'angle', label: 'Axis Angle', min: -180, max: 180, step: 1, defaultVal: 0, fmt: v => `${Math.round(v)}°` },
      { key: 'spin', label: 'Auto Spin', min: -2.0, max: 2.0, step: 0.02, defaultVal: 0.15, fmt: v => `${v.toFixed(2)}` }
    ]
  },
  pixelate: {
    type: 'pixelate',
    code: 3,
    name: 'LED Matrix / Pixelate',
    params: [
      { key: 'cells', label: 'Pitch Rows', min: 8, max: 200, step: 1, defaultVal: 42, fmt: v => `${Math.round(v)}px` },
      { key: 'roundness', label: 'SMD Diode', min: 0.0, max: 1.0, step: 0.02, defaultVal: 0.75, fmt: v => `${Math.round(v * 100)}%` },
      { key: 'gap', label: 'Bezel Gap', min: 0.0, max: 0.65, step: 0.01, defaultVal: 0.20, fmt: v => `${Math.round(v * 100)}%` }
    ]
  },
  chromab: {
    type: 'chromab',
    code: 4,
    name: 'Chromatic Aberration',
    params: [
      { key: 'amount', label: 'Dispersion', min: 0.0, max: 0.08, step: 0.001, defaultVal: 0.020, fmt: v => `${(v * 100).toFixed(1)}%` },
      { key: 'angle', label: 'Prism Angle', min: -180, max: 180, step: 1, defaultVal: 0, fmt: v => `${Math.round(v)}°` },
      { key: 'radial', label: 'Radial Mix', min: 0.0, max: 1.0, step: 0.02, defaultVal: 0.80, fmt: v => `${Math.round(v * 100)}%` }
    ]
  },
  glitch: {
    type: 'glitch',
    code: 5,
    name: 'Digital Slice Glitch',
    params: [
      { key: 'amount', label: 'Glitch Amt', min: 0.0, max: 1.0, step: 0.01, defaultVal: 0.35, fmt: v => `${Math.round(v * 100)}%` },
      { key: 'speed', label: 'Burst Rate', min: 0.5, max: 12.0, step: 0.1, defaultVal: 4.0, fmt: v => `${v.toFixed(1)}Hz` },
      { key: 'blocks', label: 'Scan Bands', min: 4, max: 48, step: 1, defaultVal: 16, fmt: v => `${Math.round(v)}` }
    ]
  },
  feedback: {
    type: 'feedback',
    code: 6,
    name: 'Temporal Echo Trails',
    params: [
      { key: 'decay', label: 'Trail Decay', min: 0.0, max: 0.97, step: 0.01, defaultVal: 0.84, fmt: v => `${Math.round(v * 100)}%` },
      { key: 'zoom', label: 'Tunnel Zoom', min: -0.05, max: 0.05, step: 0.002, defaultVal: 0.012, fmt: v => `${(v * 100).toFixed(1)}%` },
      { key: 'hueDrift', label: 'Hue Drift', min: -0.25, max: 0.25, step: 0.005, defaultVal: 0.02, fmt: v => v.toFixed(3) }
    ]
  },
  strobe: {
    type: 'strobe',
    code: 7,
    name: 'Theatrical Strobe',
    params: [
      { key: 'rateHz', label: 'Rate (Hz)', min: 0.5, max: 24.0, step: 0.2, defaultVal: 6.0, fmt: v => `${v.toFixed(1)}Hz` },
      { key: 'duty', label: 'Duty Cycle', min: 0.05, max: 0.95, step: 0.02, defaultVal: 0.50, fmt: v => `${Math.round(v * 100)}%` },
      { key: 'mode', label: 'Flash Mode', min: 0, max: 2, step: 1, defaultVal: 0, fmt: v => (['Shutter', 'White', 'Invert'][Math.round(v)] || 'Shutter') }
    ]
  }
};
