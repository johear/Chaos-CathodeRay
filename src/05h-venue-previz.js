// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05h · VENUE MODEL, PEOPLE & LIGHT FIXTURES, WALKABLE GPU 3D PREVIZ
// ----------------------------------------------------------------------------
//  1. Venue layouts (theatre / thrust / arena / cyc / room / black box / park):
//     a physical stage deck, proscenium arch, room shell or open-air ground that
//     projector beams raycast against.
//  2. World props — scale-reference human figures that cast shadows.
//  3. DMX light fixtures placed in the world (PAR, profile, moving head, hazer).
//  4. Shared venue camera (orbit or first-person walk) used by the BUILD 3D
//     editor, the MAP/LIVE "3D Venue" feed and the Canvas2D overlays.
//  5. GPU previz: every projector casts its real output onto the venue with
//     shadow maps, plus volumetric haze beams, rendered into the main GL canvas.
//  6. Spot → projector routing & 3D convergence with per-projector trims.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. VENUE LAYOUTS
// ----------------------------------------------------------------------------
const VENUE_SHAPES = {
  proscenium: { label: 'Theatre · proscenium stage', deckH: 0.6, walls: true, arch: true, floorCol: [0.26, 0.21, 0.17], wallCol: [0.24, 0.17, 0.17], deckCol: [0.13, 0.13, 0.14] },
  thrust: { label: 'Thrust stage (audience on 3 sides)', deckH: 0.6, walls: true, thrust: true, floorCol: [0.26, 0.21, 0.17], wallCol: [0.22, 0.2, 0.21], deckCol: [0.13, 0.13, 0.14] },
  in_the_round: { label: 'Arena · in the round', deckH: 0.45, walls: true, round: true, floorCol: [0.18, 0.18, 0.19], wallCol: [0.11, 0.11, 0.12], deckCol: [0.10, 0.10, 0.11] },
  cyc: { label: 'Cyclorama studio (white walls)', deckH: 0.0, walls: true, floorCol: [0.55, 0.55, 0.55], wallCol: [0.62, 0.62, 0.62], deckCol: [0.5, 0.5, 0.5] },
  gallery: { label: 'Room / gallery (flat floor)', deckH: 0.0, walls: true, floorCol: [0.30, 0.29, 0.27], wallCol: [0.42, 0.41, 0.40], deckCol: [0.3, 0.3, 0.3] },
  blackbox: { label: 'Black box studio', deckH: 0.0, walls: true, floorCol: [0.05, 0.05, 0.05], wallCol: [0.035, 0.035, 0.04], deckCol: [0.05, 0.05, 0.05] },
  outdoor: { label: 'Outdoor park / festival', deckH: 1.0, walls: false, outdoor: true, floorCol: [0.2, 0.3, 0.13], wallCol: [0.1, 0.1, 0.1], deckCol: [0.08, 0.08, 0.09] },
  // v2.2 custom spaces: nothing but floor (+ walls) — build the rest with venue parts.
  empty_room: { label: 'Empty room (build your own)', deckH: 0.0, walls: true, custom: true, floorCol: [0.24, 0.23, 0.22], wallCol: [0.3, 0.29, 0.28], deckCol: [0.2, 0.2, 0.2] },
  open_ground: { label: 'Open ground (outdoor, build your own)', deckH: 0.0, walls: false, outdoor: true, custom: true, floorCol: [0.17, 0.2, 0.14], wallCol: [0.1, 0.1, 0.1], deckCol: [0.2, 0.2, 0.2] }
};

function getPrimaryWorldScreen() {
  const list = Array.isArray(state.worldScreens) ? state.worldScreens.filter(w => w && w.enabled !== false) : [];
  if (list.length > 0) return list[0];
  const v = state.multiProjector?.stagePlan?.venue || getDefaultVenueSpec();
  return {
    id: 'legacy',
    widthM: v.screenWidthM,
    heightM: v.screenHeightM,
    posM: [0, v.screenBottomM + v.screenHeightM * 0.5, v.screenZ],
    yawDeg: 0,
    pitchDeg: 0
  };
}

let _venueLayoutCache = null;
let _venueLayoutKey = '';

// Resolves the physical venue (deck boxes, arch, room shell) from state.worldStage
// + the stage-plan room size + the main screen. Cached on a cheap string key.
function getVenueLayout() {
  const ws = state.worldStage || { widthM: 6, heightM: 3.38, depthM: 4, shape: 'proscenium' };
  const shapeId = VENUE_SHAPES[ws.shape] ? ws.shape : 'proscenium';
  const kind = VENUE_SHAPES[shapeId];
  const v = state.multiProjector?.stagePlan?.venue || getDefaultVenueSpec();
  const main = getPrimaryWorldScreen();
  const mp0 = main.posM || [0, 2, -2.6];
  // The room always encloses the projector rig (+0.8 m) so nothing hangs outside the walls.
  let rigX = 0, rigZ0 = Infinity, rigZ1 = -Infinity, rigY = 0;
  for (const scr of state.multiProjector?.screens || []) {
    if (!Array.isArray(scr.posM)) continue;
    rigX = Math.max(rigX, Math.abs(Number(scr.posM[0]) || 0));
    rigY = Math.max(rigY, Number(scr.posM[1]) || 0);
    rigZ0 = Math.min(rigZ0, Number(scr.posM[2]) || 0);
    rigZ1 = Math.max(rigZ1, Number(scr.posM[2]) || 0);
  }
  const key = [shapeId, ws.widthM, ws.heightM, ws.depthM, ws.deckHeightM, v.roomWidthM, v.roomDepthM, v.roomHeightM,
    mp0[0], mp0[1], mp0[2], main.widthM, main.heightM, rigX.toFixed(2), rigY.toFixed(2), rigZ0.toFixed(2), rigZ1.toFixed(2),
    typeof venuePartsLayoutKey === 'function' ? venuePartsLayoutKey() : ''].join('|');
  if (_venueLayoutCache && key === _venueLayoutKey) return _venueLayoutCache;

  const deckH = clamp(Number.isFinite(Number(ws.deckHeightM)) ? Number(ws.deckHeightM) : kind.deckH, 0, 3);
  const scrW = Math.max(0.5, Number(main.widthM) || 6);
  const stageW = Math.max(clamp(Number(ws.widthM) || 6, 1, 60), scrW + 1.2);
  const depth = clamp(Number(ws.depthM) || 4, 1, 40);
  const screenZ = Number(mp0[2]) || -2.6;
  const screenX = Number(mp0[0]) || 0;
  const screenTop = (Number(mp0[1]) || 2) + (Number(main.heightM) || 3.38) * 0.5;
  const boxes = [];
  let stageRect;

  if (kind.round) {
    const cz = screenZ + depth * 0.5;
    stageRect = { x0: screenX - stageW * 0.5, x1: screenX + stageW * 0.5, z0: cz - depth * 0.5, z1: cz + depth * 0.5 };
  } else {
    const backZ = screenZ - 0.6;
    stageRect = { x0: screenX - stageW * 0.5, x1: screenX + stageW * 0.5, z0: backZ, z1: backZ + depth };
  }
  if (deckH > 0.01) {
    boxes.push({ id: 'deck', kind: 'deck', min: [stageRect.x0, 0, stageRect.z0], max: [stageRect.x1, deckH, stageRect.z1] });
    if (kind.thrust) {
      const tw = stageW * 0.24;
      boxes.push({ id: 'thrust', kind: 'deck', min: [screenX - tw, 0, stageRect.z1], max: [screenX + tw, deckH, stageRect.z1 + depth * 0.65] });
    }
  }

  // Venue parts (platforms, walls, steps, set pieces, facades …).
  const partBoxes = typeof collectVenuePartLayoutBoxes === 'function' ? collectVenuePartLayoutBoxes() : [];
  let partX = 0, partZ0 = Infinity, partZ1 = -Infinity, partY = 0;
  for (const b of partBoxes) {
    partX = Math.max(partX, Math.abs(b.min[0]), Math.abs(b.max[0]));
    partZ0 = Math.min(partZ0, b.min[2]); partZ1 = Math.max(partZ1, b.max[2]); partY = Math.max(partY, b.max[1]);
  }
  // Room shell: the stage-plan room, grown so the stage, screens, thrust & parts always fit inside.
  const halfW = Math.max(v.roomWidthM * 0.5, Math.abs(stageRect.x0) + 1.0, Math.abs(stageRect.x1) + 1.0, rigX + 0.8, partX + 0.05);
  let rz0 = Math.min(-v.roomDepthM * 0.5, stageRect.z0 - 0.5, Number.isFinite(rigZ0) ? rigZ0 - 0.8 : 0, Number.isFinite(partZ0) ? partZ0 - 0.05 : 0);
  let rz1 = Math.max(v.roomDepthM * 0.5, stageRect.z1 + 2.5 + (kind.thrust ? depth * 0.65 : 0), Number.isFinite(rigZ1) ? rigZ1 + 0.8 : 0, Number.isFinite(partZ1) ? partZ1 + 0.05 : 0);
  if (kind.round) {
    rz0 = Math.min(rz0, stageRect.z0 - 3.5);
    rz1 = Math.max(rz1, stageRect.z1 + 3.5);
  }
  const roomH = Math.max(v.roomHeightM, screenTop + 1.0, deckH + (Number(ws.heightM) || 3.4) + 1.2, rigY + 0.6, partY + 0.3);
  const room = { x0: -halfW, x1: halfW, y0: 0, y1: roomH, z0: rz0, z1: rz1, walls: !!kind.walls };

  // Proscenium arch: wall panels framing the stage opening at the downstage edge.
  if (kind.arch && kind.walls) {
    const openHalf = stageW * 0.5 + 0.15;
    const openTop = Math.min(roomH - 0.3, Math.max(deckH + (Number(ws.heightM) || 3.4), screenTop + 0.35));
    const az0 = stageRect.z1 - 0.55, az1 = stageRect.z1 - 0.25;
    if (halfW - openHalf > 0.2) {
      boxes.push({ id: 'arch_l', kind: 'arch', min: [-halfW, 0, az0], max: [screenX - openHalf, roomH, az1] });
      boxes.push({ id: 'arch_r', kind: 'arch', min: [screenX + openHalf, 0, az0], max: [halfW, roomH, az1] });
    }
    if (roomH - openTop > 0.15) {
      boxes.push({ id: 'arch_top', kind: 'arch', min: [screenX - openHalf, openTop, az0], max: [screenX + openHalf, roomH, az1] });
    }
  }

  for (const b of partBoxes) boxes.push(b);
  _venueLayoutCache = { shapeId, kind, label: kind.label, deckH, stageRect, boxes, room, outdoor: !!kind.outdoor };
  _venueLayoutKey = key;
  return _venueLayoutCache;
}

// Height of whatever you would stand on at (x, z): deck top or the floor.
function getVenueFloorHeightAt(x, z) {
  const lay = getVenueLayout();
  let h = 0;
  for (const b of lay.boxes) {
    if (b.kind !== 'deck') continue;
    const inside = b.obb ? pointInOBoxXZ(x, z, b.obb) : (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2]);
    if (inside) h = Math.max(h, b.max[1]);
  }
  return h;
}

// Ray vs AABB (slab). Returns { t, normal } for the first surface hit beyond tMin.
function rayHitAabb(ox, oy, oz, dx, dy, dz, min, max, tMin = 0.08) {
  let tNear = -Infinity, tFar = Infinity, nNear = null, nFar = null;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
      continue;
    }
    let t1 = (min[a] - o[a]) / d[a];
    let t2 = (max[a] - o[a]) / d[a];
    let n1 = [0, 0, 0], n2 = [0, 0, 0];
    n1[a] = -1; n2[a] = 1;
    if (t1 > t2) { [t1, t2] = [t2, t1]; [n1, n2] = [n2, n1]; }
    if (t1 > tNear) { tNear = t1; nNear = n1; }
    if (t2 < tFar) { tFar = t2; nFar = n2; }
    if (tNear > tFar) return null;
  }
  if (tNear > tMin) return { t: tNear, normal: nNear, inside: false };
  if (tFar > tMin) return { t: tFar, normal: nFar ? nFar.map(n => -n) : [0, 1, 0], inside: true };
  return null;
}

// Venue geometry hit for projector / fixture beams: deck, arch and room walls.
function raycastVenueLayout(ox, oy, oz, dx, dy, dz, maxT = Infinity) {
  const lay = getVenueLayout();
  let best = null;
  for (const b of lay.boxes) {
    const h = b.obb ? rayHitOBox(ox, oy, oz, dx, dy, dz, b.obb) : rayHitAabb(ox, oy, oz, dx, dy, dz, b.min, b.max);
    if (h && !h.inside && h.t < maxT && (!best || h.t < best.t)) best = { t: h.t, normal: h.normal, kind: b.kind, id: b.id, partId: b.partId };
  }
  const r0 = lay.room;
  const originInside = ox >= r0.x0 && ox <= r0.x1 && oy >= r0.y0 - 0.01 && oy <= r0.y1 && oz >= r0.z0 && oz <= r0.z1;
  // A projector outside the shell sits in a booth: it throws through its window, so only
  // interior walls are hit by beams that start inside the room.
  if (lay.room.walls && originInside) {
    const r = lay.room;
    const h = rayHitAabb(ox, oy, oz, dx, dy, dz, [r.x0, r.y0 - 0.01, r.z0], [r.x1, r.y1, r.z1]);
    if (h && h.t < maxT && (!best || h.t < best.t)) {
      const kind = Math.abs(h.normal[1]) > 0.5 ? (h.normal[1] < 0 || oy > r.y1 ? 'ceiling' : 'floor') : 'wall';
      best = { t: h.t, normal: h.normal, kind, id: kind };
    }
  }
  return best;
}

// ----------------------------------------------------------------------------
// 2. WORLD PROPS (HUMAN SCALE FIGURES)
// ----------------------------------------------------------------------------
const WORLD_PROP_KINDS = {
  human: { label: 'Human figure (1.75 m)', icon: '🧍', heightM: 1.75 },
  human_child: { label: 'Child figure (1.25 m)', icon: '🧒', heightM: 1.25 }
};

function ensureWorldPropsState() {
  if (!Array.isArray(state.worldProps)) {
    state.worldProps = [];
    state.nextWorldPropNum = 1;
  }
  if (!state._worldPropsSeeded) {
    state._worldPropsSeeded = true;
    if (state.worldProps.length === 0) {
      // Default scale reference: one performer centre-stage, 1.2 m in front of the main screen.
      state.worldProps.push(createWorldProp('human', { name: 'Performer' }));
    }
  }
  return state.worldProps;
}

function createWorldProp(kind = 'human', overrides = {}) {
  const k = WORLD_PROP_KINDS[kind] ? kind : 'human';
  const num = state.nextWorldPropNum || 1;
  state.nextWorldPropNum = num + 1;
  let pos = Array.isArray(overrides.posM) && overrides.posM.length === 3 ? overrides.posM.map(Number) : null;
  if (!pos) {
    const main = getPrimaryWorldScreen();
    const b = getWorldScreenBasis(main);
    const n = (state.worldProps || []).length;
    const x = b.center[0] + b.nAxis[0] * 1.2 + (n % 2 === 0 ? 1 : -1) * Math.ceil(n / 2) * 0.9;
    const z = b.center[2] + b.nAxis[2] * 1.2;
    pos = [x, getVenueFloorHeightAt(x, z), z];
  }
  return {
    id: overrides.id || `prop_${num}`,
    kind: k,
    name: String(overrides.name || `${k === 'human_child' ? 'Child' : 'Person'} ${num}`),
    enabled: overrides.enabled !== false,
    posM: pos.map(n => Number((Number(n) || 0).toFixed(3))),
    yawDeg: clamp(Number(overrides.yawDeg ?? 0), -180, 180),
    heightM: clamp(Number(overrides.heightM ?? WORLD_PROP_KINDS[k].heightM), 0.4, 3.0),
    armsUp: !!overrides.armsUp
  };
}

function addWorldProp(kind = 'human', overrides = {}) {
  ensureWorldPropsState();
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Add Human');
  const prop = createWorldProp(kind, overrides);
  state.worldProps.push(prop);
  selectWorldProp(prop.id);
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  markStagePlanDirty();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return prop;
}

function getWorldPropById(id) {
  return (state.worldProps || []).find(p => p && p.id === id) || null;
}

function selectWorldProp(id) {
  const p = getWorldPropById(id);
  if (!p) return null;
  state.rigSelectedKind = 'world_prop';
  state.selectedWorldPropId = p.id;
  if (typeof setActiveSelection === 'function') setActiveSelection('world_prop', p.id, p.name);
  if (typeof renderWorldDocksUI === 'function') renderWorldDocksUI();
  return p;
}

function removeWorldProp(id) {
  const idx = (state.worldProps || []).findIndex(p => p && p.id === id);
  if (idx < 0) return false;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Delete Human');
  const [gone] = state.worldProps.splice(idx, 1);
  for (const sp of state.spots || []) if (sp && sp.followPropId === gone.id) sp.followPropId = null;
  if (state.selectedWorldPropId === gone.id) {
    state.selectedWorldPropId = null;
    if (state.rigSelectedKind === 'world_prop') state.rigSelectedKind = 'none';
  }
  markStagePlanDirty();
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return true;
}

// Move a prop on the floor; it always stands on the deck or floor beneath it.
function moveWorldPropTo(prop, x, z) {
  if (!prop) return;
  prop.posM = [Number(x.toFixed(3)), Number(getVenueFloorHeightAt(x, z).toFixed(3)), Number(z.toFixed(3))];
  markStagePlanDirty();
}

function markStagePlanDirty() {
  const sp = state.multiProjector?.stagePlan;
  if (sp) sp._dirty = true;
  state._venueRev = (state._venueRev || 0) + 1;
}

// Low-poly mannequin in local space (feet at y=0, facing +Z) for a 1.75 m figure.
// Returns flat triangle list [[x,y,z],...] — shared by the raycaster and the GPU mesh.
let _humanLocalTris = null;
let _humanLocalTrisArms = null;
function buildHumanLocalTris(armsUp = false) {
  if (!armsUp && _humanLocalTris) return _humanLocalTris;
  if (armsUp && _humanLocalTrisArms) return _humanLocalTrisArms;
  const tris = [];
  const box = (cx, cy, cz, sx, sy, sz, topScale = 1) => {
    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const tx = hx * topScale, tz = hz * (topScale > 1 ? 1 : topScale);
    const p = [
      [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz],
      [cx - tx, cy + hy, cz - tz], [cx + tx, cy + hy, cz - tz], [cx + tx, cy + hy, cz + tz], [cx - tx, cy + hy, cz + tz]
    ];
    const f = [[0, 1, 2, 3], [7, 6, 5, 4], [3, 2, 6, 7], [1, 0, 4, 5], [0, 3, 7, 4], [2, 1, 5, 6]];
    for (const [a, b, c, d] of f) { tris.push(p[a], p[b], p[c], p[a], p[c], p[d]); }
  };
  const sphere = (cx, cy, cz, rx, ry, rz, seg = 10, rings = 7) => {
    const pt = (i, j) => {
      const th = (i / seg) * Math.PI * 2, ph = (j / rings) * Math.PI;
      return [cx + rx * Math.sin(ph) * Math.cos(th), cy + ry * Math.cos(ph), cz + rz * Math.sin(ph) * Math.sin(th)];
    };
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
        tris.push(a, c, b, a, d, c);
      }
    }
  };
  box(-0.10, 0.44, 0, 0.13, 0.88, 0.15);           // legs
  box(0.10, 0.44, 0, 0.13, 0.88, 0.15);
  box(0, 0.04, 0.05, 0.36, 0.08, 0.26);            // feet
  box(0, 0.95, 0, 0.34, 0.18, 0.21);               // pelvis
  box(0, 1.22, 0, 0.32, 0.38, 0.22, 1.25);         // torso (wider at shoulders)
  box(0, 1.47, 0, 0.09, 0.08, 0.09);               // neck
  sphere(0, 1.62, 0.01, 0.095, 0.12, 0.105);       // head
  if (armsUp) {
    box(-0.27, 1.62, 0, 0.085, 0.62, 0.1);
    box(0.27, 1.62, 0, 0.085, 0.62, 0.1);
  } else {
    box(-0.255, 1.10, 0, 0.085, 0.62, 0.1);
    box(0.255, 1.10, 0, 0.085, 0.62, 0.1);
  }
  if (armsUp) _humanLocalTrisArms = tris; else _humanLocalTris = tris;
  return tris;
}

function getWorldPropWorldTris(prop) {
  const s = (Number(prop.heightM) || 1.75) / 1.75;
  const yaw = ((Number(prop.yawDeg) || 0) * Math.PI) / 180;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const [px, py, pz] = prop.posM;
  return buildHumanLocalTris(!!prop.armsUp).map(([x, y, z]) => [
    px + (x * c + z * sn) * s,
    py + y * s,
    pz + (-x * sn + z * c) * s
  ]);
}

// Props as raycast / shadow occluders (merged into collectVenue3DOccluders).
function collectWorldPropOccluders() {
  const list = [];
  for (const prop of ensureWorldPropsState()) {
    if (!prop || prop.enabled === false) continue;
    const tris = getWorldPropWorldTris(prop);
    const s = (Number(prop.heightM) || 1.75) / 1.75;
    const [px, py, pz] = prop.posM;
    list.push({
      id: prop.id,
      name: prop.name,
      isProp: true,
      accent: '#ffcb7d',
      worldPos: [px, py, pz],
      aabb: [px - 0.32 * s, py, pz - 0.32 * s, px + 0.32 * s, py + (Number(prop.heightM) || 1.75), pz + 0.32 * s],
      tris
    });
  }
  return list;
}

// ----------------------------------------------------------------------------
// 3. DMX LIGHT FIXTURES IN THE WORLD
// ----------------------------------------------------------------------------
// Adds stage-light templates next to the existing utility devices.
const WMDEVICE_LIGHT_TEMPLATES = {
  par_rgbw_5ch: {
    id: 'par_rgbw_5ch',
    label: '5ch LED PAR (Dim · R · G · B · W)',
    schema: 'webmapper.dmx.device.v1',
    name: 'LED PAR',
    category: 'light',
    beamDeg: 25,
    candela: 14000,
    channels: [
      { offset: 0, key: 'dimmer', label: 'Dimmer', kind: 'dimmer', home: 0, dbo: 'zero' },
      { offset: 1, key: 'red', label: 'Red', kind: 'dimmer', home: 255, dbo: 'hold' },
      { offset: 2, key: 'green', label: 'Green', kind: 'dimmer', home: 180, dbo: 'hold' },
      { offset: 3, key: 'blue', label: 'Blue', kind: 'dimmer', home: 120, dbo: 'hold' },
      { offset: 4, key: 'white', label: 'White', kind: 'dimmer', home: 0, dbo: 'hold' }
    ]
  },
  profile_1ch: {
    id: 'profile_1ch',
    label: '1ch Tungsten Profile Spot (Dimmer)',
    schema: 'webmapper.dmx.device.v1',
    name: 'Profile Spot',
    category: 'light',
    beamDeg: 19,
    candela: 26000,
    colorHex: '#ffd9a8',
    channels: [
      { offset: 0, key: 'dimmer', label: 'Dimmer', kind: 'dimmer', home: 0, dbo: 'zero' }
    ]
  },
  moving_head_8ch: {
    id: 'moving_head_8ch',
    label: '8ch Moving Head (Pan · Tilt · Dim · RGBW · Zoom)',
    schema: 'webmapper.dmx.device.v1',
    name: 'Moving Head',
    category: 'light',
    beamDeg: 14,
    candela: 32000,
    channels: [
      { offset: 0, key: 'pan', label: 'Pan', kind: 'dimmer', home: 128, dbo: 'hold' },
      { offset: 1, key: 'tilt', label: 'Tilt', kind: 'dimmer', home: 128, dbo: 'hold' },
      { offset: 2, key: 'dimmer', label: 'Dimmer', kind: 'dimmer', home: 0, dbo: 'zero' },
      { offset: 3, key: 'red', label: 'Red', kind: 'dimmer', home: 120, dbo: 'hold' },
      { offset: 4, key: 'green', label: 'Green', kind: 'dimmer', home: 160, dbo: 'hold' },
      { offset: 5, key: 'blue', label: 'Blue', kind: 'dimmer', home: 255, dbo: 'hold' },
      { offset: 6, key: 'white', label: 'White', kind: 'dimmer', home: 0, dbo: 'hold' },
      { offset: 7, key: 'zoom', label: 'Zoom', kind: 'dimmer', home: 80, dbo: 'hold' }
    ]
  }
};
if (typeof WMDEVICE_TEMPLATES !== 'undefined') {
  for (const [k, tpl] of Object.entries(WMDEVICE_LIGHT_TEMPLATES)) {
    if (!WMDEVICE_TEMPLATES[k]) WMDEVICE_TEMPLATES[k] = tpl;
  }
}

function isDmxLightDevice(dev) {
  if (!dev) return false;
  if (dev.category === 'light') return true;
  return Array.isArray(dev.channels) && dev.channels.some(c => c && (c.key === 'red' || c.key === 'pan'));
}

// Default world placement for a DMX device (called when it has no pose yet).
function ensureDmxDeviceWorldPose(dev, idx = 0) {
  if (!dev) return dev;
  const lay = getVenueLayout();
  const sr = lay.stageRect;
  const midZ = (sr.z0 + sr.z1) * 0.5;
  const isLight = isDmxLightDevice(dev);
  if (!Array.isArray(dev.posM) || dev.posM.length !== 3) {
    if (isLight) {
      // Overhead truss over the downstage edge, spread left → right.
      const trussY = Math.min(lay.room.walls ? lay.room.y1 - 0.4 : 6.0, Math.max(4.2, lay.deckH + 4.0));
      // Centre first, then alternate right / left: 0, +1, −1, +2, −2 …
      const k = idx % 9;
      const order = k === 0 ? 0 : (k % 2 === 1 ? (k + 1) / 2 : -k / 2);
      const x = (sr.x0 + sr.x1) * 0.5 + order * Math.max(1.3, (sr.x1 - sr.x0) / 6);
      dev.posM = [Number(x.toFixed(2)), Number(trussY.toFixed(2)), Number((sr.z1 - 0.8).toFixed(2))];
    } else if (dev.category === 'atmosphere') {
      dev.posM = [Number((sr.x0 + 0.6).toFixed(2)), Number(lay.deckH.toFixed(2)), Number((sr.z0 + 0.8).toFixed(2))];
    } else {
      dev.posM = [Number((sr.x1 + 0.5).toFixed(2)), 0.4, Number(midZ.toFixed(2))];
    }
  }
  if (!Array.isArray(dev.aimM) || dev.aimM.length !== 3) {
    dev.aimM = [Number((dev.posM[0] * 0.35).toFixed(2)), Number(lay.deckH.toFixed(2)), Number(midZ.toFixed(2))];
  }
  if (!Number.isFinite(Number(dev.beamDeg))) {
    const tpl = WMDEVICE_LIGHT_TEMPLATES[dev.templateId] || null;
    dev.beamDeg = tpl ? tpl.beamDeg : 25;
  }
  return dev;
}

