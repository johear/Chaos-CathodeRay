// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05e-multiproj-dmx-api.js — Milestone 6:
//   1. Multi-Projector Screen Routing, Optical Edge-Blending & GPU Delay Ring
//   2. Real-Time LED Pixel Mapper, WebSerial USB-DMX & Art-Net (OpDmx 0x5000)
//   3. Public Extension Hook API (window.WebMapperAPI) for Open-Source & AI
// ============================================================================

// ============================================================================
// 1. MULTI-PROJECTOR SCREEN ROUTING & OPTICAL EDGE-BLENDING ENGINE
// ============================================================================

const projectorWindowsMap = new Map(); // screenIndex (1..N) -> Window
const MAX_MULTI_PROJ_SCREENS = typeof MAX_PROJECTOR_SCREENS === 'number' ? MAX_PROJECTOR_SCREENS : 32;

const EDGE_BLEND_GRID_PRESETS = {
  '1x1': { cols: 1, rows: 1, stackCount: 0, label: '1×1 Single Projector' },
  '2x1': { cols: 2, rows: 1, stackCount: 0, label: '2×1 Dual Horizontal Panorama' },
  '3x1': { cols: 3, rows: 1, stackCount: 0, label: '3×1 Triple Widescreen Panorama' },
  '4x1': { cols: 4, rows: 1, stackCount: 0, label: '4×1 Quad Panorama' },
  '5x1': { cols: 5, rows: 1, stackCount: 0, label: '5×1 5-Wide Panorama' },
  '6x1': { cols: 6, rows: 1, stackCount: 0, label: '6×1 6-Wide Panorama' },
  '1x2': { cols: 1, rows: 2, stackCount: 0, label: '1×2 Dual Vertical Tower' },
  '2x2': { cols: 2, rows: 2, stackCount: 0, label: '2×2 Quad Array Matrix' },
  '3x2': { cols: 3, rows: 2, stackCount: 0, label: '3×2 6-Projector Matrix' },
  '4x2': { cols: 4, rows: 2, stackCount: 0, label: '4×2 8-Projector Matrix' },
  '2x-stack': { cols: 1, rows: 1, stackCount: 2, label: '2× Full Overlap (Constant Brightness)' },
  '3x-stack': { cols: 1, rows: 1, stackCount: 3, label: '3× Full Overlap (Constant Brightness)' },
  '4x-stack': { cols: 1, rows: 1, stackCount: 4, label: '4× Full Overlap (Constant Brightness)' }
};

function parseEdgeBlendGridSpec(layoutPreset = '2x1') {
  const key = String(layoutPreset || '2x1').trim().toLowerCase();
  if (EDGE_BLEND_GRID_PRESETS[key]) return EDGE_BLEND_GRID_PRESETS[key];
  const stackMatch = key.match(/^(\d+)x-stack$/);
  if (stackMatch) {
    const n = clamp(parseInt(stackMatch[1], 10) || 2, 2, MAX_MULTI_PROJ_SCREENS);
    return { cols: 1, rows: 1, stackCount: n, label: `${n}× Full Overlap (Constant Brightness)` };
  }
  const gridMatch = key.match(/^(\d+)x(\d+)$/);
  if (gridMatch) {
    const cols = clamp(parseInt(gridMatch[1], 10) || 2, 1, 16);
    const maxRows = Math.max(1, Math.floor(MAX_MULTI_PROJ_SCREENS / cols));
    const rows = clamp(parseInt(gridMatch[2], 10) || 1, 1, Math.min(8, maxRows));
    return { cols, rows, stackCount: 0, label: `${cols}×${rows} Projector Array` };
  }
  return EDGE_BLEND_GRID_PRESETS['2x1'];
}

function createProjectorScreenSlice(index = 1, overrides = {}) {
  const idx = clamp(Math.round(Number(index) || 1), 1, MAX_MULTI_PROJ_SCREENS);
  const ks = overrides.keystone && typeof overrides.keystone === 'object' ? overrides.keystone : {};
  const defaultPts = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const pts = Array.isArray(ks.points) && ks.points.length === 4
    ? ks.points.map(p => [Number(p[0]) || 0, Number(p[1]) || 0])
    : defaultPts.map(p => [p[0], p[1]]);

  const slice = {
    index: idx,
    id: overrides.id || `proj_screen_${idx}`,
    name: String(overrides.name || `Screen ${idx}`),
    enabled: overrides.enabled !== false,
    cropX: clamp(Number(overrides.cropX ?? 0.0), 0.0, 0.99),
    cropY: clamp(Number(overrides.cropY ?? 0.0), 0.0, 0.99),
    cropW: clamp(Number(overrides.cropW ?? 1.0), 0.05, 1.0),
    cropH: clamp(Number(overrides.cropH ?? 1.0), 0.05, 1.0),
    blendL: clamp(Number(overrides.blendL ?? 0.0), 0.0, 0.98),
    blendR: clamp(Number(overrides.blendR ?? 0.0), 0.0, 0.98),
    blendT: clamp(Number(overrides.blendT ?? 0.0), 0.0, 0.98),
    blendB: clamp(Number(overrides.blendB ?? 0.0), 0.0, 0.98),
    gain: clamp(Number(overrides.gain ?? 1.0), 0.10, 2.0),
    kelvin: clamp(Number(overrides.kelvin ?? 0.0), -1.0, 1.0),
    delayMs: clamp(Math.round(Number(overrides.delayMs ?? 0)), 0, 200),
    posM: Array.isArray(overrides.posM) && overrides.posM.length === 3
      ? [Number(overrides.posM[0]) || 0, Number(overrides.posM[1]) || 0, Number(overrides.posM[2]) || 0]
      : null,
    aimM: Array.isArray(overrides.aimM) && overrides.aimM.length === 3
      ? [Number(overrides.aimM[0]) || 0, Number(overrides.aimM[1]) || 0, Number(overrides.aimM[2]) || 0]
      : null,
    rollDeg: clamp(Number(overrides.rollDeg ?? 0.0), -180, 180),
    throwRatio: clamp(Number(overrides.throwRatio ?? 1.2), 0.28, 5.0),
    lensShiftX: clamp(Number(overrides.lensShiftX ?? 0.0), -0.8, 0.8),
    lensShiftY: clamp(Number(overrides.lensShiftY ?? 0.0), -0.8, 0.8),
    lumens: clamp(Math.round(Number(overrides.lumens ?? 8500)), 500, 80000),
    // Per-projector spot calibration trim in raster units (05h · Spot calibration)
    spotTrim: Array.isArray(overrides.spotTrim) ? [clamp(Number(overrides.spotTrim[0]) || 0, -0.25, 0.25), clamp(Number(overrides.spotTrim[1]) || 0, -0.25, 0.25)] : [0, 0],
    pjlink: overrides.pjlink && typeof overrides.pjlink === 'object' ? {
      enabled: !!overrides.pjlink.enabled,
      ip: String(overrides.pjlink.ip || '').trim(),
      port: clamp(Math.round(Number(overrides.pjlink.port) || 4352), 1, 65535),
      password: String(overrides.pjlink.password || ''),
      linkDbo: !!overrides.pjlink.linkDbo,
      measuredShutterMs: clamp(Math.round(Number(overrides.pjlink.measuredShutterMs) || 180), 0, 2000),
      shutterClosed: !!overrides.pjlink.shutterClosed,
      lampHours: String(overrides.pjlink.lampHours || '—'),
      errorStatus: String(overrides.pjlink.errorStatus || '—'),
      lastRttMs: Number(overrides.pjlink.lastRttMs) || 0,
      online: !!overrides.pjlink.online
    } : undefined,
    keystone: {
      enabled: !!ks.enabled,
      editOnStage: !!ks.editOnStage,
      lensK1: clamp(Number(ks.lensK1 ?? 0.0), -0.35, 0.35),
      points: pts
    }
  };
  // New projectors without an explicit pose are placed so their frame lands on
  // the region of the physical screen their output crop covers (no more beams
  // seeded off the edge of the screen).
  if (!slice.posM && typeof autoAimProjectorAtWorldScreen === 'function') {
    autoAimProjectorAtWorldScreen(slice);
  } else if (typeof ensureScreenPhysicalPose === 'function') {
    ensureScreenPhysicalPose(slice, idx, Math.max(2, idx));
  }
  return slice;
}

function computeEdgeBlendGridSlices(layoutPreset = '2x1', overlapPct = 0.15, blendGamma = 2.2) {
  const spec = parseEdgeBlendGridSpec(layoutPreset);
  const g = Math.max(0.5, Number(blendGamma) || 2.2);

  if (spec.stackCount && spec.stackCount >= 2) {
    const n = clamp(spec.stackCount, 2, MAX_MULTI_PROJ_SCREENS);
    const stackGain = Number(Math.pow(1.0 / n, 1.0 / g).toFixed(4));
    const slices = [];
    for (let i = 1; i <= n; i++) {
      slices.push({
        index: i,
        name: `Screen ${i} (Stack ${i}/${n})`,
        cropX: 0.0,
        cropY: 0.0,
        cropW: 1.0,
        cropH: 1.0,
        blendL: 0.0,
        blendR: 0.0,
        blendT: 0.0,
        blendB: 0.0,
        gain: stackGain
      });
    }
    return { cols: 1, rows: 1, stackCount: n, overlapPct: 1.0, slices };
  }

  const cols = spec.cols;
  const rows = spec.rows;
  // Two opposing projectors (2x1 or 1x2) have only one outer ramp each, so raised-cosine unity holds up to 95% cross-stage overlap!
  // Grids with >=3 cols/rows clamp overlap to <=48% so left & right ramps on interior projectors never overlap each other.
  const maxOverlap = (cols <= 2 && rows <= 2 && (cols === 1 || rows === 1)) ? 0.95 : 0.48;
  const p = clamp(Number(overlapPct) || 0, 0, maxOverlap);

  const cropW = cols === 1 ? 1.0 : (1.0 / (cols - (cols - 1) * p));
  const cropH = rows === 1 ? 1.0 : (1.0 / (rows - (rows - 1) * p));

  const slices = [];
  let idx = 1;
  for (let r = 0; r < rows; r++) {
    const invR = (rows - 1) - r; // r=0 is top row (stage Y near 1.0), r=rows-1 is bottom row (stage Y near 0.0)
    for (let c = 0; c < cols; c++) {
      const cropX = cols === 1 ? 0.0 : c * cropW * (1.0 - p);
      const cropY = rows === 1 ? 0.0 : invR * cropH * (1.0 - p);
      const rowLabel = rows === 1 ? '' : (rows === 2 ? (r === 0 ? 'Top ' : 'Bot ') : `R${r + 1} `);
      slices.push({
        index: idx,
        name: cols * rows === 1
          ? 'Screen 1 (Full)'
          : `Screen ${idx} (${rowLabel}Col ${c + 1})`,
        cropX: Number(cropX.toFixed(6)),
        cropY: Number(cropY.toFixed(6)),
        cropW: Number(cropW.toFixed(6)),
        cropH: Number(cropH.toFixed(6)),
        blendL: c > 0 ? Number(p.toFixed(4)) : 0.0,
        blendR: c < cols - 1 ? Number(p.toFixed(4)) : 0.0,
        blendT: r > 0 ? Number(p.toFixed(4)) : 0.0,
        blendB: r < rows - 1 ? Number(p.toFixed(4)) : 0.0,
        gain: 1.0
      });
      idx++;
    }
  }
  return { cols, rows, stackCount: 0, overlapPct: p, slices };
}

