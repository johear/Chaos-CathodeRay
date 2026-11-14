// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05g-rooms-devices-spots.js — Visionary Studio Architecture (Pillars 1–6):
//   1. Three Task Rooms (1 · WORLD, 2 · MAP, 3 · LIVE), Output Feed Tabs & Hold-W Reach-Through
//   2. Simultaneous Live Engine (Cues + bus:orbital + Eos IFCB Spot Recall + Controller Seats)
//   3. Hover Ghost Rig Presets (Defaults as Launchpads, Never Cages)
//   4. Universal Multi-Spot Optical Bench (Pure Light, Media/Shader/Orbital Beam, Gobo, 3D MRT)
//   5. PJLink Ethernet Projector Shutter Control & Two-Stage Blackout (DBO Pre-Open)
//   6. Flexible "No-Bloat" .wmdevice.json DMX Devices (Park > DBO > Seat > Cue > Mod > Home)
// ============================================================================

const WMDEVICE_TEMPLATES = {
  dowser_1ch: {
    id: 'dowser_1ch',
    label: '1ch Projector Dowser / Mechanical Shutter',
    schema: 'webmapper.dmx.device.v1',
    name: 'Projector Dowser',
    category: 'shutter',
    channels: [
      {
        offset: 0,
        key: 'shutter',
        label: 'Shutter Blade',
        kind: 'switch',
        home: 255,
        dbo: 0,
        offVal: 0,
        onVal: 255
      }
    ]
  },
  hazer_2ch: {
    id: 'hazer_2ch',
    label: '2ch Stage Hazer (Haze + Blower + 5s Burst)',
    schema: 'webmapper.dmx.device.v1',
    name: 'Stage Hazer',
    category: 'atmosphere',
    channels: [
      {
        offset: 0,
        key: 'haze',
        label: 'Haze Output',
        kind: 'dimmer',
        home: 0,
        dbo: 'hold'
      },
      {
        offset: 1,
        key: 'fan',
        label: 'Dispersion Fan',
        kind: 'dimmer',
        home: 64,
        dbo: 'hold'
      }
    ]
  },
  generic_strip_4ch: {
    id: 'generic_strip_4ch',
    label: '4ch Custom Generic Strip (Dimmer / Switch / Power)',
    schema: 'webmapper.dmx.device.v1',
    name: 'Utility DMX Rack',
    category: 'utility',
    channels: [
      { offset: 0, key: 'ch1', label: 'Practical Dimmer 1', kind: 'dimmer', home: 0, dbo: 'zero' },
      { offset: 1, key: 'ch2', label: 'Practical Dimmer 2', kind: 'dimmer', home: 0, dbo: 'zero' },
      {
        offset: 2,
        key: 'mode',
        label: 'Macro / Macro Slot',
        kind: 'enum',
        home: 0,
        dbo: 'hold',
        ranges: [
          { label: 'Open / Manual', value: 0 },
          { label: 'Warm Tungsten', value: 64 },
          { label: 'Cool Daylight', value: 140 },
          { label: 'Strobe Slow', value: 210 }
        ]
      },
      { offset: 3, key: 'relay_pwr', label: 'Lamp / Relay Power (World Hold)', kind: 'power', home: 0, dbo: 'hold' }
    ]
  }
};

const WORLD_GHOST_PRESETS = {
  foh_1x1: {
    id: 'foh_1x1',
    label: '1×1 FOH Single',
    desc: '6.0×3.38m stage + centered FOH projector (5.2m throw)',
    layoutPreset: '1x1',
    overlapPct: 0.0,
    multiEnabled: false,
    stageW: 6.0,
    stageH: 3.38,
    stageD: 4.0,
    projectors: [{ posM: [0.0, 2.4, 5.2], aimM: [0.0, 1.69, 0.0], throwRatio: 1.2, lumens: 9000 }]
  },
  wide_2x1: {
    id: 'wide_2x1',
    label: '2×1 Panorama',
    desc: '10.4×3.38m wide cyclorama + 2 FOH projectors w/ 15% raised-cosine blend',
    layoutPreset: '2x1',
    overlapPct: 0.15,
    multiEnabled: true,
    stageW: 10.4,
    stageH: 3.38,
    stageD: 4.5,
    projectors: [
      { posM: [-2.3, 2.5, 5.4], aimM: [-2.1, 1.69, 0.0], throwRatio: 1.15, lumens: 10000 },
      { posM: [2.3, 2.5, 5.4], aimM: [2.1, 1.69, 0.0], throwRatio: 1.15, lumens: 10000 }
    ]
  },
  stack_2x: {
    id: 'stack_2x',
    label: '2× Double-Stack',
    desc: 'Dual stacked FOH projectors w/ Constant-Lux optical solver armed',
    layoutPreset: '2x-stack',
    overlapPct: 1.0,
    multiEnabled: true,
    stageW: 6.0,
    stageH: 3.38,
    stageD: 4.0,
    enableSolver: true,
    projectors: [
      { posM: [-0.22, 2.45, 5.2], aimM: [0.0, 1.69, 0.0], throwRatio: 1.2, lumens: 10000 },
      { posM: [0.22, 2.45, 5.2], aimM: [0.0, 1.69, 0.0], throwRatio: 1.2, lumens: 10000 }
    ]
  },
  monolith_3d: {
    id: 'monolith_3d',
    label: '3D Monolith + FOH',
    desc: 'Stamps an editable 3D sculptural monolith surface + FOH projector',
    layoutPreset: '1x1',
    overlapPct: 0.0,
    multiEnabled: false,
    stageW: 6.0,
    stageH: 3.6,
    stageD: 4.5,
    add3dSurface: true,
    projectors: [{ posM: [0.0, 2.5, 5.0], aimM: [0.0, 1.6, 0.0], throwRatio: 1.18, lumens: 12000 }]
  },
  arch_led_haze: {
    id: 'arch_led_haze',
    label: 'LED Arch + Haze',
    desc: 'Stamps editable 60px RGB LED strip + 1ch Dowser + 2ch Stage Hazer',
    layoutPreset: '1x1',
    overlapPct: 0.0,
    multiEnabled: false,
    stageW: 6.5,
    stageH: 3.5,
    stageD: 4.2,
    addLedAndDmx: true,
    projectors: [{ posM: [0.0, 2.4, 5.2], aimM: [0.0, 1.69, 0.0], throwRatio: 1.2, lumens: 9500 }]
  }
};

// ============================================================================
// 1. AUTO-SEEDED WORLD RIG & PROJECTOR PJLINK METADATA
// ============================================================================

function ensureProjectorPjLinkMeta(scr) {
  if (!scr || typeof scr !== 'object') return null;
  if (!scr.pjlink || typeof scr.pjlink !== 'object') {
    scr.pjlink = {
      enabled: false,
      ip: '',
      port: 4352,
      password: '',
      linkDbo: true,
      shutterClosed: false,
      measuredShutterMs: 380,
      lampHours: null,
      powerState: '1',
      errorCode: '000000',
      lastReply: '',
      lastPollMs: 0
    };
  } else {
    if (!Number.isFinite(scr.pjlink.port)) scr.pjlink.port = 4352;
    if (!Number.isFinite(scr.pjlink.measuredShutterMs)) scr.pjlink.measuredShutterMs = 380;
    if (scr.pjlink.linkDbo === undefined) scr.pjlink.linkDbo = true;
  }
  return scr.pjlink;
}

function createWorldScreen(idx = 1, overrides = {}) {
  const w = clamp(Number(overrides.widthM ?? 6.0), 0.25, 80.0);
  const h = clamp(Number(overrides.heightM ?? 3.38), 0.25, 40.0);
  return {
    id: String(overrides.id || `wscr_${idx}`),
    name: String(overrides.name || (idx === 1 ? 'Main Stage Screen' : `Screen ${idx}`)),
    widthM: w,
    heightM: h,
    posM: Array.isArray(overrides.posM) && overrides.posM.length === 3
      ? overrides.posM.map(v => Number(v) || 0)
      : [0, h * 0.5, -2.0],
    yawDeg: clamp(Number(overrides.yawDeg ?? 0), -180, 180),
    pitchDeg: clamp(Number(overrides.pitchDeg ?? 0), -89, 89),
    enabled: overrides.enabled !== false,
    color: String(overrides.color || '#34e89e')
  };
}

function ensureFloorplanState() {
  if (!state.floorplan || typeof state.floorplan !== 'object') {
    state.floorplan = {
      dataUrl: '',
      name: '',
      widthM: 12.0,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotDeg: 0.0,
      opacity: 0.48,
      locked: false,
      visible: true,
      calibMode: false,
      calibPts: [],
      _img: null
    };
  } else {
    if (!Number.isFinite(state.floorplan.widthM)) state.floorplan.widthM = 12.0;
    if (!Number.isFinite(state.floorplan.offsetX)) state.floorplan.offsetX = 0.0;
    if (!Number.isFinite(state.floorplan.offsetZ)) state.floorplan.offsetZ = 0.0;
    if (!Number.isFinite(state.floorplan.rotDeg)) state.floorplan.rotDeg = 0.0;
    if (!Number.isFinite(state.floorplan.opacity)) state.floorplan.opacity = 0.48;
    if (!Array.isArray(state.floorplan.calibPts)) state.floorplan.calibPts = [];
  }
  if (state.floorplan.dataUrl && !state.floorplan._img && typeof Image !== 'undefined') {
    try {
      const img = new Image();
      img.onload = () => {
        if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
      };
      img.src = state.floorplan.dataUrl;
      state.floorplan._img = img;
    } catch (_) {}
  }
  return state.floorplan;
}

function syncPrimaryVenueFromWorldScreens() {
  if (!Array.isArray(state.worldScreens) || typeof ensureStagePlanState !== 'function' || !state.multiProjector) return;
  const sp = ensureStagePlanState(state.multiProjector);
  const primary = state.worldScreens.find(s => s && s.enabled !== false) || state.worldScreens[0] || null;
  if (primary && sp && sp.venue) {
    sp.venue.screenZ = Number(primary.posM?.[2] ?? -2.0);
    sp._dirty = true;
  }
}

function getSelectedWorldScreen() {
  if (!Array.isArray(state.worldScreens) || state.worldScreens.length === 0) return null;
  return state.worldScreens.find(s => s.id === state.selectedWorldScreenId) || state.worldScreens[0] || null;
}

function addWorldScreen(overrides = {}) {
  ensureWorldRigSeeded();
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Add Physical Screen');
  const num = state.nextWorldScreenNum || (state.worldScreens.length + 1);
  state.nextWorldScreenNum = num + 1;
  const offsetIdx = state.worldScreens.length;
  const scr = createWorldScreen(num, {
    id: overrides.id || `wscr_${num}`,
    name: overrides.name || (offsetIdx === 0 ? 'Main Stage Screen' : `Physical Screen ${num}`),
    widthM: overrides.widthM ?? 4.0,
    heightM: overrides.heightM ?? 2.25,
    posM: overrides.posM || [(offsetIdx % 3 - 1) * 1.8, 1.8, -1.6 + (offsetIdx % 2) * 0.9],
    yawDeg: overrides.yawDeg ?? (offsetIdx === 0 ? 0 : (offsetIdx % 2 === 1 ? 18 : -18)),
    pitchDeg: overrides.pitchDeg ?? 0,
    ...overrides
  });
  state.worldScreens.push(scr);
  state.selectedWorldScreenId = scr.id;
  state.rigSelectedKind = 'world_screen';
  setActiveSelection('world_screen', scr.id, scr.name);
  syncPrimaryVenueFromWorldScreens();
  if (typeof commitRigPhysicalChange === 'function') commitRigPhysicalChange();
  renderWorldDocksUI();
  if (typeof showToast === 'function') showToast(`🖥 Added ${scr.name}`);
  return scr;
}

function removeWorldScreen(idOrIdx = null) {
  ensureWorldRigSeeded();
  if (!Array.isArray(state.worldScreens) || state.worldScreens.length === 0) return false;
  let pos = -1;
  if (typeof idOrIdx === 'number') {
    pos = idOrIdx;
  } else if (typeof idOrIdx === 'string' && idOrIdx) {
    pos = state.worldScreens.findIndex(s => s.id === idOrIdx);
  } else {
    pos = state.worldScreens.findIndex(s => s.id === state.selectedWorldScreenId);
    if (pos < 0) pos = 0;
  }
  if (pos < 0 || pos >= state.worldScreens.length) return false;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Delete Physical Screen');
  const removed = state.worldScreens.splice(pos, 1)[0];
  state.selectedWorldScreenId = state.worldScreens[0]?.id || null;
  if (state.activeSelection?.kind === 'world_screen' && state.activeSelection.id === removed.id) {
    if (state.worldScreens[0]) {
      setActiveSelection('world_screen', state.worldScreens[0].id, state.worldScreens[0].name);
    } else {
      setActiveSelection(null, null, '');
    }
  }
  syncPrimaryVenueFromWorldScreens();
  if (typeof commitRigPhysicalChange === 'function') commitRigPhysicalChange();
  renderWorldDocksUI();
  if (typeof showToast === 'function') showToast(`🗑 Deleted ${removed.name}`);
  return true;
}

function importFloorplanFromDataUrl(dataUrl, name = 'Venue Floorplan', opts = {}) {
  ensureWorldRigSeeded();
  const fp = ensureFloorplanState();
  if (!opts.skipUndo && typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Import Floorplan');
  fp.dataUrl = String(dataUrl || '');
  fp.name = String(name || 'Venue Floorplan');
  fp.visible = true;
  fp.calibMode = false;
  fp.calibPts = [];
  fp._img = null;
  if (fp.dataUrl && typeof Image !== 'undefined') {
    const img = new Image();
    img.onload = () => {
      // Frame the new underlay (its true aspect is only known once decoded).
      if (!opts.skipUndo && typeof fitStagePlanView === 'function') fitStagePlanView();
      if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
      renderWorldDocksUI();
    };
    img.src = fp.dataUrl;
    fp._img = img;
  }
  state.rigSelectedKind = 'floorplan';
  setActiveSelection('floorplan', 'floorplan', fp.name);
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
  renderWorldDocksUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return fp;
}

function clearFloorplan() {
  const fp = ensureFloorplanState();
  if (!fp.dataUrl && !fp.name) return false;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Remove Floorplan');
  fp.dataUrl = '';
  fp.name = '';
  fp._img = null;
  fp.calibMode = false;
  fp.calibPts = [];
  if (state.activeSelection?.kind === 'floorplan') {
    setActiveSelection(null, null, '');
  }
  if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
  renderWorldDocksUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') showToast('🗑 Cleared floorplan underlay');
  return true;
}

function toggleFloorplanCalibMode(forceVal) {
  const fp = ensureFloorplanState();
  fp.calibMode = typeof forceVal === 'boolean' ? forceVal : !fp.calibMode;
  fp.calibPts = [];
  if (fp.calibMode && typeof ensureStagePlanState === 'function' && state.multiProjector) {
    const sp = ensureStagePlanState(state.multiProjector);
    sp.viewMode = 'plan2d';
  }
  if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
  renderWorldDocksUI();
  if (fp.calibMode && typeof showToast === 'function') {
    showToast('📏 Floorplan 2-Point Scale: Click Point A then Point B on the 2D Plan');
  }
  return fp.calibMode;
}

function applyFloorplanTwoPointScale(ptA, ptB, realMeters) {
  const fp = ensureFloorplanState();
  const distNow = Math.hypot((Number(ptB?.[0]) || 0) - (Number(ptA?.[0]) || 0), (Number(ptB?.[1]) || 0) - (Number(ptA?.[1]) || 0));
  const wantM = Number(realMeters);
  if (!(distNow > 0.005) || !(wantM > 0.01)) return false;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Scale Floorplan');
  // Scale about Point A so the first clicked landmark stays put under the cursor.
  const prevW = fp.widthM;
  fp.widthM = clamp(fp.widthM * (wantM / distNow), 0.5, 250.0);
  const k = fp.widthM / Math.max(1e-6, prevW);
  const ax = Number(ptA?.[0]) || 0, az = Number(ptA?.[1]) || 0;
  fp.offsetX = Number((ax + ((fp.offsetX || 0) - ax) * k).toFixed(3));
  fp.offsetZ = Number((az + ((fp.offsetZ || 0) - az) * k).toFixed(3));
  fp.calibMode = false;
  fp.calibPts = [];
  if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
  renderWorldDocksUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') {
    showToast(`📏 Floorplan calibrated → ${fp.widthM.toFixed(2)}m total width`);
  }
  return fp.widthM;
}

function ensureWorldRigSeeded() {
  if (!state.worldStage || typeof state.worldStage !== 'object') {
    state.worldStage = {
      widthM: 6.0,
      heightM: 3.38,
      depthM: 4.0,
      shape: 'proscenium' // 'proscenium' | 'thrust' | 'arena' | 'gallery'
    };
  }
  if (typeof ensureMultiProjectorState === 'function') {
    ensureMultiProjectorState();
  }
  if (typeof ensureStagePlanState === 'function') {
    ensureStagePlanState(state.multiProjector);
    if (state.multiProjector?.stagePlan?.venue) {
      state.worldStage.widthM = Number(state.multiProjector.stagePlan.venue.stageWidthM) || state.worldStage.widthM;
      state.worldStage.heightM = Number(state.multiProjector.stagePlan.venue.stageHeightM) || state.worldStage.heightM;
      state.worldStage.depthM = Number(state.multiProjector.stagePlan.venue.stageDepthM) || state.worldStage.depthM;
    }
  }
  if (!Array.isArray(state.worldScreens)) {
    const venue = state.multiProjector?.stagePlan?.venue || null;
    const defZ = venue?.screenZ ?? -((state.worldStage.depthM || 4.0) * 0.5);
    const scrW = Number(venue?.screenWidthM) || state.worldStage.widthM || 6.0;
    const scrH = Number(venue?.screenHeightM) || state.worldStage.heightM || 3.38;
    const scrBottom = Number(venue?.screenBottomM ?? 0) || 0;
    state.worldScreens = [
      createWorldScreen(1, {
        id: 'wscr_1',
        name: 'Main Stage Screen',
        widthM: scrW,
        heightM: scrH,
        // Same rectangle as the stage-plan venue screen, so seeded projectors land on it.
        posM: [0, Number((scrBottom + scrH * 0.5).toFixed(3)), defZ],
        yawDeg: 0,
        pitchDeg: 0
      })
    ];
    state.nextWorldScreenNum = 2;
    state.selectedWorldScreenId = 'wscr_1';
  }
  ensureFloorplanState();

  const mp = state.multiProjector;
  if (mp && Array.isArray(mp.screens)) {
    for (const scr of mp.screens) {
      ensureProjectorPjLinkMeta(scr);
      if (typeof syncProjectorAnglesFromAim === 'function' && scr.yawDeg === undefined) {
        syncProjectorAnglesFromAim(scr);
      }
    }
  }
  if (!Array.isArray(state.spots)) {
    state.spots = state._spotsInitialized ? [] : [createSpotObject(0)];
  } else if (state.spots.length === 0 && !state._spotsInitialized) {
    state.spots = [createSpotObject(0)];
  }
  state._spotsInitialized = true;
  state.followspot = state.spots[0] || state._detachedFallbackSpot || createSpotObject(0);

  if (!Array.isArray(state.dmxDevices)) {
    state.dmxDevices = [];
  }
}

function isBuildRoom(r = state.room) {
  return r === 'build' || r === 'world';
}

function syncWorldStageDimensions(widthM, heightM, depthM, shape, extra = {}) {
  ensureWorldRigSeeded();
  if (Number.isFinite(widthM)) state.worldStage.widthM = clamp(widthM, 1.0, 60.0);
  if (Number.isFinite(heightM)) state.worldStage.heightM = clamp(heightM, 1.0, 30.0);
  if (Number.isFinite(depthM)) state.worldStage.depthM = clamp(depthM, 1.0, 40.0);
  if (shape) {
    const prevShape = state.worldStage.shape;
    state.worldStage.shape = String(shape);
    // A new venue type brings its own typical deck height unless one was set explicitly.
    if (prevShape !== state.worldStage.shape && !Number.isFinite(extra.deckHeightM) && typeof VENUE_SHAPES !== 'undefined' && VENUE_SHAPES[state.worldStage.shape]) {
      state.worldStage.deckHeightM = VENUE_SHAPES[state.worldStage.shape].deckH;
    }
  }
  if (Number.isFinite(extra.deckHeightM)) state.worldStage.deckHeightM = clamp(extra.deckHeightM, 0, 3);
  // People stay standing on whatever is under them after the deck changes.
  for (const prop of state.worldProps || []) {
    if (prop && Array.isArray(prop.posM) && typeof getVenueFloorHeightAt === 'function') {
      prop.posM[1] = Number(getVenueFloorHeightAt(prop.posM[0], prop.posM[2]).toFixed(3));
    }
  }
  if (typeof markStagePlanDirty === 'function') markStagePlanDirty();

  if (typeof ensureStagePlanState === 'function' && state.multiProjector) {
    const sp = ensureStagePlanState(state.multiProjector);
    sp.venue.stageWidthM = state.worldStage.widthM;
    sp.venue.stageHeightM = state.worldStage.heightM;
    sp.venue.stageDepthM = state.worldStage.depthM;
    sp._dirty = true;
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof renderRigWorkspaceCanvas === 'function' && state.layoutMode === 'rig') {
    renderRigWorkspaceCanvas();
  }
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

function setWorldGhostHover(presetId) {
  state.hoverGhostPreset = (presetId && WORLD_GHOST_PRESETS[presetId]) ? presetId : null;
  if (typeof renderRigWorkspaceCanvas === 'function' && state.layoutMode === 'rig') {
    renderRigWorkspaceCanvas();
  }
}

let _stampDroppedScreens = 0;
function stampWorldGhostPreset(presetId) {
  const preset = WORLD_GHOST_PRESETS[presetId];
  if (!preset) return false;
  _stampDroppedScreens = 0;
  ensureWorldRigSeeded();
  if (typeof pushUndoCheckpoint === 'function') {
    pushUndoCheckpoint(`Stamp Rig Preset: ${preset.label}`);
  }
  state.hoverGhostPreset = null;
  syncWorldStageDimensions(preset.stageW, preset.stageH, preset.stageD);

  if (!Array.isArray(state.worldScreens) || state.worldScreens.length === 0) {
    state.worldScreens = [
      createWorldScreen(1, {
        id: 'wscr_1',
        name: 'Main Stage Screen',
        widthM: preset.stageW || 6.0,
        heightM: preset.stageH || 3.38,
        posM: [0, (preset.stageH || 3.38) * 0.5, -((preset.stageD || 4.0) * 0.5)]
      })
    ];
    state.selectedWorldScreenId = 'wscr_1';
  } else {
    // A launchpad stamps a whole rig: keep the primary screen, drop extras that would block the new beams (undoable).
    if (state.worldScreens.length > 1) {
      _stampDroppedScreens = state.worldScreens.length - 1;
      state.worldScreens = [state.worldScreens[0]];
      state.selectedWorldScreenId = state.worldScreens[0].id;
    }
    state.worldScreens[0].widthM = preset.stageW || state.worldScreens[0].widthM;
    state.worldScreens[0].heightM = preset.stageH || state.worldScreens[0].heightM;
    state.worldScreens[0].posM[1] = state.worldScreens[0].heightM * 0.5;
    state.worldScreens[0].posM[2] = -((preset.stageD || 4.0) * 0.5);
  }
  syncPrimaryVenueFromWorldScreens();

  const mp = state.multiProjector;
  if (mp && typeof computeEdgeBlendGridSlices === 'function') {
    mp.enabled = !!preset.multiEnabled;
    mp.layoutPreset = preset.layoutPreset || '1x1';
    mp.overlapPct = preset.overlapPct ?? 0.15;
    const grid = computeEdgeBlendGridSlices(mp.layoutPreset, mp.overlapPct, mp.blendGamma ?? 2.2);
    mp.screens = grid.slices.map((sl, idx) => {
      const pSpec = preset.projectors[idx] || preset.projectors[0] || {};
      const scr = createProjectorScreenSlice(sl.index, {
        ...sl,
        posM: pSpec.posM ? [...pSpec.posM] : undefined,
        aimM: pSpec.aimM ? [...pSpec.aimM] : undefined,
        throwRatio: pSpec.throwRatio ?? 1.2,
        lumens: pSpec.lumens ?? 9500
      });
      ensureProjectorPjLinkMeta(scr);
      if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
      return scr;
    });
    mp.selectedScreenIndex = 1;
    mp.previewScreenIndex = 0;
    if (preset.enableSolver && mp.stagePlan) {
      mp.stagePlan.enabled = true;
      mp.stagePlan._dirty = true;
    }
  }

  if (preset.add3dSurface && typeof addSurface === 'function') {
    const has3d = state.surfaces.some(s => s.type === 'mesh3d');
    if (!has3d) {
      addSurface('mesh3d');
    }
  }

  if (preset.addLedAndDmx) {
    if (state.pixelMapper && typeof createDmxFixture === 'function' && state.pixelMapper.fixtures.length === 0) {
      state.pixelMapper.enabled = true;
      state.pixelMapper.fixtures.push(createDmxFixture('strip', {
        name: 'Proscenium Arch LED',
        pixelCount: 60,
        universe: 0,
        startChannel: 1,
        x0: 0.14, y0: 0.84, x1: 0.86, y1: 0.84
      }));
      state.pixelMapper.selectedFixtureId = state.pixelMapper.fixtures[0].id;
    }
    if (state.dmxDevices.length === 0) {
      createDmxDeviceFromTemplate('dowser_1ch', { universe: 1, startAddress: 1, linkProjector: 1 });
      createDmxDeviceFromTemplate('hazer_2ch', { universe: 1, startAddress: 2 });
    }
  }

  if (typeof fitStagePlanView === "function") fitStagePlanView();
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  syncRoomUI();
  if (typeof syncMultiProjectorUI === 'function') syncMultiProjectorUI();
  if (typeof syncPixelMapperUI === 'function') syncPixelMapperUI();
  if (typeof renderSurfaceList === 'function') renderSurfaceList();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') {
    showToast(`✦ Stamped rig: ${preset.label}${_stampDroppedScreens ? ` — replaced ${_stampDroppedScreens} extra screen${_stampDroppedScreens > 1 ? "s" : ""} (⌘Z to undo)` : " — every node is editable"}`);
  }
  return true;
}

