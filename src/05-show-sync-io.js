// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05-show-sync-io.js — Show Cues & Crossfades, Dual-Screen Sync & Show JSON I/O
// ============================================================================

const AUTOSAVE_STORAGE_KEY = 'chaoscathode_autosave_v1';
const LEGACY_AUTOSAVE_STORAGE_KEY = 'webmapper_autosave_v1';

// ============================================================================
// 1. CUE SNAPSHOTS & OPTICAL DUAL-FBO CROSSFADE ENGINE (Phase 4.2)
// ============================================================================

function cloneSurfaceData(s) {
  const baseFeather = s.feather ?? ((s.type === 'line' || s.type === 'mesh3d') ? 0.0 : 0.02);
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    linkObject: s.linkObject ? { ...s.linkObject } : null,
    accent: s.accent,
    groupId: s.groupId || null,
    visible: s.visible !== false,
    solo: !!s.solo,
    locked: !!s.locked,
    animateGeomInShow: !!s.animateGeomInShow,
    showCalGrid: !!s.showCalGrid,
    sourceId: s.sourceId,
    mesh3dPrimitive: s.mesh3dPrimitive || 'cube',
    objAssetId: s.objAssetId || null,
    pos3d: Array.isArray(s.pos3d) ? [Number(s.pos3d[0]) || 0, Number(s.pos3d[1]) || 0, Number(s.pos3d[2]) || 0] : [0, 0, 0],
    rot3d: Array.isArray(s.rot3d) ? [Number(s.rot3d[0]) ?? 18, Number(s.rot3d[1]) ?? -28, Number(s.rot3d[2]) ?? 0] : [18, -28, 0],
    scale3d: Array.isArray(s.scale3d) ? [Number(s.scale3d[0]) ?? 1, Number(s.scale3d[1]) ?? 1, Number(s.scale3d[2]) ?? 1] : [1, 1, 1],
    camThrow: s.camThrow ?? 1.20,
    camDist: s.camDist ?? 3.20,
    lensShiftX: s.lensShiftX ?? 0.0,
    lensShiftY: s.lensShiftY ?? 0.0,
    shade3d: s.shade3d || 'lit_wire',
    cull3d: s.cull3d || 'back',
    wireWidth: s.wireWidth ?? 1.35,
    wireGlow: s.wireGlow ?? 0.45,
    wireChase: s.wireChase ?? 0.0,
    wireUseSource: !!s.wireUseSource,
    lightAzim: s.lightAzim ?? 36,
    lightElev: s.lightElev ?? 42,
    lightAmbient: s.lightAmbient ?? 0.28,
    lightDiffuse: s.lightDiffuse ?? 0.85,
    lightSpec: s.lightSpec ?? 0.42,
    lightRim: s.lightRim ?? 0.35,
    calibMode: s.calibMode || 'manual',
    calibPins: Array.isArray(s.calibPins)
      ? s.calibPins.map(p => ({
          vertexIdx: Number.isFinite(p.vertexIdx) ? p.vertexIdx : -1,
          pos3d: [Number(p.pos3d?.[0]) || 0, Number(p.pos3d?.[1]) || 0, Number(p.pos3d?.[2]) || 0],
          stage2d: [Number(p.stage2d?.[0]) || 0.5, Number(p.stage2d?.[1]) || 0.5],
          enabled: p.enabled !== false
        }))
      : [],
    quadWarp: s.quadWarp || 'perspective',
    meshCols: clamp(s.meshCols ?? 3, 2, 16),
    meshRows: clamp(s.meshRows ?? 3, 2, 16),
    meshBrush: s.meshBrush ?? 0.22,
    meshPinCorners: !!s.meshPinCorners,
    meshPts: Array.isArray(s.meshPts) ? s.meshPts.map(p => [p[0], p[1]]) : null,
    points: Array.isArray(s.points) ? s.points.map(p => [p[0], p[1]]) : [],
    triUvs: (s.triUvs || [[0.22, 0.20], [0.78, 0.20], [0.50, 0.84]]).map(p => [p[0], p[1]]),
    polyUvs: Array.isArray(s.polyUvs) ? s.polyUvs.map(p => [p[0], p[1]]) : null,
    lineClosed: !!s.lineClosed,
    lineWidth: s.lineWidth ?? 0.010,
    lineGlow: s.lineGlow ?? 0.55,
    lineChaseMode: s.lineChaseMode || 'chase',
    lineSpeed: s.lineSpeed ?? 0.65,
    lineDuty: s.lineDuty ?? 0.42,
    lineCount: s.lineCount ?? 2,
    lineUseSource: !!s.lineUseSource,
    borderWidth: s.borderWidth ?? 0.0,
    borderGlow: s.borderGlow ?? 0.50,
    borderChase: s.borderChase || 'chase',
    borderSpeed: s.borderSpeed ?? 0.55,
    uvX: s.uvX ?? 0.5,
    uvY: s.uvY ?? 0.5,
    uvW: s.uvW ?? 1.0,
    uvH: s.uvH ?? 1.0,
    uvRot: s.uvRot ?? 0.0,
    cropL: s.cropL ?? 0.0,
    cropR: s.cropR ?? 0.0,
    cropT: s.cropT ?? 0.0,
    cropB: s.cropB ?? 0.0,
    circleSoftness: s.circleSoftness ?? 0.15,
    circleInner: s.circleInner ?? 0.0,
    circleStartAngle: s.circleStartAngle ?? 0,
    circleEndAngle: s.circleEndAngle ?? 360,
    blendMode: s.blendMode || 'normal',
    opacity: s.opacity ?? 1.0,
    feather: baseFeather,
    featherLink: s.featherLink !== false,
    featherL: s.featherL ?? baseFeather,
    featherR: s.featherR ?? baseFeather,
    featherT: s.featherT ?? baseFeather,
    featherB: s.featherB ?? baseFeather,
    blendGamma: s.blendGamma ?? 1.0,
    blackLevel: s.blackLevel ?? 0.0,
    shutterL: s.shutterL ?? 0.0,
    shutterR: s.shutterR ?? 0.0,
    shutterT: s.shutterT ?? 0.0,
    shutterB: s.shutterB ?? 0.0,
    shutterAngL: s.shutterAngL ?? 0.0,
    shutterAngR: s.shutterAngR ?? 0.0,
    shutterAngT: s.shutterAngT ?? 0.0,
    shutterAngB: s.shutterAngB ?? 0.0,
    shutterSoft: s.shutterSoft ?? 0.015,
    brightness: s.brightness ?? 0.0,
    contrast: s.contrast ?? 1.0,
    saturation: s.saturation ?? 1.0,
    colorTemp: s.colorTemp ?? 0.0,
    keyMode: s.keyMode || 'off',
    lumaMin: s.lumaMin ?? 0.08,
    lumaSoftness: s.lumaSoftness ?? 0.08,
    lumaInvert: !!s.lumaInvert,
    chromaColor: s.chromaColor || '#00ff00',
    chromaTolerance: s.chromaTolerance ?? 0.28,
    chromaSoftness: s.chromaSoftness ?? 0.10,
    chromaSpill: s.chromaSpill ?? 0.45,
    gamma: s.gamma ?? 1.0,
    hueShift: s.hueShift ?? 0.0,
    tintColor: s.tintColor || '#6fd3ff',
    tintAmount: s.tintAmount ?? 0.0,
    invertRgb: !!s.invertRgb,
    channelMode: s.channelMode || 'rgb',
    fxChain: cloneFxChain(s.fxChain || []),
    geomRev: s._geomRev || s.geomRev || 1
  };
}

function cloneGroupData(g) {
  return {
    id: g.id,
    name: g.name || 'Group',
    accent: g.accent || '#ffcb7d',
    visible: g.visible !== false,
    solo: !!g.solo,
    locked: !!g.locked,
    opacity: g.opacity ?? 1.0,
    collapsed: !!g.collapsed
  };
}

function cloneMaskData(m) {
  return {
    id: m.id,
    name: m.name,
    mode: m.mode,
    target: m.target,
    feather: m.feather,
    choke: m.choke ?? 0.0,
    opacity: m.opacity,
    invert: !!m.invert,
    smoothAll: !!m.smoothAll,
    curveTension: m.curveTension ?? 0.5,
    curveFlags: Array.isArray(m.curveFlags)
      ? m.points.map((_, idx) => !!m.curveFlags[idx])
      : m.points.map(() => false),
    visible: m.visible !== false,
    locked: !!m.locked,
    points: m.points.map(p => [p[0], p[1]])
  };
}

function captureSceneSnapshot() {
  const shaders = {};
  const isfParams = {};
  const textParams = {};
  for (const src of state.sources) {
    if (src.kind === 'shader') {
      shaders[src.id] = {
        playing: src.playing,
        speed: src.speed,
        scale: src.scale,
        detail: src.detail,
        temp: src.temp,
        palette: src.palette
      };
    } else if (src.kind === 'isf') {
      isfParams[src.id] = {
        playing: src.playing,
        speed: src.speed ?? 1.0,
        isfValues: src.isfValues ? JSON.parse(JSON.stringify(src.isfValues)) : {}
      };
    } else if (src.kind === 'text') {
      textParams[src.id] = serializeTextSource(src);
    }
  }
  const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
  const spotsSnap = Array.isArray(state.spots)
    ? state.spots.map((sp, i) => (typeof cloneSpotData === 'function' ? cloneSpotData(sp, i) : { ...sp }))
    : [state.followspot];
  const dmxCues = {};
  if (Array.isArray(state.dmxDevices)) {
    for (const dev of state.dmxDevices) {
      if (!dev || !Array.isArray(dev.channels)) continue;
      const chMap = {};
      for (const ch of dev.channels) {
        if (ch.kind === 'power') continue;
        chMap[ch.key] = ch.seatValue ?? ch.cueValue ?? ch.home ?? 0;
      }
      dmxCues[dev.id] = chMap;
    }
  }
  return {
    surfaces: state.surfaces.map(cloneSurfaceData),
    groups: (state.groups || []).map(cloneGroupData),
    masks: state.masks.map(cloneMaskData),
    spots: spotsSnap,
    followspot: spotsSnap[0] || null,
    dmxCues,
    masterFxChain: cloneFxChain(state.masterFxChain || []),
    mixbus: mixSrc ? cloneMixbusState(mixSrc) : null,
    modulators: typeof serializeModulators === 'function' ? serializeModulators(state.modulators) : [],
    shaders,
    isfParams,
    textParams
  };
}

function instantiateRuntimeScene(snap) {
  if (!snap) return null;
  const surfaces = (snap.surfaces || []).map(s => {
    const copy = cloneSurfaceData(s);
    copy._meshDirty = true;
    copy._geomRev = copy.geomRev || 1;
    copy._glVerts = null;
    if (copy.type === 'quad' && !copy.meshPts) initSurfaceMeshFromCorners(copy);
    if (copy.type === 'polygon' && !copy.polyUvs && copy.points.length >= 3) syncPolygonUvsFromStage(copy);
    return copy;
  });
  const groups = (snap.groups || []).map(cloneGroupData);
  const masks = (snap.masks || []).map(cloneMaskData);
  const spots = Array.isArray(snap.spots)
    ? snap.spots.map((sp, i) => (typeof cloneSpotData === 'function' ? cloneSpotData(sp, i) : { ...sp }))
    : (snap.followspot ? [{ ...snap.followspot }] : []);
  const followspot = spots[0] || state._detachedFallbackSpot || { ...state.followspot };
  const masterFxChain = cloneFxChain(snap.masterFxChain || []);
  return { surfaces, groups, masks, spots, followspot, masterFxChain, allCalGrids: false };
}

function applySceneSnapshotImmediate(snap) {
  try {
    applySceneSnapshotImmediateInner(snap);
  } finally {
    // Wholesale scene replacement (undo / show load / hard recall) is a new tracking baseline.
    if (typeof rebaseVenueGeometryTracking === 'function') rebaseVenueGeometryTracking();
  }
}

function applySceneSnapshotImmediateInner(snap) {
  if (!snap) return;
  state.drawingSurfaceId = null;
  state.drawingMaskId = null;
  const runtime = instantiateRuntimeScene(snap);
  state.surfaces = runtime.surfaces;
  if (Array.isArray(snap.groups)) {
    state.groups = runtime.groups;
  }
  state.masks = runtime.masks;
  state.masterFxChain = runtime.masterFxChain || [];
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;

  if (Array.isArray(snap.spots)) {
    state._spotsInitialized = true;
    state.spots = snap.spots.map((sp, i) => {
      const prevTime = state.spots?.[i]?.shadowTime ?? 0;
      const cloned = typeof cloneSpotData === 'function' ? cloneSpotData(sp, i) : createSpotObject(i, sp);
      cloned.shadowTime = prevTime;
      return cloned;
    });
    state.followspot = state.spots[0] || state._detachedFallbackSpot || createSpotObject(0);
  } else if (snap.followspot) {
    const keepTime = state.followspot.shadowTime;
    Object.assign(state.followspot, snap.followspot);
    state.followspot.shadowTime = keepTime;
    if (!Array.isArray(state.spots) || state.spots.length === 0) {
      state.spots = [state.followspot];
    } else {
      state.spots[0] = state.followspot;
    }
  }

  if (snap.dmxCues && Array.isArray(state.dmxDevices)) {
    for (const dev of state.dmxDevices) {
      const chMap = snap.dmxCues[dev.id];
      if (!chMap || !Array.isArray(dev.channels)) continue;
      for (const ch of dev.channels) {
        if (ch.kind === 'power') continue;
        if (chMap[ch.key] !== undefined) {
          ch.cueValue = clamp(Math.round(Number(chMap[ch.key])), 0, 255);
        }
      }
    }
  }

  if (snap.mixbus && typeof getMixbusSource === 'function') {
    const mixSrc = getMixbusSource();
    if (mixSrc) applyMixbusState(mixSrc, snap.mixbus);
  }

  if (Array.isArray(snap.modulators) && typeof restoreModulators === 'function') {
    restoreModulators(snap.modulators);
  }

  if (snap.shaders) {
    for (const [id, sh] of Object.entries(snap.shaders)) {
      const src = state.sources.find(s => s.id === id && s.kind === 'shader');
      if (src) {
        src.playing = sh.playing !== false;
        src.speed = sh.speed ?? src.speed;
        src.scale = sh.scale ?? src.scale;
        src.detail = sh.detail ?? src.detail;
        src.temp = sh.temp ?? src.temp;
        src.palette = sh.palette ?? src.palette;
      }
    }
  }

  if (snap.isfParams) {
    for (const [id, ip] of Object.entries(snap.isfParams)) {
      const src = state.sources.find(s => s.id === id && s.kind === 'isf');
      if (src) {
        src.playing = ip.playing !== false;
        src.speed = ip.speed ?? src.speed;
        if (ip.isfValues) {
          src.isfValues = buildDefaultIsfValues(src.isfMeta ? src.isfMeta.inputs : [], ip.isfValues);
        }
      }
    }
  }

  if (snap.textParams) {
    for (const [id, tp] of Object.entries(snap.textParams)) {
      const src = state.sources.find(s => s.id === id && s.kind === 'text');
      if (src) {
        applyTextSourceProps(src, tp);
      }
    }
    state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
  }

  if (!state.surfaces.some(s => s.id === state.selectedSurfaceId)) {
    state.selectedSurfaceId = state.surfaces[0] ? state.surfaces[0].id : null;
  }
  if (Array.isArray(state.selectedSurfaceIds)) {
    const validIds = new Set(state.surfaces.map(s => s.id));
    state.selectedSurfaceIds = state.selectedSurfaceIds.filter(id => validIds.has(id));
    if (state.selectedSurfaceIds.length === 0 && state.selectedSurfaceId) {
      state.selectedSurfaceIds = [state.selectedSurfaceId];
    }
  }
  if (!state.masks.some(m => m.id === state.selectedMaskId)) {
    state.selectedMaskId = state.masks[0] ? state.masks[0].id : null;
  }
}

