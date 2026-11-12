// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05d-mix-constellation-timeline.js — Milestone 5:
//   1. ◎ Mix Spatial Mixing Radar Viewport & 2D Cue Constellation Pad
//   2. Selective Cue Attribute Recall Filters & Auto-Follow Timers
//   3. Audio-Visual Keyframe Show Timeline Sequencer (Linear / Smooth / Bezier)
//   4. Clean Canonical Stage Video Capture via MediaRecorder (60fps WebM/MP4)
// ============================================================================

// ----------------------------------------------------------------------------
// 1. SELECTIVE CUE RECALL FILTERS, AUTO-FOLLOW & CUE CONSTELLATION COORDS
// ----------------------------------------------------------------------------

const DEFAULT_CUE_RECALL_FILTER = {
  geometry: true,
  media: true,
  gradingFx: true,
  masks: true,
  followspot: true,
  modulators: true
};

function ensureCueMilestone5Props(cue, idx = 0, total = 4) {
  if (!cue) return cue;
  if (!cue.recallFilter || typeof cue.recallFilter !== 'object') {
    cue.recallFilter = { ...DEFAULT_CUE_RECALL_FILTER };
  } else {
    for (const k of Object.keys(DEFAULT_CUE_RECALL_FILTER)) {
      if (cue.recallFilter[k] === undefined) cue.recallFilter[k] = true;
    }
  }
  cue.autoFollow = !!cue.autoFollow;
  cue.waitSec = clamp(Number(cue.waitSec ?? 2.0), 0, 300);
  cue.retriggerVideos = !!cue.retriggerVideos;
  cue.cueRole = cue.cueRole === 'deck' ? 'deck' : 'seq';
  cue.priorityMode = cue.priorityMode === 'override' ? 'override' : 'ltp';
  cue.releaseSec = clamp(Number(cue.releaseSec ?? 0.8), 0, 15);

  if (!Number.isFinite(Number(cue.constellationX)) || !Number.isFinite(Number(cue.constellationY))) {
    const n = Math.max(1, total);
    const ang = (idx / n) * Math.PI * 2 - Math.PI * 0.5;
    const rad = n === 1 ? 0.0 : 0.30;
    cue.constellationX = clamp(0.5 + Math.cos(ang) * rad, 0.10, 0.90);
    cue.constellationY = clamp(0.5 + Math.sin(ang) * rad, 0.10, 0.90);
  }
  return cue;
}

function autoArrangeConstellationNodes(mode = 'circle') {
  const n = state.cues.length;
  if (n === 0) return;
  pushUndoCheckpoint('Arrange Cue Constellation');
  if (mode === 'grid') {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    state.cues.forEach((cue, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      cue.constellationX = cols === 1 ? 0.5 : (0.18 + (c / (cols - 1)) * 0.64);
      cue.constellationY = rows === 1 ? 0.5 : (0.20 + (r / (rows - 1)) * 0.60);
    });
  } else {
    state.cues.forEach((cue, i) => {
      const ang = (i / n) * Math.PI * 2 - Math.PI * 0.5;
      const rad = n === 1 ? 0.0 : 0.32;
      cue.constellationX = clamp(0.5 + Math.cos(ang) * rad, 0.12, 0.88);
      cue.constellationY = clamp(0.5 + Math.sin(ang) * rad, 0.12, 0.88);
    });
  }
  scheduleAutosave();
}

const GEOMETRY_SURF_KEYS = [
  'type', 'points', 'quadWarp', 'meshCols', 'meshRows', 'meshPts', 'bezierTangents',
  'circleSoftness', 'circleInner', 'circleStartAngle', 'circleEndAngle', 'lineClosed',
  'uvX', 'uvY', 'uvW', 'uvH', 'uvRot', 'cropL', 'cropR', 'cropT', 'cropB', 'triUvs', 'polyUvs',
  'mesh3dPrimitive', 'objAssetId', 'pos3d', 'rot3d', 'scale3d',
  'camThrow', 'camDist', 'lensShiftX', 'lensShiftY', 'calibMode', 'calibPins'
];

const GRADING_FX_SURF_KEYS = [
  'visible', 'solo', 'opacity', 'blendMode', 'keyMode', 'lumaMin', 'lumaSoftness', 'lumaInvert',
  'chromaColor', 'chromaTolerance', 'chromaSoftness', 'chromaSpill',
  'feather', 'featherLink', 'featherL', 'featherR', 'featherT', 'featherB',
  'shutterL', 'shutterR', 'shutterT', 'shutterB',
  'shutterAngL', 'shutterAngR', 'shutterAngT', 'shutterAngB', 'shutterSoft',
  'blendGamma', 'blackLevel', 'brightness', 'contrast', 'saturation', 'colorTemp',
  'gamma', 'hueShift', 'tintColor', 'tintAmount', 'channelMode', 'invertRgb',
  'lineWidth', 'lineGlow', 'lineSpeed', 'lineDuty', 'lineCount', 'lineChaseMode',
  'borderWidth', 'borderGlow', 'borderSpeed', 'borderChase',
  'shade3d', 'cull3d', 'wireWidth', 'wireGlow', 'wireChase',
  'lightAzim', 'lightElev', 'lightAmbient', 'lightDiffuse', 'lightSpec', 'lightRim',
  'fxChain'
];

function applySelectiveSceneSnapshot(snap, recallFilter = null, retriggerVideos = false) {
  if (!snap) return;
  // Fold any BUILD calibration edits into the cues before a recall can overwrite them.
  if (typeof trackVenueGeometryIntoCues === 'function') {
    trackVenueGeometryIntoCues();
    snap = resolveTrackedSnapshot(snap);
  }
  try {
    applySelectiveSceneSnapshotInner(snap, recallFilter, retriggerVideos);
  } finally {
    // Geometry that arrived from a cue is the new tracking baseline (not a user edit).
    if (typeof rebaseVenueGeometryTracking === 'function') rebaseVenueGeometryTracking();
  }
}

