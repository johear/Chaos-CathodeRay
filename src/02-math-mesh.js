// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 02-math-mesh.js — Projective Homography, Curved Spline/Bezier Mesh & Hit-Test
// ============================================================================

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function hexToRgbNorm(hex) {
  const clean = String(hex || '#6fd3ff').replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  if (Number.isNaN(n)) return [0.435, 0.827, 1.0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Compute exact 2D projective homography H mapping unit square [0,1]^2 -> quad [BL, BR, TR, TL]
function computeQuadHomography(pts) {
  const [p0, p1, p2, p3] = pts;
  const x0 = p0[0], y0 = p0[1];
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];

  const dx1 = x1 - x2, dx2 = x3 - x2, sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, sy = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;

  let g = 0, h = 0;
  if (Math.abs(det) > 1e-9) {
    g = (sx * dy2 - dx2 * sy) / det;
    h = (dx1 * sy - sx * dy1) / det;
  }

  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const c = x0;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const f = y0;

  let detH = a * (e - f * h) - b * (d - f * g) + c * (d * h - e * g);
  if (Math.abs(detH) < 1e-9) detH = 1e-9;
  const invDet = 1.0 / detH;

  const m00 = (e - f * h) * invDet;
  const m01 = (c * h - b) * invDet;
  const m02 = (b * f - c * e) * invDet;

  const m10 = (f * g - d) * invDet;
  const m11 = (a - c * g) * invDet;
  const m12 = (c * d - a * f) * invDet;

  const m20 = (d * h - e * g) * invDet;
  const m21 = (b * g - a * h) * invDet;
  const m22 = (a * e - b * d) * invDet;

  const invColMajor = new Float32Array([
    m00, m10, m20,
    m01, m11, m21,
    m02, m12, m22
  ]);

  return { H: [a, b, c, d, e, f, g, h, 1], invColMajor };
}

function evalHomographyForward(H, u, v) {
  const denom = H[6] * u + H[7] * v + 1.0;
  const safe = Math.abs(denom) < 1e-6 ? 1e-6 : denom;
  return [
    (H[0] * u + H[1] * v + H[2]) / safe,
    (H[3] * u + H[4] * v + H[5]) / safe
  ];
}

function evalHomographyInverse(invCol, x, y) {
  const qx = invCol[0] * x + invCol[3] * y + invCol[6];
  const qy = invCol[1] * x + invCol[4] * y + invCol[7];
  const qz = invCol[2] * x + invCol[5] * y + invCol[8];
  if (qz <= 1e-5) return null;
  return [qx / qz, qy / qz];
}

function isQuadStrictlyConvex(pts) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-5) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

function pointInTriangle(px, py, a, b, c) {
  const v0x = b[0] - a[0], v0y = b[1] - a[1];
  const v1x = c[0] - a[0], v1y = c[1] - a[1];
  const v2x = px - a[0], v2y = py - a[1];
  const denom = v0x * v1y - v1x * v0y;
  if (Math.abs(denom) < 1e-8) return false;
  const inv = 1.0 / denom;
  const u = (v2x * v1y - v1x * v2y) * inv;
  const v = (v0x * v2y - v2x * v0y) * inv;
  return u >= 0 && v >= 0 && (u + v) <= 1;
}

function pointInPolygon(px, py, pts) {
  if (!pts || pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegmentSq(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  const t = lenSq > 1e-10 ? clamp((wx * vx + wy * vy) / lenSq, 0, 1) : 0;
  const projX = ax + t * vx;
  const projY = ay + t * vy;
  const dx = px - projX, dy = py - projY;
  return { distSq: dx * dx + dy * dy, t, projX, projY };
}

// ============================================================================
// PHASE 3.2: CURVED CATMULL-ROM SPLINE & TENSOR-PRODUCT BEZIER PATCH WARPING
// ============================================================================

function isCurvedMeshSurface(surf) {
  return surf && surf.type === 'quad' && (surf.quadWarp === 'mesh' || surf.quadWarp === 'bezier');
}

function bumpSurfaceGeom(surf) {
  if (!surf) return;
  surf._meshDirty = true;
  surf._geomRev = (surf._geomRev || 0) + 1;
  if (typeof state !== 'undefined' && state) {
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  }
}

function getMeshOuterCorners(surf) {
  if (surf && Array.isArray(surf.meshPts)) {
    const cols = surf.meshCols || 3;
    const rows = surf.meshRows || 3;
    if (surf.meshPts.length === (cols + 1) * (rows + 1)) {
      return [
        surf.meshPts[0],
        surf.meshPts[cols],
        surf.meshPts[rows * (cols + 1) + cols],
        surf.meshPts[rows * (cols + 1)]
      ];
    }
  }
  return surf.points;
}

function ensureSurfaceMeshValid(surf) {
  const cols = clamp(Math.round(surf.meshCols || 3), 2, 16);
  const rows = clamp(Math.round(surf.meshRows || 3), 2, 16);
  surf.meshCols = cols;
  surf.meshRows = rows;
  const expected = (cols + 1) * (rows + 1);
  if (!Array.isArray(surf.meshPts) || surf.meshPts.length !== expected) {
    initSurfaceMeshFromCorners(surf);
  }
}

function initSurfaceMeshFromCorners(surf) {
  const cols = clamp(Math.round(surf.meshCols || 3), 2, 16);
  const rows = clamp(Math.round(surf.meshRows || 3), 2, 16);
  surf.meshCols = cols;
  surf.meshRows = rows;

  const hom = isQuadStrictlyConvex(surf.points) ? computeQuadHomography(surf.points) : null;
  const [bl, br, tr, tl] = surf.points;
  const pts = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      if (hom) {
        pts.push(evalHomographyForward(hom.H, u, v));
      } else {
        // Bilinear fallback when non-convex
        const bx = bl[0] + (br[0] - bl[0]) * u;
        const by = bl[1] + (br[1] - bl[1]) * u;
        const tx = tl[0] + (tr[0] - tl[0]) * u;
        const ty = tl[1] + (tr[1] - tl[1]) * u;
        pts.push([bx + (tx - bx) * v, by + (ty - by) * v]);
      }
    }
  }
  surf.meshPts = pts;
  bumpSurfaceGeom(surf);
}

