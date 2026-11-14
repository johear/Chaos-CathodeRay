// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 07b-ux-studio-systems.js — Show-Safe UX Studio Systems (Proposals P1–P10):
//   P1. Glareshield Show Rail (#show-rail), 600ms Hold-to-Restore Blackout & FOH Night Mode
//   P2. Venue vs Show Cue Scope (#btn-cue-scope)
//   P4. Bitwig-Style Inline Modulator Accordion & Value Ownership Pills
//   P5. Live Synoptic Signal Strip (#synoptic-strip)
//   P6. Non-Modal 2D/3D Stage Rig Workspace (#rig-pane) w/ Throw Cone, Shift & DMX Handles
//   P9. Single Keymap Registry & Flash-to-Location Command Palette (/ or Cmd/Ctrl+K)
//   P10. Radial Pie Quasimodes (Hold A = Add Surface at Cursor, Hold S = Precision Pie)
// ============================================================================

// ----------------------------------------------------------------------------
// P1 & P2: GLARESHIELD SHOW RAIL, 600MS BLACKOUT HOLD & CUE RECORD SCOPE
// ----------------------------------------------------------------------------

let _blackoutHoldTimer = null;
let _blackoutHoldRaf = null;
let _blackoutHoldStartMs = 0;
const BLACKOUT_RESTORE_HOLD_MS = 600;

function applyFohAppearanceToDocument() {
  if (typeof document === 'undefined') return;
  const dim = clamp(Number(state.fohDim ?? 1.0), 0.38, 1.0);
  document.documentElement.style.setProperty('--foh-dim', dim.toFixed(3));
  document.body.classList.toggle('foh-night-mode', !!state.fohNightMode);
  const fohSlider = document.getElementById('ctrl-foh-dim');
  if (fohSlider) {
    setSliderValue(fohSlider, dim);
    fohSlider.setAttribute('aria-valuetext', `${Math.round(dim * 100)}% UI Brightness`);
  }
  const nightBtn = document.getElementById('btn-foh-night');
  if (nightBtn) {
    nightBtn.classList.toggle('active', !!state.fohNightMode);
    nightBtn.setAttribute('aria-pressed', String(!!state.fohNightMode));
  }
}

function syncCueScopeButtonUI() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('btn-cue-scope');
  if (!btn) return;
  const venueArmed = state.cueRecordScope === 'show_venue';
  btn.textContent = venueArmed ? 'Show+G' : 'Show';
  btn.classList.toggle('venue-armed', venueArmed);
  btn.setAttribute('aria-pressed', String(venueArmed));
  btn.title = venueArmed
    ? 'Cue Record Scope: Show + Geometry ARMED (New cues WILL recall warp/3D calibration)'
    : 'Cue Record Scope: Show Only — Protects room warp & 3D PnP calibration when storing cues (click to include Geometry)';
}

function toggleCueRecordScope(forceScope) {
  const next = (forceScope === 'show' || forceScope === 'show_venue')
    ? forceScope
    : (state.cueRecordScope === 'show_venue' ? 'show' : 'show_venue');
  state.cueRecordScope = next;
  syncCueScopeButtonUI();
  showToast(next === 'show_venue'
    ? '📐 Cue Scope: SHOW + GEOMETRY — New cues will recall surface warp & 3D pose'
    : '🛡 Cue Scope: SHOW ONLY — Room calibration protected on new cues');
  return next;
}

function syncShowRailUI() {
  if (typeof document === 'undefined') return;
  const cues = Array.isArray(state.cues) ? state.cues : [];
  const curIdx = cues.findIndex(c => c.id === state.activeCueId);
  const activeCue = curIdx >= 0 ? cues[curIdx] : cues[0];
  const liveEl = document.getElementById('rail-active-cue');
  const nextEl = document.getElementById('rail-pending-cue');
  if (liveEl) {
    if (activeCue) {
      const cNum = curIdx >= 0 ? curIdx + 1 : 1;
      liveEl.textContent = `C${cNum}`;
      liveEl.title = `Live Cue ${cNum}: ${activeCue.name || ''}`;
    } else {
      liveEl.textContent = '—';
    }
  }
  if (nextEl) {
    if (cues.length === 0) {
      nextEl.textContent = 'NO CUES';
      nextEl.classList.remove('end-of-list');
    } else if (curIdx >= 0 && curIdx < cues.length - 1) {
      const nxt = cues[curIdx + 1];
      const shortName = String(nxt.name || `C${curIdx + 2}`).slice(0, 7);
      nextEl.textContent = `▶ C${curIdx + 2}`;
      nextEl.title = `Next Cue: C${curIdx + 2} — ${shortName}`;
      nextEl.classList.remove('end-of-list');
    } else if (curIdx < 0 && cues.length > 0) {
      nextEl.textContent = '▶ C1';
      nextEl.classList.remove('end-of-list');
    } else {
      nextEl.textContent = 'END';
      nextEl.title = 'END OF CUE LIST — GO stops safely without wrapping to Cue 1';
      nextEl.classList.add('end-of-list');
    }
  }

  const dboBtn = document.getElementById('btn-blackout');
  if (dboBtn) {
    dboBtn.classList.toggle('active', !!state.blackout);
    dboBtn.setAttribute('aria-pressed', String(!!state.blackout));
  }

  const lockBtn = document.getElementById('btn-show-lock');
  if (lockBtn) {
    lockBtn.classList.toggle('active', !!state.showLock);
    lockBtn.setAttribute('aria-pressed', String(!!state.showLock));
    lockBtn.innerHTML = `${state.showLock ? '🔒' : '🔓'} <span class="rail-mini">⇧P</span>`;
  }

  const ecoBtn = document.getElementById('btn-eco-mode');
  if (ecoBtn) {
    ecoBtn.classList.toggle('active', !!state.ecoMode);
    ecoBtn.setAttribute('aria-pressed', String(!!state.ecoMode));
  }

  // Multi-Projector LED row on Glareshield
  const ledsEl = document.getElementById('rail-proj-leds');
  if (ledsEl) {
    const mp = state.multiProjector;
    if (mp && mp.enabled && Array.isArray(mp.screens) && mp.screens.length > 1) {
      const wins = typeof projectorWindowsMap !== "undefined" ? projectorWindowsMap : null;
      ledsEl.innerHTML = mp.screens.slice(0, 8).map(scr => {
        const wRef = wins && typeof wins.get === 'function' ? wins.get(scr.index) : null;
        const isLive = !!(wRef && !wRef.closed);
        const cls = isLive ? 'rail-proj-led live' : 'rail-proj-led armed';
        return `<span class="${cls}" title="P${scr.index} (${escapeHtml(scr.name || '')}): ${isLive ? 'Window Connected' : 'Armed'}"></span>`;
      }).join('');
    } else {
      ledsEl.innerHTML = '';
    }
  }

  applyFohAppearanceToDocument();
}

function clearBlackoutHoldProgress() {
  if (_blackoutHoldTimer) {
    clearTimeout(_blackoutHoldTimer);
    _blackoutHoldTimer = null;
  }
  if (_blackoutHoldRaf) {
    cancelAnimationFrame(_blackoutHoldRaf);
    _blackoutHoldRaf = null;
  }
  _blackoutHoldStartMs = 0;
  const bar = typeof document !== 'undefined' ? document.getElementById('blackout-hold-bar') : null;
  if (bar) bar.style.width = '0%';
}

function setBlackoutImmediate(flag, reasonToast = null) {
  clearBlackoutHoldProgress();
  state.blackout = !!flag;
  if (state.dboState) {
    state.dboState.active = !!flag;
    state.dboState.holdStartMs = 0;
  }
  if (typeof triggerPhysicalDboShutters === 'function') {
    triggerPhysicalDboShutters(!!flag);
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  syncShowRailUI();
  if (reasonToast) showToast(reasonToast);
}

function beginBlackoutPress(instantBypass = false) {
  // Asymmetric theatrical safety + Two-Stage Physical Shutter Pre-Open:
  //   1. Live -> Blackout is ALWAYS 0ms immediate panic cut + closes linked PJLink/DMX shutters!
  //   2. Blackout -> Live requires 600ms intentional hold, pre-opening physical shutters at (600ms - measuredShutterMs) while WebGL is 0.0 black!
  if (!state.blackout) {
    setBlackoutImmediate(true, '⬛ DBO BLACKOUT ENGAGED — Hold B (600ms) or Shift+B to restore Stage');
    return;
  }
  if (instantBypass) {
    setBlackoutImmediate(false, '✦ Stage Output Restored (Shift Override)');
    return;
  }
  if (_blackoutHoldTimer) return;
  _blackoutHoldStartMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (state.dboState) state.dboState.holdStartMs = _blackoutHoldStartMs;
  if (typeof schedulePreOpenDboShutters === 'function') {
    schedulePreOpenDboShutters(BLACKOUT_RESTORE_HOLD_MS);
  }
  const bar = typeof document !== 'undefined' ? document.getElementById('blackout-hold-bar') : null;

  const tickBar = () => {
    if (!_blackoutHoldTimer) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const pct = clamp(((now - _blackoutHoldStartMs) / BLACKOUT_RESTORE_HOLD_MS) * 100, 0, 100);
    if (bar) bar.style.width = `${pct.toFixed(1)}%`;
    if (pct < 100 && typeof requestAnimationFrame === 'function') {
      _blackoutHoldRaf = requestAnimationFrame(tickBar);
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    _blackoutHoldRaf = requestAnimationFrame(tickBar);
  }
  _blackoutHoldTimer = setTimeout(() => {
    setBlackoutImmediate(false, '✦ Stage Output Restored');
  }, BLACKOUT_RESTORE_HOLD_MS);
}

function cancelOrFinishBlackoutPress() {
  if (!_blackoutHoldTimer) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = now - _blackoutHoldStartMs;
  clearBlackoutHoldProgress();
  if (state.blackout && elapsed < BLACKOUT_RESTORE_HOLD_MS) {
    if (typeof abortPreOpenDboShutters === 'function') {
      abortPreOpenDboShutters();
    }
    showToast('⬛ Still in Blackout — Hold B / DBO for 0.6s (or Shift+B) to restore live Stage');
  }
}

// ----------------------------------------------------------------------------
// P4: INLINE MODULATOR ACCORDION & PARAMETER PILLS (Stay in Context!)
// ----------------------------------------------------------------------------

function openInlineModDrawerForTarget(targetKey) {
  if (!targetKey) return;
  if (!state.inlineModOpenKeys) state.inlineModOpenKeys = {};
  state.inlineModOpenKeys[targetKey] = true;
  if (typeof syncModulatedSliderHighlights === 'function') {
    syncModulatedSliderHighlights();
  }
}

function syncInlineModBadgeForSlider(sl, desc, mod) {
  if (!sl || !desc) return;
  const row = sl.closest ? sl.closest('.ctrl-row') : sl.parentElement;
  if (!row || !row.classList || !row.classList.contains('ctrl-row')) return;

  let pill = row.querySelector(':scope > .inline-mod-pill');
  let drawer = row.nextElementSibling;
  const hasDrawer = !!(drawer && drawer.classList && drawer.classList.contains('inline-mod-drawer') && drawer.dataset.targetKey === desc.targetKey);

  if (!mod) {
    if (pill) pill.remove();
    if (hasDrawer) drawer.remove();
    return;
  }

  const kindGlyph = mod.kind === 'audio' ? '♫' : (mod.kind === 'seq' ? '▦' : '∿');
  const shortTag = mod.kind === 'audio'
    ? `${kindGlyph} ${(mod.audioBand || 'sub').toUpperCase()}`
    : (mod.kind === 'seq' ? `${kindGlyph} SEQ` : `${kindGlyph} ${(mod.waveform || 'sine').slice(0, 3).toUpperCase()}`);

  if (!pill) {
    pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'inline-mod-pill';
    pill.title = 'Toggle Inline Modulator Controls';
    pill.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!state.inlineModOpenKeys) state.inlineModOpenKeys = {};
      state.inlineModOpenKeys[desc.targetKey] = !state.inlineModOpenKeys[desc.targetKey];
      syncInlineModBadgeForSlider(sl, desc, mod);
    });
    row.appendChild(pill);
  }
  if (pill.textContent !== shortTag) pill.textContent = shortTag;
  const isOpen = !!(state.inlineModOpenKeys && state.inlineModOpenKeys[desc.targetKey]);
  pill.classList.toggle('open', isOpen);
  pill.setAttribute('aria-expanded', String(isOpen));

  if (!isOpen) {
    if (hasDrawer) drawer.remove();
    return;
  }

  if (!hasDrawer) {
    drawer = document.createElement('div');
    drawer.className = 'inline-mod-drawer';
    drawer.dataset.targetKey = desc.targetKey;
    drawer.dataset.modId = mod.id;
    row.insertAdjacentElement('afterend', drawer);
    populateInlineModDrawerDOM(drawer, sl, desc, mod);
  } else if (drawer.dataset.modId !== mod.id || drawer.dataset.modKind !== mod.kind) {
    drawer.dataset.modId = mod.id;
    populateInlineModDrawerDOM(drawer, sl, desc, mod);
  }
}

