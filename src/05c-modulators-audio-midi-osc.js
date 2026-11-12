// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05c-modulators-audio-midi-osc.js — Milestone 5:
//   1. Unified Parameter Target Registry & Resolver (Surfaces, FX, ISF, Spot, Master)
//   2. WebAudio Multi-Band FFT, Onset Beat Detector, Synth Pulse & Spectrum Canvas
//   3. Universal Modulation Matrix (LFOs, Audio Envelopes & 8-Step Beat Sequencers)
//   4. 1-Click WebMIDI Learn (Cmd/Ctrl+M) + Motorized Fader CC Feedback
//   5. Wireless Gamepad API (PS5/Xbox Followspot, Constellation & Vertex Nudge)
//   6. Bi-Directional Binary OSC 1.0 & JSON-OSC over WebSocket Client
// ============================================================================

// ----------------------------------------------------------------------------
// 1. UNIFIED PARAMETER TARGET REGISTRY & RESOLVER
// ----------------------------------------------------------------------------

const SURFACE_PROP_META = {
  opacity:      { label: 'Opacity',       min: 0,     max: 1,    sliderId: 'ctrl-opacity',       fmt: v => `${Math.round(v * 100)}%` },
  feather:      { label: 'Edge Feather',  min: 0,     max: 0.5,  sliderId: 'ctrl-feather',       fmt: v => `${Math.round(v * 100)}%` },
  featherL:     { label: 'Feather Left',  min: 0,     max: 0.5,  sliderId: 'ctrl-feather-l',     fmt: v => `${Math.round(v * 100)}%` },
  featherR:     { label: 'Feather Right', min: 0,     max: 0.5,  sliderId: 'ctrl-feather-r',     fmt: v => `${Math.round(v * 100)}%` },
  featherT:     { label: 'Feather Top',   min: 0,     max: 0.5,  sliderId: 'ctrl-feather-t',     fmt: v => `${Math.round(v * 100)}%` },
  featherB:     { label: 'Feather Bot',   min: 0,     max: 0.5,  sliderId: 'ctrl-feather-b',     fmt: v => `${Math.round(v * 100)}%` },
  blendGamma:   { label: 'Blend Gamma',   min: 1.0,   max: 2.8,  sliderId: 'ctrl-blend-gamma',   fmt: v => v.toFixed(2) },
  blackLevel:   { label: 'Black Uplift',  min: 0,     max: 0.15, sliderId: 'ctrl-black-level',   fmt: v => `${(v * 100).toFixed(1)}%` },
  brightness:   { label: 'Brightness',    min: -1,    max: 1,    sliderId: 'ctrl-brightness',    fmt: v => `${Math.round(v * 100)}%` },
  contrast:     { label: 'Contrast',      min: 0,     max: 3,    sliderId: 'ctrl-contrast',      fmt: v => v.toFixed(2) },
  saturation:       { label: 'Saturation',    min: 0,     max: 2.5,  sliderId: 'ctrl-saturation',    fmt: v => v.toFixed(2) },
  colorTemp:        { label: 'Color Temp',    min: -1,    max: 1,    sliderId: 'ctrl-temp',          fmt: v => `${Math.round(5100 - v * 2200)}K` },
  gamma:            { label: 'Gamma',         min: 0.25,  max: 3.0,  sliderId: 'ctrl-gamma',         fmt: v => v.toFixed(2) },
  hueShift:         { label: 'Hue Shift',     min: -180,  max: 180,  sliderId: 'ctrl-hue-shift',     fmt: v => `${Math.round(v)}°` },
  tintAmount:       { label: 'Color Tint',    min: 0,     max: 1,    sliderId: 'ctrl-tint-amt',      fmt: v => `${Math.round(v * 100)}%` },
  lumaMin:          { label: 'Luma Clip',     min: 0,     max: 0.95, sliderId: 'ctrl-luma-min',      fmt: v => `${Math.round(v * 100)}%` },
  lumaSoftness:     { label: 'Luma Soft',     min: 0.005, max: 0.5,  sliderId: 'ctrl-luma-soft',     fmt: v => `${Math.round(v * 100)}%` },
  chromaTolerance:  { label: 'Chroma Tol',    min: 0.02,  max: 0.85, sliderId: 'ctrl-chroma-tol',    fmt: v => `${Math.round(v * 100)}%` },
  chromaSoftness:   { label: 'Chroma Soft',   min: 0.005, max: 0.45, sliderId: 'ctrl-chroma-soft',   fmt: v => `${Math.round(v * 100)}%` },
  chromaSpill:      { label: 'Despill',       min: 0,     max: 1,    sliderId: 'ctrl-chroma-spill',  fmt: v => `${Math.round(v * 100)}%` },
  uvX:              { label: 'UV Pos X',      min: -0.5,  max: 1.5,  sliderId: 'ctrl-uv-x',          fmt: v => v.toFixed(2) },
  uvY:              { label: 'UV Pos Y',      min: -0.5,  max: 1.5,  sliderId: 'ctrl-uv-y',          fmt: v => v.toFixed(2) },
  uvW:              { label: 'UV Scale W',    min: 0.05,  max: 2.0,  sliderId: 'ctrl-uv-w',          fmt: v => `${Math.round(v * 100)}%` },
  uvH:              { label: 'UV Scale H',    min: 0.05,  max: 2.0,  sliderId: 'ctrl-uv-h',          fmt: v => `${Math.round(v * 100)}%` },
  uvRot:            { label: 'UV Rotate',     min: -180,  max: 180,  sliderId: 'ctrl-uv-rot',        fmt: v => `${v.toFixed(1)}°` },
  cropL:            { label: 'Crop Left',     min: 0,     max: 0.48, sliderId: 'ctrl-crop-l',        fmt: v => `${Math.round(v * 100)}%` },
  cropR:            { label: 'Crop Right',    min: 0,     max: 0.48, sliderId: 'ctrl-crop-r',        fmt: v => `${Math.round(v * 100)}%` },
  cropT:            { label: 'Crop Top',      min: 0,     max: 0.48, sliderId: 'ctrl-crop-t',        fmt: v => `${Math.round(v * 100)}%` },
  cropB:            { label: 'Crop Bottom',   min: 0,     max: 0.48, sliderId: 'ctrl-crop-b',        fmt: v => `${Math.round(v * 100)}%` },
  circleSoftness:   { label: 'Iris Soft',     min: 0.002, max: 0.85, sliderId: 'ctrl-circle-soft',   fmt: v => `${Math.round(v * 100)}%` },
  circleInner:      { label: 'Inner Ring',    min: 0,     max: 0.92, sliderId: 'ctrl-circle-inner',  fmt: v => `${Math.round(v * 100)}%` },
  circleStartAngle: { label: 'Arc Start',     min: 0,     max: 360,  sliderId: 'ctrl-circle-start',  fmt: v => `${Math.round(v)}°` },
  circleEndAngle:   { label: 'Arc End',       min: 0,     max: 360,  sliderId: 'ctrl-circle-end',    fmt: v => `${Math.round(v)}°` },
  lineWidth:    { label: 'Line Width',    min: 0.002, max: 0.08, sliderId: 'ctrl-line-width',    fmt: v => `${(v * 100).toFixed(1)}%` },
  lineGlow:     { label: 'Line Glow',     min: 0,     max: 1.4,  sliderId: 'ctrl-line-glow',     fmt: v => `${Math.round(v * 100)}%` },
  lineSpeed:    { label: 'Chase Speed',   min: -3,    max: 3,    sliderId: 'ctrl-line-speed',    fmt: v => `${v.toFixed(2)}×` },
  lineDuty:     { label: 'Beam Duty',     min: 0.05,  max: 1,    sliderId: 'ctrl-line-duty',     fmt: v => `${Math.round(v * 100)}%` },
  lineCount:    { label: 'Packets',       min: 1,     max: 12,   sliderId: 'ctrl-line-count',    fmt: v => `${Math.round(v)}` },
  borderWidth:  { label: 'Outline Width', min: 0,     max: 0.05, sliderId: 'ctrl-border-width',  fmt: v => v <= 0.0005 ? 'Off' : `${(v * 100).toFixed(1)}%` },
  borderGlow:   { label: 'Outline Glow',  min: 0,     max: 1.4,  sliderId: 'ctrl-border-glow',   fmt: v => `${Math.round(v * 100)}%` },
  borderSpeed:  { label: 'Outline Speed', min: -3,    max: 3,    sliderId: 'ctrl-border-speed',  fmt: v => `${v.toFixed(2)}×` },
  posX3d:       { label: '3D Pos X',      min: -2.5,  max: 2.5,  sliderId: 'ctrl-3d-posx',       fmt: v => v.toFixed(2) },
  posY3d:       { label: '3D Pos Y',      min: -2.5,  max: 2.5,  sliderId: 'ctrl-3d-posy',       fmt: v => v.toFixed(2) },
  posZ3d:       { label: '3D Pos Z',      min: -3.5,  max: 2.5,  sliderId: 'ctrl-3d-posz',       fmt: v => v.toFixed(2) },
  rotX3d:       { label: '3D Pitch X',    min: -180,  max: 180,  sliderId: 'ctrl-3d-rotx',       fmt: v => `${Math.round(v)}°` },
  rotY3d:       { label: '3D Yaw Y',      min: -180,  max: 180,  sliderId: 'ctrl-3d-roty',       fmt: v => `${Math.round(v)}°` },
  rotZ3d:       { label: '3D Roll Z',     min: -180,  max: 180,  sliderId: 'ctrl-3d-rotz',       fmt: v => `${Math.round(v)}°` },
  scale3dUniform: { label: '3D Scale',    min: 0.15,  max: 3.5,  sliderId: 'ctrl-3d-scale',      fmt: v => `${v.toFixed(2)}×` },
  camThrow:     { label: '3D Throw Ratio',min: 0.35,  max: 3.5,  sliderId: 'ctrl-3d-throw',      fmt: v => `${v.toFixed(2)}:1` },
  camDist:      { label: '3D Cam Dist',   min: 0.8,   max: 10.0, sliderId: 'ctrl-3d-camdist',    fmt: v => `${v.toFixed(2)}m` },
  lensShiftX:   { label: '3D Lens Shift H',min: -0.8, max: 0.8,  sliderId: 'ctrl-3d-shiftx',     fmt: v => `${Math.round(v * 100)}%` },
  lensShiftY:   { label: '3D Lens Shift V',min: -0.8, max: 0.8,  sliderId: 'ctrl-3d-shifty',     fmt: v => `${Math.round(v * 100)}%` },
  wireWidth:    { label: '3D Wire Width', min: 0,     max: 5.0,  sliderId: 'ctrl-3d-wire-w',     fmt: v => v <= 0.02 ? 'Off' : `${v.toFixed(2)}px` },
  wireGlow:     { label: '3D Wire Glow',  min: 0,     max: 1.5,  sliderId: 'ctrl-3d-wire-glow',  fmt: v => `${Math.round(v * 100)}%` },
  wireChase:    { label: '3D Wire Chase', min: -3,    max: 3,    sliderId: 'ctrl-3d-wire-chase', fmt: v => Math.abs(v) <= 0.01 ? 'Off' : `${v.toFixed(2)}×` },
  lightAzim:    { label: '3D Light Azim', min: -180,  max: 180,  sliderId: 'ctrl-3d-light-az',   fmt: v => `${Math.round(v)}°` },
  lightElev:    { label: '3D Light Elev', min: -60,   max: 90,   sliderId: 'ctrl-3d-light-el',   fmt: v => `${Math.round(v)}°` },
  lightSpec:    { label: '3D Specular',   min: 0,     max: 1.5,  sliderId: 'ctrl-3d-light-spec', fmt: v => `${Math.round(v * 100)}%` },
  shutterL:     { label: 'Shutter Left',  min: 0,     max: 0.85, sliderId: 'ctrl-shutter-l',     fmt: v => `${Math.round(v * 100)}%` },
  shutterR:     { label: 'Shutter Right', min: 0,     max: 0.85, sliderId: 'ctrl-shutter-r',     fmt: v => `${Math.round(v * 100)}%` },
  shutterT:     { label: 'Shutter Top',   min: 0,     max: 0.85, sliderId: 'ctrl-shutter-t',     fmt: v => `${Math.round(v * 100)}%` },
  shutterB:     { label: 'Shutter Bottom',min: 0,     max: 0.85, sliderId: 'ctrl-shutter-b',     fmt: v => `${Math.round(v * 100)}%` },
  shutterAngL:  { label: 'Shutter Tilt L',min: -45,   max: 45,   sliderId: 'ctrl-shutter-ang-l', fmt: v => `${Math.round(v)}°` },
  shutterAngR:  { label: 'Shutter Tilt R',min: -45,   max: 45,   sliderId: 'ctrl-shutter-ang-r', fmt: v => `${Math.round(v)}°` },
  shutterAngT:  { label: 'Shutter Tilt T',min: -45,   max: 45,   sliderId: 'ctrl-shutter-ang-t', fmt: v => `${Math.round(v)}°` },
  shutterAngB:  { label: 'Shutter Tilt B',min: -45,   max: 45,   sliderId: 'ctrl-shutter-ang-b', fmt: v => `${Math.round(v)}°` },
  shutterSoft:  { label: 'Shutter Frost', min: 0,     max: 0.25, sliderId: 'ctrl-shutter-soft',  fmt: v => `${(v * 100).toFixed(1)}%` }
};

const FOLLOWSPOT_PROP_META = {
  spotX:       { label: 'Followspot X',      min: 0,     max: 1,    sliderId: null,                fmt: v => v.toFixed(3) },
  spotY:       { label: 'Followspot Y',      min: 0,     max: 1,    sliderId: null,                fmt: v => v.toFixed(3) },
  radius:      { label: 'Spot Cloud Size',   min: 0.01,  max: 0.85, sliderId: 'ctrl-spot-radius',  fmt: v => v.toFixed(2) },
  softness:    { label: 'Spot Feather',      min: 0.002, max: 0.6,  sliderId: 'ctrl-spot-soft',    fmt: v => v.toFixed(2) },
  gain:        { label: 'Spot Cloud Gain',   min: 0.1,   max: 3.5,  sliderId: 'ctrl-spot-gain',    fmt: v => v.toFixed(2) },
  ambient:     { label: 'Spot Stage Floor',  min: 0,     max: 1,    sliderId: 'ctrl-spot-ambient', fmt: v => `${Math.round(v * 100)}%` },
  stretchX:    { label: 'Spot Stretch H',    min: 0.15,  max: 3.5,  sliderId: 'ctrl-spot-sx',      fmt: v => `${v.toFixed(2)}×` },
  stretchY:    { label: 'Spot Stretch V',    min: 0.15,  max: 3.5,  sliderId: 'ctrl-spot-sy',      fmt: v => `${v.toFixed(2)}×` },
  rotation:    { label: 'Spot Rotation',     min: -180,  max: 180,  sliderId: 'ctrl-spot-rot',     fmt: v => `${Math.round(v)}°` },
  morph:       { label: 'Spot Shape Shift',  min: 0,     max: 3,    sliderId: 'ctrl-spot-morph',   fmt: v => v.toFixed(2) },
  inertia:     { label: 'Spot Inertia',      min: 0,     max: 0.96, sliderId: 'ctrl-spot-inertia', fmt: v => v.toFixed(2) },
  shadowDepth: { label: 'Spot Shadow Cut',   min: 0,     max: 1,    sliderId: 'ctrl-spot-sdepth',  fmt: v => v.toFixed(2) },
  shadowTex:   { label: 'Spot Cloud Grit',   min: 0.15,  max: 3.0,  sliderId: 'ctrl-spot-stex',    fmt: v => v.toFixed(2) },
  shadowRnd:   { label: 'Spot Turbulence',   min: 0,     max: 1,    sliderId: 'ctrl-spot-srnd',    fmt: v => v.toFixed(2) },
  shadowSpeed: { label: 'Spot Drift Speed',  min: 0,     max: 2.5,  sliderId: 'ctrl-spot-sspeed',  fmt: v => v.toFixed(2) },
  temp:        { label: 'Spot Kelvin Shift', min: -1,    max: 1,    sliderId: 'ctrl-spot-temp',    fmt: v => `${Math.round(5100 - v * 2200)}K` },
  performerDepthM:  { label: '3D Performer Depth',  min: 0,    max: 5.0, sliderId: 'ctrl-spot-perf-depth',  fmt: v => `${v.toFixed(2)}m` },
  performerHeightM: { label: '3D Performer Height', min: 0.6,  max: 2.6, sliderId: 'ctrl-spot-perf-height', fmt: v => `${v.toFixed(2)}m` },
  performerRadiusM: { label: '3D Performer Width',  min: 0.15, max: 1.2, sliderId: 'ctrl-spot-perf-radius', fmt: v => `${v.toFixed(2)}m` }
};

