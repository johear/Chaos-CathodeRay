// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 05b-svg-templates-scanner.js — SVG Importer, Perspective Grid Cloner,
// Canonical Stage UV Template Exporter & Structured-Light Space Scanner
// ============================================================================

// ============================================================================
// 1. ARCHITECTURAL SVG IMPORTER (Surfaces, Neon Lines & Bezier Cutout Masks)
// ============================================================================

function multiplyAffine2D(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ];
}

function applyAffine2D(m, x, y) {
  return [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5]
  ];
}

function parseSvgTransformAttr(attr) {
  let mat = [1, 0, 0, 1, 0, 0];
  if (!attr || typeof attr !== 'string') return mat;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  let match;
  while ((match = re.exec(attr)) !== null) {
    const fn = match[1].toLowerCase();
    const nums = (match[2].match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);
    let cur = [1, 0, 0, 1, 0, 0];
    if (fn === 'matrix' && nums.length >= 6) {
      cur = nums.slice(0, 6);
    } else if (fn === 'translate') {
      cur = [1, 0, 0, 1, nums[0] || 0, nums[1] || 0];
    } else if (fn === 'scale') {
      const sx = nums[0] ?? 1;
      const sy = nums[1] ?? sx;
      cur = [sx, 0, 0, sy, 0, 0];
    } else if (fn === 'rotate') {
      const rad = ((nums[0] || 0) * Math.PI) / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      const cx = nums[1] || 0, cy = nums[2] || 0;
      if (cx !== 0 || cy !== 0) {
        cur = multiplyAffine2D([1, 0, 0, 1, cx, cy], multiplyAffine2D([c, s, -s, c, 0, 0], [1, 0, 0, 1, -cx, -cy]));
      } else {
        cur = [c, s, -s, c, 0, 0];
      }
    } else if (fn === 'skewx') {
      cur = [1, 0, Math.tan(((nums[0] || 0) * Math.PI) / 180), 1, 0, 0];
    } else if (fn === 'skewy') {
      cur = [1, Math.tan(((nums[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    }
    mat = multiplyAffine2D(mat, cur);
  }
  return mat;
}

function sampleSvgArcToPoints(x1, y1, rxIn, ryIn, phiDeg, largeArc, sweep, x2, y2, outPts) {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-6 || ry < 1e-6 || (Math.abs(x1 - x2) < 1e-6 && Math.abs(y1 - y2) < 1e-6)) {
    outPts.push([x2, y2]);
    return;
  }
  const phi = (phiDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
  const dx2 = (x1 - x2) * 0.5, dy2 = (y1 - y2) * 0.5;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }

  const rx2 = rx * rx, ry2 = ry * ry;
  const x1p2 = x1p * x1p, y1p2 = y1p * y1p;
  const num = Math.max(0, rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2);
  const den = Math.max(1e-9, rx2 * y1p2 + ry2 * x1p2);
  const sign = (!!largeArc === !!sweep) ? -1 : 1;
  const coef = sign * Math.sqrt(num / den);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) * 0.5;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) * 0.5;

  const vecAngle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.max(1e-9, Math.hypot(ux, uy) * Math.hypot(vx, vy));
    const ang = Math.acos(clamp(dot / len, -1, 1));
    return (ux * vy - uy * vx) < 0 ? -ang : ang;
  };

  const ux = (x1p - cxp) / rx, uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx, vy = (-y1p - cyp) / ry;
  const theta1 = vecAngle(1, 0, ux, uy);
  let dTheta = vecAngle(ux, uy, vx, vy);
  if (!sweep && dTheta > 0) dTheta -= Math.PI * 2;
  if (sweep && dTheta < 0) dTheta += Math.PI * 2;

  const steps = clamp(Math.ceil(Math.abs(dTheta) / (Math.PI / 12)), 4, 32);
  for (let i = 1; i <= steps; i++) {
    const ang = theta1 + (dTheta * i) / steps;
    const px = cosPhi * rx * Math.cos(ang) - sinPhi * ry * Math.sin(ang) + cx;
    const py = sinPhi * rx * Math.cos(ang) + cosPhi * ry * Math.sin(ang) + cy;
    outPts.push([px, py]);
  }
}

function parseSvgPathDataToSubpaths(dStr) {
  if (!dStr || typeof dStr !== 'string') return [];
  const tokens = dStr.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return [];

  const subpaths = [];
  let curPts = [];
  let curX = 0, curY = 0;
  let startX = 0, startY = 0;
  let prevCtrlX = 0, prevCtrlY = 0;
  let prevCmd = '';
  let idx = 0;

  const hasNum = () => idx < tokens.length && !/^[a-zA-Z]$/.test(tokens[idx]);
  const nextNum = () => Number(tokens[idx++]);

  const flushSubpath = (closed) => {
    if (curPts.length >= 2) {
      subpaths.push({ pts: curPts, closed: !!closed });
    }
    curPts = [];
  };

  let cmd = '';
  while (idx < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[idx])) {
      cmd = tokens[idx++];
    } else if (!cmd) {
      break;
    }

    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;

    if (upper === 'Z') {
      flushSubpath(true);
      curX = startX;
      curY = startY;
      prevCmd = 'Z';
      cmd = '';
      continue;
    }

    if (upper === 'M') {
      flushSubpath(false);
      const x = nextNum() + (rel ? curX : 0);
      const y = nextNum() + (rel ? curY : 0);
      curX = startX = x;
      curY = startY = y;
      curPts.push([curX, curY]);
      prevCmd = 'M';
      cmd = rel ? 'l' : 'L';
      continue;
    }

    if (upper === 'L') {
      while (hasNum()) {
        curX = nextNum() + (rel ? curX : 0);
        curY = nextNum() + (rel ? curY : 0);
        curPts.push([curX, curY]);
      }
      prevCmd = 'L';
    } else if (upper === 'H') {
      while (hasNum()) {
        curX = nextNum() + (rel ? curX : 0);
        curPts.push([curX, curY]);
      }
      prevCmd = 'H';
    } else if (upper === 'V') {
      while (hasNum()) {
        curY = nextNum() + (rel ? curY : 0);
        curPts.push([curX, curY]);
      }
      prevCmd = 'V';
    } else if (upper === 'C') {
      while (hasNum()) {
        const x1 = nextNum() + (rel ? curX : 0);
        const y1 = nextNum() + (rel ? curY : 0);
        const x2 = nextNum() + (rel ? curX : 0);
        const y2 = nextNum() + (rel ? curY : 0);
        const x = nextNum() + (rel ? curX : 0);
        const y = nextNum() + (rel ? curY : 0);
        const steps = 10;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps, mt = 1 - t;
          curPts.push([
            mt * mt * mt * curX + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x,
            mt * mt * mt * curY + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y
          ]);
        }
        prevCtrlX = x2; prevCtrlY = y2;
        curX = x; curY = y;
        prevCmd = 'C';
      }
    } else if (upper === 'S') {
      while (hasNum()) {
        const x1 = (prevCmd === 'C' || prevCmd === 'S') ? (2 * curX - prevCtrlX) : curX;
        const y1 = (prevCmd === 'C' || prevCmd === 'S') ? (2 * curY - prevCtrlY) : curY;
        const x2 = nextNum() + (rel ? curX : 0);
        const y2 = nextNum() + (rel ? curY : 0);
        const x = nextNum() + (rel ? curX : 0);
        const y = nextNum() + (rel ? curY : 0);
        const steps = 10;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps, mt = 1 - t;
          curPts.push([
            mt * mt * mt * curX + 3 * mt * mt * t * x1 + 3 * mt * mt * t * x2 + t * t * t * x,
            mt * mt * mt * curY + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y
          ]);
        }
        prevCtrlX = x2; prevCtrlY = y2;
        curX = x; curY = y;
        prevCmd = 'S';
      }
    } else if (upper === 'Q') {
      while (hasNum()) {
        const x1 = nextNum() + (rel ? curX : 0);
        const y1 = nextNum() + (rel ? curY : 0);
        const x = nextNum() + (rel ? curX : 0);
        const y = nextNum() + (rel ? curY : 0);
        const steps = 8;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps, mt = 1 - t;
          curPts.push([
            mt * mt * curX + 2 * mt * t * x1 + t * t * x,
            mt * mt * curY + 2 * mt * t * y1 + t * t * y
          ]);
        }
        prevCtrlX = x1; prevCtrlY = y1;
        curX = x; curY = y;
        prevCmd = 'Q';
      }
    } else if (upper === 'T') {
      while (hasNum()) {
        const x1 = (prevCmd === 'Q' || prevCmd === 'T') ? (2 * curX - prevCtrlX) : curX;
        const y1 = (prevCmd === 'Q' || prevCmd === 'T') ? (2 * curY - prevCtrlY) : curY;
        const x = nextNum() + (rel ? curX : 0);
        const y = nextNum() + (rel ? curY : 0);
        const steps = 8;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps, mt = 1 - t;
          curPts.push([
            mt * mt * curX + 2 * mt * t * x1 + t * t * x,
            mt * mt * curY + 2 * mt * t * y1 + t * t * y
          ]);
        }
        prevCtrlX = x1; prevCtrlY = y1;
        curX = x; curY = y;
        prevCmd = 'T';
      }
    } else if (upper === 'A') {
      while (hasNum()) {
        const rx = nextNum();
        const ry = nextNum();
        const rot = nextNum();
        const largeArc = nextNum() !== 0;
        const sweep = nextNum() !== 0;
        const x = nextNum() + (rel ? curX : 0);
        const y = nextNum() + (rel ? curY : 0);
        sampleSvgArcToPoints(curX, curY, rx, ry, rot, largeArc, sweep, x, y, curPts);
        curX = x; curY = y;
        prevCmd = 'A';
      }
    } else {
      break;
    }
  }
  flushSubpath(false);
  return subpaths;
}

