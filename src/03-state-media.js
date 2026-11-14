// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 03-state-media.js — Studio State, Media Bin, Relinking, Surfaces & Masks
// ============================================================================

const urlParams = new URLSearchParams(window.location.search);
const IS_MONITOR_ROLE = urlParams.get('role') === 'monitor';
const IS_PROJECTOR_ROLE = urlParams.get('role') === 'projector' || IS_MONITOR_ROLE;
const MAX_PROJECTOR_SCREENS = 32;
const PROJECTOR_SCREEN_INDEX = Math.max(1, Math.min(MAX_PROJECTOR_SCREENS, parseInt(urlParams.get('screen') || '1', 10) || 1));
const initialProjectorMode = IS_PROJECTOR_ROLE || urlParams.get('projector') === '1';

const SURFACE_ACCENTS = ['#6fd3ff', '#ffcb7d', '#34e89e', '#b58cff', '#ff6b8b', '#5ce1e6'];

function createSpotObject(idx = 0, overrides = {}) {
  const num = Number.isFinite(Number(overrides.consoleNum)) ? Number(overrides.consoleNum) : (idx + 1);
  return {
    id: overrides.id || `spot_${num}`,
    consoleNum: num,
    name: overrides.name || `Spot ${num}`,
    enabled: overrides.enabled !== false,
    mode: overrides.mode ?? 'off', // 'off' | 'beam' | 'veil' | 'additive' | 'screen' | 'reveal' | 'occlude'
    contentSrc: overrides.contentSrc ?? '__nebula__', // '__nebula__' | '__pure_light__' | 'bus:orbital' | <sourceId>
    mediaFit: overrides.mediaFit || 'beam', // 'beam' | 'world'
    fbmAmt: overrides.fbmAmt ?? (overrides.contentSrc === '__pure_light__' ? 0.0 : 1.0),
    goboSrc: overrides.goboSrc ?? '',
    goboRotSpeed: overrides.goboRotSpeed ?? 0.0,
    goboAngle: overrides.goboAngle ?? 0.0,
    shutterL: overrides.shutterL ?? 0.0,
    shutterR: overrides.shutterR ?? 0.0,
    shutterT: overrides.shutterT ?? 0.0,
    shutterB: overrides.shutterB ?? 0.0,
    shutterAngL: overrides.shutterAngL ?? 0.0,
    shutterAngR: overrides.shutterAngR ?? 0.0,
    shutterAngT: overrides.shutterAngT ?? 0.0,
    shutterAngB: overrides.shutterAngB ?? 0.0,
    worldSpace: !!overrides.worldSpace,
    worldTargetM: Array.isArray(overrides.worldTargetM) ? [...overrides.worldTargetM] : [0.0, 1.40, 0.0],
    worldRadiusM: overrides.worldRadiusM ?? 0.85,
    spotX: overrides.spotX ?? 0.50,
    spotY: overrides.spotY ?? 0.52,
    targetX: overrides.targetX ?? (overrides.spotX ?? 0.50),
    targetY: overrides.targetY ?? (overrides.spotY ?? 0.52),
    velX: 0.0,
    velY: 0.0,
    radius: overrides.radius ?? 0.24,
    softness: overrides.softness ?? 0.09,
    gain: overrides.gain ?? 1.65,
    ambient: overrides.ambient ?? 0.14,
    stretchX: overrides.stretchX ?? 1.0,
    stretchY: overrides.stretchY ?? 1.0,
    rotation: overrides.rotation ?? 0,
    morph: overrides.morph ?? 0.0,
    inertia: overrides.inertia ?? 0.78,
    shadowDepth: overrides.shadowDepth ?? 0.52,
    shadowTex: overrides.shadowTex ?? 1.15,
    shadowRnd: overrides.shadowRnd ?? 0.65,
    shadowSpeed: overrides.shadowSpeed ?? 0.65,
    shadowTime: overrides.shadowTime ?? 0.0,
    colA: overrides.colA || '#ff3b6b',
    colB: overrides.colB || '#ff9e44',
    colC: overrides.colC || '#fff4d6',
    temp: overrides.temp ?? 0.0,
    converge3D: !!overrides.converge3D,
    // Projector routing ([] = every projector) and the figure a 3D spot follows (05h).
    projectors: Array.isArray(overrides.projectors) ? overrides.projectors.map(Number).filter(n => n > 0) : [],
    followPropId: overrides.followPropId || null,
    // 3D stage-floor aim (metres) + aim height above the deck/floor; glides toward target*.
    stageXM: Number.isFinite(Number(overrides.stageXM)) && overrides.stageXM !== null ? Number(overrides.stageXM) : null,
    stageZM: Number.isFinite(Number(overrides.stageZM)) && overrides.stageZM !== null ? Number(overrides.stageZM) : null,
    targetStageXM: Number.isFinite(Number(overrides.targetStageXM ?? overrides.stageXM)) && (overrides.targetStageXM ?? overrides.stageXM) !== null ? Number(overrides.targetStageXM ?? overrides.stageXM) : null,
    targetStageZM: Number.isFinite(Number(overrides.targetStageZM ?? overrides.stageZM)) && (overrides.targetStageZM ?? overrides.stageZM) !== null ? Number(overrides.targetStageZM ?? overrides.stageZM) : null,
    aimHeightM: clamp(Number(overrides.aimHeightM ?? 1.3), 0, 4),
    fadeSec: clamp(Number(overrides.fadeSec ?? 0.5), 0, 10),
    marks: Array.isArray(overrides.marks) ? overrides.marks.slice(0, 4).map(m => (m && Number.isFinite(m.x) ? { x: m.x, z: m.z, h: m.h } : null)) : [null, null, null, null],
    performerDepthM: overrides.performerDepthM ?? 1.20,
    performerHeightM: overrides.performerHeightM ?? 1.75,
    performerRadiusM: overrides.performerRadiusM ?? 0.45,
    maskBgSpill: !!overrides.maskBgSpill
  };
}

const _initialSpot1 = createSpotObject(0);
const _initialSpot2 = createSpotObject(1, {
  mode: 'off',
  name: 'Spot 2',
  contentSrc: '__pure_light__',
  fbmAmt: 0.0,
  colA: '#6fd3ff',
  colB: '#34e89e',
  colC: '#eafff8',
  spotX: 0.68,
  targetX: 0.68,
  spotY: 0.50,
  targetY: 0.50,
  radius: 0.20,
  softness: 0.06
});

const _detachedFallbackSpot = createSpotObject(98, {
  id: '_detached',
  consoleNum: 0,
  name: 'No Spot',
  enabled: false,
  mode: 'off'
});

