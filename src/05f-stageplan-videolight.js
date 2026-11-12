// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05f-stageplan-videolight.js — Milestones 7B & 7C:
//   1. Visual 2D Floor Plan & 3D Stage Elevation Rigging Studio (Meters, Trim Height, Throw, Shift, Lumens)
//   2. Shadow-Aware Constant-Brightness Cross-Projection Optical Solver (128x72 RGBA16F GPU LUT + 3x3 Homography)
//   3. 3D-Convergent Multi-Projector Performer Followspot & Background Spill Mask
//   4. Theatrical 4-Blade Framing Shutters & Video-as-Light Stage Instrument Helpers
// ============================================================================

const STAGE_PLAN_LUT_W = 128;
const STAGE_PLAN_LUT_H = 72;

const STAGE_PLAN_PRESETS = {
  single_front: {
    id: 'single_front',
    label: '1× Front Center FOH Rig',
    venue: { roomWidthM: 10.0, roomDepthM: 8.5, roomHeightM: 5.0, screenWidthM: 6.0, screenHeightM: 3.375, screenBottomM: 0.65, screenZ: -2.6 },
    uniformity: 1.0,
    featherPct: 0.08,
    shadowComp: true,
    screens: [
      { name: 'P1 Front FOH', posM: [0.0, 2.34, 4.9], aimM: [0.0, 2.34, -2.6], rollDeg: 0, throwRatio: 1.25, lensShiftX: 0.0, lensShiftY: 0.0, lumens: 10000 }
    ]
  },
  dual_pano_2x1: {
    id: 'dual_pano_2x1',
    label: '2×1 Wide Panorama (20% Center Blend)',
    venue: { roomWidthM: 12.0, roomDepthM: 8.5, roomHeightM: 5.0, screenWidthM: 8.4, screenHeightM: 2.70, screenBottomM: 0.80, screenZ: -2.6 },
    uniformity: 1.0,
    featherPct: 0.18,
    shadowComp: true,
    screens: [
      { name: 'P1 Stage Left Pano', posM: [-1.85, 2.15, 3.2], aimM: [-1.85, 2.15, -2.6], rollDeg: 0, throwRatio: 1.20, lensShiftX: 0.0, lensShiftY: 0.0, lumens: 8500 },
      { name: 'P2 Stage Right Pano', posM: [1.85, 2.15, 3.2], aimM: [1.85, 2.15, -2.6], rollDeg: 0, throwRatio: 1.20, lensShiftX: 0.0, lensShiftY: 0.0, lumens: 8500 }
    ]
  },
  opposing_wings_constant: {
    id: 'opposing_wings_constant',
    label: 'Opposing Side-Stage Cross-Overlap (Constant Brightness + Shadow Fill)',
    venue: { roomWidthM: 10.5, roomDepthM: 8.5, roomHeightM: 5.0, screenWidthM: 6.0, screenHeightM: 3.375, screenBottomM: 0.65, screenZ: -2.6 },
    uniformity: 1.0,
    featherPct: 0.12,
    shadowComp: true,
    screens: [
      { name: 'P1 Wing Left', posM: [-3.25, 2.55, 2.35], aimM: [0.0, 2.34, -2.6], rollDeg: 0, throwRatio: 0.68, lensShiftX: 0.0, lensShiftY: 0.0, lumens: 9000 },
      { name: 'P2 Wing Right', posM: [3.25, 2.55, 2.35], aimM: [0.0, 2.34, -2.6], rollDeg: 0, throwRatio: 0.68, lensShiftX: 0.0, lensShiftY: 0.0, lumens: 9000 }
    ]
  },
  dual_stack_2x: {
    id: 'dual_stack_2x',
    label: '2× Tandem High-Output Stack (Double Lumens)',
    venue: { roomWidthM: 10.0, roomDepthM: 8.5, roomHeightM: 5.0, screenWidthM: 6.0, screenHeightM: 3.375, screenBottomM: 0.65, screenZ: -2.6 },
    uniformity: 1.0,
    featherPct: 0.08,
    shadowComp: true,
    screens: [
      { name: 'P1 Upper Cage', posM: [-0.12, 2.52, 4.9], aimM: [0.0, 2.34, -2.6], rollDeg: 0, throwRatio: 1.24, lensShiftX: 0.0, lensShiftY: 0.0, lumens: 10000 },
      { name: 'P2 Lower Cage', posM: [0.12, 2.16, 4.9], aimM: [0.0, 2.34, -2.6], rollDeg: 0, throwRatio: 1.24, lensShiftX: 0.0, lensShiftY: 0.0, lumens: 10000 }
    ]
  },
  triple_stage_wrap: {
    id: 'triple_stage_wrap',
    label: '3× Left / Center / Right Stage Cross-Fill',
    venue: { roomWidthM: 12.0, roomDepthM: 9.0, roomHeightM: 5.5, screenWidthM: 7.5, screenHeightM: 3.60, screenBottomM: 0.65, screenZ: -2.8 },
    uniformity: 1.0,
    featherPct: 0.16,
    shadowComp: true,
    screens: [
      { name: 'P1 Truss Left', posM: [-3.8, 2.95, 2.1], aimM: [-0.8, 2.45, -2.8], rollDeg: 0, throwRatio: 0.85, lensShiftX: 0.0, lensShiftY: 0.0, lumens: 8500 },
      { name: 'P2 FOH Center', posM: [0.0, 2.65, 4.7], aimM: [0.0, 2.45, -2.8], rollDeg: 0, throwRatio: 0.98, lensShiftX: 0.0, lensShiftY: 0.0, lumens: 10000 },
      { name: 'P3 Truss Right', posM: [3.8, 2.95, 2.1], aimM: [0.8, 2.45, -2.8], rollDeg: 0, throwRatio: 0.85, lensShiftX: 0.0, lensShiftY: 0.0, lumens: 8500 }
    ]
  }
};

function getDefaultVenueSpec() {
  return {
    roomWidthM: 10.5,
    roomDepthM: 8.5,
    roomHeightM: 5.0,
    screenWidthM: 6.0,
    screenHeightM: 3.375,
    screenBottomM: 0.65,
    screenZ: -2.6
  };
}

function ensureScreenPhysicalPose(scr, idx = 1, total = 2, venue = null) {
  if (!scr || typeof scr !== 'object') return scr;
  const v = venue || getDefaultVenueSpec();
  const centerY = v.screenBottomM + v.screenHeightM * 0.5;
  const span = total <= 1 ? 0 : ((idx - 1) / Math.max(1, total - 1) - 0.5);
  const defX = Number((span * v.screenWidthM * 0.62).toFixed(3));
  const defAimX = Number((span * v.screenWidthM * 0.42).toFixed(3));
  const defZ = Number((v.screenZ + Math.max(3.6, v.screenWidthM * 0.82)).toFixed(3));

  if (!Array.isArray(scr.posM) || scr.posM.length < 3) {
    scr.posM = [defX, Number(centerY.toFixed(3)), defZ];
  } else {
    scr.posM = [
      clamp(Number(scr.posM[0]) || 0, -25, 25),
      clamp(Number.isFinite(Number(scr.posM[1])) ? Number(scr.posM[1]) : centerY, 0.05, 20),
      clamp(Number.isFinite(Number(scr.posM[2])) ? Number(scr.posM[2]) : defZ, -25, 25)
    ];
  }

  if (!Array.isArray(scr.aimM) || scr.aimM.length < 3) {
    scr.aimM = [defAimX, Number(centerY.toFixed(3)), v.screenZ];
  } else {
    scr.aimM = [
      clamp(Number(scr.aimM[0]) || 0, -25, 25),
      clamp(Number.isFinite(Number(scr.aimM[1])) ? Number(scr.aimM[1]) : centerY, -5, 20),
      clamp(Number.isFinite(Number(scr.aimM[2])) ? Number(scr.aimM[2]) : v.screenZ, -25, 25)
    ];
  }

  scr.rollDeg = clamp(Number(scr.rollDeg ?? 0), -180, 180);
  scr.throwRatio = clamp(Number(scr.throwRatio ?? 1.20), 0.28, 5.0);
  scr.lensShiftX = clamp(Number(scr.lensShiftX ?? 0.0), -0.80, 0.80);
  scr.lensShiftY = clamp(Number(scr.lensShiftY ?? 0.0), -0.80, 0.80);
  scr.lumens = clamp(Math.round(Number(scr.lumens ?? 8500)), 500, 60000);
  return scr;
}

function syncProjectorAnglesFromAim(scr) {
  if (!scr || !Array.isArray(scr.posM) || !Array.isArray(scr.aimM)) return scr;
  const dx = (Number(scr.aimM[0]) || 0) - (Number(scr.posM[0]) || 0);
  const dy = (Number(scr.aimM[1]) || 0) - (Number(scr.posM[1]) || 0);
  const dz = (Number(scr.aimM[2]) || 0) - (Number(scr.posM[2]) || 0);
  const dist = Math.max(0.25, Math.hypot(dx, dy, dz));
  scr.yawDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  scr.pitchDeg = (Math.asin(clamp(dy / dist, -1, 1)) * 180) / Math.PI;
  scr._aimDistM = dist;
  return scr;
}

function syncProjectorAimFromAngles(scr) {
  if (!scr || !Array.isArray(scr.posM)) return scr;
  const curDist = Array.isArray(scr.aimM)
    ? Math.hypot((scr.aimM[0] || 0) - scr.posM[0], (scr.aimM[1] || 0) - scr.posM[1], (scr.aimM[2] || 0) - scr.posM[2])
    : 4.5;
  const dist = clamp(Number(scr._aimDistM) || curDist || 4.5, 0.5, 45.0);
  scr._aimDistM = dist;
  const yawRad = ((Number(scr.yawDeg) || 0) * Math.PI) / 180;
  const pitchRad = (clamp(Number(scr.pitchDeg) || 0, -89, 89) * Math.PI) / 180;
  const cp = Math.cos(pitchRad);
  const sp = Math.sin(pitchRad);
  scr.aimM = [
    scr.posM[0] + dist * cp * Math.sin(yawRad),
    scr.posM[1] + dist * sp,
    scr.posM[2] - dist * cp * Math.cos(yawRad)
  ];
  return scr;
}

function ensureProjectorPose3D(scr, idx = 1, total = 2, venue = null) {
  return ensureScreenPhysicalPose(scr, idx, total, venue);
}

// Resolve the physical screen a projector should be aimed at: the selected
// world screen, else the first enabled one, else a pseudo-screen built from the
// stage-plan venue spec (used before the world rig has been seeded).
function resolveAutoAimTargetScreen(wsArg = null) {
  if (wsArg && typeof wsArg === 'object') return wsArg;
  const list = Array.isArray(state.worldScreens) ? state.worldScreens.filter(w => w && w.enabled !== false) : [];
  const sel = list.find(w => w.id === state.selectedWorldScreenId);
  if (sel) return sel;
  if (list.length > 0) return list[0];
  const v = state.multiProjector?.stagePlan?.venue || getDefaultVenueSpec();
  return {
    widthM: v.screenWidthM,
    heightM: v.screenHeightM,
    posM: [0, v.screenBottomM + v.screenHeightM * 0.5, v.screenZ],
    yawDeg: 0,
    pitchDeg: 0
  };
}

// Place a projector so its frame lands on the part of a physical screen that
// its output crop covers (cropX/cropW → horizontal span, cropY/cropH → vertical),
// pulled back along the screen normal by the throw distance the lens needs.
// Returns the projector (mutated in place).
function autoAimProjectorAtWorldScreen(scr, wsArg = null, opts = {}) {
  if (!scr || typeof scr !== 'object') return scr;
  const ws = resolveAutoAimTargetScreen(wsArg);
  const b = getWorldScreenBasis(ws);
  // Effective crop: with multi-projector output off every projector shows the full stage.
  const eff = getEffectiveProjectorCrop(scr);
  const cropX = eff.x, cropW = eff.w, cropY = eff.y, cropH = eff.h;
  const offU = (cropX + cropW * 0.5 - 0.5) * b.widthM;
  // Stage UV is v-up: cropY = 0 is the bottom of the canvas / screen.
  const offV = (cropY + cropH * 0.5 - 0.5) * b.heightM;
  const target = [0, 1, 2].map(k => b.center[k] + b.uAxis[k] * offU + b.vAxis[k] * offV);

  const regionW = cropW * b.widthM;
  const regionH = cropH * b.heightM;
  const nativeAspect = 16 / 9;
  const imgW = Math.max(regionW, regionH * nativeAspect) * 1.04; // 4% overscan safety
  const throwRatio = clamp(Number(scr.throwRatio) || 1.2, 0.28, 5.0);
  const dist = clamp(throwRatio * imgW, 1.0, 40.0);

  let pos = [0, 1, 2].map(k => target[k] + b.nAxis[k] * dist);
  // Keep the body off the floor and nudge apart from projectors already sitting there.
  pos[1] = Math.max(0.35, pos[1]);
  const others = (state.multiProjector?.screens || []).filter(s => s !== scr && Array.isArray(s.posM));
  const lateral = opts.avoidOverlap === false ? 0 : 0.55;
  for (let tries = 0; lateral > 0 && tries < 8; tries++) {
    const clash = others.some(o => Math.hypot(o.posM[0] - pos[0], o.posM[1] - pos[1], o.posM[2] - pos[2]) < 0.35);
    if (!clash) break;
    const step = lateral * Math.ceil((tries + 1) / 2) * (tries % 2 === 0 ? 1 : -1);
    pos = [0, 1, 2].map(k => target[k] + b.nAxis[k] * dist + b.uAxis[k] * step);
  }

  scr.posM = pos.map(n => Number(n.toFixed(3)));
  scr.aimM = target.map(n => Number(n.toFixed(3)));
  scr.lensShiftX = 0;
  scr.lensShiftY = 0;
  scr.rollDeg = 0;
  syncProjectorAnglesFromAim(scr);
  scr._autoPose = projectorPoseKey(scr);
  return scr;
}

// What a projector actually emits: its crop of the stage when multi-projector output is
// enabled, otherwise the full stage (projector windows render the whole canvas).
function getEffectiveProjectorCrop(scr, mpArg = null) {
  const mp = mpArg || state.multiProjector;
  if (!mp || !mp.enabled || !scr) return { x: 0, y: 0, w: 1, h: 1 };
  const x = clamp(Number(scr.cropX ?? 0), 0, 0.99);
  const y = clamp(Number(scr.cropY ?? 0), 0, 0.99);
  return { x, y, w: clamp(Number(scr.cropW ?? 1), 0.02, 1 - x || 1), h: clamp(Number(scr.cropH ?? 1), 0.02, 1 - y || 1) };
}

function projectorPoseKey(scr) {
  return `${(scr.posM || []).map(n => Number(n).toFixed(3)).join(',')}|${(scr.aimM || []).map(n => Number(n).toFixed(3)).join(',')}`;
}

// Projectors still sitting exactly where auto-aim put them follow layout / output-mode
// changes; anything the user moved by hand (or loaded from a show) is left alone.
function reaimAutoPlacedProjectors(mp) {
  let n = 0;
  for (const scr of mp?.screens || []) {
    if (!scr || !scr._autoPose || scr._autoPose !== projectorPoseKey(scr)) continue;
    autoAimProjectorAtWorldScreen(scr);
    n++;
  }
  return n;
}

function getWorldScreenBasis(ws) {
  const cx = Number(ws?.posM?.[0]) || 0;
  const cy = Number(ws?.posM?.[1]) || 1.69;
  const cz = Number(ws?.posM?.[2]) || -2.0;
  const w = Math.max(0.2, Number(ws?.widthM) || 6.0);
  const h = Math.max(0.2, Number(ws?.heightM) || 3.38);
  const yawRad = ((Number(ws?.yawDeg) || 0) * Math.PI) / 180;
  const pitchRad = ((Number(ws?.pitchDeg) || 0) * Math.PI) / 180;

  // uAxis: horizontal right in world space; nAxis: front normal (+Z when yaw=0, pitch=0)
  const ux = Math.cos(yawRad), uy = 0, uz = Math.sin(yawRad);
  const nx = Math.sin(yawRad) * Math.cos(pitchRad);
  const ny = Math.sin(pitchRad);
  const nz = Math.cos(yawRad) * Math.cos(pitchRad);
  // vAxis = normalize(cross(nAxis, uAxis)) -> [0, 1, 0] when pitch=0
  let vx = ny * uz - nz * uy;
  let vy = nz * ux - nx * uz;
  let vz = nx * uy - ny * ux;
  const vLen = Math.max(1e-8, Math.hypot(vx, vy, vz));
  vx /= vLen; vy /= vLen; vz /= vLen;

  const hw = w * 0.5, hh = h * 0.5;
  const corners = [
    [cx - hw * ux - hh * vx, cy - hw * uy - hh * vy, cz - hw * uz - hh * vz], // BL
    [cx + hw * ux - hh * vx, cy + hw * uy - hh * vy, cz + hw * uz - hh * vz], // BR
    [cx + hw * ux + hh * vx, cy + hw * uy + hh * vy, cz + hw * uz + hh * vz], // TR
    [cx - hw * ux + hh * vx, cy - hw * uy + hh * vy, cz - hw * uz + hh * vz]  // TL
  ];
  return {
    center: [cx, cy, cz],
    widthM: w,
    heightM: h,
    uAxis: [ux, uy, uz],
    vAxis: [vx, vy, vz],
    nAxis: [nx, ny, nz],
    corners
  };
}