function syncCornersFromMesh(surf) {
  if (!surf || !Array.isArray(surf.meshPts)) return;
  const cols = surf.meshCols || 3;
  const rows = surf.meshRows || 3;
  if (surf.meshPts.length !== (cols + 1) * (rows + 1)) return;
  const bl = surf.meshPts[0];
  const br = surf.meshPts[cols];
  const tr = surf.meshPts[rows * (cols + 1) + cols];
  const tl = surf.meshPts[rows * (cols + 1)];
  surf.points[0] = [bl[0], bl[1]];
  surf.points[1] = [br[0], br[1]];
  surf.points[2] = [tr[0], tr[1]];
  surf.points[3] = [tl[0], tl[1]];
}

// Transport all interior sculpted mesh nodes projectively when dragging an outer corner in Corner-Pin mode
function warpMeshByCornerMove(surf, cornerSlot, newPt, origCorners, origMeshPts) {
  const cols = surf.meshCols || 3;
  const rows = surf.meshRows || 3;
  const stride = cols + 1;
  const nextCorners = origCorners.map((p, idx) => (idx === cornerSlot ? [newPt[0], newPt[1]] : [p[0], p[1]]));

  if (isQuadStrictlyConvex(origCorners) && isQuadStrictlyConvex(nextCorners)) {
    const oldHom = computeQuadHomography(origCorners);
    const newHom = computeQuadHomography(nextCorners);
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const idx = r * stride + c;
        const op = origMeshPts[idx];
        const uvStar = evalHomographyInverse(oldHom.invColMajor, op[0], op[1]);
        if (uvStar) {
          surf.meshPts[idx] = evalHomographyForward(newHom.H, uvStar[0], uvStar[1]);
        } else {
          const u = c / cols, v = r / rows;
          const oldBase = evalHomographyForward(oldHom.H, u, v);
          const newBase = evalHomographyForward(newHom.H, u, v);
          surf.meshPts[idx] = [newBase[0] + (op[0] - oldBase[0]), newBase[1] + (op[1] - oldBase[1])];
        }
      }
    }
  } else {
    // Bilinear corner delta fallback when quad becomes concave
    const cWeights = [
      (u, v) => (1 - u) * (1 - v),
      (u, v) => u * (1 - v),
      (u, v) => u * v,
      (u, v) => (1 - u) * v
    ];
    const dx = newPt[0] - origCorners[cornerSlot][0];
    const dy = newPt[1] - origCorners[cornerSlot][1];
    const wFn = cWeights[cornerSlot];
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const w = wFn(u, v);
        const idx = r * stride + c;
        surf.meshPts[idx] = [origMeshPts[idx][0] + dx * w, origMeshPts[idx][1] + dy * w];
      }
    }
  }
  syncCornersFromMesh(surf);
  bumpSurfaceGeom(surf);
}