function computeRecommendedStageResForGrid(layoutPreset = '2x1', overlapPct = 0.15, projW = 1920, projH = 1080) {
  const spec = parseEdgeBlendGridSpec(layoutPreset);
  const pw = clamp(Math.round(Number(projW) || 1920), 640, 8192);
  const ph = clamp(Math.round(Number(projH) || 1080), 480, 8192);
  if (spec.stackCount && spec.stackCount >= 2) {
    const width = clamp(Math.round(pw / 2) * 2, 256, 8192);
    const height = clamp(Math.round(ph / 2) * 2, 256, 8192);
    return {
      width,
      height,
      overlapPxX: width,
      overlapPxY: height,
      cols: 1,
      rows: 1,
      stackCount: spec.stackCount,
      screenCount: spec.stackCount
    };
  }
  const maxOverlap = (spec.cols <= 2 && spec.rows <= 2 && (spec.cols === 1 || spec.rows === 1)) ? 0.95 : 0.48;
  const p = clamp(Number(overlapPct) || 0, 0, maxOverlap);
  const rawW = spec.cols === 1 ? pw : Math.round(pw * (spec.cols - (spec.cols - 1) * p));
  const rawH = spec.rows === 1 ? ph : Math.round(ph * (spec.rows - (spec.rows - 1) * p));
  // Align to even pixel counts for clean GPU mip/video encoding (up to 8192px for 4x1..6x1 panoramas)
  const width = clamp(Math.round(rawW / 2) * 2, 256, 8192);
  const height = clamp(Math.round(rawH / 2) * 2, 256, 8192);
  const overlapPxX = spec.cols > 1 ? Math.round(pw * p) : 0;
  const overlapPxY = spec.rows > 1 ? Math.round(ph * p) : 0;
  return {
    width,
    height,
    overlapPxX,
    overlapPxY,
    cols: spec.cols,
    rows: spec.rows,
    stackCount: 0,
    screenCount: spec.cols * spec.rows
  };
}

// Pure CPU reference evaluator matching FS_CROSSFADE raised-cosine optical feathering & stack gain 1:1
function evalRaisedCosineEdgeBlendWeight(stageU, stageV, slice, blendGamma = 2.2) {
  if (!slice) return { localU: stageU, localV: stageV, inBounds: true, linearMask: 1, encodedMask: 1, physicalLum: 1 };
  const w = Math.max(1e-5, slice.cropW ?? 1);
  const h = Math.max(1e-5, slice.cropH ?? 1);
  const lu = (stageU - (slice.cropX ?? 0)) / w;
  const lv = (stageV - (slice.cropY ?? 0)) / h;
  if (lu < -1e-6 || lu > 1 + 1e-6 || lv < -1e-6 || lv > 1 + 1e-6) {
    return { localU: lu, localV: lv, inBounds: false, linearMask: 0, encodedMask: 0, physicalLum: 0 };
  }
  const u = clamp(lu, 0, 1);
  const v = clamp(lv, 0, 1);
  const ramp = (dist, bw) => {
    if (!(bw > 0.0005)) return 1.0;
    const t = clamp(dist / bw, 0, 1);
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  };
  const aL = ramp(u, slice.blendL || 0);
  const aR = ramp(1.0 - u, slice.blendR || 0);
  const aB = ramp(v, slice.blendB || 0);
  const aT = ramp(1.0 - v, slice.blendT || 0);
  const linearMask = clamp(aL * aR * aB * aT, 0, 1);
  const g = Math.max(0.5, Number(blendGamma) || 2.2);
  const gain = Math.max(0, Number(slice.gain ?? 1.0));
  const encodedMask = gain * Math.pow(linearMask, 1.0 / g);
  const physicalLum = Math.pow(gain, g) * linearMask;
  return { localU: u, localV: v, inBounds: true, linearMask, encodedMask, physicalLum };
}

function ensureMultiProjectorState() {
  if (!state.multiProjector || typeof state.multiProjector !== 'object') {
    const initGrid = computeEdgeBlendGridSlices('2x1', 0.15, 2.2);
    state.multiProjector = {
      enabled: false,
      layoutPreset: '2x1',
      customCols: 4,
      customRows: 1,
      overlapPct: 0.15,
      blendGamma: 2.2,
      blackOffset: 0.0,
      showStageGuides: true,
      alignmentGridOnOutput: false,
      selectedScreenIndex: 1,
      previewScreenIndex: 0, // 0 = Full Canonical Stage, 1..N = Preview specific screen slice locally
      projNativeW: 1920,
      projNativeH: 1080,
      _screensInitialized: true,
      screens: initGrid.slices.map(s => createProjectorScreenSlice(s.index, s))
    };
    // Seeded projectors were auto-aimed before the rig existed — re-run so stacked ones
    // don't occupy the exact same spot.
    if (typeof reaimAutoPlacedProjectors === 'function') reaimAutoPlacedProjectors(state.multiProjector);
  }
  if (!Number.isFinite(state.multiProjector.customCols)) state.multiProjector.customCols = 4;
  if (!Number.isFinite(state.multiProjector.customRows)) state.multiProjector.customRows = 1;
  if (!Array.isArray(state.multiProjector.screens)) {
    state.multiProjector.screens = [];
  }
  if (state.multiProjector.screens.length === 0 && !state.multiProjector._screensInitialized) {
    const grid = computeEdgeBlendGridSlices(
      state.multiProjector.layoutPreset || '2x1',
      state.multiProjector.overlapPct ?? 0.15,
      state.multiProjector.blendGamma ?? 2.2
    );
    state.multiProjector.screens = grid.slices.map(s => createProjectorScreenSlice(s.index, s));
  }
  state.multiProjector._screensInitialized = true;
  return state.multiProjector;
}

function applyEdgeBlendLayoutPreset(layoutPreset, overlapPct = null, applyRecommendedRes = false, projW = null, projH = null) {
  const mp = ensureMultiProjectorState();
  if (layoutPreset) {
    mp.layoutPreset = layoutPreset;
    const m = String(layoutPreset).match(/^(\d+)x(\d+)$/);
    if (m) {
      mp.customCols = clamp(parseInt(m[1], 10) || 2, 1, 16);
      mp.customRows = clamp(parseInt(m[2], 10) || 1, 1, Math.min(8, Math.max(1, Math.floor(MAX_MULTI_PROJ_SCREENS / mp.customCols))));
    }
  }
  const spec = mp.layoutPreset !== 'custom' ? parseEdgeBlendGridSpec(mp.layoutPreset) : { cols: 2, rows: 1, stackCount: 0 };
  const maxOverlap = (spec.cols <= 2 && spec.rows <= 2 && (spec.cols === 1 || spec.rows === 1)) ? 0.95 : 0.48;
  if (overlapPct !== null && Number.isFinite(Number(overlapPct))) {
    mp.overlapPct = clamp(Number(overlapPct), 0, maxOverlap);
  } else if (!spec.stackCount && mp.overlapPct > maxOverlap) {
    mp.overlapPct = maxOverlap;
  }
  if (projW !== null && Number.isFinite(Number(projW))) mp.projNativeW = clamp(Math.round(Number(projW)), 640, 8192);
  if (projH !== null && Number.isFinite(Number(projH))) mp.projNativeH = clamp(Math.round(Number(projH)), 480, 8192);

  if (mp.layoutPreset !== 'custom') {
    const prevByIdx = new Map(mp.screens.map(s => [s.index, s]));
    const grid = computeEdgeBlendGridSlices(mp.layoutPreset, mp.overlapPct, mp.blendGamma ?? 2.2);
    mp.screens = grid.slices.map(sl => {
      const prev = prevByIdx.get(sl.index);
      const base = prev ? { ...prev } : {};
      // Projectors still at their auto-aimed pose re-aim for the new layout's crop.
      if (prev && prev._autoPose && typeof projectorPoseKey === 'function' && prev._autoPose === projectorPoseKey(prev)) {
        delete base.posM;
        delete base.aimM;
      }
      return createProjectorScreenSlice(sl.index, { ...base, ...sl });
    });
    if (typeof reaimAutoPlacedProjectors === 'function') reaimAutoPlacedProjectors(mp);
  }

  if (mp.selectedScreenIndex > mp.screens.length) mp.selectedScreenIndex = 1;
  if (mp.previewScreenIndex > mp.screens.length) mp.previewScreenIndex = 0;

  if (applyRecommendedRes && typeof setCanonicalStageResolution === 'function') {
    const rec = computeRecommendedStageResForGrid(mp.layoutPreset, mp.overlapPct, mp.projNativeW, mp.projNativeH);
    setCanonicalStageResolution('custom', rec.width, rec.height);
  }

  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return mp;
}

function addCustomProjectorScreen(overrides = {}) {
  const mp = ensureMultiProjectorState();
  if (mp.screens.length >= MAX_MULTI_PROJ_SCREENS) {
    if (typeof showToast === 'function') showToast(`Maximum ${MAX_MULTI_PROJ_SCREENS} projector screens reached`);
    return null;
  }
  mp.layoutPreset = 'custom';
  mp.enabled = true;
  const nextIdx = mp.screens.length + 1;
  const created = createProjectorScreenSlice(nextIdx, {
    name: overrides.name || `Screen ${nextIdx}`,
    cropX: overrides.cropX ?? 0.0,
    cropY: overrides.cropY ?? 0.0,
    cropW: overrides.cropW ?? 1.0,
    cropH: overrides.cropH ?? 1.0,
    blendL: overrides.blendL ?? 0.0,
    blendR: overrides.blendR ?? 0.0,
    blendT: overrides.blendT ?? 0.0,
    blendB: overrides.blendB ?? 0.0,
    gain: overrides.gain ?? 1.0,
    ...overrides
  });
  mp.screens.push(created);
  mp.selectedScreenIndex = created.index;
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return created;
}