function raycastWorldForProjector(origin, dir, occluders = null, fallbackDistM = 6.0) {
  const ox = Number(origin[0]) || 0, oy = Number(origin[1]) || 0, oz = Number(origin[2]) || 0;
  let dx = Number(dir[0]) || 0, dy = Number(dir[1]) || 0, dz = Number(dir[2]) || 0;
  const dLen = Math.hypot(dx, dy, dz);
  if (dLen < 1e-8) {
    dx = 0; dy = 0; dz = -1;
  } else {
    dx /= dLen; dy /= dLen; dz /= dLen;
  }

  let bestT = Infinity;
  let hitKind = 'air';
  let hitId = null;
  let hitNormal = [0, 0, 1];

  // 1. Intersect against all enabled Physical Screens (state.worldScreens)
  if (Array.isArray(state.worldScreens)) {
    for (const ws of state.worldScreens) {
      if (!ws || ws.enabled === false) continue;
      const b = getWorldScreenBasis(ws);
      const denom = dx * b.nAxis[0] + dy * b.nAxis[1] + dz * b.nAxis[2];
      if (Math.abs(denom) < 1e-6) continue;
      const rx = b.center[0] - ox, ry = b.center[1] - oy, rz = b.center[2] - oz;
      const t = (rx * b.nAxis[0] + ry * b.nAxis[1] + rz * b.nAxis[2]) / denom;
      if (t <= 0.08 || t >= bestT) continue;
      const hx = ox + t * dx - b.center[0];
      const hy = oy + t * dy - b.center[1];
      const hz = oz + t * dz - b.center[2];
      const uProj = hx * b.uAxis[0] + hy * b.uAxis[1] + hz * b.uAxis[2];
      const vProj = hx * b.vAxis[0] + hy * b.vAxis[1] + hz * b.vAxis[2];
      if (Math.abs(uProj) <= b.widthM * 0.502 && Math.abs(vProj) <= b.heightM * 0.502) {
        bestT = t;
        hitKind = 'world_screen';
        hitId = ws.id;
        hitNormal = b.nAxis;
      }
    }
  } else if (state.multiProjector?.stagePlan?.venue) {
    // Legacy fallback ONLY when state.worldScreens has never been initialized
    const v = state.multiProjector.stagePlan.venue;
    if (Math.abs(dz) > 1e-5) {
      const t = (v.screenZ - oz) / dz;
      if (t > 0.08) {
        const hx = ox + t * dx, hy = oy + t * dy;
        if (Math.abs(hx) <= v.screenWidthM * 0.55 && hy >= v.screenBottomM - 0.1 && hy <= v.screenBottomM + v.screenHeightM + 0.1) {
          bestT = t;
          hitKind = 'legacy_screen';
        }
      }
    }
  }

  // 2. Intersect against 3D Objects (mesh3d occluders)
  if (Array.isArray(occluders) && occluders.length > 0) {
    for (const occ of occluders) {
      const tris = occ.tris;
      for (let k = 0; k < tris.length; k += 3) {
        const v0 = tris[k], v1 = tris[k + 1], v2 = tris[k + 2];
        const e1x = v1[0] - v0[0], e1y = v1[1] - v0[1], e1z = v1[2] - v0[2];
        const e2x = v2[0] - v0[0], e2y = v2[1] - v0[1], e2z = v2[2] - v0[2];
        const px = dy * e2z - dz * e2y;
        const py = dz * e2x - dx * e2z;
        const pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-8) continue;
        const invDet = 1.0 / det;
        const sx = ox - v0[0], sy = oy - v0[1], sz = oz - v0[2];
        const u = (sx * px + sy * py + sz * pz) * invDet;
        if (u < 0.0 || u > 1.0) continue;
        const qx = sy * e1z - sz * e1y;
        const qy = sz * e1x - sx * e1z;
        const qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * invDet;
        if (v < 0.0 || u + v > 1.0) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
        if (t > 0.08 && t < bestT) {
          bestT = t;
          hitKind = 'mesh3d';
          hitId = occ.id;
          let nx = e1y * e2z - e1z * e2y;
          let ny = e1z * e2x - e1x * e2z;
          let nz = e1x * e2y - e1y * e2x;
          const nL = Math.max(1e-8, Math.hypot(nx, ny, nz));
          hitNormal = [nx / nL, ny / nL, nz / nL];
        }
      }
    }
  }

  // 2B. Venue architecture: stage deck, proscenium arch, room walls & ceiling
  if (typeof raycastVenueLayout === 'function') {
    const vh = raycastVenueLayout(ox, oy, oz, dx, dy, dz, bestT);
    if (vh && vh.t > 0.08 && vh.t < bestT) {
      bestT = vh.t;
      hitKind = vh.kind;
      hitId = vh.id;
      hitNormal = vh.normal;
    }
  }

  // 3. Intersect against Stage Floor Y = 0
  if (dy < -1e-4) {
    const tFloor = -oy / dy;
    if (tFloor > 0.08 && tFloor < Math.min(bestT, 90.0)) {
      const fx = ox + tFloor * dx, fz = oz + tFloor * dz;
      const lim = 70.0;
      if (Math.abs(fx) <= lim && Math.abs(fz) <= lim) {
        bestT = tFloor;
        hitKind = 'floor';
        hitId = 'floor';
        hitNormal = [0, 1, 0];
      }
    }
  }

  // 4. Open-Air Cone Fallback (e.g. all screens deleted or projector aimed into open space)
  if (!Number.isFinite(bestT)) {
    bestT = clamp(Number(fallbackDistM) || 6.0, 0.8, 25.0);
    hitKind = 'air';
    hitNormal = [-dx, -dy, -dz];
  }

  return {
    point: [ox + bestT * dx, oy + bestT * dy, oz + bestT * dz],
    dist: bestT,
    hitKind,
    hitId,
    normal: hitNormal
  };
}

function ensureStagePlanState(mpArg = null) {
  const mp = mpArg || (typeof ensureMultiProjectorState === 'function' ? ensureMultiProjectorState() : state.multiProjector);
  if (!mp) return null;
  if (!mp.stagePlan || typeof mp.stagePlan !== 'object') {
    mp.stagePlan = {
      enabled: false,
      presetId: 'opposing_wings_constant',
      viewMode: 'plan2d', // 'plan2d' | 'orbit3d'
      uniformity: 1.0,    // 0 = max raw output, 1.0 = flat constant physical brightness across overlaps & oblique falloff
      featherPct: 0.14,   // smooth optical cosine feather inside each projector's frustum border
      shadowComp: true,   // boost un-occluded projectors when 3D scenic meshes cast shadows
      showHeatmap: true,
      orbitYaw: 28,
      orbitPitch: 25,
      orbitDist: 13.5,
      venue: getDefaultVenueSpec()
    };
  }
  const sp = mp.stagePlan;
  if (!sp.venue || typeof sp.venue !== 'object') {
    sp.venue = getDefaultVenueSpec();
  } else {
    const dv = getDefaultVenueSpec();
    sp.venue.roomWidthM = clamp(Number(sp.venue.roomWidthM ?? dv.roomWidthM), 2.0, 50.0);
    sp.venue.roomDepthM = clamp(Number(sp.venue.roomDepthM ?? dv.roomDepthM), 2.0, 50.0);
    sp.venue.roomHeightM = clamp(Number(sp.venue.roomHeightM ?? dv.roomHeightM), 2.0, 25.0);
    sp.venue.screenWidthM = clamp(Number(sp.venue.screenWidthM ?? dv.screenWidthM), 0.5, 40.0);
    sp.venue.screenHeightM = clamp(Number(sp.venue.screenHeightM ?? dv.screenHeightM), 0.4, 25.0);
    sp.venue.screenBottomM = clamp(Number(sp.venue.screenBottomM ?? dv.screenBottomM), 0.0, 15.0);
    sp.venue.screenZ = clamp(Number(sp.venue.screenZ ?? dv.screenZ), -24.0, 24.0);
  }
  sp.uniformity = clamp(Number(sp.uniformity ?? 1.0), 0.0, 1.0);
  sp.featherPct = clamp(Number(sp.featherPct ?? 0.14), 0.01, 0.48);
  sp.shadowComp = sp.shadowComp !== false;
  sp.showHeatmap = sp.showHeatmap !== false;
  sp.viewMode = sp.viewMode === 'orbit3d' ? 'orbit3d' : 'plan2d';
  sp.orbitYaw = Number.isFinite(Number(sp.orbitYaw)) ? Number(sp.orbitYaw) : 28;
  sp.orbitPitch = clamp(Number.isFinite(Number(sp.orbitPitch)) ? Number(sp.orbitPitch) : 25, -75, 85);
  sp.orbitDist = clamp(Number(sp.orbitDist) || 13.5, 3.5, 42.0);

  if (Array.isArray(mp.screens)) {
    const n = mp.screens.length;
    mp.screens.forEach((s, idx) => ensureScreenPhysicalPose(s, idx + 1, n, sp.venue));
    const effKey = `${mp.enabled ? 1 : 0}|${mp.screens.map(s => [s.index, s.cropX, s.cropY, s.cropW, s.cropH].join(',')).join(';')}`;
    if (sp._effCropKey !== undefined && sp._effCropKey !== effKey) reaimAutoPlacedProjectors(mp);
    sp._effCropKey = effKey;
  }
  return sp;
}

// Invert a 3x3 column-major matrix: out = inv(m). Returns boolean ok.
function invertMat3ColMajor(m, out = new Float32Array(9)) {
  const m00 = m[0], m01 = m[3], m02 = m[6];
  const m10 = m[1], m11 = m[4], m12 = m[7];
  const m20 = m[2], m21 = m[5], m22 = m[8];

  const b01 = m22 * m11 - m12 * m21;
  const b11 = -m22 * m10 + m12 * m20;
  const b21 = m21 * m10 - m11 * m20;
  const det = m00 * b01 + m01 * b11 + m02 * b21;
  if (Math.abs(det) < 1e-11) {
    out.fill(0);
    out[0] = 1; out[4] = 1; out[8] = 1;
    return false;
  }
  const invDet = 1.0 / det;
  // Column 0
  out[0] = b01 * invDet;
  out[1] = b11 * invDet;
  out[2] = b21 * invDet;
  // Column 1
  out[3] = (-m22 * m01 + m02 * m21) * invDet;
  out[4] = (m22 * m00 - m02 * m20) * invDet;
  out[5] = (-m21 * m00 + m01 * m20) * invDet;
  // Column 2
  out[6] = (m12 * m01 - m02 * m11) * invDet;
  out[7] = (-m12 * m00 + m02 * m10) * invDet;
  out[8] = (m11 * m00 - m01 * m10) * invDet;
  return true;
}

// Compute full 3D projector optical frame, exact 3x3 Stage<->Projector homographies, and physical throw metrics
function computeProjectorOptics3D(scr, mpArg = null, occludersArg = null) {
  const mp = mpArg || ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  const v = sp.venue;
  ensureScreenPhysicalPose(scr, scr.index || 1, Math.max(1, mp.screens.length || 1), v);
  if (scr.yawDeg === undefined) syncProjectorAnglesFromAim(scr);

  const eye = scr.posM;
  const aim = scr.aimM;
  const projW = Math.max(320, Number(mp.projNativeW) || 1920);
  const projH = Math.max(240, Number(mp.projNativeH) || 1080);
  const projAspect = projW / projH;

  // Forward unit vector: eye -> aim
  let fx = aim[0] - eye[0];
  let fy = aim[1] - eye[1];
  let fz = aim[2] - eye[2];
  let fLen = Math.hypot(fx, fy, fz);
  if (fLen < 1e-6) {
    fx = 0; fy = 0; fz = -1; fLen = 1;
  } else {
    fx /= fLen; fy /= fLen; fz /= fLen;
  }

  // Right vector = normalize(cross(forward, worldUp))
  let upX = 0, upY = 1, upZ = 0;
  if (Math.abs(fy) > 0.995) {
    upX = 0; upY = 0; upZ = fy > 0 ? 1 : -1;
  }
  let rx = fy * upZ - fz * upY;
  let ry = fz * upX - fx * upZ;
  let rz = fx * upY - fy * upX;
  const rLen = Math.max(1e-8, Math.hypot(rx, ry, rz));
  rx /= rLen; ry /= rLen; rz /= rLen;

  // True optical Up vector = cross(right, forward)
  let ux = ry * fz - rz * fy;
  let uy = rz * fx - rx * fz;
  let uz = rx * fy - ry * fx;

  // Apply physical projector roll around optical axis
  const rollRad = ((Number(scr.rollDeg) || 0) * Math.PI) / 180;
  if (Math.abs(rollRad) > 1e-5) {
    const cr = Math.cos(rollRad), sr = Math.sin(rollRad);
    const nrx = rx * cr + ux * sr;
    const nry = ry * cr + uy * sr;
    const nrz = rz * cr + uz * sr;
    const nux = -rx * sr + ux * cr;
    const nuy = -ry * sr + uy * cr;
    const nuz = -rz * sr + uz * cr;
    rx = nrx; ry = nry; rz = nrz;
    ux = nux; uy = nuy; uz = nuz;
  }

  const tr = clamp(Number(scr.throwRatio) || 1.2, 0.28, 5.0);
  const wUnit = 1.0 / tr;
  const hUnit = wUnit / projAspect;
  const sx = clamp(Number(scr.lensShiftX) || 0, -0.8, 0.8);
  const sy = clamp(Number(scr.lensShiftY) || 0, -0.8, 0.8);
  const cx0 = 0.5 + sx;
  const cy0 = 0.5 + sy;

  const occluders = occludersArg || collectVenue3DOccluders(mp);
  // Usable range: beyond luxRangeM the image is too dim to read (< 60 lux); the lens is
  // focused at the aim distance with roughly −25 % / +30 % depth of field.
  const lumensRange = clamp(Number(scr.lumens) || 8500, 500, 80000);
  const trRange = clamp(Number(scr.throwRatio) || 1.2, 0.28, 5.0);
  const luxRangeM = clamp(Math.sqrt(lumensRange / ((1 / trRange) * (1 / trRange / projAspect) * 60)), 2, 60);
  const focusNearM = fLen * 0.75;
  const focusFarM = fLen * 1.3;
  const centerHit = raycastWorldForProjector(eye, [fx, fy, fz], occluders, luxRangeM);

  // Determine target Physical Screen for 3x3 StageUV -> ProjUV homography
  let refBasis = null;
  if (Array.isArray(state.worldScreens) && state.worldScreens.length > 0) {
    const hitWs = (centerHit.hitKind === 'world_screen' && centerHit.hitId)
      ? state.worldScreens.find(s => s && s.id === centerHit.hitId && s.enabled !== false)
      : null;
    const firstWs = hitWs || state.worldScreens.find(s => s && s.enabled !== false) || null;
    if (firstWs) refBasis = getWorldScreenBasis(firstWs);
  }
  if (!refBasis) {
    refBasis = {
      corners: [[-0.5 * v.screenWidthM, v.screenBottomM, v.screenZ]],
      uAxis: [1, 0, 0],
      vAxis: [0, 1, 0],
      widthM: v.screenWidthM,
      heightM: v.screenHeightM
    };
  }

  // Oriented Screen plane: P(u, v) = O_s + u * U_s + v * V_s (relative to eye)
  const ox = refBasis.corners[0][0] - eye[0];
  const oy = refBasis.corners[0][1] - eye[1];
  const oz = refBasis.corners[0][2] - eye[2];
  const uxM = refBasis.uAxis[0] * refBasis.widthM;
  const uyM = refBasis.uAxis[1] * refBasis.widthM;
  const uzM = refBasis.uAxis[2] * refBasis.widthM;
  const vxM = refBasis.vAxis[0] * refBasis.heightM;
  const vyM = refBasis.vAxis[1] * refBasis.heightM;
  const vzM = refBasis.vAxis[2] * refBasis.heightM;

  // Linear forms zf(u,v), xn(u,v), yn(u,v) for exact 3x3 StageUV -> ProjUV homography
  const zfU = uxM * fx + uyM * fy + uzM * fz;
  const zfV = vxM * fx + vyM * fy + vzM * fz;
  const zfC = ox * fx + oy * fy + oz * fz;

  const xnU = (uxM * rx + uyM * ry + uzM * rz) / wUnit + cx0 * zfU;
  const xnV = (vxM * rx + vyM * ry + vzM * rz) / wUnit + cx0 * zfV;
  const xnC = (ox * rx + oy * ry + oz * rz) / wUnit + cx0 * zfC;

  const ynU = (uxM * ux + uyM * uy + uzM * uz) / hUnit + cy0 * zfU;
  const ynV = (vxM * ux + vyM * uy + vzM * uz) / hUnit + cy0 * zfV;
  const ynC = (ox * ux + oy * uy + oz * uz) / hUnit + cy0 * zfC;

  // Column-major 3x3 StageUV -> ProjUV
  const stageToProjMat3 = new Float32Array([
    xnU, ynU, zfU,
    xnV, ynV, zfV,
    xnC, ynC, zfC
  ]);
  const projToStageMat3 = new Float32Array(9);
  const homographyValid = invertMat3ColMajor(stageToProjMat3, projToStageMat3);

  // Raycast projector's 4 frustum corner rays against Physical Screens, 3D Objects, Stage Floor, or Open Air!
  const footprintStageUv = [];
  const footprintWorld = [];
  const footprintHitKinds = [];
  const cornerUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const [pu, pv] of cornerUvs) {
    const dx = fx + (pu - cx0) * wUnit * rx + (pv - cy0) * hUnit * ux;
    const dy = fy + (pu - cx0) * wUnit * ry + (pv - cy0) * hUnit * uy;
    const dz = fz + (pu - cx0) * wUnit * rz + (pv - cy0) * hUnit * uz;
    const hit = raycastWorldForProjector(eye, [dx, dy, dz], occluders, centerHit.hitKind === 'air' ? luxRangeM : (centerHit.dist || fLen));
    footprintWorld.push(hit.point);
    footprintHitKinds.push(hit.hitKind);
    const relX = hit.point[0] - refBasis.corners[0][0];
    const relY = hit.point[1] - refBasis.corners[0][1];
    const relZ = hit.point[2] - refBasis.corners[0][2];
    footprintStageUv.push([
      (relX * refBasis.uAxis[0] + relY * refBasis.uAxis[1] + relZ * refBasis.uAxis[2]) / Math.max(0.1, refBasis.widthM),
      (relX * refBasis.vAxis[0] + relY * refBasis.vAxis[1] + relZ * refBasis.vAxis[2]) / Math.max(0.1, refBasis.heightM)
    ]);
  }

  const centerThrowM = Math.max(0.1, centerHit.dist);
  const perpDistM = centerThrowM;
  const beamWidthM = centerThrowM / tr;
  const beamHeightM = beamWidthM / projAspect;
  const pxPerCm = projW / Math.max(1, beamWidthM * 100);
  const cosInc = clamp(Math.abs(fx * centerHit.normal[0] + fy * centerHit.normal[1] + fz * centerHit.normal[2]), 0, 1);
  const incidenceRad = Math.acos(cosInc);
  const incidenceDeg = (incidenceRad * 180) / Math.PI;
  const areaM2 = Math.max(0.05, beamWidthM * beamHeightM);
  const avgLux = ((Number(scr.lumens) || 8500) * Math.max(0.15, cosInc)) / areaM2;

  return {
    eye,
    aim,
    rAxis: [rx, ry, rz],
    uAxis: [ux, uy, uz],
    fAxis: [fx, fy, fz],
    wUnit,
    hUnit,
    cx0,
    cy0,
    stageToProjMat3,
    projToStageMat3,
    homographyValid,
    footprintStageUv,
    footprintWorld,
    hitKind: centerHit.hitKind,
    hitId: centerHit.hitId,
    footprintHitKinds,
    // true when neither the beam centre nor any frame corner lands on a screen or 3D object
    // Screens, 3D objects and set/venue parts (walls, facades, blocks, platforms) are all mapping targets.
    missesAllTargets: ![centerHit.hitKind, ...footprintHitKinds].some(k => k === "world_screen" || k === "legacy_screen" || k === "mesh3d" || k === "part")
      && !(String(centerHit.hitId || '').startsWith('part:')),
    throwDistM: centerThrowM,
    luxRangeM,
    focusNearM,
    focusFarM,
    perpDistM,
    beamWidthM,
    beamHeightM,
    pxPerCm,
    incidenceDeg,
    avgLux
  };
}