const MASK_PROP_META = {
  feather:      { label: 'Mask Feather', min: 0,     max: 0.25, sliderId: 'ctrl-mask-feather', fmt: v => `${(v * 100).toFixed(1)}%` },
  choke:        { label: 'Mask Choke',   min: -0.08, max: 0.08, sliderId: 'ctrl-mask-choke',   fmt: v => `${(v * 100).toFixed(1)}%` },
  opacity:      { label: 'Mask Strength',min: 0,     max: 1,    sliderId: 'ctrl-mask-opacity', fmt: v => `${Math.round(v * 100)}%` },
  curveTension: { label: 'Curve Tension',min: 0.1,   max: 0.95, sliderId: 'ctrl-mask-tension', fmt: v => `${Math.round(v * 100)}%` }
};

// Reverse lookup from static DOM slider ID -> target descriptor builder
const SLIDER_ID_TO_PROP = (() => {
  const map = new Map();
  for (const [prop, meta] of Object.entries(SURFACE_PROP_META)) {
    if (meta.sliderId) map.set(meta.sliderId, { scope: 'surface', prop, meta });
  }
  for (const [prop, meta] of Object.entries(FOLLOWSPOT_PROP_META)) {
    if (meta.sliderId) map.set(meta.sliderId, { scope: 'followspot', prop, meta });
  }
  for (const [prop, meta] of Object.entries(MASK_PROP_META)) {
    if (meta.sliderId) map.set(meta.sliderId, { scope: 'mask', prop, meta });
  }
  return map;
})();

function describeSliderTarget(sliderEl) {
  if (!sliderEl || !sliderEl.id) return null;
  const id = sliderEl.id;
  const min = Number.isFinite(parseFloat(sliderEl.min)) ? parseFloat(sliderEl.min) : 0;
  const max = Number.isFinite(parseFloat(sliderEl.max)) ? parseFloat(sliderEl.max) : 1;

  // 1. Explicit data-wm-target attribute (used by dynamic FX Rack & ISF Shader Studio sliders)
  if (sliderEl.dataset && sliderEl.dataset.wmTarget) {
    return {
      targetKey: sliderEl.dataset.wmTarget,
      label: sliderEl.dataset.wmLabel || id,
      min,
      max,
      sliderId: id
    };
  }

  // 2. Global Master / Output / MixBus / Source sliders
  if (id === 'ctrl-master-opacity') {
    return { targetKey: 'master:opacity', label: 'Master Dimmer', min: 0, max: 1, sliderId: id };
  }
  if (id === 'ctrl-mk-lens') {
    return { targetKey: 'master:lensK1', label: 'Master Lens Trim k1', min: -0.35, max: 0.35, sliderId: id };
  }
  if (id === 'ctrl-stage-bg-opacity') {
    return { targetKey: 'master:stageBgOpacity', label: 'Stage Ref Opacity', min: 0.05, max: 1, sliderId: id };
  }
  if (id === 'ctrl-mixbus-orbit') {
    return { targetKey: 'mixbus:autoOrbit', label: 'Mix Circle • Auto Orbit', min: -3, max: 3, sliderId: id };
  }
  if (id === 'ctrl-mixbus-curve') {
    return { targetKey: 'mixbus:falloffCurve', label: 'Mix Circle • Falloff Curve', min: 0.25, max: 4, sliderId: id };
  }
  if (id === 'ctrl-dmx-dimmer') {
    return { targetKey: 'dmx:masterDimmer', label: 'LED DMX • Master Dimmer', min: 0, max: 1, sliderId: id };
  }

  // Active source transport sliders
  const activeSrc = getSourceById(state.activeSourceId);
  if (activeSrc) {
    const srcTransportMap = {
      'ctrl-shd-speed':  ['speed', 'Shader Speed'],
      'ctrl-shd-scale':  ['scale', 'Shader Scale'],
      'ctrl-shd-detail': ['detail', 'Shader Detail'],
      'ctrl-shd-temp':   ['temp', 'Shader Kelvin'],
      'ctrl-isf-speed':  ['speed', 'ISF Speed'],
      'ctrl-vid-rate':   ['rate', 'Video Rate'],
      'ctrl-vid-in':     ['trimIn', 'Video Trim In'],
      'ctrl-vid-out':    ['trimOut', 'Video Trim Out'],
      'ctrl-vid-vol':    ['volume', 'Video Volume'],
      'ctrl-txt-size':   ['fontSize', 'Text Size'],
      'ctrl-txt-bg-alpha': ['bgOpacity', 'Text BG Alpha']
    };
    if (srcTransportMap[id]) {
      const [prop, lbl] = srcTransportMap[id];
      return {
        targetKey: `source:${activeSrc.id}:${prop}`,
        label: `${activeSrc.name} • ${lbl}`,
        min,
        max,
        sliderId: id
      };
    }
  }

  // 3. Static Surface / Followspot / Mask Inspector sliders
  const entry = SLIDER_ID_TO_PROP.get(id);
  if (entry) {
    if (entry.scope === 'surface') {
      const surf = getSelectedSurface();
      if (!surf) return null;
      return {
        targetKey: `surface:${surf.id}:${entry.prop}`,
        label: `${surf.name} • ${entry.meta.label}`,
        min: entry.meta.min,
        max: entry.meta.max,
        sliderId: id
      };
    }
    if (entry.scope === 'followspot') {
      return {
        targetKey: `followspot:${entry.prop}`,
        label: entry.meta.label,
        min: entry.meta.min,
        max: entry.meta.max,
        sliderId: id
      };
    }
    if (entry.scope === 'mask') {
      const m = state.masks.find(x => x.id === state.selectedMaskId);
      if (!m) return null;
      return {
        targetKey: `mask:${m.id}:${entry.prop}`,
        label: `${m.name} • ${entry.meta.label}`,
        min: entry.meta.min,
        max: entry.meta.max,
        sliderId: id
      };
    }
  }

  return null;
}

function getParamTargetBounds(targetKey) {
  if (!targetKey) return { min: 0, max: 1, label: 'Unknown' };
  const parts = String(targetKey).split(':');
  const scope = parts[0];
  if (scope === 'master') {
    if (parts[1] === 'lensK1') return { min: -0.35, max: 0.35, label: 'Master Lens Trim k1', sliderId: 'ctrl-mk-lens' };
    if (parts[1] === 'stageBgOpacity') return { min: 0.05, max: 1, label: 'Stage Ref Opacity', sliderId: 'ctrl-stage-bg-opacity' };
    return { min: 0, max: 1, label: 'Master Dimmer', sliderId: 'ctrl-master-opacity' };
  }
  if (scope === 'dmx') {
    if (parts.length >= 3 && Array.isArray(state.dmxDevices)) {
      const dev = state.dmxDevices.find(d => d.id === parts[1]);
      const ch = dev?.channels?.find(c => c.key === parts[2]);
      return { min: 0, max: 255, label: dev && ch ? `DMX ${dev.name} • ${ch.label}` : targetKey, sliderId: null };
    }
    return { min: 0, max: 1, label: 'LED DMX • Master Dimmer', sliderId: 'ctrl-dmx-dimmer' };
  }
  if (scope === 'spot') {
    const idx = clamp(parseInt(parts[1], 10) || 0, 0, 7);
    const prop = parts[2];
    const spName = state.spots?.[idx]?.name || `Spot ${idx + 1}`;
    if (prop === 'fbmAmt') return { min: 0, max: 1, label: `${spName} • Cloud Amount`, sliderId: null };
    if (prop === 'goboRotSpeed') return { min: -180, max: 180, label: `${spName} • Gobo Spin`, sliderId: null };
    if (prop === 'goboAngle') return { min: 0, max: 360, label: `${spName} • Gobo Angle`, sliderId: null };
    if (prop === 'worldRadiusM') return { min: 0.05, max: 5.0, label: `${spName} • 3D Radius (m)`, sliderId: null };
    const meta = FOLLOWSPOT_PROP_META[prop];
    if (meta) return { min: meta.min, max: meta.max, label: `${spName} • ${meta.label}`, sliderId: null };
  }
  if (scope === 'constellation') {
    return { min: 0, max: 1, label: parts[1] === 'puckY' ? 'Constellation Puck Y' : 'Constellation Puck X', sliderId: null };
  }
  if (scope === 'mixbus') {
    if (parts[1] === 'autoOrbit') return { min: -3, max: 3, label: 'Mix Circle • Auto Orbit', sliderId: 'ctrl-mixbus-orbit' };
    if (parts[1] === 'falloffCurve') return { min: 0.25, max: 4, label: 'Mix Circle • Falloff Curve', sliderId: 'ctrl-mixbus-curve' };
    if (parts[1] === 'orb') {
      const axis = parts[3];
      if (axis === 'gain') return { min: 0, max: 2, label: `Mix Orb #${Number(parts[2]) + 1} Gain`, sliderId: null };
      return { min: -1.15, max: 1.15, label: `Mix Orb #${Number(parts[2]) + 1} ${axis.toUpperCase()}`, sliderId: null };
    }
  }
  if (scope === 'followspot') {
    const meta = FOLLOWSPOT_PROP_META[parts[1]];
    if (meta) return { min: meta.min, max: meta.max, label: meta.label, sliderId: meta.sliderId };
  }
  if (scope === 'surface') {
    const surf = state.surfaces.find(s => s.id === parts[1]);
    const sName = surf ? surf.name : parts[1];
    if (parts[2] === 'fx') {
      const fx = surf && Array.isArray(surf.fxChain) ? surf.fxChain.find(f => f.id === parts[3]) : null;
      const def = fx && typeof getFxDefinition === 'function' ? getFxDefinition(fx.type) : null;
      const pDef = def && Array.isArray(def.params) ? def.params.find(p => p.key === parts[4]) : null;
      return {
        min: pDef ? pDef.min : 0,
        max: pDef ? pDef.max : 1,
        label: `${sName} • ${def ? def.name : 'FX'} ${pDef ? pDef.label : parts[4]}`,
        sliderId: null
      };
    }
    const meta = SURFACE_PROP_META[parts[2]];
    if (meta) return { min: meta.min, max: meta.max, label: `${sName} • ${meta.label}`, sliderId: meta.sliderId };
  }
  if (scope === 'masterfx') {
    const fx = Array.isArray(state.masterFxChain) ? state.masterFxChain.find(f => f.id === parts[1]) : null;
    const def = fx && typeof getFxDefinition === 'function' ? getFxDefinition(fx.type) : null;
    const pDef = def && Array.isArray(def.params) ? def.params.find(p => p.key === parts[2]) : null;
    return {
      min: pDef ? pDef.min : 0,
      max: pDef ? pDef.max : 1,
      label: `Master FX • ${def ? def.name : 'FX'} ${pDef ? pDef.label : parts[2]}`,
      sliderId: null
    };
  }
  if (scope === 'mask') {
    const m = state.masks.find(x => x.id === parts[1]);
    const meta = MASK_PROP_META[parts[2]];
    if (meta) return { min: meta.min, max: meta.max, label: `${m ? m.name : parts[1]} • ${meta.label}`, sliderId: meta.sliderId };
  }
  if (scope === 'source') {
    const src = state.sources.find(s => s.id === parts[1]);
    const sName = src ? src.name : parts[1];
    if (parts[2] === 'isf') {
      const uName = parts[3];
      const inp = src?.isfMeta?.inputs?.find(i => i.name === uName);
      if (inp && inp.type === 'point2D') {
        const ax = Number(parts[4] || 0);
        return { min: inp.min?.[ax] ?? 0, max: inp.max?.[ax] ?? 1, label: `${sName} • ${inp.label} ${ax === 0 ? 'X' : 'Y'}`, sliderId: null };
      }
      return { min: inp?.min ?? 0, max: inp?.max ?? 1, label: `${sName} • ${inp?.label || uName}`, sliderId: null };
    }
    const srcDefaults = {
      speed: [0, 4, 'Speed'],
      scale: [0.2, 4, 'Scale'],
      detail: [0, 1, 'Detail'],
      temp: [-1, 1, 'Kelvin'],
      rate: [0.25, 2.5, 'Playback Rate'],
      trimIn: [0, 0.99, 'Trim In'],
      trimOut: [0.01, 1, 'Trim Out'],
      volume: [0, 1, 'Volume'],
      fontSize: [24, 360, 'Font Size'],
      bgOpacity: [0, 1, 'BG Alpha'],
      animSpeed: [0, 4, 'Motion Speed']
    };
    const d = srcDefaults[parts[2]] || [0, 1, parts[2]];
    return { min: d[0], max: d[1], label: `${sName} • ${d[2]}`, sliderId: null };
  }
  return { min: 0, max: 1, label: targetKey, sliderId: null };
}