function getDmxChannelByteByKey(dev, key, nowMs) {
  const ch = (dev.channels || []).find(c => c && c.key === key);
  if (!ch) return null;
  const res = typeof resolveSingleDmxChannelByte === 'function' ? resolveSingleDmxChannelByte(dev, ch, nowMs) : { byte: ch.home || 0 };
  return clamp(Number(res && res.byte !== undefined ? res.byte : res) || 0, 0, 255);
}

// Live output of a light fixture: world position, beam direction, colour × intensity.
function getDmxLightOutput(dev, nowMs = (typeof performance !== 'undefined' ? performance.now() : 0)) {
  if (!dev || dev.enabled === false || !isDmxLightDevice(dev)) return null;
  ensureDmxDeviceWorldPose(dev);
  const dim = getDmxChannelByteByKey(dev, 'dimmer', nowMs);
  const r = getDmxChannelByteByKey(dev, 'red', nowMs);
  const g = getDmxChannelByteByKey(dev, 'green', nowMs);
  const b = getDmxChannelByteByKey(dev, 'blue', nowMs);
  const w = getDmxChannelByteByKey(dev, 'white', nowMs);
  let col;
  if (r !== null || g !== null || b !== null) {
    const wv = (w || 0) / 255;
    col = [(r || 0) / 255 + wv, (g || 0) / 255 + wv * 0.96, (b || 0) / 255 + wv * 0.9];
  } else {
    col = hexToRgbNorm(dev.colorHex || WMDEVICE_LIGHT_TEMPLATES[dev.templateId]?.colorHex || '#fff1dc');
  }
  const intensity = (dim === null ? 1 : dim / 255);
  // Base aim → yaw / pitch, then moving-head pan (±270°) & tilt (±135°) offsets.
  let dx = dev.aimM[0] - dev.posM[0], dy = dev.aimM[1] - dev.posM[1], dz = dev.aimM[2] - dev.posM[2];
  const len = Math.max(1e-6, Math.hypot(dx, dy, dz));
  dx /= len; dy /= len; dz /= len;
  const pan = getDmxChannelByteByKey(dev, 'pan', nowMs);
  const tilt = getDmxChannelByteByKey(dev, 'tilt', nowMs);
  if (pan !== null || tilt !== null) {
    let yaw = Math.atan2(dx, dz);
    let pitch = Math.asin(clamp(dy, -1, 1));
    yaw += (((pan ?? 128) / 255) - 0.5) * Math.PI * 3.0;
    pitch = clamp(pitch + (((tilt ?? 128) / 255) - 0.5) * Math.PI * 1.5, -Math.PI * 0.5, Math.PI * 0.5);
    dx = Math.cos(pitch) * Math.sin(yaw);
    dy = Math.sin(pitch);
    dz = Math.cos(pitch) * Math.cos(yaw);
  }
  const zoom = getDmxChannelByteByKey(dev, 'zoom', nowMs);
  const beamDeg = zoom !== null ? 6 + (zoom / 255) * 40 : clamp(Number(dev.beamDeg) || 25, 2, 90);
  const candela = Number(dev.candela) || WMDEVICE_LIGHT_TEMPLATES[dev.templateId]?.candela || 15000;
  return { pos: dev.posM, dir: [dx, dy, dz], color: col, intensity, beamDeg, candela };
}

// Global haze level 0..1: manual previz haze + any hazer device output.
function getVenueHazeLevel(nowMs = (typeof performance !== 'undefined' ? performance.now() : 0)) {
  const sp = state.multiProjector?.stagePlan;
  let haze = clamp(Number(sp?.previzHaze ?? 0.22), 0, 1);
  for (const dev of state.dmxDevices || []) {
    if (!dev || dev.enabled === false) continue;
    const hv = getDmxChannelByteByKey(dev, 'haze', nowMs);
    if (hv !== null) haze = Math.max(haze, haze + (hv / 255) * 0.7);
  }
  return clamp(haze, 0, 1.2);
}

// ----------------------------------------------------------------------------
// 4. SHARED VENUE CAMERA: ORBIT OR FIRST-PERSON WALK
// ----------------------------------------------------------------------------
function ensureVenueCameraState(sp) {
  if (!sp) return null;
  if (sp.camMode !== 'walk' && sp.camMode !== 'pov' && sp.camMode !== 'ortho') sp.camMode = 'orbit';
  if (!VENUE_ORTHO_VIEWS[sp.orthoView]) sp.orthoView = 'top';
  if (!Array.isArray(sp.orthoPan)) sp.orthoPan = [0, 0];
  if (!Number.isFinite(Number(sp.orthoZoom)) || Number(sp.orthoZoom) <= 0) sp.orthoZoom = 1;
  if (!sp.walk || !Array.isArray(sp.walk.pos)) {
    const lay = getVenueLayout();
    sp.walk = { pos: [0, 1.65, Math.min(lay.room.z1 - 1.0, lay.stageRect.z1 + 4.5)], yaw: 0, pitch: -4 };
  }
  sp.walk.yaw = Number(sp.walk.yaw) || 0;
  sp.walk.pitch = clamp(Number(sp.walk.pitch) || 0, -85, 85);
  return sp;
}

// Walk forward vector: yaw 0 looks toward -Z (the stage).
function getWalkForward(sp) {
  const yaw = (sp.walk.yaw * Math.PI) / 180, pitch = (sp.walk.pitch * Math.PI) / 180;
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

function buildVenueWalkCamera(sp, aspect, near = 0.05, far = 160.0) {
  ensureVenueCameraState(sp);
  const eye = [...sp.walk.pos];
  const f = getWalkForward(sp);
  const target = [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]];
  const view = mat4LookAt(eye, target, [0, 1, 0]);
  const proj = mat4ProjectorFrustum(0.72, Math.max(0.4, aspect), 0, 0, near, far);
  const mvp = mat4Multiply(new Float32Array(16), proj, view);
  return { mvp, eye, target, dist: 1, near, far, walk: true };
}

// Camera used by every 3D venue view (GL previz + Canvas2D overlay share it).
// Projector POV: look exactly through a projector's lens (its raster fills the view,
// letter/pillar-boxed to the viewport). Mapping here is pixel-true for that projector.
function getPovProjector(sp) {
  const mp = state.multiProjector;
  const list = (mp?.screens || []).filter(s => s && s.enabled !== false);
  const want = Number(sp.povIndex) || Number(sp.previzSolo) || 0;
  return list.find(s => s.index === want) || list[0] || null;
}

function buildVenuePovCamera(sp, aspect) {
  const scr = getPovProjector(sp);
  const field = scr ? solveStagePlanOpticalField(ensureMultiProjectorState()) : null;
  const opt = scr ? field?.opticsByIndex?.get(scr.index) : null;
  if (!opt) return null;
  const clip = buildProjectorClipMatrix(opt);
  const projAspect = opt.wUnit / Math.max(1e-6, opt.hUnit);
  const a = Math.max(0.2, aspect);
  const sx = a > projAspect ? projAspect / a : 1;
  const sy = a > projAspect ? 1 : a / projAspect;
  const mvp = new Float32Array(clip);
  for (const c of [0, 4, 8, 12]) { mvp[c] *= sx; mvp[c + 1] *= sy; }
  return { mvp, eye: [...opt.eye], target: [...opt.aim], dist: opt.throwDistM || 5, near: PREVIZ_SHADOW_NEAR, far: PREVIZ_SHADOW_FAR, pov: scr.index, povFrame: { sx, sy } };
}

// Six orthographic views (v2.2). dir = from the view centre towards the eye.
const VENUE_ORTHO_VIEWS = {
  top: { label: 'Top', dir: [0, 1, 0], up: [0, 0, -1], h: 'x', v: 'z' },
  bottom: { label: 'Bottom', dir: [0, -1, 0], up: [0, 0, -1], h: 'x', v: 'z' },
  front: { label: 'Front', dir: [0, 0, 1], up: [0, 1, 0], h: 'x', v: 'y' },
  back: { label: 'Back', dir: [0, 0, -1], up: [0, 1, 0], h: 'x', v: 'y' },
  left: { label: 'Left', dir: [-1, 0, 0], up: [0, 1, 0], h: 'z', v: 'y' },
  right: { label: 'Right', dir: [1, 0, 0], up: [0, 1, 0], h: 'z', v: 'y' }
};

function getVenueOrthoExtents() {
  const lay = getVenueLayout();
  const r = lay.room;
  const ext = { x0: r.x0, x1: r.x1, y0: 0, y1: r.y1, z0: r.z0, z1: r.z1 };
  // Outdoors (no walls) frame the stage, rig and parts rather than the whole field.
  if (!r.walls) {
    const sr = lay.stageRect;
    let x0 = sr.x0 - 2, x1 = sr.x1 + 2, z0 = sr.z0 - 2, z1 = sr.z1 + 4, y1 = Math.max(6, r.y1 * 0.8);
    for (const scr of state.multiProjector?.screens || []) {
      if (!Array.isArray(scr.posM)) continue;
      x0 = Math.min(x0, scr.posM[0] - 1); x1 = Math.max(x1, scr.posM[0] + 1);
      z0 = Math.min(z0, scr.posM[2] - 1); z1 = Math.max(z1, scr.posM[2] + 1);
    }
    for (const b of lay.boxes) {
      x0 = Math.min(x0, b.min[0] - 0.5); x1 = Math.max(x1, b.max[0] + 0.5);
      z0 = Math.min(z0, b.min[2] - 0.5); z1 = Math.max(z1, b.max[2] + 0.5);
      y1 = Math.max(y1, b.max[1] + 1);
    }
    Object.assign(ext, { x0, x1, z0, z1, y1 });
  }
  return ext;
}

function buildVenueOrthoCamera(sp, aspect) {
  const view = VENUE_ORTHO_VIEWS[sp.orthoView] || VENUE_ORTHO_VIEWS.top;
  const e = getVenueOrthoExtents();
  const span = { x: e.x1 - e.x0, y: e.y1 - e.y0, z: e.z1 - e.z0 };
  const a = Math.max(0.2, aspect);
  const fitHalfH = Math.max(span[view.v] * 0.5, (span[view.h] * 0.5) / a) * 1.08;
  const halfH = clamp(fitHalfH / (Number(sp.orthoZoom) || 1), 0.25, 400);
  const halfW = halfH * a;
  const c0 = [(e.x0 + e.x1) * 0.5, (e.y0 + e.y1) * 0.5, (e.z0 + e.z1) * 0.5];
  // Screen-plane axes of this view (right = up × dir).
  const up = view.up, d = view.dir;
  const right = [up[1] * d[2] - up[2] * d[1], up[2] * d[0] - up[0] * d[2], up[0] * d[1] - up[1] * d[0]];
  const pan = sp.orthoPan || [0, 0];
  const center = [0, 1, 2].map(i => c0[i] + right[i] * pan[0] + up[i] * pan[1]);
  const D = 90;
  const eye = center.map((c, i) => c + d[i] * D);
  const viewM = mat4LookAt(eye, center, up);
  const near = 0.1, far = 260;
  const proj = new Float32Array(16);
  proj[0] = 1 / halfW; proj[5] = 1 / halfH; proj[10] = -2 / (far - near); proj[14] = -(far + near) / (far - near); proj[15] = 1;
  const mvp = mat4Multiply(new Float32Array(16), proj, viewM);
  sp._orthoHalfH = halfH;
  return { mvp, eye, target: center, dist: halfH * 1.6, near, far, ortho: sp.orthoView, orthoHalfH: halfH, right, up: [...up] };
}

function setVenueOrthoView(view) {
  const sp = ensureStagePlanState(ensureMultiProjectorState());
  ensureVenueCameraState(sp);
  if (!VENUE_ORTHO_VIEWS[view]) return setVenueCameraMode('orbit');
  sp.camMode = 'ortho';
  sp.orthoView = view;
  sp.orthoZoom = 1;
  sp.orthoPan = [0, 0];
  syncVenueHudUI();
  if (typeof renderRigWorkspaceCanvas === 'function' && isBuildRoom()) renderRigWorkspaceCanvas();
  return view;
}

function getVenueCamera(sp, aspect) {
  ensureVenueCameraState(sp);
  if (sp.camMode === 'ortho') return buildVenueOrthoCamera(sp, aspect);
  if (sp.camMode === 'pov') {
    const pov = buildVenuePovCamera(sp, aspect);
    if (pov) return pov;
  }
  if (sp.camMode === 'walk') return buildVenueWalkCamera(sp, aspect);
  const cam = buildStagePlan3DMvp(sp, aspect);
  cam.near = 0.2; cam.far = 140.0;
  return cam;
}

// Frame the stage (main screen + deck) for a viewport aspect: sets orbit target/distance.
function frameVenueCamera(sp, aspect = 16 / 9, opts = {}) {
  ensureVenueCameraState(sp);
  const lay = getVenueLayout();
  const b = getWorldScreenBasis(getPrimaryWorldScreen());
  const sr = lay.stageRect;
  const want = [b.center[0], Math.max(0.8, b.center[1] * 0.78), (Math.min(b.center[2], sr.z0) + sr.z1) * 0.5];
  const v = sp.venue;
  const base = [0, v.screenBottomM + v.screenHeightM * 0.42, v.screenZ * 0.25];
  sp.orbitTargetOffset = [want[0] - base[0], want[1] - base[1], want[2] - base[2]];
  const spanX = Math.max(b.widthM, sr.x1 - sr.x0) * 0.5 + 0.6;
  const spanY = Math.max(b.heightM, b.center[1] + b.heightM * 0.5) * 0.5 + 0.4;
  const hHalf = Math.atan(1 / (2 * 0.92));
  const vHalf = Math.atan(Math.tan(hHalf) / Math.max(0.4, aspect));
  const dist = Math.max(spanX / Math.tan(hHalf), spanY / Math.tan(vHalf)) * 1.12 + (sr.z1 - sr.z0) * 0.25;
  sp.orbitDist = clamp(dist, 3.5, 40);
  sp.orbitYaw = opts.yaw ?? 18;
  sp.orbitPitch = opts.pitch ?? 12;
  sp._framed = true;
  if (sp.camMode !== 'orbit' && opts.toOrbit !== false) sp.camMode = 'orbit';
  syncVenueHudUI();
}

// One view model everywhere (0.1 beta): Plan · 3D · Walk · POV · six sides, with a
// Lines (drawing) or Light (render) look. In the BUILD world pane "Plan" is the editable
// 2D plan; in the MAP/LIVE 3D Venue it is the Top side in the Lines look.
function isRigWorldViewContext() {
  return isBuildRoom() && state.layoutMode === 'rig';
}

function isRigPlanActive() {
  const sp = state.multiProjector?.stagePlan;
  return isRigWorldViewContext() && !!sp && sp.viewMode !== 'orbit3d';
}

function setRigPlanMode(on) {
  const sp = ensureStagePlanState(ensureMultiProjectorState());
  sp.viewMode = on ? 'plan2d' : 'orbit3d';
  if (on && state.buildViewMode === 'world3d') state.buildViewMode = 'plan2d';
  if (!on && state.buildViewMode === 'plan2d') state.buildViewMode = 'world3d';
  if (typeof syncOutputFeedTabsUI === 'function') syncOutputFeedTabsUI();
  if (typeof syncRigWorkspaceUI === 'function') syncRigWorkspaceUI();
  syncVenueHudUI();
  if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
}

function setVenueViewLook(look) {
  const sp = ensureStagePlanState(ensureMultiProjectorState());
  sp.orthoLook = look === 'lines' ? 'lines' : 'light';
  syncVenueHudUI();
  if (typeof renderRigWorkspaceCanvas === 'function' && isBuildRoom()) renderRigWorkspaceCanvas();
  return sp.orthoLook;
}

function getVenueViewLook(sp) {
  return sp && sp.camMode === 'ortho' && sp.orthoLook === 'lines' ? 'lines' : 'light';
}

function setVenueCameraMode(mode) {
  const sp = ensureStagePlanState(ensureMultiProjectorState());
  ensureVenueCameraState(sp);
  if (mode === 'plan') {
    if (isRigWorldViewContext()) { setRigPlanMode(true); return 'plan'; }
    sp.orthoLook = 'lines';
    setVenueOrthoView('top');
    return 'plan';
  }
  if (isRigPlanActive()) {
    sp.viewMode = 'orbit3d';
    if (state.buildViewMode === 'plan2d') state.buildViewMode = 'world3d';
    if (typeof syncOutputFeedTabsUI === 'function') syncOutputFeedTabsUI();
    if (typeof syncRigWorkspaceUI === 'function') syncRigWorkspaceUI();
  }
  if (VENUE_ORTHO_VIEWS[mode]) return setVenueOrthoView(mode);
  const next = mode === 'walk' ? 'walk' : (mode === 'pov' ? 'pov' : (mode === 'ortho' ? 'ortho' : 'orbit'));
  if (next === 'pov' && !sp.povIndex) sp.povIndex = Number(sp.previzSolo) || (getPovProjector(sp)?.index || 1);
  if (next === 'walk' && sp.camMode !== 'walk') {
    // Step in where the orbit camera was looking from, at eye height.
    const cam = buildStagePlan3DMvp(sp, 16 / 9);
    const lay = getVenueLayout();
    const ex = clamp(cam.eye[0], lay.room.x0 + 0.5, lay.room.x1 - 0.5);
    const ez = clamp(cam.eye[2], lay.room.z0 + 0.5, lay.room.z1 - 0.5);
    sp.walk.pos = [ex, getVenueFloorHeightAt(ex, ez) + 1.65, ez];
    const dx = cam.target[0] - ex, dz = cam.target[2] - ez;
    sp.walk.yaw = (Math.atan2(dx, -dz) * 180) / Math.PI;
    sp.walk.pitch = -6;
  }
  sp.camMode = next;
  syncVenueHudUI();
  return next;
}

const _venueWalkKeys = new Set();
let _venueHoverEl = null;

function isVenueViewActive() {
  if (state.projectorMode) return false;
  if (state.outputFeedTab === 'venue3d' && !isBuildRoom()) return true;
  const sp = state.multiProjector?.stagePlan;
  return state.layoutMode === 'rig' && !!sp && sp.viewMode === 'orbit3d';
}

// Per-frame walk integration (called from the frame loop).
function tickVenueWalk(dt) {
  if (_venueWalkKeys.size === 0) return false;
  const sp = state.multiProjector?.stagePlan;
  if (!sp || sp.camMode !== 'walk' || !isVenueViewActive()) { _venueWalkKeys.clear(); return false; }
  ensureVenueCameraState(sp);
  const speed = (_venueWalkKeys.has('shift') ? 4.2 : 1.6) * Math.min(0.1, Math.max(0, dt));
  const yaw = (sp.walk.yaw * Math.PI) / 180;
  const fx = Math.sin(yaw), fz = -Math.cos(yaw);
  let mx = 0, mz = 0, my = 0;
  if (_venueWalkKeys.has('fwd')) { mx += fx; mz += fz; }
  if (_venueWalkKeys.has('back')) { mx -= fx; mz -= fz; }
  if (_venueWalkKeys.has('left')) { mx += fz; mz -= fx; }
  if (_venueWalkKeys.has('right')) { mx -= fz; mz += fx; }
  if (_venueWalkKeys.has('up')) my += 1;
  if (_venueWalkKeys.has('down')) my -= 1;
  const n = Math.hypot(mx, mz) || 1;
  const lay = getVenueLayout();
  const lim = lay.outdoor ? 60 : 0;
  const nx = clamp(sp.walk.pos[0] + (mx / n) * speed, (lay.outdoor ? -lim : lay.room.x0 + 0.2), (lay.outdoor ? lim : lay.room.x1 - 0.2));
  const nz = clamp(sp.walk.pos[2] + (mz / n) * speed, (lay.outdoor ? -lim : lay.room.z0 + 0.2), (lay.outdoor ? lim : lay.room.z1 - 0.2));
  // Walking follows the floor (step up onto the deck); Q/E float the eye.
  const floorOld = getVenueFloorHeightAt(sp.walk.pos[0], sp.walk.pos[2]);
  const floorNew = getVenueFloorHeightAt(nx, nz);
  let ny = sp.walk.pos[1] + (floorNew - floorOld) + my * speed;
  ny = clamp(ny, floorNew + 0.3, lay.room.walls ? lay.room.y1 - 0.15 : 40);
  sp.walk.pos = [nx, ny, nz];
  return true;
}

const VENUE_WALK_KEYMAP = {
  w: 'fwd', arrowup: 'fwd', s: 'back', arrowdown: 'back',
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
  e: 'up', pageup: 'up', q: 'down', pagedown: 'down'
};