// ============================================================================
// 1B. 50-STEP COALESCED UNDO / REDO TRANSACTION ENGINE (Milestone 1)
// ============================================================================

const MAX_UNDO_STEPS = 50;

function captureUndoSnapshot() {
  return {
    scene: captureSceneSnapshot(),
    masterKeystone: {
      enabled: !!state.masterKeystone.enabled,
      editOnStage: !!state.masterKeystone.editOnStage,
      lensK1: state.masterKeystone.lensK1 || 0,
      points: state.masterKeystone.points.map(p => [p[0], p[1]])
    },
    cues: state.cues.map(c => ({
      id: c.id,
      name: c.name,
      fadeSec: c.fadeSec,
      cueRole: c.cueRole || 'seq',
      priorityMode: c.priorityMode || 'ltp',
      releaseSec: c.releaseSec ?? 0.8,
      recallFilter: c.recallFilter ? { ...c.recallFilter } : undefined,
      autoFollow: !!c.autoFollow,
      waitSec: c.waitSec ?? 4.0,
      retriggerVideos: !!c.retriggerVideos,
      constellationX: c.constellationX,
      constellationY: c.constellationY,
      snapshot: c.snapshot
    })),
    worldScreens: Array.isArray(state.worldScreens) ? JSON.parse(JSON.stringify(state.worldScreens)) : null,
    selectedWorldScreenId: state.selectedWorldScreenId || null,
    nextWorldScreenNum: state.nextWorldScreenNum || 2,
    floorplan: state.floorplan ? {
      name: state.floorplan.name || '',
      dataUrl: state.floorplan.dataUrl || null,
      widthPx: state.floorplan.widthPx || 0,
      heightPx: state.floorplan.heightPx || 0,
      widthM: state.floorplan.widthM ?? 10.0,
      offsetX: state.floorplan.offsetX ?? 0,
      offsetZ: state.floorplan.offsetZ ?? 0,
      rotDeg: state.floorplan.rotDeg ?? 0,
      opacity: state.floorplan.opacity ?? 0.48,
      locked: !!state.floorplan.locked,
      visible: state.floorplan.visible !== false
    } : null,
    dmxDevices: Array.isArray(state.dmxDevices) ? JSON.parse(JSON.stringify(state.dmxDevices)) : null,
    nextDmxDeviceNum: state.nextDmxDeviceNum || 1,
    worldProps: Array.isArray(state.worldProps) ? JSON.parse(JSON.stringify(state.worldProps)) : null,
    nextWorldPropNum: state.nextWorldPropNum || 1,
    venueParts: Array.isArray(state.venueParts) ? JSON.parse(JSON.stringify(state.venueParts)) : null,
    nextVenuePartNum: state.nextVenuePartNum || 1,
    worldStage: state.worldStage ? { ...state.worldStage } : null,
    activeOverrideCueIds: Array.isArray(state.activeOverrideCueIds) ? [...state.activeOverrideCueIds] : [],
    timeline: typeof serializeTimelineState === 'function' ? serializeTimelineState() : null,
    multiProjector: typeof serializeMultiProjectorState === 'function' ? serializeMultiProjectorState() : null,
    pixelMapper: typeof serializePixelMapperState === 'function' ? serializePixelMapperState() : null,
    activeCueId: state.activeCueId,
    selectedCueId: state.selectedCueId || null,
    selectedSurfaceId: state.selectedSurfaceId,
    selectedSurfaceIds: [...(state.selectedSurfaceIds || [])],
    selectedMaskId: state.selectedMaskId,
    selectedVertex: state.selectedVertex ? { ...state.selectedVertex } : null
  };
}

function restoreUndoSnapshot(uSnap) {
  if (!uSnap) return;
  state.crossfade.active = false;
  state.crossfade.fromScene = null;
  state.crossfade.chainToScene = null;
  applySceneSnapshotImmediate(uSnap.scene);
  if (uSnap.masterKeystone) {
    state.masterKeystone = {
      enabled: !!uSnap.masterKeystone.enabled,
      editOnStage: !!uSnap.masterKeystone.editOnStage,
      lensK1: uSnap.masterKeystone.lensK1 || 0,
      points: uSnap.masterKeystone.points.map(p => [p[0], p[1]])
    };
  }
  if (Array.isArray(uSnap.cues)) {
    state.cues = uSnap.cues.map((c, idx) => {
      const copy = {
        id: c.id,
        name: c.name,
        fadeSec: c.fadeSec,
        cueRole: c.cueRole || 'seq',
        priorityMode: c.priorityMode || 'ltp',
        releaseSec: c.releaseSec ?? 0.8,
        recallFilter: c.recallFilter ? { ...c.recallFilter } : undefined,
        autoFollow: !!c.autoFollow,
        waitSec: c.waitSec ?? 4.0,
        retriggerVideos: !!c.retriggerVideos,
        constellationX: c.constellationX,
        constellationY: c.constellationY,
        snapshot: c.snapshot
      };
      if (typeof ensureCueMilestone5Props === 'function') {
        ensureCueMilestone5Props(copy, idx, uSnap.cues.length);
      }
      return copy;
    });
  }
  if (Array.isArray(uSnap.worldScreens)) {
    state.worldScreens = JSON.parse(JSON.stringify(uSnap.worldScreens));
    state.selectedWorldScreenId = uSnap.selectedWorldScreenId || (state.worldScreens[0]?.id || null);
    state.nextWorldScreenNum = uSnap.nextWorldScreenNum || (state.worldScreens.length + 1);
    if (typeof syncPrimaryVenueFromWorldScreens === 'function') syncPrimaryVenueFromWorldScreens();
  }
  if (uSnap.floorplan && typeof ensureFloorplanState === 'function') {
    const fp = ensureFloorplanState();
    const prevUrl = fp.dataUrl;
    Object.assign(fp, uSnap.floorplan, { calibMode: false, calibPts: [] });
    // The plan renderer reads fp._img; drop the cached image whenever the URL changes so it is rebuilt.
    if (!fp.dataUrl || fp.dataUrl !== prevUrl) {
      fp._img = null;
      ensureFloorplanState();
    }
  }
  if (Array.isArray(uSnap.dmxDevices)) {
    state.dmxDevices = JSON.parse(JSON.stringify(uSnap.dmxDevices));
    state.nextDmxDeviceNum = uSnap.nextDmxDeviceNum || (state.dmxDevices.length + 1);
  }
  if (Array.isArray(uSnap.venueParts)) {
    state.venueParts = JSON.parse(JSON.stringify(uSnap.venueParts));
    state.nextVenuePartNum = uSnap.nextVenuePartNum || (state.venueParts.length + 1);
    if (typeof markVenuePartsDirty === 'function') markVenuePartsDirty();
  }
  if (Array.isArray(uSnap.worldProps)) {
    state.worldProps = JSON.parse(JSON.stringify(uSnap.worldProps));
    state.nextWorldPropNum = uSnap.nextWorldPropNum || (state.worldProps.length + 1);
    state._worldPropsSeeded = true;
  }
  if (uSnap.worldStage) {
    state.worldStage = { ...uSnap.worldStage };
  }
  if (typeof markStagePlanDirty === 'function') markStagePlanDirty();
  state.activeOverrideCueIds = Array.isArray(uSnap.activeOverrideCueIds) ? [...uSnap.activeOverrideCueIds] : [];
  if (uSnap.timeline && typeof restoreTimelineState === 'function') {
    restoreTimelineState(uSnap.timeline);
  }
  if (uSnap.multiProjector && typeof restoreMultiProjectorState === 'function') {
    restoreMultiProjectorState(uSnap.multiProjector);
  }
  if (uSnap.pixelMapper && typeof restorePixelMapperState === 'function') {
    restorePixelMapperState(uSnap.pixelMapper);
  }
  state.activeCueId = uSnap.activeCueId || null;
  state.selectedCueId = uSnap.selectedCueId || null;
  if (uSnap.selectedSurfaceId && state.surfaces.some(s => s.id === uSnap.selectedSurfaceId)) {
    state.selectedSurfaceId = uSnap.selectedSurfaceId;
  }
  if (Array.isArray(uSnap.selectedSurfaceIds)) {
    const valid = new Set(state.surfaces.map(s => s.id));
    state.selectedSurfaceIds = uSnap.selectedSurfaceIds.filter(id => valid.has(id));
    if (state.selectedSurfaceIds.length === 0 && state.selectedSurfaceId) {
      state.selectedSurfaceIds = [state.selectedSurfaceId];
    }
  }
  if (uSnap.selectedMaskId && state.masks.some(m => m.id === uSnap.selectedMaskId)) {
    state.selectedMaskId = uSnap.selectedMaskId;
  }
  state.selectedVertex = uSnap.selectedVertex ? { ...uSnap.selectedVertex } : null;
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;

  renderSurfaceList();
  renderMaskList();
  renderCueList();
  syncTopbarUI();
  syncInspectorUI();
  syncMaskInspectorUI();
  syncFollowspotInspectorUI();
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  if (typeof syncCueRecallToolbarUI === 'function') syncCueRecallToolbarUI();
  if (typeof syncRoomUI === 'function') syncRoomUI();
  if (typeof renderRigWorkspaceCanvas === 'function' && state.layoutMode === 'rig') renderRigWorkspaceCanvas();
  syncTransportUI();
}

function syncUndoButtonsUI() {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) {
    const top = state.undoStack[state.undoStack.length - 1];
    btnUndo.disabled = state.undoStack.length === 0;
    btnUndo.title = top ? `Undo ${top.label} (Cmd/Ctrl+Z)` : 'Undo (Cmd/Ctrl+Z)';
  }
  if (btnRedo) {
    const top = state.redoStack[state.redoStack.length - 1];
    btnRedo.disabled = state.redoStack.length === 0;
    btnRedo.title = top ? `Redo ${top.label} (Cmd/Ctrl+Shift+Z)` : 'Redo (Cmd/Ctrl+Shift+Z)';
  }
}

function clearUndoHistory() {
  state.undoStack = [];
  state.redoStack = [];
  state.pendingUndoGesture = null;
  state.lastCoalesceKey = null;
  state.lastCoalesceMs = 0;
  syncUndoButtonsUI();
}

function pushUndoCheckpoint(label, coalesceKey = null) {
  if (state.isProjectorRole) return;
  // Every user edit is preceded by a checkpoint: make sure geometry tracking has a pre-edit baseline.
  if (!_venueGeomBase) rebaseVenueGeometryTracking();
  const now = performance.now();
  if (
    coalesceKey &&
    state.lastCoalesceKey === coalesceKey &&
    (now - state.lastCoalesceMs) < 950 &&
    state.undoStack.length > 0
  ) {
    state.lastCoalesceMs = now;
    return;
  }
  state.undoStack.push({ label: label || 'Edit', snap: captureUndoSnapshot() });
  if (state.undoStack.length > MAX_UNDO_STEPS) {
    state.undoStack.shift();
  }
  state.redoStack = [];
  state.lastCoalesceKey = coalesceKey;
  state.lastCoalesceMs = now;
  syncUndoButtonsUI();
}

function beginUndoGesture(label) {
  if (state.isProjectorRole) return;
  if (!_venueGeomBase) rebaseVenueGeometryTracking();
  const snap = captureUndoSnapshot();
  state.pendingUndoGesture = {
    label: label || 'Transform',
    snap,
    sig: JSON.stringify([
      snap.scene.surfaces,
      snap.scene.masks,
      snap.masterKeystone,
      snap.scene.masterFxChain,
      snap.scene.mixbus,
      snap.worldScreens,
      snap.multiProjector,
      snap.floorplan ? [snap.floorplan.widthM, snap.floorplan.offsetX, snap.floorplan.offsetZ, snap.floorplan.rotDeg] : null
    ])
  };
}

function commitUndoGesture() {
  const pending = state.pendingUndoGesture;
  state.pendingUndoGesture = null;
  if (!pending || state.isProjectorRole) return;
  const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
  const curSig = JSON.stringify([
    state.surfaces.map(cloneSurfaceData),
    state.masks.map(cloneMaskData),
    state.masterKeystone,
    cloneFxChain(state.masterFxChain || []),
    mixSrc ? cloneMixbusState(mixSrc) : null,
    state.worldScreens || null,
    typeof serializeMultiProjectorState === 'function' ? serializeMultiProjectorState() : null,
    state.floorplan ? [state.floorplan.widthM, state.floorplan.offsetX, state.floorplan.offsetZ, state.floorplan.rotDeg] : null
  ]);
  if (curSig === pending.sig) return; // Click without drag — don't pollute undo stack!

  state.undoStack.push({ label: pending.label, snap: pending.snap });
  if (state.undoStack.length > MAX_UNDO_STEPS) {
    state.undoStack.shift();
  }
  state.redoStack = [];
  state.lastCoalesceKey = null;
  syncUndoButtonsUI();
  scheduleAutosave();
}

