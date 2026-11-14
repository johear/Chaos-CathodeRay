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
// Signature of the stage look for pending-edit detection. Source parameters are compared
// separately (sourceLooksDiffer); surface/mask properties driven by a modulator are left out,
// because they change every frame without anyone editing them.
// Parameters something else drives every frame: enabled modulators (LFO, audio, MIDI…) and the
// tracks of a playing keyframe timeline. Their changes are not edits.
function getDrivenTargetKeys() {
  const keys = [];
  for (const m of state.modulators || []) if (m && m.enabled !== false && m.targetKey) keys.push(String(m.targetKey));
  const tl = state.timeline;
  if (tl && tl.playing) for (const t of tl.tracks || []) if (t && t.targetKey) keys.push(String(t.targetKey));
  return keys;
}

// Surface fields a driven target key writes (some properties fan out to stored fields).
const DRIVEN_SURFACE_FIELDS = {
  posX3d: ['pos3d'], posY3d: ['pos3d'], posZ3d: ['pos3d'],
  rotX3d: ['rot3d'], rotY3d: ['rot3d'], rotZ3d: ['rot3d'],
  scale3dUniform: ['scale3d'],
  feather: ['feather', 'featherL', 'featherR', 'featherT', 'featherB']
};

function programLookSignature(snap) {
  if (!snap) return '';
  try {
    const drop = new Set();
    let masterFxDriven = false;
    for (const key of getDrivenTargetKeys()) {
      const parts = key.split(':');
      if (parts[0] === 'masterfx') { masterFxDriven = true; continue; }
      if (parts[0] !== 'surface' && parts[0] !== 'mask') continue;
      if (parts[2] === 'fx') { drop.add(`${parts[0]}:${parts[1]}:fxChain`); continue; }
      for (const f of DRIVEN_SURFACE_FIELDS[parts[2]] || [parts[2]]) drop.add(`${parts[0]}:${parts[1]}:${f}`);
    }
    const strip = (list, scope) => (list || []).map(o => {
      if (!o || !drop.size) return o;
      const c = { ...o };
      for (const k of Object.keys(c)) if (drop.has(`${scope}:${o.id}:${k}`)) delete c[k];
      return c;
    });
    return JSON.stringify([strip(snap.surfaces, 'surface'), snap.groups, strip(snap.masks, 'mask'), masterFxDriven ? null : snap.masterFxChain, snap.mixbus, snap.textParams]);
  } catch (_) {
    return '';
  }
}

let _programPendingCache = { t: 0, val: false };
// Look settings of every source that reach the projectors outside cue snapshots (generator
// speed/scale/palette, ISF parameters, mirroring). Time-based values (simTime, playback
// position) are deliberately left out so held generators and videos keep moving.
const HELD_SHADER_LOOK_KEYS = ['playing', 'speed', 'scale', 'detail', 'temp', 'palette', 'mirrorX'];

function captureSourceLooks() {
  const out = { shaders: {}, isf: {}, text: {}, mirror: {} };
  for (const src of state.sources || []) {
    if (!src || !src.id) continue;
    if (src.kind === 'shader') {
      const o = {};
      for (const k of HELD_SHADER_LOOK_KEYS) o[k] = src[k];
      out.shaders[src.id] = o;
    } else if (src.kind === 'isf') {
      out.isf[src.id] = { isfValues: JSON.parse(JSON.stringify(src.isfValues || {})), mirrorX: !!src.mirrorX, speed: src.speed ?? 1.0, playing: src.playing !== false };
    } else if (src.kind === 'video' || src.kind === 'text') {
      out.mirror[src.id] = !!src.mirrorX;
      if (src.kind === 'text') out.text[src.id] = { animSpeed: src.animSpeed ?? 1.0, playing: src.playing !== false };
    }
  }
  return out;
}

function applySourceLooks(looks) {
  if (!looks) return;
  for (const src of state.sources || []) {
    if (!src || !src.id) continue;
    if (src.kind === 'shader' && looks.shaders[src.id]) Object.assign(src, looks.shaders[src.id]);
    else if (src.kind === 'isf' && looks.isf[src.id]) {
      src.isfValues = JSON.parse(JSON.stringify(looks.isf[src.id].isfValues || {}));
      src.mirrorX = looks.isf[src.id].mirrorX;
      if (looks.isf[src.id].speed !== undefined) src.speed = looks.isf[src.id].speed;
      if (looks.isf[src.id].playing !== undefined) src.playing = looks.isf[src.id].playing;
    } else if (looks.mirror[src.id] !== undefined) {
      src.mirrorX = looks.mirror[src.id];
      if (src.kind === 'text' && looks.text && looks.text[src.id]) Object.assign(src, looks.text[src.id]);
    }
  }
}