function initVenueWalkControls() {
  if (typeof window === 'undefined' || window._venueWalkBound) return;
  window._venueWalkBound = true;
  const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  window.addEventListener('keydown', (e) => {
    const sp = state.multiProjector?.stagePlan;
    if (!sp || sp.camMode !== 'walk' || !_venueHoverEl || !isVenueViewActive() || isTyping(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const act = VENUE_WALK_KEYMAP[String(e.key).toLowerCase()];
    if (!act) return;
    _venueWalkKeys.add(act);
    if (e.shiftKey) _venueWalkKeys.add('shift');
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  window.addEventListener('keyup', (e) => {
    const act = VENUE_WALK_KEYMAP[String(e.key).toLowerCase()];
    if (act) _venueWalkKeys.delete(act);
    if (e.key === 'Shift') _venueWalkKeys.delete('shift');
  }, true);
  window.addEventListener('blur', () => _venueWalkKeys.clear());
}

// Pointer helpers shared by the rig canvas and the stage-pane 3D Venue feed.
function venueCamBeginDrag(sp, mx, my, opts = {}) {
  ensureVenueCameraState(sp);
  if (sp.camMode === 'pov') return { kind: 'pov-locked' }; // the lens doesn't move
  // Orthographic views never rotate: any drag on empty space pans the drawing.
  if (sp.camMode === 'ortho') {
    return { kind: 'orbit3d', ortho: true, startX: mx, startY: my, pan0: [...(sp.orthoPan || [0, 0])], viewH: Math.max(50, Number(opts.viewH) || Number(sp._orthoViewH) || 600) };
  }
  if (sp.camMode === 'walk') {
    return { kind: 'walk-look', startX: mx, startY: my, yaw0: sp.walk.yaw, pitch0: sp.walk.pitch, pos0: [...sp.walk.pos], pan: !!opts.pan };
  }
  if (opts.pan) {
    if (!Array.isArray(sp.orbitTargetOffset)) sp.orbitTargetOffset = [0, 0, 0];
    return { kind: 'orbit3d-pan', startX: mx, startY: my, origOff: [...sp.orbitTargetOffset], yaw: sp.orbitYaw };
  }
  return { kind: 'orbit3d', startX: mx, startY: my, yaw0: sp.orbitYaw, pitch0: sp.orbitPitch };
}

function venueCamDrag(sp, drag, mx, my) {
  if (!drag) return false;
  const dx = mx - drag.startX, dy = my - drag.startY;
  if (drag.kind === 'walk-look') {
    if (drag.pan) {
      // Shift-drag in walk mode strafes / rises like a camera slider.
      const yaw = (drag.yaw0 * Math.PI) / 180;
      sp.walk.pos = [drag.pos0[0] - Math.cos(yaw) * dx * 0.012, Math.max(0.3, drag.pos0[1] + dy * 0.012), drag.pos0[2] - Math.sin(yaw) * dx * 0.012];
    } else {
      sp.walk.yaw = drag.yaw0 - dx * 0.22;
      sp.walk.pitch = clamp(drag.pitch0 + dy * 0.18, -85, 85);
    }
    return true;
  }
  if (drag.ortho) {
    const mpp = (2 * (Number(sp._orthoHalfH) || 5)) / drag.viewH;
    sp.orthoPan = [drag.pan0[0] - dx * mpp, drag.pan0[1] + dy * mpp];
    return true;
  }
  if (drag.kind === 'orbit3d') {
    sp.orbitYaw = drag.yaw0 - dx * 0.45;
    sp.orbitPitch = clamp(drag.pitch0 + dy * 0.35, -75, 85);
    return true;
  }
  if (drag.kind === 'orbit3d-pan') {
    const yawR = ((drag.yaw || 0) * Math.PI) / 180;
    sp.orbitTargetOffset = [
      drag.origOff[0] - Math.cos(yawR) * dx * 0.018,
      drag.origOff[1] + dy * 0.018,
      drag.origOff[2] + Math.sin(yawR) * dx * 0.018
    ];
    return true;
  }
  return false;
}

function venueCamWheel(sp, deltaY) {
  ensureVenueCameraState(sp);
  if (sp.camMode === 'pov') return;
  if (sp.camMode === 'ortho') {
    sp.orthoZoom = clamp((Number(sp.orthoZoom) || 1) * (deltaY > 0 ? 0.9 : 1.1), 0.15, 40);
    return;
  }
  if (sp.camMode === 'walk') {
    const f = getWalkForward(sp);
    const step = clamp(-deltaY * 0.006, -1.2, 1.2);
    const nx = sp.walk.pos[0] + f[0] * step, nz = sp.walk.pos[2] + f[2] * step;
    const fl = getVenueFloorHeightAt(nx, nz);
    sp.walk.pos = [nx, Math.max(fl + 0.3, sp.walk.pos[1] + f[1] * step), nz];
  } else {
    sp.orbitDist = clamp(sp.orbitDist * (deltaY > 0 ? 1.08 : 0.92), 2.5, 65.0);
  }
}

// Double-click teleport: walk to the floor point under the cursor (u,v in 0..1, v up).
function venueTeleportToScreenPoint(sp, aspect, u, v) {
  const cam = getVenueCamera(sp, aspect);
  const inv = mat4InvertGeneral(cam.mvp);
  if (!inv) return false;
  const unproj = (z) => {
    const x = u * 2 - 1, y = v * 2 - 1;
    const p = [
      inv[0] * x + inv[4] * y + inv[8] * z + inv[12],
      inv[1] * x + inv[5] * y + inv[9] * z + inv[13],
      inv[2] * x + inv[6] * y + inv[10] * z + inv[14],
      inv[3] * x + inv[7] * y + inv[11] * z + inv[15]
    ];
    return [p[0] / p[3], p[1] / p[3], p[2] / p[3]];
  };
  const a = unproj(-1), b = unproj(1);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const dir = d.map(n => n / len);
  let best = null;
  const vh = raycastVenueLayout(a[0], a[1], a[2], dir[0], dir[1], dir[2]);
  if (vh && (vh.kind === 'deck' || vh.kind === 'floor')) best = vh.t;
  if (dir[1] < -1e-4) {
    const tf = -a[1] / dir[1];
    if (tf > 0 && (best === null || tf < best)) best = tf;
  }
  if (best === null) return false;
  const hx = a[0] + dir[0] * best, hz = a[2] + dir[2] * best;
  ensureVenueCameraState(sp);
  if (sp.camMode !== 'walk') setVenueCameraMode('walk');
  sp.walk.pos = [hx, getVenueFloorHeightAt(hx, hz) + 1.65, hz];
  return true;
}

function mat4InvertGeneral(m) {
  const inv = new Float32Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (Math.abs(det) < 1e-12) return null;
  const id = 1 / det;
  for (let i = 0; i < 16; i++) inv[i] *= id;
  return inv;
}

// Projects a world point through a camera MVP with near-plane awareness.
// Returns clip-space record so callers can clip segments that cross behind the eye.
function venueClipPoint(pt, mvp) {
  const x = pt[0], y = pt[1], z = pt[2];
  return [
    mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12],
    mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13],
    mvp[2] * x + mvp[6] * y + mvp[10] * z + mvp[14],
    mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15]
  ];
}

// Clip a 3D segment against the near plane and return 2D canvas endpoints (or null).
function venueProjectSegment(a, b, mvp, w, h, nearW = 0.06) {
  let ca = venueClipPoint(a, mvp), cb = venueClipPoint(b, mvp);
  if (ca[3] < nearW && cb[3] < nearW) return null;
  if (ca[3] < nearW || cb[3] < nearW) {
    const t = (nearW - ca[3]) / (cb[3] - ca[3]);
    const c = [0, 1, 2, 3].map(i => ca[i] + (cb[i] - ca[i]) * t);
    if (ca[3] < nearW) ca = c; else cb = c;
  }
  const toPx = (c) => [((c[0] / c[3]) * 0.5 + 0.5) * w, (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * h];
  return [toPx(ca), toPx(cb)];
}

// ----------------------------------------------------------------------------
// 5. GPU PREVIZ RENDERER (shares the main WebGL2 context & stage textures)
// ----------------------------------------------------------------------------
const PREVIZ_MAX_PROJ = 4;
const PREVIZ_MAX_LIGHTS = 8;
const PREVIZ_SHADOW_W = 1024;
const PREVIZ_SHADOW_H = 576;
const PREVIZ_SHADOW_NEAR = 0.15;
const PREVIZ_SHADOW_FAR = 80.0;
const PREVIZ_REF_LUX = 420.0; // lux that renders projected content at full value

const PREVIZ_LIGHT_GLSL = `
uniform int uProjN;
uniform mat4 uPClip[4];
uniform vec3 uPEye[4];
uniform vec4 uPCrop[4];
uniform vec4 uPBlend[4];
uniform float uPGain[4];
uniform sampler2D uPTex0;
uniform sampler2D uPTex1;
uniform sampler2D uPTex2;
uniform sampler2D uPTex3;
uniform sampler2DShadow uPSh0;
uniform sampler2DShadow uPSh1;
uniform sampler2DShadow uPSh2;
uniform sampler2DShadow uPSh3;
uniform float uMinZf;
uniform int uLightN;
uniform vec3 uLPos[8];
uniform vec3 uLDir[8];
uniform vec3 uLCol[8];
uniform vec2 uLCone[8];

float pzEdge(vec2 uv, vec4 b) {
  float w = 1.0;
  if (b.x > 0.001) w *= smoothstep(0.0, b.x, uv.x);
  if (b.y > 0.001) w *= smoothstep(0.0, b.y, 1.0 - uv.x);
  if (b.z > 0.001) w *= smoothstep(0.0, b.z, 1.0 - uv.y);
  if (b.w > 0.001) w *= smoothstep(0.0, b.w, uv.y);
  return w;
}

// Irradiance-weighted projected colour reaching p from projector k (0 when outside the
// frustum or shadowed). L returns the unit vector toward the lens.
vec3 pzProj(int k, sampler2D tex, sampler2DShadow sh, vec3 p, float biasM, out vec3 L) {
  L = vec3(0.0, 1.0, 0.0);
  vec4 c = uPClip[k] * vec4(p, 1.0);
  if (c.w < 0.12) return vec3(0.0);
  vec2 ndc = c.xy / c.w;
  if (abs(ndc.x) > 1.0 || abs(ndc.y) > 1.0) return vec3(0.0);
  vec2 uv = ndc * 0.5 + 0.5;
  float ref = (c.w - ${PREVIZ_SHADOW_NEAR.toFixed(3)} - biasM) / ${(PREVIZ_SHADOW_FAR - PREVIZ_SHADOW_NEAR).toFixed(3)};
  float vis = texture(sh, vec3(uv, clamp(ref, 0.0, 1.0)));
  if (vis <= 0.001) return vec3(0.0);
  // Stage FBO may be half-float HDR; projectors emit the clamped 8-bit signal.
  vec3 col = clamp(texture(tex, uPCrop[k].xy + uv * uPCrop[k].zw).rgb, 0.0, 1.0);
  L = normalize(uPEye[k] - p);
  float zf = max(c.w, uMinZf);
  return col * vis * pzEdge(uv, uPBlend[k]) * uPGain[k] / (zf * zf);
}

vec3 pzFixtures(vec3 p, vec3 n, bool surface) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uLightN) break;
    vec3 d = p - uLPos[i];
    float dist = max(length(d), 0.35);
    vec3 dn = d / dist;
    float cone = smoothstep(uLCone[i].x, uLCone[i].y, dot(dn, uLDir[i]));
    if (cone <= 0.0) continue;
    float lam = surface ? max(dot(n, -dn), 0.0) : 1.0;
    acc += uLCol[i] * cone * lam / (dist * dist);
  }
  return acc;
}
`;

const PREVIZ_SCENE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec4 aCol;
uniform mat4 uViewProj;
out vec3 vPos;
out vec3 vNor;
out vec4 vCol;
void main() {
  vPos = aPos;
  vNor = aNor;
  vCol = aCol;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const PREVIZ_SCENE_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vPos;
in vec3 vNor;
in vec4 vCol;
uniform vec3 uCam;
uniform float uAmbient;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform float uExposure;
uniform int uSoloMask;
${PREVIZ_LIGHT_GLSL}
out vec4 outColor;
void main() {
  vec3 n = normalize(vNor);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = vCol.rgb;
  vec3 light = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5) * uAmbient;
  vec3 L;
  vec3 c;
  // Slope-scaled bias keeps grazing walls free of shadow acne.
  if (uProjN > 0) { c = pzProj(0, uPTex0, uPSh0, vPos, 0.03, L); light += c * max(dot(n, L), 0.0); }
  if (uProjN > 1) { c = pzProj(1, uPTex1, uPSh1, vPos, 0.03, L); light += c * max(dot(n, L), 0.0); }
  if (uProjN > 2) { c = pzProj(2, uPTex2, uPSh2, vPos, 0.03, L); light += c * max(dot(n, L), 0.0); }
  if (uProjN > 3) { c = pzProj(3, uPTex3, uPSh3, vPos, 0.03, L); light += c * max(dot(n, L), 0.0); }
  light += pzFixtures(vPos, n, true);
  vec3 col = albedo * light * uExposure + albedo * vCol.a;
  col = col / (1.0 + 0.16 * col) * 1.16;
  outColor = vec4(col, 1.0);
}`;

const PREVIZ_SHADOW_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uClip;
out float vZf;
void main() {
  vec4 c = uClip * vec4(aPos, 1.0);
  vZf = c.w;
  gl_Position = c;
}`;

const PREVIZ_SHADOW_FS = `#version 300 es
precision highp float;
in float vZf;
void main() {
  gl_FragDepth = clamp((vZf - ${PREVIZ_SHADOW_NEAR.toFixed(3)}) / ${(PREVIZ_SHADOW_FAR - PREVIZ_SHADOW_NEAR).toFixed(3)}, 0.0, 1.0);
}`;

const PREVIZ_FS_TRI_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Volumetric haze: march each view ray up to the scene depth and accumulate in-scattered
// projector & fixture light (projector light is shadow-tested, so people cast beam shadows).
const PREVIZ_VOLUME_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec2 vUv;
uniform sampler2D uDepth;
uniform mat4 uInvVP;
uniform vec3 uCam;
uniform float uHaze;
uniform float uFrame;
${PREVIZ_LIGHT_GLSL}
out vec4 outColor;
void main() {
  float d = texture(uDepth, vUv).r;
  vec4 wp = uInvVP * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  wp /= wp.w;
  vec3 rd = wp.xyz - uCam;
  float len = length(rd);
  rd /= max(len, 1e-4);
  len = min(len, 48.0);
  const int STEPS = 32;
  float dt = len / float(STEPS);
  // 4×4 ordered dither: even, fine-grained banding instead of random speckle.
  ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
  int bi = q.x + q.y * 4;
  float bayer[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  float jit = (bayer[bi] + 0.5) / 16.0;
  vec3 acc = vec3(0.0);
  vec3 L;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = uCam + rd * ((float(i) + jit) * dt);
    if (uProjN > 0) acc += pzProj(0, uPTex0, uPSh0, p, 0.05, L);
    if (uProjN > 1) acc += pzProj(1, uPTex1, uPSh1, p, 0.05, L);
    if (uProjN > 2) acc += pzProj(2, uPTex2, uPSh2, p, 0.05, L);
    if (uProjN > 3) acc += pzProj(3, uPTex3, uPSh3, p, 0.05, L);
    acc += pzFixtures(p, vec3(0.0), false);
  }
  outColor = vec4(acc * dt * uHaze * 0.055, 1.0);
}`;

const PREVIZ_COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uVol;
uniform sampler2D uDepth;
uniform mat4 uInvVP;
uniform vec3 uCam;
uniform int uOutdoor;
out vec4 outColor;
void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  float d = texture(uDepth, vUv).r;
  if (d >= 0.99999) {
    vec4 wp = uInvVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 dir = normalize(wp.xyz / wp.w - uCam);
    if (uOutdoor == 1) {
      float h = clamp(dir.y, -0.1, 1.0);
      scene = mix(vec3(0.10, 0.12, 0.20), vec3(0.015, 0.02, 0.06), pow(max(h, 0.0), 0.55));
      float star = step(0.9965, fract(sin(dot(floor(dir.xz / max(dir.y, 0.05) * 90.0), vec2(127.1, 311.7))) * 43758.5));
      scene += star * smoothstep(0.08, 0.4, h) * 0.55;
    } else {
      scene = vec3(0.018, 0.022, 0.032);
    }
  }
  vec3 vol = texture(uVol, vUv).rgb;
  vec3 c = scene + vol / (1.0 + 0.35 * vol);
  outColor = vec4(min(c, vec3(1.0)), 1.0);
}`;

let _pz = null;

function pzCompileProgram(vsSrc, fsSrc, label) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn(`[previz] ${label} shader compile failed:`, gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, vsSrc);
  const fs = sh(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn(`[previz] ${label} link failed:`, gl.getProgramInfoLog(prog));
    return null;
  }
  const cache = new Map();
  const loc = (name) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
    return cache.get(name);
  };
  return { prog, loc };
}

function pzMakeTex(w, h, internal, format, type, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  return t;
}