function simplifyPolylineRDP(pts, closed, epsilon = 0.0018, maxVerts = 48) {
  if (!pts || pts.length <= 3) return pts ? pts.slice() : [];
  const dedup = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (dedup.length === 0 || Math.hypot(p[0] - dedup[dedup.length - 1][0], p[1] - dedup[dedup.length - 1][1]) > 1e-5) {
      dedup.push(p);
    }
  }
  if (closed && dedup.length >= 3 && Math.hypot(dedup[0][0] - dedup[dedup.length - 1][0], dedup[0][1] - dedup[dedup.length - 1][1]) < 1e-4) {
    dedup.pop();
  }
  if (dedup.length <= 4) return dedup;

  const rdpOpen = (arr, eps) => {
    if (arr.length <= 2) return arr;
    let maxD = 0, idx = 0;
    const a = arr[0], b = arr[arr.length - 1];
    for (let i = 1; i < arr.length - 1; i++) {
      const d = pointToSegDist(arr[i][0], arr[i][1], a[0], a[1], b[0], b[1]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps) {
      const left = rdpOpen(arr.slice(0, idx + 1), eps);
      const right = rdpOpen(arr.slice(idx), eps);
      return left.slice(0, -1).concat(right);
    }
    return [a, b];
  };

  let curEps = epsilon;
  let simplified = dedup;
  for (let pass = 0; pass < 6; pass++) {
    if (closed) {
      const half = Math.floor(dedup.length / 2);
      const pA = rdpOpen(dedup.slice(0, half + 1), curEps);
      const pB = rdpOpen(dedup.slice(half).concat([dedup[0]]), curEps);
      simplified = pA.slice(0, -1).concat(pB.slice(0, -1));
    } else {
      simplified = rdpOpen(dedup, curEps);
    }
    if (simplified.length <= maxVerts) break;
    curEps *= 1.65;
  }

  if (simplified.length > maxVerts) {
    const step = simplified.length / maxVerts;
    const capped = [];
    for (let i = 0; i < maxVerts; i++) capped.push(simplified[Math.floor(i * step)]);
    return capped;
  }
  return simplified;
}