// 1D Catmull-Rom cubic basis evaluation
function catmullRom1D(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

// 1D Bernstein polynomial basis B_{i, n}(t)
function bernsteinBasis(n, i, t) {
  let binom = 1;
  for (let k = 1; k <= i; k++) {
    binom = (binom * (n - k + 1)) / k;
  }
  return binom * Math.pow(1 - t, n - i) * Math.pow(t, i);
}

function evalLattice2D(gridPts, cols, rows, uc, vc, isBezier) {
  const stride = cols + 1;
  if (isBezier) {
    let sx = 0, sy = 0;
    const bu = new Array(cols + 1);
    const bv = new Array(rows + 1);
    for (let c = 0; c <= cols; c++) bu[c] = bernsteinBasis(cols, c, uc);
    for (let r = 0; r <= rows; r++) bv[r] = bernsteinBasis(rows, r, vc);

    for (let r = 0; r <= rows; r++) {
      const wy = bv[r];
      const rowOff = r * stride;
      for (let c = 0; c <= cols; c++) {
        const w = wy * bu[c];
        const p = gridPts[rowOff + c];
        sx += p[0] * w;
        sy += p[1] * w;
      }
    }
    return [sx, sy];
  }

  // Smooth 2D Catmull-Rom Spline Grid (interpolates every control node!)
  const gx = uc * cols;
  const gy = vc * rows;
  const ix = Math.min(cols - 1, Math.floor(gx));
  const iy = Math.min(rows - 1, Math.floor(gy));
  const tx = gx - ix;
  const ty = gy - iy;

  const getNode = (c, r) => {
    let cc = c, rr = r;
    let exX = 0, exY = 0;
    if (cc < 0) {
      const p0 = gridPts[clamp(rr, 0, rows) * stride + 0];
      const p1 = gridPts[clamp(rr, 0, rows) * stride + 1];
      exX += p0[0] - p1[0];
      exY += p0[1] - p1[1];
      cc = 0;
    } else if (cc > cols) {
      const pN = gridPts[clamp(rr, 0, rows) * stride + cols];
      const pP = gridPts[clamp(rr, 0, rows) * stride + cols - 1];
      exX += pN[0] - pP[0];
      exY += pN[1] - pP[1];
      cc = cols;
    }
    if (rr < 0) {
      const p0 = gridPts[0 * stride + cc];
      const p1 = gridPts[1 * stride + cc];
      exX += p0[0] - p1[0];
      exY += p0[1] - p1[1];
      rr = 0;
    } else if (rr > rows) {
      const pN = gridPts[rows * stride + cc];
      const pP = gridPts[(rows - 1) * stride + cc];
      exX += pN[0] - pP[0];
      exY += pN[1] - pP[1];
      rr = rows;
    }
    const base = gridPts[rr * stride + cc];
    return [base[0] + exX, base[1] + exY];
  };

  const colValsX = [0, 0, 0, 0];
  const colValsY = [0, 0, 0, 0];
  for (let dy = -1; dy <= 2; dy++) {
    const rIdx = iy + dy;
    const n0 = getNode(ix - 1, rIdx);
    const n1 = getNode(ix, rIdx);
    const n2 = getNode(ix + 1, rIdx);
    const n3 = getNode(ix + 2, rIdx);
    colValsX[dy + 1] = catmullRom1D(n0[0], n1[0], n2[0], n3[0], tx);
    colValsY[dy + 1] = catmullRom1D(n0[1], n1[1], n2[1], n3[1], tx);
  }

  return [
    catmullRom1D(colValsX[0], colValsX[1], colValsX[2], colValsX[3], ty),
    catmullRom1D(colValsY[0], colValsY[1], colValsY[2], colValsY[3], ty)
  ];
}

function getMeshDisplacementGrid(surf) {
  const corners = getMeshOuterCorners(surf);
  if (!isQuadStrictlyConvex(corners)) {
    return { hom: null, deltas: null };
  }
  const hom = computeQuadHomography(corners);
  const cols = surf.meshCols;
  const rows = surf.meshRows;
  const stride = cols + 1;
  const deltas = new Array(surf.meshPts.length);
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const base = evalHomographyForward(hom.H, u, v);
      const pt = surf.meshPts[r * stride + c];
      deltas[r * stride + c] = [pt[0] - base[0], pt[1] - base[1]];
    }
  }
  return { hom, deltas };
}

// Evaluate curved surface position at (u, v) in [0..1]^2 composed with 4-corner Projective Homography
function evalCurvedSurfacePoint(surf, u, v, cachedDecomp = null) {
  ensureSurfaceMeshValid(surf);
  const uc = clamp(u, 0, 1);
  const vc = clamp(v, 0, 1);
  const isBezier = surf.quadWarp === 'bezier';

  const decomp = cachedDecomp || getMeshDisplacementGrid(surf);
  if (decomp.hom && decomp.deltas) {
    const base = evalHomographyForward(decomp.hom.H, uc, vc);
    const disp = evalLattice2D(decomp.deltas, surf.meshCols, surf.meshRows, uc, vc, isBezier);
    return [base[0] + disp[0], base[1] + disp[1]];
  }
  return evalLattice2D(surf.meshPts, surf.meshCols, surf.meshRows, uc, vc, isBezier);
}

function resampleSurfaceMesh(surf, newCols, newRows) {
  const cNew = clamp(Math.round(newCols), 2, 16);
  const rNew = clamp(Math.round(newRows), 2, 16);
  if (!Array.isArray(surf.meshPts) || surf.meshPts.length === 0) {
    surf.meshCols = cNew;
    surf.meshRows = rNew;
    initSurfaceMeshFromCorners(surf);
    return;
  }
  const decomp = getMeshDisplacementGrid(surf);
  const nextPts = [];
  for (let r = 0; r <= rNew; r++) {
    const v = r / rNew;
    for (let c = 0; c <= cNew; c++) {
      const u = c / cNew;
      nextPts.push(evalCurvedSurfacePoint(surf, u, v, decomp));
    }
  }
  surf.meshCols = cNew;
  surf.meshRows = rNew;
  surf.meshPts = nextPts;
  syncCornersFromMesh(surf);
  bumpSurfaceGeom(surf);
}