function readParamTargetValue(targetKey) {
  if (!targetKey) return 0;
  const parts = String(targetKey).split(':');
  const scope = parts[0];
  if (scope === 'master') {
    if (parts[1] === 'lensK1') return state.masterKeystone.lensK1 || 0;
    if (parts[1] === 'stageBgOpacity') return state.stageBg.opacity ?? 0.52;
    return state.masterOpacity ?? 1;
  }
  if (scope === 'dmx') {
    if (parts.length >= 3 && Array.isArray(state.dmxDevices)) {
      const dev = state.dmxDevices.find(d => d.id === parts[1]);
      const ch = dev?.channels?.find(c => c.key === parts[2]);
      return ch ? Number(ch.modValue ?? ch.seatValue ?? ch.cueValue ?? ch.home ?? 0) : 0;
    }
    return state.pixelMapper?.masterDimmer ?? 1.0;
  }
  if (scope === 'spot') {
    const sp = state.spots?.[clamp(parseInt(parts[1], 10) || 0, 0, Math.max(0, (state.spots?.length || 1) - 1))] || state.followspot;
    const prop = parts[2];
    if (prop === 'spotX') return sp.targetX;
    if (prop === 'spotY') return sp.targetY;
    return Number(sp?.[prop] ?? 0);
  }
  if (scope === 'constellation') {
    return parts[1] === 'puckY' ? state.constellation.puckY : state.constellation.puckX;
  }
  if (scope === 'mixbus') {
    const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
    if (!mixSrc) return 0;
    if (parts[1] === 'autoOrbit') return mixSrc.autoOrbit || 0;
    if (parts[1] === 'falloffCurve') return mixSrc.falloffCurve ?? 1.35;
    if (parts[1] === 'orb') {
      const orb = mixSrc.orbs?.[Number(parts[2])];
      if (!orb) return 0;
      if (parts[3] === 'gain') return orb.gain ?? 1;
      return parts[3] === 'y' ? orb.targetY : orb.targetX;
    }
  }
  if (scope === 'followspot') {
    const prop = parts[1];
    if (prop === 'spotX') return state.followspot.targetX;
    if (prop === 'spotY') return state.followspot.targetY;
    return Number(state.followspot[prop] ?? 0);
  }
  if (scope === 'surface') {
    const surf = state.surfaces.find(s => s.id === parts[1]);
    if (!surf) return 0;
    if (parts[2] === 'fx') {
      const fx = Array.isArray(surf.fxChain) ? surf.fxChain.find(f => f.id === parts[3]) : null;
      return Number(fx?.params?.[parts[4]] ?? 0);
    }
    const p = parts[2];
    if (p === 'posX3d') return Number(surf.pos3d?.[0] ?? 0);
    if (p === 'posY3d') return Number(surf.pos3d?.[1] ?? 0);
    if (p === 'posZ3d') return Number(surf.pos3d?.[2] ?? 0);
    if (p === 'rotX3d') return Number(surf.rot3d?.[0] ?? 18);
    if (p === 'rotY3d') return Number(surf.rot3d?.[1] ?? -28);
    if (p === 'rotZ3d') return Number(surf.rot3d?.[2] ?? 0);
    if (p === 'scale3dUniform') return Number(surf.scale3d?.[0] ?? 1);
    return Number(surf[p] ?? 0);
  }
  if (scope === 'masterfx') {
    const fx = Array.isArray(state.masterFxChain) ? state.masterFxChain.find(f => f.id === parts[1]) : null;
    return Number(fx?.params?.[parts[2]] ?? 0);
  }
  if (scope === 'mask') {
    const m = state.masks.find(x => x.id === parts[1]);
    return m ? Number(m[parts[2]] ?? 0) : 0;
  }
  if (scope === 'source') {
    const src = state.sources.find(s => s.id === parts[1]);
    if (!src) return 0;
    if (parts[2] === 'isf') {
      const cur = src.isfValues?.[parts[3]];
      if (Array.isArray(cur)) return Number(cur[Number(parts[4] || 0)] ?? 0);
      return Number(cur ?? 0);
    }
    return Number(src[parts[2]] ?? 0);
  }
  return 0;
}

let activePointerSliderEl = null;
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('pointerdown', (e) => {
    const sl = e.target && e.target.closest ? e.target.closest('input[type="range"]') : null;
    if (sl) activePointerSliderEl = sl;
  }, true);
  document.addEventListener('pointerup', () => { activePointerSliderEl = null; }, true);
  document.addEventListener('pointercancel', () => { activePointerSliderEl = null; }, true);
}

function syncLiveDomSliderReadout(sliderId, val, fmtFn) {
  if (!sliderId || typeof document === 'undefined') return;
  const el = document.getElementById(sliderId);
  if (!el || el === activePointerSliderEl) return;
  setSliderValue(el, val);
  const row = el.parentElement;
  const valSpan = row && (
    row.querySelector('.ctrl-val') ||
    (el.nextElementSibling && el.nextElementSibling.tagName === 'SPAN' ? el.nextElementSibling : null)
  );
  if (valSpan && fmtFn) {
    const txt = fmtFn(val);
    valSpan.textContent = txt;
    el.setAttribute('aria-valuetext', txt);
  }
}

