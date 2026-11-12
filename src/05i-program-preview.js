// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05i · PROGRAM / PREVIEW — EDIT BLIND, TAKE WITH A FADE (v2.2)
// ----------------------------------------------------------------------------
// Program = what the audience sees (held in projector windows).
// Preview = the operator's working state (state.surfaces / masks / …).
// While the program is HELD, projector windows keep rendering the held look;
// MAP edits, cue recalls and cue edits only change Preview. TAKE dissolves
// Program → Preview on every output. Venue calibration (geometry) is tracked
// into the held Program so alignment work is always visible on the wall.
// Performance layers (spots, DMX, GM, blackout) are never held.
// ============================================================================

function ensureProgramState() {
  if (!state.program || typeof state.program !== 'object') {
    state.program = { held: false, snap: null, scene: null, activeCueId: null, takeFadeSec: 2.0, autoBlind: true, sinceMs: 0 };
  }
  const p = state.program;
  if (!Number.isFinite(Number(p.takeFadeSec))) p.takeFadeSec = 2.0;
  if (p.autoBlind === undefined) p.autoBlind = true;
  return p;
}

function isProgramHeld() {
  return !!(state.program && state.program.held && state.program.snap);
}

function getHeldProgramScene() {
  return isProgramHeld() ? state.program.scene : null;
}

function bumpSceneSyncRev() {
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
}

// Look-only comparison signature (spots / DMX / modulators are live layers).
function programLookSignature(snap) {
  if (!snap) return '';
  try {
    return JSON.stringify([snap.surfaces, snap.groups, snap.masks, snap.masterFxChain, snap.mixbus, snap.shaders, snap.isfParams, snap.textParams]);
  } catch (_) {
    return '';
  }
}

let _programPendingCache = { t: 0, val: false };
function hasPendingPreviewEdits(force = false) {
  if (!isProgramHeld()) return false;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!force && now - _programPendingCache.t < 400) return _programPendingCache.val;
  const p = state.program;
  if (!p._sig) p._sig = programLookSignature(p.snap);
  const val = programLookSignature(captureSceneSnapshot()) !== p._sig;
  _programPendingCache = { t: now, val };
  return val;
}

// Freeze what the audience sees right now; the operator keeps editing a Preview.
function holdProgram(opts = {}) {
  const p = ensureProgramState();
  if (p.held) return false;
  const snap = captureSceneSnapshot();
  p.held = true;
  p.snap = snap;
  p.scene = instantiateRuntimeScene(snap);
  p._sig = programLookSignature(snap);
  p.activeCueId = state.activeCueId || null;
  p.sinceMs = Date.now();
  _programPendingCache = { t: 0, val: false };
  bumpSceneSyncRev();
  syncProgramPreviewUI();
  if (!opts.silent && typeof showToast === 'function') {
    showToast('● BLIND — the stage holds Program. Edit freely, then TAKE to fade it in.');
  }
  return true;
}

function releaseProgram(opts = {}) {
  const p = ensureProgramState();
  if (!p.held) return false;
  p.held = false;
  p.snap = null;
  p.scene = null;
  p._sig = '';
  _programPendingCache = { t: 0, val: false };
  bumpSceneSyncRev();
  syncProgramPreviewUI();
  if (!opts.silent && typeof showToast === 'function') showToast('Blind off — edits go straight to the stage.');
  return true;
}