const state = {
  isProjectorRole: IS_PROJECTOR_ROLE,
  isMonitorRole: IS_MONITOR_ROLE,
  projectorScreenIndex: PROJECTOR_SCREEN_INDEX,
  projectorMode: initialProjectorMode,
  room: 'map',               // 'build' | 'map' | 'live' (Decision 1A: boot into 2 · MAP)
  buildViewMode: 'split',    // 'split' | 'plan2d' | 'world3d' | 'warp'
  liveMixSolo: false,        // Expand ◎ Orbital Mix to full center width in 3 · LIVE
  outputFeedTab: 'stage',    // 'stage' | 'p1'..'p32' | 'previz3d'
  shapesLocked: true,        // 0.2 Shapes lock: false = corners drag in MAP (05m)
  liveReachThrough: false,   // Hold W surgical geometry/shutter reach-through in 2 · MAP / 3 · LIVE
  capturedTrims: {},         // Non-blocking Live Trim Tray overrides in 3 · LIVE
  hoverGhostPreset: null,    // Hover-preview ghost rig/stage preset in 1 · BUILD
  showLock: false, // Shift+P: when true, suppresses calibration grids/crosshairs on output & locks Stage edits
  ecoMode: false,
  steerSpotMode: false,
  trackpadSpotTarget: null,  // null ('None') | spot.id — No-Controller Trackpad Spot Cycler
  pointerLocked: false,
  activeSelection: { kind: 'surface', id: null, label: '' }, // Contextual Backspace/Delete router

  worldScreens: null,        // Editable/deletable physical projection screens in 1 · BUILD ([] valid when deleted)
  nextWorldScreenNum: 2,
  selectedWorldScreenId: 'wscr_1',
  floorplan: {
    enabled: false,
    dataUrl: '',
    name: '',
    widthM: 10.0,
    offsetX: 0.0,
    offsetZ: 0.0,
    rotDeg: 0.0,
    opacity: 0.55,
    locked: false,
    calibMode: false,
    calibPtA: null,
    _img: null
  },

  layoutMode: 'split',   // 'split' | 'input' | 'output' | 'mix' | 'rig'
  leftTab: 'surfaces',   // 'surfaces' | 'masks'
  inspTab: 'surface',    // 'surface' | 'mask' | 'spot' | 'output' | 'mod'
  stageEditMode: 'geometry', // 'geometry' | 'mask' (decoupled from inspector browsing — P3)
  cueRecordScope: 'show',    // 'show' (Venue calibration safe) | 'show_venue' (includes geometry — P2)
  fohDim: 1.0,               // FOH booth UI brightness 0.25..1.0 (never dims WebGL output — P1)
  fohNightMode: false,       // FOH warm amber/red night booth mode (P1)
  hoveredCalibPinIdx: -1,    // Cross-pane 3D<->Stage PnP pin highlight (P8)
  shutterHandlesVisible: false, // On-canvas 4-blade framing shutter handles (P7)
  rigSelectedKind: 'projector', // 'projector' | 'fixture' | 'performer' (P6)
  manualTouchedKeys: {},     // Tracks manual overrides since last cue recall/store (P4)
  inlineModOpenKeys: {},     // Tracks expanded inline modulator drawers per paramKey (P4)
  pieMenu: { open: false, kind: '', cx: 0, cy: 0, stageU: 0.5, stageV: 0.5, hoverIdx: -1 },

  snapVertices: true,
  weldVertices: false,
  enableLoupe: true,
  snapGrid: false,
  gridDivsX: 16,
  gridDivsY: 9,
  allCalGrids: false,
  showWireframes: true,

  // Milestone 1: Canonical Stage Resolution & Optical Pipeline
  stageResPreset: '1920x1080',
  stageWidth: 1920,
  stageHeight: 1080,
  stageAspect: 16 / 9,
  hdrPipeline: true,

  masterOpacity: 1.0,
  blackout: false,
  blackoutFade: 1.0,

  // Milestone 1: Master Output 4-Corner Keystone & Lens Trim (downstream of all Cues)
  masterKeystone: {
    enabled: false,
    editOnStage: false,
    points: [[0, 0], [1, 0], [1, 1], [0, 1]], // BL, BR, TR, TL
    lensK1: 0.0
  },

  // Live Hardware Alignment Crosshair projected onto physical wall during Setup (!showLock)
  calibCrosshair: {
    active: false,
    x: 0.5,
    y: 0.5,
    expireMs: 0
  },

  inputView: { zoom: 1.0, panX: 0, panY: 0 },
  stageView: { zoom: 1.0, panX: 0, panY: 0 },

  sources: [],
  activeSourceId: null,
  nextSourceNum: 1,
  relinkSingleSourceId: null,

  surfaces: [], // Index 0 = top-most Z layer (rendered last), last index = bottom-most
  selectedSurfaceId: null,
  selectedSurfaceIds: [],
  drawingSurfaceId: null,
  surfHoverPt: null,
  nextSurfaceNum: 1,

  // Milestone 2: Projector-POV Background Reference Image (from Space Scanner or Reference Photo)
  stageBg: {
    enabled: false,
    opacity: 0.52,
    dataUrl: null,
    img: null,
    width: 0,
    height: 0
  },
  scannerPattern: null, // { active: true, kind: 'white'|'black'|'grayX'|'grayY', bit, invert }

  // Milestone 1: Collapsible Surface Groups / Folders
  groups: [],
  nextGroupNum: 1,

  // Persistent Vertex Selection for 0.2px / 1px / 10px Arrow-Key Micro-Nudging
  selectedVertex: null, // { kind: 'surf-corner'|'mesh-node'|'mask-pt'|'keystone-corner', ownerId, index }
  marqueeRect: null,    // { x0, y0, x1, y1 } in stageOverlay CSS px
  loupeState: null,     // { active: true, stageX, stageY, pxX, pxY, label }

  // Phase 3.1: Freeform Polygon Masks
  masks: [],
  selectedMaskId: null,
  drawingMaskId: null,
  maskHoverPt: null,
  nextMaskNum: 1,

  // Phase 3.3 & Pillar 4: Universal Multi-Spot Optical Bench (spots can be disabled or deleted down to 0)
  spots: [_initialSpot1, _initialSpot2],
  _spotsInitialized: true,
  _detachedFallbackSpot,
  activeSpotIndex: 0,
  nextSpotNum: 3,
  followspot: _initialSpot1,

  // Phase 4.2 & v2.1: Sequenced Cues, Out-of-Sequence Priority Cues, Live Playback & Dual-FBO Crossfade
  cues: [],
  activeCueId: null,
  selectedCueId: null,
  activeOverrideCueIds: [],
  cuePlayback: {
    paused: false,
    rate: 1.0,
    tbarHeld: false,
    tbarMix: 0.0
  },
  nextCueNum: 1,
  crossfade: {
    active: false,
    elapsed: 0,
    duration: 2.0,
    mix: 1.0,
    fromScene: null,
    // GO-during-fade: outgoing side becomes a baked still of the visible mix (see beginCueCrossfadeFromVisible)
    freezeRequest: false,
    frozenFrom: false,
    freezeMix: 0,
    freezeSeq: 0,
    chainToScene: null, // chained dissolve: interrupted fade target, blended live with fromScene at chainMix
    chainMix: 0
  },

  // Modifier keys held for Followspot trackpad gestures
  modKeys: {
    r: false,
    m: false,
    s: false
  },

  activeSnapLines: [],
  hoverMeshBrush: null,
  _sceneSyncRev: 1,
  _pluginSyncRev: 1,

  // Milestone 3: Live ISF / GLSL Shader Studio, GPU Post-FX Rack & .wmplugin.json Registry
  shaderDrawerOpen: false,
  shaderEditorSourceId: null,
  shaderAutoCompile: true,
  masterFxChain: [],
  customFxPlugins: [],
  nextFxNum: 1,

  // Milestone 1: 50-Step Coalesced Undo / Redo Stack
  undoStack: [],
  redoStack: [],
  pendingUndoGesture: null,
  lastCoalesceKey: null,
  lastCoalesceMs: 0,

  // Milestone 5: Spatial Mixing Radar, 2D Cue Constellation, Audio FFT,
  // Universal Modulators, WebMIDI Learn, Gamepad, OSC Bridge, Timeline & Stage Recorder
  mixDeckTab: 'radar', // 'radar' | 'constellation'
  constellation: {
    active: false,
    puckX: 0.5,
    puckY: 0.5,
    targetX: 0.5,
    targetY: 0.5,
    velX: 0.0,
    velY: 0.0,
    falloffExp: 2.2,
    switchMedia: true,
    inertia: 0.72
  },
  audio: {
    enabled: false,
    sourceMode: 'synth', // 'synth' | 'mic' | 'video' | 'syphon'
    deviceId: '',
    videoSourceId: null,
    gain: 1.35,
    smoothing: 0.72,
    bpm: 120,
    autoBpm: true,
    beatPhase: 0.0,
    beatCount: 0,
    bands: { sub: 0, low: 0, mid: 0, high: 0, rms: 0, beat: 0 }
  },
  modulators: [],
  nextModNum: 1,
  midi: {
    enabled: false,
    learnArmed: false,
    pendingTarget: null,
    mappings: [],
    nextMapNum: 1,
    lastMsgText: 'MIDI Idle — press ⌘M or Enable MIDI'
  },
  gamepad: {
    enabled: true,
    connectedName: null,
    deadzone: 0.12,
    profile: 'solo_stage', // 'solo_stage' | 'crew_spot' (Decision 2A: Solo Stage default)
    spotIndex: 0,
    l1Held: false,
    r1Prev: false,
    rightStickMode: 'auto' // 'auto' | 'constellation' | 'vertex' | 'spot-shape'
  },
  dmxDevices: [],
  nextDmxDeviceNum: 1,
  pjlinkStatus: {},
  bridgeInfo: {
    lan: false,
    padUrl: '',
    connectedPads: 0,
    token: ''
  },
  dboState: {
    preOpened: false,
    preOpenTimerId: null
  },
  osc: {
    enabled: false,
    wsUrl: 'ws://127.0.0.1:8080',
    status: 'disconnected',
    sendFeedback: true,
    lastRx: 'Idle (run node scripts/osc-artnet-bridge.js for UDP)',
    rxCount: 0,
    txCount: 0
  },
  cueAutoFollow: {
    active: false,
    cueId: null,
    remainingSec: 0,
    totalSec: 0
  },
  timeline: {
    open: false,
    playing: false,
    loop: true,
    duration: 30.0,
    playhead: 0.0,
    zoom: 1.0,
    audioSourceId: '',
    cueMarkers: [],
    tracks: [],
    selectedTrackId: null,
    selectedKfId: null,
    nextTrackNum: 1
  },
  recorder: {
    active: false,
    elapsedSec: 0,
    mimeType: '',
    includeAudio: true
  },

  // Milestone 6: Multi-Projector Optical Edge Blending & GPU Frame-Delay Routing
  multiProjector: {
    enabled: false,
    layoutPreset: '2x1', // '1x1' | '2x1' | '3x1' | '1x2' | '2x2' | 'custom'
    overlapPct: 0.15,
    blendGamma: 2.2,
    blackOffset: 0.0,
    showStageGuides: true,
    alignmentGridOnOutput: false,
    selectedScreenIndex: 1,
    previewScreenIndex: 0,
    projNativeW: 1920,
    projNativeH: 1080,
    screens: []
  },

  // Milestone 6: Real-Time LED Pixel Mapper, Direct Browser WebSerial USB-DMX & Art-Net
  pixelMapper: {
    enabled: false,
    editOnStage: false,
    showFixtures: true,
    masterDimmer: 1.0,
    ledGamma: 2.2,
    fpsLimit: 44,
    selectedFixtureId: null,
    nextFixtureNum: 1,
    fixtures: [],
    usbProtocol: 'enttec-pro',
    usbUniverse: 0,
    usbConnected: false,
    usbStatus: 'USB-DMX Idle (Chrome/Edge WebSerial)',
    usbTxFrames: 0,
    artNetEnabled: false,
    artNetNet: 0,
    artNetSubNet: 0,
    artNetTxPackets: 0,
    monitorUniverse: 0
  },

  // Milestone 7A: 3D Mesh / .OBJ Surfaces, 3D Model Orbit Inspector & 6-Point solvePnP Calibration
  objAssets: {},
  nextObjNum: 1,
  _objSyncRev: 1,
  input3DOrbitMode: true,
  orbit3D: {
    yaw: 34,
    pitch: 24,
    dist: 2.85,
    panX: 0,
    panY: 0
  },
  hoveredOrbitVertIdx: -1,
  selectedCalibPinIdx: 0
};