// ============================================================================
// 2. THREE TASK ROOMS (1 · BUILD, 2 · MAP, 3 · LIVE), SUB-VIEWS & HOLD-W
// ============================================================================

let _savedMapLayoutMode = 'split';

function setBuildViewMode(mode, opts = {}) {
  ensureWorldRigSeeded();
  const valid = ['split', 'plan2d', 'world3d', 'warp'].includes(mode) ? mode : 'split';
  state.buildViewMode = valid;
  const mp = state.multiProjector;
  const sp = (mp && typeof ensureStagePlanState === 'function') ? ensureStagePlanState(mp) : null;

  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('build-rig-solo', valid === 'plan2d' || valid === 'world3d');
  }

  if (valid === 'plan2d') {
    if (sp) sp.viewMode = 'plan2d';
    state.outputFeedTab = 'previz3d';
    state.layoutMode = 'rig';
  } else if (valid === 'world3d') {
    if (sp) sp.viewMode = 'orbit3d';
    state.outputFeedTab = 'previz3d';
    state.layoutMode = 'rig';
  } else if (valid === 'warp') {
    if (state.outputFeedTab === 'previz3d' || state.outputFeedTab === 'venue3d') state.outputFeedTab = 'stage';
    state.layoutMode = 'output';
  } else {
    state.outputFeedTab = 'previz3d';
    state.layoutMode = 'rig';
  }

  if (!opts.skipLayout && typeof setLayoutMode === 'function') {
    setLayoutMode(state.layoutMode);
  }
  if (isBuildRoom()) syncBuildSelectionToRigInspector();
  syncOutputFeedTabsUI();
  if (typeof syncRigWorkspaceUI === 'function') syncRigWorkspaceUI();
  if (typeof renderRigWorkspaceCanvas === 'function' && state.layoutMode === 'rig') {
    renderRigWorkspaceCanvas();
  }
  return valid;
}

function toggleLiveMixSolo(forceVal) {
  state.liveMixSolo = typeof forceVal === 'boolean' ? forceVal : !state.liveMixSolo;
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('live-mix-solo', !!(state.liveMixSolo && state.room !== 'build' && state.room !== 'world'));
    if (state.liveMixSolo) document.body.classList.remove('pane-solo-stage');
  }
  const btn = typeof document !== 'undefined' ? document.getElementById('btn-mix-solo') : null;
  if (btn) {
    btn.classList.toggle('active', !!state.liveMixSolo);
    btn.setAttribute('aria-pressed', String(!!state.liveMixSolo));
  }
  return state.liveMixSolo;
}

// When the stage pane is hidden (2D Plan / 3D Orbit solo), a leftover 2·MAP surface
// selection would be invisible yet still be what Backspace deletes. Align the
// contextual selection with whatever the BUILD inspector is showing instead.
function syncBuildSelectionToRigInspector() {
  const rigSolo = state.buildViewMode === 'plan2d' || state.buildViewMode === 'world3d';
  const sel = state.activeSelection || {};
  const worldKinds = ['world_screen', 'projector', 'floorplan', 'led_fixture', 'dmx_device'];
  if (!rigSolo || worldKinds.includes(sel.kind)) return;
  const kind = state.rigSelectedKind;
  if (sel.kind === 'surface' && kind === 'mesh3d') return;
  if (kind === 'projector') {
    const scr = (state.multiProjector?.screens || []).find(s => s.index === state.multiProjector.selectedScreenIndex);
    if (scr) { setActiveSelection('projector', String(scr.index), `P${scr.index} ${scr.name || ''}`); return; }
  } else if (kind === 'world_screen' || !kind) {
    const ws = getSelectedWorldScreen();
    if (ws) { state.rigSelectedKind = 'world_screen'; setActiveSelection('world_screen', ws.id, ws.name); return; }
  } else if (kind === 'floorplan' && state.floorplan?.dataUrl) {
    setActiveSelection('floorplan', 'floorplan', state.floorplan.name || 'Floorplan');
    return;
  }
  state.rigSelectedKind = 'none';
  setActiveSelection(null, null, '');
}

// Arrow-key nudge of the selected world object in 1 · BUILD (x = stage-right, z = downstage).
// Projectors keep their aim point (the beam stays on target). Returns true when handled.
function nudgeWorldSelectionMeters(dxM, dzM) {
  if (!isBuildRoom() || (!dxM && !dzM)) return false;
  const sel = state.activeSelection || {};
  if (sel.kind === 'projector') {
    const scr = (state.multiProjector?.screens || []).find(s => String(s.index) === String(sel.id));
    if (!scr || !Array.isArray(scr.posM)) return false;
    if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint(`Nudge P${scr.index}`, `nudge-proj-${scr.index}`);
    scr.posM[0] = clamp(scr.posM[0] + dxM, -40, 40);
    scr.posM[2] = clamp(scr.posM[2] + dzM, -40, 40);
    if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
  } else if (sel.kind === 'world_screen') {
    const ws = (state.worldScreens || []).find(w => w.id === sel.id);
    if (!ws) return false;
    if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint(`Nudge ${ws.name}`, `nudge-ws-${ws.id}`);
    ws.posM[0] = clamp(ws.posM[0] + dxM, -45, 45);
    ws.posM[2] = clamp(ws.posM[2] + dzM, -45, 45);
    syncPrimaryVenueFromWorldScreens();
  } else if (sel.kind === 'venue_part' && typeof getVenuePartById === 'function') {
    const part = getVenuePartById(sel.id);
    if (!part) return false;
    if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint(`Nudge ${part.name}`, `nudge-vpart-${part.id}`);
    part.posM[0] = Number((part.posM[0] + dxM).toFixed(4));
    part.posM[2] = Number((part.posM[2] + dzM).toFixed(4));
    markVenuePartsDirty();
  } else if (sel.kind === 'floorplan') {
    const fp = ensureFloorplanState();
    if (fp.locked || !fp.dataUrl) return false;
    if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Nudge Floorplan', 'nudge-floorplan');
    fp.offsetX = Number(((fp.offsetX || 0) + dxM).toFixed(3));
    fp.offsetZ = Number(((fp.offsetZ || 0) + dzM).toFixed(3));
  } else {
    return false;
  }
  if (typeof commitRigPhysicalChange === 'function') commitRigPhysicalChange();
  renderWorldDocksUI();
  return true;
}

function setStudioRoom(nextRoom, opts = {}) {
  const norm = nextRoom === 'world' ? 'build' : nextRoom;
  const valid = (norm === 'build' || norm === 'map' || norm === 'live') ? norm : 'map';
  ensureWorldRigSeeded();

  const prevRoom = state.room === 'world' ? 'build' : state.room;
  if (prevRoom === 'map' && ['split', 'input', 'output'].includes(state.layoutMode)) {
    _savedMapLayoutMode = state.layoutMode;
  }
  if (state.liveReachThrough) {
    setLiveReachThrough(false);
  }

  state.room = valid;

  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('build-rig-solo', valid === 'build' && (state.buildViewMode === 'plan2d' || state.buildViewMode === 'world3d'));
    document.body.classList.toggle('live-mix-solo', !!(valid === 'live' && state.liveMixSolo));
  }

  if (valid === 'build') {
    setBuildViewMode(state.buildViewMode || 'split', { skipLayout: true });
    syncBuildSelectionToRigInspector();
  } else if (valid === 'map') {
    restoreRoomFeedTab('map');
    state.layoutMode = _savedMapLayoutMode || 'split';
  } else if (valid === 'live') {
    restoreRoomFeedTab('live');
    // In 3 · LIVE, 'mix' displays #mix-pane (Orbital Mix + Constellation) AND #stage-pane side-by-side!
    state.layoutMode = 'mix';
  }

  if (typeof setLayoutMode === 'function') {
    setLayoutMode(state.layoutMode);
  }
  syncRoomUI();
  if (typeof onRoomChangedForProgram === 'function') onRoomChangedForProgram(prevRoom, valid);
  if (prevRoom !== valid && typeof document !== 'undefined') {
    const ae = document.activeElement;
    if (!ae || ae === document.body || (ae.closest && ae.closest('.spa-room-dock.inactive'))) {
      const targetDockId = valid === 'build' ? 'world-left-dock' : (valid === 'live' ? 'live-right-dock' : 'left-dock');
      const targetDock = document.getElementById(targetDockId);
      if (targetDock) {
        if (!targetDock.hasAttribute('tabindex')) targetDock.setAttribute('tabindex', '-1');
        if (typeof targetDock.focus === 'function') targetDock.focus({ preventScroll: true });
      }
    }
  }
  if (!opts.silent && prevRoom !== valid && typeof maybeShowRoomTip === 'function') maybeShowRoomTip(valid);
  return valid;
}

// MAP & LIVE remember their own feed; both open on the walkable 3D Venue by default.
function restoreRoomFeedTab(room) {
  if (!state._feedByRoom) state._feedByRoom = {};
  const want = state._feedByRoom[room] || 'venue3d';
  if (state.outputFeedTab !== want) {
    state.outputFeedTab = want;
    if (state.multiProjector) state.multiProjector.previewScreenIndex = want.startsWith('p') && want !== 'previz3d' ? (parseInt(want.slice(1), 10) || 0) : 0;
  }
}

function setOutputFeedTab(feedId) {
  ensureWorldRigSeeded();
  if (!isBuildRoom() && feedId) {
    if (!state._feedByRoom) state._feedByRoom = {};
    state._feedByRoom[state.room] = String(feedId).toLowerCase();
  }
  const mp = state.multiProjector;
  const raw = String(feedId || 'stage').toLowerCase();

  if (raw === 'venue3d' && !isBuildRoom()) {
    // Walkable 3D venue with every projector's real output (05h GPU previz).
    state.outputFeedTab = 'venue3d';
    if (mp) mp.previewScreenIndex = 0;
    if (typeof syncVenueHudUI === 'function') syncVenueHudUI();
  } else if (raw === 'previz3d') {
    state.outputFeedTab = 'previz3d';
    if (mp) mp.previewScreenIndex = 0;
    if (isBuildRoom() && state.buildViewMode === 'warp') {
      state.buildViewMode = 'split';
    }
    state.layoutMode = 'rig';
    if (typeof setLayoutMode === 'function') setLayoutMode('rig');
  } else if (raw.startsWith('p')) {
    const pIdx = clamp(parseInt(raw.slice(1), 10) || 1, 1, MAX_MULTI_PROJ_SCREENS);
    state.outputFeedTab = `p${pIdx}`;
    if (mp) mp.previewScreenIndex = pIdx;
    if (isBuildRoom()) {
      state.buildViewMode = 'warp';
      if (typeof document !== 'undefined' && document.body) document.body.classList.remove('build-rig-solo');
      state.layoutMode = 'output';
      if (typeof setLayoutMode === 'function') setLayoutMode('output');
    }
  } else {
    state.outputFeedTab = 'stage';
    if (mp) mp.previewScreenIndex = 0;
    if (isBuildRoom()) {
      state.buildViewMode = 'warp';
      if (typeof document !== 'undefined' && document.body) document.body.classList.remove('build-rig-solo');
      state.layoutMode = 'output';
      if (typeof setLayoutMode === 'function') setLayoutMode('output');
    }
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  syncOutputFeedTabsUI();
  if (typeof syncMultiProjectorUI === 'function') syncMultiProjectorUI();
  if (typeof syncRigWorkspaceUI === 'function') syncRigWorkspaceUI();
}

function setLiveReachThrough(active) {
  const want = !!(active && (state.room === 'live' || state.room === 'map'));
  if (state.liveReachThrough === want) return;
  state.liveReachThrough = want;
  if (typeof document !== 'undefined') {
    const shell = document.getElementById('app-shell');
    if (shell) shell.classList.toggle('live-reach-through', want);
    const pill = document.getElementById('live-reach-pill');
    if (pill) {
      pill.hidden = !want;
      pill.textContent = state.room === 'map'
        ? '🔧 WARP REACH-THROUGH (Hold W) · Physical Geometry'
        : '🔧 REACH-THROUGH (Hold W) · Venue Layer';
    }
  }
}

function recordLiveCapturedTrim(key, label, value) {
  if (state.room !== 'live') return;
  if (!state.capturedTrims || typeof state.capturedTrims !== 'object') {
    state.capturedTrims = {};
  }
  state.capturedTrims[key] = {
    key,
    label: label || key,
    value,
    ts: Date.now()
  };
  syncCapturedTrimsTrayUI();
}

function updateActiveCueFromCapturedTrims() {
  const targetCue = state.cues.find(c => c.id === state.activeCueId) || state.cues[0];
  if (!targetCue) {
    if (typeof storeCurrentSceneAsCue === 'function') {
      storeCurrentSceneAsCue();
    }
    state.capturedTrims = {};
    syncCapturedTrimsTrayUI();
    return true;
  }
  if (typeof updateCueSnapshot === 'function') {
    updateCueSnapshot(targetCue.id);
  }
  state.capturedTrims = {};
  syncCapturedTrimsTrayUI();
  if (typeof showToast === 'function') {
    showToast(`✓ Updated ${targetCue.name || 'Active Cue'} with captured live trims`);
  }
  return true;
}

function releaseCapturedTrims() {
  state.capturedTrims = {};
  state.manualTouchedKeys = {};
  syncCapturedTrimsTrayUI();
  if (state.activeCueId && typeof triggerCueById === 'function') {
    triggerCueById(state.activeCueId, 0.35);
  }
  if (typeof showToast === 'function') {
    showToast('↺ Released live trims back to Active Cue');
  }
}

// ============================================================================
// 3. FLEXIBLE ".wmdevice.json" DMX UTILITY PATCH & PRIORITY STACK
//    Priority: Park > DBO > Seat > Cue > Modulator > Home (power excluded from Mod/Cue)
// ============================================================================

function normalizeWmDeviceChannel(ch, idx = 0) {
  const validKinds = ['dimmer', 'switch', 'enum', '16bit', 'power'];
  const kind = validKinds.includes(ch?.kind) ? ch.kind : 'dimmer';
  const offset = clamp(Math.round(Number(ch?.offset ?? idx)), 0, 511);
  const home = clamp(Math.round(Number(ch?.home ?? 0)), 0, 255);
  let dbo = ch?.dbo;
  if (dbo !== 'zero' && dbo !== 'hold' && dbo !== 'home') {
    const num = Number(dbo);
    dbo = Number.isFinite(num) ? clamp(Math.round(num), 0, 255) : (kind === 'power' ? 'hold' : 'zero');
  }
  const key = String(ch?.key || `ch_${offset + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const out = {
    offset,
    key,
    label: String(ch?.label || `Ch +${offset}`),
    kind,
    home,
    dbo,
    liveValue: clamp(Math.round(Number(ch?.liveValue ?? home)), 0, 255),
    fineValue: clamp(Math.round(Number(ch?.fineValue ?? 0)), 0, 255),
    seatValue: ch?.seatValue !== null && ch?.seatValue !== undefined ? clamp(Math.round(Number(ch.seatValue)), 0, 255) : null,
    cueValue: ch?.cueValue !== null && ch?.cueValue !== undefined ? clamp(Math.round(Number(ch.cueValue)), 0, 255) : null,
    modValue: null,
    parkedValue: ch?.parkedValue !== null && ch?.parkedValue !== undefined ? clamp(Math.round(Number(ch.parkedValue)), 0, 255) : null,
    offVal: clamp(Math.round(Number(ch?.offVal ?? 0)), 0, 255),
    onVal: clamp(Math.round(Number(ch?.onVal ?? 255)), 0, 255),
    ranges: Array.isArray(ch?.ranges)
      ? ch.ranges.map(r => ({ label: String(r?.label || 'Preset'), value: clamp(Math.round(Number(r?.value ?? 0)), 0, 255) }))
      : []
  };
  return out;
}

function footprintOfDmxDevice(dev) {
  if (!dev || !Array.isArray(dev.channels) || dev.channels.length === 0) return 1;
  let maxOff = 0;
  for (const ch of dev.channels) {
    const span = ch.kind === '16bit' ? 2 : 1;
    maxOff = Math.max(maxOff, (Number(ch.offset) || 0) + span);
  }
  return clamp(maxOff, 1, 512);
}

function createDmxDeviceFromSpec(spec = {}, overrides = {}) {
  ensureWorldRigSeeded();
  const num = state.nextDmxDeviceNum || (state.dmxDevices.length + 1);
  state.nextDmxDeviceNum = num + 1;
  const rawChannels = Array.isArray(spec.channels) && spec.channels.length > 0
    ? spec.channels
    : [{ offset: 0, key: 'dimmer', label: 'Dimmer', kind: 'dimmer', home: 0, dbo: 'zero' }];
  const channels = rawChannels.map((c, idx) => normalizeWmDeviceChannel(c, idx));
  const tempDev = { channels };
  const span = footprintOfDmxDevice(tempDev);
  const startAddress = clamp(Math.round(Number(overrides.startAddress ?? overrides.address ?? spec.startAddress ?? spec.address ?? 1)), 1, Math.max(1, 513 - span));

  const dev = {
    id: overrides.id || spec.deviceId || `dmxdev_${num}`,
    schema: 'webmapper.dmx.device.v1',
    name: String(overrides.name || spec.name || `DMX Utility ${num}`),
    category: String(overrides.category || spec.category || 'utility'),
    enabled: overrides.enabled !== false && spec.enabled !== false,
    universe: clamp(Math.round(Number(overrides.universe ?? spec.universe ?? 1)), 0, 127),
    startAddress,
    linkProjector: Number.isFinite(Number(overrides.linkProjector ?? spec.linkProjector))
      ? clamp(Math.round(Number(overrides.linkProjector ?? spec.linkProjector)), 0, MAX_MULTI_PROJ_SCREENS)
      : 0,
    burstUntilMs: 0,
    channels
  };
  // World placement & photometrics (lights render in the 2D plan, 3D world and previz).
  const tplId = overrides.templateId || spec.templateId || spec.id;
  if (tplId) dev.templateId = String(tplId);
  const pos = overrides.posM || spec.posM;
  const aim = overrides.aimM || spec.aimM;
  if (Array.isArray(pos) && pos.length === 3) dev.posM = pos.map(n => Number(n) || 0);
  if (Array.isArray(aim) && aim.length === 3) dev.aimM = aim.map(n => Number(n) || 0);
  const beam = overrides.beamDeg ?? spec.beamDeg;
  if (Number.isFinite(Number(beam))) dev.beamDeg = clamp(Number(beam), 2, 90);
  const cd = overrides.candela ?? spec.candela;
  if (Number.isFinite(Number(cd))) dev.candela = clamp(Number(cd), 100, 500000);
  if (overrides.colorHex || spec.colorHex) dev.colorHex = String(overrides.colorHex || spec.colorHex);
  return dev;
}

function createDmxDeviceFromTemplate(templateId = 'dowser_1ch', overrides = {}) {
  const tpl = WMDEVICE_TEMPLATES[templateId] || WMDEVICE_TEMPLATES.dowser_1ch;
  // Auto-pick next non-colliding startAddress on target universe when startAddress not explicitly passed
  const targetUni = clamp(Math.round(Number(overrides.universe ?? 1)), 0, 127);
  const explicitAddr = overrides.startAddress ?? overrides.address;
  let nextAddr = 1;
  if (explicitAddr === undefined) {
    for (const existing of state.dmxDevices) {
      if (existing.universe === targetUni) {
        nextAddr = Math.max(nextAddr, existing.startAddress + footprintOfDmxDevice(existing));
      }
    }
    nextAddr = clamp(nextAddr, 1, 508);
  }
  const dev = createDmxDeviceFromSpec(tpl, { ...overrides, universe: targetUni, startAddress: explicitAddr ?? nextAddr });
  if (typeof ensureDmxDeviceWorldPose === 'function') {
    const sameKind = state.dmxDevices.filter(d => d && (typeof isDmxLightDevice === 'function' ? isDmxLightDevice(d) === isDmxLightDevice(dev) : true)).length;
    ensureDmxDeviceWorldPose(dev, sameKind);
  }
  state.dmxDevices.push(dev);
  state.selectedDmxDeviceId = dev.id;
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  syncRoomUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return dev;
}

function exportWmDeviceJson(deviceOrId) {
  const dev = (deviceOrId && typeof deviceOrId === 'object')
    ? deviceOrId
    : state.dmxDevices.find(d => d.id === deviceOrId);
  if (!dev) return null;
  return {
    wmdevice: '1.0',
    schema: 'webmapper.dmx.device.v1',
    name: dev.name,
    category: dev.category,
    universe: dev.universe,
    startAddress: dev.startAddress,
    linkProjector: dev.linkProjector || 0,
    channels: dev.channels.map(ch => ({
      offset: ch.offset,
      key: ch.key,
      label: ch.label,
      kind: ch.kind,
      home: ch.home,
      dbo: ch.dbo,
      offVal: ch.offVal,
      onVal: ch.onVal,
      ranges: ch.ranges
    }))
  };
}

function importWmDeviceJson(rawJsonOrObj, overrides = {}) {
  const parsed = typeof rawJsonOrObj === 'string' ? JSON.parse(rawJsonOrObj) : rawJsonOrObj;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.channels) || parsed.channels.length === 0) {
    throw new Error('Invalid .wmdevice.json: expected object with non-empty channels[] array.');
  }
  const dev = createDmxDeviceFromSpec(parsed, overrides);
  state.dmxDevices.push(dev);
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  syncRoomUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return dev;
}

function removeDmxDevice(deviceId) {
  const idx = state.dmxDevices.findIndex(d => d.id === deviceId);
  if (idx < 0) return false;
  state.dmxDevices.splice(idx, 1);
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  syncRoomUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return true;
}

function triggerHazerBurst(deviceId, durationSec = 5.0) {
  const dev = state.dmxDevices.find(d => d.id === deviceId);
  if (!dev) return false;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  dev.burstUntilMs = now + clamp(Number(durationSec) || 5.0, 0.5, 30.0) * 1000;
  if (typeof showToast === 'function') {
    showToast(`💨 ${dev.name}: ${durationSec.toFixed(0)}s Haze Burst engaged`);
  }
  syncRoomUI();
  return true;
}

function setDmxDeviceChannelValue(deviceId, chKey, value, layer = 'seat', opts = {}) {
  const dev = state.dmxDevices.find(d => d.id === deviceId);
  if (!dev) return false;
  const ch = dev.channels.find(c => c.key === chKey);
  if (!ch) return false;

  // Safety invariant: 'power' channels CANNOT be driven by modulators or cues, and require explicit World confirmation!
  if (ch.kind === 'power') {
    if (layer === 'mod' || layer === 'cue') return false;
    if (!opts.confirmedWorldHold) return false;
  }

  const byteVal = value === null || value === undefined ? null : clamp(Math.round(Number(value)), 0, 255);
  if (layer === 'park') {
    ch.parkedValue = byteVal;
  } else if (layer === 'seat') {
    ch.seatValue = byteVal;
    if (byteVal !== null) ch.liveValue = byteVal;
    if (state.room === 'live') {
      recordLiveCapturedTrim(`dmx:${dev.id}:${ch.key}`, `${dev.name} · ${ch.label}`, byteVal);
    }
  } else if (layer === 'cue') {
    ch.cueValue = byteVal;
    if (byteVal !== null && ch.seatValue === null) ch.liveValue = byteVal;
  } else if (layer === 'mod') {
    ch.modValue = byteVal;
  } else if (layer === 'home') {
    if (byteVal !== null) {
      ch.home = byteVal;
      ch.liveValue = byteVal;
    }
  }
  return true;
}

function resolveSingleDmxChannelByte(dev, ch, nowMs = 0) {
  // 1. PARK (highest priority — hardware technician override, ignores DBO & Cues)
  if (ch.parkedValue !== null && ch.parkedValue !== undefined) {
    return { byte: clamp(ch.parkedValue, 0, 255), owner: 'PARK' };
  }

  // Resolve base pre-DBO active byte from Seat > Cue > Modulator > Home
  let activeByte = clamp(ch.home ?? 0, 0, 255);
  let activeOwner = 'HOME';

  // Power channels ignore Modulator & Cue layers completely
  if (ch.kind !== 'power') {
    if (ch.modValue !== null && ch.modValue !== undefined) {
      activeByte = clamp(ch.modValue, 0, 255);
      activeOwner = 'MOD';
    }
    if (ch.cueValue !== null && ch.cueValue !== undefined) {
      activeByte = clamp(ch.cueValue, 0, 255);
      activeOwner = 'CUE';
    }
  }
  if (ch.seatValue !== null && ch.seatValue !== undefined) {
    activeByte = clamp(ch.seatValue, 0, 255);
    activeOwner = 'SEAT';
  }
  if (dev.burstUntilMs && nowMs > 0 && nowMs < dev.burstUntilMs && ch.kind === 'dimmer') {
    activeByte = 255;
    activeOwner = 'SEAT';
  }

  // 2. DBO (Two-Stage Blackout + Linked Projector Dowser)
  const dboEngaged = !!state.blackout && !(state.dboState && state.dboState.preOpened);
  let linkedProjClosed = false;
  if (dev.linkProjector > 0 && state.multiProjector && Array.isArray(state.multiProjector.screens)) {
    const scr = state.multiProjector.screens.find(s => s.index === dev.linkProjector);
    if (scr && scr.pjlink && scr.pjlink.shutterClosed) {
      linkedProjClosed = true;
    }
  }

  if (dboEngaged || linkedProjClosed) {
    if (dev.linkProjector > 0 && ch.key === 'shutter') {
      return { byte: clamp(ch.offVal ?? 0, 0, 255), owner: 'DBO' };
    }
    if (ch.dbo === 'zero') return { byte: 0, owner: 'DBO' };
    if (ch.dbo === 'home') return { byte: clamp(ch.home ?? 0, 0, 255), owner: 'DBO' };
    if (typeof ch.dbo === 'number' && Number.isFinite(ch.dbo)) {
      return { byte: clamp(Math.round(ch.dbo), 0, 255), owner: 'DBO' };
    }
    // ch.dbo === 'hold' falls through to preserve hazer/fan/power!
  }

  return { byte: activeByte, owner: activeOwner };
}

function evaluateDmxDevicesIntoUniverses(universesMap, nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
  if (!universesMap || !Array.isArray(state.dmxDevices) || state.dmxDevices.length === 0) return universesMap;
  for (const dev of state.dmxDevices) {
    if (!dev || dev.enabled === false || !Array.isArray(dev.channels)) continue;
    const uni = clamp(Math.round(Number(dev.universe) || 0), 0, 127);
    let dmx512 = universesMap.get(uni);
    if (!dmx512) {
      dmx512 = new Uint8Array(512);
      universesMap.set(uni, dmx512);
    }
    const baseAddr0 = clamp((Math.round(Number(dev.startAddress) || 1) - 1), 0, 511);
    if (dev.burstUntilMs && nowMs >= dev.burstUntilMs) {
      dev.burstUntilMs = 0;
    }
    for (const ch of dev.channels) {
      const slot = baseAddr0 + (Number(ch.offset) || 0);
      if (slot < 0 || slot >= 512) continue;
      const res = resolveSingleDmxChannelByte(dev, ch, nowMs);
      ch._resolvedByte = res.byte;
      ch._resolvedOwner = res.owner;
      dmx512[slot] = res.byte;
      if (ch.kind === '16bit' && slot + 1 < 512) {
        dmx512[slot + 1] = res.owner === 'DBO' && res.byte === 0 ? 0 : clamp(ch.fineValue ?? 0, 0, 255);
      }
    }
  }
  return universesMap;
}

function computeDmxPatchCollisions() {
  const slotOwners = new Map(); // `${uni}:${ch1Based}` -> string[]
  const collisions = [];
  const registerSpan = (uni, start1, count, label) => {
    for (let i = 0; i < count; i++) {
      const addr = start1 + i;
      if (addr < 1 || addr > 512) {
        collisions.push(`${label} overflows DMX 512 at Ch ${addr} (Uni ${uni})`);
        break;
      }
      const key = `${uni}:${addr}`;
      let list = slotOwners.get(key);
      if (!list) {
        list = [];
        slotOwners.set(key, list);
      }
      list.push(label);
    }
  };

  if (state.pixelMapper && Array.isArray(state.pixelMapper.fixtures)) {
    for (const fx of state.pixelMapper.fixtures) {
      if (!fx || fx.enabled === false) continue;
      const bpp = typeof getChannelsPerPixel === 'function' ? getChannelsPerPixel(fx.colorOrder || 'RGB') : 3;
      const count = Math.max(1, (Number(fx.pixelCount) || 1) * bpp);
      registerSpan(Number(fx.universe) || 0, Number(fx.startChannel) || 1, count, `LED ${fx.name}`);
    }
  }
  if (Array.isArray(state.dmxDevices)) {
    for (const dev of state.dmxDevices) {
      if (!dev || dev.enabled === false) continue;
      registerSpan(Number(dev.universe) || 0, Number(dev.startAddress) || 1, footprintOfDmxDevice(dev), `DMX ${dev.name}`);
    }
  }

  const pairSet = new Set();
  for (const [key, list] of slotOwners.entries()) {
    if (list.length > 1) {
      const [uni] = key.split(':');
      const sig = `Uni ${uni}: ${list.join(' ↔ ')}`;
      if (!pairSet.has(sig)) {
        pairSet.add(sig);
        collisions.push(sig);
      }
    }
  }
  return collisions;
}

// ============================================================================
// 4. PJLINK ETHERNET SHUTTER CONTROL & UNIFIED TWO-STAGE BLACKOUT (DBO)
// ============================================================================

let _pjlinkReqSeq = 1;
const _pendingPjLinkCallbacks = new Map();

function sendStudioPjLink(screenIndex, cmd, opts = {}) {
  ensureWorldRigSeeded();
  const mp = state.multiProjector;
  const scr = mp && Array.isArray(mp.screens) ? mp.screens.find(s => s.index === Number(screenIndex)) : null;
  if (!scr) return Promise.resolve({ ok: false, error: `Unknown projector screen ${screenIndex}` });
  const pj = ensureProjectorPjLinkMeta(scr);
  const ip = String(opts.ip ?? pj.ip ?? '').trim();
  if (!ip) return Promise.resolve({ ok: false, error: 'Projector IP not configured' });

  // Safety guard: POWR 0 (lamp/laser power off) is blocked outside 1 · BUILD or without explicit hold confirmation!
  const cleanCmd = String(cmd || '').trim().toUpperCase();
  if (cleanCmd === 'POWR 0' && (!isBuildRoom(state.room) || !opts.confirmPowerOff)) {
    return Promise.resolve({ ok: false, error: 'POWR 0 requires 1 · BUILD room + Hold-to-Confirm' });
  }

  const sock = typeof oscSocket !== 'undefined' ? oscSocket : null;
  if (!sock || sock.readyState !== 1) {
    return Promise.resolve({ ok: false, error: 'Local Bridge offline (run node scripts/osc-artnet-bridge.js)' });
  }

  const reqId = `pjl_${_pjlinkReqSeq++}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      _pendingPjLinkCallbacks.delete(reqId);
      resolve({ ok: false, error: 'PJLink bridge reply timeout' });
    }, 3200);

    _pendingPjLinkCallbacks.set(reqId, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });

    try {
      sock.send(JSON.stringify({
        type: 'pjlink_cmd',
        reqId,
        screenIndex: scr.index,
        host: ip,
        port: Number(opts.port ?? pj.port ?? 4352) || 4352,
        password: String(opts.password ?? pj.password ?? ''),
        cmd: cleanCmd,
        sourceRoom: state.room,
        confirmPowerOff: !!opts.confirmPowerOff
      }));
    } catch (err) {
      clearTimeout(timer);
      _pendingPjLinkCallbacks.delete(reqId);
      resolve({ ok: false, error: err.message || String(err) });
    }
  });
}

