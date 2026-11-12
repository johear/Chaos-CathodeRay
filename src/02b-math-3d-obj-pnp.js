// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 02b-math-3d-obj-pnp.js — Milestone 7A:
//   1. Zero-Dependency 4x4 Column-Major 3D Matrix & Projector Frustum Math
//   2. 7 Parametric 3D Stage Primitives (Cube, Steps, Obelisk, Cylinder, Sphere, Torus, Cyc)
//   3. Zero-Dependency .OBJ 3D Mesh Parser (Quads/N-Gons, Auto-Normals, Box UVs)
//   4. Hartley-Zisserman Normalized 6-Point solvePnP (DLT + Jacobi Eigensolver + RQ Decomposition)
// ============================================================================

const MESH3D_PRIMITIVE_META = [
  { id: 'cube',      label: 'Box / Architectural Block' },
  { id: 'steps',     label: '3-Tier Stage Steps / Riser' },
  { id: 'pyramid',   label: 'Stepped Obelisk / Pyramid' },
  { id: 'cylinder',  label: 'Column / Cylinder' },
  { id: 'sphere',    label: 'Geodesic Dome / Sphere' },
  { id: 'torus',     label: 'Sculptural Torus Ring' },
  { id: 'stage_cyc', label: 'Curved Stage Cyclorama + Deck' }
];
for (const _m3d of MESH3D_PRIMITIVE_META) {
  MESH3D_PRIMITIVE_META[_m3d.id] = _m3d;
}

const _mesh3dPrimitiveCache = new Map();

// ----------------------------------------------------------------------------
// 1. 4x4 COLUMN-MAJOR MATRIX & PROJECTOR CAMERA OPTICS
// ----------------------------------------------------------------------------

function mat4Identity(out = new Float32Array(16)) {
  out.fill(0);
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
  return out;
}

function mat4Multiply(out, a, b) {
  const a00 = a[0],  a01 = a[1],  a02 = a[2],  a03 = a[3];
  const a10 = a[4],  a11 = a[5],  a12 = a[6],  a13 = a[7];
  const a20 = a[8],  a21 = a[9],  a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4]     = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[c * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[c * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[c * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
  }
  return out;
}

function mat4ComposeTRS(pos3d, rotDeg3d, scale3d, out = new Float32Array(16)) {
  const tx = Number(pos3d && pos3d[0]) || 0;
  const ty = Number(pos3d && pos3d[1]) || 0;
  const tz = Number(pos3d && pos3d[2]) || 0;

  const rx = ((Number(rotDeg3d && rotDeg3d[0]) || 0) * Math.PI) / 180;
  const ry = ((Number(rotDeg3d && rotDeg3d[1]) || 0) * Math.PI) / 180;
  const rz = ((Number(rotDeg3d && rotDeg3d[2]) || 0) * Math.PI) / 180;

  const sx = Number.isFinite(scale3d && scale3d[0]) ? scale3d[0] : 1;
  const sy = Number.isFinite(scale3d && scale3d[1]) ? scale3d[1] : 1;
  const sz = Number.isFinite(scale3d && scale3d[2]) ? scale3d[2] : 1;

  const cx = Math.cos(rx), srx = Math.sin(rx);
  const cy = Math.cos(ry), sry = Math.sin(ry);
  const cz = Math.cos(rz), srz = Math.sin(rz);

  // Turntable order: R = Ry(yaw) * Rx(pitch) * Rz(roll)
  const r00 = cy * cz + sry * srx * srz;
  const r01 = cx * srz;
  const r02 = -sry * cz + cy * srx * srz;

  const r10 = -cy * srz + sry * srx * cz;
  const r11 = cx * cz;
  const r12 = sry * srz + cy * srx * cz;

  const r20 = sry * cx;
  const r21 = -srx;
  const r22 = cy * cx;

  out[0] = r00 * sx; out[1] = r01 * sx; out[2]  = r02 * sx; out[3]  = 0;
  out[4] = r10 * sy; out[5] = r11 * sy; out[6]  = r12 * sy; out[7]  = 0;
  out[8] = r20 * sz; out[9] = r21 * sz; out[10] = r22 * sz; out[11] = 0;
  out[12] = tx;      out[13] = ty;      out[14] = tz;       out[15] = 1;
  return out;
}

function mat3NormalFromMat4(m, out = new Float32Array(9)) {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];

  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;

  let det = a00 * b01 + a01 * b11 + a02 * b21;
  if (Math.abs(det) < 1e-10) {
    out[0] = 1; out[1] = 0; out[2] = 0;
    out[3] = 0; out[4] = 1; out[5] = 0;
    out[6] = 0; out[7] = 0; out[8] = 1;
    return out;
  }
  det = 1.0 / det;
  // Inverse-transpose in column-major
  out[0] = b01 * det;
  out[1] = b11 * det;
  out[2] = b21 * det;
  out[3] = (-a22 * a01 + a02 * a21) * det;
  out[4] = (a22 * a00 - a02 * a20) * det;
  out[5] = (-a21 * a00 + a01 * a20) * det;
  out[6] = (a12 * a01 - a02 * a11) * det;
  out[7] = (-a12 * a00 + a02 * a10) * det;
  out[8] = (a11 * a00 - a01 * a10) * det;
  return out;
}

function mat4LookAt(eye, target, up = [0, 1, 0], out = new Float32Array(16)) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let zLen = Math.hypot(zx, zy, zz);
  if (zLen < 1e-8) { zz = 1; zLen = 1; }
  zx /= zLen; zy /= zLen; zz /= zLen;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  let xLen = Math.hypot(xx, xy, xz);
  if (xLen < 1e-8) {
    xx = 1; xy = 0; xz = 0; xLen = 1;
  }
  xx /= xLen; xy /= xLen; xz /= xLen;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx; out[1] = yx; out[2]  = zx; out[3]  = 0;
  out[4] = xy; out[5] = yy; out[6]  = zy; out[7]  = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

