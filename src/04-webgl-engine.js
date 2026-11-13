// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 04-webgl-engine.js — WebGL2 Multi-Pass Compositor, Masks, Curved Mesh & Crossfade
// ============================================================================

const glCanvas = document.getElementById('gl-engine');
const gl = glCanvas.getContext('webgl2', {
  alpha: false,
  antialias: true,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  powerPreference: 'high-performance'
});

if (!gl) {
  alert('Chaos CathodeRay requires WebGL2. Please open in a modern browser (Chrome, Edge, Firefox, or Safari).');
}

// GPU Optical Extensions: 16x Anisotropic Filtering & 16-bit HDR Half-Float FBOs
const extAniso = gl ? (
  gl.getExtension('EXT_texture_filter_anisotropic') ||
  gl.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
  gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
) : null;
const maxAniso = (gl && extAniso)
  ? Math.min(16, gl.getParameter(extAniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1)
  : 1;
const extColorBufferFloat = gl ? gl.getExtension('EXT_color_buffer_float') : null;
gl?.getExtension('OES_texture_float_linear');
gl?.getExtension('EXT_float_blend');
let supportsHalfFloatFbo = !!extColorBufferFloat;

const glCaps = {
  maxAniso,
  supportsHalfFloatFbo,
  activeHdr: false
};

// ----------------------------------------------------------------------------
// ADAPTIVE PERFORMANCE GOVERNOR
// Watches real frame time and trades internal resolution of procedural sources
// and the 3D previz for frame rate. The canonical stage canvas (what projectors
// output) always stays at full resolution.
//   state.renderQuality: 'auto' (default) | 'full' | 'fast'
// ----------------------------------------------------------------------------
const perfGovernor = {
  emaMs: 16.7,
  jitter: 0,           // average |frame interval − ema|: small when frames arrive at a steady rate
  scale: 1.0,          // 0.5 .. 1.0, applied to generator sources & previz
  ceiling: 1.0,        // last scale that proved too slow is avoided for a while
  ceilingUntil: 0,
  goodSince: 0,
  lastAdjust: 0,
  floorSince: 0,       // when we settled at the lowest scale while still slow
  probe: null,         // { since, floorEma } while testing whether full quality is any slower
  probeWaitMs: 30000,  // back-off between probes when the GPU really is the bottleneck
  probeAfter: 0,
  overSince: 0,        // when frames first got slower than the cap (one long frame must not uncap)
  capped: false,       // the browser (or display) limits the frame rate — quality doesn't matter
  capMs: 0
};

// Lowering resolution only helps when the GPU is the bottleneck. When the browser caps the page
// (Chrome Energy Saver on battery, a 30 Hz display…) frames arrive every 33.3 ms no matter what.
// So once we sit at the lowest scale and are still slow, we run a short A/B test: go back to full
// quality for ~1.5 s. Same frame rate → capped: stay at 100 %. Slower → real GPU limit: back down,
// and wait longer before trying again.
function updatePerfGovernor(dtMs, nowMs) {
  const g = perfGovernor;
  const dt = clamp(dtMs, 4, 120);
  g.jitter = g.jitter * 0.9 + Math.abs(dt - g.emaMs) * 0.1;
  g.emaMs = g.emaMs * 0.9 + dt * 0.1;
  if (g.capped) {
    if (g.emaMs < g.capMs * 0.8) { g.capped = false; g.lastAdjust = nowMs; g.probeWaitMs = 30000; }  // cap lifted (plugged in)
    else if (g.emaMs > g.capMs * 1.15) {                                                                  // genuinely slower than the cap…
      if (!g.overSince) g.overSince = nowMs;
      if (nowMs - g.overSince > 1200) { g.capped = false; g.overSince = 0; g.lastAdjust = nowMs; }      // …for more than a moment
    } else g.overSince = 0;
  }
  const mode = state.renderQuality || 'auto';
  if (mode === 'full') { g.scale = 1.0; g.probe = null; return g.scale; }
  if (mode === 'fast') { g.scale = 0.5; g.probe = null; return g.scale; }
  if (g.capped) { g.scale = 1.0; return g.scale; }

  if (g.probe) {
    const age = nowMs - g.probe.since;
    if (age < 1500 || (age < 3000 && g.jitter > 2.5)) return g.scale;
    const fullEma = g.emaMs;
    const floorEma = g.probe.floorEma;
    g.probe = null;
    g.floorSince = 0;
    g.lastAdjust = nowMs;
    if (fullEma <= floorEma * 1.08) {
      g.capped = true;
      g.capMs = Math.max(fullEma, floorEma);
      g.scale = 1.0;
      g.ceiling = 1.0;
      g.ceilingUntil = 0;
    } else {
      g.scale = 0.5;
      g.ceiling = 0.5;
      g.ceilingUntil = nowMs + 12000;
      g.probeAfter = nowMs + g.probeWaitMs;
      g.probeWaitMs = Math.min(300000, g.probeWaitMs * 2);
    }
    return g.scale;
  }

  if (nowMs - g.lastAdjust < 700) return g.scale;
  if (nowMs > g.ceilingUntil) g.ceiling = 1.0;
  if (g.emaMs > 19.5 && g.scale > 0.5) {
    g.ceiling = g.scale;
    g.ceilingUntil = nowMs + 12000;
    g.scale = Math.max(0.5, g.scale - 0.125);
    g.lastAdjust = nowMs;
    g.goodSince = 0;
    g.floorSince = 0;
  } else if (g.emaMs > 19.5 && g.scale <= 0.5) {
    if (!g.floorSince) g.floorSince = nowMs;
    // Don't probe: when too slow to judge (> 100 ms), during a fade, or in LIVE with outputs open
    // (a probe briefly loads the GPU at full quality).
    const quietNow = !(state.crossfade && state.crossfade.active)
      && !(state.room === 'live' && typeof isAnyOutputWindowOpen === 'function' && isAnyOutputWindowOpen());
    if (nowMs - g.floorSince > 3000 && g.jitter < 2.5 && nowMs >= g.probeAfter && g.emaMs < 100 && quietNow) {
      g.probe = { since: nowMs, floorEma: g.emaMs };
      g.scale = 1.0;
      g.lastAdjust = nowMs;
    }
  } else if (g.emaMs < 17.6) {
    g.floorSince = 0;
    if (!g.goodSince) g.goodSince = nowMs;
    const next = Math.min(1.0, g.scale + 0.125);
    if (next > g.scale && nowMs - g.goodSince > 2500 && next < g.ceiling + 1e-6 && !(next >= g.ceiling && nowMs < g.ceilingUntil)) {
      g.scale = next;
      g.lastAdjust = nowMs;
      g.goodSince = nowMs;
      if (g.scale >= 1.0) { g.probeWaitMs = 30000; g.probeAfter = 0; } // GPU recovered: a later cap is detected promptly
    }
  } else {
    g.goodSince = 0;
  }
  return g.scale;
}

// A projector's alignment crosshair (ch.screen) is drawn only by that projector's output;
// screen 0 = every output (pin/PnP helpers, single-output setups).
function isCalibCrosshairForSlice(ch, projSlice) {
  return !(ch && ch.screen && projSlice && projSlice.index !== ch.screen);
}

// 0 when not capped, otherwise the frame rate the browser allows (e.g. 30).
function getBrowserFrameRateCap() {
  if ((state.renderQuality || 'auto') !== 'auto') return 0;
  return perfGovernor.capped && perfGovernor.capMs > 0 ? Math.round(1000 / perfGovernor.capMs) : 0;
}

function getAdaptiveRenderScale() {
  return (state.projectorMode || state.isProjectorRole || state.recorder?.active) ? 1.0 : perfGovernor.scale;
}

function createGlTexture(w = 2, h = 2) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (extAniso && maxAniso > 1) {
    gl.texParameterf(gl.TEXTURE_2D, extAniso.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return tex;
}

function uploadImageWithMipmaps(tex, imgSource) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgSource);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (extAniso && maxAniso > 1) {
    gl.texParameterf(gl.TEXTURE_2D, extAniso.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
  }
}

function createProgram(vsSrc, fsSrc, uniformList) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.error('VS Error:', gl.getShaderInfoLog(vs));
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.error('FS Error:', gl.getShaderInfoLog(fs));
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Link Error:', gl.getProgramInfoLog(prog));
  }

  const u = {};
  for (const name of uniformList) {
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u };
}

const GEN_UNIFORMS = ['uResolution', 'uTime', 'uScale', 'uDetail', 'uTemp', 'uPalette'];
const progShards = createProgram(FULLSCREEN_VS, FS_SHARDS, GEN_UNIFORMS);
const progCloud = createProgram(FULLSCREEN_VS, FS_CLOUD, GEN_UNIFORMS);
const progTestCard = createProgram(FULLSCREEN_VS, FS_TESTCARD, GEN_UNIFORMS);
const progLaser = createProgram(FULLSCREEN_VS, FS_LASER, GEN_UNIFORMS);
const progGridScan = createProgram(FULLSCREEN_VS, FS_GRIDSCAN, GEN_UNIFORMS);
const progCaustics = createProgram(FULLSCREEN_VS, FS_CAUSTICS, GEN_UNIFORMS);
const progLiquid = createProgram(FULLSCREEN_VS, FS_LIQUID, GEN_UNIFORMS);
const progStrobeGeo = createProgram(FULLSCREEN_VS, FS_STROBEGEO, GEN_UNIFORMS);
const progGradient = createProgram(FULLSCREEN_VS, FS_GRADIENT, GEN_UNIFORMS);
const progVideoLight = createProgram(FULLSCREEN_VS, FS_VIDEOLIGHT, GEN_UNIFORMS);

const progMixbusOrb = createProgram(FULLSCREEN_VS, FS_MIXBUS_ORB, [
  'uOrbTex', 'uFlipY', 'uMirrorX', 'uWeight'
]);

const progPostFx = createProgram(FULLSCREEN_VS, FS_POST_FX, [
  'uInputTex', 'uHistoryTex', 'uTexSize', 'uTime',
  'uFlipY', 'uMirrorX', 'uFxMode', 'uFxParams', 'uFxAccent'
]);

const progInputPreview = createProgram(FULLSCREEN_VS, FS_INPUT_PREVIEW, [
  'uTex', 'uViewRes', 'uFlipY', 'uMirrorX'
]);

const progMaskPoly = createProgram(FULLSCREEN_VS, FS_MASK_POLYGON, [
  'uPts[0]', 'uCount', 'uAspect', 'uFeather', 'uChoke', 'uStrength', 'uInvert'
]);

const COMPOSITOR_UNIFORMS = [
  'uBounds',
  'uSourceTex', 'uStageMaskTex', 'uSurfMaskTex', 'uBackdropTex',
  'uUseStageMask', 'uUseSurfMask', 'uUseBackdropBlend',
  'uFlipSourceY', 'uMirrorSourceX', 'uSourceAspect',
  'uSurfType', 'uQuadWarpMode', 'uInvHomography',
  'uQuadPts[0]', 'uTriPts[0]', 'uTriUvs[0]', 'uPolyPts[0]', 'uPolyCount', 'uStageAspect',
  'uUvPos', 'uUvScale', 'uUvRotRad', 'uUvCrop',
  'uCircleSoftness', 'uCircleInner', 'uCircleAngles',
  'uLineParams', 'uLineChaseMode', 'uLineUseSource', 'uTime',
  'uOpacity', 'uFeather', 'uFeatherEdges', 'uBlendGamma', 'uBlackLevel', 'uBlendMode',
  'uKeyMode', 'uKeyColor', 'uKeyParams',
  'uBrightness', 'uContrast', 'uSaturation', 'uColorTemp',
  'uGamma', 'uHueShiftRad', 'uTint', 'uInvertRgb', 'uChannelMode',
  'uShowCalGrid', 'uAccentColor',
  'uShutterInsert', 'uShutterAngle', 'uShutterSoft'
];

const progCompositor = createProgram(SURFACE_VS, FS_SURFACE_COMPOSITOR, COMPOSITOR_UNIFORMS);
const progMeshCompositor = createProgram(MESH_VS, FS_SURFACE_COMPOSITOR, COMPOSITOR_UNIFORMS);

const progScannerPattern = createProgram(FULLSCREEN_VS, FS_SCANNER_PATTERN, [
  'uKind', 'uBit', 'uBitsTotal', 'uInvert',
  'uUseMasterKeystone', 'uMasterInvHomography', 'uMasterLensK1'
]);

const progFollowspot = createProgram(FULLSCREEN_VS, FS_FOLLOWSPOT, [
  'uMode', 'uAspect', 'uShadowTime',
  'uSpotPos', 'uSpotVel', 'uSpotRadius', 'uSpotSoftness',
  'uSpotGain', 'uAmbient', 'uSpotStretch', 'uSpotRotation', 'uSpotMorph',
  'uShadowDepth', 'uShadowTex', 'uShadowRnd',
  'uColA', 'uColB', 'uColC', 'uSpotTemp',
  'uContentMode', 'uContentTex', 'uFlipContentY', 'uMediaFit', 'uAtmosFbm',
  'uSpotShutters', 'uSpotShutterAngles',
  'uUseGobo', 'uGoboTex', 'uFlipGoboY', 'uGoboRotRad',
  'uUseWorldPos', 'uWorldPosTex', 'uSpotWorldTarget', 'uSpotWorldRadiusM'
]);

const progWorldPosBlit = createProgram(FULLSCREEN_VS, FS_WORLD_POS_BLIT, [
  'uPassWorldTex', 'uStageMaskTex', 'uSurfMaskTex', 'uUseStageMask', 'uUseSurfMask'
]);

const progCrossfade = createProgram(FULLSCREEN_VS, FS_CROSSFADE, [
  'uTexA', 'uTexB', 'uMix', 'uMasterGain', 'uDualBus',
  'uUseMasterKeystone', 'uMasterInvHomography', 'uMasterLensK1',
  'uCalibCrosshair', 'uStageAspect',
  'uSliceRect', 'uEdgeBlend', 'uEdgeGamma', 'uBlackOffset', 'uProjGainKelvin', 'uShowBlendGuide',
  'uUseStagePlanSolver', 'uStagePlanHomography', 'uStagePlanLutTex', 'uConvergentMask'
]);