// ============================================================================
// MEDIA BIN & SOURCE TEXTURE FACTORIES
// ============================================================================

function getSourceById(id) {
  if (id === 'bus:orbital') {
    return state.sources.find(s => s.kind === 'mixbus' || s.id === 'src_mixbus') || state.sources[0] || null;
  }
  return state.sources.find(s => s.id === id) || state.sources[0] || null;
}

function getActiveLiveSpot() {
  if (!Array.isArray(state.spots) || state.spots.length === 0) {
    return null;
  }
  if (state.trackpadSpotTarget) {
    const byTarget = state.spots.find(s => s && s.id === state.trackpadSpotTarget && s.enabled !== false);
    if (byTarget) return byTarget;
  }
  const idx = clamp(Math.round(state.activeSpotIndex || 0), 0, state.spots.length - 1);
  return state.spots[idx] || state.spots[0] || null;
}

function getActiveSpot() {
  if (!Array.isArray(state.spots) || state.spots.length === 0) {
    if (!state._spotsInitialized) {
      const s0 = createSpotObject(0);
      state.spots = [s0];
      state._spotsInitialized = true;
      state.followspot = s0;
      state.activeSpotIndex = 0;
      return s0;
    }
    state.followspot = state._detachedFallbackSpot || _detachedFallbackSpot;
    return state.followspot;
  }
  if (state.followspot !== state.spots[0]) {
    state.followspot = state.spots[0];
  }
  const idx = clamp(Math.round(state.activeSpotIndex || 0), 0, state.spots.length - 1);
  return state.spots[idx] || state.spots[0];
}

function getSelectedSurface() {
  return state.surfaces.find(s => s.id === state.selectedSurfaceId) || null;
}

function getSelectedSurfaces() {
  if (Array.isArray(state.selectedSurfaceIds) && state.selectedSurfaceIds.length > 0) {
    const idSet = new Set(state.selectedSurfaceIds);
    const list = state.surfaces.filter(s => idSet.has(s.id));
    if (list.length > 0) return list;
  }
  const single = getSelectedSurface();
  return single ? [single] : [];
}

function isSurfaceSelected(surfId) {
  if (state.selectedSurfaceId === surfId) return true;
  return Array.isArray(state.selectedSurfaceIds) && state.selectedSurfaceIds.includes(surfId);
}

function getGroupById(groupId, groupsList = state.groups) {
  if (!groupId || !Array.isArray(groupsList)) return null;
  return groupsList.find(g => g.id === groupId) || null;
}

function getEffectiveSurfaceProps(surf, groupsList = state.groups) {
  const grp = surf.groupId ? getGroupById(surf.groupId, groupsList) : null;
  return {
    visible: surf.visible !== false && (!grp || grp.visible !== false),
    solo: !!surf.solo || !!(grp && grp.solo),
    locked: !!surf.locked || !!(grp && grp.locked),
    opacity: clamp((surf.opacity ?? 1.0) * (grp ? (grp.opacity ?? 1.0) : 1.0), 0, 1)
  };
}