function parseSvgToNormalizedShapes(svgText) {
  if (!svgText || typeof svgText !== 'string' || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return [];

  const rawShapes = [];
  const parseNumAttr = (el, name, def = 0) => {
    const v = el.getAttribute(name);
    if (!v) return def;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : def;
  };

  const walkNode = (node, parentMat) => {
    if (!node || node.nodeType !== 1) return;
    const tag = (node.tagName || '').toLowerCase().replace(/^.*:/, '');
    if (tag === 'defs' || tag === 'clippath' || tag === 'mask' || tag === 'style' || tag === 'metadata') return;
    // Skip WebMapper's own exported calibration-grid helper layer on round-trip re-import!
    if (node.getAttribute('id') === 'calibration-grid') return;

    const localMat = parseSvgTransformAttr(node.getAttribute('transform'));
    const mat = multiplyAffine2D(parentMat, localMat);
    const label = node.getAttribute('data-name') || node.getAttribute('id') || '';

    const pushShape = (pts, closed, kindHint = 'auto') => {
      const xformed = pts.map(p => applyAffine2D(mat, p[0], p[1]));
      if (xformed.length >= (closed ? 3 : 2)) {
        rawShapes.push({ name: label, pts: xformed, closed, kindHint });
      }
    };

    if (tag === 'rect') {
      const x = parseNumAttr(node, 'x', 0);
      const y = parseNumAttr(node, 'y', 0);
      const w = parseNumAttr(node, 'width', 0);
      const h = parseNumAttr(node, 'height', 0);
      if (w > 0 && h > 0) {
        pushShape([[x, y + h], [x + w, y + h], [x + w, y], [x, y]], true, 'quad');
      }
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = parseNumAttr(node, 'cx', 0);
      const cy = parseNumAttr(node, 'cy', 0);
      const rx = tag === 'circle' ? parseNumAttr(node, 'r', 0) : parseNumAttr(node, 'rx', 0);
      const ry = tag === 'circle' ? rx : parseNumAttr(node, 'ry', 0);
      if (rx > 0 && ry > 0) {
        pushShape(
          [[cx - rx, cy + ry], [cx + rx, cy + ry], [cx + rx, cy - ry], [cx - rx, cy - ry]],
          true,
          'circle'
        );
      }
    } else if (tag === 'line') {
      const x1 = parseNumAttr(node, 'x1', 0), y1 = parseNumAttr(node, 'y1', 0);
      const x2 = parseNumAttr(node, 'x2', 0), y2 = parseNumAttr(node, 'y2', 0);
      if (Math.hypot(x2 - x1, y2 - y1) > 1e-4) {
        pushShape([[x1, y1], [x2, y2]], false, 'line');
      }
    } else if (tag === 'polygon' || tag === 'polyline') {
      const nums = ((node.getAttribute('points') || '').match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);
      const pts = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      pushShape(pts, tag === 'polygon');
    } else if (tag === 'path') {
      const subs = parseSvgPathDataToSubpaths(node.getAttribute('d') || '');
      const fillAttr = (node.getAttribute('fill') || '').trim().toLowerCase();
      const styleAttr = (node.getAttribute('style') || '').toLowerCase();
      const strokeOnly = (fillAttr === 'none' || styleAttr.includes('fill:none') || styleAttr.includes('fill: none'));
      subs.forEach((sub, sIdx) => {
        const closed = sub.closed && !(strokeOnly && !sub.closed);
        const subName = subs.length > 1 && label ? `${label} ${sIdx + 1}` : label;
        const xformed = sub.pts.map(p => applyAffine2D(mat, p[0], p[1]));
        if (xformed.length >= (closed ? 3 : 2)) {
          rawShapes.push({
            name: subName,
            pts: xformed,
            closed: sub.closed,
            kindHint: (!sub.closed || strokeOnly && !sub.closed) ? 'line' : 'auto'
          });
        }
      });
    }

    for (const child of Array.from(node.children || [])) {
      walkNode(child, mat);
    }
  };

  walkNode(svgEl, [1, 0, 0, 1, 0, 0]);
  if (rawShapes.length === 0) return [];

  // Resolve SVG viewBox or bounding box
  let vbMinX = 0, vbMinY = 0, vbW = 0, vbH = 0;
  const vbAttr = svgEl.getAttribute('viewBox');
  if (vbAttr) {
    const nums = (vbAttr.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);
    if (nums.length >= 4 && nums[2] > 0 && nums[3] > 0) {
      [vbMinX, vbMinY, vbW, vbH] = nums;
    }
  }
  if (vbW <= 0 || vbH <= 0) {
    vbW = parseNumAttr(svgEl, 'width', 0);
    vbH = parseNumAttr(svgEl, 'height', 0);
  }
  if (vbW <= 0 || vbH <= 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const sh of rawShapes) {
      for (const p of sh.pts) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
      }
    }
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    vbMinX = minX - spanX * 0.06;
    vbMinY = minY - spanY * 0.06;
    vbW = spanX * 1.12;
    vbH = spanY * 1.12;
  }

  // Fit SVG aspect into Stage aspect without distortion (1:1 exact when aspects match!)
  const stageAsp = state.stageAspect > 0.01 ? state.stageAspect : (16 / 9);
  const svgAsp = vbW / Math.max(1e-6, vbH);
  let offX = 0, offY = 0, scaleX = 1, scaleY = 1;
  if (Math.abs(svgAsp - stageAsp) > 0.025) {
    if (svgAsp > stageAsp) {
      scaleX = 0.92;
      scaleY = 0.92 * (stageAsp / svgAsp);
    } else {
      scaleY = 0.92;
      scaleX = 0.92 * (svgAsp / stageAsp);
    }
    offX = (1 - scaleX) * 0.5;
    offY = (1 - scaleY) * 0.5;
  }

  return rawShapes.map(sh => {
    const normPts = sh.pts.map(p => [
      offX + ((p[0] - vbMinX) / vbW) * scaleX,
      offY + (1.0 - (p[1] - vbMinY) / vbH) * scaleY
    ]);
    const maxV = sh.closed ? 48 : 96;
    const simp = (sh.kindHint === 'quad' || sh.kindHint === 'circle')
      ? normPts
      : simplifyPolylineRDP(normPts, sh.closed, 0.0016, maxV);
    return {
      name: sh.name,
      closed: sh.closed,
      kindHint: sh.kindHint,
      points: simp
    };
  }).filter(sh => sh.points.length >= (sh.closed ? 3 : 2));
}