function initVenuePrevizGL() {
  if (_pz) return _pz.ok ? _pz : null;
  _pz = { ok: false };
  if (typeof gl === 'undefined' || !gl || typeof gl.createShader !== 'function') return null;
  const scene = pzCompileProgram(PREVIZ_SCENE_VS, PREVIZ_SCENE_FS, 'scene');
  const shadow = pzCompileProgram(PREVIZ_SHADOW_VS, PREVIZ_SHADOW_FS, 'shadow');
  const volume = pzCompileProgram(PREVIZ_FS_TRI_VS, PREVIZ_VOLUME_FS, 'volume');
  const composite = pzCompileProgram(PREVIZ_FS_TRI_VS, PREVIZ_COMPOSITE_FS, 'composite');
  if (!scene || !shadow || !volume || !composite) return null;

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
  gl.bindVertexArray(null);

  const shadows = [];
  for (let i = 0; i < PREVIZ_MAX_PROJ; i++) {
    const tex = pzMakeTex(PREVIZ_SHADOW_W, PREVIZ_SHADOW_H, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    shadows.push({ tex, fbo });
  }
  // 1×1 "fully lit" shadow map for unused sampler slots (depth 1.0 → always passes).
  const litTex = pzMakeTex(1, 1, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, new Uint32Array([0xffffffff]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  _pz = {
    ok: true,
    scene, shadow, volume, composite,
    vao, vbo,
    vertCount: 0, casterCount: 0, shellStart: 0, shellCount: 0,
    meshKey: '',
    shadows, litTex,
    sceneFbo: null, volFbo: null,
    projStage: [],
    frame: 0
  };
  return _pz;
}

function pzEnsureTargets(w, h) {
  const pz = _pz;
  if (!pz.sceneFbo || pz.sceneFbo.w !== w || pz.sceneFbo.h !== h) {
    if (pz.sceneFbo) {
      gl.deleteFramebuffer(pz.sceneFbo.fbo);
      gl.deleteTexture(pz.sceneFbo.color);
      gl.deleteTexture(pz.sceneFbo.depth);
    }
    const color = pzMakeTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    const depth = pzMakeTex(w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    pz.sceneFbo = { fbo, color, depth, w, h };
  }
  const vw = Math.max(16, Math.round(w / 2.5)), vh = Math.max(16, Math.round(h / 2.5));
  if (!pz.volFbo || pz.volFbo.w !== vw || pz.volFbo.h !== vh) {
    if (pz.volFbo) {
      gl.deleteFramebuffer(pz.volFbo.fbo);
      gl.deleteTexture(pz.volFbo.color);
    }
    const hdr = typeof supportsHalfFloatFbo !== 'undefined' && supportsHalfFloatFbo;
    const color = hdr
      ? pzMakeTex(vw, vh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR)
      : pzMakeTex(vw, vh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    pz.volFbo = { fbo, color, w: vw, h: vh };
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// ---- Scene mesh assembly ---------------------------------------------------
function pzPushTri(out, a, b, c, col, emis = 0) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  for (const p of [a, b, c]) out.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], emis);
}
function pzPushQuad(out, a, b, c, d, col, emis = 0) {
  pzPushTri(out, a, b, c, col, emis);
  pzPushTri(out, a, c, d, col, emis);
}
// Axis-aligned box with outward-facing CCW quads.
function pzPushBox(out, min, max, col, opts = {}) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  pzPushQuad(out, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col);           // top
  if (!opts.noBottom) pzPushQuad(out, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col);
  pzPushQuad(out, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col);          // +z
  pzPushQuad(out, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col);          // -z
  pzPushQuad(out, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col);          // +x
  pzPushQuad(out, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col);          // -x
}
// Oriented box from centre + 3 half-axis vectors.
function pzPushOBox(out, c, ax, ay, az, col, emisFront = 0, frontCol = null) {
  const P = (sx, sy, sz) => [c[0] + ax[0] * sx + ay[0] * sy + az[0] * sz, c[1] + ax[1] * sx + ay[1] * sy + az[1] * sz, c[2] + ax[2] * sx + ay[2] * sy + az[2] * sz];
  const faces = [
    [P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1)],
    [P(-1, -1, 1), P(1, -1, 1), P(1, -1, -1), P(-1, -1, -1)],
    [P(-1, -1, 1), P(-1, 1, 1), P(1, 1, 1), P(1, -1, 1)],
    [P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), P(-1, -1, -1)],
    [P(1, -1, 1), P(1, 1, 1), P(1, 1, -1), P(1, -1, -1)],
    [P(-1, -1, -1), P(-1, 1, -1), P(-1, 1, 1), P(-1, -1, 1)]
  ];
  faces.forEach((f, i) => pzPushQuad(out, f[0], f[1], f[2], f[3], (i === 2 && frontCol) ? frontCol : col, i === 2 ? emisFront : 0));
}

function pzLookBasis(from, to) {
  let f = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  f = f.map(n => n / fl);
  let up = Math.abs(f[1]) > 0.97 ? [0, 0, 1] : [0, 1, 0];
  let r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  r = r.map(n => n / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { f, r, u };
}

function pzHexCol(hex, fallback = [0.6, 0.6, 0.6]) {
  try { return hexToRgbNorm(hex); } catch (_) { return fallback; }
}

function buildPrevizMeshKey() {
  const mp = state.multiProjector;
  const lay = getVenueLayout();
  const parts = [_venueLayoutKey, state._objSyncRev || 0, state._venueRev || 0, (state.venueParts || []).map(p => p.color).join(',')];
  for (const ws of state.worldScreens || []) parts.push(ws.id, ws.enabled, ws.posM?.join(','), ws.widthM, ws.heightM, ws.yawDeg, ws.pitchDeg);
  for (const p of state.worldProps || []) parts.push(p.id, p.enabled, p.posM?.join(','), p.yawDeg, p.heightM, p.armsUp);
  for (const s of mp?.screens || []) parts.push(s.index, s.enabled, s.posM?.join(','), s.aimM?.join(','), s.rollDeg);
  for (const d of state.dmxDevices || []) parts.push(d.id, d.enabled, d.posM?.join(','), d.aimM?.join(','));
  for (const s of state.surfaces || []) {
    if (s && s.type === 'mesh3d') parts.push(s.id, s.visible, s.pos3d?.join(','), s.rot3d?.join(','), s.scale3d?.join(','), s.objAssetId, s.primitive);
  }
  parts.push(lay.shapeId);
  return parts.join('|');
}

function rebuildPrevizSceneMesh() {
  const pz = _pz;
  const lay = getVenueLayout();
  const kind = lay.kind;
  const casters = [];
  const receivers = [];
  const shell = [];
  const bodies = [];

  // Deck & arch (cast shadows: the deck lip shades the house floor).
  for (const b of lay.boxes) {
    if (b.obb) {
      pzPushOBox(casters, b.obb.c, b.obb.ax, b.obb.ay, b.obb.az, pzHexCol(b.color, kind.deckCol));
      continue;
    }
    const col = b.kind === 'arch' ? kind.wallCol.map(c => c * 1.15) : kind.deckCol;
    pzPushBox(casters, b.min, b.max, col, { noBottom: true });
  }
  // Physical screens: thin white panels.
  for (const ws of state.worldScreens || []) {
    if (!ws || ws.enabled === false) continue;
    const b = getWorldScreenBasis(ws);
    const hu = b.uAxis.map(n => n * b.widthM * 0.5);
    const hv = b.vAxis.map(n => n * b.heightM * 0.5);
    const hn = b.nAxis.map(n => n * 0.02);
    pzPushOBox(casters, b.center, hu, hv, hn, [0.86, 0.86, 0.88]);
  }
  // Human figures.
  for (const prop of state.worldProps || []) {
    if (!prop || prop.enabled === false) continue;
    const t = getWorldPropWorldTris(prop);
    for (let i = 0; i + 2 < t.length; i += 3) pzPushTri(casters, t[i], t[i + 1], t[i + 2], [0.62, 0.6, 0.58]);
  }
  // Scenic mesh3d objects (full-resolution, same world transform as the raycaster).
  if (typeof getSurfaceMesh3DGeometry === 'function') {
    const v = state.multiProjector?.stagePlan?.venue || getDefaultVenueSpec();
    for (const surf of state.surfaces || []) {
      if (!surf || surf.type !== 'mesh3d' || surf.visible === false) continue;
      const geom = getSurfaceMesh3DGeometry(surf, state.objAssets);
      if (!geom || !geom.verts || geom.vertCount < 3) continue;
      const m = getMesh3DVenueModelMatrix(surf, v);
      const xf = (vi) => {
        const o = vi * 11;
        const x = geom.verts[o], y = geom.verts[o + 1], z = geom.verts[o + 2];
        return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      };
      const tc = Math.min(Math.floor(geom.vertCount / 3), 60000);
      for (let t = 0; t < tc; t++) pzPushTri(casters, xf(t * 3), xf(t * 3 + 1), xf(t * 3 + 2), [0.74, 0.74, 0.76]);
    }
  }
  // Outdoor: a ring of simple trees for scale.
  if (lay.outdoor) {
    const trunk = [0.16, 0.11, 0.07], leaf = [0.07, 0.15, 0.06];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.3;
      const rr = 22 + (i % 3) * 5;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr + 4;
      pzPushBox(casters, [x - 0.18, 0, z - 0.18], [x + 0.18, 2.4, z + 0.18], trunk, { noBottom: true });
      pzPushBox(casters, [x - 1.6, 2.2, z - 1.6], [x + 1.6, 5.6, z + 1.6], leaf);
    }
  }
  // Ground / house floor (receives light only).
  const r = lay.room;
  if (lay.outdoor) {
    const g = 70;
    pzPushQuad(receivers, [-g, 0, g], [g, 0, g], [g, 0, -g], [-g, 0, -g], kind.floorCol);
  } else {
    pzPushQuad(receivers, [r.x0, 0, r.z1], [r.x1, 0, r.z1], [r.x1, 0, r.z0], [r.x0, 0, r.z0], kind.floorCol);
  }
  // Room shell: inward-facing, back-face culled so an outside camera sees in.
  if (r.walls) {
    const w = kind.wallCol;
    const ceil = w.map(c => c * 0.75);
    pzPushQuad(shell, [r.x0, 0, r.z0], [r.x1, 0, r.z0], [r.x1, r.y1, r.z0], [r.x0, r.y1, r.z0], w);   // back wall faces +z
    pzPushQuad(shell, [r.x1, 0, r.z1], [r.x0, 0, r.z1], [r.x0, r.y1, r.z1], [r.x1, r.y1, r.z1], w);   // rear of house faces -z
    pzPushQuad(shell, [r.x0, 0, r.z1], [r.x0, 0, r.z0], [r.x0, r.y1, r.z0], [r.x0, r.y1, r.z1], w);   // left wall faces +x
    pzPushQuad(shell, [r.x1, 0, r.z0], [r.x1, 0, r.z1], [r.x1, r.y1, r.z1], [r.x1, r.y1, r.z0], w);   // right wall faces -x
    pzPushQuad(shell, [r.x0, r.y1, r.z0], [r.x1, r.y1, r.z0], [r.x1, r.y1, r.z1], [r.x0, r.y1, r.z1], ceil); // ceiling faces -y
  }
  // Projector & fixture bodies (no shadows; glowing lens).
  const mp = state.multiProjector;
  (mp?.screens || []).forEach((scr, idx) => {
    if (!Array.isArray(scr.posM) || !Array.isArray(scr.aimM)) return;
    const bs = pzLookBasis(scr.posM, scr.aimM);
    const col = pzHexCol(STAGEPLAN_PROJ_COLORS[idx % STAGEPLAN_PROJ_COLORS.length]);
    const body = scr.enabled === false ? [0.18, 0.18, 0.2] : [0.22, 0.23, 0.26];
    const c = [scr.posM[0] - bs.f[0] * 0.18, scr.posM[1] - bs.f[1] * 0.18, scr.posM[2] - bs.f[2] * 0.18];
    pzPushOBox(bodies, c, bs.r.map(n => n * 0.24), bs.u.map(n => n * 0.09), bs.f.map(n => n * 0.2), body);
    // Small glowing lens (only the lens, not the whole front face).
    const lc = [c[0] + bs.f[0] * 0.21, c[1] + bs.f[1] * 0.21, c[2] + bs.f[2] * 0.21];
    pzPushOBox(bodies, lc, bs.r.map(n => n * 0.05), bs.u.map(n => n * 0.05), bs.f.map(n => n * 0.012), col.map(v => v * 0.6), scr.enabled === false ? 0 : 0.9, col);
    // Hanging pipe to the ceiling (indoor) or a stand to the floor.
    const top = r.walls ? r.y1 : scr.posM[1];
    if (r.walls && scr.posM[1] > 2.2) {
      pzPushBox(bodies, [scr.posM[0] - 0.02, scr.posM[1] + 0.08, scr.posM[2] - 0.02], [scr.posM[0] + 0.02, top, scr.posM[2] + 0.02], [0.2, 0.2, 0.22]);
    } else {
      pzPushBox(bodies, [scr.posM[0] - 0.025, 0, scr.posM[2] - 0.025], [scr.posM[0] + 0.025, scr.posM[1] - 0.08, scr.posM[2] + 0.025], [0.2, 0.2, 0.22]);
    }
  });
  (state.dmxDevices || []).forEach((dev, idx) => {
    if (!dev || dev.enabled === false) return;
    ensureDmxDeviceWorldPose(dev, idx);
    const bs = pzLookBasis(dev.posM, dev.aimM);
    const isLight = isDmxLightDevice(dev);
    const s = isLight ? 0.14 : 0.2;
    pzPushOBox(bodies, dev.posM, bs.r.map(n => n * s), bs.u.map(n => n * s), bs.f.map(n => n * s * 1.3), [0.16, 0.16, 0.18]);
    if (isLight) {
      const lc = [dev.posM[0] + bs.f[0] * s * 1.32, dev.posM[1] + bs.f[1] * s * 1.32, dev.posM[2] + bs.f[2] * s * 1.32];
      pzPushOBox(bodies, lc, bs.r.map(n => n * s * 0.6), bs.u.map(n => n * s * 0.6), bs.f.map(n => n * 0.01), [0.9, 0.86, 0.78], 0.8, [1, 0.95, 0.85]);
    }
  });

  const all = casters.concat(receivers, shell, bodies);
  pz.casterCount = casters.length / 10;
  pz.shellStart = (casters.length + receivers.length) / 10;
  pz.shellCount = shell.length / 10;
  pz.bodiesStart = pz.shellStart + pz.shellCount;
  pz.vertCount = all.length / 10;
  gl.bindBuffer(gl.ARRAY_BUFFER, pz.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(all), gl.DYNAMIC_DRAW);
}

// Same world transform collectVenue3DOccluders uses for scenic mesh3d objects.
function getMesh3DVenueModelMatrix(surf, v) {
  const unitM = v.screenHeightM * 0.5;
  const centerY = v.screenBottomM + v.screenHeightM * 0.5;
  const baseZ = v.screenZ + Math.min(1.15, v.screenHeightM * 0.30);
  const p3 = surf.pos3d || [0, 0, 0];
  const s3 = surf.scale3d || [1, 1, 1];
  return mat4ComposeTRS(
    [(Number(p3[0]) || 0) * unitM, centerY + (Number(p3[1]) || 0) * unitM, baseZ + (Number(p3[2]) || 0) * unitM],
    surf.rot3d || [0, 0, 0],
    [(Number(s3[0]) || 1) * unitM, (Number(s3[1]) || 1) * unitM, (Number(s3[2]) || 1) * unitM]
  );
}

// World → projector clip matrix matching computeProjectorOptics3D's lens model
// (x/y span the full raster incl. lens shift; w = forward distance; z unused).
function buildProjectorClipMatrix(opt) {
  const E = opt.eye, r = opt.rAxis, u = opt.uAxis, f = opt.fAxis;
  const kx = 2 / opt.wUnit, ky = 2 / opt.hUnit;
  const ox = 2 * opt.cx0 - 1, oy = 2 * opt.cy0 - 1;
  const Rx = [kx * r[0] + ox * f[0], kx * r[1] + ox * f[1], kx * r[2] + ox * f[2]];
  const Ry = [ky * u[0] + oy * f[0], ky * u[1] + oy * f[1], ky * u[2] + oy * f[2]];
  const n = PREVIZ_SHADOW_NEAR, F = PREVIZ_SHADOW_FAR;
  const a = (F + n) / (F - n), b = (-2 * F * n) / (F - n);
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const m = new Float32Array(16);
  m[0] = Rx[0]; m[4] = Rx[1]; m[8] = Rx[2]; m[12] = -dot(Rx, E);
  m[1] = Ry[0]; m[5] = Ry[1]; m[9] = Ry[2]; m[13] = -dot(Ry, E);
  m[2] = a * f[0]; m[6] = a * f[1]; m[10] = a * f[2]; m[14] = -a * dot(f, E) + b;
  m[3] = f[0]; m[7] = f[1]; m[11] = f[2]; m[15] = -dot(f, E);
  return m;
}

const PREVIZ_MIX_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uMix;
out vec4 outColor;
void main() { outColor = vec4(mix(texture(uA, vUv).rgb, texture(uB, vUv).rgb, uMix), 1.0); }`;

// Which on-screen viewports want the 3D venue this frame (read before the GL canvas resizes).
function collectVenuePrevizTargets() {
  if (typeof document === 'undefined' || state.projectorMode || state.ecoMode) return null;
  const sp = state.multiProjector?.stagePlan;
  if (!sp) return null;
  const out = [];
  if (state.layoutMode === 'rig' && sp.viewMode === 'orbit3d') {
    const cvs = document.getElementById('rig-canvas');
    if (cvs) {
      const r = cvs.getBoundingClientRect();
      const heatH = sp.showHeatmap ? 34 : 0;
      if (r.width > 8 && r.height > heatH + 8) {
        out.push({ id: 'rig', left: r.left, top: r.top, width: Math.max(320, r.width), height: Math.max(240, r.height) - heatH, clipW: r.width, clipH: r.height - heatH });
      }
    }
  }
  if (state.outputFeedTab === 'venue3d' && !isBuildRoom()) {
    const vp = document.getElementById('stage-viewport');
    if (vp) {
      const r = vp.getBoundingClientRect();
      if (r.width > 8 && r.height > 8) out.push({ id: 'stage', left: r.left, top: r.top, width: r.width, height: r.height, clipW: r.width, clipH: r.height });
    }
  }
  return out.length ? out : null;
}

// Projectors that light the previz this frame (≤ 4), honouring the HUD projector solo.
function getPrevizLitProjectors(mp, sp) {
  const field = solveStagePlanOpticalField(mp);
  const solo = Number(sp.previzSolo) || 0;
  const lit = [];
  (mp.screens || []).forEach((scr, idx) => {
    if (!scr || scr.enabled === false || lit.length >= PREVIZ_MAX_PROJ) return;
    if (solo > 0 && scr.index !== solo) return;
    const opt = field?.opticsByIndex?.get(scr.index);
    if (!opt) return;
    lit.push({ scr, opt, idx });
  });
  return lit;
}

function pzBindLightUniforms(p, lit, stageTexFor, nowMs) {
  const mg = clamp((Number(state.masterOpacity) || 0) * (Number(state.blackoutFade) || 0), 0, 1);
  gl.uniform1i(p.loc('uProjN'), lit.length);
  for (let i = 0; i < PREVIZ_MAX_PROJ; i++) {
    const L = lit[i];
    gl.activeTexture(gl.TEXTURE1 + i);
    gl.bindTexture(gl.TEXTURE_2D, L ? stageTexFor(L) : whiteTex1x1);
    gl.uniform1i(p.loc(`uPTex${i}`), 1 + i);
    gl.activeTexture(gl.TEXTURE5 + i);
    gl.bindTexture(gl.TEXTURE_2D, L ? _pz.shadows[i].tex : _pz.litTex);
    gl.uniform1i(p.loc(`uPSh${i}`), 5 + i);
    if (!L) continue;
    const s = L.scr;
    gl.uniformMatrix4fv(p.loc(`uPClip[${i}]`), false, L.clip);
    gl.uniform3fv(p.loc(`uPEye[${i}]`), L.opt.eye);
    // Stage UV is v-up (same as the FBO texture), so the effective crop maps 1:1.
    const ec = getEffectiveProjectorCrop(s);
    gl.uniform4f(p.loc(`uPCrop[${i}]`), ec.x, ec.y, ec.w, ec.h);
    const mpOn = !!state.multiProjector?.enabled;
    gl.uniform4f(p.loc(`uPBlend[${i}]`), mpOn ? (s.blendL || 0) : 0, mpOn ? (s.blendR || 0) : 0, mpOn ? (s.blendT || 0) : 0, mpOn ? (s.blendB || 0) : 0);
    const shut = s.pjlink?.shutterClosed ? 0 : 1;
    const gain = ((Number(s.lumens) || 8500) / Math.max(0.02, L.opt.wUnit * L.opt.hUnit * PREVIZ_REF_LUX)) * (Number(s.gain) || 1) * mg * shut;
    gl.uniform1f(p.loc(`uPGain[${i}]`), gain);
  }
  // DMX light fixtures
  const lights = [];
  for (const dev of state.dmxDevices || []) {
    if (lights.length >= PREVIZ_MAX_LIGHTS) break;
    const o = getDmxLightOutput(dev, nowMs);
    if (!o || o.intensity <= 0.002) continue;
    lights.push(o);
  }
  gl.uniform1i(p.loc('uLightN'), lights.length);
  lights.forEach((o, i) => {
    const half = ((o.beamDeg * 0.5) * Math.PI) / 180;
    const k = (o.candela * o.intensity) / PREVIZ_REF_LUX;
    gl.uniform3fv(p.loc(`uLPos[${i}]`), o.pos);
    gl.uniform3fv(p.loc(`uLDir[${i}]`), o.dir);
    gl.uniform3f(p.loc(`uLCol[${i}]`), o.color[0] * k, o.color[1] * k, o.color[2] * k);
    gl.uniform2f(p.loc(`uLCone[${i}]`), Math.cos(Math.min(1.5, half * 1.2)), Math.cos(half * 0.55));
  });
  return lights.length;
}

function pzStageMixTexture() {
  const xf = state.crossfade;
  if (!xf || !xf.active || !stageFboA || stageFboA.w !== stageFboB.w || stageFboA.h !== stageFboB.h) return stageFboB.tex;
  const pz = _pz;
  if (!pz.mixProg) pz.mixProg = pzCompileProgram(PREVIZ_FS_TRI_VS, PREVIZ_MIX_FS, 'mix');
  if (!pz.mixProg) return stageFboB.tex;
  const w = Math.max(64, Math.round(stageFboB.w / 2)), h = Math.max(36, Math.round(stageFboB.h / 2));
  if (!pz.mixFbo || pz.mixFbo.w !== w || pz.mixFbo.h !== h) {
    const color = pzMakeTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    pz.mixFbo = { fbo, color, w, h };
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, pz.mixFbo.fbo);
  gl.viewport(0, 0, w, h);
  gl.useProgram(pz.mixProg.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, stageFboA.tex);
  gl.uniform1i(pz.mixProg.loc('uA'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, stageFboB.tex);
  gl.uniform1i(pz.mixProg.loc('uB'), 1);
  gl.uniform1f(pz.mixProg.loc('uMix'), clamp(Number(xf.mix) || 0, 0, 1));
  gl.bindVertexArray(emptyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return pz.mixFbo.color;
}

function renderVenuePrevizTargets(targets, areaRect, totalW, totalH, dpr) {
  if (!targets || targets.length === 0) return;
  if (!initVenuePrevizGL()) return;
  const pz = _pz;
  const mp = ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  ensureVenueCameraState(sp);
  ensureWorldPropsState();
  if (!sp._framed && targets[0]) frameVenueCamera(sp, targets[0].width / Math.max(1, targets[0].height), { toOrbit: false });
  const nowMs = performance.now();
  pz.frame = (pz.frame + 1) % 100000;

  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);

  const key = buildPrevizMeshKey();
  if (key !== pz.meshKey) {
    rebuildPrevizSceneMesh();
    pz.meshKey = key;
  }

  const lit = getPrevizLitProjectors(mp, sp);
  for (const L of lit) L.clip = buildProjectorClipMatrix(L.opt);
  const sharedStage = pzStageMixTexture();
  const perProj = typeof renderPrevizProjectorStageTextures === 'function' ? renderPrevizProjectorStageTextures(lit) : null;
  const stageTexFor = (L) => {
    if (perProj && perProj.has(L.scr.index)) return perProj.get(L.scr.index);
    return sharedStage;
  };

  // Shadow maps (casters only) — re-rendered only when geometry or a projector pose changes.
  gl.bindVertexArray(pz.vao);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  gl.depthMask(true);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(pz.shadow.prog);
  const shadowKey = pz.meshKey + '|' + lit.map(L => Array.from(L.clip, n => n.toFixed(4)).join(',')).join(';');
  const shadowsDirty = shadowKey !== pz.shadowKey;
  pz.shadowKey = shadowKey;
  if (shadowsDirty) lit.forEach((L, i) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, pz.shadows[i].fbo);
    gl.viewport(0, 0, PREVIZ_SHADOW_W, PREVIZ_SHADOW_H);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(pz.shadow.loc('uClip'), false, L.clip);
    if (pz.casterCount > 0) gl.drawArrays(gl.TRIANGLES, 0, pz.casterCount);
  });

  const lay = getVenueLayout();
  const house = clamp(Number(sp.previzHouse ?? 0.32), 0, 1);
  const haze = getVenueHazeLevel(nowMs);
  // Auto exposure (like a camera): the brightest group of projectors aimed at the same
  // spot renders the screen near full white instead of clipping it.
  let refLux = 0;
  for (const A of lit) {
    let sum = 0;
    for (const B of lit) {
      if (Math.hypot(A.opt.aim[0] - B.opt.aim[0], A.opt.aim[1] - B.opt.aim[1], A.opt.aim[2] - B.opt.aim[2]) < 0.6) sum += Number(B.opt.avgLux) || 0;
    }
    refLux = Math.max(refLux, sum);
  }
  const autoExp = sp.previzAutoExposure === false || refLux < 1 ? 1 : clamp((PREVIZ_REF_LUX * 0.8) / refLux, 0.2, 3);
  const exposure = clamp(Number(sp.previzExposure ?? 1.0), 0.1, 4) * autoExp;

  // Internal previz resolution: ≤1.5× device pixels, scaled by the performance governor,
  // bilinear-upscaled in the composite pass.
  const pdpr = Math.min(dpr, 1.5) * (typeof getAdaptiveRenderScale === 'function' ? getAdaptiveRenderScale() : 1);
  for (const t of targets) {
    const w = clamp(Math.round(t.width * pdpr), 32, 2400);
    const h = clamp(Math.round(t.height * pdpr), 32, 1600);
    pzEnsureTargets(w, h);
    const cam = getVenueCamera(sp, t.width / Math.max(1, t.height));
    const invVP = mat4InvertGeneral(cam.mvp) || mat4Identity();
    t.cam = cam;

    // Scene pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, pz.sceneFbo.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.018, 0.022, 0.032, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(pz.vao);
    const sc = pz.scene;
    gl.useProgram(sc.prog);
    gl.uniformMatrix4fv(sc.loc('uViewProj'), false, cam.mvp);
    gl.uniform3fv(sc.loc('uCam'), cam.eye);
    gl.uniform1f(sc.loc('uAmbient'), 0.035 + house * 0.85);
    gl.uniform3fv(sc.loc('uSkyCol'), lay.outdoor ? [0.55, 0.62, 0.95] : [0.9, 0.9, 1.0]);
    gl.uniform3fv(sc.loc('uGroundCol'), lay.outdoor ? [0.16, 0.2, 0.12] : [0.5, 0.46, 0.42]);
    gl.uniform1f(sc.loc('uExposure'), exposure);
    gl.uniform1f(sc.loc('uMinZf'), 0.6);
    pzBindLightUniforms(sc, lit, stageTexFor, nowMs);
    if (pz.shellStart > 0) gl.drawArrays(gl.TRIANGLES, 0, pz.shellStart);
    if (pz.shellCount > 0) {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.drawArrays(gl.TRIANGLES, pz.shellStart, pz.shellCount);
      gl.disable(gl.CULL_FACE);
    }
    if (pz.vertCount > pz.bodiesStart) gl.drawArrays(gl.TRIANGLES, pz.bodiesStart, pz.vertCount - pz.bodiesStart);
    gl.disable(gl.DEPTH_TEST);

    // Volumetric haze pass (half resolution)
    gl.bindVertexArray(emptyVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pz.volFbo.fbo);
    gl.viewport(0, 0, pz.volFbo.w, pz.volFbo.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (haze > 0.005 && !cam.ortho && (lit.length > 0 || (state.dmxDevices || []).length > 0)) {
      const vo = pz.volume;
      gl.useProgram(vo.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pz.sceneFbo.depth);
      gl.uniform1i(vo.loc('uDepth'), 0);
      gl.uniformMatrix4fv(vo.loc('uInvVP'), false, invVP);
      gl.uniform3fv(vo.loc('uCam'), cam.eye);
      gl.uniform1f(vo.loc('uHaze'), haze);
      gl.uniform1f(vo.loc('uFrame'), pz.frame % 64);
      gl.uniform1f(vo.loc('uMinZf'), 1.6);
      pzBindLightUniforms(vo, lit, stageTexFor, nowMs);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Composite into the pane
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const glX = Math.round((t.left - areaRect.left) * dpr);
    const glY = Math.round(totalH - (t.top - areaRect.top + t.height) * dpr);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(glX, Math.round(totalH - (t.top - areaRect.top + t.clipH) * dpr), Math.round(t.clipW * dpr), Math.round(t.clipH * dpr));
    gl.viewport(glX, glY, Math.round(t.width * dpr), Math.round(t.height * dpr));
    const co = pz.composite;
    gl.useProgram(co.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pz.sceneFbo.color);
    gl.uniform1i(co.loc('uScene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, pz.volFbo.color);
    gl.uniform1i(co.loc('uVol'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, pz.sceneFbo.depth);
    gl.uniform1i(co.loc('uDepth'), 2);
    gl.uniformMatrix4fv(co.loc('uInvVP'), false, invVP);
    gl.uniform3fv(co.loc('uCam'), cam.eye);
    gl.uniform1i(co.loc('uOutdoor'), lay.outdoor ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }

  // Leave the shared context the way the engine expects it.
  for (let i = 0; i < 9; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(emptyVao);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  _pz.lastTargets = targets;
}

// ----------------------------------------------------------------------------
// 5B. 3D VENUE HUD (camera mode, projector solo, haze, house lights)
// ----------------------------------------------------------------------------
function getVenueHudHost() {
  if (typeof document === 'undefined') return null;
  if (state.outputFeedTab === 'venue3d' && !isBuildRoom()) return document.getElementById('stage-viewport');
  const sp = state.multiProjector?.stagePlan;
  if (state.layoutMode === 'rig' && sp && sp.viewMode === 'orbit3d') return document.getElementById('rig-viewport');
  // The editable 2D plan shares the same view bar (Plan is one of its views).
  if (state.layoutMode === 'rig' && sp && isBuildRoom()) return document.getElementById('rig-viewport');
  return null;
}

function syncVenueHudUI() {
  if (typeof document === 'undefined') return;
  let hud = document.getElementById('venue-hud');
  const host = getVenueHudHost();
  if (!host) {
    if (hud) hud.hidden = true;
    return;
  }
  const mp = ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  ensureVenueCameraState(sp);
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'venue-hud';
    hud.className = 'venue-hud';
    hud.setAttribute('role', 'toolbar');
    hud.setAttribute('aria-label', '3D venue view controls');
  }
  if (!hud._venueBound) {
    hud._venueBound = true;
    hud.addEventListener('pointerdown', e => e.stopPropagation());
    hud.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const spx = ensureStagePlanState(ensureMultiProjectorState());
      if (b.dataset.cam) setVenueCameraMode(b.dataset.cam);
      if (b.dataset.look) setVenueViewLook(b.dataset.look);
      if (b.dataset.solo !== undefined) {
        spx.previzSolo = Number(b.dataset.solo) || 0;
        if (spx.camMode === 'pov' && spx.previzSolo) spx.povIndex = spx.previzSolo;
        syncVenueHudUI();
      }
    });
    hud.addEventListener('input', (e) => {
      const spx = ensureStagePlanState(ensureMultiProjectorState());
      const el = e.target;
      if (el.dataset.k) spx[el.dataset.k] = parseFloat(el.value);
    });
  }
  if (hud.parentElement !== host) host.appendChild(hud);
  hud.hidden = false;
  // In the BUILD world pane the selected-object bar sits on top: keep the view bar just below it.
  if (host.id === 'rig-viewport') {
    const bar = document.getElementById('rig-inspector-bar');
    const top = bar && !bar.hidden && bar.offsetParent ? Math.round(bar.offsetTop + bar.offsetHeight + 6) : 8;
    hud.style.top = top + 'px';
  } else {
    hud.style.top = '';
  }
  const solo = Number(sp.previzSolo) || 0;
  const projBtns = (mp.screens || []).slice(0, 8).map((s, i) => {
    const col = STAGEPLAN_PROJ_COLORS[i % STAGEPLAN_PROJ_COLORS.length];
    return `<button type="button" class="venue-chip${solo === s.index ? ' active' : ''}" data-solo="${s.index}" style="--chip:${col}" title="Show only P${s.index}'s light">P${s.index}</button>`;
  }).join('');
  const walk = sp.camMode === 'walk';
  const pov = sp.camMode === 'pov';
  const povIdx = pov ? (getPovProjector(sp)?.index || 0) : 0;
  const rigPlan = isRigPlanActive();
  const ortho = !rigPlan && sp.camMode === 'ortho' ? sp.orthoView : '';
  const look = ortho ? getVenueViewLook(sp) : 'light';
  const planOn = rigPlan || (ortho === 'top' && look === 'lines');
  const persp = !rigPlan && !walk && !pov && !ortho;
  const sig = `${sp.camMode}|${ortho}|${look}|${rigPlan}|${povIdx}|${solo}|${(mp.screens || []).map(s => s.index).join(',')}`;
  if (hud.dataset.sig !== sig) {
    hud.dataset.sig = sig;
    hud.innerHTML = `
      <div class="venue-hud-row">
        <div class="seg-group" role="group" aria-label="Camera">
          <button type="button" class="seg-btn${planOn ? ' active' : ''}" data-cam="plan" aria-pressed="${planOn}" title="${isRigWorldViewContext() ? 'Plan: the editable top-down drawing — drag screens, projectors, parts &amp; the floorplan' : 'Plan: top view as a measured drawing'}">▦ Plan</button>
          <button type="button" class="seg-btn${persp ? ' active' : ''}" data-cam="orbit" aria-pressed="${persp}" title="3D: orbit around the venue in perspective">⟲ 3D</button>
          <button type="button" class="seg-btn${!rigPlan && walk ? ' active' : ''}" data-cam="walk" aria-pressed="${!rigPlan && walk}" title="Walk through the venue at eye height">🚶 Walk</button>
          <button type="button" class="seg-btn${!rigPlan && pov ? ' active' : ''}" data-cam="pov" aria-pressed="${!rigPlan && pov}" title="Look through a projector's lens — pixel-true mapping view (pick the projector with P1/P2…)">📽 POV${!rigPlan && pov ? ' P' + povIdx : ''}</button>
        </div>
        <span class="venue-hud-sep"></span>
        <button type="button" class="venue-chip${solo === 0 ? ' active' : ''}" data-solo="0" title="Light from every projector">All</button>
        ${projBtns}
      </div>
      <div class="venue-hud-row">
        <div class="seg-group venue-viewcube" role="group" aria-label="Orthographic views">
          ${Object.entries(VENUE_ORTHO_VIEWS).map(([k, v]) => `<button type="button" class="seg-btn${ortho === k ? ' active' : ''}" data-cam="${k}" aria-pressed="${ortho === k}" title="${v.label} view (orthographic, true scale)${k === 'top' ? ' — spot plot: up = upstage' : ''}">${v.label}</button>`).join('')}
        </div>
      </div>
      ${ortho ? `<div class="venue-hud-row">
        <div class="seg-group" role="group" aria-label="Look">
          <button type="button" class="seg-btn${look === 'lines' ? ' active' : ''}" data-look="lines" aria-pressed="${look === 'lines'}" title="Lines: a measured drawing — outlines, sizes &amp; heights in metres over a dimmed render">✎ Lines</button>
          <button type="button" class="seg-btn${look === 'light' ? ' active' : ''}" data-look="light" aria-pressed="${look === 'light'}" title="Light: the rendered venue with every projector's light">☀ Light</button>
        </div>
      </div>` : ''}
      ${rigPlan ? '' : `<div class="venue-hud-row">
        <label title="Atmospheric haze (beams become visible). Hazer DMX devices add to this.">Haze <input type="range" min="0" max="1" step="0.01" data-k="previzHaze" value="${clamp(Number(sp.previzHaze ?? 0.22), 0, 1)}"></label>
        <label title="House / work light level">House <input type="range" min="0" max="1" step="0.01" data-k="previzHouse" value="${clamp(Number(sp.previzHouse ?? 0.32), 0, 1)}"></label>
      </div>`}
      <div class="venue-hud-hint">${rigPlan
        ? 'Plan · drag screens, projectors, parts &amp; people · drag a beam tip to aim · Alt+drag a part to rotate · scroll to zoom'
        : ortho
        ? `${VENUE_ORTHO_VIEWS[ortho].label} view · true scale · drag empty space to pan · scroll to zoom · drag a selected object to move it in this plane`
        : pov
        ? 'Projector POV · click a surface to select · drag its corners onto the real object · P-buttons switch lens'
        : (walk
          ? 'WASD / arrows walk · drag to look · Q/E down/up · Shift run · double-click floor to teleport'
          : 'Drag to orbit · Shift+drag pan · scroll zoom · double-click floor to walk there · click a surface to select')}</div>`;
  }
}

// Stage-pane navigation for the MAP / LIVE "3D Venue" feed.
let _venueStageDrag = null;
let _venueStageHits = [];
let _venueStageCam = null;
let _venueSpotHits = [];

// Followspot overlay in the 3D Venue: target reticle (solid = live, dashed = pre-aim), beam
// lines from every routed projector (✕ when it can't reach), and the physical spot size ring.
function drawVenueSpotOverlays(ctx, mvp, cssW, cssH) {
  const hits = [];
  const mp = state.multiProjector;
  const toPx = (p) => {
    const c = venueClipPoint(p, mvp);
    if (c[3] < 0.06) return null;
    return [((c[0] / c[3]) * 0.5 + 0.5) * cssW, (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * cssH];
  };
  const seg = (a, b) => {
    const sgm = venueProjectSegment(a, b, mvp, cssW, cssH);
    if (!sgm) return;
    ctx.beginPath(); ctx.moveTo(sgm[0][0], sgm[0][1]); ctx.lineTo(sgm[1][0], sgm[1][1]); ctx.stroke();
  };
  const active = typeof getActiveLiveSpot === 'function' ? getActiveLiveSpot() : null;
  const mainB = getWorldScreenBasis(getPrimaryWorldScreen());
  for (const s of state.spots || []) {
    if (!s || s.enabled === false || !s.converge3D) continue;
    const live = s.mode && s.mode !== 'off';
    const isAct = active && active.id === s.id;
    const T = getSpotWorldTargetM(s);
    const fl = getVenueFloorHeightAt(T[0], T[2]);
    const col = live ? '#ffcb7d' : 'rgba(255,203,125,0.7)';
    ctx.save();
    // Beam lines from each routed projector
    (mp?.screens || []).forEach((scr, i) => {
      if (!scr || scr.enabled === false || !spotUsesProjector(s, scr.index) || !Array.isArray(scr.posM)) return;
      const c = computeConvergentSpotForProjector(s, scr.index);
      const reach = !(c.outOfReach || c.routedOff);
      ctx.strokeStyle = STAGEPLAN_PROJ_COLORS[i % STAGEPLAN_PROJ_COLORS.length] + (live ? 'cc' : '66');
      ctx.lineWidth = isAct ? 1.4 : 1;
      ctx.setLineDash(reach ? (live ? [] : [3, 4]) : [2, 3]);
      seg(scr.posM, T);
      if (!reach) {
        const m = toPx([(scr.posM[0] + T[0]) / 2, (scr.posM[1] + T[1]) / 2, (scr.posM[2] + T[2]) / 2]);
        if (m) { ctx.fillStyle = '#ff6b6b'; ctx.font = '700 9px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(`P${scr.index} can't reach`, m[0], m[1]); }
      }
    });
    // Physical size ring on the floor + plumb line to the aim point
    const worldR = clamp(Number(s.radius) || 0.2, 0.005, 2) * mainB.heightM;
    ctx.setLineDash(live ? [] : [4, 4]);
    ctx.strokeStyle = col;
    ctx.lineWidth = isAct ? 1.8 : 1.2;
    const ring = [];
    for (let k = 0; k <= 32; k++) { const a = (k / 32) * Math.PI * 2; ring.push([T[0] + Math.cos(a) * worldR, fl + 0.01, T[2] + Math.sin(a) * worldR]); }
    for (let k = 0; k < 32; k++) seg(ring[k], ring[k + 1]);
    ctx.setLineDash([2, 3]);
    seg([T[0], fl, T[2]], T);
    // Reticle at the aim point
    const p = toPx(T);
    if (p) {
      ctx.setLineDash(live ? [] : [3, 3]);
      ctx.lineWidth = isAct ? 2 : 1.4;
      ctx.beginPath();
      ctx.arc(p[0], p[1], isAct ? 9 : 7, 0, Math.PI * 2);
      ctx.moveTo(p[0] - 14, p[1]); ctx.lineTo(p[0] - 5, p[1]);
      ctx.moveTo(p[0] + 5, p[1]); ctx.lineTo(p[0] + 14, p[1]);
      ctx.moveTo(p[0], p[1] - 14); ctx.lineTo(p[0], p[1] - 5);
      ctx.moveTo(p[0], p[1] + 5); ctx.lineTo(p[0], p[1] + 14);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      const label = `${s.name || 'Spot'}${live ? '' : ' · pre-aim'} · Ø${(worldR * 2).toFixed(1)}m`;
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = 'rgba(6,10,18,0.78)';
      ctx.fillRect(p[0] - tw / 2, p[1] - 29, tw, 14);
      ctx.fillStyle = col;
      ctx.fillText(label, p[0], p[1] - 19);
      hits.push({ id: s.id, px: p[0], py: p[1] });
    }
    ctx.restore();
  }
  return hits;
}

