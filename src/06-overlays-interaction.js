// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 06-overlays-interaction.js — 2D Vector Overlays, Mesh/Mask Gizmos & Pointer Input
// ============================================================================

const inputOverlay = document.getElementById('input-overlay');
const stageOverlay = document.getElementById('stage-overlay');
const inputCtx = inputOverlay.getContext('2d');
const stageCtx = stageOverlay.getContext('2d');

let lastInputMetrics = null;
let lastStageMetrics = null;
let spacePanHeld = false;
let spacePanUsed = false;
let lastStagePointerClient = { x: 0, y: 0, sx: 0.5, sy: 0.5, inside: false };

function stageToPx(box, sx, sy) {
  return [box.x + sx * box.w, box.y + (1.0 - sy) * box.h];
}

function pxToStage(box, px, py) {
  return [(px - box.x) / Math.max(1, box.w), 1.0 - (py - box.y) / Math.max(1, box.h)];
}

function evalRectUvPoint(surf, u, v, srcAspect) {
  const uc = surf.cropL + (1.0 - surf.cropR - surf.cropL) * u;
  const vc = surf.cropB + (1.0 - surf.cropT - surf.cropB) * v;
  const lx = (uc - 0.5) * surf.uvW * srcAspect;
  const ly = (vc - 0.5) * surf.uvH;
  const rad = (surf.uvRot * Math.PI) / 180.0;
  const c = Math.cos(rad), s = Math.sin(rad);
  const rx = lx * c - ly * s;
  const ry = lx * s + ly * c;
  return [surf.uvX + rx / Math.max(0.01, srcAspect), surf.uvY + ry];
}

// Local rotated frame of a rect UV gizmo in pixels: centre, unit axes towards the
// right edge (ax) and the top edge (ay), half-extents, and corner pixels.
function buildUvRectDragFrame(giz) {
  const c = giz.center;
  const er = giz.edgesPx[1], et = giz.edgesPx[2];
  const hx = Math.max(2, Math.hypot(er[0] - c[0], er[1] - c[1]));
  const hy = Math.max(2, Math.hypot(et[0] - c[0], et[1] - c[1]));
  return {
    c: [c[0], c[1]],
    ax: [(er[0] - c[0]) / hx, (er[1] - c[1]) / hx],
    ay: [(et[0] - c[0]) / hy, (et[1] - c[1]) / hy],
    hx,
    hy,
    corners: giz.cornersPx.map(p => [p[0], p[1]])
  };
}

function getInputGizmoHandles(surf, box, srcAspect) {
  if (surf.type === 'triangle') {
    const ptsPx = surf.triUvs.map(uv => stageToPx(box, uv[0], uv[1]));
    const cx = (ptsPx[0][0] + ptsPx[1][0] + ptsPx[2][0]) / 3;
    const cy = (ptsPx[0][1] + ptsPx[1][1] + ptsPx[2][1]) / 3;
    return { kind: 'tri', ptsPx, center: [cx, cy], rotHandle: [cx, cy - 36] };
  }
  if (surf.type === 'polygon') {
    ensurePolygonUvs(surf);
    const uvs = (surf.polyUvs && surf.polyUvs.length > 0) ? surf.polyUvs : [[0.2, 0.2], [0.8, 0.2], [0.5, 0.8]];
    const ptsPx = uvs.map(uv => stageToPx(box, uv[0], uv[1]));
    let cx = 0, cy = 0;
    for (const p of ptsPx) { cx += p[0]; cy += p[1]; }
    cx /= Math.max(1, ptsPx.length);
    cy /= Math.max(1, ptsPx.length);
    return { kind: 'poly', ptsPx, center: [cx, cy], rotHandle: [cx, cy - 36] };
  }

  const cornersUv = [
    evalRectUvPoint(surf, 0, 0, srcAspect),
    evalRectUvPoint(surf, 1, 0, srcAspect),
    evalRectUvPoint(surf, 1, 1, srcAspect),
    evalRectUvPoint(surf, 0, 1, srcAspect)
  ];
  const cornersPx = cornersUv.map(uv => stageToPx(box, uv[0], uv[1]));
  const edgesPx = [
    [(cornersPx[3][0] + cornersPx[0][0]) * 0.5, (cornersPx[3][1] + cornersPx[0][1]) * 0.5],
    [(cornersPx[1][0] + cornersPx[2][0]) * 0.5, (cornersPx[1][1] + cornersPx[2][1]) * 0.5],
    [(cornersPx[3][0] + cornersPx[2][0]) * 0.5, (cornersPx[3][1] + cornersPx[2][1]) * 0.5],
    [(cornersPx[0][0] + cornersPx[1][0]) * 0.5, (cornersPx[0][1] + cornersPx[1][1]) * 0.5]
  ];
  const centerPx = [
    (cornersPx[0][0] + cornersPx[1][0] + cornersPx[2][0] + cornersPx[3][0]) * 0.25,
    (cornersPx[0][1] + cornersPx[1][1] + cornersPx[2][1] + cornersPx[3][1]) * 0.25
  ];
  const topMid = edgesPx[2];
  let nx = topMid[0] - centerPx[0];
  let ny = topMid[1] - centerPx[1];
  const nLen = Math.hypot(nx, ny) || 1;
  nx /= nLen; ny /= nLen;
  const rotHandle = [topMid[0] + nx * 24, topMid[1] + ny * 24];

  return { kind: 'rect', cornersPx, edgesPx, center: centerPx, topMid, rotHandle };
}

// ============================================================================
// 1. INPUT UV PANE OVERLAY RENDERER (+ POLAR MIX CIRCLE RADAR)
// ============================================================================

function getMixbusRadarMetrics(box) {
  const cx = box.x + box.w * 0.5;
  const cy = box.y + box.h * 0.5;
  const radPx = Math.max(36, Math.min(box.w, box.h) * 0.40);
  return { cx, cy, radPx };
}

function mixbusOrbToPx(box, ox, oy) {
  const { cx, cy, radPx } = getMixbusRadarMetrics(box);
  return [cx + ox * radPx, cy - oy * radPx];
}

function pxToMixbusOrb(box, px, py) {
  const { cx, cy, radPx } = getMixbusRadarMetrics(box);
  return [(px - cx) / radPx, (cy - py) / radPx];
}

function renderMixbusRadarOverlay(ctx, rect, box, mixSrc) {
  const { cx, cy, radPx } = getMixbusRadarMetrics(box);
  ctx.save();

  // Subtle dark radial vignette to make polar rings legible over bright shaders
  const grad = ctx.createRadialGradient(cx, cy, radPx * 0.12, cx, cy, radPx * 1.18);
  grad.addColorStop(0, 'rgba(5, 8, 14, 0.08)');
  grad.addColorStop(0.85, 'rgba(5, 8, 14, 0.28)');
  grad.addColorStop(1, 'rgba(5, 8, 14, 0.52)');
  ctx.fillStyle = grad;
  ctx.fillRect(box.x, box.y, box.w, box.h);

  // Inner reference rings (66%, 33% radial zones)
  [0.33, 0.66].forEach(f => {
    ctx.strokeStyle = 'rgba(111, 211, 255, 0.20)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, radPx * f, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Outer r = 1.0 Standby Orbit Rim (0% threshold)
  ctx.strokeStyle = 'rgba(52, 232, 158, 0.65)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, radPx, 0, Math.PI * 2);
  ctx.stroke();

  // Polar crosshair axes
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - radPx * 1.12, cy);
  ctx.lineTo(cx + radPx * 1.12, cy);
  ctx.moveTo(cx, cy - radPx * 1.12);
  ctx.lineTo(cx, cy + radPx * 1.12);
  ctx.stroke();

  // Center 100% Bullseye marker
  ctx.fillStyle = 'rgba(52, 232, 158, 0.20)';
  ctx.strokeStyle = '#34e89e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(220, 231, 247, 0.62)';
  ctx.font = '600 9.5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('0% STANDBY RIM', cx, cy - radPx - 7);

  const orbs = Array.isArray(mixSrc.orbs) ? mixSrc.orbs : [];
  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i];
    const weight = computeMixbusOrbWeight(orb, mixSrc.falloffCurve);
    const [opx, opy] = mixbusOrbToPx(box, orb.x, orb.y);
    const [tpx, tpy] = mixbusOrbToPx(box, orb.targetX, orb.targetY);
    const isSel = mixSrc.selectedOrbId === orb.id;
    const col = orb.accent || '#6fd3ff';
    const orbSrc = state.sources.find(s => s.id === orb.sourceId);
    const labelName = orbSrc ? orbSrc.name : orb.sourceId;

    // Radial energy spoke to center
    if (weight > 0.005) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.22 + weight * 0.55;
      ctx.lineWidth = 1 + weight * 2.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(opx, opy);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Damped target tether
    if (Math.hypot(tpx - opx, tpy - opy) > 2.5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.38)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(opx, opy);
      ctx.lineTo(tpx, tpy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const rVis = 12 + weight * 7;
    if (isSel) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(opx, opy, rVis + 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = orb.muted ? 'rgba(25, 32, 46, 0.90)' : 'rgba(9, 13, 22, 0.88)';
    ctx.strokeStyle = orb.muted ? 'rgba(255, 93, 120, 0.75)' : col;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(opx, opy, rVis, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Weight inner fill arc
    if (weight > 0.01) {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.25 + weight * 0.50;
      ctx.beginPath();
      ctx.arc(opx, opy, rVis * Math.sqrt(weight), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    const pctStr = orb.muted ? 'MUTE' : (weight <= 0.002 ? 'RIM 0%' : `${Math.round(weight * 100)}%`);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 9.5px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pctStr, opx, opy);

    // Source name tag below orb
    const shortName = String(labelName).slice(0, 16);
    const tagW = ctx.measureText(shortName).width + 10;
    ctx.fillStyle = 'rgba(7, 10, 16, 0.82)';
    ctx.fillRect(opx - tagW * 0.5, opy + rVis + 4, tagW, 14);
    ctx.fillStyle = isSel ? '#34e89e' : '#dce7f7';
    ctx.font = '600 9.5px sans-serif';
    ctx.fillText(shortName, opx, opy + rVis + 11);
  }

  // Bottom hint pill
  const hint = 'Drag Orb: Radial Mix • Shift+Drag: Orbit Constellation • Dbl-Click: Solo Center';
  ctx.font = '600 9.5px monospace';
  const hw = Math.min(box.w - 12, ctx.measureText(hint).width + 16);
  ctx.fillStyle = 'rgba(7, 10, 16, 0.78)';
  ctx.fillRect(cx - hw * 0.5, box.y + box.h - 22, hw, 17);
  ctx.fillStyle = 'rgba(220, 231, 247, 0.80)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hint, cx, box.y + box.h - 13.5);

  ctx.restore();
}

function renderInputOverlay(dpr, metrics) {
  const rect = inputOverlay.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (inputOverlay.width !== w || inputOverlay.height !== h) {
    inputOverlay.width = w;
    inputOverlay.height = h;
  }
  inputCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  inputCtx.clearRect(0, 0, rect.width, rect.height);
  if (!metrics || state.layoutMode === 'output' || state.projectorMode) return;

  const { box, src } = metrics;
  const srcAspect = src.width / Math.max(1, src.height);

  inputCtx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  inputCtx.lineWidth = 1;
  inputCtx.strokeRect(box.x, box.y, box.w, box.h);

  // Polar Mixing Radar when Mix Circle Bus is active in Orbs mode
  if (src.kind === 'mixbus' && src.editOrbsMode !== false) {
    renderMixbusRadarOverlay(inputCtx, rect, box, src);
    return;
  }

  // Phase 7A: Interactive 3D Orbit Viewport + 6-Point PnP Vertex Picker
  if (metrics.orbit3d && metrics.surf3d) {
    renderInput3DOrbitOverlay(inputCtx, rect, box, metrics);
    return;
  }

  if (!state.showWireframes || state.showLock) return;

  const sel = getSelectedSurface();
  for (let i = state.surfaces.length - 1; i >= 0; i--) {
    const surf = state.surfaces[i];
    const eff = getEffectiveSurfaceProps(surf);
    if (!eff.visible || surf.sourceId !== src.id) continue;
    if (surf.type === 'line' && !surf.lineUseSource) continue;
    if (surf.type === 'mesh3d') continue;
    if (sel && surf.id === sel.id) continue;

    const giz = getInputGizmoHandles(surf, box, srcAspect);
    inputCtx.save();
    inputCtx.strokeStyle = isSurfaceSelected(surf.id) ? 'rgba(52, 232, 158, 0.55)' : 'rgba(255, 255, 255, 0.24)';
    inputCtx.setLineDash([4, 4]);
    inputCtx.lineWidth = isSurfaceSelected(surf.id) ? 1.4 : 1;
    inputCtx.beginPath();
    const pts = (giz.kind === 'tri' || giz.kind === 'poly') ? giz.ptsPx : giz.cornersPx;
    if (pts.length >= 2) {
      pts.forEach((p, idx) => (idx === 0 ? inputCtx.moveTo(p[0], p[1]) : inputCtx.lineTo(p[0], p[1])));
      inputCtx.closePath();
      inputCtx.stroke();
    }
    inputCtx.restore();
  }

  if (sel && getEffectiveSurfaceProps(sel).visible) {
    if (sel.type === 'line' && !sel.lineUseSource) {
      inputCtx.save();
      inputCtx.fillStyle = 'rgba(7, 10, 16, 0.82)';
      const msg = 'Neon Line Accent Mode — enable "Use Media Source" in Inspector to sample UV';
      inputCtx.font = '600 10.5px sans-serif';
      const tw = Math.min(rect.width - 20, inputCtx.measureText(msg).width + 20);
      const bx = box.x + (box.w - tw) * 0.5;
      const by = box.y + box.h * 0.5 - 14;
      inputCtx.fillRect(bx, by, tw, 28);
      inputCtx.strokeStyle = sel.accent || '#6fd3ff';
      inputCtx.strokeRect(bx, by, tw, 28);
      inputCtx.fillStyle = '#dce7f7';
      inputCtx.textAlign = 'center';
      inputCtx.textBaseline = 'middle';
      inputCtx.fillText(msg, box.x + box.w * 0.5, box.y + box.h * 0.5);
      inputCtx.restore();
      return;
    }

    const giz = getInputGizmoHandles(sel, box, srcAspect);
    const col = sel.accent || '#6fd3ff';
    inputCtx.save();

    if (giz.kind === 'tri' || giz.kind === 'poly') {
      if (giz.ptsPx.length >= 3) {
        inputCtx.fillStyle = 'rgba(111, 211, 255, 0.11)';
        inputCtx.strokeStyle = col;
        inputCtx.lineWidth = 1.8;
        inputCtx.beginPath();
        giz.ptsPx.forEach((p, idx) => (idx === 0 ? inputCtx.moveTo(p[0], p[1]) : inputCtx.lineTo(p[0], p[1])));
        inputCtx.closePath();
        inputCtx.fill();
        inputCtx.stroke();
      }

      inputCtx.beginPath();
      inputCtx.setLineDash([3, 3]);
      inputCtx.moveTo(giz.center[0], giz.center[1]);
      inputCtx.lineTo(giz.rotHandle[0], giz.rotHandle[1]);
      inputCtx.stroke();
      inputCtx.setLineDash([]);

      inputCtx.fillStyle = '#ffcb7d';
      inputCtx.beginPath();
      inputCtx.arc(giz.rotHandle[0], giz.rotHandle[1], 5, 0, Math.PI * 2);
      inputCtx.fill();

      const triLabels = ['A', 'B', 'C'];
      giz.ptsPx.forEach((p, idx) => {
        inputCtx.fillStyle = '#090d14';
        inputCtx.strokeStyle = col;
        inputCtx.lineWidth = 2;
        inputCtx.beginPath();
        inputCtx.arc(p[0], p[1], giz.ptsPx.length > 10 ? 4.5 : 6, 0, Math.PI * 2);
        inputCtx.fill();
        inputCtx.stroke();

        if (giz.ptsPx.length <= 12) {
          inputCtx.fillStyle = '#fff';
          inputCtx.font = '600 9px monospace';
          const lbl = giz.kind === 'tri' ? triLabels[idx] : `P${idx + 1}`;
          inputCtx.fillText(lbl, p[0] + 8, p[1] - 6);
        }
      });
    } else {
      inputCtx.fillStyle = 'rgba(111, 211, 255, 0.09)';
      inputCtx.strokeStyle = col;
      inputCtx.lineWidth = 1.8;
      inputCtx.beginPath();
      giz.cornersPx.forEach((p, idx) => (idx === 0 ? inputCtx.moveTo(p[0], p[1]) : inputCtx.lineTo(p[0], p[1])));
      inputCtx.closePath();
      inputCtx.fill();
      inputCtx.stroke();

      if (sel.type === 'circle') {
        inputCtx.save();
        inputCtx.setLineDash([4, 3]);
        inputCtx.beginPath();
        for (let k = 0; k <= 48; k++) {
          const ang = (k / 48) * Math.PI * 2;
          const u = 0.5 + 0.5 * Math.cos(ang);
          const v = 0.5 + 0.5 * Math.sin(ang);
          const uv = evalRectUvPoint(sel, u, v, srcAspect);
          const px = stageToPx(box, uv[0], uv[1]);
          if (k === 0) inputCtx.moveTo(px[0], px[1]);
          else inputCtx.lineTo(px[0], px[1]);
        }
        inputCtx.stroke();
        inputCtx.restore();
      }

      inputCtx.beginPath();
      inputCtx.moveTo(giz.topMid[0], giz.topMid[1]);
      inputCtx.lineTo(giz.rotHandle[0], giz.rotHandle[1]);
      inputCtx.stroke();

      inputCtx.fillStyle = '#ffcb7d';
      inputCtx.strokeStyle = '#090d14';
      inputCtx.lineWidth = 1.5;
      inputCtx.beginPath();
      inputCtx.arc(giz.rotHandle[0], giz.rotHandle[1], 5.5, 0, Math.PI * 2);
      inputCtx.fill();
      inputCtx.stroke();

      giz.cornersPx.forEach(p => {
        inputCtx.fillStyle = '#fff';
        inputCtx.strokeStyle = '#090d14';
        inputCtx.fillRect(p[0] - 4.5, p[1] - 4.5, 9, 9);
        inputCtx.strokeRect(p[0] - 4.5, p[1] - 4.5, 9, 9);
      });

      giz.edgesPx.forEach(p => {
        inputCtx.fillStyle = col;
        inputCtx.strokeStyle = '#090d14';
        inputCtx.fillRect(p[0] - 3.5, p[1] - 3.5, 7, 7);
        inputCtx.strokeRect(p[0] - 3.5, p[1] - 3.5, 7, 7);
      });

      inputCtx.strokeStyle = col;
      inputCtx.beginPath();
      inputCtx.moveTo(giz.center[0] - 5, giz.center[1]);
      inputCtx.lineTo(giz.center[0] + 5, giz.center[1]);
      inputCtx.moveTo(giz.center[0], giz.center[1] - 5);
      inputCtx.lineTo(giz.center[0], giz.center[1] + 5);
      inputCtx.stroke();
    }
    inputCtx.restore();
  }
}

function renderInput3DOrbitOverlay(ctx, rect, box, metrics) {
  const surf = metrics.surf3d;
  const mvp = metrics.orbitMvp;
  if (!surf || !mvp) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();

  // 1. Subtle 3D Scenic Floor Reference Grid (y = -0.62)
  const floorY = -0.62;
  ctx.strokeStyle = 'rgba(111, 211, 255, 0.13)';
  ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i++) {
    const t = i * 0.25;
    const a1 = projectPoint3DWithMvp([t, floorY, -1.0], mvp);
    const a2 = projectPoint3DWithMvp([t, floorY, 1.0], mvp);
    if (!a1.behind && !a2.behind) {
      const p1 = stageToPx(box, a1.u, a1.v);
      const p2 = stageToPx(box, a2.u, a2.v);
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
    }
    const b1 = projectPoint3DWithMvp([-1.0, floorY, t], mvp);
    const b2 = projectPoint3DWithMvp([1.0, floorY, t], mvp);
    if (!b1.behind && !b2.behind) {
      const p1 = stageToPx(box, b1.u, b1.v);
      const p2 = stageToPx(box, b2.u, b2.v);
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
    }
  }

  // 2. XYZ World Axis Indicator at [-0.88, floorY, 0.88]
  const axOrig = [-0.88, floorY, 0.88];
  const pOrig = projectPoint3DWithMvp(axOrig, mvp);
  if (!pOrig.behind) {
    const oPx = stageToPx(box, pOrig.u, pOrig.v);
    const axes = [
      { end: [-0.56, floorY, 0.88], col: '#ff6b8b', lbl: 'X' },
      { end: [-0.88, floorY + 0.32, 0.88], col: '#34e89e', lbl: 'Y' },
      { end: [-0.88, floorY, 0.56], col: '#6fd3ff', lbl: 'Z' }
    ];
    ctx.font = '700 9px monospace';
    for (const ax of axes) {
      const pe = projectPoint3DWithMvp(ax.end, mvp);
      if (pe.behind) continue;
      const ePx = stageToPx(box, pe.u, pe.v);
      ctx.strokeStyle = ax.col;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(oPx[0], oPx[1]);
      ctx.lineTo(ePx[0], ePx[1]);
      ctx.stroke();
      ctx.fillStyle = ax.col;
      ctx.fillText(ax.lbl, ePx[0] + 4, ePx[1] - 3);
    }
  }

  // 3. Pickable 3D Model Vertices & Numbered 6-Point PnP Calibration Pins
  if (!state.showLock) {
    const geom = getSurfaceMesh3DGeometry(surf, state.objAssets);
    const verts = geom && Array.isArray(geom.uniqueVerts) ? geom.uniqueVerts : [];
    const stride = verts.length > 500 ? Math.ceil(verts.length / 450) : 1;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    for (let i = 0; i < verts.length; i += stride) {
      const pr = projectPoint3DWithMvp(verts[i], mvp);
      if (pr.behind) continue;
      const vPx = stageToPx(box, pr.u, pr.v);
      ctx.beginPath();
      ctx.arc(vPx[0], vPx[1], 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const hovIdx = state.hoveredOrbitVertIdx;
    if (hovIdx >= 0 && hovIdx < verts.length) {
      const pr = projectPoint3DWithMvp(verts[hovIdx], mvp);
      if (!pr.behind) {
        const hPx = stageToPx(box, pr.u, pr.v);
        ctx.strokeStyle = '#ffcb7d';
        ctx.fillStyle = 'rgba(255, 203, 125, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hPx[0], hPx[1], 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const lbl = `Click: Pin 3D V#${hovIdx}`;
        ctx.font = '600 9.5px monospace';
        const tw = ctx.measureText(lbl).width + 10;
        ctx.fillStyle = 'rgba(7, 10, 16, 0.88)';
        ctx.fillRect(hPx[0] + 10, hPx[1] - 18, tw, 17);
        ctx.strokeStyle = '#ffcb7d';
        ctx.lineWidth = 1;
        ctx.strokeRect(hPx[0] + 10, hPx[1] - 18, tw, 17);
        ctx.fillStyle = '#ffcb7d';
        ctx.fillText(lbl, hPx[0] + 15, hPx[1] - 6);
      }
    }

    const pins = Array.isArray(surf.calibPins) ? surf.calibPins : [];
    pins.forEach((pin, idx) => {
      if (!pin || !Array.isArray(pin.pos3d)) return;
      const pr = projectPoint3DWithMvp(pin.pos3d, mvp);
      if (pr.behind) return;
      const pPx = stageToPx(box, pr.u, pr.v);
      const isSelPin = idx === state.selectedCalibPinIdx;
      const isHovPin = idx === state.hoveredCalibPinIdx;
      if (isHovPin) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 203, 125, 0.9)';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(pPx[0], pPx[1], 11.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = (isSelPin || isHovPin) ? '#ffcb7d' : '#34e89e';
      ctx.strokeStyle = '#070a10';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(pPx[0], pPx[1], (isSelPin || isHovPin) ? 7.4 : 5.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const tag = `P${idx + 1}`;
      ctx.font = '700 9px monospace';
      const tw = ctx.measureText(tag).width + 8;
      ctx.fillStyle = 'rgba(7, 10, 16, 0.88)';
      ctx.fillRect(pPx[0] + 8, pPx[1] - 9, tw, 15);
      ctx.strokeStyle = (isSelPin || isHovPin) ? '#ffcb7d' : '#34e89e';
      ctx.lineWidth = 1;
      ctx.strokeRect(pPx[0] + 8, pPx[1] - 9, tw, 15);
      ctx.fillStyle = (isSelPin || isHovPin) ? '#ffcb7d' : '#34e89e';
      ctx.fillText(tag, pPx[0] + 12, pPx[1] + 2);
    });
  }

  // 4. Bottom HUD Hint Bar
  const hint = surf.calibMode === 'calibrated'
    ? `🎯 6-Pt PnP (${(surf.calibPins || []).length} pins) • Click 3D Vertex to Pin • Drag Stage P1..P6 onto Object`
    : '🧊 3D Orbit • Drag: Orbit • Shift+Drag: Pan • Wheel: Zoom • Click Vertex to Pin';
  ctx.font = '600 9.5px sans-serif';
  const hw = Math.min(box.w - 16, ctx.measureText(hint).width + 18);
  const hx = box.x + (box.w - hw) * 0.5;
  const hy = box.y + box.h - 26;
  ctx.fillStyle = 'rgba(7, 10, 16, 0.82)';
  ctx.fillRect(hx, hy, hw, 20);
  ctx.strokeStyle = 'rgba(111, 211, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(hx, hy, hw, 20);
  ctx.fillStyle = '#cfe2ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hint, box.x + box.w * 0.5, hy + 10);

  ctx.restore();
}

function getMesh3DGizmoHandles(surf, box) {
  const outW = state.stageWidth || 1920;
  const outH = state.stageHeight || 1080;
  const stAspect = outW / Math.max(1, outH);
  const mats = resolveSurface3DRenderMatrices(surf, stAspect, outW, outH, state.objAssets);
  const prCenter = projectPoint3DWithMvp([0, 0, 0], mats.mvp);
  let cxStage = prCenter.behind ? 0.5 : prCenter.u;
  let cyStage = prCenter.behind ? 0.5 : prCenter.v;
  if (prCenter.behind) {
    const cent = getSurfaceCentroid(surf);
    cxStage = cent[0];
    cyStage = cent[1];
  }
  const centerPx = stageToPx(box, cxStage, cyStage);
  const rotHandlePx = [centerPx[0], centerPx[1] - 32];
  return { mats, centerPx, rotHandlePx, centerStage: [cxStage, cyStage] };
}

// ============================================================================
// 2. OUTPUT STAGE OVERLAY RENDERER (Surfaces, Meshes, Multi-Box, Keystone, Loupe)
// ============================================================================

function getMultiBoxGizmo(bbox, box) {
  const bl = stageToPx(box, bbox.minX, bbox.minY);
  const br = stageToPx(box, bbox.maxX, bbox.minY);
  const tr = stageToPx(box, bbox.maxX, bbox.maxY);
  const tl = stageToPx(box, bbox.minX, bbox.maxY);
  const cornersPx = [bl, br, tr, tl];
  const centerPx = stageToPx(box, bbox.cx, bbox.cy);
  const topMidPx = [(tl[0] + tr[0]) * 0.5, (tl[1] + tr[1]) * 0.5];
  const rotHandlePx = [topMidPx[0], topMidPx[1] - 24];
  return { cornersPx, centerPx, topMidPx, rotHandlePx };
}

function resolveSelectedVertexStagePos() {
  const sv = state.selectedVertex;
  if (!sv) return null;
  if (sv.kind === 'keystone-pt') {
    const pt = state.masterKeystone?.points?.[sv.idx];
    if (!pt) return null;
    const labels = ['K-BL', 'K-BR', 'K-TR', 'K-TL'];
    return [pt[0], pt[1], labels[sv.idx] || `K${sv.idx + 1}`];
  }
  if (sv.kind === 'mask-pt') {
    const m = state.masks.find(x => x.id === sv.maskId);
    const pt = m?.points?.[sv.idx];
    if (!pt) return null;
    return [pt[0], pt[1], `M${sv.idx + 1}`];
  }
  const surf = state.surfaces.find(x => x.id === sv.surfId);
  if (!surf) return null;
  if (sv.kind === 'calib-pin') {
    const pin = surf.calibPins?.[sv.idx];
    if (!pin || !Array.isArray(pin.stage2d)) return null;
    return [pin.stage2d[0], pin.stage2d[1], `P${sv.idx + 1}`];
  }
  if (sv.kind === 'mesh-node') {
    ensureSurfaceMeshValid(surf);
    const pt = surf.meshPts?.[sv.idx];
    if (!pt) return null;
    const cols = (surf.meshCols || 3) + 1;
    const r = Math.floor(sv.idx / cols);
    const c = sv.idx % cols;
    return [pt[0], pt[1], `N(${c},${r})`];
  }
  if (sv.kind === 'surf-corner') {
    const pt = surf.points?.[sv.idx];
    if (!pt) return null;
    const labels = surf.type === 'triangle'
      ? ['A', 'B', 'C']
      : (surf.type === 'polygon'
          ? [`P${sv.idx + 1}`]
          : (surf.type === 'line' ? [`L${sv.idx + 1}`] : ['BL', 'BR', 'TR', 'TL']));
    const lbl = (surf.type === 'polygon' || surf.type === 'line')
      ? `${surf.type === 'polygon' ? 'P' : 'L'}${sv.idx + 1}`
      : (labels[sv.idx] || `V${sv.idx + 1}`);
    return [pt[0], pt[1], lbl];
  }
  return null;
}

function isMaskStageEditActive() {
  return state.leftTab === 'masks' || state.stageEditMode === 'mask' || !!state.drawingMaskId;
}

function isSurfaceShutterHandlesActive(surf) {
  if (!surf || surf.type === 'mesh3d' || surf.type === 'line') return false;
  if (state.shutterHandlesVisible) return true;
  const disc = document.getElementById('disc-framing-shutters');
  if (disc && disc.open) return true;
  return (surf.shutterL || 0) > 0.002 || (surf.shutterR || 0) > 0.002 ||
         (surf.shutterT || 0) > 0.002 || (surf.shutterB || 0) > 0.002;
}

function mapSurfaceLocalUvToStage(surf, u, v, homCache = null, decompCache = null) {
  const cu = clamp(u, 0, 1);
  const cv = clamp(v, 0, 1);
  if (isCurvedMeshSurface(surf)) {
    const decomp = decompCache || getMeshDisplacementGrid(surf);
    return evalCurvedSurfacePoint(surf, cu, cv, decomp);
  }
  if ((surf.type === 'quad' || surf.type === 'circle') && Array.isArray(surf.points) && surf.points.length === 4) {
    if (surf.quadWarp === 'perspective' && isQuadStrictlyConvex(surf.points)) {
      const hom = homCache || computeQuadHomography(surf.points);
      return evalHomographyForward(hom.H, cu, cv);
    }
    const [p0, p1, p2, p3] = surf.points;
    const bx = p0[0] + (p1[0] - p0[0]) * cu;
    const by = p0[1] + (p1[1] - p0[1]) * cu;
    const tx = p3[0] + (p2[0] - p3[0]) * cu;
    const ty = p3[1] + (p2[1] - p3[1]) * cu;
    return [bx + (tx - bx) * cv, by + (ty - by) * cv];
  }
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const pt of (surf.points || [])) {
    if (pt[0] < minX) minX = pt[0];
    if (pt[0] > maxX) maxX = pt[0];
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  }
  if (minX > maxX) return [0.5, 0.5];
  return [minX + (maxX - minX) * cu, minY + (maxY - minY) * cv];
}

function computeSurfaceShutterHandles(surf, box) {
  if (!isSurfaceShutterHandlesActive(surf)) return [];
  const hom = ((surf.type === 'quad' || surf.type === 'circle') && surf.quadWarp === 'perspective' && isQuadStrictlyConvex(surf.points))
    ? computeQuadHomography(surf.points)
    : null;
  const decomp = isCurvedMeshSurface(surf) ? getMeshDisplacementGrid(surf) : null;
  const blades = [
    { side: 'L', insKey: 'shutterL', angKey: 'shutterAngL', ins: clamp(surf.shutterL || 0, 0, 0.95), angDeg: surf.shutterAngL || 0 },
    { side: 'R', insKey: 'shutterR', angKey: 'shutterAngR', ins: clamp(surf.shutterR || 0, 0, 0.95), angDeg: surf.shutterAngR || 0 },
    { side: 'T', insKey: 'shutterT', angKey: 'shutterAngT', ins: clamp(surf.shutterT || 0, 0, 0.95), angDeg: surf.shutterAngT || 0 },
    { side: 'B', insKey: 'shutterB', angKey: 'shutterAngB', ins: clamp(surf.shutterB || 0, 0, 0.95), angDeg: surf.shutterAngB || 0 }
  ];
  const out = [];
  for (const b of blades) {
    const a = (b.angDeg * Math.PI) / 180;
    let p0, nUv, tUv;
    if (b.side === 'L') {
      p0 = [b.ins, 0.5]; nUv = [Math.cos(a), Math.sin(a)]; tUv = [-Math.sin(a), Math.cos(a)];
    } else if (b.side === 'R') {
      p0 = [1.0 - b.ins, 0.5]; nUv = [-Math.cos(a), Math.sin(a)]; tUv = [Math.sin(a), Math.cos(a)];
    } else if (b.side === 'T') {
      p0 = [0.5, 1.0 - b.ins]; nUv = [Math.sin(a), -Math.cos(a)]; tUv = [Math.cos(a), Math.sin(a)];
    } else {
      p0 = [0.5, b.ins]; nUv = [Math.sin(a), Math.cos(a)]; tUv = [Math.cos(a), -Math.sin(a)];
    }
    const uvA = [clamp(p0[0] - tUv[0] * 0.48, 0, 1), clamp(p0[1] - tUv[1] * 0.48, 0, 1)];
    const uvB = [clamp(p0[0] + tUv[0] * 0.48, 0, 1), clamp(p0[1] + tUv[1] * 0.48, 0, 1)];
    const uvTip = [clamp(p0[0] + tUv[0] * 0.30, 0.02, 0.98), clamp(p0[1] + tUv[1] * 0.30, 0.02, 0.98)];
    const uvIn = [clamp(p0[0] + nUv[0] * 0.12, 0, 1), clamp(p0[1] + nUv[1] * 0.12, 0, 1)];

    const stMid = mapSurfaceLocalUvToStage(surf, p0[0], p0[1], hom, decomp);
    const stA = mapSurfaceLocalUvToStage(surf, uvA[0], uvA[1], hom, decomp);
    const stB = mapSurfaceLocalUvToStage(surf, uvB[0], uvB[1], hom, decomp);
    const stTip = mapSurfaceLocalUvToStage(surf, uvTip[0], uvTip[1], hom, decomp);
    const stIn = mapSurfaceLocalUvToStage(surf, uvIn[0], uvIn[1], hom, decomp);

    const midPx = stageToPx(box, stMid[0], stMid[1]);
    const aPx = stageToPx(box, stA[0], stA[1]);
    const bPx = stageToPx(box, stB[0], stB[1]);
    const tipPx = stageToPx(box, stTip[0], stTip[1]);
    const inPx = stageToPx(box, stIn[0], stIn[1]);
    let nx = inPx[0] - midPx[0], ny = inPx[1] - midPx[1];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const spanPx = Math.max(40, Math.hypot(bPx[0] - aPx[0], bPx[1] - aPx[1]));

    out.push({
      ...b,
      aPx,
      bPx,
      midPx,
      tipPx,
      inNormPx: [nx, ny],
      spanPx
    });
  }
  return out;
}

function getFollowspotLollipopHandles(box) {
  const fs = typeof getActiveLiveSpot === 'function' ? getActiveLiveSpot() : null;
  if (!fs || fs.enabled === false) return null;
  const effAspect = box.w / Math.max(1, box.h);
  const fsDisp = (fs.converge3D && typeof mapSpotCanonical === 'function') ? mapSpotCanonical(fs) : fs;
  const spPx = stageToPx(box, fsDisp.spotX, fsDisp.spotY);
  const rx = Math.max(10, (fsDisp.radius / Math.max(0.2, effAspect)) * box.w * fs.stretchX);
  const ry = Math.max(10, fs.radius * box.h * fs.stretchY);
  const rad = (-fs.rotation * Math.PI) / 180.0;
  const cosA = Math.cos(rad), sinA = Math.sin(rad);
  // Right-edge Iris Radius handle & Top-stem Rotation lollipop handle
  const radiusHandlePx = [spPx[0] + rx * cosA, spPx[1] + rx * sinA];
  const topRimPx = [spPx[0] + ry * sinA, spPx[1] - ry * cosA];
  const rotHandlePx = [spPx[0] + (ry + 20) * sinA, spPx[1] - (ry + 20) * cosA];
  return { fs, spPx, rx, ry, radiusHandlePx, topRimPx, rotHandlePx };
}

function renderArriStageModeBezel(ctx, rect, box) {
  let modeLabel = '';
  let modeColor = '';
  let escHint = 'Esc ↩';
  const tpSpot = (state.trackpadSpotTarget || state.steerSpotMode) && typeof getActiveLiveSpot === 'function'
    ? getActiveLiveSpot()
    : null;

  if (state.showLock) {
    modeLabel = '🔒 SHOW LOCK ARMED';
    modeColor = '#ff8fa2';
    escHint = 'Shift+P Unlock';
  } else if (state.drawingSurfaceId) {
    const ds = state.surfaces.find(s => s.id === state.drawingSurfaceId);
    modeLabel = `✎ PEN DRAWING (${ds?.type === 'line' ? 'LINE' : 'POLYGON'})`;
    modeColor = '#34e89e';
  } else if (state.drawingMaskId) {
    modeLabel = '✂ MASK PEN DRAWING';
    modeColor = '#b58cff';
  } else if (tpSpot && tpSpot.enabled !== false) {
    modeLabel = `🎯 TRACKPAD STEER · ${(tpSpot.name || 'SPOT').toUpperCase()}`;
    modeColor = '#ffcb7d';
    escHint = '` Next · Esc Off';
  } else if (state.masterKeystone?.enabled && state.masterKeystone?.editOnStage) {
    modeLabel = '◰ MASTER KEYSTONE EDIT';
    modeColor = '#ffcb7d';
  } else if (state.multiProjector?.enabled && typeof getSelectedProjectorScreen === 'function' && getSelectedProjectorScreen()?.keystone?.editOnStage) {
    modeLabel = `◰ SCREEN ${getSelectedProjectorScreen().index} KEYSTONE`;
    modeColor = '#ffcb7d';
  } else if (state.pixelMapper?.enabled && state.pixelMapper?.editOnStage) {
    modeLabel = '💡 DMX PIXEL FIXTURE EDIT';
    modeColor = '#38bdf8';
  } else if (isMaskStageEditActive()) {
    modeLabel = '✂ MASK STAGE EDIT';
    modeColor = '#b58cff';
  } else if (state.shutterHandlesVisible) {
    modeLabel = '🪟 FRAMING SHUTTER BLADES';
    modeColor = '#ffcb7d';
  }

  if (modeLabel) {
    ctx.save();
    ctx.strokeStyle = modeColor;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x + 1, box.y + 1, Math.max(2, box.w - 2), Math.max(2, box.h - 2));
    ctx.globalAlpha = 1;

    const fullText = `${modeLabel}  •  ${escHint}`;
    ctx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    const tw = ctx.measureText(fullText).width + 16;
    const bx = box.x + 8;
    const by = box.y + 8;
    ctx.fillStyle = 'rgba(7, 10, 16, 0.90)';
    ctx.fillRect(bx, by, tw, 19);
    ctx.strokeStyle = modeColor;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(bx, by, tw, 19);
    ctx.fillStyle = modeColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fullText, bx + 8, by + 9.5);
    ctx.restore();
  }

  // Bottom-left active held-modifier indicator pills
  const heldPills = [];
  if (typeof spacePanHeld !== 'undefined' && spacePanHeld) heldPills.push('[Space Pan]');
  if (state.modKeys?.r) heldPills.push('[R Rotate]');
  if (state.modKeys?.m) heldPills.push('[M Morph]');
  if (state.modKeys?.s) heldPills.push('[S Shadow/Pie]');
  if (heldPills.length > 0) {
    ctx.save();
    const txt = heldPills.join('  ');
    ctx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    const tw = ctx.measureText(txt).width + 14;
    const bx = box.x + 8;
    const by = box.y + box.h - 26;
    ctx.fillStyle = 'rgba(7, 10, 16, 0.88)';
    ctx.fillRect(bx, by, tw, 18);
    ctx.strokeStyle = '#6fd3ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, tw, 18);
    ctx.fillStyle = '#cfe8ff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, bx + 7, by + 9);
    ctx.restore();
  }
}

function drawBlindPreAimSpotsOverlay(ctx, box, effAspect, monitorOnly = false) {
  const spots = Array.isArray(state.spots) ? state.spots : [];
  const palette = ['#ffcb7d', '#6fd3ff', '#34e89e', '#c084fc'];
  if (monitorOnly) {
    ctx.save();
    ctx.strokeStyle = 'rgba(111, 211, 255, 0.32)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    const monTag = 'OPERATOR MONITOR · BLIND PRE-AIM';
    ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    const mtw = ctx.measureText(monTag).width + 14;
    ctx.fillStyle = 'rgba(7, 11, 18, 0.88)';
    ctx.fillRect(box.x + 10, box.y + 10, mtw, 20);
    ctx.strokeStyle = '#6fd3ff';
    ctx.strokeRect(box.x + 10, box.y + 10, mtw, 20);
    ctx.fillStyle = '#6fd3ff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(monTag, box.x + 17, box.y + 20);
    ctx.restore();
  }
  if (spots.length === 0) return;

  const placedTags = []; // label rects already drawn — later tags step aside instead of stacking on top
  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i];
    if (!sp || sp.enabled === false) continue;
    const isBlind = sp.mode === 'off' || (sp.intensity ?? 1) <= 0.005;
    const isActiveSel = (state.activeSpotIndex || 0) === i;
    if (!monitorOnly && state.room !== 'live' && !state.steerSpotMode && state.inspTab !== 'spot' && !state.ecoMode && isBlind) {
      continue;
    }
    const col = palette[i % palette.length];
    // 3D-aimed spots are shown where the first routed projector really draws them.
    const disp = (sp.converge3D && typeof mapSpotCanonical === 'function') ? mapSpotCanonical(sp) : sp;
    const dispTarget = (sp.converge3D && typeof mapSpotCanonical === 'function' && Number.isFinite(sp.targetStageXM))
      ? mapSpotCanonical({ ...sp, stageXM: sp.targetStageXM, stageZM: sp.targetStageZM })
      : null;
    const spPx = stageToPx(box, disp.spotX, disp.spotY);
    const tgPx = dispTarget ? stageToPx(box, dispTarget.spotX, dispTarget.spotY) : stageToPx(box, sp.targetX, sp.targetY);
    const rx = Math.max(8, ((disp.radius || 0.22) / Math.max(0.2, effAspect)) * box.w * (sp.stretchX || 1));
    const ry = Math.max(8, (disp.radius || 0.22) * box.h * (sp.stretchY || 1));

    ctx.save();
    ctx.translate(spPx[0], spPx[1]);
    ctx.rotate((-(sp.rotation || 0) * Math.PI) / 180.0);
    ctx.strokeStyle = isBlind ? 'rgba(111, 211, 255, 0.72)' : col;
    ctx.lineWidth = isActiveSel ? 2.0 : 1.25;
    ctx.setLineDash(isBlind ? [3, 5] : [6, 4]);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(-7, 0); ctx.lineTo(7, 0);
    ctx.moveTo(0, -7); ctx.lineTo(0, 7);
    ctx.stroke();
    ctx.restore();

    if (Math.hypot(tgPx[0] - spPx[0], tgPx[1] - spPx[1]) > 4) {
      ctx.save();
      ctx.fillStyle = isBlind ? '#6fd3ff' : col;
      ctx.beginPath();
      ctx.arc(tgPx[0], tgPx[1], 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (monitorOnly || state.room === 'live' || spots.length > 1) {
      ctx.save();
      const tag = `${sp.name || `Spot ${i + 1}`}${isBlind ? ' · PRE-AIM' : ''}`;
      ctx.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      const tw = ctx.measureText(tag).width + 10;
      const lx = clamp(spPx[0] - tw * 0.5, box.x + 4, box.x + box.w - tw - 4);
      let ly = clamp(spPx[1] - ry - 18, box.y + 4, box.y + box.h - 18);
      const hits = (y) => placedTags.some(r => lx < r.x + r.w + 3 && lx + tw + 3 > r.x && y < r.y + 17 && y + 17 > r.y);
      for (let guard = 0; guard < 8 && hits(ly); guard++) {
        ly += 17;
        if (ly > box.y + box.h - 18) ly = box.y + 4 + guard * 17;
      }
      placedTags.push({ x: lx, y: ly, w: tw });
      ctx.fillStyle = 'rgba(7, 11, 18, 0.85)';
      ctx.fillRect(lx, ly, tw, 15);
      ctx.strokeStyle = isBlind ? '#6fd3ff' : col;
      ctx.lineWidth = 1;
      ctx.strokeRect(lx, ly, tw, 15);
      ctx.fillStyle = isBlind ? '#6fd3ff' : col;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, lx + 5, ly + 7.5);
      ctx.restore();
    }
  }
}