// Map visible mesh3d surfaces into Venue 3D coordinates for shadow raycasting & 3D Stage Plan display
function collectVenue3DOccluders(mpArg = null) {
  const mp = mpArg || ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  const v = sp.venue;
  const occluders = typeof collectWorldPropOccluders === 'function' ? collectWorldPropOccluders() : [];
  if (!Array.isArray(state.surfaces) || typeof getSurfaceMesh3DGeometry !== 'function') return occluders;

  const unitM = v.screenHeightM * 0.5;
  const centerY = v.screenBottomM + v.screenHeightM * 0.5;
  // Place mesh3d origin slightly in front of the stage screen so scenic blocks cast realistic cross-stage shadows
  const baseZ = v.screenZ + Math.min(1.15, v.screenHeightM * 0.30);

  for (const surf of state.surfaces) {
    if (!surf || surf.type !== 'mesh3d') continue;
    const eff = typeof getEffectiveSurfaceProps === 'function' ? getEffectiveSurfaceProps(surf) : { visible: surf.visible !== false };
    if (!eff.visible) continue;
    const geom = getSurfaceMesh3DGeometry(surf, state.objAssets);
    if (!geom || !geom.verts || geom.vertCount < 3) continue;

    const p3 = surf.pos3d || [0, 0, 0];
    const s3 = surf.scale3d || [1, 1, 1];
    const worldPos = [
      (Number(p3[0]) || 0) * unitM,
      centerY + (Number(p3[1]) || 0) * unitM,
      baseZ + (Number(p3[2]) || 0) * unitM
    ];
    const worldScale = [
      (Number(s3[0]) || 1) * unitM,
      (Number(s3[1]) || 1) * unitM,
      (Number(s3[2]) || 1) * unitM
    ];
    const modelMat = mat4ComposeTRS(worldPos, surf.rot3d || [0, 0, 0], worldScale);

    const triCount = Math.floor(geom.vertCount / 3);
    // Stride ultra-dense imported OBJs cleanly so raycasting stays <1ms
    const triStride = triCount > 180 ? Math.ceil(triCount / 180) : 1;
    const tris = [];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    const xf = (vi) => {
      const base = vi * 11;
      const lx = geom.verts[base], ly = geom.verts[base + 1], lz = geom.verts[base + 2];
      const wx = modelMat[0] * lx + modelMat[4] * ly + modelMat[8] * lz + modelMat[12];
      const wy = modelMat[1] * lx + modelMat[5] * ly + modelMat[9] * lz + modelMat[13];
      const wz = modelMat[2] * lx + modelMat[6] * ly + modelMat[10] * lz + modelMat[14];
      if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
      if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
      return [wx, wy, wz];
    };

    for (let t = 0; t < triCount; t += triStride) {
      const a = xf(t * 3);
      const b = xf(t * 3 + 1);
      const c = xf(t * 3 + 2);
      tris.push(a, b, c);
    }
    if (tris.length >= 3) {
      occluders.push({
        id: surf.id,
        name: surf.name,
        accent: surf.accent || '#6fd3ff',
        worldPos,
        aabb: [minX, minY, minZ, maxX, maxY, maxZ],
        tris
      });
    }
  }
  return occluders;
}

