// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05m-growth-ux.js — 0.2 "the show grows, the screen grows with it" (VISION-0.2.md)
//   1. Shapes lock: corners drag in MAP while unlocked; "Alignment done ✓" locks them.
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
// BOOT
// ----------------------------------------------------------------------------
function initGrowthUx() {
  if (state.isProjectorRole) return;
  initShapesLock();
}
