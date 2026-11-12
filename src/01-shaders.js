// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 01-shaders.js — WebGL2 GLSL ES 3.00 Shaders (Phases 1–4)
//   - Procedural Generators (Voronoi Shards, Cosmic Cloud, Test Card, Laser)
//   - Euclidean Signed-Distance N-Point Polygon Mask Shader (FS_MASK_POLYGON)
//   - Homography/Triangle/Circle + Forward Curved Mesh Surface Shaders
//   - Interactive Cosmic Cloud Followspot Layer & Reveal Mask Shader
//   - Dual-FBO Optical Cue Crossfade & Master Output Shader
// ============================================================================

const FULLSCREEN_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 pos = vec2(
    float((gl_VertexID & 1) << 2) - 1.0,
    float((gl_VertexID & 2) << 1) - 1.0
  );
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const SURFACE_VS = `#version 300 es
precision highp float;
uniform vec4 uBounds; // minX, minY, maxX, maxY in Stage [0..1]
out vec2 vStageUv;
out vec3 vMeshUvQ;
void main() {
  vec2 corner = vec2(
    float(gl_VertexID & 1),
    float((gl_VertexID >> 1) & 1)
  );
  vStageUv = mix(uBounds.xy, uBounds.zw, corner);
  vMeshUvQ = vec3(corner, 1.0);
  gl_Position = vec4(vStageUv * 2.0 - 1.0, 0.0, 1.0);
}`;

// Forward-Tessellated Perspective-Correct Curved Spline / Bezier Mesh Vertex Shader
const MESH_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aStagePos; // Stage [0..1]
layout(location = 1) in vec3 aUvQ;      // (u * invW, v * invW, invW) for projective foreshortening
out vec2 vStageUv;
out vec3 vMeshUvQ;
void main() {
  vStageUv = aStagePos;
  vMeshUvQ = aUvQ;
  gl_Position = vec4(aStagePos * 2.0 - 1.0, 0.0, 1.0);
}`;

const SHADER_COMMON = `
#define PI 3.14159265359
#define TAU 6.28318530718

vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec3 a = hash32(i + vec2(0.0, 0.0));
  vec3 b = hash32(i + vec2(1.0, 0.0));
  vec3 c = hash32(i + vec2(0.0, 1.0));
  vec3 d = hash32(i + vec2(1.0, 1.0));
  return mix(mix(a.x, b.x, u.x), mix(c.x, d.x, u.x), u.y);
}

float fbmCosmic(vec2 p) {
  float v = 0.0;
  float amp = 0.52;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += amp * noise2D(p);
    p = rot * p * 2.07 + vec2(17.3, 9.2);
    amp *= 0.5;
  }
  return v;
}

vec3 evalThemeTriad(int mode, float t, float facetHash, float shift) {
  float k = clamp(t, 0.0, 1.0);
  float warmDrive = clamp(-shift, 0.0, 1.0);
  float coldDrive = clamp(shift, 0.0, 1.0);

  vec3 warmCol = mix(vec3(1.0, 0.28, 0.02), mix(vec3(1.0, 0.72, 0.36), vec3(1.0, 0.48, 0.08), warmDrive), smoothstep(0.0, 0.55, k));
  warmCol = mix(warmCol, mix(vec3(1.0, 0.94, 0.84), vec3(1.0, 0.64, 0.16), warmDrive), smoothstep(0.45, 1.0, k));

  vec3 coldCol = mix(vec3(0.06, 0.44, 1.0), mix(vec3(0.58, 0.84, 1.0), vec3(0.18, 0.64, 1.0), coldDrive), smoothstep(0.0, 0.52, k));
  coldCol = mix(coldCol, mix(vec3(0.92, 0.97, 1.0), vec3(0.36, 0.78, 1.0), coldDrive), smoothstep(0.45, 1.0, k));

  vec3 cA = vec3(1.0, 0.30, 0.10);
  vec3 cB = vec3(1.0, 0.62, 0.37);
  vec3 cC = vec3(1.0, 0.94, 0.84);
  if (mode == 3) {
    cA = vec3(1.0, 0.53, 0.0);
    cB = vec3(0.0, 0.96, 0.83);
    cC = vec3(0.88, 0.99, 1.0);
  } else if (mode == 4) {
    cA = vec3(1.0, 0.08, 0.33);
    cB = vec3(0.48, 0.17, 0.75);
    cC = vec3(0.85, 0.95, 1.0);
  }

  vec3 col;
  if (mode == 0) {
    float wb = clamp(shift * 0.5 + 0.5 + (facetHash - 0.5) * 0.28 * (1.0 - abs(shift) * 0.7), 0.0, 1.0);
    col = mix(warmCol, coldCol, smoothstep(0.05, 0.95, wb));
  } else if (mode == 2) {
    vec3 spectral = 0.5 + 0.5 * cos(TAU * (k * 0.85 + facetHash * 0.65 + shift * 0.55 + vec3(0.0, 0.33, 0.67)));
    col = mix(spectral, vec3(1.0), smoothstep(0.65, 1.0, k) * 0.42);
  } else {
    float sk = clamp(k + shift * 0.22, 0.0, 1.0);
    col = mix(cA, cB, smoothstep(0.08, 0.72, facetHash * 0.5 + sk * 0.55));
    col = mix(col, cC, smoothstep(0.5, 1.0, sk * 0.85 + facetHash * 0.2) * 0.8);
  }

  if (mode != 0 && abs(shift) > 0.01) {
    if (shift < 0.0) col = mix(col, col * vec3(1.15, 0.68, 0.28) + warmCol * 0.45, warmDrive * 0.8);
    else col = mix(col, col * vec3(0.45, 0.85, 1.2) + coldCol * 0.45, coldDrive * 0.8);
  }
  return col;
}`;

const FS_SHARDS = `#version 300 es
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

vec4 evalShard(vec2 p, float scale, float aggression, float time) {
  float stretch = 1.9 * mix(1.0, 2.1, clamp(aggression * 0.65, 0.0, 1.3));
  vec2 q = p * scale;
  q.x *= stretch;
  q.y += q.x * 0.38 * aggression;
  vec2 curl = vec2(noise2D(q * 0.28 + vec2(time * 0.35, 0.0)) - 0.5, noise2D(q * 0.28 + vec2(0.0, -time * 0.35) + 19.3) - 0.5);
  q += curl * 0.95;

  vec2 ip = floor(q);
  vec2 fp = fract(q);
  float d1 = 8.0, d2 = 8.0, d3 = 8.0;
  vec2 bestOff = vec2(0.0);
  vec3 bestRnd = vec3(0.0);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 nb = vec2(float(x), float(y));
      vec3 rnd = hash32(ip + nb);
      float ang = rnd.x * TAU + time * mix(0.25, 1.45, rnd.y) * (rnd.z > 0.5 ? 1.0 : -1.0);
      vec2 jit = 0.5 + 0.44 * sin(ang + vec2(0.0, 1.5708));
      vec2 diff = nb + jit - fp;
      vec2 rDiff = rot2(rnd.x * PI + time * 0.25 * (rnd.y - 0.5)) * diff;

      float hexM = max(abs(rDiff.x) * 0.866025 + rDiff.y * 0.5, max(abs(rDiff.x) * 0.866025 - rDiff.y * 0.5, abs(rDiff.y)));
      float pinchExp = mix(1.0, 0.54, clamp((aggression - 0.25) * 0.65, 0.0, 1.0));
      vec2 pinched = pow(abs(rDiff) + 0.0001, vec2(pinchExp));
      float dagger = max(pinched.x * mix(1.4, 3.4, rnd.x * clamp(aggression, 0.0, 1.5)) + rDiff.y * 0.82, -rDiff.y * mix(1.2, 2.2, rnd.z) + pinched.x * 0.35);
      float metric = mix(hexM, dagger, clamp(aggression * 0.72, 0.0, 1.0));
      float dist = mix(length(diff), metric, clamp(0.28 + aggression * 0.62, 0.0, 1.0)) * mix(0.45, 1.65, rnd.z);

      if (dist < d1) { d3 = d2; d2 = d1; d1 = dist; bestOff = diff; bestRnd = rnd; }
      else if (dist < d2) { d3 = d2; d2 = dist; }
      else if (dist < d3) { d3 = dist; }
    }
  }

  float edgeDist = d2 - d1;
  float slash = abs(dot(bestOff, rot2(bestRnd.z * TAU) * vec2(1.0, 0.0)));
  if (bestRnd.y > 0.45) edgeDist = min(edgeDist, slash * 0.85);
  float spark = exp(-max(0.0, d3 - d1) * 28.0) * clamp(aggression * 0.85, 0.0, 1.5);
  float tilt = bestRnd.x * TAU + time * (bestRnd.y - 0.5) * 1.4;
  vec2 norm = vec2(cos(tilt), sin(tilt)) * mix(0.3, 0.95, bestRnd.z) + bestOff * 0.6;
  float ndotl = max(0.0, dot(normalize(vec3(norm, 0.45)), normalize(vec3(-p + 0.001, 0.8))));
  float glint = pow(max(0.0, sin(tilt * 2.0 + dot(bestOff, vec2(5.0, -4.0)))), 18.0);
  float energy = pow(ndotl, 2.2) * 0.9 + glint * 1.3 + spark * 1.2;
  return vec4(edgeDist, energy, bestRnd.x, glint);
}

