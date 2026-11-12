// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05k · ALIGN A PROJECTOR BY POINTS (v2.2) — precise & simple calibration
// ----------------------------------------------------------------------------
// 1. Click known points in the 3D Venue (corners snap: screens, venue parts,
//    stage deck). Each becomes a pin, first placed where the current model
//    thinks the projector hits it.
// 2. The selected pin shows as a crosshair on the real projector output. Move
//    it with the arrows (1 px · Shift 10 px · Alt 0.2 px) until it sits on the
//    real corner. Tab cycles pins, ⌫ removes one.
// 3. With 4+ pins the projector pose (position, aim, roll — and throw with 6+)
//    is solved by Levenberg–Marquardt on the reprojection error, live.
//    Enter keeps the result, Esc restores the original pose.
// ============================================================================

function getAlignProjector() {
  const pa = state.projAlign;
  if (!pa || !pa.active) return null;
  return (state.multiProjector?.screens || []).find(s => s.index === pa.projIndex) || null;
}

function getProjectorNativeRes() {
  const mp = state.multiProjector || {};
  return [Math.max(320, Number(mp.projNativeW) || 1920), Math.max(240, Number(mp.projNativeH) || 1080)];
}

// Lightweight projector model (same axes as computeProjectorOptics3D, no raycasting).
// params: [ex, ey, ez, yawRad, pitchRad, rollRad, logThrow]
function alignParamsFromProjector(scr) {
  const e = scr.posM, a = scr.aimM;
  const f = [a[0] - e[0], a[1] - e[1], a[2] - e[2]];
  const l = Math.hypot(f[0], f[1], f[2]) || 1;
  const yaw = Math.atan2(f[0] / l, -f[2] / l);
  const pitch = Math.asin(clamp(f[1] / l, -1, 1));
  return [e[0], e[1], e[2], yaw, pitch, ((Number(scr.rollDeg) || 0) * Math.PI) / 180, Math.log(clamp(Number(scr.throwRatio) || 1.2, 0.28, 5))];
}

function alignAxesFromParams(p) {
  const [, , , yaw, pitch, roll] = p;
  const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  let up = [0, 1, 0];
  if (Math.abs(f[1]) > 0.995) up = [0, 0, f[1] > 0 ? 1 : -1];
  let r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  r = r.map(n => n / rl);
  let u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  if (Math.abs(roll) > 1e-7) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const nr = r.map((n, i) => n * c + u[i] * s);
    const nu = r.map((n, i) => -n * s + u[i] * c);
    r = nr; u = nu;
  }
  return { f, r, u };
}

// World point → projector raster (pu right, pv up, 0..1).
function alignProject(p, P, scr, aspect) {
  const { f, r, u } = alignAxesFromParams(p);
  const d = [P[0] - p[0], P[1] - p[1], P[2] - p[2]];
  const zf = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (zf < 0.05) return null;
  const wUnit = 1 / Math.exp(p[6]), hUnit = wUnit / aspect;
  const cx0 = 0.5 + clamp(Number(scr.lensShiftX) || 0, -0.8, 0.8);
  const cy0 = 0.5 + clamp(Number(scr.lensShiftY) || 0, -0.8, 0.8);
  return [(d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (zf * wUnit) + cx0, (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (zf * hUnit) + cy0];
}

function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-14) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let k2 = c; k2 <= n; k2++) M[r][k2] -= k * M[c][k2];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Levenberg–Marquardt on pixel reprojection error. Returns { params, rmsPx }.
function solveProjectorPoseFromPins(scr, pins, opts = {}) {
  const [W, H] = getProjectorNativeRes();
  const aspect = W / H;
  const solveThrow = opts.solveThrow ?? pins.length >= 6;
  const free = solveThrow ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5];
  let p = opts.start ? [...opts.start] : alignParamsFromProjector(scr);
  const resid = (q) => {
    const out = [];
    for (const pin of pins) {
      const uv = alignProject(q, pin.world, scr, aspect);
      if (!uv) { out.push(5, 5); continue; }
      out.push((uv[0] - pin.pu) * W, (uv[1] - pin.pv) * H);
    }
    return out;
  };
  const cost = (r) => r.reduce((s, v) => s + v * v, 0);
  let r = resid(p), c = cost(r), lambda = 1e-2;
  const steps = [1e-4, 1e-4, 1e-4, 1e-5, 1e-5, 1e-5, 1e-5];
  for (let it = 0; it < 80; it++) {
    const J = r.map(() => new Array(free.length).fill(0));
    free.forEach((pi, j) => {
      const q = [...p];
      q[pi] += steps[pi];
      const rq = resid(q);
      for (let i = 0; i < r.length; i++) J[i][j] = (rq[i] - r[i]) / steps[pi];
    });
    const n = free.length;
    const JtJ = Array.from({ length: n }, () => new Array(n).fill(0));
    const Jtr = new Array(n).fill(0);
    for (let i = 0; i < r.length; i++) {
      for (let a = 0; a < n; a++) {
        Jtr[a] += J[i][a] * r[i];
        for (let b = 0; b < n; b++) JtJ[a][b] += J[i][a] * J[i][b];
      }
    }
    let improved = false;
    for (let tries = 0; tries < 8; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-9 : v)));
      const delta = solveLinearSystem(A, Jtr.map(v => -v));
      if (!delta) { lambda *= 10; continue; }
      const q = [...p];
      free.forEach((pi, j) => { q[pi] += delta[j]; });
      q[4] = clamp(q[4], -1.55, 1.55);
      q[6] = clamp(q[6], Math.log(0.28), Math.log(5));
      const rq = resid(q), cq = cost(rq);
      if (cq < c) { p = q; r = rq; lambda = Math.max(1e-7, lambda * 0.3); improved = Math.abs(c - cq) > 1e-10; c = cq; break; }
      lambda *= 10;
    }
    if (!improved) break;
  }
  return { params: p, rmsPx: Math.sqrt(c / Math.max(1, pins.length)), solvedThrow: solveThrow };
}