function applyMeshPreset(surf, preset) {
  if (!surf || surf.type !== 'quad') return;
  if (preset !== 'reset' && surf.quadWarp !== 'mesh' && surf.quadWarp !== 'bezier') {
    surf.quadWarp = 'mesh';
  }
  initSurfaceMeshFromCorners(surf);
  if (preset === 'reset') return;

  const cols = surf.meshCols;
  const rows = surf.meshRows;
  const stride = cols + 1;

  const [bl, br, tr, tl] = surf.points;
  const spanW = Math.hypot(br[0] - bl[0], br[1] - bl[1]) * 0.5 + Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) * 0.5;
  const spanH = Math.hypot(tl[0] - bl[0], tl[1] - bl[1]) * 0.5 + Math.hypot(tr[0] - br[0], tr[1] - br[1]) * 0.5;
  const cx = (bl[0] + br[0] + tr[0] + tl[0]) * 0.25;
  const cy = (bl[1] + br[1] + tr[1] + tl[1]) * 0.25;

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const p = surf.meshPts[r * stride + c];
      if (preset === 'cylh') {
        const arch = 4.0 * u * (1.0 - u);
        p[1] += arch * spanH * 0.22;
      } else if (preset === 'cylv') {
        const bow = 4.0 * v * (1.0 - v);
        p[0] += (u - 0.5) * bow * spanW * 0.34;
        p[1] += bow * (0.5 - Math.abs(u - 0.5)) * spanH * 0.08;
      } else if (preset === 'dome') {
        const dome = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        p[0] += (p[0] - cx) * dome * 0.32;
        p[1] += (p[1] - cy) * dome * 0.28 + dome * spanH * 0.14;
      } else if (preset === 'pin') {
        const pull = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        p[0] -= (p[0] - cx) * pull * 0.36;
        p[1] -= (p[1] - cy) * pull * 0.36;
      } else if (preset === 'wave') {
        p[1] += Math.sin(u * Math.PI * 2.0) * spanH * 0.14;
        p[0] += Math.cos(v * Math.PI * 2.0) * spanW * 0.05;
      }
    }
  }
  syncCornersFromMesh(surf);
  bumpSurfaceGeom(surf);
}

const sharedMeshIndexCache = new Map();
function getSharedMeshIndices(subdivX = 40, subdivY = 40) {
  const key = `${subdivX}x${subdivY}`;
  let cached = sharedMeshIndexCache.get(key);
  if (cached) return cached;

  const gridW = subdivX + 1;
  const indices = new Uint16Array(subdivX * subdivY * 6);
  let ptr = 0;
  for (let j = 0; j < subdivY; j++) {
    for (let i = 0; i < subdivX; i++) {
      const i00 = j * gridW + i;
      const i10 = i00 + 1;
      const i01 = (j + 1) * gridW + i;
      const i11 = i01 + 1;
      indices[ptr++] = i00;
      indices[ptr++] = i10;
      indices[ptr++] = i11;
      indices[ptr++] = i00;
      indices[ptr++] = i11;
      indices[ptr++] = i01;
    }
  }
  cached = { key, indices, count: indices.length };
  sharedMeshIndexCache.set(key, cached);
  return cached;
}

// Build indexed perspective-correct WebGL VBO data: 5 floats/vertex (stageX, stageY, u*invW, v*invW, invW)
function getMeshGeometryForGL(surf, subdivX = 40, subdivY = 40) {
  ensureSurfaceMeshValid(surf);
  const idxInfo = getSharedMeshIndices(subdivX, subdivY);

  if (!surf._meshDirty && surf._glVerts && surf._glSubdivX === subdivX && surf._glSubdivY === subdivY) {
    return { verts: surf._glVerts, idxInfo };
  }

  const decomp = getMeshDisplacementGrid(surf);
  const H = decomp.hom ? decomp.hom.H : null;

  const gridW = subdivX + 1;
  const gridH = subdivY + 1;
  const totalFloats = gridW * gridH * 5;
  const out = surf._glVerts && surf._glVerts.length === totalFloats
    ? surf._glVerts
    : new Float32Array(totalFloats);

  let ptr = 0;
  for (let j = 0; j <= subdivY; j++) {
    const v = j / subdivY;
    for (let i = 0; i <= subdivX; i++) {
      const u = i / subdivX;
      const pt = evalCurvedSurfacePoint(surf, u, v, decomp);
      const denom = H ? (H[6] * u + H[7] * v + 1.0) : 1.0;
      const invW = H ? clamp(1.0 / Math.max(0.02, denom), 0.02, 50.0) : 1.0;

      out[ptr++] = pt[0];
      out[ptr++] = pt[1];
      out[ptr++] = u * invW;
      out[ptr++] = v * invW;
      out[ptr++] = invW;
    }
  }

  // Cache perimeter outline for accurate hit-testing of curved meshes
  const outline = [];
  const segs = 24;
  for (let i = 0; i < segs; i++) outline.push(evalCurvedSurfacePoint(surf, i / segs, 0, decomp));
  for (let i = 0; i < segs; i++) outline.push(evalCurvedSurfacePoint(surf, 1, i / segs, decomp));
  for (let i = 0; i < segs; i++) outline.push(evalCurvedSurfacePoint(surf, 1 - i / segs, 1, decomp));
  for (let i = 0; i < segs; i++) outline.push(evalCurvedSurfacePoint(surf, 0, 1 - i / segs, decomp));

  surf._glVerts = out;
  surf._glSubdivX = subdivX;
  surf._glSubdivY = subdivY;
  surf._meshOutline = outline;
  surf._meshDirty = false;
  return { verts: out, idxInfo };
}