function renderStageOverlay(dpr, metrics) {
  const rect = stageOverlay.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (stageOverlay.width !== w || stageOverlay.height !== h) {
    stageOverlay.width = w;
    stageOverlay.height = h;
  }
  stageCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stageCtx.clearRect(0, 0, rect.width, rect.height);
  if (!metrics || state.layoutMode === 'input') return;
  if (state.projectorMode) {
    if (state.isMonitorRole) {
      const effAspectMon = metrics.box.w / Math.max(1, metrics.box.h);
      drawBlindPreAimSpotsOverlay(stageCtx, metrics.box, effAspectMon, true);
    }
    return;
  }

  // MAP / LIVE "3D Venue" feed: the GPU previz fills the pane; draw only venue labels.
  if (state.outputFeedTab === 'venue3d' && !isBuildRoom() && typeof renderVenueStageOverlay === 'function') {
    renderVenueStageOverlay(stageCtx, rect.width, rect.height);
    return;
  }

  const { box } = metrics;
  const effAspect = box.w / Math.max(1, box.h);
  const liveCleanMode = state.room === 'live' && !state.liveReachThrough;
  const reachUnlock = (state.room === 'live' || state.room === 'map') && !!state.liveReachThrough;
  const mapSelectOnly = state.room === 'map' && !state.liveReachThrough && !state.drawingSurfaceId && !state.drawingMaskId;
  const geomUnlocked = (!state.showLock && !mapSelectOnly) || reachUnlock;
  const shutterUnlocked = !state.showLock || reachUnlock;

  // Eco Mode background fill so stage frame is clearly legible when WebGL is paused
  if (state.ecoMode) {
    stageCtx.fillStyle = '#04060a';
    stageCtx.fillRect(box.x, box.y, box.w, box.h);
  }

  // Milestone 2: Projector-POV Background Reference Guide (Space Scanner / Reference Photo)
  if (!liveCleanMode && !state.showLock && state.stageBg?.enabled && state.stageBg?.img) {
    stageCtx.save();
    stageCtx.globalAlpha = clamp(state.stageBg.opacity ?? 0.52, 0.05, 1.0);
    stageCtx.drawImage(state.stageBg.img, box.x, box.y, box.w, box.h);
    stageCtx.restore();
  }

  // Stage Border (Emerald when Surgical Reach-Through Held, Amber when Spot Steer, Rose-Lock tint when Show Lock armed, Cyan in Setup)
  stageCtx.strokeStyle = reachUnlock
    ? 'rgba(52, 232, 158, 0.85)'
    : (state.showLock
      ? 'rgba(255, 143, 162, 0.45)'
      : (state.steerSpotMode ? 'rgba(255, 203, 125, 0.65)' : 'rgba(111, 211, 255, 0.34)'));
  stageCtx.lineWidth = (reachUnlock || state.steerSpotMode || state.showLock) ? 1.9 : 1.2;
  stageCtx.strokeRect(box.x, box.y, box.w, box.h);

  if (liveCleanMode) {
    drawBlindPreAimSpotsOverlay(stageCtx, box, effAspect, false);
    return;
  }

  const wireVisible = reachUnlock || (state.showWireframes && !state.showLock) || state.ecoMode;

  // Background Snap Grid
  if (state.snapGrid && wireVisible && geomUnlocked) {
    stageCtx.save();
    stageCtx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    stageCtx.lineWidth = 1;
    stageCtx.beginPath();
    for (let gx = 1; gx < state.gridDivsX; gx++) {
      const x = box.x + (gx / state.gridDivsX) * box.w;
      stageCtx.moveTo(x, box.y); stageCtx.lineTo(x, box.y + box.h);
    }
    for (let gy = 1; gy < state.gridDivsY; gy++) {
      const y = box.y + (gy / state.gridDivsY) * box.h;
      stageCtx.moveTo(box.x, y); stageCtx.lineTo(box.x + box.w, y);
    }
    stageCtx.stroke();
    stageCtx.restore();
  }

  const anySolo = state.surfaces.some(s => {
    const eff = getEffectiveSurfaceProps(s);
    return eff.solo && eff.visible;
  });
  const selSurf = getSelectedSurface();
  const selSurfs = getSelectedSurfaces();
  const selMask = getSelectedMask();
  const maskFocus = isMaskStageEditActive();

  // Hold-W reach-through: show every grabbable corner (not just the selected surface's)
  if (reachUnlock) {
    stageCtx.save();
    stageCtx.lineWidth = 1.4;
    for (const surf of state.surfaces) {
      if (!surf || surf.type === 'mesh3d' || (selSurf && surf.id === selSurf.id)) continue;
      const eff = getEffectiveSurfaceProps(surf);
      if (!eff.visible || eff.locked) continue;
      stageCtx.strokeStyle = surf.accent || '#6fd3ff';
      stageCtx.fillStyle = 'rgba(5, 8, 17, 0.85)';
      for (const p of (surf.points || [])) {
        const q = stageToPx(box, p[0], p[1]);
        stageCtx.beginPath();
        stageCtx.arc(q[0], q[1], 4.2, 0, Math.PI * 2);
        stageCtx.fill();
        stageCtx.stroke();
      }
    }
    stageCtx.restore();
  }

  // Draw Surfaces (Wireframes OR Eco Mode Vector Radar)
  if (wireVisible) {
    for (let i = state.surfaces.length - 1; i >= 0; i--) {
      const surf = state.surfaces[i];
      const eff = getEffectiveSurfaceProps(surf);
      if (!eff.visible) continue;
      if (anySolo && !eff.solo) continue;

      const isPrimarySel = !maskFocus && selSurf && surf.id === selSurf.id;
      const isMultiSel = !maskFocus && isSurfaceSelected(surf.id);
      const col = surf.accent || '#6fd3ff';
      const curved = isCurvedMeshSurface(surf);

      stageCtx.save();

      if (curved) {
        // Draw smooth Projective Curved Spline / Bezier boundary & internal lattice curves
        getMeshGeometryForGL(surf, 40, 40);
        const outlinePx = (surf._meshOutline || surf.points).map(p => stageToPx(box, p[0], p[1]));

        stageCtx.beginPath();
        outlinePx.forEach((p, idx) => (idx === 0 ? stageCtx.moveTo(p[0], p[1]) : stageCtx.lineTo(p[0], p[1])));
        stageCtx.closePath();

        if (state.ecoMode) {
          stageCtx.fillStyle = isMultiSel ? 'rgba(111, 211, 255, 0.16)' : 'rgba(255, 255, 255, 0.06)';
          stageCtx.fill();
        } else if (isMultiSel) {
          stageCtx.fillStyle = isPrimarySel ? 'rgba(111, 211, 255, 0.05)' : 'rgba(52, 232, 158, 0.04)';
          stageCtx.fill();
        }

        stageCtx.strokeStyle = isPrimarySel ? col : (isMultiSel ? '#34e89e' : 'rgba(255, 255, 255, 0.34)');
        stageCtx.lineWidth = isMultiSel ? 2.0 : 1.0;
        stageCtx.stroke();

        // Iso-parametric curved grid lines + NxM control nodes when primary selected
        if (isPrimarySel && geomUnlocked) {
          const cols = surf.meshCols || 3;
          const rows = surf.meshRows || 3;
          const decomp = getMeshDisplacementGrid(surf);
          stageCtx.strokeStyle = 'rgba(255, 203, 125, 0.34)';
          stageCtx.lineWidth = 1;
          stageCtx.beginPath();
          for (let c = 1; c < cols; c++) {
            const u = c / cols;
            for (let s = 0; s <= 24; s++) {
              const pt = evalCurvedSurfacePoint(surf, u, s / 24, decomp);
              const px = stageToPx(box, pt[0], pt[1]);
              if (s === 0) stageCtx.moveTo(px[0], px[1]); else stageCtx.lineTo(px[0], px[1]);
            }
          }
          for (let r = 1; r < rows; r++) {
            const v = r / rows;
            for (let s = 0; s <= 24; s++) {
              const pt = evalCurvedSurfacePoint(surf, s / 24, v, decomp);
              const px = stageToPx(box, pt[0], pt[1]);
              if (s === 0) stageCtx.moveTo(px[0], px[1]); else stageCtx.lineTo(px[0], px[1]);
            }
          }
          stageCtx.stroke();

          // Bezier control polygon dashed hull when in Bicubic Bezier mode
          if (surf.quadWarp === 'bezier') {
            stageCtx.save();
            stageCtx.setLineDash([2, 3]);
            stageCtx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
            stageCtx.beginPath();
            const stride = cols + 1;
            for (let r = 0; r <= rows; r++) {
              for (let c = 0; c <= cols; c++) {
                const p = stageToPx(box, surf.meshPts[r * stride + c][0], surf.meshPts[r * stride + c][1]);
                if (c === 0) stageCtx.moveTo(p[0], p[1]); else stageCtx.lineTo(p[0], p[1]);
              }
            }
            for (let c = 0; c <= cols; c++) {
              for (let r = 0; r <= rows; r++) {
                const p = stageToPx(box, surf.meshPts[r * stride + c][0], surf.meshPts[r * stride + c][1]);
                if (r === 0) stageCtx.moveTo(p[0], p[1]); else stageCtx.lineTo(p[0], p[1]);
              }
            }
            stageCtx.stroke();
            stageCtx.restore();
          }

          // Control Nodes
          if (!eff.locked) {
            const stride = cols + 1;
            const dense = cols > 8 || rows > 8;
            for (let r = 0; r <= rows; r++) {
              for (let c = 0; c <= cols; c++) {
                const isCorner = (c === 0 || c === cols) && (r === 0 || r === rows);
                const pt = surf.meshPts[r * stride + c];
                const px = stageToPx(box, pt[0], pt[1]);
                stageCtx.fillStyle = isCorner ? (surf.meshPinCorners ? '#34e89e' : '#ffffff') : '#ffcb7d';
                stageCtx.strokeStyle = '#090d14';
                stageCtx.lineWidth = 1.5;
                stageCtx.beginPath();
                stageCtx.arc(px[0], px[1], isCorner ? 5.6 : (dense ? 3.3 : 4.3), 0, Math.PI * 2);
                stageCtx.fill();
                stageCtx.stroke();
              }
            }
          }
        }
      } else if (surf.type === 'line' || surf.type === 'polygon') {
        // Architectural Line Ribbon OR Freeform N-Gon Polygon Wireframe + Live Pen Drawing
        const ptsPx = surf.points.map(p => stageToPx(box, p[0], p[1]));
        const isDrawingSurf = state.drawingSurfaceId === surf.id;
        const isClosedShape = surf.type === 'polygon' ? (!isDrawingSurf && ptsPx.length >= 3) : (!isDrawingSurf && !!surf.lineClosed && ptsPx.length >= 3);

        if (ptsPx.length >= 1) {
          stageCtx.beginPath();
          ptsPx.forEach((p, idx) => (idx === 0 ? stageCtx.moveTo(p[0], p[1]) : stageCtx.lineTo(p[0], p[1])));
          if (isClosedShape) {
            stageCtx.closePath();
            if (surf.type === 'polygon' && (state.ecoMode || isMultiSel)) {
              stageCtx.fillStyle = state.ecoMode
                ? (isMultiSel ? 'rgba(111, 211, 255, 0.16)' : 'rgba(255, 255, 255, 0.06)')
                : (isPrimarySel ? 'rgba(111, 211, 255, 0.06)' : 'rgba(52, 232, 158, 0.05)');
              stageCtx.fill();
            }
          } else if (isDrawingSurf && state.surfHoverPt) {
            const hPx = stageToPx(box, state.surfHoverPt[0], state.surfHoverPt[1]);
            stageCtx.lineTo(hPx[0], hPx[1]);
          }
          stageCtx.strokeStyle = isPrimarySel ? col : (isMultiSel ? '#34e89e' : 'rgba(255, 255, 255, 0.42)');
          stageCtx.lineWidth = isMultiSel ? 2.1 : 1.2;
          stageCtx.stroke();
        }

        if (isPrimarySel && !eff.locked && geomUnlocked) {
          const maxPts = surf.type === 'polygon' ? 48 : 96;
          if (!isDrawingSurf && ptsPx.length >= (surf.type === 'polygon' ? 3 : 2) && ptsPx.length < maxPts) {
            const edgeCount = (surf.type === 'polygon' || surf.lineClosed) ? ptsPx.length : (ptsPx.length - 1);
            for (let ei = 0; ei < edgeCount; ei++) {
              const a = ptsPx[ei];
              const b = ptsPx[(ei + 1) % ptsPx.length];
              const mx = (a[0] + b[0]) * 0.5;
              const my = (a[1] + b[1]) * 0.5;
              stageCtx.fillStyle = col;
              stageCtx.strokeStyle = '#090d14';
              stageCtx.lineWidth = 1.2;
              stageCtx.beginPath();
              stageCtx.arc(mx, my, 3.6, 0, Math.PI * 2);
              stageCtx.fill();
              stageCtx.stroke();
            }
          }

          ptsPx.forEach((p, idx) => {
            const isCloseTarget = isDrawingSurf && idx === 0 && ptsPx.length >= 3;
            stageCtx.fillStyle = isCloseTarget ? '#34e89e' : '#090d14';
            stageCtx.strokeStyle = isCloseTarget ? '#ffffff' : col;
            stageCtx.lineWidth = 2.1;
            stageCtx.beginPath();
            stageCtx.arc(p[0], p[1], isCloseTarget ? 7.5 : (ptsPx.length > 14 ? 4.6 : 5.8), 0, Math.PI * 2);
            stageCtx.fill();
            stageCtx.stroke();

            if (ptsPx.length <= 16) {
              stageCtx.fillStyle = 'rgba(255, 255, 255, 0.82)';
              stageCtx.font = '600 8.5px monospace';
              stageCtx.fillText(`${surf.type === 'polygon' ? 'P' : 'L'}${idx + 1}`, p[0] + 7, p[1] - 6);
            }
          });
        }
      } else if (surf.type === 'mesh3d') {
        // Phase 7A: 3D Object Surface Wireframe, Manual 3D Pose Gizmo & 6-Point PnP Calibration Crosshairs
        const geom = getSurfaceMesh3DGeometry(surf, state.objAssets);
        const giz3d = getMesh3DGizmoHandles(surf, box);
        const mvp = giz3d.mats.mvp;

        if (state.ecoMode || isMultiSel) {
          const contour = getSurfacePerimeterContour(surf);
          if (contour.pts.length >= 3) {
            stageCtx.beginPath();
            contour.pts.forEach((pt, idx) => {
              const cpx = stageToPx(box, pt[0], pt[1]);
              if (idx === 0) stageCtx.moveTo(cpx[0], cpx[1]); else stageCtx.lineTo(cpx[0], cpx[1]);
            });
            stageCtx.closePath();
            stageCtx.fillStyle = state.ecoMode
              ? (isMultiSel ? 'rgba(111, 211, 255, 0.16)' : 'rgba(255, 255, 255, 0.06)')
              : (isPrimarySel ? 'rgba(111, 211, 255, 0.05)' : 'rgba(52, 232, 158, 0.05)');
            stageCtx.fill();
          }
        }

        const edges = geom && Array.isArray(geom.edges) ? geom.edges : [];
        const uVerts = geom && Array.isArray(geom.uniqueVerts) ? geom.uniqueVerts : [];
        if (edges.length > 0 && uVerts.length > 0) {
          const edgeStride = edges.length > 1800 ? Math.ceil(edges.length / 1500) : 1;
          stageCtx.strokeStyle = isPrimarySel
            ? col
            : (isMultiSel ? '#34e89e' : 'rgba(255, 255, 255, 0.28)');
          stageCtx.lineWidth = isPrimarySel ? 1.3 : (isMultiSel ? 1.8 : 0.9);
          stageCtx.beginPath();
          for (let ei = 0; ei < edges.length; ei += edgeStride) {
            const [ia, ib] = edges[ei];
            const va = uVerts[ia], vb = uVerts[ib];
            if (!va || !vb) continue;
            const pa = projectPoint3DWithMvp(va, mvp);
            const pb = projectPoint3DWithMvp(vb, mvp);
            if (pa.behind || pb.behind) continue;
            const ax = stageToPx(box, pa.u, pa.v);
            const bx = stageToPx(box, pb.u, pb.v);
            stageCtx.moveTo(ax[0], ax[1]);
            stageCtx.lineTo(bx[0], bx[1]);
          }
          stageCtx.stroke();
        }

        if (isPrimarySel && !eff.locked && geomUnlocked) {
          if (surf.calibMode === 'calibrated') {
            const pins = Array.isArray(surf.calibPins) ? surf.calibPins : [];
            const pinErrs = Array.isArray(giz3d.mats.pnp?.pinErrorsPx) ? giz3d.mats.pnp.pinErrorsPx : [];
            pins.forEach((pin, idx) => {
              if (!pin || !Array.isArray(pin.stage2d)) return;
              const tPx = stageToPx(box, pin.stage2d[0], pin.stage2d[1]);
              const isSelPin = idx === state.selectedCalibPinIdx;
              const isHovPin = idx === state.hoveredCalibPinIdx;
              const errPx = typeof pinErrs[idx] === 'number' ? pinErrs[idx] : null;
              let statusCol = '#34e89e';
              let statusGlyph = '✓';
              if (errPx !== null) {
                if (errPx > 6.0) { statusCol = '#ff6b8b'; statusGlyph = '!'; }
                else if (errPx >= 2.0) { statusCol = '#ffcb7d'; statusGlyph = '~'; }
              }
              const pinCol = (isSelPin || isHovPin) ? '#ffffff' : statusCol;

              // ×5 Magnified fiducial residual whisker from solved 3D vertex projection to 2D physical pin
              if (giz3d.mats.pnp && giz3d.mats.pnp.ok && Array.isArray(pin.pos3d)) {
                const pr3 = projectPoint3DWithMvp(pin.pos3d, mvp);
                if (!pr3.behind) {
                  const rPx = stageToPx(box, pr3.u, pr3.v);
                  const dxErr = tPx[0] - rPx[0];
                  const dyErr = tPx[1] - rPx[1];
                  const rawDist = Math.hypot(dxErr, dyErr);
                  if (rawDist > 0.35) {
                    const mag = 5.0;
                    const wEnd = [rPx[0] + dxErr * mag, rPx[1] + dyErr * mag];
                    stageCtx.save();
                    stageCtx.strokeStyle = statusCol;
                    stageCtx.lineWidth = (errPx !== null && errPx > 6.0) ? 2.1 : 1.5;
                    stageCtx.beginPath();
                    stageCtx.moveTo(rPx[0], rPx[1]);
                    stageCtx.lineTo(wEnd[0], wEnd[1]);
                    stageCtx.stroke();
                    stageCtx.fillStyle = statusCol;
                    stageCtx.beginPath();
                    stageCtx.arc(wEnd[0], wEnd[1], 2.4, 0, Math.PI * 2);
                    stageCtx.fill();
                    stageCtx.restore();
                  }
                }
              }

              if (isHovPin) {
                stageCtx.save();
                stageCtx.strokeStyle = 'rgba(255, 203, 125, 0.9)';
                stageCtx.lineWidth = 2.0;
                stageCtx.beginPath();
                stageCtx.arc(tPx[0], tPx[1], 12, 0, Math.PI * 2);
                stageCtx.stroke();
                stageCtx.restore();
              }

              // Target crosshair & ring
              stageCtx.strokeStyle = '#070a10';
              stageCtx.lineWidth = 3.2;
              stageCtx.beginPath();
              stageCtx.moveTo(tPx[0] - 9, tPx[1]); stageCtx.lineTo(tPx[0] + 9, tPx[1]);
              stageCtx.moveTo(tPx[0], tPx[1] - 9); stageCtx.lineTo(tPx[0], tPx[1] + 9);
              stageCtx.stroke();

              stageCtx.strokeStyle = statusCol;
              stageCtx.fillStyle = 'rgba(7, 10, 16, 0.85)';
              stageCtx.lineWidth = 2.0;
              stageCtx.beginPath();
              stageCtx.arc(tPx[0], tPx[1], (isSelPin || isHovPin) ? 7.4 : 5.8, 0, Math.PI * 2);
              stageCtx.fill();
              stageCtx.stroke();
              stageCtx.beginPath();
              stageCtx.moveTo(tPx[0] - 9, tPx[1]); stageCtx.lineTo(tPx[0] + 9, tPx[1]);
              stageCtx.moveTo(tPx[0], tPx[1] - 9); stageCtx.lineTo(tPx[0], tPx[1] + 9);
              stageCtx.stroke();

              const showErrText = errPx !== null && (errPx >= 1.5 || isSelPin || isHovPin);
              const tag = showErrText
                ? `P${idx + 1} ${statusGlyph}${errPx.toFixed(1)}px`
                : `P${idx + 1}`;
              stageCtx.font = '700 9px monospace';
              const tw = stageCtx.measureText(tag).width + 8;
              stageCtx.fillStyle = 'rgba(7, 10, 16, 0.92)';
              stageCtx.fillRect(tPx[0] + 9, tPx[1] - 18, tw, 15);
              stageCtx.strokeStyle = pinCol;
              stageCtx.lineWidth = 1;
              stageCtx.strokeRect(tPx[0] + 9, tPx[1] - 18, tw, 15);
              stageCtx.fillStyle = statusCol;
              stageCtx.fillText(tag, tPx[0] + 13, tPx[1] - 7);
            });
          } else {
            // Manual 3D Pose Gizmo: Center XY Move + Upper 3D Tumble Handle
            const cPx = giz3d.centerPx;
            const rPx = giz3d.rotHandlePx;
            stageCtx.save();
            stageCtx.setLineDash([3, 3]);
            stageCtx.strokeStyle = col;
            stageCtx.lineWidth = 1.4;
            stageCtx.beginPath();
            stageCtx.moveTo(cPx[0], cPx[1]);
            stageCtx.lineTo(rPx[0], rPx[1]);
            stageCtx.stroke();
            stageCtx.restore();

            stageCtx.fillStyle = '#090d14';
            stageCtx.strokeStyle = col;
            stageCtx.lineWidth = 2.0;
            stageCtx.beginPath();
            stageCtx.arc(cPx[0], cPx[1], 6.5, 0, Math.PI * 2);
            stageCtx.fill();
            stageCtx.stroke();

            stageCtx.fillStyle = '#090d14';
            stageCtx.strokeStyle = '#ffcb7d';
            stageCtx.lineWidth = 2.0;
            stageCtx.beginPath();
            stageCtx.arc(rPx[0], rPx[1], 6.5, 0, Math.PI * 2);
            stageCtx.fill();
            stageCtx.stroke();
            stageCtx.fillStyle = '#ffcb7d';
            stageCtx.font = '600 8.5px monospace';
            stageCtx.fillText('3D ↻', rPx[0] + 9, rPx[1] + 3);
          }
        }
      } else {
        // Standard Homography Quad / Triangle / Circle Wireframe
        const ptsPx = surf.points.map(p => stageToPx(box, p[0], p[1]));
        const nonConvexWarn = (surf.type === 'quad' || surf.type === 'circle') && !isQuadStrictlyConvex(surf.points);

        stageCtx.beginPath();
        ptsPx.forEach((p, idx) => (idx === 0 ? stageCtx.moveTo(p[0], p[1]) : stageCtx.lineTo(p[0], p[1])));
        stageCtx.closePath();

        if (state.ecoMode) {
          stageCtx.fillStyle = isMultiSel ? 'rgba(111, 211, 255, 0.16)' : 'rgba(255, 255, 255, 0.06)';
          stageCtx.fill();
        } else if (isMultiSel) {
          stageCtx.fillStyle = isPrimarySel ? 'rgba(111, 211, 255, 0.05)' : 'rgba(52, 232, 158, 0.05)';
          stageCtx.fill();
        }

        stageCtx.strokeStyle = nonConvexWarn
          ? '#ffcb7d'
          : (isPrimarySel ? col : (isMultiSel ? '#34e89e' : 'rgba(255, 255, 255, 0.34)'));
        stageCtx.lineWidth = isMultiSel ? 2.0 : 1.0;
        if (surf.type === 'circle' && !isMultiSel) stageCtx.setLineDash([4, 4]);
        stageCtx.stroke();
        stageCtx.setLineDash([]);

        if (surf.type === 'circle') {
          const contour = getSurfacePerimeterContour(surf);
          stageCtx.strokeStyle = isPrimarySel ? col : (isMultiSel ? '#34e89e' : 'rgba(255, 255, 255, 0.48)');
          stageCtx.lineWidth = isMultiSel ? 2.0 : 1.1;
          if (contour.pts.length >= 2) {
            stageCtx.beginPath();
            contour.pts.forEach((pt, idx) => {
              const px = stageToPx(box, pt[0], pt[1]);
              if (idx === 0) stageCtx.moveTo(px[0], px[1]); else stageCtx.lineTo(px[0], px[1]);
            });
            if (contour.closed) stageCtx.closePath();
            stageCtx.stroke();
          }

          const sweep = computeCircleSweepDeg(surf.circleStartAngle ?? 0, surf.circleEndAngle ?? 360);
          if (surf.circleInner > 0.01 && sweep >= 359.5) {
            const hom = computeQuadHomography(surf.points);
            stageCtx.save();
            stageCtx.setLineDash([3, 3]);
            stageCtx.beginPath();
            for (let k = 0; k <= 48; k++) {
              const ang = (k / 48) * Math.PI * 2;
              const rIn = surf.circleInner * 0.5;
              const st = evalHomographyForward(hom.H, 0.5 + rIn * Math.cos(ang), 0.5 + rIn * Math.sin(ang));
              const px = stageToPx(box, st[0], st[1]);
              if (k === 0) stageCtx.moveTo(px[0], px[1]); else stageCtx.lineTo(px[0], px[1]);
            }
            stageCtx.stroke();
            stageCtx.restore();
          }
        }

        if (isPrimarySel && surf.type === 'quad' && surf.quadWarp === 'perspective' && !nonConvexWarn && geomUnlocked) {
          const hom = computeQuadHomography(surf.points);
          stageCtx.strokeStyle = 'rgba(111, 211, 255, 0.24)';
          stageCtx.lineWidth = 1;
          stageCtx.beginPath();
          for (let g = 1; g <= 3; g++) {
            const t = g / 4;
            const a = stageToPx(box, ...evalHomographyForward(hom.H, t, 0));
            const b = stageToPx(box, ...evalHomographyForward(hom.H, t, 1));
            stageCtx.moveTo(a[0], a[1]); stageCtx.lineTo(b[0], b[1]);
            const c = stageToPx(box, ...evalHomographyForward(hom.H, 0, t));
            const d = stageToPx(box, ...evalHomographyForward(hom.H, 1, t));
            stageCtx.moveTo(c[0], c[1]); stageCtx.lineTo(d[0], d[1]);
          }
          stageCtx.stroke();
        }

        if (isPrimarySel && !eff.locked && geomUnlocked) {
          const vLabels = surf.type === 'triangle' ? ['A', 'B', 'C'] : ['BL', 'BR', 'TR', 'TL'];
          ptsPx.forEach((p, idx) => {
            stageCtx.fillStyle = '#090d14';
            stageCtx.strokeStyle = col;
            stageCtx.lineWidth = 2.2;
            stageCtx.beginPath();
            stageCtx.arc(p[0], p[1], 6, 0, Math.PI * 2);
            stageCtx.fill();
            stageCtx.stroke();

            stageCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            stageCtx.font = '600 9px monospace';
            stageCtx.fillText(vLabels[idx], p[0] + 8, p[1] - 7);
          });
        }
      }

      if ((isMultiSel && geomUnlocked) || state.ecoMode) {
        const cent = getSurfaceCentroid(surf);
        const cPx = stageToPx(box, cent[0], cent[1]);
        const label = eff.locked ? `🔒 ${surf.name}` : surf.name;
        stageCtx.font = '600 10px sans-serif';
        const tw = stageCtx.measureText(label).width + 10;
        stageCtx.fillStyle = 'rgba(9, 13, 20, 0.82)';
        stageCtx.fillRect(cPx[0] - tw * 0.5, cPx[1] - 9, tw, 18);
        stageCtx.strokeStyle = isPrimarySel ? col : '#34e89e';
        stageCtx.lineWidth = 1;
        stageCtx.strokeRect(cPx[0] - tw * 0.5, cPx[1] - 9, tw, 18);
        stageCtx.fillStyle = '#fff';
        stageCtx.textAlign = 'center';
        stageCtx.textBaseline = 'middle';
        stageCtx.fillText(label, cPx[0], cPx[1]);
      }

      // P7: On-Canvas 4-Blade Framing Shutter Handles on Primary Selected Surface
      if (isPrimarySel && !eff.locked && shutterUnlocked) {
        const shHandles = computeSurfaceShutterHandles(surf, box);
        for (const sh of shHandles) {
          const isCut = sh.ins > 0.002;
          stageCtx.save();
          if (isCut || state.shutterHandlesVisible || document.getElementById('disc-framing-shutters')?.open) {
            stageCtx.strokeStyle = isCut ? '#ffcb7d' : 'rgba(255, 203, 125, 0.48)';
            stageCtx.lineWidth = isCut ? 1.8 : 1.1;
            stageCtx.setLineDash(isCut ? [5, 3] : [3, 4]);
            stageCtx.beginPath();
            stageCtx.moveTo(sh.aPx[0], sh.aPx[1]);
            stageCtx.lineTo(sh.bPx[0], sh.bPx[1]);
            stageCtx.stroke();
            stageCtx.setLineDash([]);

            // Midpoint push bar (blade insertion handle)
            stageCtx.fillStyle = isCut ? '#ffcb7d' : '#182234';
            stageCtx.strokeStyle = '#ffcb7d';
            stageCtx.lineWidth = 1.6;
            stageCtx.beginPath();
            stageCtx.rect(sh.midPx[0] - 5, sh.midPx[1] - 5, 10, 10);
            stageCtx.fill();
            stageCtx.stroke();

            // Swivel tilt diamond tip (when blade is inserted or shutter mode armed)
            if (isCut || state.shutterHandlesVisible) {
              stageCtx.fillStyle = '#090d14';
              stageCtx.strokeStyle = '#6fd3ff';
              stageCtx.lineWidth = 1.5;
              stageCtx.beginPath();
              stageCtx.arc(sh.tipPx[0], sh.tipPx[1], 4.4, 0, Math.PI * 2);
              stageCtx.fill();
              stageCtx.stroke();
            }
          }
          stageCtx.restore();
        }
      }

      stageCtx.restore();
    }
  }

  // Multi-Surface Transform Bounding Box (Scale + Rotate + Group Translate)
  if (geomUnlocked && !maskFocus && !state.steerSpotMode && !state.trackpadSpotTarget && selSurfs.length > 1) {
    const bbox = computeSurfacesBoundingBox(selSurfs);
    if (bbox) {
      const giz = getMultiBoxGizmo(bbox, box);
      stageCtx.save();
      stageCtx.strokeStyle = 'rgba(52, 232, 158, 0.78)';
      stageCtx.lineWidth = 1.4;
      stageCtx.setLineDash([5, 4]);
      stageCtx.beginPath();
      giz.cornersPx.forEach((p, idx) => (idx === 0 ? stageCtx.moveTo(p[0], p[1]) : stageCtx.lineTo(p[0], p[1])));
      stageCtx.closePath();
      stageCtx.stroke();
      stageCtx.setLineDash([]);

      stageCtx.beginPath();
      stageCtx.moveTo(giz.topMidPx[0], giz.topMidPx[1]);
      stageCtx.lineTo(giz.rotHandlePx[0], giz.rotHandlePx[1]);
      stageCtx.stroke();

      stageCtx.fillStyle = '#ffcb7d';
      stageCtx.strokeStyle = '#090d14';
      stageCtx.lineWidth = 1.5;
      stageCtx.beginPath();
      stageCtx.arc(giz.rotHandlePx[0], giz.rotHandlePx[1], 5.8, 0, Math.PI * 2);
      stageCtx.fill();
      stageCtx.stroke();

      for (const cp of giz.cornersPx) {
        stageCtx.fillStyle = '#34e89e';
        stageCtx.strokeStyle = '#090d14';
        stageCtx.fillRect(cp[0] - 4.8, cp[1] - 4.8, 9.6, 9.6);
        stageCtx.strokeRect(cp[0] - 4.8, cp[1] - 4.8, 9.6, 9.6);
      }
      stageCtx.restore();
    }
  }

  // Master Output 4-Corner Keystone Stage Handles (when enabled + Edit Handles active)
  if (!state.showLock && state.masterKeystone?.enabled && state.masterKeystone?.editOnStage) {
    const kPts = state.masterKeystone.points.map(p => stageToPx(box, p[0], p[1]));
    const kLabels = ['K-BL', 'K-BR', 'K-TR', 'K-TL'];
    stageCtx.save();
    stageCtx.strokeStyle = '#ffcb7d';
    stageCtx.lineWidth = 2.0;
    stageCtx.setLineDash([7, 4]);
    stageCtx.beginPath();
    kPts.forEach((p, idx) => (idx === 0 ? stageCtx.moveTo(p[0], p[1]) : stageCtx.lineTo(p[0], p[1])));
    stageCtx.closePath();
    stageCtx.stroke();
    stageCtx.setLineDash([]);

    kPts.forEach((p, idx) => {
      stageCtx.fillStyle = '#ffcb7d';
      stageCtx.strokeStyle = '#090d14';
      stageCtx.lineWidth = 2;
      stageCtx.beginPath();
      stageCtx.arc(p[0], p[1], 7, 0, Math.PI * 2);
      stageCtx.fill();
      stageCtx.stroke();

      stageCtx.fillStyle = '#ffcb7d';
      stageCtx.font = '700 9.5px monospace';
      stageCtx.fillText(kLabels[idx], p[0] + 9, p[1] - 8);
    });
    stageCtx.restore();
  }

  // Milestone 6A + 7B/7C: Multi-Projector Screen Slices, 3D Stage-Plan Footprints & Convergent Performer Sightlines
  if (!state.showLock && state.multiProjector?.enabled && Array.isArray(state.multiProjector.screens)) {
    const mp = state.multiProjector;
    const useStagePlanGuides = !!(mp.stagePlan && mp.stagePlan.enabled && typeof solveStagePlanOpticalField === 'function');
    if (mp.showStageGuides !== false && !(mp.previewScreenIndex > 0)) {
      stageCtx.save();
      const spField = useStagePlanGuides ? solveStagePlanOpticalField(mp, false) : null;
      const palette = ['#34e89e', '#6fd3ff', '#ffcb7d', '#c084fc', '#ff6b8b', '#38bdf8'];
      for (const scr of mp.screens) {
        if (scr.enabled === false) continue;
        const isSelScr = scr.index === mp.selectedScreenIndex;
        const colHex = palette[(scr.index - 1) % palette.length];
        const opt = spField ? spField.opticsByIndex.get(scr.index) : null;

        if (opt && Array.isArray(opt.footprintStageUv) && opt.footprintStageUv.length === 4) {
          const polyPx = opt.footprintStageUv.map(uv => stageToPx(box, uv[0], uv[1]));
          stageCtx.fillStyle = isSelScr ? 'rgba(52, 232, 158, 0.08)' : 'rgba(111, 211, 255, 0.04)';
          stageCtx.strokeStyle = isSelScr ? '#34e89e' : colHex;
          stageCtx.lineWidth = isSelScr ? 2.0 : 1.25;
          stageCtx.setLineDash([6, 4]);
          stageCtx.beginPath();
          polyPx.forEach((pt, idx) => (idx === 0 ? stageCtx.moveTo(pt[0], pt[1]) : stageCtx.lineTo(pt[0], pt[1])));
          stageCtx.closePath();
          stageCtx.fill();
          stageCtx.stroke();
          stageCtx.setLineDash([]);

          const tlPx = polyPx[3];
          const tag = `P${scr.index} (${scr.lumens || 8500}lm)`;
          stageCtx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
          const tw = stageCtx.measureText(tag).width + 10;
          const bx = clamp(tlPx[0] + 6, box.x + 4, box.x + box.w - tw - 4);
          const by = clamp(tlPx[1] + 6, box.y + 4, box.y + box.h - 20);
          stageCtx.fillStyle = 'rgba(7, 11, 18, 0.88)';
          stageCtx.fillRect(bx, by, tw, 16);
          stageCtx.strokeStyle = colHex;
          stageCtx.strokeRect(bx, by, tw, 16);
          stageCtx.fillStyle = colHex;
          stageCtx.textAlign = 'left';
          stageCtx.textBaseline = 'middle';
          stageCtx.fillText(tag, bx + 5, by + 8);

          // 3D Convergent Followspot wall-hit indicator for each projector
          if (state.followspot?.converge3D && state.followspot.mode !== 'off' && typeof computeConvergentSpotForProjector === 'function') {
            const conv = computeConvergentSpotForProjector(state.followspot, scr.index, mp);
            const [perfPxX, perfPxY] = stageToPx(box, state.followspot.spotX, state.followspot.spotY);
            const [wallPxX, wallPxY] = stageToPx(box, conv.followspot.spotX, conv.followspot.spotY);
            stageCtx.strokeStyle = colHex;
            stageCtx.lineWidth = 1.2;
            stageCtx.setLineDash([3, 3]);
            stageCtx.beginPath();
            stageCtx.moveTo(perfPxX, perfPxY);
            stageCtx.lineTo(wallPxX, wallPxY);
            stageCtx.stroke();
            stageCtx.setLineDash([]);
            stageCtx.fillStyle = colHex;
            stageCtx.beginPath();
            stageCtx.arc(wallPxX, wallPxY, 3.5, 0, Math.PI * 2);
            stageCtx.fill();
          }
          continue;
        }

        const [x0, yTop] = stageToPx(box, scr.cropX, scr.cropY + scr.cropH);
        const [x1, yBot] = stageToPx(box, scr.cropX + scr.cropW, scr.cropY);
        const rw = x1 - x0;
        const rh = yBot - yTop;

        // Shaded optical overlap bands
        stageCtx.fillStyle = isSelScr ? 'rgba(52, 232, 158, 0.09)' : 'rgba(111, 211, 255, 0.05)';
        if (scr.blendL > 0.001) stageCtx.fillRect(x0, yTop, rw * scr.blendL, rh);
        if (scr.blendR > 0.001) stageCtx.fillRect(x1 - rw * scr.blendR, yTop, rw * scr.blendR, rh);
        if (scr.blendT > 0.001) stageCtx.fillRect(x0, yTop, rw, rh * scr.blendT);
        if (scr.blendB > 0.001) stageCtx.fillRect(x0, yBot - rh * scr.blendB, rw, rh * scr.blendB);

        stageCtx.strokeStyle = isSelScr ? 'rgba(52, 232, 158, 0.85)' : 'rgba(111, 211, 255, 0.45)';
        stageCtx.lineWidth = isSelScr ? 1.8 : 1.1;
        stageCtx.setLineDash([6, 4]);
        stageCtx.strokeRect(x0, yTop, rw, rh);
        stageCtx.setLineDash([]);

        const tag = `S${scr.index}${scr.delayMs > 0 ? ` +${scr.delayMs}ms` : ''}`;
        stageCtx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        const tw = stageCtx.measureText(tag).width + 10;
        stageCtx.fillStyle = 'rgba(7, 11, 18, 0.86)';
        stageCtx.fillRect(x0 + 6, yTop + 6, tw, 16);
        stageCtx.strokeStyle = isSelScr ? '#34e89e' : '#6fd3ff';
        stageCtx.strokeRect(x0 + 6, yTop + 6, tw, 16);
        stageCtx.fillStyle = isSelScr ? '#34e89e' : '#cfe8ff';
        stageCtx.textAlign = 'left';
        stageCtx.textBaseline = 'middle';
        stageCtx.fillText(tag, x0 + 11, yTop + 14);
      }
      stageCtx.restore();
    }

    const selScr = typeof getSelectedProjectorScreen === 'function' ? getSelectedProjectorScreen() : null;
    if (selScr && selScr.keystone?.enabled && selScr.keystone?.editOnStage) {
      const skPts = selScr.keystone.points.map(p => stageToPx(box, p[0], p[1]));
      const skLabels = [`S${selScr.index}-BL`, `S${selScr.index}-BR`, `S${selScr.index}-TR`, `S${selScr.index}-TL`];
      stageCtx.save();
      stageCtx.strokeStyle = '#34e89e';
      stageCtx.lineWidth = 2.0;
      stageCtx.setLineDash([5, 3]);
      stageCtx.beginPath();
      skPts.forEach((p, idx) => (idx === 0 ? stageCtx.moveTo(p[0], p[1]) : stageCtx.lineTo(p[0], p[1])));
      stageCtx.closePath();
      stageCtx.stroke();
      stageCtx.setLineDash([]);
      skPts.forEach((p, idx) => {
        stageCtx.fillStyle = '#34e89e';
        stageCtx.strokeStyle = '#090d14';
        stageCtx.lineWidth = 2;
        stageCtx.beginPath();
        stageCtx.arc(p[0], p[1], 6.5, 0, Math.PI * 2);
        stageCtx.fill();
        stageCtx.stroke();
        stageCtx.fillStyle = '#34e89e';
        stageCtx.font = '700 9px monospace';
        stageCtx.fillText(skLabels[idx], p[0] + 8, p[1] - 7);
      });
      stageCtx.restore();
    }
  }

  // Milestone 6B: LED Pixel Mapper Fixtures, Serpentine Wiring & Interactive Stage Handles
  if (!state.showLock && state.pixelMapper?.enabled && state.pixelMapper?.showFixtures !== false && Array.isArray(state.pixelMapper?.fixtures)) {
    const pm = state.pixelMapper;
    const dmxHandlesActive = !!pm.editOnStage;
    stageCtx.save();
    if (!pm.enabled) stageCtx.globalAlpha = 0.65;
    for (const fix of pm.fixtures) {
      if (!fix || fix.enabled === false) continue;
      const isSelFix = fix.id === pm.selectedFixtureId;
      const coords = typeof computeFixturePixelStageCoords === 'function' ? computeFixturePixelStageCoords(fix) : null;
      if (!coords || coords.length < 2) continue;
      const pCount = coords.length >> 1;
      const fCol = fix.accent || '#34e89e';

      // Wiring path polyline
      stageCtx.strokeStyle = isSelFix ? fCol : 'rgba(52, 232, 158, 0.42)';
      stageCtx.lineWidth = isSelFix ? 1.5 : 1.0;
      stageCtx.beginPath();
      for (let i = 0; i < pCount; i++) {
        const [px, py] = stageToPx(box, coords[i * 2], coords[i * 2 + 1]);
        if (i === 0) stageCtx.moveTo(px, py); else stageCtx.lineTo(px, py);
      }
      if (fix.type === 'ring' && pCount > 2) stageCtx.closePath();
      stageCtx.stroke();

      // Pixel sample dots (stride gracefully if > 256 pixels for crisp 60fps overlay)
      const step = pCount > 256 ? Math.ceil(pCount / 256) : 1;
      stageCtx.fillStyle = isSelFix ? '#ffffff' : 'rgba(255, 255, 255, 0.65)';
      for (let i = 0; i < pCount; i += step) {
        const [px, py] = stageToPx(box, coords[i * 2], coords[i * 2 + 1]);
        stageCtx.beginPath();
        stageCtx.arc(px, py, isSelFix ? 2.6 : 1.9, 0, Math.PI * 2);
        stageCtx.fill();
      }

      // Start Pixel #1 universe:channel address badge
      const [p0x, p0y] = stageToPx(box, coords[0], coords[1]);
      const addrTag = `U${fix.universe}:${fix.startChannel}`;
      stageCtx.font = '700 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      const atw = stageCtx.measureText(addrTag).width + 8;
      stageCtx.fillStyle = 'rgba(7, 11, 18, 0.88)';
      stageCtx.fillRect(p0x + 6, p0y - 16, atw, 14);
      stageCtx.strokeStyle = fCol;
      stageCtx.lineWidth = 1;
      stageCtx.strokeRect(p0x + 6, p0y - 16, atw, 14);
      stageCtx.fillStyle = fCol;
      stageCtx.textAlign = 'left';
      stageCtx.textBaseline = 'middle';
      stageCtx.fillText(addrTag, p0x + 10, p0y - 9);

      // Interactive stage edit handles when Edit Fixtures on Stage or DMX tab is armed
      if (dmxHandlesActive && isSelFix) {
        if (fix.type === 'strip') {
          const aPx = stageToPx(box, fix.x0, fix.y0);
          const bPx = stageToPx(box, fix.x1, fix.y1);
          const mPx = [(aPx[0] + bPx[0]) * 0.5, (aPx[1] + bPx[1]) * 0.5];
          for (const hp of [aPx, bPx]) {
            stageCtx.fillStyle = fCol;
            stageCtx.strokeStyle = '#090d14';
            stageCtx.lineWidth = 2;
            stageCtx.beginPath();
            stageCtx.arc(hp[0], hp[1], 6.5, 0, Math.PI * 2);
            stageCtx.fill();
            stageCtx.stroke();
          }
          stageCtx.fillStyle = '#ffcb7d';
          stageCtx.fillRect(mPx[0] - 5, mPx[1] - 5, 10, 10);
        } else {
          const cPx = stageToPx(box, fix.cx, fix.cy);
          const edgeStageX = fix.cx + (fix.type === 'ring' ? (fix.radiusX || 0.16) : (fix.width || 0.36) * 0.5);
          const edgeStageY = fix.cy - (fix.type === 'ring' ? (fix.radiusY || 0.16) : (fix.height || 0.22) * 0.5);
          const sPx = stageToPx(box, edgeStageX, edgeStageY);
          stageCtx.fillStyle = '#ffcb7d';
          stageCtx.strokeStyle = '#090d14';
          stageCtx.lineWidth = 2;
          stageCtx.beginPath();
          stageCtx.arc(cPx[0], cPx[1], 6.8, 0, Math.PI * 2);
          stageCtx.fill();
          stageCtx.stroke();

          stageCtx.fillStyle = fCol;
          stageCtx.fillRect(sPx[0] - 5.5, sPx[1] - 5.5, 11, 11);
          stageCtx.strokeRect(sPx[0] - 5.5, sPx[1] - 5.5, 11, 11);
        }
      }
    }
    stageCtx.restore();
  }

  // Soft-Brush Radius Preview when hovering Curved Mesh nodes
  if (!state.showLock && state.hoverMeshBrush && selSurf && isCurvedMeshSurface(selSurf) && selSurf.meshBrush > 0.005) {
    const bPx = stageToPx(box, state.hoverMeshBrush[0], state.hoverMeshBrush[1]);
    stageCtx.save();
    stageCtx.strokeStyle = 'rgba(255, 203, 125, 0.55)';
    stageCtx.setLineDash([4, 4]);
    stageCtx.lineWidth = 1.2;
    stageCtx.beginPath();
    stageCtx.ellipse(bPx[0], bPx[1], selSurf.meshBrush * box.w, selSurf.meshBrush * box.h, 0, 0, Math.PI * 2);
    stageCtx.stroke();
    stageCtx.restore();
  }

  // Phase 3.1 + Milestone 2: Draw Polygon & Smooth Bezier Masks (Wireframes, Curve Handles & Rubber-Band)
  if ((!state.showLock && (state.showWireframes || maskFocus)) || state.ecoMode) {
    for (const mask of state.masks) {
      if (!mask.visible && (!selMask || selMask.id !== mask.id)) continue;
      const isSelMask = selMask && mask.id === selMask.id;
      const isDrawing = state.drawingMaskId === mask.id;
      const mCol = mask.mode === 'add' ? '#34e89e' : '#b58cff';
      const ptsPx = mask.points.map(p => stageToPx(box, p[0], p[1]));
      if (ptsPx.length === 0) continue;

      const drawPtsPx = (!isDrawing && mask.points.length >= 3)
        ? getEvaluatedMaskPoints(mask, 128).map(p => stageToPx(box, p[0], p[1]))
        : ptsPx;

      stageCtx.save();
      stageCtx.strokeStyle = isSelMask ? mCol : 'rgba(181, 140, 255, 0.42)';
      stageCtx.lineWidth = isSelMask ? 2.0 : 1.2;
      if (!isDrawing) stageCtx.setLineDash([6, 4]);

      stageCtx.beginPath();
      drawPtsPx.forEach((p, idx) => (idx === 0 ? stageCtx.moveTo(p[0], p[1]) : stageCtx.lineTo(p[0], p[1])));
      if (!isDrawing && ptsPx.length >= 3) {
        stageCtx.closePath();
        if (isSelMask || state.ecoMode) {
          stageCtx.fillStyle = mask.mode === 'add' ? 'rgba(52, 232, 158, 0.08)' : 'rgba(181, 140, 255, 0.12)';
          stageCtx.fill();
        }
      } else if (isDrawing && state.maskHoverPt) {
        const hPx = stageToPx(box, state.maskHoverPt[0], state.maskHoverPt[1]);
        stageCtx.lineTo(hPx[0], hPx[1]);
      }
      stageCtx.stroke();
      stageCtx.setLineDash([]);

      // Edge-midpoint "+" insertion handles & vertex handles when in Mask mode & unlocked
      if (isSelMask && maskFocus && !mask.locked && !state.showLock) {
        if (!isDrawing && ptsPx.length >= 3 && ptsPx.length < 64) {
          for (let i = 0; i < ptsPx.length; i++) {
            const a = ptsPx[i];
            const b = ptsPx[(i + 1) % ptsPx.length];
            const mx = (a[0] + b[0]) * 0.5;
            const my = (a[1] + b[1]) * 0.5;
            stageCtx.fillStyle = 'rgba(181, 140, 255, 0.9)';
            stageCtx.strokeStyle = '#090d14';
            stageCtx.lineWidth = 1.2;
            stageCtx.beginPath();
            stageCtx.arc(mx, my, 3.8, 0, Math.PI * 2);
            stageCtx.fill();
            stageCtx.stroke();
          }
        }

        ptsPx.forEach((p, idx) => {
          const isCloseTarget = isDrawing && idx === 0 && ptsPx.length >= 3;
          const isSmoothV = !!mask.smoothAll || !!(mask.curveFlags && mask.curveFlags[idx]);
          stageCtx.fillStyle = isCloseTarget ? '#34e89e' : (isSmoothV ? '#142a24' : '#090d14');
          stageCtx.strokeStyle = isCloseTarget ? '#ffffff' : (isSmoothV ? '#34e89e' : mCol);
          stageCtx.lineWidth = 2;
          if (isSmoothV || isCloseTarget) {
            stageCtx.beginPath();
            stageCtx.arc(p[0], p[1], isCloseTarget ? 7.5 : 5.8, 0, Math.PI * 2);
            stageCtx.fill();
            stageCtx.stroke();
          } else {
            stageCtx.fillRect(p[0] - 4.8, p[1] - 4.8, 9.6, 9.6);
            stageCtx.strokeRect(p[0] - 4.8, p[1] - 4.8, 9.6, 9.6);
          }
        });
      }
      stageCtx.restore();
    }
  }

  // Persistent Selected Vertex Halo (Keyboard Arrow / , . Nudge Target)
  const selVertInfo = geomUnlocked ? resolveSelectedVertexStagePos() : null;
  if (selVertInfo) {
    const vPx = stageToPx(box, selVertInfo[0], selVertInfo[1]);
    stageCtx.save();
    stageCtx.strokeStyle = '#34e89e';
    stageCtx.lineWidth = 2.0;
    stageCtx.beginPath();
    stageCtx.arc(vPx[0], vPx[1], 10.5, 0, Math.PI * 2);
    stageCtx.stroke();

    stageCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    stageCtx.lineWidth = 1.0;
    stageCtx.beginPath();
    stageCtx.moveTo(vPx[0] - 15, vPx[1]); stageCtx.lineTo(vPx[0] - 11, vPx[1]);
    stageCtx.moveTo(vPx[0] + 11, vPx[1]); stageCtx.lineTo(vPx[0] + 15, vPx[1]);
    stageCtx.moveTo(vPx[0], vPx[1] - 15); stageCtx.lineTo(vPx[0], vPx[1] - 11);
    stageCtx.moveTo(vPx[0], vPx[1] + 11); stageCtx.lineTo(vPx[0], vPx[1] + 15);
    stageCtx.stroke();
    stageCtx.restore();
  }

  // Phase 3.3 + Pillar 2/4: Multi-Spot Blind Pre-Aim & Live Reticles
  drawBlindPreAimSpotsOverlay(stageCtx, box, effAspect, false);

  // P7: Followspot Iris Radius & Rotation Lollipop Handles (when Spot Inspector active & not Show Locked)
  if (shutterUnlocked && state.inspTab === 'spot' && !state.steerSpotMode && !state.trackpadSpotTarget) {
    const lol = getFollowspotLollipopHandles(box);
    if (lol) {
      stageCtx.save();
      stageCtx.strokeStyle = 'rgba(255, 203, 125, 0.78)';
      stageCtx.lineWidth = 1.4;
      stageCtx.beginPath();
      stageCtx.moveTo(lol.topRimPx[0], lol.topRimPx[1]);
      stageCtx.lineTo(lol.rotHandlePx[0], lol.rotHandlePx[1]);
      stageCtx.stroke();

      // Iris radius handle
      stageCtx.fillStyle = '#090d14';
      stageCtx.strokeStyle = '#ffcb7d';
      stageCtx.lineWidth = 2.0;
      stageCtx.beginPath();
      stageCtx.arc(lol.radiusHandlePx[0], lol.radiusHandlePx[1], 5.6, 0, Math.PI * 2);
      stageCtx.fill();
      stageCtx.stroke();

      // Rotation lollipop handle
      stageCtx.fillStyle = '#ffcb7d';
      stageCtx.strokeStyle = '#090d14';
      stageCtx.lineWidth = 1.6;
      stageCtx.beginPath();
      stageCtx.arc(lol.rotHandlePx[0], lol.rotHandlePx[1], 5.8, 0, Math.PI * 2);
      stageCtx.fill();
      stageCtx.stroke();
      stageCtx.restore();
    }
  }

  // Rubber-Band Marquee Selection Box
  if (state.marqueeRect) {
    const mr = state.marqueeRect;
    const x = Math.min(mr.x1, mr.x2);
    const y = Math.min(mr.y1, mr.y2);
    const mw = Math.abs(mr.x2 - mr.x1);
    const mh = Math.abs(mr.y2 - mr.y1);
    stageCtx.save();
    stageCtx.fillStyle = 'rgba(111, 211, 255, 0.11)';
    stageCtx.strokeStyle = '#6fd3ff';
    stageCtx.lineWidth = 1.3;
    stageCtx.setLineDash([4, 3]);
    stageCtx.fillRect(x, y, mw, mh);
    stageCtx.strokeRect(x, y, mw, mh);
    stageCtx.restore();
  }

  // Active Magnetic Snap Crosshairs
  if (state.activeSnapLines.length > 0) {
    stageCtx.save();
    for (const s of state.activeSnapLines) {
      const p = stageToPx(box, s.x, s.y);
      stageCtx.strokeStyle = s.kind === 'vertex' ? '#34e89e' : '#ffcb7d';
      stageCtx.lineWidth = 1.4;
      stageCtx.setLineDash([3, 3]);
      stageCtx.beginPath();
      stageCtx.moveTo(p[0] - 18, p[1]); stageCtx.lineTo(p[0] + 18, p[1]);
      stageCtx.moveTo(p[0], p[1] - 18); stageCtx.lineTo(p[0], p[1] + 18);
      stageCtx.stroke();
      stageCtx.setLineDash([]);
      stageCtx.beginPath();
      stageCtx.arc(p[0], p[1], 8.5, 0, Math.PI * 2);
      stageCtx.stroke();
    }
    stageCtx.restore();
  }

  // 6x Sub-Pixel Magnifier Loupe HUD (samples live WebGL2 framebuffer directly)
  const ls = state.loupeState;
  const nowMs = performance.now();
  const showLoupe = (
    state.enableLoupe &&
    !state.ecoMode &&
    !state.showLock &&
    ls &&
    ls.active &&
    metrics.areaRect &&
    (stageDrag || nowMs < ls.expireMs)
  );
  if (ls && ls.active && !stageDrag && nowMs >= ls.expireMs) {
    ls.active = false;
  }

  if (showLoupe) {
    const loupeSize = 136;
    const zoomMag = 6.0;
    const tPx = stageToPx(box, ls.sx, ls.sy);
    const inTopLeft = (tPx[0] < loupeSize + 44) && (tPx[1] < loupeSize + 52);
    const lx = inTopLeft ? Math.max(14, rect.width - loupeSize - 14) : 14;
    const ly = 14;

    const glCenterX = (metrics.vpRect.left - metrics.areaRect.left + tPx[0]) * dpr;
    const glCenterY = (metrics.vpRect.top - metrics.areaRect.top + tPx[1]) * dpr;
    const srcW = (loupeSize * dpr) / zoomMag;
    const srcH = (loupeSize * dpr) / zoomMag;
    const srcX = glCenterX - srcW * 0.5;
    const srcY = glCenterY - srcH * 0.5;

    stageCtx.save();
    stageCtx.fillStyle = '#05080f';
    stageCtx.strokeStyle = ls.fineGear ? '#ffcb7d' : '#34e89e';
    stageCtx.lineWidth = 2;
    stageCtx.beginPath();
    stageCtx.roundRect(lx, ly, loupeSize, loupeSize, 10);
    stageCtx.fill();
    stageCtx.clip();

    try {
      const prevSmooth = stageCtx.imageSmoothingEnabled;
      stageCtx.imageSmoothingEnabled = false;
      stageCtx.drawImage(glCanvas, srcX, srcY, srcW, srcH, lx, ly, loupeSize, loupeSize);
      stageCtx.imageSmoothingEnabled = prevSmooth;
    } catch (_) {}

    // Crisp sub-pixel crosshair inside Loupe
    const cx = lx + loupeSize * 0.5;
    const cy = ly + loupeSize * 0.5;
    stageCtx.strokeStyle = 'rgba(52, 232, 158, 0.85)';
    stageCtx.lineWidth = 1;
    stageCtx.beginPath();
    stageCtx.moveTo(lx, cy); stageCtx.lineTo(cx - 5, cy);
    stageCtx.moveTo(cx + 5, cy); stageCtx.lineTo(lx + loupeSize, cy);
    stageCtx.moveTo(cx, ly); stageCtx.lineTo(cx, cy - 5);
    stageCtx.moveTo(cx, cy + 5); stageCtx.lineTo(cx, ly + loupeSize);
    stageCtx.stroke();

    // Canonical pixel readout bar at bottom of Loupe
    const outW = state.stageWidth || 1920;
    const outH = state.stageHeight || 1080;
    const pixX = (ls.sx * outW).toFixed(1);
    const pixY = ((1.0 - ls.sy) * outH).toFixed(1);
    stageCtx.fillStyle = 'rgba(7, 10, 16, 0.86)';
    stageCtx.fillRect(lx, ly + loupeSize - 22, loupeSize, 22);
    stageCtx.fillStyle = ls.fineGear ? '#ffcb7d' : '#e8eef8';
    stageCtx.font = '600 9.5px monospace';
    stageCtx.textAlign = 'center';
    stageCtx.textBaseline = 'middle';
    stageCtx.fillText(`${pixX}, ${pixY}px${ls.fineGear ? ' • 10×' : ''}`, cx, ly + loupeSize - 11);
    stageCtx.restore();

    // Outer border ring
    stageCtx.save();
    stageCtx.strokeStyle = ls.fineGear ? '#ffcb7d' : '#34e89e';
    stageCtx.lineWidth = 1.8;
    stageCtx.beginPath();
    stageCtx.roundRect(lx, ly, loupeSize, loupeSize, 10);
    stageCtx.stroke();
    stageCtx.restore();
  }

  // P3: ARRI Camera Viewfinder Frame-Line Bezel & Active Held-Modifier Strip
  renderArriStageModeBezel(stageCtx, rect, box);
}