function setCanonicalStageResolution(preset, customW = null, customH = null) {
  const presets = {
    '1920x1080': [1920, 1080],
    '1920x1200': [1920, 1200],
    '2560x1440': [2560, 1440],
    '3840x2160': [3840, 2160],
    '3840x1080': [3840, 1080],
    '1080x1920': [1080, 1920],
    '1440x1080': [1440, 1080]
  };
  state.stageResPreset = preset;
  if (preset === 'fill') {
    state.stageWidth = 1920;
    state.stageHeight = 1080;
    state.stageAspect = 0;
  } else if (presets[preset]) {
    state.stageWidth = presets[preset][0];
    state.stageHeight = presets[preset][1];
    state.stageAspect = state.stageWidth / state.stageHeight;
  } else {
    state.stageResPreset = 'custom';
    state.stageWidth = clamp(Math.round(customW || state.stageWidth || 1920), 256, 8192);
    state.stageHeight = clamp(Math.round(customH || state.stageHeight || 1080), 256, 8192);
    state.stageAspect = state.stageWidth / state.stageHeight;
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
}

function pingCalibCrosshair(sx, sy, holdMs = 1300) {
  if (state.showLock) return;
  state.calibCrosshair.active = true;
  state.calibCrosshair.screen = 0;
  state.calibCrosshair.x = sx;
  state.calibCrosshair.y = sy;
  state.calibCrosshair.expireMs = performance.now() + holdMs;
}

function setStageBackgroundDataUrl(dataUrl, enableNow = true) {
  if (!dataUrl) {
    state.stageBg.enabled = false;
    state.stageBg.dataUrl = null;
    state.stageBg.img = null;
    state.stageBg.width = 0;
    state.stageBg.height = 0;
    return;
  }
  const img = new Image();
  img.onload = () => {
    state.stageBg.img = img;
    state.stageBg.width = img.naturalWidth || 1280;
    state.stageBg.height = img.naturalHeight || 720;
  };
  img.src = dataUrl;
  state.stageBg.dataUrl = dataUrl;
  if (enableNow) state.stageBg.enabled = true;
}

function getSelectedMask() {
  return state.masks.find(m => m.id === state.selectedMaskId) || null;
}

function captureMediaThumb(el, w, h) {
  try {
    const c = document.createElement('canvas');
    c.width = 84;
    c.height = 56;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#070a10';
    ctx.fillRect(0, 0, 84, 56);
    const scale = Math.max(84 / Math.max(1, w), 56 / Math.max(1, h));
    const dw = w * scale, dh = h * scale;
    ctx.drawImage(el, (84 - dw) * 0.5, (56 - dh) * 0.5, dw, dh);
    return c.toDataURL('image/jpeg', 0.75);
  } catch (_) {
    return null;
  }
}

function paintOfflineSlateTexture(tex, title, sub) {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 270;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#120d18';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = 'rgba(255, 93, 120, 0.7)';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, c.width - 16, c.height - 16);

  ctx.strokeStyle = 'rgba(255, 93, 120, 0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(8, 8); ctx.lineTo(c.width - 8, c.height - 8);
  ctx.moveTo(c.width - 8, 8); ctx.lineTo(8, c.height - 8);
  ctx.stroke();

  ctx.fillStyle = '#ff8fa2';
  ctx.font = '700 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('⚠ OFFLINE MEDIA', c.width / 2, c.height / 2 - 14);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 15px sans-serif';
  ctx.fillText(String(title || 'Missing File').slice(0, 38), c.width / 2, c.height / 2 + 14);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '12px monospace';
  ctx.fillText(sub || 'Click Relink Media to reconnect', c.width / 2, c.height / 2 + 38);

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
}

function createFboSource(id, name, shaderKind, opts = {}) {
  const width = opts.width || 1920;
  const height = opts.height || 1080;
  const texture = createGlTexture(width, height);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return {
    id,
    name,
    kind: 'shader',
    shaderKind,
    width,
    height,
    texture,
    fbo,
    flipY: false,
    mirrorX: false,
    offline: false,
    playing: true,
    simTime: opts.simTime || 0,
    speed: opts.speed ?? 0.65,
    scale: opts.scale ?? 0.85,
    detail: opts.detail ?? 1.25,
    temp: opts.temp ?? -0.15,
    palette: opts.palette ?? 1,
    swatchCss: opts.swatchCss || 'linear-gradient(135deg, #ff511a, #ffa463, #7ad4ff)'
  };
}

function initBuiltInSources() {
  state.sources = [
    createFboSource('src_shards', 'Voronoi Shards', 'shards', {
      speed: 0.62, scale: 0.82, detail: 1.30, temp: -0.20, palette: 1,
      swatchCss: 'linear-gradient(135deg, #ff4d1a, #ff9e5e, #fff0d6)'
    }),
    createFboSource('src_cloud', 'Cosmic Cloud', 'cloud', {
      speed: 0.55, scale: 0.95, detail: 1.15, temp: 0.15, palette: 2,
      swatchCss: 'linear-gradient(135deg, #ff4f9a, #7b2cbf, #48e5ff)'
    }),
    createFboSource('src_laser', 'Laser Truss', 'laser', {
      speed: 0.70, scale: 0.90, detail: 1.05, temp: 0.0, palette: 3,
      swatchCss: 'linear-gradient(135deg, #ff8800, #050a14, #00f5d4)'
    }),
    createFboSource('src_caustics', 'Water Caustics', 'caustics', {
      speed: 0.58, scale: 0.92, detail: 1.20, temp: 0.25, palette: 0,
      swatchCss: 'linear-gradient(135deg, #062845, #18b5ff, #c8fff4)'
    }),
    createFboSource('src_liquid', 'Liquid Marble', 'liquid', {
      speed: 0.48, scale: 0.88, detail: 1.35, temp: 0.05, palette: 2,
      swatchCss: 'linear-gradient(135deg, #2a0944, #a12568, #fec260)'
    }),
    createFboSource('src_gridscan', 'Grid Scanner', 'gridscan', {
      speed: 0.65, scale: 0.78, detail: 1.10, temp: 0.10, palette: 0,
      swatchCss: 'linear-gradient(135deg, #071928, #22d1ee, #34e89e)'
    }),
    createFboSource('src_strobegeo', 'Geo Tunnel', 'strobegeo', {
      speed: 0.72, scale: 0.84, detail: 1.00, temp: -0.10, palette: 1,
      swatchCss: 'linear-gradient(135deg, #160924, #ff3b6b, #ffcb7d)'
    }),
    createFboSource('src_gradient', 'Stage Cyclorama', 'gradient', {
      speed: 0.40, scale: 0.65, detail: 0.65, temp: 0.0, palette: 4,
      swatchCss: 'linear-gradient(135deg, #1b2845, #6c5ce7, #ffa69e)'
    }),
    createFboSource('src_videolight', 'Stage Gobo Light', 'videolight', {
      speed: 0.45, scale: 1.15, detail: 0.30, temp: 0.0, palette: 0,
      swatchCss: 'linear-gradient(135deg, #0b111e, #fff7e2, #6fd3ff)'
    }),
    createFboSource('src_testcard', 'Calibration Card', 'testcard', {
      speed: 0.50, scale: 0.75, detail: 1.0, temp: 0.0, palette: 0,
      swatchCss: 'linear-gradient(135deg, #1d3557, #34e89e, #ffcb7d)'
    }),
    createMixbusSource('src_mixbus', '◎ Mix Circle Bus')
  ];
  state.activeSourceId = 'src_shards';
}

function createOfflineMediaSource(entry) {
  const texture = createGlTexture(480, 270);
  paintOfflineSlateTexture(texture, entry.fileName || entry.name, `${(entry.kind || 'media').toUpperCase()} • ${entry.width || 1920}×${entry.height || 1080}`);

  const srcObj = {
    id: entry.id || `src_off_${state.nextSourceNum++}`,
    name: entry.name || 'Offline Clip',
    kind: entry.kind || 'video',
    fileName: entry.fileName || `${entry.name || 'clip'}.mp4`,
    fileSize: entry.fileSize || 0,
    width: entry.width || 1920,
    height: entry.height || 1080,
    texture,
    video: null,
    image: null,
    file: null,
    objectUrl: null,
    flipY: true,
    mirrorX: !!entry.mirrorX,
    offline: true,
    playing: entry.playing !== false,
    loopMode: entry.loopMode || 'loop',
    pingPongDir: 1,
    isSeekingReverse: false,
    rate: entry.rate ?? 1.0,
    muted: entry.muted !== undefined ? !!entry.muted : true,
    volume: entry.volume ?? 0.8,
    needsUpload: false,
    lastUploadedTime: -1,
    thumbUrl: entry.thumbUrl || null
  };
  if (srcObj.kind === 'video' && typeof initProVideoProps === 'function') {
    initProVideoProps(srcObj, entry);
  }
  return srcObj;
}

function addVideoSourceFromFile(file, targetOfflineSrc = null, customMeta = null) {
  if (targetOfflineSrc && targetOfflineSrc.objectUrl) {
    try { URL.revokeObjectURL(targetOfflineSrc.objectUrl); } catch (_) {}
  }
  if (targetOfflineSrc && targetOfflineSrc.video) {
    try {
      targetOfflineSrc.video.pause();
      targetOfflineSrc.video.src = '';
      if (typeof targetOfflineSrc.video.remove === 'function') targetOfflineSrc.video.remove();
    } catch (_) {}
  }

  const autoUnmuteNext = !!state._unmuteNextImportedVideo;
  state._unmuteNextImportedVideo = false;
  const initMuted = (customMeta && typeof customMeta.muted === 'boolean')
    ? customMeta.muted
    : (targetOfflineSrc ? !!targetOfflineSrc.muted : !autoUnmuteNext);
  const initVol = clamp(Number(customMeta?.volume ?? targetOfflineSrc?.volume ?? 0.8), 0, 1);

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.playsInline = true;
  video.controls = false;
  video.setAttribute('aria-hidden', 'true');
  video.muted = state.isProjectorRole ? true : initMuted;
  video.volume = initVol;
  video.loop = targetOfflineSrc ? targetOfflineSrc.loopMode === 'loop' : true;
  video.playbackRate = targetOfflineSrc ? (targetOfflineSrc.rate ?? 1.0) : 1.0;
  video.preload = 'auto';
  video.src = url;
  if (typeof document !== 'undefined') {
    const mediaPool = document.getElementById('hidden-media-pool');
    if (mediaPool && typeof mediaPool.appendChild === 'function') {
      mediaPool.appendChild(video);
    }
  }

  let srcObj = targetOfflineSrc;
  if (!srcObj) {
    const id = (customMeta && customMeta.id) ? customMeta.id : `src_vid_${state.nextSourceNum++}`;
    const texture = createGlTexture(16, 16);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([12, 16, 24, 255]));

    srcObj = {
      id,
      name: (customMeta && customMeta.name) || (file.name ? file.name.replace(/\.[^.]+$/, '') : 'Video Clip'),
      kind: 'video',
      fileName: file.name || (customMeta && customMeta.fileName) || 'video.mp4',
      fileSize: file.size || 0,
      width: 1920,
      height: 1080,
      texture,
      video,
      file,
      objectUrl: url,
      flipY: true,
      mirrorX: !!(customMeta && customMeta.mirrorX),
      offline: false,
      playing: customMeta ? customMeta.playing !== false : true,
      loopMode: (customMeta && customMeta.loopMode) || 'loop',
      pingPongDir: 1,
      isSeekingReverse: false,
      rate: (customMeta && customMeta.rate) || 1.0,
      muted: initMuted,
      volume: initVol,
      hasAudioTrack: null,
      audioTrackSilent: false,
      _pcmAudio: null,
      needsUpload: true,
      lastUploadedTime: -1,
      thumbUrl: null
    };
    state.sources.push(srcObj);
  } else {
    srcObj.kind = 'video';
    srcObj.video = video;
    srcObj.file = file;
    srcObj.fileName = file.name || srcObj.fileName;
    srcObj.fileSize = file.size || srcObj.fileSize;
    srcObj.objectUrl = url;
    srcObj.offline = false;
    srcObj.flipY = true;
    srcObj.muted = initMuted;
    srcObj.volume = initVol;
    srcObj.hasAudioTrack = null;
    srcObj.audioTrackSilent = false;
    srcObj._pcmAudio = null;
    srcObj.needsUpload = true;
    srcObj.lastUploadedTime = -1;
  }

  if (typeof initProVideoProps === 'function') {
    initProVideoProps(srcObj, customMeta || targetOfflineSrc);
    normalizeVideoTrim(srcObj);
    applyVideoBpmRate(srcObj);
  }

  video.addEventListener('seeked', () => {
    srcObj.isSeekingReverse = false;
    srcObj.needsUpload = true;
  });

  video.addEventListener('ended', () => {
    if (srcObj.loopMode === 'oneshot') {
      srcObj.playing = false;
      syncTransportUI();
    }
  });

  const scheduleFrameCallback = () => {
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(() => {
        srcObj.needsUpload = true;
        if (!srcObj.thumbUrl && video.videoWidth > 0) {
          srcObj.thumbUrl = captureMediaThumb(video, video.videoWidth, video.videoHeight);
          renderMediaBin();
        }
        if (srcObj.video === video) scheduleFrameCallback();
      });
    }
  };
  scheduleFrameCallback();

  video.addEventListener('loadeddata', () => {
    srcObj.width = video.videoWidth || 1920;
    srcObj.height = video.videoHeight || 1080;
    if (video.duration > 0.1 && (srcObj.trimIn ?? 0) > 0.001) {
      const inSec = (srcObj.trimIn ?? 0) * video.duration;
      if (video.currentTime < inSec - 0.02) video.currentTime = inSec;
    }
    srcObj.needsUpload = true;
    srcObj.thumbUrl = captureMediaThumb(video, srcObj.width, srcObj.height);
    if (srcObj.playing) {
      const p = video.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          if (!video.muted) {
            video.muted = true;
            srcObj.muted = true;
            video.play().catch(() => {});
            renderMediaBin();
            syncTransportUI();
            if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
            showToast('🔇 Autoplay started muted — click 🔊 Sound ON to hear speakers');
          }
        });
      }
    }
    renderMediaBin();
    syncInspectorUI();
    syncTransportUI();
    if (typeof renderVideoWaveformCanvas === 'function' && state.activeSourceId === srcObj.id) {
      renderVideoWaveformCanvas(srcObj);
    }
  });

  if (typeof extractVideoWaveformPeaks === 'function' && !state.isProjectorRole) {
    extractVideoWaveformPeaks(srcObj, file);
  }

  if (!targetOfflineSrc && !customMeta) {
    assignOrActivateNewSource(srcObj);
    showToast(`Loaded Video: ${srcObj.name}`);
  } else {
    renderMediaBin();
    renderSurfaceList();
    syncInspectorUI();
    syncTransportUI();
    updateRelinkBadgeUI();
  }

  if (!state.isProjectorRole) {
    if (state.audio && !targetOfflineSrc && !customMeta) {
      state.audio.videoSourceId = 'auto';
      if (state.audio.sourceMode === 'synth' || state.audio.sourceMode === 'video' || !state.audio.enabled) {
        state.audio.sourceMode = 'video';
        state.audio.enabled = true;
        if (typeof ensureLiveAudioGraph === 'function') ensureLiveAudioGraph();
      }
    }
    if (state.audio && state.audio.enabled && state.audio.sourceMode === 'video' && typeof attachActiveVideoToAudioGraph === 'function') {
      attachActiveVideoToAudioGraph();
    }
    if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    broadcastMediaToProjector(srcObj);
    scheduleAutosave();
  }
  return srcObj;
}

