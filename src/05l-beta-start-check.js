// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05l-beta-start-check.js — Chaos CathodeRay 0.1 public beta: first minute & trust
//   1. Error log (window errors + unhandled rejections, ring buffer of 20)
//   2. Saved / edited tracking ("changes not in a file yet")
//   3. Show Check: ✓ Ready / ⚠ N chip with one-click fixes
//   4. Report a problem: diagnostics the tester can copy or download
//   5. Start screen: what are you making? demo · blank · open · continue
// ============================================================================

// ----------------------------------------------------------------------------
// 1. ERROR LOG
// ----------------------------------------------------------------------------
const BETA_ERROR_LOG = [];
let _betaLastErrorToastMs = 0;

function logBetaError(kind, message, where = '') {
  const msg = String(message || 'Unknown error').slice(0, 400);
  const last = BETA_ERROR_LOG[BETA_ERROR_LOG.length - 1];
  if (last && last.msg === msg && last.where === where) { last.count++; last.t = Date.now(); return; }
  BETA_ERROR_LOG.push({ t: Date.now(), kind, msg, where, count: 1 });
  if (BETA_ERROR_LOG.length > 20) BETA_ERROR_LOG.shift();
  const now = Date.now();
  if (now - _betaLastErrorToastMs > 60000 && typeof showToast === 'function' && !state.isProjectorRole) {
    _betaLastErrorToastMs = now;
    showToast('⚠ Something went wrong behind the scenes — β badge → Report a problem');
  }
}

function initBetaErrorCapture() {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('error', (e) => {
    if (!e) return;
    const where = e.filename ? `${String(e.filename).split('/').pop()}:${e.lineno || 0}:${e.colno || 0}` : '';
    logBetaError('error', e.message || (e.error && e.error.message), where);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    logBetaError('promise', (r && (r.message || r.name)) || String(r), '');
  });
}

// ----------------------------------------------------------------------------
// 2. SAVED / EDITED TRACKING
// ----------------------------------------------------------------------------
const betaShowFileState = { bootDone: false, savedAt: 0, editedSinceSave: false };

function markShowSavedToFile() {
  betaShowFileState.savedAt = Date.now();
  betaShowFileState.editedSinceSave = false;
}

function markShowEdited() {
  if (!betaShowFileState.bootDone) return;
  betaShowFileState.editedSinceSave = true;
}

// ----------------------------------------------------------------------------
// 3. SHOW CHECK
// ----------------------------------------------------------------------------
let _showCheckSig = '';
let _showCheckLowFpsSince = 0;

function isAnyOutputWindowOpen() {
  if (state.projectorMode) return true;
  if (typeof projectorConnected !== 'undefined' && projectorConnected) return true; // remote / second-computer output
  try {
    if (typeof projectorWindowsMap !== 'undefined' && projectorWindowsMap) {
      for (const w of projectorWindowsMap.values()) if (w && !w.closed) return true;
    }
    if (typeof projectorWindow !== 'undefined' && projectorWindow && !projectorWindow.closed) return true;
  } catch (_) {}
  return false;
}