function removeProjectorScreen(screenIndex = null, opts = {}) {
  const mp = ensureMultiProjectorState();
  if (mp.screens.length === 0) return false;
  const allowZero = !!(opts.allowZero || state.room === 'build' || state.room === 'world');
  if (mp.screens.length <= 1 && !allowZero) {
    if (typeof showToast === 'function') showToast('At least 1 projector screen is required in Multi-Projector output');
    return false;
  }
  const targetIdx = screenIndex !== null ? Number(screenIndex) : mp.selectedScreenIndex;
  const pos = mp.screens.findIndex(s => s.index === targetIdx);
  if (pos < 0) return false;
  mp.screens.splice(pos, 1);
  mp.screens.forEach((s, i) => {
    const newIdx = i + 1;
    if (/^Screen \d+(\b|$)/.test(s.name)) {
      s.name = s.name.replace(/^Screen \d+/, `Screen ${newIdx}`);
    }
    s.index = newIdx;
    s.id = `proj_screen_${newIdx}`;
  });
  mp.layoutPreset = 'custom';
  if (mp.screens.length === 0) {
    mp.enabled = false;
    mp.selectedScreenIndex = 0;
    mp.previewScreenIndex = 0;
  } else {
    mp.selectedScreenIndex = clamp(mp.selectedScreenIndex, 1, mp.screens.length);
    if (mp.previewScreenIndex > mp.screens.length) mp.previewScreenIndex = 0;
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  if (typeof syncRoomUI === 'function') syncRoomUI();
  if (typeof syncRigWorkspaceUI === 'function') syncRigWorkspaceUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return true;
}

function getSelectedProjectorScreen() {
  const mp = ensureMultiProjectorState();
  return mp.screens.find(s => s.index === mp.selectedScreenIndex) || mp.screens[0] || null;
}

function getActiveProjectorSliceForRender() {
  const mp = state.multiProjector;
  const allowLocalFeedPreview = !state.isProjectorRole && mp && mp.previewScreenIndex > 0;
  if (!mp || (!mp.enabled && !allowLocalFeedPreview) || !Array.isArray(mp.screens) || mp.screens.length === 0) {
    return null;
  }
  let targetIndex = 0;
  if (state.isProjectorRole) {
    targetIndex = clamp(Math.round(Number(state.projectorScreenIndex) || 1), 1, MAX_MULTI_PROJ_SCREENS);
  } else if (mp.previewScreenIndex > 0) {
    targetIndex = mp.previewScreenIndex;
  }
  if (targetIndex <= 0) return null;

  const scr = mp.screens.find(s => s.index === targetIndex) || mp.screens[0];
  if (!scr || scr.enabled === false) {
    return {
      disabledBlank: true,
      index: targetIndex
    };
  }
  return {
    disabledBlank: false,
    index: scr.index,
    cropX: scr.cropX ?? 0,
    cropY: scr.cropY ?? 0,
    cropW: scr.cropW ?? 1,
    cropH: scr.cropH ?? 1,
    blendL: scr.blendL ?? 0,
    blendR: scr.blendR ?? 0,
    blendT: scr.blendT ?? 0,
    blendB: scr.blendB ?? 0,
    blendGamma: mp.blendGamma ?? 2.2,
    blackOffset: mp.blackOffset ?? 0.0,
    gain: scr.gain ?? 1.0,
    kelvin: scr.kelvin ?? 0.0,
    delayMs: scr.delayMs ?? 0,
    alignmentGrid: !state.showLock && !!mp.alignmentGridOnOutput,
    useStagePlanSolver: !!(mp.stagePlan && mp.stagePlan.enabled),
    keystone: scr.keystone || null
  };
}

function getOpenProjectorWindowsList() {
  const list = [];
  if (typeof projectorWindow !== 'undefined' && projectorWindow && !projectorWindow.closed) {
    list.push(projectorWindow);
  }
  for (const [idx, win] of projectorWindowsMap.entries()) {
    if (!win || win.closed) {
      projectorWindowsMap.delete(idx);
    } else if (!list.includes(win)) {
      list.push(win);
    }
  }
  return list;
}

async function launchProjectorScreenWindow(screenIndex = 1, cachedScreensList = null) {
  const idx = clamp(Math.round(Number(screenIndex) || 1), 1, MAX_MULTI_PROJ_SCREENS);
  const existing = projectorWindowsMap.get(idx);
  if (existing && !existing.closed) {
    existing.focus();
    if (typeof broadcastAllMediaToProjector === 'function') broadcastAllMediaToProjector();
    if (typeof showToast === 'function') showToast(`Projector Screen ${idx} window focused & synced`);
    return existing;
  }

  const u = new URL(window.location.href);
  u.searchParams.set('role', 'projector');
  u.searchParams.set('screen', String(idx));

  let left = window.screenX + 60 + (idx - 1) * 48;
  let top = window.screenY + 50 + (idx - 1) * 36;
  let width = 1280;
  let height = 720;

  let extScreens = cachedScreensList;
  if (!extScreens && 'getScreenDetails' in window) {
    try {
      const details = await window.getScreenDetails();
      extScreens = details.screens
        .filter(s => s !== details.currentScreen)
        .sort((a, b) => (a.availLeft - b.availLeft) || (a.availTop - b.availTop));
    } catch (_) {
      extScreens = null;
    }
  }

  if (Array.isArray(extScreens) && extScreens.length > 0) {
    const targetDisp = extScreens[(idx - 1) % extScreens.length];
    if (targetDisp) {
      left = targetDisp.availLeft;
      top = targetDisp.availTop;
      width = targetDisp.availWidth;
      height = targetDisp.availHeight;
    }
  }

  const features = `popup=yes,left=${Math.round(left)},top=${Math.round(top)},width=${Math.round(width)},height=${Math.round(height)}`;
  const win = window.open(u.toString(), `WebMapperProjectorScreen_${idx}`, features);
  if (!win) {
    if (typeof showToast === 'function') {
      showToast(`Popup blocked for Screen ${idx} — allow popups in browser bar`);
    }
    return null;
  }

  projectorWindowsMap.set(idx, win);
  if (idx === 1 && typeof projectorWindow !== 'undefined') {
    projectorWindow = win;
  }
  if (typeof markProjectorConnected === 'function') markProjectorConnected(true);
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof showToast === 'function') {
    showToast(`Opened Projector Screen ${idx} — press F on projector window for Fullscreen`);
  }
  return win;
}

async function launchAllProjectorScreens() {
  const mp = ensureMultiProjectorState();
  if (!mp.enabled) {
    mp.enabled = true;
    if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  }
  let extScreens = null;
  if ('getScreenDetails' in window) {
    try {
      const details = await window.getScreenDetails();
      extScreens = details.screens
        .filter(s => s !== details.currentScreen)
        .sort((a, b) => (a.availLeft - b.availLeft) || (a.availTop - b.availTop));
    } catch (_) {
      extScreens = null;
    }
  }
  let opened = 0;
  for (const scr of mp.screens) {
    if (scr.enabled === false) continue;
    const w = await launchProjectorScreenWindow(scr.index, extScreens);
    if (w) opened++;
  }
  if (opened > 0 && typeof showToast === 'function') {
    showToast(`Launched ${opened} Edge-Blended Projector Window${opened > 1 ? 's' : ''}`);
  }
  return opened;
}

function serializeMultiProjectorState() {
  const mp = ensureMultiProjectorState();
  if (typeof ensureStagePlanState === 'function') ensureStagePlanState(mp);
  return {
    enabled: !!mp.enabled,
    layoutPreset: mp.layoutPreset || '2x1',
    customCols: mp.customCols || 4,
    customRows: mp.customRows || 1,
    overlapPct: mp.overlapPct ?? 0.15,
    blendGamma: mp.blendGamma ?? 2.2,
    blackOffset: mp.blackOffset ?? 0.0,
    showStageGuides: mp.showStageGuides !== false,
    alignmentGridOnOutput: !!mp.alignmentGridOnOutput,
    selectedScreenIndex: mp.selectedScreenIndex || 1,
    previewScreenIndex: 0,
    projNativeW: mp.projNativeW || 1920,
    projNativeH: mp.projNativeH || 1080,
    stagePlan: mp.stagePlan ? {
      enabled: !!mp.stagePlan.enabled,
      viewMode: mp.stagePlan.viewMode || 'plan2d',
      presetId: mp.stagePlan.presetId || 'opposing_wings_constant',
      uniformity: mp.stagePlan.uniformity ?? 1.0,
      featherPct: mp.stagePlan.featherPct ?? 0.14,
      shadowComp: mp.stagePlan.shadowComp !== false,
      orbitYaw: mp.stagePlan.orbitYaw ?? -28,
      orbitPitch: mp.stagePlan.orbitPitch ?? 24,
      orbitZoom: mp.stagePlan.orbitZoom ?? 1.0,
      venue: mp.stagePlan.venue ? { ...mp.stagePlan.venue } : undefined
    } : undefined,
    screens: mp.screens.map(s => ({
      index: s.index,
      id: s.id,
      name: s.name,
      enabled: s.enabled !== false,
      cropX: s.cropX,
      cropY: s.cropY,
      cropW: s.cropW,
      cropH: s.cropH,
      blendL: s.blendL,
      blendR: s.blendR,
      blendT: s.blendT,
      blendB: s.blendB,
      gain: s.gain ?? 1.0,
      kelvin: s.kelvin ?? 0.0,
      delayMs: s.delayMs ?? 0,
      posM: Array.isArray(s.posM) ? [...s.posM] : undefined,
      aimM: Array.isArray(s.aimM) ? [...s.aimM] : undefined,
      rollDeg: s.rollDeg ?? 0,
      throwRatio: s.throwRatio ?? 1.2,
      lensShiftX: s.lensShiftX ?? 0,
      lensShiftY: s.lensShiftY ?? 0,
      lumens: s.lumens ?? 8500,
      spotTrim: Array.isArray(s.spotTrim) ? [Number(s.spotTrim[0]) || 0, Number(s.spotTrim[1]) || 0] : undefined,
      pjlink: s.pjlink ? {
        enabled: !!s.pjlink.enabled,
        ip: String(s.pjlink.ip || ''),
        port: Number(s.pjlink.port) || 4352,
        password: String(s.pjlink.password || ''),
        linkDbo: !!s.pjlink.linkDbo,
        measuredShutterMs: Number(s.pjlink.measuredShutterMs) || 180,
        shutterClosed: !!s.pjlink.shutterClosed
      } : undefined,
      keystone: {
        enabled: !!(s.keystone && s.keystone.enabled),
        editOnStage: false,
        lensK1: s.keystone?.lensK1 || 0,
        points: (s.keystone?.points || [[0, 0], [1, 0], [1, 1], [0, 1]]).map(p => [p[0], p[1]])
      }
    }))
  };
}

function restoreMultiProjectorState(raw) {
  const mp = ensureMultiProjectorState();
  if (!raw || typeof raw !== 'object') {
    mp.enabled = false;
    mp.previewScreenIndex = 0;
    mp.stagePlan = null;
    if (typeof ensureStagePlanState === 'function') ensureStagePlanState(mp);
    applyEdgeBlendLayoutPreset('2x1', 0.15, false);
    return;
  }
  mp.enabled = !!raw.enabled;
  mp.layoutPreset = raw.layoutPreset || '2x1';
  mp.customCols = clamp(Math.round(Number(raw.customCols) || 4), 1, 16);
  mp.customRows = clamp(Math.round(Number(raw.customRows) || 1), 1, 8);
  mp.overlapPct = clamp(Number(raw.overlapPct ?? 0.15), 0, 0.95);
  mp.blendGamma = clamp(Number(raw.blendGamma ?? 2.2), 0.8, 3.5);
  mp.blackOffset = clamp(Number(raw.blackOffset ?? 0.0), 0.0, 0.35);
  mp.showStageGuides = raw.showStageGuides !== false;
  mp.alignmentGridOnOutput = !!raw.alignmentGridOnOutput;
  mp.projNativeW = clamp(Math.round(Number(raw.projNativeW) || 1920), 640, 8192);
  mp.projNativeH = clamp(Math.round(Number(raw.projNativeH) || 1080), 480, 8192);
  mp.previewScreenIndex = clamp(Math.round(Number(raw.previewScreenIndex) || 0), 0, MAX_MULTI_PROJ_SCREENS);
  mp.stagePlan = raw.stagePlan && typeof raw.stagePlan === 'object'
    ? JSON.parse(JSON.stringify(raw.stagePlan))
    : null;
  if (typeof ensureStagePlanState === 'function') ensureStagePlanState(mp);
  if (Array.isArray(raw.screens) && raw.screens.length > 0) {
    mp.screens = raw.screens.slice(0, MAX_MULTI_PROJ_SCREENS).map((s, idx) => createProjectorScreenSlice(s.index || (idx + 1), s));
  } else {
    const grid = computeEdgeBlendGridSlices(mp.layoutPreset, mp.overlapPct, mp.blendGamma);
    mp.screens = grid.slices.map(s => createProjectorScreenSlice(s.index, s));
  }
  mp.selectedScreenIndex = clamp(Math.round(Number(raw.selectedScreenIndex) || 1), 1, mp.screens.length);
  if (typeof solveStagePlanOpticalField === 'function' && mp.stagePlan && mp.stagePlan.enabled) {
    solveStagePlanOpticalField(mp, true);
  }
}

// ============================================================================
// 2. REAL-TIME LED PIXEL MAPPER, WEBSERIAL USB-DMX & ART-NET (OpDmx 0x5000)
// ============================================================================

const DMX_COLOR_ORDERS = {
  RGB: 3,
  GRB: 3,
  BGR: 3,
  RGBW: 4,
  Luma: 1,
  RGB16: 6
};

const DMX_SAMPLE_W = 256;
const DMX_SAMPLE_H = 144;
const dmxStageReadbackBuf = new Uint8Array(DMX_SAMPLE_W * DMX_SAMPLE_H * 4);
const liveDmxUniversesMap = new Map(); // universe (0..127) -> Uint8Array(512)
let dmxFrameAccumulatorSec = 0;
let artNetSequenceCounter = 1;

// WebSerial USB-DMX live port state
let dmxSerialPort = null;
let dmxSerialWriter = null;
let dmxSerialBusy = false;