function getMeshVerticesForGL(surf, subdivX = 40, subdivY = 40) {
  return getMeshGeometryForGL(surf, subdivX, subdivY).verts;
}

// ============================================================================
// MILESTONE 2: N-GON TRIANGULATION, ARCHITECTURAL LINE RIBBONS & BEZIER MASKS
// ============================================================================

function computeCircleSweepDeg(startDeg, endDeg) {
  const s = ((Number(startDeg) || 0) % 360 + 360) % 360;
  const e = Number(endDeg ?? 360);
  if (Math.abs(e - (Number(startDeg) || 0)) >= 359.9) return 360;
  const raw = ((e - s) % 360 + 360) % 360;
  return raw < 0.5 ? 360 : raw;
}

// Ear-clipping triangulator for arbitrary simple (convex or concave) N-Gon polygons
function triangulatePolygon(pts) {
  const n = pts ? pts.length : 0;
  if (n < 3) return new Uint16Array(0);
  if (n === 3) return new Uint16Array([0, 1, 2]);

  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area2 += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }

  const avail = [];
  if (area2 >= 0) {
    for (let i = 0; i < n; i++) avail.push(i);
  } else {
    for (let i = n - 1; i >= 0; i--) avail.push(i);
  }

  const tris = [];
  let guard = 0;
  const maxIter = n * n + 16;

  const isEar = (u, v, w) => {
    const a = pts[avail[u]];
    const b = pts[avail[v]];
    const c = pts[avail[w]];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cross <= 1e-8) return false;
    for (let k = 0; k < avail.length; k++) {
      if (k === u || k === v || k === w) continue;
      const p = pts[avail[k]];
      if (pointInTriangle(p[0], p[1], a, b, c)) return false;
    }
    return true;
  };

  let v = avail.length - 1;
  while (avail.length > 3 && guard++ < maxIter) {
    let found = false;
    for (let step = 0; step < avail.length; step++) {
      v = (v + 1) % avail.length;
      const u = (v + avail.length - 1) % avail.length;
      const w = (v + 1) % avail.length;
      if (isEar(u, v, w)) {
        tris.push(avail[u], avail[v], avail[w]);
        avail.splice(v, 1);
        v = u % Math.max(1, avail.length);
        found = true;
        break;
      }
    }
    if (!found) {
      // Degenerate / self-touching fallback: clip next triple so rendering never stalls
      tris.push(avail[0], avail[1], avail[2]);
      avail.splice(1, 1);
    }
  }
  if (avail.length === 3) {
    tris.push(avail[0], avail[1], avail[2]);
  }
  return new Uint16Array(tris);
}

function ensurePolygonUvs(surf) {
  if (!surf || surf.type !== 'polygon') return;
  const n = surf.points.length;
  if (!Array.isArray(surf.polyUvs) || surf.polyUvs.length !== n) {
    syncPolygonUvsFromStage(surf);
  }
}

function syncPolygonUvsFromStage(surf) {
  if (!surf || !surf.points || surf.points.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of surf.points) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  const spanX = Math.max(0.02, maxX - minX);
  const spanY = Math.max(0.02, maxY - minY);
  surf.polyUvs = surf.points.map(p => [
    clamp(0.08 + ((p[0] - minX) / spanX) * 0.84, 0, 1),
    clamp(0.08 + ((p[1] - minY) / spanY) * 0.84, 0, 1)
  ]);
}