function collectShowCheckItems() {
  const items = [];
  const add = (level, id, text, fixLabel, fix) => items.push({ level, id, text, fixLabel, fix });
  const sources = state.sources || [];
  const srcIds = new Set(sources.map(s => s.id));

  const offline = sources.filter(s => s && s.offline);
  if (offline.length) {
    add('warn', 'media', `${offline.length} media file${offline.length > 1 ? 's are' : ' is'} missing (show opened on another computer?)`, 'Relink…',
      () => { if (typeof openRelinkModal === 'function') openRelinkModal(); });
  }
  const noSrc = (state.surfaces || []).filter(s => s && s.visible !== false && s.sourceId && !srcIds.has(s.sourceId) && !String(s.sourceId).startsWith('bus:'));
  if (noSrc.length) {
    add('warn', 'nosource', `${noSrc.length} surface${noSrc.length > 1 ? 's point' : ' points'} at media that no longer exists`, 'Select',
      () => { if (typeof selectSurface === 'function') selectSurface(noSrc[0].id); else state.selectedSurfaceId = noSrc[0].id; if (typeof setStudioRoom === 'function') setStudioRoom('map'); });
  }
  if (state.blackout) {
    add('warn', 'blackout', 'Blackout is on — the stage is dark', 'Release', () => { if (typeof setBlackoutImmediate === 'function') setBlackoutImmediate(false, 'Blackout released'); });
  }
  if ((Number(state.masterOpacity) || 0) < 0.02) {
    add('warn', 'gm', 'Grand Master is at 0 %', 'Set 100 %', () => {
      const gm = document.getElementById('ctrl-master-opacity');
      if (gm) gm.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      else state.masterOpacity = 1;
    });
  }
  if (typeof isProgramHeld === 'function' && isProgramHeld() && typeof hasPendingPreviewEdits === 'function' && hasPendingPreviewEdits()) {
    add('warn', 'blind', 'Blind: your edits are not on stage yet', 'TAKE', () => { if (typeof takeProgram === 'function') takeProgram(); });
  }
  if (!(state.cues || []).length && (state.workflow === 'theatre' || state.workflow === 'rehearsal')) {
    add('warn', 'cues', 'No cues stored yet — GO has nothing to play', 'Store this look', () => { if (typeof storeNewCue === 'function') storeNewCue(); });
  }
  const fps = typeof liveMeasuredFps !== 'undefined' ? Number(liveMeasuredFps) || 60 : 60;
  const now = Date.now();
  if (fps < 28 && !state.ecoMode) { if (!_showCheckLowFpsSince) _showCheckLowFpsSince = now; } else _showCheckLowFpsSince = 0;
  const browserCapped = typeof getBrowserFrameRateCap === 'function' && getBrowserFrameRateCap() > 0;
  if (_showCheckLowFpsSince && now - _showCheckLowFpsSince > 4000 && state.renderQuality !== 'fast' && !browserCapped) {
    add('warn', 'fps', `Frame rate is low (${fps} FPS)`, 'Fast quality', () => { state.renderQuality = 'fast'; if (typeof showToast === 'function') showToast('Render quality: FAST (click the FPS badge to change)'); });
  }
  const capFps = typeof getBrowserFrameRateCap === 'function' ? getBrowserFrameRateCap() : 0;
  if (capFps) {
    add(isAnyOutputWindowOpen() ? 'warn' : 'info', 'fpscap', `Frame rate is held at ${capFps} fps (lower quality wouldn't help) — usually battery saving. Plug in, or turn off Energy Saver in Chrome Settings → Performance.`, 'How?',
      () => { if (typeof showToast === 'function') showToast('Chrome: ⋮ → Settings → Performance → Energy Saver → off (or "only when unplugged"), and keep the laptop on mains power for shows.'); });
  }
  if (!isAnyOutputWindowOpen()) {
    add('info', 'output', 'No projector window open yet — the audience sees nothing', 'Open output',
      () => { if (typeof launchProjectorWindow === 'function') launchProjectorWindow(); });
  }
  if (betaShowFileState.editedSinceSave || !betaShowFileState.savedAt) {
    add('info', 'save', betaShowFileState.savedAt ? 'Changes since your last saved show file (autosave keeps them in this browser only)' : 'Not saved to a file yet (autosave keeps it in this browser only)',
      'Save', () => { if (typeof exportShowJson === 'function') exportShowJson(); });
  }
  return items;
}

function syncShowCheckUI(force = false) {
  if (typeof document === 'undefined' || state.isProjectorRole) return;
  const chip = document.getElementById('btn-show-check');
  if (!chip) return;
  const items = collectShowCheckItems();
  const warns = items.filter(i => i.level === 'warn').length;
  const sig = items.map(i => i.level + i.id + i.text).join('|');
  if (!force && sig === _showCheckSig) return;
  _showCheckSig = sig;
  chip.textContent = warns ? `⚠ ${warns}` : '✓';
  chip.setAttribute('aria-label', warns ? `Show Check: ${warns} to fix` : 'Show Check: ready');
  chip.classList.toggle('warn', warns > 0);
  chip.title = warns ? `Show Check: ${warns} thing${warns > 1 ? 's' : ''} to look at before the audience does` : 'Show Check: nothing blocking — click for tips';
  const list = document.getElementById('show-check-list');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="show-check-empty">✓ All clear. Media found, stage lit, outputs and file saved.</div>';
    return;
  }
  list.innerHTML = items.map((it, i) => `
    <div class="show-check-item ${it.level}">
      <span class="show-check-dot" aria-hidden="true">${it.level === 'warn' ? '⚠' : '◦'}</span>
      <span class="show-check-text">${escapeHtml(it.text)}</span>
      <button type="button" class="btn" data-check-fix="${i}">${escapeHtml(it.fixLabel)}</button>
    </div>`).join('');
  list._items = items;
}