function mat4ProjectorFrustum(throwRatio, aspect, lensShiftX = 0, lensShiftY = 0, near = 0.08, far = 40.0, out = new Float32Array(16)) {
  const tr = clamp(Number(throwRatio) || 1.2, 0.25, 6.0);
  const asp = Math.max(0.2, Number(aspect) || (16 / 9));
  const wHalf = near / (2.0 * tr);
  const hHalf = wHalf / asp;

  // Positive lensShiftX/Y shifts the optical principal point to (0.5 + shiftX, 0.5 + shiftY)
  const left   = -wHalf * (1.0 + 2.0 * lensShiftX);
  const right  =  wHalf * (1.0 - 2.0 * lensShiftX);
  const bottom = -hHalf * (1.0 + 2.0 * lensShiftY);
  const top    =  hHalf * (1.0 - 2.0 * lensShiftY);

  const rl = 1.0 / Math.max(1e-7, right - left);
  const tb = 1.0 / Math.max(1e-7, top - bottom);
  const invFN = 1.0 / Math.max(1e-7, far - near);

  out.fill(0);
  out[0]  = 2.0 * near * rl;
  out[5]  = 2.0 * near * tb;
  out[8]  = (right + left) * rl;
  out[9]  = (top + bottom) * tb;
  out[10] = -(far + near) * invFN;
  out[11] = -1.0;
  out[14] = -(2.0 * far * near) * invFN;
  return out;
}

function projectPoint3DWithMvp(pt3, mvp) {
  const x = pt3[0], y = pt3[1], z = pt3[2];
  const cx = mvp[0] * x + mvp[4] * y + mvp[8]  * z + mvp[12];
  const cy = mvp[1] * x + mvp[5] * y + mvp[9]  * z + mvp[13];
  const cz = mvp[2] * x + mvp[6] * y + mvp[10] * z + mvp[14];
  const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
  if (cw <= 1e-5) {
    return { u: 0.5, v: 0.5, ndcZ: 2.0, w: cw, behind: true };
  }
  const invW = 1.0 / cw;
  return {
    u: (cx * invW) * 0.5 + 0.5,
    v: (cy * invW) * 0.5 + 0.5,
    ndcZ: cz * invW,
    w: cw,
    behind: false
  };
}

function computeOrbitMvp(orbitState, aspect) {
  const yaw = ((Number(orbitState && orbitState.yaw) ?? 34) * Math.PI) / 180;
  const pitch = clamp(((Number(orbitState && orbitState.pitch) ?? 24) * Math.PI) / 180, -1.48, 1.48);
  const dist = clamp(Number(orbitState && orbitState.dist) || 2.85, 0.7, 14.0);
  const panX = Number(orbitState && orbitState.panX) || 0;
  const panY = Number(orbitState && orbitState.panY) || 0;

  const target = [panX, panY, 0];
  const eye = [
    panX + dist * Math.cos(pitch) * Math.sin(yaw),
    panY + dist * Math.sin(pitch),
    dist * Math.cos(pitch) * Math.cos(yaw)
  ];
  const view = mat4LookAt(eye, target, [0, 1, 0]);
  const proj = mat4ProjectorFrustum(1.15, Math.max(0.25, aspect || 1.33), 0, 0, 0.08, 36.0);
  const mvp = mat4Multiply(new Float32Array(16), proj, view);
  return { mvp, view, proj, eye };
}

// ----------------------------------------------------------------------------
// 2. 3D GEOMETRY BUILDER & 7 BUILT-IN SCENIC PRIMITIVES
//    Interleaved 11 floats/vertex: [px,py,pz, nx,ny,nz, u,v, bx,by,bz]
// ----------------------------------------------------------------------------