function applyAlignParamsToProjector(scr, p) {
  const { f } = alignAxesFromParams(p);
  const dist = Math.max(1, Number(state.projAlign?.aimDist) || 5);
  scr.posM = [p[0], p[1], p[2]].map(n => Number(n.toFixed(4)));
  scr.aimM = [p[0] + f[0] * dist, p[1] + f[1] * dist, p[2] + f[2] * dist].map(n => Number(n.toFixed(4)));
  scr.rollDeg = Number(((p[5] * 180) / Math.PI).toFixed(3));
  scr.throwRatio = Number(Math.exp(p[6]).toFixed(4));
  scr._autoPose = false;
  if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
  if (typeof markStagePlanDirty === 'function') markStagePlanDirty();
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
}

// ----------------------------------------------------------------------------
// Session
// ----------------------------------------------------------------------------
function beginProjectorPointAlign(projIndex) {
  const scr = (state.multiProjector?.screens || []).find(s => s.index === Number(projIndex));
  if (!scr) return false;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint(`Align P${scr.index} by points`);
  const e = scr.posM, a = scr.aimM;
  state.projAlign = {
    active: true, projIndex: scr.index, pins: [], sel: -1, rmsPx: null,
    orig: { posM: [...scr.posM], aimM: [...scr.aimM], rollDeg: scr.rollDeg || 0, throwRatio: scr.throwRatio },
    aimDist: Math.hypot(a[0] - e[0], a[1] - e[1], a[2] - e[2]) || 5
  };
  const sp = typeof ensureStagePlanState === 'function' ? ensureStagePlanState(ensureMultiProjectorState()) : null;
  if (sp) { sp.previzSolo = scr.index; }
  syncProjectorAlignUI();
  if (typeof showToast === 'function') showToast(`📐 Align P${scr.index}: click 4–8 known points in the 3D view (corners snap)`);
  return true;
}

function endProjectorPointAlign(keep = true) {
  const pa = state.projAlign;
  if (!pa || !pa.active) return;
  const scr = getAlignProjector();
  if (scr && !keep) {
    scr.posM = [...pa.orig.posM];
    scr.aimM = [...pa.orig.aimM];
    scr.rollDeg = pa.orig.rollDeg;
    scr.throwRatio = pa.orig.throwRatio;
    if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr);
    if (typeof markStagePlanDirty === 'function') markStagePlanDirty();
  }
  pa.active = false;
  state.calibCrosshair.active = false;
  const sp = state.multiProjector?.stagePlan;
  if (sp && sp.previzSolo === pa.projIndex) sp.previzSolo = 0;
  if (typeof commitRigPhysicalChange === 'function') commitRigPhysicalChange();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  syncProjectorAlignUI();
  if (typeof showToast === 'function') showToast(keep ? `📐 P${pa.projIndex} aligned${pa.rmsPx != null ? ` · ${pa.rmsPx.toFixed(1)} px RMS` : ''}` : `P${pa.projIndex} restored`);
}

// Snap candidates: corners of screens, venue parts and decks.
function collectAlignSnapPoints() {
  const pts = [];
  for (const ws of state.worldScreens || []) {
    if (ws && ws.enabled !== false && typeof getWorldScreenBasis === 'function') getWorldScreenBasis(ws).corners.forEach(c => pts.push(c));
  }
  const lay = typeof getVenueLayout === 'function' ? getVenueLayout() : null;
  for (const b of lay?.boxes || []) {
    if (b.obb) {
      const o = b.obb;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push([0, 1, 2].map(i => o.c[i] + o.ax[i] * sx + o.ay[i] * sy + o.az[i] * sz));
    } else {
      for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) pts.push([x, y, z]);
    }
  }
  return pts;
}