function applyParamTargetValue(targetKey, rawVal, emitOsc = false) {
  if (!targetKey || !Number.isFinite(Number(rawVal))) return;
  const bounds = getParamTargetBounds(targetKey);
  const val = clamp(Number(rawVal), bounds.min, bounds.max);
  const parts = String(targetKey).split(':');
  const scope = parts[0];

  if (scope === 'master') {
    if (parts[1] === 'lensK1') {
      state.masterKeystone.lensK1 = val;
      syncLiveDomSliderReadout('ctrl-mk-lens', val, v => v.toFixed(3));
    } else if (parts[1] === 'stageBgOpacity') {
      state.stageBg.opacity = val;
      syncLiveDomSliderReadout('ctrl-stage-bg-opacity', val, v => `${Math.round(v * 100)}%`);
    } else {
      state.masterOpacity = val;
      syncLiveDomSliderReadout('ctrl-master-opacity', val, v => `${Math.round(v * 100)}%`);
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  } else if (scope === 'dmx') {
    if (parts.length >= 3 && typeof setDmxDeviceChannelValue === 'function') {
      setDmxDeviceChannelValue(parts[1], parts[2], Math.round(val), 'mod');
    } else if (state.pixelMapper) {
      state.pixelMapper.masterDimmer = val;
      syncLiveDomSliderReadout('ctrl-dmx-dimmer', val, v => `${Math.round(v * 100)}%`);
    }
  } else if (scope === 'spot') {
    const idx = clamp(parseInt(parts[1], 10) || 0, 0, Math.max(0, (state.spots?.length || 1) - 1));
    const sp = state.spots?.[idx] || state.followspot;
    const prop = parts[2];
    if (sp) {
      if (prop === 'spotX') sp.targetX = val;
      else if (prop === 'spotY') sp.targetY = val;
      else sp[prop] = val;
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    }
  } else if (scope === 'constellation') {
    state.constellation.active = true;
    if (parts[1] === 'puckY') state.constellation.targetY = val;
    else state.constellation.targetX = val;
  } else if (scope === 'mixbus') {
    const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
    if (mixSrc) {
      if (parts[1] === 'autoOrbit') {
        mixSrc.autoOrbit = val;
        if (state.activeSourceId === mixSrc.id) syncLiveDomSliderReadout('ctrl-mixbus-orbit', val, v => v.toFixed(2));
      } else if (parts[1] === 'falloffCurve') {
        mixSrc.falloffCurve = val;
        if (state.activeSourceId === mixSrc.id) syncLiveDomSliderReadout('ctrl-mixbus-curve', val, v => v.toFixed(2));
      } else if (parts[1] === 'orb') {
        const orb = mixSrc.orbs?.[Number(parts[2])];
        if (orb) {
          if (parts[3] === 'gain') orb.gain = val;
          else if (parts[3] === 'y') orb.targetY = val;
          else orb.targetX = val;
        }
      }
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    }
  } else if (scope === 'followspot') {
    const prop = parts[1];
    if (prop === 'spotX') {
      state.followspot.targetX = val;
    } else if (prop === 'spotY') {
      state.followspot.targetY = val;
    } else if (prop in state.followspot) {
      state.followspot[prop] = val;
      const meta = FOLLOWSPOT_PROP_META[prop];
      if (meta && meta.sliderId) syncLiveDomSliderReadout(meta.sliderId, val, meta.fmt);
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  } else if (scope === 'surface') {
    const surf = state.surfaces.find(s => s.id === parts[1]);
    if (!surf) return;
    if (parts[2] === 'fx') {
      const fx = Array.isArray(surf.fxChain) ? surf.fxChain.find(f => f.id === parts[3]) : null;
      if (fx) {
        if (!fx.params) fx.params = {};
        fx.params[parts[4]] = val;
        if (state.selectedSurfaceId === surf.id && typeof document !== 'undefined' && typeof document.querySelector === 'function') {
          const escKey = typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function' ? CSS.escape(targetKey) : targetKey;
          const dynSl = document.querySelector(`input[data-wm-target="${escKey}"]`);
          if (dynSl && dynSl !== activePointerSliderEl) {
            setSliderValue(dynSl, val);
            const sp = dynSl.parentElement?.querySelector('.ctrl-val');
            if (sp) sp.textContent = val.toFixed(2);
          }
        }
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      }
    } else {
      const prop = parts[2];
      let appliedVal = val;
      if (prop === 'posX3d' || prop === 'posY3d' || prop === 'posZ3d') {
        if (!Array.isArray(surf.pos3d)) surf.pos3d = [0, 0, 0];
        const ax = prop === 'posX3d' ? 0 : (prop === 'posY3d' ? 1 : 2);
        surf.pos3d[ax] = val;
      } else if (prop === 'rotX3d' || prop === 'rotY3d' || prop === 'rotZ3d') {
        if (!Array.isArray(surf.rot3d)) surf.rot3d = [18, -28, 0];
        const ax = prop === 'rotX3d' ? 0 : (prop === 'rotY3d' ? 1 : 2);
        surf.rot3d[ax] = val;
      } else if (prop === 'scale3dUniform') {
        surf.scale3d = [val, val, val];
      } else {
        surf[prop] = val;
        if (prop === 'feather' && surf.featherLink !== false) {
          surf.featherL = val;
          surf.featherR = val;
          surf.featherT = val;
          surf.featherB = val;
        }
        if (prop === 'lineCount') {
          surf[prop] = Math.round(val);
          appliedVal = surf[prop];
        }
      }
      const meta = SURFACE_PROP_META[prop];
      if (meta && meta.sliderId && state.selectedSurfaceId === surf.id) {
        syncLiveDomSliderReadout(meta.sliderId, appliedVal, meta.fmt);
      }
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    }
  } else if (scope === 'masterfx') {
    const fx = Array.isArray(state.masterFxChain) ? state.masterFxChain.find(f => f.id === parts[1]) : null;
    if (fx) {
      if (!fx.params) fx.params = {};
      fx.params[parts[2]] = val;
      if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
        const escKey = typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function' ? CSS.escape(targetKey) : targetKey;
        const dynSl = document.querySelector(`input[data-wm-target="${escKey}"]`);
        if (dynSl && dynSl !== activePointerSliderEl) {
          setSliderValue(dynSl, val);
          const sp = dynSl.parentElement?.querySelector('.ctrl-val');
          if (sp) sp.textContent = val.toFixed(2);
        }
      }
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    }
  } else if (scope === 'mask') {
    const m = state.masks.find(x => x.id === parts[1]);
    if (!m) return;
    const prop = parts[2];
    m[prop] = val;
    const meta = MASK_PROP_META[prop];
    if (meta && meta.sliderId && state.selectedMaskId === m.id) {
      syncLiveDomSliderReadout(meta.sliderId, val, meta.fmt);
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  } else if (scope === 'source') {
    const src = state.sources.find(s => s.id === parts[1]);
    if (!src) return;
    if (parts[2] === 'isf') {
      if (!src.isfValues) src.isfValues = {};
      const uName = parts[3];
      if (parts[4] !== undefined) {
        if (!Array.isArray(src.isfValues[uName])) src.isfValues[uName] = [0.5, 0.5];
        src.isfValues[uName][Number(parts[4])] = val;
      } else {
        src.isfValues[uName] = val;
      }
      state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    } else {
      const prop = parts[2];
      src[prop] = val;
      if (src.kind === 'video' && src.video) {
        if (prop === 'rate') src.video.playbackRate = val;
        if (prop === 'volume') {
          if (typeof syncVideoAudioElementState === 'function') syncVideoAudioElementState(src);
          else src.video.volume = val;
        }
      }
      if (src.kind === 'text') {
        src._textDirty = true;
        state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
      }
    }
  }

  if (emitOsc && state.osc.enabled && state.osc.sendFeedback) {
    const span = Math.max(1e-6, bounds.max - bounds.min);
    const norm01 = clamp((val - bounds.min) / span, 0, 1);
    sendOscMessage(`${APP_OSC_PREFIX}/param/${targetKey}`, [{ type: 'f', value: norm01 }]);
  }
}

function getAvailableModTargetsList() {
  const list = [
    { key: 'master:opacity', label: 'Master • Output Dimmer' },
    { key: 'followspot:spotX', label: 'Followspot • Position X' },
    { key: 'followspot:spotY', label: 'Followspot • Position Y' },
    { key: 'followspot:radius', label: 'Followspot • Cloud Size' },
    { key: 'followspot:gain', label: 'Followspot • Cloud Gain' },
    { key: 'followspot:morph', label: 'Followspot • Shape Shift' },
    { key: 'followspot:rotation', label: 'Followspot • Rotation' },
    { key: 'mixbus:autoOrbit', label: 'Mix Circle • Auto Orbit Speed' },
    { key: 'constellation:puckX', label: '2D Cue Constellation • Puck X' },
    { key: 'constellation:puckY', label: '2D Cue Constellation • Puck Y' },
    { key: 'dmx:masterDimmer', label: 'LED DMX • Master Dimmer' }
  ];

  if (Array.isArray(state.spots)) {
    state.spots.forEach((sp, idx) => {
      if (idx === 0) return;
      const nm = sp.name || `Spot ${idx + 1}`;
      list.push({ key: `spot:${idx}:spotX`, label: `${nm} • Position X` });
      list.push({ key: `spot:${idx}:spotY`, label: `${nm} • Position Y` });
      list.push({ key: `spot:${idx}:radius`, label: `${nm} • Iris Radius` });
      list.push({ key: `spot:${idx}:gain`, label: `${nm} • Gain` });
      list.push({ key: `spot:${idx}:goboRotSpeed`, label: `${nm} • Gobo Spin` });
    });
  }

  if (Array.isArray(state.dmxDevices)) {
    for (const dev of state.dmxDevices) {
      if (!dev || !Array.isArray(dev.channels)) continue;
      for (const ch of dev.channels) {
        if (ch.kind === 'power') continue; // Safety: power relay channels excluded from modulators!
        list.push({ key: `dmx:${dev.id}:${ch.key}`, label: `DMX ${dev.name} • ${ch.label}` });
      }
    }
  }

  for (const s of state.surfaces) {
    list.push({ key: `surface:${s.id}:opacity`, label: `${s.name} • Opacity` });
    list.push({ key: `surface:${s.id}:brightness`, label: `${s.name} • Brightness` });
    list.push({ key: `surface:${s.id}:contrast`, label: `${s.name} • Contrast` });
    list.push({ key: `surface:${s.id}:hueShift`, label: `${s.name} • Hue Shift` });
    list.push({ key: `surface:${s.id}:feather`, label: `${s.name} • Edge Feather` });
    list.push({ key: `surface:${s.id}:uvX`, label: `${s.name} • UV Pos X` });
    list.push({ key: `surface:${s.id}:uvY`, label: `${s.name} • UV Pos Y` });
    list.push({ key: `surface:${s.id}:uvRot`, label: `${s.name} • UV Rotate` });
    if (s.type === 'line') {
      list.push({ key: `surface:${s.id}:lineGlow`, label: `${s.name} • Line Glow` });
      list.push({ key: `surface:${s.id}:lineSpeed`, label: `${s.name} • Chase Speed` });
    }
    if (s.type === 'mesh3d') {
      list.push({ key: `surface:${s.id}:rotY3d`, label: `${s.name} • 3D Yaw Y` });
      list.push({ key: `surface:${s.id}:rotX3d`, label: `${s.name} • 3D Pitch X` });
      list.push({ key: `surface:${s.id}:rotZ3d`, label: `${s.name} • 3D Roll Z` });
      list.push({ key: `surface:${s.id}:scale3dUniform`, label: `${s.name} • 3D Scale` });
      list.push({ key: `surface:${s.id}:posX3d`, label: `${s.name} • 3D Pos X` });
      list.push({ key: `surface:${s.id}:posY3d`, label: `${s.name} • 3D Pos Y` });
      list.push({ key: `surface:${s.id}:posZ3d`, label: `${s.name} • 3D Pos Z` });
      list.push({ key: `surface:${s.id}:wireWidth`, label: `${s.name} • 3D Wire Width` });
      list.push({ key: `surface:${s.id}:wireGlow`, label: `${s.name} • 3D Wire Glow` });
      list.push({ key: `surface:${s.id}:wireChase`, label: `${s.name} • 3D Wire Chase` });
      list.push({ key: `surface:${s.id}:lightAzim`, label: `${s.name} • 3D Light Azim` });
      list.push({ key: `surface:${s.id}:lightElev`, label: `${s.name} • 3D Light Elev` });
    }
    if (Array.isArray(s.fxChain)) {
      for (const fx of s.fxChain) {
        const def = typeof getFxDefinition === 'function' ? getFxDefinition(fx.type) : null;
        if (def && Array.isArray(def.params)) {
          for (const p of def.params) {
            list.push({ key: `surface:${s.id}:fx:${fx.id}:${p.key}`, label: `${s.name} • ${def.name} ${p.label}` });
          }
        }
      }
    }
  }

  for (const src of state.sources) {
    if (src.kind === 'shader') {
      list.push({ key: `source:${src.id}:speed`, label: `${src.name} • Speed` });
      list.push({ key: `source:${src.id}:scale`, label: `${src.name} • Scale` });
      list.push({ key: `source:${src.id}:detail`, label: `${src.name} • Detail` });
    } else if (src.kind === 'isf' && src.isfMeta && Array.isArray(src.isfMeta.inputs)) {
      for (const inp of src.isfMeta.inputs) {
        if (inp.type === 'float') {
          list.push({ key: `source:${src.id}:isf:${inp.name}`, label: `${src.name} • ${inp.label}` });
        }
      }
    }
  }
  return list;
}

function syncModulatedSliderHighlights() {
  if (typeof document === 'undefined') return;
  const modByKey = new Map();
  if (Array.isArray(state.modulators)) {
    for (const m of state.modulators) {
      if (m && m.enabled !== false && m.targetKey && !modByKey.has(m.targetKey)) {
        modByKey.set(m.targetKey, m);
      }
    }
  }
  const tlKeys = new Set();
  if (state.timeline && Array.isArray(state.timeline.tracks)) {
    for (const tr of state.timeline.tracks) {
      if (tr && !tr.muted && tr.targetKey) tlKeys.add(tr.targetKey);
    }
  }
  const midiKeys = new Set();
  if (state.midi && Array.isArray(state.midi.mappings)) {
    for (const mp of state.midi.mappings) {
      if (mp && mp.targetType === 'param' && mp.targetKey) midiKeys.add(mp.targetKey);
    }
  }
  const manualKeys = state.manualTouchedKeys || {};

  const allSliders = document.querySelectorAll('input[type="range"].studio-slider');
  for (const sl of allSliders) {
    const desc = describeSliderTarget(sl);
    const key = desc ? desc.targetKey : null;
    const mod = key ? modByKey.get(key) : null;
    const hasMidi = !!(key && midiKeys.has(key));
    const hasTl = !!(key && tlKeys.has(key));
    const isMod = !!(mod || hasMidi || (hasTl && state.timeline && state.timeline.playing));
    sl.classList.toggle('mod-bound-slider', isMod);

    if (mod) {
      const minAttr = parseFloat(sl.min) || 0;
      const maxAttr = Number.isFinite(parseFloat(sl.max)) ? parseFloat(sl.max) : 1;
      const span = Math.max(1e-6, maxAttr - minAttr);
      const loPct = clamp(((Math.min(mod.minVal, mod.maxVal) - minAttr) / span) * 100, 0, 100);
      const hiPct = clamp(((Math.max(mod.minVal, mod.maxVal) - minAttr) / span) * 100, 0, 100);
      const liveVal = mod.minVal + (mod.maxVal - mod.minVal) * (mod._curNorm ?? 0.5);
      const livePct = clamp(((liveVal - minAttr) / span) * 100, 0, 100);
      sl.style.setProperty('--mod-min-pct', `${loPct.toFixed(1)}%`);
      sl.style.setProperty('--mod-max-pct', `${hiPct.toFixed(1)}%`);
      sl.style.setProperty('--mod-live-pct', `${livePct.toFixed(1)}%`);
    }

    const row = typeof sl.closest === 'function' ? sl.closest('.ctrl-row') : null;
    const valEl = row && typeof row.querySelector === 'function' ? row.querySelector('.ctrl-val') : null;
    if (valEl && valEl.classList) {
      valEl.classList.remove('own-manual', 'own-cue', 'own-mod', 'own-tl', 'own-midi');
      if (mod) {
        valEl.classList.add('own-mod');
        valEl.title = `Modulated (${mod.kind.toUpperCase()} ${mod.minVal.toFixed(2)}..${mod.maxVal.toFixed(2)}) — right-click slider to edit inline`;
      } else if (hasMidi) {
        valEl.classList.add('own-midi');
        valEl.title = 'Controlled by MIDI hardware mapping';
      } else if (hasTl) {
        valEl.classList.add('own-tl');
        valEl.title = 'Automated by Keyframe Timeline track';
      } else if (key && manualKeys[key]) {
        valEl.classList.add('own-manual');
        valEl.title = 'Manual override (unrecorded since last Cue — click ↻ Update or + Store)';
      } else if (state.activeCueId) {
        valEl.classList.add('own-cue');
        valEl.title = 'Tracking active Cue value';
      }
    }

    if (typeof syncInlineModBadgeForSlider === 'function') {
      syncInlineModBadgeForSlider(sl, desc, mod);
    }
  }
}

// ----------------------------------------------------------------------------
// 2. WEBAUDIO MULTI-BAND FFT, ONSET BEAT DETECTOR & LIVE SPECTRUM CANVAS
// ----------------------------------------------------------------------------

let liveAudioCtx = null;
let liveAnalyser = null;
let liveSilentPullGain = null;
let liveMicStream = null;
let liveMicSourceNode = null;
let liveSyphonSourceNode = null;
let liveSyphonBoundStream = null;
let liveCaptureDestNode = null;
let fftBinsBuffer = new Uint8Array(64);
const videoFftBufferCache = new WeakMap();
let activeVideoFftPlayback = null;
let prevLowEnergy = 0;
let beatHoldCooldownSec = 0;
const onsetTimestampsMs = [];
const audioTapHistoryMs = [];

function ensureLiveAudioGraph() {
  if (liveAudioCtx && liveAnalyser) return true;
  const Ctor = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
  if (!Ctor) return false;
  try {
    liveAudioCtx = new Ctor();
    liveAnalyser = liveAudioCtx.createAnalyser();
    liveAnalyser.fftSize = 1024;
    liveAnalyser.minDecibels = -92;
    liveAnalyser.maxDecibels = -18;
    liveAnalyser.smoothingTimeConstant = clamp(state.audio.smoothing ?? 0.72, 0.05, 0.96);
    fftBinsBuffer = new Uint8Array(liveAnalyser.frequencyBinCount);
    // Connect AnalyserNode through a 0.0-gain pull sink to destination so Safari/WebKit &
    // Chromium audio threads always pull MediaStream / Buffer subgraphs with zero speaker output!
    if (typeof liveAnalyser.connect === 'function' && liveAudioCtx.destination) {
      liveSilentPullGain = liveAudioCtx.createGain();
      liveSilentPullGain.gain.value = 0.0;
      liveAnalyser.connect(liveSilentPullGain);
      liveSilentPullGain.connect(liveAudioCtx.destination);
    }
    if (typeof liveAudioCtx.createMediaStreamDestination === 'function') {
      liveCaptureDestNode = liveAudioCtx.createMediaStreamDestination();
    }
    return true;
  } catch (_) {
    return false;
  }
}

function getAudioCaptureStreamTrack() {
  if (liveCaptureDestNode && liveCaptureDestNode.stream) {
    const tracks = liveCaptureDestNode.stream.getAudioTracks();
    if (tracks && tracks.length > 0) return tracks[0];
  }
  if (liveMicStream) {
    const tracks = liveMicStream.getAudioTracks();
    if (tracks && tracks.length > 0) return tracks[0];
  }
  return null;
}

async function enableAudioAnalyzer(mode = null, deviceId = null) {
  if (mode) state.audio.sourceMode = mode;
  if (deviceId !== null) state.audio.deviceId = deviceId;
  state.audio.enabled = true;

  // Disconnect previous live mic / screen-capture nodes and mute video FFT taps unless sourceMode === 'video'
  if (liveMicSourceNode && state.audio.sourceMode !== 'mic') {
    try { liveMicSourceNode.disconnect(); } catch (_) {}
    liveMicSourceNode = null;
  }
  if (liveMicStream && state.audio.sourceMode !== 'mic') {
    try { liveMicStream.getTracks().forEach(t => t.stop()); } catch (_) {}
    liveMicStream = null;
  }
  if (liveSyphonSourceNode && state.audio.sourceMode !== 'syphon') {
    try { liveSyphonSourceNode.disconnect(); } catch (_) {}
    liveSyphonSourceNode = null;
    liveSyphonBoundStream = null;
  }
  if (state.audio.sourceMode !== 'video') {
    muteAllVideoFftTaps();
  }

  if (state.audio.sourceMode === 'synth') {
    showToast(`🥁 Audio Synth Beat Engine Active (${Math.round(state.audio.bpm)} BPM)`);
    if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    return true;
  }

  if (!ensureLiveAudioGraph()) {
    state.audio.sourceMode = 'synth';
    showToast('WebAudio unavailable — switched to built-in Synth Beat Engine');
    if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    return true;
  }
  if (liveAudioCtx.state === 'suspended' && typeof liveAudioCtx.resume === 'function') {
    try { await liveAudioCtx.resume(); } catch (_) {}
  }

  if (state.audio.sourceMode === 'mic') {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      state.audio.sourceMode = 'synth';
      showToast('Microphone unavailable — using Synth Beat Engine');
      if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
      return false;
    }
    try {
      if (liveMicSourceNode) {
        try { liveMicSourceNode.disconnect(); } catch (_) {}
        liveMicSourceNode = null;
      }
      if (liveMicStream) {
        liveMicStream.getTracks().forEach(t => t.stop());
        liveMicStream = null;
      }
      const audioConstraint = state.audio.deviceId
        ? { deviceId: { exact: state.audio.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      liveMicStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
      liveMicSourceNode = liveAudioCtx.createMediaStreamSource(liveMicStream);
      liveMicSourceNode.connect(liveAnalyser);
      if (liveCaptureDestNode) liveMicSourceNode.connect(liveCaptureDestNode);
      refreshAudioInputDevicesList();
      showToast('🎙 Live Microphone / Line-In FFT Active');
    } catch (_) {
      state.audio.sourceMode = 'synth';
      showToast('Mic permission declined — switched to Synth Beat Engine');
    }
  } else if (state.audio.sourceMode === 'video') {
    const targetVid = attachActiveVideoToAudioGraph();
    if (targetVid) {
      showToast(`🎬 Video Audio FFT Active: "${targetVid.name}"`);
    } else {
      showToast('🎬 Video Audio Mode Ready — click "+ Video…" to load a clip with sound');
    }
  } else if (state.audio.sourceMode === 'syphon') {
    const res = attachActiveSyphonToAudioGraph();
    if (res && res.hasAudio && res.syphonSrc) {
      showToast(`🖥 Capture audio FFT active: "${res.syphonSrc.name}"`);
    } else if (res && res.syphonSrc) {
      showToast('⚠ The current screen capture has no audio track — click Capture Tab / Screen + Audio…');
    } else {
      showToast('🖥 Capture audio ready — click "Capture Tab / Screen + Audio…"');
    }
  }

  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  return true;
}

function disableAudioAnalyzer() {
  state.audio.enabled = false;
  if (liveMicStream) {
    liveMicStream.getTracks().forEach(t => t.stop());
    liveMicStream = null;
  }
  if (liveMicSourceNode) {
    try { liveMicSourceNode.disconnect(); } catch (_) {}
    liveMicSourceNode = null;
  }
  if (liveSyphonSourceNode) {
    try { liveSyphonSourceNode.disconnect(); } catch (_) {}
    liveSyphonSourceNode = null;
    liveSyphonBoundStream = null;
  }
  muteAllVideoFftTaps();
  state.audio.bands = { sub: 0, low: 0, mid: 0, high: 0, rms: 0, beat: 0 };
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
}

function syncVideoAudioElementState(vSrc, fromUserGesture = false) {
  if (!vSrc || !vSrc.video) return;
  if (state.isProjectorRole) {
    vSrc.video.muted = true;
    if (vSrc._mediaElemSpkGain && vSrc._mediaElemSpkGain.gain) {
      vSrc._mediaElemSpkGain.gain.value = 0.0;
    }
    return;
  }
  const vol = clamp(Number(vSrc.volume ?? 0.8), 0, 1);
  if (vSrc._mediaElemSpkGain && vSrc._mediaElemSpkGain.gain) {
    // Safari fallback MediaElementAudioSourceNode active: keep <video> unmuted at unity so
    // liveAnalyser continues receiving full signal even when speaker gain is muted (0.0)!
    vSrc.video.volume = 1.0;
    vSrc.video.muted = false;
    vSrc._mediaElemSpkGain.gain.value = vSrc.muted ? 0.0 : vol;
    if (vSrc._mediaElemCtx && vSrc._mediaElemCtx.state === 'suspended' && typeof vSrc._mediaElemCtx.resume === 'function') {
      try { vSrc._mediaElemCtx.resume().catch(() => {}); } catch (_) {}
    }
  } else {
    // Primary path: native <video> handles OS speaker output directly while _pcmAudio / captureStream() feeds FFT!
    vSrc.video.volume = vol;
    vSrc.video.muted = !!vSrc.muted;
  }
  if (vSrc.muted) {
    vSrc._needsGestureUnmute = false;
    return;
  }
  if (vSrc.playing !== false && (fromUserGesture || vSrc.video.paused || vSrc._needsGestureUnmute)) {
    vSrc._needsGestureUnmute = false;
    try {
      const p = vSrc.video.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          if (!fromUserGesture) {
            // Autoplay before user interaction: keep video & FFT running muted until first click
            vSrc.video.muted = true;
            vSrc._needsGestureUnmute = true;
            try { vSrc.video.play().catch(() => {}); } catch (_) {}
          }
        });
      }
    } catch (_) {}
  }
}

function stopActiveVideoFftPlayback() {
  if (!activeVideoFftPlayback) return;
  const cur = activeVideoFftPlayback;
  activeVideoFftPlayback = null;
  if (cur.gainNode && cur.gainNode.gain) {
    cur.gainNode.gain.value = 0.0;
  }
  if (cur.sourceNode && cur.mode !== 'mediaElement') {
    try { cur.sourceNode.onended = null; } catch (_) {}
    if (typeof cur.sourceNode.stop === 'function') {
      try { cur.sourceNode.stop(); } catch (_) {}
    }
    try { cur.sourceNode.disconnect(); } catch (_) {}
  }
  if (cur.gainNode) {
    try { cur.gainNode.disconnect(); } catch (_) {}
  }
}

function muteAllVideoFftTaps() {
  stopActiveVideoFftPlayback();
}

function getOrBuildVideoAudioBuffer(pcm) {
  if (!pcm || !Array.isArray(pcm.channels) || pcm.channels.length === 0 || !pcm.length) return null;
  if (!liveAudioCtx || typeof liveAudioCtx.createBuffer !== 'function') return null;
  const cached = videoFftBufferCache.get(pcm);
  if (cached && cached.ctx === liveAudioCtx) return cached.buffer;
  try {
    const numCh = pcm.channels.length;
    const buf = liveAudioCtx.createBuffer(numCh, pcm.length, pcm.sampleRate || 48000);
    for (let c = 0; c < numCh; c++) {
      buf.getChannelData(c).set(pcm.channels[c]);
    }
    videoFftBufferCache.set(pcm, { ctx: liveAudioCtx, buffer: buf });
    return buf;
  } catch (_) {
    return null;
  }
}