// Dissolve Program → Preview on every output (and in the operator view).
function takeProgram(fadeSec = null) {
  const p = ensureProgramState();
  if (!p.held) return false;
  const from = p.snap;
  const dur = Math.max(0, fadeSec === null ? Number(p.takeFadeSec) || 0 : Number(fadeSec) || 0);
  p.held = false;
  p.snap = null;
  p.scene = null;
  p._sig = '';
  _programPendingCache = { t: 0, val: false };
  if (dur > 0.04) {
    beginCueCrossfadeFromVisible(from);
    state.crossfade.active = true;
    state.crossfade.elapsed = 0;
    state.crossfade.duration = dur;
    state.crossfade.mix = 0.0;
    if (state.cuePlayback) { state.cuePlayback.tbarHeld = false; state.cuePlayback.paused = false; }
    updateCrossfadeProgressUI(0.02, `TAKE → stage (${dur.toFixed(1)} s)`);
  } else {
    state.crossfade.active = false;
    state.crossfade.mix = 1.0;
    state.crossfade.fromScene = null;
    state.crossfade.chainToScene = null;
  }
  bumpSceneSyncRev();
  syncProgramPreviewUI();
  if (typeof showToast === 'function') showToast(dur > 0.04 ? `TAKE ▸ fading Preview onto the stage (${dur.toFixed(1)} s)` : 'TAKE ▸ Preview is on stage');
  if (typeof emitWebMapperEvent === 'function') emitWebMapperEvent('take', { fadeSec: dur });
  return true;
}

// Throw away Preview edits: the operator view snaps back to what is on stage.
function revertPreviewToProgram(opts = {}) {
  const p = ensureProgramState();
  if (!p.held || !p.snap) return false;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Revert Preview to Program');
  const snap = p.snap;
  const filter = { geometry: true, media: true, gradingFx: true, masks: true, followspot: false, modulators: true };
  if (typeof applySelectiveSceneSnapshot === 'function') applySelectiveSceneSnapshot(snap, filter, false);
  else applySceneSnapshotImmediate(snap);
  state.activeCueId = p.activeCueId;
  state.crossfade.active = false;
  state.crossfade.mix = 1.0;
  state.crossfade.fromScene = null;
  state.crossfade.chainToScene = null;
  _programPendingCache = { t: 0, val: false };
  if (opts.release) releaseProgram({ silent: true });
  bumpSceneSyncRev();
  if (typeof renderSurfaceList === 'function') renderSurfaceList();
  if (typeof renderMaskList === 'function') renderMaskList();
  if (typeof renderCueList === 'function') renderCueList();
  if (typeof syncInspectorUI === 'function') syncInspectorUI();
  syncProgramPreviewUI();
  if (typeof showToast === 'function') showToast('↺ Preview reverted to what is on stage');
  return true;
}

// GO / deck fire while held: the dissolve must start from what the audience
// actually sees. Returns the held snapshot to crossfade from (or null).
function consumeHeldProgramForGo() {
  if (!isProgramHeld()) return null;
  const snap = state.program.snap;
  releaseProgram({ silent: true });
  return snap;
}

// Room transitions: LIVE → MAP holds the stage; arriving in LIVE with nothing
// pending lets go silently (unsent edits keep the hold + banner).
function onRoomChangedForProgram(prevRoom, nextRoom) {
  const p = ensureProgramState();
  if (prevRoom === 'live' && nextRoom === 'map' && p.autoBlind && !p.held) {
    holdProgram();
  } else if (nextRoom === 'live' && p.held && !hasPendingPreviewEdits(true)) {
    releaseProgram({ silent: true });
  }
  syncProgramPreviewUI();
}

// Geometry tracking: venue calibration edits flow into the held Program too.
function trackGeometryIntoHeldProgram(applyTrack) {
  if (!isProgramHeld()) return;
  const pseudo = { id: '__program__', snapshot: state.program.snap, recallFilter: null };
  applyTrack(pseudo);
  if (pseudo.snapshot !== state.program.snap) {
    state.program.snap = pseudo.snapshot;
    state.program.scene = instantiateRuntimeScene(pseudo.snapshot);
    state.program._sig = programLookSignature(pseudo.snapshot);
    bumpSceneSyncRev();
  }
}