// Mouse → floor point (deck/floor/ground) in the 3D Venue feed.
function venueMouseToFloor(mx, my) {
  if (!_venueStageCam) return null;
  const { cam, cssW, cssH } = _venueStageCam;
  const ray = venueScreenRay(cam, mx / cssW, 1 - my / cssH);
  if (!ray) return null;
  let best = null;
  const vh = raycastVenueLayout(ray.origin[0], ray.origin[1], ray.origin[2], ray.dir[0], ray.dir[1], ray.dir[2]);
  if (vh && (vh.kind === 'deck' || vh.kind === 'floor')) best = vh.t;
  if (ray.dir[1] < -1e-4) {
    const tf = -ray.origin[1] / ray.dir[1];
    if (tf > 0 && (best === null || tf < best)) best = tf;
  }
  if (best === null) return null;
  return [ray.origin[0] + ray.dir[0] * best, ray.origin[2] + ray.dir[2] * best];
}

// Mouse → point on the horizontal plane y = planeY (keeps a dragged reticle under the cursor).
function venueMouseToPlaneY(mx, my, planeY) {
  if (!_venueStageCam) return null;
  const { cam, cssW, cssH } = _venueStageCam;
  const ray = venueScreenRay(cam, mx / cssW, 1 - my / cssH);
  if (!ray || Math.abs(ray.dir[1]) < 1e-4) return null;
  const t = (planeY - ray.origin[1]) / ray.dir[1];
  if (t <= 0 || t > 80) return null;
  return [ray.origin[0] + ray.dir[0] * t, ray.origin[2] + ray.dir[2] * t];
}

function getSteerableSpot3D() {
  const s = typeof getActiveLiveSpot === 'function' ? getActiveLiveSpot() : null;
  return s && s.enabled !== false && s.converge3D ? s : null;
}

// Surface picking / 3D corner editing in the 3D Venue feed. Returns a drag state or null.
function venueStagePointerDown(mx, my, e) {
  // Point calibration: every click in the 3D view adds a pin (corners snap).
  if (e.button === 0 && getVenueViewLook(ensureStagePlanState(ensureMultiProjectorState())) === 'lines' && tryBeginLinesDimensionEdit(mx, my, e.currentTarget || e.target)) {
    return { kind: 'dim-edit', picked: true };
  }
  if (state.projAlign && state.projAlign.active && _venueStageCam && typeof addAlignPinFromRay === 'function' && !e.altKey && e.button === 0) {
    if (typeof tryBeginAlignPinDrag === 'function' && tryBeginAlignPinDrag(mx, my, e.currentTarget || e.target)) return { kind: 'align-pin', picked: true };
    const { cam, cssW, cssH } = _venueStageCam;
    const ray = venueScreenRay(cam, mx / cssW, 1 - my / cssH);
    if (ray) { addAlignPinFromRay(ray.origin, ray.dir); return { kind: 'align-pin', picked: true }; }
  }
  // Followspot reticles (any room): drag the 3D aim point across the floor.
  for (const h of _venueSpotHits || []) {
    if (Math.hypot(mx - h.px, my - h.py) <= 14) {
      const sp = (state.spots || []).find(s => s.id === h.id);
      if (sp) {
        state.activeSpotIndex = Math.max(0, state.spots.indexOf(sp));
        state.venueSel = { kind: 'spot', id: sp.id };
        syncVenueCardUI(true);
        if (!sp.followPropId) ensureSpotStageModel(sp);
        const T = getSpotWorldTargetM(sp);
        const grab = venueMouseToPlaneY(mx, my, T[1]);
        // Remember where on the plane we grabbed so the reticle doesn't jump.
        return { kind: 'spot-target3d', id: sp.id, planeY: T[1], grabOff: grab ? [T[0] - grab[0], T[2] - grab[1]] : [0, 0] };
      }
    }
  }
  const hits = _venueStageHits || [];
  const canEdit = isGeomReach();
  // 0. Physical objects under the cursor (people, screens, projectors, lights, 3D objects).
  let objHit = null;
  if (_venueStageCam) {
    const { cam, cssW, cssH } = _venueStageCam;
    const ray = venueScreenRay(cam, mx / cssW, 1 - my / cssH);
    if (ray) objHit = pickVenueObjects(ray.origin, ray.dir);
  }
  // Dragging the already-selected person walks them across the floor.
  if (objHit && objHit.kind === 'world_prop' && state.venueSel && state.venueSel.kind === 'world_prop' && state.venueSel.id === objHit.id) {
    const p = getWorldPropById(objHit.id);
    // Slide on the horizontal plane at the height where the cursor grabbed them, so the
    // grabbed point stays under the cursor (a feet-level plane amplifies motion).
    const planeY = objHit.point ? objHit.point[1] : p.posM[1];
    const f = p ? venueMouseToPlaneY(mx, my, planeY) : null;
    if (p && f) {
      if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Move Person (3D)');
      return { kind: 'prop-move3d', id: p.id, planeY, grabOff: [p.posM[0] - f[0], p.posM[2] - f[1]] };
    }
  }
  // 1. Corner handles of the selected surface
  if (canEdit) {
    for (const h of hits) {
      if (h.id !== state.selectedSurfaceId || h.locked) continue;
      for (let k = 0; k < h.corners2d.length; k++) {
        const p = h.corners2d[k];
        if (p && Math.hypot(mx - p[0], my - p[1]) <= 11 && h.corners3d[k]) {
          const surf = state.surfaces.find(s => s.id === h.id);
          if (!surf) return null;
          if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Move Corner (3D)');
          return { kind: 'surf-corner3d', id: h.id, idx: k, refIndex: h.corners3d[k].refIndex, dist: null };
        }
      }
    }
  }
  // 2. A non-screen object in front wins (people stand in front of surfaces).
  if (objHit && objHit.kind !== 'world_screen') {
    selectVenueObject(objHit.kind, objHit.id);
    return { kind: 'picked' };
  }
  // 3. Click inside a surface selects it (top-most first); the drag still orbits the camera.
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (h.poly2d.length >= 3 && pointInPoly2D_venue(mx, my, h.poly2d)) {
      const surf = state.surfaces.find(s => s.id === h.id);
      if (surf) {
        if (state.selectedSurfaceId !== surf.id && typeof selectSurface === 'function') selectSurface(surf.id);
        if (typeof setActiveSelection === 'function') setActiveSelection('surface', surf.id, surf.name);
        state.venueSel = { kind: 'surface', id: surf.id };
        syncVenueCardUI(true);
      }
      if (canEdit && e.altKey && surf && !h.locked) {
        if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Move Surface (3D)');
        const R = getPrevizProjectorRefs().refs.find(r => r.scr.index === (h.corners3d[0] && h.corners3d[0].refIndex));
        return R ? { kind: 'surf-move3d', id: surf.id, ref: R, startUv: venueMouseToStageUv(mx, my, R), orig: surf.points.map(p => [p[0], p[1]]) } : null;
      }
      return { kind: 'picked' };
    }
  }
  // 4. The screen itself
  if (objHit && objHit.kind === 'world_screen') {
    selectVenueObject(objHit.kind, objHit.id);
    return { kind: 'picked' };
  }
  return null;
}

function venueMouseToStageUv(mx, my, R) {
  if (!_venueStageCam || !R) return null;
  const { cam, cssW, cssH } = _venueStageCam;
  const ray = venueScreenRay(cam, mx / cssW, 1 - my / cssH);
  if (!ray) return null;
  const occ = (getPrevizProjectorRefs().field?.occluders || []).filter(o => !o.isProp);
  const hit = raycastWorldForProjector(ray.origin, ray.dir, occ, 12);
  return worldToStageUvViaRef(hit.point, R);
}

function venueStagePointerMove(drag, mx, my) {
  if (drag.kind === 'prop-move3d') {
    const p = getWorldPropById(drag.id);
    const f = venueMouseToPlaneY(mx, my, drag.planeY);
    if (p && f) moveWorldPropTo(p, f[0] + drag.grabOff[0], f[1] + drag.grabOff[1]);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    return;
  }
  if (drag.kind === 'spot-target3d') {
    const sp = (state.spots || []).find(s => s.id === drag.id);
    const f = venueMouseToPlaneY(mx, my, drag.planeY ?? 1.3);
    if (sp && f) setSpotWorldTargetFromPlan(sp, f[0] + drag.grabOff[0], f[1] + drag.grabOff[1], { glide: false, stageModel: true });
    return;
  }
  const surf = state.surfaces.find(s => s.id === drag.id);
  if (!surf) return;
  if (drag.kind === 'surf-corner3d') {
    const R = getPrevizProjectorRefs().refs.find(r => r.scr.index === drag.refIndex);
    const uv = venueMouseToStageUv(mx, my, R);
    if (!uv) return;
    surf.points[drag.idx] = [clamp(uv[0], -0.45, 1.45), clamp(uv[1], -0.45, 1.45)];
  } else if (drag.kind === 'surf-move3d') {
    const uv = venueMouseToStageUv(mx, my, drag.ref);
    if (!uv || !drag.startUv) return;
    const du = uv[0] - drag.startUv[0], dv = uv[1] - drag.startUv[1];
    surf.points = drag.orig.map(p => [clamp(p[0] + du, -0.45, 1.45), clamp(p[1] + dv, -0.45, 1.45)]);
  }
  if (surf.type === 'quad' && typeof initSurfaceMeshFromCorners === 'function') initSurfaceMeshFromCorners(surf);
  if (typeof bumpSurfaceGeom === 'function') bumpSurfaceGeom(surf);
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
}
function initVenueStagePaneControls() {
  if (typeof document === 'undefined') return;
  const vp = document.getElementById('stage-viewport');
  if (!vp || vp._venueBound) return;
  vp._venueBound = true;
  const active = () => state.outputFeedTab === 'venue3d' && !isBuildRoom();
  const local = (e) => {
    const r = vp.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top, r];
  };
  vp.addEventListener('pointerenter', () => { if (active()) _venueHoverEl = vp; });
  vp.addEventListener('pointerleave', () => { if (_venueHoverEl === vp) _venueHoverEl = null; });
  vp.addEventListener('pointerdown', (e) => {
    if (!active() || e.target.closest('#venue-hud, #venue-card')) return;
    _venueHoverEl = vp;
    const sp = ensureStagePlanState(ensureMultiProjectorState());
    const [mx, my] = local(e);
    const surfDrag = e.button === 0 ? venueStagePointerDown(mx, my, e) : null;
    const picked = surfDrag && surfDrag.kind === 'picked';
    _venueStageDrag = (!picked && surfDrag) || venueCamBeginDrag(sp, mx, my, { pan: e.shiftKey || e.button === 1 || e.button === 2 });
    _venueStageDrag.picked = picked;
    try { vp.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    e.stopPropagation();
  }, true);
  vp.addEventListener('pointermove', (e) => {
    if (!active()) return;
    if (!_venueStageDrag) {
      // Trackpad spot armed (` key): the 3D spot follows the mouse across the floor.
      const armed = state.trackpadSpotTarget ? getSteerableSpot3D() : null;
      if (armed && !state.pointerLocked && !e.target.closest('#venue-hud, #venue-card')) {
        const [mx, my] = local(e);
        const f = venueMouseToFloor(mx, my);
        if (f) {
          if (armed.followPropId) { const p = getWorldPropById(armed.followPropId); if (p) moveWorldPropTo(p, f[0], f[1]); }
          else setSpotWorldTargetFromPlan(armed, f[0], f[1], { glide: true, stageModel: true });
          armed._lastSeatTouchMs = Date.now();
        }
        vp.style.cursor = 'crosshair';
      } else {
        vp.style.cursor = '';
      }
      return;
    }
    const sp = ensureStagePlanState(ensureMultiProjectorState());
    const [mx, my] = local(e);
    if (_venueStageDrag.kind === 'surf-corner3d' || _venueStageDrag.kind === 'surf-move3d' || _venueStageDrag.kind === 'spot-target3d' || _venueStageDrag.kind === 'prop-move3d') venueStagePointerMove(_venueStageDrag, mx, my);
    else {
      if (Math.hypot(mx - _venueStageDrag.startX, my - _venueStageDrag.startY) > 4) _venueStageDrag.moved = true;
      venueCamDrag(sp, _venueStageDrag, mx, my);
    }
    e.stopPropagation();
  }, true);
  const end = (e) => {
    if (!_venueStageDrag) return;
    const d = _venueStageDrag;
    // A click on empty space (no object, no drag) clears the 3D selection.
    if (e.type === 'pointerup' && !d.moved && !d.picked && (d.kind === 'orbit3d' || d.kind === 'walk-look' || d.kind === 'pov-locked') && state.venueSel) {
      state.venueSel = null;
      syncVenueCardUI(true);
    }
    if (state.room === 'live' && e.type === 'pointerup' && !d.moved && !d.picked && (d.kind === 'orbit3d' || d.kind === 'walk-look' || d.kind === 'pov-locked')) {
      const sp = getSteerableSpot3D();
      const [mx, my] = local(e);
      const f = sp ? venueMouseToFloor(mx, my) : null;
      if (sp && f) {
        if (sp.followPropId) { const p = getWorldPropById(sp.followPropId); if (p) moveWorldPropTo(p, f[0], f[1]); }
        else setSpotWorldTargetFromPlan(sp, f[0], f[1], { glide: true, stageModel: true });
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      }
    }
    _venueStageDrag = null;
    try { vp.releasePointerCapture(e.pointerId); } catch (_) {}
    e.stopPropagation();
  };
  vp.addEventListener('pointerup', end, true);
  vp.addEventListener('pointercancel', end, true);
  vp.addEventListener('wheel', (e) => {
    if (!active()) return;
    e.preventDefault();
    e.stopPropagation();
    const spAim = e.altKey ? getSteerableSpot3D() : null;
    if (spAim) {
      ensureSpotStageModel(spAim);
      spAim.aimHeightM = clamp((Number(spAim.aimHeightM) || 1.3) - e.deltaY * 0.004, 0, 4);
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      return;
    }
    venueCamWheel(ensureStagePlanState(ensureMultiProjectorState()), e.deltaY);
  }, { passive: false, capture: true });
  vp.addEventListener('dblclick', (e) => {
    if (!active() || e.target.closest('#venue-hud, #venue-card')) return;
    const [mx, my, r] = local(e);
    venueTeleportToScreenPoint(ensureStagePlanState(ensureMultiProjectorState()), r.width / Math.max(1, r.height), mx / r.width, 1 - my / r.height);
    syncVenueHudUI();
    e.stopPropagation();
  }, true);
  vp.addEventListener('contextmenu', (e) => { if (active()) e.preventDefault(); }, true);
  // "Fit" frames the stage when the 3D Venue feed is showing.
  document.getElementById('btn-stage-reset-zoom')?.addEventListener('click', (e) => {
    if (!active()) return;
    e.stopImmediatePropagation();
    const r = vp.getBoundingClientRect();
    frameVenueCamera(ensureStagePlanState(ensureMultiProjectorState()), r.width / Math.max(1, r.height));
  }, true);
}