// ============================================================================
// 3. POINTER CAPTURE INTERACTION CONTROLLERS (STAGE, INPUT UV, SPLITTER)
// ============================================================================

function computeStageSnap(rawX, rawY, excludeSurfId, excludePtIdx, box, fineGear = false) {
  let sx = rawX, sy = rawY;
  const snaps = [];
  if (fineGear) return { sx, sy, snaps }; // Alt 10x fine-gear bypasses magnetic snap for sub-pixel placement!

  const threshX = 11 / Math.max(40, box.w);
  const threshY = 11 / Math.max(40, box.h);

  if (state.snapVertices) {
    let bestDist = Infinity;
    let bestPt = null;
    for (const surf of state.surfaces) {
      if (!getEffectiveSurfaceProps(surf).visible) continue;
      for (let i = 0; i < surf.points.length; i++) {
        if (surf.id === excludeSurfId && i === excludePtIdx) continue;
        const p = surf.points[i];
        const dx = (p[0] - rawX) / threshX;
        const dy = (p[1] - rawY) / threshY;
        const d = Math.hypot(dx, dy);
        if (d < 1.0 && d < bestDist) { bestDist = d; bestPt = p; }
      }
    }
    const stageCorners = [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]];
    for (const p of stageCorners) {
      const dx = (p[0] - rawX) / threshX;
      const dy = (p[1] - rawY) / threshY;
      const d = Math.hypot(dx, dy);
      if (d < 1.0 && d < bestDist) { bestDist = d; bestPt = p; }
    }
    if (bestPt) {
      sx = bestPt[0]; sy = bestPt[1];
      snaps.push({ kind: 'vertex', x: sx, y: sy });
      return { sx, sy, snaps };
    }
  }

  if (state.snapGrid) {
    const gx = Math.round(rawX * state.gridDivsX) / state.gridDivsX;
    const gy = Math.round(rawY * state.gridDivsY) / state.gridDivsY;
    const snappedX = Math.abs(gx - rawX) < threshX * 0.85;
    const snappedY = Math.abs(gy - rawY) < threshY * 0.85;
    if (snappedX) sx = gx;
    if (snappedY) sy = gy;
    if (snappedX || snappedY) snaps.push({ kind: 'grid', x: sx, y: sy });
  }
  return { sx, sy, snaps };
}