function resolveAudioTargetVideoSource() {
  const videos = state.sources.filter(s => s && s.kind === 'video' && s.video && !s.offline);
  if (videos.length === 0) return null;
  const prefId = state.audio ? state.audio.videoSourceId : null;
  if (prefId && prefId !== 'auto') {
    const explicit = videos.find(v => v.id === prefId);
    if (explicit) {
      const explicitLive = explicit.playing !== false && !explicit.video.paused && explicit.hasAudioTrack !== false;
      const otherAudible = videos.find(v => v !== explicit && !v.muted && v.playing !== false && !v.video.paused && v.hasAudioTrack !== false);
      if (explicitLive || !otherAudible) return explicit;
      return otherAudible;
    }
  }
  const active = getSourceById(state.activeSourceId);
  if (active && active.kind === 'video' && active.video && !active.offline && active.playing !== false && !active.video.paused && active.hasAudioTrack !== false) {
    return active;
  }
  const selSurf = typeof getSelectedSurface === 'function' ? getSelectedSurface() : null;
  if (selSurf && selSurf.sourceId) {
    const surfVid = videos.find(v => v.id === selSurf.sourceId && v.playing !== false && !v.video.paused && v.hasAudioTrack !== false);
    if (surfVid) return surfVid;
  }
  const audiblePlaying = videos.find(v => !v.muted && v.playing !== false && !v.video.paused && v.hasAudioTrack !== false);
  if (audiblePlaying) return audiblePlaying;
  const anyPlaying = videos.find(v => v.playing !== false && !v.video.paused);
  if (anyPlaying) return anyPlaying;
  if (active && active.kind === 'video' && active.video && !active.offline) return active;
  return videos.find(v => v.playing !== false) || videos[0];
}

function attachActiveVideoToAudioGraph() {
  if (!liveAudioCtx || !liveAnalyser || !state.audio || !state.audio.enabled || state.audio.sourceMode !== 'video') {
    stopActiveVideoFftPlayback();
    return null;
  }
  if (liveAudioCtx.state === 'suspended' && typeof liveAudioCtx.resume === 'function') {
    try { liveAudioCtx.resume().catch(() => {}); } catch (_) {}
  }
  const targetVid = resolveAudioTargetVideoSource();
  if (!targetVid || !targetVid.video) {
    stopActiveVideoFftPlayback();
    return null;
  }

  syncVideoAudioElementState(targetVid, false);
  if (targetVid.playing !== false && targetVid.video.paused && !targetVid.video.ended && !targetVid.isSeekingReverse) {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!targetVid._lastFftPlayRetryMs || (nowMs - targetVid._lastFftPlayRetryMs) > 900) {
      targetVid._lastFftPlayRetryMs = nowMs;
      try {
        const p = targetVid.video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
    }
  }

  if (targetVid.playing === false || targetVid.video.paused || targetVid.video.ended || targetVid.isSeekingReverse) {
    stopActiveVideoFftPlayback();
    return targetVid;
  }

  // Path 1: Pre-mute decoded PCM AudioBufferSourceNode (works 100% over offline file:// AND http(s)://,
  // even when <video> is muted or volume=0, across Chrome, Safari, Firefox, Edge, and Node VM tests!).
  // Connected ONLY to liveAnalyser / liveCaptureDestNode — NEVER liveAudioCtx.destination!
  const audioBuf = getOrBuildVideoAudioBuffer(targetVid._pcmAudio);
  if (audioBuf && audioBuf.duration > 0.02 && typeof liveAudioCtx.createBufferSource === 'function') {
    const dur = Math.max(0.02, audioBuf.duration);
    const rawTime = Number(targetVid.video.currentTime) || 0;
    const vidTime = clamp(((rawTime % dur) + dur) % dur, 0, Math.max(0, dur - 0.015));
    const rate = clamp(Number(targetVid.video.playbackRate || targetVid.rate || 1.0), 0.1, 4.0);
    const nowCtx = Number(liveAudioCtx.currentTime) || 0;
    const fullClipLoop = targetVid.loopMode === 'loop' && (targetVid.trimIn ?? 0) <= 0.005 && (targetVid.trimOut ?? 1) >= 0.995;

    if (
      activeVideoFftPlayback &&
      activeVideoFftPlayback.mode === 'pcm' &&
      activeVideoFftPlayback.vSrc === targetVid &&
      !activeVideoFftPlayback.ended
    ) {
      const elapsed = Math.max(0, nowCtx - activeVideoFftPlayback.startedCtxTime);
      const rawExpected = activeVideoFftPlayback.startedOffset + elapsed * activeVideoFftPlayback.rate;
      const expectedTime = activeVideoFftPlayback.loop ? (rawExpected % dur) : rawExpected;
      const absDiff = Math.abs(expectedTime - vidTime);
      const loopDiff = activeVideoFftPlayback.loop ? Math.min(absDiff, Math.max(0, dur - absDiff)) : absDiff;
      if (loopDiff <= 0.35 && Math.abs(activeVideoFftPlayback.rate - rate) <= 0.02) {
        return targetVid;
      }
    }

    stopActiveVideoFftPlayback();
    try {
      const sourceNode = liveAudioCtx.createBufferSource();
      const gainNode = liveAudioCtx.createGain();
      gainNode.gain.value = 1.0;
      sourceNode.buffer = audioBuf;
      sourceNode.loop = fullClipLoop;
      if (sourceNode.playbackRate) sourceNode.playbackRate.value = rate;
      sourceNode.connect(gainNode);
      gainNode.connect(liveAnalyser);
      if (liveCaptureDestNode) gainNode.connect(liveCaptureDestNode);
      const playState = {
        mode: 'pcm',
        vSrc: targetVid,
        sourceNode,
        gainNode,
        startedCtxTime: nowCtx,
        startedOffset: vidTime,
        rate,
        loop: fullClipLoop,
        ended: false
      };
      sourceNode.onended = () => { playState.ended = true; };
      sourceNode.start(0, vidTime);
      activeVideoFftPlayback = playState;
      return targetVid;
    } catch (_) {}
  }

  // Path 2: Live non-destructive captureStream() tap (works on file:// blob: URLs AND http(s)://,
  // zero RAM overhead for >250MB videos, .mov/ProRes containers, or while PCM is still decoding;
  // never hijacks or mutes OS speakers!)
  if (typeof liveAudioCtx.createMediaStreamSource === 'function') {
    if (
      activeVideoFftPlayback &&
      activeVideoFftPlayback.mode === 'stream' &&
      activeVideoFftPlayback.vSrc === targetVid &&
      !activeVideoFftPlayback.ended
    ) {
      return targetVid;
    }
    const capFn = targetVid.video.captureStream || targetVid.video.mozCaptureStream;
    if (typeof capFn === 'function') {
      try {
        let stream = targetVid._fftCaptureStream;
        let aTracks = stream && typeof stream.getAudioTracks === 'function'
          ? stream.getAudioTracks().filter(t => t.readyState !== 'ended')
          : [];
        if (!stream || (aTracks.length === 0 && (targetVid.video.readyState || 0) >= 2)) {
          stream = capFn.call(targetVid.video);
          if ((targetVid.video.readyState || 0) >= 2) {
            targetVid._fftCaptureStream = stream;
          }
          aTracks = stream && typeof stream.getAudioTracks === 'function'
            ? stream.getAudioTracks().filter(t => t.readyState !== 'ended')
            : [];
        }
        if (aTracks.length > 0) {
          targetVid.hasAudioTrack = true;
          aTracks.forEach(t => { t.enabled = true; });
          stopActiveVideoFftPlayback();
          const sourceNode = liveAudioCtx.createMediaStreamSource(stream);
          const gainNode = liveAudioCtx.createGain();
          gainNode.gain.value = 1.0;
          sourceNode.connect(gainNode);
          gainNode.connect(liveAnalyser);
          if (liveCaptureDestNode) gainNode.connect(liveCaptureDestNode);
          activeVideoFftPlayback = { mode: 'stream', vSrc: targetVid, stream, sourceNode, gainNode, ended: false };
          return targetVid;
        }
      } catch (_) {}
    }
  }

  // Path 3: Safari / >250MB .mov fallback via MediaElementAudioSourceNode on same-origin blob: URL
  // (Used ONLY when both _pcmAudio and captureStream() are unavailable, e.g. Safari on >250MB or .mov files)
  if (
    typeof liveAudioCtx.createMediaElementSource === 'function' &&
    (targetVid.video.readyState || 0) >= 2 &&
    targetVid.hasAudioTrack !== false
  ) {
    if (
      activeVideoFftPlayback &&
      activeVideoFftPlayback.mode === 'mediaElement' &&
      activeVideoFftPlayback.vSrc === targetVid &&
      !activeVideoFftPlayback.ended
    ) {
      return targetVid;
    }
    try {
      if (!targetVid._mediaElemSource) {
        const meSrc = liveAudioCtx.createMediaElementSource(targetVid.video);
        const spkGain = liveAudioCtx.createGain();
        spkGain.gain.value = (state.isProjectorRole || targetVid.muted) ? 0.0 : clamp(Number(targetVid.volume ?? 0.8), 0, 1);
        meSrc.connect(spkGain);
        if (liveAudioCtx.destination) spkGain.connect(liveAudioCtx.destination);
        targetVid._mediaElemSource = meSrc;
        targetVid._mediaElemSpkGain = spkGain;
        targetVid._mediaElemCtx = liveAudioCtx;
        syncVideoAudioElementState(targetVid, false);
      }
      if (targetVid._mediaElemSource && targetVid._mediaElemCtx === liveAudioCtx) {
        stopActiveVideoFftPlayback();
        const gainNode = liveAudioCtx.createGain();
        gainNode.gain.value = 1.0;
        targetVid._mediaElemSource.connect(gainNode);
        gainNode.connect(liveAnalyser);
        if (liveCaptureDestNode) gainNode.connect(liveCaptureDestNode);
        activeVideoFftPlayback = {
          mode: 'mediaElement',
          vSrc: targetVid,
          sourceNode: targetVid._mediaElemSource,
          gainNode,
          ended: false
        };
      }
    } catch (_) {}
  }

  return targetVid;
}

function resolveAudioTargetSyphonSource() {
  const syphons = state.sources.filter(s => s && s.kind === 'syphon' && s.stream && !s.streamEnded);
  if (syphons.length === 0) return null;
  const active = getSourceById(state.activeSourceId);
  if (active && active.kind === 'syphon' && active.stream && !active.streamEnded) {
    const aTracks = typeof active.stream.getAudioTracks === 'function'
      ? active.stream.getAudioTracks().filter(t => t.readyState !== 'ended')
      : [];
    if (aTracks.length > 0) return active;
  }
  const withAudio = syphons.find(s => {
    const aTracks = typeof s.stream.getAudioTracks === 'function'
      ? s.stream.getAudioTracks().filter(t => t.readyState !== 'ended')
      : [];
    return aTracks.length > 0;
  });
  return withAudio || (active && active.kind === 'syphon' && !active.streamEnded ? active : syphons[0]);
}

function attachActiveSyphonToAudioGraph() {
  if (!liveAudioCtx || !liveAnalyser) return { syphonSrc: null, hasAudio: false };
  const syphonSrc = resolveAudioTargetSyphonSource();
  if (!syphonSrc || !syphonSrc.stream) {
    if (liveSyphonSourceNode) {
      try { liveSyphonSourceNode.disconnect(); } catch (_) {}
      liveSyphonSourceNode = null;
      liveSyphonBoundStream = null;
    }
    return { syphonSrc: null, hasAudio: false };
  }
  const aTracks = typeof syphonSrc.stream.getAudioTracks === 'function'
    ? syphonSrc.stream.getAudioTracks().filter(t => t.readyState !== 'ended')
    : [];
  syphonSrc.hasAudioTrack = aTracks.length > 0;
  if (aTracks.length === 0) {
    if (liveSyphonSourceNode) {
      try { liveSyphonSourceNode.disconnect(); } catch (_) {}
      liveSyphonSourceNode = null;
      liveSyphonBoundStream = null;
    }
    return { syphonSrc, hasAudio: false };
  }
  aTracks.forEach(t => { t.enabled = true; });
  if (liveSyphonBoundStream !== syphonSrc.stream) {
    if (liveSyphonSourceNode) {
      try { liveSyphonSourceNode.disconnect(); } catch (_) {}
      liveSyphonSourceNode = null;
    }
    try {
      liveSyphonSourceNode = liveAudioCtx.createMediaStreamSource(syphonSrc.stream);
      liveSyphonSourceNode.connect(liveAnalyser);
      if (liveCaptureDestNode) liveSyphonSourceNode.connect(liveCaptureDestNode);
      liveSyphonBoundStream = syphonSrc.stream;
    } catch (_) {}
  }
  return { syphonSrc, hasAudio: true, trackLabel: aTracks[0]?.label || '' };
}

async function refreshAudioInputDevicesList() {
  if (typeof document === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') return;
  const selEl = document.getElementById('sel-audio-device');
  if (!selEl) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter(d => d.kind === 'audioinput');
    const curId = state.audio?.deviceId || '';
    let html = `<option value="" ${curId === '' ? 'selected' : ''}>Default System Audio Input</option>`;
    inputs.forEach((d, idx) => {
      const id = d.deviceId || '';
      if (!id || id === 'default') return;
      const lbl = d.label || `Audio Input ${idx + 1}`;
      html += `<option value="${escapeHtml(id)}" ${id === curId ? 'selected' : ''}>${escapeHtml(lbl)}</option>`;
    });
    selEl.innerHTML = html;
  } catch (_) {}
}

function getAudioSourceDiagnosticStatus() {
  const aud = state.audio;
  if (!aud || !aud.enabled) {
    return { tone: 'muted', text: 'Idle — Click ♫ Enable or choose an audio source above' };
  }
  if (aud.sourceMode === 'synth') {
    return {
      tone: 'ok',
      text: `🥁 Synth Pulse Live (${Math.round(aud.bpm || 120)} BPM) — zero-setup beat & 4-band envelope`
    };
  }
  if (aud.sourceMode === 'mic') {
    const track = liveMicStream && typeof liveMicStream.getAudioTracks === 'function'
      ? liveMicStream.getAudioTracks()[0]
      : null;
    if (track && track.readyState !== 'ended') {
      return {
        tone: 'ok',
        text: `🎙 Live Input: ${track.label || 'Microphone / Line-In'} (Tip: pick a virtual audio device to analyse desktop audio)`
      };
    }
    return { tone: 'warn', text: '⚠ Microphone not connected — allow browser mic permission' };
  }
  if (aud.sourceMode === 'video') {
    const vid = resolveAudioTargetVideoSource();
    if (!vid) {
      return {
        tone: 'warn',
        text: '⚠ No video clip loaded yet — click "+ Video…" above (shaders have no audio track)'
      };
    }
    if (vid.hasAudioTrack === false) {
      return {
        tone: 'warn',
        text: `⚠ "${vid.name}" has no audio track in the video file — import a clip with sound`
      };
    }
    if (vid.audioTrackSilent) {
      return {
        tone: 'warn',
        text: `⚠ "${vid.name}" audio track is silent (0 dB)`
      };
    }
    if (vid.playing === false || (vid.video && vid.video.paused)) {
      return {
        tone: 'warn',
        text: `⏸ "${vid.name}" is paused — click anywhere or press Play to start video & FFT`
      };
    }
    if (liveAudioCtx && liveAudioCtx.state === 'suspended') {
      return {
        tone: 'warn',
        text: `⚡ Click anywhere to unlock browser Audio Engine for "${vid.name}"`
      };
    }
    if (!vid.muted && vid._needsGestureUnmute) {
      return {
        tone: 'warn',
        text: `⚡ Click anywhere to unlock speaker sound for "${vid.name}"`
      };
    }
    const spk = vid.muted
      ? '🔇 Speakers Muted (click 🔇 Muted → 🔊 Sound ON to hear audio; FFT Active!)'
      : `🔊 Sound ON (${Math.round((vid.volume ?? 0.8) * 100)}%)`;
    return {
      tone: 'ok',
      text: `🎬 Analyzing "${vid.name}" • ${spk}`
    };
  }
  if (aud.sourceMode === 'syphon') {
    const syphonSrc = resolveAudioTargetSyphonSource();
    if (!syphonSrc) {
      return {
        tone: 'warn',
        text: '⚠ No screen capture active — click "🖥 Capture Tab / Screen + Audio…" and enable "Share audio"'
      };
    }
    const aTracks = typeof syphonSrc.stream?.getAudioTracks === 'function'
      ? syphonSrc.stream.getAudioTracks().filter(t => t.readyState !== 'ended')
      : [];
    if (aTracks.length === 0) {
      return {
        tone: 'warn',
        text: `⚠ "${syphonSrc.name}" is video-only. Click Capture above → share a Browser Tab or Entire Screen with "Share audio" checked (or route app audio into the Mic input with a virtual audio cable).`
      };
    }
    return {
      tone: 'ok',
      text: `🖥 Analyzing captured audio: "${syphonSrc.name}" (${aTracks[0]?.label || 'Stream Audio'})`
    };
  }
  return { tone: 'muted', text: 'Audio Engine Ready' };
}