function applySelectiveSceneSnapshotInner(snap, recallFilter = null, retriggerVideos = false) {
  const rf = { ...DEFAULT_CUE_RECALL_FILTER, ...(recallFilter || {}) };

  state.drawingSurfaceId = null;
  state.drawingMaskId = null;
  const runtime = instantiateRuntimeScene(snap);

  if (rf.geometry && rf.media && rf.gradingFx) {
    state.surfaces = runtime.surfaces;
    if (Array.isArray(snap.groups)) state.groups = runtime.groups;
  } else {
    // Selective merge onto existing surfaces matched by ID (or index fallback)
    const incomingById = new Map(runtime.surfaces.map(s => [s.id, s]));
    if (rf.geometry) {
      // Geometry recalled -> adopt surface list structure from cue, preserving live media/grading if unchecked
      const prevById = new Map(state.surfaces.map(s => [s.id, s]));
      state.surfaces = runtime.surfaces.map((incSurf, idx) => {
        const prev = prevById.get(incSurf.id) || state.surfaces[idx];
        if (!prev) return incSurf;
        if (!rf.media) {
          incSurf.sourceId = prev.sourceId;
          incSurf.lineUseSource = prev.lineUseSource;
          incSurf.wireUseSource = prev.wireUseSource;
        }
        if (!rf.gradingFx) {
          for (const k of GRADING_FX_SURF_KEYS) {
            if (k === 'fxChain') incSurf.fxChain = cloneFxChain(prev.fxChain || []);
            else if (prev[k] !== undefined) incSurf[k] = prev[k];
          }
        }
        return incSurf;
      });
      if (Array.isArray(snap.groups)) state.groups = runtime.groups;
    } else {
      // Geometry NOT recalled -> keep live stage calibration untouched (except explicit kinetic surfaces)!
      state.surfaces.forEach((liveSurf, idx) => {
        const inc = incomingById.get(liveSurf.id) || runtime.surfaces[idx];
        if (!inc) return;
        if (liveSurf.animateGeomInShow && inc.type === liveSurf.type) {
          for (const gk of GEOMETRY_SURF_KEYS) {
            if (inc[gk] !== undefined) {
              liveSurf[gk] = Array.isArray(inc[gk]) ? JSON.parse(JSON.stringify(inc[gk])) : inc[gk];
            }
          }
          liveSurf._meshDirty = true;
          liveSurf._geomRev = (liveSurf._geomRev || 1) + 1;
          liveSurf._glVerts = null;
        }
        if (rf.media) {
          liveSurf.sourceId = inc.sourceId;
          liveSurf.lineUseSource = inc.lineUseSource;
          liveSurf.wireUseSource = inc.wireUseSource;
        }
        if (rf.gradingFx) {
          for (const k of GRADING_FX_SURF_KEYS) {
            if (k === 'fxChain') liveSurf.fxChain = cloneFxChain(inc.fxChain || []);
            else if (inc[k] !== undefined) liveSurf[k] = inc[k];
          }
        }
      });
    }
  }

  if (rf.gradingFx) {
    state.masterFxChain = runtime.masterFxChain || [];
  }
  if (rf.masks) {
    state.masks = runtime.masks;
  }
  if (rf.followspot && Array.isArray(state.spots) && state.spots.length > 0) {
    const incomingSpots = Array.isArray(snap.spots) && snap.spots.length > 0
      ? snap.spots
      : (snap.followspot ? [snap.followspot] : []);
    if (incomingSpots.length > 0) {
      incomingSpots.forEach((incSp, idx) => {
        if (!incSp) return;
        // Match live spot by ID (fallback to index ONLY for legacy snapshots without ID).
        // NEVER push/resurrect deleted spots during cue recall, and NEVER ignite disabled spots!
        const liveSp = (incSp.id && state.spots.find(s => s && s.id === incSp.id))
          || (!incSp.id ? state.spots[idx] : null);
        if (!liveSp || liveSp.enabled === false) return;
        const liveIdx = state.spots.indexOf(liveSp);
        if (typeof applySpotSnapshotWithIFCB === 'function') {
          applySpotSnapshotWithIFCB(liveSp, incSp, liveIdx >= 0 ? liveIdx : idx);
        } else {
          const keepTime = liveSp.shadowTime;
          const keepEn = liveSp.enabled;
          Object.assign(liveSp, incSp);
          liveSp.shadowTime = keepTime;
          liveSp.enabled = keepEn;
        }
      });
      state.followspot = state.spots[0] || state._detachedFallbackSpot;
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
  if (rf.media) {
    if (snap.mixbus && typeof getMixbusSource === 'function') {
      const mixSrc = getMixbusSource();
      // Simultaneous Live Engine: if operator is actively steering ◎ Orbital Mix in 3 · LIVE, preserve live orb vector!
      const liveOrbitalOwned = !!(mixSrc && state.room === 'live' && mixSrc._liveSteeredMs && (Date.now() - mixSrc._liveSteeredMs) < 12000);
      if (mixSrc && !liveOrbitalOwned) applyMixbusState(mixSrc, snap.mixbus);
    }
    if (snap.shaders) {
      for (const [id, sh] of Object.entries(snap.shaders)) {
        const src = state.sources.find(s => s.id === id && s.kind === 'shader');
        if (src) Object.assign(src, sh);
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
        if (src) applyTextSourceProps(src, tp);
      }
      state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    }
  }
  if (rf.modulators && Array.isArray(snap.modulators)) {
    restoreModulators(snap.modulators);
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;

  if (retriggerVideos) {
    const usedIds = new Set(state.surfaces.filter(s => s.visible !== false).map(s => s.sourceId));
    for (const src of state.sources) {
      if (src.kind === 'video' && src.video && !src.offline && usedIds.has(src.id)) {
        const dur = src.video.duration || 0;
        src.video.currentTime = dur > 0 ? (src.trimIn || 0) * dur : 0;
        src.playing = true;
        src.video.play().catch(() => {});
        src.needsUpload = true;
      }
    }
  }
}

function applyActivePriorityOverrides() {
  if (!Array.isArray(state.activeOverrideCueIds) || state.activeOverrideCueIds.length === 0) {
    return false;
  }
  const validIds = [];
  for (const cid of state.activeOverrideCueIds) {
    const ovCue = state.cues.find(c => c.id === cid);
    if (!ovCue || !ovCue.snapshot || ovCue.priorityMode !== 'override') continue;
    ensureCueMilestone5Props(ovCue);
    applySelectiveSceneSnapshot(ovCue.snapshot, ovCue.recallFilter, false);
    validIds.push(cid);
  }
  state.activeOverrideCueIds = validIds;
  return validIds.length > 0;
}

function triggerDeckCue(cueId) {
  const cueIdx = state.cues.findIndex(c => c.id === cueId);
  const cue = cueIdx >= 0 ? state.cues[cueIdx] : null;
  if (!cue || !cue.snapshot) return false;
  ensureCueMilestone5Props(cue, cueIdx, state.cues.length);
  // Firing an action on stage while Blind: act on what the audience sees (drop unsent Preview edits).
  if (state.room === 'live' && typeof isProgramHeld === 'function' && isProgramHeld()) {
    revertPreviewToProgram({ release: true });
  }

  state.selectedCueId = cue.id;
  if (typeof setActiveSelection === 'function') {
    setActiveSelection('cue', cue.id, cue.name);
  }
  if (!Array.isArray(state.activeOverrideCueIds)) {
    state.activeOverrideCueIds = [];
  }

  const syncAllCueViews = () => {
    if (typeof renderSurfaceList === 'function') renderSurfaceList();
    if (typeof renderMaskList === 'function') renderMaskList();
    if (typeof renderCueList === 'function') renderCueList();
    if (typeof syncInspectorUI === 'function') syncInspectorUI();
    if (typeof syncFollowspotInspectorUI === 'function') syncFollowspotInspectorUI();
    if (typeof renderLivePerformanceDockUI === 'function' && state.room === 'live') {
      renderLivePerformanceDockUI();
    }
    if (typeof syncTransportUI === 'function') syncTransportUI();
  };

  // Priority Override Mode: toggles ON (stays locked above sequenced GO playback) or OFF (releases to sequence)
  if (cue.priorityMode === 'override') {
    const existingIdx = state.activeOverrideCueIds.indexOf(cue.id);
    if (existingIdx >= 0) {
      // Toggle OFF -> release back to underlying sequenced cue + any remaining overrides
      state.activeOverrideCueIds.splice(existingIdx, 1);
      const relDur = Math.max(0, Number(cue.releaseSec ?? 0.6));
      const baseSeqCue = state.cues.find(c => c.id === state.activeCueId && c.cueRole !== 'deck')
        || state.cues.find(c => c.id === state.activeCueId);
      const outgoing = captureSceneSnapshot();
      if (baseSeqCue && baseSeqCue.snapshot) {
        applySelectiveSceneSnapshot(baseSeqCue.snapshot, baseSeqCue.recallFilter, false);
      }
      applyActivePriorityOverrides();
      if (relDur > 0.04) {
        beginCueCrossfadeFromVisible(outgoing);
        state.crossfade.active = true;
        state.crossfade.elapsed = 0;
        state.crossfade.duration = relDur;
        state.crossfade.mix = 0.0;
        if (state.cuePlayback) state.cuePlayback.tbarHeld = false;
      } else {
        state.crossfade.active = false;
        state.crossfade.fromScene = null;
        state.crossfade.chainToScene = null;
      }
      syncAllCueViews();
      if (typeof showToast === 'function') showToast(`↺ Released Priority Cue: ${cue.name}`);
      return true;
    }

    // Activate Priority Override -> push to top of override stack without touching state.activeCueId!
    state.activeOverrideCueIds.push(cue.id);
    const dur = Math.max(0, Number(cue.fadeSec) || 0);
    const outgoing = dur > 0.04 ? captureSceneSnapshot() : null;
    applySelectiveSceneSnapshot(cue.snapshot, cue.recallFilter, cue.retriggerVideos);
    if (dur > 0.04 && outgoing) {
      beginCueCrossfadeFromVisible(outgoing);
      state.crossfade.active = true;
      state.crossfade.elapsed = 0;
      state.crossfade.duration = dur;
      state.crossfade.mix = 0.0;
      if (state.cuePlayback) state.cuePlayback.tbarHeld = false;
    } else {
      state.crossfade.active = false;
      state.crossfade.fromScene = null;
      state.crossfade.chainToScene = null;
    }
    syncAllCueViews();
    if (typeof showToast === 'function') showToast(`⚡ Priority Override Engaged: ${cue.name}`);
    return true;
  }

  // Out-of-Sequence LTP Mode: fires immediately without advancing/moving state.activeCueId
  const dur = Math.max(0, Number(cue.fadeSec) || 0);
  const outgoing = dur > 0.04 ? captureSceneSnapshot() : null;
  applySelectiveSceneSnapshot(cue.snapshot, cue.recallFilter, cue.retriggerVideos);
  // Keep any active priority override cues on top of LTP action cues!
  applyActivePriorityOverrides();
  if (dur > 0.04 && outgoing) {
    beginCueCrossfadeFromVisible(outgoing);
    state.crossfade.active = true;
    state.crossfade.elapsed = 0;
    state.crossfade.duration = dur;
    state.crossfade.mix = 0.0;
    if (state.cuePlayback) state.cuePlayback.tbarHeld = false;
  } else {
    state.crossfade.active = false;
    state.crossfade.fromScene = null;
    state.crossfade.chainToScene = null;
  }
  syncAllCueViews();
  if (typeof showToast === 'function') showToast(`▶ Fired Out-of-Sequence Cue: ${cue.name}`);
  return true;
}

function releaseAllOverrideCues() {
  if (!Array.isArray(state.activeOverrideCueIds) || state.activeOverrideCueIds.length === 0) {
    return false;
  }
  const count = state.activeOverrideCueIds.length;
  state.activeOverrideCueIds = [];
  const outgoing = captureSceneSnapshot();
  const baseSeqCue = state.cues.find(c => c.id === state.activeCueId && c.cueRole !== 'deck')
    || state.cues.find(c => c.id === state.activeCueId);
  if (baseSeqCue && baseSeqCue.snapshot) {
    applySelectiveSceneSnapshot(baseSeqCue.snapshot, baseSeqCue.recallFilter, false);
    beginCueCrossfadeFromVisible(outgoing);
    state.crossfade.active = true;
    state.crossfade.elapsed = 0;
    state.crossfade.duration = 0.5;
    state.crossfade.mix = 0.0;
    if (state.cuePlayback) state.cuePlayback.tbarHeld = false;
  }
  if (typeof renderCueList === 'function') renderCueList();
  if (typeof renderLivePerformanceDockUI === 'function' && state.room === 'live') {
    renderLivePerformanceDockUI();
  }
  if (typeof showToast === 'function') {
    showToast(`↺ Released ${count} Priority Cue${count === 1 ? '' : 's'} → Sequenced Playback`);
  }
  return true;
}

function startCueAutoFollow(cue) {
  if (!cue || !cue.autoFollow || state.cues.length < 2) {
    state.cueAutoFollow.active = false;
    return;
  }
  const total = Math.max(0.2, (Number(cue.fadeSec) || 0) + (Number(cue.waitSec) || 0));
  state.cueAutoFollow.active = true;
  state.cueAutoFollow.cueId = cue.id;
  state.cueAutoFollow.totalSec = total;
  state.cueAutoFollow.remainingSec = total;
}

function cancelCueAutoFollow() {
  state.cueAutoFollow.active = false;
  state.cueAutoFollow.cueId = null;
  state.cueAutoFollow.remainingSec = 0;
}

function updateCueAutoFollowFrame(dt) {
  const af = state.cueAutoFollow;
  if (!af.active) return;
  if (state.cuePlayback && (state.cuePlayback.paused || state.cuePlayback.tbarHeld)) return;
  const rate = clamp(Number(state.cuePlayback?.rate) || 1.0, 0.1, 8.0);
  af.remainingSec -= dt * rate;
  if (af.remainingSec <= 0) {
    af.active = false;
    stepCue(1);
    return;
  }
  if (!state.crossfade.active) {
    const readout = typeof document !== 'undefined' ? document.getElementById('cue-status-readout') : null;
    if (readout) {
      readout.textContent = `Auto → Next in ${af.remainingSec.toFixed(1)}s`;
    }
  }
}

// ----------------------------------------------------------------------------
// 2. 2D CUE CONSTELLATION VECTOR MORPHING ENGINE (SHEPARD INTERPOLATION)
// ----------------------------------------------------------------------------

function computeConstellationWeights(px, py) {
  const cues = state.cues;
  if (!Array.isArray(cues) || cues.length === 0) return [];
  cues.forEach((c, i) => ensureCueMilestone5Props(c, i, cues.length));
  if (cues.length === 1) return [{ cue: cues[0], weight: 1.0 }];

  const exp = clamp(Number(state.constellation.falloffExp ?? 2.2), 1.0, 5.0);
  const raw = [];
  let sum = 0;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const d = Math.hypot(px - c.constellationX, py - c.constellationY);
    if (d < 0.012) {
      return cues.map((item, j) => ({ cue: item, weight: j === i ? 1.0 : 0.0 }));
    }
    const w = 1.0 / (Math.pow(d, exp) + 0.0015);
    raw.push({ cue: c, weight: w });
    sum += w;
  }
  const inv = sum > 1e-8 ? (1.0 / sum) : (1.0 / cues.length);
  for (const r of raw) r.weight *= inv;
  return raw;
}

const MORPH_SURF_SCALARS = [
  'opacity', 'feather', 'featherL', 'featherR', 'featherT', 'featherB',
  'blendGamma', 'blackLevel', 'brightness', 'contrast', 'saturation', 'colorTemp',
  'gamma', 'hueShift', 'tintAmount',
  'uvX', 'uvY', 'uvW', 'uvH', 'uvRot', 'cropL', 'cropR', 'cropT', 'cropB',
  'circleSoftness', 'circleInner', 'circleStartAngle', 'circleEndAngle',
  'lineWidth', 'lineGlow', 'lineSpeed', 'lineDuty',
  'borderWidth', 'borderGlow', 'borderSpeed',
  'wireWidth', 'wireGlow', 'wireChase', 'lightAzim', 'lightElev', 'lightSpec'
];

const MORPH_SPOT_SCALARS = [
  'radius', 'softness', 'gain', 'ambient', 'stretchX', 'stretchY', 'rotation', 'morph', 'temp'
];

function applyConstellationMorph(px, py) {
  const weighted = computeConstellationWeights(px, py);
  if (weighted.length === 0) return weighted;

  // Find dominant cue for discrete assignments
  let top = weighted[0];
  for (const w of weighted) {
    if (w.weight > top.weight) top = w;
  }

  // 1. Blend all continuous Surface parameters across all Cues simultaneously!
  state.surfaces.forEach((liveSurf, sIdx) => {
    for (const prop of MORPH_SURF_SCALARS) {
      let acc = 0;
      let wSum = 0;
      for (const { cue, weight } of weighted) {
        if (weight <= 0.0005 || !cue.snapshot?.surfaces) continue;
        const cSurf = cue.snapshot.surfaces.find(cs => cs.id === liveSurf.id) || cue.snapshot.surfaces[sIdx];
        if (cSurf && Number.isFinite(Number(cSurf[prop]))) {
          acc += Number(cSurf[prop]) * weight;
          wSum += weight;
        }
      }
      if (wSum > 0.01) {
        liveSurf[prop] = acc / wSum;
      }
    }

    // Optional dominant cue discrete media/blend switch (>52% dominance)
    if (state.constellation.switchMedia && top.weight > 0.52 && top.cue.snapshot?.surfaces) {
      const domSurf = top.cue.snapshot.surfaces.find(cs => cs.id === liveSurf.id) || top.cue.snapshot.surfaces[sIdx];
      if (domSurf) {
        if (domSurf.sourceId) liveSurf.sourceId = domSurf.sourceId;
        if (domSurf.blendMode) liveSurf.blendMode = domSurf.blendMode;
      }
    }
  });

  // 2. Blend Followspot continuous parameters
  let spotXAcc = 0, spotYAcc = 0, spotWSum = 0;
  for (const prop of MORPH_SPOT_SCALARS) {
    let acc = 0, wSum = 0;
    for (const { cue, weight } of weighted) {
      const fs = cue.snapshot?.followspot;
      if (fs && Number.isFinite(Number(fs[prop]))) {
        acc += Number(fs[prop]) * weight;
        wSum += weight;
      }
    }
    if (wSum > 0.01) state.followspot[prop] = acc / wSum;
  }
  for (const { cue, weight } of weighted) {
    const fs = cue.snapshot?.followspot;
    if (fs && Number.isFinite(Number(fs.spotX)) && Number.isFinite(Number(fs.spotY))) {
      spotXAcc += Number(fs.spotX) * weight;
      spotYAcc += Number(fs.spotY) * weight;
      spotWSum += weight;
    }
  }
  const spot0Owned = typeof isSpotFocusOwnedByLiveSeat === 'function' ? isSpotFocusOwnedByLiveSeat(0) : !!state.steerSpotMode;
  if (spotWSum > 0.01 && !spot0Owned) {
    state.followspot.targetX = spotXAcc / spotWSum;
    state.followspot.targetY = spotYAcc / spotWSum;
  }
  if (state.constellation.switchMedia && top.weight > 0.52 && top.cue.snapshot?.followspot) {
    state.followspot.mode = top.cue.snapshot.followspot.mode || 'off';
  }

  // 3. Blend MixBus Orb positions if present in Cue snapshots
  const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
  if (mixSrc && Array.isArray(mixSrc.orbs)) {
    mixSrc.orbs.forEach((orb, oIdx) => {
      let ox = 0, oy = 0, og = 0, ow = 0;
      for (const { cue, weight } of weighted) {
        const cOrbs = cue.snapshot?.mixbus?.orbs;
        if (!Array.isArray(cOrbs)) continue;
        const co = cOrbs.find(x => x.id === orb.id) || cOrbs[oIdx];
        if (co) {
          ox += Number(co.targetX ?? co.x ?? 0) * weight;
          oy += Number(co.targetY ?? co.y ?? 0) * weight;
          og += Number(co.gain ?? 1) * weight;
          ow += weight;
        }
      }
      if (ow > 0.01) {
        orb.targetX = ox / ow;
        orb.targetY = oy / ow;
        orb.gain = og / ow;
      }
    });
  }

  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  return weighted;
}

function updateConstellationFrame(dt) {
  const cst = state.constellation;
  if (!cst.active || state.cues.length === 0) return;

  // Apply flick-throw momentum if puck was released with velocity
  if (!cst._dragging && (Math.abs(cst.velX || 0) > 0.002 || Math.abs(cst.velY || 0) > 0.002)) {
    cst.targetX = clamp(cst.targetX + cst.velX * dt, 0.04, 0.96);
    cst.targetY = clamp(cst.targetY + cst.velY * dt, 0.04, 0.96);
    const decay = Math.pow(0.18, Math.max(0.2, dt * 6));
    cst.velX *= decay;
    cst.velY *= decay;
    if (Math.hypot(cst.velX, cst.velY) < 0.003) {
      cst.velX = 0;
      cst.velY = 0;
    }
  }

  const inert = clamp(cst.inertia ?? 0.72, 0.0, 0.95);
  const alpha = inert <= 0.01 ? 1.0 : (1.0 - Math.pow(inert, Math.max(0.25, dt * 60)));
  const dx = cst.targetX - cst.puckX;
  const dy = cst.targetY - cst.puckY;

  if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4 || cst._forceApply) {
    cst.puckX += dx * alpha;
    cst.puckY += dy * alpha;
    cst._forceApply = false;
    applyConstellationMorph(cst.puckX, cst.puckY);
  }
}

// ----------------------------------------------------------------------------
// 3. ◎ MIX SPATIAL MIXING RADAR & CONSTELLATION VIEWPORT RENDERER + GESTURES
// ----------------------------------------------------------------------------

const thumbImgCache = new Map();

function getCachedSourceThumbImg(src) {
  if (!src || !src.thumbUrl) return null;
  const cached = thumbImgCache.get(src.id);
  if (cached && cached.url === src.thumbUrl) {
    return cached.img.complete ? cached.img : null;
  }
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.src = src.thumbUrl;
  thumbImgCache.set(src.id, { url: src.thumbUrl, img });
  return img.complete ? img : null;
}

function getMixRadarGeometry(w, h) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  // Expanded Orbital Mix disc while keeping Standby Orbit (1.12 * discR) + labels cleanly inside bounds
  const minDim = Math.min(w, h);
  const discR = Math.max(54, Math.min(minDim * 0.425, minDim * 0.5 - 38));
  return { cx, cy, discR };
}