// Projector payload override: substitute the held look into STATE_SYNC.
function applyHeldProgramToSyncPayload(payload) {
  if (!isProgramHeld()) return payload;
  const p = state.program;
  const sc = p.scene;
  payload.programHeld = true;
  payload.crossfade = { active: false, mix: 1.0 };
  payload.surfaces = serializeSurfaceSyncArray(sc.surfaces);
  payload.groups = (sc.groups || []).map(cloneGroupData);
  payload.masks = (sc.masks || []).map(cloneMaskData);
  payload.masterFxChain = cloneFxChain(sc.masterFxChain || []);
  if (p.snap.mixbus) payload.mixbusState = p.snap.mixbus;
  const sh = p.snap.shaders || {};
  for (const id of Object.keys(payload.shaders || {})) {
    if (sh[id]) payload.shaders[id] = { ...payload.shaders[id], ...sh[id] };
  }
  const isf = p.snap.isfParams || {};
  for (const id of Object.keys(payload.isfRuntimeStates || {})) {
    if (isf[id] && isf[id].isfValues) payload.isfRuntimeStates[id] = { ...payload.isfRuntimeStates[id], isfValues: isf[id].isfValues };
  }
  return payload;
}

// ----------------------------------------------------------------------------
// UI: rail block (MAP), banner (any room while held), keyboard
// ----------------------------------------------------------------------------
function syncProgramPreviewUI() {
  if (typeof document === 'undefined') return;
  const p = ensureProgramState();
  const held = isProgramHeld();
  const pending = held && hasPendingPreviewEdits();
  document.body.classList.toggle('program-held', held);
  document.body.classList.toggle('program-pending', pending);
  const blindBtn = document.getElementById('btn-rail-blind');
  if (blindBtn) {
    blindBtn.classList.toggle('active', held);
    blindBtn.setAttribute('aria-pressed', String(held));
    blindBtn.innerHTML = held ? '● BLIND' : '○ LIVE<br><span class="rail-mini">edits</span>';
    blindBtn.title = held
      ? 'Blind: the stage holds Program while you edit Preview. Click to stop holding (edits go live immediately).'
      : 'Edits currently go straight to the stage. Click to hold the stage (Blind) and edit a Preview.';
  }
  const takeBtn = document.getElementById('btn-rail-take');
  if (takeBtn) {
    takeBtn.disabled = !held;
    takeBtn.classList.toggle('pending', pending);
  }
  const revBtn = document.getElementById('btn-rail-revert');
  if (revBtn) revBtn.disabled = !held;
  const fadeIn = document.getElementById('inp-take-fade');
  if (fadeIn && document.activeElement !== fadeIn) fadeIn.value = String(Number(p.takeFadeSec).toFixed(1));

  const banner = document.getElementById('program-banner');
  if (banner) {
    banner.hidden = !held;
    if (held) {
      const msg = banner.querySelector('.pgm-msg');
      if (msg) {
        const live = state.room === 'live';
        msg.textContent = pending
          ? (live ? 'Stage is holding Program — Preview has unsent edits. GO dissolves from what is on stage and drops them.' : 'BLIND · stage holds Program · Preview has unsent edits')
          : 'BLIND · stage holds Program · Preview = Program';
      }
      const t = banner.querySelector('.pgm-take-lbl');
      if (t) t.textContent = `TAKE ${Number(p.takeFadeSec).toFixed(1)} s`;
    }
  }
}

function initProgramPreviewControls() {
  if (typeof document === 'undefined') return;
  ensureProgramState();
  const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
  on('btn-rail-blind', 'click', () => {
    if (isProgramHeld()) {
      if (hasPendingPreviewEdits(true)) takeProgram();
      else releaseProgram();
    } else {
      holdProgram();
    }
  });
  on('btn-rail-take', 'click', () => takeProgram());
  on('btn-rail-revert', 'click', () => revertPreviewToProgram());
  on('btn-pgm-take', 'click', () => takeProgram());
  on('btn-pgm-cut', 'click', () => takeProgram(0));
  on('btn-pgm-revert', 'click', () => revertPreviewToProgram({ release: state.room === 'live' }));
  on('inp-take-fade', 'change', (e) => {
    state.program.takeFadeSec = clamp(parseFloat(e.target.value) || 0, 0, 30);
    syncProgramPreviewUI();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
  });
  // Cheap periodic refresh of the "pending" badge (edits come from everywhere).
  setInterval(() => { if (isProgramHeld()) syncProgramPreviewUI(); }, 600);
  syncProgramPreviewUI();
}