function performUndo() {
  if (state.undoStack.length === 0) {
    showToast('Nothing to undo');
    return;
  }
  const entry = state.undoStack.pop();
  state.redoStack.push({ label: entry.label, snap: captureUndoSnapshot() });
  state.lastCoalesceKey = null;
  restoreUndoSnapshot(entry.snap);
  syncUndoButtonsUI();
  scheduleAutosave();
  showToast(`Undo: ${entry.label}`);
}

function performRedo() {
  if (state.redoStack.length === 0) {
    showToast('Nothing to redo');
    return;
  }
  const entry = state.redoStack.pop();
  state.undoStack.push({ label: entry.label, snap: captureUndoSnapshot() });
  state.lastCoalesceKey = null;
  restoreUndoSnapshot(entry.snap);
  syncUndoButtonsUI();
  scheduleAutosave();
  showToast(`Redo: ${entry.label}`);
}

// ----------------------------------------------------------------------------
// VENUE GEOMETRY TRACKING (BUILD calibration ↔ cue looks)
// Physical warp/calibration edits made in 1 · BUILD (or Hold-W reach-through) must
// not be undone by firing an older cue that recalls geometry. Like a lighting
// console's tracking: every cue still holding the *previous* calibration value is
// moved to the new one; cues that deliberately differ (e.g. a curved-mesh look)
// keep their look, re-projected onto the newly calibrated quad.
// ----------------------------------------------------------------------------
const VENUE_TRACK_GEOM_KEYS = [
  'type', 'points', 'quadWarp', 'meshCols', 'meshRows', 'meshPts', 'bezierTangents',
  'circleSoftness', 'circleInner', 'circleStartAngle', 'circleEndAngle', 'lineClosed',
  'mesh3dPrimitive', 'objAssetId', 'pos3d', 'rot3d', 'scale3d',
  'camThrow', 'camDist', 'lensShiftX', 'lensShiftY', 'calibMode', 'calibPins'
];
let _venueGeomBase = null; // Map<surfaceId, {key: json}>
// Copy-on-write replacements (old cue snapshot → tracked snapshot), so a recall that was
// handed the pre-tracking snapshot object still applies the tracked one.
const _trackedSnapshotSuccessor = new WeakMap();
function resolveTrackedSnapshot(snap) {
  let cur = snap;
  for (let guard = 0; guard < 16 && cur && _trackedSnapshotSuccessor.has(cur); guard++) cur = _trackedSnapshotSuccessor.get(cur);
  return cur;
}

function venueGeomSignature(surf) {
  const sig = {};
  for (const k of VENUE_TRACK_GEOM_KEYS) sig[k] = surf[k] === undefined ? undefined : JSON.stringify(surf[k]);
  return sig;
}

// Deep equality with float tolerance (stored snapshots carry 0.8599999999999999-style noise).
function geomValuesNear(a, b, eps = 1e-6) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= eps;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!geomValuesNear(a[i], b[i], eps)) return false;
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!geomValuesNear(a[k], b[k], eps)) return false;
    return true;
  }
  return false;
}
const parseGeomSig = (j) => (j === undefined ? undefined : JSON.parse(j));

function rebaseVenueGeometryTracking() {
  _venueGeomBase = new Map((state.surfaces || []).map(s => [s.id, venueGeomSignature(s)]));
}

// Map stage points that were laid out on quad `oldPts` onto quad `newPts`.
function remapPointsBetweenQuads(list, oldPts, newPts) {
  if (!Array.isArray(list) || !Array.isArray(oldPts) || !Array.isArray(newPts) || oldPts.length !== 4 || newPts.length !== 4) return list;
  const hOld = computeQuadHomography(oldPts);
  const hNew = computeQuadHomography(newPts);
  if (!hOld || !hNew) return list;
  // Full 3×3 inverse of the old unit-square→quad homography (sign-agnostic, unlike the render-path helper).
  const [a, b, c, d, e, f, g, h, i] = hOld.H;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return list;
  const inv = [A, c * h - b * i, b * f - c * e, B, a * i - c * g, c * d - a * f, C, b * g - a * h, a * e - b * d].map(v => v / det);
  return list.map(p => {
    if (!Array.isArray(p)) return p;
    const qx = inv[0] * p[0] + inv[1] * p[1] + inv[2];
    const qy = inv[3] * p[0] + inv[4] * p[1] + inv[5];
    const qz = inv[6] * p[0] + inv[7] * p[1] + inv[8];
    if (Math.abs(qz) < 1e-12) return p;
    const q = evalHomographyForward(hNew.H, qx / qz, qy / qz);
    return (Number.isFinite(q[0]) && Number.isFinite(q[1])) ? q : p;
  });
}

// Returns the number of cue values updated. Safe to call any time (cheap no-op when nothing changed).
function trackVenueGeometryIntoCues() {
  if (!_venueGeomBase) { rebaseVenueGeometryTracking(); return 0; }
  let updates = 0;
  const touchedCueIds = new Set();
  // 3D pose driven by modulators / timeline keyframes is automation, never calibration.
  let automationRefs = '';
  try {
    automationRefs = JSON.stringify((state.modulators || []).map(m => m && m.targetKey)) + JSON.stringify(state.timeline || null);
  } catch (_) {}
  const programPseudo = (typeof isProgramHeld === 'function' && isProgramHeld())
    ? { id: '__program__', snapshot: state.program.snap, recallFilter: null } : null;
  const trackTargets = programPseudo ? [...(state.cues || []), programPseudo] : (state.cues || []);
  for (const surf of state.surfaces || []) {
    const base = _venueGeomBase.get(surf.id);
    if (!base || surf.animateGeomInShow) continue;
    const now = venueGeomSignature(surf);
    const poseAutomated = automationRefs.includes('surface:' + surf.id + ':');
    const changed = VENUE_TRACK_GEOM_KEYS.filter(k => !geomValuesNear(parseGeomSig(now[k]), parseGeomSig(base[k])) &&
      !(poseAutomated && (k === 'pos3d' || k === 'rot3d' || k === 'scale3d')));
    if (changed.length === 0) continue;
    const quadMoved = changed.includes('points') && Array.isArray(surf.points) && surf.points.length === 4 && base.points;
    for (const cue of trackTargets) {
      const snap = cue.snapshot;
      if (!snap || !Array.isArray(snap.surfaces)) continue;
      if (cue.recallFilter && cue.recallFilter.geometry === false) continue;
      const idx = snap.surfaces.findIndex(x => x && x.id === surf.id);
      if (idx < 0) continue;
      const cs = { ...snap.surfaces[idx] }; // copy-on-write: undo history shares snapshot objects
      let touched = false;
      const cueHadOldQuad = quadMoved && geomValuesNear(cs.points, parseGeomSig(base.points));
      for (const k of changed) {
        if (geomValuesNear(cs[k], parseGeomSig(base[k]))) {
          cs[k] = now[k] === undefined ? undefined : JSON.parse(now[k]);
          touched = true;
          updates++;
        }
      }
      // A cue with its own curved-mesh look on the same corners: carry the look onto the new corners.
      if (cueHadOldQuad && Array.isArray(cs.meshPts) && !geomValuesNear(cs.meshPts, parseGeomSig(now.meshPts))) {
        cs.meshPts = remapPointsBetweenQuads(cs.meshPts, JSON.parse(base.points), surf.points);
        touched = true;
        updates++;
      }
      if (touched) {
        touchedCueIds.add(cue.id);
        cs.geomRev = (Number(cs.geomRev) || 1) + 1;
        const surfaces = snap.surfaces.slice();
        surfaces[idx] = cs;
        cue.snapshot = { ...snap, surfaces };
        _trackedSnapshotSuccessor.set(snap, cue.snapshot);
      }
    }
  }
  rebaseVenueGeometryTracking();
  if (programPseudo && programPseudo.snapshot !== state.program.snap && typeof trackGeometryIntoHeldProgram === 'function') {
    trackGeometryIntoHeldProgram(ps => { ps.snapshot = programPseudo.snapshot; });
  }
  touchedCueIds.delete('__program__');
  if (touchedCueIds.size > 0) {
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    if (typeof showToast === 'function') {
      showToast(`📐 Venue calibration tracked into ${touchedCueIds.size} cue${touchedCueIds.size === 1 ? '' : 's'}`);
    }
  }
  return updates;
}

// Set up the outgoing side of a new dissolve. If a dissolve (auto or T-bar) is already
// in progress, the renderer bakes the currently visible mix into a still and the new
// cue fades out of that — GO mid-fade never pops back to the previous target.
function beginCueCrossfadeFromVisible(precapturedSnap = null) {
  const xf = state.crossfade;
  const midFade = xf.active && Number(xf.mix) > 0.001 && Number(xf.mix) < 0.999;
  // 1. Interrupting a plain animated fade: keep BOTH of its looks rendering live and blend them at
  //    the GO-time mix as the new outgoing side — no pop and no frozen frame.
  if (midFade && xf.fromScene && !xf.chainToScene) {
    xf.chainToScene = instantiateRuntimeScene(precapturedSnap || captureSceneSnapshot());
    xf.chainMix = Number(xf.mix) || 0;
    xf.freezeRequest = false;
    xf.frozenFrom = false;
    return 'chained';
  }
  // 2. Interrupting an already chained / frozen fade (3rd GO inside one dissolve): bake a still.
  if (midFade && typeof document !== 'undefined') {
    xf.freezeRequest = true;
    xf.freezeMix = Number(xf.mix) || 0;
    xf.freezeSeq = (Number(xf.freezeSeq) || 0) + 1; // projector windows replay the bake on a new seq
    xf.fromScene = null;
    xf.chainToScene = null;
    xf.frozenFrom = true;
    return 'frozen';
  }
  xf.freezeRequest = false;
  xf.frozenFrom = false;
  xf.chainToScene = null;
  xf.fromScene = instantiateRuntimeScene(precapturedSnap || captureSceneSnapshot());
  return 'scene';
}

function triggerCueById(cueId, opts = {}) {
  const cueIdx = state.cues.findIndex(c => c.id === cueId);
  const cue = cueIdx >= 0 ? state.cues[cueIdx] : null;
  if (!cue || !cue.snapshot) return false;
  if (typeof ensureCueMilestone5Props === 'function') {
    ensureCueMilestone5Props(cue, cueIdx, state.cues.length);
  }
  // Out-of-Sequence Deck Cues fire via triggerDeckCue so they never hijack sequenced playback position!
  if (cue.cueRole === 'deck' && !opts.forceSequence && typeof triggerDeckCue === 'function') {
    return triggerDeckCue(cueId);
  }
  // Simultaneous Live Engine (Bug #1 Fix): never kill constellation.active on Cue GO;
  // instead, smoothly align constellation target if active so Cues + Constellation + Spots coexist!
  if (state.constellation && state.constellation.active) {
    if (Number.isFinite(cue.constellationX)) state.constellation.targetX = cue.constellationX;
    if (Number.isFinite(cue.constellationY)) state.constellation.targetY = cue.constellationY;
  }

  const dur = opts.fadeOverride !== undefined ? Math.max(0, Number(opts.fadeOverride) || 0) : Math.max(0, Number(cue.fadeSec) || 0);
  // Program held (Blind): in MAP a recall only loads Preview; in LIVE, GO dissolves
  // from what the audience actually sees and ends the hold.
  const heldFrom = (state.room === 'live' && typeof consumeHeldProgramForGo === 'function') ? consumeHeldProgramForGo() : null;
  state.activeCueId = cue.id;
  state.selectedCueId = cue.id;
  state.manualTouchedKeys = {};
  if (state.cuePlayback) {
    state.cuePlayback.tbarHeld = false;
    state.cuePlayback.tbarMix = 0;
  }
  const applyFn = () => {
    if (typeof applySelectiveSceneSnapshot === 'function') {
      applySelectiveSceneSnapshot(cue.snapshot, cue.recallFilter, cue.retriggerVideos);
    } else {
      applySceneSnapshotImmediate(cue.snapshot);
    }
    // Keep any active Out-of-Sequence Priority Override cues locked on top of sequenced playback!
    if (typeof applyActivePriorityOverrides === 'function') {
      applyActivePriorityOverrides();
    }
  };

  if (dur <= 0.04) {
    state.crossfade.active = false;
    state.crossfade.mix = 1.0;
    state.crossfade.fromScene = null;
    state.crossfade.chainToScene = null;
    applyFn();
    updateCrossfadeProgressUI(0, `Live: ${cue.name}`);
  } else {
    beginCueCrossfadeFromVisible(heldFrom);
    state.crossfade.active = true;
    state.crossfade.elapsed = 0;
    state.crossfade.duration = dur;
    state.crossfade.mix = 0.0;
    applyFn();
    updateCrossfadeProgressUI(0.02, `Fading → ${cue.name}`);
  }

  if (typeof startCueAutoFollow === 'function') {
    startCueAutoFollow(cue);
  }

  renderSurfaceList();
  renderMaskList();
  renderCueList();
  syncInspectorUI();
  syncMaskInspectorUI();
  syncFollowspotInspectorUI();
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  if (typeof syncCueRecallToolbarUI === 'function') syncCueRecallToolbarUI();
  if (typeof syncShowRailUI === 'function') syncShowRailUI();
  if (typeof renderLivePerformanceDockUI === 'function' && state.room === 'live') {
    renderLivePerformanceDockUI();
  }
  syncTransportUI();
  if (typeof emitWebMapperEvent === 'function') {
    emitWebMapperEvent('cue', { id: cue.id, name: cue.name, fadeSec: dur });
  }
  return true;
}

function stepCue(dir = 1) {
  const seqCues = state.cues.filter(c => c.cueRole !== 'deck');
  if (seqCues.length === 0) {
    showToast('No sequenced cues stored yet — click + Store in 2 · MAP');
    return false;
  }
  const idx = seqCues.findIndex(c => c.id === state.activeCueId);
  let targetIdx;
  if (idx < 0) {
    targetIdx = dir > 0 ? 0 : seqCues.length - 1;
  } else {
    targetIdx = idx + dir;
  }
  if (targetIdx >= seqCues.length) {
    updateCrossfadeProgressUI(0, 'END OF LIST');
    if (typeof syncShowRailUI === 'function') syncShowRailUI();
    showToast('END OF LIST — click Cue 1 to restart show');
    return false;
  }
  if (targetIdx < 0) {
    showToast('Already at first sequenced cue');
    return false;
  }
  triggerCueById(seqCues[targetIdx].id, { forceSequence: true });
  return true;
}

