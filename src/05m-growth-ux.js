// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05m-growth-ux.js — 0.2 "the show grows, the screen grows with it" (VISION-0.2.md)
//   1. Shapes lock: corners drag in MAP while unlocked; "Alignment done ✓" locks them.
//   2. Message strip + next-step line: the single next action, worked out from the show.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. SHAPES LOCK
// state.shapesLocked: true = MAP clicks only select (geometry protected, Hold W reaches
// through as before); false = corners drag in MAP like in BUILD. Old shows (no field) and the
// play / rehearsal / facade kits are locked; new blank shows start unlocked.
// ----------------------------------------------------------------------------
function areShapesLocked() {
  return state.shapesLocked !== false;
}

// Geometry may be edited right now in MAP / LIVE views: Hold W always reaches through; MAP also
// when shapes are unlocked (never under Show Lock). BUILD is always editable (not asked here).
function isGeomReach() {
  if (state.liveReachThrough) return true;
  return state.room === 'map' && !areShapesLocked() && !state.showLock;
}

function setShapesLocked(locked, opts = {}) {
  const next = !!locked;
  if (areShapesLocked() === next) { syncShapesLockUI(); return next; }
  state.shapesLocked = next;
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  syncShapesLockUI();
  if (typeof syncInspectorUI === 'function') syncInspectorUI();
  if (!opts.silent && typeof showToast === 'function') {
    showToast(next ? '🔒 Shapes locked — clicks only select. Hold W to nudge a corner, or unlock again.' : '🔓 Shapes free — drag corners onto your objects, then press Alignment done ✓');
  }
  return next;
}

function syncShapesLockUI() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('btn-shapes-lock');
  const done = document.getElementById('btn-align-done');
  const inMap = state.room === 'map';
  const locked = areShapesLocked();
  if (btn) {
    btn.hidden = !inMap;
    btn.textContent = locked ? '🔒 Shapes locked' : '🔓 Shapes free';
    btn.classList.toggle('unlocked', !locked);
    btn.setAttribute('aria-pressed', String(locked));
    btn.title = locked
      ? 'Shapes are locked: clicks select only, so nothing moves by accident. Click to unlock and drag corners (or hold W for one adjustment).'
      : 'Shapes are free: drag corners onto your objects. Click to lock them.';
  }
  if (done) done.hidden = !inMap || locked;
}

function initShapesLock() {
  if (typeof document === 'undefined' || state.isProjectorRole) return;
  document.getElementById('btn-shapes-lock')?.addEventListener('click', () => setShapesLocked(!areShapesLocked()));
  document.getElementById('btn-align-done')?.addEventListener('click', () => {
    setShapesLocked(true, { silent: true });
    if (typeof showToast === 'function') showToast('✓ Alignment done — shapes locked. Unlock any time with the padlock.');
  });
  syncShapesLockUI();
}

// ----------------------------------------------------------------------------
// 2. NEXT-STEP LINE
// One tip at a time, from the show itself (like Show Check, but about building, not readiness).
// A tip shows until it is done or skipped, then never again in this show (state.tipsDone, saved).
// Silent when tips are off (this browser), under Show Lock, and in LIVE once a cue is running.
// ----------------------------------------------------------------------------
const TIPS_OFF_KEY = 'chaoscathode_tips_off';

function areTipsOn() {
  try { return localStorage.getItem(TIPS_OFF_KEY) !== '1'; } catch (_) { return true; }
}

function setTipsOn(on) {
  try { if (on) localStorage.removeItem(TIPS_OFF_KEY); else localStorage.setItem(TIPS_OFF_KEY, '1'); } catch (_) {}
  syncNextStepUI(true);
  const b = typeof document !== 'undefined' ? document.getElementById('btn-tips-toggle') : null;
  if (b) b.textContent = `💡 Tips: ${on ? 'on' : 'off'}`;
}

function markTipDone(id) {
  if (!Array.isArray(state.tipsDone)) state.tipsDone = [];
  if (!state.tipsDone.includes(id)) {
    state.tipsDone.push(id);
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
  }
}

function getVisibleSurfaceCount() {
  return (state.surfaces || []).filter(s => s && s.visible !== false).length;
}

