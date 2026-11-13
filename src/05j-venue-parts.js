// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05j · VENUE PARTS — BUILD ANY STAGE, ROOM OR OUTDOOR SITE (v2.2)
// ----------------------------------------------------------------------------
// state.venueParts[] = oriented boxes with a semantic kind. They join the
// venue layout (getVenueLayout().boxes), so they are lit by the previz, cast
// shadows, stop projector / fixture beams, are walkable (platforms & steps),
// pickable, movable in ortho views, and mappable face by face.
// posM = [centre X, bottom elevation Y, centre Z]; sizeM = [W, H, D]; yawDeg.
// ============================================================================

const VENUE_PART_KINDS = {
  platform: { label: 'Platform / riser', icon: '▭', size: [2.4, 0.4, 2.0], walk: true, color: '#3a3532' },
  steps: { label: 'Steps', icon: '☰', size: [1.2, 0.6, 1.2], walk: true, steps: 3, color: '#3a3532' },
  wall: { label: 'Wall', icon: '▮', size: [4.0, 3.0, 0.2], color: '#7a756f' },
  column: { label: 'Column', icon: '▯', size: [0.4, 3.5, 0.4], color: '#8a8580' },
  block: { label: 'Set block (mappable)', icon: '◼', size: [1.0, 1.0, 1.0], color: '#c9c6c0' },
  flat: { label: 'Set flat (mappable)', icon: '▤', size: [2.4, 2.4, 0.08], color: '#d4d1cb' },
  building: { label: 'Building / facade', icon: '🏛', size: [16, 10, 8], color: '#a39b90' },
  truss: { label: 'Truss bar', icon: '⎯', size: [6.0, 0.3, 0.3], elev: 5.0, color: '#4a4b50' }
};

function ensureVenuePartsState() {
  if (!Array.isArray(state.venueParts)) state.venueParts = [];
  if (!Number.isFinite(state.nextVenuePartNum)) state.nextVenuePartNum = state.venueParts.length + 1;
  return state.venueParts;
}

function markVenuePartsDirty() {
  state._venuePartsRev = (state._venuePartsRev || 0) + 1;
  if (typeof markStagePlanDirty === 'function') markStagePlanDirty();
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
}

function createVenuePart(kind = 'block', overrides = {}) {
  const k = VENUE_PART_KINDS[kind] ? kind : 'block';
  const def = VENUE_PART_KINDS[k];
  const num = state.nextVenuePartNum || 1;
  const part = {
    id: overrides.id || `vpart_${num}_${Math.random().toString(36).slice(2, 5)}`,
    kind: k,
    name: `${def.label.replace(/ \(.*\)$/, '')} ${num}`,
    posM: [0, def.elev || 0, 0],
    sizeM: [...def.size],
    yawDeg: 0,
    color: def.color,
    enabled: true,
    ...overrides
  };
  part.kind = k;
  part.posM = (Array.isArray(part.posM) ? part.posM : [0, 0, 0]).map(n => Number(n) || 0);
  part.sizeM = (Array.isArray(part.sizeM) ? part.sizeM : def.size).map((n, i) => clamp(Number(n) || def.size[i], 0.02, 200));
  part.yawDeg = Number(part.yawDeg) || 0;
  return part;
}

// Sensible drop point: in front of the stage for floor pieces, behind it for walls / facades.
function suggestVenuePartPos(kind) {
  const lay = typeof getVenueLayout === 'function' ? getVenueLayout() : null;
  if (!lay) return [0, 0, 0];
  const sr = lay.stageRect;
  const cx = (sr.x0 + sr.x1) * 0.5;
  const n = (state.venueParts || []).length;
  const jitter = ((n % 5) - 2) * 0.9;
  if (kind === 'building') return [cx, 0, sr.z0 - 5];
  if (kind === 'wall') return [cx + jitter, 0, sr.z0 - 0.3];
  if (kind === 'truss') return [cx, 5.0, (sr.z0 + sr.z1) * 0.5];
  // Floor pieces stand on the deck if they land on it.
  const x = cx + jitter, z = (sr.z0 + sr.z1) * 0.5;
  return [x, typeof getVenueFloorHeightAtExcluding === 'function' ? getVenueFloorHeightAtExcluding(x, z, null) : lay.deckH, z];
}

