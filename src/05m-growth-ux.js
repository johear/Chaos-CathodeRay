// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05m-growth-ux.js — 0.2 "the show grows, the screen grows with it" (VISION-0.2.md)
//   1. Shapes lock: corners drag in MAP while unlocked; "Alignment done ✓" locks them.
//   2. Message strip + next-step line: the single next action, worked out from the show.
//   3. Blank means blank: a new show has no surface, one projector, no person, no spot.
//   4. Show parts: panels appear when the show first contains them; ＋ Add to show; Show all tools.
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
// 3. BLANK MEANS BLANK
// A new show: no surface, one projector, no person, no spot, no set parts, shapes free, Output
// view. Things are added as the show grows (kits, ＋ Add to show). The demo keeps its full rig.
// ----------------------------------------------------------------------------
function newBlankShow() {
  if (typeof loadBlankScene === 'function') loadBlankScene();
  state.surfaces = [];
  state.selectedSurfaceId = null;
  state.selectedSurfaceIds = [];
  const mp = typeof ensureMultiProjectorState === 'function' ? ensureMultiProjectorState() : null;
  if (mp) {
    mp.enabled = false;
    mp.previewScreenIndex = 0;
    if (mp.screens.length > 1) mp.screens.splice(1);
    if (mp.screens[0]) mp.screens[0].enabled = true;
    mp.selectedScreenIndex = mp.screens[0] ? mp.screens[0].index : 1;
  }
  while (Array.isArray(state.spots) && state.spots.length && typeof removeSpotById === 'function') {
    if (removeSpotById(state.spots[0].id, { silent: true }) === false) break;
  }
  state.worldProps = [];
  state._worldPropsSeeded = true;
  state.selectedWorldPropId = null;
  state.venueParts = [];
  if (typeof markVenuePartsDirty === 'function') markVenuePartsDirty();
  state.workflow = null;
  state.shapesLocked = false;
  state.tipsDone = [];
  state.showParts = [];
  state.activeSelection = null;
  if (typeof markStagePlanDirty === 'function') markStagePlanDirty();
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof setRoomDefaultFeed === 'function') { setRoomDefaultFeed('map', 'stage'); setRoomDefaultFeed('live', 'stage'); }
  if (typeof renderSurfaceList === 'function') renderSurfaceList();
  if (typeof syncInspectorUI === 'function') syncInspectorUI();
  if (typeof syncWorkflowUI === 'function') syncWorkflowUI();
  if (typeof setStudioRoom === 'function') setStudioRoom('map', { silent: true });
  if (typeof restoreRoomFeedTab === 'function') restoreRoomFeedTab('map');
  if (typeof renderLivePerformanceDockUI === 'function') renderLivePerformanceDockUI();
  syncShapesLockUI();
  syncShowPartsUI(true);
  syncNextStepUI(true);
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return true;
}

// Kits that need more projectors add them (dormant slices; multi-projector output stays as is).
function ensureProjectorCount(n) {
  const mp = typeof ensureMultiProjectorState === 'function' ? ensureMultiProjectorState() : null;
  if (!mp || typeof createProjectorScreenSlice !== 'function') return 0;
  while (mp.screens.length < n) {
    const idx = mp.screens.length + 1;
    mp.screens.push(createProjectorScreenSlice(idx, { name: `Projector ${idx}` }));
  }
  return mp.screens.length;
}