// Ordered rules: { id, show(): condition for the tip, done(): it has been achieved, text, label, run }
function getNextStepRules() {
  const outputOpen = typeof isAnyOutputWindowOpen === 'function' && isAnyOutputWindowOpen();
  const nSurf = getVisibleSurfaceCount();
  const nCues = (state.cues || []).length;
  return [
    {
      id: 'surface', done: () => nSurf > 0, show: () => nSurf === 0,
      text: 'Add a surface: drop a video or image onto the stage, or press ＋ Quad.', label: '＋ Quad',
      run: () => { if (state.room !== 'map' && typeof setStudioRoom === 'function') setStudioRoom('map'); document.getElementById('btn-add-quad')?.click(); }
    },
    {
      id: 'output', done: () => outputOpen, show: () => nSurf > 0 && !outputOpen,
      text: 'Open the projector window to see it on the wall (or keep sketching here).', label: 'Open output',
      run: () => { if (typeof launchProjectorWindow === 'function') launchProjectorWindow(); }
    },
    {
      id: 'align', done: () => areShapesLocked() && outputOpen, show: () => outputOpen && !areShapesLocked() && state.room === 'map',
      text: 'Drag the corners onto your objects, then press Alignment done ✓.', label: 'Alignment done ✓',
      run: () => setShapesLocked(true)
    },
    {
      id: 'cue', done: () => nCues > 0, show: () => nSurf > 0 && nCues === 0 && state.room !== 'build',
      text: 'Happy with this look? Store it as a cue, so you can come back to it.', label: 'Store cue',
      run: () => { if (typeof storeNewCue === 'function') storeNewCue(); if (typeof renderCueList === 'function') renderCueList(); }
    },
    {
      id: 'live', done: () => !!state._visitedLiveWithCues, show: () => nCues > 0 && state.room !== 'live',
      text: 'Run your cues: go to LIVE (F3) and press GO.', label: 'Go to LIVE',
      run: () => { if (typeof setStudioRoom === 'function') setStudioRoom('live'); }
    }
  ];
}

function getCurrentNextStep() {
  if (state.isProjectorRole || state.showLock || !areTipsOn()) return null;
  if (state.room === 'live' && state.activeCueId) return null;
  if (state.room === 'live' && (state.cues || []).length) state._visitedLiveWithCues = true;
  const done = new Set(state.tipsDone || []);
  for (const r of getNextStepRules()) {
    if (done.has(r.id)) continue;
    if (r.done()) { markTipDone(r.id); continue; }
    if (r.show()) return r;
  }
  return null;
}

let _nextStepSig = '';
function syncNextStepUI(force = false) {
  if (typeof document === 'undefined') return;
  const box = document.getElementById('next-step');
  if (!box) return;
  const step = getCurrentNextStep();
  const sig = step ? step.id + '|' + step.text : '';
  if (!force && sig === _nextStepSig) return;
  _nextStepSig = sig;
  box.hidden = !step;
  box._step = step;
  if (!step) return;
  const t = document.getElementById('next-step-text');
  const b = document.getElementById('btn-next-step-do');
  if (t) t.textContent = step.text;
  if (b) b.textContent = step.label;
}

function initNextStep() {
  if (typeof document === 'undefined' || state.isProjectorRole) return;
  const box = document.getElementById('next-step');
  document.getElementById('btn-next-step-do')?.addEventListener('click', () => {
    const st = box && box._step;
    if (st && typeof st.run === 'function') st.run();
    setTimeout(() => syncNextStepUI(true), 60);
  });
  document.getElementById('btn-next-step-skip')?.addEventListener('click', () => {
    const st = box && box._step;
    if (st) markTipDone(st.id);
    syncNextStepUI(true);
  });
  document.getElementById('btn-next-step-hide')?.addEventListener('click', () => {
    setTipsOn(false);
    if (typeof showToast === 'function') showToast('Tips hidden — turn them back on in the Show menu (💡 Tips).');
  });
  document.getElementById('btn-tips-toggle')?.addEventListener('click', () => setTipsOn(!areTipsOn()));
  const tb = document.getElementById('btn-tips-toggle');
  if (tb) tb.textContent = `💡 Tips: ${areTipsOn() ? 'on' : 'off'}`;
  setInterval(() => syncNextStepUI(false), 700);
  syncNextStepUI(true);
}

// Room-change messages: plain words, only the first three times per room (this browser).
const ROOM_TIP_KEY = 'chaoscathode_room_tips_v1';
function maybeShowRoomTip(room) {
  const labels = {
    build: 'BUILD — the real space: venue, screens, projectors and people.',
    map: 'MAP — put light on things: media, shapes, effects and cues.',
    live: 'LIVE — run the show: cues, mixing and followspots.'
  };
  if (!labels[room] || typeof showToast !== 'function') return;
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(ROOM_TIP_KEY) || '{}') || {}; } catch (_) {}
  if ((seen[room] || 0) >= 3) return;
  seen[room] = (seen[room] || 0) + 1;
  try { localStorage.setItem(ROOM_TIP_KEY, JSON.stringify(seen)); } catch (_) {}
  showToast(labels[room]);
}

// ----------------------------------------------------------------------------
// BOOT
// ----------------------------------------------------------------------------
function initGrowthUx() {
  if (state.isProjectorRole) return;
  initShapesLock();
  initNextStep();
}