function drawSourceLivePreviewInOrb(ctx, src, ox, oy, orbR) {
  if (!src) return false;
  const box = orbR * 2;
  const x0 = ox - orbR;
  const y0 = oy - orbR;

  const drawCover = (drawable, sw, sh) => {
    if (!drawable || !(sw > 0) || !(sh > 0)) return false;
    const scale = Math.max(box / sw, box / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    try {
      ctx.drawImage(drawable, ox - dw * 0.5, oy - dh * 0.5, dw, dh);
      return true;
    } catch (_) {
      return false;
    }
  };

  if ((src.kind === 'video' || src.kind === 'live' || src.kind === 'syphon') && src.video && src.video.readyState >= 2) {
    if (drawCover(src.video, src.video.videoWidth || src.width || 160, src.video.videoHeight || src.height || 90)) {
      return true;
    }
  }
  if (src.kind === 'image' && src.img && src.img.complete && (src.img.naturalWidth || src.img.width)) {
    if (drawCover(src.img, src.img.naturalWidth || src.img.width, src.img.naturalHeight || src.img.height)) {
      return true;
    }
  }
  if (src.kind === 'text' && src.canvas && src.canvas.width > 0) {
    ctx.fillStyle = '#090e1a';
    ctx.fillRect(x0, y0, box, box);
    if (drawCover(src.canvas, src.canvas.width, src.canvas.height)) {
      return true;
    }
  }
  const glThumb = typeof getOrbGlThumb === 'function' ? getOrbGlThumb(src) : null;
  if (glThumb && typeof glCanvas !== 'undefined') {
    try {
      // GPU→GPU copy from this frame's WebGL drawing buffer (no readback stall).
      ctx.drawImage(glCanvas, glThumb.sx, glThumb.sy, glThumb.size, glThumb.size, x0, y0, box, box);
      return true;
    } catch (_) { /* fall through */ }
  }
  if (src._liveThumbCanvas && src._liveThumbCanvas.width > 0) {
    if (drawCover(src._liveThumbCanvas, src._liveThumbCanvas.width, src._liveThumbCanvas.height)) {
      return true;
    }
  }
  const thumbImg = getCachedSourceThumbImg(src);
  if (thumbImg) {
    if (drawCover(thumbImg, thumbImg.naturalWidth || thumbImg.width || box, thumbImg.naturalHeight || thumbImg.height || box)) {
      return true;
    }
  }
  return false;
}

function deleteSelectedMixOrb(orbId = null) {
  const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
  if (!mixSrc || !Array.isArray(mixSrc.orbs) || mixSrc.orbs.length === 0) return false;
  const targetId = orbId || mixSrc.selectedOrbId || (state.activeSelection?.kind === 'mix_orb' ? state.activeSelection.id : null);
  const idx = mixSrc.orbs.findIndex(o => o.id === targetId);
  if (idx < 0) {
    if (typeof showToast === 'function') showToast('Select an Orb on the ◎ Orbital Mix radar first');
    return false;
  }
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Delete Mix Orb');
  const [removed] = mixSrc.orbs.splice(idx, 1);
  const src = state.sources.find(s => s.id === removed.sourceId);
  mixSrc.selectedOrbId = mixSrc.orbs[Math.min(idx, mixSrc.orbs.length - 1)]?.id || null;
  if (state.activeSelection?.kind === 'mix_orb' && state.activeSelection.id === removed.id) {
    if (mixSrc.selectedOrbId && typeof setActiveSelection === 'function') {
      const nextOrb = mixSrc.orbs.find(o => o.id === mixSrc.selectedOrbId);
      const nextSrc = nextOrb ? state.sources.find(s => s.id === nextOrb.sourceId) : null;
      setActiveSelection('mix_orb', mixSrc.selectedOrbId, nextSrc ? nextSrc.name : mixSrc.selectedOrbId);
    } else if (typeof setActiveSelection === 'function') {
      setActiveSelection(null, null, '');
    }
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof syncTransportUI === 'function') syncTransportUI();
  syncMixPaneToolbarUI();
  if (typeof renderMixDeckCanvas === 'function') {
    renderMixDeckCanvas(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
  }
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') showToast(`🗑 Deleted Orb: ${src ? src.name : removed.id}`);
  return true;
}

function routeMixbusToSurfaceSelection(allSurfaces = false) {
  const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
  if (!mixSrc) return;
  pushUndoCheckpoint(allSurfaces ? 'Route Mix Circle to All Surfaces' : 'Route Mix Circle to Surface');
  const targets = allSurfaces ? state.surfaces : getSelectedSurfaces();
  if (targets.length === 0) {
    showToast('Select a surface first (or click Route → All)');
    return;
  }
  for (const s of targets) {
    s.sourceId = mixSrc.id;
    if (s.type === 'line') s.lineUseSource = true;
  }
  state.activeSourceId = mixSrc.id;
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  renderSurfaceList();
  renderMediaBin();
  syncInspectorUI();
  syncTransportUI();
  scheduleAutosave();
  showToast(`◎ Routed Mix Circle Bus → ${targets.length} surface${targets.length === 1 ? '' : 's'}`);
}

function renderMixDeckCanvas(dpr = 1) {
  if (state.layoutMode !== 'mix' || state.projectorMode || typeof document === 'undefined') return;
  const canvas = document.getElementById('mix-radar-canvas');
  if (!canvas) return;
  const vp = canvas.parentElement;
  if (!vp) return;
  const rect = vp.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return;

  const targetW = Math.round(rect.width * dpr);
  const targetH = Math.round(rect.height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;

  // Deep stage radar background
  const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
  bgGrad.addColorStop(0, '#0f1829');
  bgGrad.addColorStop(0.65, '#090d16');
  bgGrad.addColorStop(1, '#05080f');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  if (state.mixDeckTab === 'constellation') {
    renderConstellationDeck2D(ctx, w, h);
  } else {
    renderRadarDeck2D(ctx, w, h);
  }

  ctx.restore();
  syncMixRouteBanner();
}

// The radar only changes the show when a surface (or spot) uses the Mix bus as its source.
// Otherwise dragging orbs looks "frozen" — say so and offer a one-click route.
function isMixbusOnStage() {
  const mix = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
  const ids = new Set(['bus:orbital', mix ? mix.id : 'src_mixbus']);
  const groups = state.groups || [];
  if ((state.surfaces || []).some(s => s && ids.has(s.sourceId) && (typeof getEffectiveSurfaceProps !== 'function' || getEffectiveSurfaceProps(s, groups).visible))) return true;
  return (state.spots || []).some(sp => sp && sp.mode && sp.mode !== 'off' && (ids.has(sp.contentSrc) || ids.has(sp.goboSrc)));
}

function syncMixRouteBanner() {
  const b = document.getElementById('mix-route-banner');
  if (!b) return;
  const show = state.mixDeckTab !== 'constellation' && !isMixbusOnStage();
  if (b.hidden === show) b.hidden = !show;
  if (show) {
    const sel = typeof getSelectedSurface === 'function' ? getSelectedSurface() : null;
    const txt = sel ? `◎ This mix isn't on stage — send it to “${sel.name}”` : '◎ This mix isn\'t on stage — send it to every visible surface';
    if (b.textContent !== txt) b.textContent = txt;
  }
  if (!b._bound) {
    b._bound = true;
    b.addEventListener('click', () => {
      const sel = typeof getSelectedSurface === 'function' ? getSelectedSurface() : null;
      if (typeof routeMixbusToSurfaceSelection === 'function') routeMixbusToSurfaceSelection(!sel);
    });
  }
}

function renderRadarDeck2D(ctx, w, h) {
  const mixSrc = typeof getMixbusSource === 'function' ? getMixbusSource() : null;
  if (!mixSrc) return;
  const { cx, cy, discR } = getMixRadarGeometry(w, h);

  // 1. Outer Standby Orbit Ring (r = 1.12 * discR)
  const standbyR = discR * 1.12;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 203, 125, 0.22)';
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, standbyR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(255, 203, 125, 0.58)';
  ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('STANDBY ORBIT (0% • PARK READY CLIPS HERE)', cx, cy - standbyR - 7);

  // 2. Active Mixing Disc Glow & Concentric Presence Rings (100% center -> 0% rim)
  const discGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, discR);
  discGlow.addColorStop(0, 'rgba(52, 232, 158, 0.16)');
  discGlow.addColorStop(0.55, 'rgba(111, 211, 255, 0.07)');
  discGlow.addColorStop(1, 'rgba(111, 211, 255, 0.01)');
  ctx.fillStyle = discGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, discR, 0, Math.PI * 2);
  ctx.fill();

  const rings = [
    { r: 1.0, label: '0% RIM', alpha: 0.52 },
    { r: 0.75, label: '25%', alpha: 0.18 },
    { r: 0.50, label: '50%', alpha: 0.24 },
    { r: 0.25, label: '75%', alpha: 0.20 }
  ];
  for (const rg of rings) {
    ctx.strokeStyle = rg.r === 1.0 ? 'rgba(111, 211, 255, 0.55)' : `rgba(155, 174, 204, ${rg.alpha})`;
    ctx.lineWidth = rg.r === 1.0 ? 1.8 : 1.0;
    ctx.beginPath();
    ctx.arc(cx, cy, discR * rg.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(155, 174, 204, 0.55)';
    ctx.font = '8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(rg.label, cx + 5, cy - discR * rg.r + 10);
  }

  // Polar crosshairs + Center 100% Bullseye
  ctx.strokeStyle = 'rgba(111, 211, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - discR, cy); ctx.lineTo(cx + discR, cy);
  ctx.moveTo(cx, cy - discR); ctx.lineTo(cx, cy + discR);
  ctx.stroke();

  ctx.fillStyle = 'rgba(52, 232, 158, 0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(52, 232, 158, 0.85)';
  ctx.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('100%', cx, cy + 14);

  // 3. Render Source Orbs with Velocity Vectors, Live Thumbs & Presence Halos
  const orbs = mixSrc.orbs || [];
  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i];
    const src = state.sources.find(s => s.id === orb.sourceId);
    const weight = computeMixbusOrbWeight(orb, mixSrc.falloffCurve);
    const ox = cx + orb.x * discR;
    const oy = cy + orb.y * discR;
    const tx = cx + orb.targetX * discR;
    const ty = cy + orb.targetY * discR;
    const isSel = mixSrc.selectedOrbId === orb.id;
    const orbR = 26 + weight * 10;

    // Tether line to center proportional to active mix weight
    if (weight > 0.01) {
      ctx.strokeStyle = orb.accent || '#6fd3ff';
      ctx.globalAlpha = 0.15 + weight * 0.55;
      ctx.lineWidth = 1.2 + weight * 2.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Damped target ghost line during flick-throw glide
    if (Math.hypot(tx - ox, ty - oy) > 3) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Presence outer glow
    if (weight > 0.02) {
      const aura = ctx.createRadialGradient(ox, oy, orbR * 0.6, ox, oy, orbR * 1.85);
      aura.addColorStop(0, `${orb.accent || '#6fd3ff'}66`);
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(ox, oy, orbR * 1.85, 0, Math.PI * 2);
      ctx.fill();
    }

    // Circular clipped live thumbnail / procedural color core
    ctx.save();
    ctx.beginPath();
    ctx.arc(ox, oy, orbR, 0, Math.PI * 2);
    ctx.clip();

    if (!drawSourceLivePreviewInOrb(ctx, src, ox, oy, orbR)) {
      const coreGrad = ctx.createLinearGradient(ox - orbR, oy - orbR, ox + orbR, oy + orbR);
      coreGrad.addColorStop(0, orb.accent || '#6fd3ff');
      coreGrad.addColorStop(1, '#121c2e');
      ctx.fillStyle = coreGrad;
      ctx.fillRect(ox - orbR, oy - orbR, orbR * 2, orbR * 2);
    }
    if (orb.muted) {
      ctx.fillStyle = 'rgba(5, 8, 15, 0.74)';
      ctx.fillRect(ox - orbR, oy - orbR, orbR * 2, orbR * 2);
    }
    ctx.restore();

    // Orb rim ring
    ctx.strokeStyle = isSel ? '#ffffff' : (orb.accent || '#6fd3ff');
    ctx.lineWidth = isSel ? 2.8 : 1.9;
    ctx.beginPath();
    ctx.arc(ox, oy, orbR, 0, Math.PI * 2);
    ctx.stroke();

    // Weight % badge inside lower edge of orb so live thumbnail center stays crystal clear!
    ctx.fillStyle = 'rgba(5, 8, 15, 0.68)';
    ctx.fillRect(ox - 19, oy + orbR - 14, 38, 13);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(orb.muted ? 'MUTE' : `${Math.round(weight * 100)}%`, ox, oy + orbR - 7.5);

    // Source label pill below orb
    const title = (src ? src.name : orb.sourceId).slice(0, 16);
    ctx.fillStyle = 'rgba(7, 11, 19, 0.86)';
    const tw = Math.max(44, title.length * 6 + 10);
    ctx.fillRect(ox - tw * 0.5, oy + orbR + 4, tw, 14);
    ctx.fillStyle = isSel ? '#6fd3ff' : '#dbe7ff';
    ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(title, ox, oy + orbR + 11);
  }

  // Footer gesture hint
  ctx.fillStyle = 'rgba(155, 174, 204, 0.68)';
  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Drag + Flick: Glide • Dbl-Click: Solo • Shift+Drag: Orbit All • Shift+Alt+Drag: Counter-Spin • Wheel: Gain', 8, h - 6);
}