function handleBridgeAuxiliaryMessage(msg) {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'bridge_hello') {
    state.bridgeInfo.lan = !!msg.lan;
    state.bridgeInfo.padUrl = String(msg.padUrl || '');
    state.bridgeInfo.connectedPads = Number(msg.connectedPads) || 0;
    syncRoomUI();
    return true;
  }

  if (msg.type === 'pad_status') {
    state.bridgeInfo.connectedPads = Number(msg.connectedPads) || 0;
    syncRoomUI();
    return true;
  }

  if (msg.type === 'pad_event') {
    if (!Array.isArray(state.spots) || state.spots.length === 0) return true;
    const spotIdx = clamp(Math.round(Number(msg.spotIndex) || 0), 0, Math.max(0, state.spots.length - 1));
    const sp = state.spots[spotIdx];
    if (sp && sp.enabled === false && msg.kind !== 'mix_xy') return true;
    if (msg.kind === 'spot_xy' && sp) {
      // Blind Pre-Aim: NEVER auto-enable sp.mode when steering!
      sp.targetX = clamp(Number(msg.x) || 0.5, -0.15, 1.15);
      sp.targetY = clamp(Number(msg.y) || 0.5, -0.15, 1.15);
      sp._lastSeatTouchMs = Date.now();
    } else if (msg.kind === 'spot_gain' && sp) {
      sp.gain = clamp(Number(msg.value) || 0, 0, 3.0);
    } else if (msg.kind === 'spot_iris' && sp) {
      sp.radius = clamp(Number(msg.value) || 0.2, 0.03, 0.85);
    } else if (msg.kind === 'spot_beam' && sp) {
      sp.mode = msg.active ? (sp.mode === 'off' ? 'beam' : sp.mode) : 'off';
      syncRoomUI();
    } else if (msg.kind === 'mix_xy') {
      const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
      if (mixSrc && Array.isArray(mixSrc.orbs) && mixSrc.orbs[0]) {
        mixSrc.orbs[0].x = clamp((Number(msg.x) - 0.5) * 2.0, -1.15, 1.15);
        mixSrc.orbs[0].y = clamp((0.5 - Number(msg.y)) * 2.0, -1.15, 1.15);
      }
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    return true;
  }

  if (msg.type === 'pjlink_reply') {
    const scrIdx = Number(msg.screenIndex) || 1;
    const scr = state.multiProjector?.screens?.find(s => s.index === scrIdx);
    if (scr) {
      const pj = ensureProjectorPjLinkMeta(scr);
      pj.lastReply = msg.ok ? `${msg.cmd}=${msg.value || 'OK'}` : `ERR: ${msg.error || 'failed'}`;
      if (msg.ok) {
        if (msg.cmd === 'AVMT') {
          if (msg.value === '31' || msg.value === '11') pj.shutterClosed = true;
          else if (msg.value === '30' || msg.value === '10') pj.shutterClosed = false;
        } else if (msg.cmd === 'LAMP' && msg.value) {
          const hrs = parseInt(String(msg.value).split(/\s+/)[0], 10);
          if (Number.isFinite(hrs)) pj.lampHours = hrs;
        } else if (msg.cmd === 'ERST' && msg.value) {
          pj.errorCode = String(msg.value);
        } else if (msg.cmd === 'POWR' && msg.value && msg.value !== 'OK') {
          pj.powerState = String(msg.value);
        }
      }
    }
    const cb = msg.reqId ? _pendingPjLinkCallbacks.get(msg.reqId) : null;
    if (cb) {
      _pendingPjLinkCallbacks.delete(msg.reqId);
      cb(msg);
    }
    syncRoomUI();
    return true;
  }

  return false;
}

async function measureProjectorShutterLatency(screenIndex = 1) {
  ensureWorldRigSeeded();
  const scr = state.multiProjector?.screens?.find(s => s.index === Number(screenIndex));
  if (!scr) return null;
  const pj = ensureProjectorPjLinkMeta(scr);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const r1 = await sendStudioPjLink(screenIndex, 'AVMT 31');
  if (!r1 || !r1.ok) {
    if (typeof showToast === 'function') showToast(`⚠ PJLink P${screenIndex}: ${r1?.error || 'Failed'}`);
    return null;
  }
  pj.shutterClosed = true;
  const r2 = await sendStudioPjLink(screenIndex, 'AVMT 30');
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  pj.shutterClosed = false;
  if (r2 && r2.ok) {
    pj.measuredShutterMs = clamp(Math.round((t1 - t0) * 0.5 + 140), 80, 550);
    syncRoomUI();
    if (typeof showToast === 'function') {
      showToast(`📽 P${screenIndex} PJLink Shutter RTT calibrated: ${pj.measuredShutterMs}ms pre-open lead`);
    }
    return pj.measuredShutterMs;
  }
  return null;
}

function getMaxLinkedShutterLeadMs() {
  ensureWorldRigSeeded();
  let maxLead = 380;
  if (state.multiProjector && Array.isArray(state.multiProjector.screens)) {
    for (const scr of state.multiProjector.screens) {
      const pj = scr?.pjlink;
      if (pj && pj.enabled && pj.linkDbo && pj.ip) {
        maxLead = Math.max(maxLead, clamp(Number(pj.measuredShutterMs) || 380, 80, 520));
      }
    }
  }
  return clamp(maxLead, 80, 520);
}

function triggerPhysicalDboShutters(closeShutters) {
  ensureWorldRigSeeded();
  if (state.dboState && state.dboState.preOpenTimerId) {
    clearTimeout(state.dboState.preOpenTimerId);
    state.dboState.preOpenTimerId = null;
  }
  if (state.dboState) {
    state.dboState.preOpened = !closeShutters;
  }
  if (state.multiProjector && Array.isArray(state.multiProjector.screens)) {
    for (const scr of state.multiProjector.screens) {
      const pj = scr?.pjlink;
      if (pj && pj.enabled && pj.linkDbo && pj.ip) {
        pj.shutterClosed = !!closeShutters;
        sendStudioPjLink(scr.index, closeShutters ? 'AVMT 31' : 'AVMT 30');
      }
    }
  }
}

function schedulePreOpenDboShutters(holdDurationMs = 600) {
  ensureWorldRigSeeded();
  if (!state.dboState) state.dboState = { preOpened: false, preOpenTimerId: null };
  if (state.dboState.preOpenTimerId) {
    clearTimeout(state.dboState.preOpenTimerId);
    state.dboState.preOpenTimerId = null;
  }
  state.dboState.preOpened = false;
  const leadMs = getMaxLinkedShutterLeadMs();
  const fireDelayMs = Math.max(40, Math.round(holdDurationMs - leadMs));
  state.dboState.preOpenTimerId = setTimeout(() => {
    state.dboState.preOpenTimerId = null;
    if (!state.blackout) return;
    // Stage 1 of Restore: Open physical mechanical shutter & DMX dowser while WebGL output is still 0.0 black!
    state.dboState.preOpened = true;
    if (state.multiProjector && Array.isArray(state.multiProjector.screens)) {
      for (const scr of state.multiProjector.screens) {
        const pj = scr?.pjlink;
        if (pj && pj.enabled && pj.linkDbo && pj.ip) {
          pj.shutterClosed = false;
          sendStudioPjLink(scr.index, 'AVMT 30');
        }
      }
    }
  }, fireDelayMs);
}

function abortPreOpenDboShutters() {
  if (!state.dboState) return;
  if (state.dboState.preOpenTimerId) {
    clearTimeout(state.dboState.preOpenTimerId);
    state.dboState.preOpenTimerId = null;
  }
  if (state.dboState.preOpened && state.blackout) {
    // Operator released Hold-B early -> immediately re-close physical shutter while WebGL is still 0.0 black!
    state.dboState.preOpened = false;
    triggerPhysicalDboShutters(true);
  }
}

// Unified Show-Safe Blackout Entrypoint (Keyboard, Rail, MIDI, Gamepad, OSC, API)
function requestBlackout(targetOn, opts = {}) {
  const next = targetOn === 'toggle' ? !state.blackout : !!targetOn;
  if (next) {
    triggerPhysicalDboShutters(true);
    if (typeof setBlackoutImmediate === 'function') {
      setBlackoutImmediate(true, opts.silent ? null : '⬛ DBO BLACKOUT ENGAGED — Hold B (600ms) or Shift+B to restore Stage');
    } else {
      state.blackout = true;
    }
    return true;
  }

  // Restore path (Blackout -> Live)
  if (opts.instantRestore || opts.forceRestore) {
    triggerPhysicalDboShutters(false);
    if (typeof setBlackoutImmediate === 'function') {
      setBlackoutImmediate(false, opts.silent ? null : '✦ Stage Output Restored');
    } else {
      state.blackout = false;
    }
    return false;
  }

  // Trigger standard 600ms Hold-to-Restore if initiated from interactive button press
  if (opts.beginHold && typeof beginBlackoutPress === 'function') {
    beginBlackoutPress(false);
    return state.blackout;
  }

  // Non-hold remote toggle (e.g. stray Gamepad Circle tap while already in Blackout) stays safely in Blackout
  if (state.blackout && !opts.silent && typeof showToast === 'function') {
    showToast('⬛ DBO Protected — Hold B (0.6s) or Shift+B to restore live Stage');
  }
  return state.blackout;
}

// ============================================================================
// 5. EOS "IFCB" SPOT RECALL, MULTI-SPOT MANAGEMENT & CONTROLLER SEATS
// ============================================================================

function isSpotFocusOwnedByLiveSeat(spotIdx = 0) {
  const sp = state.spots && state.spots[spotIdx];
  if (!sp || sp.enabled === false) return false;
  if ((state.trackpadSpotTarget && sp.id === state.trackpadSpotTarget) || (spotIdx === (state.activeSpotIndex || 0) && state.pointerLocked)) {
    return true;
  }
  if (state.gamepad && state.gamepad.enabled && state.gamepad.connectedName) {
    if (state.gamepad.profile === 'solo_stage' && spotIdx === 0) return true;
    if (state.gamepad.profile === 'crew_spot' && spotIdx === (state.gamepad.spotIndex || 0)) return true;
  }
  if (sp._lastSeatTouchMs && (Date.now() - sp._lastSeatTouchMs) < 15000 && (state.room === 'live' || (state.bridgeInfo && state.bridgeInfo.connectedPads > 0))) {
    return true;
  }
  return false;
}

function cloneSpotData(sp, idx = 0) {
  const base = createSpotObject(idx, sp || {});
  return {
    ...base,
    worldTargetM: Array.isArray(sp?.worldTargetM) ? [...sp.worldTargetM] : [0, 1.4, 0]
  };
}

function applySpotSnapshotWithIFCB(liveSpot, snapSpot, spotIdx = 0, opts = {}) {
  if (!liveSpot || !snapSpot) return;
  const preserveFocus = !opts.forceFocus && isSpotFocusOwnedByLiveSeat(spotIdx);

  if (!preserveFocus) {
    liveSpot.targetX = snapSpot.spotX ?? snapSpot.targetX ?? liveSpot.targetX;
    liveSpot.targetY = snapSpot.spotY ?? snapSpot.targetY ?? liveSpot.targetY;
    if (opts.snapPositionImmediate) {
      liveSpot.spotX = liveSpot.targetX;
      liveSpot.spotY = liveSpot.targetY;
    }
    if (snapSpot.performerDepthM !== undefined) liveSpot.performerDepthM = snapSpot.performerDepthM;
    if (Array.isArray(snapSpot.worldTargetM)) liveSpot.worldTargetM = [...snapSpot.worldTargetM];
  }

  // Intensity / Color / Beam (IFCB) always recall cleanly from the Cue,
  // EXCEPT disabled spots stay disabled and never re-ignite!
  const ifcbKeys = [
    'mode', 'intensity', 'edge', 'contentSrc', 'mediaFit', 'fbmAmt',
    'goboSrc', 'goboSpin', 'goboAngleDeg', 'goboRotSpeed', 'goboAngle',
    'shutterL', 'shutterR', 'shutterT', 'shutterB',
    'shutterAngL', 'shutterAngR', 'shutterAngT', 'shutterAngB',
    'worldSpace', 'worldRadiusM',
    'radius', 'softness', 'gain', 'ambient', 'stretchX', 'stretchY',
    'rotation', 'morph', 'inertia', 'shadowDepth', 'shadowTex', 'shadowRnd', 'shadowSpeed',
    'colA', 'colB', 'colC', 'temp', 'converge3D', 'performerHeightM', 'performerRadiusM', 'maskBgSpill'
  ];
  for (const k of ifcbKeys) {
    if (k === 'mode' && liveSpot.enabled === false) continue;
    if (snapSpot[k] !== undefined) {
      liveSpot[k] = snapSpot[k];
    }
  }
}

function addSpotInstance(overrides = {}) {
  ensureWorldRigSeeded();
  if (state.spots.length >= 8) {
    if (typeof showToast === 'function') showToast('Maximum 8 simultaneous Optical Spots reached');
    return state.spots[state.spots.length - 1];
  }
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Add Spotlight');
  const idx = state.spots.length;
  const num = state.nextSpotNum || (idx + 1);
  state.nextSpotNum = num + 1;
  const sp = createSpotObject(idx, {
    id: overrides.id || `spot_${num}`,
    consoleNum: num,
    name: overrides.name || `Spot ${num}`,
    enabled: overrides.enabled !== false,
    mode: overrides.mode ?? 'beam',
    contentSrc: overrides.contentSrc ?? '__pure_light__',
    fbmAmt: overrides.fbmAmt ?? 0.0,
    spotX: clamp(0.32 + (idx % 4) * 0.14, 0.15, 0.85),
    targetX: clamp(0.32 + (idx % 4) * 0.14, 0.15, 0.85),
    spotY: 0.52,
    targetY: 0.52,
    ...overrides
  });
  state.spots.push(sp);
  state.activeSpotIndex = idx;
  state.followspot = state.spots[0] || state._detachedFallbackSpot;
  setActiveSelection('spot', sp.id, sp.name);
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  syncRoomUI();
  syncTrackpadSpotTargetUI();
  if (typeof syncFollowspotInspectorUI === 'function') syncFollowspotInspectorUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return sp;
}

function toggleSpotEnabled(spotIdOrIdx, forceVal = undefined) {
  ensureWorldRigSeeded();
  let idx = typeof spotIdOrIdx === 'number'
    ? spotIdOrIdx
    : state.spots.findIndex(s => s && s.id === spotIdOrIdx);
  if (idx < 0) idx = state.activeSpotIndex || 0;
  const sp = state.spots[idx];
  if (!sp) return false;
  sp.enabled = typeof forceVal === 'boolean' ? forceVal : (sp.enabled === false);
  if (!sp.enabled && state.trackpadSpotTarget === sp.id) {
    setTrackpadSpotTarget(null, { silent: true });
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  syncRoomUI();
  syncTrackpadSpotTargetUI();
  if (typeof syncFollowspotInspectorUI === 'function') syncFollowspotInspectorUI();
  if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') {
    showToast(sp.enabled ? `💡 ${sp.name} ENABLED` : `⬛ ${sp.name} DISABLED (Blacked Out)`);
  }
  return sp.enabled;
}