// ----------------------------------------------------------------------------
// 4. SHOW PARTS
// state.showParts: parts this show contains (array, saved). null = older show = everything on.
// A part switches on the first time the show contains it and never switches itself off.
// Elements carry data-part="…"; body.part-off-<name> hides them (CSS). Show all tools (this
// browser) shows everything. Search turns a part on when a chosen tool belongs to it.
// ----------------------------------------------------------------------------
const SHOW_PARTS = {
  masks: { icon: '✂', label: 'Masks and shutters', blurb: 'Cut shapes out of the light, or trim its edges with straight blades.', keywords: /mask|shutter|blade|cutout/i },
  cues: { icon: '▶', label: 'Cues', blurb: 'Stored looks you can return to — then run them with GO in LIVE.', keywords: /\bcue|\bgo\b|playback|deck|crossfade|t-bar/i },
  followspot: { icon: '🎯', label: 'Followspot', blurb: 'A spot of light you steer live, or that follows a performer.', keywords: /spot/i },
  venue: { icon: '🏛', label: 'Venue in 3D', blurb: 'The real space: stage, walls, set pieces and people, in 3D.', keywords: /venue|3d|walk|pov|plan|set part|facade|elevation/i },
  projectors: { icon: '📽', label: 'More projectors', blurb: 'A second projector: a wider or brighter picture, or another object.', keywords: /projector|blend|multi-proj/i },
  mixer: { icon: '◎', label: 'Live mixer', blurb: 'Mix several sources live on the spatial radar.', keywords: /\bmix|radar|orb|constellation/i },
  lights: { icon: '💡', label: 'Lights (DMX)', blurb: 'Stage lights and hazers controlled over DMX or Art-Net.', keywords: /dmx|art-?net|fixture|hazer|pjlink|led/i },
  controllers: { icon: '🎹', label: 'Controllers', blurb: 'MIDI, OSC and gamepad controls for live performance.', keywords: /midi|osc|gamepad|controller|seat/i }
};
const SHOW_ALL_TOOLS_KEY = 'chaoscathode_show_all_tools';

function isShowAllTools() {
  try { return localStorage.getItem(SHOW_ALL_TOOLS_KEY) === '1'; } catch (_) { return false; }
}

// Parts the show contains right now (they switch on and stay on).
function detectShowParts() {
  const on = [];
  const mp = state.multiProjector || {};
  if ((state.masks || []).length || (state.surfaces || []).some(sf => sf && (sf.shutterL || sf.shutterR || sf.shutterT || sf.shutterB))) on.push('masks');
  if ((state.cues || []).length) on.push('cues');
  if ((state.spots || []).length) on.push('followspot');
  if ((state.venueParts || []).length || (state.worldProps || []).length || (state.workflow && state.workflow !== 'quick2d')) on.push('venue');
  if ((mp.screens || []).length > 1 || mp.enabled) on.push('projectors');
  if (typeof isMixbusOnStage === 'function' && isMixbusOnStage()) on.push('mixer');
  if ((state.dmxDevices || []).length) on.push('lights');
  if ((state.midi?.mappings || []).length) on.push('controllers');
  return on;
}

function getShowParts() {
  if (!Array.isArray(state.showParts)) return null;
  for (const p of detectShowParts()) if (!state.showParts.includes(p)) state.showParts.push(p);
  return state.showParts;
}

function isShowPartOn(part) {
  if (isShowAllTools()) return true;
  const parts = getShowParts();
  return !parts || parts.includes(part);
}

function enableShowParts(list, opts = {}) {
  if (!Array.isArray(state.showParts)) return;
  let added = false;
  for (const p of list) if (SHOW_PARTS[p] && !state.showParts.includes(p)) { state.showParts.push(p); added = true; }
  if (added && typeof scheduleAutosave === 'function') scheduleAutosave();
  syncShowPartsUI(true);
}

let _showPartsSig = '';
function syncShowPartsUI(force = false) {
  if (typeof document === 'undefined' || !document.body) return;
  const off = Object.keys(SHOW_PARTS).filter(p => !isShowPartOn(p));
  const sig = off.join(',');
  if (!force && sig === _showPartsSig) return;
  const changed = sig !== _showPartsSig;
  _showPartsSig = sig;
  for (const p of Object.keys(SHOW_PARTS)) document.body.classList.toggle(`part-off-${p}`, off.includes(p));
  renderAddToShowList();
  if (changed) {
    if (typeof syncOutputFeedTabsUI === 'function') syncOutputFeedTabsUI();
    // LIVE without the mixer shows the output, not the radar.
    if (state.room === 'live' && typeof setLayoutMode === 'function') {
      const want = isShowPartOn('mixer') ? 'mix' : 'output';
      if (state.layoutMode !== want && (state.layoutMode === 'mix' || state.layoutMode === 'output')) setLayoutMode(want);
    }
  }
}