// Add a pin from a ray in the 3D venue (returns true if handled).
function addAlignPinFromRay(origin, dir) {
  const pa = state.projAlign;
  const scr = getAlignProjector();
  if (!scr) return false;
  let hitP = null;
  const obj = typeof pickVenueObjects === 'function' ? pickVenueObjects(origin, dir) : null;
  if (obj && obj.point) hitP = obj.point;
  const lay = typeof raycastVenueLayout === 'function' ? raycastVenueLayout(origin[0], origin[1], origin[2], dir[0], dir[1], dir[2]) : null;
  if (lay && (!hitP || lay.t < Math.hypot(hitP[0] - origin[0], hitP[1] - origin[1], hitP[2] - origin[2]))) hitP = [0, 1, 2].map(i => origin[i] + dir[i] * lay.t);
  if (!hitP && Math.abs(dir[1]) > 1e-6) {
    const t = -origin[1] / dir[1];
    if (t > 0) hitP = [origin[0] + dir[0] * t, 0, origin[2] + dir[2] * t];
  }
  if (!hitP) return true;
  // Snap to the nearest physical corner within 35 cm: corners are what you can find on the real wall.
  let best = null, bd = 0.35;
  for (const c of collectAlignSnapPoints()) {
    const d = Math.hypot(c[0] - hitP[0], c[1] - hitP[1], c[2] - hitP[2]);
    if (d < bd) { bd = d; best = c; }
  }
  const world = (best || hitP).map(n => Number(n.toFixed(4)));
  const [W, H] = getProjectorNativeRes();
  const uv = alignProject(alignParamsFromProjector(scr), world, scr, W / H) || [0.5, 0.5];
  pa.pins.push({ world, pu: uv[0], pv: uv[1], snapped: !!best });
  pa.sel = pa.pins.length - 1;
  resolveProjectorAlign();
  return true;
}

function resolveProjectorAlign() {
  const pa = state.projAlign;
  const scr = getAlignProjector();
  if (!pa || !scr) return;
  if (pa.pins.length >= 4) {
    const res = solveProjectorPoseFromPins(scr, pa.pins, { start: alignParamsFromProjector(scr) });
    // Solve from the original pose too and keep the better one (robust to a bad intermediate).
    const o = { ...scr, posM: pa.orig.posM, aimM: pa.orig.aimM, rollDeg: pa.orig.rollDeg, throwRatio: pa.orig.throwRatio };
    const res2 = solveProjectorPoseFromPins(scr, pa.pins, { start: alignParamsFromProjector(o) });
    const best = res2.rmsPx < res.rmsPx ? res2 : res;
    applyAlignParamsToProjector(scr, best.params);
    pa.rmsPx = best.rmsPx;
    pa.solvedThrow = best.solvedThrow;
  } else {
    pa.rmsPx = null;
  }
  pushAlignCrosshair();
  syncProjectorAlignUI();
}

function pushAlignCrosshair() {
  const pa = state.projAlign;
  const scr = getAlignProjector();
  if (!pa || !scr || pa.sel < 0 || !pa.pins[pa.sel]) { if (state.calibCrosshair) state.calibCrosshair.active = false; return; }
  const pin = pa.pins[pa.sel];
  const c = getEffectiveProjectorCrop(scr);
  state.calibCrosshair.active = true;
  state.calibCrosshair.x = c.x + pin.pu * c.w;
  state.calibCrosshair.y = c.y + pin.pv * c.h;
  state.calibCrosshair.expireMs = performance.now() + 3600 * 1000;
}

function nudgeAlignPin(dxPx, dyPx) {
  const pa = state.projAlign;
  if (!pa || pa.sel < 0 || !pa.pins[pa.sel]) return;
  const [W, H] = getProjectorNativeRes();
  const pin = pa.pins[pa.sel];
  pin.pu = clamp(pin.pu + dxPx / W, -0.5, 1.5);
  pin.pv = clamp(pin.pv + dyPx / H, -0.5, 1.5);
  pin.moved = true;
  resolveProjectorAlign();
}