function removeSpotById(spotIdOrIdx = null) {
  ensureWorldRigSeeded();
  if (!Array.isArray(state.spots) || state.spots.length === 0) return false;
  let idx = -1;
  if (typeof spotIdOrIdx === 'number') {
    idx = spotIdOrIdx;
  } else if (typeof spotIdOrIdx === 'string' && spotIdOrIdx) {
    idx = state.spots.findIndex(s => s && s.id === spotIdOrIdx);
  } else {
    idx = clamp(state.activeSpotIndex || 0, 0, state.spots.length - 1);
  }
  if (idx < 0 || idx >= state.spots.length) return false;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Delete Spotlight');
  const removed = state.spots.splice(idx, 1)[0];
  state._spotsInitialized = true;
  if (state.spots.length === 0) {
    state.activeSpotIndex = 0;
    state.followspot = state._detachedFallbackSpot || createSpotObject(0);
    setTrackpadSpotTarget(null, { silent: true });
    if (state.activeSelection?.kind === 'spot') setActiveSelection(null, null, '');
  } else {
    state.activeSpotIndex = clamp(state.activeSpotIndex || 0, 0, state.spots.length - 1);
    state.followspot = state.spots[0];
    if (state.trackpadSpotTarget === removed.id) {
      setTrackpadSpotTarget(null, { silent: true });
    }
    if (state.activeSelection?.kind === 'spot' && state.activeSelection.id === removed.id) {
      const cur = state.spots[state.activeSpotIndex];
      if (cur) setActiveSelection('spot', cur.id, cur.name);
    }
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  syncRoomUI();
  syncTrackpadSpotTargetUI();
  if (typeof syncFollowspotInspectorUI === 'function') syncFollowspotInspectorUI();
  if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') showToast(`🗑 Deleted ${removed.name || 'Spotlight'}`);
  return true;
}

function setTrackpadSpotTarget(spotIdOrNull, opts = {}) {
  ensureWorldRigSeeded();
  let chosen = null;
  if (spotIdOrNull) {
    const idx = state.spots.findIndex(s => s && s.id === spotIdOrNull && s.enabled !== false);
    if (idx >= 0) {
      chosen = state.spots[idx];
      state.activeSpotIndex = idx;
    }
  }
  state.trackpadSpotTarget = chosen ? chosen.id : null;
  state.steerSpotMode = !!chosen;
  if (chosen && chosen.mode === 'off') {
    chosen.mode = 'beam';
  }
  if (chosen) {
    setActiveSelection('spot', chosen.id, chosen.name);
  }
  syncTrackpadSpotTargetUI();
  if (typeof syncStageModePill === 'function') syncStageModePill();
  if (typeof syncFollowspotInspectorUI === 'function') syncFollowspotInspectorUI();
  if (typeof renderLivePerformanceDockUI === 'function' && state.room === 'live') renderLivePerformanceDockUI();
  if (!opts.silent && typeof showToast === 'function') {
    showToast(chosen
      ? `🖱 Trackpad → ${chosen.name} (Press \` to cycle next spot, Esc for None)`
      : '🖱 Trackpad → None (Stage cursor free)');
  }
  return state.trackpadSpotTarget;
}

function cycleTrackpadSpotTarget(dir = 1, opts = {}) {
  ensureWorldRigSeeded();
  const enabledSpots = state.spots.filter(s => s && s.enabled !== false);
  const ring = [null, ...enabledSpots.map(s => s.id)];
  if (ring.length <= 1) {
    setTrackpadSpotTarget(null, { silent: true });
    if (!opts.silent && typeof showToast === 'function') {
      showToast(state.spots.length === 0 ? 'No Spotlights in show — click + Spot to add one' : 'All Spotlights are currently disabled');
    }
    return null;
  }
  const curIdx = Math.max(0, ring.indexOf(state.trackpadSpotTarget));
  const nextIdx = (curIdx + (dir >= 0 ? 1 : ring.length - 1)) % ring.length;
  return setTrackpadSpotTarget(ring[nextIdx], opts);
}

function syncTrackpadSpotTargetUI() {
  if (typeof document === 'undefined') return;
  const activeId = state.trackpadSpotTarget;
  const activeSp = activeId ? state.spots.find(s => s && s.id === activeId && s.enabled !== false) : null;
  const label = activeSp ? `🖱 ${activeSp.name}` : '🖱 Spot: Off';
  const bTop = document.getElementById('btn-steer-spot');
  if (bTop) {
    bTop.classList.toggle('active', !!activeSp);
    bTop.innerHTML = `${escapeHtml(label)} <span class="kbd">\`</span>`;
  }
  const bInsp = document.getElementById('btn-insp-steer-spot');
  if (bInsp) {
    bInsp.classList.toggle('active', !!activeSp);
    bInsp.textContent = activeSp ? `🖱 Trackpad: ${activeSp.name} (\`)` : '🖱 Cycle Trackpad Spot (`)';
  }
}

// ============================================================================
// 5B. UNIFIED CONTEXTUAL SELECTION & BACKSPACE / DELETE DISPATCHER
// ============================================================================

function setActiveSelection(kind, id = null, label = '', extra = null) {
  if (!kind) {
    state.activeSelection = { kind: null, id: null, label: '' };
  } else {
    state.activeSelection = {
      ...(extra && typeof extra === 'object' ? extra : {}),
      kind: String(kind),
      id: id !== undefined && id !== null ? String(id) : null,
      label: String(label || kind)
    };
  }
  syncSelectionDeletePillUI();
  return state.activeSelection;
}

function syncSelectionDeletePillUI() {
  if (typeof document === 'undefined') return;
  const pill = document.getElementById('selection-delete-pill');
  if (!pill) return;
  const sel = state.activeSelection;
  if (!sel || !sel.kind) {
    pill.hidden = true;
    return;
  }
  const icons = {
    world_screen: '🖥',
    projector: '📽',
    floorplan: '📐',
    spot: '🎯',
    mix_orb: '◎',
    cue: '🎬',
    keyframe: '◆',
    led_fixture: '🚥',
    dmx_device: '🔌',
    mask_vertex: '✂Pt',
    mask: '✂',
    surface_vertex: '⬡Pt',
    surface: '⬡'
  };
  const ic = icons[sel.kind] || '•';
  pill.hidden = false;
  pill.textContent = `⌫ ${ic} ${sel.label}`;
  pill.title = `Selected: ${sel.label} (${sel.kind}) — Click or press Backspace/Delete to remove`;
}

function deleteActiveSelection() {
  if (state.showLock) {
    if (typeof showToast === 'function') showToast('🔒 Show Lock active — press Shift+P to unlock before deleting');
    return false;
  }
  let sel = state.activeSelection && state.activeSelection.kind ? state.activeSelection : null;

  // Smart fallback if no explicit selection has been recorded yet
  if (!sel) {
    if (state.selectedKeyframe && typeof deleteSelectedKeyframe === 'function') {
      return !!deleteSelectedKeyframe();
    }
    if (isBuildRoom()) {
      if (state.rigSelectedKind === 'world_screen' && state.selectedWorldScreenId) {
        sel = { kind: 'world_screen', id: state.selectedWorldScreenId };
      } else if (state.rigSelectedKind === 'projector') {
        sel = { kind: 'projector', id: String(state.multiProjector?.selectedScreenIndex || 1) };
      } else if (state.rigSelectedKind === 'floorplan') {
        sel = { kind: 'floorplan', id: 'floorplan' };
      } else if (state.rigSelectedKind === 'dmx' && state.pixelMapper?.selectedFixtureId) {
        sel = { kind: 'led_fixture', id: state.pixelMapper.selectedFixtureId };
      } else if (state.rigSelectedKind === 'world_prop' && state.selectedWorldPropId) {
        sel = { kind: 'world_prop', id: state.selectedWorldPropId };
      } else if (state.rigSelectedKind === 'venue_part' && state.selectedVenuePartId) {
        sel = { kind: 'venue_part', id: state.selectedVenuePartId };
      } else if (state.rigSelectedKind === 'dmx_device' && state.selectedDmxDeviceId) {
        sel = { kind: 'dmx_device', id: state.selectedDmxDeviceId };
      }
    }
    if (!sel && state.selectedSurfaceId) {
      sel = { kind: 'surface', id: state.selectedSurfaceId };
    }
  }
  if (!sel) return false;

  switch (sel.kind) {
    case 'keyframe':
      if (state.selectedKeyframe && typeof deleteSelectedKeyframe === 'function') {
        deleteSelectedKeyframe();
        setActiveSelection(null, null, '');
        return true;
      }
      return false;

    case 'world_screen':
      return removeWorldScreen(sel.id);

    case 'projector': {
      const pIdx = Number(sel.id) || state.multiProjector?.selectedScreenIndex || 1;
      if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Delete Projector');
      const ok = typeof removeProjectorScreen === 'function' ? removeProjectorScreen(pIdx, { allowZero: true }) : false;
      if (ok) {
        const nextScr = state.multiProjector?.screens?.[0];
        if (nextScr) setActiveSelection('projector', String(nextScr.index), nextScr.name);
        else setActiveSelection(null, null, '');
        if (typeof showToast === 'function') showToast(`🗑 Deleted Projector P${pIdx}`);
      }
      return ok;
    }

    case 'floorplan':
      return clearFloorplan();

    case 'spot':
      return removeSpotById(sel.id);

    case 'mix_orb':
      if (typeof deleteSelectedMixOrb === 'function') {
        return deleteSelectedMixOrb(sel.id);
      }
      return false;

    case 'cue':
      if (typeof deleteCueById === 'function') {
        return deleteCueById(sel.id || state.selectedCueId);
      }
      return false;

    case 'led_fixture': {
      const fixtures = state.pixelMapper?.fixtures;
      if (!Array.isArray(fixtures) || fixtures.length === 0) return false;
      const pos = fixtures.findIndex(f => f.id === sel.id);
      if (pos < 0) return false;
      if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Delete LED Fixture');
      const rm = fixtures.splice(pos, 1)[0];
      state.pixelMapper.selectedFixtureId = fixtures[0]?.id || null;
      setActiveSelection(fixtures[0] ? 'led_fixture' : null, fixtures[0]?.id || null, fixtures[0]?.name || '');
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      syncRoomUI();
      if (typeof syncRigWorkspaceUI === 'function') syncRigWorkspaceUI();
      if (typeof syncPixelMapperUI === 'function') syncPixelMapperUI();
      if (typeof scheduleAutosave === 'function') scheduleAutosave();
      if (typeof showToast === 'function') showToast(`🗑 Deleted LED Fixture "${rm.name}"`);
      return true;
    }

    case 'dmx_device': {
      if (!sel.id) return false;
      if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Delete DMX Device');
      const ok = removeDmxDevice(sel.id);
      if (ok) {
        setActiveSelection(null, null, '');
        if (state.selectedDmxDeviceId === sel.id) state.selectedDmxDeviceId = null;
        if (state.rigSelectedKind === 'dmx_device') state.rigSelectedKind = 'none';
      }
      return ok;
    }

    case 'venue_part': {
      if (!sel.id || typeof removeVenuePart !== 'function') return false;
      const ok = removeVenuePart(sel.id);
      if (ok) {
        setActiveSelection(null, null, '');
        if (typeof showToast === 'function') showToast('🗑 Deleted venue part');
      }
      return ok;
    }

    case 'world_prop': {
      if (!sel.id || typeof removeWorldProp !== 'function') return false;
      const ok = removeWorldProp(sel.id);
      if (ok) {
        setActiveSelection(null, null, '');
        if (typeof showToast === 'function') showToast('🗑 Deleted figure');
      }
      return ok;
    }

    case 'mask_vertex': {
      const m = state.masks?.find(x => x.id === sel.id) || (typeof getSelectedMask === 'function' ? getSelectedMask() : null);
      const ptIdx = Number.isInteger(sel.ptIdx) ? sel.ptIdx : (state.selectedVertex?.kind === 'mask-pt' ? state.selectedVertex.idx : -1);
      if (m && !m.locked && Array.isArray(m.points) && m.points.length > 3 && ptIdx >= 0 && ptIdx < m.points.length) {
        if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Delete Mask Vertex');
        m.points.splice(ptIdx, 1);
        if (Array.isArray(m.curveFlags)) m.curveFlags.splice(ptIdx, 1);
        state.selectedVertex = null;
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        setActiveSelection('mask', m.id, m.name);
        if (typeof renderMaskList === 'function') renderMaskList();
        if (typeof syncMaskInspectorUI === 'function') syncMaskInspectorUI();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
        if (typeof showToast === 'function') showToast(`Removed Mask Vertex M${ptIdx + 1}`);
        return true;
      }
      document.getElementById('btn-del-mask')?.click();
      return true;
    }

    case 'mask': {
      const btnM = document.getElementById('btn-del-mask');
      if (btnM) {
        btnM.click();
        return true;
      }
      return false;
    }

    case 'surface_vertex': {
      const s = state.surfaces?.find(x => x.id === sel.id) || (typeof getSelectedSurface === 'function' ? getSelectedSurface() : null);
      const ptIdx = Number.isInteger(sel.ptIdx) ? sel.ptIdx : (state.selectedVertex?.kind === 'surf-corner' ? state.selectedVertex.idx : -1);
      const minV = s?.type === 'line' ? 2 : 3;
      if (s && (s.type === 'polygon' || s.type === 'line') && !getEffectiveSurfaceProps(s).locked && Array.isArray(s.points) && s.points.length > minV && ptIdx >= 0 && ptIdx < s.points.length) {
        if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Delete Surface Vertex');
        s.points.splice(ptIdx, 1);
        if (s.type === 'polygon' && Array.isArray(s.polyUvs)) s.polyUvs.splice(ptIdx, 1);
        state.selectedVertex = null;
        if (typeof bumpSurfaceGeom === 'function') bumpSurfaceGeom(s);
        setActiveSelection('surface', s.id, s.name);
        if (typeof syncInspectorUI === 'function') syncInspectorUI();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
        if (typeof showToast === 'function') showToast(`Removed Vertex V${ptIdx + 1} (${s.points.length} pts)`);
        return true;
      }
      document.getElementById('btn-del-surf')?.click();
      return true;
    }

    case 'surface':
    default: {
      const btnS = document.getElementById('btn-del-surf');
      if (btnS) {
        btnS.click();
        const nextSurf = typeof getSelectedSurface === 'function' ? getSelectedSurface() : null;
        setActiveSelection(nextSurf ? 'surface' : null, nextSurf?.id || null, nextSurf?.name || '');
        return true;
      }
      return false;
    }
  }
}

function setGamepadSeatProfile(profile) {
  if (!state.gamepad) return;
  state.gamepad.profile = profile === 'crew_spot' ? 'crew_spot' : 'solo_stage';
  if (state.gamepad.profile === 'crew_spot' && state.spots.length > 1 && state.gamepad.spotIndex === 0) {
    state.gamepad.spotIndex = 0;
  }
  syncRoomUI();
  if (typeof showToast === 'function') {
    showToast(state.gamepad.profile === 'solo_stage'
      ? '🎮 Seat: SOLO STAGE — L-Stick=Spot 1 · R-Stick=◎ Orbital Mix · Hold L1+R1=GO'
      : `🎮 Seat: CREW SPOT-OP — Gamepad dedicated to Spot ${(state.gamepad.spotIndex || 0) + 1}`);
  }
}

function openOperatorMonitorWindow() {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('role', 'monitor');
    u.searchParams.delete('projector');
    const win = window.open(u.toString(), 'webmapper_operator_monitor', 'popup=yes,width=1120,height=680');
    if (win && typeof showToast === 'function') {
      showToast('🖥 Opened Operator Preview Monitor (?role=monitor) with Blind Pre-Aim reticles');
    }
    return win;
  } catch (_) {
    return null;
  }
}

// ============================================================================
// 6. DOM RENDERING FOR 1 · BUILD, 2 · MAP, 3 · LIVE & OUTPUT FEED TABS
// ============================================================================

function syncOutputFeedTabsUI() {
  if (typeof document === 'undefined') return;
  const wrap = document.getElementById('stage-feed-tabs');
  if (!wrap) return;
  ensureWorldRigSeeded();
  const mp = state.multiProjector;
  const screens = (mp && Array.isArray(mp.screens) && mp.screens.length > 0) ? mp.screens : [];

  let html = '';
  if (isBuildRoom()) {
    const bm = state.buildViewMode || 'split';
    html += `<button type="button" class="feed-tab-btn${bm === 'split' ? ' active' : ''}" role="tab" aria-selected="${bm === 'split'}" data-bview="split" title="World view beside the stage output (the world pane's view bar picks Plan, 3D, Walk, POV or a side)">Split</button>`;
  }
  const isStage = isBuildRoom()
    ? (state.buildViewMode === 'warp' && state.outputFeedTab === 'stage')
    : (state.outputFeedTab === 'stage');
  html += `<button type="button" class="feed-tab-btn${isStage ? ' active' : ''}" role="tab" aria-selected="${isStage}" data-feed="stage" title="Canonical Composited Stage Output">Stage</button>`;
  if (!isBuildRoom()) {
    const isVenue = state.outputFeedTab === 'venue3d';
    html += `<button type="button" class="feed-tab-btn venue-tab${isVenue ? ' active' : ''}" role="tab" aria-selected="${isVenue}" data-feed="venue3d" title="Walk through the venue: every projector's real output, people, lights &amp; haze in 3D">3D Venue</button>`;
  }

  const showProjTabs = mp && (mp.enabled || screens.length > 1 || isBuildRoom());
  if (showProjTabs) {
    for (const scr of screens.slice(0, 8)) {
      const fid = `p${scr.index}`;
      const active = state.outputFeedTab === fid && (!isBuildRoom() || state.buildViewMode === 'warp');
      const shut = scr.pjlink?.shutterClosed ? ' ⬛' : '';
      html += `<button type="button" class="feed-tab-btn${active ? ' active' : ''}" role="tab" aria-selected="${active}" data-feed="${fid}" title="Preview Projector P${scr.index} (${escapeHtml(scr.name || '')}) with optical blend & keystone">P${scr.index}${shut}</button>`;
    }
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('.feed-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.bview) {
        setBuildViewMode(btn.dataset.bview);
      } else {
        setOutputFeedTab(btn.dataset.feed);
      }
    });
  });
}

function syncCapturedTrimsTrayUI() {
  if (typeof document === 'undefined') return;
  const tray = document.getElementById('live-captured-tray');
  const countEl = document.getElementById('live-captured-count');
  if (!tray) return;
  const entries = Object.values(state.capturedTrims || {});
  tray.hidden = entries.length === 0;
  if (countEl) {
    countEl.textContent = `${entries.length} CAPTURED`;
  }
}

function buildSpotSourceOptionsHtml(selectedVal, forGobo = false) {
  let html = '';
  if (forGobo) {
    html += `<option value=""${!selectedVal ? ' selected' : ''}>— Open Gate (No Gobo) —</option>`;
  } else {
    html += `<option value="__pure_light__"${selectedVal === '__pure_light__' ? ' selected' : ''}>💡 Pure Beam of Light (Kelvin / Gel)</option>`;
    html += `<option value="__nebula__"${selectedVal === '__nebula__' ? ' selected' : ''}>☁ Cosmic Cloud Nebula (fBm)</option>`;
    html += `<option value="bus:orbital"${selectedVal === 'bus:orbital' ? ' selected' : ''}>◎ Orbital Live Mix Bus (bus:orbital)</option>`;
  }
  for (const src of state.sources) {
    if (src.id === 'src_mixbus' && !forGobo) continue;
    const sel = selectedVal === src.id ? ' selected' : '';
    html += `<option value="${escapeHtml(src.id)}"${sel}>🎬 ${escapeHtml(src.name)}</option>`;
  }
  return html;
}