// GO-during-fade freeze: bakes the visible A↔B dissolve into a still so the next cue
// fades out of exactly what the audience sees (no pop back to the previous target).
const FS_XFADE_FREEZE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;
void main() {
  fragColor = mix(texture(uTexA, vUv), texture(uTexB, vUv), clamp(uMix, 0.0, 1.0));
}`;
const progXfadeFreeze = createProgram(FULLSCREEN_VS, FS_XFADE_FREEZE, ['uTexA', 'uTexB', 'uMix']);

const progMesh3D = createProgram(MESH3D_VS, FS_MESH3D_SURFACE, [
  'uMvpMatrix', 'uModelMatrix', 'uNormalMatrix',
  'uSourceTex', 'uFlipSourceY', 'uMirrorSourceX', 'uSourceAspect', 'uTime',
  'uUvPos', 'uUvScale', 'uUvRotRad', 'uUvCrop',
  'uShadeMode', 'uLightDir', 'uCamWorldPos', 'uLightParams', 'uWireParams',
  'uBlackLevel', 'uKeyMode', 'uKeyColor', 'uKeyParams',
  'uBrightness', 'uContrast', 'uSaturation', 'uColorTemp',
  'uGamma', 'uHueShiftRad', 'uTint', 'uInvertRgb', 'uChannelMode',
  'uShowCalGrid', 'uAccentColor',
  'uShutterInsert', 'uShutterAngle', 'uShutterSoft'
]);

const progMesh3DComposite = createProgram(FULLSCREEN_VS, FS_MESH3D_COMPOSITE, [
  'uPassTex', 'uStageMaskTex', 'uSurfMaskTex', 'uBackdropTex',
  'uUseStageMask', 'uUseSurfMask', 'uUseBackdropBlend',
  'uOpacity', 'uBlendGamma', 'uBlendMode'
]);

const SHADE3D_MODE_CODES = {
  lit_wire: 0,
  lit: 1,
  wire: 2,
  unlit: 3,
  normals: 4
};

function ensureMesh3DVao(geom) {
  if (!geom || !geom.verts || geom.vertCount < 3) return null;
  if (geom._glVao && geom._glVertLen === geom.verts.length) return geom._glVao;

  if (!geom._glVao) geom._glVao = gl.createVertexArray();
  if (!geom._glVbo) geom._glVbo = gl.createBuffer();

  gl.bindVertexArray(geom._glVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, geom._glVbo);
  gl.bufferData(gl.ARRAY_BUFFER, geom.verts, gl.STATIC_DRAW);
  // 11 floats * 4 bytes = 44-byte stride: pos3 (0), norm3 (12), uv2 (24), bary3 (32)
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 44, 24);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 44, 32);
  gl.bindVertexArray(emptyVao);
  geom._glVertLen = geom.verts.length;
  return geom._glVao;
}

// VAOs & Indexed Projective Mesh VBO + IBO (20-byte stride: vec2 aStagePos + vec3 aUvQ)
const emptyVao = gl.createVertexArray();
const meshVao = gl.createVertexArray();
const meshVbo = gl.createBuffer();
const meshIbo = gl.createBuffer();
let uploadedMeshIdxKey = '';

gl.bindVertexArray(meshVao);
gl.bindBuffer(gl.ARRAY_BUFFER, meshVbo);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIbo);
gl.bindVertexArray(emptyVao);

// 1x1 White & Black Fallback Textures for unused slots
const whiteTex1x1 = createGlTexture(1, 1);
gl.bindTexture(gl.TEXTURE_2D, whiteTex1x1);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

const blackTex1x1 = createGlTexture(1, 1);
gl.bindTexture(gl.TEXTURE_2D, blackTex1x1);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

// Milestone 7B: 128x72 RGBA16F Constant-Brightness Optical Field LUT Texture
const stagePlanLutGlTex = createGlTexture(128, 72);
let uploadedStagePlanLutKey = '';
const identStageMat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

// Offscreen Stage, Backdrop, FX Ping-Pong, World-Pos MRT & Mask Framebuffers
function createDynamicFbo(withDepth = false, withWorldMrt = false) {
  const tex = createGlTexture(16, 16);
  let worldTex = null;
  if (withWorldMrt) {
    worldTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, worldTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 16, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  const fbo = gl.createFramebuffer();
  let depthRb = null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (withDepth) {
    depthRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, 16, 16);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, worldTex, depthRb, w: 16, h: 16, isHdr: false };
}

const stageFboA = createDynamicFbo();
const stageFboB = createDynamicFbo();
const stageFboFreeze = createDynamicFbo();
// Chained dissolve (GO mid-fade): the interrupted fade's target keeps rendering live here.
const stageFboChain = createDynamicFbo();

// Bake mix(A, B, m) into the freeze FBO, then swap it into stageFboA (fields swap: A is const).
function bakeCrossfadeFreezeIntoA(fboW, fboH, m, texB = null) {
  resizeFboIfNeeded(stageFboFreeze, fboW, fboH, true);
  gl.bindFramebuffer(gl.FRAMEBUFFER, stageFboFreeze.fbo);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, stageFboFreeze.w, stageFboFreeze.h);
  gl.useProgram(progXfadeFreeze.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, stageFboA.tex);
  gl.uniform1i(progXfadeFreeze.u.uTexA, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texB || stageFboB.tex);
  gl.uniform1i(progXfadeFreeze.u.uTexB, 1);
  gl.uniform1f(progXfadeFreeze.u.uMix, m);
  gl.bindVertexArray(emptyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  for (const k of ['fbo', 'tex', 'worldTex', 'depthRb', 'w', 'h', 'isHdr']) {
    const t = stageFboA[k];
    stageFboA[k] = stageFboFreeze[k];
    stageFboFreeze[k] = t;
  }
}
const stageBackdropFbo = createDynamicFbo();
const fxPingFbo = createDynamicFbo();
const fxPongFbo = createDynamicFbo();
const fxOrientFbo = createDynamicFbo();
const fxHistoryMap = new Map();
const stageMaskFbo = createDynamicFbo();
const surfMaskFbo = createDynamicFbo();
const dmxSampleFbo = createDynamicFbo();
const mesh3dPassFbo = createDynamicFbo(true, true);
const mesh3dOrbitFbo = createDynamicFbo(true, false);
const stageWorldPosFbo = createDynamicFbo(false, false);
const orbThumbFbo = createDynamicFbo(false, false);
const ORB_THUMB_SIZE = 64;
const orbThumbPixels = new Uint8ClampedArray(ORB_THUMB_SIZE * ORB_THUMB_SIZE * 4);
let _orbThumbCursor = 0;
// Orb thumbnails without any GPU→CPU readback: every live source is drawn into a small
// strip at the bottom-left of the WebGL canvas (hidden under the opaque Orbital Mix
// pane), and the radar's 2D canvas drawImage()s straight from the GL canvas — a
// GPU→GPU copy. (A readPixels / getBufferSubData readback stalled LIVE by ~30 ms/frame.)
const ORB_GL_THUMB_PX = 96;
let _orbThumbFrame = 0;

function updateLiveSourceThumbnailsGPU() {
  // Superseded by renderOrbThumbStrip() at the end of renderWebGLWorkspace().
}

function renderOrbThumbStrip(totalW, totalH, areaRect, dpr) {
  if (state.projectorMode || state.layoutMode !== 'mix' || typeof document === 'undefined') return;
  const mixPane = document.getElementById('mix-pane');
  if (!mixPane || mixPane.offsetParent === null || !areaRect) return;
  // Only sources that sit on the radar as orbs (plus nothing else) — and the strip is packed
  // into rows that stay entirely under the opaque mix pane.
  const orbIds = new Set();
  for (const s of state.sources) if (s && s.kind === 'mixbus' && Array.isArray(s.orbs)) s.orbs.forEach(o => orbIds.add(o.sourceId));
  const candidates = state.sources.filter(s => s && s.texture && orbIds.has(s.id) && (s.kind === 'shader' || s.kind === 'isf' || s.kind === 'syphon' || s.kind === 'live'));
  if (candidates.length === 0) return;
  const r = mixPane.getBoundingClientRect();
  const x0 = Math.ceil((r.left - areaRect.left) * dpr) + 2;
  const x1 = Math.floor((r.right - areaRect.left) * dpr) - 2;
  const yTop = Math.ceil((r.top - areaRect.top) * dpr) + 2;
  const S = ORB_GL_THUMB_PX;
  const cols = Math.max(0, Math.floor((x1 - x0) / S));
  const rowsAvail = Math.max(0, Math.floor((totalH - yTop) / S) - 1);
  if (cols === 0 || rowsAvail === 0) return;
  _orbThumbFrame++;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.BLEND);
  gl.enable(gl.SCISSOR_TEST);
  gl.useProgram(progInputPreview.prog);
  gl.bindVertexArray(emptyVao);
  gl.uniform2f(progInputPreview.u.uViewRes, S, S);
  candidates.slice(0, cols * rowsAvail).forEach((src, i) => {
    const gx = x0 + (i % cols) * S;
    const row = Math.floor(i / cols);
    const gy = row * S; // GL y from the bottom of the canvas
    gl.viewport(gx, gy, S, S);
    gl.scissor(gx, gy, S, S);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.texture);
    gl.uniform1i(progInputPreview.u.uTex, 0);
    gl.uniform1i(progInputPreview.u.uFlipY, src.flipY ? 1 : 0);
    gl.uniform1i(progInputPreview.u.uMirrorX, src.mirrorX ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // drawImage() source rect in canvas backing-store pixels (y down).
    src._glThumb = { sx: gx, sy: totalH - gy - S, size: S, frame: _orbThumbFrame };
  });
  gl.disable(gl.SCISSOR_TEST);
}

function getOrbGlThumb(src) {
  return src && src._glThumb && src._glThumb.frame === _orbThumbFrame ? src._glThumb : null;
}
gl.bindTexture(gl.TEXTURE_2D, stageWorldPosFbo.tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

// Milestone 6: Lazy 14-Frame GPU Ring Buffer for Per-Projector Frame Delay (0–200ms)
const PROJ_DELAY_RING_MAX = 14;
const projDelayRing = [];
let projDelayWriteHead = 0;

function resolveDelayedStageTexture(fboW, fboH, delayMs, nowMs) {
  const targetAge = clamp(Number(delayMs) || 0, 0, 200);
  if (targetAge <= 4) return null;

  // Ensure current ring slot exists & matches Stage FBO dimensions (RGBA8 for compact VRAM)
  while (projDelayRing.length < PROJ_DELAY_RING_MAX) {
    projDelayRing.push({ fboObj: createDynamicFbo(), capturedAtMs: -1 });
  }

  const writeSlot = projDelayRing[projDelayWriteHead % PROJ_DELAY_RING_MAX];
  projDelayWriteHead = (projDelayWriteHead + 1) % PROJ_DELAY_RING_MAX;
  resizeFboIfNeeded(writeSlot.fboObj, clamp(Math.round(fboW), 64, 2560), clamp(Math.round(fboH), 64, 1600), false);

  gl.bindFramebuffer(gl.FRAMEBUFFER, writeSlot.fboObj.fbo);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, writeSlot.fboObj.w, writeSlot.fboObj.h);
  gl.useProgram(progCrossfade.prog);
  const xu = progCrossfade.u;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.crossfade.active ? stageFboA.tex : stageFboB.tex);
  gl.uniform1i(xu.uTexA, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, stageFboB.tex);
  gl.uniform1i(xu.uTexB, 1);
  gl.uniform1i(xu.uDualBus, state.crossfade.active ? 1 : 0);
  gl.uniform1f(xu.uMix, state.crossfade.mix);
  gl.uniform1f(xu.uMasterGain, 1.0);
  gl.uniform1f(xu.uStageAspect, writeSlot.fboObj.w / Math.max(1, writeSlot.fboObj.h));
  gl.uniform1i(xu.uUseMasterKeystone, 0);
  gl.uniform1f(xu.uMasterLensK1, 0.0);
  gl.uniform3f(xu.uCalibCrosshair, 0.5, 0.5, 0.0);
  gl.uniform4f(xu.uSliceRect, 0.0, 0.0, 1.0, 1.0);
  gl.uniform4f(xu.uEdgeBlend, 0.0, 0.0, 0.0, 0.0);
  gl.uniform1f(xu.uEdgeGamma, 1.0);
  gl.uniform1f(xu.uBlackOffset, 0.0);
  gl.uniform2f(xu.uProjGainKelvin, 1.0, 0.0);
  gl.uniform1i(xu.uShowBlendGuide, 0);
  gl.uniform1i(xu.uUseStagePlanSolver, 0);
  gl.uniformMatrix3fv(xu.uStagePlanHomography, false, identStageMat3);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, whiteTex1x1);
  gl.uniform1i(xu.uStagePlanLutTex, 2);
  gl.uniform4f(xu.uConvergentMask, 0.5, 0.5, 1.0, 0.0);
  gl.bindVertexArray(emptyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  writeSlot.capturedAtMs = nowMs;

  // Pick ring slot closest to (nowMs - targetAge)
  const desiredTs = nowMs - targetAge;
  let bestTex = writeSlot.fboObj.tex;
  let bestDiff = Infinity;
  for (const slot of projDelayRing) {
    if (slot.capturedAtMs < 0) continue;
    const diff = Math.abs(slot.capturedAtMs - desiredTs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestTex = slot.fboObj.tex;
    }
  }
  return bestTex;
}

function readStageDownsamplePixels(targetW, targetH, outUint8) {
  if (!outUint8 || outUint8.length < targetW * targetH * 4) return false;
  if (stageFboB.w < 16 || stageFboB.h < 16) return false;

  resizeFboIfNeeded(dmxSampleFbo, targetW, targetH, false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dmxSampleFbo.fbo);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, dmxSampleFbo.w, dmxSampleFbo.h);
  gl.useProgram(progCrossfade.prog);
  const xu = progCrossfade.u;

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.crossfade.active ? stageFboA.tex : stageFboB.tex);
  gl.uniform1i(xu.uTexA, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, stageFboB.tex);
  gl.uniform1i(xu.uTexB, 1);
  gl.uniform1i(xu.uDualBus, state.crossfade.active ? 1 : 0);
  gl.uniform1f(xu.uMix, state.crossfade.mix);
  gl.uniform1f(xu.uMasterGain, 1.0);
  gl.uniform1f(xu.uStageAspect, dmxSampleFbo.w / Math.max(1, dmxSampleFbo.h));
  gl.uniform1i(xu.uUseMasterKeystone, 0);
  gl.uniform1f(xu.uMasterLensK1, 0.0);
  gl.uniform3f(xu.uCalibCrosshair, 0.5, 0.5, 0.0);
  gl.uniform4f(xu.uSliceRect, 0.0, 0.0, 1.0, 1.0);
  gl.uniform4f(xu.uEdgeBlend, 0.0, 0.0, 0.0, 0.0);
  gl.uniform1f(xu.uEdgeGamma, 1.0);
  gl.uniform1f(xu.uBlackOffset, 0.0);
  gl.uniform2f(xu.uProjGainKelvin, 1.0, 0.0);
  gl.uniform1i(xu.uShowBlendGuide, 0);
  gl.uniform1i(xu.uUseStagePlanSolver, 0);
  gl.uniformMatrix3fv(xu.uStagePlanHomography, false, identStageMat3);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, whiteTex1x1);
  gl.uniform1i(xu.uStagePlanLutTex, 2);
  gl.uniform4f(xu.uConvergentMask, 0.5, 0.5, 1.0, 0.0);

  gl.bindVertexArray(emptyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.readPixels(0, 0, dmxSampleFbo.w, dmxSampleFbo.h, gl.RGBA, gl.UNSIGNED_BYTE, outUint8);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return true;
}

const maxStageFboDim = Math.min(8192, (gl && typeof gl.getParameter === 'function' ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 8192) || 8192);

function resizeFboIfNeeded(fboObj, targetW, targetH, allowHalfFloat = false) {
  const w = clamp(Math.round(targetW), 64, maxStageFboDim);
  const h = clamp(Math.round(targetH), 64, maxStageFboDim);
  const wantHdr = !!(allowHalfFloat && state.hdrPipeline && supportsHalfFloatFbo);
  if (fboObj.w === w && fboObj.h === h && fboObj.isHdr === wantHdr) return;

  fboObj.w = w;
  fboObj.h = h;
  if (fboObj.depthRb) {
    gl.bindRenderbuffer(gl.RENDERBUFFER, fboObj.depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
  gl.bindTexture(gl.TEXTURE_2D, fboObj.tex);
  if (wantHdr) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    if (fboObj.worldTex) {
      gl.bindTexture(gl.TEXTURE_2D, fboObj.worldTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboObj.fbo);
    if (fboObj.worldTex) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, fboObj.worldTex, 0);
    }
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (fboObj.worldTex && !ok) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, null, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (ok) {
      fboObj.isHdr = true;
      return;
    }
    supportsHalfFloatFbo = false;
    glCaps.supportsHalfFloatFbo = false;
    gl.bindTexture(gl.TEXTURE_2D, fboObj.tex);
  }
  if (fboObj.worldTex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboObj.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, null, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, fboObj.tex);
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  fboObj.isHdr = false;
}

// Pre-allocated flat uniform buffers
const maskPtsBuf = new Float32Array(256);
const quadPtsBuf = new Float32Array(8);
const triPtsBuf = new Float32Array(6);
const triUvsBuf = new Float32Array(6);
const polyPtsBuf = new Float32Array(96);

const LINE_CHASE_CODES = {
  solid: 0,
  chase: 1,
  dual: 2,
  boomerang: 3,
  dash: 4,
  pulse: 5
};

const BLEND_MODE_CODES = {
  normal: 0,
  additive: 1,
  screen: 2,
  multiply: 3,
  overlay: 4,
  softlight: 5,
  lighten: 6,
  darken: 7,
  difference: 8,
  exclusion: 9,
  subtract: 10,
  alphamask: 11
};

const KEY_MODE_CODES = {
  off: 0,
  luma: 1,
  chroma: 2
};

const CHANNEL_MODE_CODES = {
  rgb: 0,
  bgr: 1,
  rrr: 2,
  ggg: 3,
  bbb: 4,
  luma: 5
};

let compositorClockSec = 0;

// ============================================================================
// SAFE LIVE ISF v2 / GLSL HOT-SWAP COMPILER & MULTI-PASS EXECUTOR
// ============================================================================

function compileIsfRuntimeSafe(rawCode) {
  const transpiled = transpileIsfToWebGL2(rawCode);
  if (!transpiled.ok) {
    return { ok: false, error: transpiled.error, meta: transpiled.meta };
  }

  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, FULLSCREEN_VS);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(vs) || 'Vertex shader error';
    gl.deleteShader(vs);
    return { ok: false, error: err, meta: transpiled.meta };
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, transpiled.fsSource);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    const rawLog = gl.getShaderInfoLog(fs) || 'Fragment shader compile error';
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return {
      ok: false,
      error: formatGlShaderErrorLog(rawLog, transpiled.preambleLines),
      meta: transpiled.meta
    };
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const rawLog = gl.getProgramInfoLog(prog) || 'Program link error';
    gl.deleteProgram(prog);
    return {
      ok: false,
      error: formatGlShaderErrorLog(rawLog, transpiled.preambleLines),
      meta: transpiled.meta
    };
  }

  const u = {};
  for (const name of transpiled.uniformNames) {
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { ok: true, meta: transpiled.meta, runtime: { prog, u } };
}

function executeIsfPasses(runtime, meta, values, events, simTime, dt, frameIdx, outFboHandle, outW, outH, passBuffersMap, inputImageTex) {
  if (!runtime || !runtime.prog) return;
  const passes = (meta && Array.isArray(meta.passes) && meta.passes.length > 0) ? meta.passes : [{}];
  const inputs = (meta && Array.isArray(meta.inputs)) ? meta.inputs : [];

  // Ensure persistent/target ping-pong FBO pairs exist
  if (passBuffersMap) {
    for (const p of passes) {
      if (!p || !p.target) continue;
      let pair = passBuffersMap.get(p.target);
      if (!pair) {
        pair = { read: createDynamicFbo(), write: createDynamicFbo() };
        passBuffersMap.set(p.target, pair);
      }
      resizeFboIfNeeded(pair.read, outW, outH, !!p.float);
      resizeFboIfNeeded(pair.write, outW, outH, !!p.float);
    }
  }

  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(emptyVao);
  gl.useProgram(runtime.prog);
  const u = runtime.u;

  for (let pIdx = 0; pIdx < passes.length; pIdx++) {
    const pass = passes[pIdx] || {};
    const targetPair = (pass.target && passBuffersMap) ? passBuffersMap.get(pass.target) : null;
    const dstFbo = targetPair ? targetPair.write.fbo : outFboHandle;

    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
    gl.viewport(0, 0, outW, outH);

    if (u.TIME) gl.uniform1f(u.TIME, simTime);
    if (u.uTime) gl.uniform1f(u.uTime, simTime);
    if (u.TIMEDELTA) gl.uniform1f(u.TIMEDELTA, dt);
    if (u.RENDERSIZE) gl.uniform2f(u.RENDERSIZE, outW, outH);
    if (u.uResolution) gl.uniform2f(u.uResolution, outW, outH);
    if (u.PASSINDEX) gl.uniform1i(u.PASSINDEX, pIdx);
    if (u.FRAMEINDEX) gl.uniform1i(u.FRAMEINDEX, frameIdx);

    let texUnit = 0;
    const boundTargets = new Set();

    for (const inp of inputs) {
      const loc = u[inp.name];
      if (!loc && inp.type !== 'image') continue;
      const val = values ? values[inp.name] : undefined;

      if (inp.type === 'float') {
        gl.uniform1f(loc, Number(val ?? inp.defaultVal ?? 0));
      } else if (inp.type === 'bool') {
        gl.uniform1i(loc, (val !== undefined ? !!val : !!inp.defaultVal) ? 1 : 0);
      } else if (inp.type === 'event') {
        gl.uniform1i(loc, (events && events[inp.name]) ? 1 : 0);
      } else if (inp.type === 'long') {
        gl.uniform1i(loc, Math.round(Number(val ?? inp.defaultVal ?? 0)));
      } else if (inp.type === 'color') {
        const c = Array.isArray(val) ? val : inp.defaultVal;
        gl.uniform4f(loc, Number(c[0] ?? 1), Number(c[1] ?? 1), Number(c[2] ?? 1), Number(c[3] ?? 1));
      } else if (inp.type === 'point2D') {
        const pt = Array.isArray(val) ? val : inp.defaultVal;
        gl.uniform2f(loc, Number(pt[0] ?? 0.5), Number(pt[1] ?? 0.5));
      } else if (inp.type === 'image') {
        if (loc && texUnit < 8) {
          gl.activeTexture(gl.TEXTURE0 + texUnit);
          gl.bindTexture(gl.TEXTURE_2D, inputImageTex || blackTex1x1);
          gl.uniform1i(loc, texUnit);
          boundTargets.add(inp.name);
          texUnit++;
        }
      }
    }

    if (passBuffersMap) {
      for (const [tName, pair] of passBuffersMap.entries()) {
        if (boundTargets.has(tName)) continue;
        const loc = u[tName];
        if (loc && texUnit < 8) {
          gl.activeTexture(gl.TEXTURE0 + texUnit);
          gl.bindTexture(gl.TEXTURE_2D, pair.read.tex);
          gl.uniform1i(loc, texUnit);
          boundTargets.add(tName);
          texUnit++;
        }
      }
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (targetPair) {
      const tmp = targetPair.read;
      targetPair.read = targetPair.write;
      targetPair.write = tmp;

      // If final pass rendered to a named TARGET, blit into main outFboHandle
      if (pIdx === passes.length - 1 && outFboHandle) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, targetPair.read.fbo);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, outFboHandle);
        gl.blitFramebuffer(0, 0, outW, outH, 0, 0, outW, outH, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outFboHandle);
      }
    }
  }

  if (events) {
    for (const k of Object.keys(events)) events[k] = false;
  }
}

// ============================================================================
// SOURCE TEXTURE & FOLLOWSPOT PHYSICS UPDATES
// ============================================================================

function collectNeededSourceIds() {
  const needed = new Set();
  // Sources that must render at full (governor) resolution; everything else in `needed`
  // is only feeding a 96 px orb preview and renders at thumbnail resolution.
  const fullRes = new Set();
  needed.fullRes = fullRes;
  if ((state.layoutMode === 'split' || state.layoutMode === 'input') && !state.projectorMode && state.activeSourceId) {
    needed.add(state.activeSourceId);
    fullRes.add(state.activeSourceId);
  }
  if ((state.layoutMode === 'mix' || state.room === 'live') && !state.projectorMode && typeof getMixbusSource === 'function') {
    const mixSrc = getMixbusSource();
    if (mixSrc) needed.add(mixSrc.id);
  }
  if (state.shaderDrawerOpen && state.shaderEditorSourceId) {
    needed.add(state.shaderEditorSourceId);
    fullRes.add(state.shaderEditorSourceId);
  }
  const resolveRawSourceId = (sid) => {
    if (!sid || sid === '__nebula__' || sid === '__pure_light__') return null;
    if (sid === 'bus:orbital') {
      const m = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
      return m ? m.id : 'src_mixbus';
    }
    return sid;
  };
  const collectFromList = (surfaces, groups) => {
    if (!surfaces) return;
    const grpList = groups || state.groups;
    const anySolo = surfaces.some(s => {
      const eff = getEffectiveSurfaceProps(s, grpList);
      return eff.solo && eff.visible;
    });
    for (const s of surfaces) {
      const eff = getEffectiveSurfaceProps(s, grpList);
      if (!eff.visible) continue;
      if (anySolo && !eff.solo) continue;
      if (s.type === 'line' && !s.lineUseSource) continue;
      const rsid = resolveRawSourceId(s.sourceId);
      if (rsid) { needed.add(rsid); fullRes.add(rsid); }
    }
  };
  const collectFromSpots = (spotsArr) => {
    if (!Array.isArray(spotsArr)) return;
    for (const sp of spotsArr) {
      if (!sp || !sp.mode || sp.mode === 'off') continue;
      const cId = resolveRawSourceId(sp.contentSrc);
      if (cId) { needed.add(cId); fullRes.add(cId); }
      const gId = resolveRawSourceId(sp.goboSrc);
      if (gId) { needed.add(gId); fullRes.add(gId); }
    }
  };
  collectFromList(state.surfaces, state.groups);
  collectFromSpots(state.spots || [state.followspot]);
  if (state.crossfade.active && state.crossfade.chainToScene) {
    const cs = state.crossfade.chainToScene;
    collectFromList(cs.surfaces, cs.groups);
    collectFromSpots(cs.spots || (cs.followspot ? [cs.followspot] : null));
  }
  if (state.crossfade.active && state.crossfade.fromScene) {
    collectFromList(state.crossfade.fromScene.surfaces, state.crossfade.fromScene.groups);
    collectFromSpots(state.crossfade.fromScene.spots || (state.crossfade.fromScene.followspot ? [state.crossfade.fromScene.followspot] : null));
  }

  // Expand Mix Circle Bus orb dependencies so every active orb texture renders fresh this frame!
  for (const src of state.sources) {
    if (src.kind === 'mixbus' && needed.has(src.id) && Array.isArray(src.orbs)) {
      for (const orb of src.orbs) {
        if (!orb || orb.sourceId === src.id) continue;
        const weight = computeMixbusOrbWeight(orb, src.falloffCurve);
        if (state.layoutMode === 'mix' || state.room === 'live' || state.activeSourceId === src.id || weight > 0.001) {
          needed.add(orb.sourceId);
          // Only orbs that actually contribute to a bus that's on stage need full resolution.
          if (fullRes.has(src.id) && weight > 0.001) fullRes.add(orb.sourceId);
        }
      }
    }
  }

  return needed;
}

function updateFollowspotPhysics(dt) {
  const list = Array.isArray(state.spots) && state.spots.length > 0 ? state.spots : [state.followspot];
  if (state.followspot !== list[0]) state.followspot = list[0];
  for (const fs of list) {
    if (!fs) continue;
    fs.shadowTime = (fs.shadowTime || 0) + dt * (fs.shadowSpeed ?? 0.65);
    if (Math.abs(fs.goboRotSpeed || 0) > 0.001) {
      fs.goboAngle = (((fs.goboAngle || 0) + dt * fs.goboRotSpeed) % 360 + 360) % 360;
    }

    // Viscous inertial tracking from targetX/Y -> spotX/Y
    const prevX = fs.spotX;
    const prevY = fs.spotY;
    const rate = mixScalar(28.0, 2.4, clamp(fs.inertia ?? 0.78, 0, 0.98));
    const alpha = 1.0 - Math.exp(-rate * dt);
    fs.spotX += ((fs.targetX ?? fs.spotX) - fs.spotX) * alpha;
    fs.spotY += ((fs.targetY ?? fs.spotY) - fs.spotY) * alpha;
    // 3D-aimed spots also glide in depth / across the stage floor (05h)
    if (Number.isFinite(fs.targetDepthM)) {
      fs.performerDepthM = (Number(fs.performerDepthM) || 0) + (fs.targetDepthM - (Number(fs.performerDepthM) || 0)) * alpha;
    }
    if (Number.isFinite(fs.targetStageXM) && Number.isFinite(fs.stageXM)) fs.stageXM += (fs.targetStageXM - fs.stageXM) * alpha;
    if (Number.isFinite(fs.targetStageZM) && Number.isFinite(fs.stageZM)) fs.stageZM += (fs.targetStageZM - fs.stageZM) * alpha;
    // Smooth fade up / fade out (fs._lvl) when the spot goes live or back to pre-aim.
    const isOn = fs.enabled !== false && fs.mode && fs.mode !== 'off';
    if (isOn) fs._lastMode = fs.mode;
    const fadeSec = clamp(Number(fs.fadeSec ?? 0.5), 0, 10);
    const lvlTarget = isOn ? 1 : 0;
    if (!Number.isFinite(fs._lvl) || fadeSec < 0.02) fs._lvl = lvlTarget;
    else fs._lvl = lvlTarget > fs._lvl ? Math.min(lvlTarget, fs._lvl + dt / fadeSec) : Math.max(lvlTarget, fs._lvl - dt / fadeSec);

    const rawVx = (fs.spotX - prevX) / Math.max(0.001, dt);
    const rawVy = (fs.spotY - prevY) / Math.max(0.001, dt);
    fs.velX = (fs.velX || 0) * 0.82 + rawVx * 0.18;
    fs.velY = (fs.velY || 0) * 0.82 + rawVy * 0.18;
  }
}

function mixScalar(a, b, t) {
  return a + (b - a) * t;
}

function getBuiltInShaderProgram(shaderKind) {
  switch (shaderKind) {
    case 'cloud': return progCloud;
    case 'testcard': return progTestCard;
    case 'laser': return progLaser;
    case 'gridscan': return progGridScan;
    case 'caustics': return progCaustics;
    case 'liquid': return progLiquid;
    case 'strobegeo': return progStrobeGeo;
    case 'gradient': return progGradient;
    case 'videolight': return progVideoLight;
    case 'shards':
    default: return progShards;
  }
}

function renderMixbusSourcePass(mixSrc) {
  if (!mixSrc || !mixSrc.fbo || !Array.isArray(mixSrc.orbs)) return;
  gl.bindFramebuffer(gl.FRAMEBUFFER, mixSrc.fbo);
  gl.disable(gl.SCISSOR_TEST);
  gl.viewport(0, 0, mixSrc.width, mixSrc.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.enable(gl.BLEND);
  const bm = mixSrc.blendMode || 'screen';
  if (bm === 'additive') {
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
  } else if (bm === 'lighten') {
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
  } else if (bm === 'normal') {
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  } else {
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.ONE_MINUS_DST_COLOR, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  gl.bindVertexArray(emptyVao);
  gl.useProgram(progMixbusOrb.prog);
  const mu = progMixbusOrb.u;

  for (const orb of mixSrc.orbs) {
    if (!orb || orb.sourceId === mixSrc.id) continue;
    const w = computeMixbusOrbWeight(orb, mixSrc.falloffCurve);
    if (w <= 0.001) continue;
    const orbSrc = getSourceById(orb.sourceId);
    if (!orbSrc || !orbSrc.texture) continue;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, orbSrc.texture);
    gl.uniform1i(mu.uOrbTex, 0);
    gl.uniform1i(mu.uFlipY, orbSrc.flipY ? 1 : 0);
    gl.uniform1i(mu.uMirrorX, orbSrc.mirrorX ? 1 : 0);
    gl.uniform1f(mu.uWeight, w);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  gl.blendEquation(gl.FUNC_ADD);
  gl.disable(gl.BLEND);
}

// Heavy procedural generators (measured 6–13 ms each at 1080p on an M2).
const HEAVY_GENERATOR_KINDS = new Set(['shards', 'liquid', 'cloud', 'videolight']);
let _sourceFrameCounter = 0;

function updateSourceTextures(dt) {
  compositorClockSec += dt;
  _sourceFrameCounter++;
  const skipGpu = state.ecoMode && !state.projectorMode;
  const neededIds = skipGpu ? new Set() : collectNeededSourceIds();
  // Under GPU pressure (operator window, Auto/Fast quality) heavy generators refresh on
  // alternate frames, staggered so two heavy sources never render in the same frame.
  const staggerHeavy = !state.projectorMode && !state.isProjectorRole && !state.recorder?.active
    && (state.renderQuality === 'fast' || (state.renderQuality !== 'full' && perfGovernor.scale < 0.999));
  let heavySlot = 0;

  // Pass 1: Render all Procedural Shaders, Live ISF Shaders, Videos & Live Captures
  for (const src of state.sources) {
    if (src.kind === 'shader') {
      if (src.playing) {
        src.simTime += dt * src.speed;
      }
      if (skipGpu || !neededIds.has(src.id)) continue;

      // Procedural sources render at the governor's internal resolution (texture
      // storage follows it; consumers sample 0..1 so nothing else changes).
      const thumbOnly = neededIds.fullRes && !neededIds.fullRes.has(src.id);
      const rs = thumbOnly ? Math.min(1, 256 / Math.max(1, src.width)) : getAdaptiveRenderScale();
      const rw = Math.max(64, Math.round(src.width * rs));
      const rh = Math.max(36, Math.round(src.height * rs));
      if (staggerHeavy && !thumbOnly && HEAVY_GENERATOR_KINDS.has(src.shaderKind)) {
        const slot = heavySlot++;
        if ((_sourceFrameCounter + slot) % 2 === 1 && src._rw === rw && src._rh === rh) continue;
      }
      if (src._rw !== rw || src._rh !== rh) {
        gl.bindTexture(gl.TEXTURE_2D, src.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rw, rh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        src._rw = rw;
        src._rh = rh;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, src.fbo);
      // Full overwrite: tell the tile GPU not to load the previous contents.
      gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.COLOR_ATTACHMENT0]);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, rw, rh);
      gl.bindVertexArray(emptyVao);

      const progObj = getBuiltInShaderProgram(src.shaderKind);
      gl.useProgram(progObj.prog);
      if (progObj.u.uResolution) gl.uniform2f(progObj.u.uResolution, rw, rh);
      if (progObj.u.uTime) gl.uniform1f(progObj.u.uTime, src.simTime);
      if (progObj.u.uScale) gl.uniform1f(progObj.u.uScale, src.scale);
      if (progObj.u.uDetail) gl.uniform1f(progObj.u.uDetail, src.detail);
      if (progObj.u.uTemp) gl.uniform1f(progObj.u.uTemp, src.temp);
      if (progObj.u.uPalette) gl.uniform1i(progObj.u.uPalette, src.palette);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (src.kind === 'isf') {
      if (src._needsInitialCompile && !src._isfRuntime) {
        src._needsInitialCompile = false;
        compileAndAttachIsfSource(src, src.isfCode);
      }
      if (src.playing) {
        src.simTime += dt * (src.speed ?? 1.0);
        src.frameIndex = (src.frameIndex || 0) + 1;
      }
      if (skipGpu || !neededIds.has(src.id) || !src._isfRuntime) continue;

      const previewInTex = (src.isfMeta && src.isfMeta.isEffect && state.sources[0])
        ? state.sources[0].texture
        : blackTex1x1;
      executeIsfPasses(
        src._isfRuntime,
        src.isfMeta,
        src.isfValues,
        src.isfEvents,
        src.simTime,
        dt,
        src.frameIndex || 0,
        src.fbo,
        src.width,
        src.height,
        src._passBuffers,
        previewInTex
      );
    } else if (src.kind === 'video' && !src.offline) {
      updateProVideoSource(src, dt, skipGpu, neededIds.has(src.id));
    } else if (src.kind === 'live' || src.kind === 'syphon') {
      const vid = src.video;
      if (src.streamEnded || !vid || vid.readyState < 2 || skipGpu || !neededIds.has(src.id)) continue;
      gl.bindTexture(gl.TEXTURE_2D, src.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vid);
      src.needsUpload = false;
    } else if (src.kind === 'text') {
      if (skipGpu || !neededIds.has(src.id)) {
        if (src.playing && !state.isProjectorRole) {
          src.simTime += dt * (src.animSpeed ?? 1.0);
        }
        continue;
      }
      renderTextSourceCanvas(src, dt);
    }
  }

  // Pass 2: Composite Virtual "Mix Circle" Bus after all orb source textures are fresh
  if (!skipGpu) {
    for (const src of state.sources) {
      if (src.kind === 'mixbus' && neededIds.has(src.id)) {
        renderMixbusSourcePass(src);
      }
    }
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// ============================================================================
// POLYGON MASK PASS, SCENE COMPOSITOR & DUAL-FBO CUE CROSSFADE
// ============================================================================

function applyBlendModeGL(blendName) {
  const code = BLEND_MODE_CODES[blendName] ?? 0;
  if (code >= 4) {
    gl.disable(gl.BLEND);
    return code;
  }
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  switch (code) {
    case 1: // additive
      gl.blendFunc(gl.ONE, gl.ONE);
      return 1;
    case 2: // screen
      gl.blendFuncSeparate(gl.ONE_MINUS_DST_COLOR, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      return 2;
    case 3: // multiply
      gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ZERO, gl.ONE);
      return 3;
    case 0: // normal
    default:
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      return 0;
  }
}

function applyFxChainToTexture(inTex, inW, inH, inFlipY, inMirrorX, fxChain, accentHex = '#6fd3ff') {
  const activeFx = Array.isArray(fxChain) ? fxChain.filter(fx => fx && fx.enabled !== false) : [];
  if (activeFx.length === 0) {
    return { texture: inTex, width: inW, height: inH, flipY: !!inFlipY, mirrorX: !!inMirrorX, fboObj: null };
  }

  const w = clamp(Math.round(inW || 1920), 64, 2560);
  const h = clamp(Math.round(inH || 1080), 64, 1440);
  resizeFboIfNeeded(fxPingFbo, w, h, true);
  resizeFboIfNeeded(fxPongFbo, w, h, true);

  let curTex = inTex;
  let curFlipY = !!inFlipY;
  let curMirrorX = !!inMirrorX;
  let lastDstFbo = null;
  let passCount = 0;
  const accentRgb = hexToRgbNorm(accentHex || '#6fd3ff');

  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(emptyVao);

  for (let i = 0; i < activeFx.length; i++) {
    const fx = activeFx[i];
    const def = getFxDefinition(fx.type);
    if (!def) continue;

    const dstFbo = (passCount % 2 === 0) ? fxPingFbo : fxPongFbo;

    if (def.isCustomIsf) {
      if (!def._isfRuntime && def.isfCode) {
        const comp = compileIsfRuntimeSafe(def.isfCode);
        if (comp.ok) {
          def._isfRuntime = comp.runtime;
          def.isfMeta = comp.meta;
        }
      }
      if (!def._isfRuntime) continue;

      // Normalize upright orientation before passing video/live texture into custom ISF inputImage
      if (curFlipY || curMirrorX) {
        resizeFboIfNeeded(fxOrientFbo, w, h, true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fxOrientFbo.fbo);
        gl.viewport(0, 0, w, h);
        gl.useProgram(progMixbusOrb.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, curTex);
        gl.uniform1i(progMixbusOrb.u.uOrbTex, 0);
        gl.uniform1i(progMixbusOrb.u.uFlipY, curFlipY ? 1 : 0);
        gl.uniform1i(progMixbusOrb.u.uMirrorX, curMirrorX ? 1 : 0);
        gl.uniform1f(progMixbusOrb.u.uWeight, 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        curTex = fxOrientFbo.tex;
        curFlipY = false;
        curMirrorX = false;
      }

      executeIsfPasses(
        def._isfRuntime,
        def.isfMeta,
        fx.params || {},
        null,
        compositorClockSec,
        0.016,
        0,
        dstFbo.fbo,
        w,
        h,
        null,
        curTex
      );
    } else {
      let histFbo = null;
      if (def.code === 6) {
        const histKey = fx.id || `hist_${i}`;
        histFbo = fxHistoryMap.get(histKey);
        if (!histFbo) {
          histFbo = createDynamicFbo();
          fxHistoryMap.set(histKey, histFbo);
        }
        resizeFboIfNeeded(histFbo, w, h, false);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo.fbo);
      gl.viewport(0, 0, w, h);
      gl.useProgram(progPostFx.prog);
      const pu = progPostFx.u;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, curTex);
      gl.uniform1i(pu.uInputTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, histFbo ? histFbo.tex : blackTex1x1);
      gl.uniform1i(pu.uHistoryTex, 1);

      gl.uniform2f(pu.uTexSize, w, h);
      gl.uniform1f(pu.uTime, compositorClockSec);
      gl.uniform1i(pu.uFlipY, curFlipY ? 1 : 0);
      gl.uniform1i(pu.uMirrorX, curMirrorX ? 1 : 0);
      gl.uniform1i(pu.uFxMode, def.code);

      const pDefs = def.params || [];
      const fp = fx.params || {};
      const p0 = pDefs[0] ? Number(fp[pDefs[0].key] ?? pDefs[0].defaultVal) : 0;
      const p1 = pDefs[1] ? Number(fp[pDefs[1].key] ?? pDefs[1].defaultVal) : 0;
      const p2 = pDefs[2] ? Number(fp[pDefs[2].key] ?? pDefs[2].defaultVal) : 0;
      gl.uniform4f(pu.uFxParams, p0, p1, p2, 0.0);
      gl.uniform3f(pu.uFxAccent, accentRgb[0], accentRgb[1], accentRgb[2]);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (histFbo) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, dstFbo.fbo);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, histFbo.fbo);
        gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo.fbo);
      }
    }

    curTex = dstFbo.tex;
    curFlipY = false;
    curMirrorX = false;
    lastDstFbo = dstFbo;
    passCount++;
  }

  return { texture: curTex, width: w, height: h, flipY: curFlipY, mirrorX: curMirrorX, fboObj: lastDstFbo };
}

function renderMaskFbo(masksList, targetId, fboObj, stageAspect) {
  if (!masksList || masksList.length === 0) return false;
  const active = masksList.filter(m =>
    m.visible &&
    m.opacity > 0.001 &&
    m.target === targetId &&
    Array.isArray(m.points) &&
    m.points.length >= 3
  );
  if (active.length === 0) return false;

  gl.bindFramebuffer(gl.FRAMEBUFFER, fboObj.fbo);
  gl.disable(gl.SCISSOR_TEST);
  gl.viewport(0, 0, fboObj.w, fboObj.h);
  gl.bindVertexArray(emptyVao);
  gl.useProgram(progMaskPoly.prog);

  const addMasks = active.filter(m => m.mode === 'add');
  const subMasks = active.filter(m => m.mode !== 'add');

  if (addMasks.length > 0) {
    // Start closed (0.0), open inside union of additive window stencils
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);

    for (const m of addMasks) {
      drawSingleMaskPolygon(m, stageAspect);
    }
    gl.blendEquation(gl.FUNC_ADD);
  } else {
    // Start fully open (1.0)
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  if (subMasks.length > 0) {
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    for (const m of subMasks) {
      drawSingleMaskPolygon(m, stageAspect);
    }
  }

  gl.disable(gl.BLEND);
  return true;
}

function drawSingleMaskPolygon(mask, stageAspect) {
  const evalPts = getEvaluatedMaskPoints(mask, 128);
  const count = Math.min(128, evalPts.length);
  if (count < 3) return;
  for (let i = 0; i < count; i++) {
    maskPtsBuf[i * 2] = evalPts[i][0];
    maskPtsBuf[i * 2 + 1] = evalPts[i][1];
  }
  const mu = progMaskPoly.u;
  gl.uniform2fv(mu['uPts[0]'], maskPtsBuf);
  gl.uniform1i(mu.uCount, count);
  gl.uniform1f(mu.uAspect, stageAspect);
  gl.uniform1f(mu.uFeather, mask.feather);
  gl.uniform1f(mu.uChoke, mask.choke || 0.0);
  gl.uniform1f(mu.uStrength, mask.opacity);
  gl.uniform1i(mu.uInvert, mask.invert ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function bindCommonCompositorUniforms(cu, surf, eff, src, hasStageMask, hasSurfMask, blendCode, showCal, rgb, effStageAspect) {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, src.texture);
  gl.uniform1i(cu.uSourceTex, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, hasStageMask ? stageMaskFbo.tex : whiteTex1x1);
  gl.uniform1i(cu.uStageMaskTex, 1);
  gl.uniform1i(cu.uUseStageMask, hasStageMask ? 1 : 0);

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, hasSurfMask ? surfMaskFbo.tex : whiteTex1x1);
  gl.uniform1i(cu.uSurfMaskTex, 2);
  gl.uniform1i(cu.uUseSurfMask, hasSurfMask ? 1 : 0);

  const useBackdrop = blendCode >= 4;
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, useBackdrop ? stageBackdropFbo.tex : blackTex1x1);
  gl.uniform1i(cu.uBackdropTex, 3);
  gl.uniform1i(cu.uUseBackdropBlend, useBackdrop ? 1 : 0);

  gl.uniform1i(cu.uFlipSourceY, src.flipY ? 1 : 0);
  gl.uniform1i(cu.uMirrorSourceX, src.mirrorX ? 1 : 0);
  gl.uniform1f(cu.uSourceAspect, src.width / Math.max(1, src.height));
  gl.uniform1f(cu.uStageAspect, effStageAspect);
  gl.uniform1f(cu.uTime, compositorClockSec);

  gl.uniform2f(cu.uUvPos, surf.uvX, surf.uvY);
  gl.uniform2f(cu.uUvScale, surf.uvW, surf.uvH);
  gl.uniform1f(cu.uUvRotRad, (surf.uvRot * Math.PI) / 180.0);
  gl.uniform4f(cu.uUvCrop, surf.cropL, surf.cropR, surf.cropT, surf.cropB);

  const startDeg = surf.circleStartAngle ?? 0;
  const sweepDeg = computeCircleSweepDeg(startDeg, surf.circleEndAngle ?? 360);
  gl.uniform1f(cu.uCircleSoftness, surf.circleSoftness);
  gl.uniform1f(cu.uCircleInner, surf.circleInner);
  gl.uniform2f(cu.uCircleAngles, startDeg, sweepDeg);

  const fBase = surf.feather ?? 0.02;
  const fLinked = surf.featherLink !== false;
  const fL = fLinked ? fBase : (surf.featherL ?? fBase);
  const fR = fLinked ? fBase : (surf.featherR ?? fBase);
  const fT = fLinked ? fBase : (surf.featherT ?? fBase);
  const fB = fLinked ? fBase : (surf.featherB ?? fBase);

  gl.uniform1f(cu.uOpacity, eff.opacity);
  gl.uniform1f(cu.uFeather, fBase);
  gl.uniform4f(cu.uFeatherEdges, fL, fR, fT, fB);
  gl.uniform1f(cu.uBlendGamma, surf.blendGamma ?? 1.0);
  gl.uniform1f(cu.uBlackLevel, surf.blackLevel ?? 0.0);
  gl.uniform1i(cu.uBlendMode, blendCode);

  const keyCode = KEY_MODE_CODES[surf.keyMode] ?? 0;
  gl.uniform1i(cu.uKeyMode, keyCode);
  if (keyCode === 2) {
    const kc = hexToRgbNorm(surf.chromaColor || '#00ff00');
    gl.uniform3f(cu.uKeyColor, kc[0], kc[1], kc[2]);
    gl.uniform4f(
      cu.uKeyParams,
      surf.chromaTolerance ?? 0.28,
      surf.chromaSoftness ?? 0.10,
      surf.chromaSpill ?? 0.45,
      0.0
    );
  } else {
    gl.uniform3f(cu.uKeyColor, 0.0, 1.0, 0.0);
    gl.uniform4f(
      cu.uKeyParams,
      surf.lumaMin ?? 0.08,
      surf.lumaSoftness ?? 0.08,
      0.0,
      surf.lumaInvert ? 1.0 : 0.0
    );
  }

  gl.uniform1f(cu.uBrightness, surf.brightness);
  gl.uniform1f(cu.uContrast, surf.contrast);
  gl.uniform1f(cu.uSaturation, surf.saturation);
  gl.uniform1f(cu.uColorTemp, surf.colorTemp);
  gl.uniform1f(cu.uGamma, surf.gamma ?? 1.0);
  gl.uniform1f(cu.uHueShiftRad, ((surf.hueShift ?? 0.0) * Math.PI) / 180.0);
  const tintRgb = hexToRgbNorm(surf.tintColor || '#6fd3ff');
  gl.uniform4f(cu.uTint, tintRgb[0], tintRgb[1], tintRgb[2], surf.tintAmount ?? 0.0);
  gl.uniform1i(cu.uInvertRgb, surf.invertRgb ? 1 : 0);
  gl.uniform1i(cu.uChannelMode, CHANNEL_MODE_CODES[surf.channelMode] ?? 0);

  gl.uniform1i(cu.uShowCalGrid, showCal ? 1 : 0);
  gl.uniform3f(cu.uAccentColor, rgb[0], rgb[1], rgb[2]);
  const deg2rad = Math.PI / 180.0;
  gl.uniform4f(
    cu.uShutterInsert,
    surf.shutterL ?? 0.0,
    surf.shutterR ?? 0.0,
    surf.shutterT ?? 0.0,
    surf.shutterB ?? 0.0
  );
  gl.uniform4f(
    cu.uShutterAngle,
    (surf.shutterAngL ?? 0.0) * deg2rad,
    (surf.shutterAngR ?? 0.0) * deg2rad,
    (surf.shutterAngT ?? 0.0) * deg2rad,
    (surf.shutterAngB ?? 0.0) * deg2rad
  );
  gl.uniform1f(cu.uShutterSoft, surf.shutterSoft ?? 0.015);
}

function renderMesh3DGeometryPass(surf, effectiveSrc, mvpMat, modelMat, normalMat, camWorldPos, showCal, rgb, geom) {
  const vao = ensureMesh3DVao(geom);
  if (!vao) return false;

  const mu = progMesh3D.u;
  gl.useProgram(progMesh3D.prog);
  gl.uniformMatrix4fv(mu.uMvpMatrix, false, mvpMat);
  gl.uniformMatrix4fv(mu.uModelMatrix, false, modelMat);
  gl.uniformMatrix3fv(mu.uNormalMatrix, false, normalMat);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, effectiveSrc.texture);
  gl.uniform1i(mu.uSourceTex, 0);
  gl.uniform1i(mu.uFlipSourceY, effectiveSrc.flipY ? 1 : 0);
  gl.uniform1i(mu.uMirrorSourceX, effectiveSrc.mirrorX ? 1 : 0);
  gl.uniform1f(mu.uSourceAspect, effectiveSrc.width / Math.max(1, effectiveSrc.height));
  gl.uniform1f(mu.uTime, compositorClockSec);

  gl.uniform2f(mu.uUvPos, surf.uvX ?? 0.5, surf.uvY ?? 0.5);
  gl.uniform2f(mu.uUvScale, surf.uvW ?? 1.0, surf.uvH ?? 1.0);
  gl.uniform1f(mu.uUvRotRad, ((surf.uvRot ?? 0) * Math.PI) / 180.0);
  gl.uniform4f(mu.uUvCrop, surf.cropL ?? 0, surf.cropR ?? 0, surf.cropT ?? 0, surf.cropB ?? 0);

  const shadeCode = SHADE3D_MODE_CODES[surf.shade3d] ?? 0;
  gl.uniform1i(mu.uShadeMode, shadeCode);

  const azRad = (((surf.lightAzim ?? 36) * Math.PI) / 180.0);
  const elRad = (((surf.lightElev ?? 42) * Math.PI) / 180.0);
  const lx = Math.cos(elRad) * Math.sin(azRad);
  const ly = Math.sin(elRad);
  const lz = Math.cos(elRad) * Math.cos(azRad);
  gl.uniform3f(mu.uLightDir, lx, ly, lz);
  gl.uniform3f(mu.uCamWorldPos, camWorldPos[0], camWorldPos[1], camWorldPos[2]);
  gl.uniform4f(
    mu.uLightParams,
    surf.lightAmbient ?? 0.28,
    surf.lightDiffuse ?? 0.85,
    surf.lightSpec ?? 0.42,
    surf.lightRim ?? 0.35
  );
  gl.uniform4f(
    mu.uWireParams,
    surf.wireWidth ?? 1.35,
    surf.wireGlow ?? 0.45,
    surf.wireChase ?? 0.0,
    surf.wireUseSource ? 1.0 : 0.0
  );

  gl.uniform1f(mu.uBlackLevel, surf.blackLevel ?? 0.0);
  const keyCode = KEY_MODE_CODES[surf.keyMode] ?? 0;
  gl.uniform1i(mu.uKeyMode, keyCode);
  if (keyCode === 2) {
    const kc = hexToRgbNorm(surf.chromaColor || '#00ff00');
    gl.uniform3f(mu.uKeyColor, kc[0], kc[1], kc[2]);
    gl.uniform4f(mu.uKeyParams, surf.chromaTolerance ?? 0.28, surf.chromaSoftness ?? 0.10, surf.chromaSpill ?? 0.45, 0.0);
  } else {
    gl.uniform3f(mu.uKeyColor, 0.0, 1.0, 0.0);
    gl.uniform4f(mu.uKeyParams, surf.lumaMin ?? 0.08, surf.lumaSoftness ?? 0.08, 0.0, surf.lumaInvert ? 1.0 : 0.0);
  }

  gl.uniform1f(mu.uBrightness, surf.brightness ?? 0);
  gl.uniform1f(mu.uContrast, surf.contrast ?? 1);
  gl.uniform1f(mu.uSaturation, surf.saturation ?? 1);
  gl.uniform1f(mu.uColorTemp, surf.colorTemp ?? 0);
  gl.uniform1f(mu.uGamma, surf.gamma ?? 1.0);
  gl.uniform1f(mu.uHueShiftRad, ((surf.hueShift ?? 0) * Math.PI) / 180.0);
  const tintRgb = hexToRgbNorm(surf.tintColor || '#6fd3ff');
  gl.uniform4f(mu.uTint, tintRgb[0], tintRgb[1], tintRgb[2], surf.tintAmount ?? 0.0);
  gl.uniform1i(mu.uInvertRgb, surf.invertRgb ? 1 : 0);
  gl.uniform1i(mu.uChannelMode, CHANNEL_MODE_CODES[surf.channelMode] ?? 0);

  gl.uniform1i(mu.uShowCalGrid, showCal ? 1 : 0);
  gl.uniform3f(mu.uAccentColor, rgb[0], rgb[1], rgb[2]);
  const deg2rad3d = Math.PI / 180.0;
  gl.uniform4f(
    mu.uShutterInsert,
    surf.shutterL ?? 0.0,
    surf.shutterR ?? 0.0,
    surf.shutterT ?? 0.0,
    surf.shutterB ?? 0.0
  );
  gl.uniform4f(
    mu.uShutterAngle,
    (surf.shutterAngL ?? 0.0) * deg2rad3d,
    (surf.shutterAngR ?? 0.0) * deg2rad3d,
    (surf.shutterAngT ?? 0.0) * deg2rad3d,
    (surf.shutterAngB ?? 0.0) * deg2rad3d
  );
  gl.uniform1f(mu.uShutterSoft, surf.shutterSoft ?? 0.015);

  const cullMode = surf.cull3d || 'back';
  const isXray = cullMode === 'xray';

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  if (isXray) {
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  } else {
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    if (cullMode === 'none') {
      gl.disable(gl.CULL_FACE);
    } else {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(cullMode === 'front' ? gl.FRONT : gl.BACK);
    }
  }

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, geom.vertCount);
  gl.bindVertexArray(emptyVao);

  gl.depthMask(true);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  return true;
}

// Surfaces fitted through one projector (a set-part face mapped with several projectors) belong
// to that projector's output only — but only when multi-projector output gives each window its own
// slice. With a single shared output every window shows everything (nothing goes missing), and the
// operator's own composite is never filtered (LED/DMX sampling and recordings use it).
function getCurrentOutputProjectorIndex() {
  if (!state.isProjectorRole || !state.multiProjector || !state.multiProjector.enabled) return 0;
  return Number(state.projectorScreenIndex) || 0;
}

function isSurfaceForCurrentOutput(surf) {
  const p = Number(surf && (surf.outputProj || (surf.linkObject && surf.linkObject.proj))) || 0;
  if (!p) return true;
  const o = getCurrentOutputProjectorIndex();
  return !o || o === p;
}

function renderSceneDescriptorToFbo(sceneDesc, outFbo, effStageAspect) {
  const surfaces = sceneDesc.surfaces || [];
  const groups = sceneDesc.groups || state.groups || [];
  const masks = sceneDesc.masks || [];
  const spotsList = Array.isArray(sceneDesc.spots) && sceneDesc.spots.length > 0
    ? sceneDesc.spots
    : (sceneDesc.followspot ? [sceneDesc.followspot] : (state.spots || [state.followspot]));
  const forceCal = !!sceneDesc.allCalGrids;
  const needWorldPosPass = spotsList.some(sp => sp && sp.mode && sp.mode !== 'off' && sp.worldSpace) && supportsHalfFloatFbo;
  let hasAnyWorldPos = false;
  if (needWorldPosPass) {
    resizeFboIfNeeded(stageWorldPosFbo, outFbo.w, outFbo.h, true);
    if (stageWorldPosFbo.isHdr) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, stageWorldPosFbo.fbo);
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, stageWorldPosFbo.w, stageWorldPosFbo.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  resizeFboIfNeeded(stageMaskFbo, outFbo.w, outFbo.h, false);
  const hasStageMask = renderMaskFbo(masks, 'all', stageMaskFbo, effStageAspect);

  gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo.fbo);
  gl.disable(gl.SCISSOR_TEST);
  gl.viewport(0, 0, outFbo.w, outFbo.h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const anySolo = surfaces.some(s => {
    const eff = getEffectiveSurfaceProps(s, groups);
    return eff.solo && eff.visible;
  });

  // Render surfaces back-to-front
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const surf = surfaces[i];
    const eff = getEffectiveSurfaceProps(surf, groups);
    if (!eff.visible) continue;
    if (anySolo && !eff.solo) continue;
    if (eff.opacity <= 0.001) continue;
    if (!isSurfaceForCurrentOutput(surf)) continue;
    if (surf.type !== 'mesh3d' && !surf.points) continue;
    if (surf.type === 'polygon' && surf.points.length < 3) continue;
    if (surf.type === 'line' && surf.points.length < 2) continue;

    const src = getSourceById(surf.sourceId);
    if (!src) continue;

    // Optional per-surface GPU Post-FX Rack
    let effectiveSrc = src;
    if (Array.isArray(surf.fxChain) && surf.fxChain.some(fx => fx && fx.enabled !== false)) {
      effectiveSrc = applyFxChainToTexture(src.texture, src.width, src.height, src.flipY, src.mirrorX, surf.fxChain, surf.accent);
      gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo.fbo);
      gl.viewport(0, 0, outFbo.w, outFbo.h);
    }

    // Optional per-surface polygon masks
    let hasSurfMask = false;
    if (masks.some(m => m.visible && m.target === surf.id && m.points && m.points.length >= 3)) {
      resizeFboIfNeeded(surfMaskFbo, outFbo.w, outFbo.h, false);
      hasSurfMask = renderMaskFbo(masks, surf.id, surfMaskFbo, effStageAspect);
      gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo.fbo);
      gl.viewport(0, 0, outFbo.w, outFbo.h);
    }

    // Milestone 7A: 24-Bit Depth-Buffered 3D Mesh / .OBJ Surface Pass
    if (surf.type === 'mesh3d') {
      const geom3d = getSurfaceMesh3DGeometry(surf, sceneDesc.objAssets || state.objAssets);
      if (geom3d && geom3d.vertCount >= 3) {
        resizeFboIfNeeded(mesh3dPassFbo, outFbo.w, outFbo.h, true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, mesh3dPassFbo.fbo);
        const mrtActive = !!(needWorldPosPass && mesh3dPassFbo.isHdr && mesh3dPassFbo.worldTex && surf.cull3d !== 'xray');
        gl.drawBuffers(mrtActive ? [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1] : [gl.COLOR_ATTACHMENT0]);
        gl.viewport(0, 0, mesh3dPassFbo.w, mesh3dPassFbo.h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const showCal3d = (forceCal || surf.showCalGrid) && !state.showLock;
        const rgb3d = hexToRgbNorm(surf.accent);
        const mats = resolveSurface3DRenderMatrices(surf, effStageAspect, outFbo.w, outFbo.h, sceneDesc.objAssets || state.objAssets);
        renderMesh3DGeometryPass(surf, effectiveSrc, mats.mvp, mats.model, mats.normalMat, mats.camWorldPos, showCal3d, rgb3d, geom3d);
        if (mrtActive) {
          gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
          if (stageWorldPosFbo.isHdr) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, stageWorldPosFbo.fbo);
            gl.viewport(0, 0, stageWorldPosFbo.w, stageWorldPosFbo.h);
            gl.disable(gl.BLEND);
            const wpu = progWorldPosBlit.u;
            gl.useProgram(progWorldPosBlit.prog);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, mesh3dPassFbo.worldTex);
            gl.uniform1i(wpu.uPassWorldTex, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, hasStageMask ? stageMaskFbo.tex : whiteTex1x1);
            gl.uniform1i(wpu.uStageMaskTex, 1);
            gl.uniform1i(wpu.uUseStageMask, hasStageMask ? 1 : 0);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, hasSurfMask ? surfMaskFbo.tex : whiteTex1x1);
            gl.uniform1i(wpu.uSurfMaskTex, 2);
            gl.uniform1i(wpu.uUseSurfMask, hasSurfMask ? 1 : 0);
            gl.bindVertexArray(emptyVao);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            hasAnyWorldPos = true;
          }
        }

        // Composite depth-resolved 3D shell into Stage outFbo with full 12 Blend Modes + Masks
        const rawBlend3d = BLEND_MODE_CODES[surf.blendMode] ?? 0;
        if (rawBlend3d >= 4) {
          resizeFboIfNeeded(stageBackdropFbo, outFbo.w, outFbo.h, true);
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, outFbo.fbo);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, stageBackdropFbo.fbo);
          gl.blitFramebuffer(0, 0, outFbo.w, outFbo.h, 0, 0, outFbo.w, outFbo.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo.fbo);
        gl.viewport(0, 0, outFbo.w, outFbo.h);
        const blendCode3d = applyBlendModeGL(surf.blendMode);
        const mcu = progMesh3DComposite.u;
        gl.useProgram(progMesh3DComposite.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mesh3dPassFbo.tex);
        gl.uniform1i(mcu.uPassTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, hasStageMask ? stageMaskFbo.tex : whiteTex1x1);
        gl.uniform1i(mcu.uStageMaskTex, 1);
        gl.uniform1i(mcu.uUseStageMask, hasStageMask ? 1 : 0);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, hasSurfMask ? surfMaskFbo.tex : whiteTex1x1);
        gl.uniform1i(mcu.uSurfMaskTex, 2);
        gl.uniform1i(mcu.uUseSurfMask, hasSurfMask ? 1 : 0);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, rawBlend3d >= 4 ? stageBackdropFbo.tex : blackTex1x1);
        gl.uniform1i(mcu.uBackdropTex, 3);
        gl.uniform1i(mcu.uUseBackdropBlend, rawBlend3d >= 4 ? 1 : 0);
        gl.uniform1f(mcu.uOpacity, eff.opacity);
        gl.uniform1f(mcu.uBlendGamma, surf.blendGamma ?? 1.0);
        gl.uniform1i(mcu.uBlendMode, blendCode3d);
        gl.bindVertexArray(emptyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Optional silhouette neon Outline FX around the 3D convex hull!
        if ((surf.borderWidth || 0) > 0.0005) {
          const contour = getSurfacePerimeterContour(surf);
          const bGeom = buildLineRibbonGeometry(contour.pts, contour.closed, surf.borderWidth, surf.borderGlow ?? 0.50, effStageAspect);
          if (bGeom.vertCount >= 6) {
            const bCu = progMeshCompositor.u;
            const bBlend = applyBlendModeGL('screen');
            gl.useProgram(progMeshCompositor.prog);
            bindCommonCompositorUniforms(bCu, surf, eff, effectiveSrc, hasStageMask, hasSurfMask, bBlend, false, rgb3d, effStageAspect);
            gl.uniform1i(bCu.uSurfType, 5);
            gl.uniform4f(bCu.uLineParams, surf.borderGlow ?? 0.50, surf.borderSpeed ?? 0.55, 0.42, 2.0);
            gl.uniform1i(bCu.uLineChaseMode, LINE_CHASE_CODES[surf.borderChase] ?? 1);
            gl.uniform1i(bCu.uLineUseSource, 0);
            gl.bindVertexArray(meshVao);
            gl.bindBuffer(gl.ARRAY_BUFFER, meshVbo);
            gl.bufferData(gl.ARRAY_BUFFER, bGeom.verts, gl.STREAM_DRAW);
            gl.drawArrays(gl.TRIANGLES, 0, bGeom.vertCount);
            gl.bindVertexArray(emptyVao);
          }
        }
      }
      continue;
    }

    const curved = isCurvedMeshSurface(surf);
    const usesVbo = curved || surf.type === 'polygon' || surf.type === 'line';
    const progObj = usesVbo ? progMeshCompositor : progCompositor;
    const cu = progObj.u;
    const rawBlendCode = BLEND_MODE_CODES[surf.blendMode] ?? 0;
    if (rawBlendCode >= 4) {
      resizeFboIfNeeded(stageBackdropFbo, outFbo.w, outFbo.h, true);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, outFbo.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, stageBackdropFbo.fbo);
      gl.blitFramebuffer(0, 0, outFbo.w, outFbo.h, 0, 0, outFbo.w, outFbo.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo.fbo);
      gl.viewport(0, 0, outFbo.w, outFbo.h);
    }
    const blendCode = applyBlendModeGL(surf.blendMode);
    const showCal = (forceCal || surf.showCalGrid) && !state.showLock;
    const rgb = hexToRgbNorm(surf.accent);

    gl.useProgram(progObj.prog);
    bindCommonCompositorUniforms(cu, surf, eff, effectiveSrc, hasStageMask, hasSurfMask, blendCode, showCal, rgb, effStageAspect);

    if (surf.type === 'line') {
      gl.uniform1i(cu.uSurfType, 5);
      gl.uniform4f(
        cu.uLineParams,
        surf.lineGlow ?? 0.55,
        surf.lineSpeed ?? 0.65,
        surf.lineDuty ?? 0.42,
        surf.lineCount ?? 2
      );
      gl.uniform1i(cu.uLineChaseMode, LINE_CHASE_CODES[surf.lineChaseMode] ?? 1);
      gl.uniform1i(cu.uLineUseSource, surf.lineUseSource ? 1 : 0);

      const lineGeom = buildLineRibbonGeometry(
        surf.points,
        !!surf.lineClosed,
        surf.lineWidth ?? 0.010,
        surf.lineGlow ?? 0.55,
        effStageAspect
      );
      if (lineGeom.vertCount >= 6) {
        gl.bindVertexArray(meshVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshVbo);
        gl.bufferData(gl.ARRAY_BUFFER, lineGeom.verts, gl.STREAM_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, lineGeom.vertCount);
        gl.bindVertexArray(emptyVao);
      }
    } else if (surf.type === 'polygon') {
      gl.uniform1i(cu.uSurfType, 4);
      const pCnt = Math.min(48, surf.points.length);
      for (let k = 0; k < pCnt; k++) {
        polyPtsBuf[k * 2] = surf.points[k][0];
        polyPtsBuf[k * 2 + 1] = surf.points[k][1];
      }
      gl.uniform2fv(cu['uPolyPts[0]'], polyPtsBuf);
      gl.uniform1i(cu.uPolyCount, pCnt);

      const polyGeom = getPolygonGeometryForGL(surf);
      if (polyGeom.vertCount >= 3) {
        gl.bindVertexArray(meshVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshVbo);
        gl.bufferData(gl.ARRAY_BUFFER, polyGeom.verts, gl.STREAM_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, polyGeom.vertCount);
        gl.bindVertexArray(emptyVao);
      }
    } else if (curved) {
      gl.uniform1i(cu.uSurfType, 3);
      const { verts, idxInfo } = getMeshGeometryForGL(surf, 40, 40);
      gl.bindVertexArray(meshVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, meshVbo);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
      if (uploadedMeshIdxKey !== idxInfo.key) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIbo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxInfo.indices, gl.STATIC_DRAW);
        uploadedMeshIdxKey = idxInfo.key;
      }
      gl.drawElements(gl.TRIANGLES, idxInfo.count, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(emptyVao);
    } else {
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (const p of surf.points) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
      }
      const padX = 4.0 / Math.max(64, outFbo.w);
      const padY = 4.0 / Math.max(64, outFbo.h);
      minX = Math.max(-0.5, minX - padX);
      minY = Math.max(-0.5, minY - padY);
      maxX = Math.min(1.5, maxX + padX);
      maxY = Math.min(1.5, maxY + padY);
      gl.uniform4f(cu.uBounds, minX, minY, maxX, maxY);

      const surfTypeCode = surf.type === 'triangle' ? 1 : (surf.type === 'circle' ? 2 : 0);
      gl.uniform1i(cu.uSurfType, surfTypeCode);

      if (surf.type === 'triangle') {
        for (let k = 0; k < 3; k++) {
          triPtsBuf[k * 2] = surf.points[k][0];
          triPtsBuf[k * 2 + 1] = surf.points[k][1];
          triUvsBuf[k * 2] = surf.triUvs[k][0];
          triUvsBuf[k * 2 + 1] = surf.triUvs[k][1];
        }
        gl.uniform2fv(cu['uTriPts[0]'], triPtsBuf);
        gl.uniform2fv(cu['uTriUvs[0]'], triUvsBuf);
      } else {
        const convex = isQuadStrictlyConvex(surf.points);
        const useBilinear = (surf.quadWarp === 'bilinear') || (!convex && surf.type === 'quad');
        gl.uniform1i(cu.uQuadWarpMode, useBilinear ? 1 : 0);

        if (useBilinear) {
          for (let k = 0; k < 4; k++) {
            quadPtsBuf[k * 2] = surf.points[k][0];
            quadPtsBuf[k * 2 + 1] = surf.points[k][1];
          }
          gl.uniform2fv(cu['uQuadPts[0]'], quadPtsBuf);
        } else {
          const hom = computeQuadHomography(surf.points);
          gl.uniformMatrix3fv(cu.uInvHomography, false, hom.invColMajor);
        }
      }

      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Milestone 2: Universal Surface Perimeter Neon / Chase Border FX
    if (surf.type !== 'line' && (surf.borderWidth || 0) > 0.0005) {
      const contour = getSurfacePerimeterContour(surf);
      const bGeom = buildLineRibbonGeometry(
        contour.pts,
        contour.closed,
        surf.borderWidth,
        surf.borderGlow ?? 0.50,
        effStageAspect
      );
      if (bGeom.vertCount >= 6) {
        const bCu = progMeshCompositor.u;
        const bBlend = applyBlendModeGL('screen');
        gl.useProgram(progMeshCompositor.prog);
        bindCommonCompositorUniforms(bCu, surf, eff, src, hasStageMask, hasSurfMask, bBlend, false, rgb, effStageAspect);
        gl.uniform1i(bCu.uSurfType, 5);
        gl.uniform4f(
          bCu.uLineParams,
          surf.borderGlow ?? 0.50,
          surf.borderSpeed ?? 0.55,
          0.42,
          2.0
        );
        gl.uniform1i(bCu.uLineChaseMode, LINE_CHASE_CODES[surf.borderChase] ?? 1);
        gl.uniform1i(bCu.uLineUseSource, 0);

        gl.bindVertexArray(meshVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshVbo);
        gl.bufferData(gl.ARRAY_BUFFER, bGeom.verts, gl.STREAM_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, bGeom.vertCount);
        gl.bindVertexArray(emptyVao);
      }
    }
  }

  // Phase 3.3 & Pillar 4: Universal Multi-Spot Optical Bench (Pure Beam, Media/Orbital Beam, Gobo, 4-Blade Shutters & 3D World MRT)
  const modeMap = { beam: 1, veil: 1, additive: 2, screen: 3, reveal: 4, occlude: 5 };
  const deg2radSpot = Math.PI / 180.0;
  for (const fs of spotsList) {
    if (!fs || fs.enabled === false || !fs.mode || fs.mode === 'off') continue;
    const modeCode = modeMap[fs.mode] || 0;
    if (modeCode <= 0) continue;

    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    if (modeCode === 1) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else if (modeCode === 2) {
      gl.blendFunc(gl.ONE, gl.ONE);
    } else if (modeCode === 3) {
      gl.blendFuncSeparate(gl.ONE_MINUS_DST_COLOR, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      // Spotlight Reveal (4) & Silhouette Occlude (5): multiply stage RGB by transmit
      gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ZERO, gl.ONE);
    }

    gl.bindVertexArray(emptyVao);
    gl.useProgram(progFollowspot.prog);
    const fu = progFollowspot.u;
    gl.uniform1i(fu.uMode, modeCode);
    gl.uniform1f(fu.uAspect, effStageAspect);
    gl.uniform1f(fu.uShadowTime, fs.shadowTime ?? state.followspot.shadowTime ?? 0);
    gl.uniform2f(fu.uSpotPos, fs.spotX, fs.spotY);
    gl.uniform2f(fu.uSpotVel, fs.velX || 0, fs.velY || 0);
    gl.uniform1f(fu.uSpotRadius, fs.radius);
    gl.uniform1f(fu.uSpotSoftness, fs.softness);
    gl.uniform1f(fu.uSpotGain, fs.gain);
    gl.uniform1f(fu.uAmbient, fs.mode === 'beam' ? 0.0 : (fs.ambient ?? 0.14));
    gl.uniform2f(fu.uSpotStretch, fs.stretchX ?? 1.0, fs.stretchY ?? 1.0);
    gl.uniform1f(fu.uSpotRotation, fs.rotation ?? 0);
    gl.uniform1f(fu.uSpotMorph, fs.morph ?? 0);
    gl.uniform1f(fu.uShadowDepth, fs.shadowDepth ?? 0.52);
    gl.uniform1f(fu.uShadowTex, fs.shadowTex ?? 1.15);
    gl.uniform1f(fu.uShadowRnd, fs.shadowRnd ?? 0.65);

    const cA = hexToRgbNorm(fs.colA || '#ff3b6b');
    const cB = hexToRgbNorm(fs.colB || '#ff9e44');
    const cC = hexToRgbNorm(fs.colC || '#fff4d6');
    gl.uniform3f(fu.uColA, cA[0], cA[1], cA[2]);
    gl.uniform3f(fu.uColB, cB[0], cB[1], cB[2]);
    gl.uniform3f(fu.uColC, cC[0], cC[1], cC[2]);
    gl.uniform1f(fu.uSpotTemp, fs.temp || 0);

    // Content Mode: 0 = Cosmic Cloud fBm, 1 = Pure Optical Beam, 2 = Any Media/Shader/Camera/bus:orbital
    const rawContentId = fs.contentSrc || (fs.mode === 'beam' ? '__pure_light__' : '__nebula__');
    let contentMode = 0;
    let contentTex = whiteTex1x1;
    let flipContentY = 0;
    if (rawContentId === '__pure_light__') {
      contentMode = 1;
    } else if (rawContentId !== '__nebula__') {
      const cSrc = getSourceById(rawContentId);
      if (cSrc && cSrc.texture) {
        contentMode = 2;
        contentTex = cSrc.texture;
        flipContentY = cSrc.flipY ? 1 : 0;
      }
    }
    gl.uniform1i(fu.uContentMode, contentMode);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, contentTex);
    gl.uniform1i(fu.uContentTex, 0);
    gl.uniform1i(fu.uFlipContentY, flipContentY);
    gl.uniform1i(fu.uMediaFit, fs.mediaFit === 'world' ? 1 : 0);
    const defaultFbm = contentMode === 1 ? 0.0 : (contentMode === 2 ? 0.0 : 1.0);
    gl.uniform1f(fu.uAtmosFbm, clamp(Number(fs.fbmAmt ?? defaultFbm), 0.0, 1.0));

    gl.uniform4f(
      fu.uSpotShutters,
      fs.shutterL ?? 0.0,
      fs.shutterR ?? 0.0,
      fs.shutterT ?? 0.0,
      fs.shutterB ?? 0.0
    );
    gl.uniform4f(
      fu.uSpotShutterAngles,
      (fs.shutterAngL ?? 0.0) * deg2radSpot,
      (fs.shutterAngR ?? 0.0) * deg2radSpot,
      (fs.shutterAngT ?? 0.0) * deg2radSpot,
      (fs.shutterAngB ?? 0.0) * deg2radSpot
    );

    const goboSrcObj = fs.goboSrc ? getSourceById(fs.goboSrc) : null;
    const useGobo = !!(goboSrcObj && goboSrcObj.texture && fs.goboSrc);
    gl.uniform1i(fu.uUseGobo, useGobo ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, useGobo ? goboSrcObj.texture : whiteTex1x1);
    gl.uniform1i(fu.uGoboTex, 1);
    gl.uniform1i(fu.uFlipGoboY, useGobo && goboSrcObj.flipY ? 1 : 0);
    gl.uniform1f(fu.uGoboRotRad, ((fs.goboAngle ?? 0) * Math.PI) / 180.0);

    const useWorldMrt = !!(fs.worldSpace && hasAnyWorldPos && stageWorldPosFbo.isHdr);
    gl.uniform1i(fu.uUseWorldPos, useWorldMrt ? 1 : 0);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, useWorldMrt ? stageWorldPosFbo.tex : blackTex1x1);
    gl.uniform1i(fu.uWorldPosTex, 2);
    const wt = Array.isArray(fs.worldTargetM) ? fs.worldTargetM : [0.0, 1.4, 0.0];
    gl.uniform3f(fu.uSpotWorldTarget, Number(wt[0]) || 0, Number(wt[1]) || 0, Number(wt[2]) || 0);
    gl.uniform1f(fu.uSpotWorldRadiusM, Math.max(0.04, Number(fs.worldRadiusM) || 0.85));

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  gl.disable(gl.BLEND);

  // Milestone 3: Master Output GPU Post-FX Rack (applied before Cue Crossfade & Master Keystone)
  const masterFx = sceneDesc.masterFxChain || state.masterFxChain;
  if (Array.isArray(masterFx) && masterFx.some(fx => fx && fx.enabled !== false)) {
    const fxRes = applyFxChainToTexture(outFbo.tex, outFbo.w, outFbo.h, false, false, masterFx, '#6fd3ff');
    if (fxRes && fxRes.fboObj) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fxRes.fboObj.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, outFbo.fbo);
      gl.blitFramebuffer(0, 0, fxRes.width, fxRes.height, 0, 0, outFbo.w, outFbo.h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo.fbo);
    }
  }
}

// ============================================================================
// WORKSPACE VIEWPORT LAYOUT & COMPOSITING
// ============================================================================

const panesAreaEl = document.getElementById('panes-area');
const inputViewportEl = document.getElementById('input-viewport');
const stageViewportEl = document.getElementById('stage-viewport');

function computeContentBox(containerW, containerH, targetAspect, viewState) {
  const pad = state.projectorMode ? 0 : 18;
  const availW = Math.max(20, containerW - pad * 2);
  const availH = Math.max(20, containerH - pad * 2);

  let baseW = availW;
  let baseH = availH;
  if (targetAspect > 0.01) {
    if (availW / availH > targetAspect) {
      baseH = availH;
      baseW = baseH * targetAspect;
    } else {
      baseW = availW;
      baseH = baseW / targetAspect;
    }
  }

  const w = baseW * viewState.zoom;
  const h = baseH * viewState.zoom;
  const x = (containerW - w) * 0.5 + viewState.panX;
  const y = (containerH - h) * 0.5 + viewState.panY;
  return { x, y, w, h };
}

function setScissorIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  if (x2 <= x1 || y2 <= y1) return false;
  gl.scissor(Math.round(x1), Math.round(y1), Math.round(x2 - x1), Math.round(y2 - y1));
  return true;
}

function renderWebGLWorkspace(dpr) {
  // Batch all DOM layout reads upfront before mutating canvas dimensions
  const areaRect = panesAreaEl.getBoundingClientRect();
  const needInput = (state.layoutMode === 'split' || state.layoutMode === 'input') && !state.projectorMode;
  const needStage = state.layoutMode !== 'input' || state.projectorMode;
  const inputVpRect = needInput ? inputViewportEl.getBoundingClientRect() : null;
  const stageVpRect = needStage ? stageViewportEl.getBoundingClientRect() : null;
  // 3D venue previz viewports (BUILD 3D world underlay, MAP/LIVE "3D Venue" feed)
  const previzTargets = typeof collectVenuePrevizTargets === 'function' ? collectVenuePrevizTargets() : null;

  let inputMetrics = null;
  let stageMetrics = null;

  if (inputVpRect) {
    const selSurf = typeof getSelectedSurface === 'function' ? getSelectedSurface() : null;
    const isOrbit3d = !!(selSurf && selSurf.type === 'mesh3d' && state.input3DOrbitMode !== false);
    const src = getSourceById(selSurf ? selSurf.sourceId : state.activeSourceId) || getSourceById(state.activeSourceId);
    if (src && inputVpRect.width > 4 && inputVpRect.height > 4) {
      if (isOrbit3d) {
        const pad = 10;
        const box = {
          x: pad,
          y: pad,
          w: Math.max(24, inputVpRect.width - pad * 2),
          h: Math.max(24, inputVpRect.height - pad * 2)
        };
        const orbitCam = computeOrbitMvp(state.orbit3D, box.w / Math.max(1, box.h));
        inputMetrics = { vpRect: inputVpRect, box, src, orbit3d: true, orbitMvp: orbitCam.mvp, orbitEye: orbitCam.eye, surf3d: selSurf };
      } else {
        const srcAspect = src.width / Math.max(1, src.height);
        const box = computeContentBox(inputVpRect.width, inputVpRect.height, srcAspect, state.inputView);
        inputMetrics = { vpRect: inputVpRect, box, src, orbit3d: false };
      }
    }
  }

  if (stageVpRect && stageVpRect.width > 4 && stageVpRect.height > 4) {
    const effView = state.projectorMode ? { zoom: 1, panX: 0, panY: 0 } : state.stageView;
    const box = computeContentBox(stageVpRect.width, stageVpRect.height, state.stageAspect, effView);
    stageMetrics = { vpRect: stageVpRect, box, areaRect, dpr };
  }

  // Laptop GPU Eco Mode: skip laptop WebGL draw while keeping metrics & vector radar live!
  const scannerActive = !!(state.scannerPattern && state.scannerPattern.active);
  if (state.ecoMode && !state.projectorMode && !scannerActive) {
    return { inputMetrics, stageMetrics };
  }

  const totalW = Math.max(1, Math.round(areaRect.width * dpr));
  const totalH = Math.max(1, Math.round(areaRect.height * dpr));
  if (glCanvas.width !== totalW || glCanvas.height !== totalH) {
    glCanvas.width = totalW;
    glCanvas.height = totalH;
  }

  // Render offscreen Stage FBO(s) at locked canonical output resolution (decoupled from UI zoom!)
  if (stageMetrics && !scannerActive) {
    const { vpRect } = stageMetrics;
    // Operator window: the stage canvas is a preview (projector windows composite their
    // own full-resolution output), so it follows the performance governor. Projector mode,
    // projector windows and recordings always render at the canonical resolution.
    const previewScale = (state.projectorMode || state.isProjectorRole || state.recorder?.active)
      ? 1.0
      : getAdaptiveRenderScale();
    const fboW = state.stageAspect > 0.01
      ? clamp(Math.round((state.stageWidth || 1920) * previewScale), 64, 4096)
      : clamp(Math.round(vpRect.width * dpr * previewScale), 64, 4096);
    const fboH = state.stageAspect > 0.01
      ? clamp(Math.round((state.stageHeight || 1080) * previewScale), 64, 4096)
      : clamp(Math.round(vpRect.height * dpr * previewScale), 64, 4096);
    const effStageAspect = fboW / Math.max(1, fboH);

    const masterGain = state.masterOpacity * state.blackoutFade;
    const activeProjSliceForFbo = typeof getActiveProjectorSliceForRender === 'function'
      ? getActiveProjectorSliceForRender()
      : null;
    // Projector windows: drop spots not routed to this projector and re-aim 3D-converged
    // spots through this projector's own lens (05h mapSpotForProjectorIndex).
    const mapSpotForSlice = (sp) => {
      if (sp && activeProjSliceForFbo && !activeProjSliceForFbo.disabledBlank && typeof mapSpotForProjectorIndex === 'function') {
        return mapSpotForProjectorIndex(sp, activeProjSliceForFbo.index);
      }
      // Projector window without a slice (multi-projector output off: it shows the full stage)
      // still routes & converges spots through its own lens.
      if (sp && !activeProjSliceForFbo && state.isProjectorRole && typeof mapSpotForProjectorIndex === 'function') {
        return mapSpotForProjectorIndex(sp, state.projectorScreenIndex || 1);
      }
      // Operator window: show 3D-aimed spots where the first routed projector really draws them.
      if (sp && !activeProjSliceForFbo && !state.isProjectorRole && typeof mapSpotCanonical === 'function') return mapSpotCanonical(sp);
      return sp;
    };

    // GO pressed mid-fade: A and B still hold last frame's outgoing / incoming renders.
    const xf = state.crossfade;
    if (xf.freezeRequest) {
      xf.freezeRequest = false;
      if (stageFboA.w === fboW && stageFboA.h === fboH && stageFboB.w === fboW && stageFboB.h === fboH) {
        bakeCrossfadeFreezeIntoA(fboW, fboH, clamp(Number(xf.freezeMix) || 0, 0, 1));
        xf.frozenFrom = true;
      }
    }

    if (masterGain > 0.001) {
      resizeFboIfNeeded(stageFboB, fboW, fboH, true);
      glCaps.activeHdr = stageFboB.isHdr;
      const liveSpots = (Array.isArray(state.spots) ? state.spots.filter(sp => sp && sp.enabled !== false) : [])
        .map(sp => (typeof prepareSpotForRender === 'function' ? prepareSpotForRender(sp) : sp))
        .map(mapSpotForSlice);
      renderSceneDescriptorToFbo(
        {
          surfaces: state.surfaces,
          groups: state.groups,
          masks: state.masks,
          spots: liveSpots,
          followspot: liveSpots[0] || null,
          masterFxChain: state.masterFxChain,
          allCalGrids: state.allCalGrids
        },
        stageFboB,
        effStageAspect
      );

      if (state.crossfade.active && state.crossfade.fromScene) {
        resizeFboIfNeeded(stageFboA, fboW, fboH, true);
        const rawFromSpots = Array.isArray(state.crossfade.fromScene.spots)
          ? state.crossfade.fromScene.spots.filter(sp => sp && sp.enabled !== false)
          : (state.crossfade.fromScene.followspot && state.crossfade.fromScene.followspot.enabled !== false
              ? [state.crossfade.fromScene.followspot]
              : []);
        const mappedFromSpots = rawFromSpots.map(mapSpotForSlice);
        renderSceneDescriptorToFbo(
          { ...state.crossfade.fromScene, spots: mappedFromSpots, followspot: mappedFromSpots[0] || null },
          stageFboA,
          effStageAspect
        );
        // Chained dissolve: outgoing = live mix(interrupted from, interrupted target) at the GO-time mix,
        // so both looks keep animating instead of freezing.
        const chainTo = state.crossfade.chainToScene;
        if (chainTo) {
          resizeFboIfNeeded(stageFboChain, fboW, fboH, true);
          const rawChainSpots = Array.isArray(chainTo.spots)
            ? chainTo.spots.filter(sp => sp && sp.enabled !== false)
            : (chainTo.followspot && chainTo.followspot.enabled !== false ? [chainTo.followspot] : []);
          const mappedChainSpots = rawChainSpots.map(mapSpotForSlice);
          renderSceneDescriptorToFbo(
            { ...chainTo, spots: mappedChainSpots, followspot: mappedChainSpots[0] || null },
            stageFboChain,
            effStageAspect
          );
          if (stageFboChain.w === stageFboA.w && stageFboChain.h === stageFboA.h) {
            bakeCrossfadeFreezeIntoA(fboW, fboH, clamp(Number(state.crossfade.chainMix) || 0, 0, 1), stageFboChain.tex);
          }
        }
      }
    }
  }

  // Live GPU source thumbnails for ◎ Orbital Mix radar orbs
  updateLiveSourceThumbnailsGPU();

  // Milestone 7A: Offscreen 24-bit Depth Render for Left Pane 3D Model Orbit Inspector
  if (inputMetrics && inputMetrics.orbit3d && inputMetrics.surf3d) {
    const oSurf = inputMetrics.surf3d;
    const oGeom = getSurfaceMesh3DGeometry(oSurf, state.objAssets);
    const oW = clamp(Math.round(inputMetrics.box.w * dpr), 64, 2560);
    const oH = clamp(Math.round(inputMetrics.box.h * dpr), 64, 2560);
    resizeFboIfNeeded(mesh3dOrbitFbo, oW, oH, false);
    gl.bindFramebuffer(gl.FRAMEBUFFER, mesh3dOrbitFbo.fbo);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, mesh3dOrbitFbo.w, mesh3dOrbitFbo.h);
    gl.clearColor(0.042, 0.058, 0.092, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (oGeom && oGeom.vertCount >= 3) {
      const ident4 = mat4Identity();
      const ident3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      const oRgb = hexToRgbNorm(oSurf.accent);
      const showCalO = !!(state.allCalGrids || oSurf.showCalGrid);
      // Force visible wireframe assist in Orbit Inspector when in Pure Textured mode so vertices are easy to pick
      const orbitSurfView = oSurf.shade3d === 'lit'
        ? { ...oSurf, shade3d: 'lit_wire', wireWidth: 1.0, wireGlow: 0.2 }
        : oSurf;
      renderMesh3DGeometryPass(
        orbitSurfView,
        inputMetrics.src,
        inputMetrics.orbitMvp,
        ident4,
        ident3,
        inputMetrics.orbitEye || [0, 0, 2.85],
        showCalO,
        oRgb,
        oGeom
      );
    }
  }

  // Composite Input UV Preview & Master Stage Output onto #gl-engine
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, totalW, totalH);
  if (state.projectorMode) {
    gl.clearColor(0, 0, 0, 1);
  } else {
    gl.clearColor(0.031, 0.043, 0.067, 1);
  }
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST);
  gl.bindVertexArray(emptyVao);

  // PASS A: Input UV Preview (or 3D Model Orbit Viewport)
  if (inputMetrics) {
    const { vpRect, box, src, orbit3d } = inputMetrics;
    const paneGlX = (vpRect.left - areaRect.left) * dpr;
    const paneGlY = totalH - (vpRect.bottom - areaRect.top) * dpr;
    const paneGlW = vpRect.width * dpr;
    const paneGlH = vpRect.height * dpr;

    const boxGlX = paneGlX + box.x * dpr;
    const boxGlY = totalH - (vpRect.top - areaRect.top + box.y + box.h) * dpr;
    const boxGlW = box.w * dpr;
    const boxGlH = box.h * dpr;

    if (setScissorIntersect(paneGlX, paneGlY, paneGlW, paneGlH, boxGlX, boxGlY, boxGlW, boxGlH)) {
      gl.viewport(Math.round(boxGlX), Math.round(boxGlY), Math.max(1, Math.round(boxGlW)), Math.max(1, Math.round(boxGlH)));
      gl.useProgram(progInputPreview.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, orbit3d ? mesh3dOrbitFbo.tex : src.texture);
      gl.uniform1i(progInputPreview.u.uTex, 0);
      gl.uniform2f(progInputPreview.u.uViewRes, box.w, box.h);
      gl.uniform1i(progInputPreview.u.uFlipY, orbit3d ? 0 : (src.flipY ? 1 : 0));
      gl.uniform1i(progInputPreview.u.uMirrorX, orbit3d ? 0 : (src.mirrorX ? 1 : 0));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  // PASS B: Output Stage (Single-Bus Live OR Dual-FBO Optical Crossfade + Master Keystone + Crosshair)
  if (stageMetrics) {
    const { vpRect, box } = stageMetrics;
    const paneGlX = (vpRect.left - areaRect.left) * dpr;
    const paneGlY = totalH - (vpRect.bottom - areaRect.top) * dpr;
    const paneGlW = vpRect.width * dpr;
    const paneGlH = vpRect.height * dpr;

    const boxGlX = paneGlX + box.x * dpr;
    const boxGlY = totalH - (vpRect.top - areaRect.top + box.y + box.h) * dpr;
    const boxGlW = box.w * dpr;
    const boxGlH = box.h * dpr;

    if (setScissorIntersect(paneGlX, paneGlY, paneGlW, paneGlH, boxGlX, boxGlY, boxGlW, boxGlH)) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (scannerActive) {
        gl.viewport(Math.round(boxGlX), Math.round(boxGlY), Math.max(1, Math.round(boxGlW)), Math.max(1, Math.round(boxGlH)));
        gl.useProgram(progScannerPattern.prog);
        const su = progScannerPattern.u;
        const pat = state.scannerPattern;
        const kindCode = pat.kind === 'white' ? 1 : (pat.kind === 'grayX' ? 2 : (pat.kind === 'grayY' ? 3 : 0));
        gl.uniform1i(su.uKind, kindCode);
        gl.uniform1i(su.uBit, pat.bit || 0);
        gl.uniform1i(su.uBitsTotal, pat.bitsTotal || 8);
        gl.uniform1i(su.uInvert, pat.invert ? 1 : 0);

        const mk = state.masterKeystone;
        const useMk = !!(mk && mk.enabled && Array.isArray(mk.points) && mk.points.length === 4);
        gl.uniform1i(su.uUseMasterKeystone, useMk ? 1 : 0);
        if (useMk) {
          const mkHom = computeQuadHomography(mk.points);
          gl.uniformMatrix3fv(su.uMasterInvHomography, false, mkHom.invColMajor);
          gl.uniform1f(su.uMasterLensK1, mk.lensK1 || 0);
        } else {
          gl.uniform1f(su.uMasterLensK1, 0);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        const masterGain = state.masterOpacity * state.blackoutFade;
        const projSlice = typeof getActiveProjectorSliceForRender === 'function'
          ? getActiveProjectorSliceForRender()
          : null;
        if (masterGain > 0.001 && !(projSlice && projSlice.disabledBlank)) {
          const delayedTex = (projSlice && projSlice.delayMs > 4)
            ? resolveDelayedStageTexture(stageFboB.w, stageFboB.h, projSlice.delayMs, performance.now())
            : null;
          if (delayedTex) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.enable(gl.SCISSOR_TEST);
            setScissorIntersect(paneGlX, paneGlY, paneGlW, paneGlH, boxGlX, boxGlY, boxGlW, boxGlH);
          }

          gl.viewport(Math.round(boxGlX), Math.round(boxGlY), Math.max(1, Math.round(boxGlW)), Math.max(1, Math.round(boxGlH)));
          gl.useProgram(progCrossfade.prog);
          const xu = progCrossfade.u;

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, delayedTex ? delayedTex : (state.crossfade.active ? stageFboA.tex : stageFboB.tex));
          gl.uniform1i(xu.uTexA, 0);

          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, delayedTex ? delayedTex : stageFboB.tex);
          gl.uniform1i(xu.uTexB, 1);

          gl.uniform1i(xu.uDualBus, (!delayedTex && state.crossfade.active) ? 1 : 0);
          gl.uniform1f(xu.uMix, state.crossfade.mix);
          gl.uniform1f(xu.uMasterGain, masterGain);
          gl.uniform1f(xu.uStageAspect, box.w / Math.max(1, box.h));

          // Per-Projector Keystone overrides Master Keystone when active on this screen slice
          const sliceKs = projSlice && projSlice.keystone && projSlice.keystone.enabled ? projSlice.keystone : null;
          const mk = sliceKs || state.masterKeystone;
          const useMk = !!(mk && mk.enabled && Array.isArray(mk.points) && mk.points.length === 4);
          gl.uniform1i(xu.uUseMasterKeystone, useMk ? 1 : 0);
          if (useMk) {
            const mkHom = computeQuadHomography(mk.points);
            gl.uniformMatrix3fv(xu.uMasterInvHomography, false, mkHom.invColMajor);
            gl.uniform1f(xu.uMasterLensK1, mk.lensK1 || 0);
          } else {
            gl.uniform1f(xu.uMasterLensK1, 0);
          }

          if (projSlice) {
            gl.uniform4f(xu.uSliceRect, projSlice.cropX, projSlice.cropY, projSlice.cropW, projSlice.cropH);
            gl.uniform4f(xu.uEdgeBlend, projSlice.blendL, projSlice.blendR, projSlice.blendT, projSlice.blendB);
            gl.uniform1f(xu.uEdgeGamma, projSlice.blendGamma ?? 2.2);
            gl.uniform1f(xu.uBlackOffset, projSlice.blackOffset ?? 0.0);
            gl.uniform2f(xu.uProjGainKelvin, projSlice.gain ?? 1.0, projSlice.kelvin ?? 0.0);
            gl.uniform1i(xu.uShowBlendGuide, projSlice.alignmentGrid ? 1 : 0);

            let stagePlanBound = false;
            if (projSlice.useStagePlanSolver && typeof solveStagePlanOpticalField === 'function') {
              const field = solveStagePlanOpticalField(state.multiProjector, false);
              const opt = field && field.opticsByScreen ? field.opticsByScreen.get(projSlice.index) : null;
              const lut = field && field.lutByScreen ? field.lutByScreen.get(projSlice.index) : null;
              if (opt && opt.homographyValid && lut) {
                const uploadKey = `${field.key}|s:${projSlice.index}`;
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, stagePlanLutGlTex);
                if (uploadedStagePlanLutKey !== uploadKey) {
                  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, field.w, field.h, 0, gl.RGBA, gl.FLOAT, lut);
                  uploadedStagePlanLutKey = uploadKey;
                }
                gl.uniform1i(xu.uStagePlanLutTex, 2);
                gl.uniform1i(xu.uUseStagePlanSolver, 1);
                gl.uniformMatrix3fv(xu.uStagePlanHomography, false, opt.projToStageMat3);
                stagePlanBound = true;
              }
            }
            if (!stagePlanBound) {
              gl.uniform1i(xu.uUseStagePlanSolver, 0);
              gl.uniformMatrix3fv(xu.uStagePlanHomography, false, identStageMat3);
              gl.activeTexture(gl.TEXTURE2);
              gl.bindTexture(gl.TEXTURE_2D, whiteTex1x1);
              gl.uniform1i(xu.uStagePlanLutTex, 2);
            }

            if (state.followspot && state.followspot.converge3D && typeof computeConvergentSpotForProjector === 'function') {
              const conv = computeConvergentSpotForProjector(state.followspot, projSlice.index);
              const bm = conv.bgMask || [0.5, 0.5, 1.0, 0.0];
              gl.uniform4f(xu.uConvergentMask, bm[0], bm[1], bm[2], bm[3]);
            } else {
              gl.uniform4f(xu.uConvergentMask, 0.5, 0.5, 1.0, 0.0);
            }
          } else {
            gl.uniform4f(xu.uSliceRect, 0.0, 0.0, 1.0, 1.0);
            gl.uniform4f(xu.uEdgeBlend, 0.0, 0.0, 0.0, 0.0);
            gl.uniform1f(xu.uEdgeGamma, 2.2);
            gl.uniform1f(xu.uBlackOffset, 0.0);
            gl.uniform2f(xu.uProjGainKelvin, 1.0, 0.0);
            gl.uniform1i(xu.uShowBlendGuide, 0);
            gl.uniform1i(xu.uUseStagePlanSolver, 0);
            gl.uniformMatrix3fv(xu.uStagePlanHomography, false, identStageMat3);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, whiteTex1x1);
            gl.uniform1i(xu.uStagePlanLutTex, 2);
            gl.uniform4f(xu.uConvergentMask, 0.5, 0.5, 1.0, 0.0);
          }

          const ch = state.calibCrosshair;
          const chLive = !!(ch && ch.active && performance.now() < ch.expireMs);
          if (ch && ch.active && !chLive) ch.active = false; // expiry only — never because another projector is drawn
          const chActive = chLive && !state.showLock && isCalibCrosshairForSlice(ch, projSlice);
          gl.uniform3f(
            xu.uCalibCrosshair,
            chActive ? ch.x : 0.5,
            chActive ? ch.y : 0.5,
            chActive ? 1.0 : 0.0
          );

          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
    }
  }

  if (previzTargets && typeof renderVenuePrevizTargets === 'function') {
    renderVenuePrevizTargets(previzTargets, areaRect, totalW, totalH, dpr);
  }
  renderOrbThumbStrip(totalW, totalH, areaRect, dpr);

  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  return { inputMetrics, stageMetrics };
}