let _lastAudioStatusCheckMs = 0;
function syncAudioSourceStatusBox(force = false) {
  if (typeof document === 'undefined') return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!force && now - _lastAudioStatusCheckMs < 280) return;
  _lastAudioStatusCheckMs = now;
  const box = document.getElementById('audio-source-status');
  if (!box) return;
  const info = getAudioSourceDiagnosticStatus();
  if (box.dataset.lastMsg !== info.text) {
    box.dataset.lastMsg = info.text;
    box.textContent = info.text;
    box.style.color = info.tone === 'ok'
      ? 'var(--emerald)'
      : (info.tone === 'warn' ? 'var(--warm)' : 'var(--text-muted)');
  }
}

function tapGlobalAudioBpm() {
  const now = performance.now();
  if (audioTapHistoryMs.length > 0 && now - audioTapHistoryMs[audioTapHistoryMs.length - 1] > 2600) {
    audioTapHistoryMs.length = 0;
  }
  audioTapHistoryMs.push(now);
  if (audioTapHistoryMs.length > 8) audioTapHistoryMs.shift();
  if (audioTapHistoryMs.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < audioTapHistoryMs.length; i++) {
    sum += (audioTapHistoryMs[i] - audioTapHistoryMs[i - 1]);
  }
  const avgMs = sum / (audioTapHistoryMs.length - 1);
  const bpm = clamp(Math.round(60000 / Math.max(200, avgMs)), 40, 240);
  state.audio.bpm = bpm;
  state.audio.autoBpm = false;
  state.audio.beatPhase = 0;
  return bpm;
}

function updateAudioAnalyzerFrame(dt) {
  const aud = state.audio;
  const bpm = clamp(Number(aud.bpm) || 120, 30, 260);
  const beatsPerSec = bpm / 60.0;
  const prevPhase = aud.beatPhase || 0;
  aud.beatPhase = (prevPhase + dt * beatsPerSec) % 1.0;
  const phaseWrapped = aud.beatPhase < prevPhase;

  if (!aud.enabled) return;

  if (aud.sourceMode !== 'synth' && !liveAnalyser) {
    ensureLiveAudioGraph();
  }

  const gain = clamp(Number(aud.gain ?? 1.35), 0.1, 5.0);
  const smooth = clamp(Number(aud.smoothing ?? 0.72), 0.0, 0.96);
  const lerpK = 1.0 - Math.pow(smooth, Math.max(0.25, dt * 60));

  if (aud.sourceMode === 'synth' || !liveAnalyser) {
    // Built-in zero-permission musical rhythm generator (kick on beat, hat on off-beat, mid pad)
    const p = aud.beatPhase;
    const kick = Math.pow(Math.max(0, 1.0 - p * 3.2), 2.4);
    const subWave = Math.pow(Math.max(0, 1.0 - p * 2.2), 1.8);
    const offPhase = (p + 0.5) % 1.0;
    const hat = Math.pow(Math.max(0, 1.0 - offPhase * 5.0), 2.2) * 0.85;
    const midPad = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin((aud.beatCount + p) * Math.PI * 0.5));

    const tSub = clamp(subWave * gain * 0.82, 0, 1);
    const tLow = clamp(kick * gain * 0.88, 0, 1);
    const tMid = clamp(midPad * gain * 0.65, 0, 1);
    const tHigh = clamp(hat * gain * 0.78, 0, 1);
    const tRms = clamp((tSub * 0.3 + tLow * 0.3 + tMid * 0.25 + tHigh * 0.15), 0, 1);

    aud.bands.sub += (tSub - aud.bands.sub) * lerpK;
    aud.bands.low += (tLow - aud.bands.low) * lerpK;
    aud.bands.mid += (tMid - aud.bands.mid) * lerpK;
    aud.bands.high += (tHigh - aud.bands.high) * lerpK;
    aud.bands.rms += (tRms - aud.bands.rms) * lerpK;
    if (phaseWrapped) {
      aud.beatCount = (aud.beatCount || 0) + 1;
      aud.bands.beat = 1.0;
      if (typeof emitWebMapperEvent === 'function') {
        emitWebMapperEvent('beat', { bpm: aud.bpm, beatCount: aud.beatCount, source: 'synth' });
      }
    } else {
      aud.bands.beat = Math.max(0, aud.bands.beat - dt * 4.2);
    }

    // Populate synthetic spectrum bars for #audio-fft-canvas
    if (fftBinsBuffer.length < 64) fftBinsBuffer = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      const normF = i / 63;
      let mag = 0;
      if (normF < 0.14) mag = aud.bands.sub * (1.0 - normF * 2.2);
      else if (normF < 0.32) mag = aud.bands.low * (1.0 - Math.abs(normF - 0.22) * 4.0);
      else if (normF < 0.68) mag = aud.bands.mid * (0.7 + 0.3 * Math.sin(i * 0.6 + p * 6.28));
      else mag = aud.bands.high * (0.65 + 0.35 * Math.cos(i * 0.9));
      fftBinsBuffer[i] = clamp(Math.round(mag * 255), 0, 255);
    }
    return;
  }

  // Live WebAudio AnalyserNode (Mic / Video / Screen Capture)
  if (aud.sourceMode === 'video') attachActiveVideoToAudioGraph();
  else if (aud.sourceMode === 'syphon') attachActiveSyphonToAudioGraph();

  liveAnalyser.smoothingTimeConstant = smooth;
  if (fftBinsBuffer.length !== liveAnalyser.frequencyBinCount) {
    fftBinsBuffer = new Uint8Array(liveAnalyser.frequencyBinCount);
  }
  liveAnalyser.getByteFrequencyData(fftBinsBuffer);

  const sampleRate = liveAudioCtx ? liveAudioCtx.sampleRate : 48000;
  const nyquist = sampleRate * 0.5;
  const binCount = fftBinsBuffer.length;
  const hzToBin = hz => clamp(Math.round((hz / nyquist) * binCount), 0, binCount - 1);

  const avgBins = (b0, b1) => {
    const start = Math.min(b0, b1);
    const end = Math.max(start + 1, b1);
    let sum = 0;
    for (let i = start; i < end && i < binCount; i++) sum += fftBinsBuffer[i];
    return (sum / ((end - start) * 255)) * gain;
  };

  const rawSub = clamp(avgBins(hzToBin(20), hzToBin(65)), 0, 1);
  const rawLow = clamp(avgBins(hzToBin(65), hzToBin(250)), 0, 1);
  const rawMid = clamp(avgBins(hzToBin(250), hzToBin(2200)), 0, 1);
  const rawHigh = clamp(avgBins(hzToBin(2200), hzToBin(14000)), 0, 1);
  const rawRms = clamp(rawSub * 0.28 + rawLow * 0.30 + rawMid * 0.26 + rawHigh * 0.16, 0, 1);

  aud.bands.sub = rawSub;
  aud.bands.low = rawLow;
  aud.bands.mid = rawMid;
  aud.bands.high = rawHigh;
  aud.bands.rms = rawRms;

  // Spectral-flux low-band onset beat detector
  beatHoldCooldownSec = Math.max(0, beatHoldCooldownSec - dt);
  const lowCombined = rawSub * 0.55 + rawLow * 0.45;
  const flux = lowCombined - prevLowEnergy;
  prevLowEnergy = prevLowEnergy * 0.85 + lowCombined * 0.15;

  if (flux > 0.14 && lowCombined > 0.22 && beatHoldCooldownSec <= 0) {
    aud.bands.beat = 1.0;
    aud.beatCount = (aud.beatCount || 0) + 1;
    if (typeof emitWebMapperEvent === 'function') {
      emitWebMapperEvent('beat', { bpm: aud.bpm, beatCount: aud.beatCount, source: aud.sourceMode });
    }
    beatHoldCooldownSec = 0.22; // Max ~272 BPM debounce
    const nowMs = performance.now();
    onsetTimestampsMs.push(nowMs);
    while (onsetTimestampsMs.length > 8) onsetTimestampsMs.shift();
    if (aud.autoBpm && onsetTimestampsMs.length >= 4) {
      let intervalSum = 0;
      let validCount = 0;
      for (let i = 1; i < onsetTimestampsMs.length; i++) {
        const diff = onsetTimestampsMs[i] - onsetTimestampsMs[i - 1];
        if (diff >= 240 && diff <= 1600) {
          intervalSum += diff;
          validCount++;
        }
      }
      if (validCount >= 2) {
        const estBpm = clamp(Math.round(60000 / (intervalSum / validCount)), 60, 200);
        aud.bpm = Math.round(aud.bpm * 0.75 + estBpm * 0.25);
      }
    }
  } else {
    aud.bands.beat = Math.max(0, aud.bands.beat - dt * 4.5);
  }
}

function renderAudioSpectrumCanvas() {
  if (typeof document === 'undefined' || state.inspTab !== 'mod') return;
  syncAudioSourceStatusBox(false);
  const cvs = document.getElementById('audio-fft-canvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  if (!ctx) return;

  const w = cvs.width || 256;
  const h = cvs.height || 58;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#060a12';
  ctx.fillRect(0, 0, w, h);

  if (!state.audio.enabled) {
    ctx.fillStyle = 'rgba(155, 174, 204, 0.55)';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Audio Engine Idle — Click Enable Audio', w * 0.5, h * 0.5);
    return;
  }

  // Draw 32 log-spaced spectrum bars (aggregating peak + mean across each bar's bin span so zero harmonics fall between bins!)
  const barCount = 32;
  const gap = 2;
  const barW = (w - gap * (barCount + 1)) / barCount;
  const binLen = Math.max(1, fftBinsBuffer.length);
  const maxBin = Math.min(binLen - 1, 220);
  const gainBoost = state.audio.sourceMode === 'synth'
    ? 1.0
    : clamp((state.audio.gain ?? 1.35) * 0.92, 0.25, 3.5);

  for (let i = 0; i < barCount; i++) {
    const t0 = i / barCount;
    const t1 = (i + 1) / barCount;
    const b0 = Math.min(maxBin, Math.floor(Math.pow(t0, 1.75) * maxBin));
    const b1 = Math.min(maxBin, Math.max(b0, Math.ceil(Math.pow(t1, 1.75) * maxBin)));
    let peak = 0;
    let sum = 0;
    let cnt = 0;
    for (let b = b0; b <= b1 && b < binLen; b++) {
      const val = fftBinsBuffer[b];
      if (val > peak) peak = val;
      sum += val;
      cnt++;
    }
    const agg = cnt > 0 ? (peak * 0.75 + (sum / cnt) * 0.25) : 0;
    const v = clamp((agg / 255) * gainBoost, 0.03, 1.0);
    const bh = v * (h - 14);
    const bx = gap + i * (barW + gap);
    const by = h - 11 - bh;

    ctx.fillStyle = i < 6 ? '#ff6b8b' : (i < 13 ? '#ffcb7d' : (i < 23 ? '#6fd3ff' : '#34e89e'));
    ctx.fillRect(bx, by, Math.max(2, barW), bh);
  }

  // Bottom band meters + Beat LED flash
  const bands = state.audio.bands;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `SUB ${Math.round(bands.sub * 100)}%  LOW ${Math.round(bands.low * 100)}%  MID ${Math.round(bands.mid * 100)}%  HI ${Math.round(bands.high * 100)}%`,
    5,
    h - 1
  );

  // Beat strobe indicator top-right
  const beatA = clamp(bands.beat || 0, 0, 1);
  ctx.fillStyle = `rgba(52, 232, 158, ${0.18 + 0.82 * beatA})`;
  ctx.beginPath();
  ctx.arc(w - 10, 10, 4.5 + beatA * 2.0, 0, Math.PI * 2);
  ctx.fill();
}

// ----------------------------------------------------------------------------
// 3. UNIVERSAL MODULATION MATRIX (LFO, AUDIO BAND ENVELOPE, 8-STEP SEQUENCER)
// ----------------------------------------------------------------------------

function hash1D(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function evalPerlin1D(t) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3.0 - 2.0 * f);
  const a = hash1D(i);
  const b = hash1D(i + 1);
  return a + (b - a) * u;
}

function createModulator(opts = {}) {
  const num = state.nextModNum++;
  const targetKey = opts.targetKey || 'master:opacity';
  const bounds = getParamTargetBounds(targetKey);
  const span = bounds.max - bounds.min;
  const defaultMin = opts.minVal !== undefined ? Number(opts.minVal) : Number((bounds.min + span * 0.15).toFixed(3));
  const defaultMax = opts.maxVal !== undefined ? Number(opts.maxVal) : Number((bounds.min + span * 0.90).toFixed(3));

  return {
    id: opts.id || `mod_${num}_${Math.random().toString(36).slice(2, 6)}`,
    name: opts.name || bounds.label,
    enabled: opts.enabled !== false,
    kind: opts.kind || 'lfo', // 'lfo' | 'audio' | 'seq'
    targetKey,
    minVal: clamp(defaultMin, bounds.min, bounds.max),
    maxVal: clamp(defaultMax, bounds.min, bounds.max),
    // LFO settings
    waveform: opts.waveform || 'sine', // 'sine' | 'triangle' | 'saw' | 'square' | 'perlin' | 'beat'
    rate: clamp(Number(opts.rate ?? 0.45), 0.02, 16.0),
    beatDiv: Number(opts.beatDiv ?? 1.0),
    phaseOffset: clamp(Number(opts.phaseOffset ?? 0.0), 0, 1),
    // Audio Envelope settings
    audioBand: opts.audioBand || 'sub', // 'sub' | 'low' | 'mid' | 'high' | 'rms' | 'beat'
    gain: clamp(Number(opts.gain ?? 1.35), 0.1, 4.0),
    attack: clamp(Number(opts.attack ?? 0.45), 0.02, 0.98),
    release: clamp(Number(opts.release ?? 0.16), 0.02, 0.98),
    threshold: clamp(Number(opts.threshold ?? 0.04), 0, 0.85),
    // 8-Step Beat Sequencer settings
    steps: Array.isArray(opts.steps) && opts.steps.length === 8
      ? opts.steps.map(v => clamp(Number(v) || 0, 0, 1))
      : [1.0, 0.25, 0.65, 0.15, 0.85, 0.35, 0.55, 0.10],
    stepDiv: Number(opts.stepDiv ?? 0.5),
    glide: clamp(Number(opts.glide ?? 0.28), 0, 0.95),
    // Runtime state
    _phase: Number(opts._phase || 0),
    _env: 0.0,
    _curNorm: 0.5,
    _activeStep: 0
  };
}