void main() {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float baseScale = 4.6 / max(0.12, uScale);

  vec3 total = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float w = i == 0 ? 1.0 : (i == 1 ? 0.62 : 0.36);
    float sc = baseScale * (i == 0 ? 0.82 : (i == 1 ? 1.95 : 3.9));
    mat2 rm = rot2(0.24 - 0.72 * fi + uTime * 0.03 * (fi - 1.0));
    vec2 lp = rm * p + vec2(0.14 + 0.06 * fi, -0.08 + 0.04 * fi) * uTime;
    vec4 sh = evalShard(lp, sc, uDetail, uTime * (0.82 + 0.3 * fi));

    float rimW = mix(0.015, 0.006, clamp(uDetail * 0.5, 0.0, 1.0));
    float rim = smoothstep(rimW, 0.0, sh.x);
    float bevel = exp(-sh.x * 20.0);
    float body = smoothstep(0.002, 0.03, sh.x);
    vec3 c = evalThemeTriad(uPalette, sh.y, sh.z, uTemp);
    total += (c * (bevel * 0.68 + sh.y * body * 0.82) + rim * mix(c, vec3(1.0), 0.6) * 1.45) * w;
  }

  vec3 x = max(vec3(0.0001), pow(max(vec3(0.0001), total / 0.38), vec3(1.22)) * 0.38);
  vec3 mapped = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.15)), 1.0);
}`;

const FS_CLOUD = `#version 300 es
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
  float sc = 2.8 / max(0.15, uScale);
  vec2 uv = p * sc;

  float turb = clamp(uDetail * 0.65, 0.05, 1.5);
  float swirl = (noise2D(uv * 0.45 + vec2(uTime * 0.22, -uTime * 0.18)) - 0.5) * turb * 2.1;
  uv = rot2(swirl) * uv;

  vec2 q = vec2(
    fbmCosmic(uv + vec2(0.0, uTime * 0.30)),
    fbmCosmic(uv + vec2(5.2, 1.3) - vec2(uTime * 0.25, 0.0))
  );
  vec2 r = vec2(
    fbmCosmic(uv + (0.7 + turb * 2.1) * q + vec2(1.7, 9.2) + uTime * 0.20),
    fbmCosmic(uv + (0.7 + turb * 2.1) * q + vec2(8.3, 2.8) - uTime * 0.26)
  );

  float smoke = fbmCosmic(uv + (0.8 + turb * 2.0) * r);
  float ridge = 1.0 - abs(fbmCosmic(uv * 1.8 + q * 2.2 - uTime * 0.32) * 2.0 - 1.0);
  float field = mix(smoke, pow(clamp(ridge, 0.0, 1.0), 1.65) * 0.8 + smoke * 0.45, clamp(uDetail * 0.45, 0.0, 1.0));

  float wisps = pow(clamp(field * 1.42 - 0.08, 0.0, 1.0), 1.55);
  float veins = pow(max(0.0, 1.0 - abs(smoke - 0.52) * 3.9), 2.3) * 0.9;

  vec3 colA = evalThemeTriad(uPalette, clamp(field * 0.78 + 0.08, 0.04, 0.92), q.x, uTemp);
  vec3 colB = evalThemeTriad(uPalette, clamp(r.y * 0.72 + 0.14, 0.08, 0.95), r.x, uTemp);
  vec3 neb = mix(colA, colB, smoothstep(0.18, 0.82, length(q)));

  vec2 dustCell = floor(uv * 5.5 + q * 2.8);
  vec3 dr = hash32(dustCell);
  float spark = pow(max(0.0, sin(uTime * (2.0 + dr.x * 4.0) + dr.y * TAU)), 16.0) * dr.z;

  float radialVignette = smoothstep(1.35, 0.12, length(p));
  vec3 col = (neb * (0.22 + wisps * 1.28 + veins * 0.95) + vec3(1.0, 0.97, 0.92) * spark * 0.5) * (0.35 + 0.75 * radialVignette);
  vec3 mapped = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.15)), 1.0);
}`;

const FS_TESTCARD = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform float uTemp;
${SHADER_COMMON}

void main() {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  float cells = round(mix(8.0, 24.0, clamp(uScale * 0.5, 0.0, 1.0)));
  vec2 gUv = vec2(vUv.x * cells * aspect, vUv.y * cells);

  vec2 checker = floor(gUv);
  float ch = mod(checker.x + checker.y, 2.0);
  vec3 bg = mix(vec3(0.05, 0.07, 0.11), vec3(0.11, 0.15, 0.22), ch);

  vec2 f = abs(fract(gUv - 0.5) - 0.5) / fwidth(gUv);
  float minorLine = 1.0 - min(min(f.x, f.y), 1.0);

  vec2 fMaj = abs(fract(gUv * 0.25 - 0.5) - 0.5) / fwidth(gUv * 0.25);
  float majorLine = 1.0 - min(min(fMaj.x, fMaj.y), 1.0);

  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float r = length(p);
  float ring1 = smoothstep(0.006, 0.0, abs(r - 0.42));
  float ring2 = smoothstep(0.005, 0.0, abs(r - 0.22));
  float diag1 = smoothstep(0.004, 0.0, abs(vUv.x - vUv.y));
  float diag2 = smoothstep(0.004, 0.0, abs(vUv.x - (1.0 - vUv.y)));
  float axes = smoothstep(0.004, 0.0, min(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));

  vec2 bDist = min(vUv, 1.0 - vUv) / fwidth(vUv);
  float border = 1.0 - min(min(bDist.x, bDist.y) * 0.25, 1.0);
  float scanPos = fract(uTime * 0.22);
  float scan = exp(-abs(vUv.x - scanPos) * 55.0);

  vec3 col = bg;
  col = mix(col, vec3(0.24, 0.36, 0.52), minorLine * 0.65);
  col = mix(col, vec3(0.45, 0.85, 1.0), majorLine * 0.9);
  col = mix(col, vec3(1.0, 0.78, 0.36), max(ring1, ring2));
  col = mix(col, vec3(0.25, 0.92, 0.62), (diag1 + diag2) * 0.55);
  col = mix(col, vec3(1.0, 0.34, 0.46), axes * 0.9);
  col += vec3(0.45, 0.88, 1.0) * scan * 0.65;

  if (vUv.y < 0.09 && vUv.y > 0.02 && vUv.x > 0.15 && vUv.x < 0.85) {
    float idx = floor(((vUv.x - 0.15) / 0.70) * 7.0);
    col = idx < 1.0 ? vec3(0.95) :
          idx < 2.0 ? vec3(0.95, 0.90, 0.15) :
          idx < 3.0 ? vec3(0.15, 0.92, 0.95) :
          idx < 4.0 ? vec3(0.18, 0.92, 0.35) :
          idx < 5.0 ? vec3(0.95, 0.20, 0.85) :
          idx < 6.0 ? vec3(0.95, 0.18, 0.22) : vec3(0.18, 0.32, 0.98);
  }

  col = mix(col, vec3(1.0, 0.82, 0.38), border);
  if (abs(uTemp) > 0.01) {
    col *= uTemp < 0.0 ? mix(vec3(1.0), vec3(1.12, 0.88, 0.68), -uTemp) : mix(vec3(1.0), vec3(0.75, 0.92, 1.15), uTemp);
  }
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const FS_LASER = `#version 300 es
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
  float freq = mix(4.0, 18.0, clamp(uScale * 0.5, 0.0, 1.0));

  vec3 col = vec3(0.01, 0.015, 0.025);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 rp = rot2(fi * 1.0471975 + uTime * 0.08 * (fi - 1.0)) * p;
    float wave = rp.y * freq + sin(rp.x * (2.5 + uDetail * 2.0) + uTime * (1.2 + fi * 0.4)) * (0.25 + uDetail * 0.45);
    float d = abs(fract(wave + uTime * (0.35 + 0.18 * fi)) - 0.5);
    float beam = exp(-d * mix(28.0, 65.0, clamp(uDetail * 0.5, 0.0, 1.0)));
    float core = smoothstep(0.035, 0.0, d);
    vec3 c = evalThemeTriad(uPalette, 0.35 + 0.3 * fi, fract(floor(wave) * 0.37), uTemp);
    col += c * beam * 0.85 + mix(c, vec3(1.0), 0.7) * core * 0.9;
  }
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ============================================================================
// MILESTONE 7C: VIDEO-AS-LIGHT THEATRICAL MOVING-HEAD GOBO / PRISM ENGINE
// Synthesizes 7 theatrical ellipsoidal / moving-head gobo patterns, optical
// focus/frost diffusion, volumetric haze cone, and Kelvin/dichroic color wheel
// ============================================================================
const FS_VIDEOLIGHT = `#version 300 es
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

float evalGoboWheel(vec2 gp, float wheelPos, float frost, float spin) {
  vec2 rp = rot2(spin) * gp;
  float r = length(rp);
  float ang = atan(rp.y, rp.x);
  float soft = mix(0.012, 0.22, frost);

  // Wheel slot index [0..6] driven smoothly by uScale [0.2..3.0]
  float slot = clamp((wheelPos - 0.25) * 2.55, 0.0, 6.0);
  int idxA = int(floor(slot));
  int idxB = min(6, idxA + 1);
  float fSlot = fract(slot);

  float pat[7];
  // 0: Open Ellipsoidal Hot-Center Beam
  pat[0] = 1.0 - smoothstep(0.62 - soft * 0.5, 0.92 + soft, r);

  // 1: Architectural Venetian Slats
  float slats = abs(fract(rp.y * 5.5 + 0.25) - 0.5);
  pat[1] = (1.0 - smoothstep(0.20, 0.24 + soft * 0.85, slats)) * (1.0 - smoothstep(0.70, 0.95 + soft, r));

  // 2: Radial Sunburst Spokes (8-blade theatrical breakup)
  float spokes = abs(sin(ang * 8.0));
  float hubHole = smoothstep(0.10, 0.16 + soft * 0.4, r);
  pat[2] = (1.0 - smoothstep(0.36, 0.46 + soft * 1.1, spokes)) * hubHole * (1.0 - smoothstep(0.74, 0.96 + soft, r));

  // 3: Organic Foliage / Dappled Canopy Breakup
  float canopy = fbmCosmic(rp * 3.6 + vec2(2.4, -1.7));
  pat[3] = smoothstep(0.43 - soft * 0.45, 0.54 + soft * 0.65, canopy) * (1.0 - smoothstep(0.72, 0.96 + soft, r));

  // 4: Concert Truss / Industrial Window Grid
  vec2 gridCell = abs(fract(rp * 3.2 + 0.5) - 0.5);
  float mullions = min(gridCell.x, gridCell.y);
  pat[4] = smoothstep(0.06, 0.085 + soft * 0.6, mullions) * (1.0 - smoothstep(0.76, 0.96 + soft, max(abs(rp.x), abs(rp.y))));

  // 5: 3-Facet Rotating Prism Split
  float p3 = 0.0;
  for (int k = 0; k < 3; k++) {
    float a3 = float(k) * (TAU / 3.0) + spin * 0.65;
    vec2 c3 = vec2(cos(a3), sin(a3)) * 0.34;
    float d3 = length(gp - c3);
    float ring3 = 1.0 - smoothstep(0.24 - soft * 0.3, 0.36 + soft * 0.8, d3);
    p3 = max(p3, ring3);
  }
  pat[5] = p3;

  // 6: 5-Facet Arena Starburst Prism + Concentric Dichroic Ring
  float p5 = 0.0;
  for (int k = 0; k < 5; k++) {
    float a5 = float(k) * (TAU / 5.0) - spin * 0.5;
    vec2 c5 = vec2(cos(a5), sin(a5)) * 0.42;
    float d5 = length(gp - c5);
    p5 = max(p5, 1.0 - smoothstep(0.16 - soft * 0.25, 0.28 + soft * 0.75, d5));
  }
  float centerPip = 1.0 - smoothstep(0.12, 0.22 + soft * 0.5, length(gp));
  pat[6] = clamp(max(p5, centerPip), 0.0, 1.0);

  float valA = pat[0];
  float valB = pat[0];
  for (int i = 0; i < 7; i++) {
    if (i == idxA) valA = pat[i];
    if (i == idxB) valB = pat[i];
  }
  return mix(valA, valB, smoothstep(0.15, 0.85, fSlot));
}

void main() {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) * 1.85;
  float frost = clamp(uDetail, 0.0, 1.0);
  float spin = uTime * 0.55;

  float gobo = evalGoboWheel(p, uScale, frost, spin);
  float rad = length(p);
  float hotSpot = exp(-rad * rad * mix(1.35, 0.75, frost));

  // Subtle chromatic halation at optical lens gate edge
  float goboR = evalGoboWheel(p * 0.988, uScale, frost, spin);
  float goboB = evalGoboWheel(p * 1.012, uScale, frost, spin);

  // Volumetric theatrical haze drift across beam
  float haze = 0.84 + 0.30 * fbmCosmic(p * 1.9 + vec2(uTime * 0.18, -uTime * 0.11));

  vec3 baseTint = evalThemeTriad(uPalette, clamp(0.62 + 0.35 * hotSpot, 0.0, 1.0), clamp(rad * 0.65, 0.0, 1.0), uTemp);
  // Blend toward crisp tungsten/arc-lamp white core in Default/Warm palettes when hot
  vec3 arcCore = mix(baseTint, vec3(1.0, 0.98, 0.94), hotSpot * 0.62);

  vec3 beam = vec3(
    arcCore.r * goboR,
    arcCore.g * gobo,
    arcCore.b * goboB
  ) * (0.45 + 0.85 * hotSpot) * haze;

  fragColor = vec4(clamp(beam, 0.0, 1.0), 1.0);
}`;

// ============================================================================
// PHASE 3.1: EXACT 2D SIGNED-DISTANCE CONCAVE/CONVEX POLYGON MASK SHADER
// Supports up to 32 vertices with smooth inward/outward edge feathering
// ============================================================================
const FS_MASK_POLYGON = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec2 uPts[128];
uniform int uCount;
uniform float uAspect;
uniform float uFeather;
uniform float uChoke;
uniform float uStrength;
uniform int uInvert;

float sdPolygon(vec2 p) {
  vec2 pA = vec2(p.x * uAspect, p.y);
  vec2 v0 = vec2(uPts[0].x * uAspect, uPts[0].y);
  float d = dot(pA - v0, pA - v0);
  float s = 1.0;

  for (int i = 0; i < 128; i++) {
    if (i >= uCount) break;
    int j = (i == 0) ? (uCount - 1) : (i - 1);
    vec2 vi = vec2(uPts[i].x * uAspect, uPts[i].y);
    vec2 vj = vec2(uPts[j].x * uAspect, uPts[j].y);

    vec2 e = vj - vi;
    vec2 w = pA - vi;
    float denom = max(1e-7, dot(e, e));
    vec2 b = w - e * clamp(dot(w, e) / denom, 0.0, 1.0);
    d = min(d, dot(b, b));

    bvec3 cond = bvec3(pA.y >= vi.y, pA.y < vj.y, e.x * w.y > e.y * w.x);
    if (all(cond) || all(not(cond))) s *= -1.0;
  }
  return s * sqrt(d);
}