function addVenuePart(kind = 'block', overrides = {}) {
  ensureVenuePartsState();
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint(`Add ${VENUE_PART_KINDS[kind]?.label || 'part'}`);
  const part = createVenuePart(kind, { posM: suggestVenuePartPos(kind), ...overrides });
  state.nextVenuePartNum = (state.nextVenuePartNum || 1) + 1;
  state.venueParts.push(part);
  markVenuePartsDirty();
  selectVenuePart(part.id);
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return part;
}

function getVenuePartById(id) {
  return (state.venueParts || []).find(p => p && p.id === id) || null;
}

function selectVenuePart(id) {
  const p = getVenuePartById(id);
  if (!p) return;
  state.rigSelectedKind = 'venue_part';
  state.selectedVenuePartId = id;
  state.venueSel = { kind: 'venue_part', id };
  if (typeof setActiveSelection === 'function') setActiveSelection('venue_part', id, p.name);
  if (typeof isBuildRoom === 'function' && isBuildRoom()) {
    if (typeof syncRigWorkspaceUI === 'function') syncRigWorkspaceUI();
    if (typeof renderWorldDocksUI === 'function') renderWorldDocksUI();
  }
}

function duplicateVenuePart(id) {
  const p = getVenuePartById(id);
  if (!p) return null;
  const off = p.kind === 'wall' || p.kind === 'flat' ? [p.sizeM[0], 0, 0] : [p.sizeM[0] + 0.2, 0, 0];
  const c = Math.cos((p.yawDeg * Math.PI) / 180), s = Math.sin((p.yawDeg * Math.PI) / 180);
  return addVenuePart(p.kind, {
    sizeM: [...p.sizeM], yawDeg: p.yawDeg, color: p.color,
    posM: [p.posM[0] + off[0] * c, p.posM[1], p.posM[2] + off[0] * s]
  });
}

function removeVenuePart(id) {
  const list = ensureVenuePartsState();
  const i = list.findIndex(p => p.id === id);
  if (i < 0) return false;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Delete venue part');
  list.splice(i, 1);
  if (state.selectedVenuePartId === id) state.selectedVenuePartId = null;
  if (state.venueSel && state.venueSel.id === id) state.venueSel = null;
  if (state.rigSelectedKind === 'venue_part') state.rigSelectedKind = 'none';
  // Surfaces linked to its faces stay, unlinked (their look is kept).
  for (const s of state.surfaces || []) if (s.linkObject && s.linkObject.kind === 'part' && s.linkObject.id === id) delete s.linkObject;
  markVenuePartsDirty();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return true;
}