// Labels for the 3D Venue feed: projector names, people, spot targets (drawn on #stage-overlay).
function renderVenueStageOverlay(ctx, cssW, cssH) {
  const mp = ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  sp._orthoViewH = cssH;
  const cam = getVenueCamera(sp, cssW / Math.max(1, cssH));
  if (getVenueViewLook(sp) === 'lines') drawVenueLinesOverlay(ctx, cam, cssW, cssH);
  const toPx = (p) => {
    const c = venueClipPoint(p, cam.mvp);
    if (c[3] < 0.08) return null;
    return [((c[0] / c[3]) * 0.5 + 0.5) * cssW, (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * cssH];
  };
  // Mapped 2D surfaces & masks, cast onto the venue through their projector.
  const canEdit = isGeomReach();
  // LIVE is a performance view: surface outlines only while geometry reach-through (W) is armed.
  _venueStageHits = (state.room !== 'live' || state.liveReachThrough)
    ? drawVenueSurfaceOutlines(ctx, cam.mvp, cssW, cssH, { handles: canEdit, activeCorner: _venueStageDrag && _venueStageDrag.kind === 'surf-corner3d' ? _venueStageDrag : null })
    : [];
  _venueStageCam = { cam, cssW, cssH };
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  const solo = Number(sp.previzSolo) || 0;
  (mp.screens || []).forEach((scr, idx) => {
    if (!Array.isArray(scr.posM)) return;
    const p = toPx([scr.posM[0], scr.posM[1] + 0.32, scr.posM[2]]);
    if (!p) return;
    const col = STAGEPLAN_PROJ_COLORS[idx % STAGEPLAN_PROJ_COLORS.length];
    const dim = scr.enabled === false || (solo > 0 && solo !== scr.index);
    ctx.globalAlpha = dim ? 0.45 : 1;
    const label = `P${scr.index}${scr.pjlink?.shutterClosed ? ' ⬛' : ''}`;
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(6,10,18,0.78)';
    ctx.fillRect(p[0] - tw / 2, p[1] - 9, tw, 15);
    ctx.fillStyle = col;
    ctx.fillText(label, p[0], p[1] + 2);
  });
  ctx.globalAlpha = 1;
  _venueSpotHits = drawVenueSpotOverlays(ctx, cam.mvp, cssW, cssH);
  drawVenueSelectionHighlight(ctx, cam.mvp, cssW, cssH);
  if (typeof drawProjectorAlignOverlay === 'function') drawProjectorAlignOverlay(ctx, cam.mvp, cssW, cssH, cam);
  if (state.spotCalib && state.spotCalib.active) {
    ctx.fillStyle = 'rgba(255, 203, 125, 0.92)';
    ctx.fillRect(0, cssH - 24, cssW, 24);
    ctx.fillStyle = '#120d04';
    ctx.textAlign = 'left';
    ctx.fillText(`SPOT CALIBRATION · P${state.spotCalib.projIndex} — arrow keys nudge this projector's spot onto the mark (Shift = ×5) · Enter/Esc = done`, 10, cssH - 8);
  }
}

// ----------------------------------------------------------------------------
// 6. SPOT → PROJECTOR ROUTING, 3D CONVERGENCE & PER-PROJECTOR CALIBRATION TRIMS
// ----------------------------------------------------------------------------
// A spot can be routed to a subset of projectors (sp.projectors = [] → all) and,
// with "3D aim" (sp.converge3D), every routed projector draws it at its own raster
// position so all beams meet at the same physical point (a person or a stage mark).
// Residual real-world error is fixed per projector with scr.spotTrim = [du, dv].

function getSpotProjectorList(sp) {
  return Array.isArray(sp?.projectors) ? sp.projectors.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
}

function spotUsesProjector(sp, projIndex) {
  if (!sp) return false;
  const cal = state.spotCalib;
  if (cal && cal.active && cal.spotId === sp.id) return Number(projIndex) === Number(cal.projIndex);
  const list = getSpotProjectorList(sp);
  return list.length === 0 || list.includes(Number(projIndex));
}

function toggleSpotProjector(sp, projIndex) {
  if (!sp) return;
  const all = (state.multiProjector?.screens || []).map(s => s.index);
  let list = getSpotProjectorList(sp);
  if (!projIndex) list = [];
  else if (list.length === 0) list = [projIndex];
  else if (list.includes(projIndex)) list = list.filter(n => n !== projIndex);
  else list = [...list, projIndex];
  if (all.length && all.every(n => list.includes(n))) list = [];
  sp.projectors = list.sort((a, b) => a - b);
}

function getSpotWorldTargetM(sp) {
  if (sp && sp.followPropId) {
    const p = getWorldPropById(sp.followPropId);
    if (p && p.enabled !== false) return [p.posM[0], p.posM[1] + (Number(p.heightM) || 1.75) * 0.6, p.posM[2]];
  }
  // Stage-floor model: a spot on the deck/floor at (x, z), aimed at a body height above it.
  if (sp && Number.isFinite(sp.stageXM) && Number.isFinite(sp.stageZM) && sp.stageXM !== null && sp.stageZM !== null) {
    const fl = getVenueFloorHeightAt(sp.stageXM, sp.stageZM);
    return [sp.stageXM, fl + clamp(Number(sp.aimHeightM ?? 1.3), 0, 4), sp.stageZM];
  }
  return getLegacySpotTargetM(sp);
}

// Upgrade a 3D spot to the stage-floor model (keeps where it currently lands).
function ensureSpotStageModel(sp) {
  if (!sp || (Number.isFinite(sp.stageXM) && Number.isFinite(sp.stageZM) && sp.stageXM !== null && sp.stageZM !== null)) return sp;
  const T = getLegacySpotTargetM(sp);
  const fl = getVenueFloorHeightAt(T[0], T[2]);
  sp.stageXM = Number(T[0].toFixed(3));
  sp.stageZM = Number(T[2].toFixed(3));
  sp.targetStageXM = sp.stageXM;
  sp.targetStageZM = sp.stageZM;
  sp.aimHeightM = clamp(Number.isFinite(sp.aimHeightM) ? sp.aimHeightM : T[1] - fl, 0.5, 2.0);
  return sp;
}

function getLegacySpotTargetM(sp) {
  const b = getWorldScreenBasis(getPrimaryWorldScreen());
  const u = (Number(sp?.spotX ?? 0.5) - 0.5) * b.widthM;
  const v = (Number(sp?.spotY ?? 0.5) - 0.5) * b.heightM;
  const depth = clamp(Number(sp?.performerDepthM ?? 1.2), 0, 12);
  return [0, 1, 2].map(k => b.center[k] + b.uAxis[k] * u + b.vAxis[k] * v + b.nAxis[k] * depth);
}

// Inverse of getSpotWorldTargetM for a floor-plan drag: (x, z) → spotX + depth.
function setSpotWorldTargetFromPlan(sp, wx, wz, opts = {}) {
  if (!sp) return;
  if (sp.followPropId) {
    const p = getWorldPropById(sp.followPropId);
    if (p) { moveWorldPropTo(p, wx, wz); return; }
  }
  if (sp.converge3D || opts.stageModel) {
    ensureSpotStageModel(sp);
    sp.converge3D = true;
    sp.targetStageXM = clamp(wx, -40, 40);
    sp.targetStageZM = clamp(wz, -40, 40);
    if (!opts.glide) { sp.stageXM = sp.targetStageXM; sp.stageZM = sp.targetStageZM; }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    return;
  }
  const b = getWorldScreenBasis(getPrimaryWorldScreen());
  const rx = wx - b.center[0], rz = wz - b.center[2];
  const u = (rx * b.uAxis[0] + rz * b.uAxis[2]) / Math.max(0.1, b.widthM);
  const nLen = Math.hypot(b.nAxis[0], b.nAxis[2]) || 1;
  const depth = (rx * b.nAxis[0] + rz * b.nAxis[2]) / nLen;
  sp.spotX = clamp(0.5 + u, 0, 1);
  sp.targetX = sp.spotX;
  sp.performerDepthM = Number(clamp(depth, 0, 12).toFixed(2));
  sp.targetDepthM = sp.performerDepthM;
  sp.converge3D = true;
}

// Where projector `scr` must draw (stage UV, v-up) so its light passes through world point T.
function mapWorldPointToProjectorStageUv(T, scr, opt) {
  if (!opt || !scr) return null;
  const d = [T[0] - opt.eye[0], T[1] - opt.eye[1], T[2] - opt.eye[2]];
  const f = opt.fAxis, r = opt.rAxis, u = opt.uAxis;
  const zf = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (zf < 0.15) return null;
  let pu = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (zf * opt.wUnit) + opt.cx0;
  let pv = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (zf * opt.hUnit) + opt.cy0;
  if (Array.isArray(scr.spotTrim)) {
    pu += Number(scr.spotTrim[0]) || 0;
    pv += Number(scr.spotTrim[1]) || 0;
  }
  const inside = pu >= -0.08 && pu <= 1.08 && pv >= -0.08 && pv <= 1.08;
  const ec = getEffectiveProjectorCrop(scr);
  return { u: ec.x + pu * ec.w, v: ec.y + pv * ec.h, pu, pv, zf, inside, cropH: ec.h };
}

// Per-projector spot resolution used by projector windows, the previz and overlays.
// Keeps the legacy return shape ({ followspot, bgMask, rayScale, wallWorldM, performerWorldM }).
function computeConvergentSpotForProjector(fsArg, screenIndex, mpArg = null) {
  const fs = fsArg || state.followspot;
  const neutral = { followspot: fs, bgMask: [0.5, 0.5, 1.0, 0.0], rayScale: 1.0 };
  if (!fs) return neutral;
  if (!spotUsesProjector(fs, screenIndex)) {
    return { followspot: { ...fs, mode: 'off' }, bgMask: [0.5, 0.5, 1.0, 0.0], rayScale: 1.0, routedOff: true };
  }
  if (!fs.converge3D) return neutral;
  const mp = mpArg || ensureMultiProjectorState();
  ensureStagePlanState(mp);
  const scr = (mp.screens || []).find(s => s.index === screenIndex);
  if (!scr) return neutral;
  const field = solveStagePlanOpticalField(mp);
  const opt = field?.opticsByIndex?.get(scr.index) || computeProjectorOptics3D(scr, mp);
  const T = getSpotWorldTargetM(fs);
  const m = mapWorldPointToProjectorStageUv(T, scr, opt);
  if (!m || !m.inside) {
    return { followspot: { ...fs, mode: 'off' }, bgMask: [0.5, 0.5, 1.0, 0.0], rayScale: 1.0, outOfReach: true, performerWorldM: T };
  }
  // Keep the physical spot size constant: radius is in stage-height units of the main screen.
  const main = getWorldScreenBasis(getPrimaryWorldScreen());
  const worldR = clamp(Number(fs.radius) || 0.2, 0.005, 2) * main.heightM;
  const convRadius = clamp((worldR / Math.max(0.05, m.zf * opt.hUnit)) * m.cropH, 0.004, 1.5);
  // Ray through the target continues to the screen plane (for plan/overlay drawing).
  const dir = [T[0] - opt.eye[0], T[1] - opt.eye[1], T[2] - opt.eye[2]];
  const denom = dir[0] * main.nAxis[0] + dir[1] * main.nAxis[1] + dir[2] * main.nAxis[2];
  let wall = null;
  if (Math.abs(denom) > 1e-6) {
    const t = ((main.center[0] - opt.eye[0]) * main.nAxis[0] + (main.center[1] - opt.eye[1]) * main.nAxis[1] + (main.center[2] - opt.eye[2]) * main.nAxis[2]) / denom;
    if (t > 0) wall = [opt.eye[0] + dir[0] * t, opt.eye[1] + dir[1] * t, opt.eye[2] + dir[2] * t];
  }
  const maskActive = (fs.mode && fs.mode !== 'off' && fs.maskBgSpill) ? clamp(1.0 - (fs.ambient ?? 0.12), 0.0, 1.0) : 0.0;
  return {
    followspot: { ...fs, spotX: m.u, spotY: m.v, radius: convRadius },
    bgMask: [m.u, m.v, convRadius * 1.18, maskActive],
    rayScale: m.zf / Math.max(0.5, Math.hypot(...dir) || 1),
    wallWorldM: wall,
    performerWorldM: T
  };
}

// Fade up / fade out: a spot that just went to Pre-Aim keeps rendering its last live mode
// while its level (_lvl, driven by updateFollowspotPhysics) ramps down.
function prepareSpotForRender(sp) {
  if (!sp) return sp;
  const lvl = Number.isFinite(sp._lvl) ? clamp(sp._lvl, 0, 1) : 1;
  if (!sp.mode || sp.mode === 'off') {
    if (lvl > 0.003 && sp._lastMode && sp._lastMode !== 'off') return { ...sp, mode: sp._lastMode, gain: (Number(sp.gain) || 1) * lvl };
    return sp;
  }
  return lvl < 0.999 ? { ...sp, gain: (Number(sp.gain) || 1) * lvl } : sp;
}

// Operator-window stage preview: a 3D-aimed spot is drawn where its first routed projector
// actually puts it, so the 2D Stage feed matches reality.
function mapSpotCanonical(sp) {
  if (!sp || !sp.converge3D) return sp;
  const scr = (state.multiProjector?.screens || []).find(s => s && s.enabled !== false && spotUsesProjector(sp, s.index));
  if (!scr) return sp;
  const c = computeConvergentSpotForProjector(sp, scr.index);
  return c && c.followspot && c.followspot.mode !== 'off' ? c.followspot : sp;
}

// 2D Stage feed → 3D: a click/hover at stage UV (sx, sy) on a 3D-aimed spot is cast through
// the first routed projector's lens and lands on the body-height plane above the floor.
function placeSpotFromStageUv(sp, sx, sy, opts = {}) {
  if (!sp || !sp.converge3D) return false;
  const refs = getPrevizProjectorRefs().refs.filter(R => spotUsesProjector(sp, R.scr.index));
  const R = refs[0];
  if (!R) return false;
  const o = R.opt, c = R.crop;
  const trim = Array.isArray(R.scr.spotTrim) ? R.scr.spotTrim : [0, 0];
  const pu = (sx - c.x) / Math.max(1e-4, c.w) - (Number(trim[0]) || 0);
  const pv = (sy - c.y) / Math.max(1e-4, c.h) - (Number(trim[1]) || 0);
  const dir = [0, 1, 2].map(k => o.fAxis[k] + (pu - o.cx0) * o.wUnit * o.rAxis[k] + (pv - o.cy0) * o.hUnit * o.uAxis[k]);
  if (!sp.followPropId) ensureSpotStageModel(sp);
  const T = getSpotWorldTargetM(sp);
  let hx, hz;
  const aimH = sp.followPropId ? (T[1] - getVenueFloorHeightAt(T[0], T[2])) : clamp(Number(sp.aimHeightM ?? 1.3), 0, 4);
  let planeY = T[1];
  // The aim height rides on whatever floor level the new point is over (deck vs house),
  // so re-solve the plane a few times until it settles.
  for (let it = 0; it < 4 && Math.abs(dir[1]) > 1e-4; it++) {
    const t = (planeY - o.eye[1]) / dir[1];
    if (!(t > 0.2 && t < 60)) { hx = undefined; break; }
    hx = o.eye[0] + dir[0] * t; hz = o.eye[2] + dir[2] * t;
    const nextY = getVenueFloorHeightAt(hx, hz) + aimH;
    if (Math.abs(nextY - planeY) < 1e-4) break;
    planeY = nextY;
  }
  if (hx === undefined || Math.hypot(hx - o.eye[0], hz - o.eye[2]) > Math.hypot(o.aim[0] - o.eye[0], o.aim[2] - o.eye[2]) + 0.5) {
    // The ray can't come down to body height before the screen/wall: aim at what it hits
    // instead (aim height follows), so the spot lands exactly where the operator clicked.
    const hit = raycastWorldForProjector(o.eye, dir, [], 30);
    const nl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const back = 0.05; // stay just in front of the surface
    hx = hit.point[0] - (dir[0] / nl) * back; hz = hit.point[2] - (dir[2] / nl) * back;
    if (!sp.followPropId) sp.aimHeightM = clamp(hit.point[1] - (dir[1] / nl) * back - getVenueFloorHeightAt(hx, hz), 0, 4);
  }
  if (sp.followPropId) {
    const p = getWorldPropById(sp.followPropId);
    if (p) moveWorldPropTo(p, hx, hz);
  } else {
    setSpotWorldTargetFromPlan(sp, hx, hz, { glide: opts.glide !== false, stageModel: true });
  }
  return true;
}

function mapSpotForProjectorIndex(sp, projIndex) {
  if (!sp || !projIndex) return sp;
  const c = computeConvergentSpotForProjector(sp, projIndex);
  return c ? c.followspot : sp;
}

function spotsNeedPerProjectorRender() {
  return (state.spots || []).some(sp => sp && sp.enabled !== false && ((sp.mode && sp.mode !== 'off') || (sp._lvl > 0.003))
    && (sp.converge3D || getSpotProjectorList(sp).length > 0 || (state.spotCalib && state.spotCalib.active)));
}

// When spots are routed / converged, every lit projector gets its own stage render
// (half resolution) so the previz shows exactly what each projector will emit.
function renderPrevizProjectorStageTextures(lit) {
  if (!lit || lit.length === 0 || !spotsNeedPerProjectorRender()) return null;
  if (state.crossfade && state.crossfade.active) return null;
  if (typeof renderSceneDescriptorToFbo !== 'function' || typeof createDynamicFbo !== 'function') return null;
  const pz = _pz;
  // Every other frame reuse the last per-projector renders (spot motion stays smooth
  // at 30 Hz in the previz; the real outputs are unaffected).
  const litKey = lit.map(L => L.scr.index).join(',');
  if (pz.projStageMap && pz.projStageKey === litKey && (pz.frame % 2 === 1)) return pz.projStageMap;
  const out = new Map();
  const fullW = Math.max(64, stageFboB.w || 1920), fullH = Math.max(36, stageFboB.h || 1080);
  const w = Math.max(64, Math.round(fullW / 3)), h = Math.max(36, Math.round(fullH / 3));
  const aspect = fullW / Math.max(1, fullH);
  const spots = (state.spots || []).filter(sp => sp && sp.enabled !== false);
  lit.forEach((L, i) => {
    if (!pz.projStage[i]) pz.projStage[i] = createDynamicFbo(false, false);
    const fbo = pz.projStage[i];
    resizeFboIfNeeded(fbo, w, h, true);
    const mapped = spots.map(sp => mapSpotForProjectorIndex(prepareSpotForRender(sp), L.scr.index));
    renderSceneDescriptorToFbo({
      surfaces: state.surfaces,
      groups: state.groups,
      masks: state.masks,
      spots: mapped,
      followspot: mapped[0] || null,
      masterFxChain: state.masterFxChain,
      allCalGrids: state.allCalGrids
    }, fbo, aspect);
    out.set(L.scr.index, fbo.tex);
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  pz.projStageMap = out;
  pz.projStageKey = litKey;
  return out;
}

// ---- Spot calibration: nudge one projector's spot onto a physical mark -----
function beginSpotCalibration(spotId, projIndex) {
  const sp = (state.spots || []).find(s => s && s.id === spotId);
  const scr = (state.multiProjector?.screens || []).find(s => s.index === projIndex);
  if (!sp || !scr) return false;
  if (!Array.isArray(scr.spotTrim)) scr.spotTrim = [0, 0];
  if (sp.mode === 'off') sp.mode = 'beam';
  sp.converge3D = true;
  ensureSpotStageModel(sp);
  state.spotCalib = { active: true, spotId, projIndex, startTrim: [...scr.spotTrim] };
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof showToast === 'function') showToast(`Calibrating P${projIndex}: arrow keys move its spot onto the mark · Enter = done · Esc = cancel`);
  return true;
}

function endSpotCalibration(keep = true) {
  const cal = state.spotCalib;
  if (!cal || !cal.active) return;
  const scr = (state.multiProjector?.screens || []).find(s => s.index === cal.projIndex);
  if (scr && !keep) scr.spotTrim = [...cal.startTrim];
  state.spotCalib = { active: false };
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof renderLivePerformanceDockUI === 'function') renderLivePerformanceDockUI();
}

function nudgeSpotCalibration(dx, dy) {
  const cal = state.spotCalib;
  if (!cal || !cal.active) return false;
  const scr = (state.multiProjector?.screens || []).find(s => s.index === cal.projIndex);
  if (!scr) return false;
  if (!Array.isArray(scr.spotTrim)) scr.spotTrim = [0, 0];
  scr.spotTrim = [clamp(scr.spotTrim[0] + dx, -0.25, 0.25), clamp(scr.spotTrim[1] + dy, -0.25, 0.25)];
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  return true;
}

function initSpotCalibrationKeys() {
  if (typeof window === 'undefined' || window._spotCalibBound) return;
  window._spotCalibBound = true;
  window.addEventListener('keydown', (e) => {
    const cal = state.spotCalib;
    if (!cal || !cal.active) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const step = e.shiftKey ? 0.01 : 0.002;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (map[e.key]) {
      nudgeSpotCalibration(map[e.key][0], map[e.key][1]);
    } else if (e.key === 'Enter') {
      endSpotCalibration(true);
    } else if (e.key === 'Escape') {
      endSpotCalibration(false);
    } else {
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
}

// ----------------------------------------------------------------------------
// 7. PANE SOLO / SPLIT — every pane in every room can go full width and back.
// ----------------------------------------------------------------------------
function getPaneSoloState() {
  if (isBuildRoom()) {
    const bm = state.buildViewMode || 'split';
    return { panes: ['rig', 'stage'], solo: bm === 'warp' ? 'stage' : ((bm === 'plan2d' || bm === 'world3d') ? 'rig' : null) };
  }
  if (state.layoutMode === 'mix') {
    const body = typeof document !== 'undefined' ? document.body : null;
    const solo = state.liveMixSolo ? 'mix' : (body && body.classList.contains('pane-solo-stage') ? 'stage' : null);
    return { panes: ['mix', 'stage'], solo };
  }
  const lm = state.layoutMode;
  return { panes: ['input', 'stage'], solo: lm === 'input' ? 'input' : (lm === 'output' ? 'stage' : null) };
}

function togglePaneSolo(paneId) {
  const cur = getPaneSoloState();
  const unsolo = cur.solo === paneId;
  if (isBuildRoom()) {
    if (unsolo) setBuildViewMode('split');
    else if (paneId === 'stage') setBuildViewMode('warp');
    else setBuildViewMode(state.multiProjector?.stagePlan?.viewMode === 'orbit3d' ? 'world3d' : 'plan2d');
  } else if (state.layoutMode === 'mix') {
    if (paneId === 'mix') {
      document.body.classList.remove('pane-solo-stage');
      toggleLiveMixSolo(!unsolo);
    } else {
      if (state.liveMixSolo) toggleLiveMixSolo(false);
      document.body.classList.toggle('pane-solo-stage', !unsolo);
    }
  } else if (typeof setLayoutMode === 'function') {
    setLayoutMode(unsolo ? 'split' : (paneId === 'input' ? 'input' : 'output'));
    if (state.room === 'map' && typeof _savedMapLayoutMode !== 'undefined') _savedMapLayoutMode = state.layoutMode;
  }
  syncPaneSoloButtons();
  return getPaneSoloState().solo;
}

// Back-compat name used by the LIVE stage button.
function toggleLiveStageSolo(force) {
  const on = getPaneSoloState().solo === 'stage';
  if (typeof force === 'boolean' && force === on) return on;
  return togglePaneSolo('stage') === 'stage';
}

let _paneSoloSig = '';
function syncPaneSoloButtons() {
  if (typeof document === 'undefined') return;
  const st = getPaneSoloState();
  const room = isBuildRoom() ? 'build' : state.room;
  // Leaving the mix layout clears a stage solo that only made sense beside the mix pane.
  if (state.layoutMode !== 'mix' && document.body.classList.contains('pane-solo-stage')) document.body.classList.remove('pane-solo-stage');
  const sig = `${room}|${state.layoutMode}|${st.solo}`;
  if (sig === _paneSoloSig) return;
  _paneSoloSig = sig;
  const map = { input: 'btn-input-solo', stage: 'btn-stage-solo', rig: 'btn-rig-solo', mix: 'btn-mix-solo' };
  for (const [pane, id] of Object.entries(map)) {
    const b = document.getElementById(id);
    if (!b) continue;
    const on = st.solo === pane;
    b.textContent = on ? '⧉' : '⤢';
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'Back to split view (or double-click the title bar)' : 'Solo this pane at full width (or double-click the title bar)';
  }
}

function initPaneSoloControls() {
  if (typeof document === 'undefined' || document.body._paneSoloBound) return;
  document.body._paneSoloBound = true;
  const ids = { 'btn-input-solo': 'input', 'btn-stage-solo': 'stage', 'btn-rig-solo': 'rig', 'btn-mix-solo': 'mix' };
  for (const [id, pane] of Object.entries(ids)) {
    // Capture phase so older per-room handlers on these buttons don't double-toggle.
    document.getElementById(id)?.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      togglePaneSolo(pane);
    }, true);
  }
  const paneOf = { 'input-pane': 'input', 'stage-pane': 'stage', 'rig-pane': 'rig', 'mix-pane': 'mix' };
  for (const [pid, pane] of Object.entries(paneOf)) {
    const bar = document.querySelector(`#${pid} > .pane-topbar`);
    bar?.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, input, select, label, a')) return;
      togglePaneSolo(pane);
    });
  }
}

function cycleRenderQuality() {
  const order = ['auto', 'full', 'fast'];
  const cur = order.indexOf(state.renderQuality || 'auto');
  state.renderQuality = order[(cur + 1) % order.length];
  try { localStorage.setItem('wm.renderQuality', state.renderQuality); } catch (_) {}
  if (typeof showToast === 'function') {
    showToast({ auto: 'Render quality AUTO — resolution adapts to hold the frame rate', full: 'Render quality FULL — generators & previz at full resolution', fast: 'Render quality FAST — generators & previz at half resolution' }[state.renderQuality]);
  }
  return state.renderQuality;
}

// F = pick up / fade out the active followspot (uses its fade time).
function toggleActiveSpotPickup() {
  const sp = typeof getActiveLiveSpot === 'function' ? getActiveLiveSpot() : null;
  if (!sp || sp.enabled === false) return false;
  if (!sp.mode || sp.mode === 'off') sp.mode = (sp._lastMode && sp._lastMode !== 'off') ? sp._lastMode : 'beam';
  else sp.mode = 'off';
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof recordLiveCapturedTrim === 'function' && state.room === 'live') recordLiveCapturedTrim(`spot:${state.spots.indexOf(sp)}:mode`, `${sp.name} Mode`, sp.mode);
  if (typeof renderLivePerformanceDockUI === 'function') renderLivePerformanceDockUI();
  if (typeof showToast === 'function') showToast(sp.mode === 'off' ? `${sp.name}: fade out (${(sp.fadeSec ?? 0.5).toFixed(1)}s)` : `${sp.name}: pick up (${(sp.fadeSec ?? 0.5).toFixed(1)}s)`);
  return true;
}

function initVenuePrevizModule() {
  if (typeof window !== 'undefined' && !window._spotPickupBound) {
    window._spotPickupBound = true;
    window.addEventListener('keydown', (e) => {
      if (state.projectorMode || isBuildRoom() || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'f' || e.key === 'F') {
        if (toggleActiveSpotPickup()) e.preventDefault();
      }
    });
  }
  try {
    const q = localStorage.getItem('wm.renderQuality');
    if (q === 'auto' || q === 'full' || q === 'fast') state.renderQuality = q;
  } catch (_) {}
  const fpsBadge = document.getElementById('fps-badge');
  if (fpsBadge && !fpsBadge._qualityBound) {
    fpsBadge._qualityBound = true;
    fpsBadge.setAttribute('role', 'button');
    fpsBadge.tabIndex = 0;
    fpsBadge.addEventListener('click', cycleRenderQuality);
    fpsBadge.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleRenderQuality(); } });
  }
  initPaneSoloControls();
  initVenueWalkControls();
  initVenueStagePaneControls();
  initSpotCalibrationKeys();
  const rigVp = typeof document !== 'undefined' ? document.getElementById('rig-viewport') : null;
  if (rigVp && !rigVp._venueHoverBound) {
    rigVp._venueHoverBound = true;
    rigVp.addEventListener('pointerenter', () => { _venueHoverEl = rigVp; });
    rigVp.addEventListener('pointerleave', () => { if (_venueHoverEl === rigVp) _venueHoverEl = null; });
  }
}

// ----------------------------------------------------------------------------
// 8. CAMERA-RELATIVE SPOT STEERING (trackpad / mouse / gamepad)
// ----------------------------------------------------------------------------
// 3D-aimed spots are steered across the floor relative to what the operator sees:
// right = camera-right, up = away from the camera. A spot following a figure walks
// the figure. Returns false for classic 2D (screen-space) spots.
function getSteeringBasis() {
  const sp = state.multiProjector?.stagePlan;
  if (sp && isVenueViewActive()) {
    const cam = getVenueCamera(sp, 16 / 9);
    if (cam.ortho === 'top' || cam.ortho === 'bottom') {
      return { fwd: [cam.up[0], 0, cam.up[2]], right: [cam.right[0], 0, cam.right[2]] };
    }
    let fx = cam.target[0] - cam.eye[0], fz = cam.target[2] - cam.eye[2];
    let len = Math.hypot(fx, fz);
    if (len < 0.05) {
      // Looking straight down: use the orbit heading instead.
      const yaw = ((sp.camMode === 'walk' ? -sp.walk.yaw : sp.orbitYaw) * Math.PI) / 180;
      fx = -Math.sin(yaw); fz = -Math.cos(yaw); len = 1;
    }
    fx /= len; fz /= len;
    return { fwd: [fx, 0, fz], right: [-fz, 0, fx] };
  }
  const b = getWorldScreenBasis(getPrimaryWorldScreen());
  const nl = Math.hypot(b.nAxis[0], b.nAxis[2]) || 1;
  return { fwd: [-b.nAxis[0] / nl, 0, -b.nAxis[2] / nl], right: [b.uAxis[0], 0, b.uAxis[2]] };
}

function steerSpotInWorld(fs, dRight, dUp) {
  if (!fs || !fs.converge3D) return false;
  const basis = getSteeringBasis();
  const main = getWorldScreenBasis(getPrimaryWorldScreen());
  const k = Math.max(4, main.widthM * 1.1); // a full-width swipe ≈ the screen width in metres
  const mx = (basis.right[0] * dRight + basis.fwd[0] * dUp) * k;
  const mz = (basis.right[2] * dRight + basis.fwd[2] * dUp) * k;
  if (fs.followPropId) {
    const p = getWorldPropById(fs.followPropId);
    if (p) {
      moveWorldPropTo(p, clamp(p.posM[0] + mx, -40, 40), clamp(p.posM[2] + mz, -40, 40));
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      return true;
    }
  }
  // Steer the (inertia-smoothed) floor target.
  ensureSpotStageModel(fs);
  const lay = getVenueLayout();
  const lim = lay.outdoor ? 40 : 0;
  fs.targetStageXM = clamp((fs.targetStageXM ?? fs.stageXM) + mx, lay.outdoor ? -lim : lay.room.x0 + 0.1, lay.outdoor ? lim : lay.room.x1 - 0.1);
  fs.targetStageZM = clamp((fs.targetStageZM ?? fs.stageZM) + mz, lay.outdoor ? -lim : lay.room.z0 + 0.1, lay.outdoor ? lim : lay.room.z1 - 0.1);
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  return true;
}

// ----------------------------------------------------------------------------
// 9. 2D SURFACES & MASKS IN THE 3D VENUE
// ----------------------------------------------------------------------------
// Each surface's stage-UV outline is cast through the projector that emits it onto
// whatever it physically lands on (screen, deck, wall, a person). Corners can be
// dragged in 3D: the ray under the mouse is inverted back through that lens.
function getPrevizProjectorRefs() {
  const mp = ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  const field = solveStagePlanOpticalField(mp);
  const solo = Number(sp.previzSolo) || 0;
  const refs = [];
  for (const scr of mp.screens || []) {
    if (!scr || scr.enabled === false) continue;
    if (solo > 0 && scr.index !== solo) continue;
    const opt = field?.opticsByIndex?.get(scr.index);
    if (opt) refs.push({ scr, opt, crop: getEffectiveProjectorCrop(scr, mp) });
  }
  return { refs, field, key: `${field?.key || ''}|${mp.enabled ? 1 : 0}|${solo}|${state._venueRev || 0}` };
}

function pickRefForStageUv(refs, u, v) {
  let best = null, bestD = Infinity;
  for (const R of refs) {
    const c = R.crop;
    const du = Math.max(c.x - u, 0, u - (c.x + c.w)), dv = Math.max(c.y - v, 0, v - (c.y + c.h));
    const d = du + dv - (du + dv === 0 ? Math.min(u - c.x, c.x + c.w - u, v - c.y, c.y + c.h - v) * 0.01 : 0);
    if (d < bestD) { bestD = d; best = R; }
  }
  return best;
}

function castStageUvToWorld(u, v, R, occluders) {
  const o = R.opt, c = R.crop;
  const pu = (u - c.x) / Math.max(1e-4, c.w), pv = (v - c.y) / Math.max(1e-4, c.h);
  const dir = [0, 1, 2].map(k => o.fAxis[k] + (pu - o.cx0) * o.wUnit * o.rAxis[k] + (pv - o.cy0) * o.hUnit * o.uAxis[k]);
  const hit = raycastWorldForProjector(o.eye, dir, occluders, Math.min(o.luxRangeM || 20, 30));
  return hit.point;
}

function worldToStageUvViaRef(P, R) {
  const o = R.opt, c = R.crop;
  const d = [P[0] - o.eye[0], P[1] - o.eye[1], P[2] - o.eye[2]];
  const zf = d[0] * o.fAxis[0] + d[1] * o.fAxis[1] + d[2] * o.fAxis[2];
  if (zf < 0.05) return null;
  const pu = (d[0] * o.rAxis[0] + d[1] * o.rAxis[1] + d[2] * o.rAxis[2]) / (zf * o.wUnit) + o.cx0;
  const pv = (d[0] * o.uAxis[0] + d[1] * o.uAxis[1] + d[2] * o.uAxis[2]) / (zf * o.hUnit) + o.cy0;
  return [c.x + pu * c.w, c.y + pv * c.h];
}

// Stage-UV outline (dense) for a surface or mask.
function getStageOutlineForShape(shape, isMask = false) {
  const pts = Array.isArray(shape.points) ? shape.points : [];
  if (pts.length < 2) return { loop: [], closed: false };
  if (!isMask && shape.type === 'circle' && pts.length === 4) {
    const bil = (s, t) => [0, 1].map(k => (1 - s) * (1 - t) * pts[0][k] + s * (1 - t) * pts[1][k] + s * t * pts[2][k] + (1 - s) * t * pts[3][k]);
    const loop = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      loop.push(bil(0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)));
    }
    return { loop, closed: true };
  }
  const closed = isMask || shape.type !== 'line';
  const loop = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  const steps = n <= 4 ? 10 : 4;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let k = 0; k < steps; k++) loop.push([a[0] + (b[0] - a[0]) * (k / steps), a[1] + (b[1] - a[1]) * (k / steps)]);
  }
  if (!closed) loop.push([pts[n - 1][0], pts[n - 1][1]]);
  return { loop, closed };
}

const _surf3dCache = new Map();
function getShape3DOutline(shape, isMask, ctxRefs) {
  const key = `${ctxRefs.key}|${shape.type || 'mask'}|${(shape.points || []).map(p => p[0].toFixed(4) + ',' + p[1].toFixed(4)).join(';')}`;
  const hit = _surf3dCache.get(shape.id);
  if (hit && hit.key === key) return hit.data;
  const occ = (ctxRefs.field?.occluders || []).filter(o => !o.isProp);
  const { loop, closed } = getStageOutlineForShape(shape, isMask);
  const world = loop.map(([u, v]) => {
    const R = pickRefForStageUv(ctxRefs.refs, u, v);
    return R ? castStageUvToWorld(u, v, R, occ) : null;
  });
  const corners = (shape.points || []).map(([u, v]) => {
    const R = pickRefForStageUv(ctxRefs.refs, u, v);
    return R ? { p: castStageUvToWorld(u, v, R, occ), refIndex: R.scr.index } : null;
  });
  const data = { world, closed, corners };
  _surf3dCache.set(shape.id, { key, data });
  if (_surf3dCache.size > 400) _surf3dCache.clear();
  return data;
}