function getMeshCornerSlot(surf, nodeIdx) {
  const cols = surf.meshCols || 3;
  const rows = surf.meshRows || 3;
  const stride = cols + 1;
  if (nodeIdx === 0) return 0;
  if (nodeIdx === cols) return 1;
  if (nodeIdx === rows * stride + cols) return 2;
  if (nodeIdx === rows * stride) return 3;
  return -1;
}

function findWeldedNeighbors(excludeSurfId, originPt) {
  if (!state.weldVertices || !originPt) return [];
  const WELD_EPS = 0.0028;
  const out = [];
  for (const s of state.surfaces) {
    if (s.id === excludeSurfId) continue;
    const eff = getEffectiveSurfaceProps(s);
    if (!eff.visible || eff.locked) continue;
    if (isCurvedMeshSurface(s)) {
      ensureSurfaceMeshValid(s);
      const cols = s.meshCols || 3;
      const rows = s.meshRows || 3;
      const stride = cols + 1;
      const cornerNodes = [0, cols, rows * stride + cols, rows * stride];
      for (let slot = 0; slot < 4; slot++) {
        const nIdx = cornerNodes[slot];
        const p = s.meshPts[nIdx];
        if (p && Math.hypot(p[0] - originPt[0], p[1] - originPt[1]) <= WELD_EPS) {
          out.push({
            surfId: s.id,
            curved: true,
            slot,
            origCorners: s.points.map(q => [q[0], q[1]]),
            origMeshPts: s.meshPts.map(q => [q[0], q[1]])
          });
        }
      }
    } else {
      for (let j = 0; j < s.points.length; j++) {
        const p = s.points[j];
        if (Math.hypot(p[0] - originPt[0], p[1] - originPt[1]) <= WELD_EPS) {
          out.push({ surfId: s.id, curved: false, ptIdx: j });
        }
      }
    }
  }
  return out;
}

function applyWeldedTarget(weldedList, newPt) {
  if (!weldedList || weldedList.length === 0) return;
  for (const w of weldedList) {
    const s = state.surfaces.find(x => x.id === w.surfId);
    if (!s) continue;
    if (w.curved) {
      warpMeshByCornerMove(s, w.slot, newPt, w.origCorners, w.origMeshPts);
    } else {
      s.points[w.ptIdx] = [newPt[0], newPt[1]];
      if (s.type === 'quad') initSurfaceMeshFromCorners(s);
      bumpSurfaceGeom(s);
    }
  }
}

function setLoupeTarget(sx, sy, fineGear = false, holdMs = 900) {
  if (!state.loupeState) state.loupeState = {};
  state.loupeState.active = true;
  state.loupeState.sx = sx;
  state.loupeState.sy = sy;
  state.loupeState.fineGear = !!fineGear;
  state.loupeState.expireMs = performance.now() + holdMs;
}