function addImageSourceFromFile(file, targetOfflineSrc = null, customMeta = null) {
  if (targetOfflineSrc && targetOfflineSrc.objectUrl) {
    try { URL.revokeObjectURL(targetOfflineSrc.objectUrl); } catch (_) {}
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  let srcObj = targetOfflineSrc;

  if (!srcObj) {
    const id = (customMeta && customMeta.id) ? customMeta.id : `src_img_${state.nextSourceNum++}`;
    const texture = createGlTexture(1, 1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([16, 20, 30, 255]));

    srcObj = {
      id,
      name: (customMeta && customMeta.name) || (file.name ? file.name.replace(/\.[^.]+$/, '') : 'Image'),
      kind: 'image',
      fileName: file.name || (customMeta && customMeta.fileName) || 'image.png',
      fileSize: file.size || 0,
      width: 1024,
      height: 1024,
      texture,
      image: img,
      file,
      objectUrl: url,
      inlineDataUrl: null,
      flipY: true,
      mirrorX: !!(customMeta && customMeta.mirrorX),
      offline: false,
      thumbUrl: null
    };
    state.sources.push(srcObj);
  } else {
    srcObj.kind = 'image';
    srcObj.image = img;
    srcObj.file = file;
    srcObj.fileName = file.name || srcObj.fileName;
    srcObj.fileSize = file.size || srcObj.fileSize;
    srcObj.objectUrl = url;
    srcObj.offline = false;
    srcObj.flipY = true;
  }

  // Embed compact images (< 1.4 MB) directly inside .webmapper.json saves
  if (file && file.size > 0 && file.size <= 1400000 && !state.isProjectorRole) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        srcObj.inlineDataUrl = reader.result;
      }
    };
    reader.readAsDataURL(file);
  }

  img.onload = () => {
    srcObj.width = img.naturalWidth || 1024;
    srcObj.height = img.naturalHeight || 1024;
    uploadImageWithMipmaps(srcObj.texture, img);
    srcObj.thumbUrl = captureMediaThumb(img, srcObj.width, srcObj.height);
    renderMediaBin();
    syncInspectorUI();
    syncTransportUI();
  };
  img.src = url;

  if (!targetOfflineSrc && !customMeta) {
    assignOrActivateNewSource(srcObj);
    showToast(`Loaded Image: ${srcObj.name}`);
  } else {
    renderMediaBin();
    renderSurfaceList();
    syncInspectorUI();
    syncTransportUI();
    updateRelinkBadgeUI();
  }

  if (!state.isProjectorRole) {
    broadcastMediaToProjector(srcObj);
    scheduleAutosave();
  }
  return srcObj;
}

function addImageSourceFromDataUrl(entry) {
  const img = new Image();
  const texture = createGlTexture(1, 1);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([16, 20, 30, 255]));

  const srcObj = {
    id: entry.id || `src_img_${state.nextSourceNum++}`,
    name: entry.name || 'Embedded Image',
    kind: 'image',
    fileName: entry.fileName || 'embedded.png',
    fileSize: entry.fileSize || 0,
    width: entry.width || 1024,
    height: entry.height || 1024,
    texture,
    image: img,
    file: null,
    objectUrl: null,
    inlineDataUrl: entry.inlineDataUrl,
    flipY: true,
    mirrorX: !!entry.mirrorX,
    offline: false,
    thumbUrl: entry.thumbUrl || null
  };

  img.onload = () => {
    srcObj.width = img.naturalWidth || srcObj.width;
    srcObj.height = img.naturalHeight || srcObj.height;
    uploadImageWithMipmaps(texture, img);
    srcObj.thumbUrl = captureMediaThumb(img, srcObj.width, srcObj.height);
    renderMediaBin();
  };
  img.src = entry.inlineDataUrl;
  state.sources.push(srcObj);
  return srcObj;
}

async function addLiveCameraSource(requestedDeviceId = null) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('MediaDevices API not available in this browser context');
    return;
  }
  try {
    const constraints = {
      video: requestedDeviceId
        ? { deviceId: { exact: requestedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = stream.getVideoTracks()[0];
    const settings = track ? track.getSettings() : {};
    const label = (track && track.label) ? track.label : `Live Camera ${state.nextSourceNum}`;

    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    const id = `src_cam_${state.nextSourceNum++}`;
    const texture = createGlTexture(16, 16);
    const srcObj = {
      id,
      name: label,
      kind: 'live',
      deviceId: settings.deviceId || requestedDeviceId || '',
      width: video.videoWidth || settings.width || 1280,
      height: video.videoHeight || settings.height || 720,
      texture,
      video,
      stream,
      flipY: true,
      mirrorX: false,
      offline: false,
      needsUpload: true
    };

    const scheduleCamCallback = () => {
      if ('requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback(() => {
          srcObj.needsUpload = true;
          scheduleCamCallback();
        });
      }
    };
    scheduleCamCallback();

    state.sources.push(srcObj);
    state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    assignOrActivateNewSource(srcObj);
    await refreshCameraDeviceDropdown(srcObj.deviceId);
    renderMediaBin();
    showToast(`Live Input Active: ${srcObj.name}`);
  } catch (_) {
    showToast('Camera / Capture access denied or unavailable');
  }
}

async function switchLiveCameraDevice(srcObj, newDeviceId) {
  if (!srcObj || srcObj.kind !== 'live') return;
  try {
    if (srcObj.stream) {
      srcObj.stream.getTracks().forEach(t => t.stop());
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: newDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    const track = stream.getVideoTracks()[0];
    srcObj.stream = stream;
    srcObj.deviceId = newDeviceId;
    if (track && track.label) srcObj.name = track.label;
    srcObj.video.srcObject = stream;
    await srcObj.video.play();
    srcObj.width = srcObj.video.videoWidth || 1280;
    srcObj.height = srcObj.video.videoHeight || 720;
    srcObj.needsUpload = true;
    renderMediaBin();
    renderSurfaceList();
    syncTransportUI();
    showToast(`Switched Input: ${srcObj.name}`);
  } catch (_) {
    showToast('Could not switch video input device');
  }
}

function assignOrActivateNewSource(srcObj) {
  state.activeSourceId = srcObj.id;
  const selSurf = getSelectedSurface();
  if (selSurf && !selSurf.locked) {
    selSurf.sourceId = srcObj.id;
  }
  renderMediaBin();
  renderSurfaceList();
  syncInspectorUI();
  syncTransportUI();
}

function isVideoFile(file) {
  const type = (file.type || '').toLowerCase();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return type.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext);
}

function isImageFile(file) {
  const type = (file.type || '').toLowerCase();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(ext);
}