// Build non-indexed triangle VBO (5 floats/vertex: stageX, stageY, uvX, uvY, 1.0) for N-Gon
function getPolygonGeometryForGL(surf) {
  const pts = surf.points || [];
  if (pts.length < 3) return { verts: new Float32Array(0), vertCount: 0 };
  ensurePolygonUvs(surf);
  const indices = triangulatePolygon(pts);
  const vertCount = indices.length;
  const out = new Float32Array(vertCount * 5);
  let ptr = 0;
  for (let i = 0; i < vertCount; i++) {
    const idx = indices[i];
    const p = pts[idx];
    const uv = surf.polyUvs[idx] || p;
    out[ptr++] = p[0];
    out[ptr++] = p[1];
    out[ptr++] = uv[0];
    out[ptr++] = uv[1];
    out[ptr++] = 1.0;
  }
  return { verts: out, vertCount };
}

// Build aspect-corrected extruded ribbon VBO for Architectural Lines & Surface Borders
// Each vertex: [stageX, stageY, arcProgressS (0..1), crossT (-1..+1), coreRatio]
function buildLineRibbonGeometry(rawPts, closed, coreWidth, glowAmt, stageAspect = 1.7778) {
  if (!rawPts || rawPts.length < 2) return { verts: new Float32Array(0), vertCount: 0 };
  const asp = Math.max(0.2, stageAspect || 1.7778);

  // Deduplicate adjacent identical points
  const pts = [];
  for (let i = 0; i < rawPts.length; i++) {
    const p = rawPts[i];
    if (pts.length === 0 || Math.hypot((p[0] - pts[pts.length - 1][0]) * asp, p[1] - pts[pts.length - 1][1]) > 1e-5) {
      pts.push(p);
    }
  }
  if (closed && pts.length >= 3 && Math.hypot((pts[0][0] - pts[pts.length - 1][0]) * asp, pts[0][1] - pts[pts.length - 1][1]) <= 1e-5) {
    pts.pop();
  }
  if (pts.length < 2) return { verts: new Float32Array(0), vertCount: 0 };

  const segCount = closed ? pts.length : (pts.length - 1);
  const segLens = new Float32Array(segCount);
  const segNormals = new Array(segCount);
  let totalLen = 0;

  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = (b[0] - a[0]) * asp;
    const dy = b[1] - a[1];
    const len = Math.max(1e-6, Math.hypot(dx, dy));
    segLens[i] = len;
    totalLen += len;
    segNormals[i] = [-dy / len, dx / len];
  }
  if (totalLen < 1e-5) return { verts: new Float32Array(0), vertCount: 0 };

  const halfCore = Math.max(0.0008, coreWidth * 0.5);
  const totalHalfW = halfCore * (1.0 + clamp(glowAmt || 0, 0, 1.5) * 2.4);
  const coreRatio = clamp(halfCore / totalHalfW, 0.12, 1.0);

  // Compute miter-clamped vertex normals in metric space
  const vNormals = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    if (!closed && i === 0) {
      vNormals[i] = segNormals[0];
    } else if (!closed && i === pts.length - 1) {
      vNormals[i] = segNormals[segCount - 1];
    } else {
      const nPrev = segNormals[(i - 1 + segCount) % segCount];
      const nNext = segNormals[i % segCount];
      let mx = nPrev[0] + nNext[0];
      let my = nPrev[1] + nNext[1];
      const mLen = Math.hypot(mx, my);
      if (mLen < 1e-4) {
        vNormals[i] = nNext;
      } else {
        mx /= mLen; my /= mLen;
        const dot = mx * nNext[0] + my * nNext[1];
        const miterScale = clamp(1.0 / Math.max(0.45, dot), 0.7, 1.85);
        vNormals[i] = [mx * miterScale, my * miterScale];
      }
    }
  }

  // Emit 2 triangles (6 vertices) per segment + end-cap extensions on open paths
  const out = new Float32Array(segCount * 6 * 5);
  let ptr = 0;
  let accum = 0;

  const pushV = (sx, sy, s, t) => {
    out[ptr++] = sx;
    out[ptr++] = sy;
    out[ptr++] = s;
    out[ptr++] = t;
    out[ptr++] = coreRatio;
  };

  for (let i = 0; i < segCount; i++) {
    const iNext = (i + 1) % pts.length;
    let ax = pts[i][0], ay = pts[i][1];
    let bx = pts[iNext][0], by = pts[iNext][1];
    const s0 = accum / totalLen;
    accum += segLens[i];
    const s1 = accum / totalLen;

    // Subtle square cap overhang on open endpoints so glow never clips abruptly
    if (!closed && i === 0) {
      const tx = (pts[1][0] - pts[0][0]) * asp / segLens[0];
      const ty = (pts[1][1] - pts[0][1]) / segLens[0];
      ax -= (tx * totalHalfW * 0.5) / asp;
      ay -= ty * totalHalfW * 0.5;
    }
    if (!closed && i === segCount - 1) {
      const tx = (pts[iNext][0] - pts[i][0]) * asp / segLens[i];
      const ty = (pts[iNext][1] - pts[i][1]) / segLens[i];
      bx += (tx * totalHalfW * 0.5) / asp;
      by += ty * totalHalfW * 0.5;
    }

    const nA = vNormals[i];
    const nB = vNormals[iNext];
    const aLx = ax + (nA[0] * totalHalfW) / asp, aLy = ay + nA[1] * totalHalfW;
    const aRx = ax - (nA[0] * totalHalfW) / asp, aRy = ay - nA[1] * totalHalfW;
    const bLx = bx + (nB[0] * totalHalfW) / asp, bLy = by + nB[1] * totalHalfW;
    const bRx = bx - (nB[0] * totalHalfW) / asp, bRy = by - nB[1] * totalHalfW;

    pushV(aLx, aLy, s0, 1.0);
    pushV(aRx, aRy, s0, -1.0);
    pushV(bLx, bLy, s1, 1.0);

    pushV(aRx, aRy, s0, -1.0);
    pushV(bRx, bRy, s1, -1.0);
    pushV(bLx, bLy, s1, 1.0);
  }

  return { verts: out, vertCount: segCount * 6 };
}