function initProjectorAlignKeys() {
  if (typeof window === 'undefined' || window._projAlignBound) return;
  window._projAlignBound = true;
  window.addEventListener('keydown', (e) => {
    const pa = state.projAlign;
    if (!pa || !pa.active) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const step = e.shiftKey ? 10 : (e.altKey ? 0.2 : 1);
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (map[e.key]) nudgeAlignPin(map[e.key][0], map[e.key][1]);
    else if (e.key === 'Tab') {
      if (pa.pins.length) pa.sel = (pa.sel + (e.shiftKey ? -1 : 1) + pa.pins.length) % pa.pins.length;
      pushAlignCrosshair();
      syncProjectorAlignUI();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      if (pa.sel >= 0) { pa.pins.splice(pa.sel, 1); pa.sel = Math.min(pa.sel, pa.pins.length - 1); resolveProjectorAlign(); }
    } else if (e.key === 'Enter') endProjectorPointAlign(true);
    else if (e.key === 'Escape') endProjectorPointAlign(false);
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
}

// ----------------------------------------------------------------------------
// Floating panel + overlay drawing
// ----------------------------------------------------------------------------
function syncProjectorAlignUI() {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('proj-align-panel');
  const pa = state.projAlign;
  if (!pa || !pa.active) { if (el) el.hidden = true; return; }
  if (!el) return;
  if (!el._paBound) {
    el._paBound = true;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pa]');
      if (!b) return;
      const act = b.dataset.pa;
      if (act === 'keep') endProjectorPointAlign(true);
      else if (act === 'cancel') endProjectorPointAlign(false);
      else if (act === 'clear') { state.projAlign.pins = []; state.projAlign.sel = -1; resolveProjectorAlign(); }
      else if (act === 'pin') { state.projAlign.sel = Number(b.dataset.i); pushAlignCrosshair(); syncProjectorAlignUI(); }
      else if (act === 'pov') { if (typeof setVenueCameraMode === 'function') { ensureStagePlanState(ensureMultiProjectorState()).povIndex = state.projAlign.projIndex; setVenueCameraMode('pov'); } }
    });
  }
  el.hidden = false;
  const n = pa.pins.length;
  const status = n < 4 ? `Click ${4 - n} more point${4 - n === 1 ? '' : 's'} in the 3D view (corners snap)` : `Solved from ${n} points${pa.solvedThrow ? ' (incl. throw)' : ''} · <strong>${pa.rmsPx != null ? pa.rmsPx.toFixed(1) : '—'} px</strong> RMS`;
  el.innerHTML = `
    <div class="pa-head"><strong>📐 Align P${pa.projIndex} by points</strong><button type="button" class="icon-btn" data-pa="cancel" title="Cancel (Esc) — restores the original pose">✕</button></div>
    <div class="pa-status">${status}</div>
    <div class="pa-pins">${pa.pins.map((p, i) => `<button type="button" class="venue-chip${i === pa.sel ? ' active' : ''}" data-pa="pin" data-i="${i}" title="(${p.world.map(v => v.toFixed(2)).join(', ')}) m${p.snapped ? ' · snapped corner' : ''}">${p.snapped ? '◆' : '●'}${i + 1}${p.moved ? '✓' : ''}</button>`).join('') || '<span class="mono-dim">no points yet</span>'}</div>
    <div class="pa-help">Look at the real wall: move the crosshair of the selected point onto the real corner with <kbd>←↑→↓</kbd> (1 px · <kbd>Shift</kbd> 10 · <kbd>Alt</kbd> 0.2) · <kbd>Tab</kbd> next point · <kbd>⌫</kbd> remove · right- or Alt-drag orbits.</div>
    <div class="pa-actions">
      <button type="button" class="btn" data-pa="pov" title="Look through this projector">📽 POV</button>
      <button type="button" class="btn" data-pa="clear">Clear</button>
      <span style="flex:1"></span>
      <button type="button" class="btn" data-pa="cancel">Cancel <kbd>Esc</kbd></button>
      <button type="button" class="btn emerald-solid" data-pa="keep" ${n >= 4 ? '' : 'disabled'}>Keep <kbd>⏎</kbd></button>
    </div>`;
}

// Draw pins in any 3D venue view: world point (◆) and where the projector now lands it (+).
function drawProjectorAlignOverlay(ctx, mvp, cssW, cssH) {
  const pa = state.projAlign;
  const scr = getAlignProjector();
  if (!pa || !scr || !pa.pins.length) return;
  const toPx = (P) => {
    const c = venueClipPoint(P, mvp);
    if (c[3] < 0.02) return null;
    return [(c[0] / c[3] * 0.5 + 0.5) * cssW, (1 - (c[1] / c[3] * 0.5 + 0.5)) * cssH];
  };
  ctx.save();
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  pa.pins.forEach((pin, i) => {
    const p = toPx(pin.world);
    if (!p) return;
    const sel = i === pa.sel;
    ctx.strokeStyle = sel ? '#ffcb7d' : '#6fd3ff';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = sel ? 2 : 1.4;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1] - 7); ctx.lineTo(p[0] + 7, p[1]); ctx.lineTo(p[0], p[1] + 7); ctx.lineTo(p[0] - 7, p[1]); ctx.closePath();
    ctx.stroke();
    ctx.fillText(String(i + 1), p[0] + 9, p[1] - 6);
  });
  ctx.restore();
}

function initProjectorAlignModule() {
  initProjectorAlignKeys();
}