function renderWorldEntityInspectorUI() {
  if (typeof document === 'undefined') return;
  const host = document.getElementById('world-entity-inspector');
  if (!host) return;
  ensureWorldRigSeeded();

  const kind = state.rigSelectedKind || 'world_screen';
  if (kind === 'none') {
    const nScr = (state.worldScreens || []).length;
    const nProj = (state.multiProjector?.screens || []).length;
    host.innerHTML = `
      <div class="world-card-head"><strong>Nothing selected</strong></div>
      <div class="mono-dim" style="margin-top:4px;line-height:1.5;">
        ${nScr} screen${nScr === 1 ? '' : 's'} · ${nProj} projector${nProj === 1 ? '' : 's'} in the world.<br>
        Click an object on the plan or in the outliner to edit it.<br>
        Drag empty floor to pan · scroll to zoom · double-click to frame all.
      </div>`;
    return;
  }
  if (kind === 'venue_part' && typeof renderVenuePartInspector === 'function') {
    renderVenuePartInspector(host);
    return;
  }
  if (kind === 'world_prop') {
    const prop = typeof getWorldPropById === 'function' ? getWorldPropById(state.selectedWorldPropId) : null;
    if (!prop) {
      host.innerHTML = `<div class="mono-dim">No figure selected — click <strong>+Human</strong> to add one.</div>`;
      return;
    }
    const followers = (state.spots || []).filter(sp => sp && sp.followPropId === prop.id).map(sp => sp.name || 'Spot');
    const spotOpts = (state.spots || []).map((sp, i) => `<option value="${escapeHtml(sp.id)}">${escapeHtml(sp.name || `Spot ${i + 1}`)}</option>`).join('');
    host.innerHTML = `
      <div class="world-card-head">
        <strong>🧍 ${escapeHtml(prop.name)}</strong>
        <div style="display:flex;gap:4px;">
          <label class="chk-pill"><input type="checkbox" id="we-prop-en" ${prop.enabled !== false ? 'checked' : ''}> On</label>
          <button type="button" class="btn danger" id="we-prop-del" title="Delete figure">🗑 Delete</button>
        </div>
      </div>
      <label class="mini-field" style="margin-top:4px;"><span>Name</span><input type="text" class="text-in" id="we-prop-name" value="${escapeHtml(prop.name)}"></label>
      <div class="world-card-grid3" style="margin-top:4px;">
        <label class="mini-field"><span>Pos X (m)</span><input type="number" step="0.1" class="num-in" id="we-prop-x" value="${prop.posM[0].toFixed(2)}"></label>
        <label class="mini-field"><span>Stands at (m)</span><input type="number" class="num-in" value="${prop.posM[1].toFixed(2)}" disabled title="Feet snap to the deck or floor"></label>
        <label class="mini-field"><span>Pos Z (m)</span><input type="number" step="0.1" class="num-in" id="we-prop-z" value="${prop.posM[2].toFixed(2)}"></label>
      </div>
      <div class="world-card-grid3" style="margin-top:4px;">
        <label class="mini-field"><span>Height (m)</span><input type="number" min="0.4" max="3" step="0.05" class="num-in" id="we-prop-h" value="${(prop.heightM || 1.75).toFixed(2)}"></label>
        <label class="mini-field"><span>Facing (°)</span><input type="number" min="-180" max="180" step="5" class="num-in" id="we-prop-yaw" value="${(prop.yawDeg || 0).toFixed(0)}"></label>
        <label class="chk-pill" style="align-self:end;"><input type="checkbox" id="we-prop-arms" ${prop.armsUp ? 'checked' : ''}> Arms up</label>
      </div>
      <div style="display:flex;gap:4px;margin-top:6px;align-items:center;">
        <select id="we-prop-spot" class="studio-select" style="flex:1;min-width:0;" aria-label="Spot to attach">${spotOpts || '<option value="">No spots</option>'}</select>
        <button type="button" class="btn warm" id="we-prop-follow" ${spotOpts ? '' : 'disabled'} title="Every projector routed to this spot converges its beam on this figure">🎯 Spot follows</button>
      </div>
      <div class="mono-dim" style="margin-top:4px;line-height:1.45;">${followers.length ? `Followed by: ${escapeHtml(followers.join(', '))}` : 'Drag in the 2D plan or use the gizmo in 3D. Casts real shadows in the 3D venue.'}</div>
    `;
    const commitProp = () => {
      if (typeof markStagePlanDirty === 'function') markStagePlanDirty();
      if (typeof commitRigPhysicalChange === 'function') commitRigPhysicalChange();
      renderWorldDocksUI();
    };
    host.querySelector('#we-prop-en')?.addEventListener('change', (e) => { prop.enabled = e.target.checked; commitProp(); });
    host.querySelector('#we-prop-del')?.addEventListener('click', () => { setActiveSelection('world_prop', prop.id, prop.name); deleteActiveSelection(); renderWorldDocksUI(); });
    host.querySelector('#we-prop-name')?.addEventListener('change', (e) => { prop.name = String(e.target.value || prop.name).slice(0, 48); commitProp(); });
    const moveXZ = () => {
      const x = parseFloat(host.querySelector('#we-prop-x').value), z = parseFloat(host.querySelector('#we-prop-z').value);
      if (Number.isFinite(x) && Number.isFinite(z)) moveWorldPropTo(prop, clamp(x, -40, 40), clamp(z, -40, 40));
      commitProp();
    };
    host.querySelector('#we-prop-x')?.addEventListener('change', moveXZ);
    host.querySelector('#we-prop-z')?.addEventListener('change', moveXZ);
    host.querySelector('#we-prop-h')?.addEventListener('change', (e) => { prop.heightM = clamp(parseFloat(e.target.value) || 1.75, 0.4, 3); commitProp(); });
    host.querySelector('#we-prop-yaw')?.addEventListener('change', (e) => { prop.yawDeg = clamp(parseFloat(e.target.value) || 0, -180, 180); commitProp(); });
    host.querySelector('#we-prop-arms')?.addEventListener('change', (e) => { prop.armsUp = e.target.checked; commitProp(); });
    host.querySelector('#we-prop-follow')?.addEventListener('click', () => {
      const sid = host.querySelector('#we-prop-spot')?.value;
      const sp = (state.spots || []).find(x => x && x.id === sid);
      if (!sp) return;
      if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Spot Follows Figure');
      sp.followPropId = prop.id;
      sp.converge3D = true;
      if (typeof showToast === 'function') showToast(`🎯 ${sp.name || 'Spot'} now follows ${prop.name} — every routed projector converges on it`);
      commitProp();
      if (typeof renderLivePerformanceDockUI === 'function') renderLivePerformanceDockUI();
    });
    return;
  }

  if (kind === 'dmx_device') {
    const dev = (state.dmxDevices || []).find(d => d && d.id === state.selectedDmxDeviceId);
    if (!dev) {
      host.innerHTML = `<div class="mono-dim">No DMX device selected — pick one in the outliner or click <strong>+DMX</strong>.</div>`;
      return;
    }
    if (typeof ensureDmxDeviceWorldPose === 'function') ensureDmxDeviceWorldPose(dev);
    const isLight = typeof isDmxLightDevice === 'function' && isDmxLightDevice(dev);
    const out = isLight && typeof getDmxLightOutput === 'function' ? getDmxLightOutput(dev) : null;
    const dimCh = (dev.channels || []).find(c => c.key === 'dimmer' || c.key === 'haze');
    const f2 = (n) => (Number(n) || 0).toFixed(2);
    host.innerHTML = `
      <div class="world-card-head">
        <strong>${isLight ? '💡' : (dev.category === 'atmosphere' ? '🌫' : '🔌')} ${escapeHtml(dev.name)}</strong>
        <div style="display:flex;gap:4px;">
          <label class="chk-pill"><input type="checkbox" id="we-dev-en" ${dev.enabled !== false ? 'checked' : ''}> On</label>
          <button type="button" class="btn danger" id="we-dev-del" title="Delete DMX device">🗑 Delete</button>
        </div>
      </div>
      <div class="mono-dim" style="margin-top:2px;">U${dev.universe} · ch ${dev.startAddress}–${dev.startAddress + footprintOfDmxDevice(dev) - 1}${out ? ` · output ${Math.round(out.intensity * 100)}% · ${out.beamDeg.toFixed(0)}° beam` : ''}</div>
      <div class="world-card-grid3" style="margin-top:4px;">
        <label class="mini-field"><span>Pos X (m)</span><input type="number" step="0.1" class="num-in" data-dv="posM" data-ax="0" value="${f2(dev.posM[0])}"></label>
        <label class="mini-field"><span>Pos Y (m)</span><input type="number" step="0.1" class="num-in" data-dv="posM" data-ax="1" value="${f2(dev.posM[1])}"></label>
        <label class="mini-field"><span>Pos Z (m)</span><input type="number" step="0.1" class="num-in" data-dv="posM" data-ax="2" value="${f2(dev.posM[2])}"></label>
      </div>
      ${isLight ? `
      <div class="world-card-grid3" style="margin-top:4px;">
        <label class="mini-field"><span>Aim X</span><input type="number" step="0.1" class="num-in" data-dv="aimM" data-ax="0" value="${f2(dev.aimM[0])}"></label>
        <label class="mini-field"><span>Aim Y</span><input type="number" step="0.1" class="num-in" data-dv="aimM" data-ax="1" value="${f2(dev.aimM[1])}"></label>
        <label class="mini-field"><span>Aim Z</span><input type="number" step="0.1" class="num-in" data-dv="aimM" data-ax="2" value="${f2(dev.aimM[2])}"></label>
      </div>
      <div class="world-card-grid" style="margin-top:4px;">
        <label class="mini-field"><span>Beam (°)</span><input type="number" min="2" max="90" step="1" class="num-in" id="we-dev-beam" value="${(Number(dev.beamDeg) || 25).toFixed(0)}"></label>
        <button type="button" class="btn" id="we-dev-aimperf" style="align-self:end;" title="Point this light at the first figure on stage">🎯 Aim at performer</button>
      </div>` : ''}
      ${dimCh ? `<label class="mini-field" style="margin-top:6px;"><span>${escapeHtml(dimCh.label || 'Level')} (test)</span><input type="range" min="0" max="255" step="1" id="we-dev-level" value="${resolveSingleDmxChannelByte(dev, dimCh, performance.now()).byte}"></label>` : ''}
      <div class="mono-dim" style="margin-top:4px;line-height:1.45;">Drag it in the 2D plan, or select it in 3D and use the gizmo. Full channel faders are in the DMX patch card below.</div>
    `;
    const commitDev = () => {
      if (typeof markStagePlanDirty === 'function') markStagePlanDirty();
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      if (typeof scheduleAutosave === 'function') scheduleAutosave();
      if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
    };
    host.querySelector('#we-dev-en')?.addEventListener('change', (e) => { dev.enabled = e.target.checked; commitDev(); renderWorldDocksUI(); });
    host.querySelector('#we-dev-del')?.addEventListener('click', () => { setActiveSelection('dmx_device', dev.id, dev.name); deleteActiveSelection(); renderWorldDocksUI(); });
    host.querySelectorAll('[data-dv]').forEach(inp => inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!Number.isFinite(v)) return;
      dev[inp.dataset.dv][Number(inp.dataset.ax)] = clamp(v, -60, 60);
      commitDev();
    }));
    host.querySelector('#we-dev-beam')?.addEventListener('change', (e) => { dev.beamDeg = clamp(parseFloat(e.target.value) || 25, 2, 90); commitDev(); });
    host.querySelector('#we-dev-aimperf')?.addEventListener('click', () => {
      const prop = (state.worldProps || []).find(p => p && p.enabled !== false);
      if (!prop) { if (typeof showToast === 'function') showToast('Add a figure with +Human first'); return; }
      if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Aim Light at Performer');
      dev.aimM = [prop.posM[0], prop.posM[1] + (prop.heightM || 1.75) * 0.6, prop.posM[2]];
      commitDev();
      renderWorldDocksUI();
    });
    host.querySelector('#we-dev-level')?.addEventListener('input', (e) => {
      if (!dimCh) return;
      setDmxDeviceChannelValue(dev.id, dimCh.key, parseInt(e.target.value, 10) || 0, 'seat');
      commitDev();
    });
    return;
  }

  if (kind === 'world_screen') {
    const ws = getSelectedWorldScreen();
    if (!ws) {
      host.innerHTML = `<div class="mono-dim">No physical screens in world — click <strong>+ Screen</strong> to add one.</div>`;
      return;
    }
    host.innerHTML = `
      <div class="world-card-head">
        <strong>🖥 ${escapeHtml(ws.name)}</strong>
        <div style="display:flex;gap:4px;">
          <label class="chk-pill"><input type="checkbox" id="we-ws-en" ${ws.enabled !== false ? 'checked' : ''}> On</label>
          <button type="button" class="btn danger" id="we-ws-del" title="Delete Physical Screen">🗑 Delete</button>
        </div>
      </div>
      <label class="mini-field" style="margin-top:4px;"><span>Name</span><input type="text" class="text-in" id="we-ws-name" value="${escapeHtml(ws.name)}"></label>
      <div class="world-card-grid3" style="margin-top:4px;">
        <label class="mini-field"><span>Pos X (m)</span><input type="number" step="0.1" class="num-in" id="we-ws-x" value="${ws.posM[0].toFixed(2)}"></label>
        <label class="mini-field"><span>Pos Y (m)</span><input type="number" step="0.1" class="num-in" id="we-ws-y" value="${ws.posM[1].toFixed(2)}"></label>
        <label class="mini-field"><span>Pos Z (m)</span><input type="number" step="0.1" class="num-in" id="we-ws-z" value="${ws.posM[2].toFixed(2)}"></label>
      </div>
      <div class="world-card-grid" style="margin-top:4px;">
        <label class="mini-field"><span>Width (m)</span><input type="number" min="0.25" max="80" step="0.1" class="num-in" id="we-ws-w" value="${ws.widthM.toFixed(2)}"></label>
        <label class="mini-field"><span>Height (m)</span><input type="number" min="0.25" max="40" step="0.1" class="num-in" id="we-ws-h" value="${ws.heightM.toFixed(2)}"></label>
      </div>
      <div class="world-card-grid" style="margin-top:4px;">
        <label class="mini-field"><span>Yaw (°)</span><input type="number" min="-180" max="180" step="1" class="num-in" id="we-ws-yaw" value="${(ws.yawDeg || 0).toFixed(0)}"></label>
        <label class="mini-field"><span>Tilt (°)</span><input type="number" min="-89" max="89" step="1" class="num-in" id="we-ws-pitch" value="${(ws.pitchDeg || 0).toFixed(0)}"></label>
      </div>
    `;
    const commitWs = () => {
      syncPrimaryVenueFromWorldScreens();
      if (typeof commitRigPhysicalChange === 'function') commitRigPhysicalChange();
      renderWorldDocksUI();
    };
    host.querySelector('#we-ws-en')?.addEventListener('change', e => { ws.enabled = e.target.checked; commitWs(); });
    host.querySelector('#we-ws-del')?.addEventListener('click', () => removeWorldScreen(ws.id));
    host.querySelector('#we-ws-name')?.addEventListener('change', e => { ws.name = e.target.value.trim() || ws.name; setActiveSelection('world_screen', ws.id, ws.name); commitWs(); });
    host.querySelector('#we-ws-x')?.addEventListener('change', e => { ws.posM[0] = clamp(parseFloat(e.target.value) || 0, -50, 50); commitWs(); });
    host.querySelector('#we-ws-y')?.addEventListener('change', e => { ws.posM[1] = clamp(parseFloat(e.target.value) || 0, -10, 30); commitWs(); });
    host.querySelector('#we-ws-z')?.addEventListener('change', e => { ws.posM[2] = clamp(parseFloat(e.target.value) || 0, -50, 50); commitWs(); });
    host.querySelector('#we-ws-w')?.addEventListener('change', e => { ws.widthM = clamp(parseFloat(e.target.value) || 1, 0.25, 80); commitWs(); });
    host.querySelector('#we-ws-h')?.addEventListener('change', e => { ws.heightM = clamp(parseFloat(e.target.value) || 1, 0.25, 40); commitWs(); });
    host.querySelector('#we-ws-yaw')?.addEventListener('change', e => { ws.yawDeg = clamp(parseFloat(e.target.value) || 0, -180, 180); commitWs(); });
    host.querySelector('#we-ws-pitch')?.addEventListener('change', e => { ws.pitchDeg = clamp(parseFloat(e.target.value) || 0, -89, 89); commitWs(); });
    return;
  }

  if (kind === 'projector') {
    const scr = typeof getSelectedProjectorScreen === 'function' ? getSelectedProjectorScreen() : null;
    if (!scr) {
      host.innerHTML = `<div class="mono-dim">No projectors in world — click <strong>+ Proj</strong> to add one.</div>`;
      return;
    }
    if (typeof ensureProjectorPose3D === 'function') ensureProjectorPose3D(scr, state.multiProjector?.screens?.length || 1);
    if (typeof syncProjectorAnglesFromAim === 'function' && scr.yawDeg === undefined) syncProjectorAnglesFromAim(scr);
    host.innerHTML = `
      <div class="world-card-head">
        <strong>📽 P${scr.index} · ${escapeHtml(scr.name || '')}</strong>
        <button type="button" class="btn danger" id="we-pr-del" title="Delete Projector">🗑 Delete</button>
      </div>
      <div class="world-card-grid3" style="margin-top:4px;">
        <label class="mini-field"><span>Pos X (m)</span><input type="number" step="0.1" class="num-in" id="we-pr-x" value="${scr.posM[0].toFixed(2)}"></label>
        <label class="mini-field"><span>Pos Y (m)</span><input type="number" step="0.1" class="num-in" id="we-pr-y" value="${scr.posM[1].toFixed(2)}"></label>
        <label class="mini-field"><span>Pos Z (m)</span><input type="number" step="0.1" class="num-in" id="we-pr-z" value="${scr.posM[2].toFixed(2)}"></label>
      </div>
      <div class="world-card-grid3" style="margin-top:4px;">
        <label class="mini-field"><span>Yaw (°)</span><input type="number" min="-180" max="180" step="1" class="num-in" id="we-pr-yaw" value="${(scr.yawDeg || 0).toFixed(1)}"></label>
        <label class="mini-field"><span>Pitch (°)</span><input type="number" min="-89" max="89" step="1" class="num-in" id="we-pr-pitch" value="${(scr.pitchDeg || 0).toFixed(1)}"></label>
        <label class="mini-field"><span>Roll (°)</span><input type="number" min="-180" max="180" step="1" class="num-in" id="we-pr-roll" value="${(scr.rollDeg || 0).toFixed(1)}"></label>
      </div>
      <div class="world-card-grid3" style="margin-top:4px;">
        <label class="mini-field"><span>Aim X</span><input type="number" step="0.1" class="num-in" id="we-pr-ax" value="${scr.aimM[0].toFixed(2)}"></label>
        <label class="mini-field"><span>Aim Y</span><input type="number" step="0.1" class="num-in" id="we-pr-ay" value="${scr.aimM[1].toFixed(2)}"></label>
        <label class="mini-field"><span>Aim Z</span><input type="number" step="0.1" class="num-in" id="we-pr-az" value="${scr.aimM[2].toFixed(2)}"></label>
      </div>
      <div class="world-card-grid" style="margin-top:4px;">
        <label class="mini-field"><span>Throw (:1)</span><input type="number" min="0.3" max="5" step="0.05" class="num-in" id="we-pr-tr" value="${(scr.throwRatio || 1.2).toFixed(2)}"></label>
        <label class="mini-field"><span>Lumens</span><input type="number" min="500" max="80000" step="250" class="num-in" id="we-pr-lm" value="${Math.round(scr.lumens || 9000)}"></label>
      </div>
      ${(() => { try { return solveStagePlanOpticalField(state.multiProjector)?.opticsByIndex?.get(scr.index)?.missesAllTargets; } catch (_) { return false; } })() ? `<div class="world-warn" role="status" style="margin-top:6px;padding:4px 6px;border:1px solid #ff6b6b;border-radius:4px;color:#ff9b9b;font-size:10px;">⚠ This beam lands on no screen or 3D object — use 🎯 Aim at Screen.</div>` : ""}
      <div class="world-card-aimrow" style="display:flex;gap:4px;align-items:center;margin-top:6px;">
        <select class="num-in" id="we-pr-aim-target" title="Physical screen to aim at" style="flex:1;min-width:0;">
          ${(state.worldScreens || []).map(w => `<option value="${escapeHtml(w.id)}" ${w.id === (state.selectedWorldScreenId || '') ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
        </select>
        <button type="button" class="btn" id="we-pr-autoaim" title="Re-position this projector so its output slice lands squarely on the chosen screen (keeps throw ratio)">🎯 Aim at Screen</button>
      </div>
      <button type="button" class="btn emerald" id="we-pr-align" style="width:100%;margin-top:4px;" title="Precise calibration: click 4–8 known corners in the 3D view, nudge each crosshair onto the real corner — position, aim, roll (and throw) are solved">📐 Align by points (precise)</button>
      <div class="mono-dim" style="margin-top:4px;">Drag body = move (beam stays locked on its aim point) · ⌘/Ctrl+Drag = move body + aim together · Shift+Drag = height</div>
    `;
    const commitPr = () => {
      if (typeof commitRigPhysicalChange === 'function') commitRigPhysicalChange();
      renderWorldDocksUI();
    };
    host.querySelector('#we-pr-del')?.addEventListener('click', () => {
      setActiveSelection('projector', String(scr.index), scr.name);
      deleteActiveSelection();
    });
    // Position edits keep the aim point fixed (the beam stays on its target) and re-derive yaw/pitch.
    const bindPos = (id, axis, lo, hi) => {
      host.querySelector(id)?.addEventListener('change', e => {
        const v = parseFloat(e.target.value);
        if (!Number.isFinite(v)) { renderWorldDocksUI(); return; }
        scr.posM[axis] = clamp(v, lo, hi);
        if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
        commitPr();
      });
    };
    bindPos('#we-pr-x', 0, -40, 40);
    bindPos('#we-pr-y', 1, 0.05, 25);
    bindPos('#we-pr-z', 2, -40, 40);
    host.querySelector('#we-pr-align')?.addEventListener('click', () => {
      if (state.multiProjector?.stagePlan?.viewMode !== 'orbit3d' && typeof setBuildViewMode === 'function') setBuildViewMode('world3d');
      beginProjectorPointAlign(scr.index);
    });
    host.querySelector('#we-pr-autoaim')?.addEventListener('click', () => {
      const wsId = host.querySelector('#we-pr-aim-target')?.value;
      const ws = (state.worldScreens || []).find(w => w.id === wsId) || null;
      if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint(`Auto-Aim P${scr.index}`);
      autoAimProjectorAtWorldScreen(scr, ws);
      commitPr();
      showToast(`🎯 P${scr.index} aimed at ${ws?.name || 'stage screen'} (throw ${scr.throwRatio.toFixed(2)}:1)`);
    });
    host.querySelector('#we-pr-yaw')?.addEventListener('change', e => {
      scr.yawDeg = clamp(parseFloat(e.target.value) || 0, -180, 180);
      if (typeof syncProjectorAimFromAngles === 'function') syncProjectorAimFromAngles(scr);
      commitPr();
    });
    host.querySelector('#we-pr-pitch')?.addEventListener('change', e => {
      scr.pitchDeg = clamp(parseFloat(e.target.value) || 0, -89, 89);
      if (typeof syncProjectorAimFromAngles === 'function') syncProjectorAimFromAngles(scr);
      commitPr();
    });
    host.querySelector('#we-pr-roll')?.addEventListener('change', e => {
      scr.rollDeg = clamp(parseFloat(e.target.value) || 0, -180, 180);
      commitPr();
    });
    const bindAim = (id, axis) => {
      host.querySelector(id)?.addEventListener('change', e => {
        scr.aimM[axis] = clamp(parseFloat(e.target.value) || 0, -60, 60);
        if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
        commitPr();
      });
    };
    bindAim('#we-pr-ax', 0);
    bindAim('#we-pr-ay', 1);
    bindAim('#we-pr-az', 2);
    host.querySelector('#we-pr-tr')?.addEventListener('change', e => { scr.throwRatio = clamp(parseFloat(e.target.value) || 1.2, 0.28, 5.0); commitPr(); });
    host.querySelector('#we-pr-lm')?.addEventListener('change', e => { scr.lumens = clamp(Math.round(parseFloat(e.target.value) || 8500), 500, 80000); commitPr(); });
    return;
  }

  if (kind === 'floorplan') {
    const fp = ensureFloorplanState();
    host.innerHTML = `
      <div class="world-card-head">
        <strong>📐 ${escapeHtml(fp.name || 'Floorplan Underlay')}</strong>
        <div style="display:flex;gap:4px;">
          <button type="button" class="btn" id="we-fp-imp">📂 Load</button>
          ${fp.dataUrl ? `<button type="button" class="btn danger" id="we-fp-del">🗑 Clear</button>` : ''}
        </div>
      </div>
      ${!fp.dataUrl ? `<div class="mono-dim" style="margin-top:4px;">Import a PNG/JPG/WebP/SVG architectural plan onto the Y=0 stage floor.</div>` : `
        <div class="world-card-grid3" style="margin-top:4px;">
          <label class="mini-field"><span>Width (m)</span><input type="number" min="0.5" max="250" step="0.25" class="num-in" id="we-fp-w" value="${fp.widthM.toFixed(2)}"></label>
          <label class="mini-field"><span>Off X (m)</span><input type="number" step="0.1" class="num-in" id="we-fp-x" value="${fp.offsetX.toFixed(2)}"></label>
          <label class="mini-field"><span>Off Z (m)</span><input type="number" step="0.1" class="num-in" id="we-fp-z" value="${fp.offsetZ.toFixed(2)}"></label>
        </div>
        <div class="world-card-grid3" style="margin-top:4px;">
          <label class="mini-field"><span>Rot (°)</span><input type="number" step="1" class="num-in" id="we-fp-rot" value="${fp.rotDeg.toFixed(0)}"></label>
          <label class="mini-field"><span>Opacity</span><input type="number" min="0.05" max="1" step="0.05" class="num-in" id="we-fp-op" value="${fp.opacity.toFixed(2)}"></label>
          <label class="chk-pill" style="align-self:end;"><input type="checkbox" id="we-fp-lock" ${fp.locked ? 'checked' : ''}> Lock</label>
        </div>
        <div class="btn-row" style="margin-top:6px;">
          <button type="button" class="btn ${fp.calibMode ? 'warm active' : ''}" id="we-fp-cal">📏 2-Point Scale Ruler</button>
          <label class="chk-pill"><input type="checkbox" id="we-fp-vis" ${fp.visible !== false ? 'checked' : ''}> Show</label>
        </div>
      `}
    `;
    const commitFp = () => {
      if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
      renderWorldDocksUI();
      if (typeof scheduleAutosave === 'function') scheduleAutosave();
    };
    host.querySelector('#we-fp-imp')?.addEventListener('click', () => document.getElementById('file-import-floorplan')?.click());
    host.querySelector('#we-fp-del')?.addEventListener('click', () => clearFloorplan());
    host.querySelector('#we-fp-w')?.addEventListener('change', e => { fp.widthM = clamp(parseFloat(e.target.value) || 12, 0.5, 250); commitFp(); });
    host.querySelector('#we-fp-x')?.addEventListener('change', e => { fp.offsetX = clamp(parseFloat(e.target.value) || 0, -100, 100); commitFp(); });
    host.querySelector('#we-fp-z')?.addEventListener('change', e => { fp.offsetZ = clamp(parseFloat(e.target.value) || 0, -100, 100); commitFp(); });
    host.querySelector('#we-fp-rot')?.addEventListener('change', e => { fp.rotDeg = clamp(parseFloat(e.target.value) || 0, -180, 180); commitFp(); });
    host.querySelector('#we-fp-op')?.addEventListener('change', e => { fp.opacity = clamp(parseFloat(e.target.value) || 0.5, 0.05, 1.0); commitFp(); });
    host.querySelector('#we-fp-lock')?.addEventListener('change', e => { fp.locked = e.target.checked; commitFp(); });
    host.querySelector('#we-fp-vis')?.addEventListener('change', e => { fp.visible = e.target.checked; commitFp(); });
    host.querySelector('#we-fp-cal')?.addEventListener('click', () => toggleFloorplanCalibMode());
    return;
  }

  const surf = typeof getSelectedSurface === 'function' ? getSelectedSurface() : null;
  if ((kind === 'mesh3d' || kind === 'surface') && surf) {
    if (surf.type === 'mesh3d') {
      if (!Array.isArray(surf.pos3d)) surf.pos3d = [0, 0, 0];
      if (!Array.isArray(surf.rot3d)) surf.rot3d = [18, -28, 0];
      if (!Array.isArray(surf.scale3d)) surf.scale3d = [1, 1, 1];
      host.innerHTML = `
        <div class="world-card-head">
          <strong>🧊 ${escapeHtml(surf.name)}</strong>
          <div style="display:flex;gap:4px;">
            <button type="button" class="btn" id="we-s3d-warp" title="Warp / PnP Calibrate on Stage">Stage Warp ↗</button>
            <button type="button" class="btn danger" id="we-s3d-del">🗑</button>
          </div>
        </div>
        <div class="world-card-grid3" style="margin-top:4px;">
          <label class="mini-field"><span>Pos X</span><input type="number" step="0.1" class="num-in" id="we-s3d-px" value="${(surf.pos3d[0] || 0).toFixed(2)}"></label>
          <label class="mini-field"><span>Pos Y</span><input type="number" step="0.1" class="num-in" id="we-s3d-py" value="${(surf.pos3d[1] || 0).toFixed(2)}"></label>
          <label class="mini-field"><span>Pos Z</span><input type="number" step="0.1" class="num-in" id="we-s3d-pz" value="${(surf.pos3d[2] || 0).toFixed(2)}"></label>
        </div>
        <div class="world-card-grid3" style="margin-top:4px;">
          <label class="mini-field"><span>Rot X°</span><input type="number" step="2" class="num-in" id="we-s3d-rx" value="${(surf.rot3d[0] || 0).toFixed(0)}"></label>
          <label class="mini-field"><span>Rot Y°</span><input type="number" step="2" class="num-in" id="we-s3d-ry" value="${(surf.rot3d[1] || 0).toFixed(0)}"></label>
          <label class="mini-field"><span>Scale</span><input type="number" min="0.1" max="15" step="0.1" class="num-in" id="we-s3d-sc" value="${(surf.scale3d[0] || 1).toFixed(2)}"></label>
        </div>
      `;
      const commit3d = () => {
        surf._meshDirty = true;
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        if (typeof commitRigPhysicalChange === 'function') commitRigPhysicalChange();
        renderWorldDocksUI();
      };
      host.querySelector('#we-s3d-warp')?.addEventListener('click', () => setBuildViewMode('warp'));
      host.querySelector('#we-s3d-del')?.addEventListener('click', () => {
        setActiveSelection('surface', surf.id, surf.name);
        deleteActiveSelection();
      });
      host.querySelector('#we-s3d-px')?.addEventListener('change', e => { surf.pos3d[0] = parseFloat(e.target.value) || 0; commit3d(); });
      host.querySelector('#we-s3d-py')?.addEventListener('change', e => { surf.pos3d[1] = parseFloat(e.target.value) || 0; commit3d(); });
      host.querySelector('#we-s3d-pz')?.addEventListener('change', e => { surf.pos3d[2] = parseFloat(e.target.value) || 0; commit3d(); });
      host.querySelector('#we-s3d-rx')?.addEventListener('change', e => { surf.rot3d[0] = parseFloat(e.target.value) || 0; commit3d(); });
      host.querySelector('#we-s3d-ry')?.addEventListener('change', e => { surf.rot3d[1] = parseFloat(e.target.value) || 0; commit3d(); });
      host.querySelector('#we-s3d-sc')?.addEventListener('change', e => {
        const sc = clamp(parseFloat(e.target.value) || 1, 0.1, 20);
        surf.scale3d = [sc, sc, sc];
        commit3d();
      });
      return;
    } else {
      host.innerHTML = `
        <div class="world-card-head">
          <strong>⬡ ${escapeHtml(surf.name)} (${escapeHtml(surf.type)})</strong>
          <div style="display:flex;gap:4px;">
            <button type="button" class="btn primary" id="we-sf-warp">Edit Stage Warp ↗</button>
            <button type="button" class="btn danger" id="we-sf-del">🗑</button>
          </div>
        </div>
        <div class="mono-dim" style="margin-top:4px;">Drag corners directly in the Stage Warp pane (Split or Stage tab).</div>
      `;
      host.querySelector('#we-sf-warp')?.addEventListener('click', () => setBuildViewMode('split'));
      host.querySelector('#we-sf-del')?.addEventListener('click', () => {
        setActiveSelection('surface', surf.id, surf.name);
        deleteActiveSelection();
      });
      return;
    }
  }

  host.innerHTML = `<div class="mono-dim">Click any Screen, Projector, 3D Object, Surface, or Floorplan in the World to inspect & transform it.</div>`;
}

function renderWorldDocksUI() {
  if (typeof document === 'undefined' || !isBuildRoom()) return;
  ensureWorldRigSeeded();

  // 1. Ghost Rig Presets
  const ghostEl = document.getElementById('world-ghost-presets');
  if (ghostEl) {
    ghostEl.innerHTML = Object.values(WORLD_GHOST_PRESETS).map(p => `
      <button type="button" class="btn ghost-preset-btn" data-preset="${p.id}" title="${escapeHtml(p.desc)}">
        <span>✦ ${escapeHtml(p.label)}</span>
      </button>
    `).join('');
    ghostEl.querySelectorAll('.ghost-preset-btn').forEach(btn => {
      const pid = btn.dataset.preset;
      btn.addEventListener('pointerenter', () => setWorldGhostHover(pid));
      btn.addEventListener('pointerleave', () => setWorldGhostHover(null));
      btn.addEventListener('click', () => stampWorldGhostPreset(pid));
    });
  }

  // 2. Comprehensive Physical World Outliner
  const outlinerEl = document.getElementById('world-outliner-list');
  if (outlinerEl) {
    const mp = state.multiProjector;
    const wScreens = state.worldScreens || [];
    const projScreens = mp?.screens || [];
    const surfaces3d = (state.surfaces || []).filter(s => s.type === 'mesh3d');
    const surfaces2d = (state.surfaces || []).filter(s => s.type !== 'mesh3d');
    const masks = state.masks || [];
    const fixtures = state.pixelMapper?.fixtures || [];
    const devs = state.dmxDevices || [];
    const fp = ensureFloorplanState();
    const rows = [];

    const venueLbl = (typeof VENUE_SHAPES !== 'undefined' && VENUE_SHAPES[state.worldStage.shape]) ? VENUE_SHAPES[state.worldStage.shape].label : state.worldStage.shape;
    rows.push(`<div class="world-node-row stage-node"><span>📐 ${escapeHtml(venueLbl)} · stage ${state.worldStage.widthM.toFixed(1)}×${state.worldStage.depthM.toFixed(1)}m</span></div>`);

    const fpSel = state.rigSelectedKind === 'floorplan';
    rows.push(`
      <div class="world-node-row${fpSel ? ' active' : ''}" data-kind="floorplan">
        <button type="button" class="world-node-pick"><span>🗺 Floorplan: ${fp.dataUrl ? escapeHtml(fp.name || 'Loaded') : '<em>None (Click to Load)</em>'}</span></button>
        ${fp.dataUrl ? `<button type="button" class="icon-btn world-node-del" data-del="floorplan" title="Clear Floorplan">✕</button>` : ''}
      </div>
    `);

    for (const ws of wScreens) {
      const sel = state.rigSelectedKind === 'world_screen' && state.selectedWorldScreenId === ws.id;
      rows.push(`
        <div class="world-node-row${sel ? ' active' : ''}" data-kind="wscreen" data-id="${escapeHtml(ws.id)}">
          <button type="button" class="world-node-pick"><span>🖥 ${escapeHtml(ws.name)} (${ws.widthM.toFixed(1)}×${ws.heightM.toFixed(2)}m)</span></button>
          <button type="button" class="icon-btn world-node-del" data-del="wscreen" data-id="${escapeHtml(ws.id)}" title="Delete Physical Screen">✕</button>
        </div>
      `);
    }

    for (const scr of projScreens) {
      const sel = mp.selectedScreenIndex === scr.index && state.rigSelectedKind === 'projector';
      const shutTag = scr.pjlink?.shutterClosed ? '<span class="badge warn">AVMT</span>' : '';
      rows.push(`
        <div class="world-node-row${sel ? ' active' : ''}" data-kind="proj" data-idx="${scr.index}">
          <button type="button" class="world-node-pick"><span>📽 P${scr.index} · ${escapeHtml(scr.name || '')}</span>${shutTag}</button>
          <button type="button" class="icon-btn world-node-del" data-del="proj" data-idx="${scr.index}" title="Delete Projector">✕</button>
        </div>
      `);
    }

    for (const s3 of surfaces3d) {
      const sel = state.selectedSurfaceId === s3.id && state.rigSelectedKind === 'mesh3d';
      rows.push(`
        <div class="world-node-row${sel ? ' active' : ''}" data-kind="mesh3d" data-id="${escapeHtml(s3.id)}">
          <button type="button" class="world-node-pick"><span>🧊 ${escapeHtml(s3.name)}</span></button>
          <button type="button" class="icon-btn world-node-del" data-del="surf" data-id="${escapeHtml(s3.id)}" title="Delete 3D Object">✕</button>
        </div>
      `);
    }

    for (const s2 of surfaces2d) {
      const sel = state.selectedSurfaceId === s2.id && state.rigSelectedKind === 'surface';
      rows.push(`
        <div class="world-node-row${sel ? ' active' : ''}" data-kind="surf2d" data-id="${escapeHtml(s2.id)}">
          <button type="button" class="world-node-pick"><span>⬡ ${escapeHtml(s2.name)} (${escapeHtml(s2.type)})</span></button>
          <button type="button" class="icon-btn world-node-del" data-del="surf" data-id="${escapeHtml(s2.id)}" title="Delete Surface">✕</button>
        </div>
      `);
    }

    for (const mk of masks) {
      const sel = state.selectedMaskId === mk.id && state.maskEditTarget;
      rows.push(`
        <div class="world-node-row${sel ? ' active' : ''}" data-kind="mask" data-id="${escapeHtml(mk.id)}">
          <button type="button" class="world-node-pick"><span>✂ ${escapeHtml(mk.name || 'Mask')}</span></button>
          <button type="button" class="icon-btn world-node-del" data-del="mask" data-id="${escapeHtml(mk.id)}" title="Delete Mask">✕</button>
        </div>
      `);
    }

    for (const fx of fixtures) {
      const sel = state.rigSelectedKind === 'dmx' && state.pixelMapper?.selectedFixtureId === fx.id;
      rows.push(`
        <div class="world-node-row${sel ? ' active' : ''}" data-kind="led" data-id="${escapeHtml(fx.id)}">
          <button type="button" class="world-node-pick"><span>🚥 ${escapeHtml(fx.name)} (${fx.pixelCount}px · U${fx.universe})</span></button>
          <button type="button" class="icon-btn world-node-del" data-del="led" data-id="${escapeHtml(fx.id)}" title="Delete LED Strip">✕</button>
        </div>
      `);
    }

    for (const prop of (typeof ensureWorldPropsState === 'function' ? ensureWorldPropsState() : [])) {
      const sel = state.rigSelectedKind === 'world_prop' && state.selectedWorldPropId === prop.id;
      rows.push(`
        <div class="world-node-row${sel ? ' active' : ''}" data-kind="prop" data-id="${escapeHtml(prop.id)}">
          <button type="button" class="world-node-pick"><span>🧍 ${escapeHtml(prop.name)} (${(prop.heightM || 1.75).toFixed(2)} m)</span></button>
          <button type="button" class="icon-btn world-node-del" data-del="prop" data-id="${escapeHtml(prop.id)}" title="Delete figure">✕</button>
        </div>
      `);
    }

    if (typeof buildVenuePartOutlinerRows === 'function') rows.push(buildVenuePartOutlinerRows());

    for (const dev of devs) {
      const sel = state.rigSelectedKind === 'dmx_device' && state.selectedDmxDeviceId === dev.id;
      const icon = (typeof isDmxLightDevice === 'function' && isDmxLightDevice(dev)) ? '💡' : (dev.category === 'atmosphere' ? '🌫' : '🔌');
      rows.push(`
        <div class="world-node-row${sel ? ' active' : ''}" data-kind="dmxdev" data-id="${escapeHtml(dev.id)}">
          <button type="button" class="world-node-pick"><span>${icon} ${escapeHtml(dev.name)} (U${dev.universe}.${dev.startAddress})</span></button>
          <button type="button" class="icon-btn world-node-del" data-del="dmxdev" data-id="${escapeHtml(dev.id)}" title="Delete DMX Device">✕</button>
        </div>
      `);
    }

    outlinerEl.innerHTML = rows.join('');

    outlinerEl.querySelectorAll('.world-node-row').forEach(row => {
      const pickBtn = row.querySelector('.world-node-pick');
      pickBtn?.addEventListener('click', () => {
        const k = row.dataset.kind;
        if (k === 'floorplan') {
          state.rigSelectedKind = 'floorplan';
          setActiveSelection('floorplan', 'floorplan', state.floorplan?.name || 'Floorplan');
          if (!state.floorplan?.dataUrl) document.getElementById('file-import-floorplan')?.click();
        } else if (k === 'wscreen') {
          state.rigSelectedKind = 'world_screen';
          state.selectedWorldScreenId = row.dataset.id;
          const ws = getSelectedWorldScreen();
          if (ws) setActiveSelection('world_screen', ws.id, ws.name);
        } else if (k === 'proj') {
          state.rigSelectedKind = 'projector';
          state.multiProjector.selectedScreenIndex = Number(row.dataset.idx) || 1;
          const scr = getSelectedProjectorScreen();
          if (scr) setActiveSelection('projector', String(scr.index), `P${scr.index} ${scr.name || ''}`);
        } else if (k === 'mesh3d' || k === 'surf2d') {
          state.rigSelectedKind = k === 'mesh3d' ? 'mesh3d' : 'surface';
          if (typeof selectSurface === 'function') selectSurface(row.dataset.id);
          const s = state.surfaces.find(x => x.id === row.dataset.id);
          if (s) setActiveSelection('surface', s.id, s.name);
        } else if (k === 'mask') {
          state.selectedMaskId = row.dataset.id;
          state.maskEditTarget = true;
          const mk = state.masks.find(x => x.id === row.dataset.id);
          if (mk) setActiveSelection('mask', mk.id, mk.name || 'Mask');
        } else if (k === 'led') {
          state.rigSelectedKind = 'dmx';
          state.pixelMapper.selectedFixtureId = row.dataset.id;
          const fx = state.pixelMapper.fixtures.find(x => x.id === row.dataset.id);
          if (fx) setActiveSelection('led_fixture', fx.id, fx.name);
        } else if (k === 'dmxdev') {
          const dv = state.dmxDevices.find(x => x.id === row.dataset.id);
          if (dv) {
            state.rigSelectedKind = 'dmx_device';
            state.selectedDmxDeviceId = dv.id;
            setActiveSelection('dmx_device', dv.id, dv.name);
          }
        } else if (k === 'prop') {
          if (typeof selectWorldProp === 'function') selectWorldProp(row.dataset.id);
        } else if (k === 'vpart') {
          if (typeof selectVenuePart === 'function') selectVenuePart(row.dataset.id);
        }
        if (typeof syncRigWorkspaceUI === 'function') syncRigWorkspaceUI();
        if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
        renderWorldDocksUI();
      });

      const delBtn = row.querySelector('.world-node-del');
      delBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const dk = delBtn.dataset.del;
        if (dk === 'floorplan') clearFloorplan();
        else if (dk === 'wscreen') removeWorldScreen(delBtn.dataset.id);
        else if (dk === 'proj') {
          setActiveSelection('projector', delBtn.dataset.idx, `P${delBtn.dataset.idx}`);
          deleteActiveSelection();
        } else if (dk === 'surf') {
          if (typeof selectSurface === 'function') selectSurface(delBtn.dataset.id);
          setActiveSelection('surface', delBtn.dataset.id, 'Surface');
          deleteActiveSelection();
        } else if (dk === 'mask') {
          state.selectedMaskId = delBtn.dataset.id;
          setActiveSelection('mask', delBtn.dataset.id, 'Mask');
          deleteActiveSelection();
        } else if (dk === 'led') {
          setActiveSelection('led_fixture', delBtn.dataset.id, 'LED Strip');
          deleteActiveSelection();
        } else if (dk === 'dmxdev') {
          setActiveSelection('dmx_device', delBtn.dataset.id, 'DMX Device');
          deleteActiveSelection();
        } else if (dk === 'prop') {
          setActiveSelection('world_prop', delBtn.dataset.id, 'Figure');
          deleteActiveSelection();
        } else if (dk === 'vpart') {
          setActiveSelection('venue_part', delBtn.dataset.id, 'Part');
          deleteActiveSelection();
        }
        renderWorldDocksUI();
      });
    });
  }

  renderWorldEntityInspectorUI();

  // 3. Stage Dimensions Inputs
  const wIn = document.getElementById('world-stage-w');
  const hIn = document.getElementById('world-stage-h');
  const dIn = document.getElementById('world-stage-d');
  const shIn = document.getElementById('world-stage-shape');
  const deckIn = document.getElementById('world-stage-deck');
  if (deckIn && document.activeElement !== deckIn && typeof getVenueLayout === 'function') deckIn.value = getVenueLayout().deckH.toFixed(2);
  const vRoom = state.multiProjector?.stagePlan?.venue;
  for (const [id, key] of [['world-room-w', 'roomWidthM'], ['world-room-d', 'roomDepthM'], ['world-room-h', 'roomHeightM']]) {
    const el = document.getElementById(id);
    if (el && vRoom && document.activeElement !== el) el.value = Number(vRoom[key]).toFixed(1);
  }
  if (wIn && document.activeElement !== wIn) wIn.value = state.worldStage.widthM.toFixed(2);
  if (hIn && document.activeElement !== hIn) hIn.value = state.worldStage.heightM.toFixed(2);
  if (dIn && document.activeElement !== dIn) dIn.value = state.worldStage.depthM.toFixed(2);
  if (shIn) shIn.value = state.worldStage.shape;

  // 4. PJLink Ethernet Shutter Cards
  const pjlList = document.getElementById('world-pjlink-list');
  if (pjlList) {
    const screens = state.multiProjector?.screens || [];
    if (screens.length === 0) {
      pjlList.innerHTML = `<div class="mono-dim" style="padding:4px 0;">Add a projector above to configure PJLink Ethernet shutter control.</div>`;
    } else {
      pjlList.innerHTML = screens.slice(0, 8).map(scr => {
        const pj = ensureProjectorPjLinkMeta(scr);
        const lampTxt = pj.lampHours !== null ? `${pj.lampHours}h` : '—';
        return `
          <div class="world-card" data-scr="${scr.index}">
            <div class="world-card-head">
              <label class="chk-pill"><input type="checkbox" class="pjl-en" ${pj.enabled ? 'checked' : ''}> <strong>P${scr.index} PJLink</strong></label>
              <span class="mono-dim">Lamp: ${lampTxt} · Lead: ${pj.measuredShutterMs}ms</span>
            </div>
            <div class="world-card-grid">
              <input type="text" class="text-in pjl-ip" placeholder="Projector IP (e.g. 192.168.1.50)" value="${escapeHtml(pj.ip || '')}" aria-label="Projector ${scr.index} PJLink IP">
              <input type="password" class="text-in pjl-pass" placeholder="PJLink Pass (opt)" value="${escapeHtml(pj.password || '')}" aria-label="Projector ${scr.index} PJLink Password">
            </div>
            <div class="btn-row" style="margin-top:5px;">
              <button type="button" class="btn ${pj.shutterClosed ? 'danger active' : ''} pjl-shutter">${pj.shutterClosed ? '⬛ Shutter CLOSED' : '⬜ Shutter OPEN'}</button>
              <button type="button" class="btn pjl-cal" title="Ping AVMT 31/30 to calibrate mechanical shutter pre-open lead">⏱ Calibrate</button>
              <button type="button" class="btn danger pjl-powroff" title="Hold 600ms to send PJLink POWR 0">⏻ Hold Off</button>
            </div>
            ${pj.lastReply ? `<div class="mono-dim" style="margin-top:3px;font-size:9px;">${escapeHtml(pj.lastReply)}</div>` : ''}
          </div>
        `;
      }).join('');

      pjlList.querySelectorAll('.world-card').forEach(card => {
        const sIdx = Number(card.dataset.scr) || 1;
        const scr = state.multiProjector.screens.find(s => s.index === sIdx);
        if (!scr) return;
        const pj = ensureProjectorPjLinkMeta(scr);

        card.querySelector('.pjl-en')?.addEventListener('change', (e) => {
          pj.enabled = e.target.checked;
          if (typeof scheduleAutosave === 'function') scheduleAutosave();
        });
        card.querySelector('.pjl-ip')?.addEventListener('change', (e) => {
          pj.ip = e.target.value.trim();
          if (pj.ip) pj.enabled = true;
          renderWorldDocksUI();
          if (typeof scheduleAutosave === 'function') scheduleAutosave();
        });
        card.querySelector('.pjl-pass')?.addEventListener('change', (e) => {
          pj.password = e.target.value;
          if (typeof scheduleAutosave === 'function') scheduleAutosave();
        });
        card.querySelector('.pjl-shutter')?.addEventListener('click', async () => {
          const wantClose = !pj.shutterClosed;
          pj.shutterClosed = wantClose;
          await sendStudioPjLink(sIdx, wantClose ? 'AVMT 31' : 'AVMT 30');
          renderWorldDocksUI();
          syncOutputFeedTabsUI();
        });
        card.querySelector('.pjl-cal')?.addEventListener('click', () => {
          measureProjectorShutterLatency(sIdx);
        });
        const pwrBtn = card.querySelector('.pjl-powroff');
        if (pwrBtn) {
          let holdT = null;
          const clearPwr = () => { if (holdT) { clearTimeout(holdT); holdT = null; } pwrBtn.textContent = '⏻ Hold Off'; };
          pwrBtn.addEventListener('pointerdown', () => {
            pwrBtn.textContent = '⏻ Holding…';
            holdT = setTimeout(async () => {
              holdT = null;
              pwrBtn.textContent = '⏻ Sent POWR 0';
              await sendStudioPjLink(sIdx, 'POWR 0', { confirmPowerOff: true });
            }, 600);
          });
          pwrBtn.addEventListener('pointerup', clearPwr);
          pwrBtn.addEventListener('pointerleave', clearPwr);
        }
      });
    }
  }

  // 5. .wmdevice.json DMX Patch & Collision Banner
  const colBanner = document.getElementById('world-dmx-collision-banner');
  if (colBanner) {
    const cols = computeDmxPatchCollisions();
    colBanner.hidden = cols.length === 0;
    colBanner.textContent = cols.length > 0 ? `⚠ Patch Collision: ${cols.join(' | ')}` : '';
  }

  const dmxList = document.getElementById('world-dmx-devices-list');
  if (dmxList) {
    if (state.dmxDevices.length === 0) {
      dmxList.innerHTML = `<div class="mono-dim" style="padding:6px 2px;">No utility DMX devices patched yet — add a Dowser, Hazer, or Generic Strip above.</div>`;
    } else {
      dmxList.innerHTML = state.dmxDevices.map(dev => `
        <div class="world-card" data-dev="${escapeHtml(dev.id)}">
          <div class="world-card-head">
            <strong>🔌 ${escapeHtml(dev.name)}</strong>
            <div style="display:flex;gap:4px;">
              <button type="button" class="btn dev-export" title="Export .wmdevice.json">⇩ JSON</button>
              <button type="button" class="btn danger dev-del" title="Remove device">✕</button>
            </div>
          </div>
          <div class="world-card-grid3">
            <label class="mini-field"><span>Uni</span><input type="number" min="0" max="127" class="num-in dev-uni" value="${dev.universe}"></label>
            <label class="mini-field"><span>Addr</span><input type="number" min="1" max="512" class="num-in dev-addr" value="${dev.startAddress}"></label>
            <label class="mini-field"><span>Link P#</span><input type="number" min="0" max="32" class="num-in dev-link" value="${dev.linkProjector || 0}" title="Link dowser to Projector # on DBO (0 = none)"></label>
          </div>
          <div class="dev-ch-list">
            ${dev.channels.map(ch => `
              <div class="dev-ch-row">
                <span class="mono-dim">+${ch.offset} ${escapeHtml(ch.label)} <em>(${ch.kind} · DBO:${ch.dbo})</em></span>
                ${ch.kind === 'power'
                  ? `<button type="button" class="btn danger dev-pwr-hold" data-ch="${escapeHtml(ch.key)}">Hold Relay (${ch._resolvedByte || 0})</button>`
                  : `<span class="badge">${ch._resolvedOwner || 'HOME'}: ${ch._resolvedByte ?? ch.home}</span>`}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

      dmxList.querySelectorAll('.world-card').forEach(card => {
        const dev = state.dmxDevices.find(d => d.id === card.dataset.dev);
        if (!dev) return;
        card.querySelector('.dev-uni')?.addEventListener('change', (e) => {
          dev.universe = clamp(parseInt(e.target.value, 10) || 0, 0, 127);
          renderWorldDocksUI();
        });
        card.querySelector('.dev-addr')?.addEventListener('change', (e) => {
          dev.startAddress = clamp(parseInt(e.target.value, 10) || 1, 1, Math.max(1, 513 - footprintOfDmxDevice(dev)));
          renderWorldDocksUI();
        });
        card.querySelector('.dev-link')?.addEventListener('change', (e) => {
          dev.linkProjector = clamp(parseInt(e.target.value, 10) || 0, 0, MAX_MULTI_PROJ_SCREENS);
          renderWorldDocksUI();
        });
        card.querySelector('.dev-del')?.addEventListener('click', () => removeDmxDevice(dev.id));
        card.querySelector('.dev-export')?.addEventListener('click', () => {
          const jsonObj = exportWmDeviceJson(dev.id);
          if (!jsonObj) return;
          const blob = new Blob([JSON.stringify(jsonObj, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${dev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.wmdevice.json`;
          a.click();
        });
        card.querySelectorAll('.dev-pwr-hold').forEach(pBtn => {
          const chKey = pBtn.dataset.ch;
          let pTimer = null;
          const clr = () => { if (pTimer) { clearTimeout(pTimer); pTimer = null; } };
          pBtn.addEventListener('pointerdown', () => {
            pTimer = setTimeout(() => {
              pTimer = null;
              const ch = dev.channels.find(c => c.key === chKey);
              const next = (ch && (ch.seatValue ?? ch.home) > 127) ? 0 : 255;
              setDmxDeviceChannelValue(dev.id, chKey, next, 'seat', { confirmedWorldHold: true });
              renderWorldDocksUI();
              if (typeof showToast === 'function') showToast(`⚡ ${dev.name} Power Relay → ${next}`);
            }, 600);
          });
          pBtn.addEventListener('pointerup', clr);
          pBtn.addEventListener('pointerleave', clr);
        });
      });
    }
  }

  // 6. Wireless /pad Touch Remote Pairing Card
  const padCard = document.getElementById('world-pad-card');
  if (padCard) {
    if (state.bridgeInfo && state.bridgeInfo.lan && state.bridgeInfo.padUrl) {
      padCard.innerHTML = `
        <div class="mono-dim">📱 <strong>/pad Remote Armed</strong> · ${state.bridgeInfo.connectedPads} pad(s) live</div>
        <input type="text" class="text-in" readonly value="${escapeHtml(state.bridgeInfo.padUrl)}" aria-label="Wireless Touch Pad Pairing URL" onclick="this.select()">
      `;
    } else {
      padCard.innerHTML = `<div class="mono-dim">📱 Wireless Touch Pad: run <code>node scripts/osc-artnet-bridge.js --lan</code> to pair a phone/tablet XY Followspot pad.</div>`;
    }
  }
}