function ensurePixelMapperState() {
  if (!state.pixelMapper || typeof state.pixelMapper !== 'object') {
    state.pixelMapper = {
      enabled: false,
      editOnStage: false,
      showFixtures: true,
      masterDimmer: 1.0,
      ledGamma: 2.2,
      fpsLimit: 44,
      selectedFixtureId: null,
      nextFixtureNum: 1,
      fixtures: [],
      usbProtocol: 'enttec-pro', // 'enttec-pro' | 'opendmx'
      usbUniverse: 0,
      usbConnected: false,
      usbStatus: 'USB-DMX Idle (Chrome/Edge WebSerial)',
      usbTxFrames: 0,
      artNetEnabled: false,
      artNetNet: 0,
      artNetSubNet: 0,
      artNetTxPackets: 0,
      monitorUniverse: 0
    };
  }
  if (!Array.isArray(state.pixelMapper.fixtures)) state.pixelMapper.fixtures = [];
  return state.pixelMapper;
}

function createDmxFixture(type = 'strip', overrides = {}) {
  const pm = ensurePixelMapperState();
  const num = overrides._preserveNum ? pm.nextFixtureNum : pm.nextFixtureNum++;
  const kind = (type === 'matrix' || type === 'ring') ? type : 'strip';
  const accent = overrides.accent || SURFACE_ACCENTS[(num - 1) % SURFACE_ACCENTS.length];
  const colorOrder = DMX_COLOR_ORDERS[overrides.colorOrder] ? overrides.colorOrder : 'RGB';

  // Auto-advance start address when adding new fixtures interactively
  let defUni = 0;
  let defChan = 1;
  if (overrides.universe === undefined && overrides.startChannel === undefined && pm.fixtures.length > 0) {
    const last = pm.fixtures[pm.fixtures.length - 1];
    const lastSpan = computeFixtureEndPatch(last);
    defUni = lastSpan.endUniverse;
    defChan = lastSpan.endChannel + 1;
    const bpp = DMX_COLOR_ORDERS[colorOrder] || 3;
    if (defChan + bpp - 1 > 512) {
      defUni = clamp(defUni + 1, 0, 127);
      defChan = 1;
    }
  }

  return {
    id: overrides.id || `fix_${num}_${Math.random().toString(36).slice(2, 6)}`,
    name: String(overrides.name || (kind === 'matrix' ? `LED Matrix ${num}` : (kind === 'ring' ? `LED Ring ${num}` : `LED Bar ${num}`))),
    type: kind,
    enabled: overrides.enabled !== false,
    accent,
    universe: clamp(Math.round(Number(overrides.universe ?? defUni)), 0, 127),
    startChannel: clamp(Math.round(Number(overrides.startChannel ?? defChan)), 1, 512),
    colorOrder,
    gain: clamp(Number(overrides.gain ?? 1.0), 0, 2),
    // Strip endpoints (Stage normalized 0..1 bottom-up)
    x0: clamp(Number(overrides.x0 ?? 0.22), -0.25, 1.25),
    y0: clamp(Number(overrides.y0 ?? 0.84), -0.25, 1.25),
    x1: clamp(Number(overrides.x1 ?? 0.78), -0.25, 1.25),
    y1: clamp(Number(overrides.y1 ?? 0.84), -0.25, 1.25),
    pixelCount: clamp(Math.round(Number(overrides.pixelCount ?? (kind === 'ring' ? 24 : 32))), 1, 512),
    // Matrix & Ring center / dimensions
    cx: clamp(Number(overrides.cx ?? 0.50), -0.25, 1.25),
    cy: clamp(Number(overrides.cy ?? 0.50), -0.25, 1.25),
    width: clamp(Number(overrides.width ?? 0.36), 0.02, 1.5),
    height: clamp(Number(overrides.height ?? 0.22), 0.02, 1.5),
    rotationDeg: Number(overrides.rotationDeg ?? 0),
    cols: clamp(Math.round(Number(overrides.cols ?? 16)), 1, 64),
    rows: clamp(Math.round(Number(overrides.rows ?? 8)), 1, 64),
    serpentine: overrides.serpentine !== false,
    // Ring specific
    radiusX: clamp(Number(overrides.radiusX ?? 0.16), 0.01, 0.9),
    radiusY: clamp(Number(overrides.radiusY ?? 0.16), 0.01, 0.9),
    startAngleDeg: Number(overrides.startAngleDeg ?? 90),
    clockwise: overrides.clockwise !== false
  };
}

function computeFixturePixelCount(fix) {
  if (!fix) return 0;
  if (fix.type === 'matrix') {
    return clamp(Math.round(fix.cols || 1), 1, 64) * clamp(Math.round(fix.rows || 1), 1, 64);
  }
  return clamp(Math.round(fix.pixelCount || 1), 1, 512);
}

function forEachFixturePixelPatch(fix, callback) {
  const totalPixels = computeFixturePixelCount(fix);
  const chPerPixel = DMX_COLOR_ORDERS[fix.colorOrder] || 3;
  let uni = clamp(Math.round(fix.universe || 0), 0, 127);
  let ch = clamp(Math.round(fix.startChannel || 1), 1, 512);

  for (let p = 0; p < totalPixels; p++) {
    if (ch + chPerPixel - 1 > 512) {
      uni++;
      ch = 1;
      if (uni > 127) break;
    }
    callback(p, uni, ch, chPerPixel);
    ch += chPerPixel;
  }
}

function computeFixtureEndPatch(fix) {
  let endUniverse = clamp(Math.round(fix?.universe || 0), 0, 127);
  let endChannel = clamp(Math.round(fix?.startChannel || 1), 1, 512);
  if (!fix) return { endUniverse, endChannel, totalChannels: 0 };
  let totalChannels = 0;
  forEachFixturePixelPatch(fix, (_p, uni, ch, bpp) => {
    endUniverse = uni;
    endChannel = ch + bpp - 1;
    totalChannels += bpp;
  });
  return { endUniverse, endChannel, totalChannels };
}

function computeFixturePixelStageCoords(fix) {
  const count = computeFixturePixelCount(fix);
  const coords = new Float32Array(count * 2);
  if (count === 0) return coords;

  if (fix.type === 'strip') {
    const x0 = fix.x0 ?? 0.2, y0 = fix.y0 ?? 0.8;
    const x1 = fix.x1 ?? 0.8, y1 = fix.y1 ?? 0.8;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : (i / (count - 1));
      coords[i * 2] = x0 + (x1 - x0) * t;
      coords[i * 2 + 1] = y0 + (y1 - y0) * t;
    }
    return coords;
  }

  if (fix.type === 'ring') {
    const cx = fix.cx ?? 0.5, cy = fix.cy ?? 0.5;
    const rx = fix.radiusX ?? 0.16, ry = fix.radiusY ?? 0.16;
    const startRad = ((fix.startAngleDeg ?? 90) * Math.PI) / 180;
    const dir = fix.clockwise !== false ? -1 : 1;
    for (let i = 0; i < count; i++) {
      const ang = startRad + dir * ((i / count) * Math.PI * 2);
      coords[i * 2] = cx + Math.cos(ang) * rx;
      coords[i * 2 + 1] = cy + Math.sin(ang) * ry;
    }
    return coords;
  }

  // Rotatable 2D LED Matrix (row 0 = Top edge, serpentine zig-zag option)
  const cols = clamp(Math.round(fix.cols || 16), 1, 64);
  const rows = clamp(Math.round(fix.rows || 8), 1, 64);
  const cx = fix.cx ?? 0.5, cy = fix.cy ?? 0.5;
  const w = fix.width ?? 0.36, h = fix.height ?? 0.22;
  const rad = ((fix.rotationDeg || 0) * Math.PI) / 180;
  const cosA = Math.cos(rad), sinA = Math.sin(rad);

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const ny = rows === 1 ? 0 : (0.5 - (r / (rows - 1))); // +0.5 top to -0.5 bottom
    const rev = !!(fix.serpentine && (r % 2 === 1));
    for (let c = 0; c < cols; c++) {
      const colEff = rev ? (cols - 1 - c) : c;
      const nx = cols === 1 ? 0 : ((colEff / (cols - 1)) - 0.5); // -0.5 left to +0.5 right
      const lx = nx * w;
      const ly = ny * h;
      coords[idx * 2] = cx + lx * cosA - ly * sinA;
      coords[idx * 2 + 1] = cy + lx * sinA + ly * cosA;
      idx++;
    }
  }
  return coords;
}

function detectFixtureDmxCollisions(fixtures = []) {
  const occupied = new Map(); // key = (uni * 512 + (ch - 1)) -> firstFixtureId
  const collidingIds = new Set();
  const universesSet = new Set();
  let collisionCount = 0;

  for (const fix of fixtures) {
    if (!fix || fix.enabled === false) continue;
    forEachFixturePixelPatch(fix, (_p, uni, ch, bpp) => {
      universesSet.add(uni);
      for (let k = 0; k < bpp; k++) {
        const addrKey = uni * 512 + (ch - 1 + k);
        const owner = occupied.get(addrKey);
        if (owner && owner !== fix.id) {
          collisionCount++;
          collidingIds.add(owner);
          collidingIds.add(fix.id);
        } else {
          occupied.set(addrKey, fix.id);
        }
      }
    });
  }

  return {
    collisionCount,
    collidingFixtureIds: Array.from(collidingIds),
    universesUsed: Array.from(universesSet).sort((a, b) => a - b)
  };
}

function samplePixelBufferBilinear(rgbaBuf, bufW, bufH, u, v, outRgb) {
  const cu = clamp(u, 0, 1) * (bufW - 1);
  const cv = clamp(v, 0, 1) * (bufH - 1);
  const x0 = Math.floor(cu), y0 = Math.floor(cv);
  const x1 = Math.min(bufW - 1, x0 + 1);
  const y1 = Math.min(bufH - 1, y0 + 1);
  const fx = cu - x0, fy = cv - y0;

  const i00 = (y0 * bufW + x0) * 4;
  const i10 = (y0 * bufW + x1) * 4;
  const i01 = (y1 * bufW + x0) * 4;
  const i11 = (y1 * bufW + x1) * 4;

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  outRgb[0] = (rgbaBuf[i00] * w00 + rgbaBuf[i10] * w10 + rgbaBuf[i01] * w01 + rgbaBuf[i11] * w11) / 255;
  outRgb[1] = (rgbaBuf[i00 + 1] * w00 + rgbaBuf[i10 + 1] * w10 + rgbaBuf[i01 + 1] * w01 + rgbaBuf[i11 + 1] * w11) / 255;
  outRgb[2] = (rgbaBuf[i00 + 2] * w00 + rgbaBuf[i10 + 2] * w10 + rgbaBuf[i01 + 2] * w01 + rgbaBuf[i11 + 2] * w11) / 255;
  return outRgb;
}

const _tmpSampleRgb = [0, 0, 0];