void main() {
  if (uCount < 3) {
    fragColor = vec4(0.0);
    return;
  }
  // uChoke > 0 expands mask coverage outward; uChoke < 0 chokes/shrinks inward
  float sd = sdPolygon(vUv) - uChoke;
  float aa = max(fwidth(sd), 0.0012);
  float fw = max(aa, uFeather);
  // Coverage = 1.0 inside polygon, smoothly feathers to 0.0 across boundary
  float cov = 1.0 - smoothstep(-fw, aa, sd);
  if (uInvert == 1) cov = 1.0 - cov;
  float alpha = clamp(cov * uStrength, 0.0, 1.0);
  fragColor = vec4(alpha, alpha, alpha, alpha);
}`;

// ============================================================================
// MULTI-SURFACE & CURVED MESH STAGE COMPOSITOR FRAGMENT SHADER
// Supports:
//   uSurfType == 0 : Quad (Mat3 Homography OR Bilinear)
//   uSurfType == 1 : Triangle (Barycentric)
//   uSurfType == 2 : Circle / Ellipse (Radial Iris + Inner Ring)
//   uSurfType == 3 : Forward-Tessellated Curved Spline / Bezier Mesh (uses vMeshUv!)
// Plus Master Stage Mask + Per-Surface Mask sampling!
// ============================================================================
const FS_SURFACE_COMPOSITOR = `#version 300 es
precision highp float;

in vec2 vStageUv;
in vec3 vMeshUvQ;
out vec4 fragColor;

uniform sampler2D uSourceTex;
uniform sampler2D uStageMaskTex;
uniform sampler2D uSurfMaskTex;
uniform sampler2D uBackdropTex;
uniform int uUseStageMask;
uniform int uUseSurfMask;
uniform int uUseBackdropBlend;

uniform int uFlipSourceY;
uniform int uMirrorSourceX;
uniform float uSourceAspect;

uniform int uSurfType;     // 0=Quad, 1=Triangle, 2=Circle/Arc, 3=Curved Mesh, 4=N-Gon Polygon, 5=Arch Line/Border
uniform int uQuadWarpMode; // 0=Perspective Mat3, 1=Inverse Bilinear
uniform mat3 uInvHomography;
uniform vec2 uQuadPts[4];
uniform vec2 uTriPts[3];
uniform vec2 uTriUvs[3];
uniform vec2 uPolyPts[48];
uniform int uPolyCount;
uniform float uStageAspect;

uniform vec2 uUvPos;
uniform vec2 uUvScale;
uniform float uUvRotRad;
uniform vec4 uUvCrop;

uniform float uCircleSoftness;
uniform float uCircleInner;
uniform vec2 uCircleAngles; // x=startDeg, y=sweepDeg (1..360)

uniform vec4 uLineParams;   // x=glow(0..1), y=speed, z=duty(0.05..1), w=count(1..16)
uniform int uLineChaseMode; // 0=solid, 1=chase, 2=dual, 3=boomerang, 4=dash, 5=pulse
uniform int uLineUseSource; // 0=neon accent, 1=media/shader texture
uniform float uTime;

uniform float uOpacity;
uniform float uFeather;
uniform vec4 uFeatherEdges; // x=Left, y=Right, z=Top, w=Bottom
uniform float uBlendGamma;  // 1.0..2.8 optical projector overlap gamma
uniform float uBlackLevel;  // 0.0..0.15 projector black-level uplift
uniform int uBlendMode;
uniform int uKeyMode;       // 0=off, 1=luma, 2=chroma
uniform vec3 uKeyColor;
uniform vec4 uKeyParams;    // x=thresh/tol, y=softness, z=spill, w=invert
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uColorTemp;
uniform float uGamma;
uniform float uHueShiftRad;
uniform vec4 uTint;         // rgb=tintCol, a=tintAmt
uniform int uInvertRgb;
uniform int uChannelMode;   // 0=rgb, 1=bgr, 2=rrr, 3=ggg, 4=bbb, 5=luma
uniform int uShowCalGrid;
uniform vec3 uAccentColor;
uniform vec4 uShutterInsert; // x=Left, y=Right, z=Top, w=Bottom [0..0.85]
uniform vec4 uShutterAngle;  // x=angL, y=angR, z=angT, w=angB (radians)
uniform float uShutterSoft;  // Optical framing blade frost/focus [0..0.25]

vec2 inverseBilinear(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d, out bool valid) {
  vec2 e = b - a;
  vec2 f = d - a;
  vec2 g = a - b + c - d;
  vec2 h = p - a;

  float k2 = g.x * f.y - g.y * f.x;
  float k1 = e.x * f.y - e.y * f.x + h.x * g.y - h.y * g.x;
  float k0 = h.x * e.y - h.y * e.x;

  if (abs(k2) < 0.00005) {
    if (abs(k1) < 0.00001) { valid = false; return vec2(0.0); }
    float v = -k0 / k1;
    vec2 denom = e + g * v;
    float u = abs(denom.x) > abs(denom.y) ? (h.x - f.x * v) / denom.x : (h.y - f.y * v) / denom.y;
    valid = true;
    return vec2(u, v);
  }

  float disc = k1 * k1 - 4.0 * k0 * k2;
  if (disc < 0.0) { valid = false; return vec2(0.0); }
  float s = sqrt(disc);
  float v1 = (-k1 - s) / (2.0 * k2);
  float v2 = (-k1 + s) / (2.0 * k2);

  vec2 den1 = e + g * v1;
  float u1 = abs(den1.x) > abs(den1.y) ? (h.x - f.x * v1) / den1.x : (h.y - f.y * v1) / den1.y;
  vec2 den2 = e + g * v2;
  float u2 = abs(den2.x) > abs(den2.y) ? (h.x - f.x * v2) / den2.x : (h.y - f.y * v2) / den2.y;

  bool in1 = (u1 >= -0.05 && u1 <= 1.05 && v1 >= -0.05 && v1 <= 1.05);
  valid = true;
  return in1 ? vec2(u1, v1) : vec2(u2, v2);
}

vec2 transformRectUv(vec2 surfUv) {
  float uc = mix(uUvCrop.x, 1.0 - uUvCrop.y, surfUv.x);
  float vc = mix(uUvCrop.w, 1.0 - uUvCrop.z, surfUv.y);
  vec2 local = (vec2(uc, vc) - 0.5) * uUvScale;
  vec2 metric = vec2(local.x * uSourceAspect, local.y);
  float c = cos(uUvRotRad), s = sin(uUvRotRad);
  vec2 rotM = vec2(metric.x * c - metric.y * s, metric.x * s + metric.y * c);
  return uUvPos + vec2(rotM.x / max(0.01, uSourceAspect), rotM.y);
}

vec2 rgbToCbCr(vec3 c) {
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  return vec2((c.b - y) * 0.564, (c.r - y) * 0.713);
}

void evalKeyer(inout vec4 texel) {
  if (uKeyMode == 1) {
    // Luma Key
    float lum = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
    float k = smoothstep(uKeyParams.x, uKeyParams.x + max(0.002, uKeyParams.y), lum);
    if (uKeyParams.w > 0.5) k = 1.0 - k;
    texel.a *= k;
  } else if (uKeyMode == 2) {
    // YCbCr Chroma Key + Spill Suppression
    vec2 cbcr = rgbToCbCr(texel.rgb);
    vec2 keyCbCr = rgbToCbCr(uKeyColor);
    float d = length(cbcr - keyCbCr) * 1.42;
    float k = smoothstep(uKeyParams.x, uKeyParams.x + max(0.002, uKeyParams.y), d);
    float lum = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
    float spillMask = smoothstep(uKeyParams.x * 0.45, uKeyParams.x + uKeyParams.y + 0.18, d);
    texel.rgb = mix(mix(texel.rgb, vec3(lum), clamp(uKeyParams.z, 0.0, 1.0)), texel.rgb, spillMask);
    texel.a *= k;
  }
}