function renderConstellationDeck2D(ctx, w, h) {
  const padX = 28, padY = 28;
  const pw = Math.max(40, w - padX * 2);
  const ph = Math.max(40, h - padY * 2 - 14);
  const toScreen = (nx, ny) => [padX + nx * pw, padY + ny * ph];

  // Subtle nebula coordinate grid
  ctx.strokeStyle = 'rgba(181, 140, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(padX, padY, pw, ph);
  for (let g = 0.25; g < 1.0; g += 0.25) {
    ctx.beginPath();
    ctx.moveTo(padX + pw * g, padY); ctx.lineTo(padX + pw * g, padY + ph);
    ctx.moveTo(padX, padY + ph * g); ctx.lineTo(padX + pw, padY + ph * g);
    ctx.stroke();
  }

  if (state.cues.length === 0) {
    ctx.fillStyle = 'rgba(219, 231, 255, 0.72)';
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Store 2+ Show Cues (+ Store) to morph continuously across the 2D Cue Constellation!', w * 0.5, h * 0.5);
    return;
  }

  const cst = state.constellation;
  const weights = computeConstellationWeights(cst.puckX, cst.puckY);
  const [puckSx, puckSy] = toScreen(cst.puckX, cst.puckY);

  // Draw glowing vector web from Live Puck to every Cue Star
  weights.forEach(({ cue, weight }, idx) => {
    const [cx, cy] = toScreen(cue.constellationX, cue.constellationY);
    if (weight > 0.02) {
      ctx.strokeStyle = SURFACE_ACCENTS[idx % SURFACE_ACCENTS.length];
      ctx.globalAlpha = 0.12 + weight * 0.78;
      ctx.lineWidth = 1.0 + weight * 4.0;
      ctx.beginPath();
      ctx.moveTo(puckSx, puckSy);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  });

  // Draw Cue Star Nodes
  weights.forEach(({ cue, weight }, idx) => {
    const [cx, cy] = toScreen(cue.constellationX, cue.constellationY);
    const col = SURFACE_ACCENTS[idx % SURFACE_ACCENTS.length];
    const r = 14 + weight * 9;

    const starGlow = ctx.createRadialGradient(cx, cy, 3, cx, cy, r * 1.9);
    starGlow.addColorStop(0, `${col}88`);
    starGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = starGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0d1422';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(weight * 100)}%`, cx, cy);

    ctx.fillStyle = '#e5eeff';
    ctx.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(cue.name.slice(0, 18), cx, cy + r + 11);
  });

  // Draw Live Output Morph Puck
  const puckAura = ctx.createRadialGradient(puckSx, puckSy, 2, puckSx, puckSy, 28);
  puckAura.addColorStop(0, 'rgba(52, 232, 158, 0.85)');
  puckAura.addColorStop(1, 'rgba(52, 232, 158, 0)');
  ctx.fillStyle = puckAura;
  ctx.beginPath();
  ctx.arc(puckSx, puckSy, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#34e89e';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(puckSx, puckSy, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(155, 174, 204, 0.72)';
  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Drag / Flick Puck: Continuous Multi-Cue Vector Morph • Alt+Drag Cue Star: Reposition Node', 8, h - 6);
}

function bindMixDeckInteractions() {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('mix-radar-canvas');
  if (!canvas) return;

  let mixDrag = null;

  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (state.mixDeckTab === 'radar') {
      const mixSrc = getMixbusSource();
      if (!mixSrc) return;
      const { cx, cy, discR } = getMixRadarGeometry(rect.width, rect.height);
      for (let i = mixSrc.orbs.length - 1; i >= 0; i--) {
        const o = mixSrc.orbs[i];
        const ox = cx + o.x * discR;
        const oy = cy + o.y * discR;
        if (Math.hypot(px - ox, py - oy) <= 38) {
          pushUndoCheckpoint('Solo Mix Circle Orb');
          soloMixbusOrb(mixSrc, o.id);
          syncTransportUI();
          scheduleAutosave();
          showToast('◎ Soloed Orb to 100% Center (Standby Orbs Parked)');
          return;
        }
      }
    } else if (state.mixDeckTab === 'constellation') {
      // Double-clicking a Cue star snaps puck cleanly onto that cue
      const padX = 28, padY = 28;
      const pw = Math.max(40, rect.width - padX * 2);
      const ph = Math.max(40, rect.height - padY * 2 - 14);
      for (const cue of state.cues) {
        const cx = padX + cue.constellationX * pw;
        const cy = padY + cue.constellationY * ph;
        if (Math.hypot(px - cx, py - cy) <= 22) {
          state.constellation.active = true;
          state.constellation.targetX = cue.constellationX;
          state.constellation.targetY = cue.constellationY;
          state.constellation.velX = 0;
          state.constellation.velY = 0;
          state.constellation._forceApply = true;
          return;
        }
      }
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const nowMs = performance.now();

    if (state.mixDeckTab === 'constellation') {
      const padX = 28, padY = 28;
      const pw = Math.max(40, rect.width - padX * 2);
      const ph = Math.max(40, rect.height - padY * 2 - 14);
      state.cues.forEach((c, i) => ensureCueMilestone5Props(c, i, state.cues.length));

      if (e.altKey) {
        for (const cue of state.cues) {
          const cx = padX + cue.constellationX * pw;
          const cy = padY + cue.constellationY * ph;
          if (Math.hypot(px - cx, py - cy) <= 24) {
            beginUndoGesture('Move Cue Constellation Node');
            mixDrag = { kind: 'cue-node', pointerId: e.pointerId, cue, padX, padY, pw, ph };
            canvas.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      const nx = clamp((px - padX) / pw, 0, 1);
      const ny = clamp((py - padY) / ph, 0, 1);
      state.constellation.active = true;
      state.constellation._dragging = true;
      state.constellation.velX = 0;
      state.constellation.velY = 0;
      state.constellation.targetX = nx;
      state.constellation.targetY = ny;
      state.constellation._forceApply = true;
      mixDrag = {
        kind: 'constellation-puck',
        pointerId: e.pointerId,
        padX, padY, pw, ph,
        lastX: nx, lastY: ny, lastMs: nowMs,
        vx: 0, vy: 0
      };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Radar Mode
    const mixSrc = getMixbusSource();
    if (!mixSrc) return;
    const { cx, cy, discR } = getMixRadarGeometry(rect.width, rect.height);
    const oxNorm = (px - cx) / discR;
    const oyNorm = (py - cy) / discR;

    for (let i = mixSrc.orbs.length - 1; i >= 0; i--) {
      const o = mixSrc.orbs[i];
      const ox = cx + o.x * discR;
      const oy = cy + o.y * discR;
      if (Math.hypot(px - ox, py - oy) <= 38) {
        mixSrc.selectedOrbId = o.id;
        mixSrc._liveSteeredMs = Date.now();
        if (typeof setActiveSelection === 'function') {
          const sObj = state.sources.find(s => s.id === o.sourceId);
          setActiveSelection('mix_orb', o.id, sObj ? sObj.name : o.id);
        }
        syncTransportUI();
        syncMixPaneToolbarUI();
        beginUndoGesture(e.shiftKey ? 'Orbit Mix Circle Orbs' : 'Move Mix Circle Orb');

        if (e.shiftKey) {
          mixDrag = {
            kind: 'orbit-all',
            pointerId: e.pointerId,
            counterSpin: e.altKey,
            cx, cy, discR,
            startAng: Math.atan2(oyNorm, oxNorm),
            startRad: Math.max(0.08, Math.hypot(oxNorm, oyNorm)),
            origOrbs: mixSrc.orbs.map((orb, idx) => ({
              orb,
              idx,
              r: Math.hypot(orb.targetX, orb.targetY),
              ang: Math.atan2(orb.targetY, orb.targetX)
            }))
          };
        } else {
          o._dragging = true;
          o.vx = 0;
          o.vy = 0;
          mixDrag = {
            kind: 'orb',
            pointerId: e.pointerId,
            orb: o,
            cx, cy, discR,
            rawPrev: [oxNorm, oyNorm],
            gearedCur: [o.targetX, o.targetY],
            lastX: o.targetX,
            lastY: o.targetY,
            lastMs: nowMs,
            vx: 0,
            vy: 0
          };
        }
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!mixDrag || mixDrag.pointerId !== e.pointerId) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const nowMs = performance.now();
    const dtSec = Math.max(0.004, (nowMs - (mixDrag.lastMs || nowMs)) / 1000);

    if (mixDrag.kind === 'cue-node') {
      mixDrag.cue.constellationX = clamp((px - mixDrag.padX) / mixDrag.pw, 0.06, 0.94);
      mixDrag.cue.constellationY = clamp((py - mixDrag.padY) / mixDrag.ph, 0.06, 0.94);
      if (state.constellation.active) state.constellation._forceApply = true;
      return;
    }

    if (mixDrag.kind === 'constellation-puck') {
      const nx = clamp((px - mixDrag.padX) / mixDrag.pw, 0, 1);
      const ny = clamp((py - mixDrag.padY) / mixDrag.ph, 0, 1);
      const ivx = (nx - mixDrag.lastX) / dtSec;
      const ivy = (ny - mixDrag.lastY) / dtSec;
      mixDrag.vx = mixDrag.vx * 0.55 + ivx * 0.45;
      mixDrag.vy = mixDrag.vy * 0.55 + ivy * 0.45;
      mixDrag.lastX = nx;
      mixDrag.lastY = ny;
      mixDrag.lastMs = nowMs;
      state.constellation.targetX = nx;
      state.constellation.targetY = ny;
      return;
    }

    if (mixDrag.kind === 'orb') {
      const oxNorm = (px - mixDrag.cx) / mixDrag.discR;
      const oyNorm = (py - mixDrag.cy) / mixDrag.discR;
      const gear = e.altKey ? 0.12 : 1.0;
      mixDrag.gearedCur[0] += (oxNorm - mixDrag.rawPrev[0]) * gear;
      mixDrag.gearedCur[1] += (oyNorm - mixDrag.rawPrev[1]) * gear;
      mixDrag.rawPrev = [oxNorm, oyNorm];

      let nx = mixDrag.gearedCur[0];
      let ny = mixDrag.gearedCur[1];
      const r = Math.hypot(nx, ny);
      if (r > 1.24) {
        nx = (nx / r) * 1.24;
        ny = (ny / r) * 1.24;
      }

      const ivx = (nx - mixDrag.lastX) / dtSec;
      const ivy = (ny - mixDrag.lastY) / dtSec;
      mixDrag.vx = mixDrag.vx * 0.55 + ivx * 0.45;
      mixDrag.vy = mixDrag.vy * 0.55 + ivy * 0.45;
      mixDrag.lastX = nx;
      mixDrag.lastY = ny;
      mixDrag.lastMs = nowMs;

      mixDrag.orb.targetX = nx;
      mixDrag.orb.targetY = ny;
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      return;
    }

    if (mixDrag.kind === 'orbit-all') {
      const oxNorm = (px - mixDrag.cx) / mixDrag.discR;
      const oyNorm = (py - mixDrag.cy) / mixDrag.discR;
      const dAng = Math.atan2(oyNorm, oxNorm) - mixDrag.startAng;
      const radScale = clamp(Math.hypot(oxNorm, oyNorm) / mixDrag.startRad, 0.2, 2.2);
      for (const item of mixDrag.origOrbs) {
        const dir = (mixDrag.counterSpin && (item.idx % 2 === 1)) ? -1 : 1;
        const nr = item.r > 1.02 ? item.r : clamp(item.r * radScale, 0.0, 1.18);
        const na = item.ang + dAng * dir;
        item.orb.targetX = Math.cos(na) * nr;
        item.orb.targetY = Math.sin(na) * nr;
      }
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    }
  });

  const endMixDrag = (e) => {
    if (!mixDrag || mixDrag.pointerId !== e.pointerId) return;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    const staleMs = performance.now() - (mixDrag.lastMs || 0);

    if (mixDrag.kind === 'orb' && mixDrag.orb) {
      mixDrag.orb._dragging = false;
      if (staleMs < 95) {
        mixDrag.orb.vx = clamp(mixDrag.vx * 0.42, -3.5, 3.5);
        mixDrag.orb.vy = clamp(mixDrag.vy * 0.42, -3.5, 3.5);
      }
      commitUndoGesture();
      scheduleAutosave();
    } else if (mixDrag.kind === 'orbit-all' || mixDrag.kind === 'cue-node') {
      commitUndoGesture();
      scheduleAutosave();
    } else if (mixDrag.kind === 'constellation-puck') {
      state.constellation._dragging = false;
      if (staleMs < 95) {
        state.constellation.velX = clamp(mixDrag.vx * 0.35, -2.5, 2.5);
        state.constellation.velY = clamp(mixDrag.vy * 0.35, -2.5, 2.5);
      }
    }
    mixDrag = null;
  };

  canvas.addEventListener('pointerup', endMixDrag);
  canvas.addEventListener('pointercancel', endMixDrag);

  canvas.addEventListener('wheel', (e) => {
    if (state.mixDeckTab !== 'radar') return;
    e.preventDefault();
    const mixSrc = getMixbusSource();
    if (!mixSrc) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { cx, cy, discR } = getMixRadarGeometry(rect.width, rect.height);

    if (e.shiftKey) {
      // Radial expand/contract all active orbs
      const factor = Math.exp(e.deltaY * 0.0018);
      for (const orb of mixSrc.orbs) {
        const r = Math.hypot(orb.targetX, orb.targetY);
        if (r > 0.01 && r < 1.02) {
          const nr = clamp(r * factor, 0.02, 1.0);
          const ang = Math.atan2(orb.targetY, orb.targetX);
          orb.targetX = Math.cos(ang) * nr;
          orb.targetY = Math.sin(ang) * nr;
        }
      }
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      return;
    }

    for (let i = mixSrc.orbs.length - 1; i >= 0; i--) {
      const o = mixSrc.orbs[i];
      const ox = cx + o.x * discR;
      const oy = cy + o.y * discR;
      if (Math.hypot(px - ox, py - oy) <= 38) {
        o.gain = clamp((o.gain ?? 1.0) - e.deltaY * 0.0015, 0.0, 2.0);
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        return;
      }
    }
  }, { passive: false });
}

function syncMixPaneToolbarUI() {
  if (typeof document === 'undefined') return;
  const isRadar = state.mixDeckTab !== 'constellation';
  const btnRadar = document.getElementById('btn-mixtab-radar');
  const btnConst = document.getElementById('btn-mixtab-constellation');
  const radarTools = document.getElementById('mix-radar-tools');
  const constTools = document.getElementById('mix-constellation-tools');
  if (btnRadar) {
    btnRadar.classList.toggle('active', isRadar);
    btnRadar.setAttribute('aria-pressed', String(isRadar));
  }
  if (btnConst) {
    btnConst.classList.toggle('active', !isRadar);
    btnConst.setAttribute('aria-pressed', String(!isRadar));
  }
  if (radarTools) {
    radarTools.hidden = !isRadar;
    radarTools.style.display = isRadar ? 'flex' : 'none';
  }
  if (constTools) {
    constTools.hidden = isRadar;
    constTools.style.display = !isRadar ? 'flex' : 'none';
  }
  const constMediaChk = document.getElementById('chk-const-media');
  if (constMediaChk && state.constellation) {
    constMediaChk.checked = !!state.constellation.switchMedia;
  }
}

// ----------------------------------------------------------------------------
// 4. KEYFRAME SHOW TIMELINE SEQUENCER (LINEAR / SMOOTH / BEZIER + CUE FLAGS)
// ----------------------------------------------------------------------------

function toggleTimelineDrawer(forceVal) {
  const next = typeof forceVal === 'boolean' ? forceVal : !state.timeline.open;
  state.timeline.open = next;
  if (typeof document !== 'undefined') {
    const drawer = document.getElementById('timeline-drawer');
    const btn = document.getElementById('btn-toggle-timeline');
    if (drawer) drawer.hidden = !next;
    if (btn) {
      btn.classList.toggle('active', next);
      btn.setAttribute('aria-expanded', String(next));
    }
  }
  if (next) renderTimelineCanvas();
}

function addTimelineTrackForTarget(targetKey) {
  if (!targetKey) return null;
  let existing = state.timeline.tracks.find(t => t.targetKey === targetKey);
  if (existing) {
    state.timeline.selectedTrackId = existing.id;
    addKeyframeAtPlayhead(existing.id, 'smooth');
    toggleTimelineDrawer(true);
    return existing;
  }
  pushUndoCheckpoint('Add Timeline Automation Track');
  const bounds = getParamTargetBounds(targetKey);
  const curVal = readParamTargetValue(targetKey);
  const idx = state.timeline.nextTrackNum++;
  const track = {
    id: `tlk_${idx}_${Math.random().toString(36).slice(2, 5)}`,
    targetKey,
    label: bounds.label,
    minVal: bounds.min,
    maxVal: bounds.max,
    muted: false,
    color: SURFACE_ACCENTS[(idx - 1) % SURFACE_ACCENTS.length],
    keyframes: [
      { id: `kf_${Date.now()}_a`, time: 0, value: curVal, curve: 'smooth' },
      { id: `kf_${Date.now()}_b`, time: Number((state.timeline.duration * 0.5).toFixed(2)), value: bounds.max, curve: 'smooth' },
      { id: `kf_${Date.now()}_c`, time: state.timeline.duration, value: curVal, curve: 'linear' }
    ]
  };
  state.timeline.tracks.push(track);
  state.timeline.selectedTrackId = track.id;
  syncModulatedSliderHighlights();
  toggleTimelineDrawer(true);
  syncTimelineToolbarUI();
  renderTimelineCanvas();
  scheduleAutosave();
  showToast(`⏱ Added Timeline Lane: ${track.label}`);
  return track;
}

function addKeyframeAtPlayhead(trackId = null, curve = 'smooth') {
  const tr = state.timeline.tracks.find(t => t.id === (trackId || state.timeline.selectedTrackId)) || state.timeline.tracks[0];
  if (!tr) {
    addTimelineTrackForTarget('master:opacity');
    return;
  }
  pushUndoCheckpoint('Add Timeline Keyframe');
  const tSec = clamp(state.timeline.playhead || 0, 0, state.timeline.duration);
  const val = readParamTargetValue(tr.targetKey);
  const existing = tr.keyframes.find(k => Math.abs(k.time - tSec) < 0.08);
  if (existing) {
    existing.value = val;
    existing.curve = curve || existing.curve;
    state.timeline.selectedKfId = existing.id;
  } else {
    const kf = {
      id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      time: Number(tSec.toFixed(3)),
      value: val,
      curve: curve || 'smooth'
    };
    tr.keyframes.push(kf);
    tr.keyframes.sort((a, b) => a.time - b.time);
    state.timeline.selectedKfId = kf.id;
  }
  renderTimelineCanvas();
  scheduleAutosave();
}

function addTimelineCueMarker(cueId = null, atTime = null) {
  const cue = state.cues.find(c => c.id === (cueId || state.activeCueId)) || state.cues[0];
  if (!cue) {
    showToast('Store a Cue first (+ Store) before placing a Timeline Cue Flag');
    return null;
  }
  pushUndoCheckpoint('Add Timeline Cue Flag');
  const marker = {
    id: `tcm_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    time: clamp(Number(atTime ?? state.timeline.playhead ?? 0), 0, state.timeline.duration),
    cueId: cue.id
  };
  state.timeline.cueMarkers.push(marker);
  state.timeline.cueMarkers.sort((a, b) => a.time - b.time);
  renderTimelineCanvas();
  scheduleAutosave();
  showToast(`🚩 Placed Cue Flag "${cue.name}" at ${formatTimecode(marker.time)}`);
  return marker;
}

function evalCurveSegment(u, mode = 'smooth') {
  const t = clamp(u, 0, 1);
  if (mode === 'hold') return 0;
  if (mode === 'linear') return t;
  if (mode === 'bezier') {
    // Steep theatrical S-ease cubic Bezier approximation
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  // Smooth Hermite S-curve
  return t * t * (3.0 - 2.0 * t);
}

function evaluateTimelineTrackAt(track, tSec) {
  const kfs = track && Array.isArray(track.keyframes) ? track.keyframes : [];
  if (kfs.length === 0) return null;
  if (tSec <= kfs[0].time) return kfs[0].value;
  if (tSec >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (tSec >= a.time && tSec <= b.time) {
      const span = Math.max(1e-5, b.time - a.time);
      const u = evalCurveSegment((tSec - a.time) / span, a.curve || 'smooth');
      return a.value + (b.value - a.value) * u;
    }
  }
  return kfs[kfs.length - 1].value;
}

function applyTimelineAtPlayhead(tSec) {
  for (const tr of state.timeline.tracks) {
    if (!tr || tr.muted) continue;
    const val = evaluateTimelineTrackAt(tr, tSec);
    if (val !== null && Number.isFinite(val)) {
      applyParamTargetValue(tr.targetKey, val, false);
    }
  }
}

function updateTimelineFrame(dt) {
  const tl = state.timeline;
  if (!tl.playing) return;

  const prevT = tl.playhead || 0;
  const dur = Math.max(1.0, Number(tl.duration) || 30.0);
  let nextT = prevT + dt;

  // Fire any Cue Markers crossed in [prevT, nextT]
  for (const cm of tl.cueMarkers) {
    if (cm.time > prevT && cm.time <= nextT) {
      triggerCueById(cm.cueId);
    }
  }

  if (nextT >= dur) {
    if (tl.loop) {
      nextT = nextT % dur;
      for (const cm of tl.cueMarkers) {
        if (cm.time >= 0 && cm.time <= nextT && prevT > nextT) {
          triggerCueById(cm.cueId);
        }
      }
    } else {
      nextT = dur;
      tl.playing = false;
      syncTimelineToolbarUI();
    }
  }

  tl.playhead = nextT;
  applyTimelineAtPlayhead(nextT);

  if (tl.open) {
    const tcEl = typeof document !== 'undefined' ? document.getElementById('val-tl-timecode') : null;
    if (tcEl) tcEl.textContent = `${formatTimecode(tl.playhead)} / ${formatTimecode(dur)}`;
    renderTimelineCanvas();
  }
}

const TL_HEADER_W = 168;
const TL_RULER_H = 22;
const TL_WAVE_H = 22;
const TL_LANE_H = 34;

function getTimelineLayoutMetrics(viewportWidth) {
  const tl = state.timeline;
  const zoom = clamp(Number(tl.zoom) || 1.0, 1.0, 10.0);
  const baseTrackW = Math.max(240, (viewportWidth || 640) - TL_HEADER_W - 12);
  const trackW = Math.round(baseTrackW * zoom);
  const totalW = TL_HEADER_W + trackW + 16;
  const totalH = Math.max(126, TL_RULER_H + TL_WAVE_H + Math.max(1, tl.tracks.length) * TL_LANE_H + 8);
  return { trackW, totalW, totalH, dur: Math.max(1.0, Number(tl.duration) || 30.0) };
}

function renderTimelineCanvas() {
  if (!state.timeline.open || typeof document === 'undefined') return;
  const cvs = document.getElementById('timeline-canvas');
  const vp = document.getElementById('timeline-scroll-viewport');
  if (!cvs || !vp) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vpW = vp.clientWidth || 640;
  const { trackW, totalW, totalH, dur } = getTimelineLayoutMetrics(vpW);

  cvs.style.width = `${totalW}px`;
  cvs.style.height = `${totalH}px`;
  const pxW = Math.round(totalW * dpr);
  const pxH = Math.round(totalH * dpr);
  if (cvs.width !== pxW || cvs.height !== pxH) {
    cvs.width = pxW;
    cvs.height = pxH;
  }

  const ctx = cvs.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, totalW, totalH);

  const timeToX = t => TL_HEADER_W + (clamp(t, 0, dur) / dur) * trackW;

  // 1. Time Ruler & Grid Lines
  ctx.fillStyle = '#0e1524';
  ctx.fillRect(0, 0, totalW, TL_RULER_H);
  ctx.fillStyle = '#9baecc';
  ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('TRACK / PARAMETER', 8, TL_RULER_H * 0.5);

  const stepSec = dur / trackW * 75 > 5 ? 10 : (dur / trackW * 75 > 2 ? 5 : (dur / trackW * 75 > 0.8 ? 2 : 1));
  for (let s = 0; s <= dur + 0.001; s += stepSec) {
    const x = timeToX(s);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(x, TL_RULER_H);
    ctx.lineTo(x, totalH);
    ctx.stroke();

    ctx.fillStyle = 'rgba(219,231,255,0.65)';
    ctx.textAlign = 'center';
    ctx.fillText(`${s}s`, x, TL_RULER_H * 0.5);
  }

  // Cue Marker Flags on Ruler
  for (const cm of state.timeline.cueMarkers) {
    const cx = timeToX(cm.time);
    const cue = state.cues.find(c => c.id === cm.cueId);
    ctx.fillStyle = '#34e89e';
    ctx.beginPath();
    ctx.moveTo(cx, 2);
    ctx.lineTo(cx + 8, 6);
    ctx.lineTo(cx, 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(52, 232, 158, 0.45)';
    ctx.beginPath();
    ctx.moveTo(cx, 11);
    ctx.lineTo(cx, totalH);
    ctx.stroke();
    if (cue) {
      ctx.fillStyle = '#34e89e';
      ctx.textAlign = 'left';
      ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(cue.name.slice(0, 10), cx + 10, 7);
    }
  }

  // 2. Audio Waveform Reference Row
  const waveTop = TL_RULER_H;
  ctx.fillStyle = '#0a101d';
  ctx.fillRect(0, waveTop, totalW, TL_WAVE_H);
  ctx.fillStyle = '#ffcb7d';
  ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('♪ AUDIO WAVEFORM', 8, waveTop + TL_WAVE_H * 0.5);

  const refVid = state.sources.find(s =>
    (state.timeline.audioSourceId && s.id === state.timeline.audioSourceId) ||
    (s.kind === 'video' && Array.isArray(s.waveformPeaks) && s.waveformPeaks.length > 0)
  );
  if (refVid && Array.isArray(refVid.waveformPeaks) && refVid.waveformPeaks.length > 0) {
    const peaks = refVid.waveformPeaks;
    const barW = trackW / peaks.length;
    ctx.fillStyle = 'rgba(255, 203, 125, 0.55)';
    for (let i = 0; i < peaks.length; i++) {
      const ph = Math.max(1.5, peaks[i] * (TL_WAVE_H - 4));
      ctx.fillRect(TL_HEADER_W + i * barW, waveTop + (TL_WAVE_H - ph) * 0.5, Math.max(1, barW - 0.5), ph);
    }
  } else {
    ctx.fillStyle = 'rgba(155, 174, 204, 0.42)';
    ctx.fillText('Load any video clip with audio to display reference waveform', TL_HEADER_W + 8, waveTop + TL_WAVE_H * 0.5);
  }

  // 3. Keyframe Automation Lanes
  const lanesTop = TL_RULER_H + TL_WAVE_H;
  if (state.timeline.tracks.length === 0) {
    ctx.fillStyle = 'rgba(155, 174, 204, 0.62)';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Right-click any Slider → "⏱ Add Timeline Track" (or click + Lane above) to sculpt keyframe curves!', TL_HEADER_W + trackW * 0.5, lanesTop + 20);
  } else {
    state.timeline.tracks.forEach((tr, idx) => {
      const y0 = lanesTop + idx * TL_LANE_H;
      const isSel = tr.id === state.timeline.selectedTrackId;
      ctx.fillStyle = isSel ? 'rgba(111, 211, 255, 0.08)' : (idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent');
      ctx.fillRect(0, y0, totalW, TL_LANE_H);

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(0, y0 + TL_LANE_H);
      ctx.lineTo(totalW, y0 + TL_LANE_H);
      ctx.stroke();

      // Track Header
      ctx.fillStyle = tr.muted ? 'rgba(155,174,204,0.45)' : (isSel ? '#6fd3ff' : '#dbe7ff');
      ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${tr.muted ? '[M] ' : ''}${tr.label.slice(0, 21)}`, 8, y0 + TL_LANE_H * 0.5);

      // Sample interpolated curve
      const span = Math.max(1e-5, tr.maxVal - tr.minVal);
      const valToY = v => y0 + TL_LANE_H - 5 - clamp((v - tr.minVal) / span, 0, 1) * (TL_LANE_H - 10);

      if (tr.keyframes.length > 0) {
        ctx.strokeStyle = tr.muted ? 'rgba(155,174,204,0.3)' : (tr.color || '#6fd3ff');
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        const samples = Math.min(240, Math.max(60, Math.round(trackW / 4)));
        for (let s = 0; s <= samples; s++) {
          const st = (s / samples) * dur;
          const sv = evaluateTimelineTrackAt(tr, st);
          const sx = timeToX(st);
          const sy = valToY(sv);
          if (s === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();

        // Keyframe diamonds
        for (const kf of tr.keyframes) {
          const kx = timeToX(kf.time);
          const ky = valToY(kf.value);
          const kfSel = kf.id === state.timeline.selectedKfId;
          ctx.fillStyle = kfSel ? '#ffffff' : (tr.color || '#6fd3ff');
          ctx.beginPath();
          ctx.moveTo(kx, ky - 4.5);
          ctx.lineTo(kx + 4.5, ky);
          ctx.lineTo(kx, ky + 4.5);
          ctx.lineTo(kx - 4.5, ky);
          ctx.closePath();
          ctx.fill();
        }
      }
    });
  }

  // Header divider
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.moveTo(TL_HEADER_W, 0);
  ctx.lineTo(TL_HEADER_W, totalH);
  ctx.stroke();

  // 4. Playhead Scrubber Line
  const phX = timeToX(state.timeline.playhead || 0);
  ctx.strokeStyle = '#ff5d78';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(phX, 0);
  ctx.lineTo(phX, totalH);
  ctx.stroke();

  ctx.fillStyle = '#ff5d78';
  ctx.beginPath();
  ctx.moveTo(phX - 5, 0);
  ctx.lineTo(phX + 5, 0);
  ctx.lineTo(phX, 8);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function bindTimelineInteractions() {
  if (typeof document === 'undefined') return;
  const cvs = document.getElementById('timeline-canvas');
  const vp = document.getElementById('timeline-scroll-viewport');
  if (!cvs || !vp) return;

  // 2d-panning fallback: unlocked 2D wheel panning via scrollLeft/scrollTop when scroll-axis-lock unsupported
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('scroll-axis-lock', 'none')) {
    vp.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) return;
      if (vp.scrollWidth > vp.clientWidth || vp.scrollHeight > vp.clientHeight) {
        e.preventDefault();
        vp.scrollLeft += e.deltaX;
        vp.scrollTop += e.deltaY;
      }
    }, { passive: false });
  }

  let tlDrag = null;

  cvs.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const rect = cvs.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { trackW, dur } = getTimelineLayoutMetrics(vp.clientWidth || 640);
    const lanesTop = TL_RULER_H + TL_WAVE_H;

    // Click in Track Header -> select track (or Alt+Click to delete, Shift+Click to mute)
    if (px < TL_HEADER_W && py >= lanesTop) {
      const idx = Math.floor((py - lanesTop) / TL_LANE_H);
      const tr = state.timeline.tracks[idx];
      if (tr) {
        if (e.altKey) {
          pushUndoCheckpoint('Delete Timeline Track');
          state.timeline.tracks.splice(idx, 1);
          syncModulatedSliderHighlights();
          scheduleAutosave();
        } else if (e.shiftKey) {
          tr.muted = !tr.muted;
        } else {
          state.timeline.selectedTrackId = tr.id;
        }
        syncTimelineToolbarUI();
        renderTimelineCanvas();
      }
      return;
    }

    const xToTime = x => clamp(((x - TL_HEADER_W) / Math.max(1, trackW)) * dur, 0, dur);

    // Click on Ruler -> scrub playhead (or Alt+Click cue flag to remove)
    if (py < TL_RULER_H + TL_WAVE_H) {
      if (e.altKey) {
        const hitIdx = state.timeline.cueMarkers.findIndex(cm => {
          const cx = TL_HEADER_W + (cm.time / dur) * trackW;
          return Math.abs(px - cx) < 10;
        });
        if (hitIdx >= 0) {
          state.timeline.cueMarkers.splice(hitIdx, 1);
          renderTimelineCanvas();
          scheduleAutosave();
          return;
        }
      }
      state.timeline.playhead = xToTime(px);
      applyTimelineAtPlayhead(state.timeline.playhead);
      syncTimelineToolbarUI();
      renderTimelineCanvas();
      tlDrag = { kind: 'scrub', pointerId: e.pointerId, trackW, dur };
      cvs.setPointerCapture(e.pointerId);
      return;
    }

    // Click inside Keyframe Lane
    const tIdx = Math.floor((py - lanesTop) / TL_LANE_H);
    const tr = state.timeline.tracks[tIdx];
    if (!tr) return;
    state.timeline.selectedTrackId = tr.id;
    const y0 = lanesTop + tIdx * TL_LANE_H;
    const span = Math.max(1e-5, tr.maxVal - tr.minVal);
    const valToY = v => y0 + TL_LANE_H - 5 - clamp((v - tr.minVal) / span, 0, 1) * (TL_LANE_H - 10);
    const yToVal = y => tr.minVal + clamp(1.0 - (y - (y0 + 5)) / Math.max(4, TL_LANE_H - 10), 0, 1) * span;

    for (let k = 0; k < tr.keyframes.length; k++) {
      const kf = tr.keyframes[k];
      const kx = TL_HEADER_W + (kf.time / dur) * trackW;
      const ky = valToY(kf.value);
      if (Math.hypot(px - kx, py - ky) <= 9) {
        if (e.altKey && tr.keyframes.length > 1) {
          pushUndoCheckpoint('Delete Keyframe');
          tr.keyframes.splice(k, 1);
          renderTimelineCanvas();
          scheduleAutosave();
          return;
        }
        state.timeline.selectedKfId = kf.id;
        if (typeof setActiveSelection === 'function') {
          setActiveSelection('keyframe', kf.id, `${tr.label} @ ${kf.time.toFixed(1)}s`);
        }
        beginUndoGesture('Move Timeline Keyframe');
        tlDrag = { kind: 'kf', pointerId: e.pointerId, track: tr, kf, trackW, dur, y0 };
        syncTimelineToolbarUI();
        renderTimelineCanvas();
        cvs.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Double-click or click empty curve space -> insert new keyframe right where clicked!
    pushUndoCheckpoint('Insert Keyframe');
    const newKf = {
      id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      time: Number(xToTime(px).toFixed(3)),
      value: yToVal(py),
      curve: document.getElementById('sel-tl-curve')?.value || 'smooth'
    };
    tr.keyframes.push(newKf);
    tr.keyframes.sort((a, b) => a.time - b.time);
    state.timeline.selectedKfId = newKf.id;
    if (typeof setActiveSelection === 'function') {
      setActiveSelection('keyframe', newKf.id, `${tr.label} @ ${newKf.time.toFixed(1)}s`);
    }
    beginUndoGesture('Sculpt Timeline Keyframe');
    tlDrag = { kind: 'kf', pointerId: e.pointerId, track: tr, kf: newKf, trackW, dur, y0 };
    syncTimelineToolbarUI();
    renderTimelineCanvas();
    cvs.setPointerCapture(e.pointerId);
  });

  cvs.addEventListener('pointermove', (e) => {
    if (!tlDrag || tlDrag.pointerId !== e.pointerId) return;
    const rect = cvs.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (tlDrag.kind === 'scrub') {
      state.timeline.playhead = clamp(((px - TL_HEADER_W) / Math.max(1, tlDrag.trackW)) * tlDrag.dur, 0, tlDrag.dur);
      applyTimelineAtPlayhead(state.timeline.playhead);
      syncTimelineToolbarUI();
      renderTimelineCanvas();
      return;
    }

    if (tlDrag.kind === 'kf') {
      const span = Math.max(1e-5, tlDrag.track.maxVal - tlDrag.track.minVal);
      tlDrag.kf.time = Number(clamp(((px - TL_HEADER_W) / Math.max(1, tlDrag.trackW)) * tlDrag.dur, 0, tlDrag.dur).toFixed(3));
      tlDrag.kf.value = tlDrag.track.minVal + clamp(1.0 - (py - (tlDrag.y0 + 5)) / Math.max(4, TL_LANE_H - 10), 0, 1) * span;
      tlDrag.track.keyframes.sort((a, b) => a.time - b.time);
      applyTimelineAtPlayhead(state.timeline.playhead);
      renderTimelineCanvas();
    }
  });

  const endTlDrag = (e) => {
    if (!tlDrag || tlDrag.pointerId !== e.pointerId) return;
    if (cvs.hasPointerCapture(e.pointerId)) cvs.releasePointerCapture(e.pointerId);
    if (tlDrag.kind === 'kf') {
      commitUndoGesture();
      scheduleAutosave();
    }
    tlDrag = null;
  };
  cvs.addEventListener('pointerup', endTlDrag);
  cvs.addEventListener('pointercancel', endTlDrag);
}

function syncTimelineToolbarUI() {
  if (typeof document === 'undefined') return;
  const tl = state.timeline;
  const btnPlay = document.getElementById('btn-tl-play');
  const btnLoop = document.getElementById('btn-tl-loop');
  const inpDur = document.getElementById('inp-tl-dur');
  const selZoom = document.getElementById('sel-tl-zoom');
  const tcEl = document.getElementById('val-tl-timecode');
  if (btnPlay) {
    btnPlay.textContent = tl.playing ? '⏸ Pause' : '▶ Play';
    btnPlay.classList.toggle('active', tl.playing);
  }
  if (btnLoop) {
    btnLoop.classList.toggle('active', tl.loop);
    btnLoop.setAttribute('aria-pressed', String(tl.loop));
  }
  if (inpDur && document.activeElement !== inpDur) inpDur.value = String(Math.round(tl.duration || 30));
  if (selZoom) selZoom.value = String(tl.zoom || 1);
  if (tcEl) tcEl.textContent = `${formatTimecode(tl.playhead || 0)} / ${formatTimecode(tl.duration || 30)}`;
}

function serializeTimelineState(tl = state.timeline) {
  return {
    loop: tl.loop !== false,
    duration: Number(tl.duration || 30),
    zoom: Number(tl.zoom || 1),
    audioSourceId: tl.audioSourceId || '',
    cueMarkers: (tl.cueMarkers || []).map(m => ({ id: m.id, time: m.time, cueId: m.cueId })),
    tracks: (tl.tracks || []).map(tr => ({
      id: tr.id,
      targetKey: tr.targetKey,
      label: tr.label,
      minVal: tr.minVal,
      maxVal: tr.maxVal,
      muted: !!tr.muted,
      color: tr.color,
      keyframes: (tr.keyframes || []).map(k => ({ id: k.id, time: k.time, value: k.value, curve: k.curve || 'smooth' }))
    }))
  };
}

function restoreTimelineState(data) {
  if (!data || typeof data !== 'object') {
    state.timeline.cueMarkers = [];
    state.timeline.tracks = [];
    return;
  }
  state.timeline.playing = false;
  state.timeline.playhead = 0;
  state.timeline.loop = data.loop !== false;
  state.timeline.duration = clamp(Number(data.duration || 30), 2, 1800);
  state.timeline.zoom = clamp(Number(data.zoom || 1), 1, 10);
  state.timeline.audioSourceId = data.audioSourceId || '';
  state.timeline.cueMarkers = Array.isArray(data.cueMarkers) ? data.cueMarkers.map(m => ({ ...m })) : [];
  state.timeline.tracks = Array.isArray(data.tracks)
    ? data.tracks.map(tr => ({
        ...tr,
        keyframes: Array.isArray(tr.keyframes) ? tr.keyframes.map(k => ({ ...k })) : []
      }))
    : [];
  syncModulatedSliderHighlights();
  syncTimelineToolbarUI();
  if (state.timeline.open) renderTimelineCanvas();
}

// ----------------------------------------------------------------------------
// 5. MEDIARECORDER CLEAN STAGE VIDEO CAPTURE (60FPS WEBM / MP4)
// ----------------------------------------------------------------------------

let stageCaptureCanvas = null;
let stageCaptureCtx = null;
let activeMediaRecorder = null;
let recordedStageChunks = [];

function pickSupportedRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4'
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return '';
}

function startStageVideoRecording() {
  if (typeof MediaRecorder === 'undefined' || typeof document === 'undefined') {
    showToast('MediaRecorder Stage Capture is unavailable in this browser');
    return false;
  }
  if (state.recorder.active) return true;

  const capW = Math.min(1920, Math.max(320, Math.round(state.stageWidth || 1920)));
  const capH = Math.min(1080, Math.max(180, Math.round(capW / Math.max(0.25, state.stageAspect || (16 / 9)))));
  if (!stageCaptureCanvas) {
    stageCaptureCanvas = document.createElement('canvas');
    stageCaptureCtx = stageCaptureCanvas.getContext('2d');
  }
  stageCaptureCanvas.width = capW;
  stageCaptureCanvas.height = capH;

  if (typeof stageCaptureCanvas.captureStream !== 'function') {
    showToast('Canvas captureStream() is unsupported in this browser');
    return false;
  }

  const stream = stageCaptureCanvas.captureStream(60);
  if (state.recorder.includeAudio && typeof getAudioCaptureStreamTrack === 'function') {
    const aTrack = getAudioCaptureStreamTrack();
    if (aTrack) {
      try { stream.addTrack(aTrack); } catch (_) {}
    }
  }

  const mimeType = pickSupportedRecorderMime();
  recordedStageChunks = [];
  try {
    activeMediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 14_000_000 })
      : new MediaRecorder(stream);
  } catch (_) {
    showToast('Failed to initialize Stage MediaRecorder');
    return false;
  }

  activeMediaRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) recordedStageChunks.push(ev.data);
  };
  activeMediaRecorder.onstop = () => {
    state.recorder.active = false;
    syncStageRecordButtonUI();
    if (recordedStageChunks.length === 0) return;
    const ext = (activeMediaRecorder?.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(recordedStageChunks, { type: activeMediaRecorder?.mimeType || 'video/webm' });
    recordedStageChunks = [];
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chaos-cathoderay-stage-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast(`🎬 Saved Stage Recording (.${ext})`);
  };

  state.recorder.active = true;
  state.recorder.elapsedSec = 0;
  state.recorder.mimeType = mimeType || 'video/webm';
  activeMediaRecorder.start(250);
  syncStageRecordButtonUI();
  showToast(`● Stage Capture Recording (${capW}×${capH} 60fps)`);
  return true;
}