// ----------------------------------------------------------------------------
// Geometry: oriented boxes (centre c, half-axes ax/ay/az)
// ----------------------------------------------------------------------------
function venuePartOBoxes(part) {
  const def = VENUE_PART_KINDS[part.kind] || VENUE_PART_KINDS.block;
  const [w, h, d] = part.sizeM;
  const yaw = ((Number(part.yawDeg) || 0) * Math.PI) / 180;
  const ux = [Math.cos(yaw), 0, Math.sin(yaw)];
  const uz = [-Math.sin(yaw), 0, Math.cos(yaw)];
  const mk = (lx, ly, lz, hw, hh, hd) => {
    const c = [part.posM[0] + ux[0] * lx + uz[0] * lz, part.posM[1] + ly, part.posM[2] + ux[2] * lx + uz[2] * lz];
    return { c, ax: ux.map(n => n * hw), ay: [0, hh, 0], az: uz.map(n => n * hd) };
  };
  if (part.kind === 'steps') {
    // Treads rise towards local -Z (upstage when yaw = 0).
    const n = Math.max(2, Math.min(12, Math.round(def.steps || 3)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const th = h * (i + 1) / n, td = d / n;
      out.push(mk(0, th * 0.5, d * 0.5 - td * (i + 0.5), w * 0.5, th * 0.5, td * 0.5));
    }
    return out;
  }
  return [mk(0, h * 0.5, 0, w * 0.5, h * 0.5, d * 0.5)];
}

function oboxToAabb(ob) {
  const ext = [0, 1, 2].map(i => Math.abs(ob.ax[i]) + Math.abs(ob.ay[i]) + Math.abs(ob.az[i]));
  return { min: ob.c.map((v, i) => v - ext[i]), max: ob.c.map((v, i) => v + ext[i]) };
}

// Ray vs oriented box: transform into the box frame, slab test, rotate the normal back.
function rayHitOBox(ox, oy, oz, dx, dy, dz, ob, tMin = 0.08) {
  const axes = [ob.ax, ob.ay, ob.az];
  const half = axes.map(a => Math.hypot(a[0], a[1], a[2]) || 1e-6);
  const unit = axes.map((a, i) => a.map(n => n / half[i]));
  const ro = [ox - ob.c[0], oy - ob.c[1], oz - ob.c[2]];
  const lo = unit.map(u => ro[0] * u[0] + ro[1] * u[1] + ro[2] * u[2]);
  const ld = unit.map(u => dx * u[0] + dy * u[1] + dz * u[2]);
  const h = rayHitAabb(lo[0], lo[1], lo[2], ld[0], ld[1], ld[2], half.map(n => -n), half, tMin);
  if (!h) return null;
  const n = h.normal;
  const wn = [0, 1, 2].map(i => unit[0][i] * n[0] + unit[1][i] * n[1] + unit[2][i] * n[2]);
  return { t: h.t, normal: wn, inside: h.inside, localNormal: n };
}

function pointInOBoxXZ(x, z, ob) {
  const rx = x - ob.c[0], rz = z - ob.c[2];
  for (const a of [ob.ax, ob.az]) {
    const len2 = a[0] * a[0] + a[2] * a[2];
    if (len2 < 1e-9) continue;
    if (Math.abs((rx * a[0] + rz * a[2]) / len2) > 1.0001) return false;
  }
  return true;
}

// Layout boxes contributed by parts (consumed by getVenueLayout).
function collectVenuePartLayoutBoxes() {
  const out = [];
  for (const part of state.venueParts || []) {
    if (!part || part.enabled === false) continue;
    const def = VENUE_PART_KINDS[part.kind] || VENUE_PART_KINDS.block;
    venuePartOBoxes(part).forEach((ob, i) => {
      const bb = oboxToAabb(ob);
      out.push({ id: `part:${part.id}:${i}`, kind: def.walk ? 'deck' : 'part', partId: part.id, partKind: part.kind, obb: ob, min: bb.min, max: bb.max, color: part.color });
    });
  }
  return out;
}

function venuePartsLayoutKey() {
  return String(state._venuePartsRev || 0) + ':' + (state.venueParts || []).length;
}

function getVenueFloorHeightAtExcluding(x, z, excludePartId) {
  const lay = getVenueLayout();
  let h = 0;
  for (const b of lay.boxes) {
    if (b.kind !== 'deck' || (excludePartId && b.partId === excludePartId)) continue;
    const inside = b.obb ? pointInOBoxXZ(x, z, b.obb) : (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2]);
    if (inside) h = Math.max(h, b.max[1]);
  }
  return h;
}

// ----------------------------------------------------------------------------
// Map onto a face: an exact quad surface through the lighting projector
// ----------------------------------------------------------------------------
// face: '+x' '-x' '+y' '-y' '+z' '-z' (local box axes). Corners BL, BR, TR, TL seen from outside.
function getVenuePartFaceCorners(part, face) {
  const ob = venuePartOBoxes({ ...part, kind: part.kind === 'steps' ? 'block' : part.kind })[0];
  const sgn = face[0] === '-' ? -1 : 1;
  const axis = face[1];
  const A = { x: ob.ax, y: ob.ay, z: ob.az };
  const n = A[axis].map(v => v * sgn);
  const c = ob.c.map((v, i) => v + n[i]);
  // up (v) and right (u) on the face, u = v × n̂
  const v = axis === 'y' ? (sgn > 0 ? ob.az.map(q => -q) : ob.az) : ob.ay;
  const nl = Math.hypot(n[0], n[1], n[2]) || 1, vl = Math.hypot(v[0], v[1], v[2]) || 1;
  const nn = n.map(q => q / nl), vn = v.map(q => q / vl);
  const un = [vn[1] * nn[2] - vn[2] * nn[1], vn[2] * nn[0] - vn[0] * nn[2], vn[0] * nn[1] - vn[1] * nn[0]];
  const uAx = axis === 'x' ? ob.az : ob.ax;
  const hu = Math.hypot(uAx[0], uAx[1], uAx[2]);
  const hv = vl;
  const P = (su, sv) => [0, 1, 2].map(i => c[i] + un[i] * hu * su + vn[i] * hv * sv);
  return { corners: [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], center: c, normal: nn };
}