function getSurfacePerimeterContour(surf) {
  if (!surf) return { pts: [], closed: false };
  if (surf.type === 'mesh3d' && typeof getSurfaceMesh3DGeometry === 'function') {
    const geom = getSurfaceMesh3DGeometry(surf);
    if (!geom || !geom.uniqueVerts || !geom.uniqueVerts.length) return { pts: [], closed: false };
    const asp = (typeof state !== 'undefined' && state && state.stageAspect > 0.05) ? state.stageAspect : (16 / 9);
    const sW = (typeof state !== 'undefined' && state && state.stageWidth) ? state.stageWidth : 1920;
    const sH = (typeof state !== 'undefined' && state && state.stageHeight) ? state.stageHeight : 1080;
    const { mvp } = resolveSurface3DRenderMatrices(surf, asp, sW, sH);
    const projPts = [];
    for (const v of geom.uniqueVerts) {
      const pr = projectPoint3DWithMvp(v, mvp);
      if (!pr.behind) projPts.push([pr.u, pr.v]);
    }
    if (projPts.length < 3) return { pts: projPts, closed: true };
    projPts.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of projPts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = projPts.length - 1; i >= 0; i--) {
      const p = projPts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return { pts: lower.concat(upper), closed: true };
  }
  if (surf.type === 'line') {
    return { pts: surf.points || [], closed: !!surf.lineClosed };
  }
  if (isCurvedMeshSurface(surf)) {
    getMeshGeometryForGL(surf);
    return { pts: surf._meshOutline || surf.points, closed: true };
  }
  if (surf.type === 'circle') {
    const hom = computeQuadHomography(surf.points);
    const startDeg = surf.circleStartAngle ?? 0;
    const sweepDeg = computeCircleSweepDeg(startDeg, surf.circleEndAngle ?? 360);
    const full = sweepDeg >= 359.5;
    const segs = 56;
    const pts = [];
    for (let k = 0; k <= (full ? segs - 1 : segs); k++) {
      const deg = startDeg + (k / segs) * sweepDeg;
      const rad = (deg * Math.PI) / 180;
      pts.push(evalHomographyForward(hom.H, 0.5 + 0.5 * Math.cos(rad), 0.5 + 0.5 * Math.sin(rad)));
    }
    if (!full && (surf.circleInner || 0) > 0.02) {
      const rIn = surf.circleInner * 0.5;
      for (let k = segs; k >= 0; k--) {
        const deg = startDeg + (k / segs) * sweepDeg;
        const rad = (deg * Math.PI) / 180;
        pts.push(evalHomographyForward(hom.H, 0.5 + rIn * Math.cos(rad), 0.5 + rIn * Math.sin(rad)));
      }
      return { pts, closed: true };
    }
    if (!full) {
      pts.push(evalHomographyForward(hom.H, 0.5, 0.5));
      return { pts, closed: true };
    }
    return { pts, closed: true };
  }
  return { pts: surf.points || [], closed: true };
}

// Evaluate smooth Cardinal / Cubic Hermite Bezier mask contour up to maxOut (128) GPU vertices
function getEvaluatedMaskPoints(mask, maxOut = 128) {
  const pts = mask?.points || [];
  const n = pts.length;
  if (n < 3) return pts;
  const flags = Array.isArray(mask.curveFlags) ? mask.curveFlags : [];
  const anySmooth = !!mask.smoothAll || flags.some(Boolean);
  if (!anySmooth) {
    if (n <= maxOut) return pts;
    const step = n / maxOut;
    const dec = [];
    for (let i = 0; i < maxOut; i++) dec.push(pts[Math.floor(i * step)]);
    return dec;
  }

  const tension = clamp(mask.curveTension ?? 0.5, 0.1, 0.95);
  const stepsPerCurvedEdge = clamp(Math.floor(maxOut / Math.max(3, n)), 3, 14);
  const out = [];

  const isSmooth = (idx) => !!mask.smoothAll || !!flags[(idx + n) % n];

  for (let i = 0; i < n; i++) {
    const iNext = (i + 1) % n;
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[iNext];
    const p3 = pts[(i + 2) % n];

    if (!isSmooth(i) && !isSmooth(iNext)) {
      out.push(p1);
      continue;
    }

    const s1 = isSmooth(i) ? tension : 0.0;
    const s2 = isSmooth(iNext) ? tension : 0.0;
    const m1x = (p2[0] - p0[0]) * s1;
    const m1y = (p2[1] - p0[1]) * s1;
    const m2x = (p3[0] - p1[0]) * s2;
    const m2y = (p3[1] - p1[1]) * s2;

    for (let s = 0; s < stepsPerCurvedEdge; s++) {
      const t = s / stepsPerCurvedEdge;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push([
        h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x,
        h00 * p1[1] + h10 * m1y + h01 * p2[1] + h11 * m2y
      ]);
    }
  }

  if (out.length <= maxOut) return out;
  const stride = out.length / maxOut;
  const capped = [];
  for (let i = 0; i < maxOut; i++) capped.push(out[Math.floor(i * stride)]);
  return capped;
}