function populateInlineModDrawerDOM(drawer, sl, desc, mod) {
  drawer.dataset.modKind = mod.kind;
  const step = sl.step && sl.step !== 'any' ? sl.step : '0.01';
  const modeFieldHtml = mod.kind === 'audio'
    ? `<label class="imod-field"><span>Band</span>
         <select class="studio-select imod-sel-mode" aria-label="Audio Frequency Band">
           ${['sub', 'low', 'mid', 'high', 'rms', 'beat'].map(b => `<option value="${b}"${mod.audioBand === b ? ' selected' : ''}>${b.toUpperCase()}</option>`).join('')}
         </select>
       </label>
       <label class="imod-field"><span>Gain</span>
         <input type="number" class="studio-input imod-inp-rate" min="0.1" max="4" step="0.1" value="${Number(mod.gain ?? 1.35).toFixed(2)}" aria-label="Audio Gain" />
       </label>`
    : (mod.kind === 'seq'
      ? `<label class="imod-field"><span>Step Div</span>
           <select class="studio-select imod-sel-mode" aria-label="Sequencer Beat Division">
             ${[['0.25', '1/16'], ['0.5', '1/8'], ['1', '1/4'], ['2', '1/2']].map(([v, lbl]) => `<option value="${v}"${Number(mod.stepDiv) === Number(v) ? ' selected' : ''}>${lbl}</option>`).join('')}
           </select>
         </label>
         <label class="imod-field"><span>Glide</span>
           <input type="number" class="studio-input imod-inp-rate" min="0" max="0.95" step="0.05" value="${Number(mod.glide ?? 0.28).toFixed(2)}" aria-label="Sequencer Glide" />
         </label>`
      : `<label class="imod-field"><span>Wave</span>
           <select class="studio-select imod-sel-mode" aria-label="LFO Waveform">
             ${['sine', 'triangle', 'saw', 'square', 'perlin', 'beat'].map(w => `<option value="${w}"${mod.waveform === w ? ' selected' : ''}>${w}</option>`).join('')}
           </select>
         </label>
         <label class="imod-field"><span>Rate Hz</span>
           <input type="number" class="studio-input imod-inp-rate" min="0.02" max="16" step="0.05" value="${Number(mod.rate ?? 0.45).toFixed(2)}" aria-label="LFO Rate Hz" />
         </label>`);

  drawer.innerHTML = `
    <div class="imod-grid">
      ${modeFieldHtml}
      <label class="imod-field"><span>Min</span>
        <input type="number" class="studio-input imod-inp-min" min="${desc.min}" max="${desc.max}" step="${step}" value="${Number(mod.minVal).toFixed(2)}" aria-label="Modulator Minimum" />
      </label>
      <label class="imod-field"><span>Max</span>
        <input type="number" class="studio-input imod-inp-max" min="${desc.min}" max="${desc.max}" step="${step}" value="${Number(mod.maxVal).toFixed(2)}" aria-label="Modulator Maximum" />
      </label>
      <div class="imod-actions">
        <button type="button" class="btn imod-btn-matrix" title="Open Full Modulation Matrix">↗</button>
        <button type="button" class="btn danger imod-btn-del" title="Remove Modulator">✕</button>
      </div>
    </div>
  `;

  drawer.querySelector('.imod-sel-mode')?.addEventListener('change', (e) => {
    if (mod.kind === 'audio') mod.audioBand = e.target.value;
    else if (mod.kind === 'seq') mod.stepDiv = parseFloat(e.target.value) || 0.5;
    else mod.waveform = e.target.value;
    syncInlineModBadgeForSlider(sl, desc, mod);
    if (typeof renderModulatorsListUI === 'function') renderModulatorsListUI();
    scheduleAutosave();
  });
  drawer.querySelector('.imod-inp-rate')?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    if (mod.kind === 'audio') mod.gain = clamp(v, 0.1, 4.0);
    else if (mod.kind === 'seq') mod.glide = clamp(v, 0, 0.95);
    else mod.rate = clamp(v, 0.02, 16.0);
    if (typeof renderModulatorsListUI === 'function') renderModulatorsListUI();
    scheduleAutosave();
  });
  drawer.querySelector('.imod-inp-min')?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    mod.minVal = clamp(v, desc.min, desc.max);
    syncModulatedSliderHighlights();
    if (typeof renderModulatorsListUI === 'function') renderModulatorsListUI();
    scheduleAutosave();
  });
  drawer.querySelector('.imod-inp-max')?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    mod.maxVal = clamp(v, desc.min, desc.max);
    syncModulatedSliderHighlights();
    if (typeof renderModulatorsListUI === 'function') renderModulatorsListUI();
    scheduleAutosave();
  });
  drawer.querySelector('.imod-btn-matrix')?.addEventListener('click', () => {
    switchInspTab('mod');
  });
  drawer.querySelector('.imod-btn-del')?.addEventListener('click', () => {
    if (state.inlineModOpenKeys) delete state.inlineModOpenKeys[desc.targetKey];
    removeModulator(mod.id);
  });
}

// ----------------------------------------------------------------------------
// P5: LIVE SYNOPTIC SIGNAL STRIP (#synoptic-strip)
// ----------------------------------------------------------------------------

function flashLocateElement(el, opts = {}) {
  if (!el || typeof document === 'undefined') return;
  let parent = el;
  while (parent && parent !== document.body) {
    if (parent.tagName === 'DETAILS' && !parent.open) {
      parent.open = true;
    }
    parent = parent.parentElement;
  }
  if (el.tagName === 'DETAILS' && opts.openDetails !== false) {
    el.open = true;
  }
  if (typeof el.scrollIntoView === 'function') {
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { el.scrollIntoView(); }
  }
  el.classList.remove('flash-locate-ring');
  void el.offsetWidth;
  el.classList.add('flash-locate-ring');
  setTimeout(() => el.classList.remove('flash-locate-ring'), 1650);
  if (opts.focus && typeof el.focus === 'function') {
    try { el.focus({ preventScroll: true }); } catch (_) {}
  }
}