function importSvgIntoScene(svgText, targetMode = 'surfaces', fileLabel = 'SVG') {
  const shapes = parseSvgToNormalizedShapes(svgText);
  if (shapes.length === 0) {
    showToast('No vector paths or shapes found in SVG');
    return 0;
  }

  pushUndoCheckpoint(`Import SVG (${shapes.length})`);

  if (targetMode === 'masks') {
    const createdMasks = [];
    for (const sh of shapes) {
      if (sh.points.length < 3) continue;
      const m = createMask({
        name: sh.name || `${fileLabel} Mask ${state.nextMaskNum}`,
        points: sh.points
      });
      state.masks.unshift(m);
      createdMasks.push(m);
    }
    if (createdMasks.length > 0) {
      state.selectedMaskId = createdMasks[0].id;
      state._sceneSyncRev++;
      switchLeftTab('masks');
      switchInspTab('mask');
      renderMaskList();
      syncMaskInspectorUI();
      scheduleAutosave();
      showToast(`Imported ${createdMasks.length} SVG Cutout Mask(s)`);
    }
    return createdMasks.length;
  }

  const grp = shapes.length > 1
    ? createSurfaceGroup({ name: `${fileLabel} SVG (${shapes.length})` })
    : null;
  if (grp) state.groups.unshift(grp);

  const createdSurfs = [];
  // SVG painters order is back-to-front; state.surfaces[0] is front-most, so unshift each in order!
  for (const sh of shapes) {
    let type = 'polygon';
    if (!sh.closed || sh.kindHint === 'line') {
      type = 'line';
    } else if (sh.kindHint === 'circle' && sh.points.length === 4) {
      type = 'circle';
    } else if ((sh.kindHint === 'quad' || sh.points.length === 4) && isQuadStrictlyConvex(sh.points)) {
      type = 'quad';
    } else if (sh.points.length === 3) {
      type = 'triangle';
    }

    const surf = createSurface(type, {
      name: sh.name || undefined,
      groupId: grp ? grp.id : null,
      points: sh.points,
      lineClosed: sh.closed && type === 'line'
    });
    if (type === 'triangle') {
      // Map triangle UVs proportionally to Stage bounding coordinates
      surf.triUvs = sh.points.map(p => [clamp(p[0], 0, 1), clamp(p[1], 0, 1)]);
    }
    state.surfaces.unshift(surf);
    createdSurfs.push(surf);
  }

  if (createdSurfs.length > 0) {
    state.selectedSurfaceId = createdSurfs[0].id;
    state.selectedSurfaceIds = createdSurfs.map(s => s.id);
    state._sceneSyncRev++;
    switchLeftTab('surfaces');
    switchInspTab('surface');
    renderSurfaceList();
    syncInspectorUI();
    scheduleAutosave();
    showToast(`Imported ${createdSurfs.length} SVG Surface(s)`);
  }
  return createdSurfs.length;
}

// ============================================================================
// 2. PERSPECTIVE-TRUE QUAD N×M GRID CLONER / SUBDIVIDER
// ============================================================================

function openQuadClonerModal() {
  const sel = getSelectedSurface();
  if (!sel || sel.type !== 'quad') {
    showToast('Select a Quad surface first to subdivide into an N×M grid');
    return;
  }
  const dlg = document.getElementById('cloner-dialog');
  if (!dlg) return;
  const subEl = document.getElementById('cloner-target-label');
  if (subEl) subEl.textContent = `Target: ${sel.name} (${isCurvedMeshSurface(sel) ? 'Curved Mesh' : 'Perspective Homography'})`;
  if (!dlg.open) dlg.showModal();
}

function executeQuadGridClone(colsIn, rowsIn, gapPctIn, sliceUv = true, groupTiles = true) {
  const sel = getSelectedSurface();
  if (!sel || sel.type !== 'quad') return 0;

  const cols = clamp(Math.round(colsIn || 3), 1, 16);
  const rows = clamp(Math.round(rowsIn || 3), 1, 16);
  if (cols === 1 && rows === 1) {
    showToast('Choose at least 2 columns or 2 rows to split');
    return 0;
  }
  const gap = clamp(Number(gapPctIn) || 0, 0, 0.45);

  pushUndoCheckpoint(`Split ${sel.name} ${cols}×${rows}`);

  const curved = isCurvedMeshSurface(sel);
  const hom = computeQuadHomography(sel.points);
  const decomp = curved ? getMeshDisplacementGrid(sel) : null;
  const evalStagePt = (u, v) => curved
    ? evalCurvedSurfacePoint(sel, u, v, decomp)
    : evalHomographyForward(hom.H, u, v);

  const src = getSourceById(sel.sourceId);
  const srcAspect = src ? (src.width / Math.max(1, src.height)) : (16 / 9);
  const rotRad = ((sel.uvRot || 0) * Math.PI) / 180;
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);

  const grp = groupTiles
    ? createSurfaceGroup({
        name: `${sel.name} (${cols}×${rows})`,
        accent: sel.accent
      })
    : null;
  if (grp) state.groups.unshift(grp);

  const tiles = [];
  // Build top-to-bottom, left-to-right for intuitive Surface List ordering
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const u0 = (c + gap * 0.5) / cols;
      const u1 = (c + 1 - gap * 0.5) / cols;
      const v0 = (r + gap * 0.5) / rows;
      const v1 = (r + 1 - gap * 0.5) / rows;

      const bl = evalStagePt(u0, v0);
      const br = evalStagePt(u1, v0);
      const tr = evalStagePt(u1, v1);
      const tl = evalStagePt(u0, v1);

      let uvX = sel.uvX, uvY = sel.uvY, uvW = sel.uvW, uvH = sel.uvH;
      if (sliceUv) {
        const uMid = (u0 + u1) * 0.5;
        const vMid = (v0 + v1) * 0.5;
        const lx = (uMid - 0.5) * sel.uvW * srcAspect;
        const ly = (vMid - 0.5) * sel.uvH;
        const rx = lx * cosR - ly * sinR;
        const ry = lx * sinR + ly * cosR;
        uvX = sel.uvX + rx / Math.max(0.01, srcAspect);
        uvY = sel.uvY + ry;
        uvW = sel.uvW * (u1 - u0);
        uvH = sel.uvH * (v1 - v0);
      }

      const rowHuman = rows - r;
      const colHuman = c + 1;
      const tile = createSurface('quad', {
        name: `${sel.name} [${rowHuman},${colHuman}]`,
        accent: sel.accent,
        groupId: grp ? grp.id : sel.groupId,
        sourceId: sel.sourceId,
        points: [bl, br, tr, tl],
        uvX, uvY, uvW, uvH,
        uvRot: sel.uvRot,
        cropL: sel.cropL, cropR: sel.cropR, cropT: sel.cropT, cropB: sel.cropB,
        blendMode: sel.blendMode,
        opacity: sel.opacity,
        feather: sel.feather,
        blendGamma: sel.blendGamma,
        blackLevel: sel.blackLevel,
        brightness: sel.brightness,
        contrast: sel.contrast,
        saturation: sel.saturation,
        colorTemp: sel.colorTemp,
        borderWidth: sel.borderWidth,
        borderGlow: sel.borderGlow,
        borderChase: sel.borderChase,
        borderSpeed: sel.borderSpeed
      });
      tiles.push(tile);
    }
  }

  const origIdx = state.surfaces.findIndex(s => s.id === sel.id);
  if (origIdx >= 0) {
    state.surfaces.splice(origIdx, 1, ...tiles);
  } else {
    state.surfaces.unshift(...tiles);
  }

  state.selectedSurfaceId = tiles[0].id;
  state.selectedSurfaceIds = tiles.map(t => t.id);
  state.selectedVertex = null;
  state._sceneSyncRev++;

  renderSurfaceList();
  syncInspectorUI();
  scheduleAutosave();
  showToast(`Split into ${tiles.length} perspective-locked tiles (${cols}×${rows})`);
  return tiles.length;
}