function storeNewCue(opts = {}) {
  pushUndoCheckpoint('Store Cue');
  trackVenueGeometryIntoCues();
  const num = state.nextCueNum++;
  const role = opts && opts.cueRole === 'deck' ? 'deck' : 'seq';
  const prio = opts && opts.priorityMode ? (opts.priorityMode === 'override' ? 'override' : 'ltp') : (role === 'deck' ? 'override' : 'ltp');
  const includeVenueGeom = state.cueRecordScope === 'show_venue';
  const seqCount = state.cues.filter(c => c.cueRole !== 'deck').length;
  const deckCount = state.cues.filter(c => c.cueRole === 'deck').length;
  const defaultName = role === 'deck'
    ? `Action ${deckCount + 1}`
    : `${seqCount + 1}. Scene Cue ${num}`;
  const cue = {
    id: `cue_${num}_${Math.random().toString(36).slice(2, 5)}`,
    name: opts && opts.name ? String(opts.name) : defaultName,
    fadeSec: opts && (opts.fadeSec !== undefined || opts.fadeDuration !== undefined)
      ? Number(opts.fadeSec ?? opts.fadeDuration)
      : (role === 'deck' ? 0.6 : 2.0),
    cueRole: role,
    priorityMode: prio,
    releaseSec: opts && opts.releaseSec !== undefined ? Number(opts.releaseSec) : 0.8,
    recallFilter: {
      geometry: includeVenueGeom,
      media: true,
      gradingFx: true,
      masks: includeVenueGeom,
      followspot: true,
      modulators: true
    },
    snapshot: captureSceneSnapshot()
  };
  if (typeof ensureCueMilestone5Props === 'function') {
    ensureCueMilestone5Props(cue, state.cues.length, state.cues.length + 1);
  }
  state.cues.push(cue);
  if (role === 'seq') {
    state.activeCueId = cue.id;
  }
  state.selectedCueId = cue.id;
  if (typeof setActiveSelection === 'function') {
    setActiveSelection('cue', cue.id, cue.name);
  }
  state.manualTouchedKeys = {};
  renderCueList();
  if (typeof syncCueRecallToolbarUI === 'function') syncCueRecallToolbarUI();
  if (typeof syncShowRailUI === 'function') syncShowRailUI();
  if (typeof renderLivePerformanceDockUI === 'function' && state.room === 'live') {
    renderLivePerformanceDockUI();
  }
  scheduleAutosave();
  showToast(role === 'deck'
    ? `Stored Out-of-Sequence Cue: ${cue.name} (${prio === 'override' ? '⚡ Priority Override' : 'LTP'})`
    : `Stored ${cue.name} (${includeVenueGeom ? 'Show + Venue Geom' : 'Show Only — Venue Safe'})`);
  return cue;
}

function updateActiveCue() {
  trackVenueGeometryIntoCues();
  const targetId = state.selectedCueId || state.activeCueId;
  const cue = state.cues.find(c => c.id === targetId) || state.cues.find(c => c.id === state.activeCueId);
  if (!cue) {
    storeNewCue();
    return;
  }
  pushUndoCheckpoint(`Update ${cue.name}`);
  if (typeof ensureCueMilestone5Props === 'function') {
    ensureCueMilestone5Props(cue, state.cues.indexOf(cue), state.cues.length);
  }
  cue.snapshot = captureSceneSnapshot();
  state.manualTouchedKeys = {};
  renderCueList();
  if (typeof syncCueRecallToolbarUI === 'function') syncCueRecallToolbarUI();
  if (typeof syncShowRailUI === 'function') syncShowRailUI();
  if (typeof renderLivePerformanceDockUI === 'function' && state.room === 'live') {
    renderLivePerformanceDockUI();
  }
  scheduleAutosave();
  showToast(`Updated ${cue.name}`);
}

function deleteCueById(cueId) {
  const targetId = cueId || state.selectedCueId || state.activeCueId;
  if (!targetId) return false;
  const idx = state.cues.findIndex(c => c.id === targetId);
  if (idx < 0) return false;
  pushUndoCheckpoint('Delete Cue');
  const removed = state.cues.splice(idx, 1)[0];
  if (Array.isArray(state.activeOverrideCueIds)) {
    state.activeOverrideCueIds = state.activeOverrideCueIds.filter(id => id !== removed.id);
  }
  if (state.activeCueId === removed.id) {
    const seqCues = state.cues.filter(c => c.cueRole !== 'deck');
    state.activeCueId = seqCues[Math.min(idx, Math.max(0, seqCues.length - 1))]?.id || null;
  }
  if (state.selectedCueId === removed.id) {
    state.selectedCueId = state.cues[Math.min(idx, state.cues.length - 1)]?.id || state.activeCueId || null;
  }
  if (state.activeSelection?.kind === 'cue' && state.activeSelection.id === removed.id && typeof setActiveSelection === 'function') {
    setActiveSelection(null, null, '');
  }
  if (typeof cancelCueAutoFollow === 'function') cancelCueAutoFollow();
  renderCueList();
  if (typeof syncCueRecallToolbarUI === 'function') syncCueRecallToolbarUI();
  if (typeof syncShowRailUI === 'function') syncShowRailUI();
  if (typeof renderLivePerformanceDockUI === 'function' && state.room === 'live') {
    renderLivePerformanceDockUI();
  }
  scheduleAutosave();
  showToast(`Deleted ${removed.name}`);
  return true;
}

function deleteActiveCue() {
  return deleteCueById(state.selectedCueId || state.activeCueId);
}

function setLiveCueTBar(mix01) {
  const m = clamp(Number(mix01) || 0, 0, 1);
  if (!state.cuePlayback) {
    state.cuePlayback = { paused: false, rate: 1.0, tbarHeld: false, tbarMix: 0 };
  }
  if (!state.crossfade.active) {
    if (m <= 0.002) {
      state.cuePlayback.tbarHeld = false;
      state.cuePlayback.tbarMix = 0;
      return false;
    }
    const seqCues = state.cues.filter(c => c.cueRole !== 'deck');
    if (seqCues.length === 0) return false;
    const curIdx = seqCues.findIndex(c => c.id === state.activeCueId);
    const nextCue = seqCues.length >= 2
      ? seqCues[(curIdx + 1 + seqCues.length) % seqCues.length]
      : seqCues[0];
    if (!nextCue || !nextCue.snapshot) return false;
    const outgoingSnap = captureSceneSnapshot();
    state.crossfade.fromScene = instantiateRuntimeScene(outgoingSnap);
    state.crossfade.chainToScene = null;
    state.crossfade.active = true;
    state.crossfade.duration = Math.max(0.5, Number(nextCue.fadeSec) || 2.0);
    state.activeCueId = nextCue.id;
    state.selectedCueId = nextCue.id;
    if (typeof applySelectiveSceneSnapshot === 'function') {
      applySelectiveSceneSnapshot(nextCue.snapshot, nextCue.recallFilter, nextCue.retriggerVideos);
    } else {
      applySceneSnapshotImmediate(nextCue.snapshot);
    }
    if (typeof applyActivePriorityOverrides === 'function') {
      applyActivePriorityOverrides();
    }
    renderCueList();
  }

  state.cuePlayback.tbarHeld = true;
  state.cuePlayback.tbarMix = m;
  state.crossfade.mix = m;
  state.crossfade.elapsed = m * Math.max(0.05, state.crossfade.duration);

  const activeCue = state.cues.find(c => c.id === state.activeCueId);
  if (m >= 0.998) {
    state.crossfade.active = false;
    state.crossfade.mix = 1.0;
    state.crossfade.fromScene = null;
    state.crossfade.chainToScene = null;
    state.cuePlayback.tbarHeld = false;
    state.cuePlayback.tbarMix = 0;
    updateCrossfadeProgressUI(0, activeCue ? `Live: ${activeCue.name}` : 'Ready');
  } else {
    updateCrossfadeProgressUI(m, `T-Bar ${Math.round(m * 100)}% → ${activeCue ? activeCue.name : 'Next'}`);
  }
  return true;
}

function updateCrossfade(dt) {
  if (!state.crossfade.active) return;
  if (state.cuePlayback && (state.cuePlayback.paused || state.cuePlayback.tbarHeld)) return;
  const rate = clamp(Number(state.cuePlayback?.rate) || 1.0, 0.1, 8.0);
  state.crossfade.elapsed += dt * rate;
  const rawT = clamp(state.crossfade.elapsed / Math.max(0.05, state.crossfade.duration), 0, 1);
  // Smooth S-curve optical dissolve
  state.crossfade.mix = rawT * rawT * (3.0 - 2.0 * rawT);

  const activeCue = state.cues.find(c => c.id === state.activeCueId);
  if (rawT >= 1.0) {
    state.crossfade.active = false;
    state.crossfade.mix = 1.0;
    state.crossfade.fromScene = null;
    state.crossfade.chainToScene = null;
    updateCrossfadeProgressUI(0, activeCue ? `Live: ${activeCue.name}` : 'Ready');
  } else {
    const pct = Math.round(rawT * 100);
    updateCrossfadeProgressUI(rawT, `Dissolve ${pct}%`);
  }
}

function updateCrossfadeProgressUI(progress01, statusLabel) {
  const bar = document.getElementById('xfade-progress-bar');
  const readout = document.getElementById('cue-status-readout');
  const pct = Math.round(clamp(progress01, 0, 1) * 100);
  if (bar) bar.style.width = `${pct}%`;
  if (readout && statusLabel) readout.textContent = statusLabel;
  if (state.room === 'live' && typeof document !== 'undefined') {
    const tbar = document.getElementById('live-cue-tbar');
    const out = document.getElementById('live-cue-tbar-out');
    if (tbar && document.activeElement !== tbar) {
      // Reflect external takes (MIDI / OSC / API) too; a held handle shows its parked position.
      const held = !!state.cuePlayback?.tbarHeld;
      const shown = held ? Math.round(clamp(Number(state.cuePlayback.tbarMix) || 0, 0, 1) * 100) : pct;
      tbar.value = String(shown);
      if (out) out.textContent = held ? `H:${shown}%` : `${shown}%`;
    }
  }
}

// ============================================================================
// 2. DUAL-SCREEN PROJECTOR OUTPUT & ZERO-COPY SYNC (Phase 4.1)
// ============================================================================

let projectorWindow = null;
let projectorConnected = false;
let lastProjectorPongMs = 0;
let syncMsgSeq = 1;
const handledMsgUids = new Set();

let bcChannel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    bcChannel = new BroadcastChannel('chaoscathode_sync_v1');
  }
} catch (_) {
  bcChannel = null;
}

function sendSyncPayload(payload) {
  const msg = { ...payload, _wm: 1, _uid: `${Date.now()}_${syncMsgSeq++}_${Math.random().toString(36).slice(2, 6)}` };
  let sentDirect = false;
  if (state.isProjectorRole) {
    if (window.opener && !window.opener.closed) {
      try { window.opener.postMessage(msg, '*'); sentDirect = true; } catch (_) {}
    }
  } else {
    const wins = typeof getOpenProjectorWindowsList === 'function'
      ? getOpenProjectorWindowsList()
      : ((projectorWindow && !projectorWindow.closed) ? [projectorWindow] : []);
    for (const w of wins) {
      try { w.postMessage(msg, '*'); sentDirect = true; } catch (_) {}
    }
  }
  // Fall back to BroadcastChannel when standalone tab(s) are open without direct window references
  if ((!sentDirect || (state.multiProjector && state.multiProjector.enabled)) && bcChannel) {
    try { bcChannel.postMessage(msg); } catch (_) {}
  }
}

async function launchProjectorWindow() {
  if (state.multiProjector && state.multiProjector.enabled && typeof launchAllProjectorScreens === 'function') {
    await launchAllProjectorScreens();
    return;
  }
  if (typeof launchProjectorScreenWindow === 'function') {
    await launchProjectorScreenWindow(1);
    return;
  }
  if (projectorWindow && !projectorWindow.closed) {
    projectorWindow.focus();
    broadcastAllMediaToProjector();
    showToast('2nd-Screen Projector window focused & synced');
    return;
  }

  const u = new URL(window.location.href);
  u.searchParams.set('role', 'projector');

  let left = window.screenX + 80;
  let top = window.screenY + 60;
  let width = 1280;
  let height = 720;

  // Multi-Screen Window Placement API: auto-place onto secondary HDMI/USB-C projector display!
  if ('getScreenDetails' in window) {
    try {
      const details = await window.getScreenDetails();
      const ext = details.screens.find(s => s !== details.currentScreen);
      if (ext) {
        left = ext.availLeft;
        top = ext.availTop;
        width = ext.availWidth;
        height = ext.availHeight;
      }
    } catch (_) {
      // Permission declined or unsupported — opens standard movable popup window
    }
  }

  const features = `popup=yes,left=${Math.round(left)},top=${Math.round(top)},width=${Math.round(width)},height=${Math.round(height)}`;
  projectorWindow = window.open(u.toString(), 'WebMapperProjectorOutput', features);
  if (!projectorWindow) {
    showToast('Popup blocked — allow popups to open 2nd-Screen Projector');
    return;
  }

  markProjectorConnected(true);
  showToast('Opened 2nd-Screen Projector — drag to HDMI screen & press F for Fullscreen');
}

function markProjectorConnected(live) {
  projectorConnected = live;
  const dot = document.getElementById('proj-sync-dot');
  if (dot) dot.classList.toggle('live', live);
}

function broadcastMediaToProjector(srcObj) {
  if (!srcObj || state.isProjectorRole) return;
  if ((srcObj.kind === 'video' || srcObj.kind === 'image') && srcObj.file) {
    sendSyncPayload({
      type: 'MEDIA_FILE',
      meta: {
        id: srcObj.id,
        name: srcObj.name,
        kind: srcObj.kind,
        fileName: srcObj.fileName,
        fileSize: srcObj.fileSize,
        mirrorX: srcObj.mirrorX,
        playing: srcObj.playing,
        loopMode: srcObj.loopMode,
        rate: srcObj.rate,
        trimIn: srcObj.trimIn ?? 0,
        trimOut: srcObj.trimOut ?? 1,
        seamlessLoop: !!srcObj.seamlessLoop,
        bpmSync: !!srcObj.bpmSync,
        clipBpm: srcObj.clipBpm ?? 120,
        targetBpm: srcObj.targetBpm ?? 120
      },
      file: srcObj.file
    });
  } else if (srcObj.kind === 'image' && srcObj.inlineDataUrl) {
    sendSyncPayload({
      type: 'MEDIA_DATAURL',
      entry: {
        id: srcObj.id,
        name: srcObj.name,
        fileName: srcObj.fileName,
        width: srcObj.width,
        height: srcObj.height,
        mirrorX: srcObj.mirrorX,
        inlineDataUrl: srcObj.inlineDataUrl
      }
    });
  }
}