function batchRelinkFiles(fileList) {
  if (!fileList || fileList.length === 0) return 0;
  let relinkedCount = 0;

  // Single-source targeted relink if requested from Transport bar
  if (state.relinkSingleSourceId && fileList.length === 1) {
    const target = state.sources.find(s => s.id === state.relinkSingleSourceId);
    state.relinkSingleSourceId = null;
    if (target) {
      const f = fileList[0];
      if (isVideoFile(f)) { addVideoSourceFromFile(f, target); return 1; }
      if (isImageFile(f)) { addImageSourceFromFile(f, target); return 1; }
    }
  }

  const offlineList = state.sources.filter(s => s.offline);
  for (const file of fileList) {
    const fLower = file.name.toLowerCase();
    const fStem = fLower.replace(/\.[^.]+$/, '');

    let match = offlineList.find(s => s.offline && (s.fileName || '').toLowerCase() === fLower);
    if (!match) {
      match = offlineList.find(s => s.offline && (s.name || '').toLowerCase() === fStem);
    }

    if (match) {
      if (isVideoFile(file)) {
        addVideoSourceFromFile(file, match);
        relinkedCount++;
      } else if (isImageFile(file)) {
        addImageSourceFromFile(file, match);
        relinkedCount++;
      }
    }
  }

  renderRelinkDialogList();
  updateRelinkBadgeUI();
  if (relinkedCount > 0) {
    const remaining = state.sources.filter(s => s.offline).length;
    showToast(remaining === 0 ? `All ${relinkedCount} media clips relinked!` : `Relinked ${relinkedCount} clip(s) • ${remaining} remaining`);
    if (remaining === 0) {
      const dlg = document.getElementById('relink-dialog');
      if (dlg && dlg.open) dlg.close();
    }
  }
  return relinkedCount;
}

function importObjMeshAsSurface(objText, fileName = 'Model.obj', targetExistingSurf = null) {
  const cleanName = String(fileName || 'Model.obj').replace(/\.obj$/i, '').trim() || '3D Mesh';
  const num = state.nextObjNum++;
  const assetId = `obj_${num}_${Math.random().toString(36).slice(2, 6)}`;
  const parsedMesh = parseObjMesh(objText, `obj:${assetId}`);

  if (typeof pushUndoCheckpoint === 'function') {
    pushUndoCheckpoint(`Import 3D .OBJ (${cleanName})`);
  }

  state.objAssets[assetId] = {
    id: assetId,
    name: cleanName,
    fileName: fileName || `${cleanName}.obj`,
    objText: String(objText),
    triCount: parsedMesh.triCount,
    uniqueCount: parsedMesh.uniqueVerts.length,
    _mesh: parsedMesh
  };
  state._objSyncRev = (state._objSyncRev || 0) + 1;
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;

  let surf = targetExistingSurf;
  if (surf && surf.type === 'mesh3d') {
    surf.objAssetId = assetId;
    surf.mesh3dPrimitive = 'obj';
    surf.name = cleanName;
    surf.calibPins = [];
    surf.calibMode = 'manual';
    surf._geomRev = (surf._geomRev || 1) + 1;
  } else {
    surf = createSurface('mesh3d', {
      name: cleanName,
      objAssetId: assetId,
      mesh3dPrimitive: 'obj'
    });
    state.surfaces.unshift(surf);
    state.selectedSurfaceId = surf.id;
    state.selectedSurfaceIds = [surf.id];
    state.inspTab = 'surface';
  }
  state.input3DOrbitMode = true;
  if (typeof renderSurfaceList === 'function') renderSurfaceList();
  if (typeof syncInspectorUI === 'function') syncInspectorUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') {
    showToast(`Imported 3D .OBJ "${cleanName}" (${parsedMesh.triCount} tris • ${parsedMesh.uniqueVerts.length} verts)`);
  }
  return surf;
}

function handleDroppedOrPickedFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  // 1. Check if a 3D .obj mesh, ISF shader (.fs/.isf/.frag/.glsl), .wmplugin.json, or .webmapper.json file was dropped
  const remainingFiles = [];
  for (const file of fileList) {
    const fLower = (file.name || '').toLowerCase();
    if (fLower.endsWith('.obj')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        try {
          importObjMeshAsSurface(reader.result, file.name);
        } catch (err) {
          if (typeof showToast === 'function') showToast(`3D .OBJ Error: ${err.message || err}`);
        }
      };
      reader.readAsText(file);
      continue;
    }
    if (fLower.endsWith('.fs') || fLower.endsWith('.isf') || fLower.endsWith('.frag') || fLower.endsWith('.glsl') || fLower.endsWith('.wmplugin.json') || fLower.endsWith('.chaosplugin.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') importIsfOrPluginFileText(reader.result, file.name);
      };
      reader.readAsText(file);
      continue;
    }
    if (fLower.endsWith('.json') || fLower.endsWith('.wmshow')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        try {
          const probe = JSON.parse(reader.result);
          if (probe && (APP_PLUGIN_FORMATS_ACCEPTED.includes(probe.format) || probe.kind === 'generator' || probe.kind === 'effect')) {
            importIsfOrPluginFileText(reader.result, file.name);
            return;
          }
        } catch (_) {}
        importShowJson(reader.result);
      };
      reader.readAsText(file);
      return;
    }
    remainingFiles.push(file);
  }
  if (remainingFiles.length === 0) return;

  // 2. If offline clips exist with matching filenames, auto-relink them first!
  const offlineBefore = state.sources.some(s => s.offline);
  const unmatched = [];
  for (const file of remainingFiles) {
    if (offlineBefore) {
      const matched = batchRelinkFiles([file]);
      if (matched > 0) continue;
    }
    unmatched.push(file);
  }

  // 3. Import any new media clips into Media Bin
  for (const file of unmatched) {
    if (isVideoFile(file)) addVideoSourceFromFile(file);
    else if (isImageFile(file)) addImageSourceFromFile(file);
  }
}

// ============================================================================
// SURFACE GROUP, SURFACE, POLYGON MASK & DEMO SCENE FACTORIES
// ============================================================================

function createSurfaceGroup(overrides = {}) {
  const num = state.nextGroupNum++;
  return {
    id: overrides.id || `grp_${num}_${Math.random().toString(36).slice(2, 6)}`,
    name: overrides.name || `Group ${num}`,
    accent: overrides.accent || SURFACE_ACCENTS[(num - 1) % SURFACE_ACCENTS.length],
    visible: overrides.visible ?? true,
    solo: overrides.solo ?? false,
    locked: overrides.locked ?? false,
    opacity: overrides.opacity ?? 1.0,
    collapsed: overrides.collapsed ?? false
  };
}