// Spot → projector routing chips, 3D aim / follow, and per-projector calibration buttons.
// v2.2 followspot console: the "Drive" row (how the spot moves) and the folded "Setup".
function getSpotWorldDiameterM(sp) {
  if (typeof getWorldScreenBasis !== 'function' || typeof getPrimaryWorldScreen !== 'function') return 0;
  return clamp(Number(sp.radius) || 0.2, 0.005, 2) * getWorldScreenBasis(getPrimaryWorldScreen()).heightM * 2;
}

function buildSpotDriveHtml(sp) {
  if (!sp.converge3D) {
    return `<div class="spot-route-row"><span class="spot-route-lbl">Drive</span>
      <button type="button" class="btn warm sp-enable3d" title="Aim on the stage floor: click the floor, follow a person, store marks — every routed projector converges">Aim on stage ▸</button></div>`;
  }
  const props = state.worldProps || [];
  const followOpts = [`<option value=""${!sp.followPropId ? ' selected' : ''}>Free (mouse / trackpad / clicks)</option>`]
    .concat(props.map(p => `<option value="${escapeHtml(p.id)}"${sp.followPropId === p.id ? ' selected' : ''}>Follow 🧍 ${escapeHtml(p.name)}</option>`)).join('');
  const marks = Array.isArray(sp.marks) ? sp.marks : [];
  const markBtns = [0, 1, 2, 3].map(k => {
    const m = marks[k];
    return `<button type="button" class="venue-chip sp-mark${m ? ' active' : ''}" data-k="${k}" title="${m ? `Glide to M${k + 1} (${m.x.toFixed(1)}, ${m.z.toFixed(1)} m) · Shift+click = store here · Alt+click = clear` : `Store the current position as M${k + 1}`}">M${k + 1}</button>`;
  }).join('');
  return `
    <div class="spot-route-row">
      <span class="spot-route-lbl">Drive</span>
      <select class="sel-in sp-follow" aria-label="${escapeHtml(sp.name)} follow target" style="flex:1;min-width:0;">${followOpts}</select>
    </div>
    <div class="spot-route-row">
      <span class="spot-route-lbl">Marks</span>${markBtns}
      <button type="button" class="venue-chip sp-plot" title="Spot plot: top view of the stage — click the floor to send the spot, up = upstage">🗺 Plot</button>
    </div>`;
}