function addModulatorForTarget(targetKey, kind = 'lfo', extraOpts = {}) {
  if (!targetKey) return null;
  pushUndoCheckpoint('Add Modulator');
  if (kind === 'audio' && !state.audio.enabled) {
    // Auto-enable Audio Engine so audio envelope responds immediately
    enableAudioAnalyzer(state.audio.sourceMode || 'synth');
  }
  const mod = createModulator({ ...extraOpts, targetKey, kind });
  state.modulators.push(mod);
  syncModulatedSliderHighlights();
  if (typeof renderModulatorsListUI === 'function') renderModulatorsListUI();
  scheduleAutosave();
  return mod;
}

function removeModulator(modId) {
  const idx = state.modulators.findIndex(m => m.id === modId);
  if (idx < 0) return false;
  pushUndoCheckpoint('Remove Modulator');
  state.modulators.splice(idx, 1);
  syncModulatedSliderHighlights();
  if (typeof renderModulatorsListUI === 'function') renderModulatorsListUI();
  scheduleAutosave();
  return true;
}

function clearModulatorsForTarget(targetKey) {
  const before = state.modulators.length;
  state.modulators = state.modulators.filter(m => m.targetKey !== targetKey);
  if (state.modulators.length !== before) {
    syncModulatedSliderHighlights();
    if (typeof renderModulatorsListUI === 'function') renderModulatorsListUI();
    scheduleAutosave();
  }
}

function evaluateModulatorNorm(mod, dt) {
  if (mod.kind === 'lfo') {
    const bpm = clamp(Number(state.audio.bpm) || 120, 30, 260);
    if (mod.waveform === 'beat') {
      const div = Math.max(0.125, Number(mod.beatDiv) || 1.0);
      const totalBeats = (state.audio.beatCount || 0) + (state.audio.beatPhase || 0);
      const ph = ((totalBeats / div) + (mod.phaseOffset || 0)) % 1.0;
      mod._phase = ph;
      return 0.5 - 0.5 * Math.cos(ph * Math.PI * 2.0);
    }
    mod._phase = (mod._phase || 0) + dt * (mod.rate ?? 0.45);
    const p = (mod._phase + (mod.phaseOffset || 0)) % 1.0;
    const pWrap = p < 0 ? p + 1 : p;
    if (mod.waveform === 'sine') return 0.5 + 0.5 * Math.sin(pWrap * Math.PI * 2.0);
    if (mod.waveform === 'triangle') return 1.0 - Math.abs(pWrap * 2.0 - 1.0);
    if (mod.waveform === 'saw') return pWrap;
    if (mod.waveform === 'square') return pWrap < 0.5 ? 1.0 : 0.0;
    if (mod.waveform === 'perlin') return evalPerlin1D(mod._phase * 1.8 + (mod.phaseOffset || 0) * 10.0);
    return 0.5 + 0.5 * Math.sin((bpm / 60) * pWrap * Math.PI * 2);
  }

  if (mod.kind === 'audio') {
    const raw = Number(state.audio.bands?.[mod.audioBand || 'sub'] ?? 0);
    const gated = Math.max(0, raw - (mod.threshold ?? 0.04)) * (mod.gain ?? 1.35);
    const target = clamp(gated, 0, 1);
    const rate = target > (mod._env || 0)
      ? clamp(mod.attack ?? 0.45, 0.02, 0.99)
      : clamp(mod.release ?? 0.16, 0.01, 0.98);
    const k = 1.0 - Math.pow(1.0 - rate, Math.max(0.25, dt * 60));
    mod._env = (mod._env || 0) + (target - (mod._env || 0)) * k;
    return clamp(mod._env, 0, 1);
  }

  if (mod.kind === 'seq') {
    const steps = Array.isArray(mod.steps) && mod.steps.length === 8 ? mod.steps : [1, 0, 0.5, 0, 1, 0, 0.5, 0];
    const stepBeats = Math.max(0.125, Number(mod.stepDiv) || 0.5);
    const totalBeats = state.audio.enabled
      ? ((state.audio.beatCount || 0) + (state.audio.beatPhase || 0))
      : (((mod._phase = (mod._phase || 0) + dt * ((state.audio.bpm || 120) / 60))));
    const idx = Math.floor(Math.abs(totalBeats / stepBeats)) % steps.length;
    mod._activeStep = idx;
    const target = clamp(Number(steps[idx]) || 0, 0, 1);
    const glide = clamp(mod.glide ?? 0.25, 0, 0.96);
    if (glide <= 0.01) return target;
    const k = 1.0 - Math.pow(glide, Math.max(0.25, dt * 30));
    mod._env = (mod._env ?? target) + (target - (mod._env ?? target)) * k;
    return clamp(mod._env, 0, 1);
  }

  if (typeof evaluateCustomModulatorNorm === 'function') {
    const customVal = evaluateCustomModulatorNorm(mod, dt);
    if (customVal !== null) return customVal;
  }
  return 0.5;
}

let _lastModHaloSyncAcc = 0;
function updateModulatorsFrame(dt) {
  if (Array.isArray(state.dmxDevices)) {
    for (const dev of state.dmxDevices) {
      if (dev && Array.isArray(dev.channels)) {
        for (const ch of dev.channels) ch.modValue = null;
      }
    }
  }
  if (!Array.isArray(state.modulators) || state.modulators.length === 0) return;
  for (const mod of state.modulators) {
    if (!mod || mod.enabled === false || !mod.targetKey) continue;
    const norm = evaluateModulatorNorm(mod, dt);
    mod._curNorm = norm;
    const outVal = mod.minVal + (mod.maxVal - mod.minVal) * norm;
    applyParamTargetValue(mod.targetKey, outVal, false);
  }
  _lastModHaloSyncAcc += dt;
  if (_lastModHaloSyncAcc >= 0.05) {
    _lastModHaloSyncAcc = 0;
    syncModulatedSliderHighlights();
  }
}

function serializeModulators(list = state.modulators) {
  if (!Array.isArray(list)) return [];
  return list.map(m => ({
    id: m.id,
    name: m.name,
    enabled: m.enabled !== false,
    kind: m.kind,
    targetKey: m.targetKey,
    minVal: m.minVal,
    maxVal: m.maxVal,
    waveform: m.waveform,
    rate: m.rate,
    beatDiv: m.beatDiv,
    phaseOffset: m.phaseOffset,
    audioBand: m.audioBand,
    gain: m.gain,
    attack: m.attack,
    release: m.release,
    threshold: m.threshold,
    steps: Array.isArray(m.steps) ? [...m.steps] : [1, 0.2, 0.6, 0.1, 0.8, 0.3, 0.5, 0.1],
    stepDiv: m.stepDiv,
    glide: m.glide
  }));
}

function restoreModulators(arr) {
  state.modulators = Array.isArray(arr) ? arr.map(m => createModulator(m)) : [];
  syncModulatedSliderHighlights();
}

// ----------------------------------------------------------------------------
// 4. 1-CLICK WEBMIDI LEARN (Cmd/Ctrl+M) & MOTORIZED FADER FEEDBACK
// ----------------------------------------------------------------------------

let midiAccessObj = null;

async function enableWebMidi() {
  if (!navigator.requestMIDIAccess) {
    state.midi.lastMsgText = 'WebMIDI unsupported in this browser';
    showToast('WebMIDI API not available in this browser');
    if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    return false;
  }
  try {
    midiAccessObj = await navigator.requestMIDIAccess({ sysex: false });
    state.midi.enabled = true;
    bindMidiInputs();
    midiAccessObj.onstatechange = () => bindMidiInputs();
    const inCount = Array.from(midiAccessObj.inputs.values()).length;
    state.midi.lastMsgText = `Connected (${inCount} MIDI input${inCount === 1 ? '' : 's'})`;
    showToast(`🎹 WebMIDI Active (${inCount} controller${inCount === 1 ? '' : 's'} detected)`);
    if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    return true;
  } catch (_) {
    state.midi.lastMsgText = 'MIDI access denied';
    showToast('WebMIDI permission declined');
    if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    return false;
  }
}

function bindMidiInputs() {
  if (!midiAccessObj) return;
  for (const input of midiAccessObj.inputs.values()) {
    input.onmidimessage = (ev) => {
      handleMidiPacket(ev.data, input.name || 'MIDI In');
    };
  }
}

function toggleMidiLearnMode(forceVal) {
  const next = typeof forceVal === 'boolean' ? forceVal : !state.midi.learnArmed;
  state.midi.learnArmed = next;
  if (next && !state.midi.enabled) {
    enableWebMidi();
  }
  if (!next) {
    state.midi.pendingTarget = null;
  }
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('midi-learn-armed', next);
    const btnTop = document.getElementById('btn-midi-learn');
    if (btnTop) {
      btnTop.classList.toggle('active', next);
      btnTop.setAttribute('aria-pressed', String(next));
    }
  }
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  showToast(next
    ? '🎹 MIDI Learn ARMED — Click any Slider or Cue, then move a hardware fader/pad!'
    : '🎹 MIDI Learn Disarmed');
}

function armMidiLearnForTarget(targetDesc) {
  if (!targetDesc) return;
  if (!state.midi.enabled) enableWebMidi();
  state.midi.learnArmed = true;
  state.midi.pendingTarget = targetDesc;
  state.midi.lastMsgText = `Waiting for MIDI → ${targetDesc.label}…`;
  if (typeof document !== 'undefined') {
    document.body.classList.add('midi-learn-armed');
    const btnTop = document.getElementById('btn-midi-learn');
    if (btnTop) {
      btnTop.classList.add('active');
      btnTop.setAttribute('aria-pressed', 'true');
    }
  }
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  showToast(`🎹 Move a MIDI fader/knob/pad now to bind → ${targetDesc.label}`);
}

function handleMidiPacket(data, portName = 'MIDI') {
  if (!data || data.length < 2) return;
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  const d1 = data[1] & 0x7f;
  const d2 = data.length > 2 ? (data[2] & 0x7f) : 0;

  let msgType = null;
  let code = d1;
  let normVal = 0;

  if (status === 0xb0) {
    msgType = 'cc';
    normVal = d2 / 127.0;
  } else if (status === 0x90 && d2 > 0) {
    msgType = 'note';
    normVal = d2 / 127.0;
  } else if (status === 0xe0) {
    msgType = 'pitch';
    code = 0;
    normVal = ((d2 << 7) | d1) / 16383.0;
  } else {
    return;
  }

  state.midi.lastMsgText = `${portName} Ch${channel + 1} ${msgType.toUpperCase()}#${code} = ${Math.round(normVal * 127)}`;

  // 1. If MIDI Learn has a pending target, bind immediately!
  if (state.midi.learnArmed && state.midi.pendingTarget) {
    const t = state.midi.pendingTarget;
    // Remove duplicate binding on same channel/code/type + target
    state.midi.mappings = state.midi.mappings.filter(
      m => !(m.msgType === msgType && m.channel === channel && m.code === code && m.targetKey === t.targetKey)
    );
    const mapEntry = {
      id: `midi_${state.midi.nextMapNum++}`,
      msgType,
      channel,
      code,
      targetType: t.targetType || 'param',
      targetKey: t.targetKey,
      label: t.label || t.targetKey,
      minVal: t.min ?? 0,
      maxVal: t.max ?? 1
    };
    state.midi.mappings.push(mapEntry);
    state.midi.pendingTarget = null;
    syncModulatedSliderHighlights();
    if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    scheduleAutosave();
    showToast(`🎹 Bound Ch${channel + 1} ${msgType.toUpperCase()} ${code} → ${mapEntry.label}`);
  }

  // 2. Dispatch all matching MIDI mappings
  for (const m of state.midi.mappings) {
    if (m.msgType !== msgType || m.channel !== channel || m.code !== code) continue;
    if (m.targetType === 'cue') {
      if (normVal > 0.05) triggerCueById(m.targetKey);
    } else if (m.targetType === 'action') {
      if (normVal > 0.05) {
        if (m.targetKey === 'cue:go') stepCue(1);
        else if (m.targetKey === 'cue:prev') stepCue(-1);
        else if (m.targetKey === 'master:blackout') {
          if (typeof requestBlackout === 'function') {
            requestBlackout('toggle', { source: 'midi', forceRestore: m.msgType === 'cc' && normVal > 0.85 });
          } else {
            state.blackout = !state.blackout;
          }
          syncTopbarUI();
        }
      }
    } else {
      const out = m.minVal + (m.maxVal - m.minVal) * normVal;
      applyParamTargetValue(m.targetKey, out, true);
    }
  }
}

function sendMidiCcFeedback(channel, cc, norm01) {
  if (!midiAccessObj || !state.midi.enabled) return;
  const val7 = clamp(Math.round(norm01 * 127), 0, 127);
  const pkt = [0xb0 | (channel & 0x0f), cc & 0x7f, val7];
  for (const output of midiAccessObj.outputs.values()) {
    try { output.send(pkt); } catch (_) {}
  }
}

function removeMidiMapping(mapId) {
  const idx = state.midi.mappings.findIndex(m => m.id === mapId);
  if (idx < 0) return;
  state.midi.mappings.splice(idx, 1);
  syncModulatedSliderHighlights();
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  scheduleAutosave();
}

// ----------------------------------------------------------------------------
// 5. WIRELESS GAMEPAD API (PS5 / XBOX FOLLOWSPOT, CONSTELLATION & VERTEX NUDGE)
// ----------------------------------------------------------------------------

const prevGamepadButtons = [];

function applyDeadzone(raw, dz = 0.12) {
  const a = Math.abs(raw);
  if (a <= dz) return 0;
  return Math.sign(raw) * ((a - dz) / Math.max(0.01, 1.0 - dz));
}