function packFixturesIntoDmxUniverses(rgbaBuf, bufW, bufH, fixtures, masterDimmer = 1.0, ledGamma = 2.2, targetMap = null) {
  const map = targetMap || new Map();
  for (const buf of map.values()) buf.fill(0);

  const dim = clamp(Number(masterDimmer ?? 1.0), 0, 1);
  const gamma = clamp(Number(ledGamma ?? 2.2), 0.5, 4.0);
  const activeUnis = new Set();

  for (const fix of fixtures) {
    if (!fix || fix.enabled === false) continue;
    const coords = computeFixturePixelStageCoords(fix);
    const fixGain = clamp(Number(fix.gain ?? 1.0), 0, 2) * dim;
    const order = fix.colorOrder || 'RGB';

    forEachFixturePixelPatch(fix, (pIdx, uni, startCh) => {
      activeUnis.add(uni);
      let dmx = map.get(uni);
      if (!dmx) {
        dmx = new Uint8Array(512);
        map.set(uni, dmx);
      }

      const u = coords[pIdx * 2];
      const v = coords[pIdx * 2 + 1];
      samplePixelBufferBilinear(rgbaBuf, bufW, bufH, u, v, _tmpSampleRgb);

      const rLin = Math.pow(clamp(_tmpSampleRgb[0] * fixGain, 0, 1), gamma);
      const gLin = Math.pow(clamp(_tmpSampleRgb[1] * fixGain, 0, 1), gamma);
      const bLin = Math.pow(clamp(_tmpSampleRgb[2] * fixGain, 0, 1), gamma);

      const off = startCh - 1;
      if (order === 'RGB') {
        dmx[off] = Math.round(rLin * 255);
        dmx[off + 1] = Math.round(gLin * 255);
        dmx[off + 2] = Math.round(bLin * 255);
      } else if (order === 'GRB') {
        dmx[off] = Math.round(gLin * 255);
        dmx[off + 1] = Math.round(rLin * 255);
        dmx[off + 2] = Math.round(bLin * 255);
      } else if (order === 'BGR') {
        dmx[off] = Math.round(bLin * 255);
        dmx[off + 1] = Math.round(gLin * 255);
        dmx[off + 2] = Math.round(rLin * 255);
      } else if (order === 'RGBW') {
        const wPart = Math.min(rLin, gLin, bLin);
        dmx[off] = Math.round((rLin - wPart) * 255);
        dmx[off + 1] = Math.round((gLin - wPart) * 255);
        dmx[off + 2] = Math.round((bLin - wPart) * 255);
        dmx[off + 3] = Math.round(wPart * 255);
      } else if (order === 'Luma') {
        const yVal = clamp(0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin, 0, 1);
        dmx[off] = Math.round(yVal * 255);
      } else if (order === 'RGB16') {
        const r16 = Math.round(rLin * 65535);
        const g16 = Math.round(gLin * 65535);
        const b16 = Math.round(bLin * 65535);
        dmx[off] = (r16 >> 8) & 0xFF;
        dmx[off + 1] = r16 & 0xFF;
        dmx[off + 2] = (g16 >> 8) & 0xFF;
        dmx[off + 3] = g16 & 0xFF;
        dmx[off + 4] = (b16 >> 8) & 0xFF;
        dmx[off + 5] = b16 & 0xFF;
      }
    });
  }

  for (const existingUni of Array.from(map.keys())) {
    if (!activeUnis.has(existingUni)) {
      map.delete(existingUni);
    }
  }
  return map;
}

// ENTTEC DMX USB Pro Widget API Packet (Label 6 = Output Only Send DMX Packet Request)
// Frame: [0x7E, 0x06, lenLSB(0x01), lenMSB(0x02), startCode(0x00), dmx[0..511], 0xE7] = 518 bytes
function encodeEnttecProPacket(dmx512) {
  const pkt = new Uint8Array(518);
  pkt[0] = 0x7E; // Start of message delimiter
  pkt[1] = 0x06; // Label 6: Output Only Send DMX Packet Request
  pkt[2] = 513 & 0xFF;        // Data length LSB (1 start code + 512 channels = 513 = 0x0201)
  pkt[3] = (513 >> 8) & 0xFF; // Data length MSB
  pkt[4] = 0x00; // DMX512 Null Start Code
  if (dmx512 && dmx512.length > 0) {
    pkt.set(dmx512.subarray(0, Math.min(512, dmx512.length)), 5);
  }
  pkt[517] = 0xE7; // End of message delimiter
  return pkt;
}

// OpenDMX / FTDI Raw 250,000 baud 8N2 payload (Start Code 0x00 + 512 channels = 513 bytes)
function encodeOpenDmxPayload(dmx512) {
  const pkt = new Uint8Array(513);
  pkt[0] = 0x00;
  if (dmx512 && dmx512.length > 0) {
    pkt.set(dmx512.subarray(0, Math.min(512, dmx512.length)), 1);
  }
  return pkt;
}

// Art-Net 4 OpDmx (0x5000) 530-byte UDP / WebSocket Bridge Binary Packet
function encodeArtDmxPacket(universe = 0, dmx512 = null, sequence = 1, net = 0, subNet = 0) {
  const pkt = new Uint8Array(530);
  // 8-byte ASCII 'Art-Net\0' signature
  pkt[0] = 0x41; pkt[1] = 0x72; pkt[2] = 0x74; pkt[3] = 0x2D;
  pkt[4] = 0x4E; pkt[5] = 0x65; pkt[6] = 0x74; pkt[7] = 0x00;
  // OpCode = 0x5000 (Little-Endian: 0x00, 0x50)
  pkt[8] = 0x00;
  pkt[9] = 0x50;
  // ProtVer = 14 (Big-Endian: 0x00, 0x0E)
  pkt[10] = 0x00;
  pkt[11] = 14;
  // Sequence (1..255) & Physical Port (0)
  pkt[12] = clamp(Math.round(Number(sequence) || 1), 1, 255);
  pkt[13] = 0x00;
  // 15-bit Port-Address: SubUni = ((subNet & 0x0F) << 4) | (universe & 0x0F), Net = net & 0x7F
  const uniLow = universe & 0x0F;
  const sub = ((universe >> 4) + (subNet || 0)) & 0x0F;
  const netByte = ((universe >> 8) + (net || 0)) & 0x7F;
  pkt[14] = (sub << 4) | uniLow;
  pkt[15] = netByte;
  // Length = 512 (Big-Endian: 0x02, 0x00)
  pkt[16] = 0x02;
  pkt[17] = 0x00;
  if (dmx512 && dmx512.length > 0) {
    pkt.set(dmx512.subarray(0, Math.min(512, dmx512.length)), 18);
  }
  return pkt;
}

async function connectWebSerialDmx() {
  const pm = ensurePixelMapperState();
  if (typeof navigator === 'undefined' || !('serial' in navigator)) {
    pm.usbStatus = 'WebSerial unsupported in this browser (use Chrome/Edge or Art-Net)';
    if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
    if (typeof showToast === 'function') showToast('WebSerial requires Chromium/Chrome/Edge — or stream via Art-Net!');
    return false;
  }

  await disconnectWebSerialDmx(true);

  try {
    const port = await navigator.serial.requestPort();
    const isOpenDmx = pm.usbProtocol === 'opendmx';
    await port.open({
      baudRate: isOpenDmx ? 250000 : 57600,
      dataBits: 8,
      stopBits: isOpenDmx ? 2 : 1,
      parity: 'none',
      flowControl: 'none'
    });
    dmxSerialPort = port;
    dmxSerialWriter = port.writable ? port.writable.getWriter() : null;
    pm.usbConnected = !!dmxSerialWriter;
    pm.enabled = true;
    pm.usbStatus = pm.usbConnected
      ? `Connected (${isOpenDmx ? 'OpenDMX 250k 8N2' : 'ENTTEC Pro'} • Uni ${pm.usbUniverse})`
      : 'Port opened without writable stream';
    if (pm.fixtures.length === 0) {
      addDmxFixture('strip', { _silent: true });
    }
    if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
    if (typeof showToast === 'function') showToast(`🔌 USB-DMX Ready (${isOpenDmx ? 'OpenDMX' : 'ENTTEC Pro'})`);
    return pm.usbConnected;
  } catch (err) {
    pm.usbConnected = false;
    pm.usbStatus = err && err.name === 'NotFoundError' ? 'USB port selection canceled' : `USB Error: ${err?.message || err}`;
    if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
    return false;
  }
}

async function disconnectWebSerialDmx(silent = false) {
  const pm = ensurePixelMapperState();
  dmxSerialBusy = false;
  if (dmxSerialWriter) {
    try { dmxSerialWriter.releaseLock(); } catch (_) {}
    dmxSerialWriter = null;
  }
  if (dmxSerialPort) {
    try { await dmxSerialPort.close(); } catch (_) {}
    dmxSerialPort = null;
  }
  pm.usbConnected = false;
  if (!silent) {
    pm.usbStatus = 'USB-DMX Disconnected';
    if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
    if (typeof showToast === 'function') showToast('Disconnected USB-DMX interface');
  }
}

async function pumpSerialDmxFrame(dmx512, protocol) {
  if (!dmxSerialWriter || dmxSerialBusy) return;
  dmxSerialBusy = true;
  try {
    if (protocol === 'opendmx' && dmxSerialPort && typeof dmxSerialPort.setSignals === 'function') {
      await dmxSerialPort.setSignals({ break: true });
      await dmxSerialPort.setSignals({ break: false });
      await dmxSerialWriter.write(encodeOpenDmxPayload(dmx512));
    } else {
      await dmxSerialWriter.write(encodeEnttecProPacket(dmx512));
    }
    state.pixelMapper.usbTxFrames = (state.pixelMapper.usbTxFrames || 0) + 1;
  } catch (err) {
    state.pixelMapper.usbStatus = `USB Write Lost: ${err?.message || 'disconnected'}`;
    await disconnectWebSerialDmx(true);
    if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  } finally {
    dmxSerialBusy = false;
  }
}

function transmitDmxUniverses(universesMap) {
  const pm = ensurePixelMapperState();

  // 1. Direct Browser USB-DMX via WebSerial
  if (pm.usbConnected && dmxSerialWriter) {
    const uBuf = universesMap.get(pm.usbUniverse) || new Uint8Array(512);
    pumpSerialDmxFrame(uBuf, pm.usbProtocol);
  }

  // 2. Art-Net (OpDmx 0x5000) Binary WebSocket -> UDP 6454 Bridge
  if (pm.artNetEnabled && typeof oscSocket !== 'undefined' && oscSocket && oscSocket.readyState === 1) {
    for (const [uni, dmxBuf] of universesMap.entries()) {
      artNetSequenceCounter = (artNetSequenceCounter % 255) + 1;
      const pkt = encodeArtDmxPacket(uni, dmxBuf, artNetSequenceCounter, pm.artNetNet, pm.artNetSubNet);
      try {
        oscSocket.send(pkt);
        pm.artNetTxPackets = (pm.artNetTxPackets || 0) + 1;
      } catch (_) {}
    }
  }
}