// ============================================================================
// 3. CANONICAL STAGE UV WIREFRAME TEMPLATE EXPORTER (PNG & SVG)
// ============================================================================

function escapeXmlText(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getCanonicalTemplateDimensions() {
  const w = clamp(Math.round(state.stageWidth || 1920), 256, 4096);
  const h = clamp(Math.round(state.stageHeight || 1080), 256, 4096);
  return { w, h };
}

function exportStageTemplatePNG() {
  const { w, h } = getCanonicalTemplateDimensions();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  const toPx = (sx, sy) => [sx * w, (1.0 - sy) * h];

  // Blueprint background
  ctx.fillStyle = '#070b12';
  ctx.fillRect(0, 0, w, h);

  // Calibration grid
  const gx = clamp(state.gridDivsX || 16, 2, 64);
  const gy = clamp(state.gridDivsY || 9, 2, 64);
  ctx.strokeStyle = 'rgba(111, 211, 255, 0.14)';
  ctx.lineWidth = Math.max(1, w / 1920);
  ctx.beginPath();
  for (let i = 1; i < gx; i++) {
    const x = (i / gx) * w;
    ctx.moveTo(x, 0); ctx.lineTo(x, h);
  }
  for (let j = 1; j < gy; j++) {
    const y = (j / gy) * h;
    ctx.moveTo(0, y); ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Center axes & outer frame
  ctx.strokeStyle = 'rgba(255, 203, 125, 0.35)';
  ctx.lineWidth = Math.max(1.5, (w / 1920) * 1.5);
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.5, h);
  ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
  ctx.stroke();

  // Render visible surfaces back-to-front
  for (let i = state.surfaces.length - 1; i >= 0; i--) {
    const surf = state.surfaces[i];
    const eff = getEffectiveSurfaceProps(surf, state.groups);
    if (!eff.visible) continue;
    if (surf.type !== 'mesh3d' && (!surf.points || surf.points.length < 2)) continue;

    const contour = getSurfacePerimeterContour(surf);
    if (contour.pts.length < 2) continue;

    // Internal projected wireframe lines for 3D Mesh Surfaces
    if (surf.type === 'mesh3d') {
      const geom = getSurfaceMesh3DGeometry(surf);
      if (geom && geom.edges && geom.edges.length > 0) {
        const { mvp } = resolveSurface3DRenderMatrices(surf, w / h, w, h);
        ctx.strokeStyle = hexToRgba(surf.accent || '#6fd3ff', 0.42);
        ctx.lineWidth = Math.max(1, (w / 1920) * 1.25);
        ctx.beginPath();
        for (const [iA, iB] of geom.edges) {
          const pA = projectPoint3DWithMvp(geom.uniqueVerts[iA], mvp);
          const pB = projectPoint3DWithMvp(geom.uniqueVerts[iB], mvp);
          if (pA.behind || pB.behind) continue;
          const [ax, ay] = toPx(pA.u, pA.v);
          const [bx, by] = toPx(pB.u, pB.v);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      }
    }

    // Internal perspective subdivision lines for Quads / Curved Meshes
    if (surf.type === 'quad' && surf.points.length === 4) {
      const curved = isCurvedMeshSurface(surf);
      const hom = computeQuadHomography(surf.points);
      const decomp = curved ? getMeshDisplacementGrid(surf) : null;
      const evalP = (u, v) => curved ? evalCurvedSurfacePoint(surf, u, v, decomp) : evalHomographyForward(hom.H, u, v);

      ctx.strokeStyle = hexToRgba(surf.accent, 0.28);
      ctx.lineWidth = Math.max(1, w / 1920);
      ctx.beginPath();
      for (let g = 1; g < 8; g++) {
        const t = g / 8;
        for (let s = 0; s <= 24; s++) {
          const [px, py] = toPx(...evalP(t, s / 24));
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        for (let s = 0; s <= 24; s++) {
          const [px, py] = toPx(...evalP(s / 24, t));
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }

    ctx.beginPath();
    contour.pts.forEach((pt, idx) => {
      const [px, py] = toPx(pt[0], pt[1]);
      if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    if (contour.closed) {
      ctx.closePath();
      ctx.fillStyle = hexToRgba(surf.accent, 0.14);
      ctx.fill();
    }
    ctx.strokeStyle = surf.accent || '#6fd3ff';
    ctx.lineWidth = Math.max(2, (w / 1920) * 2.5);
    ctx.stroke();

    // Label at centroid
    const [cx, cy] = toPx(...getSurfaceCentroid(surf));
    const fontPx = Math.round(clamp(w * 0.013, 12, 32));
    ctx.font = `700 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const tag = `${surf.name} (${surf.type.toUpperCase()})`;
    const tw = ctx.measureText(tag).width + 16;
    const th = fontPx + 10;
    ctx.fillStyle = 'rgba(7, 11, 18, 0.84)';
    ctx.fillRect(cx - tw * 0.5, cy - th * 0.5, tw, th);
    ctx.strokeStyle = surf.accent || '#6fd3ff';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx - tw * 0.5, cy - th * 0.5, tw, th);
    ctx.fillStyle = '#f2f7ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, cx, cy);
  }

  // Render visible masks
  for (const m of state.masks) {
    if (!m.visible || !m.points || m.points.length < 3) continue;
    const pts = getEvaluatedMaskPoints(m, 128);
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    pts.forEach((pt, idx) => {
      const [px, py] = toPx(pt[0], pt[1]);
      if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = m.mode === 'add' ? 'rgba(52, 232, 158, 0.10)' : 'rgba(255, 93, 120, 0.14)';
    ctx.fill();
    ctx.strokeStyle = m.mode === 'add' ? '#34e89e' : '#ff5d78';
    ctx.lineWidth = Math.max(1.8, (w / 1920) * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Footer slate
  ctx.fillStyle = 'rgba(7, 11, 18, 0.82)';
  ctx.fillRect(14, h - 38, 430, 26);
  ctx.fillStyle = '#9db4d0';
  ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${APP_NAME_UPPER} STAGE UV TEMPLATE • ${w}×${h}px`, 24, h - 25);

  c.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chaos-cathoderay-stage-template-${w}x${h}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
    showToast(`Exported ${w}×${h} Stage UV PNG Template`);
  }, 'image/png');
}

function buildStageTemplateSvgString() {
  const { w, h } = getCanonicalTemplateDimensions();
  const fmt = (n) => Number(n).toFixed(2);
  const toPx = (sx, sy) => [sx * w, (1.0 - sy) * h];

  const lines = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
  lines.push(`  <g id="calibration-grid">`);
  lines.push(`    <rect x="0" y="0" width="${w}" height="${h}" fill="#070b12" stroke="#ffcb7d" stroke-opacity="0.4" stroke-width="2" />`);

  const gx = clamp(state.gridDivsX || 16, 2, 64);
  const gy = clamp(state.gridDivsY || 9, 2, 64);
  for (let i = 1; i < gx; i++) {
    const x = fmt((i / gx) * w);
    lines.push(`    <line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#6fd3ff" stroke-opacity="0.14" stroke-width="1" />`);
  }
  for (let j = 1; j < gy; j++) {
    const y = fmt((j / gy) * h);
    lines.push(`    <line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#6fd3ff" stroke-opacity="0.14" stroke-width="1" />`);
  }
  lines.push(`    <line x1="${fmt(w * 0.5)}" y1="0" x2="${fmt(w * 0.5)}" y2="${h}" stroke="#ffcb7d" stroke-opacity="0.32" stroke-width="1.5" />`);
  lines.push(`    <line x1="0" y1="${fmt(h * 0.5)}" x2="${w}" y2="${fmt(h * 0.5)}" stroke="#ffcb7d" stroke-opacity="0.32" stroke-width="1.5" />`);
  lines.push(`  </g>`);

  lines.push(`  <g id="surfaces">`);
  for (let i = state.surfaces.length - 1; i >= 0; i--) {
    const surf = state.surfaces[i];
    const eff = getEffectiveSurfaceProps(surf, state.groups);
    if (!eff.visible) continue;
    if (surf.type !== 'mesh3d' && (!surf.points || surf.points.length < 2)) continue;
    const contour = getSurfacePerimeterContour(surf);
    if (contour.pts.length < 2) continue;

    const ptsAttr = contour.pts.map(pt => {
      const [px, py] = toPx(pt[0], pt[1]);
      return `${fmt(px)},${fmt(py)}`;
    }).join(' ');
    const safeName = escapeXmlText(surf.name);
    const col = escapeXmlText(surf.accent || '#6fd3ff');
    lines.push(`    <g id="${escapeXmlText(surf.id)}" data-name="${safeName}">`);
    if (contour.closed) {
      lines.push(`      <polygon data-name="${safeName}" points="${ptsAttr}" fill="${col}" fill-opacity="0.14" stroke="${col}" stroke-width="2.5" />`);
    } else {
      lines.push(`      <polyline data-name="${safeName}" points="${ptsAttr}" fill="none" stroke="${col}" stroke-width="3" />`);
    }
    if (surf.type === 'mesh3d') {
      const geom = getSurfaceMesh3DGeometry(surf);
      if (geom && geom.edges && geom.edges.length > 0) {
        const { mvp } = resolveSurface3DRenderMatrices(surf, w / h, w, h);
        const pathSegs = [];
        for (const [iA, iB] of geom.edges) {
          const pA = projectPoint3DWithMvp(geom.uniqueVerts[iA], mvp);
          const pB = projectPoint3DWithMvp(geom.uniqueVerts[iB], mvp);
          if (pA.behind || pB.behind) continue;
          const [ax, ay] = toPx(pA.u, pA.v);
          const [bx, by] = toPx(pB.u, pB.v);
          pathSegs.push(`M${fmt(ax)},${fmt(ay)}L${fmt(bx)},${fmt(by)}`);
        }
        if (pathSegs.length > 0) {
          lines.push(`      <path d="${pathSegs.join(' ')}" fill="none" stroke="${col}" stroke-opacity="0.48" stroke-width="1.25" />`);
        }
      }
    }
    const [cx, cy] = toPx(...getSurfaceCentroid(surf));
    lines.push(`      <text x="${fmt(cx)}" y="${fmt(cy)}" fill="#f2f7ff" font-family="monospace" font-size="16" font-weight="bold" text-anchor="middle" dominant-baseline="central">${safeName}</text>`);
    lines.push(`    </g>`);
  }
  lines.push(`  </g>`);

  lines.push(`  <g id="masks">`);
  for (const m of state.masks) {
    if (!m.visible || !m.points || m.points.length < 3) continue;
    const pts = getEvaluatedMaskPoints(m, 128);
    const ptsAttr = pts.map(pt => {
      const [px, py] = toPx(pt[0], pt[1]);
      return `${fmt(px)},${fmt(py)}`;
    }).join(' ');
    const col = m.mode === 'add' ? '#34e89e' : '#ff5d78';
    lines.push(`    <polygon id="${escapeXmlText(m.id)}" data-name="${escapeXmlText(m.name)}" points="${ptsAttr}" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-width="2" stroke-dasharray="8 6" />`);
  }
  lines.push(`  </g>`);
  lines.push(`</svg>`);
  return lines.join('\n');
}

function exportStageTemplateSVG() {
  const { w, h } = getCanonicalTemplateDimensions();
  const svgText = buildStageTemplateSvgString();
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chaos-cathoderay-stage-template-${w}x${h}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
  showToast(`Exported ${w}×${h} Vector SVG Stage Template`);
}

// ============================================================================
// 4. OPTICAL STRUCTURED-LIGHT GRAY-CODE "SPACE SCANNER" CALIBRATION
// ============================================================================

const scannerRuntime = {
  stream: null,
  running: false,
  abortRequested: false,
  capCanvas: null,
  capCtx: null
};

function setScannerStatus(msg) {
  const el = document.getElementById('scanner-status-text');
  if (el) el.textContent = msg;
}

async function populateScannerCameraSelect() {
  const sel = document.getElementById('sel-scanner-cam');
  if (!sel || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    const prev = sel.value;
    sel.innerHTML = '';
    if (cams.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Default Camera';
      sel.appendChild(opt);
      return;
    }
    cams.forEach((c, idx) => {
      const opt = document.createElement('option');
      opt.value = c.deviceId;
      opt.textContent = c.label || `Camera ${idx + 1}`;
      sel.appendChild(opt);
    });
    if (prev && cams.some(c => c.deviceId === prev)) sel.value = prev;
  } catch (_) {}
}

async function startScannerCamera(preferredDeviceId = null) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setScannerStatus('MediaDevices API unavailable in this browser.');
    return false;
  }
  stopScannerCamera(false);
  try {
    const sel = document.getElementById('sel-scanner-cam');
    const devId = preferredDeviceId ?? (sel ? sel.value : '');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: devId
        ? { deviceId: { exact: devId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    scannerRuntime.stream = stream;
    const vid = document.getElementById('scanner-video');
    if (vid) {
      vid.srcObject = stream;
      await vid.play();
    }
    await populateScannerCameraSelect();
    const track = stream.getVideoTracks()[0];
    const settings = track ? track.getSettings() : {};
    if (sel && settings.deviceId) sel.value = settings.deviceId;

    const projHint = projectorConnected
      ? '2nd-Screen Projector synced & ready.'
      : 'Tip: Open 2nd-Screen Projector pointed at the stage before running Gray-Code scan.';
    setScannerStatus(`Camera live (${vid ? vid.videoWidth : 1280}×${vid ? vid.videoHeight : 720}). ${projHint}`);
    return true;
  } catch (_) {
    setScannerStatus('Camera permission declined or camera busy.');
    return false;
  }
}

function stopScannerCamera(clearPattern = true) {
  scannerRuntime.abortRequested = true;
  scannerRuntime.running = false;
  if (clearPattern) {
    state.scannerPattern = null;
  }
  if (scannerRuntime.stream) {
    scannerRuntime.stream.getTracks().forEach(t => t.stop());
    scannerRuntime.stream = null;
  }
  const vid = document.getElementById('scanner-video');
  if (vid) {
    try { vid.pause(); vid.srcObject = null; } catch (_) {}
  }
}

async function openSpaceScannerModal() {
  const dlg = document.getElementById('scanner-dialog');
  if (!dlg) return;
  if (!dlg.open) dlg.showModal();
  await populateScannerCameraSelect();
  if (!scannerRuntime.stream) {
    await startScannerCamera();
  }
}

function waitScannerMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function grabScannerCameraFrame(capW, capH) {
  const vid = document.getElementById('scanner-video');
  if (!vid || vid.readyState < 2) return null;
  if (!scannerRuntime.capCanvas) {
    scannerRuntime.capCanvas = document.createElement('canvas');
    scannerRuntime.capCtx = scannerRuntime.capCanvas.getContext('2d', { willReadFrequently: true });
  }
  const c = scannerRuntime.capCanvas;
  if (c.width !== capW || c.height !== capH) {
    c.width = capW;
    c.height = capH;
  }
  scannerRuntime.capCtx.drawImage(vid, 0, 0, capW, capH);
  return scannerRuntime.capCtx.getImageData(0, 0, capW, capH).data;
}

function captureDirectCameraSnapshot() {
  const vid = document.getElementById('scanner-video');
  if (!vid || vid.readyState < 2) {
    showToast('Start camera preview first');
    return;
  }
  const w = vid.videoWidth || 1280;
  const h = vid.videoHeight || 720;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(vid, 0, 0, w, h);
  const dataUrl = c.toDataURL('image/jpeg', 0.86);
  setStageBackgroundDataUrl(dataUrl, true);
  if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
  scheduleAutosave();
  setScannerStatus('Captured direct camera frame into Stage Reference Guide!');
  showToast('Applied Camera Snapshot as Stage Reference');
}

async function runStructuredLightScan() {
  if (scannerRuntime.running) {
    scannerRuntime.abortRequested = true;
    return;
  }
  const vid = document.getElementById('scanner-video');
  if (!vid || vid.readyState < 2) {
    const ok = await startScannerCamera();
    if (!ok) return;
  }

  const bitsTotal = clamp(parseInt(document.getElementById('sel-scanner-bits')?.value || '8', 10), 6, 9);
  const settleMs = clamp(parseInt(document.getElementById('ctrl-scanner-delay')?.value || '115', 10), 50, 350);
  const contrastThresh = clamp(parseInt(document.getElementById('ctrl-scanner-thresh')?.value || '18', 10), 4, 90);

  const capW = 640;
  const capH = 360;
  const pixCount = capW * capH;

  scannerRuntime.running = true;
  scannerRuntime.abortRequested = false;
  const btnRun = document.getElementById('btn-scanner-run');
  if (btnRun) btnRun.textContent = '⏹ Stop Scan';

  const extractLuma = (rgba) => {
    const out = new Float32Array(pixCount);
    for (let i = 0, p = 0; i < pixCount; i++, p += 4) {
      out[i] = rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114;
    }
    return out;
  };

  try {
    // 1. All-Black baseline
    state.scannerPattern = { active: true, kind: 'black', bit: 0, bitsTotal, invert: false };
    setScannerStatus('Projecting Black baseline…');
    await waitScannerMs(Math.round(settleMs * 1.6));
    if (scannerRuntime.abortRequested) throw new Error('aborted');
    const blackRgba = grabScannerCameraFrame(capW, capH);
    const blackLuma = extractLuma(blackRgba);

    // 2. All-White flood illumination
    state.scannerPattern = { active: true, kind: 'white', bit: 0, bitsTotal, invert: false };
    setScannerStatus('Projecting White flood…');
    await waitScannerMs(Math.round(settleMs * 1.6));
    if (scannerRuntime.abortRequested) throw new Error('aborted');
    const whiteRgba = grabScannerCameraFrame(capW, capH);
    const whiteLuma = extractLuma(whiteRgba);

    // 3. Complementary Reflected Gray-Code X & Y bitplanes
    const grayX = new Uint16Array(pixCount);
    const grayY = new Uint16Array(pixCount);
    const totalSteps = bitsTotal * 2;
    let stepNum = 0;

    for (const axis of ['grayX', 'grayY']) {
      const targetArr = axis === 'grayX' ? grayX : grayY;
      for (let bit = bitsTotal - 1; bit >= 0; bit--) {
        stepNum++;
        setScannerStatus(`Scanning ${axis === 'grayX' ? 'Horizontal' : 'Vertical'} bit ${bitsTotal - bit}/${bitsTotal} (${stepNum}/${totalSteps})…`);

        state.scannerPattern = { active: true, kind: axis, bit, bitsTotal, invert: false };
        await waitScannerMs(settleMs);
        if (scannerRuntime.abortRequested) throw new Error('aborted');
        const posLuma = extractLuma(grabScannerCameraFrame(capW, capH));

        state.scannerPattern = { active: true, kind: axis, bit, bitsTotal, invert: true };
        await waitScannerMs(settleMs);
        if (scannerRuntime.abortRequested) throw new Error('aborted');
        const negLuma = extractLuma(grabScannerCameraFrame(capW, capH));

        const maskBit = 1 << bit;
        for (let i = 0; i < pixCount; i++) {
          if (posLuma[i] >= negLuma[i]) {
            targetArr[i] |= maskBit;
          }
        }
      }
    }

    state.scannerPattern = null;
    setScannerStatus('Reconstructing Projector-POV Stage Reference…');

    // 4. Decode Gray-Code -> Projector (u, v) bins and splat illuminated RGB
    const bins = 1 << bitsTotal;
    const gridLen = bins * bins;
    const sumR = new Float32Array(gridLen);
    const sumG = new Float32Array(gridLen);
    const sumB = new Float32Array(gridLen);
    const hits = new Uint16Array(gridLen);
    let validCamPixels = 0;

    const grayToBin = (g) => {
      let b = g;
      for (let shift = 1; shift < 16; shift <<= 1) b ^= (b >> shift);
      return b;
    };

    for (let i = 0, p = 0; i < pixCount; i++, p += 4) {
      const contrast = whiteLuma[i] - blackLuma[i];
      if (contrast < contrastThresh) continue;
      validCamPixels++;
      const bx = clamp(grayToBin(grayX[i]), 0, bins - 1);
      // Note: Stage Y=0 is bottom, Canvas Y=0 is top -> flip Y into image space!
      const byImg = clamp((bins - 1) - grayToBin(grayY[i]), 0, bins - 1);
      const cell = byImg * bins + bx;
      sumR[cell] += whiteRgba[p];
      sumG[cell] += whiteRgba[p + 1];
      sumB[cell] += whiteRgba[p + 2];
      hits[cell]++;
    }

    if (validCamPixels < 120) {
      setScannerStatus('Low projector contrast detected (<120 lit pixels). Aim camera at projected Stage or lower Contrast Threshold.');
      showToast('Low scan contrast — check projector output & threshold');
      return;
    }

    const rgbBuf = new Uint8ClampedArray(gridLen * 4);
    const filled = new Uint8Array(gridLen);
    for (let cell = 0; cell < gridLen; cell++) {
      const c = hits[cell];
      const o = cell * 4;
      if (c > 0) {
        rgbBuf[o] = Math.round(sumR[cell] / c);
        rgbBuf[o + 1] = Math.round(sumG[cell] / c);
        rgbBuf[o + 2] = Math.round(sumB[cell] / c);
        rgbBuf[o + 3] = 255;
        filled[cell] = 1;
      } else {
        rgbBuf[o] = 8;
        rgbBuf[o + 1] = 12;
        rgbBuf[o + 2] = 20;
        rgbBuf[o + 3] = 255;
      }
    }

    // 3-pass 3×3 neighborhood hole-fill for smooth continuous Projector-POV reconstruction
    for (let pass = 0; pass < 3; pass++) {
      const nextFilled = filled.slice();
      for (let y = 1; y < bins - 1; y++) {
        for (let x = 1; x < bins - 1; x++) {
          const idx = y * bins + x;
          if (filled[idx]) continue;
          let sr = 0, sg = 0, sb = 0, cnt = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nIdx = (y + dy) * bins + (x + dx);
              if (filled[nIdx]) {
                const no = nIdx * 4;
                sr += rgbBuf[no];
                sg += rgbBuf[no + 1];
                sb += rgbBuf[no + 2];
                cnt++;
              }
            }
          }
          if (cnt >= 2) {
            const o = idx * 4;
            rgbBuf[o] = Math.round(sr / cnt);
            rgbBuf[o + 1] = Math.round(sg / cnt);
            rgbBuf[o + 2] = Math.round(sb / cnt);
            nextFilled[idx] = 1;
          }
        }
      }
      filled.set(nextFilled);
    }

    const binCanvas = document.createElement('canvas');
    binCanvas.width = bins;
    binCanvas.height = bins;
    binCanvas.getContext('2d').putImageData(new ImageData(rgbBuf, bins, bins), 0, 0);

    const outAsp = state.stageAspect > 0.01 ? state.stageAspect : (16 / 9);
    const outW = 960;
    const outH = Math.max(240, Math.round(outW / outAsp));
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = outW;
    finalCanvas.height = outH;
    const fCtx = finalCanvas.getContext('2d');
    fCtx.imageSmoothingEnabled = true;
    fCtx.drawImage(binCanvas, 0, 0, outW, outH);

    const dataUrl = finalCanvas.toDataURL('image/jpeg', 0.88);
    setStageBackgroundDataUrl(dataUrl, true);
    if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
    scheduleAutosave();

    const pct = ((validCamPixels / pixCount) * 100).toFixed(1);
    setScannerStatus(`Scan complete! Reconstructed Projector-POV from ${pct}% illuminated camera pixels.`);
    showToast('Projector-POV Space Scan applied to Stage!');
  } catch (err) {
    state.scannerPattern = null;
    if (err && err.message === 'aborted') {
      setScannerStatus('Scan cancelled.');
    } else {
      setScannerStatus('Scan interrupted.');
    }
  } finally {
    state.scannerPattern = null;
    scannerRuntime.running = false;
    if (btnRun) btnRun.textContent = '⚡ Run Gray-Code Scan';
  }
}