// Draws outlines of every visible surface (and masks) into a Canvas2D through a camera MVP.
// Returns hit records [{ id, kind, poly2d, corners2d }] for picking.
function drawVenueSurfaceOutlines(ctx, mvp, cssW, cssH, opts = {}) {
  const ctxRefs = getPrevizProjectorRefs();
  const records = [];
  if (ctxRefs.refs.length === 0) return records;
  const toPx = (p) => {
    if (!p) return null;
    const c = venueClipPoint(p, mvp);
    if (c[3] < 0.06) return null;
    return [((c[0] / c[3]) * 0.5 + 0.5) * cssW, (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * cssH];
  };
  const groups = state.groups || [];
  const selId = state.selectedSurfaceId;
  const strokePath = (world, closed) => {
    ctx.beginPath();
    let pen = false;
    const n = world.length;
    const lim = closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      const a = world[i], b = world[(i + 1) % n];
      if (!a || !b) { pen = false; continue; }
      // Skip segments that jump across surfaces (screen edge → back wall).
      if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 2.5) { pen = false; continue; }
      const seg = venueProjectSegment(a, b, mvp, cssW, cssH);
      if (!seg) { pen = false; continue; }
      if (!pen) ctx.moveTo(seg[0][0], seg[0][1]);
      ctx.lineTo(seg[1][0], seg[1][1]);
      pen = true;
    }
    ctx.stroke();
  };
  const surfaces = (state.surfaces || []).filter(s => s && s.type !== 'mesh3d' && Array.isArray(s.points) && s.points.length >= 2);
  const labelQueue = [];
  // Draw back-to-front so the selected / top surface ends up on top.
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const surf = surfaces[i];
    const eff = typeof getEffectiveSurfaceProps === 'function' ? getEffectiveSurfaceProps(surf, groups) : { visible: surf.visible !== false };
    if (!eff.visible && surf.id !== selId) continue;
    const o3 = getShape3DOutline(surf, false, ctxRefs);
    const isSel = surf.id === selId || (state.selectedSurfaceIds || []).includes(surf.id);
    ctx.save();
    ctx.lineJoin = 'round';
    if (isSel) {
      ctx.strokeStyle = 'rgba(6,10,18,0.85)';
      ctx.lineWidth = 4;
      strokePath(o3.world, o3.closed);
    }
    ctx.strokeStyle = isSel ? (surf.accent || '#6fd3ff') : 'rgba(255,255,255,0.42)';
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.setLineDash(eff.visible ? [] : [4, 4]);
    strokePath(o3.world, o3.closed);
    ctx.restore();
    const poly2d = o3.world.map(toPx).filter(Boolean);
    const corners2d = o3.corners.map(c => (c ? toPx(c.p) : null));
    if (opts.labels !== false && poly2d.length >= 3) {
      const cx = poly2d.reduce((a, p) => a + p[0], 0) / poly2d.length;
      const cy = poly2d.reduce((a, p) => a + p[1], 0) / poly2d.length;
      labelQueue.push({ name: surf.name, cx, cy, isSel, accent: surf.accent || '#6fd3ff' });
    }
    if (isSel && opts.handles) {
      corners2d.forEach((p, k) => {
        if (!p) return;
        const active = opts.activeCorner && opts.activeCorner.id === surf.id && opts.activeCorner.idx === k;
        ctx.fillStyle = active ? '#ffcb7d' : '#06101a';
        ctx.strokeStyle = surf.accent || '#6fd3ff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(p[0], p[1], active ? 6.5 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
    records.push({ id: surf.id, kind: 'surface', poly2d, corners2d, corners3d: o3.corners, locked: !!eff.locked });
  }
  // Labels: selected first, then others; nudged down when they would overlap, else dropped.
  labelQueue.sort((a, b) => (b.isSel ? 1 : 0) - (a.isSel ? 1 : 0));
  const placed = [];
  ctx.textAlign = 'center';
  for (const L of labelQueue) {
    ctx.font = `${L.isSel ? 700 : 600} 9px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const tw = ctx.measureText(L.name).width + 8;
    let y = L.cy, ok = false;
    for (let k = 0; k < 4 && !ok; k++, y += 15) {
      const box = [L.cx - tw / 2, y - 7, tw, 13];
      ok = !placed.some(p => box[0] < p[0] + p[2] && box[0] + box[2] > p[0] && box[1] < p[1] + p[3] && box[1] + box[3] > p[1]);
      if (ok) placed.push(box);
    }
    if (!ok) continue;
    y -= 15;
    ctx.fillStyle = L.isSel ? 'rgba(6,10,18,0.85)' : 'rgba(6,10,18,0.6)';
    ctx.fillRect(L.cx - tw / 2, y - 7, tw, 13);
    ctx.fillStyle = L.isSel ? L.accent : 'rgba(255,255,255,0.78)';
    ctx.fillText(L.name, L.cx, y + 3);
  }

  if (opts.masks !== false) {
    for (const mk of state.masks || []) {
      if (!mk || mk.visible === false || !Array.isArray(mk.points) || mk.points.length < 3) continue;
      const o3 = getShape3DOutline(mk, true, ctxRefs);
      ctx.save();
      ctx.strokeStyle = mk.id === state.selectedMaskId ? '#c084fc' : 'rgba(192,132,252,0.6)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      strokePath(o3.world, true);
      ctx.restore();
    }
  }
  return records;
}

function venueScreenRay(cam, u, v) {
  const inv = mat4InvertGeneral(cam.mvp);
  if (!inv) return null;
  const un = (z) => {
    const x = u * 2 - 1, y = v * 2 - 1;
    const w = inv[3] * x + inv[7] * y + inv[11] * z + inv[15];
    return [0, 1, 2].map(i => (inv[i] * x + inv[4 + i] * y + inv[8 + i] * z + inv[12 + i]) / w);
  };
  const a = un(-1), b = un(1);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return { origin: a, dir: d.map(n => n / l) };
}

function pointInPoly2D_venue(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
  }
  return inside;
}

// ----------------------------------------------------------------------------
// 10. UNIFIED 3D SELECTION, CONTEXT CARD & "MAP ONTO" OBJECTS
// ----------------------------------------------------------------------------
// One picker for every 3D view: click anything you can see (person, screen, projector,
// light, 3D object, mapped surface) and it becomes THE selection (shared with the
// outliner / inspectors). A context card offers the few actions that matter for it.

function rayTriT(o, d, a, b, c) {
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
  const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-9) return Infinity;
  const inv = 1 / det;
  const sx = o[0] - a[0], sy = o[1] - a[1], sz = o[2] - a[2];
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return Infinity;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 0.02 ? t : Infinity;
}

function raySphereT(o, d, c, r) {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 0.02 ? t : Infinity;
}

// Nearest physical object along a ray. Returns { kind, id, t, point } or null.
function pickVenueObjects(o, d) {
  let best = null;
  const consider = (kind, id, t) => { if (t < Infinity && (!best || t < best.t)) best = { kind, id, t }; };
  for (const prop of state.worldProps || []) {
    if (!prop || prop.enabled === false) continue;
    const h = Number(prop.heightM) || 1.75;
    const s = h / 1.75;
    if (!rayHitAabb(o[0], o[1], o[2], d[0], d[1], d[2], [prop.posM[0] - 0.35 * s, prop.posM[1], prop.posM[2] - 0.35 * s], [prop.posM[0] + 0.35 * s, prop.posM[1] + h + 0.05, prop.posM[2] + 0.35 * s], 0.02)) continue;
    const tris = getWorldPropWorldTris(prop);
    let tb = Infinity;
    for (let i = 0; i + 2 < tris.length; i += 3) tb = Math.min(tb, rayTriT(o, d, tris[i], tris[i + 1], tris[i + 2]));
    consider('world_prop', prop.id, tb);
  }
  for (const ws of state.worldScreens || []) {
    if (!ws || ws.enabled === false) continue;
    const b = getWorldScreenBasis(ws);
    const den = d[0] * b.nAxis[0] + d[1] * b.nAxis[1] + d[2] * b.nAxis[2];
    if (Math.abs(den) < 1e-6) continue;
    const t = ((b.center[0] - o[0]) * b.nAxis[0] + (b.center[1] - o[1]) * b.nAxis[1] + (b.center[2] - o[2]) * b.nAxis[2]) / den;
    if (t <= 0.02) continue;
    const hx = o[0] + d[0] * t - b.center[0], hy = o[1] + d[1] * t - b.center[1], hz = o[2] + d[2] * t - b.center[2];
    const pu = hx * b.uAxis[0] + hy * b.uAxis[1] + hz * b.uAxis[2];
    const pv = hx * b.vAxis[0] + hy * b.vAxis[1] + hz * b.vAxis[2];
    if (Math.abs(pu) <= b.widthM * 0.5 && Math.abs(pv) <= b.heightM * 0.5) consider('world_screen', ws.id, t);
  }
  const field = state.multiProjector ? solveStagePlanOpticalField(state.multiProjector) : null;
  for (const occ of field?.occluders || []) {
    if (occ.isProp) continue;
    if (!rayHitAabb(o[0], o[1], o[2], d[0], d[1], d[2], occ.aabb.slice(0, 3), occ.aabb.slice(3), 0.02)) continue;
    let tb = Infinity;
    for (let i = 0; i + 2 < occ.tris.length; i += 3) tb = Math.min(tb, rayTriT(o, d, occ.tris[i], occ.tris[i + 1], occ.tris[i + 2]));
    consider('mesh3d', occ.id, tb);
  }
  for (const scr of state.multiProjector?.screens || []) {
    if (Array.isArray(scr.posM)) consider('projector', String(scr.index), raySphereT(o, d, scr.posM, 0.38));
  }
  let partNormal = null;
  for (const b of getVenueLayout().boxes) {
    if (!b.obb || !b.partId) continue;
    const h = rayHitOBox(o[0], o[1], o[2], d[0], d[1], d[2], b.obb, 0.02);
    if (h && !h.inside && (!best || h.t < best.t)) { consider('venue_part', b.partId, h.t); partNormal = h.normal; }
  }
  for (const dev of state.dmxDevices || []) {
    if (dev && Array.isArray(dev.posM)) consider('dmx_device', dev.id, raySphereT(o, d, dev.posM, 0.32));
  }
  if (best) best.point = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
  if (best && best.kind === 'venue_part') { best.normal = partNormal; state._lastPickNormal = partNormal; }
  return best;
}

function getVenueObjectLabel(kind, id) {
  if (kind === 'world_prop') return getWorldPropById(id)?.name || 'Person';
  if (kind === 'world_screen') return (state.worldScreens || []).find(w => w.id === id)?.name || 'Screen';
  if (kind === 'projector') { const s = (state.multiProjector?.screens || []).find(x => String(x.index) === String(id)); return s ? `P${s.index} · ${s.name || ''}` : 'Projector'; }
  if (kind === 'dmx_device') return (state.dmxDevices || []).find(d => d.id === id)?.name || 'DMX device';
  if (kind === 'mesh3d' || kind === 'surface') return (state.surfaces || []).find(s => s.id === id)?.name || 'Surface';
  if (kind === 'spot') return (state.spots || []).find(s => s.id === id)?.name || 'Spot';
  if (kind === 'venue_part') return (typeof getVenuePartById === 'function' && getVenuePartById(id)?.name) || 'Venue part';
  return kind;
}

// Make a picked object THE selection everywhere (rig inspector, outliner, Backspace).
function selectVenueObject(kind, id) {
  state.venueSel = kind ? { kind, id: String(id), normal: kind === 'venue_part' ? (state._lastPickNormal || null) : undefined } : null;
  if (!kind) return;
  const label = getVenueObjectLabel(kind, id);
  if (kind === 'world_prop') {
    state.rigSelectedKind = 'world_prop';
    state.selectedWorldPropId = id;
  } else if (kind === 'world_screen') {
    state.rigSelectedKind = 'world_screen';
    state.selectedWorldScreenId = id;
  } else if (kind === 'projector') {
    state.rigSelectedKind = 'projector';
    if (state.multiProjector) state.multiProjector.selectedScreenIndex = Number(id) || 1;
  } else if (kind === 'dmx_device') {
    state.rigSelectedKind = 'dmx_device';
    state.selectedDmxDeviceId = id;
  } else if (kind === 'mesh3d' || kind === 'surface') {
    state.rigSelectedKind = kind;
    if (typeof selectSurface === 'function') selectSurface(id);
  } else if (kind === 'venue_part') {
    state.rigSelectedKind = 'venue_part';
    state.selectedVenuePartId = String(id);
  }
  if (typeof setActiveSelection === 'function') setActiveSelection(kind === 'mesh3d' ? 'surface' : kind, String(id), label);
  if (isBuildRoom()) {
    if (typeof syncRigWorkspaceUI === 'function') syncRigWorkspaceUI();
    if (typeof renderWorldDocksUI === 'function') renderWorldDocksUI();
  }
  syncVenueCardUI(true);
}

// Highlight for the 3D selection (bracketed box / outline + name tag).
function drawVenueSelectionHighlight(ctx, mvp, cssW, cssH) {
  const sel = state.venueSel;
  if (!sel) return;
  const toPx = (p) => {
    const c = venueClipPoint(p, mvp);
    if (c[3] < 0.06) return null;
    return [((c[0] / c[3]) * 0.5 + 0.5) * cssW, (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * cssH];
  };
  let pts = [];
  if (sel.kind === 'world_prop') {
    const p = getWorldPropById(sel.id);
    if (!p) return;
    const h = Number(p.heightM) || 1.75, r = 0.3 * h / 1.75;
    for (const dx of [-r, r]) for (const dz of [-r, r]) for (const y of [0, h + 0.05]) pts.push([p.posM[0] + dx, p.posM[1] + y, p.posM[2] + dz]);
  } else if (sel.kind === 'world_screen') {
    const ws = (state.worldScreens || []).find(w => w.id === sel.id);
    if (!ws) return;
    pts = getWorldScreenBasis(ws).corners;
  } else if (sel.kind === 'projector' || sel.kind === 'dmx_device') {
    const obj = sel.kind === 'projector'
      ? (state.multiProjector?.screens || []).find(x => String(x.index) === sel.id)
      : (state.dmxDevices || []).find(d => d.id === sel.id);
    if (!obj || !Array.isArray(obj.posM)) return;
    for (const dx of [-0.3, 0.3]) for (const dy of [-0.2, 0.2]) for (const dz of [-0.3, 0.3]) pts.push([obj.posM[0] + dx, obj.posM[1] + dy, obj.posM[2] + dz]);
  } else if (sel.kind === 'mesh3d') {
    const occ = (solveStagePlanOpticalField(state.multiProjector)?.occluders || []).find(o => o.id === sel.id);
    if (!occ) return;
    const [x0, y0, z0, x1, y1, z1] = occ.aabb;
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push([x, y, z]);
  } else {
    return;
  }
  const px = pts.map(toPx).filter(Boolean);
  if (px.length < 2) return;
  const xs = px.map(p => p[0]), ys = px.map(p => p[1]);
  const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6, y0 = Math.min(...ys) - 6, y1 = Math.max(...ys) + 6;
  const k = Math.min(14, (x1 - x0) * 0.3, (y1 - y0) * 0.3);
  ctx.save();
  ctx.strokeStyle = '#34e89e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.moveTo(cx + sx * k, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * k);
  }
  ctx.stroke();
  const label = getVenueObjectLabel(sel.kind, sel.id);
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'left';
  const tw = ctx.measureText(label).width + 10;
  ctx.fillStyle = 'rgba(6,10,18,0.85)';
  ctx.fillRect(x0, y0 - 17, tw, 15);
  ctx.fillStyle = '#34e89e';
  ctx.fillText(label, x0 + 5, y0 - 6);
  ctx.restore();
}

// ---- "Map onto" objects: surfaces generated from the real geometry through the lens ----
function pickRefForWorldPoint(P) {
  const refs = getPrevizProjectorRefs().refs;
  for (const R of refs) {
    const uv = worldToStageUvViaRef(P, R);
    if (!uv) continue;
    const pu = (uv[0] - R.crop.x) / R.crop.w, pv = (uv[1] - R.crop.y) / R.crop.h;
    if (pu > -0.02 && pu < 1.02 && pv > -0.02 && pv < 1.02) return R;
  }
  return refs[0] || null;
}

function convexHull2D(points) {
  const pts = points.map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// Stage-UV geometry for a linked object, as seen by the projector that lights it.
function computeLinkedObjectStagePoints(link) {
  if (!link) return null;
  if (link.kind === 'prop') {
    const prop = getWorldPropById(link.id);
    if (!prop || prop.enabled === false) return null;
    const R = pickRefForWorldPoint([prop.posM[0], prop.posM[1] + (prop.heightM || 1.75) * 0.55, prop.posM[2]]);
    if (!R) return null;
    const seen = new Set();
    const uvs = [];
    for (const v of getWorldPropWorldTris(prop)) {
      const key = v[0].toFixed(3) + v[1].toFixed(3) + v[2].toFixed(3);
      if (seen.has(key)) continue;
      seen.add(key);
      const uv = worldToStageUvViaRef(v, R);
      if (uv) uvs.push(uv);
    }
    let hull = convexHull2D(uvs);
    if (hull.length > 28) { const step = hull.length / 28; hull = Array.from({ length: 28 }, (_, i) => hull[Math.floor(i * step)]); }
    return hull.length >= 3 ? { type: 'polygon', points: hull, ref: R.scr.index } : null;
  }
  if (link.kind === 'screen') {
    const ws = (state.worldScreens || []).find(w => w.id === link.id);
    if (!ws) return null;
    const b = getWorldScreenBasis(ws);
    const R = pickRefForWorldPoint(b.center);
    if (!R) return null;
    const pts = b.corners.map(c => worldToStageUvViaRef(c, R));
    return pts.every(Boolean) ? { type: 'quad', points: pts, ref: R.scr.index } : null;
  }
  if (link.kind === 'part' && typeof computeVenuePartFaceStagePoints === 'function') return computeVenuePartFaceStagePoints(link);
  return null;
}

function linkKeyFor(link) {
  const refs = getPrevizProjectorRefs();
  if (link.kind === 'prop') { const p = getWorldPropById(link.id); return p ? `${refs.key}|${p.posM.join(',')}|${p.yawDeg}|${p.heightM}|${p.armsUp}` : 'gone'; }
  if (link.kind === 'screen') { const w = (state.worldScreens || []).find(x => x.id === link.id); return w ? `${refs.key}|${w.posM.join(',')}|${w.widthM}|${w.heightM}|${w.yawDeg}|${w.pitchDeg}` : 'gone'; }
  if (link.kind === 'part') { const p = typeof getVenuePartById === 'function' ? getVenuePartById(link.id) : null; return p ? `${refs.key}|${p.posM.join(',')}|${p.sizeM.join(',')}|${p.yawDeg}|${link.face}|${link.proj || 0}` : 'gone'; }
  return '';
}

function applyLinkedGeometry(surf) {
  const g = computeLinkedObjectStagePoints(surf.linkObject);
  if (!g) { surf._linkKey = linkKeyFor(surf.linkObject); return false; } // keep geometry; don't retry every frame
  surf.points = g.points.map(p => [Number(p[0].toFixed(5)), Number(p[1].toFixed(5))]);
  if (surf.type === 'polygon' && typeof syncPolygonUvsFromStage === 'function') syncPolygonUvsFromStage(surf);
  if (surf.type === 'quad' && typeof initSurfaceMeshFromCorners === 'function') initSurfaceMeshFromCorners(surf);
  if (typeof bumpSurfaceGeom === 'function') bumpSurfaceGeom(surf);
  surf._linkKey = linkKeyFor(surf.linkObject);
  return true;
}

// Create (or select the existing) surface that maps media onto a person or screen.
function mapMediaOntoObject(kind, id) {
  if (kind === 'venue_part' && typeof mapMediaOntoVenuePart === 'function') return mapMediaOntoVenuePart(id);
  const linkKind = kind === 'world_prop' ? 'prop' : (kind === 'world_screen' ? 'screen' : null);
  if (!linkKind) return null;
  const existing = (state.surfaces || []).find(s => s.linkObject && s.linkObject.kind === linkKind && s.linkObject.id === String(id));
  if (existing) {
    if (typeof selectSurface === 'function') selectSurface(existing.id);
    return existing;
  }
  const g = computeLinkedObjectStagePoints({ kind: linkKind, id: String(id) });
  if (!g) {
    if (typeof showToast === 'function') showToast('No projector lights that object — aim one at it first');
    return null;
  }
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint(linkKind === 'prop' ? 'Map onto Person' : 'Fill Screen');
  const label = getVenueObjectLabel(kind, id);
  const surf = createSurface(g.type, {
    name: linkKind === 'prop' ? `🎭 ${label}` : `🖥 ${label}`,
    sourceId: state.activeSourceId || 'src_shards',
    points: g.points,
    linkObject: { kind: linkKind, id: String(id) }
  });
  applyLinkedGeometry(surf);
  state.surfaces.unshift(surf);
  if (typeof selectSurface === 'function') selectSurface(surf.id);
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof renderSurfaceList === 'function') renderSurfaceList();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof showToast === 'function') {
    showToast(linkKind === 'prop'
      ? `🎭 Mapped onto ${label} through P${g.ref} — it follows them as they move`
      : `🖥 ${label} filled exactly (through P${g.ref}) — it follows the screen and projector`);
  }
  return surf;
}

// Per frame: linked surfaces follow their object / projector (cheap key check).
function updateLinkedObjectSurfaces() {
  for (const surf of state.surfaces || []) {
    if (!surf || !surf.linkObject) continue;
    const key = linkKeyFor(surf.linkObject);
    if (key !== surf._linkKey && key !== 'gone') applyLinkedGeometry(surf);
  }
}

// ---- Context card (MAP / LIVE 3D Venue) ----
let _venueCardSig = '';
function syncVenueCardUI(force = false) {
  if (typeof document === 'undefined') return;
  const card = document.getElementById('venue-card');
  if (!card) return;
  const host = getVenueHudHost();
  const inFeed = host && host.id === 'stage-viewport';
  // In the 3D Venue a selected MAP surface also gets a card.
  let sel = state.venueSel;
  if (!sel && inFeed && state.room === 'map' && state.selectedSurfaceId) sel = { kind: 'surface', id: state.selectedSurfaceId };
  if (!inFeed || !sel) { card.hidden = true; _venueCardSig = ''; return; }
  if (card.parentElement !== host) host.appendChild(card);
  const sp = state.multiProjector?.stagePlan || {};
  const linked = (state.surfaces || []).find(s => s.linkObject && ((sel.kind === 'world_prop' && s.linkObject.kind === 'prop') || (sel.kind === 'world_screen' && s.linkObject.kind === 'screen')) && s.linkObject.id === sel.id);
  const spot = typeof getActiveLiveSpot === 'function' ? getActiveLiveSpot() : null;
  const surf = (sel.kind === 'surface' || sel.kind === 'mesh3d') ? state.surfaces.find(s => s.id === sel.id) : null;
  const selSpot = sel.kind === 'spot' ? (state.spots || []).find(s => s.id === sel.id) : null;
  const sig = `${sel.kind}|${sel.id}|${!!linked}|${sp.previzSolo}|${sp.camMode}|${sp.povIndex}|${spot?.followPropId}|${surf?.sourceId}|${state.sources.length}|${selSpot ? [selSpot.mode, selSpot.followPropId, (selSpot.marks || []).map(Boolean).join('')].join(',') : ''}`;
  if (!force && sig === _venueCardSig && !card.hidden) return;
  _venueCardSig = sig;
  card.hidden = false;
  const name = escapeHtml(getVenueObjectLabel(sel.kind, sel.id));
  const icon = { world_prop: '🧍', world_screen: '🖥', projector: '📽', dmx_device: '💡', mesh3d: '🧊', surface: '⬡', spot: '🎯', venue_part: '◼' }[sel.kind] || '•';
  const btn = (act, label, title, on = false) => `<button type="button" class="venue-chip${on ? ' active' : ''}" data-act="${act}" title="${escapeHtml(title)}">${label}</button>`;
  let body = '';
  if (selSpot) {
    const live = selSpot.mode && selSpot.mode !== 'off';
    const marks = (selSpot.marks || []);
    body = btn('pickup', live ? '⏻ Fade out (F)' : '⏻ Pick up (F)', `Fade time ${(selSpot.fadeSec ?? 0.5).toFixed(1)} s`, live)
      + [0, 1, 2, 3].map(k => btn(`mark${k}`, `M${k + 1}`, marks[k] ? 'Glide to this mark · Shift+click = store here' : 'Click to store the current position', !!marks[k])).join('')
      + (selSpot.followPropId ? btn('unfollow', `Release ${escapeHtml(getVenueObjectLabel('world_prop', selSpot.followPropId))}`, 'Stop following; the spot stays where it is') : '');
  } else if (sel.kind === 'world_prop') {
    body = btn('map', linked ? '🎭 Edit mapping' : '🎭 Map media onto', linked ? 'Select the surface that maps onto this person' : 'Create a surface shaped like this person (as their projector sees them) — it follows them')
      + btn('follow', spot && spot.followPropId === sel.id ? `🎯 ${escapeHtml(spot.name)} follows` : '🎯 Spot follows', 'The active followspot converges on this person from every routed projector', !!(spot && spot.followPropId === sel.id))
      + btn('arms', 'Arms up', 'Toggle pose', !!getWorldPropById(sel.id)?.armsUp);
  } else if (sel.kind === 'venue_part') {
    body = btn('map', '◼ Map onto this face', 'Create an exact quad on the face you clicked, through the projector that lights it — it follows the part')
      + btn('mapauto', '◼ Map best face', 'Pick the face that looks most squarely at its projector');
  } else if (sel.kind === 'world_screen') {
    body = btn('map', linked ? '🖥 Edit fill' : '🖥 Fill with surface', 'Create a surface that covers exactly this screen through its projector — it follows screen & projector moves');
  } else if (sel.kind === 'projector') {
    const idx = Number(sel.id);
    body = btn('align', '📐 Align by points', 'Precise calibration: click known corners, nudge the crosshairs onto the real ones — the pose is solved')
      + btn('pov', '📽 Look through', 'Projector POV camera', sp.camMode === 'pov' && Number(sp.povIndex) === idx)
      + btn('solo', '💡 Only this light', 'Show only this projector\'s light in the venue', Number(sp.previzSolo) === idx)
      + btn('aim', '🎯 Aim at screen', 'Re-aim this projector at the main screen');
  } else if (sel.kind === 'dmx_device') {
    const dev = (state.dmxDevices || []).find(d => d.id === sel.id);
    const ch = dev && (dev.channels || []).find(c => c.key === 'dimmer' || c.key === 'haze');
    const val = ch ? resolveSingleDmxChannelByte(dev, ch, performance.now()).byte : 0;
    body = (ch ? `<label class="venue-card-range">${escapeHtml(ch.label || 'Level')} <input type="range" min="0" max="255" value="${val}" data-act="level"></label>` : '')
      + (isDmxLightDevice(dev) ? btn('aimperf', '🎯 Aim at performer', 'Point this light at the first person on stage') : '');
  } else if (surf) {
    const opts = state.sources.map(s => `<option value="${escapeHtml(s.id)}"${s.id === surf.sourceId ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    body = `<label class="venue-card-range">Media <select class="sel-in" data-act="src">${opts}</select></label>`
      + `<label class="venue-card-range">Opacity <input type="range" min="0" max="1" step="0.01" value="${surf.opacity ?? 1}" data-act="opacity"></label>`
      + (surf.linkObject ? `<span class="venue-card-note">Follows ${escapeHtml(getVenueObjectLabel(surf.linkObject.kind === 'prop' ? 'world_prop' : 'world_screen', surf.linkObject.id))}</span>` : '');
  }
  card.innerHTML = `<div class="venue-card-head"><span>${icon} ${name}</span><button type="button" class="venue-card-x" data-act="close" title="Deselect">✕</button></div><div class="venue-card-body">${body}</div>`;
  if (!card._bound) {
    card._bound = true;
    card.addEventListener('pointerdown', e => e.stopPropagation());
    card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
      runVenueCardAction(b.dataset.act);
    });
    card.addEventListener('input', (e) => {
      const el = e.target.closest('[data-act]');
      if (el) runVenueCardAction(el.dataset.act, el.value);
    });
  }
}