function createSurface(type = 'quad', overrides = {}) {
  const num = state.nextSurfaceNum++;
  const accent = overrides.accent || SURFACE_ACCENTS[(num - 1) % SURFACE_ACCENTS.length];
  const defaultSource = overrides.sourceId || state.activeSourceId || 'src_shards';

  let points;
  if (overrides.points) {
    points = overrides.points.map(p => [p[0], p[1]]);
  } else {
    const jitter = ((num - 1) % 5) * 0.025;
    if (type === 'triangle') {
      points = [
        [0.32 + jitter, 0.25 + jitter * 0.5],
        [0.68 + jitter, 0.25 + jitter * 0.5],
        [0.50 + jitter, 0.76 + jitter * 0.5]
      ];
    } else if (type === 'circle') {
      points = [
        [0.34 + jitter, 0.22 + jitter * 0.5],
        [0.66 + jitter, 0.22 + jitter * 0.5],
        [0.66 + jitter, 0.78 + jitter * 0.5],
        [0.34 + jitter, 0.78 + jitter * 0.5]
      ];
    } else if (type === 'polygon') {
      // Default hexagon if not drawn interactively
      points = [];
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2 - Math.PI * 0.5;
        points.push([0.50 + jitter + 0.18 * Math.cos(ang), 0.50 + jitter * 0.5 + 0.24 * Math.sin(ang)]);
      }
    } else if (type === 'line') {
      points = [
        [0.22 + jitter, 0.30 + jitter * 0.5],
        [0.50 + jitter, 0.72 + jitter * 0.5],
        [0.78 + jitter, 0.30 + jitter * 0.5]
      ];
    } else {
      points = [
        [0.28 + jitter, 0.24 + jitter * 0.5],
        [0.72 + jitter, 0.24 + jitter * 0.5],
        [0.72 + jitter, 0.76 + jitter * 0.5],
        [0.28 + jitter, 0.76 + jitter * 0.5]
      ];
    }
  }

  const labelMap = { quad: 'Quad', triangle: 'Tri', circle: 'Circle', polygon: 'Poly', line: 'Line', mesh3d: '3D Mesh' };
  const labelType = labelMap[type] || 'Quad';
  const baseFeather = overrides.feather ?? ((type === 'line' || type === 'mesh3d') ? 0.0 : 0.02);
  const surf = {
    id: overrides.id || `surf_${num}_${Math.random().toString(36).slice(2, 6)}`,
    name: overrides.name || `${labelType} ${num}`,
    type,
    // Surface generated from a venue object (person silhouette / screen fit) that tracks it (05h).
    linkObject: overrides.linkObject && overrides.linkObject.kind ? {
      kind: String(overrides.linkObject.kind),
      id: String(overrides.linkObject.id),
      ...(overrides.linkObject.face ? { face: String(overrides.linkObject.face) } : {}),
      ...(overrides.linkObject.proj ? { proj: Number(overrides.linkObject.proj) } : {})
    } : null,
    accent,
    groupId: overrides.groupId || null,
    visible: overrides.visible ?? true,
    solo: overrides.solo ?? false,
    locked: overrides.locked ?? false,
    animateGeomInShow: !!overrides.animateGeomInShow,
    showCalGrid: overrides.showCalGrid ?? false,
    sourceId: defaultSource,

    // Milestone 7A: 3D Mesh / .OBJ Surface Transform, Projector Lens, Studio Lighting & 6-Pt solvePnP
    mesh3dPrimitive: overrides.mesh3dPrimitive || 'cube',
    objAssetId: overrides.objAssetId || null,
    pos3d: Array.isArray(overrides.pos3d) ? [overrides.pos3d[0] || 0, overrides.pos3d[1] || 0, overrides.pos3d[2] || 0] : [0, 0, 0],
    rot3d: Array.isArray(overrides.rot3d) ? [overrides.rot3d[0] ?? 18, overrides.rot3d[1] ?? -28, overrides.rot3d[2] ?? 0] : [18, -28, 0],
    scale3d: Array.isArray(overrides.scale3d) ? [overrides.scale3d[0] ?? 1, overrides.scale3d[1] ?? 1, overrides.scale3d[2] ?? 1] : [1, 1, 1],
    camThrow: overrides.camThrow ?? 1.20,
    camDist: overrides.camDist ?? 3.20,
    lensShiftX: overrides.lensShiftX ?? 0.0,
    lensShiftY: overrides.lensShiftY ?? 0.0,
    shade3d: overrides.shade3d || 'lit_wire', // 'lit_wire' | 'lit' | 'wire' | 'unlit' | 'normals'
    cull3d: overrides.cull3d || 'back',       // 'back' | 'none' | 'front' | 'xray'
    wireWidth: overrides.wireWidth ?? 1.35,
    wireGlow: overrides.wireGlow ?? 0.45,
    wireChase: overrides.wireChase ?? 0.0,
    wireUseSource: overrides.wireUseSource ?? false,
    lightAzim: overrides.lightAzim ?? 36,
    lightElev: overrides.lightElev ?? 42,
    lightAmbient: overrides.lightAmbient ?? 0.28,
    lightDiffuse: overrides.lightDiffuse ?? 0.85,
    lightSpec: overrides.lightSpec ?? 0.42,
    lightRim: overrides.lightRim ?? 0.35,
    calibMode: overrides.calibMode || 'manual', // 'manual' | 'calibrated'
    calibPins: Array.isArray(overrides.calibPins)
      ? overrides.calibPins.map(p => ({
          vertexIdx: Number.isFinite(p.vertexIdx) ? p.vertexIdx : -1,
          pos3d: [Number(p.pos3d?.[0]) || 0, Number(p.pos3d?.[1]) || 0, Number(p.pos3d?.[2]) || 0],
          stage2d: [Number(p.stage2d?.[0]) || 0.5, Number(p.stage2d?.[1]) || 0.5],
          enabled: p.enabled !== false
        }))
      : [],

    // Phase 3.2 + Milestone 1: Homography / Bilinear / Projective Curved Spline / Projective Bezier
    quadWarp: overrides.quadWarp || 'perspective', // 'perspective' | 'bilinear' | 'mesh' | 'bezier'
    meshCols: clamp(overrides.meshCols ?? 3, 2, 16),
    meshRows: clamp(overrides.meshRows ?? 3, 2, 16),
    meshBrush: overrides.meshBrush ?? 0.22,
    meshPinCorners: overrides.meshPinCorners ?? false,
    meshPts: overrides.meshPts ? overrides.meshPts.map(p => [p[0], p[1]]) : null,

    points,
    triUvs: overrides.triUvs
      ? overrides.triUvs.map(p => [p[0], p[1]])
      : [[0.22, 0.20], [0.78, 0.20], [0.50, 0.84]],
    polyUvs: overrides.polyUvs ? overrides.polyUvs.map(p => [p[0], p[1]]) : null,

    // Milestone 2: Architectural Line & Chase properties
    lineClosed: overrides.lineClosed ?? false,
    lineWidth: overrides.lineWidth ?? 0.010,
    lineGlow: overrides.lineGlow ?? 0.55,
    lineChaseMode: overrides.lineChaseMode || 'chase', // 'solid'|'chase'|'dual'|'boomerang'|'dash'|'pulse'
    lineSpeed: overrides.lineSpeed ?? 0.65,
    lineDuty: overrides.lineDuty ?? 0.42,
    lineCount: overrides.lineCount ?? 2,
    lineUseSource: overrides.lineUseSource ?? false,

    // Milestone 2: Universal Surface Perimeter Border / Chase FX
    borderWidth: overrides.borderWidth ?? 0.0,
    borderGlow: overrides.borderGlow ?? 0.50,
    borderChase: overrides.borderChase || 'chase',
    borderSpeed: overrides.borderSpeed ?? 0.55,

    uvX: overrides.uvX ?? 0.5,
    uvY: overrides.uvY ?? 0.5,
    uvW: overrides.uvW ?? 1.0,
    uvH: overrides.uvH ?? 1.0,
    uvRot: overrides.uvRot ?? 0.0,
    cropL: overrides.cropL ?? 0.0,
    cropR: overrides.cropR ?? 0.0,
    cropT: overrides.cropT ?? 0.0,
    cropB: overrides.cropB ?? 0.0,

    circleSoftness: overrides.circleSoftness ?? 0.15,
    circleInner: overrides.circleInner ?? 0.0,
    circleStartAngle: overrides.circleStartAngle ?? 0,
    circleEndAngle: overrides.circleEndAngle ?? 360,

    blendMode: overrides.blendMode || 'normal',
    opacity: overrides.opacity ?? 1.0,
    feather: baseFeather,
    featherLink: overrides.featherLink ?? true,
    featherL: overrides.featherL ?? baseFeather,
    featherR: overrides.featherR ?? baseFeather,
    featherT: overrides.featherT ?? baseFeather,
    featherB: overrides.featherB ?? baseFeather,
    blendGamma: overrides.blendGamma ?? 1.0,
    blackLevel: overrides.blackLevel ?? 0.0,

    // Milestone 7C: Theatrical 4-Blade Ellipsoidal Framing Shutters
    shutterL: overrides.shutterL ?? 0.0,
    shutterR: overrides.shutterR ?? 0.0,
    shutterT: overrides.shutterT ?? 0.0,
    shutterB: overrides.shutterB ?? 0.0,
    shutterAngL: overrides.shutterAngL ?? 0.0,
    shutterAngR: overrides.shutterAngR ?? 0.0,
    shutterAngT: overrides.shutterAngT ?? 0.0,
    shutterAngB: overrides.shutterAngB ?? 0.0,
    shutterSoft: overrides.shutterSoft ?? 0.015,

    brightness: overrides.brightness ?? 0.0,
    contrast: overrides.contrast ?? 1.0,
    saturation: overrides.saturation ?? 1.0,
    colorTemp: overrides.colorTemp ?? 0.0,

    // Milestone 3: Luma / Chroma Keyer, Expanded Color Science & Stackable GPU Post-FX Rack
    keyMode: overrides.keyMode || 'off', // 'off' | 'luma' | 'chroma'
    lumaMin: overrides.lumaMin ?? 0.08,
    lumaSoftness: overrides.lumaSoftness ?? 0.08,
    lumaInvert: overrides.lumaInvert ?? false,
    chromaColor: overrides.chromaColor || '#00ff00',
    chromaTolerance: overrides.chromaTolerance ?? 0.28,
    chromaSoftness: overrides.chromaSoftness ?? 0.10,
    chromaSpill: overrides.chromaSpill ?? 0.45,

    gamma: overrides.gamma ?? 1.0,
    hueShift: overrides.hueShift ?? 0.0,
    tintColor: overrides.tintColor || '#6fd3ff',
    tintAmount: overrides.tintAmount ?? 0.0,
    invertRgb: overrides.invertRgb ?? false,
    channelMode: overrides.channelMode || 'rgb', // 'rgb'|'bgr'|'rrr'|'ggg'|'bbb'|'luma'

    fxChain: typeof cloneFxChain === 'function' ? cloneFxChain(overrides.fxChain || []) : [],

    _meshDirty: true,
    _geomRev: overrides.geomRev || overrides._geomRev || 1,
    _glVerts: null
  };

  if (surf.type === 'quad' && !surf.meshPts) {
    initSurfaceMeshFromCorners(surf);
  }
  if (surf.type === 'polygon' && !surf.polyUvs && surf.points.length >= 3) {
    syncPolygonUvsFromStage(surf);
  }
  return surf;
}

function createMask(overrides = {}) {
  const num = state.nextMaskNum++;
  const pts = overrides.points
    ? overrides.points.map(p => [p[0], p[1]])
    : [
        [0.42, 0.12],
        [0.58, 0.12],
        [0.58, 0.42],
        [0.42, 0.42]
      ];
  const flags = Array.isArray(overrides.curveFlags)
    ? pts.map((_, idx) => !!overrides.curveFlags[idx])
    : pts.map(() => false);

  return {
    id: overrides.id || `mask_${num}_${Math.random().toString(36).slice(2, 6)}`,
    name: overrides.name || `Cutout Mask ${num}`,
    mode: overrides.mode || 'subtract', // 'subtract' | 'add'
    target: overrides.target || 'all',  // 'all' or surface.id
    feather: overrides.feather ?? 0.015,
    choke: overrides.choke ?? 0.0,
    opacity: overrides.opacity ?? 1.0,
    invert: overrides.invert ?? false,
    smoothAll: overrides.smoothAll ?? false,
    curveTension: overrides.curveTension ?? 0.5,
    curveFlags: flags,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    points: pts
  };
}