function renderSynopticStripUI() {
  if (typeof document === 'undefined') return;
  const strip = document.getElementById('synoptic-strip');
  if (!strip) return;

  let nodes = [];
  if (state.inspTab === 'mod') {
    const aud = state.audio || {};
    const diag = typeof getAudioSourceDiagnosticStatus === 'function'
      ? getAudioSourceDiagnosticStatus()
      : { tone: aud.enabled ? 'ok' : 'muted', text: '' };
    const modCount = Array.isArray(state.modulators) ? state.modulators.filter(m => m && m.enabled !== false).length : 0;
    const midiCount = Array.isArray(state.midi?.mappings) ? state.midi.mappings.length : 0;
    const oscLive = !!(state.osc && state.osc.connected);

    nodes = [
      {
        id: 'syn-aud-src',
        label: `♫ ${(aud.sourceMode || 'synth').toUpperCase()}`,
        state: !aud.enabled ? 'bypassed' : (diag.tone === 'warn' ? 'warn' : 'active'),
        title: diag.text || 'Audio Source',
        onClick: () => { switchInspTab('mod'); flashLocateElement(document.getElementById('sel-audio-mode')); }
      },
      {
        id: 'syn-aud-gain',
        label: `Gain ${(aud.gain ?? 1).toFixed(1)}×`,
        state: aud.enabled ? 'active' : 'bypassed',
        title: 'Audio Input Gain',
        onClick: () => { switchInspTab('mod'); flashLocateElement(document.getElementById('ctrl-audio-gain')); }
      },
      {
        id: 'syn-aud-fft',
        label: aud.enabled ? `${Math.round(aud.bpm || 120)} BPM` : 'FFT Off',
        state: aud.enabled ? 'active' : 'bypassed',
        title: 'Multi-Band FFT & Beat Detector',
        onClick: () => { switchInspTab('mod'); flashLocateElement(document.getElementById('btn-audio-enable')); }
      },
      {
        id: 'syn-mods',
        label: `${modCount} Mod${modCount === 1 ? '' : 's'}`,
        state: modCount > 0 ? 'active' : 'bypassed',
        title: 'Active LFO / Audio / Step Modulators',
        onClick: () => { switchInspTab('mod'); flashLocateElement(document.getElementById('btn-add-mod')); }
      },
      {
        id: 'syn-io',
        label: oscLive ? `OSC+${midiCount}M` : `MIDI(${midiCount})`,
        state: (oscLive || midiCount > 0 || state.midi?.learnArmed) ? 'active' : 'bypassed',
        title: 'WebMIDI & OSC Control Routing',
        onClick: () => { switchInspTab('mod'); flashLocateElement(document.getElementById('btn-midi-learn')); }
      }
    ];
  } else {
    const sel = typeof getSelectedSurface === 'function' ? getSelectedSurface() : null;
    const src = sel ? getSourceById(sel.sourceId) : getSourceById(state.activeSourceId);
    const hasShutter = !!(sel && Math.max(sel.shutterL || 0, sel.shutterR || 0, sel.shutterT || 0, sel.shutterB || 0) > 0.002);
    const hasKey = !!(sel && sel.keyMode && sel.keyMode !== 'none');
    const fxCount = (sel && Array.isArray(sel.fxChain) ? sel.fxChain.filter(f => f && f.enabled !== false).length : 0) +
      (Array.isArray(state.masterFxChain) ? state.masterFxChain.filter(f => f && f.enabled !== false).length : 0);
    const maskCount = Array.isArray(state.masks) ? state.masks.filter(m => m && m.visible !== false).length : 0;
    const spotOn = !!(state.followspot && state.followspot.mode !== 'off');
    const mpOn = !!(state.multiProjector && state.multiProjector.enabled);
    const dmxOn = !!(state.pixelMapper && state.pixelMapper.enabled);

    nodes = [
      {
        id: 'syn-src',
        label: src ? String(src.name || 'Src').slice(0, 8) : 'No Src',
        state: !src ? 'bypassed' : (src.offline ? 'warn' : 'active'),
        title: src ? `Source: ${src.name}` : 'Media Source',
        onClick: () => flashLocateElement(document.getElementById('media-section'))
      },
      {
        id: 'syn-surf',
        label: sel ? (sel.type === 'mesh3d' ? '🧊 3D' : `▱ ${sel.type.slice(0, 4)}`) : '▱ Surf',
        state: sel && sel.visible !== false ? 'active' : 'bypassed',
        title: sel ? `Surface: ${sel.name}` : 'Selected Surface',
        onClick: () => { switchInspTab('surface'); flashLocateElement(document.getElementById('inp-surf-name')); }
      },
      {
        id: 'syn-shutter',
        label: hasShutter ? '◫ Cut' : (hasKey ? 'Key' : '◫ Open'),
        state: (hasShutter || hasKey) ? 'active' : 'bypassed',
        title: '4-Blade Framing Shutters & Luma/Chroma Keyer',
        onClick: () => { switchInspTab('surface'); flashLocateElement(document.getElementById('disc-framing-shutters')); }
      },
      {
        id: 'syn-fx',
        label: fxCount > 0 ? `FX(${fxCount})` : 'FX',
        state: fxCount > 0 ? 'active' : 'bypassed',
        title: 'Surface & Master GPU Post-FX Chain',
        onClick: () => { switchInspTab('surface'); flashLocateElement(document.getElementById('card-surf-fx')); }
      },
      {
        id: 'syn-mask',
        label: maskCount > 0 ? `✂(${maskCount})` : '✂ 0',
        state: maskCount > 0 ? 'active' : 'bypassed',
        title: 'Polygon & Bezier Cutout Masks',
        onClick: () => { switchInspTab('mask'); flashLocateElement(document.getElementById('btn-mask-edit-stage')); }
      },
      {
        id: 'syn-spot',
        label: spotOn ? '🎯 On' : '🎯 Off',
        state: spotOn ? 'active' : 'bypassed',
        title: 'Cosmic Cloud Followspot',
        onClick: () => { switchInspTab('spot'); flashLocateElement(document.getElementById('sel-spot-mode')); }
      },
      {
        id: 'syn-out',
        label: state.blackout ? '⬛ DBO' : (mpOn ? `P×${state.multiProjector.screens.length}` : (dmxOn ? 'DMX' : 'Stage')),
        state: state.blackout ? 'warn' : 'active',
        title: 'Master Output, Multi-Projector & DMX Routing',
        onClick: () => { switchInspTab('output'); flashLocateElement(document.getElementById('disc-multiproj')); }
      }
    ];
  }

  strip.innerHTML = '';
  nodes.forEach((n, idx) => {
    if (idx > 0) {
      const wire = document.createElement('span');
      wire.className = 'syn-wire';
      wire.setAttribute('aria-hidden', 'true');
      wire.textContent = '→';
      strip.appendChild(wire);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `syn-node ${n.state}`;
    btn.textContent = n.label;
    btn.title = n.title;
    btn.addEventListener('click', n.onClick);
    strip.appendChild(btn);
  });
}

// ----------------------------------------------------------------------------
// P6: NON-MODAL 2D/3D STAGE RIG WORKSPACE (#rig-pane beside Live Stage!)
// ----------------------------------------------------------------------------

let _rigDragState = null;

function commitRigPhysicalChange() {
  const mp = ensureMultiProjectorState();
  if (typeof solveStagePlanOpticalField === 'function') {
    solveStagePlanOpticalField(mp, true);
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  syncRigWorkspaceUI();
  if (typeof syncStagePlanDialogUI === 'function') syncStagePlanDialogUI();
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  if (typeof syncShowRailUI === 'function') syncShowRailUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

function renderRigWorkspaceCanvas() {
  if (typeof document === 'undefined' || state.layoutMode !== 'rig') return;
  const cvs = document.getElementById('rig-canvas');
  if (!cvs || typeof renderStagePlanCanvas !== 'function') return;
  renderStagePlanCanvas(cvs);

  // Pillar 3: Translucent Cyan GhostRig Launchpad Preview on Hover in 1 · WORLD
  if (state.hoverGhostPreset && typeof WORLD_GHOST_PRESETS !== 'undefined' && WORLD_GHOST_PRESETS[state.hoverGhostPreset]) {
    const preset = WORLD_GHOST_PRESETS[state.hoverGhostPreset];
    const ctx = cvs.getContext('2d');
    const xf = cvs._planTransform;
    if (ctx && xf && xf.scale) {
      ctx.save();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = 'rgba(111, 211, 255, 0.85)';
      ctx.fillStyle = 'rgba(111, 211, 255, 0.12)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      const gw = (preset.stageW || preset.stage?.widthM || 8) * xf.scale;
      const gd = (preset.stageD || preset.stage?.depthM || 6) * xf.scale;
      ctx.strokeRect(xf.cx - gw * 0.5, xf.cz - gd * 0.5, gw, gd);
      for (const gp of (preset.projectors || [])) {
        const px = xf.cx + (gp.posM?.[0] || 0) * xf.scale;
        const pz = xf.cz + (gp.posM?.[2] || 3.5) * xf.scale;
        const ax = xf.cx + (gp.aimM?.[0] || 0) * xf.scale;
        const az = xf.cz + (gp.aimM?.[2] || -2.0) * xf.scale;
        ctx.beginPath();
        ctx.moveTo(px, pz);
        ctx.lineTo(ax - gw * 0.22, az);
        ctx.lineTo(ax + gw * 0.22, az);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(px, pz, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([5, 4]);
      }
      ctx.setLineDash([]);
      ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = '#6fd3ff';
      ctx.fillText(`GHOST PREVIEW: ${preset.label} (Click to Stamp Editable Nodes)`, 12, 20);
      ctx.restore();
    }
  }
}

function syncRigWorkspaceUI() {
  if (typeof document === 'undefined') return;
  const mp = ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  if (!sp) return;

  if (typeof syncVenueHudUI === 'function') syncVenueHudUI();

  const chkSolver = document.getElementById('chk-rig-solver');
  if (chkSolver) chkSolver.checked = !!sp.enabled;

  const selPreset = document.getElementById('sel-rig-preset');
  if (selPreset && sp.presetId && STAGE_PLAN_PRESETS[sp.presetId]) {
    selPreset.value = sp.presetId;
  }

  const btnPrev = document.getElementById('btn-rig-preview-sel');
  if (btnPrev) {
    btnPrev.classList.toggle('active', mp.previewScreenIndex > 0 && mp.previewScreenIndex === mp.selectedScreenIndex);
  }

  // Contextual bottom bar inside #rig-viewport
  const bar = document.getElementById('rig-inspector-bar');
  if (bar) {
    const selScr = typeof getSelectedProjectorScreen === 'function' ? getSelectedProjectorScreen() : mp.screens[0];
    const selWs = typeof getSelectedWorldScreen === 'function' ? getSelectedWorldScreen() : null;
    const selSurf = typeof getSelectedSurface === 'function' ? getSelectedSurface() : null;
    if (state.rigSelectedKind === 'world_screen' && selWs) {
      bar.innerHTML = `
        <span class="rig-chip">🖥 ${escapeHtml(selWs.name)}</span>
        <span class="rig-meta">${selWs.widthM.toFixed(2)}×${selWs.heightM.toFixed(2)}m • Pos (${selWs.posM[0].toFixed(1)}, ${selWs.posM[1].toFixed(1)}, ${selWs.posM[2].toFixed(1)}) • Yaw ${(selWs.yawDeg || 0).toFixed(0)}°</span>
        <button type="button" class="btn danger" id="rig-bar-del-ws" style="padding:1px 6px;font-size:9px;">🗑 Delete Screen</button>
      `;
      bar.querySelector('#rig-bar-del-ws')?.addEventListener('click', () => removeWorldScreen(selWs.id));
    } else if (state.rigSelectedKind === 'floorplan' && state.floorplan?.dataUrl) {
      const fp = state.floorplan;
      bar.innerHTML = `
        <span class="rig-chip cyan">🗺 ${escapeHtml(fp.name || 'Floorplan')}</span>
        <span class="rig-meta">Width ${fp.widthM.toFixed(2)}m • Off (${fp.offsetX.toFixed(1)}, ${fp.offsetZ.toFixed(1)}) • Rot ${fp.rotDeg.toFixed(0)}°</span>
        <div style="display:flex;gap:4px;">
          <button type="button" class="btn ${fp.calibMode ? 'warm active' : ''}" id="rig-bar-fp-cal" style="padding:1px 6px;font-size:9px;">📏 2-Pt Scale</button>
          <button type="button" class="btn danger" id="rig-bar-fp-del" style="padding:1px 6px;font-size:9px;">🗑 Clear</button>
        </div>
      `;
      bar.querySelector('#rig-bar-fp-cal')?.addEventListener('click', () => toggleFloorplanCalibMode());
      bar.querySelector('#rig-bar-fp-del')?.addEventListener('click', () => clearFloorplan());
    } else if (state.rigSelectedKind === 'mesh3d' && selSurf && selSurf.type === 'mesh3d') {
      const p3 = selSurf.pos3d || [0, 0, 0];
      bar.innerHTML = `
        <span class="rig-chip">🧊 ${escapeHtml(selSurf.name)}</span>
        <span class="rig-meta">Pos (${p3[0].toFixed(2)}, ${p3[1].toFixed(2)}, ${p3[2].toFixed(2)}) • Scale ${(selSurf.scale3d?.[0] || 1).toFixed(2)}</span>
        <button type="button" class="btn danger" id="rig-bar-del-3d" style="padding:1px 6px;font-size:9px;">🗑 Delete 3D</button>
      `;
      bar.querySelector('#rig-bar-del-3d')?.addEventListener('click', () => {
        setActiveSelection('surface', selSurf.id, selSurf.name);
        deleteActiveSelection();
      });
    } else if (state.rigSelectedKind === 'dmx' && state.pixelMapper?.fixtures?.length) {
      const fix = getSelectedDmxFixture() || state.pixelMapper.fixtures[0];
      bar.innerHTML = `
        <span class="rig-chip warn">💡 ${escapeHtml(fix.name)}</span>
        <span class="rig-meta">Uni ${fix.universe} • Ch ${fix.startChannel} • ${fix.type.toUpperCase()}</span>
        <button type="button" class="btn danger" id="rig-bar-del-dmx" style="padding:1px 6px;font-size:9px;">🗑 Delete LED</button>
      `;
      bar.querySelector('#rig-bar-del-dmx')?.addEventListener('click', () => {
        setActiveSelection('led_fixture', fix.id, fix.name);
        deleteActiveSelection();
      });
    } else if (selScr) {
      ensureScreenPhysicalPose(selScr, selScr.index, Math.max(1, mp.screens.length), sp.venue);
      if (selScr.yawDeg === undefined && typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(selScr);
      bar.innerHTML = `
        <span class="rig-chip">📽 P${selScr.index} ${escapeHtml(selScr.name || '')}</span>
        <span class="rig-meta">Pos (${selScr.posM[0].toFixed(1)}, ${selScr.posM[1].toFixed(1)}m, ${selScr.posM[2].toFixed(1)}) • Yaw ${(selScr.yawDeg || 0).toFixed(0)}° Pitch ${(selScr.pitchDeg || 0).toFixed(0)}° • Throw <strong>${selScr.throwRatio.toFixed(2)}:1</strong></span>
        <button type="button" class="btn danger" id="rig-bar-del-proj" style="padding:1px 6px;font-size:9px;">🗑 Delete P${selScr.index}</button>
      `;
      bar.querySelector('#rig-bar-del-proj')?.addEventListener('click', () => {
        setActiveSelection('projector', String(selScr.index), `P${selScr.index}`);
        deleteActiveSelection();
      });
    } else {
      bar.innerHTML = `
        <span class="rig-chip">🌍 World Empty / Ready</span>
        <span class="rig-meta">Use <strong>+ Screen</strong>, <strong>+ Proj</strong>, <strong>+ 3D</strong>, or <strong>🗺 Floorplan</strong> to build your venue</span>
      `;
    }
  }

  if (state.layoutMode === 'rig') {
    renderRigWorkspaceCanvas();
  }
}

function pointInPoly2D(px, py, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / Math.max(1e-7, yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSeg2D(px, py, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  if (l2 < 1e-4) return Math.hypot(px - a[0], py - a[1]);
  const t = clamp(((px - a[0]) * vx + (py - a[1]) * vy) / l2, 0, 1);
  return Math.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy));
}

function initRigWorkspaceControls() {
  if (typeof document === 'undefined') return;
  const cvs = document.getElementById('rig-canvas');
  if (!cvs) return;

  // Plan / 3D / Walk / POV / six sides live in the shared view bar (#venue-hud, 05h).

  document.getElementById('chk-rig-solver')?.addEventListener('change', (e) => {
    pushUndoCheckpoint('Toggle Constant-Brightness Rig Solver');
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    sp.enabled = !!e.target.checked;
    if (sp.enabled && mp.screens.length > 0) {
      mp.enabled = true;
      mp.screens.forEach(s => {
        s.cropX = 0; s.cropY = 0; s.cropW = 1; s.cropH = 1;
        s.blendL = 0; s.blendR = 0; s.blendT = 0; s.blendB = 0;
      });
    }
    commitRigPhysicalChange();
  });

  document.getElementById('btn-rig-load-preset')?.addEventListener('click', () => {
    const presetId = document.getElementById('sel-rig-preset')?.value || 'opposing_wings_constant';
    pushUndoCheckpoint(`Load Stage Rig: ${presetId}`);
    if (typeof applyStagePlanPreset === 'function') {
      applyStagePlanPreset(presetId, true);
    }
    syncRigWorkspaceUI();
    showToast(`◪ Loaded Physical Stage Rig: ${STAGE_PLAN_PRESETS[presetId]?.label || presetId}`);
  });

  document.getElementById('btn-rig-add-proj')?.addEventListener('click', () => {
    pushUndoCheckpoint('Add Physical Projector');
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    const created = addCustomProjectorScreen({
      name: `Projector ${mp.screens.length + 1}`,
      cropX: 0, cropY: 0, cropW: 1, cropH: 1,
      throwRatio: 0.95,
      lumens: 9000
    });
    if (created) {
      if (typeof ensureProjectorPjLinkMeta === 'function') ensureProjectorPjLinkMeta(created);
      if (typeof autoAimProjectorAtWorldScreen === 'function') autoAimProjectorAtWorldScreen(created);
      mp.enabled = true;
      sp.enabled = true;
      state.rigSelectedKind = 'projector';
      setActiveSelection('projector', String(created.index), `P${created.index} ${created.name}`);
      commitRigPhysicalChange();
      renderWorldDocksUI();
      showToast(`Added ${created.name} (${mp.screens.length} projectors in rig)`);
    }
  });

  document.getElementById('btn-rig-preview-sel')?.addEventListener('click', () => {
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    if (mp.screens.length === 0) return;
    mp.enabled = true;
    sp.enabled = true;
    mp.previewScreenIndex = mp.previewScreenIndex === mp.selectedScreenIndex ? 0 : mp.selectedScreenIndex;
    commitRigPhysicalChange();
    showToast(mp.previewScreenIndex > 0
      ? `👁 Soloing Projector P${mp.previewScreenIndex} on Live Stage`
      : '👁 Showing Full Combined Stage');
  });

  document.getElementById('btn-rig-launch-all')?.addEventListener('click', () => {
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    mp.enabled = true;
    sp.enabled = true;
    commitRigPhysicalChange();
    launchAllProjectorScreens();
  });

  cvs.addEventListener('contextmenu', (e) => e.preventDefault());

  // Rich Direct-Manipulation Handles on #rig-canvas (2D Plan + 3D World Gizmo, Screens, Projectors, Aim, 3D Objects, Floorplan)
  cvs.addEventListener('pointerdown', (e) => {
    const rect = cvs.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    const xf = cvs._planTransform;
    if (!xf || my > xf.mapH) return;

    cvs.setPointerCapture(e.pointerId);

    // 1. Floorplan 2-Point Scale Ruler clicks in 2D Plan
    if (xf.mode === 'plan2d' && state.floorplan?.calibMode) {
      const wx = (mx - xf.cx) / Math.max(1, xf.scale);
      const wz = (my - xf.cz) / Math.max(1, xf.scale);
      state.floorplan.calibPts.push([wx, wz]);
      if (state.floorplan.calibPts.length >= 2) {
        const [ptA, ptB] = state.floorplan.calibPts;
        let ans = '5.0';
        if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
          const pr = window.prompt('Enter real-world distance between Point A and Point B (meters):', '5.0');
          if (pr === null) {
            state.floorplan.calibMode = false;
            state.floorplan.calibPts = [];
            renderRigWorkspaceCanvas();
            return;
          }
          ans = pr;
        }
        applyFloorplanTwoPointScale(ptA, ptB, parseFloat(ans) || 5.0);
      } else {
        renderRigWorkspaceCanvas();
      }
      return;
    }

    // Lines look: click an underlined dimension to type an exact size.
    if (xf.mode === 'orbit3d' && e.button === 0 && typeof getVenueViewLook === 'function'
      && getVenueViewLook(ensureStagePlanState()) === 'lines' && tryBeginLinesDimensionEdit(mx, my, cvs)) {
      return;
    }

    // Point calibration in the 3D rig: left clicks add pins.
    if (xf.mode === 'orbit3d' && state.projAlign && state.projAlign.active && e.button === 0 && !e.altKey && typeof addAlignPinFromRay === 'function') {
      if (typeof tryBeginAlignPinDrag === 'function' && tryBeginAlignPinDrag(mx, my, cvs)) { renderRigWorkspaceCanvas(); return; }
      const ray = venueScreenRay({ mvp: xf.mvp }, mx / Math.max(1, xf.cssW), 1 - my / Math.max(1, xf.mapH));
      if (ray) { addAlignPinFromRay(ray.origin, ray.dir); renderRigWorkspaceCanvas(); return; }
    }

    // 2. Right-drag / Middle-drag / Alt+Drag in 3D World immediately orbits or pans camera
    if (xf.mode === 'orbit3d' && (e.button === 1 || e.button === 2 || e.altKey)) {
      _rigDragState = venueCamBeginDrag(sp, mx, my, { pan: e.shiftKey || e.button === 1 });
      return;
    }

    // 3. Hit-test published 2D/3D handles (Gizmo axes are prepended at index 0 for top priority!)
    const handles = Array.isArray(cvs._planHandles) ? cvs._planHandles : [];
    let hitH = null;
    for (let i = 0; i < handles.length; i++) {
      const h = handles[i];
      if (h.kind === 'gizmo3d-axis' && Math.hypot(mx - h.px, my - h.py) <= (h.r || 13)) {
        hitH = h;
        break;
      }
    }
    if (!hitH) {
      for (let i = handles.length - 1; i >= 0; i--) {
        const h = handles[i];
        if (h.kind === 'gizmo3d-axis') continue;
        const hitCircle = Math.hypot(mx - h.px, my - h.py) <= (h.r || 10);
        const hitSeg = h.segA && h.segB && distToSeg2D(mx, my, h.segA, h.segB) <= 7;
        const hitPoly = h.poly && pointInPoly2D(mx, my, h.poly);
        if (hitCircle || hitSeg || hitPoly) {
          hitH = h;
          break;
        }
      }
    }

    // An area handle (a whole screen outline) must not steal clicks from a person or object
    // standing in front of it: let the 3D ray pick decide.
    if (hitH && hitH.poly && xf.mode === 'orbit3d' && typeof pickVenueObjects === 'function') {
      const ray = venueScreenRay({ mvp: xf.mvp }, mx / Math.max(1, xf.cssW), 1 - my / Math.max(1, xf.mapH));
      const front = ray ? pickVenueObjects(ray.origin, ray.dir) : null;
      if (front && front.kind !== 'world_screen') {
        selectVenueObject(front.kind, front.id);
        renderRigWorkspaceCanvas();
        _rigDragState = venueCamBeginDrag(sp, mx, my, { pan: false });
        return;
      }
    }

    if (hitH) {
      const h = hitH;
      if (h.kind === 'gizmo3d-axis') {
        beginUndoGesture(`Transform ${h.targetKind} (${h.axis.toUpperCase()})`);
        let origPos = [0, 0, 0], origAim = [0, 0, 0], origYaw = 0;
        if (h.targetKind === 'world_screen') {
          const ws = state.worldScreens?.find(s => s.id === h.targetId);
          if (ws) { origPos = [...ws.posM]; origYaw = ws.yawDeg || 0; }
        } else if (h.targetKind === 'projector') {
          const scr = mp.screens.find(s => s.index === Number(h.targetId));
          if (scr) {
            if (scr.yawDeg === undefined && typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
            origPos = [...scr.posM];
            origAim = [...scr.aimM];
            origYaw = scr.yawDeg || 0;
          }
        } else if (h.targetKind === 'mesh3d') {
          const surf = state.surfaces.find(s => s.id === h.targetId);
          if (surf) { origPos = [...(surf.pos3d || [0, 0, 0])]; origYaw = surf.rot3d?.[1] || 0; }
        } else if (h.targetKind === 'world_prop') {
          const prop = getWorldPropById(h.targetId);
          if (prop) { origPos = [...prop.posM]; origYaw = prop.yawDeg || 0; }
        } else if (h.targetKind === 'dmx_device') {
          const dev = (state.dmxDevices || []).find(d => d && d.id === h.targetId);
          if (dev) { origPos = [...dev.posM]; origAim = [...dev.aimM]; }
        }
        _rigDragState = {
          kind: 'gizmo3d-axis',
          axis: h.axis,
          targetKind: h.targetKind,
          targetId: h.targetId,
          origin2d: h.origin2d,
          tip2d: h.tip2d,
          axisLen: h.axisLen || 1.2,
          startX: mx,
          startY: my,
          origPos,
          origAim,
          origYaw
        };
        return;
      }

      if (h.kind === 'proj-aim3d') {
        const scr = mp.screens.find(s => s.index === h.screenIndex);
        if (scr) {
          beginUndoGesture(`Aim Projector P${scr.index} in 3D`);
          mp.selectedScreenIndex = scr.index;
          state.rigSelectedKind = 'projector';
          setActiveSelection('projector', String(scr.index), `P${scr.index} ${scr.name || ''}`);
          _rigDragState = {
            kind: 'proj-aim3d',
            screenIndex: scr.index,
            startX: mx,
            startY: my,
            origAim: [...scr.aimM],
            camYaw: xf.walk ? -(sp.walk?.yaw || 0) : sp.orbitYaw,
            camDist: xf.walk ? 5 : (xf.dist || 13)
          };
          syncRigWorkspaceUI();
          renderWorldDocksUI();
          return;
        }
      }

      if (h.kind === 'proj-pick3d' || h.kind === 'proj-body2d') {
        const scr = mp.screens.find(s => s.index === h.screenIndex);
        if (scr) {
          mp.selectedScreenIndex = scr.index;
          state.rigSelectedKind = 'projector';
          setActiveSelection('projector', String(scr.index), `P${scr.index} ${scr.name || ''}`);
          if (xf.mode === 'plan2d') {
            beginUndoGesture(`Move Projector P${scr.index}`);
            _rigDragState = {
              kind: e.shiftKey ? 'proj-height' : 'proj-xz',
              screenIndex: scr.index,
              startX: mx,
              startY: my,
              origPos: [...scr.posM],
              origAim: [...scr.aimM],
              y0: scr.posM[1]
            };
          }
          syncRigWorkspaceUI();
          renderWorldDocksUI();
          return;
        }
      }

      if (h.kind === 'proj-aim2d') {
        const scr = mp.screens.find(s => s.index === h.screenIndex);
        if (scr) {
          beginUndoGesture(`Aim Projector P${scr.index}`);
          mp.selectedScreenIndex = scr.index;
          state.rigSelectedKind = 'projector';
          setActiveSelection('projector', String(scr.index), `P${scr.index} ${scr.name || ''}`);
          _rigDragState = { kind: 'aim-xz', screenIndex: scr.index };
          syncRigWorkspaceUI();
          renderWorldDocksUI();
          return;
        }
      }

      if (h.kind === 'wscreen-pick3d' || h.kind === 'wscreen-move' || h.kind === 'wscreen-width' || h.kind === 'wscreen-yaw') {
        const ws = state.worldScreens?.find(s => s.id === h.id);
        if (ws) {
          state.selectedWorldScreenId = ws.id;
          state.rigSelectedKind = 'world_screen';
          setActiveSelection('world_screen', ws.id, ws.name);
          if (xf.mode === 'plan2d') {
            beginUndoGesture(`Transform ${ws.name}`);
            _rigDragState = {
              kind: h.kind,
              id: ws.id,
              side: h.side || 1,
              startX: mx,
              startY: my,
              origPos: [...ws.posM],
              origW: ws.widthM
            };
          }
          syncRigWorkspaceUI();
          renderWorldDocksUI();
          return;
        }
      }

      if (h.kind === 'mesh3d-pick3d' || h.kind === 'mesh3d-plan') {
        const surf = state.surfaces.find(s => s.id === h.surfaceId);
        if (surf) {
          if (typeof selectSurface === 'function') selectSurface(surf.id);
          state.rigSelectedKind = 'mesh3d';
          setActiveSelection('surface', surf.id, surf.name);
          if (xf.mode === 'plan2d') {
            beginUndoGesture(`Move ${surf.name}`);
            _rigDragState = {
              kind: 'mesh3d-plan',
              surfaceId: surf.id,
              startX: mx,
              startY: my,
              origPos3d: [...(surf.pos3d || [0, 0, 0])]
            };
          }
          syncRigWorkspaceUI();
          renderWorldDocksUI();
          return;
        }
      }

      if (h.kind === 'vpart-body2d' && typeof getVenuePartById === 'function') {
        const part = getVenuePartById(h.id);
        if (part) {
          selectVenuePart(part.id);
          if (xf.mode === 'plan2d') {
            beginUndoGesture(e.altKey ? `Turn ${part.name}` : `Move ${part.name}`);
            _rigDragState = { kind: 'vpart-move2d', id: part.id, startX: mx, startY: my, origPos: [...part.posM], origYaw: part.yawDeg || 0, rotate: e.altKey };
          }
          syncRigWorkspaceUI();
          renderWorldDocksUI();
          return;
        }
      }

      if (h.kind === 'prop-pick3d' || h.kind === 'prop-body2d') {
        const prop = typeof getWorldPropById === 'function' ? getWorldPropById(h.id) : null;
        if (prop) {
          selectWorldProp(prop.id);
          if (xf.mode === 'plan2d') {
            beginUndoGesture(e.altKey ? `Turn ${prop.name}` : `Move ${prop.name}`);
            _rigDragState = { kind: 'prop-move2d', id: prop.id, startX: mx, startY: my, origPos: [...prop.posM], origYaw: prop.yawDeg || 0, rotate: e.altKey };
          }
          syncRigWorkspaceUI();
          renderWorldDocksUI();
          return;
        }
      }

      if (h.kind === 'dmxdev-pick3d' || h.kind === 'dmxdev-body2d') {
        const dev = (state.dmxDevices || []).find(d => d && d.id === h.id);
        if (dev) {
          state.rigSelectedKind = 'dmx_device';
          state.selectedDmxDeviceId = dev.id;
          setActiveSelection('dmx_device', dev.id, dev.name);
          if (xf.mode === 'plan2d') {
            beginUndoGesture(`Move ${dev.name}`);
            _rigDragState = { kind: 'dmxdev-move2d', id: dev.id, startX: mx, startY: my, origPos: [...dev.posM], origAim: [...dev.aimM] };
          }
          syncRigWorkspaceUI();
          renderWorldDocksUI();
          return;
        }
      }

      if (h.kind === 'floorplan-move' || h.kind === 'floorplan-pick3d') {
        const fp = ensureFloorplanState();
        state.rigSelectedKind = 'floorplan';
        setActiveSelection('floorplan', 'floorplan', fp.name || 'Floorplan');
        if (xf.mode === 'plan2d' && !fp.locked) {
          beginUndoGesture('Move Floorplan');
          _rigDragState = {
            kind: 'floorplan-move',
            startX: mx,
            startY: my,
            origX: fp.offsetX || 0,
            origZ: fp.offsetZ || 0
          };
        }
        syncRigWorkspaceUI();
        renderWorldDocksUI();
        return;
      }

      if (h.kind === 'proj-throw') {
        const scr = mp.screens.find(s => s.index === h.screenIndex);
        if (scr) {
          beginUndoGesture(`Adjust P${scr.index} Lens Throw`);
          mp.selectedScreenIndex = scr.index;
          state.rigSelectedKind = 'projector';
          setActiveSelection('projector', String(scr.index), `P${scr.index} ${scr.name || ''}`);
          const px = xf.cx ? (xf.cx + scr.posM[0] * xf.scale) : mx;
          const pz = xf.cz ? (xf.cz + scr.posM[2] * xf.scale) : my;
          _rigDragState = {
            kind: 'proj-throw',
            screenIndex: scr.index,
            projPx: [px, pz],
            startDist: Math.max(12, Math.hypot(mx - px, my - pz)),
            origThrow: scr.throwRatio || 1.0,
            startX: mx
          };
          syncRigWorkspaceUI();
          return;
        }
      }

      if (h.kind === 'proj-shift') {
        const scr = mp.screens.find(s => s.index === h.screenIndex);
        if (scr) {
          beginUndoGesture(`Adjust P${scr.index} Lens Shift`);
          mp.selectedScreenIndex = scr.index;
          state.rigSelectedKind = 'projector';
          _rigDragState = {
            kind: 'proj-shift',
            screenIndex: scr.index,
            startX: mx,
            startY: my,
            origShiftX: scr.lensShiftX || 0,
            origShiftY: scr.lensShiftY || 0
          };
          syncRigWorkspaceUI();
          return;
        }
      }

      if (h.kind === 'dmx-fixture') {
        const pm = ensurePixelMapperState();
        const fix = pm.fixtures.find(f => f.id === h.fixtureId);
        if (fix) {
          beginUndoGesture(`Move Rig DMX ${fix.name}`);
          pm.selectedFixtureId = fix.id;
          pm.enabled = true;
          state.rigSelectedKind = 'dmx';
          setActiveSelection('led_fixture', fix.id, fix.name);
          if (xf.mode === 'plan2d') {
            _rigDragState = {
              kind: 'dmx-fixture',
              fixtureId: fix.id,
              startX: mx,
              startY: my,
              orig: fix.type === 'strip' ? [fix.x0, fix.y0, fix.x1, fix.y1] : [fix.cx, fix.cy]
            };
          }
          syncRigWorkspaceUI();
          renderWorldDocksUI();
          if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
          return;
        }
      }
    }

    // 4. Empty space in 3D World: first try picking the object under the cursor (people,
    //    screens, projectors, lights, 3D objects), then orbit / look around.
    if (xf.mode === 'orbit3d' && !e.shiftKey && typeof pickVenueObjects === 'function') {
      const ray = venueScreenRay({ mvp: xf.mvp }, mx / Math.max(1, xf.cssW), 1 - my / Math.max(1, xf.mapH));
      const hit = ray ? pickVenueObjects(ray.origin, ray.dir) : null;
      if (hit) {
        selectVenueObject(hit.kind, hit.id);
        renderRigWorkspaceCanvas();
        // Orthographic elevations / plan: drag the picked object in the view plane.
        if (sp.camMode === 'ortho' && typeof ORTHO_MOVABLE_KINDS !== 'undefined' && ORTHO_MOVABLE_KINDS.includes(hit.kind)) {
          const mv = beginOrthoObjectMove(hit.kind, hit.id, sp, xf.cssW, xf.mapH);
          if (mv) {
            beginUndoGesture(`Move ${getVenueObjectLabel(hit.kind, hit.id)}`);
            mv.startX = mx; mv.startY = my;
            _rigDragState = mv;
            return;
          }
        }
      }
    }
    if (xf.mode === 'orbit3d') {
      _rigDragState = venueCamBeginDrag(sp, mx, my, { pan: e.shiftKey });
      return;
    }

    const fs = (Array.isArray(state.spots) && state.spots.length > 0) ? state.spots.find(s => s && s.enabled !== false) : null;
    if (fs && (fs.converge3D || fs.mode !== 'off')) {
      const perf = getPerformer3DWorldCenterM(fs, mp);
      const px = xf.cx + perf.x * xf.scale;
      const pz = xf.cz + perf.z * xf.scale;
      if (Math.hypot(mx - px, my - pz) <= Math.max(12, perf.radiusM * xf.scale + 5)) {
        beginUndoGesture('Move 3D Performer');
        state.rigSelectedKind = 'performer';
        setActiveSelection('spot', fs.id, fs.name);
        _rigDragState = { kind: 'performer', spot: fs };
        syncRigWorkspaceUI();
        return;
      }
    }

    // 5. Empty space in 2D Plan: drag = pan the view, click without moving = deselect.
    if (xf.mode === 'plan2d' && sp.planView) {
      _rigDragState = {
        kind: 'plan-pan',
        startX: mx,
        startY: my,
        origPanX: sp.planView.panX,
        origPanZ: sp.planView.panZ,
        moved: false
      };
      cvs.style.cursor = 'grabbing';
    }
  });

  cvs.addEventListener('pointermove', (e) => {
    const rect = cvs.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    const xf = cvs._planTransform;
    if (!xf) return;

    if (!_rigDragState) {
      let cur = xf.mode === 'orbit3d' ? 'grab' : (state.floorplan?.calibMode ? 'crosshair' : 'default');
      const handles = Array.isArray(cvs._planHandles) ? cvs._planHandles : [];
      for (const h of handles) {
        if (Math.hypot(mx - h.px, my - h.py) <= (h.r || 10)) {
          cur = h.kind === 'proj-throw' || h.kind === 'wscreen-width' ? 'ew-resize' : 'pointer';
          break;
        }
      }
      cvs.style.cursor = cur;
      return;
    }

    const gear = (e.altKey && _rigDragState.kind !== 'orbit3d') ? 0.18 : 1.0;

    if (_rigDragState.kind === 'plan-pan') {
      const dx = mx - _rigDragState.startX, dy = my - _rigDragState.startY;
      if (!_rigDragState.moved && Math.hypot(dx, dy) < 3) return;
      _rigDragState.moved = true;
      sp.planView.panX = _rigDragState.origPanX - dx / Math.max(1, xf.scale);
      sp.planView.panZ = _rigDragState.origPanZ - dy / Math.max(1, xf.scale);
      renderRigWorkspaceCanvas();
      return;
    }

    if (_rigDragState.kind === 'ortho-move') {
      applyOrthoObjectMove(_rigDragState, mx - _rigDragState.startX, my - _rigDragState.startY, { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
      commitRigPhysicalChange();
      renderWorldDocksUI();
      return;
    }
    if (_rigDragState.kind === 'orbit3d' || _rigDragState.kind === 'orbit3d-pan' || _rigDragState.kind === 'walk-look') {
      venueCamDrag(sp, _rigDragState, mx, my);
      renderRigWorkspaceCanvas();
      return;
    }

    if (_rigDragState.kind === 'gizmo3d-axis') {
      const vx = _rigDragState.tip2d[0] - _rigDragState.origin2d[0];
      const vy = _rigDragState.tip2d[1] - _rigDragState.origin2d[1];
      const lenSq = Math.max(20, vx * vx + vy * vy);
      const dxPx = (mx - _rigDragState.startX) * gear;
      const dyPx = (my - _rigDragState.startY) * gear;
      const deltaM = ((dxPx * vx + dyPx * vy) / lenSq) * _rigDragState.axisLen;
      const axIdx = _rigDragState.axis === 'x' ? 0 : (_rigDragState.axis === 'y' ? 1 : 2);

      if (_rigDragState.targetKind === 'world_screen') {
        const ws = state.worldScreens?.find(s => s.id === _rigDragState.targetId);
        if (ws) {
          if (_rigDragState.axis === 'yaw') {
            ws.yawDeg = clamp(_rigDragState.origYaw + dxPx * 0.65, -180, 180);
          } else {
            ws.posM[axIdx] = clamp(Number((_rigDragState.origPos[axIdx] + deltaM).toFixed(3)), -45, 45);
          }
          syncPrimaryVenueFromWorldScreens();
          commitRigPhysicalChange();
          renderWorldDocksUI();
        }
      } else if (_rigDragState.targetKind === 'projector') {
        const scr = mp.screens.find(s => s.index === Number(_rigDragState.targetId));
        if (scr) {
          if (_rigDragState.axis === 'yaw') {
            scr.yawDeg = clamp(_rigDragState.origYaw + dxPx * 0.65, -180, 180);
            if (typeof syncProjectorAimFromAngles === 'function') syncProjectorAimFromAngles(scr);
          } else {
            scr.posM[axIdx] = clamp(Number((_rigDragState.origPos[axIdx] + deltaM).toFixed(3)), axIdx === 1 ? 0.05 : -35, 35);
            // Beam stays locked on its aim point unless ⌘/Ctrl is held (parallel translate).
            if (e.metaKey || e.ctrlKey) {
              scr.aimM[axIdx] = clamp(Number((_rigDragState.origAim[axIdx] + deltaM).toFixed(3)), -35, 35);
            } else {
              scr.aimM = [..._rigDragState.origAim];
            }
            if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
          }
          commitRigPhysicalChange();
          renderWorldDocksUI();
        }
      } else if (_rigDragState.targetKind === 'mesh3d') {
        const surf = state.surfaces.find(s => s.id === _rigDragState.targetId);
        if (surf) {
          if (!Array.isArray(surf.pos3d)) surf.pos3d = [0, 0, 0];
          if (!Array.isArray(surf.rot3d)) surf.rot3d = [18, -28, 0];
          const unitM = Math.max(0.25, sp.venue.screenHeightM * 0.5);
          if (_rigDragState.axis === 'yaw') {
            surf.rot3d[1] = _rigDragState.origYaw + dxPx * 0.7;
          } else {
            surf.pos3d[axIdx] = Number((_rigDragState.origPos[axIdx] + deltaM / unitM).toFixed(3));
          }
          surf._meshDirty = true;
          commitRigPhysicalChange();
          renderWorldDocksUI();
        }
      } else if (_rigDragState.targetKind === 'world_prop') {
        const prop = getWorldPropById(_rigDragState.targetId);
        if (prop) {
          if (_rigDragState.axis === 'yaw') {
            prop.yawDeg = clamp(((_rigDragState.origYaw + dxPx * 0.7 + 540) % 360) - 180, -180, 180);
            markStagePlanDirty();
          } else if (_rigDragState.axis !== 'y') {
            const np = [..._rigDragState.origPos];
            np[axIdx] += deltaM;
            moveWorldPropTo(prop, clamp(np[0], -40, 40), clamp(np[2], -40, 40));
          }
          commitRigPhysicalChange();
          renderWorldDocksUI();
        }
      } else if (_rigDragState.targetKind === 'dmx_device') {
        const dev = (state.dmxDevices || []).find(d => d && d.id === _rigDragState.targetId);
        if (dev) {
          if (_rigDragState.axis === 'yaw') {
            // Swing the beam around the fixture's vertical axis.
            const a = (dxPx * 0.7 * Math.PI) / 180;
            const ox = _rigDragState.origAim[0] - dev.posM[0], oz = _rigDragState.origAim[2] - dev.posM[2];
            dev.aimM = [dev.posM[0] + ox * Math.cos(a) - oz * Math.sin(a), _rigDragState.origAim[1], dev.posM[2] + ox * Math.sin(a) + oz * Math.cos(a)];
          } else {
            dev.posM[axIdx] = clamp(Number((_rigDragState.origPos[axIdx] + deltaM).toFixed(3)), axIdx === 1 ? 0 : -45, 45);
            if (e.metaKey || e.ctrlKey) dev.aimM[axIdx] = Number((_rigDragState.origAim[axIdx] + deltaM).toFixed(3));
            else dev.aimM = [..._rigDragState.origAim];
          }
          markStagePlanDirty();
          commitRigPhysicalChange();
          renderWorldDocksUI();
        }
      }
      return;
    }

    if (_rigDragState.kind === 'vpart-move2d') {
      const part = typeof getVenuePartById === 'function' ? getVenuePartById(_rigDragState.id) : null;
      if (part) {
        if (_rigDragState.rotate) {
          let yaw = _rigDragState.origYaw + (mx - _rigDragState.startX) * 0.8;
          if (e.shiftKey) yaw = Math.round(yaw / 15) * 15;
          part.yawDeg = ((yaw + 540) % 360) - 180;
        } else {
          let nx = _rigDragState.origPos[0] + ((mx - _rigDragState.startX) * gear) / Math.max(1, xf.scale);
          let nz = _rigDragState.origPos[2] + ((my - _rigDragState.startY) * gear) / Math.max(1, xf.scale);
          if (e.shiftKey) { nx = Math.round(nx / 0.25) * 0.25; nz = Math.round(nz / 0.25) * 0.25; }
          part.posM[0] = Number(nx.toFixed(3));
          part.posM[2] = Number(nz.toFixed(3));
        }
        markVenuePartsDirty();
        commitRigPhysicalChange();
        renderWorldDocksUI();
      }
      return;
    }

    if (_rigDragState.kind === 'prop-move2d') {
      const prop = getWorldPropById(_rigDragState.id);
      if (prop) {
        if (_rigDragState.rotate) {
          prop.yawDeg = clamp(((_rigDragState.origYaw + (mx - _rigDragState.startX) * 1.2 + 540) % 360) - 180, -180, 180);
          markStagePlanDirty();
        } else {
          const nx = _rigDragState.origPos[0] + ((mx - _rigDragState.startX) * gear) / Math.max(1, xf.scale);
          const nz = _rigDragState.origPos[2] + ((my - _rigDragState.startY) * gear) / Math.max(1, xf.scale);
          moveWorldPropTo(prop, clamp(nx, -40, 40), clamp(nz, -40, 40));
        }
        commitRigPhysicalChange();
        renderWorldDocksUI();
      }
      return;
    }

    if (_rigDragState.kind === 'dmxdev-move2d') {
      const dev = (state.dmxDevices || []).find(d => d && d.id === _rigDragState.id);
      if (dev) {
        const dxM = ((mx - _rigDragState.startX) * gear) / Math.max(1, xf.scale);
        const dzM = ((my - _rigDragState.startY) * gear) / Math.max(1, xf.scale);
        dev.posM = [_rigDragState.origPos[0] + dxM, _rigDragState.origPos[1], _rigDragState.origPos[2] + dzM];
        // Lights keep pointing at the same spot on stage (⌘/Ctrl = carry the aim along).
        dev.aimM = (e.metaKey || e.ctrlKey)
          ? [_rigDragState.origAim[0] + dxM, _rigDragState.origAim[1], _rigDragState.origAim[2] + dzM]
          : [..._rigDragState.origAim];
        markStagePlanDirty();
        commitRigPhysicalChange();
        renderWorldDocksUI();
      }
      return;
    }

    if (_rigDragState.kind === 'proj-aim3d') {
      const scr = mp.screens.find(s => s.index === _rigDragState.screenIndex);
      if (scr) {
        const yawR = ((_rigDragState.camYaw || 0) * Math.PI) / 180;
        const mPerPx = Math.max(0.008, (_rigDragState.camDist || 12) * 0.0022) * gear;
        const dxM = (mx - _rigDragState.startX) * mPerPx;
        const dyM = -(my - _rigDragState.startY) * mPerPx;
        scr.aimM[0] = clamp(_rigDragState.origAim[0] + Math.cos(yawR) * dxM, -35, 35);
        scr.aimM[1] = clamp(_rigDragState.origAim[1] + dyM, -8, 25);
        scr.aimM[2] = clamp(_rigDragState.origAim[2] - Math.sin(yawR) * dxM, -35, 35);
        if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
        commitRigPhysicalChange();
        renderWorldDocksUI();
      }
      return;
    }

    if (_rigDragState.kind === 'proj-throw') {
      const scr = mp.screens.find(s => s.index === _rigDragState.screenIndex);
      if (scr) {
        const ratio = xf.mode === 'plan2d'
          ? (_rigDragState.startDist / Math.max(10, Math.hypot(mx - _rigDragState.projPx[0], my - _rigDragState.projPx[1])))
          : (1.0 - ((mx - _rigDragState.startX) * 0.006 * gear));
        scr.throwRatio = clamp(Number((_rigDragState.origThrow * ratio).toFixed(2)), 0.30, 4.0);
        mp.enabled = true;
        sp.enabled = true;
        commitRigPhysicalChange();
      }
      return;
    }

    if (_rigDragState.kind === 'proj-shift') {
      const scr = mp.screens.find(s => s.index === _rigDragState.screenIndex);
      if (scr) {
        const dx = ((mx - _rigDragState.startX) / Math.max(60, sp.venue.screenWidthM * (xf.scale || 45))) * gear;
        const dy = (-(my - _rigDragState.startY) / Math.max(60, sp.venue.screenHeightM * (xf.scale || 45))) * gear;
        scr.lensShiftX = clamp(Number((_rigDragState.origShiftX + dx).toFixed(3)), -0.75, 0.75);
        scr.lensShiftY = clamp(Number((_rigDragState.origShiftY + dy).toFixed(3)), -0.75, 0.75);
        mp.enabled = true;
        sp.enabled = true;
        commitRigPhysicalChange();
      }
      return;
    }

    if (_rigDragState.kind === 'dmx-fixture') {
      const fix = state.pixelMapper?.fixtures?.find(f => f.id === _rigDragState.fixtureId);
      if (fix) {
        const du = ((mx - _rigDragState.startX) / Math.max(40, sp.venue.screenWidthM * (xf.scale || 45))) * gear;
        const dv = (-(my - _rigDragState.startY) / Math.max(40, sp.venue.screenHeightM * (xf.scale || 45))) * gear;
        if (fix.type === 'strip') {
          fix.x0 = clamp(_rigDragState.orig[0] + du, -0.2, 1.2);
          fix.y0 = clamp(_rigDragState.orig[1] + dv, -0.2, 1.2);
          fix.x1 = clamp(_rigDragState.orig[2] + du, -0.2, 1.2);
          fix.y1 = clamp(_rigDragState.orig[3] + dv, -0.2, 1.2);
        } else {
          fix.cx = clamp(_rigDragState.orig[0] + du, -0.2, 1.2);
          fix.cy = clamp(_rigDragState.orig[1] + dv, -0.2, 1.2);
        }
        syncRigWorkspaceUI();
      }
      return;
    }

    const wx = (mx - xf.cx) / Math.max(1, xf.scale);
    const wz = (my - xf.cz) / Math.max(1, xf.scale);
    const dWx = ((mx - (_rigDragState.startX || mx)) / Math.max(1, xf.scale)) * gear;
    const dWz = ((my - (_rigDragState.startY || my)) / Math.max(1, xf.scale)) * gear;

    if (_rigDragState.kind === 'wscreen-move') {
      const ws = state.worldScreens?.find(s => s.id === _rigDragState.id);
      if (ws) {
        if (e.shiftKey) {
          ws.posM[1] = clamp(Number((_rigDragState.origPos[1] - (my - _rigDragState.startY) * 0.025 * gear).toFixed(3)), 0.1, 25);
        } else {
          ws.posM[0] = clamp(Number((_rigDragState.origPos[0] + dWx).toFixed(3)), -40, 40);
          ws.posM[2] = clamp(Number((_rigDragState.origPos[2] + dWz).toFixed(3)), -40, 40);
        }
        syncPrimaryVenueFromWorldScreens();
        commitRigPhysicalChange();
        renderWorldDocksUI();
      }
    } else if (_rigDragState.kind === 'wscreen-width') {
      const ws = state.worldScreens?.find(s => s.id === _rigDragState.id);
      if (ws) {
        const distHalf = Math.max(0.25, Math.hypot(wx - ws.posM[0], wz - ws.posM[2]));
        ws.widthM = clamp(Number((distHalf * 2).toFixed(2)), 0.4, 80);
        commitRigPhysicalChange();
        renderWorldDocksUI();
      }
    } else if (_rigDragState.kind === 'wscreen-yaw') {
      const ws = state.worldScreens?.find(s => s.id === _rigDragState.id);
      if (ws) {
        ws.yawDeg = clamp(Number(((Math.atan2(wx - ws.posM[0], wz - ws.posM[2]) * 180) / Math.PI).toFixed(1)), -180, 180);
        commitRigPhysicalChange();
        renderWorldDocksUI();
      }
    } else if (_rigDragState.kind === 'mesh3d-plan') {
      const surf = state.surfaces.find(s => s.id === _rigDragState.surfaceId);
      if (surf) {
        const unitM = Math.max(0.25, sp.venue.screenHeightM * 0.5);
        if (!Array.isArray(surf.pos3d)) surf.pos3d = [0, 0, 0];
        surf.pos3d[0] = Number((_rigDragState.origPos3d[0] + dWx / unitM).toFixed(3));
        surf.pos3d[2] = Number((_rigDragState.origPos3d[2] + dWz / unitM).toFixed(3));
        surf._meshDirty = true;
        commitRigPhysicalChange();
        renderWorldDocksUI();
      }
    } else if (_rigDragState.kind === 'floorplan-move') {
      const fp = ensureFloorplanState();
      fp.offsetX = Number((_rigDragState.origX + dWx).toFixed(2));
      fp.offsetZ = Number((_rigDragState.origZ + dWz).toFixed(2));
      renderRigWorkspaceCanvas();
      renderWorldDocksUI();
    } else if (_rigDragState.kind === 'proj-xz') {
      const scr = mp.screens.find(s => s.index === _rigDragState.screenIndex);
      if (scr) {
        // Default: the beam stays locked on its aim point while the body moves (re-derive yaw/pitch).
        // ⌘/Ctrl+Drag translates body + aim together (parallel shift).
        const carryAim = e.metaKey || e.ctrlKey;
        const lim = 40;
        scr.posM[0] = clamp(Number((_rigDragState.origPos[0] + dWx).toFixed(3)), -lim, lim);
        scr.posM[2] = clamp(Number((_rigDragState.origPos[2] + dWz).toFixed(3)), -lim, lim);
        if (carryAim) {
          scr.aimM[0] = clamp(Number((_rigDragState.origAim[0] + dWx).toFixed(3)), -lim, lim);
          scr.aimM[2] = clamp(Number((_rigDragState.origAim[2] + dWz).toFixed(3)), -lim, lim);
        } else {
          scr.aimM[0] = _rigDragState.origAim[0];
          scr.aimM[2] = _rigDragState.origAim[2];
        }
        if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
        commitRigPhysicalChange();
        renderWorldDocksUI();
      }
    } else if (_rigDragState.kind === 'proj-height') {
      const scr = mp.screens.find(s => s.index === _rigDragState.screenIndex);
      if (scr) {
        scr.posM[1] = clamp(Number((_rigDragState.y0 - (my - _rigDragState.startY) * 0.025 * gear).toFixed(3)), 0.1, sp.venue.roomHeightM * 1.5);
        if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
        commitRigPhysicalChange();
        renderWorldDocksUI();
      }
    } else if (_rigDragState.kind === 'aim-xz') {
      const scr = mp.screens.find(s => s.index === _rigDragState.screenIndex);
      if (scr) {
        scr.aimM[0] = clamp(Number(wx.toFixed(3)), -sp.venue.roomWidthM * 0.85, sp.venue.roomWidthM * 0.85);
        scr.aimM[2] = clamp(Number(wz.toFixed(3)), -sp.venue.roomDepthM * 0.85, sp.venue.roomDepthM * 0.85);
        if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
        commitRigPhysicalChange();
        renderWorldDocksUI();
      }
    } else if (_rigDragState.kind === 'performer') {
      const fs = _rigDragState.spot || state.followspot;
      if (fs) {
        setSpotWorldTargetFromPlan(fs, wx, wz);
        if (fs.mode === 'off') fs.mode = 'veil';
        if (typeof syncFollowspotInspectorUI === 'function') syncFollowspotInspectorUI();
        commitRigPhysicalChange();
      }
    }
  });

  const endRigDrag = () => {
    if (_rigDragState) {
      const ended = _rigDragState;
      _rigDragState = null;
      if (ended.kind === 'plan-pan') {
        cvs.style.cursor = 'default';
        if (!ended.moved && typeof setActiveSelection === 'function') {
          // Plain click on empty floor clears the world selection (Backspace then has nothing to delete).
          state.rigSelectedKind = 'none';
          setActiveSelection(null, null, '');
          syncRigWorkspaceUI();
          if (typeof renderWorldDocksUI === 'function') renderWorldDocksUI();
        }
        return;
      }
      commitUndoGesture();
    }
  };
  cvs.addEventListener('pointerup', endRigDrag);
  cvs.addEventListener('pointercancel', endRigDrag);

  cvs.addEventListener('wheel', (e) => {
    const sp = ensureStagePlanState();
    e.preventDefault();
    if (sp.viewMode === 'orbit3d') {
      venueCamWheel(sp, e.deltaY);
      renderRigWorkspaceCanvas();
      return;
    }
    // 2D Plan: scroll / pinch zooms around the cursor (same as 3D Orbit); drag empty space to pan.
    const xf = cvs._planTransform;
    if (!xf || xf.mode !== 'plan2d' || !sp.planView) return;
    const rect = cvs.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - xf.cx) / xf.scale;
    const wz = (my - xf.cz) / xf.scale;
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const k = Math.exp(-clamp(dy, -240, 240) * (e.ctrlKey ? 0.01 : 0.0015));
    const newZoom = clamp(sp.planView.zoom * k, 0.15, 12);
    const newScale = (xf.baseScale || xf.scale) * newZoom;
    // Keep the world point under the cursor fixed: mx = W/2 - panX*s + wx*s
    sp.planView.zoom = newZoom;
    sp.planView.panX = wx - (mx - (xf.cssW || rect.width) * 0.5) / newScale;
    sp.planView.panZ = wz - (my - xf.mapH * 0.48) / newScale;
    renderRigWorkspaceCanvas();
  }, { passive: false });

  cvs.addEventListener('dblclick', (e) => {
    const xf = cvs._planTransform;
    if (!xf) return;
    const rect = cvs.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const onHandle = (cvs._planHandles || []).some(h => Math.hypot(mx - h.px, my - h.py) <= (h.r || 10));
    if (onHandle) return;
    if (xf.mode === 'plan2d') {
      fitStagePlanView();
    } else if (my < xf.mapH) {
      // 3D: double-click the floor to walk there at eye height.
      const sp = ensureStagePlanState();
      venueTeleportToScreenPoint(sp, xf.cssW / Math.max(1, xf.mapH), mx / Math.max(1, xf.cssW), 1 - my / Math.max(1, xf.mapH));
      renderRigWorkspaceCanvas();
    }
  });

  document.getElementById('btn-rig-fit')?.addEventListener('click', () => {
    const sp = ensureStagePlanState();
    if (sp.viewMode === 'orbit3d') {
      const xf = document.getElementById('rig-canvas')?._planTransform;
      if (typeof frameVenueCamera === 'function') frameVenueCamera(sp, xf ? xf.cssW / Math.max(1, xf.mapH) : 16 / 9, { yaw: 28, pitch: 22 });
      renderRigWorkspaceCanvas();
    } else {
      fitStagePlanView();
    }
  });
}

// ----------------------------------------------------------------------------
// P9 & A7: SINGLE KEYMAP REGISTRY & FLASH-TO-LOCATION COMMAND PALETTE (/ or ⌘K)
// ----------------------------------------------------------------------------

const WEBMAPPER_KEYMAP = [
  { id: 'room_switch', category: 'Show & Studio Navigation', label: 'Switch Studio Room: 1 · BUILD / 2 · MAP / 3 · LIVE', keys: 'F1 / F2 / F3' },
  { id: 'live_reach', category: 'Show & Studio Navigation', label: 'Surgical Warp Reach-Through in 2 · MAP & 3 · LIVE', keys: 'Hold W' },
  { id: 'ctx_delete', category: 'Show & Studio Navigation', label: 'Contextual Delete Selected Entity (Screen, Proj, Spot, Orb, Cue, Surface)', keys: 'Backspace / Delete' },
  { id: 'cmd_palette', category: 'Show & Studio Navigation', label: 'Command Palette & Flash-to-Location', keys: '/ or Cmd/Ctrl + K' },
  { id: 'cue_go', category: 'Show & Studio Navigation', label: 'GO Next Sequenced Cue (Stops safely at End of List)', keys: 'Space or ] / PgDn' },
  { id: 'cue_back', category: 'Show & Studio Navigation', label: 'Step Back Previous Sequenced Cue', keys: 'Shift + Space or [ / PgUp' },
  { id: 'dbo_blackout', category: 'Show & Studio Navigation', label: 'Stage Blackout (0ms Out • Hold 0.6s or Shift+B Restore)', keys: 'B' },
  { id: 'show_lock', category: 'Show & Studio Navigation', label: 'Arm / Disarm Live Show Lock', keys: 'Shift + P' },
  { id: 'proj_local', category: 'Show & Studio Navigation', label: 'Clean Fullscreen Stage Mode (F = OS Fullscreen)', keys: 'P' },
  { id: 'proj_window', category: 'Show & Studio Navigation', label: 'Launch 2nd-Screen Projector Output Window', keys: 'Shift + W' },
  { id: 'eco_mode', category: 'Show & Studio Navigation', label: 'Laptop GPU Eco Mode (Projector stays 60fps)', keys: 'Shift + 9' },
  { id: 'view_modes', category: 'Show & Studio Navigation', label: 'Switch View: Split / Input / Stage / Mix / Rig', keys: '1 / 2 / 3 / 4 (V) / 5' },
  { id: 'timeline_toggle', category: 'Show & Studio Navigation', label: 'Toggle Keyframe Show Timeline Drawer', keys: 'T' },
  { id: 'midi_learn', category: 'Show & Studio Navigation', label: 'Arm 1-Click WebMIDI Hardware Learn', keys: 'Cmd/Ctrl + M' },
  { id: 'shortcuts_help', category: 'Show & Studio Navigation', label: 'Open Keyboard Shortcuts Reference', keys: '?' },

  { id: 'pie_add_surf', category: 'Precision Optical Warping & Quasimodes', label: 'Radial Add-Surface Pie Menu at Stage Cursor', keys: 'Hold A' },
  { id: 'pie_precision', category: 'Precision Optical Warping & Quasimodes', label: 'Radial Precision Tools Pie (Snap / Weld / Loupe / Cal)', keys: 'Hold S' },
  { id: 'fine_gear', category: 'Precision Optical Warping & Quasimodes', label: '10× Sub-Pixel Fine-Gear Drag', keys: 'Hold Alt + Drag' },
  { id: 'cycle_vertex', category: 'Precision Optical Warping & Quasimodes', label: 'Cycle Active Corner / Mesh Node / PnP Pin', keys: ', / .' },
  { id: 'micro_nudge', category: 'Precision Optical Warping & Quasimodes', label: 'Micro-Nudge Selected Target (0.2px / 1px / 10px • in 1 · BUILD world objects 2mm / 1cm / 10cm • 2 · MAP needs Hold W)', keys: 'Alt / Arrow / Shift+Arrow' },
  { id: 'build_plan_nav', category: 'Precision Optical Warping & Quasimodes', label: '1 · BUILD 2D Plan: Pan / Zoom at Cursor / Frame All', keys: 'Drag Empty / Scroll / Double-Click' },
  { id: 'build_proj_move', category: 'Precision Optical Warping & Quasimodes', label: '1 · BUILD Projector Drag keeps beam on target (⌘/Ctrl = carry aim, Shift = height)', keys: 'Drag Projector' },
  { id: 'corner_pin_mesh', category: 'Precision Optical Warping & Quasimodes', label: 'Corner-Pin Sculpted Curved Mesh', keys: 'Cmd/Ctrl + Drag Corner' },
  { id: 'cal_grids', category: 'Precision Optical Warping & Quasimodes', label: 'Project Calibration Grids / Toggle Wireframe Guides', keys: 'G / H' },
  { id: 'group_surfs', category: 'Precision Optical Warping & Quasimodes', label: 'Group Selected Surfaces / Undo / Redo', keys: 'Cmd/Ctrl + G / Z / ⇧Z' },

  { id: 'spot_steer', category: 'Followspot & Video-as-Light Performance', label: 'Cycle Trackpad Spotlight Target (None → Spot 1 → Spot 2 → None)', keys: '` (Backquote)' },
  { id: 'spot_pointer_lock', category: 'Followspot & Video-as-Light Performance', label: 'Capture Invisible Stage Pointer Lock', keys: 'L' },
  { id: 'spot_pickup', category: 'Followspot & Video-as-Light Performance', label: 'Pick Up / Fade Out the Active Spot (uses its Fade time)', keys: 'F' },
  { id: 'spot_place3d', category: 'Followspot & Video-as-Light Performance', label: '3D Venue (LIVE): Click Floor = Send 3D Spot There · Drag Reticle = Move · Alt+Scroll = Aim Height', keys: 'Click / Drag / Alt+Scroll' },
  { id: 'venue_walk', category: 'Followspot & Video-as-Light Performance', label: '3D Venue Walk Mode: Move / Look / Down-Up / Run / Teleport', keys: 'WASD / Drag / Q-E / Shift / Dbl-Click' },
  { id: 'pane_solo', category: 'Followspot & Video-as-Light Performance', label: 'Solo / Split any pane', keys: '⤢ button or Double-Click title bar' },
  { id: 'spot_modifiers', category: 'Followspot & Video-as-Light Performance', label: 'Steer Gestures: Stretch / Rotate / Morph / Shadow / Iris', keys: 'Shift / R / M / S / Scroll' }
];

function getWebMapperKeymap() {
  return WEBMAPPER_KEYMAP.map(k => ({ ...k }));
}

function renderShortcutsDialogFromKeymap() {
  if (typeof document === 'undefined') return;
  const body = document.getElementById('shortcuts-dynamic-body');
  if (!body) return;
  const groups = new Map();
  for (const row of WEBMAPPER_KEYMAP) {
    if (!groups.has(row.category)) groups.set(row.category, []);
    groups.get(row.category).push(row);
  }
  let html = '';
  for (const [cat, items] of groups.entries()) {
    html += `<div class="shortcut-section-title">${escapeHtml(cat)}</div><div class="shortcut-grid">`;
    for (const it of items) {
      html += `<div class="shortcut-row"><span>${escapeHtml(it.label)}</span><span><span class="kbd">${escapeHtml(it.keys)}</span></span></div>`;
    }
    html += `</div>`;
  }
  body.innerHTML = html;
}

function buildCommandPaletteCatalog() {
  const catalog = [
    {
      id: 'room_build',
      title: 'Room 1 · BUILD — Physical World: Screens, Projectors, 3D Objects, Surfaces & Floorplan',
      category: 'Rooms',
      shortcut: 'F1',
      keywords: 'build world room stage rig screen floorplan pjlink dmx dowser hazer projector',
      run: () => { if (typeof setStudioRoom === 'function') setStudioRoom('build'); }
    },
    {
      id: 'room_map',
      title: 'Room 2 · MAP — Assign Textures, Shaders, FX & Build Cues',
      category: 'Rooms',
      shortcut: 'F2',
      keywords: 'map room texture media shader fx cue uv crop slice',
      run: () => { if (typeof setStudioRoom === 'function') setStudioRoom('map'); }
    },
    {
      id: 'room_live',
      title: 'Room 3 · LIVE — Cue Playback + Priority Action Deck + ◎ Orbital Mix + Spots',
      category: 'Rooms',
      shortcut: 'F3',
      keywords: 'live room performance cue go priority override orbital mix followspot trackpad',
      run: () => { if (typeof setStudioRoom === 'function') setStudioRoom('live'); }
    },
    {
      id: 'import_floorplan',
      title: 'Import Venue Floorplan Underlay (2D Plan & 3D World)',
      category: 'Build',
      shortcut: 'F1',
      keywords: 'floorplan blueprint cad png svg scale ruler venue',
      run: () => {
        if (typeof setStudioRoom === 'function') setStudioRoom('build');
        document.getElementById('file-import-floorplan')?.click();
      }
    },
    {
      id: 'cycle_trackpad_spot',
      title: 'Cycle Trackpad Spotlight Target (None → Spot 1 → Spot 2 → None)',
      category: 'Followspot',
      shortcut: '`',
      keywords: 'spot spotlight trackpad mouse steer none disable cycle',
      run: () => { if (typeof cycleTrackpadSpotTarget === 'function') cycleTrackpadSpotTarget(1); }
    },
    {
      id: 'rig_workspace',
      title: 'Open 2D/3D Physical Stage Rig & Constant-Brightness Solver',
      category: 'Stage Rig',
      shortcut: '5',
      keywords: 'stageplan rig projector overlap constant brightness lux wing lens throw trim height shadow',
      run: () => { setLayoutMode('rig'); flashLocateElement(document.getElementById('rig-pane')); }
    },
    {
      id: 'edge_blend_wizard',
      title: 'Multi-Projector Optical Edge-Blend & Grid Wizard',
      category: 'Output',
      shortcut: '',
      keywords: 'edge blend multiprojector seam overlap gamma black level uplift screen',
      run: () => { switchInspTab('output'); flashLocateElement(document.getElementById('disc-multiproj')); }
    },
    {
      id: 'dmx_pixel_mapper',
      title: 'LED Pixel Mapper, USB-DMX (WebSerial) & Art-Net Universe Patch',
      category: 'Output',
      shortcut: '',
      keywords: 'dmx artnet led strip matrix ring enttec usb pixel mapper universe',
      run: () => { switchInspTab('output'); flashLocateElement(document.getElementById('disc-dmx')); }
    },
    {
      id: 'framing_shutters',
      title: '4-Blade Theatrical Framing Shutters (Stage Handles)',
      category: 'Surface',
      shortcut: '',
      keywords: 'shutter barn door framing blade profile ellipsoidal cut tilt frost',
      run: () => {
        state.shutterHandlesVisible = true;
        switchInspTab('surface');
        syncInspectorUI();
        syncStageModePill();
        flashLocateElement(document.getElementById('disc-framing-shutters'));
      }
    },
    {
      id: 'pnp_3d_calib',
      title: '3D Mesh Surface & 6-Point solvePnP Camera-Projector Calibration',
      category: '3D Mapping',
      shortcut: '',
      keywords: '3d pnp solvepnp calibration pins whiskers reprojection error obj cube mesh3d',
      run: () => {
        let sel = typeof getSelectedSurface === 'function' ? getSelectedSurface() : null;
        if (!sel || sel.type !== 'mesh3d') {
          const existing3d = state.surfaces.find(s => s.type === 'mesh3d');
          if (existing3d) selectSurface(existing3d.id, false);
        }
        switchInspTab('surface');
        flashLocateElement(document.getElementById('card-mesh3d-props'));
      }
    },
    {
      id: 'audio_fft_sound',
      title: 'Audio FFT Analyzer, Video Sound Unmute & Beat Detector',
      category: 'Mod / IO',
      shortcut: '',
      keywords: 'audio fft no sound mute unmute bars beat bpm microphone screen capture spectrum',
      run: () => { switchInspTab('mod'); flashLocateElement(document.getElementById('sel-audio-mode')); }
    },
    {
      id: 'keep_venue_load',
      title: 'Touring Load: Load Show Cues & Media while Keeping Venue Calibration',
      category: 'Show I/O',
      shortcut: '',
      keywords: 'keep venue touring load show preserve calibration warp rig dmx',
      run: () => {
        const pop = document.getElementById('pop-file-menu');
        if (pop && typeof pop.showPopover === 'function') {
          try { pop.showPopover(); } catch (_) {}
        }
        flashLocateElement(document.getElementById('btn-load-keep-venue'), { focus: true });
      }
    },
    {
      id: 'cue_scope_toggle',
      title: 'Toggle Cue Record Scope (Show-Only vs Show + Venue Geometry)',
      category: 'Cues',
      shortcut: '',
      keywords: 'cue scope venue geometry recall filter protect warp',
      run: () => { toggleCueRecordScope(); flashLocateElement(document.getElementById('btn-cue-scope')); }
    },
    {
      id: 'followspot_steer',
      title: 'Toggle Cosmic Cloud Followspot Live Stage Steer',
      category: 'Followspot',
      shortcut: '`',
      keywords: 'followspot spot steer performer cloud 3d converge beam',
      run: () => { toggleSpotSteerMode(); }
    },
    {
      id: 'video_as_light',
      title: 'Activate Stage Gobo Video-as-Light Instrument',
      category: 'Media',
      shortcut: '',
      keywords: 'video as light gobo beam shutter prism frost lighting',
      run: () => { document.getElementById('btn-add-videolight')?.click(); }
    },
    {
      id: 'shader_studio',
      title: 'Toggle Live ISF v2 & GLSL Fragment Shader Studio',
      category: 'Shaders',
      shortcut: '',
      keywords: 'isf glsl shader code fragment plugin compile',
      run: () => { toggleShaderStudioDrawer(); }
    },
    {
      id: 'timeline_sequencer',
      title: 'Toggle Keyframe Show Timeline Sequencer',
      category: 'Timeline',
      shortcut: 'T',
      keywords: 'timeline keyframe curve automation track',
      run: () => { toggleTimelineDrawer(); }
    },
    {
      id: 'space_scanner',
      title: 'Open Structured-Light Gray-Code Optical Space Scanner',
      category: 'Calibration',
      shortcut: '',
      keywords: 'scanner gray code camera structured light snapshot',
      run: () => { openSpaceScannerModal(); }
    },
    {
      id: 'master_keystone',
      title: 'Master Output 4-Corner Keystone & Barrel/Pincushion Lens Trim',
      category: 'Output',
      shortcut: '',
      keywords: 'keystone master warp lens distortion barrel pincushion',
      run: () => { switchInspTab('output'); flashLocateElement(document.getElementById('btn-mk-enable')); }
    },
    {
      id: 'mask_stage_edit',
      title: 'Polygon & Bezier Cutout Mask Stage Vertex Editor',
      category: 'Mask',
      shortcut: '',
      keywords: 'mask cutout bezier polygon feather choke',
      run: () => {
        state.stageEditMode = 'mask';
        switchInspTab('mask');
        syncMaskInspectorUI();
        syncStageModePill();
        flashLocateElement(document.getElementById('btn-mask-edit-stage'));
      }
    },
    {
      id: 'foh_night_mode',
      title: 'Toggle FOH Booth Red-Shift Night Mode (Stage Unchanged)',
      category: 'Show Rail',
      shortcut: '',
      keywords: 'foh night mode dark red shift booth brightness dim',
      run: () => {
        state.fohNightMode = !state.fohNightMode;
        applyFohAppearanceToDocument();
        flashLocateElement(document.getElementById('btn-foh-night'));
      }
    }
  ];

  // Dynamic Show Cues
  (state.cues || []).forEach((c, idx) => {
    catalog.push({
      id: `cue_${c.id}`,
      title: `Recall Cue C${idx + 1}: ${c.name || 'Scene'}`,
      category: 'Cue',
      shortcut: idx === 0 ? '' : '',
      keywords: `cue c${idx + 1} ${c.name || ''} scene recall`,
      run: () => { triggerCueById(c.id); flashLocateElement(document.getElementById('cues-section')); }
    });
  });

  // Dynamic Surfaces
  (state.surfaces || []).forEach((s) => {
    catalog.push({
      id: `surf_${s.id}`,
      title: `Select Surface: ${s.name} (${s.type})`,
      category: 'Surface',
      shortcut: '',
      keywords: `surface ${s.name} ${s.type}`,
      run: () => { selectSurface(s.id, false); switchInspTab('surface'); flashLocateElement(document.getElementById('surfaces-section')); }
    });
  });

  return catalog;
}

function searchCommandPalette(query = '') {
  const catalog = buildCommandPaletteCatalog();
  const q = String(query || '').trim().toLowerCase();
  if (!q) return catalog.slice(0, 14);
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const item of catalog) {
    const hayTitle = item.title.toLowerCase();
    const hayAll = `${hayTitle} ${item.category.toLowerCase()} ${item.keywords || ''}`;
    let score = 0;
    let matchedAll = true;
    for (const tok of tokens) {
      if (hayTitle.startsWith(tok)) score += 35;
      else if (hayTitle.includes(tok)) score += 22;
      else if (hayAll.includes(tok)) score += 12;
      else { matchedAll = false; break; }
    }
    if (matchedAll && score > 0) {
      scored.push({ item, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 16).map(s => s.item);
}

let _cmdPaletteActiveIdx = 0;
let _cmdPaletteMatches = [];

function renderCommandPaletteResults(query = '') {
  if (typeof document === 'undefined') return;
  const listEl = document.getElementById('cmd-palette-results');
  if (!listEl) return;
  _cmdPaletteMatches = searchCommandPalette(query);
  _cmdPaletteActiveIdx = clamp(_cmdPaletteActiveIdx, 0, Math.max(0, _cmdPaletteMatches.length - 1));

  if (_cmdPaletteMatches.length === 0) {
    listEl.innerHTML = `<div class="empty-inspector" style="padding:14px;">No matching tools or cues for "${escapeHtml(query)}"</div>`;
    return;
  }

  listEl.innerHTML = _cmdPaletteMatches.map((it, idx) => `
    <button type="button" class="cmd-result-row${idx === _cmdPaletteActiveIdx ? ' active' : ''}" role="option" aria-selected="${idx === _cmdPaletteActiveIdx}" data-idx="${idx}">
      <span class="cmd-cat-pill">${escapeHtml(it.category)}</span>
      <span class="cmd-res-title">${escapeHtml(it.title)}</span>
      ${it.shortcut ? `<span class="kbd">${escapeHtml(it.shortcut)}</span>` : ''}
    </button>
  `).join('');

  listEl.querySelectorAll('.cmd-result-row').forEach(btn => {
    btn.addEventListener('pointerenter', () => {
      _cmdPaletteActiveIdx = parseInt(btn.dataset.idx, 10) || 0;
      listEl.querySelectorAll('.cmd-result-row').forEach((r, i) => {
        r.classList.toggle('active', i === _cmdPaletteActiveIdx);
        r.setAttribute('aria-selected', String(i === _cmdPaletteActiveIdx));
      });
    });
    btn.addEventListener('click', () => {
      const chosen = _cmdPaletteMatches[parseInt(btn.dataset.idx, 10) || 0];
      executeCommandPaletteItem(chosen);
    });
  });
}

function executeCommandPaletteItem(item) {
  const dlg = typeof document !== 'undefined' ? document.getElementById('cmd-palette-dialog') : null;
  if (dlg && dlg.open) dlg.close('exec');
  if (item && typeof item.run === 'function') {
    item.run();
  }
  if (typeof enablePartsForPaletteItem === 'function') enablePartsForPaletteItem(item);
}

function openCommandPalette(initialQuery = '') {
  if (typeof document === 'undefined') return;
  const dlg = document.getElementById('cmd-palette-dialog');
  const inp = document.getElementById('cmd-palette-input');
  if (!dlg || !inp) return;
  _cmdPaletteActiveIdx = 0;
  inp.value = initialQuery;
  renderCommandPaletteResults(initialQuery);
  if (!dlg.open) dlg.showModal();
  inp.focus();
  inp.select();
}

// ----------------------------------------------------------------------------
// P10: RADIAL PIE QUASIMODES (Hold A = Add Surface at Cursor • Hold S = Precision)
// ----------------------------------------------------------------------------

function buildPieSlicesForKind(kind) {
  const spawnAtStage = (type, extra = {}) => {
    if (state.showLock) { showToast('🔒 Show Lock active — press Shift+P to unlock'); return; }
    const cx = clamp(state.pieMenu?.stageX ?? 0.5, 0.12, 0.88);
    const cy = clamp(state.pieMenu?.stageY ?? 0.5, 0.12, 0.88);
    if (type === 'polygon' || type === 'line') {
      startNewInteractiveSurfaceDrawing(type);
      return;
    }
    pushUndoCheckpoint(`Add ${type} at Cursor`);
    const hw = 0.16, hh = 0.16;
    const pts = type === 'triangle'
      ? [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx, cy + hh]]
      : [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]];
    const s = createSurface(type, {
      sourceId: state.activeSourceId || 'src_shards',
      points: pts,
      ...extra
    });
    if (extra.quadWarp === 'curved') initSurfaceMeshFromCorners(s);
    state.surfaces.unshift(s);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    switchLeftTab('surfaces');
    switchInspTab('surface');
    selectSurface(s.id, false);
    scheduleAutosave();
    showToast(`Added ${s.name}`);
  };

  if (kind === 'add') {
    return [
      { label: '▱ Quad', run: () => spawnAtStage('quad') },
      { label: '∿ Mesh', run: () => spawnAtStage('quad', { quadWarp: 'curved' }) },
      { label: '◯ Circle', run: () => spawnAtStage('circle') },
      { label: '△ Tri', run: () => spawnAtStage('triangle') },
      { label: '✎ Poly', run: () => spawnAtStage('polygon') },
      { label: '╱ Line', run: () => spawnAtStage('line') },
      { label: '🧊 Cube', run: () => spawnAtStage('mesh3d', { mesh3dPrimitive: 'cube', pos3d: [(state.pieMenu.stageX - 0.5) * 2.2, (state.pieMenu.stageY - 0.5) * 1.4, 0] }) },
      { label: '🧊 Steps', run: () => spawnAtStage('mesh3d', { mesh3dPrimitive: 'steps', pos3d: [(state.pieMenu.stageX - 0.5) * 2.2, (state.pieMenu.stageY - 0.5) * 1.4, 0] }) }
    ];
  }
  return [
    { label: `⊹ Snap ${state.snapVertices ? 'ON' : 'OFF'}`, active: state.snapVertices, run: () => document.getElementById('btn-snap-vert')?.click() },
    { label: `⊞ Grid ${state.snapGrid ? 'ON' : 'OFF'}`, active: state.snapGrid, run: () => document.getElementById('btn-snap-grid')?.click() },
    { label: `⛓ Weld ${state.weldVertices ? 'ON' : 'OFF'}`, active: state.weldVertices, run: () => document.getElementById('btn-weld-vert')?.click() },
    { label: `🔍 Loupe ${state.enableLoupe ? 'ON' : 'OFF'}`, active: state.enableLoupe, run: () => document.getElementById('btn-loupe')?.click() },
    { label: `⌗ Cal ${state.allCalGrids ? 'ON' : 'OFF'}`, active: state.allCalGrids, run: () => document.getElementById('btn-all-cal')?.click() },
    { label: `◇ Guides ${state.showWireframes ? 'ON' : 'OFF'}`, active: state.showWireframes, run: () => document.getElementById('btn-wireframes')?.click() }
  ];
}

function renderPieMenuOverlay() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('pie-menu-overlay');
  if (!el) return;
  const pm = state.pieMenu;
  if (!pm || !pm.open) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  const slices = pm._slices || [];
  const n = Math.max(1, slices.length);
  const R_OUT = 104, R_IN = 32;
  const cx = pm.x, cy = pm.y;

  let svgPaths = '';
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI * 0.5 + (i - 0.5) * ((Math.PI * 2) / n);
    const a1 = a0 + (Math.PI * 2) / n;
    const am = (a0 + a1) * 0.5;
    const x0o = cx + Math.cos(a0) * R_OUT, y0o = cy + Math.sin(a0) * R_OUT;
    const x1o = cx + Math.cos(a1) * R_OUT, y1o = cy + Math.sin(a1) * R_OUT;
    const x0i = cx + Math.cos(a0) * R_IN,  y0i = cy + Math.sin(a0) * R_IN;
    const x1i = cx + Math.cos(a1) * R_IN,  y1i = cy + Math.sin(a1) * R_IN;
    const lx = cx + Math.cos(am) * ((R_OUT + R_IN) * 0.52);
    const ly = cy + Math.sin(am) * ((R_OUT + R_IN) * 0.52);
    const isHov = pm.hoverIndex === i;
    const fill = isHov
      ? 'rgba(52, 232, 158, 0.30)'
      : (slices[i].active ? 'rgba(111, 211, 255, 0.20)' : 'rgba(11, 16, 28, 0.92)');
    const stroke = isHov ? '#34e89e' : 'rgba(111, 211, 255, 0.32)';
    svgPaths += `
      <g class="pie-sector" data-idx="${i}">
        <path d="M ${x0i.toFixed(1)} ${y0i.toFixed(1)} L ${x0o.toFixed(1)} ${y0o.toFixed(1)} A ${R_OUT} ${R_OUT} 0 0 1 ${x1o.toFixed(1)} ${y1o.toFixed(1)} L ${x1i.toFixed(1)} ${y1i.toFixed(1)} A ${R_IN} ${R_IN} 0 0 0 ${x0i.toFixed(1)} ${y0i.toFixed(1)} Z"
              fill="${fill}" stroke="${stroke}" stroke-width="1.4" />
        <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="central"
              fill="${isHov ? '#ffffff' : '#dce7f7'}" font-size="10.5" font-weight="700" font-family="system-ui, sans-serif">${escapeHtml(slices[i].label)}</text>
      </g>`;
  }

  el.innerHTML = `
    <svg width="100%" height="100%" aria-hidden="true">
      ${svgPaths}
      <circle cx="${cx}" cy="${cy}" r="${R_IN - 2}" fill="rgba(7, 10, 16, 0.94)" stroke="rgba(255,255,255,0.22)" stroke-width="1.2" />
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="rgba(220,231,247,0.75)" font-size="9" font-family="monospace">${pm.kind === 'add' ? '+ SURF' : 'SNAP'}</text>
    </svg>
  `;
}

function openPieMenuQuasimode(kind) {
  if (typeof window === 'undefined' || state.projectorMode) return;
  const stageRect = stageOverlay ? stageOverlay.getBoundingClientRect() : { left: 400, top: 260, width: 640, height: 420 };
  const ptr = (typeof lastStagePointerClient !== 'undefined' && lastStagePointerClient.inside)
    ? lastStagePointerClient
    : { x: stageRect.left + stageRect.width * 0.5, y: stageRect.top + stageRect.height * 0.5, sx: 0.5, sy: 0.5 };
  const cx = clamp(ptr.x, 120, Math.max(120, window.innerWidth - 120));
  const cy = clamp(ptr.y, 120, Math.max(120, window.innerHeight - 120));

  state.pieMenu = {
    open: true,
    kind,
    x: cx,
    y: cy,
    stageX: clamp(ptr.sx ?? 0.5, 0.08, 0.92),
    stageY: clamp(ptr.sy ?? 0.5, 0.08, 0.92),
    hoverIndex: -1,
    _slices: buildPieSlicesForKind(kind)
  };
  renderPieMenuOverlay();
}

function updatePieMenuPointer(clientX, clientY) {
  const pm = state.pieMenu;
  if (!pm || !pm.open) return;
  const dx = clientX - pm.x;
  const dy = clientY - pm.y;
  const dist = Math.hypot(dx, dy);
  let idx = -1;
  if (dist >= 28 && Array.isArray(pm._slices) && pm._slices.length > 0) {
    const n = pm._slices.length;
    let ang = Math.atan2(dy, dx) + Math.PI * 0.5 + Math.PI / n;
    while (ang < 0) ang += Math.PI * 2;
    ang = ang % (Math.PI * 2);
    idx = Math.floor((ang / (Math.PI * 2)) * n) % n;
  }
  if (idx !== pm.hoverIndex) {
    pm.hoverIndex = idx;
    renderPieMenuOverlay();
  }
}

function closePieMenuQuasimode(commitSelection = true) {
  const pm = state.pieMenu;
  if (!pm || !pm.open) return;
  const chosen = (commitSelection && pm.hoverIndex >= 0 && pm._slices) ? pm._slices[pm.hoverIndex] : null;
  pm.open = false;
  pm.hoverIndex = -1;
  renderPieMenuOverlay();
  if (chosen && typeof chosen.run === 'function') {
    chosen.run();
  }
}

function initUxStudioSystems() {
  if (typeof document === 'undefined') return;

  // Glareshield Grand Master double-click -> 100% detent
  const gmSlider = document.getElementById('ctrl-master-opacity');
  gmSlider?.addEventListener('dblclick', () => {
    state.masterOpacity = 1.0;
    setSliderValue(gmSlider, 1.0);
    const valEl = document.getElementById('val-master-opacity');
    if (valEl) valEl.textContent = '100%';
    gmSlider.setAttribute('aria-valuetext', '100%');
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
    showToast('Grand Master set to 100% detent');
  });

  // Glareshield FOH UI Dimmer & Red-Shift Night Mode
  const fohSlider = document.getElementById('ctrl-foh-dim');
  fohSlider?.addEventListener('input', () => {
    state.fohDim = clamp(parseFloat(fohSlider.value) || 1.0, 0.38, 1.0);
    applyFohAppearanceToDocument();
  });
  fohSlider?.addEventListener('dblclick', () => {
    state.fohDim = 1.0;
    applyFohAppearanceToDocument();
  });
  document.getElementById('btn-foh-night')?.addEventListener('click', () => {
    state.fohNightMode = !state.fohNightMode;
    applyFohAppearanceToDocument();
    showToast(state.fohNightMode
      ? '☾ FOH Red-Shift Night Mode ON (Projector Stage untouched)'
      : '☀ Standard Studio UI Palette');
  });

  // Command Palette Search Input & Arrow/Enter Navigation
  const cmdInp = document.getElementById('cmd-palette-input');
  cmdInp?.addEventListener('input', () => {
    _cmdPaletteActiveIdx = 0;
    renderCommandPaletteResults(cmdInp.value);
  });
  cmdInp?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (_cmdPaletteMatches.length > 0) {
        _cmdPaletteActiveIdx = (_cmdPaletteActiveIdx + 1) % _cmdPaletteMatches.length;
        renderCommandPaletteResults(cmdInp.value);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_cmdPaletteMatches.length > 0) {
        _cmdPaletteActiveIdx = (_cmdPaletteActiveIdx - 1 + _cmdPaletteMatches.length) % _cmdPaletteMatches.length;
        renderCommandPaletteResults(cmdInp.value);
      }
    } else if (e.key === 'Enter') {
      if (typeof isImeComposingEnter === 'function' && isImeComposingEnter(e)) return;
      e.preventDefault();
      if (_cmdPaletteMatches[_cmdPaletteActiveIdx]) {
        executeCommandPaletteItem(_cmdPaletteMatches[_cmdPaletteActiveIdx]);
      }
    }
  });

  // Pie Menu pointer tracking & click-to-commit
  window.addEventListener('pointermove', (e) => {
    if (state.pieMenu?.open) updatePieMenuPointer(e.clientX, e.clientY);
  }, { passive: true });
  document.getElementById('pie-menu-overlay')?.addEventListener('pointerdown', (e) => {
    if (!state.pieMenu?.open) return;
    e.preventDefault();
    updatePieMenuPointer(e.clientX, e.clientY);
    closePieMenuQuasimode(true);
  });

  // Topbar Show File & Precision Snap Popover anchoring
  const bindAnchoredTopbarPopover = (btnId, popId, autoHideOnClick = false) => {
    const triggerBtn = document.getElementById(btnId);
    const popEl = document.getElementById(popId);
    if (!triggerBtn || !popEl) return;
    popEl.addEventListener('beforetoggle', (ev) => {
      if (ev.newState === 'open') {
        const r = triggerBtn.getBoundingClientRect();
        popEl.style.top = `${Math.round(r.bottom + 4)}px`;
        popEl.style.left = `${Math.max(8, Math.min(window.innerWidth - 264, Math.round(r.left)))}px`;
      }
    });
    if (autoHideOnClick) {
      popEl.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('button.btn') : null;
        if (btn && typeof popEl.hidePopover === 'function') {
          try { popEl.hidePopover(); } catch (_) {}
        }
      });
    }
  };
  bindAnchoredTopbarPopover('btn-file-menu', 'pop-file-menu', true);
  bindAnchoredTopbarPopover('btn-snap-menu', 'pop-snap-menu', false);

  renderShortcutsDialogFromKeymap();
  syncCueScopeButtonUI();
  syncShowRailUI();
  renderSynopticStripUI();
}