function broadcastAllMediaToProjector() {
  for (const src of state.sources) {
    if (src.kind === 'video' || src.kind === 'image') {
      broadcastMediaToProjector(src);
    }
  }
}

function serializeSurfaceSyncArray(list) {
  return list.map(s => ({
    id: s.id,
    type: s.type,
    accent: s.accent,
    groupId: s.groupId || null,
    outputProj: s.linkObject && s.linkObject.proj ? Number(s.linkObject.proj) : 0,
    visible: s.visible,
    solo: s.solo,
    showCalGrid: !state.showLock && !!s.showCalGrid,
    sourceId: s.sourceId,
    mesh3dPrimitive: s.mesh3dPrimitive || 'cube',
    objAssetId: s.objAssetId || null,
    pos3d: s.pos3d,
    rot3d: s.rot3d,
    scale3d: s.scale3d,
    camThrow: s.camThrow ?? 1.20,
    camDist: s.camDist ?? 3.20,
    lensShiftX: s.lensShiftX ?? 0.0,
    lensShiftY: s.lensShiftY ?? 0.0,
    shade3d: s.shade3d || 'lit_wire',
    cull3d: s.cull3d || 'back',
    wireWidth: s.wireWidth ?? 1.35,
    wireGlow: s.wireGlow ?? 0.45,
    wireChase: s.wireChase ?? 0.0,
    wireUseSource: !!s.wireUseSource,
    lightAzim: s.lightAzim ?? 36,
    lightElev: s.lightElev ?? 42,
    lightAmbient: s.lightAmbient ?? 0.28,
    lightDiffuse: s.lightDiffuse ?? 0.85,
    lightSpec: s.lightSpec ?? 0.42,
    lightRim: s.lightRim ?? 0.35,
    calibMode: s.calibMode || 'manual',
    calibPins: s.calibPins || [],
    quadWarp: s.quadWarp,
    meshCols: s.meshCols,
    meshRows: s.meshRows,
    meshPts: s.meshPts,
    points: s.points,
    triUvs: s.triUvs,
    polyUvs: s.polyUvs,
    lineClosed: !!s.lineClosed,
    lineWidth: s.lineWidth ?? 0.010,
    lineGlow: s.lineGlow ?? 0.55,
    lineChaseMode: s.lineChaseMode || 'chase',
    lineSpeed: s.lineSpeed ?? 0.65,
    lineDuty: s.lineDuty ?? 0.42,
    lineCount: s.lineCount ?? 2,
    lineUseSource: !!s.lineUseSource,
    borderWidth: s.borderWidth ?? 0.0,
    borderGlow: s.borderGlow ?? 0.50,
    borderChase: s.borderChase || 'chase',
    borderSpeed: s.borderSpeed ?? 0.55,
    uvX: s.uvX, uvY: s.uvY, uvW: s.uvW, uvH: s.uvH, uvRot: s.uvRot,
    cropL: s.cropL, cropR: s.cropR, cropT: s.cropT, cropB: s.cropB,
    circleSoftness: s.circleSoftness,
    circleInner: s.circleInner,
    circleStartAngle: s.circleStartAngle ?? 0,
    circleEndAngle: s.circleEndAngle ?? 360,
    blendMode: s.blendMode,
    opacity: s.opacity,
    feather: s.feather,
    featherLink: s.featherLink !== false,
    featherL: s.featherL ?? s.feather,
    featherR: s.featherR ?? s.feather,
    featherT: s.featherT ?? s.feather,
    featherB: s.featherB ?? s.feather,
    blendGamma: s.blendGamma ?? 1.0,
    blackLevel: s.blackLevel ?? 0.0,
    shutterL: s.shutterL ?? 0.0,
    shutterR: s.shutterR ?? 0.0,
    shutterT: s.shutterT ?? 0.0,
    shutterB: s.shutterB ?? 0.0,
    shutterAngL: s.shutterAngL ?? 0.0,
    shutterAngR: s.shutterAngR ?? 0.0,
    shutterAngT: s.shutterAngT ?? 0.0,
    shutterAngB: s.shutterAngB ?? 0.0,
    shutterSoft: s.shutterSoft ?? 0.015,
    brightness: s.brightness,
    contrast: s.contrast,
    saturation: s.saturation,
    colorTemp: s.colorTemp,
    keyMode: s.keyMode || 'off',
    lumaMin: s.lumaMin ?? 0.08,
    lumaSoftness: s.lumaSoftness ?? 0.08,
    lumaInvert: !!s.lumaInvert,
    chromaColor: s.chromaColor || '#00ff00',
    chromaTolerance: s.chromaTolerance ?? 0.28,
    chromaSoftness: s.chromaSoftness ?? 0.10,
    chromaSpill: s.chromaSpill ?? 0.45,
    gamma: s.gamma ?? 1.0,
    hueShift: s.hueShift ?? 0.0,
    tintColor: s.tintColor || '#6fd3ff',
    tintAmount: s.tintAmount ?? 0.0,
    invertRgb: !!s.invertRgb,
    channelMode: s.channelMode || 'rgb',
    fxChain: cloneFxChain(s.fxChain || []),
    geomRev: s._geomRev || 1
  }));
}

function serializeCrossfadeSceneForSync(sc) {
  return {
    surfaces: serializeSurfaceSyncArray(sc.surfaces),
    groups: (sc.groups || []).map(cloneGroupData),
    masks: (sc.masks || []).map(cloneMaskData),
    spots: Array.isArray(sc.spots) ? sc.spots : [sc.followspot],
    followspot: sc.followspot,
    masterFxChain: cloneFxChain(sc.masterFxChain || [])
  };
}

function reviveCrossfadeSceneFromSync(sc, role = 'xfadeFrom') {
  return {
    surfaces: reconcileProjectorSurfaces(sc.surfaces, role),
    groups: sc.groups || [],
    masks: sc.masks || [],
    spots: sc.spots || (sc.followspot ? [sc.followspot] : []),
    followspot: sc.followspot,
    masterFxChain: sc.masterFxChain || [],
    allCalGrids: false
  };
}

let lastSentSceneSyncRev = -1;
let lastSentPluginSyncRev = -1;
let lastSentObjSyncRev = -1;
let syncTickCounter = 0;

function broadcastLiveStateTick(nowMs) {
  if (state.isProjectorRole) return;
  const openWins = typeof getOpenProjectorWindowsList === 'function'
    ? getOpenProjectorWindowsList()
    : ((projectorWindow && !projectorWindow.closed) ? [projectorWindow] : []);
  const hasPopup = openWins.length > 0;
  if (!hasPopup && !projectorConnected) return;

  if (projectorConnected && !hasPopup && (nowMs - lastProjectorPongMs > 4000)) {
    markProjectorConnected(false);
    return;
  }

  syncTickCounter++;
  const shaders = {};
  const isfRuntimeStates = {};
  const textRuntimeStates = {};
  const videos = {};
  for (const src of state.sources) {
    if (src.kind === 'shader') {
      shaders[src.id] = {
        simTime: src.simTime,
        playing: src.playing,
        speed: src.speed,
        scale: src.scale,
        detail: src.detail,
        temp: src.temp,
        palette: src.palette,
        mirrorX: src.mirrorX
      };
    } else if (src.kind === 'isf') {
      isfRuntimeStates[src.id] = {
        simTime: src.simTime,
        frameIndex: src.frameIndex || 0,
        isfValues: src.isfValues || {},
        mirrorX: !!src.mirrorX
      };
    } else if (src.kind === 'text') {
      textRuntimeStates[src.id] = {
        simTime: src.simTime || 0,
        mirrorX: !!src.mirrorX
      };
    } else if (src.kind === 'video' && src.video && !src.offline) {
      videos[src.id] = {
        playing: src.playing && !src.video.paused,
        currentTime: src.video.currentTime,
        rate: src.rate,
        loopMode: src.loopMode,
        trimIn: src.trimIn ?? 0,
        trimOut: src.trimOut ?? 1,
        seamlessLoop: !!src.seamlessLoop,
        mirrorX: src.mirrorX
      };
    }
  }

  const curRev = state._sceneSyncRev || 0;
  const includeFullScene = (curRev !== lastSentSceneSyncRev) || (syncTickCounter % 20 === 0) || state.crossfade.active;
  if (includeFullScene) lastSentSceneSyncRev = curRev;

  const curPluginRev = state._pluginSyncRev || 0;
  const includePlugins = (curPluginRev !== lastSentPluginSyncRev);
  if (includePlugins) lastSentPluginSyncRev = curPluginRev;

  const curObjRev = state._objSyncRev || 0;
  const includeObjs = (curObjRev !== lastSentObjSyncRev);
  if (includeObjs) lastSentObjSyncRev = curObjRev;

  const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;

  const payload = {
    type: 'STATE_SYNC',
    stageAspect: state.stageAspect,
    stageWidth: state.stageWidth,
    stageHeight: state.stageHeight,
    hdrPipeline: !!state.hdrPipeline,
    showLock: !!state.showLock,
    allCalGrids: !state.showLock && !!state.allCalGrids,
    masterOpacity: state.masterOpacity,
    blackoutFade: state.blackoutFade,
    compositorClock: compositorClockSec,
    scannerPattern: state.scannerPattern,
    calibCrosshair: state.calibCrosshair,
    spots: Array.isArray(state.spots) ? state.spots : [state.followspot],
    followspot: state.followspot,
    mixbusState: mixSrc ? cloneMixbusState(mixSrc) : null,
    crossfade: state.crossfade.active && !state.crossfade.fromScene && state.crossfade.frozenFrom ? {
      // GO mid-fade: the outgoing side is a baked still — each output bakes its own from its last frames.
      active: true,
      frozen: true,
      mix: state.crossfade.mix,
      freezeSeq: state.crossfade.freezeSeq || 0,
      freezeMix: state.crossfade.freezeMix || 0
    } : state.crossfade.active && state.crossfade.fromScene ? {
      active: true,
      mix: state.crossfade.mix,
      fromScene: serializeCrossfadeSceneForSync(state.crossfade.fromScene),
      chainToScene: state.crossfade.chainToScene ? serializeCrossfadeSceneForSync(state.crossfade.chainToScene) : null,
      chainMix: state.crossfade.chainMix || 0
    } : { active: false, mix: 1.0 },
    shaders,
    isfRuntimeStates,
    textRuntimeStates,
    videos
  };

  if (includeFullScene) {
    payload.surfaces = serializeSurfaceSyncArray(state.surfaces);
    payload.groups = (state.groups || []).map(cloneGroupData);
    payload.masks = state.masks.map(cloneMaskData);
    payload.masterKeystone = state.masterKeystone;
    payload.masterFxChain = cloneFxChain(state.masterFxChain || []);
    if (typeof serializeMultiProjectorState === 'function') {
      payload.multiProjector = serializeMultiProjectorState();
    }
    // Venue geometry: projector windows need it to converge 3D-aimed spots through their own lens.
    payload.world = {
      screens: Array.isArray(state.worldScreens) ? state.worldScreens : null,
      props: Array.isArray(state.worldProps) ? state.worldProps : null,
      parts: Array.isArray(state.venueParts) ? state.venueParts : null,
      stage: state.worldStage || null,
      spotCalib: state.spotCalib || null
    };
  }

  if (includePlugins) {
    payload.customPluginsPayload = {
      isfSources: state.sources
        .filter(s => s.kind === 'isf')
        .map(s => ({
          id: s.id,
          name: s.name,
          isfCode: s.isfCode,
          isfValues: s.isfValues,
          speed: s.speed ?? 1.0,
          mirrorX: !!s.mirrorX
        })),
      textSources: state.sources
        .filter(s => s.kind === 'text')
        .map(s => serializeTextSource(s)),
      liveSources: state.sources
        .filter(s => s.kind === 'syphon' || s.kind === 'live')
        .map(s => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
          width: s.width,
          height: s.height,
          mirrorX: !!s.mirrorX,
          active: !!(s.stream && !s.streamEnded)
        })),
      customFxPlugins: state.customFxPlugins.map(p => ({
        id: p.id,
        type: p.type,
        name: p.name,
        author: p.author,
        license: p.license,
        isfCode: p.isfCode
      }))
    };
  }

  if (includeObjs) {
    payload.objAssetsPayload = Object.values(state.objAssets || {}).map(a => ({
      id: a.id,
      name: a.name,
      fileName: a.fileName,
      objText: a.objText,
      triCount: a.triCount,
      uniqueCount: a.uniqueCount
    }));
  }

  if (typeof applyHeldProgramToSyncPayload === 'function') applyHeldProgramToSyncPayload(payload);
  sendSyncPayload(payload);
}

// Reconcile incoming surfaces on Projector using O(1) numeric geomRev instead of 60Hz JSON.stringify!
// One cache per scene role: live, crossfade-outgoing and chained-target scenes share surface IDs,
// so a single cache would make them alias (the outgoing scene overwrote live props mid-fade).
const projSurfCaches = new Map();
function reconcileProjectorSurfaces(incomingList, role = 'live') {
  if (!Array.isArray(incomingList)) return [];
  if (!projSurfCaches.has(role)) projSurfCaches.set(role, new Map());
  const projSurfCache = projSurfCaches.get(role);
  const out = [];
  for (const inc of incomingList) {
    let cached = projSurfCache.get(inc.id);
    if (!cached) {
      cached = { ...inc, _meshDirty: true, _glVerts: null, _geomRev: inc.geomRev || 1 };
      projSurfCache.set(inc.id, cached);
    } else {
      const dirty = (
        cached._geomRev !== inc.geomRev ||
        cached.quadWarp !== inc.quadWarp ||
        cached.meshCols !== inc.meshCols ||
        cached.meshRows !== inc.meshRows
      );
      Object.assign(cached, inc);
      cached._geomRev = inc.geomRev || 1;
      if (dirty) {
        cached._meshDirty = true;
      }
    }
    out.push(cached);
  }
  return out;
}