// Cycle active vertex selection with ',' / '.' keys for mouse-free projector calibration
function cycleSelectedVertex(dir = 1) {
  if (state.showLock) {
    showToast('🔒 Show Lock active — press Shift+P to unlock');
    return;
  }
  const maskFocus = state.leftTab === 'masks' || state.inspTab === 'mask';
  if (maskFocus) {
    const m = getSelectedMask();
    if (!m || m.locked || m.points.length === 0) return;
    const cur = (state.selectedVertex && state.selectedVertex.kind === 'mask-pt' && state.selectedVertex.maskId === m.id)
      ? state.selectedVertex.idx
      : -1;
    const next = (cur + dir + m.points.length) % m.points.length;
    state.selectedVertex = { kind: 'mask-pt', maskId: m.id, idx: next };
    const pt = m.points[next];
    pingCalibCrosshair(pt[0], pt[1], 1800);
    setLoupeTarget(pt[0], pt[1], false, 1400);
    return;
  }

  if (state.masterKeystone?.enabled && state.masterKeystone?.editOnStage) {
    const cur = (state.selectedVertex && state.selectedVertex.kind === 'keystone-pt')
      ? state.selectedVertex.idx
      : -1;
    const next = (cur + dir + 4) % 4;
    state.selectedVertex = { kind: 'keystone-pt', idx: next };
    const pt = state.masterKeystone.points[next];
    pingCalibCrosshair(pt[0], pt[1], 1800);
    setLoupeTarget(pt[0], pt[1], false, 1400);
    return;
  }

  const surf = getSelectedSurface();
  if (!surf || getEffectiveSurfaceProps(surf).locked) return;
  if (surf.type === 'mesh3d') {
    const pins = Array.isArray(surf.calibPins) ? surf.calibPins : [];
    if (surf.calibMode === 'calibrated' && pins.length > 0) {
      const len = pins.length;
      const cur = (state.selectedVertex && state.selectedVertex.kind === 'calib-pin' && state.selectedVertex.surfId === surf.id)
        ? state.selectedVertex.idx
        : state.selectedCalibPinIdx;
      const next = ((cur >= 0 ? cur : -1) + dir + len) % len;
      state.selectedCalibPinIdx = next;
      state.selectedVertex = { kind: 'calib-pin', surfId: surf.id, idx: next };
      const pt = pins[next].stage2d;
      pingCalibCrosshair(pt[0], pt[1], 1800);
      setLoupeTarget(pt[0], pt[1], false, 1400);
      if (typeof syncMesh3DPnpStatusUI === 'function') syncMesh3DPnpStatusUI(surf);
    }
    return;
  }
  if (isCurvedMeshSurface(surf)) {
    ensureSurfaceMeshValid(surf);
    const len = surf.meshPts.length;
    const cur = (state.selectedVertex && state.selectedVertex.kind === 'mesh-node' && state.selectedVertex.surfId === surf.id)
      ? state.selectedVertex.idx
      : -1;
    const next = (cur + dir + len) % len;
    state.selectedVertex = { kind: 'mesh-node', surfId: surf.id, idx: next };
    const pt = surf.meshPts[next];
    pingCalibCrosshair(pt[0], pt[1], 1800);
    setLoupeTarget(pt[0], pt[1], false, 1400);
  } else {
    const len = surf.points.length;
    const cur = (state.selectedVertex && state.selectedVertex.kind === 'surf-corner' && state.selectedVertex.surfId === surf.id)
      ? state.selectedVertex.idx
      : -1;
    const next = (cur + dir + len) % len;
    state.selectedVertex = { kind: 'surf-corner', surfId: surf.id, idx: next };
    const pt = surf.points[next];
    pingCalibCrosshair(pt[0], pt[1], 1800);
    setLoupeTarget(pt[0], pt[1], false, 1400);
  }
}

// Micro-nudge either the active selected vertex OR all selected surfaces
function nudgeSelectedTargetByDelta(dx, dy, fineGear = false) {
  if (state.showLock) {
    showToast('🔒 Show Lock active — press Shift+P to unlock');
    return;
  }
  // 2 · MAP / 3 · LIVE never move physical geometry by accident — arrows only nudge with Hold W.
  if ((state.room === 'map' || state.room === 'live') && !state.liveReachThrough) {
    showToast(`📐 Geometry is protected in ${state.room === 'map' ? '2 · MAP' : '3 · LIVE'} — hold W + arrows to nudge, or edit in 1 · BUILD (F1)`);
    return;
  }
  const sv = state.selectedVertex;
  if (sv) {
    if (sv.kind === 'calib-pin') {
      const surf = state.surfaces.find(x => x.id === sv.surfId);
      const pin = surf && !getEffectiveSurfaceProps(surf).locked ? surf.calibPins?.[sv.idx] : null;
      if (surf && pin && Array.isArray(pin.stage2d)) {
        pushUndoCheckpoint('Nudge 3D Calibration Pin', 'arrow-calib-pin');
        const nextPt = [clamp(pin.stage2d[0] + dx, -0.35, 1.35), clamp(pin.stage2d[1] + dy, -0.35, 1.35)];
        pin.stage2d = nextPt;
        bumpSurfaceGeom(surf);
        state._sceneSyncRev++;
        pingCalibCrosshair(nextPt[0], nextPt[1], 1400);
        setLoupeTarget(nextPt[0], nextPt[1], fineGear, 1200);
        if (typeof syncMesh3DPnpStatusUI === 'function') syncMesh3DPnpStatusUI(surf);
        scheduleAutosave();
        return;
      }
    }
    if (sv.kind === 'keystone-pt' && state.masterKeystone?.points?.[sv.idx]) {
      pushUndoCheckpoint('Nudge Keystone Corner', 'arrow-keystone');
      const pt = state.masterKeystone.points[sv.idx];
      pt[0] = clamp(pt[0] + dx, -0.5, 1.5);
      pt[1] = clamp(pt[1] + dy, -0.5, 1.5);
      state._sceneSyncRev++;
      pingCalibCrosshair(pt[0], pt[1], 1400);
      setLoupeTarget(pt[0], pt[1], fineGear, 1200);
      scheduleAutosave();
      return;
    }
    if (sv.kind === 'mask-pt') {
      const m = state.masks.find(x => x.id === sv.maskId);
      if (m && !m.locked && m.points[sv.idx]) {
        pushUndoCheckpoint('Nudge Mask Vertex', 'arrow-mask-pt');
        const pt = m.points[sv.idx];
        pt[0] = clamp(pt[0] + dx, -0.45, 1.45);
        pt[1] = clamp(pt[1] + dy, -0.45, 1.45);
        state._sceneSyncRev++;
        pingCalibCrosshair(pt[0], pt[1], 1400);
        setLoupeTarget(pt[0], pt[1], fineGear, 1200);
        scheduleAutosave();
        return;
      }
    }
    if (sv.kind === 'surf-corner' || sv.kind === 'mesh-node') {
      const surf = state.surfaces.find(x => x.id === sv.surfId);
      if (surf && !getEffectiveSurfaceProps(surf).locked) {
        pushUndoCheckpoint('Nudge Vertex', 'arrow-vertex');
        if (sv.kind === 'surf-corner' && surf.points[sv.idx]) {
          const origPt = [surf.points[sv.idx][0], surf.points[sv.idx][1]];
          const welded = findWeldedNeighbors(surf.id, origPt);
          const nextPt = [clamp(origPt[0] + dx, -0.45, 1.45), clamp(origPt[1] + dy, -0.45, 1.45)];
          surf.points[sv.idx] = nextPt;
          if (surf.type === 'quad') initSurfaceMeshFromCorners(surf);
          bumpSurfaceGeom(surf);
          applyWeldedTarget(welded, nextPt);
          pingCalibCrosshair(nextPt[0], nextPt[1], 1400);
          setLoupeTarget(nextPt[0], nextPt[1], fineGear, 1200);
          scheduleAutosave();
          return;
        }
        if (sv.kind === 'mesh-node') {
          ensureSurfaceMeshValid(surf);
          if (surf.meshPts[sv.idx]) {
            const origPt = [surf.meshPts[sv.idx][0], surf.meshPts[sv.idx][1]];
            const slot = getMeshCornerSlot(surf, sv.idx);
            const welded = slot >= 0 ? findWeldedNeighbors(surf.id, origPt) : [];
            const nextPt = [clamp(origPt[0] + dx, -0.45, 1.45), clamp(origPt[1] + dy, -0.45, 1.45)];
            if (slot >= 0 && surf.meshPinCorners) {
              warpMeshByCornerMove(surf, slot, nextPt, surf.points.map(p => [p[0], p[1]]), surf.meshPts.map(p => [p[0], p[1]]));
            } else {
              surf.meshPts[sv.idx] = nextPt;
              syncCornersFromMesh(surf);
              bumpSurfaceGeom(surf);
            }
            applyWeldedTarget(welded, nextPt);
            pingCalibCrosshair(nextPt[0], nextPt[1], 1400);
            setLoupeTarget(nextPt[0], nextPt[1], fineGear, 1200);
            scheduleAutosave();
            return;
          }
        }
      }
    }
  }

  // Fallback: nudge all unlocked selected surfaces (or selected mask when Mask Stage Edit is active)
  if (isMaskStageEditActive()) {
    const m = getSelectedMask();
    if (m && !m.locked) {
      pushUndoCheckpoint('Nudge Mask', 'arrow-mask');
      m.points = m.points.map(p => [p[0] + dx, p[1] + dy]);
      state._sceneSyncRev++;
      scheduleAutosave();
    }
    return;
  }

  const targets = getSelectedSurfaces().filter(s => !getEffectiveSurfaceProps(s).locked);
  if (targets.length === 0) return;
  pushUndoCheckpoint(targets.length > 1 ? 'Nudge Surfaces' : 'Nudge Surface', 'arrow-surf');
  const stAspect = (state.stageWidth || 1920) / Math.max(1, state.stageHeight || 1080);
  for (const s of targets) {
    if (s.type === 'mesh3d') {
      if (s.calibMode === 'calibrated' && Array.isArray(s.calibPins)) {
        s.calibPins.forEach(cp => {
          if (cp && Array.isArray(cp.stage2d)) {
            cp.stage2d = [clamp(cp.stage2d[0] + dx, -0.35, 1.35), clamp(cp.stage2d[1] + dy, -0.35, 1.35)];
          }
        });
      } else {
        if (!Array.isArray(s.pos3d)) s.pos3d = [0, 0, 0];
        const zDepth = Math.max(0.4, (s.camDist ?? 2.6) - (s.pos3d[2] || 0));
        const thr = Math.max(0.25, s.camThrow ?? 1.4);
        s.pos3d[0] = clamp(s.pos3d[0] + dx * (zDepth / thr), -3.0, 3.0);
        s.pos3d[1] = clamp(s.pos3d[1] + dy * (zDepth / (thr * stAspect)), -3.0, 3.0);
      }
      state._sceneSyncRev++;
      if (s.id === state.selectedSurfaceId && typeof syncInspectorUI === 'function') syncInspectorUI();
    } else {
      s.points = s.points.map(p => [p[0] + dx, p[1] + dy]);
      if (s.meshPts) {
        s.meshPts = s.meshPts.map(p => [p[0] + dx, p[1] + dy]);
      }
    }
    bumpSurfaceGeom(s);
  }
  scheduleAutosave();
}

function applyFollowspotGestureDelta(dxPx, dyPx, box, e) {
  const fs = typeof getActiveLiveSpot === 'function' ? getActiveLiveSpot() : null;
  if (!fs || fs.enabled === false) return;
  fs._lastSeatTouchMs = Date.now();
  if (e.shiftKey) {
    fs.stretchX = clamp(fs.stretchX + dxPx * 0.005, 0.15, 3.5);
    fs.stretchY = clamp(fs.stretchY - dyPx * 0.005, 0.15, 3.5);
  } else if (e.altKey || state.modKeys.r) {
    fs.rotation = ((fs.rotation + dxPx * 0.5 + 540) % 360) - 180;
  } else if (state.modKeys.m) {
    fs.morph = clamp(fs.morph + (dxPx - dyPx) * 0.006, 0, 3);
  } else if (state.modKeys.s) {
    fs.shadowDepth = clamp(fs.shadowDepth + dxPx * 0.003, 0, 1);
    fs.shadowTex = clamp(fs.shadowTex - dyPx * 0.005, 0.15, 3.0);
  } else if (typeof steerSpotInWorld === 'function' && steerSpotInWorld(fs, dxPx / Math.max(80, box.w), -dyPx / Math.max(80, box.h))) {
    // 3D-aimed spot: steered across the floor relative to the camera (05h).
  } else {
    fs.targetX = clamp(fs.targetX + dxPx / Math.max(80, box.w), -0.15, 1.15);
    fs.targetY = clamp(fs.targetY - dyPx / Math.max(80, box.h), -0.15, 1.15);
  }
  syncFollowspotInspectorUI();
  if (state.room === 'live' && typeof renderLivePerformanceDockUI === 'function') {
    renderLivePerformanceDockUI();
  }
}

let stageDrag = null;
const stageCoordsEl = document.getElementById('stage-coords');