// ----------------------------------------------------------------------------
// PILLAR 3: SAFE ARITHMETIC PARSER, UNIVERSAL SCRUBBY READOUTS & DIFF DOTS
// ----------------------------------------------------------------------------

function evaluateSafeStudioMath(expr, currentVal = 0) {
  if (typeof expr !== 'string') return Number.isFinite(Number(expr)) ? Number(expr) : null;
  let s = expr.trim().replace(/×/g, '*').replace(/÷/g, '/').replace(/°|px|ms|lm|K|%/gi, '');
  if (!s) return null;
  const isRelAdd = /^[+-]/.test(s);
  if (isRelAdd) s = `${Number(currentVal) || 0}${s}`;
  if (!/^[0-9+\-*/().\s]+$/.test(s)) return null;

  let pos = 0;
  const skipWs = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };
  const parseExpr = () => {
    let v = parseTerm();
    if (v === null) return null;
    while (true) {
      skipWs();
      if (s[pos] === '+' || s[pos] === '-') {
        const op = s[pos++];
        const r = parseTerm();
        if (r === null) return null;
        v = op === '+' ? v + r : v - r;
      } else break;
    }
    return v;
  };
  const parseTerm = () => {
    let v = parseFactor();
    if (v === null) return null;
    while (true) {
      skipWs();
      if (s[pos] === '*' || s[pos] === '/') {
        const op = s[pos++];
        const r = parseFactor();
        if (r === null) return null;
        if (op === '/' && Math.abs(r) < 1e-12) return null;
        v = op === '*' ? v * r : v / r;
      } else break;
    }
    return v;
  };
  const parseFactor = () => {
    skipWs();
    if (s[pos] === '+') { pos++; return parseFactor(); }
    if (s[pos] === '-') { pos++; const f = parseFactor(); return f === null ? null : -f; }
    if (s[pos] === '(') {
      pos++;
      const inner = parseExpr();
      skipWs();
      if (s[pos] !== ')') return null;
      pos++;
      return inner;
    }
    const start = pos;
    while (pos < s.length && /[0-9.]/.test(s[pos])) pos++;
    if (pos === start) return null;
    const num = parseFloat(s.slice(start, pos));
    return Number.isFinite(num) ? num : null;
  };

  const out = parseExpr();
  skipWs();
  if (out === null || pos !== s.length || !Number.isFinite(out)) return null;
  return out;
}