function initShowCheck() {
  if (typeof document === 'undefined' || state.isProjectorRole) return;
  const list = document.getElementById('show-check-list');
  list?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-check-fix]');
    if (!b || !list._items) return;
    const it = list._items[Number(b.dataset.checkFix)];
    if (it && typeof it.fix === 'function') {
      try { it.fix(); } catch (err) { logBetaError('fix', err && err.message, it.id); }
    }
    setTimeout(() => syncShowCheckUI(true), 60);
  });
  document.getElementById('pop-show-check')?.addEventListener('toggle', () => syncShowCheckUI(true));
  setInterval(() => syncShowCheckUI(false), 600);
  syncShowCheckUI(true);
}

// ----------------------------------------------------------------------------
// 4. REPORT A PROBLEM
// ----------------------------------------------------------------------------
function getGpuDescription() {
  try {
    if (typeof gl === 'undefined' || !gl) return 'WebGL2 unavailable';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(r || 'unknown');
  } catch (_) { return 'unknown'; }
}

// Report number: yymmdd-hhmm of when the dialog opened (local time). The server adds -2, -3…
// when two reports land in the same minute.
let _betaReportId = '';

function makeBetaReportId(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function getBetaReportId() {
  if (!_betaReportId) _betaReportId = makeBetaReportId();
  return _betaReportId;
}

function buildBetaReportText(userNote = '') {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const win = typeof window !== 'undefined' ? window : {};
  const kinds = {};
  for (const s of state.sources || []) kinds[s.kind || 'other'] = (kinds[s.kind || 'other'] || 0) + 1;
  const mp = state.multiProjector || {};
  const sp = mp.stagePlan || {};
  const checks = collectShowCheckItems().map(i => `  ${i.level === 'warn' ? '⚠' : '◦'} ${i.text}`).join('\n') || '  ✓ all clear';
  const errs = BETA_ERROR_LOG.map(e => `  ${new Date(e.t).toISOString().slice(11, 19)} [${e.kind}] ${e.msg}${e.where ? ' @ ' + e.where : ''}${e.count > 1 ? ` ×${e.count}` : ''}`).join('\n') || '  (none)';
  const lines = [
    `${APP_REPORT_SUBJECT} ${getBetaReportId()}`,
    `${APP_NAME} ${APP_VERSION} · ${new Date().toISOString()}`,
    '',
    'WHAT HAPPENED',
    (String(userNote || '').trim() || '(describe what you did, what you expected and what happened)'),
    '',
    'SYSTEM',
    `  Browser: ${nav.userAgent || 'unknown'}`,
    `  Language: ${nav.language || '?'} · cores ${nav.hardwareConcurrency || '?'} · memory ${nav.deviceMemory ? nav.deviceMemory + ' GB' : '?'}`,
    `  Screen: ${win.screen ? `${win.screen.width}×${win.screen.height}` : '?'} @${win.devicePixelRatio || 1}x · window ${win.innerWidth || '?'}×${win.innerHeight || '?'}`,
    `  GPU: ${getGpuDescription()}`,
    `  Frame rate: ${typeof liveMeasuredFps !== 'undefined' ? liveMeasuredFps : '?'} FPS · quality ${state.renderQuality || 'auto'}${state.ecoMode ? ' · eco' : ''}`,
    '',
    'SESSION',
    `  Room: ${state.room} · context: ${state.workflow || 'none'} · layout: ${state.layoutMode} · feed: ${state.outputFeedTab}`,
    `  View: ${sp.viewMode || '?'} / ${sp.camMode || '?'}${sp.camMode === 'ortho' ? ' ' + (sp.orthoView || '') + ' ' + (sp.orthoLook || 'light') : ''}`,
    `  Program: ${typeof isProgramHeld === 'function' && isProgramHeld() ? 'BLIND (held)' : 'live'} · blackout ${state.blackout ? 'ON' : 'off'} · GM ${Math.round((Number(state.masterOpacity) || 0) * 100)}%`,
    `  Outputs open: ${isAnyOutputWindowOpen() ? 'yes' : 'no'} · multi-projector ${mp.enabled ? 'on' : 'off'}`,
    '',
    'SHOW (counts only, no names)',
    `  Surfaces ${(state.surfaces || []).length} · masks ${(state.masks || []).length} · cues ${(state.cues || []).length}`,
    `  Sources ${(state.sources || []).length} (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')})`,
    `  Projectors ${(mp.screens || []).length} · screens ${(state.worldScreens || []).length} · parts ${(state.venueParts || []).length} · people ${(state.worldProps || []).length} · spots ${(state.spots || []).length}`,
    `  Venue: ${state.worldStage?.shape || '?'}`,
    '',
    'SHOW CHECK',
    checks,
    '',
    'RECENT ERRORS',
    errs
  ];
  return lines.join('\n');
}

// mailto: links are length-limited in some mail apps: past ~7 kB the body is trimmed and the
// full report goes to the clipboard so the tester can paste it in.
const BETA_MAILTO_MAX = 7000;

function buildBetaReportMailto(text) {
  const subject = `${APP_REPORT_SUBJECT} ${getBetaReportId()}`;
  let body = String(text || '');
  let truncated = false;
  const enc = (b) => encodeURIComponent(b);
  if (enc(body).length > BETA_MAILTO_MAX) {
    truncated = true;
    const note = '\n\n[Report shortened for email — the full report is on your clipboard: paste it here.]';
    while (body.length > 200 && enc(body).length + enc(note).length > BETA_MAILTO_MAX) body = body.slice(0, Math.floor(body.length * 0.9));
    body += note;
  }
  return { url: `mailto:${APP_FEEDBACK_EMAIL}?subject=${enc(subject)}&body=${enc(body)}`, truncated };
}

async function copyTextToClipboard(txt, fallbackEl = null) {
  try { if (navigator.clipboard) { await navigator.clipboard.writeText(txt); return true; } } catch (_) {}
  if (fallbackEl) { fallbackEl.select(); try { return document.execCommand('copy'); } catch (_) {} }
  return false;
}

function buildBetaReportPayload(text) {
  return JSON.stringify({ app: APP_SLUG, version: APP_VERSION, id: getBetaReportId(), report: String(text || ''), website: '' });
}

// POST straight to the server. text/plain keeps it a "simple" CORS request (no preflight),
// which also works from file://. Resolves { ok, id } or { ok:false, error }.
async function sendBetaReportToServer(text, timeoutMs = 12000) {
  if (typeof fetch !== 'function') return { ok: false, error: 'no network in this browser' };
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(APP_REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: buildBetaReportPayload(text),
      signal: ctl ? ctl.signal : undefined,
      cache: 'no-store',
      credentials: 'omit'
    });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    if (res.ok && json && json.ok) return { ok: true, id: String(json.id || getBetaReportId()) };
    return { ok: false, error: (json && json.error) || `server answered ${res.status}` };
  } catch (err) {
    return { ok: false, error: err && err.name === 'AbortError' ? 'the server did not answer in time' : 'could not reach the server (offline?)' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function setBetaReportStatus(kind, html) {
  const el = document.getElementById('report-status');
  if (!el) return;
  el.hidden = !html;
  el.className = `report-status ${kind || ''}`;
  el.innerHTML = html || '';
  const alt = document.getElementById('btn-report-email');
  if (alt) alt.hidden = kind !== 'error';
}

function openBetaReportDialog() {
  const dlg = document.getElementById('report-dialog');
  if (!dlg) return;
  if (!dlg.open) {
    _betaReportId = makeBetaReportId();
    setBetaReportStatus('', '');
    const send = document.getElementById('btn-report-send');
    if (send) { send.disabled = false; send.textContent = '✉ Send'; }
  }
  const out = document.getElementById('report-text');
  const note = document.getElementById('report-note');
  if (out) out.value = buildBetaReportText(note ? note.value : '');
  if (typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
  setTimeout(() => note?.focus(), 30);
}

function initBetaReport() {
  if (typeof document === 'undefined' || state.isProjectorRole) return;
  const note = document.getElementById('report-note');
  const out = document.getElementById('report-text');
  const refresh = () => { if (out) out.value = buildBetaReportText(note ? note.value : ''); };
  note?.addEventListener('input', refresh);
  document.getElementById('btn-beta-badge')?.addEventListener('click', openBetaReportDialog);
  document.getElementById('btn-report-problem')?.addEventListener('click', () => {
    document.getElementById('pop-file-menu')?.hidePopover?.();
    openBetaReportDialog();
  });
  document.getElementById('btn-report-copy')?.addEventListener('click', async () => {
    refresh();
    const ok = await copyTextToClipboard(out ? out.value : '', out);
    showToast(ok ? `📋 Report copied — paste it into an email to ${APP_FEEDBACK_EMAIL}` : 'Select the text and copy it (⌘C)');
  });
  const send = document.getElementById('btn-report-send');
  send?.addEventListener('click', async () => {
    refresh();
    send.disabled = true;
    send.textContent = 'Sending…';
    setBetaReportStatus('busy', 'Sending the report…');
    const res = await sendBetaReportToServer(out ? out.value : '');
    if (res.ok) {
      send.textContent = '✓ Sent';
      setBetaReportStatus('ok', `✓ Sent as <strong>${escapeHtml(APP_REPORT_SUBJECT)} ${escapeHtml(res.id)}</strong>. Thank you! Mention this number if we follow up.`);
      showToast(`✓ ${APP_REPORT_SUBJECT} ${res.id} sent — thank you!`);
    } else {
      send.disabled = false;
      send.textContent = '✉ Try again';
      setBetaReportStatus('error', `Not sent: ${escapeHtml(res.error)}. Try again, or use <strong>Email instead</strong> / <strong>Copy report</strong>.`);
    }
  });
  // A new note after a successful send makes a new report.
  note?.addEventListener('input', () => {
    if (send && send.textContent === '✓ Sent') { _betaReportId = makeBetaReportId(); send.disabled = false; send.textContent = '✉ Send'; setBetaReportStatus('', ''); refresh(); }
  });
  document.getElementById('btn-report-email')?.addEventListener('click', async () => {
    refresh();
    const txt = out ? out.value : '';
    const mail = buildBetaReportMailto(txt);
    if (mail.truncated) await copyTextToClipboard(txt, out);
    const a = document.createElement('a');
    a.href = mail.url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(mail.truncated
      ? `✉ Opening your mail app — the report was long, so the full text is on your clipboard: paste it in`
      : `✉ Opening your mail app to ${APP_FEEDBACK_EMAIL} — if nothing opens, use Copy report`);
  });
  document.getElementById('btn-report-download')?.addEventListener('click', () => {
    refresh();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    if (typeof downloadTextFile === 'function') downloadTextFile(out ? out.value : '', `${APP_SLUG}-report-${stamp}.txt`, 'text/plain');
  });
  document.getElementById('btn-report-close')?.addEventListener('click', () => document.getElementById('report-dialog')?.close());
}

// ----------------------------------------------------------------------------
// 5. START SCREEN
// ----------------------------------------------------------------------------
const START_SEEN_KEY = 'chaoscathode_start_seen_v1';
const START_CONTEXT_ROOMS = { quick2d: 'map', theatre: 'build', club: 'map', rehearsal: 'build', architectural: 'build' };

function readStartPref() {
  try { return localStorage.getItem(START_SEEN_KEY); } catch (_) { return null; }
}

function writeStartPref(val) {
  try { localStorage.setItem(START_SEEN_KEY, val); } catch (_) {}
}

function shouldShowStartScreen(restoredAutosave) {
  if (state.isProjectorRole || state.isMonitorRole) return false;
  const pref = readStartPref();
  if (pref === 'show') return true;
  if (pref === 'never') return false;
  // First visit ever (no preference and nothing restored) → welcome.
  return !restoredAutosave;
}

// Kits: with a show open, each kit can be added to it (nothing cleared) or start a new show.
function renderStartScreen(hasSession) {
  const grid = document.getElementById('start-grid');
  const showOpen = !!hasSession && !isSessionPristine();
  const note = document.getElementById('start-kit-note');
  if (note) note.textContent = showOpen
    ? 'A kit adds what that kind of show needs. Add it to the show you have, or start a new show from it.'
    : 'A kit is a ready-made start: venue, rig, views and safety set for that kind of show.';
  if (grid && typeof WORKFLOW_CONTEXTS !== 'undefined') {
    grid.innerHTML = Object.entries(WORKFLOW_CONTEXTS).map(([id, c]) => showOpen ? `
      <div class="start-card start-card-kit">
        <span class="start-card-icon" aria-hidden="true">${c.icon}</span>
        <span class="start-card-title">${escapeHtml(c.label)}</span>
        <span class="start-card-blurb">${escapeHtml(c.blurb)}</span>
        <span class="start-card-actions">
          <button type="button" class="btn emerald" data-kit-add="${id}">＋ Add to this show</button>
          <button type="button" class="btn" data-start-ctx="${id}">New show</button>
        </span>
      </div>` : `
      <button type="button" class="start-card" data-start-ctx="${id}">
        <span class="start-card-icon" aria-hidden="true">${c.icon}</span>
        <span class="start-card-title">${escapeHtml(c.label)}</span>
        <span class="start-card-blurb">${escapeHtml(c.blurb)}</span>
      </button>`).join('');
  }
  const cont = document.getElementById('btn-start-continue');
  if (cont) cont.hidden = !hasSession;
  const chk = document.getElementById('chk-start-show');
  if (chk) chk.checked = readStartPref() === 'show';
}

function openStartScreen(opts = {}) {
  const dlg = document.getElementById('start-dialog');
  if (!dlg || typeof dlg.showModal !== 'function') return false;
  renderStartScreen(opts.hasSession !== false);
  if (!dlg.open) dlg.showModal();
  return true;
}

function closeStartScreen() {
  const dlg = document.getElementById('start-dialog');
  const chk = document.getElementById('chk-start-show');
  if (chk) writeStartPref(chk.checked ? 'show' : 'never');
  if (dlg && dlg.open) dlg.close();
}

// New show from a kit: a blank show (05m newBlankShow) plus the kit.
function startFromContext(id) {
  if (typeof newBlankShow === 'function') newBlankShow();
  else if (typeof loadBlankScene === 'function') loadBlankScene();
  if (typeof applyWorkflowContext === 'function') applyWorkflowContext(id);
  closeStartScreen();
  const room = START_CONTEXT_ROOMS[id] || 'map';
  if (typeof setStudioRoom === 'function') setStudioRoom(room);
  if (typeof fitStagePlanView === 'function') fitStagePlanView();
  const c = (typeof WORKFLOW_CONTEXTS !== 'undefined' && WORKFLOW_CONTEXTS[id]) || {};
  const next = room === 'build'
    ? 'Start in BUILD: shape the venue and place projectors, then F2 to MAP.'
    : 'Start in MAP: drop a video or image on the stage, drag the corners onto your object.';
  if (typeof showToast === 'function') showToast(`${c.icon || '✦'} ${c.label || 'New show'} — ${next}`);
}

// ----------------------------------------------------------------------------
// 6. FRESH START — nobody inherits an old session by accident.
//    Everything the app remembers lives in THIS browser only (localStorage + IndexedDB);
//    testers on other computers never share it. On a shared computer, the Welcome-back
//    bar, Show ▾ → Start fresh… and the ?fresh link give a clean slate.
// ----------------------------------------------------------------------------
const PENDING_START_KEY = 'chaoscathode_pending_start';
const betaSession = { fresh: true, restoredInfo: null };

function readSavedSessionInfo() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY) || localStorage.getItem(LEGACY_AUTOSAVE_STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return {
      savedAt: d.savedAt || null,
      surfaces: Array.isArray(d.surfaces) ? d.surfaces.length : 0,
      cues: Array.isArray(d.cues) ? d.cues.length : 0,
      projectors: Array.isArray(d.multiProjector?.screens) ? d.multiProjector.screens.length : 0
    };
  } catch (_) { return null; }
}

function isFreshLaunchRequested() {
  try { return new URLSearchParams(window.location.search || '').has('fresh'); } catch (_) { return false; }
}

function takePendingStart() {
  try {
    const raw = sessionStorage.getItem(PENDING_START_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_START_KEY);
    return JSON.parse(raw) || {};
  } catch (_) { return null; }
}

function isSessionPristine() {
  return betaSession.fresh && !betaShowFileState.editedSinceSave;
}

// Forget everything this browser remembers about Chaos CathodeRay.
async function wipeSavedSession() {
  state._resetting = true;
  try { if (typeof autosaveTimer !== 'undefined' && autosaveTimer) clearTimeout(autosaveTimer); } catch (_) {}
  for (const k of [AUTOSAVE_STORAGE_KEY, LEGACY_AUTOSAVE_STORAGE_KEY, START_SEEN_KEY, 'wm.renderQuality']) {
    try { localStorage.removeItem(k); } catch (_) {}
  }
  if (typeof indexedDB !== 'undefined' && typeof HANDLE_DB_NAME !== 'undefined') {
    await new Promise((resolve) => {
      try {
        const req = indexedDB.deleteDatabase(HANDLE_DB_NAME);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      } catch (_) { resolve(); }
      setTimeout(resolve, 1500);
    });
  }
}

// Wipe, then reload clean. `next` says what to do after the reload: { start: true } (Start
// screen), { ctx: 'theatre' }, { demo: true }.
async function startFreshAndReload(next = { start: true }) {
  await wipeSavedSession();
  try { sessionStorage.setItem(PENDING_START_KEY, JSON.stringify(next || { start: true })); } catch (_) {}
  try { for (const w of (typeof projectorWindowsMap !== 'undefined' ? projectorWindowsMap.values() : [])) { if (w && !w.closed) w.close(); } } catch (_) {}
  const url = String(window.location.href).replace(/([?&])fresh(=[^&#]*)?(&|$)/, (m, a, b, c) => (c ? a : '')).replace(/[?&]$/, '');
  window.location.replace(url);
}

function openFreshDialog(next = { start: true }) {
  const dlg = document.getElementById('fresh-dialog');
  if (!dlg || typeof dlg.showModal !== 'function') return startFreshAndReload(next);
  dlg._next = next;
  const info = readSavedSessionInfo();
  const what = document.getElementById('fresh-what');
  if (what) {
    what.textContent = info
      ? `The saved session${info.savedAt ? ' from ' + new Date(info.savedAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''} — ${info.surfaces} surface${info.surfaces === 1 ? '' : 's'}, ${info.cues} cue${info.cues === 1 ? '' : 's'}, ${info.projectors} projector${info.projectors === 1 ? '' : 's'} — will be cleared.`
      : 'The current show will be cleared.';
  }
  if (!dlg.open) dlg.showModal();
}

function hideSessionBar() {
  const bar = document.getElementById('session-bar');
  if (bar) bar.hidden = true;
}

function showSessionBar(info) {
  const bar = document.getElementById('session-bar');
  const txt = document.getElementById('session-bar-text');
  if (!bar || !txt || !info) return;
  const when = info.savedAt ? new Date(info.savedAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'earlier';
  txt.textContent = `↩ Welcome back — this browser restored the last session (${when} · ${info.surfaces} surface${info.surfaces === 1 ? '' : 's'} · ${info.cues} cue${info.cues === 1 ? '' : 's'}).`;
  bar.hidden = false;
  clearTimeout(showSessionBar._t);
  showSessionBar._t = setTimeout(hideSessionBar, 30000);
}

function initFreshStart(restoredAutosave, pending) {
  if (typeof document === 'undefined' || state.isProjectorRole) return;
  const dlg = document.getElementById('fresh-dialog');
  document.getElementById('btn-fresh-cancel')?.addEventListener('click', () => dlg?.close());
  document.getElementById('btn-fresh-backup')?.addEventListener('click', () => { if (typeof exportShowJson === 'function') exportShowJson(); });
  document.getElementById('btn-fresh-confirm')?.addEventListener('click', () => startFreshAndReload(dlg && dlg._next ? dlg._next : { start: true }));
  document.getElementById('btn-start-fresh')?.addEventListener('click', () => {
    document.getElementById('pop-file-menu')?.hidePopover?.();
    openFreshDialog({ start: true });
  });
  document.getElementById('btn-session-keep')?.addEventListener('click', hideSessionBar);
  document.getElementById('btn-session-fresh')?.addEventListener('click', () => { hideSessionBar(); openFreshDialog({ start: true }); });

  if (restoredAutosave) {
    betaSession.fresh = false;
    betaSession.restoredInfo = readSavedSessionInfo();
    showSessionBar(betaSession.restoredInfo);
  }
  // Finish what was asked for before the clean reload.
  if (pending) {
    if (pending.ctx) startFromContext(pending.ctx);
    else if (pending.blank) { closeStartScreen(); if (typeof newBlankShow === 'function') newBlankShow(); }
    else if (pending.demo) { closeStartScreen(); if (typeof setStudioRoom === 'function') setStudioRoom('map'); showToast('✦ Demo show — F1 BUILD the space · F2 MAP the light · F3 LIVE to play it'); }
    else openStartScreen({ hasSession: false });
  }
}

function initStartScreen(restoredAutosave) {
  if (typeof document === 'undefined' || state.isProjectorRole) return;
  const dlg = document.getElementById('start-dialog');
  if (!dlg) return;
  dlg.addEventListener('click', (e) => {
    const add = e.target.closest('[data-kit-add]');
    if (add) {
      closeStartScreen();
      if (typeof applyWorkflowContext === 'function') applyWorkflowContext(add.dataset.kitAdd);
      return;
    }
    const card = e.target.closest('[data-start-ctx]');
    if (card) {
      const id = card.dataset.startCtx;
      if (isSessionPristine()) startFromContext(id);
      else { closeStartScreen(); openFreshDialog({ ctx: id }); }
      return;
    }
    if (e.target === dlg) closeStartScreen();
  });
  dlg.addEventListener('cancel', () => closeStartScreen());
  document.getElementById('btn-start-close')?.addEventListener('click', closeStartScreen);
  document.getElementById('btn-start-mapping')?.addEventListener('click', () => {
    if (!isSessionPristine()) { closeStartScreen(); openFreshDialog({ blank: true }); return; }
    closeStartScreen();
    if (typeof newBlankShow === 'function') newBlankShow();
  });
  document.getElementById('btn-start-continue')?.addEventListener('click', closeStartScreen);
  document.getElementById('btn-start-demo')?.addEventListener('click', () => {
    if (!isSessionPristine()) { closeStartScreen(); openFreshDialog({ demo: true }); return; }
    if (typeof loadDemoScene === 'function') loadDemoScene(true);
    closeStartScreen();
    if (typeof setStudioRoom === 'function') setStudioRoom('map');
    if (typeof showToast === 'function') showToast('✦ Demo show — F1 BUILD the space · F2 MAP the light · F3 LIVE to play it');
  });
  document.getElementById('btn-start-open')?.addEventListener('click', () => {
    closeStartScreen();
    document.getElementById('project-file-input')?.click();
  });
  document.getElementById('btn-start-screen')?.addEventListener('click', () => {
    document.getElementById('pop-file-menu')?.hidePopover?.();
    openStartScreen({ hasSession: true });
  });
  if (shouldShowStartScreen(restoredAutosave)) openStartScreen({ hasSession: !!restoredAutosave });
}

// ----------------------------------------------------------------------------
// 7. ABOUT & LICENCE — the "Appropriate Legal Notices" (AGPL §0, §5(d), §13):
//    copyright, attribution, licence, no-warranty and where to get the source.
// ----------------------------------------------------------------------------
function fillLegalNotices(root = document) {
  root.querySelectorAll('.app-copyright').forEach(el => { el.textContent = APP_COPYRIGHT; });
  root.querySelectorAll('.app-license').forEach(el => { el.textContent = APP_LICENSE; });
  root.querySelectorAll('.tester-guide-link').forEach(el => { el.href = APP_TESTERS_URL; });
  const set = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
  set('about-version', 'textContent', APP_VERSION);
  set('about-attribution', 'textContent', APP_ATTRIBUTION);
  set('about-source', 'href', APP_SOURCE_URL);
  set('about-license', 'href', `${APP_SOURCE_URL}/blob/main/LICENSE`);
  set('about-notice', 'href', `${APP_SOURCE_URL}/blob/main/NOTICE.md`);
  set('about-trademark', 'href', `${APP_SOURCE_URL}/blob/main/TRADEMARK.md`);
}

function openAboutDialog() {
  const dlg = document.getElementById('about-dialog');
  if (!dlg || typeof dlg.showModal !== 'function') return;
  fillLegalNotices();
  if (!dlg.open) dlg.showModal();
}

function initAboutDialog() {
  if (typeof document === 'undefined' || state.isProjectorRole) return;
  fillLegalNotices();
  document.getElementById('btn-about')?.addEventListener('click', () => {
    document.getElementById('pop-file-menu')?.hidePopover?.();
    openAboutDialog();
  });
  document.getElementById('btn-start-about')?.addEventListener('click', () => {
    document.getElementById('start-dialog')?.close();
    openAboutDialog();
  });
  document.getElementById('btn-about-close')?.addEventListener('click', () => document.getElementById('about-dialog')?.close());
}

// ----------------------------------------------------------------------------
// BOOT
// ----------------------------------------------------------------------------
function initBetaModule(restoredAutosave = false, opts = {}) {
  if (state.isProjectorRole) return;
  initBetaErrorCapture();
  initShowCheck();
  initBetaReport();
  initAboutDialog();
  const pending = opts.pending || null;
  initStartScreen(restoredAutosave);
  // A ?fresh link always lands on the Start screen (a pending choice handles itself).
  if (!pending && opts.freshLaunch && !document.getElementById('start-dialog')?.open) openStartScreen({ hasSession: false });
  initFreshStart(restoredAutosave, pending);
  setTimeout(() => { betaShowFileState.bootDone = true; }, 1500);
}