// The face most squarely lit by the projector that covers the part.
function pickVenuePartFaceForProjector(part, hintNormal = null) {
  const faces = ['+x', '-x', '+y', '-y', '+z', '-z'];
  if (hintNormal) {
    let best = null, bd = -2;
    for (const f of faces) {
      const g = getVenuePartFaceCorners(part, f);
      const d = g.normal[0] * hintNormal[0] + g.normal[1] * hintNormal[1] + g.normal[2] * hintNormal[2];
      if (d > bd) { bd = d; best = f; }
    }
    return best;
  }
  const center = [part.posM[0], part.posM[1] + part.sizeM[1] * 0.5, part.posM[2]];
  const R = typeof pickRefForWorldPoint === 'function' ? pickRefForWorldPoint(center) : null;
  const eye = R?.opt?.eye || R?.eye || null;
  if (!eye) return '+z';
  let best = '+z', bd = -2;
  for (const f of faces) {
    const g = getVenuePartFaceCorners(part, f);
    const toEye = [eye[0] - g.center[0], eye[1] - g.center[1], eye[2] - g.center[2]];
    const l = Math.hypot(...toEye) || 1;
    const d = (g.normal[0] * toEye[0] + g.normal[1] * toEye[1] + g.normal[2] * toEye[2]) / l;
    if (d > bd) { bd = d; best = f; }
  }
  return best;
}

// Which projectors actually light a face: the face must point towards the projector and at
// least a quarter of it must fall inside that projector's image. Best coverage first.
function getVenuePartFaceCoverage(part, face) {
  const g = getVenuePartFaceCorners(part, face);
  const out = [];
  for (const R of getAllProjectorRefs()) {
    const eye = R.opt?.eye || R.scr.posM;
    if (!Array.isArray(eye)) continue;
    const toProj = [eye[0] - g.center[0], eye[1] - g.center[1], eye[2] - g.center[2]];
    if (toProj[0] * g.normal[0] + toProj[1] * g.normal[1] + toProj[2] * g.normal[2] <= 0) continue; // back face
    // Sample a 5×5 grid over the face: the share of it inside this projector's image.
    const [c0, c1, c2, c3] = g.corners;
    let inside = 0, total = 0;
    for (let iy = 0; iy < 5; iy++) for (let ix = 0; ix < 5; ix++) {
      const u = (ix + 0.5) / 5, v = (iy + 0.5) / 5;
      const P = [0, 1, 2].map(k => (c0[k] * (1 - u) + c1[k] * u) * (1 - v) + (c3[k] * (1 - u) + c2[k] * u) * v);
      total++;
      const uv = worldToStageUvViaRef(P, R);
      if (!uv) continue;
      const pu = (uv[0] - R.crop.x) / R.crop.w, pv = (uv[1] - R.crop.y) / R.crop.h;
      if (pu >= 0 && pu <= 1 && pv >= 0 && pv <= 1) inside++;
    }
    const coverage = inside / total;
    if (coverage >= 0.25) out.push({ R, index: R.scr.index, coverage });
  }
  return out.sort((a, b) => b.coverage - a.coverage || a.index - b.index);
}

// Every enabled projector as a stage-UV reference — unlike the previz refs this ignores the
// 3D view's projector solo (soloing or aligning P2 must not re-fit surfaces meant for P1).
function getAllProjectorRefs() {
  const mp = ensureMultiProjectorState();
  const field = solveStagePlanOpticalField(mp);
  const refs = [];
  for (const scr of mp.screens || []) {
    if (!scr || scr.enabled === false) continue;
    const opt = field?.opticsByIndex?.get(scr.index);
    if (opt) refs.push({ scr, opt, crop: getEffectiveProjectorCrop(scr, mp) });
  }
  return refs;
}