function buildSpotSetupHtml(sp) {
  const screens = state.multiProjector?.screens || [];
  const list = typeof getSpotProjectorList === 'function' ? getSpotProjectorList(sp) : [];
  const chips = screens.length === 0 ? '<span class="mono-dim">No projectors</span>' : [`<button type="button" class="venue-chip sp-route${list.length === 0 ? ' active' : ''}" data-p="0" title="Every projector renders this spot">All</button>`]
    .concat(screens.slice(0, 8).map((scr, i) => {
      const on = list.length === 0 || list.includes(scr.index);
      const col = typeof STAGEPLAN_PROJ_COLORS !== 'undefined' ? STAGEPLAN_PROJ_COLORS[i % STAGEPLAN_PROJ_COLORS.length] : '#6fd3ff';
      return `<button type="button" class="venue-chip sp-route${on && list.length > 0 ? ' active' : ''}${on ? '' : ' off'}" data-p="${scr.index}" style="--chip:${col}" title="Toggle P${scr.index} for this spot">P${scr.index}</button>`;
    })).join('');
  const is3d = !!sp.converge3D;
  let row3d = '';
  if (is3d) {
    const routed = screens.filter(scr => list.length === 0 || list.includes(scr.index));
    const cal = state.spotCalib && state.spotCalib.active && state.spotCalib.spotId === sp.id ? state.spotCalib.projIndex : 0;
    const calBtns = routed.slice(0, 8).map(scr => {
      const trimmed = Array.isArray(scr.spotTrim) && (Math.abs(scr.spotTrim[0]) > 1e-4 || Math.abs(scr.spotTrim[1]) > 1e-4);
      return `<button type="button" class="venue-chip sp-cal${cal === scr.index ? ' active' : ''}" data-p="${scr.index}" title="Calibrate P${scr.index}: only P${scr.index} shows this spot; arrows (Shift ×10, Alt ÷10) move it onto a mark, Enter keeps">${trimmed ? '✓' : ''}P${scr.index}</button>`;
    }).join('');
    row3d = `
      <div class="spot-route-row">
        ${sp.followPropId ? '<span class="spot-route-lbl">Aim height follows the person</span>' : `<label class="mini-field sp-depth-field" title="Aim height above the deck / floor (Alt+scroll in the 3D Venue)"><span>Aim height m</span><input type="number" class="num-in sp-aimh" min="0" max="4" step="0.1" value="${Number(sp.aimHeightM ?? 1.3).toFixed(1)}"></label>`}
      </div>
      <div class="spot-route-row">
        <span class="spot-route-lbl">Calibrate</span>${calBtns}
        ${cal ? '<button type="button" class="btn sp-cal-done" title="Finish calibration (Enter)">Done</button>' : ''}
      </div>`;
  }
  return `
    <div class="spot-route">
      <div class="spot-route-row">
        <span class="spot-route-lbl">Fade</span>
        <input type="range" class="sp-fade" min="0" max="5" step="0.1" value="${clamp(Number(sp.fadeSec ?? 0.5), 0, 5)}" aria-label="${escapeHtml(sp.name)} fade time" style="flex:1;min-width:60px;">
        <output class="spot-route-lbl" style="min-width:34px;">${clamp(Number(sp.fadeSec ?? 0.5), 0, 5).toFixed(1)}s</output>
      </div>
      <div class="spot-route-row">
        <span class="spot-route-lbl">Projectors</span>${chips}
        <label class="chk-pill" title="Aim on stage: every routed projector draws the spot through its own lens so the beams converge on one physical point"><input type="checkbox" class="sp-3d" ${is3d ? 'checked' : ''}> Aim on stage</label>
      </div>${row3d}
    </div>`;
}

// Kept for callers/tests that still ask for the combined block.
function buildSpotRoutingHtml(sp) {
  return buildSpotDriveHtml(sp) + buildSpotSetupHtml(sp);
}

function bindSpotRoutingControls(card, sp) {
  const rerender = () => {
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    renderLivePerformanceDockUI();
  };
  card.querySelectorAll('.sp-route').forEach(btn => btn.addEventListener('click', () => {
    if (typeof toggleSpotProjector === 'function') toggleSpotProjector(sp, Number(btn.dataset.p) || 0);
    rerender();
  }));
  card.querySelector('.sp-3d')?.addEventListener('change', (e) => {
    sp.converge3D = e.target.checked;
    if (sp.converge3D && typeof ensureSpotStageModel === 'function') ensureSpotStageModel(sp);
    if (!sp.converge3D && state.spotCalib?.spotId === sp.id && typeof endSpotCalibration === 'function') endSpotCalibration(true);
    rerender();
  });
  card.querySelector('.sp-follow')?.addEventListener('change', (e) => {
    sp.followPropId = e.target.value || null;
    rerender();
  });
  card.querySelector('.sp-aimh')?.addEventListener('change', (e) => {
    if (typeof ensureSpotStageModel === 'function') ensureSpotStageModel(sp);
    sp.aimHeightM = clamp(parseFloat(e.target.value) || 0, 0, 4);
    rerender();
  });
  const fadeEl = card.querySelector('.sp-fade');
  fadeEl?.addEventListener('input', () => {
    sp.fadeSec = clamp(parseFloat(fadeEl.value) || 0, 0, 10);
    const out = fadeEl.nextElementSibling;
    if (out) out.textContent = `${sp.fadeSec.toFixed(1)}s`;
  });
  card.querySelectorAll('.sp-mark').forEach(btn => btn.addEventListener('click', (e) => {
    const k = Number(btn.dataset.k) || 0;
    if (!Array.isArray(sp.marks)) sp.marks = [null, null, null, null];
    if (typeof ensureSpotStageModel === 'function') ensureSpotStageModel(sp);
    const T = typeof getSpotWorldTargetM === 'function' ? getSpotWorldTargetM(sp) : null;
    if (e.altKey) {
      sp.marks[k] = null;
    } else if (e.shiftKey || !sp.marks[k]) {
      if (T) sp.marks[k] = { x: Number(T[0].toFixed(3)), z: Number(T[2].toFixed(3)), h: Number((sp.aimHeightM ?? 1.3).toFixed(2)) };
      if (typeof showToast === 'function') showToast(`Stored ${sp.name} mark M${k + 1}`);
    } else {
      const m = sp.marks[k];
      if (sp.followPropId) {
        const p = typeof getWorldPropById === 'function' ? getWorldPropById(sp.followPropId) : null;
        if (p) moveWorldPropTo(p, m.x, m.z);
      } else {
        setSpotWorldTargetFromPlan(sp, m.x, m.z, { glide: true, stageModel: true });
        sp.aimHeightM = m.h;
      }
    }
    rerender();
  }));
  card.querySelectorAll('.sp-cal').forEach(btn => btn.addEventListener('click', () => {
    const p = Number(btn.dataset.p) || 0;
    if (state.spotCalib?.active && state.spotCalib.spotId === sp.id && state.spotCalib.projIndex === p) endSpotCalibration(true);
    else beginSpotCalibration(sp.id, p);
    rerender();
  }));
  card.querySelector('.sp-cal-done')?.addEventListener('click', () => { endSpotCalibration(true); rerender(); });
  card.querySelector('.sp-enable3d')?.addEventListener('click', () => {
    sp.converge3D = true;
    if (typeof ensureSpotStageModel === 'function') ensureSpotStageModel(sp);
    rerender();
  });
  card.querySelector('.sp-plot')?.addEventListener('click', () => {
    state.activeSpotIndex = Math.max(0, (state.spots || []).indexOf(sp));
    if (typeof setOutputFeedTab === 'function' && state.outputFeedTab !== 'venue3d') setOutputFeedTab('venue3d');
    const spx = state.multiProjector?.stagePlan;
    if (spx && spx.camMode === 'ortho' && spx.orthoView === 'top') setVenueCameraMode('orbit');
    else if (typeof setVenueOrthoView === 'function') setVenueOrthoView('top');
    if (state.trackpadSpotTarget !== sp.id && typeof setTrackpadSpotTarget === 'function') setTrackpadSpotTarget(sp.id);
    rerender();
  });
}

const _spotConsoleUi = new Map(); // per-spot fold state (Look / Setup), UI-only

function renderLivePerformanceDockUI() {
  if (typeof document === 'undefined' || state.room !== 'live') return;
  ensureWorldRigSeeded();

  // 1. Live Cue Playback Transport (Hold / Rate / Crossfade T-Bar)
  const cueTrans = document.getElementById('live-cue-transport');
  if (cueTrans) {
    const pb = state.cuePlayback || { paused: false, rate: 1.0, tbarHeld: false, tbarMix: 0 };
    const xMixPct = state.crossfade?.active ? Math.round((state.crossfade.mix || 0) * 100) : (pb.tbarHeld ? Math.round((pb.tbarMix || 0) * 100) : 0);
    const rates = [0.25, 0.5, 1, 2, 4];
    cueTrans.innerHTML = `
      <div class="world-card-head">
        <button type="button" class="btn ${pb.paused ? 'warm active' : ''}" id="btn-live-cue-hold">${pb.paused ? '▶ Resume Cue' : '⏸ Hold Fade'}</button>
        <div class="btn-row" style="gap:2px;">
          ${rates.map(r => `<button type="button" class="btn ${Math.abs((pb.rate || 1) - r) < 0.01 ? 'primary active' : ''} cue-rate-btn" data-rate="${r}" style="padding:2px 5px;font-size:9px;">${r}×</button>`).join('')}
        </div>
      </div>
      <div class="mini-slider" style="margin-top:5px;">
        <span>T-Bar</span>
        <input type="range" min="0" max="100" step="1" value="${xMixPct}" id="live-cue-tbar" aria-label="Live Cue Crossfade T-Bar">
        <output id="live-cue-tbar-out">${pb.tbarHeld ? `H:${xMixPct}%` : `${xMixPct}%`}</output>
      </div>
    `;
    cueTrans.querySelector('#btn-live-cue-hold')?.addEventListener('click', () => {
      state.cuePlayback.paused = !state.cuePlayback.paused;
      renderLivePerformanceDockUI();
    });
    cueTrans.querySelectorAll('.cue-rate-btn').forEach(b => {
      b.addEventListener('click', () => {
        state.cuePlayback.rate = parseFloat(b.dataset.rate) || 1.0;
        renderLivePerformanceDockUI();
      });
    });
    const tbar = cueTrans.querySelector('#live-cue-tbar');
    tbar?.addEventListener('input', () => {
      const m = clamp((parseFloat(tbar.value) || 0) / 100, 0, 1);
      if (typeof setLiveCueTBar === 'function') setLiveCueTBar(m);
      const out = cueTrans.querySelector('#live-cue-tbar-out');
      if (out) out.textContent = `H:${Math.round(m * 100)}%`;
    });
  }

  // 1B. Out-of-Sequence Priority Cue Deck
  const deckHost = document.getElementById('live-deck-cues');
  if (deckHost) {
    const deckCues = (state.cues || []).filter(c => c.cueRole === 'deck');
    const activeOverrides = new Set(state.activeOverrideCueIds || []);
    let dHtml = `<div class="btn-row" style="margin-bottom:5px;justify-content:space-between;">
      <button type="button" class="btn warm" id="btn-live-store-deck" title="Capture current look as an Out-of-Sequence Cue">+ Action Cue</button>
      ${activeOverrides.size > 0 ? `<button type="button" class="btn danger" id="btn-live-release-deck">Release (${activeOverrides.size})</button>` : `<span class="mono-dim">Out-of-Sequence</span>`}
    </div>`;
    if (deckCues.length === 0) {
      dHtml += `<div class="mono-dim" style="padding:2px 0;">No out-of-sequence cues yet — click <strong>+ Action Cue</strong> (or toggle <code>DECK</code> on any cue in <strong>2 · MAP</strong>).</div>`;
    } else {
      dHtml += `<div class="deck-cue-grid">` + deckCues.map(c => {
        const isOv = c.priorityMode === 'override';
        const isOn = activeOverrides.has(c.id);
        return `
          <div class="deck-cue-card${isOn ? ' active' : ''}" data-cid="${escapeHtml(c.id)}">
            <button type="button" class="deck-fire-btn">
              <strong>${isOn ? '⚡ ' : '▶ '}${escapeHtml(c.name)}</strong>
              <span class="mono-dim">${Number(c.fadeSec ?? c.fadeDur ?? 0.8).toFixed(1)}s</span>
            </button>
            <div class="deck-card-foot">
              <button type="button" class="btn ${isOv ? 'warm active' : ''} deck-prio-btn" title="Toggle Priority Override over Sequenced Cues vs LTP">${isOv ? '⚡ PRIORITY' : 'LTP'}</button>
              <button type="button" class="icon-btn deck-del-btn" title="Delete Action Cue">✕</button>
            </div>
          </div>
        `;
      }).join('') + `</div>`;
    }
    deckHost.innerHTML = dHtml;
    deckHost.querySelector('#btn-live-store-deck')?.addEventListener('click', () => {
      if (typeof storeNewCue === 'function') {
        storeNewCue({ cueRole: 'deck', priorityMode: 'override' });
        renderLivePerformanceDockUI();
      }
    });
    deckHost.querySelector('#btn-live-release-deck')?.addEventListener('click', () => {
      if (typeof releaseAllOverrideCues === 'function') releaseAllOverrideCues();
      renderLivePerformanceDockUI();
    });
    deckHost.querySelectorAll('.deck-cue-card').forEach(card => {
      const cid = card.dataset.cid;
      const cue = state.cues.find(x => x.id === cid);
      if (!cue) return;
      card.querySelector('.deck-fire-btn')?.addEventListener('click', () => {
        setActiveSelection('cue', cue.id, cue.name);
        if (typeof triggerDeckCue === 'function') triggerDeckCue(cue.id);
        renderLivePerformanceDockUI();
      });
      card.querySelector('.deck-prio-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        cue.priorityMode = cue.priorityMode === 'override' ? 'ltp' : 'override';
        if (cue.priorityMode !== 'override' && Array.isArray(state.activeOverrideCueIds)) {
          state.activeOverrideCueIds = state.activeOverrideCueIds.filter(id => id !== cue.id);
        }
        if (typeof renderCueList === 'function') renderCueList();
        renderLivePerformanceDockUI();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      });
      card.querySelector('.deck-del-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof deleteCueById === 'function') deleteCueById(cue.id);
        renderLivePerformanceDockUI();
      });
    });
  }

  // 2. Seats Bar + Trackpad No-Controller Spot Cycler
  const btnSolo = document.getElementById('btn-seat-solo');
  const btnCrew = document.getElementById('btn-seat-crew');
  const seatSum = document.getElementById('live-seat-summary');
  const isSolo = (state.gamepad?.profile || 'solo_stage') === 'solo_stage';
  if (btnSolo) { btnSolo.classList.toggle('active', isSolo); btnSolo.setAttribute('aria-pressed', String(isSolo)); }
  if (btnCrew) { btnCrew.classList.toggle('active', !isSolo); btnCrew.setAttribute('aria-pressed', String(!isSolo)); }
  if (seatSum) {
    const gpTxt = state.gamepad?.connectedName ? '🎮 Connected' : '🎮 No Pad (Use Trackpad Bar ↓)';
    const padTxt = state.bridgeInfo?.connectedPads > 0 ? ` · 📱 ${state.bridgeInfo.connectedPads} Pad` : '';
    seatSum.textContent = isSolo
      ? `${gpTxt}${padTxt} · \` cycles Trackpad Spot`
      : `${gpTxt}${padTxt} · Dedicated Spot ${(state.gamepad?.spotIndex || 0) + 1}`;
  }

  const tpBar = document.getElementById('live-trackpad-bar');
  if (tpBar) {
    const curTarget = state.trackpadSpotTarget;
    let tpHtml = `<button type="button" class="btn ${!curTarget ? 'primary active' : ''} tp-spot-btn" data-spid="">🖱 None</button>`;
    for (const sp of state.spots) {
      const dis = sp.enabled === false;
      const act = !dis && curTarget === sp.id;
      tpHtml += `<button type="button" class="btn ${act ? 'warm active' : ''} tp-spot-btn" data-spid="${escapeHtml(sp.id)}" ${dis ? 'disabled' : ''}>🎯 ${escapeHtml(sp.name)}${dis ? ' (Off)' : ''}</button>`;
    }
    tpBar.innerHTML = tpHtml;
    tpBar.querySelectorAll('.tp-spot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setTrackpadSpotTarget(btn.dataset.spid || null);
      });
    });
  }

  // 3. Multi-Spot Optical Bench Rack (Disableable + Deleteable down to 0)
  const spotsRack = document.getElementById('live-spots-rack');
  if (spotsRack) {
    if (state.spots.length === 0) {
      spotsRack.innerHTML = `
        <div class="world-card" style="text-align:center;padding:10px;">
          <div class="mono-dim" style="margin-bottom:6px;">All spotlights deleted — Stage output is 100% clean.</div>
          <button type="button" class="btn warm" id="btn-empty-add-spot">+ Add Spotlight</button>
        </div>
      `;
      spotsRack.querySelector('#btn-empty-add-spot')?.addEventListener('click', () => addSpotInstance());
    } else {
      spotsRack.innerHTML = state.spots.map((sp, idx) => {
        const isAct = idx === (state.activeSpotIndex || 0);
        const isEn = sp.enabled !== false;
        const tpOwned = isEn && state.trackpadSpotTarget === sp.id;
        const isUp = isEn && sp.mode && sp.mode !== 'off';
        const marks = Array.isArray(sp.marks) ? sp.marks : [];
        const T = sp.converge3D && typeof getSpotWorldTargetM === 'function' ? getSpotWorldTargetM(sp) : null;
        const onMark = T && !sp.followPropId ? marks.findIndex(m => m && Math.hypot(m.x - T[0], m.z - T[2]) < 0.08) : -1;
        const lamp = !isEn ? 'OFF' : (!isUp ? 'OUT' : (sp.followPropId ? 'FOLLOWING' : (onMark >= 0 ? `ON M${onMark + 1}` : (tpOwned ? 'DRIVING' : 'UP'))));
        const diaM = sp.converge3D ? getSpotWorldDiameterM(sp) : 0;
        const hint = !isEn ? 'Spot disabled — switch it ON to use it.'
          : !isUp ? `Press <kbd>F</kbd> or PICK UP · it fades in over ${(sp.fadeSec ?? 0.5).toFixed(1)} s where it is aimed.`
          : sp.followPropId ? 'Following the person — move them in BUILD or with marks; Drive ▸ Free to take over.'
          : sp.converge3D ? 'Click the stage floor in the 3D Venue (🗺 Plot = top view) · drag the ring · <kbd>`</kbd> cycles the trackpad spot · <kbd>F</kbd> fades out.'
          : 'Drag the ring on the stage or 🖱 Steer with the trackpad · <kbd>F</kbd> fades out.';
        const ui = _spotConsoleUi.get(sp.id) || {};
        return `
          <div class="live-spot-card spot-console${isAct ? ' active' : ''}${!isEn ? ' spot-disabled' : ''}${isUp ? ' is-up' : ''}" data-spot-idx="${idx}" data-spot-id="${escapeHtml(sp.id)}">
            <div class="world-card-head">
              <button type="button" class="btn ${isAct ? 'primary' : ''} sp-sel" title="Make this the active spot (F, trackpad and the 3D Venue act on it)">🎯 ${escapeHtml(sp.name || `Spot ${idx + 1}`)}</button>
              <span class="spot-lamp lamp-${lamp.split(' ')[0].toLowerCase()}" role="status">${lamp}</span>
              <button type="button" class="btn ${isEn ? 'warm active' : ''} sp-enable" title="Enable or disable this spotlight">${isEn ? 'ON' : 'OFF'}</button>
              <button type="button" class="btn danger sp-del" title="Delete spotlight">✕</button>
            </div>
            <div class="spot-pick-row">
              <button type="button" class="btn spot-pick-btn sp-pick${isUp ? ' up' : ''}" ${!isEn ? 'disabled' : ''} title="Pick up / fade out (F)">${isUp ? '■ FADE OUT' : '⏻ PICK UP'} <kbd>F</kbd></button>
              <button type="button" class="btn ${tpOwned ? 'warm active' : ''} sp-tp" ${!isEn ? 'disabled' : ''} title="Steer this spot with the trackpad / mouse (\` cycles)">${tpOwned ? '🖱 Driving' : '🖱 Steer'}</button>
            </div>
            ${buildSpotDriveHtml(sp)}
            <div class="spot-live-sliders">
              <label class="mini-slider"><span>Size</span><input type="range" min="0.03" max="0.80" step="0.005" value="${sp.radius}" class="sp-iris" aria-label="${escapeHtml(sp.name)} size"><output>${diaM > 0 ? `Ø${diaM.toFixed(2)}m` : `${Math.round(sp.radius * 100)}%`}</output></label>
              <label class="mini-slider"><span>Intensity</span><input type="range" min="0" max="3" step="0.02" value="${sp.gain}" class="sp-gain" aria-label="${escapeHtml(sp.name)} intensity"><output>${sp.gain.toFixed(2)}</output></label>
              <label class="mini-slider"><span>Edge</span><input type="range" min="0.002" max="0.40" step="0.004" value="${sp.softness}" class="sp-edge" aria-label="${escapeHtml(sp.name)} edge softness"><output>${Math.round(sp.softness * 100)}%</output></label>
            </div>
            <details class="spot-fold" data-fold="look"${ui.look ? ' open' : ''}>
              <summary>Look <span class="mono-dim">· ${escapeHtml({ off: 'Beam', beam: 'Pure beam', veil: 'Veil', additive: 'Additive', screen: 'Screen', reveal: 'Reveal', occlude: 'Silhouette' }[sp.mode] || 'Beam')}</span></summary>
              <div class="world-card-grid" style="margin-top:4px;">
                <label class="mini-field"><span>Blend</span><select class="sel-in sp-mode" aria-label="${escapeHtml(sp.name)} blend mode" ${!isEn ? 'disabled' : ''}>
                  <option value="off"${sp.mode === 'off' ? ' selected' : ''}>Out (pre-aim)</option>
                  <option value="beam"${sp.mode === 'beam' ? ' selected' : ''}>Pure beam</option>
                  <option value="veil"${sp.mode === 'veil' ? ' selected' : ''}>Veil dimmer</option>
                  <option value="additive"${sp.mode === 'additive' ? ' selected' : ''}>Additive</option>
                  <option value="screen"${sp.mode === 'screen' ? ' selected' : ''}>Screen</option>
                  <option value="reveal"${sp.mode === 'reveal' ? ' selected' : ''}>Reveal mask</option>
                  <option value="occlude"${sp.mode === 'occlude' ? ' selected' : ''}>Silhouette</option>
                </select></label>
                <label class="mini-field"><span>Colour</span><input type="color" value="${sp.colC || '#fff4d6'}" class="sp-colc" title="Core beam gel / Kelvin tint" aria-label="${escapeHtml(sp.name)} core colour"></label>
                <label class="mini-field"><span>Beam media</span><select class="sel-in sp-content" aria-label="${escapeHtml(sp.name)} beam content">${buildSpotSourceOptionsHtml(sp.contentSrc || '__nebula__', false)}</select></label>
                <label class="mini-field"><span>Gobo</span><select class="sel-in sp-gobo" aria-label="${escapeHtml(sp.name)} gobo source">${buildSpotSourceOptionsHtml(sp.goboSrc || '', true)}</select></label>
                <label class="mini-field"><span>Media fit</span><select class="sel-in sp-fit" aria-label="${escapeHtml(sp.name)} media fit">
                  <option value="beam"${sp.mediaFit !== 'world' ? ' selected' : ''}>Track beam</option>
                  <option value="world"${sp.mediaFit === 'world' ? ' selected' : ''}>World portal</option>
                </select></label>
              </div>
              <label class="mini-slider"><span>Cloud</span><input type="range" min="0" max="1" step="0.02" value="${sp.fbmAmt ?? 1}" class="sp-fbm" aria-label="${escapeHtml(sp.name)} cloud amount"><output>${Math.round((sp.fbmAmt ?? 1) * 100)}%</output></label>
            </details>
            <details class="spot-fold" data-fold="setup"${ui.setup ? ' open' : ''}>
              <summary>Setup <span class="mono-dim">· fade ${(sp.fadeSec ?? 0.5).toFixed(1)} s · ${sp.converge3D ? 'stage aim' : '2D'} · ${(typeof getSpotProjectorList === 'function' && getSpotProjectorList(sp).length) ? getSpotProjectorList(sp).map(n => 'P' + n).join('+') : 'all projectors'}</span></summary>
              ${buildSpotSetupHtml(sp)}
            </details>
            <div class="spot-hint">${hint}</div>
          </div>
        `;
      }).join('');

      spotsRack.querySelectorAll('.live-spot-card').forEach(card => {
        const idx = Number(card.dataset.spotIdx) || 0;
        const sp = state.spots[idx];
        if (!sp) return;
        card.querySelector('.sp-sel')?.addEventListener('click', () => {
          state.activeSpotIndex = idx;
          setActiveSelection('spot', sp.id, sp.name);
          if (state.gamepad?.profile === 'crew_spot') state.gamepad.spotIndex = idx;
          renderLivePerformanceDockUI();
        });
        card.querySelector('.sp-enable')?.addEventListener('click', () => {
          toggleSpotEnabled(sp.id);
        });
        card.querySelector('.sp-del')?.addEventListener('click', () => {
          removeSpotById(sp.id);
        });
        card.querySelectorAll('.sp-tp').forEach(b => b.addEventListener('click', () => {
          setTrackpadSpotTarget(state.trackpadSpotTarget === sp.id ? null : sp.id);
        }));
        card.querySelector('.sp-pick')?.addEventListener('click', () => {
          state.activeSpotIndex = idx;
          if (typeof toggleActiveSpotPickup === 'function') toggleActiveSpotPickup();
        });
        card.querySelectorAll('details.spot-fold').forEach(d => d.addEventListener('toggle', () => {
          const ui = _spotConsoleUi.get(sp.id) || {};
          ui[d.dataset.fold] = d.open;
          _spotConsoleUi.set(sp.id, ui);
        }));
        card.querySelector('.sp-mode')?.addEventListener('change', (e) => {
          sp.mode = e.target.value;
          if (sp.mode === 'beam' && (!sp.contentSrc || sp.contentSrc === '__nebula__')) {
            sp.contentSrc = '__pure_light__';
            sp.fbmAmt = 0.0;
          }
          recordLiveCapturedTrim(`spot:${idx}:mode`, `${sp.name} Mode`, sp.mode);
          state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
          renderLivePerformanceDockUI();
        });
        card.querySelector('.sp-content')?.addEventListener('change', (e) => {
          sp.contentSrc = e.target.value;
          if (sp.contentSrc === '__pure_light__') sp.fbmAmt = 0.0;
          else if (sp.contentSrc === '__nebula__' && sp.fbmAmt === 0) sp.fbmAmt = 1.0;
          recordLiveCapturedTrim(`spot:${idx}:content`, `${sp.name} Content`, sp.contentSrc);
          state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
          renderLivePerformanceDockUI();
        });
        card.querySelector('.sp-gobo')?.addEventListener('change', (e) => {
          sp.goboSrc = e.target.value;
          if (sp.goboSrc && Math.abs(sp.goboRotSpeed || 0) < 0.01) sp.goboRotSpeed = 12.0;
          recordLiveCapturedTrim(`spot:${idx}:gobo`, `${sp.name} Gobo`, sp.goboSrc);
          state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        });
        const bindRange = (cls, prop, fmt) => {
          const el = card.querySelector(cls);
          const out = el?.nextElementSibling;
          el?.addEventListener('input', () => {
            sp[prop] = Number(el.value);
            if (out) out.textContent = fmt(sp[prop]);
            recordLiveCapturedTrim(`spot:${idx}:${prop}`, `${sp.name} ${prop}`, sp[prop]);
            state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
          });
        };
        bindRange('.sp-gain', 'gain', v => v.toFixed(2));
        bindRange('.sp-iris', 'radius', v => (sp.converge3D ? `Ø${getSpotWorldDiameterM(sp).toFixed(2)}m` : `${Math.round(v * 100)}%`));
        bindRange('.sp-edge', 'softness', v => `${Math.round(v * 100)}%`);
        bindRange('.sp-fbm', 'fbmAmt', v => `${Math.round(v * 100)}%`);

        card.querySelector('.sp-colc')?.addEventListener('input', (e) => {
          sp.colC = e.target.value;
          sp.colB = e.target.value;
          state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        });
        card.querySelector('.sp-fit')?.addEventListener('change', (e) => {
          sp.mediaFit = e.target.value;
          state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        });
        bindSpotRoutingControls(card, sp);
      });
    }
  }

  // 4. Live DMX Utility Faders & Haze Burst
  const dmxRack = document.getElementById('live-dmx-rack');
  if (dmxRack) {
    if (state.dmxDevices.length === 0) {
      dmxRack.innerHTML = `<div class="mono-dim" style="padding:4px 0;">Patch Dowsers, Hazers, or Practicals in <strong>1 · BUILD</strong> to get live faders here.</div>`;
    } else {
      dmxRack.innerHTML = state.dmxDevices.map(dev => {
        const isHazer = dev.category === 'atmosphere' || /haze/i.test(dev.name);
        return `
          <div class="world-card" data-dev="${escapeHtml(dev.id)}">
            <div class="world-card-head">
              <strong>🔌 ${escapeHtml(dev.name)}</strong>
              ${isHazer ? `<button type="button" class="btn warm dev-burst">💨 5s Burst</button>` : `<span class="mono-dim">U${dev.universe}.${dev.startAddress}</span>`}
            </div>
            ${dev.channels.filter(c => c.kind !== 'power').map(ch => {
              const cur = ch.seatValue ?? ch.cueValue ?? ch.home ?? 0;
              const parked = ch.parkedValue !== null && ch.parkedValue !== undefined;
              return `
                <div class="mini-slider" data-ch="${escapeHtml(ch.key)}">
                  <span>${escapeHtml(ch.label)}</span>
                  <input type="range" min="0" max="255" step="1" value="${cur}" class="dmx-live-sl" aria-label="${escapeHtml(dev.name)} ${escapeHtml(ch.label)}">
                  <button type="button" class="btn ${parked ? 'warm active' : ''} dmx-park-btn" title="Park channel (overrides DBO & Cues)">${parked ? `P:${ch.parkedValue}` : `${cur}`}</button>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }).join('');

      dmxRack.querySelectorAll('.world-card').forEach(card => {
        const dev = state.dmxDevices.find(d => d.id === card.dataset.dev);
        if (!dev) return;
        card.querySelector('.dev-burst')?.addEventListener('click', () => triggerHazerBurst(dev.id, 5.0));
        card.querySelectorAll('.mini-slider').forEach(row => {
          const chKey = row.dataset.ch;
          const sl = row.querySelector('.dmx-live-sl');
          const pBtn = row.querySelector('.dmx-park-btn');
          sl?.addEventListener('input', () => {
            const v = parseInt(sl.value, 10) || 0;
            setDmxDeviceChannelValue(dev.id, chKey, v, 'seat');
            const ch = dev.channels.find(c => c.key === chKey);
            if (pBtn && (!ch || ch.parkedValue === null)) pBtn.textContent = String(v);
          });
          pBtn?.addEventListener('click', () => {
            const ch = dev.channels.find(c => c.key === chKey);
            if (!ch) return;
            const nextPark = (ch.parkedValue !== null && ch.parkedValue !== undefined) ? null : (ch.seatValue ?? ch.cueValue ?? ch.home ?? 0);
            setDmxDeviceChannelValue(dev.id, chKey, nextPark, 'park');
            renderLivePerformanceDockUI();
          });
        });
      });
    }
  }

  syncCapturedTrimsTrayUI();
}