function syncDiffDotsOnInspectorSliders() {
  if (typeof document === 'undefined') return;
  for (const sl of document.querySelectorAll('input[type="range"].studio-slider')) {
    const defAttr = sl.getAttribute('value');
    if (defAttr === null) continue;
    const defVal = parseFloat(defAttr);
    const curVal = parseFloat(sl.value);
    if (!Number.isFinite(defVal) || !Number.isFinite(curVal)) continue;
    const step = parseFloat(sl.step) || 0.01;
    const differed = Math.abs(curVal - defVal) > Math.max(1e-4, step * 0.45);
    const row = sl.closest ? sl.closest('.ctrl-row') : sl.parentElement;
    const lbl = row && row.querySelector ? row.querySelector('.ctrl-label') : null;
    if (lbl) lbl.classList.toggle('has-diff-dot', differed);
  }
}

function initScrubbyReadoutsAndDiffDots() {
  if (typeof document === 'undefined') return;
  for (const row of document.querySelectorAll('.ctrl-row')) {
    const sl = row.querySelector('input[type="range"].studio-slider');
    const valEl = row.querySelector('.ctrl-val');
    const lblEl = row.querySelector('.ctrl-label');
    if (!sl) continue;

    const resetToDefault = (ev) => {
      if (!ev.altKey) return;
      const defAttr = sl.getAttribute('value');
      if (defAttr === null) return;
      const defVal = parseFloat(defAttr);
      if (!Number.isFinite(defVal)) return;
      ev.preventDefault();
      ev.stopPropagation();
      sl.value = String(defVal);
      sl.dispatchEvent(new Event('input', { bubbles: true }));
      sl.dispatchEvent(new Event('change', { bubbles: true }));
      syncDiffDotsOnInspectorSliders();
    };
    lblEl?.addEventListener('click', resetToDefault);
    sl.addEventListener('input', () => syncDiffDotsOnInspectorSliders());

    if (!valEl) continue;
    valEl.classList.add('scrubbable');
    valEl.title = 'Drag horizontally to scrub (Hold Alt for 0.05× micro-gear) • Double-click for math (e.g. 3840/3) • Alt+Click to reset';

    let scrub = null;
    valEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || valEl.querySelector('input')) return;
      if (e.altKey && !e.shiftKey) {
        // Track whether user drags or clicks for Alt+Click reset
        scrub = {
          pointerId: e.pointerId,
          startX: e.clientX,
          lastX: e.clientX,
          moved: false,
          curVal: parseFloat(sl.value) || 0,
          altStart: true
        };
        valEl.setPointerCapture(e.pointerId);
        return;
      }
      e.preventDefault();
      scrub = {
        pointerId: e.pointerId,
        startX: e.clientX,
        lastX: e.clientX,
        moved: false,
        curVal: parseFloat(sl.value) || 0,
        altStart: false
      };
      valEl.setPointerCapture(e.pointerId);
    });

    valEl.addEventListener('pointermove', (e) => {
      if (!scrub || e.pointerId !== scrub.pointerId) return;
      const dx = e.clientX - scrub.lastX;
      if (Math.abs(e.clientX - scrub.startX) > 2) scrub.moved = true;
      if (!scrub.moved) return;
      scrub.lastX = e.clientX;
      const min = parseFloat(sl.min) || 0;
      const max = parseFloat(sl.max) || 1;
      const span = Math.max(1e-4, max - min);
      const gear = e.altKey ? 0.05 : (e.shiftKey ? 4.0 : 1.0);
      scrub.curVal = clamp(scrub.curVal + (dx / 180) * span * gear, min, max);
      sl.value = String(scrub.curVal);
      sl.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const finishScrub = (e) => {
      if (!scrub) return;
      if (scrub.altStart && !scrub.moved) {
        resetToDefault({ altKey: true, preventDefault() {}, stopPropagation() {} });
      } else if (scrub.moved) {
        sl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      scrub = null;
      syncDiffDotsOnInspectorSliders();
    };
    valEl.addEventListener('pointerup', finishScrub);
    valEl.addEventListener('lostpointercapture', finishScrub);

    valEl.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (valEl.querySelector('input')) return;
      const prevText = valEl.textContent;
      const curNum = parseFloat(sl.value) || 0;
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'ctrl-val-math-inp';
      inp.value = String(curNum);
      inp.setAttribute('aria-label', 'Enter value or math expression');
      valEl.textContent = '';
      valEl.appendChild(inp);
      inp.focus();
      inp.select();

      let committed = false;
      const commit = (apply) => {
        if (committed) return;
        committed = true;
        const rawExpr = inp.value;
        valEl.textContent = prevText;
        if (!apply) return;
        const parsed = evaluateSafeStudioMath(rawExpr, curNum);
        if (parsed === null) return;
        const curMin = parseFloat(sl.min);
        const curMax = parseFloat(sl.max);
        // Soft-cap escape when user explicitly types a value beyond slider soft range (within safe physical bounds)
        if (Number.isFinite(curMax) && parsed > curMax && parsed <= curMax * 8) {
          sl.max = String(parsed);
        }
        if (Number.isFinite(curMin) && parsed < curMin && parsed >= curMin - Math.abs(curMax || 10) * 4) {
          sl.min = String(parsed);
        }
        sl.value = String(parsed);
        sl.dispatchEvent(new Event('input', { bubbles: true }));
        sl.dispatchEvent(new Event('change', { bubbles: true }));
        syncDiffDotsOnInspectorSliders();
      };

      inp.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') {
          ke.preventDefault();
          commit(true);
        } else if (ke.key === 'Escape') {
          ke.preventDefault();
          commit(false);
        }
      });
      inp.addEventListener('blur', () => commit(true));
    });
  }
  syncDiffDotsOnInspectorSliders();
}