function createMesh3DBuilder() {
  const triFloats = [];
  const uniqueVerts = [];
  const uniqueMap = new Map();
  const edgeSet = new Set();
  const edges = [];

  function registerUniqueVert(p) {
    const qx = Math.round(p[0] * 10000);
    const qy = Math.round(p[1] * 10000);
    const qz = Math.round(p[2] * 10000);
    const key = `${qx},${qy},${qz}`;
    let idx = uniqueMap.get(key);
    if (idx === undefined) {
      idx = uniqueVerts.length;
      uniqueVerts.push([p[0], p[1], p[2]]);
      uniqueMap.set(key, idx);
    }
    return idx;
  }

  function registerEdge(iA, iB) {
    if (iA === iB) return;
    const lo = Math.min(iA, iB);
    const hi = Math.max(iA, iB);
    const key = `${lo}:${hi}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push([lo, hi]);
    }
  }

  function pushVert(p, n, uv, bary) {
    triFloats.push(
      p[0], p[1], p[2],
      n[0], n[1], n[2],
      uv[0], uv[1],
      bary[0], bary[1], bary[2]
    );
  }

  // edgeFlags: [showE01, showE12, showE20] — suppresses internal quad/N-gon diagonals!
  function addTri(p0, p1, p2, n0, n1, n2, uv0, uv1, uv2, edgeFlags = [true, true, true]) {
    const show01 = edgeFlags[0] !== false;
    const show12 = edgeFlags[1] !== false;
    const show20 = edgeFlags[2] !== false;

    // Channel x = dist to E12 (opp v0); Channel y = dist to E20 (opp v1); Channel z = dist to E01 (opp v2)
    const b0 = [1, show20 ? 0 : 1, show01 ? 0 : 1];
    const b1 = [show12 ? 0 : 1, 1, show01 ? 0 : 1];
    const b2 = [show12 ? 0 : 1, show20 ? 0 : 1, 1];

    pushVert(p0, n0, uv0, b0);
    pushVert(p1, n1, uv1, b1);
    pushVert(p2, n2, uv2, b2);

    const u0 = registerUniqueVert(p0);
    const u1 = registerUniqueVert(p1);
    const u2 = registerUniqueVert(p2);
    if (show01) registerEdge(u0, u1);
    if (show12) registerEdge(u1, u2);
    if (show20) registerEdge(u2, u0);
  }

  function computeFaceNormal(p0, p1, p2) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  }

  function addQuad(p0, p1, p2, p3, uv0 = [0, 0], uv1 = [1, 0], uv2 = [1, 1], uv3 = [0, 1], normals = null) {
    const fn = normals ? null : computeFaceNormal(p0, p1, p2);
    const n0 = normals ? normals[0] : fn;
    const n1 = normals ? normals[1] : fn;
    const n2 = normals ? normals[2] : fn;
    const n3 = normals ? normals[3] : fn;
    addTri(p0, p1, p2, n0, n1, n2, uv0, uv1, uv2, [true, true, false]);
    addTri(p0, p2, p3, n0, n2, n3, uv0, uv2, uv3, [false, true, true]);
  }

  function addBoxPart(minX, minY, minZ, maxX, maxY, maxZ, uvBox = [0, 0, 1, 1]) {
    const [u0, v0, u1, v1] = uvBox;
    // Front (+Z)
    addQuad([minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    // Back (-Z)
    addQuad([maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    // Right (+X)
    addQuad([maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    // Left (-X)
    addQuad([minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    // Top (+Y)
    addQuad([minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    // Bottom (-Y)
    addQuad([minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
  }

  function finish(id = 'mesh') {
    const verts = new Float32Array(triFloats);
    const vertCount = Math.floor(verts.length / 11);
    let minX = 1e9, minY = 1e9, minZ = 1e9;
    let maxX = -1e9, maxY = -1e9, maxZ = -1e9;
    for (const v of uniqueVerts) {
      if (v[0] < minX) minX = v[0];
      if (v[1] < minY) minY = v[1];
      if (v[2] < minZ) minZ = v[2];
      if (v[0] > maxX) maxX = v[0];
      if (v[1] > maxY) maxY = v[1];
      if (v[2] > maxZ) maxZ = v[2];
    }
    if (!uniqueVerts.length) {
      minX = minY = minZ = -0.5;
      maxX = maxY = maxZ = 0.5;
    }
    return {
      id,
      verts,
      vertCount,
      triCount: Math.floor(vertCount / 3),
      uniqueVerts,
      edges,
      bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }
    };
  }

  return { addTri, addQuad, addBoxPart, computeFaceNormal, finish };
}

function buildPrimitiveMesh3D(kind = 'cube') {
  if (_mesh3dPrimitiveCache.has(kind)) {
    return _mesh3dPrimitiveCache.get(kind);
  }

  const b = createMesh3DBuilder();

  if (kind === 'steps') {
    // 3-Tier Stage Riser Steps: deep bottom tread, middle tread, tall top platform
    b.addBoxPart(-0.78, -0.58, -0.68,  0.78, -0.20,  0.68, [0.0, 0.00, 1.0, 0.34]);
    b.addBoxPart(-0.78, -0.20, -0.68,  0.78,  0.18,  0.22, [0.0, 0.33, 1.0, 0.67]);
    b.addBoxPart(-0.78,  0.18, -0.68,  0.78,  0.58, -0.24, [0.0, 0.66, 1.0, 1.00]);
  } else if (kind === 'pyramid') {
    // Stepped Plinth + 4-Sided Obelisk Pyramid (>= 9 unique non-coplanar vertices for 6-Pt PnP!)
    b.addBoxPart(-0.72, -0.68, -0.72, 0.72, -0.44, 0.72, [0.0, 0.0, 1.0, 0.22]);
    const pFL = [-0.58, -0.44,  0.58];
    const pFR = [ 0.58, -0.44,  0.58];
    const pBR = [ 0.58, -0.44, -0.58];
    const pBL = [-0.58, -0.44, -0.58];
    const apex = [0.0, 0.74, 0.0];
    const faces = [
      [pFL, pFR, apex],
      [pFR, pBR, apex],
      [pBR, pBL, apex],
      [pBL, pFL, apex]
    ];
    for (const [a, c, top] of faces) {
      const fn = b.computeFaceNormal(a, c, top);
      b.addTri(a, c, top, fn, fn, fn, [0, 0.22], [1, 0.22], [0.5, 1.0], [true, true, true]);
    }
  } else if (kind === 'cylinder') {
    const segs = 24;
    const rad = 0.56;
    const y0 = -0.68, y1 = 0.68;
    for (let i = 0; i < segs; i++) {
      const u0 = i / segs, u1 = (i + 1) / segs;
      const a0 = u0 * Math.PI * 2, a1 = u1 * Math.PI * 2;
      const x0 = Math.sin(a0) * rad, z0 = Math.cos(a0) * rad;
      const x1 = Math.sin(a1) * rad, z1 = Math.cos(a1) * rad;
      const n0 = [Math.sin(a0), 0, Math.cos(a0)];
      const n1 = [Math.sin(a1), 0, Math.cos(a1)];
      b.addQuad(
        [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0],
        [u0, 0], [u1, 0], [u1, 1], [u0, 1],
        [n0, n1, n1, n0]
      );
      // Top & bottom cap fans (suppress radial spokes, show outer rim!)
      b.addTri(
        [0, y1, 0], [x0, y1, z0], [x1, y1, z1],
        [0, 1, 0], [0, 1, 0], [0, 1, 0],
        [0.5, 0.5], [0.5 + 0.5 * Math.sin(a0), 0.5 + 0.5 * Math.cos(a0)], [0.5 + 0.5 * Math.sin(a1), 0.5 + 0.5 * Math.cos(a1)],
        [false, true, false]
      );
      b.addTri(
        [0, y0, 0], [x1, y0, z1], [x0, y0, z0],
        [0, -1, 0], [0, -1, 0], [0, -1, 0],
        [0.5, 0.5], [0.5 + 0.5 * Math.sin(a1), 0.5 + 0.5 * Math.cos(a1)], [0.5 + 0.5 * Math.sin(a0), 0.5 + 0.5 * Math.cos(a0)],
        [false, true, false]
      );
    }
  } else if (kind === 'sphere') {
    const lonSegs = 24, latSegs = 14;
    const rad = 0.72;
    for (let j = 0; j < latSegs; j++) {
      const v0 = j / latSegs, v1 = (j + 1) / latSegs;
      const th0 = (v0 - 0.5) * Math.PI, th1 = (v1 - 0.5) * Math.PI;
      const cy0 = Math.cos(th0), sy0 = Math.sin(th0);
      const cy1 = Math.cos(th1), sy1 = Math.sin(th1);
      for (let i = 0; i < lonSegs; i++) {
        const u0 = i / lonSegs, u1 = (i + 1) / lonSegs;
        const ph0 = u0 * Math.PI * 2, ph1 = u1 * Math.PI * 2;
        const n00 = [cy0 * Math.sin(ph0), sy0, cy0 * Math.cos(ph0)];
        const n10 = [cy0 * Math.sin(ph1), sy0, cy0 * Math.cos(ph1)];
        const n11 = [cy1 * Math.sin(ph1), sy1, cy1 * Math.cos(ph1)];
        const n01 = [cy1 * Math.sin(ph0), sy1, cy1 * Math.cos(ph0)];
        const p00 = [n00[0] * rad, n00[1] * rad, n00[2] * rad];
        const p10 = [n10[0] * rad, n10[1] * rad, n10[2] * rad];
        const p11 = [n11[0] * rad, n11[1] * rad, n11[2] * rad];
        const p01 = [n01[0] * rad, n01[1] * rad, n01[2] * rad];
        b.addQuad(p00, p10, p11, p01, [u0, v0], [u1, v0], [u1, v1], [u0, v1], [n00, n10, n11, n01]);
      }
    }
  } else if (kind === 'torus') {
    const majSegs = 28, minSegs = 14;
    const R = 0.54, r = 0.22;
    for (let i = 0; i < majSegs; i++) {
      const u0 = i / majSegs, u1 = (i + 1) / majSegs;
      const a0 = u0 * Math.PI * 2, a1 = u1 * Math.PI * 2;
      for (let j = 0; j < minSegs; j++) {
        const v0 = j / minSegs, v1 = (j + 1) / minSegs;
        const b0 = v0 * Math.PI * 2, b1 = v1 * Math.PI * 2;
        const evalTorus = (a, t) => {
          const ct = Math.cos(t), st = Math.sin(t);
          const sa = Math.sin(a), ca = Math.cos(a);
          const nx = sa * ct, ny = st, nz = ca * ct;
          const px = sa * (R + r * ct), py = r * st, pz = ca * (R + r * ct);
          return { p: [px, py, pz], n: [nx, ny, nz] };
        };
        const q00 = evalTorus(a0, b0), q10 = evalTorus(a1, b0);
        const q11 = evalTorus(a1, b1), q01 = evalTorus(a0, b1);
        b.addQuad(q00.p, q10.p, q11.p, q01.p, [u0, v0], [u1, v0], [u1, v1], [u0, v1], [q00.n, q10.n, q11.n, q01.n]);
      }
    }
  } else if (kind === 'stage_cyc') {
    // Panoramic Curved Stage Cyclorama Wall + Stage Floor Deck
    const cols = 16;
    const halfW = 0.92;
    const yBot = -0.52, yTop = 0.62;
    for (let i = 0; i < cols; i++) {
      const u0 = i / cols, u1 = (i + 1) / cols;
      const ang0 = (u0 - 0.5) * 1.45, ang1 = (u1 - 0.5) * 1.45;
      const x0 = Math.sin(ang0) * (halfW / Math.sin(0.725));
      const x1 = Math.sin(ang1) * (halfW / Math.sin(0.725));
      const z0 = -Math.cos(ang0) * 0.62 + 0.14;
      const z1 = -Math.cos(ang1) * 0.62 + 0.14;
      const n0 = [-Math.sin(ang0), 0, Math.cos(ang0)];
      const n1 = [-Math.sin(ang1), 0, Math.cos(ang1)];
      b.addQuad(
        [x0, yBot, z0], [x1, yBot, z1], [x1, yTop, z1], [x0, yTop, z0],
        [u0, 0.35], [u1, 0.35], [u1, 1.0], [u0, 1.0],
        [n0, n1, n1, n0]
      );
      // Stage floor apron from curved cyc base forward to zFront
      const zFront = 0.68;
      b.addQuad(
        [x0, yBot, zFront], [x1, yBot, zFront], [x1, yBot, z1], [x0, yBot, z0],
        [u0, 0.0], [u1, 0.0], [u1, 0.35], [u0, 0.35],
        [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]]
      );
    }
  } else {
    // Default 'cube'
    b.addBoxPart(-0.62, -0.62, -0.62, 0.62, 0.62, 0.62, [0, 0, 1, 1]);
  }

  const mesh = b.finish(`prim:${kind}`);
  _mesh3dPrimitiveCache.set(kind, mesh);
  return mesh;
}

// ----------------------------------------------------------------------------
// 3. ZERO-DEPENDENCY .OBJ 3D MESH PARSER
//    Supports v, vt, vn, f (positive/negative indices, N-gon fan triangulation,
//    automatic bounding-box normalization, auto-normals & box-projected UVs)
// ----------------------------------------------------------------------------

function parseObjMesh(objText, assetId = 'obj_custom', maxTriangles = 30000) {
  const rawPos = [];
  const rawUv = [];
  const rawNorm = [];
  const faces = [];

  const lines = String(objText || '').split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line || line.charCodeAt(0) === 35 /* '#' */) continue;

    const spIdx = line.indexOf(' ');
    const tabIdx = line.indexOf('\t');
    const cut = (spIdx < 0) ? tabIdx : (tabIdx < 0 ? spIdx : Math.min(spIdx, tabIdx));
    if (cut < 0) continue;

    const kw = line.slice(0, cut);
    const rest = line.slice(cut + 1).trim();
    if (!rest) continue;

    if (kw === 'v') {
      const parts = rest.split(/\s+/);
      if (parts.length >= 3) {
        rawPos.push([parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0, parseFloat(parts[2]) || 0]);
      }
    } else if (kw === 'vt') {
      const parts = rest.split(/\s+/);
      if (parts.length >= 2) {
        rawUv.push([parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0]);
      }
    } else if (kw === 'vn') {
      const parts = rest.split(/\s+/);
      if (parts.length >= 3) {
        let nx = parseFloat(parts[0]) || 0;
        let ny = parseFloat(parts[1]) || 0;
        let nz = parseFloat(parts[2]) || 0;
        const len = Math.hypot(nx, ny, nz) || 1;
        rawNorm.push([nx / len, ny / len, nz / len]);
      }
    } else if (kw === 'f') {
      const toks = rest.split(/\s+/);
      if (toks.length < 3) continue;
      const fVerts = [];
      for (const tok of toks) {
        const segs = tok.split('/');
        let vi = parseInt(segs[0], 10);
        if (!Number.isFinite(vi) || vi === 0) continue;
        vi = vi < 0 ? rawPos.length + vi : vi - 1;

        let ti = -1;
        if (segs.length > 1 && segs[1] !== '') {
          const rawTi = parseInt(segs[1], 10);
          if (Number.isFinite(rawTi) && rawTi !== 0) {
            ti = rawTi < 0 ? rawUv.length + rawTi : rawTi - 1;
          }
        }

        let ni = -1;
        if (segs.length > 2 && segs[2] !== '') {
          const rawNi = parseInt(segs[2], 10);
          if (Number.isFinite(rawNi) && rawNi !== 0) {
            ni = rawNi < 0 ? rawNorm.length + rawNi : rawNi - 1;
          }
        }
        if (vi >= 0 && vi < rawPos.length) {
          fVerts.push({ vi, ti, ni });
        }
      }
      if (fVerts.length >= 3) {
        faces.push(fVerts);
      }
    }
  }

  if (rawPos.length < 3 || faces.length === 0) {
    throw new Error('.obj file contains no valid polygon faces.');
  }

  // Normalize object center & maximum extent into [-0.72, +0.72]^3
  let minX = 1e9, minY = 1e9, minZ = 1e9;
  let maxX = -1e9, maxY = -1e9, maxZ = -1e9;
  for (const p of rawPos) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[2] < minZ) minZ = p[2];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
    if (p[2] > maxZ) maxZ = p[2];
  }
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const maxSpan = Math.max(1e-5, maxX - minX, maxY - minY, maxZ - minZ);
  const normScale = 1.44 / maxSpan;

  const normPos = rawPos.map(p => [
    (p[0] - cx) * normScale,
    (p[1] - cy) * normScale,
    (p[2] - cz) * normScale
  ]);

  const b = createMesh3DBuilder();
  let triCounter = 0;

  const evalBoxUv = (p, n) => {
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    if (az >= ax && az >= ay) {
      return [clamp(p[0] / 1.44 + 0.5, 0, 1), clamp(p[1] / 1.44 + 0.5, 0, 1)];
    }
    if (ax >= ay) {
      return [clamp(-p[2] / 1.44 + 0.5, 0, 1), clamp(p[1] / 1.44 + 0.5, 0, 1)];
    }
    return [clamp(p[0] / 1.44 + 0.5, 0, 1), clamp(-p[2] / 1.44 + 0.5, 0, 1)];
  };

  for (let fi = 0; fi < faces.length && triCounter < maxTriangles; fi++) {
    const fv = faces[fi];
    const nVerts = fv.length;
    const faceN = b.computeFaceNormal(normPos[fv[0].vi], normPos[fv[1].vi], normPos[fv[2].vi]);

    for (let k = 1; k < nVerts - 1 && triCounter < maxTriangles; k++) {
      const a = fv[0], c = fv[k], d = fv[k + 1];
      const p0 = normPos[a.vi], p1 = normPos[c.vi], p2 = normPos[d.vi];
      const n0 = (a.ni >= 0 && rawNorm[a.ni]) ? rawNorm[a.ni] : faceN;
      const n1 = (c.ni >= 0 && rawNorm[c.ni]) ? rawNorm[c.ni] : faceN;
      const n2 = (d.ni >= 0 && rawNorm[d.ni]) ? rawNorm[d.ni] : faceN;
      const uv0 = (a.ti >= 0 && rawUv[a.ti]) ? rawUv[a.ti] : evalBoxUv(p0, n0);
      const uv1 = (c.ti >= 0 && rawUv[c.ti]) ? rawUv[c.ti] : evalBoxUv(p1, n1);
      const uv2 = (d.ti >= 0 && rawUv[d.ti]) ? rawUv[d.ti] : evalBoxUv(p2, n2);

      // Hide interior fan diagonals on quad & N-gon faces!
      const edgeFlags = [k === 1, true, k === nVerts - 2];
      b.addTri(p0, p1, p2, n0, n1, n2, uv0, uv1, uv2, edgeFlags);
      triCounter++;
    }
  }

  return b.finish(assetId);
}

function getSurfaceMesh3DGeometry(surf, objAssetsMap = null) {
  if (!surf || surf.type !== 'mesh3d') return null;
  if (surf.objAssetId) {
    const mapObj = objAssetsMap || (typeof state !== 'undefined' && state ? state.objAssets : null);
    const asset = mapObj ? mapObj[surf.objAssetId] : null;
    if (asset) {
      if (!asset._mesh && asset.objText) {
        try {
          asset._mesh = parseObjMesh(asset.objText, `obj:${surf.objAssetId}`);
        } catch (err) {
          console.warn('[3D] Failed to parse .obj asset:', err);
        }
      }
      if (asset._mesh) return asset._mesh;
    }
  }
  return buildPrimitiveMesh3D(surf.mesh3dPrimitive || 'cube');
}

// ----------------------------------------------------------------------------
// 4. HARTLEY-ZISSERMAN 6-POINT solvePnP (DLT + JACOBI EIGENSOLVER + RQ DECOMP)
// ----------------------------------------------------------------------------

function jacobiSmallestEigenvector12(matSym12) {
  const n = 12;
  const A = new Float64Array(matSym12);
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1.0;

  for (let sweep = 0; sweep < 64; sweep++) {
    let offDiagSq = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const v = A[p * n + q];
        offDiagSq += v * v;
      }
    }
    if (offDiagSq < 1e-26) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) < 1e-15) continue;

        const app = A[p * n + p];
        const aqq = A[q * n + q];
        const tau = (aqq - app) / (2.0 * apq);
        const t = tau >= 0
          ? 1.0 / (tau + Math.hypot(1.0, tau))
          : -1.0 / (-tau + Math.hypot(1.0, tau));
        const c = 1.0 / Math.hypot(1.0, t);
        const s = t * c;

        A[p * n + p] = app - t * apq;
        A[q * n + q] = aqq + t * apq;
        A[p * n + q] = 0.0;
        A[q * n + p] = 0.0;

        for (let r = 0; r < n; r++) {
          if (r === p || r === q) continue;
          const arp = A[r * n + p];
          const arq = A[r * n + q];
          A[r * n + p] = A[p * n + r] = c * arp - s * arq;
          A[r * n + q] = A[q * n + r] = s * arp + c * arq;
        }
        for (let r = 0; r < n; r++) {
          const vrp = V[r * n + p];
          const vrq = V[r * n + q];
          V[r * n + p] = c * vrp - s * vrq;
          V[r * n + q] = s * vrp + c * vrq;
        }
      }
    }
  }

  let minIdx = 0;
  let minVal = A[0];
  for (let i = 1; i < n; i++) {
    if (A[i * n + i] < minVal) {
      minVal = A[i * n + i];
      minIdx = i;
    }
  }
  const vec = new Float64Array(n);
  for (let r = 0; r < n; r++) vec[r] = V[r * n + minIdx];
  return { vec, minEig: minVal };
}

function check3DPinsNonCoplanar(pins) {
  const n = pins.length;
  if (n < 6) return false;
  let mx = 0, my = 0, mz = 0;
  for (const p of pins) {
    mx += p.pos3d[0]; my += p.pos3d[1]; mz += p.pos3d[2];
  }
  mx /= n; my /= n; mz /= n;

  // 3x3 covariance matrix eigenvalues via 3x3 Jacobi
  const C = new Float64Array(9);
  for (const p of pins) {
    const dx = p.pos3d[0] - mx, dy = p.pos3d[1] - my, dz = p.pos3d[2] - mz;
    C[0] += dx * dx; C[1] += dx * dy; C[2] += dx * dz;
    C[3] += dy * dx; C[4] += dy * dy; C[5] += dy * dz;
    C[6] += dz * dx; C[7] += dz * dy; C[8] += dz * dz;
  }
  const trace = C[0] + C[4] + C[8];
  if (trace < 1e-8) return false;

  // det(C) / (trace/3)^3 measures 3D volume spread vs planar collapse
  const det =
    C[0] * (C[4] * C[8] - C[5] * C[7]) -
    C[1] * (C[3] * C[8] - C[5] * C[6]) +
    C[2] * (C[3] * C[7] - C[4] * C[6]);
  const refVol = Math.pow(trace / 3.0, 3);
  return det > refVol * 1e-6;
}

function decomposeProjectorMatrixRQ(P, stageW, stageH) {
  // Extract 3x3 M = P[:, 0..2] (row-major 3x3) and decompose M = K * R via Givens rotations
  const M = [
    [P[0], P[1], P[2]],
    [P[4], P[5], P[6]],
    [P[8], P[9], P[10]]
  ];
  const R = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];

  const applyRightGivens = (colA, colB, c, s) => {
    for (let r = 0; r < 3; r++) {
      const ma = M[r][colA], mb = M[r][colB];
      M[r][colA] = ma * c + mb * s;
      M[r][colB] = -ma * s + mb * c;
    }
    for (let r = 0; r < 3; r++) {
      const ra = R[colA][r], rb = R[colB][r];
      R[colA][r] = ra * c + rb * s;
      R[colB][r] = -ra * s + rb * c;
    }
  };

  // Zero M[2][1] using cols (1, 2) -> M'[2][1] = -M[2][1]*s + M[2][2]*c? Wait:
  // For colB = 1, colA = 2: M'[2][1] = -M[2][2]*s + M[2][1]*c = 0 => s = M[2][1]/h, c = M[2][2]/h
  {
    const h = Math.hypot(M[2][2], M[2][1]);
    if (h > 1e-12) applyRightGivens(2, 1, M[2][2] / h, M[2][1] / h);
  }
  // Zero M[2][0] using cols (2, 0)
  {
    const h = Math.hypot(M[2][2], M[2][0]);
    if (h > 1e-12) applyRightGivens(2, 0, M[2][2] / h, M[2][0] / h);
  }
  // Zero M[1][0] using cols (1, 0)
  {
    const h = Math.hypot(M[1][1], M[1][0]);
    if (h > 1e-12) applyRightGivens(1, 0, M[1][1] / h, M[1][0] / h);
  }

  // Enforce positive diagonal entries on K = M
  for (let d = 0; d < 3; d++) {
    if (M[d][d] < 0) {
      for (let r = 0; r <= d; r++) M[r][d] = -M[r][d];
      for (let c = 0; c < 3; c++) R[d][c] = -R[d][c];
    }
  }

  const k22 = Math.max(1e-9, Math.abs(M[2][2]));
  const fx = M[0][0] / k22;
  const fy = M[1][1] / k22;
  const cx = M[0][2] / k22;
  const cy = M[1][2] / k22;

  // Camera center C = -M_orig^-1 * p_col4
  const A00 = P[0], A01 = P[1], A02 = P[2],  b0 = P[3];
  const A10 = P[4], A11 = P[5], A12 = P[6],  b1 = P[7];
  const A20 = P[8], A21 = P[9], A22 = P[10], b2 = P[11];
  const detA =
    A00 * (A11 * A22 - A12 * A21) -
    A01 * (A10 * A22 - A12 * A20) +
    A02 * (A10 * A21 - A11 * A20);
  let camCenter = [0, 0, 3.0];
  if (Math.abs(detA) > 1e-11) {
    const invD = -1.0 / detA;
    camCenter = [
      ((A11 * A22 - A12 * A21) * b0 + (A02 * A21 - A01 * A22) * b1 + (A01 * A12 - A02 * A11) * b2) * invD,
      ((A12 * A20 - A10 * A22) * b0 + (A00 * A22 - A02 * A20) * b1 + (A02 * A10 - A00 * A12) * b2) * invD,
      ((A10 * A21 - A11 * A20) * b0 + (A01 * A20 - A00 * A21) * b1 + (A00 * A11 - A01 * A10) * b2) * invD
    ];
  }

  return {
    fx,
    fy,
    throwRatio: clamp(fx / Math.max(1, stageW), 0.15, 10.0),
    lensShiftX: cx / Math.max(1, stageW) - 0.5,
    lensShiftY: cy / Math.max(1, stageH) - 0.5,
    camCenter
  };
}

function solvePnP6PointDLT(calibPins, stageW = 1920, stageH = 1080, meshVerts3D = null) {
  const validPins = Array.isArray(calibPins)
    ? calibPins.filter(p => p && p.enabled !== false && Array.isArray(p.pos3d) && Array.isArray(p.stage2d))
    : [];

  if (validPins.length < 6) {
    return {
      ok: false,
      reason: 'insufficient_pins',
      pinCount: validPins.length,
      message: `Pin ${6 - validPins.length} more 3D vertex${6 - validPins.length === 1 ? '' : 'es'} (${validPins.length}/6)`
    };
  }

  if (!check3DPinsNonCoplanar(validPins)) {
    return {
      ok: false,
      reason: 'coplanar',
      pinCount: validPins.length,
      message: 'Selected 3D pins are coplanar — add at least 1 vertex at a different 3D depth'
    };
  }

  const N = validPins.length;
  const W = Math.max(64, Number(stageW) || 1920);
  const H = Math.max(64, Number(stageH) || 1080);

  // 1. Isotropic 3D normalization
  let mx = 0, my = 0, mz = 0;
  for (const p of validPins) {
    mx += p.pos3d[0]; my += p.pos3d[1]; mz += p.pos3d[2];
  }
  mx /= N; my /= N; mz /= N;
  let d3 = 0;
  for (const p of validPins) {
    d3 += Math.hypot(p.pos3d[0] - mx, p.pos3d[1] - my, p.pos3d[2] - mz);
  }
  d3 = Math.max(1e-7, d3 / N);
  const s3 = Math.SQRT2 * 1.22474487139 / d3; // sqrt(3) / d3

  // 2. Isotropic 2D pixel normalization
  let ux = 0, uy = 0;
  for (const p of validPins) {
    ux += p.stage2d[0] * W;
    uy += p.stage2d[1] * H;
  }
  ux /= N; uy /= N;
  let d2 = 0;
  for (const p of validPins) {
    d2 += Math.hypot(p.stage2d[0] * W - ux, p.stage2d[1] * H - uy);
  }
  d2 = Math.max(1e-5, d2 / N);
  const s2 = Math.SQRT2 / d2;

  // 3. Accumulate 12x12 symmetric normal matrix M = A^T * A
  const M12 = new Float64Array(144);
  const rowA = new Float64Array(12);
  const rowB = new Float64Array(12);

  for (let i = 0; i < N; i++) {
    const p = validPins[i];
    const X = (p.pos3d[0] - mx) * s3;
    const Y = (p.pos3d[1] - my) * s3;
    const Z = (p.pos3d[2] - mz) * s3;
    const x = (p.stage2d[0] * W - ux) * s2;
    const y = (p.stage2d[1] * H - uy) * s2;

    rowA[0] = X; rowA[1] = Y; rowA[2] = Z; rowA[3] = 1;
    rowA[4] = 0; rowA[5] = 0; rowA[6] = 0; rowA[7] = 0;
    rowA[8] = -x * X; rowA[9] = -x * Y; rowA[10] = -x * Z; rowA[11] = -x;

    rowB[0] = 0; rowB[1] = 0; rowB[2] = 0; rowB[3] = 0;
    rowB[4] = X; rowB[5] = Y; rowB[6] = Z; rowB[7] = 1;
    rowB[8] = -y * X; rowB[9] = -y * Y; rowB[10] = -y * Z; rowB[11] = -y;

    for (let r = 0; r < 12; r++) {
      const ra = rowA[r], rb = rowB[r];
      for (let c = r; c < 12; c++) {
        M12[r * 12 + c] += ra * rowA[c] + rb * rowB[c];
      }
    }
  }
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < r; c++) M12[r * 12 + c] = M12[c * 12 + r];
  }

  const { vec: pNorm } = jacobiSmallestEigenvector12(M12);

  // 4. Denormalize P_px = T2D^-1 * P_tilde * T3D
  // First P_t3 = P_tilde * T3D:
  const Pt3 = new Float64Array(12);
  for (let r = 0; r < 3; r++) {
    const p0 = pNorm[r * 4], p1 = pNorm[r * 4 + 1], p2 = pNorm[r * 4 + 2], p3 = pNorm[r * 4 + 3];
    Pt3[r * 4]     = p0 * s3;
    Pt3[r * 4 + 1] = p1 * s3;
    Pt3[r * 4 + 2] = p2 * s3;
    Pt3[r * 4 + 3] = p3 - s3 * (p0 * mx + p1 * my + p2 * mz);
  }

  // Next P_px = T2D^-1 * Pt3 (T2D^-1 = [[1/s2, 0, ux], [0, 1/s2, uy], [0, 0, 1]])
  const invS2 = 1.0 / s2;
  const P = new Float64Array(12);
  for (let c = 0; c < 4; c++) {
    const r2 = Pt3[8 + c];
    P[c]     = Pt3[c] * invS2 + ux * r2;
    P[4 + c] = Pt3[4 + c] * invS2 + uy * r2;
    P[8 + c] = r2;
  }

  // Normalize scale so ||P_row3[0..2]||_2 = 1 (making w = optical depth!)
  const wNorm = Math.hypot(P[8], P[9], P[10]);
  if (wNorm < 1e-12) {
    return { ok: false, reason: 'degenerate', pinCount: N, message: 'Degenerate 3D-to-2D correspondence' };
  }
  let wSignSum = 0;
  for (const p of validPins) {
    wSignSum += (P[8] * p.pos3d[0] + P[9] * p.pos3d[1] + P[10] * p.pos3d[2] + P[11]) / wNorm;
  }
  const signFlip = wSignSum < 0 ? -1.0 : 1.0;
  for (let k = 0; k < 12; k++) P[k] = (P[k] / wNorm) * signFlip;

  // 5. Compute RMS pixel reprojection error & depth range across mesh + pins
  let errSqSum = 0;
  let wMin = 1e9, wMax = -1e9;
  const pinErrorsPx = [];

  for (const p of validPins) {
    const X = p.pos3d[0], Y = p.pos3d[1], Z = p.pos3d[2];
    const w = P[8] * X + P[9] * Y + P[10] * Z + P[11];
    if (w < wMin) wMin = w;
    if (w > wMax) wMax = w;
    const predX = (P[0] * X + P[1] * Y + P[2] * Z + P[3]) / Math.max(1e-6, w);
    const predY = (P[4] * X + P[5] * Y + P[6] * Z + P[7]) / Math.max(1e-6, w);
    const dx = predX - p.stage2d[0] * W;
    const dy = predY - p.stage2d[1] * H;
    const ePx = Math.hypot(dx, dy);
    pinErrorsPx.push(ePx);
    errSqSum += dx * dx + dy * dy;
  }

  if (Array.isArray(meshVerts3D)) {
    for (const v of meshVerts3D) {
      const w = P[8] * v[0] + P[9] * v[1] + P[10] * v[2] + P[11];
      if (w > 1e-3) {
        if (w < wMin) wMin = w;
        if (w > wMax) wMax = w;
      }
    }
  }

  const rmsPx = Math.sqrt(errSqSum / N);

  // 6. Lift 3x4 P_px into exact WebGL2 Clip-Space 4x4 column-major MVP matrix
  const zNear = Math.max(0.02, (wMin > 0 ? wMin * 0.25 : 0.08));
  const zFar  = Math.max(zNear + 2.0, (wMax > 0 ? wMax * 4.0 : 40.0));
  const depA  = (zFar + zNear) / (zFar - zNear);
  const depB  = (-2.0 * zFar * zNear) / (zFar - zNear);

  // Row 0: (2/W)*P_row0 - P_row2
  // Row 1: (2/H)*P_row1 - P_row2
  // Row 2: depA * P_row2 + [0, 0, 0, depB]
  // Row 3: P_row2
  const mvp = new Float32Array(16);
  const sX = 2.0 / W;
  const sY = 2.0 / H;
  for (let c = 0; c < 4; c++) {
    const p0 = P[c], p1 = P[4 + c], p2 = P[8 + c];
    mvp[c * 4 + 0] = sX * p0 - p2;
    mvp[c * 4 + 1] = sY * p1 - p2;
    mvp[c * 4 + 2] = depA * p2 + (c === 3 ? depB : 0.0);
    mvp[c * 4 + 3] = p2;
  }

  const intrinsics = decomposeProjectorMatrixRQ(P, W, H);
  return {
    ok: true,
    pinCount: N,
    rmsPx,
    pinErrorsPx,
    mvp,
    projMat3x4: P,
    ...intrinsics
  };
}

function computeManualSurface3DMvp(surf, stageAspect = 16 / 9) {
  const model = mat4ComposeTRS(
    surf.pos3d || [0, 0, 0],
    surf.rot3d || [18, -28, 0],
    surf.scale3d || [1, 1, 1]
  );
  const camDist = clamp(Number(surf.camDist) || 3.2, 0.5, 25.0);
  const camEye = [0, 0, camDist];
  const view = mat4LookAt(camEye, [0, 0, 0], [0, 1, 0]);
  const proj = mat4ProjectorFrustum(
    surf.camThrow ?? 1.2,
    stageAspect,
    surf.lensShiftX ?? 0,
    surf.lensShiftY ?? 0,
    0.08,
    40.0
  );
  const vp = mat4Multiply(new Float32Array(16), proj, view);
  const mvp = mat4Multiply(new Float32Array(16), vp, model);
  const normalMat = mat3NormalFromMat4(model);
  return { mvp, model, normalMat, camWorldPos: camEye, calibrated: false, pnp: null };
}

function resolveSurface3DRenderMatrices(surf, stageAspect = 16 / 9, stageW = 1920, stageH = 1080, objAssetsMap = null) {
  const geom = getSurfaceMesh3DGeometry(surf, objAssetsMap);
  if (surf.calibMode === 'calibrated' && Array.isArray(surf.calibPins) && surf.calibPins.length >= 6) {
    const pnp = solvePnP6PointDLT(surf.calibPins, stageW, stageH, geom ? geom.uniqueVerts : null);
    if (pnp.ok) {
      const ident4 = mat4Identity();
      const ident3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      return {
        mvp: pnp.mvp,
        model: ident4,
        normalMat: ident3,
        camWorldPos: pnp.camCenter || [0, 0, 3.2],
        calibrated: true,
        pnp
      };
    }
    const fallback = computeManualSurface3DMvp(surf, stageAspect);
    fallback.pnp = pnp;
    return fallback;
  }
  const res = computeManualSurface3DMvp(surf, stageAspect);
  if (surf.calibMode === 'calibrated') {
    res.pnp = solvePnP6PointDLT(surf.calibPins || [], stageW, stageH, geom ? geom.uniqueVerts : null);
  }
  return res;
}

function autoSeed6CalibrationPins(surf, stageAspect = 16 / 9) {
  const geom = getSurfaceMesh3DGeometry(surf);
  if (!geom || !geom.uniqueVerts || geom.uniqueVerts.length < 6) return [];

  const verts = geom.uniqueVerts;
  const chosenIndices = [];
  const chosenSet = new Set();

  // Greedily pick 6 maximally spread, non-coplanar vertices starting from 3D axial extremes
  const dirs = [
    [-1, -1,  1],
    [ 1, -1,  1],
    [ 1,  1,  1],
    [-1,  1,  1],
    [-1, -1, -1],
    [ 1,  1, -1],
    [ 0,  1,  0],
    [ 0, -1, -1]
  ];

  for (const d of dirs) {
    if (chosenIndices.length >= 6) break;
    let bestIdx = -1;
    let bestScore = -1e9;
    for (let i = 0; i < verts.length; i++) {
      if (chosenSet.has(i)) continue;
      const v = verts[i];
      const score = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      chosenIndices.push(bestIdx);
      chosenSet.add(bestIdx);
    }
  }

  // Fill any remaining slots via farthest-point sampling in 3D
  while (chosenIndices.length < 6 && chosenIndices.length < verts.length) {
    let bestIdx = -1;
    let bestMinDist = -1;
    for (let i = 0; i < verts.length; i++) {
      if (chosenSet.has(i)) continue;
      let minD = 1e9;
      for (const ci of chosenIndices) {
        const d = Math.hypot(
          verts[i][0] - verts[ci][0],
          verts[i][1] - verts[ci][1],
          verts[i][2] - verts[ci][2]
        );
        if (d < minD) minD = d;
      }
      if (minD > bestMinDist) {
        bestMinDist = minD;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    chosenIndices.push(bestIdx);
    chosenSet.add(bestIdx);
  }

  const manual = computeManualSurface3DMvp(surf, stageAspect);
  return chosenIndices.map(vi => {
    const p3 = verts[vi];
    const proj = projectPoint3DWithMvp(p3, manual.mvp);
    return {
      vertexIdx: vi,
      pos3d: [p3[0], p3[1], p3[2]],
      stage2d: [clamp(proj.u, 0.04, 0.96), clamp(proj.v, 0.04, 0.96)],
      enabled: true
    };
  });
}

function computeProjectedMesh3DBounds(surf, stageAspect = 16 / 9, stageW = 1920, stageH = 1080) {
  const geom = getSurfaceMesh3DGeometry(surf);
  if (!geom || !geom.uniqueVerts.length) {
    return { minX: 0.25, minY: 0.25, maxX: 0.75, maxY: 0.75, cx: 0.5, cy: 0.5 };
  }
  const { mvp } = resolveSurface3DRenderMatrices(surf, stageAspect, stageW, stageH);
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  let count = 0;
  for (const v of geom.uniqueVerts) {
    const pr = projectPoint3DWithMvp(v, mvp);
    if (pr.behind) continue;
    if (pr.u < minX) minX = pr.u;
    if (pr.v < minY) minY = pr.v;
    if (pr.u > maxX) maxX = pr.u;
    if (pr.v > maxY) maxY = pr.v;
    count++;
  }
  if (count === 0) {
    return { minX: 0.3, minY: 0.3, maxX: 0.7, maxY: 0.7, cx: 0.5, cy: 0.5 };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) * 0.5,
    cy: (minY + maxY) * 0.5
  };
}