function bindSpatialGridNavigation(containerEl, itemSelector) {
  if (!containerEl) return;
  const items = Array.from(containerEl.querySelectorAll(itemSelector));
  items.forEach((el, idx) => {
    el.setAttribute('tabindex', idx === 0 ? '0' : '-1');
  });
  if (containerEl._wmSpatialBound) return;
  containerEl._wmSpatialBound = true;

  containerEl.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const innerTarget = (typeof e.composedPath === 'function' ? e.composedPath()[0] : null) || e.target;
    if (innerTarget && innerTarget.matches && innerTarget.matches(':read-write, select, input[type="range"], [role="slider"]')) {
      return;
    }
    const candidates = Array.from(containerEl.querySelectorAll(itemSelector)).filter(el =>
      typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.offsetParent !== null
    );
    const cur = document.activeElement;
    if (!cur || !candidates.includes(cur)) return;

    const curRect = cur.getBoundingClientRect();
    const tol = 2;
    const dirCandidates = candidates.filter(cand => {
      if (cand === cur) return false;
      const r = cand.getBoundingClientRect();
      if (e.key === 'ArrowRight') return r.left >= curRect.right - tol;
      if (e.key === 'ArrowLeft') return r.right <= curRect.left + tol;
      if (e.key === 'ArrowDown') return r.top >= curRect.bottom - tol;
      return r.bottom <= curRect.top + tol;
    });
    if (dirCandidates.length === 0) return; // Do not preventDefault -> preserve native boundary scrolling

    const isHoriz = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    const curCenterPerp = isHoriz ? (curRect.top + curRect.bottom) * 0.5 : (curRect.left + curRect.right) * 0.5;
    const aligned = [];
    const unaligned = [];
    for (const cand of dirCandidates) {
      const r = cand.getBoundingClientRect();
      const gap = e.key === 'ArrowRight' ? Math.max(0, r.left - curRect.right)
        : (e.key === 'ArrowLeft' ? Math.max(0, curRect.left - r.right)
          : (e.key === 'ArrowDown' ? Math.max(0, r.top - curRect.bottom) : Math.max(0, curRect.top - r.bottom)));
      const overlap = isHoriz
        ? (Math.min(curRect.bottom, r.bottom) - Math.max(curRect.top, r.top) > 1)
        : (Math.min(curRect.right, r.right) - Math.max(curRect.left, r.left) > 1);
      const candCenterPerp = isHoriz ? (r.top + r.bottom) * 0.5 : (r.left + r.right) * 0.5;
      const perpOffset = Math.abs(candCenterPerp - curCenterPerp);
      const entry = { cand, gap, perpOffset };
      if (overlap) aligned.push(entry);
      else unaligned.push(entry);
    }

    let winner = null;
    if (aligned.length > 0) {
      aligned.sort((a, b) => (a.gap - b.gap) || (a.perpOffset - b.perpOffset));
      winner = aligned[0].cand;
    } else {
      unaligned.sort((a, b) => (a.gap + 2.5 * a.perpOffset) - (b.gap + 2.5 * b.perpOffset));
      winner = unaligned[0].cand;
    }
    if (!winner) return;

    e.preventDefault();
    candidates.forEach(c => c.setAttribute('tabindex', c === winner ? '0' : '-1'));
    winner.focus();
    if (typeof winner.scrollIntoView === 'function') {
      winner.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });
}

function syncRoomUI() {
  if (typeof document === 'undefined') return;
  if (typeof syncShapesLockUI === 'function') setTimeout(syncShapesLockUI, 0);
  ensureWorldRigSeeded();
  const room = isBuildRoom() ? 'build' : (state.room || 'map');
  state.room = room;
  if (document.body && document.body.dataset) {
    document.body.dataset.room = room;
  }
  const shell = document.getElementById('app-shell');
  if (shell) {
    shell.dataset.room = room;
  }

  const mapBtns = [
    ['btn-room-world', 'build'],
    ['btn-room-map', 'map'],
    ['btn-room-live', 'live']
  ];
  for (const [id, rKey] of mapBtns) {
    const b = document.getElementById(id);
    if (b) {
      const act = room === rKey;
      b.classList.toggle('active', act);
      b.setAttribute('aria-selected', String(act));
    }
  }

  const syncSpaDock = (el, isActive) => {
    if (!el) return;
    el.hidden = false;
    el.classList.add('spa-room-dock');
    el.classList.toggle('inactive', !isActive);
    el.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    if (isActive) el.removeAttribute('inert');
    else el.setAttribute('inert', 'inert');
  };
  syncSpaDock(document.getElementById('world-left-dock'), room === 'build');
  syncSpaDock(document.getElementById('world-right-dock'), room === 'build');
  syncSpaDock(document.getElementById('live-right-dock'), room === 'live');
  syncSpaDock(document.getElementById('left-dock'), room !== 'build');
  syncSpaDock(document.getElementById('right-dock'), room === 'map');

  syncOutputFeedTabsUI();
  syncTrackpadSpotTargetUI();
  syncSelectionDeletePillUI();
  if (room === 'build') {
    renderWorldDocksUI();
    bindSpatialGridNavigation(document.getElementById('world-ghost-presets'), '.ghost-preset-btn');
  }
  if (room === 'live') {
    renderLivePerformanceDockUI();
    bindSpatialGridNavigation(document.getElementById('live-deck-cues'), '.deck-fire-btn');
  }
}

function initRoomsDevicesSpotsBindings() {
  if (typeof document === 'undefined') return;
  ensureWorldRigSeeded();

  // Every field edit in the 1 · BUILD docks becomes undoable. Capture phase runs
  // before the field's own handler mutates state, so the checkpoint holds the old value.
  for (const dockId of ['world-right-dock', 'world-left-dock']) {
    document.getElementById(dockId)?.addEventListener('change', (e) => {
      const t = e.target;
      if (!t || !(t instanceof HTMLElement) || t.dataset.noUndo !== undefined) return;
      if (t.type === 'file' || t.id === 'we-pr-aim-target') return;
      const lbl = t.closest('label')?.querySelector('span')?.textContent?.trim() || t.id || 'Field';
      const who = state.activeSelection?.label || 'World';
      if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint(`${who}: ${lbl}`, `world-edit:${t.id || lbl}`);
    }, true);
  }

  const roomTabList = document.getElementById('room-switcher');
  const roomOrder = ['build', 'map', 'live'];
  const roomBtnIds = { build: 'btn-room-world', map: 'btn-room-map', live: 'btn-room-live' };
  document.getElementById('btn-room-world')?.addEventListener('click', () => setStudioRoom('build'));
  document.getElementById('btn-room-map')?.addEventListener('click', () => setStudioRoom('map'));
  document.getElementById('btn-room-live')?.addEventListener('click', () => setStudioRoom('live'));
  document.getElementById('selection-delete-pill')?.addEventListener('click', () => deleteActiveSelection());

  roomTabList?.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const cur = isBuildRoom() ? 'build' : (state.room || 'map');
    const idx = Math.max(0, roomOrder.indexOf(cur));
    const nextIdx = (idx + (e.key === 'ArrowRight' ? 1 : roomOrder.length - 1)) % roomOrder.length;
    const nextR = roomOrder[nextIdx];
    setStudioRoom(nextR);
    document.getElementById(roomBtnIds[nextR])?.focus();
  });

  // World dock controls
  const bindDimInput = (id, fn) => {
    const el = document.getElementById(id);
    el?.addEventListener('change', () => fn(parseFloat(el.value)));
  };
  bindDimInput('world-stage-w', v => syncWorldStageDimensions(v, null, null));
  bindDimInput('world-stage-h', v => syncWorldStageDimensions(null, v, null));
  bindDimInput('world-stage-d', v => syncWorldStageDimensions(null, null, v));
  document.getElementById('world-stage-shape')?.addEventListener('change', (e) => {
    syncWorldStageDimensions(null, null, null, e.target.value);
    renderWorldDocksUI();
  });
  bindDimInput('world-stage-deck', v => { syncWorldStageDimensions(null, null, null, null, { deckHeightM: v }); renderWorldDocksUI(); });
  const bindRoomInput = (id, key, lo, hi) => {
    const el = document.getElementById(id);
    el?.addEventListener('change', () => {
      const sp = ensureStagePlanState(ensureMultiProjectorState());
      const val = parseFloat(el.value);
      if (!sp || !Number.isFinite(val)) return;
      sp.venue[key] = clamp(val, lo, hi);
      if (typeof markStagePlanDirty === 'function') markStagePlanDirty();
      if (typeof commitRigPhysicalChange === 'function') commitRigPhysicalChange();
      renderWorldDocksUI();
    });
  };
  bindRoomInput('world-room-w', 'roomWidthM', 2, 50);
  bindRoomInput('world-room-d', 'roomDepthM', 2, 50);
  bindRoomInput('world-room-h', 'roomHeightM', 2, 25);
  document.getElementById('btn-world-add-human')?.addEventListener('click', () => {
    if (typeof addWorldProp === 'function') addWorldProp('human');
    if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
  });

  document.getElementById('btn-world-add-screen')?.addEventListener('click', () => {
    addWorldScreen();
  });
  document.getElementById('btn-rig-add-screen')?.addEventListener('click', () => {
    addWorldScreen();
  });
  document.getElementById('btn-rig-solo')?.addEventListener('click', () => {
    const nextSolo = !(state.buildViewMode === 'plan2d' || state.buildViewMode === 'world3d');
    if (nextSolo) {
      const curCam = state.multiProjector?.stagePlan?.viewMode === 'orbit3d' ? 'world3d' : 'plan2d';
      setBuildViewMode(curCam);
    } else {
      setBuildViewMode('split');
    }
  });

  document.getElementById('btn-world-add-proj')?.addEventListener('click', () => {
    ensureWorldRigSeeded();
    if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Add Projector');
    const mp = state.multiProjector;
    mp.enabled = true;
    const nextIdx = Math.min(MAX_MULTI_PROJ_SCREENS, (mp.screens?.length || 0) + 1);
    if ((mp.screens?.length || 0) >= MAX_MULTI_PROJ_SCREENS) {
      showToast(`Maximum ${MAX_MULTI_PROJ_SCREENS} projectors reached`);
      return;
    }
    const scr = createProjectorScreenSlice(nextIdx, { name: `Projector ${nextIdx}` });
    ensureProjectorPjLinkMeta(scr);
    if (typeof autoAimProjectorAtWorldScreen === 'function') autoAimProjectorAtWorldScreen(scr);
    mp.screens.push(scr);
    showToast(`📽 Added P${scr.index} — aimed at ${resolveAutoAimTargetScreen()?.name || 'the stage screen'}`);
    mp.selectedScreenIndex = scr.index;
    state.rigSelectedKind = 'projector';
    setActiveSelection('projector', String(scr.index), `P${scr.index} ${scr.name}`);
    if (typeof commitRigPhysicalChange === 'function') commitRigPhysicalChange();
    syncRoomUI();
    if (typeof syncRigWorkspaceUI === 'function') syncRigWorkspaceUI();
  });

  document.getElementById('btn-world-add-3d')?.addEventListener('click', () => {
    document.getElementById('btn-add-3d')?.click();
    state.rigSelectedKind = 'mesh3d';
    const s = typeof getSelectedSurface === 'function' ? getSelectedSurface() : null;
    if (s) setActiveSelection('surface', s.id, s.name);
    syncRoomUI();
    if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
  });

  document.getElementById('btn-world-add-quad')?.addEventListener('click', () => {
    document.getElementById('btn-add-quad')?.click();
    state.rigSelectedKind = 'surface';
    const s = typeof getSelectedSurface === 'function' ? getSelectedSurface() : null;
    if (s) setActiveSelection('surface', s.id, s.name);
    syncRoomUI();
  });

  document.getElementById('btn-world-add-mask')?.addEventListener('click', () => {
    setBuildViewMode('split');
    document.getElementById('btn-quick-mask')?.click();
    syncRoomUI();
  });

  document.getElementById('btn-world-floorplan')?.addEventListener('click', () => {
    document.getElementById('file-import-floorplan')?.click();
  });
  document.getElementById('btn-rig-floorplan')?.addEventListener('click', () => {
    document.getElementById('file-import-floorplan')?.click();
  });

  document.getElementById('file-import-floorplan')?.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      importFloorplanFromDataUrl(String(reader.result || ''), f.name);
      if (typeof showToast === 'function') showToast(`🗺 Imported Floorplan: ${f.name}`);
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  });

  document.getElementById('btn-world-add-led')?.addEventListener('click', () => {
    if (state.pixelMapper && typeof createDmxFixture === 'function') {
      state.pixelMapper.enabled = true;
      const fx = createDmxFixture('strip', { name: `LED Strip ${state.pixelMapper.fixtures.length + 1}` });
      state.pixelMapper.fixtures.push(fx);
      state.pixelMapper.selectedFixtureId = fx.id;
      state.rigSelectedKind = 'dmx';
      setActiveSelection('led_fixture', fx.id, fx.name);
      syncRoomUI();
      if (typeof syncRigWorkspaceUI === 'function') syncRigWorkspaceUI();
    }
  });

  const addDmxFromPicker = () => {
    const sel = document.getElementById('sel-dmx-template');
    if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Add DMX Device');
    const dev = createDmxDeviceFromTemplate(sel ? sel.value : 'par_rgbw_5ch');
    if (dev) {
      state.rigSelectedKind = 'dmx_device';
      state.selectedDmxDeviceId = dev.id;
      setActiveSelection('dmx_device', dev.id, dev.name);
      renderWorldDocksUI();
      if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
      if (typeof showToast === 'function') showToast(`Added ${dev.name} at ${dev.posM ? dev.posM.map(n => n.toFixed(1)).join(', ') + ' m' : 'the rig'} — drag it in the plan`);
    }
  };
  document.getElementById('btn-world-add-dmx')?.addEventListener('click', addDmxFromPicker);
  document.getElementById('btn-add-dmx-template')?.addEventListener('click', addDmxFromPicker);

  document.getElementById('btn-import-wmdevice')?.addEventListener('click', () => {
    document.getElementById('file-import-wmdevice')?.click();
  });

  document.getElementById('file-import-wmdevice')?.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const dev = importWmDeviceJson(txt);
      if (typeof showToast === 'function') showToast(`✓ Imported DMX Device: ${dev.name}`);
    } catch (err) {
      if (typeof showToast === 'function') showToast(`⚠ .wmdevice import failed: ${err.message}`);
    }
    e.target.value = '';
  });

  document.getElementById('btn-world-open-monitor')?.addEventListener('click', () => {
    openOperatorMonitorWindow();
  });

  // Live dock controls
  document.getElementById('btn-seat-solo')?.addEventListener('click', () => setGamepadSeatProfile('solo_stage'));
  document.getElementById('btn-seat-crew')?.addEventListener('click', () => setGamepadSeatProfile('crew_spot'));
  document.getElementById('btn-live-add-spot')?.addEventListener('click', () => addSpotInstance());
  document.getElementById('btn-live-update-cue')?.addEventListener('click', () => updateActiveCueFromCapturedTrims());
  document.getElementById('btn-live-release-trims')?.addEventListener('click', () => releaseCapturedTrims());
  document.getElementById('btn-mix-solo')?.addEventListener('click', () => toggleLiveMixSolo());
  document.getElementById('btn-mix-del-orb')?.addEventListener('click', () => {
    if (typeof deleteSelectedMixOrb === 'function') deleteSelectedMixOrb();
  });

  // Safety: clear Hold-W surgical reach-through immediately if browser window loses focus!
  window.addEventListener('blur', () => {
    if (state.liveReachThrough) setLiveReachThrough(false);
  });

  syncRoomUI();
}