// Source parameters driven by an active modulator (LFO, audio, MIDI…) change every frame:
// they are not "edits", so pending detection ignores them.
function getModulatedSourceKeys() {
  const keys = new Set();
  for (const key of getDrivenTargetKeys()) {
    const parts = key.split(':');
    if (parts[0] !== 'source') continue;
    keys.add(parts[2] === 'isf' ? `${parts[1]}:isf.${parts[3]}` : `${parts[1]}:${parts[2]}`);
  }
  return keys;
}

// True when a held source look differs from now (only sources that existed when the hold began).
function sourceLooksDiffer(held, now) {
  if (!held || !now) return false;
  const mod = getModulatedSourceKeys();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const [id, h] of Object.entries(held.shaders)) {
    const n = now.shaders[id];
    if (!n) continue;
    for (const k of Object.keys(h)) if (!mod.has(`${id}:${k}`) && !same(h[k], n[k])) return true;
  }
  for (const [id, h] of Object.entries(held.isf)) {
    const n = now.isf[id];
    if (!n) continue;
    for (const k of ['mirrorX', 'speed', 'playing']) if (!mod.has(`${id}:${k}`) && !same(h[k], n[k])) return true;
    const hv = h.isfValues || {}, nv = n.isfValues || {};
    for (const k of new Set([...Object.keys(hv), ...Object.keys(nv)])) if (!mod.has(`${id}:isf.${k}`) && !same(hv[k], nv[k])) return true;
  }
  for (const [id, h] of Object.entries(held.text || {})) {
    const n = (now.text || {})[id];
    if (!n) continue;
    for (const k of ['animSpeed', 'playing']) if (!mod.has(`${id}:${k}`) && !same(h[k], n[k])) return true;
  }
  for (const [id, m] of Object.entries(held.mirror)) {
    if (now.mirror[id] !== undefined && now.mirror[id] !== m && !mod.has(`${id}:mirrorX`)) return true;
  }
  return false;
}

// While Blind, each generator / text animation on stage runs on its own held clock (held speed
// and play state); the operator's clock may be paused or sped up in Preview. Advanced every frame
// by the main loop with the same dt as the operator's clocks; handed back at TAKE / release.
function advanceHeldClocks(p, dtSec) {
  if (!p || !p.clocks) return;
  const dt = Math.max(0, Number(dtSec) || 0);
  const look = p.srcLook || { shaders: {}, isf: {}, text: {} };
  for (const [id, c] of Object.entries(p.clocks)) {
    const l = look.shaders[id] || look.isf[id];
    const tl = (look.text || {})[id];
    if (tl) { if (tl.playing !== false) c.t += dt * (Number(tl.animSpeed ?? 1) || 0); continue; }
    if (!l || l.playing === false) continue;
    c.t += dt * (Number(l.speed ?? 1) || 0);
    c.frameAcc = (c.frameAcc || 0) + dt * 60;
    const whole = Math.floor(c.frameAcc);
    c.frame += whole;
    c.frameAcc -= whole;
  }
}

// Running sources continue from the stage clock (no jump on stage). A source paused in Preview
// keeps its chosen frame: TAKE puts exactly that on stage.
function handHeldClocksBack(p) {
  if (!p || !p.clocks) return;
  for (const src of state.sources || []) {
    const c = src && p.clocks[src.id];
    if (!c || src.playing === false) continue;
    src.simTime = c.t;
    if (src.kind === 'isf') src.frameIndex = c.frame;
  }
}

function hasPendingPreviewEdits(force = false) {
  if (!isProgramHeld()) return false;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!force && now - _programPendingCache.t < 400) return _programPendingCache.val;
  const p = state.program;
  // Both sides with today's set of driven parameters (a modulator added during the hold must not
  // make the old signature differ).
  const val = programLookSignature(captureSceneSnapshot()) !== programLookSignature(p.snap)
    || (!!p.srcLook && sourceLooksDiffer(p.srcLook, captureSourceLooks()));
  _programPendingCache = { t: now, val };
  return val;
}