function bindViewportInteractions() {
  // Pointer Lock movement support for blind trackpad Followspot steering
  document.addEventListener('pointerlockchange', () => {
    state.pointerLocked = (document.pointerLockElement === stageOverlay);
    const btnLock = document.getElementById('btn-spot-lock');
    if (btnLock) btnLock.classList.toggle('active', state.pointerLocked);
  });

  document.addEventListener('mousemove', (e) => {
    if (!state.pointerLocked || !lastStageMetrics) return;
    applyFollowspotGestureDelta(e.movementX, e.movementY, lastStageMetrics.box, e);
  });

  stageOverlay.addEventListener('dblclick', (e) => {
    if (state.drawingSurfaceId) {
      finishActiveSurfaceDrawing();
      return;
    }
    if (state.drawingMaskId) {
      finishActiveMaskDrawing();
      return;
    }
    if (!lastStageMetrics || state.showLock) return;
    const rect = stageOverlay.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { box } = lastStageMetrics;

    const sel = getSelectedSurface();
    if (sel && !getEffectiveSurfaceProps(sel).locked && isSurfaceShutterHandlesActive(sel)) {
      const shHandles = computeSurfaceShutterHandles(sel, box);
      for (const sh of shHandles) {
        if (Math.hypot(sh.midPx[0] - px, sh.midPx[1] - py) <= 12 || Math.hypot(sh.tipPx[0] - px, sh.tipPx[1] - py) <= 12) {
          pushUndoCheckpoint(`Reset Shutter ${sh.side}`);
          sel[sh.insKey] = 0;
          sel[sh.angKey] = 0;
          state._sceneSyncRev++;
          syncInspectorUI();
          scheduleAutosave();
          showToast(`Reset Framing Shutter ${sh.side}`);
          return;
        }
      }
    }

    const maskEditActive = isMaskStageEditActive();
    const selMask = getSelectedMask();
    if (maskEditActive && selMask && selMask.visible && !selMask.locked) {
      for (let i = 0; i < selMask.points.length; i++) {
        const vp = stageToPx(box, selMask.points[i][0], selMask.points[i][1]);
        if (Math.hypot(vp[0] - px, vp[1] - py) <= 12) {
          pushUndoCheckpoint('Toggle Smooth Mask Vertex');
          if (!Array.isArray(selMask.curveFlags) || selMask.curveFlags.length !== selMask.points.length) {
            selMask.curveFlags = selMask.points.map((_, idx) =>
              selMask.smoothAll ? true : !!(selMask.curveFlags && selMask.curveFlags[idx])
            );
          }
          if (selMask.smoothAll) {
            selMask.curveFlags = selMask.points.map(() => true);
            selMask.smoothAll = false;
          }
          selMask.curveFlags[i] = !selMask.curveFlags[i];
          state._sceneSyncRev++;
          syncMaskInspectorUI();
          scheduleAutosave();
          showToast(`Mask Vertex M${i + 1}: ${selMask.curveFlags[i] ? 'Smooth Bezier Curve' : 'Sharp Corner'}`);
          return;
        }
      }
    }
  });

  stageOverlay.addEventListener('pointerdown', (e) => {
    if (!lastStageMetrics || state.projectorMode) return;
    const rect = stageOverlay.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { box } = lastStageMetrics;
    const [sx, sy] = pxToStage(box, px, py);

    // Pan viewport with middle mouse or Space+Drag
    if (e.button === 1 || spacePanHeld) {
      if (spacePanHeld) spacePanUsed = true;
      stageDrag = { mode: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origPanX: state.stageView.panX, origPanY: state.stageView.panY };
      stageOverlay.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    // 1. Live Followspot / No-Controller Trackpad Cycler (`state.trackpadSpotTarget`: None -> Spot 1 -> Spot 2 -> None)
    const activeTpSpot = (state.trackpadSpotTarget || state.steerSpotMode) && typeof getActiveLiveSpot === 'function'
      ? getActiveLiveSpot()
      : null;
    if (activeTpSpot && activeTpSpot.enabled !== false) {
      if (!e.shiftKey && !e.altKey && !state.modKeys.r && !state.modKeys.m && !state.modKeys.s) {
        if (!(typeof placeSpotFromStageUv === 'function' && placeSpotFromStageUv(activeTpSpot, sx, sy))) {
          activeTpSpot.targetX = clamp(sx, -0.15, 1.15);
          activeTpSpot.targetY = clamp(sy, -0.15, 1.15);
        }
        activeTpSpot._lastSeatTouchMs = Date.now();
      }
      stageDrag = { mode: 'spot-steer', pointerId: e.pointerId, lastClientX: e.clientX, lastClientY: e.clientY };
      stageOverlay.setPointerCapture(e.pointerId);
      return;
    }

    // In 3 · LIVE with Trackpad -> None (and Hold W not pressed), protect physical geometry completely
    if (state.room === 'live' && !state.liveReachThrough) {
      return;
    }

    // Show Lock Guard: protect live mapping geometry against accidental touches unless Surgical Reach-Through (Hold W) is active
    if (state.showLock && !((state.room === 'live' || state.room === 'map') && state.liveReachThrough)) {
      showToast('🔒 Show Lock active — press Shift+P to unlock (or Hold W for surgical warp)');
      return;
    }

    const mapSelectOnly = state.room === 'map' && !state.liveReachThrough && !state.drawingSurfaceId && !state.drawingMaskId;

    // 1B. Active Freeform N-Gon Polygon / Architectural Line Pen Drawing Mode
    if (state.drawingSurfaceId) {
      const dSurf = state.surfaces.find(s => s.id === state.drawingSurfaceId);
      if (dSurf) {
        if (dSurf.points.length >= 3) {
          const p0Px = stageToPx(box, dSurf.points[0][0], dSurf.points[0][1]);
          if (Math.hypot(p0Px[0] - px, p0Px[1] - py) <= 13) {
            if (dSurf.type === 'line') dSurf.lineClosed = true;
            finishActiveSurfaceDrawing();
            return;
          }
        }
        const maxV = dSurf.type === 'polygon' ? 48 : 96;
        if (dSurf.points.length < maxV) {
          pushUndoCheckpoint('Add Surface Point', `draw_surf_${dSurf.id}`);
          const res = computeStageSnap(sx, sy, dSurf.id, -1, box, e.altKey);
          dSurf.points.push([clamp(res.sx, -0.35, 1.35), clamp(res.sy, -0.35, 1.35)]);
          state.activeSnapLines = res.snaps;
          if (dSurf.type === 'polygon' && dSurf.points.length >= 3) {
            syncPolygonUvsFromStage(dSurf);
          }
          bumpSurfaceGeom(dSurf);
          if (dSurf.points.length >= maxV) {
            finishActiveSurfaceDrawing();
          } else {
            renderSurfaceList();
            syncInspectorUI();
          }
        }
        return;
      }
    }

    // 2. Active Polygon Mask Creation Mode (N-point click tool)
    if (state.drawingMaskId) {
      const mask = state.masks.find(m => m.id === state.drawingMaskId);
      if (mask) {
        if (mask.points.length >= 3) {
          const p0Px = stageToPx(box, mask.points[0][0], mask.points[0][1]);
          if (Math.hypot(p0Px[0] - px, p0Px[1] - py) <= 13) {
            finishActiveMaskDrawing();
            return;
          }
        }
        if (mask.points.length < 64) {
          pushUndoCheckpoint('Add Mask Point', `draw_${mask.id}`);
          const res = computeStageSnap(sx, sy, null, -1, box, e.altKey);
          mask.points.push([clamp(res.sx, -0.25, 1.25), clamp(res.sy, -0.25, 1.25)]);
          if (!Array.isArray(mask.curveFlags)) mask.curveFlags = [];
          mask.curveFlags.push(!!mask.smoothAll);
          state.activeSnapLines = res.snaps;
          state._sceneSyncRev++;
          if (mask.points.length >= 64) {
            finishActiveMaskDrawing();
          } else {
            renderMaskList();
            syncMaskInspectorUI();
          }
        }
        return;
      }
    }

    // 2B. Master Output 4-Corner Keystone Stage Handles
    if (state.masterKeystone?.enabled && state.masterKeystone?.editOnStage) {
      for (let i = 0; i < 4; i++) {
        const kp = state.masterKeystone.points[i];
        const kPx = stageToPx(box, kp[0], kp[1]);
        if (Math.hypot(kPx[0] - px, kPx[1] - py) <= 12) {
          beginUndoGesture('Master Keystone');
          state.selectedVertex = { kind: 'keystone-pt', idx: i };
          pingCalibCrosshair(kp[0], kp[1], 1800);
          setLoupeTarget(kp[0], kp[1], e.altKey, 1200);
          stageDrag = {
            mode: 'keystone-pt',
            pointerId: e.pointerId,
            ptIdx: i,
            rawPrev: [sx, sy],
            gearedCur: [kp[0], kp[1]]
          };
          stageOverlay.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    // 2C. Per-Projector Screen 4-Corner Keystone Stage Handles (Milestone 6)
    if (state.multiProjector?.enabled && typeof getSelectedProjectorScreen === 'function') {
      const selScr = getSelectedProjectorScreen();
      if (selScr && selScr.keystone?.enabled && selScr.keystone?.editOnStage) {
        for (let i = 0; i < 4; i++) {
          const kp = selScr.keystone.points[i];
          const kPx = stageToPx(box, kp[0], kp[1]);
          if (Math.hypot(kPx[0] - px, kPx[1] - py) <= 12) {
            beginUndoGesture(`Screen ${selScr.index} Keystone`);
            stageDrag = {
              mode: 'proj-ks-pt',
              pointerId: e.pointerId,
              screenIndex: selScr.index,
              ptIdx: i,
              rawPrev: [sx, sy],
              gearedCur: [kp[0], kp[1]]
            };
            stageOverlay.setPointerCapture(e.pointerId);
            return;
          }
        }
      }
    }

    // 2D. LED Pixel Mapper Stage Fixture Handles (Milestone 6)
    const dmxStageEditActive = !!(state.pixelMapper && state.pixelMapper.enabled &&
      state.pixelMapper.editOnStage && Array.isArray(state.pixelMapper.fixtures));
    if (dmxStageEditActive) {
      const pm = state.pixelMapper;
      const selFix = typeof getSelectedDmxFixture === 'function' ? getSelectedDmxFixture() : null;
      if (selFix && selFix.enabled !== false) {
        if (selFix.type === 'strip') {
          const aPx = stageToPx(box, selFix.x0, selFix.y0);
          const bPx = stageToPx(box, selFix.x1, selFix.y1);
          const mPx = [(aPx[0] + bPx[0]) * 0.5, (aPx[1] + bPx[1]) * 0.5];
          if (Math.hypot(aPx[0] - px, aPx[1] - py) <= 12) {
            beginUndoGesture('Move LED Strip Start');
            stageDrag = { mode: 'dmx-strip-p0', pointerId: e.pointerId, fixId: selFix.id, rawPrev: [sx, sy], gearedCur: [selFix.x0, selFix.y0] };
            stageOverlay.setPointerCapture(e.pointerId);
            return;
          }
          if (Math.hypot(bPx[0] - px, bPx[1] - py) <= 12) {
            beginUndoGesture('Move LED Strip End');
            stageDrag = { mode: 'dmx-strip-p1', pointerId: e.pointerId, fixId: selFix.id, rawPrev: [sx, sy], gearedCur: [selFix.x1, selFix.y1] };
            stageOverlay.setPointerCapture(e.pointerId);
            return;
          }
          if (Math.hypot(mPx[0] - px, mPx[1] - py) <= 13) {
            beginUndoGesture('Move LED Strip');
            stageDrag = {
              mode: 'dmx-strip-move',
              pointerId: e.pointerId,
              fixId: selFix.id,
              startStage: [sx, sy],
              rawPrev: [sx, sy],
              gearedCur: [sx, sy],
              orig: [selFix.x0, selFix.y0, selFix.x1, selFix.y1]
            };
            stageOverlay.setPointerCapture(e.pointerId);
            return;
          }
        } else {
          const cPx = stageToPx(box, selFix.cx, selFix.cy);
          const edgeStageX = selFix.cx + (selFix.type === 'ring' ? (selFix.radiusX || 0.16) : (selFix.width || 0.36) * 0.5);
          const edgeStageY = selFix.cy - (selFix.type === 'ring' ? (selFix.radiusY || 0.16) : (selFix.height || 0.22) * 0.5);
          const sPx = stageToPx(box, edgeStageX, edgeStageY);
          if (Math.hypot(sPx[0] - px, sPx[1] - py) <= 13) {
            beginUndoGesture('Resize LED Fixture');
            stageDrag = { mode: 'dmx-fix-scale', pointerId: e.pointerId, fixId: selFix.id, rawPrev: [sx, sy], gearedCur: [edgeStageX, edgeStageY] };
            stageOverlay.setPointerCapture(e.pointerId);
            return;
          }
          if (Math.hypot(cPx[0] - px, cPx[1] - py) <= 13) {
            beginUndoGesture('Move LED Fixture');
            stageDrag = { mode: 'dmx-fix-move', pointerId: e.pointerId, fixId: selFix.id, rawPrev: [sx, sy], gearedCur: [selFix.cx, selFix.cy] };
            stageOverlay.setPointerCapture(e.pointerId);
            return;
          }
        }
      }
      // Click any DMX fixture center or sampled LED pixel dot to select it
      for (const fix of pm.fixtures) {
        if (!fix || fix.enabled === false) continue;
        const cStage = fix.type === 'strip' ? [(fix.x0 + fix.x1) * 0.5, (fix.y0 + fix.y1) * 0.5] : [fix.cx, fix.cy];
        const cPx = stageToPx(box, cStage[0], cStage[1]);
        let hit = Math.hypot(cPx[0] - px, cPx[1] - py) <= 16;
        if (!hit && typeof computeFixturePixelStageCoords === 'function') {
          const coords = computeFixturePixelStageCoords(fix);
          const pCount = coords.length >> 1;
          const step = pCount > 96 ? Math.ceil(pCount / 96) : 1;
          for (let i = 0; i < pCount; i += step) {
            const pPx = stageToPx(box, coords[i * 2], coords[i * 2 + 1]);
            if (Math.hypot(pPx[0] - px, pPx[1] - py) <= 10) { hit = true; break; }
          }
        }
        if (hit) {
          pm.selectedFixtureId = fix.id;
          if (typeof syncOutputInspectorUI === 'function') syncOutputInspectorUI();
          return;
        }
      }
    }

    // 2E. Followspot Lollipop Handles (when Spot Inspector open & not in blind Steer Mode)
    if (state.inspTab === 'spot' && !state.steerSpotMode && !state.trackpadSpotTarget) {
      const lol = getFollowspotLollipopHandles(box);
      if (lol && lol.fs) {
        if (Math.hypot(lol.rotHandlePx[0] - px, lol.rotHandlePx[1] - py) <= 12) {
          beginUndoGesture('Rotate Followspot');
          stageDrag = {
            mode: 'spot-rot',
            spotId: lol.fs.id,
            pointerId: e.pointerId,
            centerPx: lol.spPx,
            startAng: Math.atan2(py - lol.spPx[1], px - lol.spPx[0]),
            origRot: lol.fs.rotation || 0
          };
          stageOverlay.setPointerCapture(e.pointerId);
          return;
        }
        if (Math.hypot(lol.radiusHandlePx[0] - px, lol.radiusHandlePx[1] - py) <= 12) {
          beginUndoGesture('Resize Followspot Iris');
          stageDrag = {
            mode: 'spot-radius',
            spotId: lol.fs.id,
            pointerId: e.pointerId,
            centerPx: lol.spPx,
            startDist: Math.max(8, Math.hypot(px - lol.spPx[0], py - lol.spPx[1])),
            origRadius: lol.fs.radius || 0.22,
            origSoft: lol.fs.softness || 0.14
          };
          stageOverlay.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    // 2F. In 2 · MAP (without Hold W): allow Framing Shutters + Surface Click-Selection + Marquee, WITHOUT warping physical geometry!
    if (mapSelectOnly) {
      const selMap = getSelectedSurface();
      if (selMap) {
        const selMapEff = getEffectiveSurfaceProps(selMap);
        if (selMapEff.visible && !selMapEff.locked && isSurfaceShutterHandlesActive(selMap)) {
          const shHandles = computeSurfaceShutterHandles(selMap, box);
          for (const sh of shHandles) {
            if ((sh.ins > 0.002 || state.shutterHandlesVisible) && Math.hypot(sh.tipPx[0] - px, sh.tipPx[1] - py) <= 10.5) {
              beginUndoGesture(`Tilt Shutter ${sh.side}`);
              stageDrag = {
                mode: 'shutter-tilt',
                pointerId: e.pointerId,
                surfId: selMap.id,
                side: sh.side,
                angKey: sh.angKey,
                midPx: sh.midPx,
                startAng: Math.atan2(py - sh.midPx[1], px - sh.midPx[0]),
                origAng: selMap[sh.angKey] || 0
              };
              stageOverlay.setPointerCapture(e.pointerId);
              return;
            }
            if (Math.hypot(sh.midPx[0] - px, sh.midPx[1] - py) <= 10.5) {
              beginUndoGesture(`Slide Shutter ${sh.side}`);
              stageDrag = {
                mode: 'shutter-blade',
                pointerId: e.pointerId,
                surfId: selMap.id,
                side: sh.side,
                insKey: sh.insKey,
                startPx: [px, py],
                inNormPx: sh.inNormPx,
                spanPx: sh.spanPx,
                origIns: selMap[sh.insKey] || 0,
                origSoft: selMap.shutterSoft || 0.015
              };
              stageOverlay.setPointerCapture(e.pointerId);
              return;
            }
          }
        }
        // Helpful hint if clicking directly on a corner of the selected surface in 2 · MAP
        if (Array.isArray(selMap.points) && selMap.points.some(p => {
          const cpPx = stageToPx(box, p[0], p[1]);
          return Math.hypot(cpPx[0] - px, cpPx[1] - py) <= 12;
        })) {
          const nowMs = Date.now();
          if (!state._lastMapWarpHintMs || nowMs - state._lastMapWarpHintMs > 2800) {
            state._lastMapWarpHintMs = nowMs;
            showToast('Press F1 (1·BUILD) or Hold W to warp physical geometry');
          }
        }
      }
      const anySoloMap = state.surfaces.some(s => {
        const eff = getEffectiveSurfaceProps(s);
        return eff.solo && eff.visible;
      });
      for (let i = 0; i < state.surfaces.length; i++) {
        const surf = state.surfaces[i];
        const eff = getEffectiveSurfaceProps(surf);
        if (!eff.visible) continue;
        if (anySoloMap && !eff.solo) continue;
        if (hitTestSurface(surf, sx, sy)) {
          if (state.leftTab === 'masks') switchLeftTab('surfaces');
          selectSurface(surf.id, true, e.shiftKey);
          return;
        }
      }
      state.marqueeRect = { x1: px, y1: py, x2: px, y2: py };
      stageDrag = {
        mode: 'marquee',
        pointerId: e.pointerId,
        startPx: [px, py],
        startStage: [sx, sy],
        additive: e.shiftKey
      };
      stageOverlay.setPointerCapture(e.pointerId);
      return;
    }

    // 3. Polygon Mask Editing (when Mask Stage Edit is explicitly active)
    const maskEditActive = isMaskStageEditActive();
    const selMask = getSelectedMask();
    if (maskEditActive && selMask && selMask.visible && !selMask.locked) {
      for (let i = 0; i < selMask.points.length; i++) {
        const vp = stageToPx(box, selMask.points[i][0], selMask.points[i][1]);
        if (Math.hypot(vp[0] - px, vp[1] - py) <= 11) {
          if (e.altKey && e.shiftKey && selMask.points.length > 3) {
            pushUndoCheckpoint('Remove Mask Vertex');
            selMask.points.splice(i, 1);
            if (Array.isArray(selMask.curveFlags)) selMask.curveFlags.splice(i, 1);
            state._sceneSyncRev++;
            syncMaskInspectorUI();
            renderMaskList();
            scheduleAutosave();
            showToast('Removed mask vertex');
            return;
          }
          beginUndoGesture('Move Mask Vertex');
          state.selectedVertex = { kind: 'mask-pt', maskId: selMask.id, idx: i };
          if (typeof setActiveSelection === 'function') setActiveSelection('mask_vertex', selMask.id, `${selMask.name} · M${i + 1}`, { ptIdx: i });
          const mp = selMask.points[i];
          pingCalibCrosshair(mp[0], mp[1], 1800);
          setLoupeTarget(mp[0], mp[1], e.altKey, 1200);
          stageDrag = {
            mode: 'mask-vertex',
            pointerId: e.pointerId,
            maskId: selMask.id,
            ptIdx: i,
            rawPrev: [sx, sy],
            gearedCur: [mp[0], mp[1]]
          };
          stageOverlay.setPointerCapture(e.pointerId);
          return;
        }
      }

      // Hit-test purple edge-midpoint handles to insert a new vertex
      if (selMask.points.length >= 3 && selMask.points.length < 64) {
        for (let i = 0; i < selMask.points.length; i++) {
          const a = selMask.points[i];
          const b = selMask.points[(i + 1) % selMask.points.length];
          const mid = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
          const mPx = stageToPx(box, mid[0], mid[1]);
          if (Math.hypot(mPx[0] - px, mPx[1] - py) <= 10) {
            beginUndoGesture('Insert Mask Vertex');
            selMask.points.splice(i + 1, 0, mid);
            if (Array.isArray(selMask.curveFlags)) {
              selMask.curveFlags.splice(i + 1, 0, !!selMask.smoothAll);
            }
            state.selectedVertex = { kind: 'mask-pt', maskId: selMask.id, idx: i + 1 };
            if (typeof setActiveSelection === 'function') setActiveSelection('mask_vertex', selMask.id, `${selMask.name} · M${i + 2}`, { ptIdx: i + 1 });
            state._sceneSyncRev++;
            syncMaskInspectorUI();
            renderMaskList();
            stageDrag = {
              mode: 'mask-vertex',
              pointerId: e.pointerId,
              maskId: selMask.id,
              ptIdx: i + 1,
              rawPrev: [sx, sy],
              gearedCur: [mid[0], mid[1]]
            };
            stageOverlay.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      // Hit-test inside selected mask or another mask
      for (const m of state.masks) {
        if (!m.visible) continue;
        if (pointInPolygon(sx, sy, m.points)) {
          selectMask(m.id);
          if (!m.locked) {
            beginUndoGesture('Move Mask');
            stageDrag = {
              mode: 'mask-move',
              pointerId: e.pointerId,
              maskId: m.id,
              rawPrev: [sx, sy],
              gearedCur: [sx, sy],
              startStage: [sx, sy],
              origPts: m.points.map(p => [p[0], p[1]])
            };
            stageOverlay.setPointerCapture(e.pointerId);
          }
          return;
        }
      }
    }

    // 3B. Multi-Surface Bounding-Box Transform Handles (when > 1 surface selected)
    const multiSel = getSelectedSurfaces();
    if (!maskEditActive && multiSel.length > 1) {
      const bbox = computeSurfacesBoundingBox(multiSel);
      if (bbox) {
        const giz = getMultiBoxGizmo(bbox, box);
        const unlockedSnapshots = multiSel
          .filter(s => !getEffectiveSurfaceProps(s).locked)
          .map(s => ({
            surf: s,
            origPts: s.points.map(p => [p[0], p[1]]),
            origMeshPts: s.meshPts ? s.meshPts.map(p => [p[0], p[1]]) : null,
            origPos3d: Array.isArray(s.pos3d) ? [...s.pos3d] : [0, 0, 0],
            origScale3d: Array.isArray(s.scale3d) ? [...s.scale3d] : [1, 1, 1],
            origRot3d: Array.isArray(s.rot3d) ? [...s.rot3d] : [18, -28, 0],
            origPins2d: Array.isArray(s.calibPins) ? s.calibPins.map(cp => Array.isArray(cp?.stage2d) ? [...cp.stage2d] : [0.5, 0.5]) : []
          }));

        if (unlockedSnapshots.length > 0) {
          // Rotation handle
          if (Math.hypot(giz.rotHandlePx[0] - px, giz.rotHandlePx[1] - py) <= 12) {
            beginUndoGesture('Rotate Selected Surfaces');
            const startAng = Math.atan2(py - giz.centerPx[1], px - giz.centerPx[0]);
            stageDrag = {
              mode: 'multi-rot',
              pointerId: e.pointerId,
              centerStage: [bbox.cx, bbox.cy],
              centerPx: giz.centerPx,
              startAng,
              items: unlockedSnapshots
            };
            stageOverlay.setPointerCapture(e.pointerId);
            return;
          }
          // Corner scale handles
          for (let ci = 0; ci < 4; ci++) {
            if (Math.hypot(giz.cornersPx[ci][0] - px, giz.cornersPx[ci][1] - py) <= 11) {
              beginUndoGesture('Scale Selected Surfaces');
              const oppIdx = (ci + 2) % 4;
              const cornersStage = [
                [bbox.minX, bbox.minY],
                [bbox.maxX, bbox.minY],
                [bbox.maxX, bbox.maxY],
                [bbox.minX, bbox.maxY]
              ];
              stageDrag = {
                mode: 'multi-scale',
                pointerId: e.pointerId,
                cornerIdx: ci,
                anchorStage: cornersStage[oppIdx],
                centerStage: [bbox.cx, bbox.cy],
                origCornerStage: cornersStage[ci],
                rawPrev: [sx, sy],
                gearedCur: [sx, sy],
                items: unlockedSnapshots
              };
              stageOverlay.setPointerCapture(e.pointerId);
              return;
            }
          }
        }
      }
    }

    // 3C. Surgical reach-through (Hold W in 2 · MAP / 3 · LIVE): grabbing a corner of a surface that
    // is NOT selected selects it and starts the corner drag in the same gesture (no select-then-drag).
    if ((state.room === 'map' || state.room === 'live') && state.liveReachThrough && !e.shiftKey) {
      const cur = getSelectedSurface();
      const nearPt = (s) => (s.points || []).some(p => {
        const q = stageToPx(box, p[0], p[1]);
        return Math.hypot(q[0] - px, q[1] - py) <= 11;
      });
      if (!cur || !nearPt(cur)) {
        for (let i = state.surfaces.length - 1; i >= 0; i--) {
          const s = state.surfaces[i];
          if (!s || s === cur || s.type === 'mesh3d') continue;
          const eff = getEffectiveSurfaceProps(s);
          if (!eff.visible || eff.locked) continue;
          if (nearPt(s)) {
            selectSurface(s.id);
            break;
          }
        }
      }
    }

    // 4. Primary Selected Surface, 3D PnP / Pose Handles & Curved Mesh Node Hit-Testing
    const sel = getSelectedSurface();
    if (sel) {
      const selEff = getEffectiveSurfaceProps(sel);
      const allowAltRemove = e.altKey && e.shiftKey && (
        sel.type === 'polygon' ||
        sel.type === 'line' ||
        (sel.type === 'mesh3d' && sel.calibMode === 'calibrated')
      );
      if (selEff.visible && !selEff.locked && (!e.shiftKey || allowAltRemove)) {
        // P7: Direct On-Canvas 4-Blade Framing Shutter Handles
        if (isSurfaceShutterHandlesActive(sel) && !allowAltRemove) {
          const shHandles = computeSurfaceShutterHandles(sel, box);
          for (const sh of shHandles) {
            if ((sh.ins > 0.002 || state.shutterHandlesVisible) && Math.hypot(sh.tipPx[0] - px, sh.tipPx[1] - py) <= 10.5) {
              beginUndoGesture(`Tilt Shutter ${sh.side}`);
              stageDrag = {
                mode: 'shutter-tilt',
                pointerId: e.pointerId,
                surfId: sel.id,
                side: sh.side,
                angKey: sh.angKey,
                midPx: sh.midPx,
                startAng: Math.atan2(py - sh.midPx[1], px - sh.midPx[0]),
                origAng: sel[sh.angKey] || 0
              };
              stageOverlay.setPointerCapture(e.pointerId);
              return;
            }
            if (Math.hypot(sh.midPx[0] - px, sh.midPx[1] - py) <= 10.5) {
              beginUndoGesture(`Slide Shutter ${sh.side}`);
              stageDrag = {
                mode: 'shutter-blade',
                pointerId: e.pointerId,
                surfId: sel.id,
                side: sh.side,
                insKey: sh.insKey,
                startPx: [px, py],
                inNormPx: sh.inNormPx,
                spanPx: sh.spanPx,
                origIns: sel[sh.insKey] || 0,
                origSoft: sel.shutterSoft || 0.015
              };
              stageOverlay.setPointerCapture(e.pointerId);
              return;
            }
          }
        }

        if (sel.type === 'mesh3d') {
          if (sel.calibMode === 'calibrated') {
            const pins = Array.isArray(sel.calibPins) ? sel.calibPins : [];
            let bestPin = -1, bestD = 14;
            pins.forEach((cp, idx) => {
              if (!cp || !Array.isArray(cp.stage2d)) return;
              const pPx = stageToPx(box, cp.stage2d[0], cp.stage2d[1]);
              const d = Math.hypot(pPx[0] - px, pPx[1] - py);
              if (d < bestD) { bestD = d; bestPin = idx; }
            });
            if (bestPin >= 0) {
              if (allowAltRemove) {
                pushUndoCheckpoint('Remove 3D Calibration Pin');
                sel.calibPins.splice(bestPin, 1);
                if (state.selectedCalibPinIdx >= sel.calibPins.length) {
                  state.selectedCalibPinIdx = Math.max(0, sel.calibPins.length - 1);
                }
                state.selectedVertex = null;
                bumpSurfaceGeom(sel);
                state._sceneSyncRev++;
                syncInspectorUI();
                scheduleAutosave();
                showToast(`Removed Calibration Pin (${sel.calibPins.length} left)`);
                return;
              }
              beginUndoGesture('Move 3D Calibration Pin');
              const origPt = [sel.calibPins[bestPin].stage2d[0], sel.calibPins[bestPin].stage2d[1]];
              state.selectedCalibPinIdx = bestPin;
              state.selectedVertex = { kind: 'calib-pin', surfId: sel.id, idx: bestPin };
              pingCalibCrosshair(origPt[0], origPt[1], 1800);
              setLoupeTarget(origPt[0], origPt[1], e.altKey, 1200);
              if (typeof syncMesh3DPnpStatusUI === 'function') syncMesh3DPnpStatusUI(sel);
              stageDrag = {
                mode: 'calib-pin',
                pointerId: e.pointerId,
                surfId: sel.id,
                pinIdx: bestPin,
                rawPrev: [sx, sy],
                gearedCur: [origPt[0], origPt[1]]
              };
              stageOverlay.setPointerCapture(e.pointerId);
              return;
            }
          } else {
            const giz3d = getMesh3DGizmoHandles(sel, box);
            if (Math.hypot(giz3d.rotHandlePx[0] - px, giz3d.rotHandlePx[1] - py) <= 13) {
              beginUndoGesture('Rotate 3D Object');
              stageDrag = {
                mode: 'mesh3d-tumble',
                pointerId: e.pointerId,
                surfId: sel.id,
                startX: e.clientX,
                startY: e.clientY,
                origRot3d: Array.isArray(sel.rot3d) ? [...sel.rot3d] : [18, -28, 0]
              };
              stageOverlay.setPointerCapture(e.pointerId);
              return;
            }
            if (Math.hypot(giz3d.centerPx[0] - px, giz3d.centerPx[1] - py) <= 13) {
              beginUndoGesture('Move 3D Object');
              stageDrag = {
                mode: 'move-multi',
                pointerId: e.pointerId,
                startStage: [sx, sy],
                rawPrev: [sx, sy],
                gearedCur: [sx, sy],
                items: [{
                  surf: sel,
                  origPts: sel.points.map(p => [p[0], p[1]]),
                  origMeshPts: null,
                  origPos3d: Array.isArray(sel.pos3d) ? [...sel.pos3d] : [0, 0, 0],
                  origScale3d: Array.isArray(sel.scale3d) ? [...sel.scale3d] : [1, 1, 1],
                  origRot3d: Array.isArray(sel.rot3d) ? [...sel.rot3d] : [18, -28, 0],
                  origPins2d: []
                }]
              };
              stageOverlay.setPointerCapture(e.pointerId);
              return;
            }
          }
        } else if (isCurvedMeshSurface(sel)) {
          ensureSurfaceMeshValid(sel);
          let bestIdx = -1, bestD = 12.5;
          for (let i = 0; i < sel.meshPts.length; i++) {
            const pPx = stageToPx(box, sel.meshPts[i][0], sel.meshPts[i][1]);
            const d = Math.hypot(pPx[0] - px, pPx[1] - py);
            if (d < bestD) { bestD = d; bestIdx = i; }
          }
          if (bestIdx >= 0) {
            beginUndoGesture('Sculpt Mesh Node');
            const origPt = [sel.meshPts[bestIdx][0], sel.meshPts[bestIdx][1]];
            const cornerSlot = getMeshCornerSlot(sel, bestIdx);
            const welded = cornerSlot >= 0 ? findWeldedNeighbors(sel.id, origPt) : [];
            state.selectedVertex = { kind: 'mesh-node', surfId: sel.id, idx: bestIdx };
            pingCalibCrosshair(origPt[0], origPt[1], 1800);
            setLoupeTarget(origPt[0], origPt[1], e.altKey, 1200);

            stageDrag = {
              mode: 'mesh-node',
              pointerId: e.pointerId,
              surfId: sel.id,
              nodeIdx: bestIdx,
              cornerSlot,
              startStage: origPt,
              rawPrev: [sx, sy],
              gearedCur: [origPt[0], origPt[1]],
              origCorners: sel.points.map(p => [p[0], p[1]]),
              origMeshPts: sel.meshPts.map(p => [p[0], p[1]]),
              welded
            };
            stageOverlay.setPointerCapture(e.pointerId);
            return;
          }
        } else {
          let bestIdx = -1, bestD = 13;
          sel.points.forEach((p, idx) => {
            const pPx = stageToPx(box, p[0], p[1]);
            const d = Math.hypot(pPx[0] - px, pPx[1] - py);
            if (d < bestD) { bestD = d; bestIdx = idx; }
          });
          if (bestIdx >= 0) {
            const minV = sel.type === 'line' ? 2 : 3;
            if (allowAltRemove && sel.points.length > minV) {
              pushUndoCheckpoint('Remove Surface Vertex');
              sel.points.splice(bestIdx, 1);
              if (sel.type === 'polygon' && Array.isArray(sel.polyUvs)) {
                sel.polyUvs.splice(bestIdx, 1);
              }
              bumpSurfaceGeom(sel);
              syncInspectorUI();
              scheduleAutosave();
              showToast(`Removed vertex (${sel.points.length} pts)`);
              return;
            }

            beginUndoGesture('Move Surface Corner');
            const origPt = [sel.points[bestIdx][0], sel.points[bestIdx][1]];
            const welded = findWeldedNeighbors(sel.id, origPt);
            state.selectedVertex = { kind: 'surf-corner', surfId: sel.id, idx: bestIdx };
            if ((sel.type === 'polygon' || sel.type === 'line') && typeof setActiveSelection === 'function') {
              setActiveSelection('surface_vertex', sel.id, `${sel.name} · V${bestIdx + 1}`, { ptIdx: bestIdx });
            }
            pingCalibCrosshair(origPt[0], origPt[1], 1800);
            setLoupeTarget(origPt[0], origPt[1], e.altKey, 1200);

            stageDrag = {
              mode: 'vertex',
              pointerId: e.pointerId,
              surfId: sel.id,
              ptIdx: bestIdx,
              rawPrev: [sx, sy],
              gearedCur: [origPt[0], origPt[1]],
              welded
            };
            stageOverlay.setPointerCapture(e.pointerId);
            return;
          }

          // Edge-midpoint insertion for N-Gon Polygons & Architectural Lines
          if (sel.type === 'polygon' || sel.type === 'line') {
            const maxPts = sel.type === 'polygon' ? 48 : 96;
            const minPts = sel.type === 'polygon' ? 3 : 2;
            if (sel.points.length >= minPts && sel.points.length < maxPts) {
              const edgeCount = (sel.type === 'polygon' || sel.lineClosed) ? sel.points.length : (sel.points.length - 1);
              for (let ei = 0; ei < edgeCount; ei++) {
                const a = sel.points[ei];
                const b = sel.points[(ei + 1) % sel.points.length];
                const mid = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
                const mPx = stageToPx(box, mid[0], mid[1]);
                if (Math.hypot(mPx[0] - px, mPx[1] - py) <= 10) {
                  beginUndoGesture('Insert Surface Vertex');
                  sel.points.splice(ei + 1, 0, mid);
                  if (sel.type === 'polygon') {
                    ensurePolygonUvs(sel);
                    const ua = sel.polyUvs[ei] || a;
                    const ub = sel.polyUvs[(ei + 1) % sel.polyUvs.length] || b;
                    sel.polyUvs.splice(ei + 1, 0, [(ua[0] + ub[0]) * 0.5, (ua[1] + ub[1]) * 0.5]);
                  }
                  bumpSurfaceGeom(sel);
                  state.selectedVertex = { kind: 'surf-corner', surfId: sel.id, idx: ei + 1 };
                  if (typeof setActiveSelection === 'function') {
                    setActiveSelection('surface_vertex', sel.id, `${sel.name} · V${ei + 2}`, { ptIdx: ei + 1 });
                  }
                  syncInspectorUI();
                  stageDrag = {
                    mode: 'vertex',
                    pointerId: e.pointerId,
                    surfId: sel.id,
                    ptIdx: ei + 1,
                    rawPrev: [sx, sy],
                    gearedCur: [mid[0], mid[1]],
                    welded: []
                  };
                  stageOverlay.setPointerCapture(e.pointerId);
                  return;
                }
              }
            }
          }
        }
      }
    }

    // 5. Select / Multi-Select / Move Surface Top-to-Bottom
    const anySolo = state.surfaces.some(s => {
      const eff = getEffectiveSurfaceProps(s);
      return eff.solo && eff.visible;
    });
    for (let i = 0; i < state.surfaces.length; i++) {
      const surf = state.surfaces[i];
      const eff = getEffectiveSurfaceProps(surf);
      if (!eff.visible) continue;
      if (anySolo && !eff.solo) continue;

      if (hitTestSurface(surf, sx, sy)) {
        if (state.leftTab === 'masks') switchLeftTab('surfaces');
        if (e.shiftKey) {
          selectSurface(surf.id, true, true);
          return;
        }
        const alreadyMulti = isSurfaceSelected(surf.id) && getSelectedSurfaces().length > 1;
        if (!alreadyMulti) {
          selectSurface(surf.id, true, false);
        }
        const moveTargets = getSelectedSurfaces().filter(s => !getEffectiveSurfaceProps(s).locked);
        if (moveTargets.length > 0) {
          beginUndoGesture(moveTargets.length > 1 ? 'Move Surfaces' : 'Move Surface');
          stageDrag = {
            mode: 'move-multi',
            pointerId: e.pointerId,
            startStage: [sx, sy],
            rawPrev: [sx, sy],
            gearedCur: [sx, sy],
            items: moveTargets.map(s => ({
              surf: s,
              origPts: s.points.map(p => [p[0], p[1]]),
              origMeshPts: s.meshPts ? s.meshPts.map(p => [p[0], p[1]]) : null,
              origPos3d: Array.isArray(s.pos3d) ? [...s.pos3d] : [0, 0, 0],
              origScale3d: Array.isArray(s.scale3d) ? [...s.scale3d] : [1, 1, 1],
              origRot3d: Array.isArray(s.rot3d) ? [...s.rot3d] : [18, -28, 0],
              origPins2d: Array.isArray(s.calibPins) ? s.calibPins.map(cp => Array.isArray(cp?.stage2d) ? [...cp.stage2d] : [0.5, 0.5]) : []
            }))
          };
          stageOverlay.setPointerCapture(e.pointerId);
        }
        return;
      }
    }

    // 6. Empty stage background drag -> Rubber-Band Marquee Selection! (Space+Drag or Middle-Click pans)
    state.marqueeRect = { x1: px, y1: py, x2: px, y2: py };
    stageDrag = {
      mode: 'marquee',
      pointerId: e.pointerId,
      startPx: [px, py],
      startStage: [sx, sy],
      additive: e.shiftKey
    };
    stageOverlay.setPointerCapture(e.pointerId);
  });

  stageOverlay.addEventListener('pointermove', (e) => {
    if (!lastStageMetrics || state.projectorMode) return;
    const rect = stageOverlay.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { box } = lastStageMetrics;
    const [sx, sy] = pxToStage(box, px, py);
    lastStagePointerClient = { x: e.clientX, y: e.clientY, sx, sy, inside: true };

    const outW = state.stageWidth || 1920;
    const outH = state.stageHeight || 1080;
    stageCoordsEl.textContent = `X: ${Math.round(sx * outW)}px (${sx.toFixed(3)})  Y: ${Math.round((1 - sy) * outH)}px`;

    if (state.drawingSurfaceId) {
      state.surfHoverPt = [sx, sy];
    }
    if (state.drawingMaskId) {
      state.maskHoverPt = [sx, sy];
    }

    // Hover feedback + live hover tracking when Trackpad Spot Steer is armed without clicking!
    const activeTpHoverSpot = (state.trackpadSpotTarget || state.steerSpotMode) && typeof getActiveLiveSpot === 'function'
      ? getActiveLiveSpot()
      : null;
    if (activeTpHoverSpot && activeTpHoverSpot.enabled !== false && !stageDrag && !state.pointerLocked) {
      if (!e.shiftKey && !e.altKey && !state.modKeys.r && !state.modKeys.m && !state.modKeys.s) {
        if (sx >= -0.05 && sx <= 1.05 && sy >= -0.05 && sy <= 1.05) {
          if (!(typeof placeSpotFromStageUv === 'function' && placeSpotFromStageUv(activeTpHoverSpot, sx, sy))) {
            activeTpHoverSpot.targetX = sx;
            activeTpHoverSpot.targetY = sy;
          }
          activeTpHoverSpot._lastSeatTouchMs = Date.now();
        }
      }
      stageOverlay.style.cursor = 'crosshair';
      return;
    }

    if (!stageDrag) {
      if (state.room === 'live' && !state.liveReachThrough) {
        stageOverlay.style.cursor = spacePanHeld ? 'grab' : 'default';
        return;
      }
      const penActive = !!(state.drawingMaskId || state.drawingSurfaceId);
      const mapSelectOnlyHover = state.room === 'map' && !state.liveReachThrough && !penActive;
      let cursor = spacePanHeld ? 'grab' : (penActive ? 'crosshair' : 'default');
      state.hoverMeshBrush = null;
      let hovPin = -1;
      if (!state.showLock || ((state.room === 'live' || state.room === 'map') && state.liveReachThrough)) {
        if (state.inspTab === 'spot' && !state.steerSpotMode && !state.trackpadSpotTarget) {
          const lol = getFollowspotLollipopHandles(box);
          if (lol) {
            if (Math.hypot(lol.rotHandlePx[0] - px, lol.rotHandlePx[1] - py) <= 12) cursor = 'grab';
            else if (Math.hypot(lol.radiusHandlePx[0] - px, lol.radiusHandlePx[1] - py) <= 12) cursor = 'ew-resize';
          }
        }
        const sel = getSelectedSurface();
        const selEff = sel ? getEffectiveSurfaceProps(sel) : null;
        if (cursor === 'default' && !penActive && sel && selEff.visible && !selEff.locked) {
          if (isSurfaceShutterHandlesActive(sel)) {
            const shHandles = computeSurfaceShutterHandles(sel, box);
            for (const sh of shHandles) {
              if ((sh.ins > 0.002 || state.shutterHandlesVisible) && Math.hypot(sh.tipPx[0] - px, sh.tipPx[1] - py) <= 11) {
                cursor = 'grab';
                break;
              }
              if (Math.hypot(sh.midPx[0] - px, sh.midPx[1] - py) <= 11) {
                cursor = (sh.side === 'L' || sh.side === 'R') ? 'ew-resize' : 'ns-resize';
                break;
              }
            }
          }
          if (!mapSelectOnlyHover) {
            if (cursor === 'default' && sel.type === 'mesh3d') {
              if (sel.calibMode === 'calibrated') {
                (sel.calibPins || []).forEach((cp, idx) => {
                  if (hovPin >= 0 || !cp || !Array.isArray(cp.stage2d)) return;
                  const pPx = stageToPx(box, cp.stage2d[0], cp.stage2d[1]);
                  if (Math.hypot(pPx[0] - px, pPx[1] - py) < 14) {
                    cursor = 'crosshair';
                    hovPin = idx;
                  }
                });
              } else {
                const giz3d = getMesh3DGizmoHandles(sel, box);
                if (Math.hypot(giz3d.rotHandlePx[0] - px, giz3d.rotHandlePx[1] - py) < 13) cursor = 'grab';
                else if (Math.hypot(giz3d.centerPx[0] - px, giz3d.centerPx[1] - py) < 13) cursor = 'move';
              }
            } else if (isCurvedMeshSurface(sel)) {
              for (const mp of sel.meshPts) {
                const pPx = stageToPx(box, mp[0], mp[1]);
                if (Math.hypot(pPx[0] - px, pPx[1] - py) < 12) {
                  cursor = 'crosshair';
                  state.hoverMeshBrush = [mp[0], mp[1]];
                  break;
                }
              }
            } else {
              for (const p of sel.points) {
                const pPx = stageToPx(box, p[0], p[1]);
                if (Math.hypot(pPx[0] - px, pPx[1] - py) < 13) { cursor = 'crosshair'; break; }
              }
            }
            if (cursor === 'default' && hitTestSurface(sel, sx, sy)) cursor = 'move';
          }
        }
        if (cursor === 'default' && mapSelectOnlyHover) {
          for (let i = 0; i < state.surfaces.length; i++) {
            const s = state.surfaces[i];
            if (getEffectiveSurfaceProps(s).visible && hitTestSurface(s, sx, sy)) {
              cursor = 'pointer';
              break;
            }
          }
        }
      }
      state.hoveredCalibPinIdx = hovPin;
      stageOverlay.style.cursor = cursor;
      return;
    }

    if (stageDrag.pointerId !== e.pointerId) return;

    // Update incremental Alt 10x fine-gear position when present
    const gear = e.altKey ? 0.10 : 1.0;
    if (stageDrag.rawPrev && stageDrag.gearedCur) {
      stageDrag.gearedCur[0] += (sx - stageDrag.rawPrev[0]) * gear;
      stageDrag.gearedCur[1] += (sy - stageDrag.rawPrev[1]) * gear;
      stageDrag.rawPrev[0] = sx;
      stageDrag.rawPrev[1] = sy;
    }

    if (stageDrag.mode === 'spot-steer') {
      const dx = e.clientX - stageDrag.lastClientX;
      const dy = e.clientY - stageDrag.lastClientY;
      stageDrag.lastClientX = e.clientX;
      stageDrag.lastClientY = e.clientY;
      applyFollowspotGestureDelta(dx, dy, box, e);
    } else if (stageDrag.mode === 'pan') {
      state.stageView.panX = stageDrag.origPanX + (e.clientX - stageDrag.startX);
      state.stageView.panY = stageDrag.origPanY + (e.clientY - stageDrag.startY);
    } else if (stageDrag.mode === 'marquee') {
      state.marqueeRect = { x1: stageDrag.startPx[0], y1: stageDrag.startPx[1], x2: px, y2: py };
    } else if (stageDrag.mode === 'keystone-pt') {
      const gx = stageDrag.gearedCur[0];
      const gy = stageDrag.gearedCur[1];
      const nextPt = [clamp(gx, -0.5, 1.5), clamp(gy, -0.5, 1.5)];
      state.masterKeystone.points[stageDrag.ptIdx] = nextPt;
      state._sceneSyncRev++;
      pingCalibCrosshair(nextPt[0], nextPt[1], 600);
      setLoupeTarget(nextPt[0], nextPt[1], e.altKey, 600);
    } else if (stageDrag.mode === 'proj-ks-pt') {
      const scr = state.multiProjector?.screens?.find(s => s.index === stageDrag.screenIndex);
      if (scr && scr.keystone) {
        const nextPt = [clamp(stageDrag.gearedCur[0], -0.5, 1.5), clamp(stageDrag.gearedCur[1], -0.5, 1.5)];
        scr.keystone.points[stageDrag.ptIdx] = nextPt;
        state._sceneSyncRev++;
        pingCalibCrosshair(nextPt[0], nextPt[1], 600);
        setLoupeTarget(nextPt[0], nextPt[1], e.altKey, 600);
      }
    } else if (stageDrag.mode === 'dmx-strip-p0' || stageDrag.mode === 'dmx-strip-p1') {
      const fix = state.pixelMapper?.fixtures?.find(f => f.id === stageDrag.fixId);
      if (fix) {
        const nx = clamp(stageDrag.gearedCur[0], -0.25, 1.25);
        const ny = clamp(stageDrag.gearedCur[1], -0.25, 1.25);
        if (stageDrag.mode === 'dmx-strip-p0') { fix.x0 = nx; fix.y0 = ny; }
        else { fix.x1 = nx; fix.y1 = ny; }
      }
    } else if (stageDrag.mode === 'dmx-strip-move') {
      const fix = state.pixelMapper?.fixtures?.find(f => f.id === stageDrag.fixId);
      if (fix) {
        const dx = stageDrag.gearedCur[0] - stageDrag.startStage[0];
        const dy = stageDrag.gearedCur[1] - stageDrag.startStage[1];
        fix.x0 = clamp(stageDrag.orig[0] + dx, -0.25, 1.25);
        fix.y0 = clamp(stageDrag.orig[1] + dy, -0.25, 1.25);
        fix.x1 = clamp(stageDrag.orig[2] + dx, -0.25, 1.25);
        fix.y1 = clamp(stageDrag.orig[3] + dy, -0.25, 1.25);
      }
    } else if (stageDrag.mode === 'dmx-fix-move') {
      const fix = state.pixelMapper?.fixtures?.find(f => f.id === stageDrag.fixId);
      if (fix) {
        fix.cx = clamp(stageDrag.gearedCur[0], -0.25, 1.25);
        fix.cy = clamp(stageDrag.gearedCur[1], -0.25, 1.25);
      }
    } else if (stageDrag.mode === 'dmx-fix-scale') {
      const fix = state.pixelMapper?.fixtures?.find(f => f.id === stageDrag.fixId);
      if (fix) {
        const rx = clamp(Math.abs(stageDrag.gearedCur[0] - fix.cx), 0.015, 0.95);
        const ry = clamp(Math.abs(stageDrag.gearedCur[1] - fix.cy), 0.015, 0.95);
        if (fix.type === 'ring') {
          fix.radiusX = rx;
          fix.radiusY = e.shiftKey ? rx : ry;
        } else {
          fix.width = rx * 2;
          fix.height = e.shiftKey ? rx * 2 : ry * 2;
        }
      }
    } else if (stageDrag.mode === 'mask-vertex') {
      const mask = state.masks.find(m => m.id === stageDrag.maskId);
      if (mask && !mask.locked) {
        const res = computeStageSnap(stageDrag.gearedCur[0], stageDrag.gearedCur[1], null, -1, box, e.altKey);
        const nextPt = [clamp(res.sx, -0.4, 1.4), clamp(res.sy, -0.4, 1.4)];
        mask.points[stageDrag.ptIdx] = nextPt;
        state.activeSnapLines = res.snaps;
        state._sceneSyncRev++;
        pingCalibCrosshair(nextPt[0], nextPt[1], 600);
        setLoupeTarget(nextPt[0], nextPt[1], e.altKey, 600);
      }
    } else if (stageDrag.mode === 'mask-move') {
      const mask = state.masks.find(m => m.id === stageDrag.maskId);
      if (mask && !mask.locked) {
        const dx = stageDrag.gearedCur[0] - stageDrag.startStage[0];
        const dy = stageDrag.gearedCur[1] - stageDrag.startStage[1];
        mask.points = stageDrag.origPts.map(p => [p[0] + dx, p[1] + dy]);
        state._sceneSyncRev++;
      }
    } else if (stageDrag.mode === 'mesh-node') {
      const surf = state.surfaces.find(s => s.id === stageDrag.surfId);
      if (surf && !getEffectiveSurfaceProps(surf).locked) {
        const res = computeStageSnap(stageDrag.gearedCur[0], stageDrag.gearedCur[1], surf.id, -1, box, e.altKey);
        const nextPt = [clamp(res.sx, -0.45, 1.45), clamp(res.sy, -0.45, 1.45)];
        state.activeSnapLines = res.snaps;

        const useCornerPin = stageDrag.cornerSlot >= 0 && (surf.meshPinCorners || e.metaKey || e.ctrlKey);
        if (useCornerPin) {
          warpMeshByCornerMove(surf, stageDrag.cornerSlot, nextPt, stageDrag.origCorners, stageDrag.origMeshPts);
        } else {
          const dx = nextPt[0] - stageDrag.startStage[0];
          const dy = nextPt[1] - stageDrag.startStage[1];
          const brushR = surf.meshBrush || 0;

          for (let i = 0; i < surf.meshPts.length; i++) {
            const orig = stageDrag.origMeshPts[i];
            if (i === stageDrag.nodeIdx) {
              surf.meshPts[i] = [orig[0] + dx, orig[1] + dy];
            } else if (brushR > 0.005) {
              const dist = Math.hypot(orig[0] - stageDrag.startStage[0], orig[1] - stageDrag.startStage[1]);
              if (dist < brushR) {
                const w = 0.5 * (1.0 + Math.cos((Math.PI * dist) / brushR));
                surf.meshPts[i] = [orig[0] + dx * w, orig[1] + dy * w];
              } else {
                surf.meshPts[i] = [orig[0], orig[1]];
              }
            }
          }
          syncCornersFromMesh(surf);
          bumpSurfaceGeom(surf);
        }

        if (stageDrag.cornerSlot >= 0) {
          applyWeldedTarget(stageDrag.welded, nextPt);
        }
        state.hoverMeshBrush = [surf.meshPts[stageDrag.nodeIdx][0], surf.meshPts[stageDrag.nodeIdx][1]];
        pingCalibCrosshair(nextPt[0], nextPt[1], 600);
        setLoupeTarget(nextPt[0], nextPt[1], e.altKey, 600);
      }
    } else if (stageDrag.mode === 'calib-pin') {
      const surf = state.surfaces.find(s => s.id === stageDrag.surfId);
      const pin = surf && !getEffectiveSurfaceProps(surf).locked ? surf.calibPins?.[stageDrag.pinIdx] : null;
      if (surf && pin) {
        const res = computeStageSnap(stageDrag.gearedCur[0], stageDrag.gearedCur[1], surf.id, -1, box, e.altKey);
        const nextPt = [clamp(res.sx, -0.35, 1.35), clamp(res.sy, -0.35, 1.35)];
        pin.stage2d = nextPt;
        bumpSurfaceGeom(surf);
        state.activeSnapLines = res.snaps;
        state._sceneSyncRev++;
        pingCalibCrosshair(nextPt[0], nextPt[1], 600);
        setLoupeTarget(nextPt[0], nextPt[1], e.altKey, 600);
        if (typeof syncMesh3DPnpStatusUI === 'function') syncMesh3DPnpStatusUI(surf);
      }
    } else if (stageDrag.mode === 'mesh3d-tumble') {
      const surf = state.surfaces.find(s => s.id === stageDrag.surfId);
      if (surf && !getEffectiveSurfaceProps(surf).locked) {
        const gearScale = e.altKey ? 0.12 : 1.0;
        const dxPx = (e.clientX - stageDrag.startX) * gearScale;
        const dyPx = (e.clientY - stageDrag.startY) * gearScale;
        let rx = clamp(stageDrag.origRot3d[0] + dyPx * 0.45, -180, 180);
        let ry = ((stageDrag.origRot3d[1] + dxPx * 0.55 + 540) % 360) - 180;
        if (e.shiftKey) {
          rx = Math.round(rx / 15) * 15;
          ry = Math.round(ry / 15) * 15;
        }
        surf.rot3d = [rx, ry, stageDrag.origRot3d[2] || 0];
        bumpSurfaceGeom(surf);
        state._sceneSyncRev++;
        if (surf.id === state.selectedSurfaceId && typeof syncInspectorUI === 'function') syncInspectorUI();
      }
    } else if (stageDrag.mode === 'vertex') {
      const surf = state.surfaces.find(s => s.id === stageDrag.surfId);
      if (surf && !getEffectiveSurfaceProps(surf).locked) {
        const res = computeStageSnap(stageDrag.gearedCur[0], stageDrag.gearedCur[1], surf.id, stageDrag.ptIdx, box, e.altKey);
        const nextPt = [clamp(res.sx, -0.45, 1.45), clamp(res.sy, -0.45, 1.45)];
        surf.points[stageDrag.ptIdx] = nextPt;
        if (surf.type === 'quad') initSurfaceMeshFromCorners(surf);
        bumpSurfaceGeom(surf);
        applyWeldedTarget(stageDrag.welded, nextPt);
        state.activeSnapLines = res.snaps;
        pingCalibCrosshair(nextPt[0], nextPt[1], 600);
        setLoupeTarget(nextPt[0], nextPt[1], e.altKey, 600);
      }
    } else if (stageDrag.mode === 'move-multi') {
      const dx = stageDrag.gearedCur[0] - stageDrag.startStage[0];
      const dy = stageDrag.gearedCur[1] - stageDrag.startStage[1];
      const stAspect = (state.stageWidth || 1920) / Math.max(1, state.stageHeight || 1080);
      for (const item of stageDrag.items) {
        if (item.surf.type === 'mesh3d') {
          if (item.surf.calibMode === 'calibrated' && Array.isArray(item.surf.calibPins)) {
            item.surf.calibPins.forEach((cp, idx) => {
              const orig = item.origPins2d?.[idx];
              if (cp && orig) cp.stage2d = [clamp(orig[0] + dx, -0.35, 1.35), clamp(orig[1] + dy, -0.35, 1.35)];
            });
            if (item.surf.id === state.selectedSurfaceId && typeof syncMesh3DPnpStatusUI === 'function') {
              syncMesh3DPnpStatusUI(item.surf);
            }
          } else {
            const origP = item.origPos3d || [0, 0, 0];
            const zDepth = Math.max(0.4, (item.surf.camDist ?? 2.6) - (origP[2] || 0));
            const thr = Math.max(0.25, item.surf.camThrow ?? 1.4);
            item.surf.pos3d = [
              clamp(origP[0] + dx * (zDepth / thr), -3.0, 3.0),
              clamp(origP[1] + dy * (zDepth / (thr * stAspect)), -3.0, 3.0),
              origP[2] || 0
            ];
            if (item.surf.id === state.selectedSurfaceId && typeof syncInspectorUI === 'function') {
              syncInspectorUI();
            }
          }
          state._sceneSyncRev++;
        } else {
          item.surf.points = item.origPts.map(p => [p[0] + dx, p[1] + dy]);
          if (item.origMeshPts) {
            item.surf.meshPts = item.origMeshPts.map(p => [p[0] + dx, p[1] + dy]);
          }
        }
        bumpSurfaceGeom(item.surf);
      }
      state.activeSnapLines = [];
    } else if (stageDrag.mode === 'multi-scale') {
      const anchor = e.shiftKey ? stageDrag.centerStage : stageDrag.anchorStage;
      const denomX = stageDrag.origCornerStage[0] - anchor[0];
      const denomY = stageDrag.origCornerStage[1] - anchor[1];
      const scaleX = Math.abs(denomX) > 0.005 ? clamp((stageDrag.gearedCur[0] - anchor[0]) / denomX, -4.0, 4.0) : 1.0;
      const scaleY = Math.abs(denomY) > 0.005 ? clamp((stageDrag.gearedCur[1] - anchor[1]) / denomY, -4.0, 4.0) : 1.0;
      const uniScale = clamp(0.5 * (Math.abs(scaleX) + Math.abs(scaleY)), 0.1, 4.0);
      for (const item of stageDrag.items) {
        if (item.surf.type === 'mesh3d') {
          if (item.surf.calibMode === 'calibrated' && Array.isArray(item.surf.calibPins)) {
            item.surf.calibPins.forEach((cp, idx) => {
              const orig = item.origPins2d?.[idx];
              if (cp && orig) {
                cp.stage2d = [
                  anchor[0] + (orig[0] - anchor[0]) * scaleX,
                  anchor[1] + (orig[1] - anchor[1]) * scaleY
                ];
              }
            });
          } else {
            const os = item.origScale3d || [1, 1, 1];
            item.surf.scale3d = [
              clamp(os[0] * uniScale, 0.1, 4.0),
              clamp(os[1] * uniScale, 0.1, 4.0),
              clamp(os[2] * uniScale, 0.1, 4.0)
            ];
          }
          state._sceneSyncRev++;
        } else {
          item.surf.points = item.origPts.map(p => [
            anchor[0] + (p[0] - anchor[0]) * scaleX,
            anchor[1] + (p[1] - anchor[1]) * scaleY
          ]);
          if (item.origMeshPts) {
            item.surf.meshPts = item.origMeshPts.map(p => [
              anchor[0] + (p[0] - anchor[0]) * scaleX,
              anchor[1] + (p[1] - anchor[1]) * scaleY
            ]);
          }
        }
        bumpSurfaceGeom(item.surf);
      }
    } else if (stageDrag.mode === 'multi-rot') {
      const ang = Math.atan2(py - stageDrag.centerPx[1], px - stageDrag.centerPx[0]);
      let delta = -(ang - stageDrag.startAng);
      if (e.shiftKey) {
        const snapRad = (15 * Math.PI) / 180;
        delta = Math.round(delta / snapRad) * snapRad;
      }
      const c = Math.cos(delta), s = Math.sin(delta);
      const aspect = box.w / Math.max(1, box.h);
      const [cx, cy] = stageDrag.centerStage;
      const rotPt = (p) => {
        const lx = (p[0] - cx) * aspect;
        const ly = p[1] - cy;
        return [cx + (lx * c - ly * s) / aspect, cy + (lx * s + ly * c)];
      };
      const deltaDeg = (delta * 180) / Math.PI;
      for (const item of stageDrag.items) {
        if (item.surf.type === 'mesh3d') {
          if (item.surf.calibMode === 'calibrated' && Array.isArray(item.surf.calibPins)) {
            item.surf.calibPins.forEach((cp, idx) => {
              const orig = item.origPins2d?.[idx];
              if (cp && orig) cp.stage2d = rotPt(orig);
            });
          } else {
            const or = item.origRot3d || [18, -28, 0];
            item.surf.rot3d = [or[0], or[1], ((or[2] + deltaDeg + 540) % 360) - 180];
          }
          state._sceneSyncRev++;
        } else {
          item.surf.points = item.origPts.map(rotPt);
          if (item.origMeshPts) {
            item.surf.meshPts = item.origMeshPts.map(rotPt);
          }
        }
        bumpSurfaceGeom(item.surf);
      }
    } else if (stageDrag.mode === 'shutter-blade') {
      const surf = state.surfaces.find(s => s.id === stageDrag.surfId);
      if (surf && !getEffectiveSurfaceProps(surf).locked) {
        const dxPx = px - stageDrag.startPx[0];
        const dyPx = py - stageDrag.startPx[1];
        if (e.altKey) {
          // Alt+Drag modulates optical barrel defocus (shutterSoft)
          surf.shutterSoft = clamp(stageDrag.origSoft + (dxPx - dyPx) * 0.0012, 0.001, 0.25);
        } else {
          const proj = (dxPx * stageDrag.inNormPx[0] + dyPx * stageDrag.inNormPx[1]) / Math.max(40, stageDrag.spanPx);
          surf[stageDrag.insKey] = clamp(stageDrag.origIns + proj, 0, 0.95);
        }
        state._sceneSyncRev++;
        if (surf.id === state.selectedSurfaceId && typeof syncInspectorUI === 'function') syncInspectorUI();
      }
    } else if (stageDrag.mode === 'shutter-tilt') {
      const surf = state.surfaces.find(s => s.id === stageDrag.surfId);
      if (surf && !getEffectiveSurfaceProps(surf).locked) {
        const curAng = Math.atan2(py - stageDrag.midPx[1], px - stageDrag.midPx[0]);
        let dDeg = ((curAng - stageDrag.startAng) * 180) / Math.PI;
        if (stageDrag.side === 'R' || stageDrag.side === 'B') dDeg = -dDeg;
        if (e.altKey) dDeg *= 0.15;
        let nextAng = clamp(stageDrag.origAng + dDeg, -45, 45);
        if (e.shiftKey) nextAng = Math.round(nextAng / 5) * 5;
        surf[stageDrag.angKey] = nextAng;
        state._sceneSyncRev++;
        if (surf.id === state.selectedSurfaceId && typeof syncInspectorUI === 'function') syncInspectorUI();
      }
    } else if (stageDrag.mode === 'spot-radius') {
      const targetSp = Array.isArray(state.spots) ? state.spots.find(s => s.id === stageDrag.spotId) : null;
      if (targetSp) {
        const dist = Math.max(4, Math.hypot(px - stageDrag.centerPx[0], py - stageDrag.centerPx[1]));
        if (e.altKey) {
          targetSp.softness = clamp(stageDrag.origSoft + (dist - stageDrag.startDist) * 0.0015, 0.002, 0.6);
        } else {
          targetSp.radius = clamp(stageDrag.origRadius * (dist / stageDrag.startDist), 0.01, 0.85);
        }
        if (targetSp.mode === 'off') targetSp.mode = 'veil';
        state._sceneSyncRev++;
        syncFollowspotInspectorUI();
      }
    } else if (stageDrag.mode === 'spot-rot') {
      const targetSp = Array.isArray(state.spots) ? state.spots.find(s => s.id === stageDrag.spotId) : null;
      if (targetSp) {
        const curAng = Math.atan2(py - stageDrag.centerPx[1], px - stageDrag.centerPx[0]);
        let nextRot = stateDragDegWrap(stageDrag.origRot - ((curAng - stageDrag.startAng) * 180) / Math.PI);
        if (e.shiftKey) nextRot = Math.round(nextRot / 15) * 15;
        targetSp.rotation = nextRot;
        state._sceneSyncRev++;
        syncFollowspotInspectorUI();
      }
    }
  });

  function stateDragDegWrap(deg) {
    return ((deg + 540) % 360) - 180;
  }

  stageOverlay.addEventListener('pointerleave', () => {
    state.hoveredCalibPinIdx = -1;
  });

  const endStageDrag = (e) => {
    if (stageDrag && stageDrag.pointerId === e.pointerId) {
      if (stageOverlay.hasPointerCapture(e.pointerId)) {
        stageOverlay.releasePointerCapture(e.pointerId);
      }

      if (stageDrag.mode === 'marquee' && state.marqueeRect && lastStageMetrics) {
        const mr = state.marqueeRect;
        const dragDist = Math.hypot(mr.x2 - mr.x1, mr.y2 - mr.y1);
        state.marqueeRect = null;
        if (dragDist >= 5) {
          const { box } = lastStageMetrics;
          const [ax, ay] = pxToStage(box, mr.x1, mr.y1);
          const [bx, by] = pxToStage(box, mr.x2, mr.y2);
          const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
          const minY = Math.min(ay, by), maxY = Math.max(ay, by);

          const hits = [];
          for (const surf of state.surfaces) {
            const eff = getEffectiveSurfaceProps(surf);
            if (!eff.visible || eff.locked) continue;
            const cent = getSurfaceCentroid(surf);
            const inCent = cent[0] >= minX && cent[0] <= maxX && cent[1] >= minY && cent[1] <= maxY;
            const testPts = surf.type === 'mesh3d' ? getSurfacePerimeterContour(surf).pts : surf.points;
            const inCorner = testPts.some(p => p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY);
            if (inCent || inCorner) hits.push(surf.id);
          }
          if (hits.length > 0) {
            if (stageDrag.additive) {
              const merged = Array.from(new Set([...state.selectedSurfaceIds, ...hits]));
              state.selectedSurfaceIds = merged;
              state.selectedSurfaceId = hits[0];
            } else {
              state.selectedSurfaceIds = hits;
              state.selectedSurfaceId = hits[0];
            }
            state.selectedVertex = null;
            renderSurfaceList();
            syncInspectorUI();
            if (hits.length > 1) showToast(`Selected ${hits.length} surfaces`);
          }
        } else if (!stageDrag.additive) {
          state.selectedVertex = null;
          if (state.selectedSurfaceId) {
            state.selectedSurfaceIds = [state.selectedSurfaceId];
            renderSurfaceList();
          }
        }
      } else if (stageDrag.mode !== 'pan' && stageDrag.mode !== 'spot-steer') {
        commitUndoGesture();
      }

      if (state.loupeState) state.loupeState.active = false;
      stageDrag = null;
      state.activeSnapLines = [];
    }
  };
  stageOverlay.addEventListener('pointerup', endStageDrag);
  stageOverlay.addEventListener('pointercancel', endStageDrag);

  stageOverlay.addEventListener('wheel', (e) => {
    if (state.projectorMode || !lastStageMetrics) return;
    e.preventDefault();

    // In Followspot Steer Mode, scroll wheel adjusts Iris Size (or Shift+Scroll Feather)
    if (state.steerSpotMode) {
      const delta = -e.deltaY * 0.00045;
      if (e.shiftKey) {
        state.followspot.softness = clamp(state.followspot.softness + delta, 0.002, 0.6);
      } else {
        state.followspot.radius = clamp(state.followspot.radius + delta, 0.01, 0.85);
      }
      syncFollowspotInspectorUI();
      return;
    }

    const rect = stageOverlay.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0014);
    const nextZoom = clamp(state.stageView.zoom * factor, 0.2, 16.0);
    const ratio = nextZoom / state.stageView.zoom;
    const cx = rect.width * 0.5 + state.stageView.panX;
    const cy = rect.height * 0.5 + state.stageView.panY;
    state.stageView.panX = (mx - rect.width * 0.5) - (mx - cx) * ratio;
    state.stageView.panY = (my - rect.height * 0.5) - (my - cy) * ratio;
    state.stageView.zoom = nextZoom;
  }, { passive: false });

  // ---------------------------------------------------------------------------
  // INPUT UV PANE & 3D ORBIT POINTER CONTROLLER
  // ---------------------------------------------------------------------------
  let inputDrag = null;

  const findNearestOrbit3DVertex = (surf, mvp, box, px, py) => {
    if (!surf || !mvp) return -1;
    const geom = getSurfaceMesh3DGeometry(surf, state.objAssets);
    const verts = geom && Array.isArray(geom.uniqueVerts) ? geom.uniqueVerts : [];
    let bestIdx = -1;
    let bestScore = Infinity;
    for (let i = 0; i < verts.length; i++) {
      const pr = projectPoint3DWithMvp(verts[i], mvp);
      if (pr.behind) continue;
      const vPx = stageToPx(box, pr.u, pr.v);
      const d = Math.hypot(vPx[0] - px, vPx[1] - py);
      if (d <= 14) {
        const score = d + Math.max(0, pr.ndcZ + 1) * 1.6;
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    }
    return bestIdx;
  };

  inputOverlay.addEventListener('pointerleave', () => {
    state.hoveredOrbitVertIdx = -1;
  });

  inputOverlay.addEventListener('dblclick', (e) => {
    if (!lastInputMetrics || state.projectorMode) return;
    if (lastInputMetrics.orbit3d) {
      state.orbit3D.yaw = -34;
      state.orbit3D.pitch = 22;
      state.orbit3D.dist = 2.65;
      state.orbit3D.panX = 0;
      state.orbit3D.panY = 0;
      return;
    }
    const { box, src } = lastInputMetrics;
    if (src && src.kind === 'mixbus' && src.editOrbsMode !== false && Array.isArray(src.orbs)) {
      const rect = inputOverlay.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      for (let i = src.orbs.length - 1; i >= 0; i--) {
        const orb = src.orbs[i];
        const [opx, opy] = mixbusOrbToPx(box, orb.x, orb.y);
        if (Math.hypot(opx - px, opy - py) <= 22) {
          pushUndoCheckpoint('Solo Mix Circle Orb');
          soloMixbusOrb(src, orb.id);
          syncTransportUI();
          scheduleAutosave();
          const orbSrc = state.sources.find(s => s.id === orb.sourceId);
          showToast(`Soloed Mix Orb: ${orbSrc ? orbSrc.name : orb.sourceId}`);
          return;
        }
      }
    }
  });

  inputOverlay.addEventListener('pointerdown', (e) => {
    if (!lastInputMetrics || state.projectorMode) return;
    const rect = inputOverlay.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { box, src } = lastInputMetrics;
    const srcAspect = src.width / Math.max(1, src.height);
    const [uvx, uvy] = pxToStage(box, px, py);

    // Phase 7A: Left-Pane 3D Orbit Camera + 6-Pt PnP Vertex Picker
    if (lastInputMetrics.orbit3d && lastInputMetrics.surf3d) {
      if (e.button !== 0 && e.button !== 1) return;
      const isPan = e.button === 1 || spacePanHeld || e.shiftKey;
      if (spacePanHeld) spacePanUsed = true;
      const hitVertIdx = (!isPan && !state.showLock)
        ? findNearestOrbit3DVertex(lastInputMetrics.surf3d, lastInputMetrics.orbitMvp, box, px, py)
        : -1;
      inputDrag = {
        mode: isPan ? 'orbit3d-pan' : 'orbit3d-rotate',
        pointerId: e.pointerId,
        surfId: lastInputMetrics.surf3d.id,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        hitVertIdx,
        origYaw: state.orbit3D.yaw,
        origPitch: state.orbit3D.pitch,
        origPanX: state.orbit3D.panX,
        origPanY: state.orbit3D.panY,
        origDist: state.orbit3D.dist
      };
      inputOverlay.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button === 1 || spacePanHeld) {
      if (spacePanHeld) spacePanUsed = true;
      inputDrag = { mode: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origPanX: state.inputView.panX, origPanY: state.inputView.panY };
      inputOverlay.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    // Polar Mix Circle Orb Interaction (live performance safe — works even under Show Lock!)
    if (src.kind === 'mixbus' && src.editOrbsMode !== false && Array.isArray(src.orbs)) {
      const [ox, oy] = pxToMixbusOrb(box, px, py);
      for (let i = src.orbs.length - 1; i >= 0; i--) {
        const orb = src.orbs[i];
        const [opx, opy] = mixbusOrbToPx(box, orb.x, orb.y);
        if (Math.hypot(opx - px, opy - py) <= 22) {
          src.selectedOrbId = orb.id;
          syncTransportUI();
          beginUndoGesture('Mix Circle Gesture');
          if (e.shiftKey) {
            inputDrag = {
              mode: 'mixbus-orbit-all',
              pointerId: e.pointerId,
              mixId: src.id,
              startAng: Math.atan2(oy, ox),
              startRad: Math.max(0.08, Math.hypot(ox, oy)),
              origOrbs: src.orbs.map(o => ({
                id: o.id,
                r: Math.hypot(o.targetX, o.targetY),
                ang: Math.atan2(o.targetY, o.targetX)
              }))
            };
          } else {
            inputDrag = {
              mode: 'mixbus-orb',
              pointerId: e.pointerId,
              mixId: src.id,
              orbId: orb.id,
              rawPrev: [ox, oy],
              gearedCur: [orb.targetX, orb.targetY]
            };
          }
          inputOverlay.setPointerCapture(e.pointerId);
          return;
        }
      }
      inputDrag = { mode: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origPanX: state.inputView.panX, origPanY: state.inputView.panY };
      inputOverlay.setPointerCapture(e.pointerId);
      return;
    }

    if (state.showLock) {
      showToast('🔒 Show Lock active — press Shift+P to unlock UV crop');
      return;
    }

    const sel = getSelectedSurface();
    const selEff = sel ? getEffectiveSurfaceProps(sel) : null;
    if (sel && selEff.visible && !selEff.locked && !(sel.type === 'line' && !sel.lineUseSource)) {
      const giz = getInputGizmoHandles(sel, box, srcAspect);

      if (Math.hypot(giz.rotHandle[0] - px, giz.rotHandle[1] - py) < 12) {
        beginUndoGesture('Rotate Input UV');
        const startAng = Math.atan2(py - giz.center[1], px - giz.center[0]);
        const uvArr = giz.kind === 'poly' ? (ensurePolygonUvs(sel), sel.polyUvs) : sel.triUvs;
        inputDrag = {
          mode: (giz.kind === 'tri' || giz.kind === 'poly') ? 'poly-rot' : 'rect-rot',
          uvProp: giz.kind === 'poly' ? 'polyUvs' : 'triUvs',
          pointerId: e.pointerId,
          surfId: sel.id,
          centerPx: giz.center,
          startAng,
          origRot: sel.uvRot,
          origUvs: uvArr.map(u => [u[0], u[1]])
        };
        inputOverlay.setPointerCapture(e.pointerId);
        return;
      }

      if (giz.kind === 'tri' || giz.kind === 'poly') {
        const uvProp = giz.kind === 'poly' ? 'polyUvs' : 'triUvs';
        const uvArr = sel[uvProp];
        for (let i = 0; i < giz.ptsPx.length; i++) {
          if (Math.hypot(giz.ptsPx[i][0] - px, giz.ptsPx[i][1] - py) < 12) {
            beginUndoGesture('Move Vertex UV');
            inputDrag = {
              mode: 'poly-vertex',
              uvProp,
              pointerId: e.pointerId,
              surfId: sel.id,
              idx: i,
              rawPrev: [uvx, uvy],
              gearedCur: [uvArr[i][0], uvArr[i][1]]
            };
            inputOverlay.setPointerCapture(e.pointerId);
            return;
          }
        }
        if (giz.ptsPx.length >= 3 && pointInPolygon(px, py, giz.ptsPx)) {
          beginUndoGesture('Pan Polygon UV');
          inputDrag = {
            mode: 'poly-move',
            uvProp,
            pointerId: e.pointerId,
            surfId: sel.id,
            startUv: [uvx, uvy],
            rawPrev: [uvx, uvy],
            gearedCur: [uvx, uvy],
            origUvs: uvArr.map(u => [u[0], u[1]])
          };
          inputOverlay.setPointerCapture(e.pointerId);
          return;
        }
      } else {
        for (let i = 0; i < 4; i++) {
          if (Math.hypot(giz.cornersPx[i][0] - px, giz.cornersPx[i][1] - py) < 11) {
            beginUndoGesture('Scale Input UV');
            inputDrag = { mode: 'rect-scale', pointerId: e.pointerId, surfId: sel.id, centerPx: giz.center, startDist: Math.max(8, Math.hypot(px - giz.center[0], py - giz.center[1])), origW: sel.uvW, origH: sel.uvH, frame: buildUvRectDragFrame(giz), cornerIdx: i };
            inputOverlay.setPointerCapture(e.pointerId);
            return;
          }
        }
        for (let i = 0; i < 4; i++) {
          if (Math.hypot(giz.edgesPx[i][0] - px, giz.edgesPx[i][1] - py) < 10) {
            beginUndoGesture('Scale Input UV Axis');
            inputDrag = { mode: 'rect-axis-scale', pointerId: e.pointerId, surfId: sel.id, edgeIdx: i, centerPx: giz.center, startDist: Math.max(6, Math.hypot(px - giz.center[0], py - giz.center[1])), origW: sel.uvW, origH: sel.uvH, frame: buildUvRectDragFrame(giz) };
            inputOverlay.setPointerCapture(e.pointerId);
            return;
          }
        }
        if (pointInPolygon(px, py, giz.cornersPx)) {
          beginUndoGesture('Move Input UV');
          inputDrag = {
            mode: 'rect-move',
            pointerId: e.pointerId,
            surfId: sel.id,
            startUv: [uvx, uvy],
            rawPrev: [uvx, uvy],
            gearedCur: [uvx, uvy],
            origX: sel.uvX,
            origY: sel.uvY
          };
          inputOverlay.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    inputDrag = { mode: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origPanX: state.inputView.panX, origPanY: state.inputView.panY };
    inputOverlay.setPointerCapture(e.pointerId);
  });

  inputOverlay.addEventListener('pointermove', (e) => {
    if (!lastInputMetrics || state.projectorMode) return;
    const rect = inputOverlay.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { box, src } = lastInputMetrics;
    const srcAspect = src.width / Math.max(1, src.height);
    const [uvx, uvy] = pxToStage(box, px, py);

    if (!inputDrag) {
      if (lastInputMetrics.orbit3d && lastInputMetrics.surf3d) {
        const hov = state.showLock
          ? -1
          : findNearestOrbit3DVertex(lastInputMetrics.surf3d, lastInputMetrics.orbitMvp, box, px, py);
        state.hoveredOrbitVertIdx = hov;
        inputOverlay.style.cursor = hov >= 0 ? 'crosshair' : 'grab';
        return;
      }
      state.hoveredOrbitVertIdx = -1;
      let cur = spacePanHeld ? 'grab' : 'default';
      if (src.kind === 'mixbus' && src.editOrbsMode !== false && Array.isArray(src.orbs)) {
        for (let i = src.orbs.length - 1; i >= 0; i--) {
          const [opx, opy] = mixbusOrbToPx(box, src.orbs[i].x, src.orbs[i].y);
          if (Math.hypot(opx - px, opy - py) <= 22) {
            cur = 'grab';
            break;
          }
        }
        inputOverlay.style.cursor = cur;
        return;
      }
      if (!state.showLock) {
        const sel = getSelectedSurface();
        const selEff = sel ? getEffectiveSurfaceProps(sel) : null;
        if (sel && selEff.visible && !selEff.locked && !(sel.type === 'line' && !sel.lineUseSource)) {
          const giz = getInputGizmoHandles(sel, box, srcAspect);
          if (Math.hypot(giz.rotHandle[0] - px, giz.rotHandle[1] - py) < 12) cur = 'grab';
          else if (giz.kind === 'tri' || giz.kind === 'poly') {
            if (giz.ptsPx.some(p => Math.hypot(p[0] - px, p[1] - py) < 12)) cur = 'crosshair';
            else if (giz.ptsPx.length >= 3 && pointInPolygon(px, py, giz.ptsPx)) cur = 'move';
          } else {
            if (giz.cornersPx.some(p => Math.hypot(p[0] - px, p[1] - py) < 11)) cur = 'nwse-resize';
            else if (giz.edgesPx.some(p => Math.hypot(p[0] - px, p[1] - py) < 10)) cur = 'ew-resize';
            else if (pointInPolygon(px, py, giz.cornersPx)) cur = 'move';
          }
        }
      }
      inputOverlay.style.cursor = cur;
      return;
    }

    if (inputDrag.pointerId !== e.pointerId) return;

    if (inputDrag.mode === 'orbit3d-rotate' || inputDrag.mode === 'orbit3d-pan') {
      const dxPx = e.clientX - inputDrag.startX;
      const dyPx = e.clientY - inputDrag.startY;
      if (Math.hypot(dxPx, dyPx) > 4.5) inputDrag.moved = true;
      const gearScale = e.altKey ? 0.15 : 1.0;
      if (inputDrag.mode === 'orbit3d-pan') {
        const panScale = (inputDrag.origDist / Math.max(120, box.h)) * 1.15 * gearScale;
        state.orbit3D.panX = clamp(inputDrag.origPanX + dxPx * panScale, -3.5, 3.5);
        state.orbit3D.panY = clamp(inputDrag.origPanY - dyPx * panScale, -3.5, 3.5);
      } else {
        state.orbit3D.yaw = (((inputDrag.origYaw - dxPx * 0.45 * gearScale) % 360) + 540) % 360 - 180;
        state.orbit3D.pitch = clamp(inputDrag.origPitch + dyPx * 0.42 * gearScale, -88, 88);
      }
      inputOverlay.style.cursor = 'grabbing';
      return;
    }

    const surf = state.surfaces.find(s => s.id === inputDrag.surfId);

    if (inputDrag.mode === 'pan') {
      state.inputView.panX = inputDrag.origPanX + (e.clientX - inputDrag.startX);
      state.inputView.panY = inputDrag.origPanY + (e.clientY - inputDrag.startY);
      return;
    }
    if (inputDrag.mode === 'mixbus-orb') {
      const mixSrc = state.sources.find(s => s.id === inputDrag.mixId && s.kind === 'mixbus');
      const orb = mixSrc && Array.isArray(mixSrc.orbs) ? mixSrc.orbs.find(o => o.id === inputDrag.orbId) : null;
      if (orb) {
        const [ox, oy] = pxToMixbusOrb(box, px, py);
        const gear = e.altKey ? 0.12 : 1.0;
        inputDrag.gearedCur[0] += (ox - inputDrag.rawPrev[0]) * gear;
        inputDrag.gearedCur[1] += (oy - inputDrag.rawPrev[1]) * gear;
        inputDrag.rawPrev = [ox, oy];
        let nx = inputDrag.gearedCur[0];
        let ny = inputDrag.gearedCur[1];
        const nr = Math.hypot(nx, ny);
        if (nr > 1.22) {
          nx = (nx / nr) * 1.22;
          ny = (ny / nr) * 1.22;
        }
        orb.targetX = nx;
        orb.targetY = ny;
        state._sceneSyncRev++;
      }
      return;
    }
    if (inputDrag.mode === 'mixbus-orbit-all') {
      const mixSrc = state.sources.find(s => s.id === inputDrag.mixId && s.kind === 'mixbus');
      if (mixSrc && Array.isArray(mixSrc.orbs)) {
        const [ox, oy] = pxToMixbusOrb(box, px, py);
        const dAng = Math.atan2(oy, ox) - inputDrag.startAng;
        const radScale = clamp(Math.hypot(ox, oy) / inputDrag.startRad, 0.2, 2.2);
        for (const orig of inputDrag.origOrbs) {
          const targetOrb = mixSrc.orbs.find(o => o.id === orig.id);
          if (!targetOrb) continue;
          const nr = clamp(orig.r * radScale, 0.0, 1.22);
          const na = orig.ang + dAng;
          targetOrb.targetX = Math.cos(na) * nr;
          targetOrb.targetY = Math.sin(na) * nr;
        }
        state._sceneSyncRev++;
      }
      return;
    }
    if (!surf || getEffectiveSurfaceProps(surf).locked) return;

    const gear = e.altKey ? 0.10 : 1.0;
    if (inputDrag.rawPrev && inputDrag.gearedCur) {
      inputDrag.gearedCur[0] += (uvx - inputDrag.rawPrev[0]) * gear;
      inputDrag.gearedCur[1] += (uvy - inputDrag.rawPrev[1]) * gear;
      inputDrag.rawPrev[0] = uvx;
      inputDrag.rawPrev[1] = uvy;
    }

    if (inputDrag.mode === 'rect-move') {
      surf.uvX = clamp(inputDrag.origX + (inputDrag.gearedCur[0] - inputDrag.startUv[0]), -0.5, 1.5);
      surf.uvY = clamp(inputDrag.origY + (inputDrag.gearedCur[1] - inputDrag.startUv[1]), -0.5, 1.5);
      state._sceneSyncRev++;
      syncUvSlidersFromSelected();
    } else if (inputDrag.mode === 'rect-scale' || inputDrag.mode === 'rect-axis-scale') {
      // Corner / edge drags anchor the opposite corner / edge (Alt = scale about centre,
      // Shift on a corner = keep aspect). Works in the slice's rotated local frame.
      const f = inputDrag.frame;
      const symmetric = e.altKey;
      const dX = px - f.c[0], dY = py - f.c[1];
      const pu = dX * f.ax[0] + dY * f.ax[1]; // along local +X (right edge)
      const pv = dX * f.ay[0] + dY * f.ay[1]; // along local +Y (top edge)
      let sx = null, sy = null; // which side of each axis is grabbed (+1 / -1), null = axis untouched
      if (inputDrag.mode === 'rect-scale') {
        const cp = f.corners[inputDrag.cornerIdx];
        sx = Math.sign((cp[0] - f.c[0]) * f.ax[0] + (cp[1] - f.c[1]) * f.ax[1]) || 1;
        sy = Math.sign((cp[0] - f.c[0]) * f.ay[0] + (cp[1] - f.c[1]) * f.ay[1]) || 1;
      } else if (inputDrag.edgeIdx === 0 || inputDrag.edgeIdx === 1) {
        sx = inputDrag.edgeIdx === 1 ? 1 : -1;
      } else {
        sy = inputDrag.edgeIdx === 2 ? 1 : -1;
      }
      let rx = 1, ry = 1, offU = 0, offV = 0;
      if (sx !== null) {
        const grab = sx * pu; // signed distance of the grabbed edge from the centre
        rx = symmetric ? grab / f.hx : (grab + f.hx) / (2 * f.hx);
        offU = symmetric ? 0 : sx * (grab - f.hx) * 0.5;
      }
      if (sy !== null) {
        const grab = sy * pv;
        ry = symmetric ? grab / f.hy : (grab + f.hy) / (2 * f.hy);
        offV = symmetric ? 0 : sy * (grab - f.hy) * 0.5;
      }
      if (inputDrag.mode === 'rect-scale' && e.shiftKey) {
        const r = Math.max(rx, ry);
        if (!symmetric) { offU = sx * (r - rx) * f.hx + offU; offV = sy * (r - ry) * f.hy + offV; }
        rx = ry = r;
      }
      rx = Math.max(0.05 / Math.max(0.05, inputDrag.origW), rx);
      ry = Math.max(0.05 / Math.max(0.05, inputDrag.origH), ry);
      if (sx !== null || inputDrag.mode === 'rect-scale') surf.uvW = clamp(inputDrag.origW * rx, 0.05, 2.0);
      if (sy !== null || inputDrag.mode === 'rect-scale') surf.uvH = clamp(inputDrag.origH * ry, 0.05, 2.0);
      const ncPx = [f.c[0] + f.ax[0] * offU + f.ay[0] * offV, f.c[1] + f.ax[1] * offU + f.ay[1] * offV];
      const [ncu, ncv] = pxToStage(box, ncPx[0], ncPx[1]);
      surf.uvX = ncu;
      surf.uvY = ncv;
      state._sceneSyncRev++;
      syncUvSlidersFromSelected();
    } else if (inputDrag.mode === 'rect-rot') {
      const ang = Math.atan2(py - inputDrag.centerPx[1], px - inputDrag.centerPx[0]);
      let deg = inputDrag.origRot - ((ang - inputDrag.startAng) * 180) / Math.PI;
      deg = ((deg + 540) % 360) - 180;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      surf.uvRot = deg;
      state._sceneSyncRev++;
      syncUvSlidersFromSelected();
    } else if (inputDrag.mode === 'poly-vertex') {
      surf[inputDrag.uvProp][inputDrag.idx] = [clamp(inputDrag.gearedCur[0], -0.3, 1.3), clamp(inputDrag.gearedCur[1], -0.3, 1.3)];
      if (surf.type === 'polygon') bumpSurfaceGeom(surf);
      state._sceneSyncRev++;
      syncUvSlidersFromSelected();
    } else if (inputDrag.mode === 'poly-move') {
      const dx = inputDrag.gearedCur[0] - inputDrag.startUv[0];
      const dy = inputDrag.gearedCur[1] - inputDrag.startUv[1];
      surf[inputDrag.uvProp] = inputDrag.origUvs.map(u => [clamp(u[0] + dx, -0.4, 1.4), clamp(u[1] + dy, -0.4, 1.4)]);
      if (surf.type === 'polygon') bumpSurfaceGeom(surf);
      state._sceneSyncRev++;
      syncUvSlidersFromSelected();
    } else if (inputDrag.mode === 'poly-rot') {
      const ang = Math.atan2(py - inputDrag.centerPx[1], px - inputDrag.centerPx[0]);
      let delta = -(ang - inputDrag.startAng);
      if (e.shiftKey) {
        const snapRad = (15 * Math.PI) / 180;
        delta = Math.round(delta / snapRad) * snapRad;
      }
      let cx = 0, cy = 0;
      for (const u of inputDrag.origUvs) { cx += u[0]; cy += u[1]; }
      cx /= Math.max(1, inputDrag.origUvs.length);
      cy /= Math.max(1, inputDrag.origUvs.length);
      const c = Math.cos(delta), s = Math.sin(delta);
      surf[inputDrag.uvProp] = inputDrag.origUvs.map(u => {
        const lx = (u[0] - cx) * srcAspect, ly = u[1] - cy;
        return [cx + (lx * c - ly * s) / srcAspect, cy + (lx * s + ly * c)];
      });
      if (surf.type === 'polygon') bumpSurfaceGeom(surf);
      state._sceneSyncRev++;
      syncUvSlidersFromSelected();
    }
  });

  const endInputDrag = (e) => {
    if (inputDrag && inputDrag.pointerId === e.pointerId) {
      if (inputOverlay.hasPointerCapture(e.pointerId)) inputOverlay.releasePointerCapture(e.pointerId);
      if (inputDrag.mode === 'orbit3d-rotate' || inputDrag.mode === 'orbit3d-pan') {
        if (inputDrag.mode === 'orbit3d-rotate' && !inputDrag.moved && inputDrag.hitVertIdx >= 0 && lastInputMetrics?.orbit3d && lastInputMetrics.surf3d) {
          if (state.showLock) {
            showToast('🔒 Show Lock active — press Shift+P to unlock calibration');
          } else {
            const surf = lastInputMetrics.surf3d;
            if (!getEffectiveSurfaceProps(surf).locked) {
              const geom = getSurfaceMesh3DGeometry(surf, state.objAssets);
              const v3 = geom?.uniqueVerts?.[inputDrag.hitVertIdx];
              if (v3) {
                if (!Array.isArray(surf.calibPins)) surf.calibPins = [];
                const existingIdx = surf.calibPins.findIndex(cp =>
                  cp && Array.isArray(cp.pos3d) &&
                  Math.hypot(cp.pos3d[0] - v3[0], cp.pos3d[1] - v3[1], cp.pos3d[2] - v3[2]) < 1e-3
                );
                if (e.altKey && existingIdx >= 0) {
                  pushUndoCheckpoint('Remove 3D Calibration Pin');
                  surf.calibPins.splice(existingIdx, 1);
                  state.selectedCalibPinIdx = Math.max(0, Math.min(state.selectedCalibPinIdx, surf.calibPins.length - 1));
                  state.selectedVertex = null;
                  bumpSurfaceGeom(surf);
                  state._sceneSyncRev++;
                  syncInspectorUI();
                  scheduleAutosave();
                  showToast(`Unpinned 3D Vertex (${surf.calibPins.length} pins left)`);
                } else if (existingIdx >= 0) {
                  surf.calibMode = 'calibrated';
                  state.selectedCalibPinIdx = existingIdx;
                  state.selectedVertex = { kind: 'calib-pin', surfId: surf.id, idx: existingIdx };
                  const pt2 = surf.calibPins[existingIdx].stage2d;
                  pingCalibCrosshair(pt2[0], pt2[1], 1800);
                  setLoupeTarget(pt2[0], pt2[1], false, 1400);
                  syncInspectorUI();
                  syncStageModePill();
                  showToast(`Selected Pin P${existingIdx + 1} — drag crosshair on Stage`);
                } else {
                  const outW = state.stageWidth || 1920;
                  const outH = state.stageHeight || 1080;
                  const curMats = resolveSurface3DRenderMatrices(surf, outW / Math.max(1, outH), outW, outH, state.objAssets);
                  const prStage = projectPoint3DWithMvp(v3, curMats.mvp);
                  const init2d = prStage.behind
                    ? [0.5, 0.5]
                    : [clamp(prStage.u, 0.05, 0.95), clamp(prStage.v, 0.05, 0.95)];
                  pushUndoCheckpoint('Add 3D Calibration Pin');
                  surf.calibPins.push({
                    id: `pin_${Date.now().toString(36)}_${surf.calibPins.length}`,
                    vertIdx: inputDrag.hitVertIdx,
                    pos3d: [v3[0], v3[1], v3[2]],
                    stage2d: init2d
                  });
                  surf.calibMode = 'calibrated';
                  state.selectedCalibPinIdx = surf.calibPins.length - 1;
                  state.selectedVertex = { kind: 'calib-pin', surfId: surf.id, idx: state.selectedCalibPinIdx };
                  bumpSurfaceGeom(surf);
                  state._sceneSyncRev++;
                  pingCalibCrosshair(init2d[0], init2d[1], 1800);
                  syncInspectorUI();
                  syncStageModePill();
                  scheduleAutosave();
                  const count = surf.calibPins.length;
                  showToast(count >= 6
                    ? `🎯 Pinned P${count} — 6-Pt PnP Active! Drag Stage crosshairs onto physical object`
                    : `Pinned P${count} (${6 - count} more needed for 6-Pt PnP solve)`);
                }
              }
            }
          }
        }
      } else if (inputDrag.mode !== 'pan') {
        commitUndoGesture();
      }
      inputDrag = null;
    }
  };
  inputOverlay.addEventListener('pointerup', endInputDrag);
  inputOverlay.addEventListener('pointercancel', endInputDrag);

  inputOverlay.addEventListener('wheel', (e) => {
    if (state.projectorMode) return;
    e.preventDefault();
    if (lastInputMetrics && lastInputMetrics.orbit3d) {
      state.orbit3D.dist = clamp(state.orbit3D.dist * Math.exp(e.deltaY * 0.0014), 0.65, 14.0);
      return;
    }
    const rect = inputOverlay.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0014);
    const nextZoom = clamp(state.inputView.zoom * factor, 0.2, 16.0);
    const ratio = nextZoom / state.inputView.zoom;
    const cx = rect.width * 0.5 + state.inputView.panX;
    const cy = rect.height * 0.5 + state.inputView.panY;
    state.inputView.panX = (mx - rect.width * 0.5) - (mx - cx) * ratio;
    state.inputView.panY = (my - rect.height * 0.5) - (my - cy) * ratio;
    state.inputView.zoom = nextZoom;
  }, { passive: false });

  // ---------------------------------------------------------------------------
  // SPLIT PANE RESIZER
  // ---------------------------------------------------------------------------
  const splitterEl = document.getElementById('pane-splitter');
  const inputPaneEl = document.getElementById('input-pane');
  const mixPaneEl = document.getElementById('mix-pane');
  const rigPaneEl = document.getElementById('rig-pane');
  let splitDragId = null;

  splitterEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    splitDragId = e.pointerId;
    splitterEl.classList.add('dragging');
    splitterEl.setPointerCapture(e.pointerId);
  });
  splitterEl.addEventListener('pointermove', (e) => {
    if (splitDragId !== e.pointerId) return;
    const r = panesAreaEl.getBoundingClientRect();
    const pct = clamp(((e.clientX - r.left) / Math.max(100, r.width)) * 100, 22, 78);
    const nextW = `${pct.toFixed(1)}%`;
    inputPaneEl.style.width = nextW;
    if (mixPaneEl) mixPaneEl.style.width = nextW;
    if (rigPaneEl) rigPaneEl.style.width = nextW;
    if (state.layoutMode === 'rig' && typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
  });
  const endSplit = (e) => {
    if (splitDragId === e.pointerId) {
      if (splitterEl.hasPointerCapture(e.pointerId)) splitterEl.releasePointerCapture(e.pointerId);
      splitterEl.classList.remove('dragging');
      splitDragId = null;
    }
  };
  splitterEl.addEventListener('pointerup', endSplit);
  splitterEl.addEventListener('pointercancel', endSplit);
  splitterEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const activeLeftPane = (state.layoutMode === 'mix' && mixPaneEl)
        ? mixPaneEl
        : ((state.layoutMode === 'rig' && rigPaneEl) ? rigPaneEl : inputPaneEl);
      const cur = parseFloat(activeLeftPane.style.width || '45');
      const nextW = `${clamp(cur + (e.key === 'ArrowLeft' ? -3 : 3), 22, 78)}%`;
      inputPaneEl.style.width = nextW;
      if (mixPaneEl) mixPaneEl.style.width = nextW;
      if (rigPaneEl) rigPaneEl.style.width = nextW;
      if (state.layoutMode === 'rig' && typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
    }
  });
}