function rayIntersectsAabbSegment(ox, oy, oz, dx, dy, dz, aabb) {
  let tmin = 0.005;
  let tmax = 0.992; // stop slightly before wall surface
  const axes = [
    [ox, dx, aabb[0], aabb[3]],
    [oy, dy, aabb[1], aabb[4]],
    [oz, dz, aabb[2], aabb[5]]
  ];
  for (let i = 0; i < 3; i++) {
    const o = axes[i][0], d = axes[i][1], bMin = axes[i][2], bMax = axes[i][3];
    if (Math.abs(d) < 1e-8) {
      if (o < bMin || o > bMax) return false;
    } else {
      const invD = 1.0 / d;
      let t1 = (bMin - o) * invD;
      let t2 = (bMax - o) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

// Moller-Trumbore segment-triangle occlusion test along P(t) = O + t * D, t in (0.01, 0.99)
function isSegmentOccludedByVenueMeshes(ox, oy, oz, tx, ty, tz, occluders) {
  if (!occluders || occluders.length === 0) return false;
  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;

  for (let oi = 0; oi < occluders.length; oi++) {
    const occ = occluders[oi];
    if (!rayIntersectsAabbSegment(ox, oy, oz, dx, dy, dz, occ.aabb)) continue;
    const tris = occ.tris;
    for (let k = 0; k < tris.length; k += 3) {
      const v0 = tris[k], v1 = tris[k + 1], v2 = tris[k + 2];
      const e1x = v1[0] - v0[0], e1y = v1[1] - v0[1], e1z = v1[2] - v0[2];
      const e2x = v2[0] - v0[0], e2y = v2[1] - v0[1], e2z = v2[2] - v0[2];
      const px = dy * e2z - dz * e2y;
      const py = dz * e2x - dx * e2z;
      const pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-8) continue;
      const invDet = 1.0 / det;
      const sx = ox - v0[0], sy = oy - v0[1], sz = oz - v0[2];
      const u = (sx * px + sy * py + sz * pz) * invDet;
      if (u < 0.0 || u > 1.0) continue;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * invDet;
      if (v < 0.0 || u + v > 1.0) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
      if (t > 0.012 && t < 0.988) return true;
    }
  }
  return false;
}

function evalProjectorFrustumFeather(pu, pv, featherPct) {
  if (pu <= 0.0 || pu >= 1.0 || pv <= 0.0 || pv >= 1.0) return 0.0;
  const fw = clamp(Number(featherPct) || 0.12, 0.005, 0.49);
  const ramp = (d) => {
    if (d >= fw) return 1.0;
    const t = clamp(d / fw, 0.0, 1.0);
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  };
  return ramp(pu) * ramp(1.0 - pu) * ramp(pv) * ramp(1.0 - pv);
}

let _cachedStagePlanField = null;
let _cachedStagePlanKey = '';
let _cachedStagePlanRev = 0;

function buildStagePlanDirtyKey(mp, occluders) {
  const sp = mp.stagePlan;
  const v = sp.venue;
  let key = `${mp.enabled ? 1 : 0}|${sp.enabled ? 1 : 0}|${mp.projNativeW}x${mp.projNativeH}|` +
    `${v.screenWidthM.toFixed(3)},${v.screenHeightM.toFixed(3)},${v.screenBottomM.toFixed(3)},${v.screenZ.toFixed(3)}|` +
    `${sp.uniformity.toFixed(3)},${sp.featherPct.toFixed(3)},${sp.shadowComp ? 1 : 0}|`;
  if (typeof getVenueLayout === 'function') {
    getVenueLayout();
    key += `VL:${_venueLayoutKey}|`;
  }
  if (Array.isArray(state.worldScreens)) {
    key += `WS(${state.worldScreens.length}):`;
    for (const ws of state.worldScreens) {
      if (!ws) continue;
      key += `[${ws.id}:${ws.enabled !== false ? 1 : 0}:${ws.widthM.toFixed(2)}x${ws.heightM.toFixed(2)}:${(ws.posM || []).map(n => Number(n).toFixed(2)).join(',')}:${(ws.yawDeg || 0).toFixed(1)}:${(ws.pitchDeg || 0).toFixed(1)}]`;
    }
  }
  for (const s of mp.screens) {
    key += `[${s.index}:${s.enabled !== false ? 1 : 0}:${(s.posM || []).map(n => Number(n).toFixed(3)).join(',')}:` +
      `${(s.aimM || []).map(n => Number(n).toFixed(3)).join(',')}:${Number(s.rollDeg || 0).toFixed(1)}:` +
      `${Number(s.throwRatio || 1.2).toFixed(3)}:${Number(s.lensShiftX || 0).toFixed(3)}:${Number(s.lensShiftY || 0).toFixed(3)}:${s.lumens || 8500}]`;
  }
  if (occluders.length > 0) {
    for (const occ of occluders) {
      key += `{${occ.id}:${occ.aabb.map(n => n.toFixed(3)).join(',')}}`;
    }
  }
  return key;
}

// Core Shadow-Aware Constant-Brightness Cross-Projection Optical Field Solver
function solveStagePlanOpticalField(mpArg = null, forceRebuild = false) {
  const mp = mpArg || ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  const v = sp.venue;
  const occluders = collectVenue3DOccluders(mp);
  const key = buildStagePlanDirtyKey(mp, occluders);
  if (!forceRebuild && _cachedStagePlanField && _cachedStagePlanKey === key) {
    return _cachedStagePlanField;
  }

  const activeScreens = mp.screens.filter(s => s && s.enabled !== false);
  const opticsByIndex = new Map();
  for (const scr of mp.screens) {
    opticsByIndex.set(scr.index, computeProjectorOptics3D(scr, mp, occluders));
  }

  const W = STAGE_PLAN_LUT_W;
  const H = STAGE_PLAN_LUT_H;
  const totalCells = W * H;
  const nAct = activeScreens.length;

  // Per-active-screen arrays over W*H stage samples
  const rawIrr = activeScreens.map(() => new Float32Array(totalCells));
  const fWeight = activeScreens.map(() => new Float32Array(totalCells));
  const seamArr = activeScreens.map(() => new Float32Array(totalCells));
  const sumFeatheredCap = new Float32Array(totalCells);
  const maxFwArr = new Float32Array(totalCells);
  const overlapCountArr = new Uint8Array(totalCells);
  const cellOccludedArr = new Uint8Array(totalCells);
  let shadowCompPixels = 0;

  for (let yi = 0; yi < H; yi++) {
    const sv = (yi + 0.5) / H;
    const wy = v.screenBottomM + sv * v.screenHeightM;
    for (let xi = 0; xi < W; xi++) {
      const su = (xi + 0.5) / W;
      const wx = (su - 0.5) * v.screenWidthM;
      const wz = v.screenZ;
      const cell = yi * W + xi;

      let capSum = 0;
      let cellMaxFw = 0;
      let covCount = 0;
      let anyOccluded = false;

      for (let si = 0; si < nAct; si++) {
        const scr = activeScreens[si];
        const opt = opticsByIndex.get(scr.index);
        const m = opt.stageToProjMat3;
        const zf = m[2] * su + m[5] * sv + m[8];
        if (zf <= 0.05) continue;
        const pu = (m[0] * su + m[3] * sv + m[6]) / zf;
        const pv = (m[1] * su + m[4] * sv + m[7]) / zf;
        if (pu <= 0.0 || pu >= 1.0 || pv <= 0.0 || pv >= 1.0) continue;

        const fw = evalProjectorFrustumFeather(pu, pv, sp.featherPct);
        const edgeDist = Math.min(pu, 1.0 - pu, pv, 1.0 - pv);
        const seamLine = (edgeDist > 0.002 && edgeDist < 0.014) ? 1.0 : 0.0;
        seamArr[si][cell] = seamLine;

        // Physical inverse-square & cosine irradiance E_i^max(u,v) in lux-proportional units
        const dx = opt.eye[0] - wx;
        const dy = opt.eye[1] - wy;
        const dz = opt.eye[2] - wz;
        const distSq = Math.max(0.15, dx * dx + dy * dy + dz * dz);
        const dist = Math.sqrt(distSq);
        const cosInc = Math.max(0.0, Math.abs(dz) / dist);
        const projAsp = Math.max(0.25, (mp.projNativeW || 1920) / Math.max(1, mp.projNativeH || 1080));
        const luxMax = ((Number(scr.lumens) || 8500) * (scr.throwRatio * scr.throwRatio) * projAsp * cosInc) / distSq;

        let vis = 1.0;
        if (sp.shadowComp && occluders.length > 0) {
          if (isSegmentOccludedByVenueMeshes(opt.eye[0], opt.eye[1], opt.eye[2], wx, wy, wz, occluders)) {
            vis = 0.0;
            anyOccluded = true;
          }
        }

        const effE = luxMax * vis;
        rawIrr[si][cell] = effE;
        fWeight[si][cell] = fw;
        if (effE > 1e-4 && fw > 1e-4) {
          capSum += fw * effE;
          if (fw > cellMaxFw) cellMaxFw = fw;
          covCount++;
        }
      }

      sumFeatheredCap[cell] = capSum;
      maxFwArr[cell] = cellMaxFw;
      overlapCountArr[cell] = covCount;
      cellOccludedArr[cell] = anyOccluded ? 1 : 0;
      if (anyOccluded && covCount > 0) shadowCompPixels++;
    }
  }

  // Determine achievable constant physical brightness target T_const across the interior illuminated plateau
  const plateauCaps = [];
  const validCaps = [];
  const xMinIn = Math.floor(W * 0.08), xMaxIn = Math.ceil(W * 0.92);
  const yMinIn = Math.floor(H * 0.08), yMaxIn = Math.ceil(H * 0.92);
  for (let yi = 0; yi < H; yi++) {
    for (let xi = 0; xi < W; xi++) {
      const c = yi * W + xi;
      if (overlapCountArr[c] > 0 && sumFeatheredCap[c] > 1.0) {
        validCaps.push(sumFeatheredCap[c]);
        if (xi >= xMinIn && xi < xMaxIn && yi >= yMinIn && yi < yMaxIn && cellOccludedArr[c] === 0 && maxFwArr[c] >= 0.85) {
          plateauCaps.push(sumFeatheredCap[c]);
        }
      }
    }
  }
  validCaps.sort((a, b) => a - b);
  plateauCaps.sort((a, b) => a - b);

  let targetConstLux = 100.0;
  let peakRawLux = 100.0;
  if (validCaps.length > 0) {
    peakRawLux = validCaps[validCaps.length - 1];
    if (plateauCaps.length > 0) {
      targetConstLux = plateauCaps[0];
    } else {
      const p08Idx = Math.min(validCaps.length - 1, Math.floor(validCaps.length * 0.08));
      targetConstLux = validCaps[p08Idx];
    }
  }

  const uniformity = sp.uniformity;
  const lutByScreen = new Map();
  const achievedLuxArr = new Float32Array(totalCells);

  for (let si = 0; si < nAct; si++) {
    const scr = activeScreens[si];
    const lut = new Float32Array(totalCells * 4);
    for (let c = 0; c < totalCells; c++) {
      const cap = sumFeatheredCap[c];
      const fw = fWeight[si][c];
      const eMax = rawIrr[si][c];
      let linDrive = 0.0;
      if (cap > 1e-5 && fw > 1e-5 && eMax > 1e-5) {
        // Bound scale by 1.0 so outer frustum feather skirts roll off smoothly by fw -> 0
        // while every interior & overlap cell with cap >= T_const achieves exact sum_i(linDrive_i * eMax_i) === T_const!
        const unifDrive = fw * Math.min(1.0, targetConstLux / cap);
        const rawShareDrive = overlapCountArr[c] > 1 ? ((fw * eMax) / cap) : fw;
        linDrive = clamp(rawShareDrive + (unifDrive - rawShareDrive) * uniformity, 0.0, 1.0);
      }
      achievedLuxArr[c] += linDrive * eMax;

      const off = c * 4;
      lut[off] = linDrive;
      lut[off + 1] = fw > 0.0005 ? 1.0 : 0.0;
      lut[off + 2] = seamArr[si][c];
      lut[off + 3] = 1.0;
    }
    lutByScreen.set(scr.index, lut);
  }

  // Compute post-solver physical brightness uniformity metrics across the stage interior plateau
  let covCells = 0;
  let overlapCells = 0;
  const interiorLux = [];
  for (let yi = 2; yi < H - 2; yi++) {
    for (let xi = 2; xi < W - 2; xi++) {
      const c = yi * W + xi;
      if (overlapCountArr[c] > 0) {
        covCells++;
        if (overlapCountArr[c] >= 2) overlapCells++;
        if (xi >= xMinIn && xi < xMaxIn && yi >= yMinIn && yi < yMaxIn && cellOccludedArr[c] === 0 && maxFwArr[c] >= 0.85) {
          interiorLux.push(achievedLuxArr[c]);
        }
      }
    }
  }
  const totalInterior = Math.max(1, (W - 4) * (H - 4));
  let minAchievedLux = 0, maxAchievedLux = 0, meanAchievedLux = 0;
  if (interiorLux.length > 0) {
    minAchievedLux = Infinity;
    maxAchievedLux = -Infinity;
    let acc = 0;
    for (const vLux of interiorLux) {
      if (vLux < minAchievedLux) minAchievedLux = vLux;
      if (vLux > maxAchievedLux) maxAchievedLux = vLux;
      acc += vLux;
    }
    meanAchievedLux = acc / interiorLux.length;
  }
  const uniformityPct = maxAchievedLux > 1e-4 ? clamp((minAchievedLux / maxAchievedLux) * 100, 0, 100) : 100;

  // Build 1D horizontal profile (128 samples at mid-stage Y=0.5) for Stage Plan Heatmap bar
  const midRow = Math.floor(H * 0.5);
  const rawMidProfile = new Float32Array(W);
  const solvedMidProfile = new Float32Array(W);
  for (let xi = 0; xi < W; xi++) {
    const c = midRow * W + xi;
    rawMidProfile[xi] = sumFeatheredCap[c];
    solvedMidProfile[xi] = achievedLuxArr[c];
  }

  _cachedStagePlanRev++;
  _cachedStagePlanKey = key;
  const overlapAreaPct = covCells > 0 ? clamp((overlapCells / covCells) * 100, 0, 100) : 0;
  _cachedStagePlanField = {
    rev: _cachedStagePlanRev,
    key,
    w: W,
    h: H,
    width: W,
    height: H,
    opticsByIndex,
    opticsByScreen: opticsByIndex,
    lutByScreen,
    occluders,
    targetConstLux,
    peakRawLux,
    minAchievedLux,
    maxAchievedLux,
    meanAchievedLux,
    uniformityPct,
    coveragePct: clamp((covCells / totalInterior) * 100, 0, 100),
    overlapAreaPct,
    overlapPct: overlapAreaPct,
    shadowCompPixels,
    rawMidProfile,
    solvedMidProfile
  };
  return _cachedStagePlanField;
}

// Pure CPU query at arbitrary Stage UV (u, v) for tests, API & live cursor inspection
function evalStagePlanConstantBrightnessAt(stageU, stageV, mpArg = null) {
  const mp = mpArg || ensureMultiProjectorState();
  const field = solveStagePlanOpticalField(mp);
  const u = clamp(Number(stageU) ?? 0.5, 0, 1);
  const v = clamp(Number(stageV) ?? 0.5, 0, 1);
  const xi = clamp(Math.floor(u * field.width), 0, field.width - 1);
  const yi = clamp(Math.floor(v * field.height), 0, field.height - 1);
  const cell = yi * field.width + xi;

  const wy = mp.stagePlan.venue.screenBottomM + v * mp.stagePlan.venue.screenHeightM;
  const wx = (u - 0.5) * mp.stagePlan.venue.screenWidthM;
  const wz = mp.stagePlan.venue.screenZ;
  const projAsp = Math.max(0.25, (mp.projNativeW || 1920) / Math.max(1, mp.projNativeH || 1080));
  const gamma = Math.max(0.5, Number(mp.blendGamma) || 2.2);

  let totalPhysicalLux = 0;
  let rawUnblendedLux = 0;
  const perScreen = [];

  for (const scr of mp.screens) {
    if (!scr || scr.enabled === false) continue;
    const lut = field.lutByScreen.get(scr.index);
    const opt = field.opticsByIndex.get(scr.index);
    const linDrive = lut ? lut[cell * 4] : 0;
    const inFrustum = lut ? lut[cell * 4 + 1] > 0.5 : false;

    const dx = opt.eye[0] - wx;
    const dy = opt.eye[1] - wy;
    const dz = opt.eye[2] - wz;
    const distSq = Math.max(0.15, dx * dx + dy * dy + dz * dz);
    const cosInc = Math.max(0, Math.abs(dz) / Math.sqrt(distSq));
    const maxLux = inFrustum
      ? (((Number(scr.lumens) || 8500) * (scr.throwRatio * scr.throwRatio) * projAsp * cosInc) / distSq)
      : 0;
    const occluded = inFrustum && mp.stagePlan.shadowComp && field.occluders.length > 0
      ? isSegmentOccludedByVenueMeshes(opt.eye[0], opt.eye[1], opt.eye[2], wx, wy, wz, field.occluders)
      : false;
    const availLux = occluded ? 0 : maxLux;
    const encodedOut = Math.pow(clamp(linDrive, 0, 1), 1.0 / gamma);
    const contribLux = Math.pow(encodedOut, gamma) * availLux;
    totalPhysicalLux += contribLux;
    rawUnblendedLux += availLux;

    perScreen.push({
      index: scr.index,
      name: scr.name,
      inFrustum,
      occluded,
      linearDrive: linDrive,
      encodedOut,
      maxLux: availLux,
      contribLux
    });
  }

  return {
    stageU: u,
    stageV: v,
    worldPosM: [wx, wy, wz],
    targetConstLux: field.targetConstLux,
    totalPhysicalLux,
    rawUnblendedLux,
    uniformityPct: field.uniformityPct,
    perScreen
  };
}

function applyStagePlanPreset(presetId = 'opposing_wings_constant', enableNow = true) {
  const mp = ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  const preset = STAGE_PLAN_PRESETS[presetId] || STAGE_PLAN_PRESETS.opposing_wings_constant;

  sp.presetId = preset.id;
  Object.assign(sp.venue, preset.venue);
  sp.uniformity = preset.uniformity ?? 1.0;
  sp.featherPct = preset.featherPct ?? 0.14;
  sp.shadowComp = preset.shadowComp !== false;
  if (enableNow) {
    mp.enabled = true;
    sp.enabled = true;
    mp.layoutPreset = 'custom';
  }

  mp.screens = preset.screens.map((def, idx) => createProjectorScreenSlice(idx + 1, {
    name: def.name,
    enabled: true,
    cropX: 0,
    cropY: 0,
    cropW: 1,
    cropH: 1,
    blendL: 0,
    blendR: 0,
    blendT: 0,
    blendB: 0,
    gain: 1.0,
    posM: [...def.posM],
    aimM: [...def.aimM],
    rollDeg: def.rollDeg ?? 0,
    throwRatio: def.throwRatio ?? 1.2,
    lensShiftX: def.lensShiftX ?? 0,
    lensShiftY: def.lensShiftY ?? 0,
    lumens: def.lumens ?? 8500
  }));
  mp.selectedScreenIndex = 1;
  if (mp.previewScreenIndex > mp.screens.length) mp.previewScreenIndex = 0;

  solveStagePlanOpticalField(mp, true);
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  if (typeof syncStagePlanDialogUI === 'function') syncStagePlanDialogUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return mp;
}

// ============================================================================
// 2. MILESTONE 7C: 3D-CONVERGENT MULTI-PROJECTOR FOLLOWSPOT & SPILL MASK
// ============================================================================

function getPerformer3DWorldCenterM(fsArg = null, mpArg = null) {
  const fs = fsArg || state.followspot;
  const mp = mpArg || ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  const v = sp.venue;
  const T = typeof getSpotWorldTargetM === 'function' ? getSpotWorldTargetM(fs) : [0, 1.5, v.screenZ + 1.2];
  const heightM = clamp(Number(fs?.performerHeightM ?? 1.75), 0.4, 4.0);
  const radiusM = clamp(Number(fs?.performerRadiusM ?? 0.45), 0.1, 2.5);
  const depthM = clamp(Number(fs?.performerDepthM ?? 1.2), 0.0, 12.0);
  return { x: T[0], y: T[1], z: T[2], depthM, heightM, radiusM, screenZ: v.screenZ, venue: v };
}

// computeConvergentSpotForProjector() lives in 05h-venue-previz.js (real lens model,
// projector routing & calibration trims).

// ============================================================================
// 3. INTERACTIVE 2D FLOOR PLAN & 3D STAGE ELEVATION ORBIT STUDIO (<dialog>)
// ============================================================================

const STAGEPLAN_PROJ_COLORS = [
  '#34e89e', '#6fd3ff', '#ffcb7d', '#c084fc', '#ff6b8b', '#38bdf8', '#a3e635', '#fb923c'
];

let stagePlanDragState = null;

function openStagePlanModal() {
  if (typeof document === 'undefined') return;
  const dlg = document.getElementById('stageplan-dialog');
  if (!dlg) return;
  ensureStagePlanState();
  syncStagePlanDialogUI();
  if (!dlg.open) dlg.showModal();
  requestAnimationFrame(() => renderStagePlanCanvas());
}

function syncStagePlanDialogUI() {
  if (typeof document === 'undefined') return;
  const dlg = document.getElementById('stageplan-dialog');
  if (!dlg) return;

  const mp = ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  const v = sp.venue;
  const field = solveStagePlanOpticalField(mp);

  const chkSolver = document.getElementById('chk-sp-enable');
  if (chkSolver) chkSolver.checked = !!(mp.enabled && sp.enabled);

  const btnPlan2d = document.getElementById('btn-sp-view-2d');
  const btnOrbit3d = document.getElementById('btn-sp-view-3d');
  if (btnPlan2d) {
    btnPlan2d.classList.toggle('active', sp.viewMode === 'plan2d');
    btnPlan2d.setAttribute('aria-pressed', String(sp.viewMode === 'plan2d'));
  }
  if (btnOrbit3d) {
    btnOrbit3d.classList.toggle('active', sp.viewMode === 'orbit3d');
    btnOrbit3d.setAttribute('aria-pressed', String(sp.viewMode === 'orbit3d'));
  }

  const presetSel = document.getElementById('sel-sp-preset');
  if (presetSel && STAGE_PLAN_PRESETS[sp.presetId]) {
    presetSel.value = sp.presetId;
  }

  const setNumIfIdle = (id, val, dec = 2) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) {
      el.value = Number(val).toFixed(dec).replace(/\.00$/, '.0');
    }
  };
  setNumIfIdle('inp-sp-screen-w', v.screenWidthM, 2);
  setNumIfIdle('inp-sp-screen-h', v.screenHeightM, 2);
  setNumIfIdle('inp-sp-screen-trim', v.screenBottomM, 2);
  setNumIfIdle('inp-sp-room-w', v.roomWidthM, 1);
  setNumIfIdle('inp-sp-room-d', v.roomDepthM, 1);

  setSliderValue(document.getElementById('ctrl-sp-uniformity'), sp.uniformity);
  const unifEl = document.getElementById('val-sp-uniformity');
  if (unifEl) unifEl.textContent = `${Math.round(sp.uniformity * 100)}%`;

  setSliderValue(document.getElementById('ctrl-sp-feather'), sp.featherPct);
  const fthEl = document.getElementById('val-sp-feather');
  if (fthEl) fthEl.textContent = `${Math.round(sp.featherPct * 100)}%`;

  const chkShadow = document.getElementById('chk-sp-shadow');
  if (chkShadow) chkShadow.checked = !!sp.shadowComp;

  const selProjEl = document.getElementById('sel-sp-proj');
  if (selProjEl) {
    selProjEl.innerHTML = '';
    for (const scr of mp.screens) {
      const opt = document.createElement('option');
      opt.value = String(scr.index);
      opt.textContent = `P${scr.index}: ${scr.name} (${scr.lumens || 8500} lm)`;
      selProjEl.appendChild(opt);
    }
    selProjEl.value = String(mp.selectedScreenIndex || 1);
  }

  const selScr = getSelectedProjectorScreen();
  if (selScr) {
    ensureScreenPhysicalPose(selScr, selScr.index, mp.screens.length, v);
    const pName = document.getElementById('inp-sp-proj-name');
    if (pName && document.activeElement !== pName) pName.value = selScr.name;

    setSliderValue(document.getElementById('ctrl-sp-posx'), selScr.posM[0]);
    const pxEl = document.getElementById('val-sp-posx');
    if (pxEl) pxEl.textContent = `${selScr.posM[0] >= 0 ? '+' : ''}${selScr.posM[0].toFixed(2)}m`;

    setSliderValue(document.getElementById('ctrl-sp-posy'), selScr.posM[1]);
    const pyEl = document.getElementById('val-sp-posy');
    if (pyEl) pyEl.textContent = `${selScr.posM[1].toFixed(2)}m`;

    setSliderValue(document.getElementById('ctrl-sp-posz'), selScr.posM[2]);
    const pzEl = document.getElementById('val-sp-posz');
    if (pzEl) pzEl.textContent = `${selScr.posM[2] >= 0 ? '+' : ''}${selScr.posM[2].toFixed(2)}m`;

    setSliderValue(document.getElementById('ctrl-sp-aimx'), selScr.aimM[0]);
    const axEl = document.getElementById('val-sp-aimx');
    if (axEl) axEl.textContent = `${selScr.aimM[0] >= 0 ? '+' : ''}${selScr.aimM[0].toFixed(2)}m`;

    setSliderValue(document.getElementById('ctrl-sp-aimy'), selScr.aimM[1]);
    const ayEl = document.getElementById('val-sp-aimy');
    if (ayEl) ayEl.textContent = `${selScr.aimM[1].toFixed(2)}m`;

    setSliderValue(document.getElementById('ctrl-sp-throw'), selScr.throwRatio);
    const trEl = document.getElementById('val-sp-throw');
    if (trEl) trEl.textContent = `${selScr.throwRatio.toFixed(2)}:1`;

    setSliderValue(document.getElementById('ctrl-sp-shiftx'), selScr.lensShiftX);
    const sxEl = document.getElementById('val-sp-shiftx');
    if (sxEl) sxEl.textContent = `${Math.round(selScr.lensShiftX * 100)}%`;

    setSliderValue(document.getElementById('ctrl-sp-shifty'), selScr.lensShiftY);
    const syEl = document.getElementById('val-sp-shifty');
    if (syEl) syEl.textContent = `${Math.round(selScr.lensShiftY * 100)}%`;

    const lumInp = document.getElementById('inp-sp-lumens');
    if (lumInp && document.activeElement !== lumInp) lumInp.value = String(selScr.lumens || 8500);

    const opt = field.opticsByIndex.get(selScr.index);
    const metricsEl = document.getElementById('sp-proj-optics-readout');
    if (metricsEl && opt) {
      metricsEl.textContent =
        `Throw ${opt.throwDistM.toFixed(2)}m • Footprint ${opt.beamWidthM.toFixed(2)}×${opt.beamHeightM.toFixed(2)}m • ` +
        `${opt.pxPerCm.toFixed(1)} px/cm • Angle ${opt.incidenceDeg.toFixed(1)}° • ~${Math.round(opt.avgLux)} lux`;
    }
  }

  const solverReadout = document.getElementById('sp-solver-readout');
  if (solverReadout) {
    const shadowNote = field.shadowCompPixels > 0 ? ` • 3D Shadow Fill (${field.shadowCompPixels} cells)` : '';
    solverReadout.textContent =
      `Coverage ${field.coveragePct.toFixed(0)}% • Cross-Overlap ${field.overlapAreaPct.toFixed(0)}% • ` +
      `Constant Brightness Uniformity ${field.uniformityPct.toFixed(1)}%${shadowNote}`;
  }

  if (typeof syncSliderAriaValuetext === 'function') syncSliderAriaValuetext(dlg);
  if (dlg.open) renderStagePlanCanvas();
}

function buildStagePlan3DMvp(sp, aspect) {
  if (sp.camMode === 'walk' && typeof buildVenueWalkCamera === 'function') return buildVenueWalkCamera(sp, aspect);
  const v = sp.venue;
  const yaw = (sp.orbitYaw * Math.PI) / 180;
  const pitch = clamp((sp.orbitPitch * Math.PI) / 180, -1.35, 1.42);
  const dist = clamp(sp.orbitDist || 13.5, 2.5, 65.0);
  const off = Array.isArray(sp.orbitTargetOffset) ? sp.orbitTargetOffset : [0, 0, 0];
  const target = [
    (Number(off[0]) || 0),
    v.screenBottomM + v.screenHeightM * 0.42 + (Number(off[1]) || 0),
    v.screenZ * 0.25 + (Number(off[2]) || 0)
  ];
  const eye = [
    target[0] + dist * Math.cos(pitch) * Math.sin(yaw),
    target[1] + dist * Math.sin(pitch),
    target[2] + dist * Math.cos(pitch) * Math.cos(yaw)
  ];
  const view = mat4LookAt(eye, target, [0, 1, 0]);
  const proj = mat4ProjectorFrustum(0.92, Math.max(0.4, aspect), 0, 0, 0.2, 140.0);
  const mvp = mat4Multiply(new Float32Array(16), proj, view);
  return { mvp, eye, target, dist };
}