function addDmxFixture(type = 'strip', overrides = {}) {
  const pm = ensurePixelMapperState();
  if (!overrides._silent && typeof pushUndoCheckpoint === 'function') {
    pushUndoCheckpoint(`Add DMX ${type}`);
  }
  const fix = createDmxFixture(type, overrides);
  pm.fixtures.push(fix);
  pm.selectedFixtureId = fix.id;
  pm.enabled = true;
  pm.showFixtures = true;
  if (!overrides._silent) {
    pm.editOnStage = true;
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (!overrides._silent) {
    if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    if (typeof showToast === 'function') showToast(`Added ${fix.name} (Uni ${fix.universe} • Ch ${fix.startChannel})`);
  }
  return fix;
}

function removeDmxFixture(fixtureId) {
  const pm = ensurePixelMapperState();
  const id = fixtureId || pm.selectedFixtureId;
  const idx = pm.fixtures.findIndex(f => f.id === id);
  if (idx < 0) return false;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Delete DMX Fixture');
  const removed = pm.fixtures.splice(idx, 1)[0];
  pm.selectedFixtureId = pm.fixtures[Math.min(idx, pm.fixtures.length - 1)]?.id || null;
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') showToast(`Deleted ${removed.name}`);
  return true;
}

function duplicateDmxFixture(fixtureId) {
  const pm = ensurePixelMapperState();
  const src = pm.fixtures.find(f => f.id === (fixtureId || pm.selectedFixtureId));
  if (!src) return null;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Duplicate DMX Fixture');
  const endPatch = computeFixtureEndPatch(src);
  const bpp = DMX_COLOR_ORDERS[src.colorOrder] || 3;
  let nextUni = endPatch.endUniverse;
  let nextCh = endPatch.endChannel + 1;
  if (nextCh + bpp - 1 > 512) {
    nextUni = clamp(nextUni + 1, 0, 127);
    nextCh = 1;
  }
  const copy = createDmxFixture(src.type, {
    ...src,
    id: undefined,
    name: `${src.name} Copy`,
    universe: nextUni,
    startChannel: nextCh,
    x0: clamp((src.x0 ?? 0.2) + 0.04, -0.2, 1.2),
    y0: clamp((src.y0 ?? 0.8) - 0.06, -0.2, 1.2),
    x1: clamp((src.x1 ?? 0.8) + 0.04, -0.2, 1.2),
    y1: clamp((src.y1 ?? 0.8) - 0.06, -0.2, 1.2),
    cx: clamp((src.cx ?? 0.5) + 0.05, -0.2, 1.2),
    cy: clamp((src.cy ?? 0.5) - 0.05, -0.2, 1.2)
  });
  pm.fixtures.push(copy);
  pm.selectedFixtureId = copy.id;
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') showToast(`Duplicated → ${copy.name} (Uni ${copy.universe} • Ch ${copy.startChannel})`);
  return copy;
}

function getSelectedDmxFixture() {
  const pm = ensurePixelMapperState();
  return pm.fixtures.find(f => f.id === pm.selectedFixtureId) || pm.fixtures[0] || null;
}

function updatePixelMapperFrame(dt) {
  if (state.isProjectorRole) return;
  const pm = state.pixelMapper;
  const hasLedFixtures = !!(pm && pm.enabled && Array.isArray(pm.fixtures) && pm.fixtures.length > 0);
  const hasDmxDevices = Array.isArray(state.dmxDevices) && state.dmxDevices.length > 0;
  if (!hasLedFixtures && !hasDmxDevices) return;

  const fps = clamp(Number(pm?.fpsLimit) || 44, 5, 60);
  dmxFrameAccumulatorSec += dt;
  const interval = 1.0 / fps;
  if (dmxFrameAccumulatorSec < interval) return;
  dmxFrameAccumulatorSec = dmxFrameAccumulatorSec % interval;

  if (hasLedFixtures) {
    if (typeof readStageDownsamplePixels === 'function') {
      const ok = readStageDownsamplePixels(DMX_SAMPLE_W, DMX_SAMPLE_H, dmxStageReadbackBuf);
      if (!ok) return;
    }

    const effectiveDimmer = clamp((pm.masterDimmer ?? 1.0) * state.masterOpacity * state.blackoutFade, 0, 1);
    packFixturesIntoDmxUniverses(
      dmxStageReadbackBuf,
      DMX_SAMPLE_W,
      DMX_SAMPLE_H,
      pm.fixtures,
      effectiveDimmer,
      pm.ledGamma ?? 2.2,
      liveDmxUniversesMap
    );
  } else {
    for (const buf of liveDmxUniversesMap.values()) {
      buf.fill(0);
    }
  }

  if (hasDmxDevices && typeof evaluateDmxDevicesIntoUniverses === 'function') {
    evaluateDmxDevicesIntoUniverses(liveDmxUniversesMap);
  }

  transmitDmxUniverses(liveDmxUniversesMap);
  emitWebMapperEvent('dmxFrame', {
    universeCount: liveDmxUniversesMap.size,
    usbConnected: !!(pm && pm.usbConnected),
    artNetEnabled: !!(pm && pm.artNetEnabled)
  });

  if (state.inspTab === 'output' && !state.projectorMode) {
    renderDmxMonitorCanvas();
  }
}

function renderDmxMonitorCanvas() {
  if (typeof document === 'undefined') return;
  const cvs = document.getElementById('dmx-monitor-canvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  if (!ctx) return;

  const pm = ensurePixelMapperState();
  const w = cvs.width || 256;
  const h = cvs.height || 48;
  ctx.fillStyle = '#050811';
  ctx.fillRect(0, 0, w, h);

  const selFix = getSelectedDmxFixture();
  const monUni = selFix ? selFix.universe : (pm.monitorUniverse || 0);
  const dmx = liveDmxUniversesMap.get(monUni);

  const hasDmxDevs = Array.isArray(state.dmxDevices) && state.dmxDevices.length > 0;
  if ((!pm.enabled || pm.fixtures.length === 0) && !hasDmxDevs) {
    ctx.fillStyle = 'rgba(155, 174, 204, 0.55)';
    ctx.font = '9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DMX Idle — Add LED Strip / Matrix / Ring / Device', w * 0.5, h * 0.5);
    return;
  }

  // Render 128 grouped 4-channel columns across 512 DMX slots
  const cols = 128;
  const barW = w / cols;
  for (let i = 0; i < cols; i++) {
    let peak = 0;
    if (dmx) {
      const base = i * 4;
      peak = Math.max(dmx[base], dmx[base + 1], dmx[base + 2], dmx[base + 3]) / 255;
    }
    const bh = Math.max(1, peak * (h - 13));
    ctx.fillStyle = peak > 0.01
      ? `rgba(52, 232, 158, ${0.30 + 0.70 * peak})`
      : 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(i * barW, h - 11 - bh, Math.max(1, barW - 0.6), bh);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const txInfo = pm.usbConnected
    ? `USB TX:${pm.usbTxFrames}`
    : (pm.artNetEnabled ? `Art-Net TX:${pm.artNetTxPackets}` : 'Local Preview');
  ctx.fillText(`UNI ${monUni} (512 CH) • ${pm.fpsLimit}Hz • ${txInfo}`, 4, h - 1);
}

function serializePixelMapperState() {
  const pm = ensurePixelMapperState();
  return {
    enabled: !!pm.enabled,
    editOnStage: false,
    showFixtures: pm.showFixtures !== false,
    masterDimmer: pm.masterDimmer ?? 1.0,
    ledGamma: pm.ledGamma ?? 2.2,
    fpsLimit: pm.fpsLimit ?? 44,
    selectedFixtureId: pm.selectedFixtureId,
    nextFixtureNum: pm.nextFixtureNum || 1,
    usbProtocol: pm.usbProtocol || 'enttec-pro',
    usbUniverse: pm.usbUniverse || 0,
    artNetEnabled: !!pm.artNetEnabled,
    artNetNet: pm.artNetNet || 0,
    artNetSubNet: pm.artNetSubNet || 0,
    fixtures: pm.fixtures.map(f => ({ ...f }))
  };
}

function restorePixelMapperState(raw) {
  const pm = ensurePixelMapperState();
  if (!raw || typeof raw !== 'object') {
    pm.enabled = false;
    pm.editOnStage = false;
    pm.fixtures = [];
    pm.selectedFixtureId = null;
    liveDmxUniversesMap.clear();
    return;
  }
  pm.enabled = !!raw.enabled;
  pm.editOnStage = false;
  pm.showFixtures = raw.showFixtures !== false;
  pm.masterDimmer = clamp(Number(raw.masterDimmer ?? 1.0), 0, 1);
  pm.ledGamma = clamp(Number(raw.ledGamma ?? 2.2), 0.5, 4.0);
  pm.fpsLimit = clamp(Math.round(Number(raw.fpsLimit ?? 44)), 5, 60);
  pm.nextFixtureNum = Math.max(1, Math.round(Number(raw.nextFixtureNum) || 1));
  pm.usbProtocol = raw.usbProtocol === 'opendmx' ? 'opendmx' : 'enttec-pro';
  pm.usbUniverse = clamp(Math.round(Number(raw.usbUniverse || 0)), 0, 127);
  pm.artNetEnabled = !!raw.artNetEnabled;
  pm.artNetNet = clamp(Math.round(Number(raw.artNetNet || 0)), 0, 127);
  pm.artNetSubNet = clamp(Math.round(Number(raw.artNetSubNet || 0)), 0, 15);
  pm.fixtures = Array.isArray(raw.fixtures)
    ? raw.fixtures.map(f => createDmxFixture(f.type, { ...f, _preserveNum: true }))
    : [];
  pm.selectedFixtureId = (raw.selectedFixtureId && pm.fixtures.some(f => f.id === raw.selectedFixtureId))
    ? raw.selectedFixtureId
    : (pm.fixtures[0]?.id || null);
}

// ============================================================================
// 3. PUBLIC EXTENSION HOOK API (window.WebMapperAPI) — OPEN-SOURCE & PHASE 7 AI
// ============================================================================

const customModulatorRegistry = new Map(); // typeId -> { evaluatorFn, meta }
const assistantProvidersRegistry = new Map(); // id -> provider
const wmApiListeners = new Map(); // eventName -> Set<fn>

function emitWebMapperEvent(eventName, detail = {}) {
  const set = wmApiListeners.get(eventName);
  if (!set || set.size === 0) return;
  for (const fn of set) {
    try {
      fn(detail);
    } catch (_) {}
  }
}

function evaluateCustomModulatorNorm(mod, dt) {
  const entry = customModulatorRegistry.get(mod.kind);
  if (!entry || typeof entry.evaluatorFn !== 'function') return null;
  try {
    const val = entry.evaluatorFn(mod, dt, {
      bpm: state.audio?.bpm || 120,
      beatPhase: state.audio?.beatPhase || 0,
      beatCount: state.audio?.beatCount || 0,
      bands: state.audio?.bands || { sub: 0, low: 0, mid: 0, high: 0, rms: 0, beat: 0 },
      clockSec: typeof compositorClockSec !== 'undefined' ? compositorClockSec : 0
    });
    return clamp(Number(val) || 0, 0, 1);
  } catch (_) {
    return 0;
  }
}

function initWebMapperPublicAPI() {
  if (typeof window === 'undefined') return null;

  const api = {
    version: '2.0.0',
    license: APP_LICENSE,

    registerGenerator(manifest) {
      if (!manifest || typeof manifest.isfCode !== 'string') {
        return { ok: false, error: 'registerGenerator requires { name, isfCode }' };
      }
      const src = addNewCustomIsfSource({
        id: manifest.id ? sanitizeGlslIdentifier(manifest.id) : undefined,
        name: String(manifest.name || 'Custom Generator'),
        author: String(manifest.author || 'Plugin'),
        license: String(manifest.license || APP_PLUGIN_DEFAULT_LICENSE),
        isfCode: manifest.isfCode,
        isfValues: manifest.defaultValues || {}
      }, manifest.activate !== false);
      if (typeof renderMediaBin === 'function') renderMediaBin();
      emitWebMapperEvent('pluginRegistered', { kind: 'generator', id: src.id, name: src.name });
      return { ok: !!src.compileOk, sourceId: src.id, compileOk: !!src.compileOk, error: src.compileError || null };
    },

    registerEffect(manifest) {
      if (!manifest || typeof manifest.isfCode !== 'string') {
        return { ok: false, error: 'registerEffect requires { id, name, isfCode }' };
      }
      const res = registerCustomFxPlugin({
        id: sanitizeGlslIdentifier(manifest.id || manifest.name || 'custom_fx'),
        name: String(manifest.name || 'Custom Effect'),
        author: String(manifest.author || 'Plugin'),
        license: String(manifest.license || APP_PLUGIN_DEFAULT_LICENSE),
        isfCode: manifest.isfCode
      });
      if (res.ok) {
        if (typeof refreshFxSelectDropdowns === 'function') refreshFxSelectDropdowns();
        emitWebMapperEvent('pluginRegistered', { kind: 'effect', type: res.plugin.type, name: res.plugin.name });
      }
      return res;
    },

    registerModulator(typeId, evaluatorFn, meta = {}) {
      const cleanId = String(typeId || '').trim();
      if (!cleanId || typeof evaluatorFn !== 'function') {
        return { ok: false, error: 'registerModulator requires (typeId, evaluatorFn)' };
      }
      customModulatorRegistry.set(cleanId, {
        evaluatorFn,
        meta: {
          label: String(meta.label || cleanId),
          author: String(meta.author || 'Plugin')
        }
      });
      emitWebMapperEvent('pluginRegistered', { kind: 'modulator', type: cleanId });
      return { ok: true, type: cleanId };
    },

    addModulator(opts = {}) {
      if (!opts || !opts.targetKey) {
        return { ok: false, error: 'addModulator requires { targetKey, kind }' };
      }
      const mod = addModulatorForTarget(opts.targetKey, opts.kind || 'lfo', opts);
      return mod ? { ok: true, id: mod.id } : { ok: false, error: 'Failed to create modulator' };
    },

    registerAssistantProvider(provider) {
      if (!provider || !provider.id || !provider.name) {
        return { ok: false, error: 'registerAssistantProvider requires { id, name }' };
      }
      const id = String(provider.id);
      assistantProvidersRegistry.set(id, {
        id,
        name: String(provider.name),
        capabilities: Array.isArray(provider.capabilities) ? [...provider.capabilities] : [],
        provider
      });
      emitWebMapperEvent('pluginRegistered', { kind: 'assistant', id, name: provider.name });
      return { ok: true, id };
    },

    getAssistantProviders() {
      return Array.from(assistantProvidersRegistry.values()).map(p => ({
        id: p.id,
        name: p.name,
        capabilities: [...p.capabilities]
      }));
    },

    getStateSummary() {
      return {
        version: '2.0.0',
        stage: {
          preset: state.stageResPreset,
          width: state.stageWidth,
          height: state.stageHeight,
          hdrPipeline: !!state.hdrPipeline,
          masterOpacity: state.masterOpacity,
          blackout: !!state.blackout,
          showLock: !!state.showLock
        },
        selectedSurfaceId: state.selectedSurfaceId || null,
        sources: state.sources.map(s => ({ id: s.id, name: s.name, kind: s.kind, width: s.width, height: s.height })),
        surfaces: state.surfaces.map(s => ({
          id: s.id,
          name: s.name,
          type: s.type,
          selected: s.id === state.selectedSurfaceId,
          sourceId: s.sourceId,
          visible: !!s.visible,
          opacity: s.opacity,
          points: Array.isArray(s.points) ? s.points.map(p => [p[0], p[1]]) : [],
          ...(s.type === 'mesh3d' ? {
            mesh3dPrimitive: s.mesh3dPrimitive || 'cube',
            objAssetId: s.objAssetId || null,
            calibMode: s.calibMode || 'manual',
            calibPinCount: Array.isArray(s.calibPins) ? s.calibPins.length : 0
          } : {})
        })),
        masks: state.masks.map(m => ({ id: m.id, name: m.name, mode: m.mode, target: m.target, pointCount: m.points.length })),
        cues: state.cues.map(c => ({
          id: c.id,
          name: c.name,
          fadeSec: c.fadeSec,
          cueRole: c.cueRole || 'seq',
          priorityMode: c.priorityMode || 'ltp',
          active: c.id === state.activeCueId,
          overrideActive: Array.isArray(state.activeOverrideCueIds) && state.activeOverrideCueIds.includes(c.id)
        })),
        spots: Array.isArray(state.spots) ? state.spots.map(s => ({ id: s.id, name: s.name, enabled: s.enabled !== false, mode: s.mode })) : [],
        worldScreens: Array.isArray(state.worldScreens) ? state.worldScreens.map(w => ({ id: w.id, name: w.name, widthM: w.widthM, heightM: w.heightM, posM: [...w.posM], yawDeg: w.yawDeg })) : [],
        floorplanLoaded: Boolean(state.floorplan && state.floorplan.dataUrl),
        surface0Points: state.surfaces[0]?.points ? state.surfaces[0].points.map(p => [p[0], p[1]]) : [],
        modulators: state.modulators.map(m => ({ id: m.id, kind: m.kind, targetKey: m.targetKey, enabled: m.enabled !== false })),
        multiProjector: serializeMultiProjectorState(),
        pixelMapper: {
          enabled: !!state.pixelMapper?.enabled,
          fixtureCount: state.pixelMapper?.fixtures?.length || 0,
          usbConnected: !!state.pixelMapper?.usbConnected,
          artNetEnabled: !!state.pixelMapper?.artNetEnabled
        }
      };
    },

    getStageUvTemplateSvg() {
      return typeof buildStageTemplateSvgString === 'function' ? buildStageTemplateSvgString() : '';
    },

    listParamTargets() {
      return typeof getAvailableModTargetsList === 'function' ? getAvailableModTargetsList() : [];
    },

    getParam(targetKey) {
      return typeof readParamTargetValue === 'function' ? readParamTargetValue(targetKey) : null;
    },

    setParam(targetKey, value) {
      if (typeof applyParamTargetValue !== 'function') return false;
      applyParamTargetValue(targetKey, value, true);
      emitWebMapperEvent('param', { targetKey, value: readParamTargetValue(targetKey) });
      return true;
    },

    triggerCue(indexOrId) {
      if (typeof indexOrId === 'number') {
        const cue = state.cues[indexOrId];
        if (!cue) return false;
        triggerCueById(cue.id);
        return true;
      }
      const direct = state.cues.find(c => c.id === indexOrId || c.name === indexOrId);
      if (!direct) return false;
      triggerCueById(direct.id);
      return true;
    },

    exportShow(includeInlineImages = false) {
      return serializeShowData(!!includeInlineImages);
    },

    importShow(jsonOrObject, opts = {}) {
      const txt = typeof jsonOrObject === 'string' ? jsonOrObject : JSON.stringify(jsonOrObject);
      return importShowJson(txt, false, opts || {});
    },

    getDmxUniverseSnapshot(universe = 0) {
      const buf = liveDmxUniversesMap.get(Number(universe) || 0);
      return buf ? new Uint8Array(buf) : new Uint8Array(512);
    },

    add3DSurface(primitive = 'cube', overrides = {}) {
      if (typeof createSurface !== 'function') return null;
      pushUndoCheckpoint('Add 3D Surface');
      const primName = (typeof MESH3D_PRIMITIVE_META !== 'undefined' && MESH3D_PRIMITIVE_META[primitive])
        ? MESH3D_PRIMITIVE_META[primitive].label
        : '3D Mesh';
      const surf = createSurface('mesh3d', {
        mesh3dPrimitive: primitive || 'cube',
        name: overrides.name || `${primName} ${state.nextSurfaceNum}`,
        ...overrides
      });
      state.surfaces.unshift(surf);
      state.selectedSurfaceId = surf.id;
      state.selectedSurfaceIds = [surf.id];
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      if (typeof renderSurfaceList === 'function') renderSurfaceList();
      if (typeof syncInspectorUI === 'function') syncInspectorUI();
      if (typeof scheduleAutosave === 'function') scheduleAutosave();
      return surf.id;
    },

    importObjSurface(objText, name = 'Model.obj') {
      if (typeof importObjMeshAsSurface !== 'function') return null;
      const surf = importObjMeshAsSurface(String(objText || ''), name);
      return surf ? surf.id : null;
    },

    solveSurfacePnP(surfaceId = null, autoSeedIfNeeded = false) {
      const id = surfaceId || state.selectedSurfaceId;
      const surf = state.surfaces.find(s => s.id === id);
      if (!surf || surf.type !== 'mesh3d') return { ok: false, reason: 'Surface not found or not mesh3d' };
      if (autoSeedIfNeeded && (!Array.isArray(surf.calibPins) || surf.calibPins.length < 6)) {
        surf.calibPins = autoSeed6CalibrationPins(surf, (state.stageWidth || 1920) / Math.max(1, state.stageHeight || 1080));
      }
      surf.calibMode = 'calibrated';
      const geom = getSurfaceMesh3DGeometry(surf);
      const pnp = solvePnP6PointDLT(surf.calibPins || [], state.stageWidth || 1920, state.stageHeight || 1080, geom ? geom.uniqueVerts : null);
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      if (typeof syncInspectorUI === 'function') syncInspectorUI();
      return {
        ok: !!pnp.ok,
        pinCount: pnp.pinCount || 0,
        rmsPx: pnp.rmsPx ?? null,
        pinErrorsPx: Array.isArray(pnp.pinErrorsPx) ? [...pnp.pinErrorsPx] : [],
        throwRatio: pnp.throwRatio ?? null,
        lensShiftX: pnp.lensShiftX ?? null,
        lensShiftY: pnp.lensShiftY ?? null,
        camCenter: pnp.camCenter || null,
        reason: pnp.reason || ''
      };
    },

    // Milestone 7B & 7C: 2D/3D Stage Plan, Constant-Brightness Solver & Video-as-Light API
    applyStagePlanPreset(presetId = 'opposing_wings_constant', enableNow = true) {
      if (typeof applyStagePlanPreset !== 'function') return { ok: false, reason: 'Stage Plan module unavailable' };
      const mp = applyStagePlanPreset(presetId, enableNow);
      const report = typeof solveStagePlanOpticalField === 'function' ? solveStagePlanOpticalField(mp, false) : null;
      return {
        ok: true,
        presetId: mp.stagePlan?.presetId,
        screenCount: mp.screens.length,
        uniformityPct: report ? report.uniformityPct : 0,
        coveragePct: report ? report.coveragePct : 0,
        overlapPct: report ? report.overlapPct : 0
      };
    },

    getStagePlanReport(sampleU = 0.5, sampleV = 0.5) {
      if (typeof solveStagePlanOpticalField !== 'function') return null;
      const mp = ensureMultiProjectorState();
      const field = solveStagePlanOpticalField(mp, false);
      const sample = typeof evalStagePlanConstantBrightnessAt === 'function'
        ? evalStagePlanConstantBrightnessAt(sampleU, sampleV, mp)
        : null;
      return {
        enabled: !!(mp.enabled && mp.stagePlan?.enabled),
        presetId: mp.stagePlan?.presetId || 'opposing_wings_constant',
        venue: mp.stagePlan?.venue ? { ...mp.stagePlan.venue } : null,
        uniformityPct: field.uniformityPct,
        coveragePct: field.coveragePct,
        overlapPct: field.overlapPct,
        targetConstLux: field.targetConstLux,
        shadowCompPixels: field.shadowCompPixels,
        sample
      };
    },

    setProjectorPose(screenIndex = 1, poseOverrides = {}) {
      const mp = ensureMultiProjectorState();
      if (typeof ensureStagePlanState === 'function') ensureStagePlanState(mp);
      const scr = mp.screens.find(s => s.index === Number(screenIndex));
      if (!scr) return { ok: false, reason: `Screen ${screenIndex} not found` };
      if (Array.isArray(poseOverrides.posM) && poseOverrides.posM.length === 3) {
        scr.posM = poseOverrides.posM.map(v => Number(v) || 0);
      }
      if (Array.isArray(poseOverrides.aimM) && poseOverrides.aimM.length === 3) {
        scr.aimM = poseOverrides.aimM.map(v => Number(v) || 0);
        if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
      }
      if (poseOverrides.yawDeg !== undefined || poseOverrides.pitchDeg !== undefined) {
        if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
        if (poseOverrides.yawDeg !== undefined) scr.yawDeg = clamp(Number(poseOverrides.yawDeg) || 0, -180, 180);
        if (poseOverrides.pitchDeg !== undefined) scr.pitchDeg = clamp(Number(poseOverrides.pitchDeg) || 0, -89, 89);
        if (typeof syncProjectorAimFromAngles === 'function') syncProjectorAimFromAngles(scr);
      }
      if (poseOverrides.rollDeg !== undefined) scr.rollDeg = clamp(Number(poseOverrides.rollDeg) || 0, -180, 180);
      if (poseOverrides.throwRatio !== undefined) scr.throwRatio = clamp(Number(poseOverrides.throwRatio) || 1.2, 0.28, 5.0);
      if (poseOverrides.lensShiftX !== undefined) scr.lensShiftX = clamp(Number(poseOverrides.lensShiftX) || 0, -0.8, 0.8);
      if (poseOverrides.lensShiftY !== undefined) scr.lensShiftY = clamp(Number(poseOverrides.lensShiftY) || 0, -0.8, 0.8);
      if (poseOverrides.lumens !== undefined) scr.lumens = clamp(Math.round(Number(poseOverrides.lumens) || 8500), 500, 80000);
      if (typeof solveStagePlanOpticalField === 'function') solveStagePlanOpticalField(mp, true);
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      if (typeof syncStagePlanDialogUI === 'function') syncStagePlanDialogUI();
      return { ok: true, screenIndex: scr.index, posM: [...scr.posM], aimM: [...scr.aimM] };
    },

    setFollowspot3DTarget(opts = {}) {
      const fs = state.followspot;
      if (opts.mode !== undefined) fs.mode = String(opts.mode);
      if (opts.converge3D !== undefined) fs.converge3D = !!opts.converge3D;
      if (opts.maskBgSpill !== undefined) fs.maskBgSpill = !!opts.maskBgSpill;
      if (opts.spotX !== undefined) { fs.spotX = clamp(Number(opts.spotX), 0, 1); fs.targetX = fs.spotX; }
      if (opts.spotY !== undefined) { fs.spotY = clamp(Number(opts.spotY), 0, 1); fs.targetY = fs.spotY; }
      if (opts.performerDepthM !== undefined) fs.performerDepthM = clamp(Number(opts.performerDepthM) || 0, 0, 8);
      if (opts.performerHeightM !== undefined) fs.performerHeightM = clamp(Number(opts.performerHeightM) || 1.75, 0.4, 4);
      if (opts.performerRadiusM !== undefined) fs.performerRadiusM = clamp(Number(opts.performerRadiusM) || 0.45, 0.1, 2.5);
      if (typeof syncFollowspotInspectorUI === 'function') syncFollowspotInspectorUI();
      if (typeof syncStagePlanDialogUI === 'function') syncStagePlanDialogUI();
      return { ok: true, followspot: { ...fs } };
    },

    setSurfaceShutters(surfaceId, shutterOverrides = {}) {
      const surf = state.surfaces.find(s => s.id === surfaceId) || getSelectedSurface();
      if (!surf) return { ok: false, reason: 'Surface not found' };
      const insKeys = ['shutterL', 'shutterR', 'shutterT', 'shutterB'];
      const angKeys = ['shutterAngL', 'shutterAngR', 'shutterAngT', 'shutterAngB'];
      for (const k of insKeys) {
        if (shutterOverrides[k] !== undefined) surf[k] = clamp(Number(shutterOverrides[k]) || 0, 0, 0.85);
      }
      for (const k of angKeys) {
        if (shutterOverrides[k] !== undefined) surf[k] = clamp(Number(shutterOverrides[k]) || 0, -45, 45);
      }
      if (shutterOverrides.shutterSoft !== undefined) {
        surf.shutterSoft = clamp(Number(shutterOverrides.shutterSoft) || 0, 0, 0.25);
      }
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      if (typeof syncInspectorUI === 'function') syncInspectorUI();
      return { ok: true, id: surf.id };
    },

    // UX Studio Systems API (P2, P6, P9)
    setCueRecordScope(scope = 'show') {
      state.cueRecordScope = scope === 'show_venue' ? 'show_venue' : 'show';
      if (typeof syncCueScopeButtonUI === 'function') syncCueScopeButtonUI();
      return { ok: true, cueRecordScope: state.cueRecordScope };
    },

    setLayoutMode(mode = 'split') {
      if (typeof setLayoutMode === 'function') {
        setLayoutMode(mode);
      } else {
        const valid = ['split', 'input', 'output', 'mix', 'rig'];
        state.layoutMode = valid.includes(mode) ? mode : 'split';
      }
      return { ok: true, layoutMode: state.layoutMode };
    },

    searchCommands(query = '') {
      if (typeof searchCommandPalette === 'function') {
        return searchCommandPalette(String(query || '')).map(it => ({
          id: it.id,
          title: it.title,
          category: it.category,
          shortcut: it.shortcut || ''
        }));
      }
      return [];
    },

    getKeymap() {
      if (typeof WEBMAPPER_KEYMAP !== 'undefined' && Array.isArray(WEBMAPPER_KEYMAP)) {
        return WEBMAPPER_KEYMAP.map(k => ({ ...k }));
      }
      return [];
    },

    setRoom(room) {
      if (typeof setStudioRoom === 'function') {
        const applied = setStudioRoom(room, false);
        return { ok: true, room: applied };
      }
      return { ok: false, error: 'Room switcher unavailable' };
    },

    getRoom() {
      return state.room || 'map';
    },

    addSpot(overrides = {}) {
      if (typeof addSpotInstance === 'function') {
        const sp = addSpotInstance(overrides);
        return sp ? { ok: true, id: sp.id, index: state.spots.indexOf(sp) } : { ok: false, error: 'Max spots reached' };
      }
      return { ok: false, error: 'Multi-spot unavailable' };
    },

    setSpot(index = 0, patch = {}) {
      const idx = clamp(Math.round(Number(index) || 0), 0, (state.spots?.length || 1) - 1);
      const sp = state.spots && state.spots[idx];
      if (!sp) return { ok: false, error: 'Spot not found' };
      if (patch && typeof patch === 'object') {
        for (const [k, v] of Object.entries(patch)) {
          if (k in sp && k !== 'id') sp[k] = v;
        }
        sp._lastSeatTouchMs = Date.now();
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      }
      return { ok: true, id: sp.id, index: idx };
    },

    addDmxDevice(templateOrSpec = 'dowser_1ch', overrides = {}) {
      if (typeof templateOrSpec === 'string' && typeof createDmxDeviceFromTemplate === 'function') {
        const dev = createDmxDeviceFromTemplate(templateOrSpec, overrides);
        return dev ? { ok: true, id: dev.id, device: dev } : { ok: false, error: 'Unknown template' };
      }
      if (templateOrSpec && typeof templateOrSpec === 'object' && typeof importWmDeviceJson === 'function') {
        const dev = importWmDeviceJson(templateOrSpec, overrides);
        return { ok: true, id: dev.id, device: dev };
      }
      return { ok: false, error: 'Invalid DMX device spec' };
    },

    importDmxDevice(spec, overrides = {}) {
      if (typeof importWmDeviceJson === 'function') {
        const dev = importWmDeviceJson(spec, overrides);
        return { ok: true, id: dev.id, device: dev };
      }
      return { ok: false, error: 'Importer unavailable' };
    },

    exportDmxDevice(deviceId) {
      const obj = typeof exportWmDeviceJson === 'function' ? exportWmDeviceJson(deviceId) : null;
      return obj ? JSON.stringify(obj, null, 2) : null;
    },

    setDmxChannel(deviceId, channelKey, value, source = 'seat') {
      if (typeof setDmxDeviceChannelValue === 'function') {
        const ok = setDmxDeviceChannelValue(deviceId, channelKey, value, source);
        return { ok };
      }
      return { ok: false };
    },

    requestBlackout(on, opts = {}) {
      if (typeof requestBlackout === 'function') {
        return requestBlackout(!!on, opts);
      }
      return { ok: false };
    },

    setGamepadProfile(profile) {
      if (typeof setGamepadSeatProfile === 'function') {
        return { ok: true, profile: setGamepadSeatProfile(profile) };
      }
      return { ok: false };
    },

    sendPjLink(screenIndex, cmd) {
      if (typeof sendStudioPjLink === 'function') {
        return { ok: sendStudioPjLink(screenIndex, cmd) };
      }
      return { ok: false };
    },

    // v2.1 Build / Map / Live Public Controls
    getSpots() {
      return Array.isArray(state.spots) ? state.spots.map(s => JSON.parse(JSON.stringify(s))) : [];
    },

    toggleSpotEnabled(spotIdOrIdx, forceVal = undefined) {
      if (typeof toggleSpotEnabled === 'function') {
        return { ok: true, enabled: toggleSpotEnabled(spotIdOrIdx, forceVal) };
      }
      return { ok: false };
    },

    removeSpot(spotIdOrIdx) {
      if (typeof removeSpotById === 'function') {
        return { ok: removeSpotById(spotIdOrIdx), count: state.spots.length };
      }
      return { ok: false };
    },

    setTrackpadSpot(spotIdOrNull) {
      if (typeof setTrackpadSpotTarget === 'function') {
        return { ok: true, target: setTrackpadSpotTarget(spotIdOrNull, { silent: true }) };
      }
      return { ok: false };
    },

    cycleTrackpadSpot(dir = 1) {
      if (typeof cycleTrackpadSpotTarget === 'function') {
        return { ok: true, target: cycleTrackpadSpotTarget(dir, { silent: true }) };
      }
      return { ok: false };
    },

    addWorldScreen(overrides = {}) {
      if (typeof addWorldScreen === 'function') {
        const scr = addWorldScreen(overrides);
        return { ok: true, id: scr.id, screen: scr };
      }
      return { ok: false };
    },

    removeWorldScreen(idOrIdx) {
      if (typeof removeWorldScreen === 'function') {
        return { ok: removeWorldScreen(idOrIdx), count: state.worldScreens?.length || 0 };
      }
      return { ok: false };
    },

    stampWorldPreset(presetId = 'foh_1x1') {
      if (typeof stampWorldGhostPreset === 'function') {
        stampWorldGhostPreset(presetId);
        return { ok: true, presetId };
      }
      return { ok: false };
    },

    importFloorplan(dataUrl, name = 'Floorplan') {
      if (typeof importFloorplanFromDataUrl === 'function') {
        const fp = importFloorplanFromDataUrl(dataUrl, name);
        return { ok: true, widthM: fp.widthM };
      }
      return { ok: false };
    },

    clearFloorplan() {
      if (typeof clearFloorplan === 'function') {
        return { ok: clearFloorplan() };
      }
      return { ok: false };
    },

    setBuildViewMode(mode = 'split') {
      if (typeof setBuildViewMode === 'function') {
        return { ok: true, mode: setBuildViewMode(mode) };
      }
      return { ok: false };
    },

    setLiveMixSolo(forceVal) {
      if (typeof toggleLiveMixSolo === 'function') {
        return { ok: true, solo: toggleLiveMixSolo(forceVal) };
      }
      return { ok: false };
    },

    getMixOrbsStatus() {
      const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
      if (!mixSrc || !Array.isArray(mixSrc.orbs)) return { orbCount: 0, liveThumbsReady: 0 };
      const liveThumbsReady = mixSrc.orbs.filter(o => {
        const s = typeof getSourceById === 'function' ? getSourceById(o.sourceId) : null;
        return Boolean(s && (s._liveThumbCanvas || s._glThumb || s.thumbUrl));
      }).length;
      return { orbCount: mixSrc.orbs.length, liveThumbsReady };
    },

    getWorldGizmoCount() {
      if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
      const cvs = typeof document !== 'undefined' ? document.getElementById('rig-canvas') : null;
      const handles = Array.isArray(cvs?._planHandles) ? cvs._planHandles : [];
      return handles.filter(h => h && String(h.kind || '').startsWith('gizmo3d')).length;
    },

    deleteActiveSelection() {
      if (typeof deleteActiveSelection === 'function') {
        return { ok: deleteActiveSelection() };
      }
      return { ok: false };
    },

    on(eventName, handler) {
      if (!eventName || typeof handler !== 'function') return () => {};
      let set = wmApiListeners.get(eventName);
      if (!set) {
        set = new Set();
        wmApiListeners.set(eventName, set);
      }
      set.add(handler);
      return () => set.delete(handler);
    },

    off(eventName, handler) {
      const set = wmApiListeners.get(eventName);
      if (set) set.delete(handler);
    }
  };

  window.ChaosCathodeRayAPI = Object.freeze(api);
  window.WebMapperAPI = window.ChaosCathodeRayAPI; // legacy alias
  return window.ChaosCathodeRayAPI;
}