// link.proj pins the face to one projector (multi-projector mapping): if that projector is
// gone or switched off, the surface keeps its last geometry (null) instead of jumping to
// another lens. Without link.proj: the projector that lights it best.
function computeVenuePartFaceStagePoints(link) {
  const part = getVenuePartById(link.id);
  if (!part || part.enabled === false) return null;
  const g = getVenuePartFaceCorners(part, link.face || '+z');
  let R = null;
  if (link.proj) {
    R = getAllProjectorRefs().find(r => r.scr.index === Number(link.proj)) || null;
    if (!R) return null;
  } else {
    R = getVenuePartFaceCoverage(part, link.face || '+z')[0]?.R || null;
  }
  if (!R) return null;
  const pts = g.corners.map(c => worldToStageUvViaRef(c, R));
  return pts.every(Boolean) ? { type: 'quad', points: pts, ref: R.scr.index } : null;
}

function mapMediaOntoVenuePart(id, face = null) {
  const part = getVenuePartById(id);
  if (!part) return null;
  const f = face || pickVenuePartFaceForProjector(part, state.venueSel?.normal || null);
  const faceNames = { '+z': 'front', '-z': 'back', '+x': 'right', '-x': 'left', '+y': 'top', '-y': 'bottom' };
  const faceName = faceNames[f] || f;
  const existing = (state.surfaces || []).filter(s => s.linkObject && s.linkObject.kind === 'part' && s.linkObject.id === id && s.linkObject.face === f);
  const cov = getVenuePartFaceCoverage(part, f);
  const mp0 = state.multiProjector || {};
  // Shows saved before per-projector mapping have unpinned links: pin them to the projector that
  // lights the face best, so adding the others never doubles that projector's image.
  for (const s0 of existing) {
    if (!s0.linkObject.proj && cov[0]) s0.linkObject.proj = cov[0].index;
  }
  // Already mapped: with multi-projector output, add surfaces only for projectors that light the
  // face but don't have one yet (e.g. output switched on after mapping, or one was deleted).
  const missing = mp0.enabled ? cov.filter(c => !existing.some(s => Number(s.linkObject.proj) === c.index)) : [];
  if (existing.length && !missing.length) {
    if (typeof selectSurface === 'function') selectSurface(existing[0].id);
    return existing[0];
  }
  if (!cov.length) {
    if (typeof showToast === 'function') showToast(`No projector reaches the ${faceName} face of ${part.name} — aim one at it in BUILD first`);
    return null;
  }
  const mp = state.multiProjector || {};
  // With multi-projector output each projector shows its own part of the stage, so every
  // projector that lights the face gets its own exactly fitted surface. Without it all
  // projectors show the same stage, so one surface through the best projector.
  const useProjs = existing.length ? missing : (mp.enabled ? cov : cov.slice(0, 1));
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Map onto face');
  const made = [];
  for (const s0 of existing) {
    if (s0.linkObject.proj && !/ · P\d+$/.test(s0.name || '')) s0.name = `${s0.name} · P${s0.linkObject.proj}`;
  }
  for (const c of useProjs) {
    const link = { kind: 'part', id, face: f, proj: c.index };
    const g = computeVenuePartFaceStagePoints(link);
    if (!g) continue;
    const surf = createSurface('quad', {
      name: `◼ ${part.name} · ${faceName}${useProjs.length + existing.length > 1 ? ` · P${c.index}` : ''}`,
      sourceId: state.activeSourceId || 'src_shards',
      points: g.points,
      linkObject: link
    });
    applyLinkedGeometry(surf);
    state.surfaces.unshift(surf);
    made.push(surf);
  }
  if (!made.length) {
    if (typeof showToast === 'function') showToast(`No projector reaches the ${faceName} face of ${part.name} — aim one at it in BUILD first`);
    return null;
  }
  if (typeof selectSurface === 'function') selectSurface(made[made.length - 1].id);
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof renderSurfaceList === 'function') renderSurfaceList();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') {
    const via = made.map(sf => `P${sf.linkObject.proj}`).join(' + ');
    const more = !mp.enabled && cov.length > 1 ? ` — also lit by ${cov.slice(1).map(c => 'P' + c.index).join(', ')}: turn on multi-projector output (Output tab) to map it through each` : ' — it follows the part and the projector';
    showToast(`◼ ${part.name}: ${faceName} face mapped exactly through ${via}${more}`);
  }
  return made[made.length - 1];
}