function handleIncomingSyncMessage(msg) {
  if (!msg || msg._wm !== 1 || !msg._uid) return;
  if (handledMsgUids.has(msg._uid)) return;
  handledMsgUids.add(msg._uid);
  if (handledMsgUids.size > 400) {
    const first = handledMsgUids.values().next().value;
    handledMsgUids.delete(first);
  }

  if (!state.isProjectorRole) {
    // Studio Controller receiving from Projector
    if (msg.type === 'PROJECTOR_HELLO') {
      lastProjectorPongMs = performance.now();
      lastSentSceneSyncRev = -1;
      lastSentPluginSyncRev = -1;
      lastSentObjSyncRev = -1;
      markProjectorConnected(true);
      broadcastAllMediaToProjector();
    } else if (msg.type === 'PROJECTOR_PONG') {
      lastProjectorPongMs = performance.now();
      markProjectorConnected(true);
    } else if (msg.type === 'PROJECTOR_BYE') {
      markProjectorConnected(false);
    }
    return;
  }

  // Projector Output Receiver handling messages from Studio Controller
  if (msg.type === 'MEDIA_FILE' && msg.file && msg.meta) {
    const existing = state.sources.find(s => s.id === msg.meta.id);
    if (msg.meta.kind === 'video') {
      addVideoSourceFromFile(msg.file, existing || null, msg.meta);
    } else if (msg.meta.kind === 'image') {
      addImageSourceFromFile(msg.file, existing || null, msg.meta);
    }
  } else if (msg.type === 'MEDIA_DATAURL' && msg.entry) {
    const existingIdx = state.sources.findIndex(s => s.id === msg.entry.id);
    if (existingIdx >= 0) state.sources.splice(existingIdx, 1);
    addImageSourceFromDataUrl(msg.entry);
  } else if (msg.type === 'STATE_SYNC') {
    state.stageAspect = msg.stageAspect ?? state.stageAspect;
    state.stageWidth = msg.stageWidth ?? state.stageWidth;
    state.stageHeight = msg.stageHeight ?? state.stageHeight;
    state.hdrPipeline = msg.hdrPipeline ?? state.hdrPipeline;
    state.showLock = !!msg.showLock;
    state.allCalGrids = !!msg.allCalGrids;
    state.masterOpacity = msg.masterOpacity ?? 1.0;
    state.blackoutFade = msg.blackoutFade ?? 1.0;
    if (typeof msg.compositorClock === 'number') {
      compositorClockSec = msg.compositorClock;
    }
    state.scannerPattern = msg.scannerPattern || null;
    if (msg.customPluginsPayload) {
      if (Array.isArray(msg.customPluginsPayload.customFxPlugins)) {
        for (const p of msg.customPluginsPayload.customFxPlugins) {
          registerCustomFxPlugin(p);
        }
      }
      if (Array.isArray(msg.customPluginsPayload.isfSources)) {
        const keepIds = new Set(msg.customPluginsPayload.isfSources.map(s => s.id));
        for (const existing of [...state.sources]) {
          if (existing.kind === 'isf' && !keepIds.has(existing.id)) {
            removeCustomSource(existing.id);
          }
        }
        for (const isfEntry of msg.customPluginsPayload.isfSources) {
          const ex = state.sources.find(s => s.id === isfEntry.id && s.kind === 'isf');
          if (ex) {
            if (ex.isfCode !== isfEntry.isfCode) {
              compileAndAttachIsfSource(ex, isfEntry.isfCode);
            }
            ex.name = isfEntry.name || ex.name;
            ex.isfValues = isfEntry.isfValues || ex.isfValues;
          } else {
            addNewCustomIsfSource(isfEntry, false);
          }
        }
      }
      if (Array.isArray(msg.customPluginsPayload.textSources)) {
        const keepTxtIds = new Set(msg.customPluginsPayload.textSources.map(s => s.id));
        for (const existing of [...state.sources]) {
          if (existing.kind === 'text' && !keepTxtIds.has(existing.id)) {
            removeCustomSource(existing.id);
          }
        }
        for (const txtEntry of msg.customPluginsPayload.textSources) {
          const ex = state.sources.find(s => s.id === txtEntry.id && s.kind === 'text');
          if (ex) applyTextSourceProps(ex, txtEntry);
          else addNewTextSource(txtEntry, false);
        }
      }
      if (Array.isArray(msg.customPluginsPayload.liveSources)) {
        reconcileProjectorLiveSources(msg.customPluginsPayload.liveSources);
      }
    }
    if (Array.isArray(msg.objAssetsPayload)) {
      if (!state.objAssets) state.objAssets = {};
      const keepObjIds = new Set(msg.objAssetsPayload.map(a => a.id));
      for (const k of Object.keys(state.objAssets)) {
        if (!keepObjIds.has(k)) delete state.objAssets[k];
      }
      for (const entry of msg.objAssetsPayload) {
        const ex = state.objAssets[entry.id];
        if (!ex || ex.objText !== entry.objText) {
          try {
            const parsed = parseObjMesh(entry.objText || '', `obj:${entry.id}`);
            state.objAssets[entry.id] = { ...entry, _mesh: parsed };
          } catch (_) {}
        }
      }
    }
    if (Array.isArray(msg.surfaces)) {
      state.surfaces = reconcileProjectorSurfaces(msg.surfaces);
    }
    if (Array.isArray(msg.groups)) {
      state.groups = msg.groups;
    }
    if (Array.isArray(msg.masks)) {
      state.masks = msg.masks;
    }
    if (Array.isArray(msg.masterFxChain)) {
      state.masterFxChain = msg.masterFxChain;
    }
    if (msg.masterKeystone) {
      state.masterKeystone = msg.masterKeystone;
    }
    if (msg.world && typeof msg.world === 'object') {
      if (Array.isArray(msg.world.screens)) state.worldScreens = JSON.parse(JSON.stringify(msg.world.screens));
      if (Array.isArray(msg.world.props)) { state.worldProps = JSON.parse(JSON.stringify(msg.world.props)); state._worldPropsSeeded = true; }
      if (Array.isArray(msg.world.parts) && JSON.stringify(msg.world.parts) !== JSON.stringify(state.venueParts || null)) {
        state.venueParts = JSON.parse(JSON.stringify(msg.world.parts));
        if (typeof markVenuePartsDirty === 'function') markVenuePartsDirty();
      }
      if (msg.world.stage) state.worldStage = { ...msg.world.stage };
      state.spotCalib = msg.world.spotCalib && msg.world.spotCalib.active ? { ...msg.world.spotCalib } : { active: false };
    }
    if (msg.multiProjector && typeof restoreMultiProjectorState === 'function') {
      restoreMultiProjectorState(msg.multiProjector);
    }
    if (msg.calibCrosshair) {
      state.calibCrosshair = msg.calibCrosshair;
    }
    if (Array.isArray(msg.spots)) {
      state._spotsInitialized = true;
      state.spots = msg.spots.map((sp, i) => createSpotObject(i, sp));
      state.followspot = state.spots[0] || state._detachedFallbackSpot || state.followspot;
    } else if (msg.followspot) {
      Object.assign(state.followspot, msg.followspot);
    }
    if (msg.mixbusState && typeof getMixbusSource === 'function') {
      const mixSrc = getMixbusSource();
      if (mixSrc) applyMixbusState(mixSrc, msg.mixbusState);
    }
    if (msg.crossfade && msg.crossfade.active && msg.crossfade.frozen) {
      if (msg.crossfade.freezeSeq !== state.crossfade._lastFreezeSeq) {
        state.crossfade._lastFreezeSeq = msg.crossfade.freezeSeq;
        state.crossfade.freezeRequest = true;
        state.crossfade.freezeMix = Number(msg.crossfade.freezeMix) || 0;
      }
      state.crossfade.active = true;
      state.crossfade.frozenFrom = true;
      state.crossfade.fromScene = null;
      state.crossfade.chainToScene = null;
      state.crossfade.mix = msg.crossfade.mix;
    } else if (msg.crossfade && msg.crossfade.active && msg.crossfade.fromScene) {
      state.crossfade.frozenFrom = false;
      state.crossfade.active = true;
      state.crossfade.mix = msg.crossfade.mix;
      state.crossfade.fromScene = reviveCrossfadeSceneFromSync(msg.crossfade.fromScene);
      state.crossfade.chainToScene = msg.crossfade.chainToScene ? reviveCrossfadeSceneFromSync(msg.crossfade.chainToScene, 'xfadeChain') : null;
      state.crossfade.chainMix = Number(msg.crossfade.chainMix) || 0;
    } else {
      state.crossfade.active = false;
      state.crossfade.mix = 1.0;
      state.crossfade.fromScene = null;
      state.crossfade.chainToScene = null;
    }

    if (msg.shaders) {
      for (const [id, sh] of Object.entries(msg.shaders)) {
        const src = state.sources.find(s => s.id === id && s.kind === 'shader');
        if (src) {
          src.simTime = sh.simTime;
          src.playing = false; // Driven directly by Controller's exact simTime
          src.speed = sh.speed;
          src.scale = sh.scale;
          src.detail = sh.detail;
          src.temp = sh.temp;
          src.palette = sh.palette;
          src.mirrorX = !!sh.mirrorX;
        }
      }
    }

    if (msg.isfRuntimeStates) {
      for (const [id, st] of Object.entries(msg.isfRuntimeStates)) {
        const src = state.sources.find(s => s.id === id && s.kind === 'isf');
        if (src) {
          src.simTime = st.simTime;
          src.frameIndex = st.frameIndex || 0;
          src.playing = false; // Driven directly by Controller's exact simTime
          src.isfValues = st.isfValues || src.isfValues;
          src.mirrorX = !!st.mirrorX;
        }
      }
    }

    if (msg.textRuntimeStates) {
      for (const [id, tst] of Object.entries(msg.textRuntimeStates)) {
        const src = state.sources.find(s => s.id === id && s.kind === 'text');
        if (src) {
          src.simTime = tst.simTime;
          src.playing = false;
          src.mirrorX = !!tst.mirrorX;
        }
      }
    }

    if (msg.videos) {
      for (const [id, vs] of Object.entries(msg.videos)) {
        const src = state.sources.find(s => s.id === id && s.kind === 'video');
        if (src && src.video && src.video.readyState >= 2) {
          const vid = src.video;
          vid.muted = true; // Projector window stays muted so audio plays from Controller only
          src.mirrorX = !!vs.mirrorX;
          src.loopMode = vs.loopMode;
          src.trimIn = vs.trimIn ?? src.trimIn ?? 0;
          src.trimOut = vs.trimOut ?? src.trimOut ?? 1;
          src.seamlessLoop = !!vs.seamlessLoop;
          const isFullTrim = (src.trimIn <= 0.001 && src.trimOut >= 0.999 && !src.seamlessLoop);
          vid.loop = (vs.loopMode === 'loop' && isFullTrim);
          if (Math.abs(vid.playbackRate - vs.rate) > 0.01) vid.playbackRate = vs.rate;

          if (vs.playing && vid.paused) vid.play().catch(() => {});
          else if (!vs.playing && !vid.paused) vid.pause();

          // Drift-tolerant 55ms phase lock
          if (Math.abs(vid.currentTime - vs.currentTime) > 0.055) {
            if (src.seamlessLoop && vid.currentTime > vs.currentTime + 0.25) {
              snapshotVideoLoopHoldFrame(src);
            }
            vid.currentTime = vs.currentTime;
            src.needsUpload = true;
          }
        }
      }
    }
  }
}

function initSyncEngine() {
  window.addEventListener('message', (e) => {
    if (e.data && e.data._wm === 1) handleIncomingSyncMessage(e.data);
  });
  if (bcChannel) {
    bcChannel.addEventListener('message', (e) => {
      if (e.data && e.data._wm === 1) handleIncomingSyncMessage(e.data);
    });
  }

  if (state.isProjectorRole) {
    sendSyncPayload({ type: 'PROJECTOR_HELLO' });
    setInterval(() => sendSyncPayload({ type: 'PROJECTOR_PONG' }), 1500);
    window.addEventListener('beforeunload', () => sendSyncPayload({ type: 'PROJECTOR_BYE' }));
  }
}

// ============================================================================
// 3. SAVE / LOAD .WEBMAPPER.JSON SHOW FILES & LOCALSTORAGE AUTOSAVE (Phase 4.3)
// ============================================================================