function drawFloorplanPerspective3D(ctx, fp, proj3) {
  if (!fp || !fp.dataUrl || fp.visible === false) return;
  const img = fp._img;
  const wM = Math.max(0.5, Number(fp.widthM) || 12.0);
  const aspect = (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
    ? (img.naturalWidth / img.naturalHeight)
    : 1.5;
  const dM = wM / Math.max(0.1, aspect);
  const rot = ((Number(fp.rotDeg) || 0) * Math.PI) / 180;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const ox = Number(fp.offsetX) || 0, oz = Number(fp.offsetZ) || 0;
  const fpCorner = (u, vNorm) => {
    const lx = (u - 0.5) * wM;
    const lz = (vNorm - 0.5) * dM;
    return [ox + lx * cr - lz * sr, 0.006, oz + lx * sr + lz * cr];
  };

  ctx.save();
  ctx.globalAlpha = clamp(Number(fp.opacity ?? 0.48), 0.05, 1.0);
  if (img && img.complete && img.naturalWidth > 0) {
    // Subdivide into 6x6 perspective-projected affine triangle patches on Y=0 floor
    const N = 6;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const drawTri = (p0, p1, p2, s0, s1, s2) => {
      const denom = s0[0] * (s1[1] - s2[1]) + s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]);
      if (Math.abs(denom) < 1e-4) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.closePath();
      ctx.clip();
      const m11 = (p0[0] * (s1[1] - s2[1]) + p1[0] * (s2[1] - s0[1]) + p2[0] * (s0[1] - s1[1])) / denom;
      const m12 = (p0[1] * (s1[1] - s2[1]) + p1[1] * (s2[1] - s0[1]) + p2[1] * (s0[1] - s1[1])) / denom;
      const m21 = (p0[0] * (s2[0] - s1[0]) + p1[0] * (s0[0] - s2[0]) + p2[0] * (s1[0] - s0[0])) / denom;
      const m22 = (p0[1] * (s2[0] - s1[0]) + p1[1] * (s0[0] - s2[0]) + p2[1] * (s1[0] - s0[0])) / denom;
      const dx = (p0[0] * (s1[0] * s2[1] - s2[0] * s1[1]) + p1[0] * (s2[0] * s0[1] - s0[0] * s2[1]) + p2[0] * (s0[0] * s1[1] - s1[0] * s0[1])) / denom;
      const dy = (p0[1] * (s1[0] * s2[1] - s2[0] * s1[1]) + p1[1] * (s2[0] * s0[1] - s0[0] * s2[1]) + p2[1] * (s0[0] * s1[1] - s1[0] * s0[1])) / denom;
      ctx.transform(m11, m12, m21, m22, dx, dy);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    };
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        const u0 = gx / N, u1 = (gx + 1) / N;
        const v0 = gy / N, v1 = (gy + 1) / N;
        const p00 = proj3(fpCorner(u0, v0));
        const p10 = proj3(fpCorner(u1, v0));
        const p11 = proj3(fpCorner(u1, v1));
        const p01 = proj3(fpCorner(u0, v1));
        if (!p00 || !p10 || !p11 || !p01) continue;
        drawTri(p00, p10, p11, [u0 * iw, v0 * ih], [u1 * iw, v0 * ih], [u1 * iw, v1 * ih]);
        drawTri(p00, p11, p01, [u0 * iw, v0 * ih], [u1 * iw, v1 * ih], [u0 * iw, v1 * ih]);
      }
    }
  }
  const cPts = [fpCorner(0, 0), fpCorner(1, 0), fpCorner(1, 1), fpCorner(0, 1)].map(proj3);
  if (cPts.every(Boolean)) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = state.rigSelectedKind === 'floorplan' ? '#ffcb7d' : 'rgba(111, 211, 255, 0.55)';
    ctx.lineWidth = state.rigSelectedKind === 'floorplan' ? 2.0 : 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    cPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

// Compute a 2D plan view (zoom relative to room-fit, pan in meters) that frames
// the room, every physical screen, every projector body + aim point and the floorplan.
function computeStagePlanFitView(sp, cssW, mapH) {
  const v = sp.venue;
  const pad = 26;
  const xs = [-v.roomWidthM / 2, v.roomWidthM / 2];
  const zs = [-v.roomDepthM / 2, v.roomDepthM / 2];
  for (const ws of (state.worldScreens || [])) {
    if (!ws) continue;
    try {
      for (const c of getWorldScreenBasis(ws).corners) { xs.push(c[0]); zs.push(c[2]); }
    } catch (_) {}
  }
  // Set & venue parts (facades, walls, platforms…) are part of "everything".
  if (typeof collectVenuePartLayoutBoxes === 'function') {
    for (const b of collectVenuePartLayoutBoxes()) { xs.push(b.min[0], b.max[0]); zs.push(b.min[2], b.max[2]); }
  }
  for (const s of (state.multiProjector?.screens || [])) {
    if (Array.isArray(s.posM)) { xs.push(s.posM[0]); zs.push(s.posM[2]); }
  }
  const fp = state.floorplan;
  if (fp && fp.dataUrl && fp.visible !== false) {
    const hw = (fp.widthM || 10) / 2;
    xs.push((fp.offsetX || 0) - hw, (fp.offsetX || 0) + hw);
    zs.push((fp.offsetZ || 0) - hw * 0.7, (fp.offsetZ || 0) + hw * 0.7);
  }
  const finite = a => a.filter(Number.isFinite);
  const fx = finite(xs), fz = finite(zs);
  const minX = Math.min(...fx) - 0.6, maxX = Math.max(...fx) + 0.6;
  const minZ = Math.min(...fz) - 0.6, maxZ = Math.max(...fz) + 0.8; // extra room for labels under projectors
  const baseScale = Math.min((cssW - pad * 2) / v.roomWidthM, (mapH - pad * 2) / v.roomDepthM);
  const fitScale = Math.min((cssW - pad * 2) / Math.max(0.5, maxX - minX), (mapH - pad * 2) / Math.max(0.5, maxZ - minZ));
  const zoom = clamp(fitScale / Math.max(1e-6, baseScale), 0.15, 1.0); // never auto-zoom in past room-fit
  const scale = baseScale * zoom;
  // cx = W/2 - panX*scale must place the bounds' center at the canvas center (z anchored at 0.48·H).
  const panX = (minX + maxX) / 2;
  const panZ = (minZ + maxZ) / 2 - (mapH * 0.5 - mapH * 0.48) / scale;
  return { zoom, panX, panZ };
}

function fitStagePlanView() {
  const sp = ensureStagePlanState();
  if (!sp) return;
  sp.planView = null; // recomputed (framing all content) on next render
  if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
}