// Freeze what the audience sees right now; the operator keeps editing a Preview.
function holdProgram(opts = {}) {
  const p = ensureProgramState();
  if (p.held) return false;
  const snap = captureSceneSnapshot();
  p.held = true;
  p.everHeld = true;
  p.snap = snap;
  p.scene = instantiateRuntimeScene(snap);
  p._sig = programLookSignature(snap);
  p.srcLook = captureSourceLooks();
  p._srcSig = JSON.stringify(p.srcLook);
  p.clocks = {};
  for (const src of state.sources || []) {
    if (src && (src.kind === 'shader' || src.kind === 'isf' || src.kind === 'text')) p.clocks[src.id] = { t: Number(src.simTime) || 0, frame: src.frameIndex || 0, frameAcc: 0 };
  }
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
  handHeldClocksBack(p);
  p.snap = null;
  p.srcLook = null;
  p._srcSig = undefined;
  p.clocks = null;
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
  handHeldClocksBack(p);
  p.snap = null;
  p.srcLook = null;
  p._srcSig = undefined;
  p.clocks = null;
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
  applySourceLooks(p.srcLook);
  handHeldClocksBack(p); // Preview resumes from where the stage is
  if (typeof syncShaderStudioUI === 'function') syncShaderStudioUI(true);
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
// Blind protects an audience: it arms on LIVE → MAP only when the show has cues AND an output is
// actually open (projector window, local projector mode, or a remote output). While sketching
// everything stays immediate. The manual Blind button works at any time.
function shouldAutoArmBlind() {
  const p = ensureProgramState();
  const outputOpen = typeof isAnyOutputWindowOpen === 'function' ? isAnyOutputWindowOpen() : true;
  return !!p.autoBlind && outputOpen && (state.cues || []).length > 0;
}

function onRoomChangedForProgram(prevRoom, nextRoom) {
  const p = ensureProgramState();
  if (prevRoom === 'live' && nextRoom === 'map' && !p.held && shouldAutoArmBlind()) {
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
  const look = p.srcLook || { shaders: {}, isf: {}, mirror: {} };
  const clocks = p.clocks || {};
  for (const id of Object.keys(payload.shaders || {})) {
    if (look.shaders[id]) payload.shaders[id] = { ...payload.shaders[id], ...look.shaders[id], ...(clocks[id] ? { simTime: clocks[id].t } : {}) };
    else if (sh[id]) payload.shaders[id] = { ...payload.shaders[id], ...sh[id] };
  }
  const isf = p.snap.isfParams || {};
  for (const id of Object.keys(payload.isfRuntimeStates || {})) {
    if (look.isf[id]) payload.isfRuntimeStates[id] = { ...payload.isfRuntimeStates[id], isfValues: look.isf[id].isfValues, mirrorX: look.isf[id].mirrorX, ...(clocks[id] ? { simTime: clocks[id].t, frameIndex: clocks[id].frame } : {}) };
    else if (isf[id] && isf[id].isfValues) payload.isfRuntimeStates[id] = { ...payload.isfRuntimeStates[id], isfValues: isf[id].isfValues };
  }
  for (const bucket of ['videos', 'textRuntimeStates']) {
    for (const id of Object.keys(payload[bucket] || {})) {
      if (look.mirror[id] !== undefined) payload[bucket][id] = { ...payload[bucket][id], mirrorX: look.mirror[id] };
      if (bucket === 'textRuntimeStates' && clocks[id]) payload[bucket][id] = { ...payload[bucket][id], simTime: clocks[id].t };
    }
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
  // PGM / TAKE controls show up once they mean something: cues exist or Blind was used.
  document.body.classList.toggle('program-available', held || !!p.everHeld || (state.cues || []).length > 0);
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
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint(`Kit: ${ctx.label}`);
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
    state.shapesLocked = true;
    if (!(state.worldProps || []).length && typeof addWorldProp === 'function') addWorldProp('human');
    if (!spots.length && typeof addSpotInstance === 'function') { addSpotInstance(); spots.push(...(state.spots || []).filter(s => !spots.includes(s))); }
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
    state.shapesLocked = true;
    if (typeof ensureProjectorCount === 'function') ensureProjectorCount(2);
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
  if (typeof syncShapesLockUI === 'function') syncShapesLockUI();
  if (typeof showToast === 'function') showToast(`${ctx.icon} ${ctx.label} kit added — your surfaces and cues are kept (⌘Z undoes)`);
  return true;
}

function syncWorkflowUI() {
  if (typeof document === 'undefined') return;
  const ctx = WORKFLOW_CONTEXTS[state.workflow];
  const chip = document.getElementById('btn-context');
  if (chip) chip.textContent = ctx ? `🧰 Kit: ${ctx.icon} ${ctx.label}…` : '🧰 Add a kit…';
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