function serializeShowData(includeInlineImages = true) {
  const serializedSources = state.sources
    .filter(s => s.kind !== 'live')
    .map(s => {
      if (s.kind === 'shader') {
        return {
          id: s.id,
          name: s.name,
          kind: 'shader',
          shaderKind: s.shaderKind,
          playing: s.playing,
          speed: s.speed,
          scale: s.scale,
          detail: s.detail,
          temp: s.temp,
          palette: s.palette,
          mirrorX: s.mirrorX
        };
      }
      if (s.kind === 'isf') {
        return {
          id: s.id,
          name: s.name,
          author: s.author || APP_NAME,
          license: s.license || APP_PLUGIN_DEFAULT_LICENSE,
          kind: 'isf',
          playing: s.playing !== false,
          speed: s.speed ?? 1.0,
          mirrorX: !!s.mirrorX,
          isfCode: s.isfCode || '',
          isfValues: s.isfValues ? JSON.parse(JSON.stringify(s.isfValues)) : {}
        };
      }
      if (s.kind === 'mixbus') {
        return {
          id: s.id,
          name: s.name,
          kind: 'mixbus',
          mixbus: cloneMixbusState(s)
        };
      }
      if (s.kind === 'text') {
        return serializeTextSource(s);
      }
      if (s.kind === 'syphon') {
        return {
          id: s.id,
          name: s.name,
          kind: 'syphon',
          displaySurface: s.displaySurface || 'window',
          width: s.width || 1920,
          height: s.height || 1080,
          mirrorX: !!s.mirrorX,
          thumbUrl: s.thumbUrl || null
        };
      }
      return {
        id: s.id,
        name: s.name,
        kind: s.kind,
        fileName: s.fileName || `${s.name}.${s.kind === 'video' ? 'mp4' : 'png'}`,
        fileSize: s.fileSize || 0,
        width: s.width,
        height: s.height,
        mirrorX: s.mirrorX,
        playing: s.playing !== false,
        loopMode: s.loopMode || 'loop',
        rate: s.rate ?? 1.0,
        trimIn: s.trimIn ?? 0.0,
        trimOut: s.trimOut ?? 1.0,
        seamlessLoop: !!s.seamlessLoop,
        loopCrossfadeSec: s.loopCrossfadeSec ?? 0.40,
        bpmSync: !!s.bpmSync,
        clipBpm: s.clipBpm ?? 120,
        targetBpm: s.targetBpm ?? 120,
        muted: s.muted !== undefined ? !!s.muted : true,
        volume: s.volume ?? 0.8,
        thumbUrl: s.thumbUrl || null,
        inlineDataUrl: (includeInlineImages && s.kind === 'image' && s.inlineDataUrl) ? s.inlineDataUrl : null
      };
    });

  return {
    format: APP_SHOW_FORMAT,
    appVersion: APP_VERSION,
    version: '2.0',
    savedAt: new Date().toISOString(),
    stageResPreset: state.stageResPreset || '1920x1080',
    stageWidth: state.stageWidth || 1920,
    stageHeight: state.stageHeight || 1080,
    stageAspect: state.stageAspect,
    hdrPipeline: !!state.hdrPipeline,
    stageBg: {
      enabled: !!state.stageBg.enabled,
      opacity: state.stageBg.opacity ?? 0.52,
      dataUrl: includeInlineImages ? (state.stageBg.dataUrl || null) : null
    },
    masterOpacity: state.masterOpacity,
    masterKeystone: {
      enabled: !!state.masterKeystone.enabled,
      editOnStage: false,
      lensK1: state.masterKeystone.lensK1 || 0,
      points: state.masterKeystone.points.map(p => [p[0], p[1]])
    },
    activeSourceId: state.activeSourceId,
    selectedSurfaceId: state.selectedSurfaceId,
    selectedMaskId: state.selectedMaskId,
    activeCueId: state.activeCueId,
    nextSurfaceNum: state.nextSurfaceNum,
    nextGroupNum: state.nextGroupNum,
    nextMaskNum: state.nextMaskNum,
    nextCueNum: state.nextCueNum,
    nextSourceNum: state.nextSourceNum,
    nextModNum: state.nextModNum || 1,
    nextObjNum: state.nextObjNum || 1,
    objAssets: Object.values(state.objAssets || {}).map(a => ({
      id: a.id,
      name: a.name,
      fileName: a.fileName,
      objText: a.objText,
      triCount: a.triCount,
      uniqueCount: a.uniqueCount
    })),
    sources: serializedSources,
    customFxPlugins: (state.customFxPlugins || []).map(p => ({
      id: p.id,
      type: p.type,
      name: p.name,
      author: p.author,
      license: p.license,
      isfCode: p.isfCode
    })),
    groups: (state.groups || []).map(cloneGroupData),
    surfaces: state.surfaces.map(cloneSurfaceData),
    masks: state.masks.map(cloneMaskData),
    masterFxChain: cloneFxChain(state.masterFxChain || []),
    spots: Array.isArray(state.spots)
      ? state.spots.map((sp, i) => (typeof cloneSpotData === 'function' ? cloneSpotData(sp, i) : { ...sp }))
      : [state.followspot],
    followspot: state.spots?.[0] ? { ...state.spots[0] } : null,
    dmxDevices: Array.isArray(state.dmxDevices) ? JSON.parse(JSON.stringify(state.dmxDevices)) : [],
    worldProps: Array.isArray(state.worldProps) ? JSON.parse(JSON.stringify(state.worldProps)) : undefined,
    venueParts: Array.isArray(state.venueParts) ? JSON.parse(JSON.stringify(state.venueParts)) : undefined,
    workflow: state.workflow || undefined,
    shapesLocked: state.shapesLocked === false ? false : true,
    tipsDone: Array.isArray(state.tipsDone) && state.tipsDone.length ? [...state.tipsDone] : undefined,
    showParts: Array.isArray(state.showParts) ? [...state.showParts] : undefined,
    programPrefs: state.program ? { takeFadeSec: state.program.takeFadeSec, autoBlind: state.program.autoBlind } : undefined,
    worldStage: state.worldStage ? { ...state.worldStage } : undefined,
    worldScreens: Array.isArray(state.worldScreens) ? JSON.parse(JSON.stringify(state.worldScreens)) : undefined,
    selectedWorldScreenId: state.selectedWorldScreenId || null,
    nextWorldScreenNum: state.nextWorldScreenNum || 2,
    floorplan: state.floorplan ? {
      name: state.floorplan.name || '',
      dataUrl: includeInlineImages ? (state.floorplan.dataUrl || null) : null,
      widthPx: state.floorplan.widthPx || 0,
      heightPx: state.floorplan.heightPx || 0,
      widthM: state.floorplan.widthM ?? 10.0,
      offsetX: state.floorplan.offsetX ?? 0,
      offsetZ: state.floorplan.offsetZ ?? 0,
      rotDeg: state.floorplan.rotDeg ?? 0,
      opacity: state.floorplan.opacity ?? 0.48,
      locked: !!state.floorplan.locked,
      visible: state.floorplan.visible !== false
    } : undefined,
    modulators: typeof serializeModulators === 'function' ? serializeModulators(state.modulators) : [],
    midiMappings: Array.isArray(state.midi?.mappings) ? state.midi.mappings.map(m => ({ ...m })) : [],
    audio: state.audio ? {
      enabled: !!state.audio.enabled,
      sourceMode: state.audio.sourceMode || 'synth',
      videoSourceId: state.audio.videoSourceId || 'auto',
      gain: state.audio.gain ?? 1.25,
      smoothing: state.audio.smoothing ?? 0.65,
      bpm: state.audio.bpm ?? 120,
      autoBpm: !!state.audio.autoBpm
    } : undefined,
    constellation: state.constellation ? {
      puckX: state.constellation.puckX ?? 0,
      puckY: state.constellation.puckY ?? 0,
      falloffExp: state.constellation.falloffExp ?? 2.2,
      switchMedia: !!state.constellation.switchMedia,
      inertia: state.constellation.inertia ?? 0.32
    } : undefined,
    timeline: typeof serializeTimelineState === 'function' ? serializeTimelineState() : null,
    multiProjector: typeof serializeMultiProjectorState === 'function' ? serializeMultiProjectorState() : undefined,
    pixelMapper: typeof serializePixelMapperState === 'function' ? serializePixelMapperState() : undefined,
    venue: {
      stageResPreset: state.stageResPreset || '1920x1080',
      stageWidth: state.stageWidth || 1920,
      stageHeight: state.stageHeight || 1080,
      hdrPipeline: !!state.hdrPipeline,
      masterKeystone: {
        enabled: !!state.masterKeystone.enabled,
        lensK1: state.masterKeystone.lensK1 || 0,
        points: state.masterKeystone.points.map(p => [p[0], p[1]])
      },
      surfaceCalibrations: state.surfaces.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        animateGeomInShow: !!s.animateGeomInShow,
        points: Array.isArray(s.points) ? s.points.map(p => [p[0], p[1]]) : [],
        quadWarp: s.quadWarp || 'perspective',
        meshCols: s.meshCols ?? 3,
        meshRows: s.meshRows ?? 3,
        meshPts: Array.isArray(s.meshPts) ? s.meshPts.map(p => [p[0], p[1]]) : null,
        calibMode: s.calibMode || 'manual',
        calibPins: Array.isArray(s.calibPins) ? JSON.parse(JSON.stringify(s.calibPins)) : []
      }))
    },
    cues: state.cues.map(c => ({
      id: c.id,
      name: c.name,
      fadeSec: c.fadeSec,
      cueRole: c.cueRole || 'seq',
      priorityMode: c.priorityMode || 'ltp',
      releaseSec: c.releaseSec ?? 0.8,
      recallFilter: c.recallFilter ? { ...c.recallFilter } : undefined,
      autoFollow: !!c.autoFollow,
      waitSec: c.waitSec ?? 4.0,
      retriggerVideos: !!c.retriggerVideos,
      constellationX: c.constellationX,
      constellationY: c.constellationY,
      snapshot: c.snapshot
    }))
  };
}

function exportShowJson() {
  const data = serializeShowData(true);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chaos-cathoderay-show-${stamp}${APP_SHOW_EXT}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast(`Saved show file (${APP_SHOW_EXT})`);
  if (typeof markShowSavedToFile === 'function') markShowSavedToFile();
}