// One-click starters: switch the part on and do its first useful step.
function addShowPart(part) {
  enableShowParts([part]);
  const say = (m) => { if (typeof showToast === 'function') showToast(m); };
  if (part === 'cues') {
    if (!(state.cues || []).length && typeof storeNewCue === 'function') { storeNewCue(); if (typeof renderCueList === 'function') renderCueList(); say('▶ Stored this look as cue 1 — run it with GO in LIVE.'); }
  } else if (part === 'followspot') {
    if (!(state.spots || []).length && typeof addSpotInstance === 'function') addSpotInstance();
    if (typeof renderLivePerformanceDockUI === 'function') renderLivePerformanceDockUI();
    say('🎯 Followspot added — pick it up and steer it in LIVE (F3).');
  } else if (part === 'venue') {
    if (state.room !== 'build' && typeof setOutputFeedTab === 'function') setOutputFeedTab('venue3d');
    say('🏛 Venue on — shape the real space in BUILD (F1); the 3D Venue view shows it.');
  } else if (part === 'projectors') {
    const n = (ensureMultiProjectorState().screens || []).length + 1;
    ensureProjectorCount(n);
    if (typeof markStagePlanDirty === 'function') markStagePlanDirty();
    if (typeof setStudioRoom === 'function') setStudioRoom('build');
    say(`📽 Projector ${n} added — place and aim it in BUILD, then 📐 Align by points.`);
  } else if (part === 'mixer') {
    say(state.room === 'live' ? '◎ Mixer on — drag sources toward the centre to mix them.' : '◎ Mixer on — open LIVE (F3) to mix sources on the radar.');
  } else if (part === 'lights') {
    if (typeof setStudioRoom === 'function') setStudioRoom('build');
    say('💡 Lights on — add a DMX light with +DMX in BUILD.');
  } else if (part === 'controllers') {
    say('🎹 Controllers on — press MIDI, then move a control and click what it should drive.');
  } else if (part === 'masks') {
    say('✂ Masks on — draw one with + Mask, or trim edges with the shutters.');
  }
  syncNextStepUI(true);
}

function renderAddToShowList() {
  const list = typeof document !== 'undefined' ? document.getElementById('add-part-list') : null;
  if (!list) return;
  const parts = getShowParts();
  const missing = Object.entries(SHOW_PARTS).filter(([k]) => parts && !parts.includes(k));
  list.innerHTML = missing.length
    ? missing.map(([k, p]) => `<button type="button" class="add-part-item" data-add-part="${k}"><span class="ap-icon" aria-hidden="true">${p.icon}</span><span class="ap-text"><strong>${escapeHtml(p.label)}</strong><span>${escapeHtml(p.blurb)}</span></span></button>`).join('')
    : '<div class="mono-dim" style="padding:6px 2px;">This show already has every part.</div>';
  const chk = document.getElementById('chk-show-all-tools');
  if (chk) chk.checked = isShowAllTools();
}

// Search: choosing a tool that belongs to a part that is off turns that part on.
function enablePartsForPaletteItem(item) {
  if (!item || !Array.isArray(state.showParts) || item.category === 'Rooms') return;
  const text = `${item.id || ''} ${item.title || ''} ${item.keywords || ''}`;
  const turnOn = Object.entries(SHOW_PARTS).filter(([k, p]) => !isShowPartOn(k) && p.keywords.test(text)).map(([k]) => k);
  if (!turnOn.length) return;
  enableShowParts(turnOn);
  if (typeof showToast === 'function') showToast(`Turned on: ${turnOn.map(k => SHOW_PARTS[k].label).join(', ')}`);
}

function initShowParts() {
  if (typeof document === 'undefined' || state.isProjectorRole) return;
  document.getElementById('add-part-list')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add-part]');
    if (!b) return;
    document.getElementById('pop-add-to-show')?.hidePopover?.();
    addShowPart(b.dataset.addPart);
  });
  document.getElementById('chk-show-all-tools')?.addEventListener('change', (e) => {
    try { if (e.target.checked) localStorage.setItem(SHOW_ALL_TOOLS_KEY, '1'); else localStorage.removeItem(SHOW_ALL_TOOLS_KEY); } catch (_) {}
    syncShowPartsUI(true);
  });
  setInterval(() => syncShowPartsUI(false), 700);
  syncShowPartsUI(true);
}

// ----------------------------------------------------------------------------
// BOOT
// ----------------------------------------------------------------------------
function initGrowthUx() {
  if (state.isProjectorRole) return;
  initShapesLock();
  initNextStep();
  initShowParts();
}