vec3 applyGrading(vec3 col) {
  if (uChannelMode == 1) col = col.bgr;
  else if (uChannelMode == 2) col = col.rrr;
  else if (uChannelMode == 3) col = col.ggg;
  else if (uChannelMode == 4) col = col.bbb;
  else if (uChannelMode == 5) col = vec3(dot(col, vec3(0.2126, 0.7152, 0.0722)));

  if (uInvertRgb == 1) col = 1.0 - clamp(col, 0.0, 1.0);

  if (abs(uHueShiftRad) > 0.002) {
    vec3 k = vec3(0.577350269);
    float c = cos(uHueShiftRad);
    col = col * c + cross(k, col) * sin(uHueShiftRad) + k * dot(k, col) * (1.0 - c);
  }

  if (abs(uGamma - 1.0) > 0.005) {
    col = pow(max(col, vec3(0.0)), vec3(1.0 / max(0.2, uGamma)));
  }

  col += uBrightness * 0.65;
  col = (col - 0.5) * uContrast + 0.5;
  float lum = dot(max(col, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSaturation);
  if (abs(uColorTemp) > 0.005) {
    if (uColorTemp < 0.0) col *= mix(vec3(1.0), vec3(1.22, 0.91, 0.62), -uColorTemp);
    else col *= mix(vec3(1.0), vec3(0.74, 0.93, 1.24), uColorTemp);
  }
  if (uTint.a > 0.002) {
    float tLum = dot(max(col, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722));
    vec3 tinted = mix(vec3(tLum) * uTint.rgb * 1.35, col * uTint.rgb, 0.45);
    col = mix(col, tinted, clamp(uTint.a, 0.0, 1.0));
  }
  return clamp(col, 0.0, 1.0);
}

vec3 evalBlendRgb(int mode, vec3 dst, vec3 src) {
  if (mode == 4) {
    // Overlay
    return mix(2.0 * dst * src, 1.0 - 2.0 * (1.0 - dst) * (1.0 - src), step(0.5, dst));
  }
  if (mode == 5) {
    // W3C Soft Light
    vec3 d = mix(((16.0 * dst - 12.0) * dst + 4.0) * dst, sqrt(max(dst, vec3(0.0))), step(0.25, dst));
    return mix(dst - (1.0 - 2.0 * src) * dst * (1.0 - dst), dst + (2.0 * src - 1.0) * (d - dst), step(0.5, src));
  }
  if (mode == 6) return max(dst, src);                         // Lighten / Max
  if (mode == 7) return min(dst, src);                         // Darken / Min
  if (mode == 8) return abs(dst - src);                        // Difference
  if (mode == 9) return dst + src - 2.0 * dst * src;           // Exclusion
  if (mode == 10) return max(vec3(0.0), dst - src);            // Subtract
  return src;
}

vec3 overlayCalibration(vec3 baseCol, vec2 uv) {
  vec2 g = uv * 8.0;
  float chk = mod(floor(g.x) + floor(g.y), 2.0);
  vec3 pat = mix(vec3(0.06, 0.09, 0.14), vec3(0.14, 0.20, 0.30), chk);

  vec2 fw = max(fwidth(g), vec2(0.0005));
  vec2 grid = abs(fract(g - 0.5) - 0.5) / fw;
  float line = 1.0 - min(min(grid.x, grid.y), 1.0);

  vec2 cDist = abs(uv - 0.5) / max(fwidth(uv), vec2(0.0005));
  float crossHair = 1.0 - min(min(cDist.x, cDist.y) * 0.6, 1.0);
  float ring = smoothstep(0.012, 0.0, abs(length(uv - 0.5) - 0.35));
  float topMarker = smoothstep(0.92, 0.95, uv.y) * step(abs(uv.x - 0.5), 0.18);

  vec3 cal = mix(pat, uAccentColor * 0.85, line * 0.75);
  cal = mix(cal, vec3(1.0, 0.82, 0.38), ring * 0.9);
  cal = mix(cal, vec3(1.0, 0.36, 0.48), crossHair * 0.9);
  cal = mix(cal, vec3(0.25, 0.95, 0.65), topMarker);
  return mix(baseCol, baseCol * 0.32 + cal * 0.88, 0.88);
}

float evalFourEdgeMask(vec2 uv, float baseAa) {
  float aaU = max(fwidth(uv.x), baseAa);
  float aaV = max(fwidth(uv.y), baseAa);
  float fL = smoothstep(-aaU, max(aaU, uFeatherEdges.x * 0.95), uv.x);
  float fR = smoothstep(-aaU, max(aaU, uFeatherEdges.y * 0.95), 1.0 - uv.x);
  float fB = smoothstep(-aaV, max(aaV, uFeatherEdges.w * 0.95), uv.y);
  float fT = smoothstep(-aaV, max(aaV, uFeatherEdges.z * 0.95), 1.0 - uv.y);
  return fL * fR * fB * fT;
}

float polyPerimeterDist(vec2 stageP) {
  if (uPolyCount < 3) return 1.0;
  float asp = max(0.2, uStageAspect);
  vec2 pA = vec2(stageP.x * asp, stageP.y);
  float minDistSq = 1e9;
  for (int i = 0; i < 48; i++) {
    if (i >= uPolyCount) break;
    int j = (i == 0) ? (uPolyCount - 1) : (i - 1);
    vec2 a = vec2(uPolyPts[i].x * asp, uPolyPts[i].y);
    vec2 b = vec2(uPolyPts[j].x * asp, uPolyPts[j].y);
    vec2 e = b - a;
    vec2 w = pA - a;
    float d2 = dot(e, e);
    vec2 proj = w - e * clamp(dot(w, e) / max(1e-7, d2), 0.0, 1.0);
    minDistSq = min(minDistSq, dot(proj, proj));
  }
  return sqrt(minDistSq);
}

float evalLineChase(float s) {
  float glow = uLineParams.x;
  float spd = uLineParams.y;
  float duty = clamp(uLineParams.z, 0.03, 1.0);
  float cnt = max(1.0, uLineParams.w);
  if (uLineChaseMode == 0) return 1.0;
  if (uLineChaseMode == 1) {
    // Comet chase beam
    float ph = fract(s * cnt - uTime * spd);
    float head = smoothstep(0.0, 0.025, ph) * (1.0 - smoothstep(duty * 0.15, duty, ph));
    return clamp(head, 0.0, 1.0);
  }
  if (uLineChaseMode == 2) {
    // Opposing dual beams
    float phA = fract(s * cnt - uTime * spd);
    float phB = fract((1.0 - s) * cnt - uTime * spd);
    float bA = smoothstep(0.0, 0.025, phA) * (1.0 - smoothstep(duty * 0.15, duty, phA));
    float bB = smoothstep(0.0, 0.025, phB) * (1.0 - smoothstep(duty * 0.15, duty, phB));
    return clamp(max(bA, bB), 0.0, 1.0);
  }
  if (uLineChaseMode == 3) {
    // Boomerang scanner
    float center = 0.5 + 0.5 * sin(uTime * spd * 3.14159265);
    float dist = abs(s - center);
    return 1.0 - smoothstep(duty * 0.12, duty * 0.55 + 0.015, dist);
  }
  if (uLineChaseMode == 4) {
    // Architectural marching dashes
    float ph = fract(s * cnt - uTime * spd);
    float aa = max(fwidth(s * cnt), 0.012);
    return smoothstep(0.0, aa, ph) * (1.0 - smoothstep(duty - aa, duty + aa, ph));
  }
  // Mode 5: Pulse
  return 0.22 + 0.78 * (0.5 + 0.5 * sin(uTime * spd * 6.2831853));
}

float evalFramingShutters(vec2 uv, float aa) {
  float maxIns = max(max(uShutterInsert.x, uShutterInsert.y), max(uShutterInsert.z, uShutterInsert.w));
  if (maxIns <= 0.0005) return 1.0;
  float soft = max(aa, uShutterSoft);
  float m = 1.0;
  if (uShutterInsert.x > 0.0005) {
    vec2 nL = vec2(cos(uShutterAngle.x), sin(uShutterAngle.x));
    m *= smoothstep(-aa, soft, dot(uv - vec2(uShutterInsert.x, 0.5), nL));
  }
  if (uShutterInsert.y > 0.0005) {
    vec2 nR = vec2(-cos(uShutterAngle.y), sin(uShutterAngle.y));
    m *= smoothstep(-aa, soft, dot(uv - vec2(1.0 - uShutterInsert.y, 0.5), nR));
  }
  if (uShutterInsert.z > 0.0005) {
    vec2 nT = vec2(sin(uShutterAngle.z), -cos(uShutterAngle.z));
    m *= smoothstep(-aa, soft, dot(uv - vec2(0.5, 1.0 - uShutterInsert.z), nT));
  }
  if (uShutterInsert.w > 0.0005) {
    vec2 nB = vec2(sin(uShutterAngle.w), cos(uShutterAngle.w));
    m *= smoothstep(-aa, soft, dot(uv - vec2(0.5, uShutterInsert.w), nB));
  }
  return m;
}

void main() {
  vec2 surfUv = vec2(0.0);
  vec2 srcUv = vec2(0.0);
  float shapeMask = 0.0;
  bool validGeom = true;
  float lineCoreBoost = 0.0;

  if (uSurfType == 5) {
    // ARCHITECTURAL LINE & PERIMETER CHASE RIBBON
    float arcS = vMeshUvQ.x;
    float crossT = vMeshUvQ.y; // -1..+1 across glow-expanded ribbon
    float coreRatio = clamp(vMeshUvQ.z, 0.12, 1.0);
    float absT = abs(crossT);
    float aaT = max(fwidth(absT), 0.04);
    float core = 1.0 - smoothstep(max(0.0, coreRatio - aaT), coreRatio + aaT, absT);
    float glowAmt = uLineParams.x;
    float halo = glowAmt > 0.005
      ? exp(-pow(max(0.0, absT - coreRatio) / max(0.06, 1.0 - coreRatio), 1.35) * 3.4) * glowAmt
      : 0.0;
    float along = evalLineChase(arcS);
    shapeMask = clamp((core + halo * 0.85) * along, 0.0, 1.0);
    lineCoreBoost = core * along;
    surfUv = vec2(fract(arcS), crossT * 0.5 + 0.5);
    srcUv = transformRectUv(surfUv);
  } else if (uSurfType == 4) {
    // FREEFORM N-GON POLYGON SURFACE (Ear-clipped VBO + Euclidean boundary feather)
    srcUv = vMeshUvQ.xy;
    surfUv = clamp(vMeshUvQ.xy, 0.0, 1.0);
    if (uFeather > 0.001 && uPolyCount >= 3) {
      float edgeDist = polyPerimeterDist(vStageUv);
      float aa = max(fwidth(edgeDist), 0.001);
      shapeMask = smoothstep(0.0, max(aa, uFeather * 0.35), edgeDist);
    } else {
      shapeMask = 1.0;
    }
  } else if (uSurfType == 3) {
    // PERSPECTIVE-CORRECT CURVED SPLINE / BEZIER MESH SURFACE
    surfUv = vMeshUvQ.xy / max(1e-6, vMeshUvQ.z);
    shapeMask = evalFourEdgeMask(surfUv, 0.0012);
    srcUv = transformRectUv(surfUv);
  } else if (uSurfType == 1) {
    // TRIANGLE SURFACE
    vec2 a = uTriPts[0], b = uTriPts[1], c = uTriPts[2];
    vec2 v0 = b - a, v1 = c - a, v2 = vStageUv - a;
    float denom = v0.x * v1.y - v1.x * v0.y;
    if (abs(denom) < 1e-7) validGeom = false;
    float invDen = validGeom ? (1.0 / denom) : 0.0;
    float w1 = (v2.x * v1.y - v1.x * v2.y) * invDen;
    float w2 = (v0.x * v2.y - v2.x * v0.y) * invDen;
    float w0 = 1.0 - w1 - w2;

    float minBary = min(w0, min(w1, w2));
    float aa = max(fwidth(minBary), 0.001);
    shapeMask = smoothstep(-aa, max(aa, uFeather * 0.65), minBary);

    surfUv = clamp(vec2(w1, w2), 0.0, 1.0);
    srcUv = w0 * uTriUvs[0] + w1 * uTriUvs[1] + w2 * uTriUvs[2];
  } else {
    // QUAD (0) OR CIRCLE/ELLIPSE/ARC (2)
    if (uQuadWarpMode == 1 && uSurfType == 0) {
      bool ok = false;
      surfUv = inverseBilinear(vStageUv, uQuadPts[0], uQuadPts[1], uQuadPts[2], uQuadPts[3], ok);
      if (!ok) validGeom = false;
    } else {
      vec3 q = uInvHomography * vec3(vStageUv, 1.0);
      if (q.z <= 0.0001) validGeom = false;
      surfUv = q.xy / max(q.z, 0.0001);
    }

    if (uSurfType == 0) {
      shapeMask = evalFourEdgeMask(surfUv, 0.001);
    } else {
      vec2 radVec = (surfUv - 0.5) * 2.0;
      float r = length(radVec);
      float aa = max(fwidth(r), 0.002);
      float soft = max(aa, max(uCircleSoftness, uFeather * 1.5));
      float outerMask = 1.0 - smoothstep(max(0.0, 1.0 - soft), 1.0 + aa, r);
      float innerMask = uCircleInner > 0.002
        ? smoothstep(max(0.0, uCircleInner - soft * 0.6), uCircleInner + aa, r)
        : 1.0;
      float sectorMask = 1.0;
      if (uCircleAngles.y < 359.5) {
        float ang = mod(degrees(atan(radVec.y, radVec.x)) - uCircleAngles.x + 720.0, 360.0);
        float sweep = clamp(uCircleAngles.y, 1.0, 360.0);
        float angSigned = (ang <= sweep)
          ? min(ang, sweep - ang)
          : -min(ang - sweep, 360.0 - ang);
        float arcDist = radians(angSigned) * max(r, 0.14);
        sectorMask = smoothstep(-aa, max(aa, soft * 0.55), arcDist);
      }
      shapeMask = outerMask * innerMask * sectorMask;
    }
    srcUv = transformRectUv(surfUv);
  }

  vec2 sampleUv = srcUv;
  if (uMirrorSourceX == 1) sampleUv.x = 1.0 - sampleUv.x;
  if (uFlipSourceY == 1) sampleUv.y = 1.0 - sampleUv.y;

  // Compute anisotropic screen-space UV gradients in uniform control flow before discard
  vec2 dUvDx = dFdx(sampleUv);
  vec2 dUvDy = dFdy(sampleUv);
  float aaShutter = max(max(fwidth(surfUv.x), fwidth(surfUv.y)), 0.0012);
  shapeMask *= evalFramingShutters(surfUv, aaShutter);

  if (!validGeom || shapeMask <= 0.0005) discard;

  // Optical projector edge-blend gamma compensation (e.g. 2.2 eliminates dark overlap seams)
  if (uBlendGamma > 1.001 && shapeMask < 0.9999) {
    shapeMask = pow(clamp(shapeMask, 0.0, 1.0), 1.0 / uBlendGamma);
  }

  // Apply Master Stage Mask & Per-Surface Mask if active
  float maskFactor = 1.0;
  if (uUseStageMask == 1) {
    maskFactor *= texture(uStageMaskTex, clamp(vStageUv, 0.0, 1.0)).r;
  }
  if (uUseSurfMask == 1) {
    maskFactor *= texture(uSurfMaskTex, clamp(vStageUv, 0.0, 1.0)).r;
  }
  if (maskFactor <= 0.001) discard;

  vec4 texel = (uSurfType == 5 && uLineUseSource == 0)
    ? vec4(mix(uAccentColor, vec3(1.0), lineCoreBoost * 0.62), 1.0)
    : textureGrad(uSourceTex, clamp(sampleUv, 0.0, 1.0), dUvDx, dUvDy);
  if (uKeyMode != 0) {
    evalKeyer(texel);
  }
  vec3 graded = applyGrading(texel.rgb);
  if (uSurfType == 5 && uLineUseSource == 1) {
    graded = clamp(graded + vec3(lineCoreBoost * 0.28), 0.0, 1.0);
  }
  if (uBlackLevel > 0.0005) {
    graded = mix(vec3(uBlackLevel), vec3(1.0), graded);
  }

  if (uShowCalGrid == 1) {
    graded = overlayCalibration(graded, surfUv);
    texel.a = max(texel.a, 0.92);
  }

  float envAlpha = clamp(shapeMask * maskFactor * uOpacity, 0.0, 1.0);
  if (uBlendMode == 11 && uUseBackdropBlend == 1) {
    // Alpha / Luma Stencil Mask: bright/opaque reveals underlying stage, dark/keyed attenuates
    if (envAlpha <= 0.0005) discard;
    vec3 dst = clamp(texture(uBackdropTex, clamp(vStageUv, 0.0, 1.0)).rgb, 0.0, 1.0);
    float maskAmt = clamp(dot(graded, vec3(0.2126, 0.7152, 0.0722)) * texel.a, 0.0, 1.0);
    fragColor = vec4(mix(dst, dst * maskAmt, envAlpha), 1.0);
    return;
  }

  float finalAlpha = clamp(envAlpha * texel.a, 0.0, 1.0);
  if (finalAlpha <= 0.0005) discard;

  if (uUseBackdropBlend == 1 && uBlendMode >= 4) {
    vec3 dst = clamp(texture(uBackdropTex, clamp(vStageUv, 0.0, 1.0)).rgb, 0.0, 1.0);
    vec3 blended = clamp(evalBlendRgb(uBlendMode, dst, graded), 0.0, 1.0);
    fragColor = vec4(mix(dst, blended, finalAlpha), 1.0);
  } else if (uBlendMode == 3) {
    fragColor = vec4(mix(vec3(1.0), graded, finalAlpha), finalAlpha);
  } else {
    fragColor = vec4(graded * finalAlpha, finalAlpha);
  }
}`;

// ============================================================================
// PHASE 3.3: INTERACTIVE COSMIC CLOUD FOLLOWSPOT & REVEAL MASK SHADER
// Ported from reference_Still-Rising.html & Upgraded to Universal Optical Bench (Pillar 4)
// uMode: 1=Veil, 2=Additive, 3=Screen, 4=Spotlight Reveal Mask, 5=Silhouette Occlude, 6=Pure/Media Optical Beam
// uContentMode: 0=Cosmic Nebula Triad, 1=Pure Theatrical Light (Planckian Kelvin + Gel), 2=Media/Shader/Mixbus Texture
// ============================================================================
const FS_FOLLOWSPOT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform int uMode;
uniform float uAspect;
uniform float uShadowTime;
uniform vec2 uSpotPos;
uniform vec2 uSpotVel;
uniform float uSpotRadius;
uniform float uSpotSoftness;
uniform float uSpotGain;
uniform float uAmbient;
uniform vec2 uSpotStretch;
uniform float uSpotRotation;
uniform float uSpotMorph;
uniform float uShadowDepth;
uniform float uShadowTex;
uniform float uShadowRnd;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uSpotTemp;

// Optical Bench Extensions: Pure Light, Live Media/Shader Content, Luminance Gobo, 4-Blade & MRT 3D World-Pos
uniform int uContentMode;        // 0=Nebula Triad, 1=Pure Planckian/Gel Beam, 2=Live Media/Shader/Bus Texture
uniform sampler2D uContentTex;
uniform int uFlipContentY;
uniform int uMediaFit;           // 0=Beam-Locked (moving-head fixture), 1=World/Stage-Locked window
uniform float uAtmosFbm;         // 0.0=Razor-clean optical beam (zero FBM wisps), 1.0=Full Cosmic Cloud
uniform vec4 uSpotShutters;      // x=L, y=R, z=T, w=B [0..0.85]
uniform vec4 uSpotShutterAngles; // radians
uniform int uUseGobo;            // 1=Multiply beam gate by luminance of uGoboTex
uniform sampler2D uGoboTex;
uniform int uFlipGoboY;
uniform float uGoboRotRad;
uniform int uUseWorldPos;        // 1=Project 3D world-space sphere from WebGL2 MRT uWorldPosTex
uniform sampler2D uWorldPosTex;
uniform vec3 uSpotWorldTarget;
uniform float uSpotWorldRadiusM;

${SHADER_COMMON}

float getSpotDist(vec2 delta, vec2 stretch, float rotDeg, float morph, float stime, out vec2 outLocal) {
  mat2 r = rot2(-radians(rotDeg));
  vec2 p = (r * delta) / max(vec2(0.08), stretch);
  outLocal = p;

  float rCircle = length(p);
  if (morph <= 0.001) return rCircle;

  float ang = atan(p.y, p.x);
  vec2 ap = abs(p);
  float rDiamond = (ap.x + ap.y) * 0.78 + max(ap.x, ap.y) * 0.22;
  float starPinch = 1.0 + 0.42 * cos(ang * 4.0) - 0.14 * cos(ang * 8.0);
  float rStar = rCircle / max(0.28, starPinch);
  float liveWave = 1.0 + 0.28 * cos(ang * 3.0 + stime * 1.15) + 0.22 * sin(ang * 5.0 - stime * 1.65) + 0.14 * cos(ang * 7.0 + stime * 0.85);
  float rLiving = mix(rDiamond, rCircle / max(0.32, liveWave), 0.78);

  if (morph < 1.0) return mix(rCircle, rDiamond, morph);
  if (morph < 2.0) return mix(rDiamond, rStar, morph - 1.0);
  return mix(rStar, rLiving, clamp(morph - 2.0, 0.0, 1.0));
}

float evalSpotShutters(vec2 gateUv, float aa, float frost) {
  float maxIns = max(max(uSpotShutters.x, uSpotShutters.y), max(uSpotShutters.z, uSpotShutters.w));
  if (maxIns <= 0.0005) return 1.0;
  float soft = max(aa, frost * 0.35);
  float m = 1.0;
  if (uSpotShutters.x > 0.0005) {
    vec2 nL = vec2(cos(uSpotShutterAngles.x), sin(uSpotShutterAngles.x));
    m *= smoothstep(-aa, soft, dot(gateUv - vec2(uSpotShutters.x, 0.5), nL));
  }
  if (uSpotShutters.y > 0.0005) {
    vec2 nR = vec2(-cos(uSpotShutterAngles.y), sin(uSpotShutterAngles.y));
    m *= smoothstep(-aa, soft, dot(gateUv - vec2(1.0 - uSpotShutters.y, 0.5), nR));
  }
  if (uSpotShutters.z > 0.0005) {
    vec2 nT = vec2(sin(uSpotShutterAngles.z), -cos(uSpotShutterAngles.z));
    m *= smoothstep(-aa, soft, dot(gateUv - vec2(0.5, 1.0 - uSpotShutters.z), nT));
  }
  if (uSpotShutters.w > 0.0005) {
    vec2 nB = vec2(sin(uSpotShutterAngles.w), cos(uSpotShutterAngles.w));
    m *= smoothstep(-aa, soft, dot(gateUv - vec2(0.5, uSpotShutters.w), nB));
  }
  return m;
}

vec3 samplePlanckianKelvin(float tempNorm) {
  if (tempNorm < 0.0) {
    return mix(vec3(1.0, 0.985, 0.96), vec3(1.0, 0.67, 0.34), clamp(-tempNorm, 0.0, 1.0));
  }
  return mix(vec3(1.0, 0.985, 0.96), vec3(0.68, 0.84, 1.0), clamp(tempNorm, 0.0, 1.0));
}

vec3 sampleSpotTriad(float t, float h) {
  float k = clamp(t + uSpotTemp * 0.2, 0.0, 1.0);
  vec3 col = mix(uColA, uColB, smoothstep(0.08, 0.72, h * 0.45 + k * 0.6));
  col = mix(col, uColC, smoothstep(0.5, 1.0, k * 0.85 + h * 0.2) * 0.82);
  if (abs(uSpotTemp) > 0.01) {
    col *= uSpotTemp < 0.0
      ? mix(vec3(1.0), vec3(1.22, 0.85, 0.55), -uSpotTemp)
      : mix(vec3(1.0), vec3(0.68, 0.90, 1.25), uSpotTemp);
  }
  return col;
}

void main() {
  vec2 delta = (vUv - uSpotPos) * vec2(uAspect, 1.0);
  vec2 localD = delta;
  float rawDist = getSpotDist(delta, uSpotStretch, uSpotRotation, uSpotMorph, uShadowTime, localD);
  float effRadius = max(0.006, uSpotRadius);

  // Optional WebGL2 MRT 3D World-Space Euclidean Spotlight Envelope for 3D Meshes & Raked Floors
  if (uUseWorldPos == 1) {
    vec4 wp = texture(uWorldPosTex, vUv);
    if (wp.a > 0.5) {
      float dWorldM = length(wp.xyz - uSpotWorldTarget);
      rawDist = (dWorldM / max(0.05, uSpotWorldRadiusM)) * effRadius;
    }
  }

  vec2 gateUv = localD / (effRadius * 2.0) + 0.5;
  float aaGate = max(max(fwidth(gateUv.x), fwidth(gateUv.y)), 0.0018);
  float shutterGate = evalSpotShutters(gateUv, aaGate, uSpotSoftness);

  float goboMask = 1.0;
  if (uUseGobo == 1) {
    vec2 gUv = rot2(uGoboRotRad) * (gateUv - 0.5) + 0.5;
    if (uFlipGoboY == 1) gUv.y = 1.0 - gUv.y;
    if (gUv.x < 0.0 || gUv.x > 1.0 || gUv.y < 0.0 || gUv.y > 1.0) {
      goboMask = 0.0;
    } else {
      vec4 gTex = texture(uGoboTex, clamp(gUv, 0.0, 1.0));
      goboMask = clamp(dot(gTex.rgb, vec3(0.2126, 0.7152, 0.0722)) * gTex.a, 0.0, 1.0);
    }
  }

  float fbmMix = clamp(uAtmosFbm, 0.0, 1.0);
  float aaDist = max(fwidth(rawDist), 0.0012);
  float cleanSoft = max(aaDist, uSpotSoftness * 0.95);
  float cleanEnv = 1.0 - smoothstep(max(0.0, effRadius - cleanSoft * 0.55), effRadius + cleanSoft * 0.55, rawDist);

  float field = cleanEnv;
  float envWeight = cleanEnv;
  float shadowTrans = 1.0;
  float wisps = 0.5;
  float veins = 0.0;
  float core = exp(-rawDist / max(0.005, effRadius * 0.92));
  float texField = 0.5;
  vec2 q = vec2(0.0);
  vec2 r = vec2(0.0);
  vec2 uv = localD;

  if (fbmMix > 0.005) {
    float baseScale = 1.55 / max(0.03, effRadius * 1.3 + 0.06);
    float texScale = mix(0.55, 2.85, clamp((uShadowTex - 0.15) / 2.85, 0.0, 1.0));
    uv = localD * baseScale * texScale - clamp(uSpotVel * 0.22, vec2(-0.7), vec2(0.7));

    if (uShadowRnd > 0.01) {
      float sw = (noise2D(uv * 0.45 + vec2(uShadowTime * 0.23, -uShadowTime * 0.19)) - 0.5) * uShadowRnd * 2.5;
      uv = rot2(sw) * uv;
    }

    float warpStr = mix(0.45, 3.2, uShadowRnd);
    q = vec2(fbmCosmic(uv + vec2(0.0, uShadowTime * 0.32)), fbmCosmic(uv + vec2(5.2, 1.3) - vec2(uShadowTime * 0.27, 0.0)));
    r = vec2(fbmCosmic(uv + warpStr * q + vec2(1.7, 9.2) + uShadowTime * 0.22), fbmCosmic(uv + warpStr * q + vec2(8.3, 2.8) - uShadowTime * 0.29));

    float smoke = fbmCosmic(uv + warpStr * r);
    float pocket = noise2D(uv * 1.85 - r * (1.5 + uShadowRnd * 2.0) + vec2(uShadowTime * 0.48, -uShadowTime * 0.37));
    float dappled = smoothstep(0.22, 0.78, smoke * 0.68 + pocket * 0.48);
    float ridge = 1.0 - abs(fbmCosmic(uv * 1.9 + q * 2.4 - uShadowTime * 0.35) * 2.0 - 1.0);
    float grit = pow(clamp(ridge, 0.0, 1.0), 1.8) * 0.7 + noise2D(uv * 4.5 + r * 3.6 + uShadowTime * 0.7) * 0.4;

    texField = mix(smoke, dappled, smoothstep(0.25, 1.35, uShadowTex));
    texField = mix(texField, grit, smoothstep(1.25, 2.85, uShadowTex));

    float shadowOcc = clamp(1.0 - texField * 1.18, 0.0, 1.0);
    float edgeFray = (shadowOcc - 0.45) * effRadius * (0.25 + 0.55 * uShadowRnd);

    float frayedDist = max(0.0, rawDist + edgeFray * (0.45 + 0.55 * uShadowDepth));
    float effSoft = max(0.004, uSpotSoftness * 1.45 + effRadius * 0.28);
    float env = 1.0 - smoothstep(max(0.0, effRadius - effSoft * 0.5), effRadius + effSoft * 0.95, frayedDist);
    float halo = exp(-(frayedDist * frayedDist) / max(0.00005, (effRadius + effSoft * 0.6) * (effRadius + effSoft * 0.6) * 1.3));

    wisps = pow(clamp(texField * 1.38 - 0.08, 0.0, 1.0), 1.6);
    veins = pow(max(0.0, 1.0 - abs(smoke - 0.52) * 3.8), 2.3) * 0.85;
    float fbmWeight = clamp(env * 0.8 + halo * 0.45 + core * 0.3, 0.0, 1.35);
    float cloudMask = clamp(fbmWeight * (0.28 + 0.72 * clamp(wisps + veins * 0.75, 0.0, 1.25)), 0.0, 1.0);

    float shadowCut = smoothstep(0.14, 0.84, shadowOcc);
    float fbmShadowTrans = mix(1.0, 1.0 - shadowCut * 0.92, uShadowDepth);
    float fbmField = clamp(cloudMask * fbmShadowTrans, 0.0, 1.0);

    field = mix(cleanEnv, fbmField, fbmMix);
    envWeight = mix(cleanEnv, fbmWeight, fbmMix);
    shadowTrans = mix(1.0, fbmShadowTrans, fbmMix);
  }

  field = clamp(field * shutterGate * goboMask, 0.0, 1.0);

  if (uMode == 4) {
    float transmit = clamp(mix(uAmbient, min(1.0, 0.35 + uSpotGain * 0.55), field), 0.0, 1.0);
    fragColor = vec4(vec3(transmit), 1.0);
    return;
  }
  if (uMode == 5) {
    float transmit = clamp(1.0 - field * clamp(uSpotGain * 0.6, 0.0, 1.0), uAmbient, 1.0);
    fragColor = vec4(vec3(transmit), 1.0);
    return;
  }

  if (uContentMode == 1) {
    vec3 kelvinRgb = samplePlanckianKelvin(uSpotTemp);
    vec3 gelRgb = mix(uColB, uColC, clamp(0.35 + core * 0.65, 0.0, 1.0));
    vec3 beamRgb = clamp(kelvinRgb * gelRgb * clamp(uSpotGain * 0.62, 0.0, 3.0), 0.0, 1.0);
    float a = clamp(field * min(1.0, max(0.0, uSpotGain)), 0.0, 1.0);
    fragColor = vec4(beamRgb * a, a);
    return;
  }

  if (uContentMode == 2) {
    vec2 mUv = (uMediaFit == 1) ? vUv : gateUv;
    if (uFlipContentY == 1) mUv.y = 1.0 - mUv.y;
    vec4 mTex = (mUv.x < 0.0 || mUv.x > 1.0 || mUv.y < 0.0 || mUv.y > 1.0)
      ? vec4(0.0)
      : texture(uContentTex, clamp(mUv, 0.0, 1.0));
    vec3 kelvinTrim = samplePlanckianKelvin(uSpotTemp);
    vec3 mediaRgb = clamp(mTex.rgb * kelvinTrim * clamp(uSpotGain * 0.68, 0.0, 3.0), 0.0, 1.0);
    float a = clamp(field * mTex.a * min(1.0, max(0.0, uSpotGain)), 0.0, 1.0);
    fragColor = vec4(mediaRgb * a, a);
    return;
  }

  vec3 c1 = sampleSpotTriad(clamp(texField * 0.75 + 0.08, 0.05, 0.88), q.x);
  vec3 c2 = sampleSpotTriad(clamp(r.y * 0.7 + 0.12, 0.08, 0.88), r.x);
  vec3 neb = mix(c1, c2, smoothstep(0.18, 0.82, length(q)));
  neb = mix(neb, sampleSpotTriad(0.82, 0.5), core * 0.4);

  vec3 dustRnd = hash32(floor(uv * 6.2 + q * 3.0));
  float spark = fbmMix * pow(max(0.0, sin(uShadowTime * (2.2 + dustRnd.x * 4.2) + dustRnd.y * TAU)), 16.0) * dustRnd.z;

  vec3 cloudRgb = (neb * (0.26 + wisps * 1.18 + veins * 0.9) + vec3(1.0, 0.97, 0.92) * spark * 0.45) * envWeight * shadowTrans * shutterGate * goboMask * (0.38 + 0.55 * uSpotGain);
  vec3 mapped = (cloudRgb * (2.51 * cloudRgb + 0.03)) / (cloudRgb * (2.43 * cloudRgb + 0.59) + 0.14);
  mapped = pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.15));

  float alpha = clamp(field * 0.92 * min(1.0, max(0.0, uSpotGain * 1.5)), 0.0, 1.0);
  fragColor = vec4(mapped * alpha, alpha);
}`;

// ============================================================================
// PHASE 4.2: DUAL-FBO CUE CROSSFADE & MASTER OUTPUT COMPOSITOR
// ============================================================================
const FS_CROSSFADE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;
uniform float uMasterGain;
uniform int uDualBus;

uniform int uUseMasterKeystone;
uniform mat3 uMasterInvHomography;
uniform float uMasterLensK1;
uniform vec3 uCalibCrosshair; // xy = stagePos, z = active (>0.5)
uniform float uStageAspect;

// Milestone 6: Multi-Projector Slice Routing & Raised-Cosine Optical Edge Blending
uniform vec4 uSliceRect;       // xy = cropX,cropY, zw = cropW,cropH (default 0,0,1,1)
uniform vec4 uEdgeBlend;       // x=blendL, y=blendR, z=blendT, w=blendB in screen-local UV
uniform float uEdgeGamma;      // Optical projector gamma (default 2.2)
uniform float uBlackOffset;    // Non-overlap black-floor uplift (0..0.35)
uniform vec2 uProjGainKelvin;  // x = per-screen gain (1.0), y = kelvin trim (-1..1)
uniform int uShowBlendGuide;   // 1 = project overlap seam alignment bars (!showLock)

// Milestone 7B & 7C: 2D/3D Stage Plan Constant-Brightness Solver & Convergent Performer Spill Mask
uniform int uUseStagePlanSolver;
uniform mat3 uStagePlanHomography; // 3x3 ProjLocalUV -> StageScreenUV
uniform sampler2D uStagePlanLutTex;
uniform vec4 uConvergentMask;      // xy = stageSpotUv, z = radius, w = bgAttenuation (0..1)

void main() {
  vec2 stUv = vUv;
  float frameMask = 1.0;

  if (uUseMasterKeystone == 1) {
    vec3 q = uMasterInvHomography * vec3(vUv, 1.0);
    if (q.z <= 0.0001) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    stUv = q.xy / q.z;
    if (abs(uMasterLensK1) > 0.0005) {
      vec2 dc = stUv - 0.5;
      stUv = 0.5 + dc * (1.0 + uMasterLensK1 * dot(dc, dc) * 2.2);
    }
    float edgeD = min(min(stUv.x, 1.0 - stUv.x), min(stUv.y, 1.0 - stUv.y));
    float aa = max(max(fwidth(stUv.x), fwidth(stUv.y)), 0.0008);
    frameMask = smoothstep(-aa, aa, edgeD);
    if (frameMask <= 0.0005) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  }

  vec2 localUv = clamp(stUv, 0.0, 1.0);
  vec2 sliceSize = max(uSliceRect.zw, vec2(0.0001));
  vec2 stageUv = clamp(uSliceRect.xy + localUv * sliceSize, 0.0, 1.0);
  float spInMask = 1.0;
  vec4 spLut = vec4(1.0, 1.0, 0.0, 1.0);

  if (uUseStagePlanSolver == 1) {
    vec3 qSp = uStagePlanHomography * vec3(localUv, 1.0);
    if (qSp.z <= 0.0001) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vec2 rawStageUv = qSp.xy / qSp.z;
    float edgeSp = min(min(rawStageUv.x, 1.0 - rawStageUv.x), min(rawStageUv.y, 1.0 - rawStageUv.y));
    float aaSp = max(max(fwidth(rawStageUv.x), fwidth(rawStageUv.y)), 0.001);
    spInMask = smoothstep(-aaSp, aaSp, edgeSp);
    if (spInMask <= 0.0005) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    stageUv = clamp(rawStageUv, 0.0, 1.0);
    spLut = texture(uStagePlanLutTex, stageUv);
  }

  vec4 col = texture(uTexB, stageUv);
  if (uDualBus == 1) {
    vec4 colA = texture(uTexA, stageUv);
    col = mix(colA, col, clamp(uMix, 0.0, 1.0));
  }

  vec3 outRgb = col.rgb * max(0.0, uProjGainKelvin.x);
  if (abs(uProjGainKelvin.y) > 0.001) {
    vec3 kTarget = (uProjGainKelvin.y > 0.0) ? vec3(1.0, 0.90, 0.76) : vec3(0.78, 0.91, 1.0);
    outRgb *= mix(vec3(1.0), kTarget, clamp(abs(uProjGainKelvin.y), 0.0, 1.0) * 0.55);
  }

  // Raised-cosine optical edge-blending + 2D/3D Stage Plan Constant-Brightness Solver
  float aL = (uEdgeBlend.x > 0.0005) ? (0.5 - 0.5 * cos(3.14159265 * clamp(localUv.x / uEdgeBlend.x, 0.0, 1.0))) : 1.0;
  float aR = (uEdgeBlend.y > 0.0005) ? (0.5 - 0.5 * cos(3.14159265 * clamp((1.0 - localUv.x) / uEdgeBlend.y, 0.0, 1.0))) : 1.0;
  float aT = (uEdgeBlend.z > 0.0005) ? (0.5 - 0.5 * cos(3.14159265 * clamp((1.0 - localUv.y) / uEdgeBlend.z, 0.0, 1.0))) : 1.0;
  float aB = (uEdgeBlend.w > 0.0005) ? (0.5 - 0.5 * cos(3.14159265 * clamp(localUv.y / uEdgeBlend.w, 0.0, 1.0))) : 1.0;
  float linEdge = clamp(aL * aR * aT * aB, 0.0, 1.0);
  if (uUseStagePlanSolver == 1) {
    linEdge *= clamp(spLut.r, 0.0, 1.0) * spInMask;
  }
  float optEdge = (linEdge < 0.9999) ? pow(linEdge, 1.0 / max(0.5, uEdgeGamma)) : 1.0;

  if (uConvergentMask.w > 0.001) {
    float dPerf = length((stageUv - uConvergentMask.xy) * vec2(max(0.2, uStageAspect), 1.0));
    float perfKeep = 1.0 - smoothstep(uConvergentMask.z * 0.72, uConvergentMask.z * 1.25, dPerf);
    outRgb *= mix(1.0, perfKeep, clamp(uConvergentMask.w, 0.0, 1.0));
  }

  outRgb = outRgb * uMasterGain * optEdge * frameMask;
  if (uBlackOffset > 0.0005) {
    outRgb = max(outRgb, vec3(uBlackOffset * (1.0 - linEdge) * frameMask));
  }

  // Optional physical overlap seam alignment hairlines (!showLock)
  if (uShowBlendGuide == 1) {
    float gpx = max(max(fwidth(localUv.x), fwidth(localUv.y)), 0.0012);
    float seamMask = (uUseStagePlanSolver == 1) ? clamp(spLut.b * 1.35, 0.0, 1.0) : 0.0;
    float midMask = 0.0;
    if (uEdgeBlend.x > 0.001) {
      seamMask = max(seamMask, smoothstep(gpx * 1.6, 0.0, abs(localUv.x - uEdgeBlend.x)));
      midMask = max(midMask, smoothstep(gpx * 1.8, 0.0, abs(localUv.x - uEdgeBlend.x * 0.5)));
    }
    if (uEdgeBlend.y > 0.001) {
      seamMask = max(seamMask, smoothstep(gpx * 1.6, 0.0, abs((1.0 - localUv.x) - uEdgeBlend.y)));
      midMask = max(midMask, smoothstep(gpx * 1.8, 0.0, abs((1.0 - localUv.x) - uEdgeBlend.y * 0.5)));
    }
    if (uEdgeBlend.z > 0.001) {
      seamMask = max(seamMask, smoothstep(gpx * 1.6, 0.0, abs((1.0 - localUv.y) - uEdgeBlend.z)));
      midMask = max(midMask, smoothstep(gpx * 1.8, 0.0, abs((1.0 - localUv.y) - uEdgeBlend.z * 0.5)));
    }
    if (uEdgeBlend.w > 0.001) {
      seamMask = max(seamMask, smoothstep(gpx * 1.6, 0.0, abs(localUv.y - uEdgeBlend.w)));
      midMask = max(midMask, smoothstep(gpx * 1.8, 0.0, abs(localUv.y - uEdgeBlend.w * 0.5)));
    }
    outRgb = mix(outRgb, vec3(0.20, 0.91, 0.62), seamMask * 0.85 * frameMask);
    outRgb = mix(outRgb, vec3(1.0, 0.78, 0.32), midMask * 0.95 * frameMask);
  }

  // Live Hardware Alignment Crosshair on physical projector during Setup (disabled by Show Lock)
  if (uCalibCrosshair.z > 0.5) {
    float px = max(fwidth(stageUv.y), 0.0007);
    vec2 dCh = (stageUv - uCalibCrosshair.xy) * vec2(max(0.2, uStageAspect), 1.0);
    float rCh = length(dCh);
    float ring = smoothstep(px * 1.4, 0.0, abs(rCh - px * 15.0));
    float armX = smoothstep(px * 1.1, 0.0, abs(dCh.y)) * step(px * 3.5, abs(dCh.x)) * (1.0 - step(px * 30.0, abs(dCh.x)));
    float armY = smoothstep(px * 1.1, 0.0, abs(dCh.x)) * step(px * 3.5, abs(dCh.y)) * (1.0 - step(px * 30.0, abs(dCh.y)));
    float dotC = smoothstep(px * 1.8, 0.0, rCh);
    float chMask = clamp(max(max(ring, max(armX, armY)), dotC), 0.0, 1.0);
    vec3 chCol = mix(vec3(0.22, 0.96, 1.0), vec3(1.0, 0.85, 0.35), dotC);
    outRgb = mix(outRgb, chCol, chMask * frameMask);
  }

  fragColor = vec4(outRgb, 1.0);
}`;

const FS_INPUT_PREVIEW = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uViewRes;
uniform int uFlipY;
uniform int uMirrorX;

void main() {
  vec2 sampleUv = vUv;
  if (uMirrorX == 1) sampleUv.x = 1.0 - sampleUv.x;
  if (uFlipY == 1) sampleUv.y = 1.0 - sampleUv.y;

  vec4 texel = texture(uTex, sampleUv);
  vec2 chk = floor(vUv * uViewRes / 12.0);
  float c = mod(chk.x + chk.y, 2.0);
  vec3 board = mix(vec3(0.07, 0.09, 0.13), vec3(0.12, 0.15, 0.21), c);
  vec3 rgb = mix(board, texel.rgb, texel.a);
  fragColor = vec4(rgb, 1.0);
}`;

// ============================================================================
// MILESTONE 2: STRUCTURED-LIGHT REFLECTED GRAY-CODE PROJECTOR CALIBRATION
// ============================================================================
const FS_SCANNER_PATTERN = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform int uKind;     // 0=black, 1=white, 2=grayX, 3=grayY
uniform int uBit;      // 0 .. uBitsTotal-1
uniform int uBitsTotal;
uniform int uInvert;   // 0=normal, 1=complement
uniform int uUseMasterKeystone;
uniform mat3 uMasterInvHomography;
uniform float uMasterLensK1;

void main() {
  vec2 stUv = vUv;
  if (uUseMasterKeystone == 1) {
    vec2 centered = vUv * 2.0 - 1.0;
    if (abs(uMasterLensK1) > 0.0005) {
      float r2 = dot(centered, centered);
      centered *= (1.0 + uMasterLensK1 * r2);
    }
    vec2 lensUv = centered * 0.5 + 0.5;
    vec3 q = uMasterInvHomography * vec3(lensUv, 1.0);
    if (q.z <= 0.0001) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    stUv = q.xy / q.z;
    if (stUv.x < 0.0 || stUv.x > 1.0 || stUv.y < 0.0 || stUv.y > 1.0) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  }

  float val = 0.0;
  if (uKind == 1) {
    val = 1.0;
  } else if (uKind == 2 || uKind == 3) {
    float coord = (uKind == 2) ? stUv.x : stUv.y;
    int bins = 1 << clamp(uBitsTotal, 2, 11);
    int idx = clamp(int(floor(clamp(coord, 0.0, 0.999999) * float(bins))), 0, bins - 1);
    int gray = idx ^ (idx >> 1);
    int bitVal = (gray >> clamp(uBit, 0, 10)) & 1;
    if (uInvert == 1) bitVal = 1 - bitVal;
    val = float(bitVal);
  }
  fragColor = vec4(val, val, val, 1.0);
}`;

// ============================================================================
// MILESTONE 7A: 24-BIT DEPTH-BUFFERED 3D MESH & .OBJ SURFACE SHADERS
// ============================================================================
const MESH3D_VS = `#version 300 es
layout(location = 0) in vec3 aPos3D;
layout(location = 1) in vec3 aNormal3D;
layout(location = 2) in vec2 aUv2D;
layout(location = 3) in vec3 aBary3D;

uniform mat4 uMvpMatrix;
uniform mat4 uModelMatrix;
uniform mat3 uNormalMatrix;

out vec3 vWorldPos;
out vec3 vWorldNormal;
out vec2 vSurfUv;
out vec3 vBary3D;
out float vClipDepth;

void main() {
  vec4 worldP = uModelMatrix * vec4(aPos3D, 1.0);
  vWorldPos = worldP.xyz;
  vec3 wn = uNormalMatrix * aNormal3D;
  vWorldNormal = length(wn) > 1e-5 ? normalize(wn) : vec3(0.0, 0.0, 1.0);
  vSurfUv = aUv2D;
  vBary3D = aBary3D;
  vec4 clipP = uMvpMatrix * vec4(aPos3D, 1.0);
  vClipDepth = clipP.w;
  gl_Position = clipP;
}`;

const FS_MESH3D_SURFACE = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vWorldNormal;
in vec2 vSurfUv;
in vec3 vBary3D;
in float vClipDepth;
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragWorldPos;

uniform sampler2D uSourceTex;
uniform int uFlipSourceY;
uniform int uMirrorSourceX;
uniform float uSourceAspect;
uniform float uTime;

uniform vec2 uUvPos;
uniform vec2 uUvScale;
uniform float uUvRotRad;
uniform vec4 uUvCrop;

uniform int uShadeMode;       // 0=lit+wire, 1=lit, 2=pure wire, 3=unlit, 4=normals/depth
uniform vec3 uLightDir;       // Normalized key light direction in world/object space
uniform vec3 uCamWorldPos;    // Projector/Orbit eye position in world/object space
uniform vec4 uLightParams;    // x=ambient, y=diffuse, z=specular, w=rimGlow
uniform vec4 uWireParams;     // x=wireWidthPx, y=wireGlow, z=wireChaseSpeed, w=useSourceOnWire

uniform float uBlackLevel;
uniform int uKeyMode;
uniform vec3 uKeyColor;
uniform vec4 uKeyParams;

uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uColorTemp;
uniform float uGamma;
uniform float uHueShiftRad;
uniform vec4 uTint;
uniform int uInvertRgb;
uniform int uChannelMode;

uniform int uShowCalGrid;
uniform vec3 uAccentColor;
uniform vec4 uShutterInsert; // x=Left, y=Right, z=Top, w=Bottom [0..0.85]
uniform vec4 uShutterAngle;  // x=angL, y=angR, z=angT, w=angB (radians)
uniform float uShutterSoft;  // Optical framing blade frost/focus [0..0.25]

vec2 transformRectUv3D(vec2 surfUv) {
  float uc = mix(uUvCrop.x, 1.0 - uUvCrop.y, fract(surfUv.x));
  float vc = mix(uUvCrop.w, 1.0 - uUvCrop.z, fract(surfUv.y));
  vec2 local = (vec2(uc, vc) - 0.5) * uUvScale;
  vec2 metric = vec2(local.x * uSourceAspect, local.y);
  float c = cos(uUvRotRad), s = sin(uUvRotRad);
  vec2 rotM = vec2(metric.x * c - metric.y * s, metric.x * s + metric.y * c);
  return uUvPos + vec2(rotM.x / max(0.01, uSourceAspect), rotM.y);
}

vec2 rgbToCbCr3D(vec3 c) {
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  return vec2((c.b - y) * 0.564, (c.r - y) * 0.713);
}

void evalKeyer3D(inout vec4 texel) {
  if (uKeyMode == 1) {
    float lum = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
    float k = smoothstep(uKeyParams.x, uKeyParams.x + max(0.002, uKeyParams.y), lum);
    if (uKeyParams.w > 0.5) k = 1.0 - k;
    texel.a *= k;
  } else if (uKeyMode == 2) {
    vec2 cbcr = rgbToCbCr3D(texel.rgb);
    vec2 keyCbCr = rgbToCbCr3D(uKeyColor);
    float d = length(cbcr - keyCbCr) * 1.42;
    float k = smoothstep(uKeyParams.x, uKeyParams.x + max(0.002, uKeyParams.y), d);
    float lum = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
    float spillMask = smoothstep(uKeyParams.x * 0.45, uKeyParams.x + uKeyParams.y + 0.18, d);
    texel.rgb = mix(mix(texel.rgb, vec3(lum), clamp(uKeyParams.z, 0.0, 1.0)), texel.rgb, spillMask);
    texel.a *= k;
  }
}

vec3 applyGrading3D(vec3 col) {
  if (uChannelMode == 1) col = col.bgr;
  else if (uChannelMode == 2) col = col.rrr;
  else if (uChannelMode == 3) col = col.ggg;
  else if (uChannelMode == 4) col = col.bbb;
  else if (uChannelMode == 5) col = vec3(dot(col, vec3(0.2126, 0.7152, 0.0722)));

  if (uInvertRgb == 1) col = 1.0 - clamp(col, 0.0, 1.0);

  if (abs(uHueShiftRad) > 0.002) {
    vec3 k = vec3(0.577350269);
    float c = cos(uHueShiftRad);
    col = col * c + cross(k, col) * sin(uHueShiftRad) + k * dot(k, col) * (1.0 - c);
  }

  if (abs(uGamma - 1.0) > 0.005) {
    col = pow(max(col, vec3(0.0)), vec3(1.0 / max(0.2, uGamma)));
  }

  col += uBrightness * 0.65;
  col = (col - 0.5) * uContrast + 0.5;
  float lum = dot(max(col, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSaturation);
  if (abs(uColorTemp) > 0.005) {
    if (uColorTemp < 0.0) col *= mix(vec3(1.0), vec3(1.22, 0.91, 0.62), -uColorTemp);
    else col *= mix(vec3(1.0), vec3(0.74, 0.93, 1.24), uColorTemp);
  }
  if (uTint.a > 0.002) {
    float tLum = dot(max(col, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722));
    vec3 tinted = mix(vec3(tLum) * uTint.rgb * 1.35, col * uTint.rgb, 0.45);
    col = mix(col, tinted, clamp(uTint.a, 0.0, 1.0));
  }
  return clamp(col, 0.0, 1.0);
}

vec3 overlayCal3D(vec3 baseCol, vec2 uv) {
  vec2 g = fract(uv) * 8.0;
  float chk = mod(floor(g.x) + floor(g.y), 2.0);
  vec3 pat = mix(vec3(0.06, 0.09, 0.14), vec3(0.14, 0.20, 0.30), chk);
  vec2 fw = max(fwidth(g), vec2(0.001));
  vec2 grid = abs(fract(g - 0.5) - 0.5) / fw;
  float line = 1.0 - min(min(grid.x, grid.y), 1.0);
  vec3 cal = mix(pat, uAccentColor * 0.9, line * 0.8);
  return mix(baseCol, baseCol * 0.32 + cal * 0.88, 0.86);
}

float evalFramingShutters3D(vec2 uv, float aa) {
  float maxIns = max(max(uShutterInsert.x, uShutterInsert.y), max(uShutterInsert.z, uShutterInsert.w));
  if (maxIns <= 0.0005) return 1.0;
  float soft = max(aa, uShutterSoft);
  float m = 1.0;
  if (uShutterInsert.x > 0.0005) {
    vec2 nL = vec2(cos(uShutterAngle.x), sin(uShutterAngle.x));
    m *= smoothstep(-aa, soft, dot(uv - vec2(uShutterInsert.x, 0.5), nL));
  }
  if (uShutterInsert.y > 0.0005) {
    vec2 nR = vec2(-cos(uShutterAngle.y), sin(uShutterAngle.y));
    m *= smoothstep(-aa, soft, dot(uv - vec2(1.0 - uShutterInsert.y, 0.5), nR));
  }
  if (uShutterInsert.z > 0.0005) {
    vec2 nT = vec2(sin(uShutterAngle.z), -cos(uShutterAngle.z));
    m *= smoothstep(-aa, soft, dot(uv - vec2(0.5, 1.0 - uShutterInsert.z), nT));
  }
  if (uShutterInsert.w > 0.0005) {
    vec2 nB = vec2(sin(uShutterAngle.w), cos(uShutterAngle.w));
    m *= smoothstep(-aa, soft, dot(uv - vec2(0.5, uShutterInsert.w), nB));
  }
  return m;
}

void main() {
  vec2 surfUv3D = fract(vSurfUv);
  float aaShutter3D = max(max(fwidth(surfUv3D.x), fwidth(surfUv3D.y)), 0.0015);
  float shutterMask3D = evalFramingShutters3D(surfUv3D, aaShutter3D);
  vec2 sampleUv = transformRectUv3D(vSurfUv);
  if (uMirrorSourceX == 1) sampleUv.x = 1.0 - sampleUv.x;
  if (uFlipSourceY == 1) sampleUv.y = 1.0 - sampleUv.y;

  vec2 dUvDx = dFdx(sampleUv);
  vec2 dUvDy = dFdy(sampleUv);

  // Screen-space anti-aliased architectural 3D wireframe (quad diagonals auto-suppressed via vBary3D=1)
  vec3 fwB = max(fwidth(vBary3D), vec3(0.0002));
  vec3 dPx = vBary3D / fwB;
  float minEdgePx = min(dPx.x, min(dPx.y, dPx.z));

  float wWidth = max(0.35, uWireParams.x);
  float wGlow = clamp(uWireParams.y, 0.0, 1.5);
  float wChaseSpd = uWireParams.z;
  float wireCore = 1.0 - smoothstep(wWidth * 0.55, wWidth * 0.55 + 1.15, minEdgePx);
  float wireHalo = wGlow > 0.005
    ? exp(-max(0.0, minEdgePx - wWidth * 0.4) / (1.8 + wGlow * 6.5)) * wGlow * 0.85
    : 0.0;
  float chaseMod = abs(wChaseSpd) > 0.01
    ? (0.28 + 0.72 * pow(0.5 + 0.5 * sin((vWorldPos.x * 3.4 + vWorldPos.y * 4.6 + vWorldPos.z * 2.9) - uTime * wChaseSpd * 4.2), 2.2))
    : 1.0;
  float wireAmt = clamp((wireCore + wireHalo) * chaseMod, 0.0, 1.0);

  vec3 N = normalize(vWorldNormal);
  if (!gl_FrontFacing) N = -N;

  if (uShadeMode == 4) {
    // 3D Normal & Depth Diagnostic Calibration Mode
    vec3 nRgb = N * 0.5 + 0.5;
    float depthBands = 0.82 + 0.18 * sin(vClipDepth * 14.0);
    vec3 diagCol = mix(nRgb * depthBands, vec3(1.0), wireCore * 0.75);
    fragColor = vec4(diagCol, 1.0);
    fragWorldPos = vec4(vWorldPos, 1.0);
    return;
  }

  vec4 texel = textureGrad(uSourceTex, clamp(sampleUv, 0.0, 1.0), dUvDx, dUvDy);
  if (uKeyMode != 0) {
    evalKeyer3D(texel);
  }
  vec3 baseRgb = applyGrading3D(texel.rgb);

  // 3D Studio Key + Fill + Specular + Rim Lighting
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(uCamWorldPos - vWorldPos);
  vec3 H = normalize(L + V);

  float ndl = max(dot(N, L), 0.0);
  float fillNdl = max(dot(N, normalize(vec3(-L.x, -L.y * 0.4 + 0.35, -L.z * 0.5 + 0.4))), 0.0) * 0.24;
  float amb = uLightParams.x;
  float diff = (ndl + fillNdl) * uLightParams.y;
  float spec = pow(max(dot(N, H), 0.0), 34.0) * uLightParams.z;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uLightParams.w;

  vec3 wireTint = uWireParams.w > 0.5 ? mix(baseRgb, vec3(1.0), wireCore * 0.45) : mix(uAccentColor, vec3(1.0), wireCore * 0.55);

  vec3 outRgb = baseRgb;
  float outAlpha = texel.a;

  if (uShadeMode == 2) {
    // Pure 3D Neon Wireframe Mode (transparent interior, glowing structural beams)
    outRgb = wireTint;
    outAlpha = wireAmt;
    if (uShowCalGrid == 1) {
      outRgb = mix(overlayCal3D(baseRgb, vSurfUv), wireTint, wireAmt);
      outAlpha = max(outAlpha, 0.9);
    }
    if (outAlpha <= 0.002) discard;
  } else if (uShadeMode == 3) {
    // Unlit Flat UV Texture
    outRgb = baseRgb;
  } else {
    // Mode 0 (Lit + Neon Wire) or Mode 1 (Lit Textured)
    outRgb = baseRgb * (amb + diff) + vec3(spec) + uAccentColor * (rim * 0.65);
    if (uShadeMode == 0 && wireAmt > 0.002) {
      outRgb = mix(outRgb, wireTint, clamp(wireAmt * 0.92, 0.0, 1.0));
      outAlpha = max(outAlpha, wireAmt);
    }
  }

  if (uBlackLevel > 0.0005) {
    outRgb = mix(vec3(uBlackLevel), vec3(1.0), clamp(outRgb, 0.0, 1.0));
  }
  if (uShowCalGrid == 1 && uShadeMode != 2) {
    outRgb = overlayCal3D(outRgb, vSurfUv);
    outAlpha = max(outAlpha, 0.94);
  }
  outAlpha *= shutterMask3D;
  if (outAlpha <= 0.001) discard;

  fragColor = vec4(clamp(outRgb, 0.0, 1.0), clamp(outAlpha, 0.0, 1.0));
  fragWorldPos = vec4(vWorldPos, 1.0);
}`;

const FS_MESH3D_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPassTex;
uniform sampler2D uStageMaskTex;
uniform sampler2D uSurfMaskTex;
uniform sampler2D uBackdropTex;
uniform int uUseStageMask;
uniform int uUseSurfMask;
uniform int uUseBackdropBlend;
uniform float uOpacity;
uniform float uBlendGamma;
uniform int uBlendMode;

vec3 evalBlendRgb3D(int mode, vec3 dst, vec3 src) {
  if (mode == 4) return mix(2.0 * dst * src, 1.0 - 2.0 * (1.0 - dst) * (1.0 - src), step(0.5, dst));
  if (mode == 5) {
    vec3 d = mix(((16.0 * dst - 12.0) * dst + 4.0) * dst, sqrt(max(dst, vec3(0.0))), step(0.25, dst));
    return mix(dst - (1.0 - 2.0 * src) * dst * (1.0 - dst), dst + (2.0 * src - 1.0) * (d - dst), step(0.5, src));
  }
  if (mode == 6) return max(dst, src);
  if (mode == 7) return min(dst, src);
  if (mode == 8) return abs(dst - src);
  if (mode == 9) return dst + src - 2.0 * dst * src;
  if (mode == 10) return max(vec3(0.0), dst - src);
  return src;
}

void main() {
  vec4 src = texture(uPassTex, vUv);
  if (src.a <= 0.0005) discard;

  float maskFactor = 1.0;
  if (uUseStageMask == 1) maskFactor *= texture(uStageMaskTex, vUv).r;
  if (uUseSurfMask == 1) maskFactor *= texture(uSurfMaskTex, vUv).r;
  if (maskFactor <= 0.001) discard;

  float alpha = clamp(src.a * maskFactor * uOpacity, 0.0, 1.0);
  if (uBlendGamma > 1.001 && alpha < 0.9999) {
    alpha = pow(alpha, 1.0 / uBlendGamma);
  }
  if (alpha <= 0.0005) discard;

  if (uBlendMode == 11 && uUseBackdropBlend == 1) {
    vec3 dst = clamp(texture(uBackdropTex, vUv).rgb, 0.0, 1.0);
    float maskAmt = clamp(dot(src.rgb, vec3(0.2126, 0.7152, 0.0722)) * src.a, 0.0, 1.0);
    fragColor = vec4(mix(dst, dst * maskAmt, alpha), 1.0);
    return;
  }

  if (uUseBackdropBlend == 1 && uBlendMode >= 4) {
    vec3 dst = clamp(texture(uBackdropTex, vUv).rgb, 0.0, 1.0);
    vec3 blended = clamp(evalBlendRgb3D(uBlendMode, dst, src.rgb), 0.0, 1.0);
    fragColor = vec4(mix(dst, blended, alpha), 1.0);
  } else if (uBlendMode == 3) {
    fragColor = vec4(mix(vec3(1.0), src.rgb, alpha), alpha);
  } else {
    fragColor = vec4(src.rgb * alpha, alpha);
  }
}`;

const FS_WORLD_POS_BLIT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragWorldPos;
uniform sampler2D uPassWorldTex;
uniform sampler2D uStageMaskTex;
uniform sampler2D uSurfMaskTex;
uniform int uUseStageMask;
uniform int uUseSurfMask;
void main() {
  vec4 wp = texture(uPassWorldTex, vUv);
  if (wp.a <= 0.001) discard;
  float maskFactor = 1.0;
  if (uUseStageMask == 1) maskFactor *= texture(uStageMaskTex, vUv).r;
  if (uUseSurfMask == 1) maskFactor *= texture(uSurfMaskTex, vUv).r;
  if (maskFactor <= 0.001) discard;
  fragWorldPos = vec4(wp.xyz, 1.0);
}`;