// ============================================================================
// CONTEXTS (v2.2): one app, five kinds of night. A context only picks defaults
// (venue, rig, views, edit safety, spots); it never deletes surfaces or cues,
// and it is a single undo step.
// ============================================================================
const WORKFLOW_CONTEXTS = {
  quick2d: {
    icon: '▱', label: 'Quick 2D map',
    blurb: 'A wall, a window, a box. One projector, drag 4 corners, drop media. MAP opens on the flat 2D stage, no spots, edits go live.'
  },
  theatre: {
    icon: '🎭', label: 'Theatre play',
    blurb: 'Proscenium, set pieces, a performer and a followspot aimed on stage. Edits in MAP are Blind until you TAKE.'
  },
  club: {
    icon: '🎛', label: 'VJ set / club',
    blurb: 'Black box, Orbital Mix in front, no spots, edits hit the screens instantly.'
  },
  rehearsal: {
    icon: '📌', label: 'Rehearsal',
    blurb: 'Like a play, plus 📌 Keep take in LIVE: store what worked, sort it out later in MAP, TAKE it back in with a fade.'
  },
  architectural: {
    icon: '🏛', label: 'Architectural mapping',
    blurb: 'Open ground with a building facade 12 m away, projectors at 20 m, high lumens. MAP opens on the Front elevation.'
  }
};

function setRoomDefaultFeed(room, feed) {
  if (!state._feedByRoom) state._feedByRoom = {};
  state._feedByRoom[room] = feed;
}

function aimProjectorAt(scr, pos, aim, lumens = null) {
  scr.posM = [...pos];
  scr.aimM = [...aim];
  scr._autoPose = false;
  if (lumens) scr.lumens = lumens;
  if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
}

function applyWorkflowContext(id) {
  const ctx = WORKFLOW_CONTEXTS[id];
  if (!ctx) return false;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint(`Context: ${ctx.label}`);
  ensureWorldRigSeeded();
  const prog = ensureProgramState();
  const mp = typeof ensureMultiProjectorState === 'function' ? ensureMultiProjectorState() : state.multiProjector;
  const sp = mp && typeof ensureStagePlanState === 'function' ? ensureStagePlanState(mp) : null;
  const spots = state.spots || [];
  const setSpots = (on) => spots.forEach(s => { if ((s.enabled !== false) !== on && typeof toggleSpotEnabled === 'function') toggleSpotEnabled(s.id, on); });
  state.workflow = id;

  if (id === 'quick2d') {
    syncWorldStageDimensions(NaN, NaN, NaN, 'gallery');
    prog.autoBlind = false;
    setSpots(false);
    setRoomDefaultFeed('map', 'stage');
    setRoomDefaultFeed('live', 'stage');
  } else if (id === 'theatre' || id === 'rehearsal') {
    syncWorldStageDimensions(NaN, NaN, NaN, 'proscenium');
    prog.autoBlind = true;
    if (!(state.worldProps || []).length && typeof addWorldProp === 'function') addWorldProp('human');
    if (spots[0]) {
      if (spots[0].enabled === false && typeof toggleSpotEnabled === 'function') toggleSpotEnabled(spots[0].id, true);
      spots[0].converge3D = true;
      if (typeof ensureSpotStageModel === 'function') ensureSpotStageModel(spots[0]);
    }
    setRoomDefaultFeed('map', 'venue3d');
    setRoomDefaultFeed('live', 'venue3d');
  } else if (id === 'club') {
    syncWorldStageDimensions(NaN, NaN, NaN, 'blackbox');
    prog.autoBlind = false;
    setSpots(false);
    setRoomDefaultFeed('map', 'venue3d');
    setRoomDefaultFeed('live', 'stage');
  } else if (id === 'architectural') {
    syncWorldStageDimensions(NaN, NaN, NaN, 'open_ground');
    prog.autoBlind = true;
    setSpots(false);
    if (!(state.venueParts || []).some(p => p.kind === 'building') && typeof addVenuePart === 'function') {
      addVenuePart('building', { name: 'Facade', posM: [0, 0, -12], sizeM: [16, 10, 6] });
    }
    const facade = (state.venueParts || []).find(p => p.kind === 'building');
    const fz = facade ? facade.posM[2] + facade.sizeM[2] * 0.5 : -9;
    const fy = facade ? facade.sizeM[1] * 0.5 : 5;
    const scrs = (mp?.screens || []).filter(s => s && s.enabled !== false);
    scrs.forEach((scr, i) => {
      const off = scrs.length > 1 ? (i / (scrs.length - 1) - 0.5) * 6 : 0;
      aimProjectorAt(scr, [off, 3.0, fz + 20], [off * 0.6, fy, fz], 30000);
    });
    setRoomDefaultFeed('map', 'venue3d');
    setRoomDefaultFeed('live', 'venue3d');
    if (sp) { sp.camMode = 'ortho'; sp.orthoView = 'front'; sp.orthoZoom = 1; sp.orthoPan = [0, 0]; }
  }
  if (typeof markStagePlanDirty === 'function') markStagePlanDirty();
  if (typeof restoreRoomFeedTab === 'function' && state.room !== 'build') restoreRoomFeedTab(state.room);
  if (typeof syncRoomUI === 'function') syncRoomUI();
  if (typeof syncVenueHudUI === 'function') syncVenueHudUI();
  syncWorkflowUI();
  syncProgramPreviewUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') showToast(`${ctx.icon} ${ctx.label}: defaults set — your surfaces and cues are untouched (⌘Z undoes)`);
  return true;
}