function resetFollowspotDefaults() {
  Object.assign(state.followspot, {
    mode: 'off',
    spotX: 0.50,
    spotY: 0.52,
    targetX: 0.50,
    targetY: 0.52,
    velX: 0.0,
    velY: 0.0,
    radius: 0.24,
    softness: 0.09,
    gain: 1.65,
    ambient: 0.14,
    stretchX: 1.0,
    stretchY: 1.0,
    rotation: 0,
    morph: 0.0,
    inertia: 0.78,
    shadowDepth: 0.52,
    shadowTex: 1.15,
    shadowRnd: 0.65,
    shadowSpeed: 0.65,
    colA: '#ff3b6b',
    colB: '#ff9e44',
    colC: '#fff4d6',
    temp: 0.0,
    converge3D: false,
    performerDepthM: 1.20,
    performerHeightM: 1.75,
    performerRadiusM: 0.45,
    maskBgSpill: false
  });
}

function loadDemoScene(silent = false) {
  state.surfaces = [];
  state.groups = [];
  state.masks = [];
  state.cues = [];
  state.masterFxChain = [];
  state.modulators = [];
  state.nextModNum = 1;
  state.objAssets = {};
  state.nextObjNum = 1;
  state._objSyncRev = (state._objSyncRev || 0) + 1;
  if (state.constellation) state.constellation.active = false;
  if (typeof cancelCueAutoFollow === 'function') cancelCueAutoFollow();
  if (typeof restoreTimelineState === 'function') restoreTimelineState(null);
  if (typeof restoreMultiProjectorState === 'function') restoreMultiProjectorState(null);
  if (typeof restorePixelMapperState === 'function') restorePixelMapperState(null);
  state.drawingSurfaceId = null;
  state.drawingMaskId = null;
  state.selectedVertex = null;
  state.nextSurfaceNum = 1;
  state.nextGroupNum = 1;
  state.nextMaskNum = 1;
  state.nextCueNum = 1;
  state.crossfade.active = false;
  state.masterKeystone = {
    enabled: false,
    editOnStage: false,
    points: [[0, 0], [1, 0], [1, 1], [0, 1]],
    lensK1: 0.0
  };
  resetFollowspotDefaults();

  const wingsGroup = createSurfaceGroup({
    id: 'grp_demo_wings',
    name: 'Truss Wings',
    accent: '#ffcb7d'
  });
  state.groups = [wingsGroup];

  const centerMonolith = createSurface('quad', {
    id: 'surf_demo_monolith',
    name: 'Center Monolith',
    sourceId: 'src_shards',
    points: [[0.30, 0.14], [0.70, 0.14], [0.64, 0.86], [0.36, 0.86]],
    uvX: 0.5, uvY: 0.5, uvW: 0.55, uvH: 0.88,
    feather: 0.015,
    opacity: 1.0,
    accent: '#6fd3ff'
  });

  const leftWing = createSurface('triangle', {
    id: 'surf_demo_lwing',
    name: 'Left Truss Wing',
    groupId: wingsGroup.id,
    sourceId: 'src_shards',
    points: [[0.08, 0.22], [0.30, 0.14], [0.36, 0.86]],
    triUvs: [[0.05, 0.22], [0.28, 0.14], [0.34, 0.86]],
    feather: 0.02,
    opacity: 0.95,
    colorTemp: -0.25,
    accent: '#ffcb7d'
  });

  const rightWing = createSurface('triangle', {
    id: 'surf_demo_rwing',
    name: 'Right Truss Wing',
    groupId: wingsGroup.id,
    sourceId: 'src_shards',
    points: [[0.70, 0.14], [0.92, 0.22], [0.64, 0.86]],
    triUvs: [[0.72, 0.14], [0.95, 0.22], [0.66, 0.86]],
    feather: 0.02,
    opacity: 0.95,
    colorTemp: 0.25,
    accent: '#b58cff'
  });

  const cosmicHalo = createSurface('circle', {
    id: 'surf_demo_halo',
    name: 'Cosmic Halo Iris',
    sourceId: 'src_cloud',
    points: [[0.34, 0.22], [0.66, 0.22], [0.66, 0.78], [0.34, 0.78]],
    circleSoftness: 0.34,
    circleInner: 0.26,
    blendMode: 'screen',
    opacity: 0.88,
    accent: '#34e89e'
  });

  // Architectural Stage Portal Doorway Cutout Mask (6-point arch polygon with smooth Bezier crown)
  const portalArchMask = createMask({
    id: 'mask_demo_portal',
    name: 'Stage Portal Arch',
    mode: 'subtract',
    target: 'all',
    feather: 0.012,
    opacity: 1.0,
    curveFlags: [false, false, true, true, true, true],
    points: [
      [0.445, 0.13],
      [0.555, 0.13],
      [0.555, 0.27],
      [0.528, 0.325],
      [0.472, 0.325],
      [0.445, 0.27]
    ]
  });

  state.surfaces = [cosmicHalo, leftWing, rightWing, centerMonolith];
  state.masks = [portalArchMask];
  state.selectedMaskId = portalArchMask.id;
  state._sceneSyncRev++;

  // Build 3 showcase cues demonstrating optical dissolves across Phases 1–4!
  const cue1Snap = captureSceneSnapshot();

  // Temporarily configure Cue 2: Curved Vaulted Dome + Laser Truss
  centerMonolith.quadWarp = 'mesh';
  applyMeshPreset(centerMonolith, 'dome');
  leftWing.sourceId = 'src_laser';
  rightWing.sourceId = 'src_laser';
  cosmicHalo.opacity = 0.96;
  const cue2Snap = captureSceneSnapshot();

  // Temporarily configure Cue 3: Cosmic Cloud Followspot Reveal Mask
  state.followspot.mode = 'reveal';
  state.followspot.radius = 0.27;
  state.followspot.ambient = 0.16;
  state.followspot.gain = 1.90;
  state.followspot.morph = 0.65;
  const cue3Snap = captureSceneSnapshot();

  // Restore Cue 1 as initial live state
  applySceneSnapshotImmediate(cue1Snap);

  state.cues = [
    { id: 'cue_1', name: '1. Architectural Shards', fadeSec: 2.0, snapshot: cue1Snap },
    { id: 'cue_2', name: '2. Curved Vault & Laser', fadeSec: 2.4, snapshot: cue2Snap },
    { id: 'cue_3', name: '3. Followspot Reveal', fadeSec: 2.8, snapshot: cue3Snap }
  ];
  state.activeCueId = 'cue_1';
  state.nextCueNum = 4;
  if (typeof autoArrangeConstellationNodes === 'function') {
    autoArrangeConstellationNodes('circle');
  }

  if (typeof clearUndoHistory === 'function') clearUndoHistory();
  selectSurface(centerMonolith.id, true);
  renderMaskList();
  renderCueList();
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  if (!silent) {
    showToast('Loaded Multi-Surface Demo Rig + 3 Show Cues');
    scheduleAutosave();
  }
}

function loadBlankScene() {
  state.surfaces = [];
  state.groups = [];
  state.masks = [];
  state.cues = [];
  state.masterFxChain = [];
  state.modulators = [];
  state.nextModNum = 1;
  state.objAssets = {};
  state.nextObjNum = 1;
  state._objSyncRev = (state._objSyncRev || 0) + 1;
  if (state.constellation) state.constellation.active = false;
  if (typeof cancelCueAutoFollow === 'function') cancelCueAutoFollow();
  if (typeof restoreTimelineState === 'function') restoreTimelineState(null);
  if (typeof restoreMultiProjectorState === 'function') restoreMultiProjectorState(null);
  if (typeof restorePixelMapperState === 'function') restorePixelMapperState(null);
  state.drawingSurfaceId = null;
  state.drawingMaskId = null;
  state.selectedMaskId = null;
  state.selectedVertex = null;
  state.activeCueId = null;
  state.nextSurfaceNum = 1;
  state.nextGroupNum = 1;
  state.nextMaskNum = 1;
  state.nextCueNum = 1;
  state.crossfade.active = false;
  resetFollowspotDefaults();

  const quad = createSurface('quad', {
    name: 'Quad 1',
    sourceId: state.activeSourceId || 'src_shards',
    points: [[0.20, 0.18], [0.80, 0.18], [0.80, 0.82], [0.20, 0.82]],
    feather: 0.01
  });
  state.surfaces = [quad];
  state._sceneSyncRev++;
  if (typeof clearUndoHistory === 'function') clearUndoHistory();
  selectSurface(quad.id, true);
  renderMaskList();
  renderCueList();
  syncFollowspotInspectorUI();
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  scheduleAutosave();
  showToast('Blank Scene Ready');
}