function runVenueCardAction(act, value) {
  let sel = state.venueSel;
  if (!sel && state.selectedSurfaceId) sel = { kind: 'surface', id: state.selectedSurfaceId };
  if (!sel) return;
  const sp = ensureStagePlanState(ensureMultiProjectorState());
  if (act === 'close') { state.venueSel = null; syncVenueCardUI(true); return; }
  if (sel.kind === 'spot') {
    const spt = (state.spots || []).find(s => s.id === sel.id);
    if (!spt) return;
    if (act === 'pickup') {
      state.activeSpotIndex = Math.max(0, state.spots.indexOf(spt));
      toggleActiveSpotPickup();
    } else if (act.startsWith('mark')) {
      const k = Number(act.slice(4)) || 0;
      if (!Array.isArray(spt.marks)) spt.marks = [null, null, null, null];
      const T = getSpotWorldTargetM(spt);
      if (!spt.marks[k] || (window.event && window.event.shiftKey)) {
        spt.marks[k] = { x: Number(T[0].toFixed(3)), z: Number(T[2].toFixed(3)), h: Number((spt.aimHeightM ?? 1.3).toFixed(2)) };
        if (typeof showToast === 'function') showToast(`Stored ${spt.name} M${k + 1}`);
      } else {
        const m = spt.marks[k];
        if (spt.followPropId) { const p = getWorldPropById(spt.followPropId); if (p) moveWorldPropTo(p, m.x, m.z); }
        else { setSpotWorldTargetFromPlan(spt, m.x, m.z, { glide: true, stageModel: true }); spt.aimHeightM = m.h; }
      }
    } else if (act === 'unfollow') {
      const T = getSpotWorldTargetM(spt);
      spt.followPropId = null;
      ensureSpotStageModel(spt);
      setSpotWorldTargetFromPlan(spt, T[0], T[2], { stageModel: true });
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    if (typeof renderLivePerformanceDockUI === 'function') renderLivePerformanceDockUI();
    syncVenueCardUI(true);
    return;
  }
  if (act === 'mapauto' && sel.kind === 'venue_part') {
    const surf = mapMediaOntoVenuePart(sel.id, pickVenuePartFaceForProjector(getVenuePartById(sel.id)));
    if (surf) { state.venueSel = { kind: 'surface', id: surf.id }; }
  } else if (act === 'map') {
    const surf = mapMediaOntoObject(sel.kind, sel.id);
    if (surf) { state.venueSel = { kind: 'surface', id: surf.id }; }
  } else if (act === 'follow') {
    const spot = (typeof getActiveLiveSpot === 'function' ? getActiveLiveSpot() : null) || (state.spots || [])[0];
    if (spot) {
      if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Spot Follows Person');
      spot.followPropId = spot.followPropId === sel.id ? null : sel.id;
      spot.converge3D = true;
      if (typeof showToast === 'function') showToast(spot.followPropId ? `🎯 ${spot.name} follows ${getVenueObjectLabel('world_prop', sel.id)}` : `${spot.name} released`);
      if (typeof renderLivePerformanceDockUI === 'function') renderLivePerformanceDockUI();
    }
  } else if (act === 'arms') {
    const p = getWorldPropById(sel.id);
    if (p) { p.armsUp = !p.armsUp; markStagePlanDirty(); }
  } else if (act === 'align') {
    if (typeof beginProjectorPointAlign === 'function') beginProjectorPointAlign(Number(sel.id));
  } else if (act === 'pov') {
    sp.povIndex = Number(sel.id);
    setVenueCameraMode(sp.camMode === 'pov' ? 'orbit' : 'pov');
  } else if (act === 'solo') {
    sp.previzSolo = Number(sp.previzSolo) === Number(sel.id) ? 0 : Number(sel.id);
  } else if (act === 'aim') {
    const scr = (state.multiProjector?.screens || []).find(x => String(x.index) === sel.id);
    if (scr) { if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Aim Projector'); autoAimProjectorAtWorldScreen(scr); markStagePlanDirty(); }
  } else if (act === 'level') {
    const dev = (state.dmxDevices || []).find(d => d.id === sel.id);
    const ch = dev && (dev.channels || []).find(c => c.key === 'dimmer' || c.key === 'haze');
    if (ch) setDmxDeviceChannelValue(dev.id, ch.key, parseInt(value, 10) || 0, 'seat');
    return;
  } else if (act === 'aimperf') {
    const dev = (state.dmxDevices || []).find(d => d.id === sel.id);
    const prop = (state.worldProps || []).find(p => p && p.enabled !== false);
    if (dev && prop) { dev.aimM = [prop.posM[0], prop.posM[1] + (prop.heightM || 1.75) * 0.6, prop.posM[2]]; markStagePlanDirty(); }
  } else if (act === 'src' || act === 'opacity') {
    const surf = state.surfaces.find(s => s.id === sel.id);
    if (!surf) return;
    if (act === 'src') { if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Change Media'); surf.sourceId = value; state.activeSourceId = value; }
    else surf.opacity = clamp(parseFloat(value) || 0, 0, 1);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    if (typeof renderSurfaceList === 'function') renderSurfaceList();
    if (act === 'src' && typeof syncInspectorUI === 'function') syncInspectorUI();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    return;
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  syncVenueHudUI();
  syncVenueCardUI(true);
}

// ----------------------------------------------------------------------------
// 11. MOVE OBJECTS IN AN ORTHOGRAPHIC VIEW PLANE (v2.2)
// ----------------------------------------------------------------------------
const ORTHO_MOVABLE_KINDS = ['world_prop', 'world_screen', 'projector', 'dmx_device', 'venue_part'];

function getVenueObjectRef(kind, id) {
  if (kind === 'world_prop') return getWorldPropById(id);
  if (kind === 'world_screen') return (state.worldScreens || []).find(w => w && w.id === id) || null;
  if (kind === 'projector') return (state.multiProjector?.screens || []).find(s => String(s.index) === String(id)) || null;
  if (kind === 'dmx_device') return (state.dmxDevices || []).find(d => d && d.id === id) || null;
  if (kind === 'venue_part' && typeof getVenuePartById === 'function') return getVenuePartById(id);
  return null;
}

function beginOrthoObjectMove(kind, id, sp, viewW, viewH) {
  const obj = getVenueObjectRef(kind, id);
  if (!obj || !Array.isArray(obj.posM)) return null;
  const cam = buildVenueOrthoCamera(sp, viewW / Math.max(1, viewH));
  return {
    kind: 'ortho-move', target: kind, id, startX: 0, startY: 0,
    origPos: [...obj.posM], origAim: Array.isArray(obj.aimM) ? [...obj.aimM] : null,
    mpp: (2 * cam.orthoHalfH) / Math.max(1, viewH), right: cam.right, up: cam.up
  };
}

// dx/dy in CSS px. Shift snaps to 5 cm (or the view grid); ⌘/Ctrl moves aim with the body.
function applyOrthoObjectMove(drag, dx, dy, mods = {}) {
  const obj = getVenueObjectRef(drag.target, drag.id);
  if (!obj) return false;
  const gear = mods.alt ? 0.2 : 1;
  const du = dx * drag.mpp * gear, dv = -dy * drag.mpp * gear;
  const snap = (v) => (mods.shift ? Math.round(v / 0.05) * 0.05 : Number(v.toFixed(3)));
  const d = [0, 1, 2].map(i => drag.right[i] * du + drag.up[i] * dv);
  const np = drag.origPos.map((v, i) => snap(v + d[i]));
  if (drag.target === 'world_prop') {
    moveWorldPropTo(obj, np[0], np[2]);
  } else {
    if (drag.target === 'projector' || drag.target === 'dmx_device') np[1] = Math.max(0.05, np[1]);
    obj.posM = np;
    if (drag.origAim && (mods.meta || drag.target === 'dmx_device')) obj.aimM = drag.origAim.map((v, i) => v + (np[i] - drag.origPos[i]));
    if (drag.target === 'projector') {
      obj._autoPose = false;
      if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(obj);
    }
    if (drag.target === 'world_screen' && typeof syncPrimaryVenueFromWorldScreens === 'function') syncPrimaryVenueFromWorldScreens();
    if (drag.target === 'venue_part' && typeof markVenuePartsDirty === 'function') markVenuePartsDirty();
  }
  return true;
}

// ----------------------------------------------------------------------------
// 12. LINES LOOK — any orthographic side as a measured drawing (0.1 beta).
// Plan (Top · Lines) and elevations (Front/Back/Left/Right · Lines) share one drawer:
// dimmed render underneath, labelled metre grid, outlines of the venue, parts, screens,
// projectors & people, projector trim heights in elevations, and the selected object's
// size along both screen axes.
// ----------------------------------------------------------------------------
const VENUE_LINES_INK = 'rgba(190, 222, 255, 0.85)';
const VENUE_LINES_DIM = '#ffcb7d';

function pickVenueGridStep(pxPerM) {
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50]) if (s * pxPerM >= 38) return s;
  return 100;
}

function fmtMetres(m) {
  const a = Math.abs(m);
  return a >= 10 ? `${m.toFixed(1)} m` : `${m.toFixed(2)} m`;
}

function boxCornersFromMinMax(min, max) {
  const out = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

function oboxCorners(ob) {
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    out.push([0, 1, 2].map(i => ob.c[i] + ob.ax[i] * sx + ob.ay[i] * sy + ob.az[i] * sz));
  }
  return out;
}

// Edges of an 8-corner box built by the loops above (bit order x, y, z).
const VENUE_BOX_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

function getVenueSelectionCorners() {
  const sel = state.activeSelection || {};
  const obj = typeof getVenueObjectRef === 'function' ? getVenueObjectRef(sel.kind, sel.id) : null;
  if (!obj) return null;
  if (sel.kind === 'venue_part' && typeof venuePartOBoxes === 'function') {
    return { label: obj.name || 'Part', pts: venuePartOBoxes(obj).flatMap(oboxCorners) };
  }
  if (sel.kind === 'world_screen') {
    const b = getWorldScreenBasis(obj);
    return { label: obj.name || 'Screen', pts: b.corners || [] };
  }
  if (sel.kind === 'world_prop' && Array.isArray(obj.posM)) {
    const p = obj.posM, r = 0.25, h = Number(obj.heightM) || 1.75;
    return { label: obj.name || 'Person', pts: boxCornersFromMinMax([p[0] - r, p[1], p[2] - r], [p[0] + r, p[1] + h, p[2] + r]) };
  }
  return null;
}

// Editable dimension labels drawn this frame: [{ x, y, w, h, edit }] in overlay CSS px.
let _linesDimHits = [];

// What a dimension edits, for the selected object along a view axis ('x' | 'y' | 'z').
function getLinesDimensionEdit(sel, axis) {
  const obj = typeof getVenueObjectRef === 'function' ? getVenueObjectRef(sel.kind, sel.id) : null;
  if (!obj) return null;
  const yaw = ((Number(obj.yawDeg) || 0) % 180 + 180) % 180;
  const square = yaw < 0.5 || yaw > 179.5 ? 0 : (Math.abs(yaw - 90) < 0.5 ? 90 : -1);
  if (sel.kind === 'venue_part') {
    if (axis === 'y') return { target: 'part', id: obj.id, field: 'size', idx: 1 };
    if (square < 0) return null; // rotated off-axis: the drawn extent is not a size
    const idx = axis === 'x' ? (square === 0 ? 0 : 2) : (square === 0 ? 2 : 0);
    return { target: 'part', id: obj.id, field: 'size', idx };
  }
  if (sel.kind === 'world_screen') {
    if (axis === 'y') return Math.abs(Number(obj.pitchDeg) || 0) < 0.5 ? { target: 'screen', id: obj.id, field: 'heightM' } : null;
    if ((axis === 'x' && square === 0) || (axis === 'z' && square === 90)) return { target: 'screen', id: obj.id, field: 'widthM' };
    return null;
  }
  if (sel.kind === 'world_prop' && axis === 'y') return { target: 'prop', id: obj.id, field: 'heightM' };
  return null;
}

function getLinesElevationEdit(sel) {
  const obj = typeof getVenueObjectRef === 'function' ? getVenueObjectRef(sel.kind, sel.id) : null;
  if (!obj) return null;
  if (sel.kind === 'venue_part') return { target: 'part', id: obj.id, field: 'elev' };
  if (sel.kind === 'world_screen' && Math.abs(Number(obj.pitchDeg) || 0) < 0.5) return { target: 'screen', id: obj.id, field: 'bottom' };
  return null;
}

// Apply a typed dimension (metres). One undo step.
function applyLinesDimensionEdit(edit, valueM) {
  const v = Number(valueM);
  if (!edit || !Number.isFinite(v)) return false;
  const exists = edit.target === 'part' ? (typeof getVenuePartById === 'function' && getVenuePartById(edit.id))
    : edit.target === 'screen' ? (state.worldScreens || []).some(w => w && w.id === edit.id)
    : edit.target === 'prop' ? (typeof getWorldPropById === 'function' && getWorldPropById(edit.id))
    : (state.multiProjector?.screens || []).some(s => s.index === Number(edit.id) && Array.isArray(s.posM));
  if (!exists) return false;
  if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Set dimension');
  if (edit.target === 'part') {
    const part = typeof getVenuePartById === 'function' ? getVenuePartById(edit.id) : null;
    if (!part) return false;
    if (edit.field === 'size') part.sizeM[edit.idx] = clamp(v, 0.02, 200);
    else if (edit.field === 'elev') part.posM[1] = clamp(v, -20, 200);
    if (typeof markVenuePartsDirty === 'function') markVenuePartsDirty();
  } else if (edit.target === 'screen') {
    const ws = (state.worldScreens || []).find(w => w && w.id === edit.id);
    if (!ws) return false;
    if (edit.field === 'widthM' || edit.field === 'heightM') {
      const bottom = (Number(ws.posM[1]) || 0) - (Number(ws.heightM) || 0) / 2;
      ws[edit.field] = clamp(v, 0.1, 200);
      if (edit.field === 'heightM') ws.posM[1] = bottom + ws.heightM / 2; // grow upwards from the same bottom edge
    } else if (edit.field === 'bottom') {
      ws.posM[1] = clamp(v, -20, 200) + (Number(ws.heightM) || 0) / 2;
    }
  } else if (edit.target === 'prop') {
    const p = typeof getWorldPropById === 'function' ? getWorldPropById(edit.id) : null;
    if (!p) return false;
    p.heightM = clamp(v, 0.4, 3.0);
  } else if (edit.target === 'projector') {
    const scr = (state.multiProjector?.screens || []).find(s => s.index === Number(edit.id));
    if (!scr || !Array.isArray(scr.posM)) return false;
    scr.posM[1] = clamp((Number(edit.floor) || 0) + v, -20, 200);
    scr._autoPose = false;
    if (typeof syncProjectorAnglesFromAim === 'function') syncProjectorAnglesFromAim(scr); // keep aiming at the same point
  }
  markStagePlanDirty();
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  if (typeof renderWorldDocksUI === 'function' && isBuildRoom()) renderWorldDocksUI();
  if (typeof renderRigWorkspaceCanvas === 'function' && isBuildRoom()) renderRigWorkspaceCanvas();
  return true;
}

// Click an underlined dimension in a Lines view → type the exact size. Enter applies, Esc cancels.
// Typing sizes changes real geometry: only in BUILD / MAP and never under Show Lock.
function canEditLinesDimensions() {
  return state.room !== 'live' && !state.showLock && !state.isProjectorRole;
}

function tryBeginLinesDimensionEdit(mx, my, el) {
  if (!el || !_linesDimHits.length || !canEditLinesDimensions()) return false;
  const hit = _linesDimHits.find(h => mx >= h.x - 3 && mx <= h.x + h.w + 3 && my >= h.y - 3 && my <= h.y + h.h + 3);
  if (!hit) return false;
  document.querySelector('.lines-dim-input')?.remove();
  const r = el.getBoundingClientRect();
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.step = '0.01';
  inp.className = 'lines-dim-input';
  inp.setAttribute('aria-label', 'Size in metres — Enter to apply, Esc to cancel');
  inp.value = (Number(hit.value) || 0).toFixed(2);
  const initial = inp.value; // unchanged text = no edit (avoids rounding 1.2345 → 1.23 on blur)
  inp.style.left = `${Math.round(r.left + hit.x + hit.w / 2 - 44)}px`;
  inp.style.top = `${Math.round(r.top + hit.y - 5)}px`;
  let done = false;
  const finish = (apply) => {
    if (done) return;
    done = true;
    window.removeEventListener('resize', cancel, true);
    el.removeEventListener('wheel', cancel, true);
    if (apply && inp.value !== '' && inp.value.trim() !== initial) {
      if (applyLinesDimensionEdit(hit.edit, inp.value) && typeof showToast === 'function') showToast(`Set to ${Number(inp.value).toFixed(2)} m (⌘Z undoes)`);
    }
    inp.remove();
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  inp.addEventListener('blur', () => finish(true));
  // The view moved under it (zoom / resize): the box would point at the wrong label — cancel.
  const cancel = (e) => { if (!e || e.target !== inp) finish(false); };
  window.addEventListener('resize', cancel, true);
  el.addEventListener('wheel', cancel, true); // zooming this view moves the labels
  document.body.appendChild(inp);
  setTimeout(() => { inp.focus(); inp.select(); }, 0);
  return true;
}

function drawVenueLinesOverlay(ctx, cam, cssW, cssH, opts = {}) {
  _linesDimHits = [];
  if (!cam || !cam.ortho) return;
  const view = VENUE_ORTHO_VIEWS[cam.ortho];
  if (!view) return;
  const mvp = cam.mvp;
  const toPx = (p) => {
    const c = venueClipPoint(p, mvp);
    return [((c[0] / c[3]) * 0.5 + 0.5) * cssW, (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * cssH];
  };
  const seg = (a, b) => {
    const A = toPx(a), B = toPx(b);
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  };
  const axisIdx = { x: 0, y: 1, z: 2 };
  const hI = axisIdx[view.h], vI = axisIdx[view.v];
  const pxPerM = cssH / Math.max(1e-3, 2 * cam.orthoHalfH);
  const step = pickVenueGridStep(pxPerM);
  const ctr = cam.target;

  ctx.save();
  // 1. Dim the render so the drawing reads first (light is still visible underneath).
  ctx.fillStyle = 'rgba(5, 9, 17, 0.62)';
  ctx.fillRect(0, 0, cssW, cssH);

  // 2. Labelled metre grid in the view plane.
  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.lineWidth = 1;
  const halfWm = (cssW / pxPerM) * 0.5 + step, halfHm = (cssH / pxPerM) * 0.5 + step;
  const hRange = [ctr[hI] - halfWm, ctr[hI] + halfWm];
  const vRange = [ctr[vI] - halfHm, ctr[vI] + halfHm];
  const at = (hv, vv) => { const p = [...ctr]; p[hI] = hv; p[vI] = vv; return toPx(p); };
  for (let t = Math.ceil(hRange[0] / step) * step; t <= hRange[1]; t += step) {
    const x = at(t, ctr[vI])[0];
    const major = Math.abs(t / (step * 5) - Math.round(t / (step * 5))) < 1e-6;
    ctx.strokeStyle = Math.abs(t) < 1e-6 ? 'rgba(111, 211, 255, 0.45)' : (major ? 'rgba(111, 211, 255, 0.2)' : 'rgba(111, 211, 255, 0.09)');
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cssH); ctx.stroke();
    ctx.fillStyle = 'rgba(160, 196, 230, 0.7)'; ctx.textAlign = 'center';
    ctx.fillText(`${+t.toFixed(2)}`, x, cssH - 30);
  }
  for (let t = Math.ceil(vRange[0] / step) * step; t <= vRange[1]; t += step) {
    const y = at(ctr[hI], t)[1];
    const major = Math.abs(t / (step * 5) - Math.round(t / (step * 5))) < 1e-6;
    ctx.strokeStyle = Math.abs(t) < 1e-6 ? 'rgba(111, 211, 255, 0.45)' : (major ? 'rgba(111, 211, 255, 0.2)' : 'rgba(111, 211, 255, 0.09)');
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssW, y); ctx.stroke();
    ctx.fillStyle = 'rgba(160, 196, 230, 0.7)'; ctx.textAlign = 'right';
    ctx.fillText(`${+t.toFixed(2)}`, cssW - 6, y - 3);
  }

  // 3. Venue outlines: room shell (dashed), stage deck, arch, parts.
  const lay = getVenueLayout();
  if (lay.room.walls) {
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(190, 222, 255, 0.35)';
    const rc = boxCornersFromMinMax([lay.room.x0, 0, lay.room.z0], [lay.room.x1, lay.room.y1, lay.room.z1]);
    for (const [i, j] of VENUE_BOX_EDGES) seg(rc[i], rc[j]);
    ctx.setLineDash([]);
  }
  ctx.lineWidth = 1.3;
  for (const b of lay.boxes) {
    const corners = b.obb ? oboxCorners(b.obb) : boxCornersFromMinMax(b.min, b.max);
    ctx.strokeStyle = b.kind === 'deck' ? 'rgba(255, 203, 125, 0.8)' : VENUE_LINES_INK;
    for (const [i, j] of VENUE_BOX_EDGES) seg(corners[i], corners[j]);
  }
  // Floor line in elevations.
  if (view.v === 'y') {
    ctx.strokeStyle = 'rgba(190, 222, 255, 0.6)';
    ctx.lineWidth = 1.6;
    const y0 = at(ctr[hI], 0)[1];
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(cssW, y0); ctx.stroke();
  }

  // 4. Screens.
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#7fe0ff';
  for (const ws of state.worldScreens || []) {
    if (!ws) continue;
    const c = getWorldScreenBasis(ws).corners || [];
    for (let i = 0; i < c.length; i++) seg(c[i], c[(i + 1) % c.length]);
  }

  // 5. People: height bar + head.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1.2;
  for (const p of state.worldProps || []) {
    if (!p || p.enabled === false || !Array.isArray(p.posM)) continue;
    const h = Number(p.heightM) || 1.75;
    const foot = toPx(p.posM), head = toPx([p.posM[0], p.posM[1] + h, p.posM[2]]);
    if (view.v === 'y') { ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); ctx.lineTo(head[0], head[1] + 5); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(head[0], head[1], Math.max(3, 0.12 * pxPerM), 0, Math.PI * 2); ctx.stroke();
  }

  // 6. Projectors: body, aim line and (in elevations) the trim height from the floor.
  const mp = state.multiProjector;
  (mp?.screens || []).forEach((scr, i) => {
    if (!scr || !Array.isArray(scr.posM)) return;
    const col = STAGEPLAN_PROJ_COLORS[i % STAGEPLAN_PROJ_COLORS.length];
    const P = toPx(scr.posM);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.4;
    ctx.strokeRect(P[0] - 5, P[1] - 4, 10, 8);
    if (Array.isArray(scr.aimM)) {
      ctx.setLineDash([4, 3]);
      seg(scr.posM, scr.aimM);
      ctx.setLineDash([]);
    }
    ctx.textAlign = 'left';
    ctx.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`P${scr.index}`, P[0] + 8, P[1] - 6);
    if (view.v === 'y') {
      const floorY = typeof getVenueFloorHeightAt === 'function' ? getVenueFloorHeightAt(scr.posM[0], scr.posM[2]) : 0;
      const F = toPx([scr.posM[0], floorY, scr.posM[2]]);
      const trim = (Number(scr.posM[1]) || 0) - floorY;
      drawVenueDimension(ctx, [P[0] - 12, F[1]], [P[0] - 12, P[1]], fmtMetres(trim), col, { target: 'projector', id: scr.index, floor: floorY, value: trim });
    }
  });

  // 7. Selected object: its size along both screen axes.
  const selBox = getVenueSelectionCorners();
  if (selBox && selBox.pts.length) {
    const px = selBox.pts.map(toPx);
    const xs = px.map(p => p[0]), ys = px.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const hs = selBox.pts.map(p => p[hI]), vs = selBox.pts.map(p => p[vI]);
    const wM = Math.max(...hs) - Math.min(...hs), hM = Math.max(...vs) - Math.min(...vs);
    ctx.strokeStyle = VENUE_LINES_DIM; ctx.lineWidth = 1.2;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const sel = state.activeSelection || {};
    const eW = getLinesDimensionEdit(sel, view.h), eH = getLinesDimensionEdit(sel, view.v);
    drawVenueDimension(ctx, [x0, y1 + 14], [x1, y1 + 14], fmtMetres(wM), VENUE_LINES_DIM, eW ? { ...eW, value: wM } : null);
    drawVenueDimension(ctx, [x1 + 14, y1], [x1 + 14, y0], fmtMetres(hM), VENUE_LINES_DIM, eH ? { ...eH, value: hM } : null);
    if (view.v === 'y') {
      const bottom = Math.min(...vs);
      const eB = getLinesElevationEdit(sel);
      if (bottom > 0.02 || eB) {
        const F = at(Math.min(...hs), 0);
        drawVenueDimension(ctx, [x0 - 14, F[1]], [x0 - 14, y1], fmtMetres(bottom), 'rgba(255, 203, 125, 0.75)', eB ? { ...eB, value: bottom } : null);
      }
    }
  }

  // 8. Title block (the BUILD world pane draws its own view label).
  if (opts.title === false) { ctx.restore(); return; }
  ctx.textAlign = 'left';
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = 'rgba(190, 222, 255, 0.85)';
  ctx.fillText(`${cam.ortho === 'top' ? 'PLAN' : view.label.toUpperCase() + ' ELEVATION'} · grid ${step < 1 ? step * 100 + ' cm' : step + ' m'}`, 10, cssH - 12);
  ctx.restore();
}

// Architectural dimension: line with end ticks and a centred label.
function drawVenueDimension(ctx, a, b, label, col, edit = null) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 6 && !edit) return;
  const nx = -dy / len, ny = dx / len;
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  for (const p of [a, b]) { ctx.moveTo(p[0] - nx * 4, p[1] - ny * 4); ctx.lineTo(p[0] + nx * 4, p[1] + ny * 4); }
  ctx.stroke();
  ctx.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace';
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const tw = ctx.measureText(label).width + 6;
  ctx.fillStyle = 'rgba(6, 10, 18, 0.88)';
  ctx.fillRect(mx - tw / 2, my - 6, tw, 12);
  ctx.fillStyle = col; ctx.textAlign = 'center';
  ctx.fillText(label, mx, my + 3);
  if (edit && canEditLinesDimensions()) {
    // Editable: dotted underline; click to type an exact value.
    ctx.strokeStyle = col; ctx.setLineDash([1.5, 1.5]);
    ctx.beginPath(); ctx.moveTo(mx - tw / 2 + 3, my + 6.5); ctx.lineTo(mx + tw / 2 - 3, my + 6.5); ctx.stroke();
    ctx.setLineDash([]);
    _linesDimHits.push({ x: mx - tw / 2, y: my - 6, w: tw, h: 12, edit, value: edit.value });
  }
  ctx.restore();
}