function stopStageVideoRecording() {
  if (!state.recorder.active || !activeMediaRecorder) return;
  try {
    if (activeMediaRecorder.state !== 'inactive') activeMediaRecorder.stop();
  } catch (_) {
    state.recorder.active = false;
    syncStageRecordButtonUI();
  }
}

function toggleStageVideoRecording() {
  if (state.recorder.active) stopStageVideoRecording();
  else startStageVideoRecording();
}

function captureStageRecorderFrame(dt, stageMetrics) {
  if (!state.recorder.active || !stageCaptureCtx || !stageCaptureCanvas) return;
  state.recorder.elapsedSec += dt;

  // Blit clean Stage region from #gl-engine onto stageCaptureCanvas
  if (stageMetrics && stageMetrics.vpRect && stageMetrics.box && stageMetrics.areaRect && typeof glCanvas !== 'undefined') {
    const dpr = stageMetrics.dpr || 1;
    const sx = Math.max(0, Math.round(((stageMetrics.vpRect.left - stageMetrics.areaRect.left) + stageMetrics.box.x) * dpr));
    const sy = Math.max(0, Math.round(((stageMetrics.vpRect.top - stageMetrics.areaRect.top) + stageMetrics.box.y) * dpr));
    const sw = Math.max(1, Math.round(stageMetrics.box.w * dpr));
    const sh = Math.max(1, Math.round(stageMetrics.box.h * dpr));
    try {
      stageCaptureCtx.fillStyle = '#000';
      stageCaptureCtx.fillRect(0, 0, stageCaptureCanvas.width, stageCaptureCanvas.height);
      stageCaptureCtx.drawImage(glCanvas, sx, sy, sw, sh, 0, 0, stageCaptureCanvas.width, stageCaptureCanvas.height);
    } catch (_) {}
  }

  // Update button timer every ~0.25s
  if (Math.floor((state.recorder.elapsedSec - dt) * 4) !== Math.floor(state.recorder.elapsedSec * 4)) {
    syncStageRecordButtonUI();
  }
}

function syncStageRecordButtonUI() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('btn-stage-rec');
  if (!btn) return;
  const on = !!state.recorder.active;
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? `■ ${formatTimecode(state.recorder.elapsedSec).slice(0, 5)}` : '● Rec';
}