function pollGamepadFrame(dt) {
  if (!state.gamepad.enabled || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
  let pads;
  try { pads = navigator.getGamepads(); } catch (_) { return; }
  if (!pads) return;

  const pad = Array.from(pads).find(p => p && p.connected);
  if (!pad) {
    if (state.gamepad.connectedName) {
      state.gamepad.connectedName = null;
      if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    }
    return;
  }

  if (state.gamepad.connectedName !== pad.id) {
    state.gamepad.connectedName = pad.id;
    showToast(`🎮 Gamepad Ready: ${pad.id.slice(0, 36)}`);
    if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  }

  const dz = clamp(state.gamepad.deadzone ?? 0.12, 0.04, 0.4);
  const lx = applyDeadzone(pad.axes[0] || 0, dz);
  const ly = applyDeadzone(pad.axes[1] || 0, dz);
  const rx = applyDeadzone(pad.axes[2] || 0, dz);
  const ry = applyDeadzone(pad.axes[3] || 0, dz);

  const isCrewSpot = state.gamepad.profile === 'crew_spot';
  const spotIdx = isCrewSpot
    ? clamp(Math.round(state.gamepad.spotIndex || 0), 0, Math.max(0, (state.spots?.length || 1) - 1))
    : 0;
  const targetSpot = (Array.isArray(state.spots) && state.spots[spotIdx]) ? state.spots[spotIdx] : state.followspot;
  const l1Held = !!(pad.buttons[4] && pad.buttons[4].pressed);
  state.gamepad.l1Held = l1Held;

  // Left Stick: Steer Target Spot (Blind Pre-Aim safe: NEVER auto-arm mode='veil'!)
  if (Math.abs(lx) > 0.001 || Math.abs(ly) > 0.001) {
    if (!(typeof steerSpotInWorld === 'function' && steerSpotInWorld(targetSpot, lx * dt * 0.72, -ly * dt * 0.72))) {
      targetSpot.targetX = clamp(targetSpot.targetX + lx * dt * 0.72, -0.15, 1.15);
      targetSpot.targetY = clamp(targetSpot.targetY - ly * dt * 0.72, -0.15, 1.15);
    }
    targetSpot._lastSeatTouchMs = Date.now();
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  }

  // L2 (button 6) / R2 (button 7) Analog Triggers: Iris Spot Radius (or Gain when L1 held in Crew mode)
  const l2 = pad.buttons[6] ? (pad.buttons[6].value || 0) : 0;
  const r2 = pad.buttons[7] ? (pad.buttons[7].value || 0) : 0;
  if (Math.abs(r2 - l2) > 0.08) {
    if (isCrewSpot && l1Held) {
      targetSpot.gain = clamp(targetSpot.gain + (r2 - l2) * dt * 1.15, 0, 3.5);
    } else {
      targetSpot.radius = clamp(targetSpot.radius + (r2 - l2) * dt * 0.35, 0.01, 0.85);
      if (spotIdx === 0) syncLiveDomSliderReadout('ctrl-spot-radius', targetSpot.radius, v => v.toFixed(2));
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  }

  // Right Stick: Room- & Seat-aware steering (HARD-DELETED vertex nudge in 3 · LIVE!)
  if (Math.abs(rx) > 0.001 || Math.abs(ry) > 0.001) {
    if (state.room === 'live') {
      if (isCrewSpot) {
        targetSpot.stretchX = clamp(targetSpot.stretchX + rx * dt * 0.85, 0.15, 3.5);
        targetSpot.stretchY = clamp(targetSpot.stretchY - ry * dt * 0.85, 0.15, 3.5);
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      } else if (state.mixDeckTab === 'constellation') {
        state.constellation.active = true;
        state.constellation.targetX = clamp(state.constellation.targetX + rx * dt * 0.65, 0, 1);
        state.constellation.targetY = clamp(state.constellation.targetY + ry * dt * 0.65, 0, 1);
      } else {
        // Solo Stage Default: Right Stick drives ◎ Orbital Mix primary/selected Orb!
        const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
        if (mixSrc && Array.isArray(mixSrc.orbs) && mixSrc.orbs.length > 0) {
          const orb = mixSrc.orbs.find(o => o.id === mixSrc.selectedOrbId) || mixSrc.orbs[0];
          orb.targetX = clamp((orb.targetX ?? orb.x ?? 0) + rx * dt * 1.05, -1.15, 1.15);
          orb.targetY = clamp((orb.targetY ?? orb.y ?? 0) + ry * dt * 1.05, -1.15, 1.15);
          mixSrc._liveSteeredMs = Date.now();
          state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        }
      }
    } else {
      const mode = state.gamepad.rightStickMode || 'auto';
      const useConstellation = mode === 'constellation' ||
        (mode === 'auto' && state.layoutMode === 'mix' && state.mixDeckTab === 'constellation');
      const useVertex = (mode === 'vertex' || (mode === 'auto' && state.selectedVertex && !state.showLock));

      if (useConstellation) {
        state.constellation.active = true;
        state.constellation.targetX = clamp(state.constellation.targetX + rx * dt * 0.65, 0, 1);
        state.constellation.targetY = clamp(state.constellation.targetY + ry * dt * 0.65, 0, 1);
      } else if (useVertex && state.selectedVertex) {
        const sv = state.selectedVertex;
        const speed = (l1Held ? 0.04 : 0.18) * dt;
        const dx = rx * speed;
        const dy = -ry * speed;
        const surf = state.surfaces.find(s => s.id === sv.ownerId);
        if (sv.kind === 'surf-corner' && surf && surf.points?.[sv.index]) {
          surf.points[sv.index][0] = clamp(surf.points[sv.index][0] + dx, -0.5, 1.5);
          surf.points[sv.index][1] = clamp(surf.points[sv.index][1] + dy, -0.5, 1.5);
          if (typeof bumpSurfaceGeom === 'function') bumpSurfaceGeom(surf);
          pingCalibCrosshair(surf.points[sv.index][0], surf.points[sv.index][1], 900);
          state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        }
      } else {
        targetSpot.stretchX = clamp(targetSpot.stretchX + rx * dt * 0.85, 0.15, 3.5);
        targetSpot.stretchY = clamp(targetSpot.stretchY - ry * dt * 0.85, 0.15, 3.5);
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      }
    }
  }

  // Edge-triggered Face & Bumper Buttons
  const justPressed = (idx) => {
    const cur = !!(pad.buttons[idx] && pad.buttons[idx].pressed);
    const was = !!prevGamepadButtons[idx];
    prevGamepadButtons[idx] = cur;
    return cur && !was;
  };

  const l1Edge = justPressed(4);
  const r1Edge = justPressed(5);
  const dpadLeftEdge = justPressed(14);

  if (state.room === 'live') {
    if (isCrewSpot) {
      // Crew Spot-Op: bumpers NEVER trigger cues; R1 cycles owned Spot!
      if (r1Edge && Array.isArray(state.spots) && state.spots.length > 1) {
        state.gamepad.spotIndex = ((state.gamepad.spotIndex || 0) + 1) % state.spots.length;
        state.activeSpotIndex = state.gamepad.spotIndex;
        if (typeof syncRoomUI === 'function') syncRoomUI();
      }
    } else {
      // Solo Stage (Decision 2A): Arm-and-Fire Hold L1 + Press R1 = 0ms GO!
      if (l1Held && r1Edge) stepCue(1);
      if (l1Held && dpadLeftEdge) stepCue(-1);
    }
  } else {
    if (l1Edge) stepCue(-1);
    if (r1Edge) stepCue(1);
  }

  if (justPressed(0)) {            // A / Cross: Toggle Spot Beam / Veil
    if (targetSpot.mode !== 'off') {
      targetSpot._lastLiveMode = targetSpot.mode;
      targetSpot.mode = 'off';
    } else {
      targetSpot.mode = targetSpot._lastLiveMode || 'beam';
    }
    syncFollowspotInspectorUI();
    if (typeof syncRoomUI === 'function') syncRoomUI();
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  }
  if (justPressed(1)) {            // B / Circle: Show-Safe Unified Blackout
    if (typeof requestBlackout === 'function') {
      requestBlackout('toggle', { source: 'gamepad' });
    } else {
      state.blackout = !state.blackout;
    }
    syncTopbarUI();
  }
  if (justPressed(3)) {            // Y / Triangle: Toggle Calibration Grids
    if (!state.showLock) {
      state.allCalGrids = !state.allCalGrids;
      syncTopbarUI();
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    }
  }
}

// ----------------------------------------------------------------------------
// 6. BI-DIRECTIONAL BINARY OSC 1.0 & JSON-OSC OVER WEBSOCKET CLIENT
// ----------------------------------------------------------------------------

let oscSocket = null;

function padOscString(str) {
  const enc = new TextEncoder().encode(String(str || ''));
  const padLen = (enc.length + 4) & ~3;
  const out = new Uint8Array(padLen);
  out.set(enc);
  return out;
}

function encodeOscMessage(address, args = []) {
  const addrBytes = padOscString(address.startsWith('/') ? address : `/${address}`);
  let tags = ',';
  const argChunks = [];

  for (const a of args) {
    const t = (a && typeof a === 'object' && a.type) ? a.type : (typeof a === 'string' ? 's' : 'f');
    const v = (a && typeof a === 'object' && 'value' in a) ? a.value : a;
    if (t === 'i') {
      tags += 'i';
      const buf = new ArrayBuffer(4);
      new DataView(buf).setInt32(0, Math.round(Number(v) || 0), false);
      argChunks.push(new Uint8Array(buf));
    } else if (t === 's') {
      tags += 's';
      argChunks.push(padOscString(String(v)));
    } else if (t === 'T' || v === true) {
      tags += 'T';
    } else if (t === 'F' || v === false) {
      tags += 'F';
    } else {
      tags += 'f';
      const buf = new ArrayBuffer(4);
      new DataView(buf).setFloat32(0, Number(v) || 0, false);
      argChunks.push(new Uint8Array(buf));
    }
  }

  const tagBytes = padOscString(tags);
  let total = addrBytes.length + tagBytes.length;
  for (const c of argChunks) total += c.length;

  const pkt = new Uint8Array(total);
  let off = 0;
  pkt.set(addrBytes, off); off += addrBytes.length;
  pkt.set(tagBytes, off); off += tagBytes.length;
  for (const c of argChunks) {
    pkt.set(c, off);
    off += c.length;
  }
  return pkt;
}

function readOscString(bytes, offset) {
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) end++;
  const str = new TextDecoder().decode(bytes.subarray(offset, end));
  const nextOffset = (end + 4) & ~3;
  return { str, nextOffset };
}

function decodeOscPacket(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 4) return [];
  const head = readOscString(bytes, 0);

  // Support OSC #bundle packets recursively
  if (head.str === '#bundle') {
    const out = [];
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let off = 16; // 8-byte '#bundle\0' + 8-byte timetag
    while (off + 4 <= bytes.length) {
      const elemSize = dv.getInt32(off, false);
      off += 4;
      if (elemSize <= 0 || off + elemSize > bytes.length) break;
      out.push(...decodeOscPacket(bytes.subarray(off, off + elemSize)));
      off += elemSize;
    }
    return out;
  }

  if (!head.str.startsWith('/')) return [];
  const address = head.str;
  let off = head.nextOffset;
  if (off >= bytes.length) return [{ address, args: [] }];

  const tagRead = readOscString(bytes, off);
  const tags = tagRead.str.startsWith(',') ? tagRead.str.slice(1) : '';
  off = tagRead.nextOffset;

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const args = [];
  for (let i = 0; i < tags.length; i++) {
    const ch = tags[i];
    if (ch === 'f') {
      if (off + 4 > bytes.length) break;
      args.push(dv.getFloat32(off, false));
      off += 4;
    } else if (ch === 'i') {
      if (off + 4 > bytes.length) break;
      args.push(dv.getInt32(off, false));
      off += 4;
    } else if (ch === 's') {
      const sr = readOscString(bytes, off);
      args.push(sr.str);
      off = sr.nextOffset;
    } else if (ch === 'T') {
      args.push(1);
    } else if (ch === 'F') {
      args.push(0);
    }
  }
  return [{ address, args }];
}

function dispatchOscCommand(address, args = []) {
  if (!address) return;
  address = normalizeOscAddress(address);
  state.osc.rxCount = (state.osc.rxCount || 0) + 1;
  state.osc.lastRx = `${address} [${args.map(a => typeof a === 'number' ? Number(a).toFixed(2) : a).join(', ')}]`;

  const f0 = Number(args[0] ?? 0);
  const f1 = Number(args[1] ?? 0);

  if (address === '/webmapper/master/opacity') {
    applyParamTargetValue('master:opacity', f0, false);
    return;
  }
  if (address === '/webmapper/blackout') {
    const nextOn = args.length === 0 ? 'toggle' : Boolean(f0 > 0.5);
    if (typeof requestBlackout === 'function') {
      requestBlackout(nextOn, { source: 'osc', forceRestore: args.length > 0 && f0 <= 0.5 });
    } else {
      state.blackout = nextOn === 'toggle' ? !state.blackout : nextOn;
    }
    syncTopbarUI();
    return;
  }
  if (address === '/webmapper/cue/go') { stepCue(1); return; }
  if (address === '/webmapper/cue/prev') { stepCue(-1); return; }
  const cueMatch = address.match(/^\/webmapper\/cue\/(\d+)$/);
  if (cueMatch) {
    const idx = Math.max(0, parseInt(cueMatch[1], 10) - 1);
    if (state.cues[idx]) triggerCueById(state.cues[idx].id);
    return;
  }
  if (address === '/webmapper/spot/xy') {
    // Blind Pre-Aim (Bug #2 Fix): NEVER auto-arm mode='veil' on incoming OSC XY!
    if (state.followspot) state.followspot._lastSeatTouchMs = Date.now();
    applyParamTargetValue('followspot:spotX', f0, false);
    applyParamTargetValue('followspot:spotY', f1, false);
    return;
  }
  if (address === '/webmapper/spot/radius') {
    applyParamTargetValue('followspot:radius', f0, false);
    return;
  }
  if (address === '/webmapper/spot/gain') {
    applyParamTargetValue('followspot:gain', f0, false);
    return;
  }
  if (address === '/webmapper/constellation/xy') {
    state.constellation.active = true;
    state.constellation.targetX = clamp(f0, 0, 1);
    state.constellation.targetY = clamp(f1, 0, 1);
    return;
  }
  const orbMatch = address.match(/^\/webmapper\/mixbus\/orb\/(\d+)\/xy$/);
  if (orbMatch) {
    const orbIdx = Math.max(0, parseInt(orbMatch[1], 10) - 1);
    applyParamTargetValue(`mixbus:orb:${orbIdx}:x`, f0, false);
    applyParamTargetValue(`mixbus:orb:${orbIdx}:y`, f1, false);
    return;
  }
  const surfMatch = address.match(/^\/webmapper\/surface\/(\d+)\/([a-zA-Z0-9_]+)$/);
  if (surfMatch) {
    const sIdx = Math.max(0, parseInt(surfMatch[1], 10) - 1);
    const surf = state.surfaces[sIdx];
    if (surf) applyParamTargetValue(`surface:${surf.id}:${surfMatch[2]}`, f0, false);
    return;
  }
  if (address.startsWith('/webmapper/param/')) {
    const key = address.slice('/webmapper/param/'.length);
    const bounds = getParamTargetBounds(key);
    const scaled = bounds.min + (bounds.max - bounds.min) * clamp(f0, 0, 1);
    applyParamTargetValue(key, scaled, false);
  }
}

function connectOscWebSocket(urlOverride = null) {
  if (urlOverride) state.osc.wsUrl = String(urlOverride).trim();
  disconnectOscWebSocket(false);
  if (typeof WebSocket === 'undefined') {
    state.osc.status = 'unsupported';
    return;
  }
  try {
    state.osc.enabled = true;
    state.osc.status = 'connecting';
    oscSocket = new WebSocket(state.osc.wsUrl);
    oscSocket.binaryType = 'arraybuffer';

    oscSocket.onopen = () => {
      state.osc.status = 'connected';
      showToast(`🌐 OSC Bridge Connected (${state.osc.wsUrl})`);
      sendOscMessage(APP_OSC_PREFIX + '/hello', [{ type: 's', value: APP_NAME + ' ' + APP_VERSION + ' ready' }]);
      if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    };
    oscSocket.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        const msgs = decodeOscPacket(ev.data);
        for (const m of msgs) dispatchOscCommand(m.address, m.args);
      } else if (typeof ev.data === 'string') {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed && parsed.type && typeof handleBridgeAuxiliaryMessage === 'function') {
            if (handleBridgeAuxiliaryMessage(parsed)) return;
          }
          if (parsed && parsed.address) {
            dispatchOscCommand(parsed.address, Array.isArray(parsed.args) ? parsed.args : []);
          }
        } catch (_) {}
      }
      if (state.inspTab === 'mod' && typeof syncOscReadoutOnly === 'function') syncOscReadoutOnly();
    };
    oscSocket.onerror = () => {
      state.osc.status = 'error';
      if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    };
    oscSocket.onclose = () => {
      if (state.osc.enabled) state.osc.status = 'disconnected';
      oscSocket = null;
      if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    };
  } catch (_) {
    state.osc.status = 'error';
  }
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
}

function disconnectOscWebSocket(disableFlag = true) {
  if (disableFlag) state.osc.enabled = false;
  if (oscSocket) {
    try { oscSocket.close(); } catch (_) {}
    oscSocket = null;
  }
  state.osc.status = 'disconnected';
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
}

function sendOscMessage(address, args = []) {
  if (!oscSocket || oscSocket.readyState !== 1) return false;
  try {
    const pkt = encodeOscMessage(address, args);
    oscSocket.send(pkt);
    state.osc.txCount = (state.osc.txCount || 0) + 1;
    return true;
  } catch (_) {
    return false;
  }
}