function computeSurfacesBoundingBox(surfaces) {
  if (!surfaces || surfaces.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of surfaces) {
    const pts = s.type === 'mesh3d'
      ? getSurfacePerimeterContour(s).pts
      : (isCurvedMeshSurface(s) ? (getMeshGeometryForGL(s), s._meshOutline || s.points) : s.points);
    for (const p of (pts || [])) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX, minY, maxX, maxY,
    cx: (minX + maxX) * 0.5,
    cy: (minY + maxY) * 0.5,
    w: Math.max(0.01, maxX - minX),
    h: Math.max(0.01, maxY - minY)
  };
}

function pointToSegDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 1e-9 ? clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function hitTestSurface(surf, sx, sy) {
  if (!surf) return false;
  if (surf.type === 'mesh3d') {
    const contour = getSurfacePerimeterContour(surf);
    return contour.pts.length >= 3 && pointInPolygon(sx, sy, contour.pts);
  }
  if (!surf.points || surf.points.length === 0) return false;
  if (surf.type === 'line') {
    if (surf.points.length < 2) return false;
    const hitR = Math.max(0.014, (surf.lineWidth || 0.008) * 1.6);
    const n = surf.points.length;
    const segs = surf.lineClosed ? n : (n - 1);
    for (let i = 0; i < segs; i++) {
      const a = surf.points[i];
      const b = surf.points[(i + 1) % n];
      if (pointToSegDist(sx, sy, a[0], a[1], b[0], b[1]) <= hitR) return true;
    }
    return false;
  }
  if (surf.type === 'polygon') {
    return surf.points.length >= 3 && pointInPolygon(sx, sy, surf.points);
  }
  if (surf.type === 'triangle') {
    return surf.points.length >= 3 && pointInTriangle(sx, sy, surf.points[0], surf.points[1], surf.points[2]);
  }
  if (isCurvedMeshSurface(surf)) {
    getMeshVerticesForGL(surf);
    return pointInPolygon(sx, sy, surf._meshOutline || surf.points);
  }
  const hom = computeQuadHomography(surf.points);
  const uv = evalHomographyInverse(hom.invColMajor, sx, sy);
  if (!uv) return pointInPolygon(sx, sy, surf.points);
  if (surf.type === 'circle') {
    const dx = (uv[0] - 0.5) * 2.0;
    const dy = (uv[1] - 0.5) * 2.0;
    const r = Math.hypot(dx, dy);
    if (r > 1.0 || r < (surf.circleInner || 0) * 0.9) return false;
    const sweep = computeCircleSweepDeg(surf.circleStartAngle ?? 0, surf.circleEndAngle ?? 360);
    if (sweep < 359.5) {
      const deg = (((Math.atan2(dy, dx) * 180) / Math.PI - (surf.circleStartAngle ?? 0)) % 360 + 360) % 360;
      return deg <= sweep;
    }
    return true;
  }
  return uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1;
}

function getSurfaceCentroid(surf) {
  if (!surf) return [0.5, 0.5];
  if (surf.type === 'mesh3d' && typeof computeProjectedMesh3DBounds === 'function') {
    const asp = (typeof state !== 'undefined' && state && state.stageAspect > 0.05) ? state.stageAspect : (16 / 9);
    const sW = (typeof state !== 'undefined' && state && state.stageWidth) ? state.stageWidth : 1920;
    const sH = (typeof state !== 'undefined' && state && state.stageHeight) ? state.stageHeight : 1080;
    const b = computeProjectedMesh3DBounds(surf, asp, sW, sH);
    return [b.cx, b.cy];
  }
  if (!surf.points || surf.points.length === 0) return [0.5, 0.5];
  if (isCurvedMeshSurface(surf)) {
    return evalCurvedSurfacePoint(surf, 0.5, 0.5);
  }
  let cx = 0, cy = 0;
  for (const p of surf.points) {
    cx += p[0];
    cy += p[1];
  }
  return [cx / surf.points.length, cy / surf.points.length];
}