function importShowJson(jsonText, isAutosave = false, opts = {}) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (_) {
    if (!isAutosave) showToast('Invalid JSON show file');
    return false;
  }
  if (!data || !APP_SHOW_FORMATS_ACCEPTED.includes(data.format)) {
    if (!isAutosave) showToast('This is not a Chaos CathodeRay (or WebMapper) show file');
    return false;
  }

  const keepVenue = !!(opts && opts.keepVenue);
  const venueBackup = keepVenue ? {
    stageResPreset: state.stageResPreset || '1920x1080',
    stageWidth: state.stageWidth || 1920,
    stageHeight: state.stageHeight || 1080,
    hdrPipeline: !!state.hdrPipeline,
    masterKeystone: {
      enabled: !!state.masterKeystone.enabled,
      editOnStage: false,
      lensK1: state.masterKeystone.lensK1 || 0,
      points: state.masterKeystone.points.map(p => [p[0], p[1]])
    },
    stageBg: {
      enabled: !!state.stageBg.enabled,
      opacity: state.stageBg.opacity ?? 0.52,
      dataUrl: state.stageBg.dataUrl || null,
      img: state.stageBg.img || null,
      width: state.stageBg.width || 0,
      height: state.stageBg.height || 0
    },
    multiProjector: typeof serializeMultiProjectorState === 'function' ? serializeMultiProjectorState() : null,
    pixelMapper: typeof serializePixelMapperState === 'function' ? serializePixelMapperState() : null,
    worldScreens: Array.isArray(state.worldScreens) ? JSON.parse(JSON.stringify(state.worldScreens)) : null,
    floorplan: state.floorplan ? { ...state.floorplan } : null,
    objAssets: { ...(state.objAssets || {}) },
    masks: state.masks.map(cloneMaskData),
    surfaces: state.surfaces.map(cloneSurfaceData)
  } : null;

  // Keep any currently loaded live File objects in case the user reloads a show in the same session!
  const existingFilesByName = new Map();
  for (const s of state.sources) {
    if (!s.offline && s.file && s.fileName) {
      existingFilesByName.set(s.fileName.toLowerCase(), s.file);
    }
  }

  initBuiltInSources();
  state.customFxPlugins = [];
  if (Array.isArray(data.customFxPlugins)) {
    for (const p of data.customFxPlugins) {
      registerCustomFxPlugin(p);
    }
  }

  let loadedMixbusSnap = null;
  for (const entry of (data.sources || [])) {
    if (entry.kind === 'shader') {
      const sh = state.sources.find(s => s.id === entry.id && s.kind === 'shader');
      if (sh) {
        sh.playing = entry.playing !== false;
        sh.speed = entry.speed ?? sh.speed;
        sh.scale = entry.scale ?? sh.scale;
        sh.detail = entry.detail ?? sh.detail;
        sh.temp = entry.temp ?? sh.temp;
        sh.palette = entry.palette ?? sh.palette;
        sh.mirrorX = !!entry.mirrorX;
      }
    } else if (entry.kind === 'isf') {
      addNewCustomIsfSource(entry, false);
    } else if (entry.kind === 'text') {
      addNewTextSource(entry, false);
    } else if (entry.kind === 'syphon') {
      state.sources.push(createStoppedSyphonPlaceholder(entry));
    } else if (entry.kind === 'mixbus' && entry.mixbus) {
      loadedMixbusSnap = entry.mixbus;
    } else if (entry.kind === 'video' && entry.embeddedDataUrl) {
      const unpackedVid = dataUrlToFile(entry.embeddedDataUrl, entry.fileName || `${entry.name || 'clip'}.mp4`, entry.mimeType || 'video/mp4');
      if (unpackedVid) addVideoSourceFromFile(unpackedVid, null, entry);
      else state.sources.push(createOfflineMediaSource(entry));
    } else if (entry.kind === 'image' && (entry.embeddedDataUrl || entry.inlineDataUrl)) {
      const dUrl = entry.embeddedDataUrl || entry.inlineDataUrl;
      const unpackedImg = entry.embeddedDataUrl
        ? dataUrlToFile(dUrl, entry.fileName || `${entry.name || 'image'}.png`, entry.mimeType || 'image/png')
        : null;
      if (unpackedImg) addImageSourceFromFile(unpackedImg, null, entry);
      else addImageSourceFromDataUrl({ ...entry, inlineDataUrl: dUrl });
    } else if (entry.kind === 'video' || entry.kind === 'image') {
      const liveFile = entry.fileName ? existingFilesByName.get(entry.fileName.toLowerCase()) : null;
      if (liveFile) {
        if (entry.kind === 'video') addVideoSourceFromFile(liveFile, null, entry);
        else addImageSourceFromFile(liveFile, null, entry);
      } else {
        state.sources.push(createOfflineMediaSource(entry));
      }
    }
  }

  // Migrate v1.0 stageAspect or restore v2.0 canonical Stage Resolution
  if (data.stageResPreset) {
    setCanonicalStageResolution(data.stageResPreset, data.stageWidth, data.stageHeight);
  } else {
    const legacyAspect = data.stageAspect ?? (16 / 9);
    if (legacyAspect <= 0.01) setCanonicalStageResolution('fill');
    else if (Math.abs(legacyAspect - 1.6) < 0.03) setCanonicalStageResolution('1920x1200');
    else if (Math.abs(legacyAspect - (4 / 3)) < 0.03) setCanonicalStageResolution('1440x1080');
    else if (Math.abs(legacyAspect - (32 / 9)) < 0.05) setCanonicalStageResolution('3840x1080');
    else if (Math.abs(legacyAspect - (9 / 16)) < 0.03) setCanonicalStageResolution('1080x1920');
    else setCanonicalStageResolution('1920x1080');
  }

  state.hdrPipeline = data.hdrPipeline !== false;
  if (data.stageBg) {
    state.stageBg.opacity = data.stageBg.opacity ?? 0.52;
    if (data.stageBg.dataUrl) {
      setStageBackgroundDataUrl(data.stageBg.dataUrl, !!data.stageBg.enabled);
    } else if (!isAutosave) {
      setStageBackgroundDataUrl(null, false);
    }
  } else if (!isAutosave) {
    setStageBackgroundDataUrl(null, false);
  }
  state.masterOpacity = data.masterOpacity ?? 1.0;
  state.masterKeystone = data.masterKeystone ? {
    enabled: !!data.masterKeystone.enabled,
    editOnStage: false,
    lensK1: data.masterKeystone.lensK1 || 0,
    points: (data.masterKeystone.points || [[0, 0], [1, 0], [1, 1], [0, 1]]).map(p => [p[0], p[1]])
  } : {
    enabled: false,
    editOnStage: false,
    lensK1: 0,
    points: [[0, 0], [1, 0], [1, 1], [0, 1]]
  };

  state.nextSurfaceNum = data.nextSurfaceNum ?? 10;
  state.nextGroupNum = data.nextGroupNum ?? 10;
  state.nextMaskNum = data.nextMaskNum ?? 10;
  state.nextCueNum = data.nextCueNum ?? 10;
  state.nextSourceNum = data.nextSourceNum ?? 10;
  state.nextModNum = data.nextModNum ?? 1;
  state.nextObjNum = data.nextObjNum ?? 1;

  state.objAssets = {};
  if (Array.isArray(data.objAssets)) {
    for (const entry of data.objAssets) {
      if (!entry || !entry.id || typeof entry.objText !== 'string') continue;
      try {
        const parsed = parseObjMesh(entry.objText, `obj:${entry.id}`);
        state.objAssets[entry.id] = {
          id: entry.id,
          name: entry.name || entry.id,
          fileName: entry.fileName || `${entry.name || entry.id}.obj`,
          objText: entry.objText,
          triCount: parsed.triCount,
          uniqueCount: parsed.uniqueVerts.length,
          _mesh: parsed
        };
      } catch (_) {}
    }
  }
  state._objSyncRev = (state._objSyncRev || 0) + 1;

  if (Array.isArray(data.dmxDevices) && typeof createDmxDeviceFromSpec === 'function') {
    state.dmxDevices = data.dmxDevices.map(d => createDmxDeviceFromSpec(d, d));
  } else if (!keepVenue) {
    state.dmxDevices = [];
  }
  if (data.worldStage && typeof syncWorldStageDimensions === 'function') {
    syncWorldStageDimensions(data.worldStage.widthM, data.worldStage.heightM, data.worldStage.depthM, data.worldStage.shape,
      Number.isFinite(Number(data.worldStage.deckHeightM)) ? { deckHeightM: Number(data.worldStage.deckHeightM) } : {});
  }
  if (Array.isArray(data.venueParts) && typeof createVenuePart === 'function') {
    state.venueParts = data.venueParts.map(p => createVenuePart(p.kind, p));
    state.nextVenuePartNum = state.venueParts.length + 1;
    if (typeof markVenuePartsDirty === 'function') markVenuePartsDirty();
  } else if (!keepVenue) {
    state.venueParts = [];
    if (typeof markVenuePartsDirty === 'function') markVenuePartsDirty();
  }
  if (data.workflow) state.workflow = String(data.workflow);
  if (!keepVenue) state.shapesLocked = data.shapesLocked === false ? false : true; // older shows: locked
  state.tipsDone = Array.isArray(data.tipsDone) ? data.tipsDone.map(String) : [];
  state.showParts = Array.isArray(data.showParts) ? data.showParts.map(String) : null; // older shows: everything on
  if (typeof syncShowPartsUI === 'function') syncShowPartsUI(true);
  if (typeof syncShapesLockUI === 'function') syncShapesLockUI();
  if (data.programPrefs && typeof ensureProgramState === 'function') {
    const pp = ensureProgramState();
    if (Number.isFinite(Number(data.programPrefs.takeFadeSec))) pp.takeFadeSec = Number(data.programPrefs.takeFadeSec);
    if (data.programPrefs.autoBlind !== undefined) pp.autoBlind = !!data.programPrefs.autoBlind;
  }
  if (Array.isArray(data.worldProps) && typeof createWorldProp === 'function') {
    state.worldProps = data.worldProps.map(p => createWorldProp(p.kind, p));
    state._worldPropsSeeded = true;
  } else if (!keepVenue) {
    state.worldProps = undefined;
    state._worldPropsSeeded = false;
  }
  if (Array.isArray(data.worldScreens)) {
    state.worldScreens = data.worldScreens.map((ws, idx) =>
      typeof createWorldScreen === 'function' ? createWorldScreen(idx + 1, ws) : { ...ws }
    );
    state.selectedWorldScreenId = data.selectedWorldScreenId || (state.worldScreens[0]?.id || null);
    state.nextWorldScreenNum = data.nextWorldScreenNum || (state.worldScreens.length + 1);
    if (typeof syncPrimaryVenueFromWorldScreens === 'function') syncPrimaryVenueFromWorldScreens();
  } else if (!keepVenue) {
    state.worldScreens = null;
    if (typeof ensureWorldRigSeeded === 'function') ensureWorldRigSeeded();
  }
  if (data.floorplan && typeof ensureFloorplanState === 'function') {
    const fp = ensureFloorplanState();
    Object.assign(fp, {
      name: data.floorplan.name || '',
      widthPx: data.floorplan.widthPx || 0,
      heightPx: data.floorplan.heightPx || 0,
      widthM: data.floorplan.widthM ?? 10.0,
      offsetX: data.floorplan.offsetX ?? 0,
      offsetZ: data.floorplan.offsetZ ?? 0,
      rotDeg: data.floorplan.rotDeg ?? 0,
      opacity: data.floorplan.opacity ?? 0.48,
      locked: !!data.floorplan.locked,
      visible: data.floorplan.visible !== false,
      calibMode: false,
      calibPts: []
    });
    if (data.floorplan.dataUrl && typeof importFloorplanFromDataUrl === 'function') {
      importFloorplanFromDataUrl(data.floorplan.dataUrl, data.floorplan.name || 'Floorplan', { skipUndo: true });
      fp.widthM = data.floorplan.widthM ?? fp.widthM;
      fp.offsetX = data.floorplan.offsetX ?? fp.offsetX;
      fp.offsetZ = data.floorplan.offsetZ ?? fp.offsetZ;
      fp.rotDeg = data.floorplan.rotDeg ?? fp.rotDeg;
      fp.opacity = data.floorplan.opacity ?? fp.opacity;
      fp.locked = !!data.floorplan.locked;
      fp.visible = data.floorplan.visible !== false;
    } else if (!isAutosave) {
      fp.dataUrl = null;
      fp._img = null;
    }
  } else if (!keepVenue && !isAutosave && typeof ensureFloorplanState === 'function') {
    const fp = ensureFloorplanState();
    fp.dataUrl = null;
    fp._img = null;
  }

  state.activeOverrideCueIds = [];

  applySceneSnapshotImmediate({
    surfaces: data.surfaces || [],
    groups: data.groups || [],
    masks: data.masks || [],
    masterFxChain: data.masterFxChain || [],
    mixbus: loadedMixbusSnap,
    modulators: Array.isArray(data.modulators) ? data.modulators : [],
    spots: Array.isArray(data.spots) ? data.spots : null,
    followspot: data.followspot || null
  });

  if (Array.isArray(data.midiMappings) && state.midi) {
    state.midi.mappings = data.midiMappings.map(m => ({ ...m }));
  } else if (state.midi) {
    state.midi.mappings = [];
  }

  if (data.audio && state.audio) {
    state.audio.sourceMode = data.audio.sourceMode || 'synth';
    state.audio.videoSourceId = data.audio.videoSourceId || 'auto';
    state.audio.gain = data.audio.gain ?? 1.25;
    state.audio.smoothing = data.audio.smoothing ?? 0.65;
    state.audio.bpm = data.audio.bpm ?? 120;
    state.audio.autoBpm = !!data.audio.autoBpm;
    // Restore enabled state (including legacy autosaves where data.audio.enabled was undefined while sourceMode === 'video')
    const shouldEnableAudio = data.audio.enabled === true ||
      (data.audio.enabled === undefined && (state.audio.sourceMode === 'video' || state.audio.sourceMode === 'syphon'));
    if (shouldEnableAudio && state.audio.sourceMode !== 'mic') {
      state.audio.enabled = true;
      if (state.audio.sourceMode !== 'synth' && typeof ensureLiveAudioGraph === 'function') {
        ensureLiveAudioGraph();
      }
    } else if (data.audio.enabled === false) {
      state.audio.enabled = false;
    }
  }

  if (data.constellation && state.constellation) {
    state.constellation.active = false;
    state.constellation.puckX = data.constellation.puckX ?? 0;
    state.constellation.puckY = data.constellation.puckY ?? 0;
    state.constellation.targetX = state.constellation.puckX;
    state.constellation.targetY = state.constellation.puckY;
    state.constellation.falloffExp = data.constellation.falloffExp ?? 2.2;
    state.constellation.switchMedia = !!data.constellation.switchMedia;
    state.constellation.inertia = data.constellation.inertia ?? 0.32;
  }

  state.cues = Array.isArray(data.cues)
    ? data.cues.map((c, idx) => {
        if (typeof ensureCueMilestone5Props === 'function') {
          ensureCueMilestone5Props(c, idx, data.cues.length);
        }
        return c;
      })
    : [];

  if (typeof restoreTimelineState === 'function') {
    restoreTimelineState(data.timeline || null);
  }
  if (typeof restoreMultiProjectorState === 'function') {
    restoreMultiProjectorState(data.multiProjector || null);
  }
  if (typeof restorePixelMapperState === 'function') {
    restorePixelMapperState(data.pixelMapper || null);
  }

  if (keepVenue && venueBackup) {
    setCanonicalStageResolution(venueBackup.stageResPreset, venueBackup.stageWidth, venueBackup.stageHeight);
    state.hdrPipeline = venueBackup.hdrPipeline;
    state.masterKeystone = venueBackup.masterKeystone;
    Object.assign(state.stageBg, venueBackup.stageBg);
    state.objAssets = { ...venueBackup.objAssets, ...(state.objAssets || {}) };
    state._objSyncRev = (state._objSyncRev || 0) + 1;
    if (typeof restoreMultiProjectorState === 'function') {
      restoreMultiProjectorState(venueBackup.multiProjector);
    }
    if (typeof restorePixelMapperState === 'function') {
      restorePixelMapperState(venueBackup.pixelMapper);
    }
    if (Array.isArray(venueBackup.worldScreens)) {
      state.worldScreens = venueBackup.worldScreens;
      if (typeof syncPrimaryVenueFromWorldScreens === 'function') syncPrimaryVenueFromWorldScreens();
    }
    if (venueBackup.floorplan) {
      state.floorplan = venueBackup.floorplan;
    }
    if (venueBackup.masks.length > 0) {
      state.masks = instantiateRuntimeScene({ surfaces: [], groups: [], masks: venueBackup.masks }).masks;
    }
    const geomKeys = typeof GEOMETRY_SURF_KEYS !== 'undefined'
      ? GEOMETRY_SURF_KEYS
      : ['type', 'points', 'quadWarp', 'meshCols', 'meshRows', 'meshPts', 'calibMode', 'calibPins', 'pos3d', 'rot3d', 'scale3d', 'camThrow', 'camDist', 'lensShiftX', 'lensShiftY'];
    state.surfaces.forEach((surf, idx) => {
      if (surf.animateGeomInShow) return;
      const vMatch =
        venueBackup.surfaces.find(v => v.id === surf.id && v.type === surf.type) ||
        venueBackup.surfaces.find(v => v.name === surf.name && v.type === surf.type) ||
        (venueBackup.surfaces[idx] && venueBackup.surfaces[idx].type === surf.type ? venueBackup.surfaces[idx] : null);
      if (!vMatch) return;
      for (const gk of geomKeys) {
        if (vMatch[gk] !== undefined) {
          surf[gk] = Array.isArray(vMatch[gk]) ? JSON.parse(JSON.stringify(vMatch[gk])) : vMatch[gk];
        }
      }
      surf._meshDirty = true;
      surf._geomRev = (surf._geomRev || 1) + 1;
      surf._glVerts = null;
    });
    for (const c of state.cues) {
      const rfBase = c.recallFilter || { geometry: false, media: true, gradingFx: true, masks: false, followspot: true, modulators: true };
      c.recallFilter = {
        ...rfBase,
        geometry: false,
        masks: venueBackup.masks.length > 0 ? false : !!rfBase.masks
      };
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  }

  state.activeCueId = data.activeCueId || (state.cues[0] ? state.cues[0].id : null);
  state.manualTouchedKeys = {};
  state.activeSourceId = data.activeSourceId || 'src_shards';
  state.selectedSurfaceId = data.selectedSurfaceId || (state.surfaces[0] ? state.surfaces[0].id : null);
  state.selectedSurfaceIds = state.selectedSurfaceId ? [state.selectedSurfaceId] : [];
  state.selectedMaskId = data.selectedMaskId || (state.masks[0] ? state.masks[0].id : null);
  state.selectedVertex = null;
  state.crossfade.active = false;
  if (typeof cancelCueAutoFollow === 'function') cancelCueAutoFollow();
  clearUndoHistory();

  renderMediaBin();
  renderSurfaceList();
  renderMaskList();
  renderCueList();
  syncTopbarUI();
  syncInspectorUI();
  syncMaskInspectorUI();
  syncFollowspotInspectorUI();
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  if (typeof syncCueRecallToolbarUI === 'function') syncCueRecallToolbarUI();
  if (typeof syncTimelineToolbarUI === 'function') syncTimelineToolbarUI();
  if (typeof syncRoomUI === 'function') syncRoomUI();
  syncTransportUI();
  updateRelinkBadgeUI();
  if (typeof refreshSavedHandleMatches === 'function') {
    refreshSavedHandleMatches();
  }

  const offlineCount = state.sources.filter(s => s.offline).length;
  if (!isAutosave) {
    if (offlineCount > 0) {
      openRelinkModal();
      showToast(`Show loaded${keepVenue ? ' (Venue Kept)' : ''} — ${offlineCount} local media file(s) ready to relink`);
    } else {
      showToast(keepVenue ? 'Show loaded cleanly — Venue Calibration Preserved' : 'Show loaded cleanly');
    }
    scheduleAutosave();
  }
  if (!isAutosave && typeof markShowSavedToFile === 'function') markShowSavedToFile();
  if (typeof emitWebMapperEvent === 'function') {
    emitWebMapperEvent('showLoaded', { isAutosave: !!isAutosave });
  }
  return true;
}

let autosaveTimer = null;
function scheduleAutosave() {
  if (state.isProjectorRole || state._resetting) return;
  if (typeof markShowEdited === 'function') markShowEdited();
  const ind = document.getElementById('autosave-indicator');
  if (ind) ind.textContent = 'Saving…';
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      // Omit large inline DataURLs in localStorage so quota is never exceeded
      const payload = serializeShowData(false);
      localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(payload));
      if (ind) ind.textContent = 'Autosaved';
    } catch (_) {
      if (ind) ind.textContent = 'Memory Only';
    }
  }, 850);
}

function tryRestoreAutosave() {
  if (state.isProjectorRole) return false;
  try {
    const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY) || localStorage.getItem(LEGACY_AUTOSAVE_STORAGE_KEY);
    if (!raw) return false;
    return importShowJson(raw, true);
  } catch (_) {
    return false;
  }
}