function syncWorkflowUI() {
  if (typeof document === 'undefined') return;
  const ctx = WORKFLOW_CONTEXTS[state.workflow];
  const chip = document.getElementById('btn-context');
  if (chip) chip.textContent = ctx ? `🧭 Context: ${ctx.icon} ${ctx.label}…` : '🧭 Context…';
  const showBtn = document.getElementById('btn-file-menu');
  if (showBtn) showBtn.textContent = ctx ? `📂 Show ${ctx.icon} ▾` : '📂 Show ▾';
  document.body.classList.toggle('wf-rehearsal', state.workflow === 'rehearsal');
  const grid = document.getElementById('context-grid');
  if (grid) {
    grid.innerHTML = Object.entries(WORKFLOW_CONTEXTS).map(([k, c]) => `
      <button type="button" class="context-card${state.workflow === k ? ' active' : ''}" data-ctx="${k}">
        <span class="context-icon">${c.icon}</span>
        <strong>${escapeHtml(c.label)}</strong>
        <span class="context-blurb">${escapeHtml(c.blurb)}</span>
      </button>`).join('');
  }
}

// Rehearsal: keep what just worked as an out-of-sequence cue to sort out later in MAP.
function keepRehearsalTake() {
  const d = new Date();
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const cue = storeNewCue({ cueRole: 'deck', priorityMode: 'ltp', name: `📌 Take ${hhmm}`, fadeSec: 1.0 });
  const c = cue && cue.id ? cue : (state.cues || [])[state.cues.length - 1];
  if (c) c.take = true;
  if (typeof renderCueList === 'function') renderCueList();
  if (typeof showToast === 'function') showToast(`📌 Kept take ${hhmm} — find it in the cue list (Action) to refine in MAP`);
  return c;
}

function initWorkflowControls() {
  if (typeof document === 'undefined') return;
  const dlg = document.getElementById('context-dialog');
  document.getElementById('btn-context')?.addEventListener('click', () => {
    try { document.getElementById('pop-file-menu')?.hidePopover?.(); } catch (_) {}
    syncWorkflowUI();
    if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
  });
  document.getElementById('context-grid')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ctx]');
    if (!b) return;
    applyWorkflowContext(b.dataset.ctx);
    if (dlg && dlg.open) dlg.close();
  });
  document.getElementById('btn-context-close')?.addEventListener('click', () => dlg?.close());
  document.getElementById('btn-cue-keep-take')?.addEventListener('click', () => keepRehearsalTake());
  syncWorkflowUI();
}