function renderStagePlanCanvas(targetCanvas = null) {
  if (typeof document === 'undefined') return;
  const cvs = targetCanvas || document.getElementById('stageplan-canvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  if (!ctx) return;

  const rect = cvs.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = Math.max(320, Math.round(rect.width || 620));
  const cssH = Math.max(240, Math.round(rect.height || 330));
  if (cvs.width !== Math.round(cssW * dpr) || cvs.height !== Math.round(cssH * dpr)) {
    cvs.width = Math.round(cssW * dpr);
    cvs.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const mp = ensureMultiProjectorState();
  const sp = ensureStagePlanState(mp);
  const v = sp.venue;
  const field = solveStagePlanOpticalField(mp);
  const worldScreens = Array.isArray(state.worldScreens) ? state.worldScreens : null;
  const fp = state.floorplan;

  // Studio blueprint background (transparent over the GPU venue previz in the rig's 3D view)
  const glUnderlay = sp.viewMode === 'orbit3d' && cvs.id === 'rig-canvas' && !state.ecoMode
    && typeof initVenuePrevizGL === 'function' && !(_pz && _pz.ok === false);
  if (glUnderlay) {
    ctx.clearRect(0, 0, cssW, cssH);
  } else {
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, cssW, cssH);
  }

  const heatH = sp.showHeatmap ? 34 : 0;
  const mapH = cssH - heatH;

  if (sp.viewMode === 'plan2d') {
    const pad = 26;
    const baseScale = Math.min((cssW - pad * 2) / v.roomWidthM, (mapH - pad * 2) / v.roomDepthM);
    // User view (wheel-zoom at cursor, drag-pan, Fit) layered over the room-fit base scale.
    // First render auto-frames all content so nothing starts off-canvas.
    if (!sp.planView || !Number.isFinite(sp.planView.zoom)) {
      sp.planView = computeStagePlanFitView(sp, cssW, mapH);
    }
    const pv = sp.planView;
    const scale = baseScale * clamp(pv.zoom, 0.15, 12);
    const cx = cssW * 0.5 - (Number(pv.panX) || 0) * scale;
    const cz = mapH * 0.48 - (Number(pv.panZ) || 0) * scale;
    const worldToPlan = (wx, wz) => [cx + wx * scale, cz + wz * scale];
    cvs._planTransform = { mode: 'plan2d', cx, cz, scale, mapH, baseScale, cssW };
    cvs._planHandles = [];

    // 1-meter venue floor grid
    const halfW = v.roomWidthM * 0.5;
    const halfD = v.roomDepthM * 0.5;
    const [rx0, rz0] = worldToPlan(-halfW, -halfD);
    const [rx1, rz1] = worldToPlan(halfW, halfD);
    ctx.fillStyle = 'rgba(13, 21, 36, 0.72)';
    ctx.fillRect(rx0, rz0, rx1 - rx0, rz1 - rz0);

    // Architectural Floorplan Underlay in 2D Plan
    if (fp && fp.dataUrl && fp.visible !== false) {
      const [fpx, fpz] = worldToPlan(fp.offsetX || 0, fp.offsetZ || 0);
      const wPx = Math.max(16, (fp.widthM || 12) * scale);
      const img = fp._img;
      const asp = (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
        ? (img.naturalWidth / img.naturalHeight)
        : 1.5;
      const hPx = wPx / Math.max(0.1, asp);
      ctx.save();
      ctx.translate(fpx, fpz);
      ctx.rotate(((fp.rotDeg || 0) * Math.PI) / 180);
      ctx.globalAlpha = clamp(fp.opacity ?? 0.48, 0.05, 1.0);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -wPx * 0.5, -hPx * 0.5, wPx, hPx);
      } else {
        ctx.fillStyle = 'rgba(111, 211, 255, 0.14)';
        ctx.fillRect(-wPx * 0.5, -hPx * 0.5, wPx, hPx);
      }
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = state.rigSelectedKind === 'floorplan' ? '#ffcb7d' : 'rgba(111, 211, 255, 0.55)';
      ctx.lineWidth = state.rigSelectedKind === 'floorplan' ? 1.8 : 1.0;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(-wPx * 0.5, -hPx * 0.5, wPx, hPx);
      ctx.restore();
      if (!fp.locked) {
        cvs._planHandles.push({ kind: 'floorplan-move', px: fpx, py: fpz, r: 14 });
      }
    }

    ctx.strokeStyle = 'rgba(111, 211, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let xm = -Math.floor(halfW); xm <= Math.floor(halfW); xm++) {
      const [gx] = worldToPlan(xm, 0);
      ctx.moveTo(gx, rz0); ctx.lineTo(gx, rz1);
    }
    for (let zm = -Math.floor(halfD); zm <= Math.floor(halfD); zm++) {
      const [, gz] = worldToPlan(0, zm);
      ctx.moveTo(rx0, gz); ctx.lineTo(rx1, gz);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(111, 211, 255, 0.28)';
    ctx.strokeRect(rx0, rz0, rx1 - rx0, rz1 - rz0);

    // Venue architecture: stage deck(s), proscenium arch and room walls
    const lay2 = typeof getVenueLayout === 'function' ? getVenueLayout() : null;
    if (lay2) {
      for (const bx of lay2.boxes) {
        if (bx.obb) {
          const o = bx.obb;
          const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => worldToPlan(o.c[0] + o.ax[0] * a + o.az[0] * b, o.c[2] + o.ax[2] * a + o.az[2] * b));
          const selPart = state.rigSelectedKind === 'venue_part' && state.selectedVenuePartId === bx.partId;
          ctx.fillStyle = bx.kind === 'deck' ? 'rgba(255, 203, 125, 0.12)' : 'rgba(200, 210, 230, 0.20)';
          ctx.strokeStyle = selPart ? '#34e89e' : (bx.kind === 'deck' ? 'rgba(255, 203, 125, 0.75)' : 'rgba(200, 210, 230, 0.75)');
          ctx.lineWidth = selPart ? 2.2 : 1.2;
          ctx.beginPath();
          corners.forEach((c, i) => (i ? ctx.lineTo(c[0], c[1]) : ctx.moveTo(c[0], c[1])));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          if (bx.id.endsWith(':0')) {
            const part = typeof getVenuePartById === 'function' ? getVenuePartById(bx.partId) : null;
            const [lx, lz] = worldToPlan(part ? part.posM[0] : o.c[0], part ? part.posM[2] : o.c[2]);
            if (part) {
              ctx.fillStyle = selPart ? '#34e89e' : 'rgba(220, 228, 240, 0.85)';
              ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
              ctx.textAlign = 'center';
              ctx.fillText(`${part.name} ↑${(part.posM[1] + part.sizeM[1]).toFixed(2)}m`, lx, lz + 3);
              const poly = typeof venuePartOBoxes === 'function'
                ? (() => { const ob = venuePartOBoxes({ ...part, kind: 'block' })[0]; return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => worldToPlan(ob.c[0] + ob.ax[0] * a + ob.az[0] * b, ob.c[2] + ob.ax[2] * a + ob.az[2] * b)); })()
                : corners;
              cvs._planHandles.push({ kind: 'vpart-body2d', id: part.id, px: lx, py: lz, r: 9, poly });
            }
          }
          continue;
        }
        const [bx0, bz0] = worldToPlan(bx.min[0], bx.min[2]);
        const [bx1, bz1] = worldToPlan(bx.max[0], bx.max[2]);
        if (bx.kind === 'deck') {
          ctx.fillStyle = 'rgba(255, 203, 125, 0.07)';
          ctx.strokeStyle = 'rgba(255, 203, 125, 0.5)';
        } else {
          ctx.fillStyle = 'rgba(180, 198, 224, 0.22)';
          ctx.strokeStyle = 'rgba(180, 198, 224, 0.5)';
        }
        ctx.lineWidth = 1.2;
        ctx.fillRect(bx0, bz0, bx1 - bx0, bz1 - bz0);
        ctx.strokeRect(bx0, bz0, bx1 - bx0, bz1 - bz0);
      }
      const deck = lay2.boxes.find(b => b.id === 'deck');
      if (deck) {
        const [lx0, lz0] = worldToPlan(deck.min[0], deck.max[2]);
        ctx.fillStyle = 'rgba(255, 203, 125, 0.75)';
        ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`STAGE DECK +${lay2.deckH.toFixed(2)} m · ${lay2.label}`, lx0 + 4, lz0 - 4);
      }
      if (lay2.room.walls) {
        const [wx0, wz0] = worldToPlan(lay2.room.x0, lay2.room.z0);
        const [wx1, wz1] = worldToPlan(lay2.room.x1, lay2.room.z1);
        ctx.strokeStyle = 'rgba(180, 198, 224, 0.55)';
        ctx.lineWidth = 2.4;
        ctx.strokeRect(wx0, wz0, wx1 - wx0, wz1 - wz0);
      }
    }

    // Centerline X=0
    const [clx] = worldToPlan(0, 0);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.moveTo(clx, rz0); ctx.lineTo(clx, rz1);
    ctx.stroke();
    ctx.restore();

    // Projector optical frustum cones in 2D top-down plan
    mp.screens.forEach((scr, idx) => {
      if (scr.enabled === false) return;
      const col = STAGEPLAN_PROJ_COLORS[idx % STAGEPLAN_PROJ_COLORS.length];
      const isSel = state.rigSelectedKind === 'projector' && scr.index === mp.selectedScreenIndex;
      const opt = field.opticsByIndex.get(scr.index);
      if (!opt) return;

      const [ex, ez] = worldToPlan(opt.eye[0], opt.eye[2]);
      const fpL = opt.footprintWorld[0];
      const fpR = opt.footprintWorld[1];
      const [lx, lz] = worldToPlan(fpL[0], fpL[2]);
      const [rx, rz] = worldToPlan(fpR[0], fpR[2]);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ex, ez);
      ctx.lineTo(lx, lz);
      ctx.lineTo(rx, rz);
      ctx.closePath();
      // Open-air / out-of-range beams read as dotted & unfilled instead of a solid wedge.
      const airPlan = (opt.footprintHitKinds || []).slice(0, 2).every(k => k === 'air');
      const dimPlan = opt.throwDistM > (opt.luxRangeM || Infinity);
      if (!airPlan) {
        ctx.fillStyle = col + (isSel ? '32' : '18');
        ctx.fill();
      }
      ctx.strokeStyle = col + (isSel ? 'dd' : '77');
      ctx.lineWidth = isSel ? 1.8 : 1.1;
      ctx.setLineDash(airPlan ? [1.5, 4] : (dimPlan ? [6, 4] : []));
      ctx.stroke();
      ctx.setLineDash([]);

      // Aim axis dashed line + draggable aim handle
      const [ax, az] = worldToPlan(opt.aim[0], opt.aim[2]);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(ex, ez);
      ctx.lineTo(ax, az);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#090e18';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(ax, az, isSel ? 5.6 : 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      cvs._planHandles.push({ kind: 'proj-aim2d', px: ax, py: az, r: 10, screenIndex: scr.index });

      if (isSel) {
        const mlX = (ex + lx) * 0.5, mlZ = (ez + lz) * 0.5;
        const mrX = (ex + rx) * 0.5, mrZ = (ez + rz) * 0.5;
        for (const [hx, hz, side] of [[mlX, mlZ, -1], [mrX, mrZ, 1]]) {
          ctx.fillStyle = '#070b14';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(hx, hz - 5);
          ctx.lineTo(hx + 5, hz);
          ctx.lineTo(hx, hz + 5);
          ctx.lineTo(hx - 5, hz);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          cvs._planHandles.push({ kind: 'proj-throw', px: hx, py: hz, r: 9, side, screenIndex: scr.index });
        }
        const shX = (lx + rx) * 0.5, shZ = (lz + rz) * 0.5;
        ctx.fillStyle = col;
        ctx.strokeStyle = '#070b14';
        ctx.lineWidth = 1.3;
        ctx.fillRect(shX - 4.5, shZ - 4.5, 9, 9);
        ctx.strokeRect(shX - 4.5, shZ - 4.5, 9, 9);
        cvs._planHandles.push({ kind: 'proj-shift', px: shX, py: shZ, r: 9, screenIndex: scr.index });
      }
      ctx.restore();
    });

    // Physical World Screens in 2D Plan (Selectable, Movable, Rotatable, Resizable, Deletable!)
    const screensToDraw = worldScreens !== null
      ? worldScreens
      : [{ id: 'legacy', name: 'Stage Screen', widthM: v.screenWidthM, heightM: v.screenHeightM, posM: [0, v.screenBottomM + v.screenHeightM * 0.5, v.screenZ], yawDeg: 0, pitchDeg: 0, enabled: true }];
    for (const ws of screensToDraw) {
      if (!ws || ws.enabled === false) continue;
      const b = getWorldScreenBasis(ws);
      const [sx0, sz0] = worldToPlan(b.corners[0][0], b.corners[0][2]);
      const [sx1, sz1] = worldToPlan(b.corners[1][0], b.corners[1][2]);
      const mx = (sx0 + sx1) * 0.5, mz = (sz0 + sz1) * 0.5;
      const isSelWs = state.rigSelectedKind === 'world_screen' && state.selectedWorldScreenId === ws.id;

      ctx.save();
      ctx.strokeStyle = isSelWs ? '#34e89e' : '#ffffff';
      ctx.lineWidth = isSelWs ? 5 : 3.8;
      ctx.beginPath();
      ctx.moveTo(sx0, sz0);
      ctx.lineTo(sx1, sz1);
      ctx.stroke();

      // Normal lollipop for rotating screen yaw
      const nxPx = mx + b.nAxis[0] * 18;
      const nzPx = mz + b.nAxis[2] * 18;
      ctx.strokeStyle = isSelWs ? '#ffcb7d' : 'rgba(52, 232, 158, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx, mz);
      ctx.lineTo(nxPx, nzPx);
      ctx.stroke();
      ctx.fillStyle = isSelWs ? '#ffcb7d' : '#34e89e';
      ctx.beginPath();
      ctx.arc(nxPx, nzPx, isSelWs ? 4.8 : 3.4, 0, Math.PI * 2);
      ctx.fill();

      // Width endpoint handles + Center move handle
      if (isSelWs) {
        for (const [epx, epz, side] of [[sx0, sz0, -1], [sx1, sz1, 1]]) {
          ctx.fillStyle = '#070b14';
          ctx.strokeStyle = '#34e89e';
          ctx.lineWidth = 1.6;
          ctx.fillRect(epx - 4.5, epz - 4.5, 9, 9);
          ctx.strokeRect(epx - 4.5, epz - 4.5, 9, 9);
          cvs._planHandles.push({ kind: 'wscreen-width', id: ws.id, side, px: epx, py: epz, r: 9 });
        }
      }
      ctx.fillStyle = isSelWs ? '#34e89e' : '#0b1322';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(mx, mz, isSelWs ? 5.2 : 4.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isSelWs ? '#34e89e' : 'rgba(255,255,255,0.88)';
      ctx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`🖥 ${ws.name} (${ws.widthM.toFixed(1)}×${ws.heightM.toFixed(2)}m)`, mx, mz - 10);
      ctx.restore();

      if (ws.id !== 'legacy') {
        cvs._planHandles.push({ kind: 'wscreen-yaw', id: ws.id, px: nxPx, py: nzPx, r: 9 });
        cvs._planHandles.push({ kind: 'wscreen-move', id: ws.id, px: mx, py: mz, r: 12, segA: [sx0, sz0], segB: [sx1, sz1] });
      }
    }

    // Render DMX LED Fixtures
    const pm = state.pixelMapper;
    if (pm && Array.isArray(pm.fixtures) && pm.fixtures.length > 0) {
      const refZ = screensToDraw[0]?.posM?.[2] ?? v.screenZ;
      const refW = screensToDraw[0]?.widthM ?? v.screenWidthM;
      pm.fixtures.forEach((fix) => {
        if (!fix || fix.enabled === false) return;
        const u0 = fix.type === 'strip' ? (fix.x0 ?? 0.2) : ((fix.cx ?? 0.5) - (fix.width ?? 0.3) * 0.5);
        const u1 = fix.type === 'strip' ? (fix.x1 ?? 0.8) : ((fix.cx ?? 0.5) + (fix.width ?? 0.3) * 0.5);
        const fx0 = (u0 - 0.5) * refW;
        const fx1 = (u1 - 0.5) * refW;
        const [px0, szBase] = worldToPlan(fx0, refZ);
        const [px1] = worldToPlan(fx1, refZ);
        const midX = (px0 + px1) * 0.5;
        const barY = szBase + 9;
        const isSelFix = (state.rigSelectedKind === 'dmx' || state.rigSelectedKind === 'fixture') && pm.selectedFixtureId === fix.id;
        ctx.save();
        ctx.strokeStyle = isSelFix ? '#ffcb7d' : '#34e89e';
        ctx.lineWidth = isSelFix ? 3.2 : 2.2;
        ctx.beginPath();
        ctx.moveTo(px0, barY);
        ctx.lineTo(px1, barY);
        ctx.stroke();
        ctx.fillStyle = isSelFix ? '#ffcb7d' : '#34e89e';
        ctx.beginPath();
        ctx.arc(midX, barY, isSelFix ? 4.5 : 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`💡 ${fix.name} (U${fix.universe})`, midX, barY + 11);
        ctx.restore();
        cvs._planHandles.push({ kind: 'dmx-fixture', px: midX, py: barY, r: 10, x0: Math.min(px0, px1), x1: Math.max(px0, px1), fixtureId: fix.id });
      });
    }

    // 3D Scenic Meshes top-down AABB footprints (clickable & draggable in 2D!)
    for (const occ of field.occluders) {
      if (occ.isProp) continue;
      const [ox0, oz0] = worldToPlan(occ.aabb[0], occ.aabb[2]);
      const [ox1, oz1] = worldToPlan(occ.aabb[3], occ.aabb[5]);
      const isSel3d = state.rigSelectedKind === 'mesh3d' && state.selectedSurfaceId === occ.id;
      ctx.fillStyle = isSel3d ? 'rgba(52, 232, 158, 0.28)' : 'rgba(192, 132, 252, 0.22)';
      ctx.strokeStyle = isSel3d ? '#34e89e' : (occ.accent || '#c084fc');
      ctx.lineWidth = isSel3d ? 2.2 : 1.4;
      const bw = Math.max(10, ox1 - ox0), bh = Math.max(10, oz1 - oz0);
      ctx.fillRect(ox0, oz0, bw, bh);
      ctx.strokeRect(ox0, oz0, bw, bh);
      ctx.fillStyle = '#ebdfff';
      ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`🧊 ${occ.name}`, ox0 + bw * 0.5, oz0 - 4);
      cvs._planHandles.push({ kind: 'mesh3d-plan', surfaceId: occ.id, px: ox0 + bw * 0.5, py: oz0 + bh * 0.5, r: Math.max(12, Math.min(bw, bh) * 0.55) });
    }

    // 3D Performer Followspot Target & Convergent Beams
    const fs = (Array.isArray(state.spots) && state.spots.length > 0) ? state.spots.find(s => s && s.enabled !== false) : null;
    if (fs && (fs.converge3D || fs.mode !== 'off')) {
      const perf = getPerformer3DWorldCenterM(fs, mp);
      const [px, pz] = worldToPlan(perf.x, perf.z);
      const prPx = Math.max(6, perf.radiusM * scale);

      if (fs.converge3D) {
        mp.screens.forEach((scr, idx) => {
          if (scr.enabled === false) return;
          const conv = computeConvergentSpotForProjector(fs, scr.index, mp);
          if (!conv.wallWorldM) return;
          const [ex, ez] = worldToPlan(scr.posM[0], scr.posM[2]);
          const [wx, wz] = worldToPlan(conv.wallWorldM[0], conv.wallWorldM[2]);
          ctx.save();
          ctx.strokeStyle = STAGEPLAN_PROJ_COLORS[idx % STAGEPLAN_PROJ_COLORS.length];
          ctx.setLineDash([2, 2]);
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(ex, ez);
          ctx.lineTo(px, pz);
          ctx.lineTo(wx, wz);
          ctx.stroke();
          ctx.restore();
        });
      }

      ctx.fillStyle = 'rgba(255, 203, 125, 0.25)';
      ctx.strokeStyle = '#ffcb7d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, pz, prPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffcb7d';
      ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`🎯 ${fs.name || 'Spot'}`, px, pz + prPx + 10);
    }

    // People (scale reference) — drag to move, they stand on the deck or floor
    for (const prop of (state.worldProps || [])) {
      if (!prop || prop.enabled === false) continue;
      const isSelProp = state.rigSelectedKind === 'world_prop' && state.selectedWorldPropId === prop.id;
      const [hx, hz] = worldToPlan(prop.posM[0], prop.posM[2]);
      const rPx = Math.max(5, 0.24 * scale);
      ctx.save();
      ctx.fillStyle = isSelProp ? 'rgba(52, 232, 158, 0.35)' : 'rgba(255, 203, 125, 0.28)';
      ctx.strokeStyle = isSelProp ? '#34e89e' : '#ffcb7d';
      ctx.lineWidth = isSelProp ? 2.2 : 1.4;
      ctx.beginPath();
      ctx.ellipse(hx, hz, rPx * 1.25, rPx * 0.8, -((prop.yawDeg || 0) * Math.PI) / 180, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // facing tick
      const yawR = ((prop.yawDeg || 0) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(hx, hz);
      ctx.lineTo(hx + Math.sin(yawR) * rPx * 1.6, hz + Math.cos(yawR) * rPx * 1.6);
      ctx.stroke();
      ctx.fillStyle = isSelProp ? '#34e89e' : '#ffcb7d';
      ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`🧍 ${prop.name} ${(prop.heightM || 1.75).toFixed(2)}m`, hx, hz - rPx - 4);
      ctx.restore();
      cvs._planHandles.push({ kind: 'prop-body2d', id: prop.id, px: hx, py: hz, r: Math.max(11, rPx + 3) });
    }

    // DMX devices: lights show their beam direction & spread on the floor
    (state.dmxDevices || []).forEach((dev, di) => {
      if (!dev) return;
      if (typeof ensureDmxDeviceWorldPose === 'function') ensureDmxDeviceWorldPose(dev, di);
      if (!Array.isArray(dev.posM)) return;
      const isSelDev = state.rigSelectedKind === 'dmx_device' && state.selectedDmxDeviceId === dev.id;
      const [dx2, dz2] = worldToPlan(dev.posM[0], dev.posM[2]);
      const out = typeof getDmxLightOutput === 'function' ? getDmxLightOutput(dev) : null;
      ctx.save();
      if (out) {
        const hit = raycastWorldForProjector(dev.posM, out.dir, field.occluders, 8);
        const [hx2, hz2] = worldToPlan(hit.point[0], hit.point[2]);
        const spreadPx = Math.max(4, Math.tan(((out.beamDeg * 0.5) * Math.PI) / 180) * hit.dist * scale);
        const rgb = out.color.map(c => Math.round(clamp(c, 0, 1) * 255));
        const on = out.intensity > 0.01;
        ctx.strokeStyle = on ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.8)` : 'rgba(180,198,224,0.35)';
        ctx.setLineDash(on ? [] : [3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dx2, dz2);
        ctx.lineTo(hx2, hz2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(hx2, hz2, spreadPx, 0, Math.PI * 2);
        if (on) {
          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.10 + out.intensity * 0.2})`;
          ctx.fill();
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = isSelDev ? '#ffcb7d' : '#0b1322';
      ctx.strokeStyle = isSelDev ? '#ffffff' : '#ffcb7d';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(dx2 - 6, dz2 - 6, 12, 12, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffcb7d';
      ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      const icon = out ? '💡' : (dev.category === 'atmosphere' ? '🌫' : '🔌');
      ctx.fillText(`${icon} ${dev.name} · ${dev.posM[1].toFixed(1)}m`, dx2, dz2 + 17);
      ctx.restore();
      cvs._planHandles.push({ kind: 'dmxdev-body2d', id: dev.id, px: dx2, py: dz2, r: 11 });
    });

    // Draggable Projector Icons P1..PN (labels step aside when projectors are stacked)
    const projLabelRects = [];
    mp.screens.forEach((scr, idx) => {
      const col = STAGEPLAN_PROJ_COLORS[idx % STAGEPLAN_PROJ_COLORS.length];
      const isSel = state.rigSelectedKind === 'projector' && scr.index === mp.selectedScreenIndex;
      const [ex, ez] = worldToPlan(scr.posM[0], scr.posM[2]);

      ctx.save();
      ctx.translate(ex, ez);
      const ang = Math.atan2(scr.aimM[2] - scr.posM[2], scr.aimM[0] - scr.posM[0]);
      ctx.rotate(ang);
      ctx.fillStyle = isSel ? col : '#0b1322';
      ctx.strokeStyle = isSel ? '#ffffff' : col;
      ctx.lineWidth = isSel ? 2.2 : 1.6;
      ctx.beginPath();
      ctx.roundRect(-9, -6.5, 18, 13, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(7, -3.5, 4, 7);
      ctx.restore();

      ctx.fillStyle = isSel ? '#ffffff' : col;
      ctx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      const miss2d = scr.enabled !== false && field?.opticsByIndex?.get(scr.index)?.missesAllTargets;
      const lbl = `P${scr.index} (H:${scr.posM[1].toFixed(1)}m)`;
      const lw = ctx.measureText(lbl).width + 4;
      let ly = ez + 17;
      for (let k = 0; k < 5 && projLabelRects.some(r => Math.abs(r[0] - ex) < (r[2] + lw) / 2 && Math.abs(r[1] - ly) < 11); k++) ly += 12;
      projLabelRects.push([ex, ly, lw]);
      ctx.fillText(lbl, ex, ly);
      if (miss2d) {
        ctx.fillStyle = "#ff6b6b";
        ctx.fillText("⚠ beam hits no screen or object", ex, ly + 12);
      }
      cvs._planHandles.push({ kind: 'proj-body2d', px: ex, py: ez, r: 13, screenIndex: scr.index });
    });

    // Floorplan 2-Point Scale Calibration Overlay
    if (fp && fp.calibMode) {
      ctx.save();
      ctx.fillStyle = 'rgba(8, 22, 38, 0.92)';
      ctx.strokeStyle = '#ffcb7d';
      ctx.lineWidth = 1.4;
      ctx.fillRect(10, 8, Math.min(cssW - 20, 410), 22);
      ctx.strokeRect(10, 8, Math.min(cssW - 20, 410), 22);
      ctx.fillStyle = '#ffcb7d';
      ctx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(fp.calibPts.length === 0
        ? '📏 SCALE RULER: Click Point A on known floorplan wall'
        : '📏 SCALE RULER: Click Point B to enter real distance (m)', 18, 22);
      if (fp.calibPts.length >= 1) {
        const [ax, az] = worldToPlan(fp.calibPts[0][0], fp.calibPts[0][1]);
        ctx.fillStyle = '#ffcb7d';
        ctx.beginPath();
        ctx.arc(ax, az, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(180, 198, 224, 0.68)';
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('2D WORLD BUILDER • Drag Screens, P1..PN, Aim, 3D Props & Floorplan • Backspace deletes selected', 8, mapH - 7);
  } else {
    // 3D EDITABLE WORLD VIEW (Click-Pick + 3D Transform Gizmo + Raycast Frustums + Floorplan)
    // The lit venue itself is rendered by the GPU previz underneath this canvas (05h);
    // this layer draws the editable wireframes, labels, beams and handles on top.
    sp._orthoViewH = mapH;
    const cam = typeof getVenueCamera === 'function' ? getVenueCamera(sp, cssW / Math.max(1, mapH)) : buildStagePlan3DMvp(sp, cssW / Math.max(1, mapH));
    cvs._planTransform = { mode: 'orbit3d', mvp: cam.mvp, eye: cam.eye, target: cam.target, dist: cam.dist, cssW, mapH, walk: !!cam.walk };
    cvs._planHandles = [];
    if (typeof getVenueViewLook === 'function' && getVenueViewLook(sp) === 'lines') drawVenueLinesOverlay(ctx, cam, cssW, mapH, { title: false });
    const proj3 = (pt) => {
      const c = venueClipPoint(pt, cam.mvp);
      if (c[3] < 0.06) return null;
      return [((c[0] / c[3]) * 0.5 + 0.5) * cssW, (1.0 - ((c[1] / c[3]) * 0.5 + 0.5)) * mapH];
    };
    const strokeSeg3 = (a, b) => {
      const seg = venueProjectSegment(a, b, cam.mvp, cssW, mapH);
      if (!seg) return;
      ctx.beginPath();
      ctx.moveTo(seg[0][0], seg[0][1]);
      ctx.lineTo(seg[1][0], seg[1][1]);
      ctx.stroke();
    };
    const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const lay = typeof getVenueLayout === 'function' ? getVenueLayout() : null;

    // Floorplan Underlay projected onto Y = 0 in 3D!
    if (fp && fp.dataUrl && fp.visible !== false) {
      drawFloorplanPerspective3D(ctx, fp, proj3);
      const fpCenter2d = proj3([fp.offsetX || 0, 0.01, fp.offsetZ || 0]);
      if (fpCenter2d && !fp.locked) {
        cvs._planHandles.push({ kind: 'floorplan-pick3d', px: fpCenter2d[0], py: fpCenter2d[1], r: 16 });
      }
    }

    // Floor grid Y = 0 (faint — the lit floor is drawn by the GPU underlay)
    const hw = lay ? Math.max(Math.abs(lay.room.x0), Math.abs(lay.room.x1)) : v.roomWidthM * 0.5;
    const gz0 = lay ? lay.room.z0 : -v.roomDepthM * 0.5;
    const gz1 = lay ? lay.room.z1 : v.roomDepthM * 0.5;
    ctx.strokeStyle = glUnderlay ? 'rgba(111, 211, 255, 0.07)' : 'rgba(111, 211, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let xm = -Math.floor(hw); xm <= Math.floor(hw); xm++) {
      strokeSeg3([xm, 0.002, gz0], [xm, 0.002, gz1]);
    }
    for (let zm = Math.ceil(gz0); zm <= Math.floor(gz1); zm++) {
      strokeSeg3([-hw, 0.002, zm], [hw, 0.002, zm]);
    }

    // Venue outline: stage deck edges (+ room box when there is no GPU underlay)
    if (lay) {
      ctx.strokeStyle = 'rgba(255, 203, 125, 0.45)';
      ctx.lineWidth = 1.2;
      for (const bx of lay.boxes) {
        if (bx.kind !== 'deck') continue;
        const [x0, y0, z0] = bx.min, [x1, y1, z1] = bx.max;
        strokeSeg3([x0, y1, z0], [x1, y1, z0]); strokeSeg3([x1, y1, z0], [x1, y1, z1]);
        strokeSeg3([x1, y1, z1], [x0, y1, z1]); strokeSeg3([x0, y1, z1], [x0, y1, z0]);
        strokeSeg3([x0, y0, z1], [x0, y1, z1]); strokeSeg3([x1, y0, z1], [x1, y1, z1]);
      }
      if (!glUnderlay && lay.room.walls) {
        const r = lay.room;
        ctx.strokeStyle = 'rgba(180, 198, 224, 0.18)';
        for (const [a, b] of [
          [[r.x0, r.y1, r.z0], [r.x1, r.y1, r.z0]], [[r.x0, 0, r.z0], [r.x0, r.y1, r.z0]], [[r.x1, 0, r.z0], [r.x1, r.y1, r.z0]],
          [[r.x0, r.y1, r.z0], [r.x0, r.y1, r.z1]], [[r.x1, r.y1, r.z0], [r.x1, r.y1, r.z1]]
        ]) strokeSeg3(a, b);
      }
    }

    // Physical World Screens rendered as 3D Oriented Quads
    const screens3D = worldScreens !== null
      ? worldScreens
      : [{ id: 'legacy', name: 'Stage Screen', widthM: v.screenWidthM, heightM: v.screenHeightM, posM: [0, v.screenBottomM + v.screenHeightM * 0.5, v.screenZ], yawDeg: 0, pitchDeg: 0, enabled: true }];
    let selectedGizmoPivot = null;
    let selectedGizmoTarget = null;

    for (const ws of screens3D) {
      if (!ws || ws.enabled === false) continue;
      const b = getWorldScreenBasis(ws);
      const scCorners = b.corners.map(proj3);
      const isSelWs = state.rigSelectedKind === 'world_screen' && state.selectedWorldScreenId === ws.id;
      ctx.strokeStyle = isSelWs ? '#34e89e' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = isSelWs ? 2.6 : 1.4;
      for (let k = 0; k < 4; k++) strokeSeg3(b.corners[k], b.corners[(k + 1) % 4]);
      if (scCorners.every(Boolean)) {
        if (!glUnderlay || isSelWs) {
          ctx.fillStyle = isSelWs ? 'rgba(52, 232, 158, 0.14)' : 'rgba(111, 211, 255, 0.10)';
          ctx.beginPath();
          scCorners.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
          ctx.closePath();
          ctx.fill();
        }
        const c2d = proj3(b.center);
        if (c2d) {
          ctx.fillStyle = isSelWs ? '#34e89e' : 'rgba(255,255,255,0.88)';
          ctx.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`🖥 ${ws.name}`, c2d[0], Math.min(scCorners[2][1], scCorners[3][1]) - 6);
          if (ws.id !== 'legacy') {
            cvs._planHandles.push({ kind: 'wscreen-pick3d', id: ws.id, px: c2d[0], py: c2d[1], r: 22, poly: scCorners });
          }
        }
      }
      if (isSelWs && ws.id !== 'legacy') {
        selectedGizmoPivot = [...b.center];
        selectedGizmoTarget = { kind: 'world_screen', id: ws.id };
      }
    }

    // Mapped 2D surfaces & masks as they land on the venue (through their projector)
    if (typeof drawVenueSurfaceOutlines === 'function') {
      drawVenueSurfaceOutlines(ctx, cam.mvp, cssW, mapH, { labels: false, handles: false });
    }

    // DMX LED pixel fixtures rendered in 3D
    const pm3 = state.pixelMapper;
    if (pm3 && Array.isArray(pm3.fixtures) && pm3.fixtures.length > 0) {
      const refZ = screens3D[0]?.posM?.[2] ?? v.screenZ;
      const refW = screens3D[0]?.widthM ?? v.screenWidthM;
      for (const fix of pm3.fixtures) {
        if (!fix || fix.enabled === false) continue;
        const fx0 = ((fix.cx ?? 0.5) - (fix.width ?? 0.3) * 0.5 - 0.5) * refW;
        const fx1 = ((fix.cx ?? 0.5) + (fix.width ?? 0.3) * 0.5 - 0.5) * refW;
        const fy = v.screenBottomM + (1.0 - (fix.cy ?? 0.5)) * v.screenHeightM;
        ctx.strokeStyle = '#34e89e';
        ctx.lineWidth = 2.4;
        strokeSeg3([fx0, fy, refZ + 0.03], [fx1, fy, refZ + 0.03]);
        const fMid = proj3([(fx0 + fx1) * 0.5, fy, refZ + 0.03]);
        if (fMid) {
          cvs._planHandles.push({ kind: 'dmx-fixture', fixtureId: fix.id, px: fMid[0], py: fMid[1], r: 12 });
        }
      }
    }

    // DMX devices (PARs, profiles, moving heads, hazers…) with live beam cones
    (state.dmxDevices || []).forEach((dev, di) => {
      if (!dev) return;
      if (typeof ensureDmxDeviceWorldPose === 'function') ensureDmxDeviceWorldPose(dev, di);
      if (!Array.isArray(dev.posM)) return;
      const isSelDev = state.rigSelectedKind === 'dmx_device' && state.selectedDmxDeviceId === dev.id;
      const out = typeof getDmxLightOutput === 'function' ? getDmxLightOutput(dev) : null;
      if (out) {
        const reach = 7.5;
        const half = ((out.beamDeg * 0.5) * Math.PI) / 180;
        const bs = pzLookBasis(dev.posM, [dev.posM[0] + out.dir[0], dev.posM[1] + out.dir[1], dev.posM[2] + out.dir[2]]);
        const hit = raycastWorldForProjector(dev.posM, out.dir, field.occluders, reach);
        const L = Math.min(hit.dist, reach);
        const rad = Math.tan(half) * L;
        const ring = [];
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          ring.push([0, 1, 2].map(i => dev.posM[i] + out.dir[i] * L + (bs.r[i] * Math.cos(a) + bs.u[i] * Math.sin(a)) * rad));
        }
        const on = out.intensity > 0.01;
        const rgb = out.color.map(c => Math.round(clamp(c, 0, 1) * 255));
        ctx.strokeStyle = on ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${isSelDev ? 0.95 : 0.6})` : 'rgba(180,198,224,0.28)';
        ctx.lineWidth = isSelDev ? 1.6 : 1.0;
        ctx.setLineDash(on ? [] : [3, 4]);
        for (let k = 0; k < 12; k += 3) strokeSeg3(dev.posM, ring[k]);
        for (let k = 0; k < 12; k++) strokeSeg3(ring[k], ring[(k + 1) % 12]);
        ctx.setLineDash([]);
      }
      const pd = proj3(dev.posM);
      if (pd) {
        ctx.fillStyle = isSelDev ? '#ffcb7d' : '#0b1322';
        ctx.strokeStyle = isSelDev ? '#ffffff' : '#ffcb7d';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(pd[0], pd[1], isSelDev ? 6.5 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffcb7d';
        ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        const icon = out ? '💡' : (dev.category === 'atmosphere' ? '🌫' : '🔌');
        ctx.fillText(`${icon} ${dev.name}`, pd[0], pd[1] - 10);
        cvs._planHandles.push({ kind: 'dmxdev-pick3d', id: dev.id, px: pd[0], py: pd[1], r: 13 });
      }
      if (isSelDev) {
        selectedGizmoPivot = [...dev.posM];
        selectedGizmoTarget = { kind: 'dmx_device', id: dev.id };
      }
    });

    // Human figures (scale reference, cast shadows in the previz & solver)
    for (const prop of (state.worldProps || [])) {
      if (!prop || prop.enabled === false) continue;
      const isSelProp = state.rigSelectedKind === 'world_prop' && state.selectedWorldPropId === prop.id;
      const hM = Number(prop.heightM) || 1.75;
      const head = proj3([prop.posM[0], prop.posM[1] + hM + 0.12, prop.posM[2]]);
      const mid = proj3([prop.posM[0], prop.posM[1] + hM * 0.55, prop.posM[2]]);
      if (!glUnderlay || isSelProp) {
        ctx.strokeStyle = isSelProp ? '#34e89e' : 'rgba(255, 203, 125, 0.75)';
        ctx.lineWidth = isSelProp ? 2.2 : 1.4;
        strokeSeg3([prop.posM[0], prop.posM[1], prop.posM[2]], [prop.posM[0], prop.posM[1] + hM, prop.posM[2]]);
      }
      if (head) {
        ctx.fillStyle = isSelProp ? '#34e89e' : '#ffcb7d';
        ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`🧍 ${prop.name}`, head[0], head[1]);
      }
      if (mid) cvs._planHandles.push({ kind: 'prop-pick3d', id: prop.id, px: mid[0], py: mid[1], r: 16 });
      if (isSelProp) {
        selectedGizmoPivot = [prop.posM[0], prop.posM[1] + 0.02, prop.posM[2]];
        selectedGizmoTarget = { kind: 'world_prop', id: prop.id };
      }
    }

    // 3D Scenic Meshes AABB wireframes + 3D Pick Handles
    for (const occ of field.occluders) {
      if (occ.isProp) continue;
      const [x0, y0, z0, x1, y1, z1] = occ.aabb;
      const isSel3d = state.rigSelectedKind === 'mesh3d' && state.selectedSurfaceId === occ.id;
      ctx.strokeStyle = isSel3d ? '#34e89e' : (occ.accent || '#c084fc');
      ctx.lineWidth = isSel3d ? 2.2 : 1.0;
      ctx.globalAlpha = glUnderlay && !isSel3d ? 0.45 : 1;
      const boxEdges = [
        [[x0, y0, z0], [x1, y0, z0]], [[x1, y0, z0], [x1, y0, z1]], [[x1, y0, z1], [x0, y0, z1]], [[x0, y0, z1], [x0, y0, z0]],
        [[x0, y1, z0], [x1, y1, z0]], [[x1, y1, z0], [x1, y1, z1]], [[x1, y1, z1], [x0, y1, z1]], [[x0, y1, z1], [x0, y1, z0]],
        [[x0, y0, z0], [x0, y1, z0]], [[x1, y0, z0], [x1, y1, z0]], [[x1, y0, z1], [x1, y1, z1]], [[x0, y0, z1], [x0, y1, z1]]
      ];
      for (const [a, b] of boxEdges) strokeSeg3(a, b);
      ctx.globalAlpha = 1;
      const centerW = [(x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5];
      const pMid = proj3(centerW);
      if (pMid) {
        ctx.fillStyle = isSel3d ? '#34e89e' : '#ebdfff';
        ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`🧊 ${occ.name}`, pMid[0], pMid[1] - 12);
        cvs._planHandles.push({ kind: 'mesh3d-pick3d', surfaceId: occ.id, px: pMid[0], py: pMid[1], r: 22 });
      }
      if (isSel3d) {
        selectedGizmoPivot = centerW;
        selectedGizmoTarget = { kind: 'mesh3d', id: occ.id };
      }
    }

    // 3D spot targets (converged spots): crosshair where every routed projector's spot meets
    for (const s of (state.spots || [])) {
      if (!s || s.enabled === false || !s.converge3D) continue;
      const tgt = getSpotWorldTargetM(s);
      const pt = proj3(tgt);
      if (!pt) continue;
      ctx.strokeStyle = s.mode !== 'off' ? '#ffcb7d' : 'rgba(255,203,125,0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 6, 0, Math.PI * 2);
      ctx.moveTo(pt[0] - 10, pt[1]); ctx.lineTo(pt[0] + 10, pt[1]);
      ctx.moveTo(pt[0], pt[1] - 10); ctx.lineTo(pt[0], pt[1] + 10);
      ctx.stroke();
      ctx.fillStyle = '#ffcb7d';
      ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`🎯 ${s.name || 'Spot'}`, pt[0], pt[1] + 18);
    }

    // Beam segment styling: solid inside focus & brightness range, dashed when out of
    // focus, dotted & fading when too dim to read; open-air rays end in a "no target" tick.
    const strokeBeamRay = (opt, hitPt, hitKind, col, sel) => {
      const total = Math.hypot(hitPt[0] - opt.eye[0], hitPt[1] - opt.eye[1], hitPt[2] - opt.eye[2]);
      if (total < 0.01) return;
      const at = (d) => lerp3(opt.eye, hitPt, clamp(d / total, 0, 1));
      const focusEnd = Math.min(total, opt.focusFarM || total);
      const luxEnd = Math.min(total, opt.luxRangeM || total);
      const solidEnd = Math.min(focusEnd, luxEnd);
      ctx.strokeStyle = col + (sel ? 'ee' : '88');
      ctx.lineWidth = sel ? 1.6 : 1.0;
      ctx.setLineDash([]);
      strokeSeg3(opt.eye, at(solidEnd));
      if (luxEnd > solidEnd + 0.02) {
        ctx.setLineDash([6, 4]);
        strokeSeg3(at(solidEnd), at(luxEnd));
      }
      if (total > luxEnd + 0.02) {
        ctx.setLineDash([1.5, 4]);
        ctx.strokeStyle = col + '55';
        strokeSeg3(at(luxEnd), hitPt);
      }
      ctx.setLineDash([]);
      if (hitKind === 'air') {
        const pe = proj3(hitPt);
        if (pe) {
          ctx.strokeStyle = col + '99';
          ctx.beginPath();
          ctx.arc(pe[0], pe[1], 2.2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };

    // 3D Projector Rigging + Range-Aware Raycast Frustums + Aim Handles
    mp.screens.forEach((scr, idx) => {
      if (scr.enabled === false) return;
      const col = STAGEPLAN_PROJ_COLORS[idx % STAGEPLAN_PROJ_COLORS.length];
      const isSel = state.rigSelectedKind === 'projector' && scr.index === mp.selectedScreenIndex;
      const solo = Number(sp.previzSolo) || 0;
      const opt = field.opticsByIndex.get(scr.index);
      if (!opt) return;

      ctx.save();
      if (solo > 0 && solo !== scr.index && !isSel) ctx.globalAlpha = 0.35;
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      if (!glUnderlay) strokeSeg3([opt.eye[0], 0, opt.eye[2]], opt.eye);
      ctx.strokeStyle = col;
      strokeSeg3(opt.eye, opt.aim);
      ctx.setLineDash([]);

      opt.footprintWorld.forEach((fw, k) => strokeBeamRay(opt, fw, opt.footprintHitKinds?.[k], col, isSel));
      const fp2d = opt.footprintWorld.map(proj3);
      const allAir = (opt.footprintHitKinds || []).every(k => k === 'air');
      const outOfFocus = opt.throwDistM > (opt.focusFarM || Infinity) || opt.throwDistM < (opt.focusNearM || 0);
      if (fp2d.every(Boolean)) {
        ctx.strokeStyle = col + (isSel ? 'ee' : '99');
        ctx.lineWidth = isSel ? 1.8 : 1.1;
        ctx.setLineDash(allAir ? [1.5, 4] : (outOfFocus ? [6, 4] : []));
        if (!glUnderlay && !allAir) {
          ctx.fillStyle = col + (isSel ? '30' : '16');
          ctx.beginPath();
          fp2d.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
          ctx.closePath();
          ctx.fill();
        }
        ctx.beginPath();
        fp2d.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        if (isSel) {
          const cx = fp2d.reduce((a, p) => a + p[0], 0) / 4, cy = fp2d.reduce((a, p) => a + p[1], 0) / 4;
          ctx.fillStyle = col;
          ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.textAlign = 'center';
          const note = allAir ? 'no surface in range' : (opt.throwDistM > opt.luxRangeM ? 'too far · dim' : (outOfFocus ? 'out of focus' : ''));
          ctx.fillText(`${Math.round(opt.avgLux)} lux · ${opt.throwDistM.toFixed(1)} m${note ? ' · ' + note : ''}`, cx, cy);
        }
      }

      // Draggable 3D Aim Lollipop
      const pAim = proj3(opt.aim);
      if (pAim) {
        ctx.fillStyle = '#090e18';
        ctx.strokeStyle = isSel ? '#ffcb7d' : col;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(pAim[0], pAim[1], isSel ? 5.8 : 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        cvs._planHandles.push({ kind: 'proj-aim3d', screenIndex: scr.index, px: pAim[0], py: pAim[1], r: 12 });
      }

      const pe = proj3(opt.eye);
      if (pe) {
        ctx.fillStyle = isSel ? col : '#0b1322';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(pe[0], pe[1], isSel ? 7.2 : 5.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`P${scr.index} (${opt.eye[1].toFixed(2)}m)`, pe[0], pe[1] - 11);
        if (scr.enabled !== false && opt.missesAllTargets) {
          ctx.fillStyle = "#ff6b6b";
          ctx.fillText("⚠ misses screens", pe[0], pe[1] + 18);
        }
        cvs._planHandles.push({ kind: 'proj-pick3d', screenIndex: scr.index, px: pe[0], py: pe[1], r: 14 });
      }
      if (isSel) {
        selectedGizmoPivot = [...opt.eye];
        selectedGizmoTarget = { kind: 'projector', id: scr.index };
      }
      ctx.restore();
    });

    // Interactive 3D Transform Gizmo (Red X, Green Y, Blue Z, Gold Yaw) on Selected Entity!
    if (selectedGizmoPivot && selectedGizmoTarget) {
      const p0 = proj3(selectedGizmoPivot);
      if (p0) {
        const axisLen = clamp((cam.dist || 12) * 0.13, 0.75, 2.5);
        const axes = [
          { axis: 'x', vec: [axisLen, 0, 0], color: '#ff5d78', label: 'X' },
          { axis: 'y', vec: [0, axisLen, 0], color: '#34e89e', label: 'Y' },
          { axis: 'z', vec: [0, 0, axisLen], color: '#52a8ff', label: 'Z' }
        ];
        const gizmoHandles = [];
        ctx.save();
        for (const ax of axes) {
          const tipW = [
            selectedGizmoPivot[0] + ax.vec[0],
            selectedGizmoPivot[1] + ax.vec[1],
            selectedGizmoPivot[2] + ax.vec[2]
          ];
          const pTip = proj3(tipW);
          if (!pTip) continue;
          ctx.strokeStyle = ax.color;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(p0[0], p0[1]);
          ctx.lineTo(pTip[0], pTip[1]);
          ctx.stroke();
          ctx.fillStyle = ax.color;
          ctx.beginPath();
          ctx.arc(pTip[0], pTip[1], 5.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(ax.label, pTip[0], pTip[1] - 8);
          gizmoHandles.push({
            kind: 'gizmo3d-axis',
            axis: ax.axis,
            targetKind: selectedGizmoTarget.kind,
            targetId: selectedGizmoTarget.id,
            origin2d: p0,
            tip2d: pTip,
            axisLen,
            px: pTip[0],
            py: pTip[1],
            r: 13
          });
        }
        // Yaw rotation handle offset diagonally on XZ
        const yawTipW = [selectedGizmoPivot[0] + axisLen * 0.72, selectedGizmoPivot[1], selectedGizmoPivot[2] - axisLen * 0.72];
        const pYaw = proj3(yawTipW);
        if (pYaw) {
          ctx.strokeStyle = '#ffcb7d';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([3, 2]);
          ctx.beginPath();
          ctx.moveTo(p0[0], p0[1]);
          ctx.lineTo(pYaw[0], pYaw[1]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#090e18';
          ctx.strokeStyle = '#ffcb7d';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pYaw[0], pYaw[1], 6.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffcb7d';
          ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillText('↻Yaw', pYaw[0], pYaw[1] - 9);
          gizmoHandles.push({
            kind: 'gizmo3d-axis',
            axis: 'yaw',
            targetKind: selectedGizmoTarget.kind,
            targetId: selectedGizmoTarget.id,
            origin2d: p0,
            tip2d: pYaw,
            axisLen,
            px: pYaw[0],
            py: pYaw[1],
            r: 13
          });
        }
        ctx.restore();
        // Prepend gizmo handles so they always win hit-testing over underlying object centers!
        cvs._planHandles = [...gizmoHandles, ...cvs._planHandles];
      }
    }

    ctx.fillStyle = 'rgba(180, 198, 224, 0.72)';
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    if (typeof drawProjectorAlignOverlay === 'function') drawProjectorAlignOverlay(ctx, cam.mvp, cssW, mapH);
    if (cam.ortho) {
      // True-scale ruler for orthographic views.
      const mpp = (2 * cam.orthoHalfH) / Math.max(1, mapH);
      const nice = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50].find(m => m / mpp >= 60) || 100;
      const len = nice / mpp, bx = cssW - len - 14, by = mapH - 22;
      ctx.strokeStyle = 'rgba(255, 233, 180, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + len, by); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4); ctx.moveTo(bx + len, by - 4); ctx.lineTo(bx + len, by + 4); ctx.stroke();
      ctx.fillStyle = 'rgba(255, 233, 180, 0.95)';
      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${nice} m`, bx + len / 2, by - 7);
      ctx.textAlign = 'left';
      ctx.fillText(`${(VENUE_ORTHO_VIEWS[cam.ortho]?.label || '').toUpperCase()} VIEW · orthographic · true scale`, 8, mapH - 22);
      ctx.fillStyle = 'rgba(180, 198, 224, 0.72)';
      ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    }
    ctx.fillText(cam.ortho
      ? 'ORTHO • click + drag an object to move it in this plane (Shift = 5 cm snap · Alt = fine · ⌘ = move aim too) • drag empty = pan • scroll = zoom'
      : cam.walk
      ? 'WALK • WASD/arrows move · drag look · Q/E down/up · Shift run · click object → gizmo'
      : '3D WORLD • Click object → drag XYZ/↻Yaw gizmo • drag empty = orbit • Shift+drag = pan • scroll = zoom • dbl-click floor = walk there', 8, mapH - 7);
  }

  // Constant-Brightness Lux Profile Strip along bottom of canvas
  if (sp.showHeatmap && heatH > 0) {
    const y0 = mapH;
    ctx.fillStyle = '#080d18';
    ctx.fillRect(0, y0, cssW, heatH);
    ctx.strokeStyle = 'rgba(111, 211, 255, 0.22)';
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(cssW, y0);
    ctx.stroke();

    const maxScale = Math.max(10, field.peakRawLux * 1.08);
    // Dashed amber curve = Uncompensated raw lux (shows hotspot / 1/d^2 ramp)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 203, 125, 0.68)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < field.width; i++) {
      const x = (i / (field.width - 1)) * (cssW - 16) + 8;
      const yn = clamp(field.rawMidProfile[i] / maxScale, 0, 1);
      const y = y0 + heatH - 5 - yn * (heatH - 13);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Solid emerald curve = Constant-Brightness Solver output lux (flat across overlaps & shadows!)
    ctx.strokeStyle = '#34e89e';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let i = 0; i < field.width; i++) {
      const x = (i / (field.width - 1)) * (cssW - 16) + 8;
      const yn = clamp(field.solvedMidProfile[i] / maxScale, 0, 1);
      const y = y0 + heatH - 5 - yn * (heatH - 13);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#34e89e';
    ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(
      cssW < 480
        ? `━━ Const-Lux (${field.uniformityPct.toFixed(1)}% flat)`
        : `━━ Constant-Brightness Output (${field.uniformityPct.toFixed(1)}% flat)`,
      10,
      y0 + 10
    );
    ctx.fillStyle = '#ffcb7d';
    ctx.textAlign = 'right';
    ctx.fillText(cssW < 480 ? '╌╌ Raw Overlap Lux' : '╌╌ Raw Uncompensated Overlap Lux', cssW - 10, y0 + 10);
  }
}

function initStagePlanDialogControls() {
  if (typeof document === 'undefined') return;
  const dlg = document.getElementById('stageplan-dialog');
  const cvs = document.getElementById('stageplan-canvas');
  if (!dlg || !cvs) return;

  const commitChange = () => {
    const mp = ensureMultiProjectorState();
    solveStagePlanOpticalField(mp, true);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncStagePlanDialogUI();
    if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
  };

  document.getElementById('chk-sp-enable')?.addEventListener('change', (e) => {
    pushUndoCheckpoint('Toggle Stage Plan Solver');
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    sp.enabled = !!e.target.checked;
    if (sp.enabled) {
      mp.enabled = true;
      mp.screens.forEach(s => { s.cropX = 0; s.cropY = 0; s.cropW = 1; s.cropH = 1; s.blendL = 0; s.blendR = 0; s.blendT = 0; s.blendB = 0; });
    }
    commitChange();
  });

  document.getElementById('btn-sp-view-2d')?.addEventListener('click', () => {
    ensureStagePlanState().viewMode = 'plan2d';
    syncStagePlanDialogUI();
  });
  document.getElementById('btn-sp-view-3d')?.addEventListener('click', () => {
    ensureStagePlanState().viewMode = 'orbit3d';
    syncStagePlanDialogUI();
  });

  document.getElementById('btn-sp-apply-preset')?.addEventListener('click', () => {
    const presetId = document.getElementById('sel-sp-preset')?.value || 'opposing_wings_constant';
    pushUndoCheckpoint(`Stage Plan Preset: ${presetId}`);
    applyStagePlanPreset(presetId, true);
    showToast(`Applied Stage Plan Rig: ${STAGE_PLAN_PRESETS[presetId]?.label || presetId}`);
  });

  const bindVenueNum = (id, key, minV, maxV) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const sp = ensureStagePlanState();
      sp.venue[key] = clamp(parseFloat(el.value) || sp.venue[key], minV, maxV);
      commitChange();
    });
  };
  bindVenueNum('inp-sp-screen-w', 'screenWidthM', 0.5, 40);
  bindVenueNum('inp-sp-screen-h', 'screenHeightM', 0.4, 25);
  bindVenueNum('inp-sp-screen-trim', 'screenBottomM', 0.0, 15);
  bindVenueNum('inp-sp-room-w', 'roomWidthM', 2.0, 50);
  bindVenueNum('inp-sp-room-d', 'roomDepthM', 2.0, 50);

  document.getElementById('ctrl-sp-uniformity')?.addEventListener('input', (e) => {
    ensureStagePlanState().uniformity = clamp(parseFloat(e.target.value) || 0, 0, 1);
    commitChange();
  });
  document.getElementById('ctrl-sp-feather')?.addEventListener('input', (e) => {
    ensureStagePlanState().featherPct = clamp(parseFloat(e.target.value) || 0.12, 0.01, 0.48);
    commitChange();
  });
  document.getElementById('chk-sp-shadow')?.addEventListener('change', (e) => {
    ensureStagePlanState().shadowComp = !!e.target.checked;
    commitChange();
  });

  document.getElementById('sel-sp-proj')?.addEventListener('change', (e) => {
    const mp = ensureMultiProjectorState();
    mp.selectedScreenIndex = clamp(parseInt(e.target.value, 10) || 1, 1, mp.screens.length);
    syncStagePlanDialogUI();
    if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  });

  document.getElementById('btn-sp-add-proj')?.addEventListener('click', () => {
    pushUndoCheckpoint('Add Stage Plan Projector');
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    const created = addCustomProjectorScreen({
      cropX: 0, cropY: 0, cropW: 1, cropH: 1,
      posM: [(mp.screens.length % 2 === 0 ? -2.2 : 2.2), sp.venue.screenBottomM + sp.venue.screenHeightM * 0.55, 2.8],
      aimM: [0, sp.venue.screenBottomM + sp.venue.screenHeightM * 0.5, sp.venue.screenZ],
      throwRatio: 1.0,
      lumens: 8500
    });
    if (created) {
      sp.enabled = true;
      commitChange();
    }
  });

  document.getElementById('btn-sp-del-proj')?.addEventListener('click', () => {
    pushUndoCheckpoint('Remove Stage Plan Projector');
    if (removeProjectorScreen()) commitChange();
  });

  document.getElementById('inp-sp-proj-name')?.addEventListener('change', (e) => {
    const scr = getSelectedProjectorScreen();
    if (!scr) return;
    scr.name = e.target.value.trim() || scr.name;
    commitChange();
  });

  const bindProjSlider = (id, setter) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const scr = getSelectedProjectorScreen();
      if (!scr) return;
      ensureScreenPhysicalPose(scr, scr.index, state.multiProjector.screens.length, ensureStagePlanState().venue);
      setter(scr, parseFloat(el.value));
      commitChange();
    });
  };
  bindProjSlider('ctrl-sp-posx', (s, v) => { s.posM[0] = v; });
  bindProjSlider('ctrl-sp-posy', (s, v) => { s.posM[1] = v; });
  bindProjSlider('ctrl-sp-posz', (s, v) => { s.posM[2] = v; });
  bindProjSlider('ctrl-sp-aimx', (s, v) => { s.aimM[0] = v; });
  bindProjSlider('ctrl-sp-aimy', (s, v) => { s.aimM[1] = v; });
  bindProjSlider('ctrl-sp-throw', (s, v) => { s.throwRatio = v; });
  bindProjSlider('ctrl-sp-shiftx', (s, v) => { s.lensShiftX = v; });
  bindProjSlider('ctrl-sp-shifty', (s, v) => { s.lensShiftY = v; });

  document.getElementById('inp-sp-lumens')?.addEventListener('change', (e) => {
    const scr = getSelectedProjectorScreen();
    if (!scr) return;
    scr.lumens = clamp(Math.round(parseFloat(e.target.value) || 8500), 500, 60000);
    commitChange();
  });

  document.getElementById('btn-sp-preview-sel')?.addEventListener('click', () => {
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    mp.enabled = true;
    sp.enabled = true;
    mp.previewScreenIndex = mp.previewScreenIndex === mp.selectedScreenIndex ? 0 : mp.selectedScreenIndex;
    commitChange();
    showToast(mp.previewScreenIndex > 0
      ? `Monitoring Physical Output of P${mp.previewScreenIndex} on Stage`
      : 'Returned Monitor to Full Canonical Stage');
  });

  document.getElementById('btn-sp-launch-all')?.addEventListener('click', () => {
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    mp.enabled = true;
    sp.enabled = true;
    commitChange();
    dlg.close();
    launchAllProjectorScreens();
  });

  // Pointer interaction on #stageplan-canvas (2D Floor Plan drag P1..PN / Aim / Performer, or 3D Orbit)
  cvs.addEventListener('pointerdown', (e) => {
    const rect = cvs.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    const xf = cvs._planTransform;
    if (!xf || my > xf.mapH) return;

    cvs.setPointerCapture(e.pointerId);

    if (xf.mode === 'orbit3d') {
      stagePlanDragState = { kind: 'orbit3d', startX: mx, startY: my, yaw0: sp.orbitYaw, pitch0: sp.orbitPitch };
      return;
    }

    // Hit-test Projector bodies first
    for (const scr of mp.screens) {
      const px = xf.cx + scr.posM[0] * xf.scale;
      const pz = xf.cz + scr.posM[2] * xf.scale;
      if (Math.hypot(mx - px, my - pz) <= 14) {
        mp.selectedScreenIndex = scr.index;
        stagePlanDragState = {
          kind: e.shiftKey ? 'proj-height' : 'proj-xz',
          screenIndex: scr.index,
          startY: my,
          y0: scr.posM[1]
        };
        syncStagePlanDialogUI();
        return;
      }
    }

    // Hit-test Aim handles
    for (const scr of mp.screens) {
      const ax = xf.cx + scr.aimM[0] * xf.scale;
      const az = xf.cz + scr.aimM[2] * xf.scale;
      if (Math.hypot(mx - ax, my - az) <= 10) {
        mp.selectedScreenIndex = scr.index;
        stagePlanDragState = { kind: 'aim-xz', screenIndex: scr.index };
        syncStagePlanDialogUI();
        return;
      }
    }

    // Hit-test 3D Performer Followspot target
    const fs = state.followspot;
    if (fs && (fs.converge3D || fs.mode !== 'off')) {
      const perf = getPerformer3DWorldCenterM(fs, mp);
      const px = xf.cx + perf.x * xf.scale;
      const pz = xf.cz + perf.z * xf.scale;
      if (Math.hypot(mx - px, my - pz) <= Math.max(12, perf.radiusM * xf.scale + 4)) {
        stagePlanDragState = { kind: 'performer' };
        return;
      }
    }
  });

  cvs.addEventListener('pointermove', (e) => {
    if (!stagePlanDragState) return;
    const rect = cvs.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    const xf = cvs._planTransform;
    if (!xf) return;

    if (stagePlanDragState.kind === 'orbit3d') {
      sp.orbitYaw = stagePlanDragState.yaw0 - (mx - stagePlanDragState.startX) * 0.45;
      sp.orbitPitch = clamp(stagePlanDragState.pitch0 + (my - stagePlanDragState.startY) * 0.35, -75, 85);
      renderStagePlanCanvas();
      return;
    }

    const wx = (mx - xf.cx) / Math.max(1, xf.scale);
    const wz = (my - xf.cz) / Math.max(1, xf.scale);

    if (stagePlanDragState.kind === 'proj-xz') {
      const scr = mp.screens.find(s => s.index === stagePlanDragState.screenIndex);
      if (scr) {
        scr.posM[0] = clamp(Number(wx.toFixed(3)), -sp.venue.roomWidthM * 0.6, sp.venue.roomWidthM * 0.6);
        scr.posM[2] = clamp(Number(wz.toFixed(3)), -sp.venue.roomDepthM * 0.6, sp.venue.roomDepthM * 0.6);
        mp.enabled = true;
        sp.enabled = true;
        commitChange();
      }
    } else if (stagePlanDragState.kind === 'proj-height') {
      const scr = mp.screens.find(s => s.index === stagePlanDragState.screenIndex);
      if (scr) {
        scr.posM[1] = clamp(Number((stagePlanDragState.y0 - (my - stagePlanDragState.startY) * 0.025).toFixed(3)), 0.1, sp.venue.roomHeightM);
        commitChange();
      }
    } else if (stagePlanDragState.kind === 'aim-xz') {
      const scr = mp.screens.find(s => s.index === stagePlanDragState.screenIndex);
      if (scr) {
        scr.aimM[0] = clamp(Number(wx.toFixed(3)), -sp.venue.roomWidthM * 0.6, sp.venue.roomWidthM * 0.6);
        scr.aimM[2] = clamp(Number(wz.toFixed(3)), -sp.venue.roomDepthM * 0.6, sp.venue.roomDepthM * 0.6);
        commitChange();
      }
    } else if (stagePlanDragState.kind === 'performer') {
      const fs = state.followspot;
      const u = clamp(0.5 + wx / Math.max(0.1, sp.venue.screenWidthM), 0, 1);
      const signZ = (mp.screens[0]?.posM?.[2] ?? 2.5) >= sp.venue.screenZ ? 1.0 : -1.0;
      const depth = clamp((wz - sp.venue.screenZ) * signZ, 0.0, 6.5);
      fs.spotX = u;
      fs.targetX = u;
      fs.performerDepthM = Number(depth.toFixed(2));
      fs.converge3D = true;
      if (fs.mode === 'off') fs.mode = 'veil';
      if (typeof syncFollowspotInspectorUI === 'function') syncFollowspotInspectorUI();
      commitChange();
    }
  });

  const endDrag = () => { stagePlanDragState = null; };
  cvs.addEventListener('pointerup', endDrag);
  cvs.addEventListener('pointercancel', endDrag);

  cvs.addEventListener('wheel', (e) => {
    const sp = ensureStagePlanState();
    if (sp.viewMode !== 'orbit3d') return;
    e.preventDefault();
    sp.orbitDist = clamp(sp.orbitDist * (e.deltaY > 0 ? 1.08 : 0.92), 3.5, 42.0);
    renderStagePlanCanvas();
  }, { passive: false });
}