// ----------------------------------------------------------------------------
// BUILD inspector + outliner rows
// ----------------------------------------------------------------------------
function renderVenuePartInspector(host) {
  const part = getVenuePartById(state.selectedVenuePartId);
  if (!part) {
    host.innerHTML = `<div class="mono-dim">No venue part selected — use <strong>+Part</strong> to build platforms, walls, steps, set pieces or a facade.</div>`;
    return;
  }
  const def = VENUE_PART_KINDS[part.kind] || VENUE_PART_KINDS.block;
  const f2 = n => (Number(n) || 0).toFixed(2);
  const kindOpts = Object.entries(VENUE_PART_KINDS).map(([k, d]) => `<option value="${k}"${k === part.kind ? ' selected' : ''}>${d.icon} ${escapeHtml(d.label)}</option>`).join('');
  host.innerHTML = `
    <div class="world-card-head">
      <strong>${def.icon} ${escapeHtml(part.name)}</strong>
      <div style="display:flex;gap:4px;">
        <label class="chk-pill"><input type="checkbox" id="we-part-en" ${part.enabled !== false ? 'checked' : ''}> On</label>
        <button type="button" class="btn" id="we-part-dup" title="Duplicate next to it">⧉</button>
        <button type="button" class="btn danger" id="we-part-del" title="Delete part">🗑</button>
      </div>
    </div>
    <div class="world-card-grid" style="margin-top:4px;">
      <label class="mini-field"><span>Name</span><input type="text" class="text-in" id="we-part-name" value="${escapeHtml(part.name)}"></label>
      <label class="mini-field"><span>Kind</span><select class="sel-in" id="we-part-kind">${kindOpts}</select></label>
    </div>
    <div class="world-card-grid3" style="margin-top:4px;">
      <label class="mini-field"><span>X (m)</span><input type="number" step="0.05" class="num-in we-part-num" data-k="posM" data-i="0" value="${f2(part.posM[0])}"></label>
      <label class="mini-field"><span>Elev (m)</span><input type="number" step="0.05" class="num-in we-part-num" data-k="posM" data-i="1" value="${f2(part.posM[1])}"></label>
      <label class="mini-field"><span>Z (m)</span><input type="number" step="0.05" class="num-in we-part-num" data-k="posM" data-i="2" value="${f2(part.posM[2])}"></label>
      <label class="mini-field"><span>Width</span><input type="number" min="0.02" step="0.05" class="num-in we-part-num" data-k="sizeM" data-i="0" value="${f2(part.sizeM[0])}"></label>
      <label class="mini-field"><span>Height</span><input type="number" min="0.02" step="0.05" class="num-in we-part-num" data-k="sizeM" data-i="1" value="${f2(part.sizeM[1])}"></label>
      <label class="mini-field"><span>Depth</span><input type="number" min="0.02" step="0.05" class="num-in we-part-num" data-k="sizeM" data-i="2" value="${f2(part.sizeM[2])}"></label>
    </div>
    <div class="world-card-grid3" style="margin-top:4px;align-items:end;">
      <label class="mini-field"><span>Yaw (°)</span><input type="number" step="5" class="num-in we-part-num" data-k="yawDeg" value="${(Number(part.yawDeg) || 0).toFixed(1)}"></label>
      <label class="mini-field"><span>Colour</span><input type="color" id="we-part-col" value="${escapeHtml(part.color || def.color)}"></label>
      <button type="button" class="btn" id="we-part-floor" title="Drop onto whatever is below (deck, platform or floor)">⤓ Drop</button>
    </div>
    <div class="btn-row" style="gap:3px;margin-top:6px;flex-wrap:wrap;">
      <span class="mono-dim" style="align-self:center;">Map onto face:</span>
      ${['+z', '-z', '-x', '+x', '+y'].map(f => `<button type="button" class="btn emerald we-part-map" data-face="${f}">${({ '+z': 'Front', '-z': 'Back', '-x': 'Left', '+x': 'Right', '+y': 'Top' })[f]}</button>`).join('')}
      <button type="button" class="btn primary we-part-map" data-face="" title="The face that looks most squarely at its projector">Auto</button>
    </div>
    <div class="mono-dim" style="margin-top:4px;line-height:1.45;">${def.walk ? 'Walkable: people, spots and marks stand on it. ' : ''}Arrows nudge 1 cm (Shift 10 cm, Alt 2 mm) · drag it in Top/Front/Side views · lit, shadowed and beam-blocking in 3D.</div>
  `;
  const commit = () => {
    markVenuePartsDirty();
    if (typeof commitRigPhysicalChange === 'function') commitRigPhysicalChange();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    renderWorldDocksUI();
  };
  const begin = (label) => { if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint(label, `vpart:${part.id}:${label}`); };
  host.querySelector('#we-part-en')?.addEventListener('change', (e) => { begin('Toggle part'); part.enabled = e.target.checked; commit(); });
  host.querySelector('#we-part-del')?.addEventListener('click', () => { removeVenuePart(part.id); renderWorldDocksUI(); });
  host.querySelector('#we-part-dup')?.addEventListener('click', () => duplicateVenuePart(part.id));
  host.querySelector('#we-part-name')?.addEventListener('change', (e) => { part.name = String(e.target.value || part.name).slice(0, 48); commit(); });
  host.querySelector('#we-part-kind')?.addEventListener('change', (e) => { begin('Change part kind'); part.kind = VENUE_PART_KINDS[e.target.value] ? e.target.value : part.kind; commit(); });
  host.querySelector('#we-part-col')?.addEventListener('change', (e) => { part.color = e.target.value; commit(); });
  host.querySelector('#we-part-floor')?.addEventListener('click', () => {
    begin('Drop part');
    part.posM[1] = getVenueFloorHeightAtExcluding(part.posM[0], part.posM[2], part.id);
    commit();
  });
  host.querySelectorAll('.we-part-num').forEach(inp => inp.addEventListener('change', () => {
    const v = parseFloat(inp.value);
    if (!Number.isFinite(v)) return;
    begin('Edit part');
    if (inp.dataset.k === 'yawDeg') part.yawDeg = ((v + 540) % 360) - 180;
    else if (inp.dataset.k === 'sizeM') part.sizeM[Number(inp.dataset.i)] = clamp(v, 0.02, 200);
    else part.posM[Number(inp.dataset.i)] = clamp(v, -500, 500);
    commit();
  }));
  host.querySelectorAll('.we-part-map').forEach(b => b.addEventListener('click', () => {
    mapMediaOntoVenuePart(part.id, b.dataset.face || null);
    renderWorldDocksUI();
  }));
}

function buildVenuePartOutlinerRows() {
  return ensureVenuePartsState().map(part => {
    const def = VENUE_PART_KINDS[part.kind] || VENUE_PART_KINDS.block;
    const sel = state.rigSelectedKind === 'venue_part' && state.selectedVenuePartId === part.id;
    return `
      <div class="world-node-row${sel ? ' active' : ''}${part.enabled === false ? ' spot-disabled' : ''}" data-kind="vpart" data-id="${escapeHtml(part.id)}">
        <button type="button" class="world-node-pick"><span>${def.icon} ${escapeHtml(part.name)} (${part.sizeM.map(n => n.toFixed(1)).join('×')} m)</span></button>
        <button type="button" class="icon-btn world-node-del" data-del="vpart" data-id="${escapeHtml(part.id)}" title="Delete part">✕</button>
      </div>`;
  }).join('');
}

function initVenuePartsControls() {
  if (typeof document === 'undefined') return;
  ensureVenuePartsState();
  const sel = document.getElementById('sel-world-add-part');
  sel?.addEventListener('change', () => {
    const k = sel.value;
    sel.value = '';
    if (VENUE_PART_KINDS[k]) addVenuePart(k);
  });
}
