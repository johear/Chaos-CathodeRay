// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 07-ui-lists-inspectors.js — Scene Graph, Masks, Media Bin, Cues & Inspectors
// ============================================================================

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

const toastEl = document.getElementById('toast');
let toastTimer = null;
// Display label for a source kind ('syphon' is the stored value for window/screen captures).
function getSourceKindLabel(kind) {
  return kind === 'syphon' ? 'CAPTURE' : String(kind || '').toUpperCase();
}

function showToast(msg) {
  if (!toastEl || state.isProjectorRole) return;
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2200);
}

function setSliderValue(el, val) {
  if (!el) return;
  const num = Number(val);
  const s = String(val);
  el.value = s;
  el.setAttribute('value', s);
  const min = parseFloat(el.min || '0');
  const max = parseFloat(el.max || '1');
  el.style.setProperty('--attr-min', String(min));
  el.style.setProperty('--attr-max', String(max));
  el.style.setProperty('--control-value', s);
  if (max > min && !Number.isNaN(num)) {
    const pct = clamp(((num - min) / (max - min)) * 100, 0, 100);
    el.style.setProperty('--slider-progress', `${pct.toFixed(2)}%`);
  }
}

function syncSliderAriaValuetext(root = document) {
  if (!root || !root.querySelectorAll) return;
  const sliders = root.querySelectorAll('input[type="range"]');
  for (const sl of sliders) {
    const row = sl.parentElement;
    const valEl = row && (
      row.querySelector('.ctrl-val') ||
      (sl.nextElementSibling && sl.nextElementSibling.tagName === 'SPAN' ? sl.nextElementSibling : null)
    );
    if (valEl && valEl.textContent) {
      sl.setAttribute('aria-valuetext', valEl.textContent.trim());
    }
  }
}

function formatTimecode(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00.00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function switchLeftTab(tab) {
  state.leftTab = tab === 'masks' ? 'masks' : 'surfaces';
  state.stageEditMode = state.leftTab === 'masks' ? 'mask' : 'geometry';
  const leftTabs = [
    ['surfaces', 'tab-left-surfaces', 'left-surfaces-pane'],
    ['masks', 'tab-left-masks', 'left-masks-pane']
  ];
  for (const [key, btnId, paneId] of leftTabs) {
    const active = state.leftTab === key;
    const btn = document.getElementById(btnId);
    const pane = document.getElementById(paneId);
    if (btn) {
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
      btn.setAttribute('tabindex', active ? '0' : '-1');
    }
    if (pane) {
      pane.hidden = !active;
      pane.style.display = active ? 'flex' : 'none';
    }
  }

  if (state.leftTab === 'masks') {
    if (state.inspTab === 'surface') switchInspTab('mask');
  } else {
    if (state.inspTab === 'mask' && !state.drawingMaskId) {
      switchInspTab('surface');
    }
  }
  syncStageModePill();
}

function switchInspTab(tab) {
  state.inspTab = (tab === 'mask' || tab === 'spot' || tab === 'output' || tab === 'mod') ? tab : 'surface';
  const tabs = [
    ['surface', 'tab-insp-surface', 'insp-pane-surface'],
    ['mask', 'tab-insp-mask', 'insp-pane-mask'],
    ['spot', 'tab-insp-spot', 'insp-pane-spot'],
    ['output', 'tab-insp-output', 'insp-pane-output'],
    ['mod', 'tab-insp-mod', 'insp-pane-mod']
  ];
  for (const [key, btnId, paneId] of tabs) {
    const active = state.inspTab === key;
    const btn = document.getElementById(btnId);
    const pane = document.getElementById(paneId);
    if (!btn || !pane) continue;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.setAttribute('tabindex', active ? '0' : '-1');
    pane.hidden = !active;
  }
  if (state.inspTab === 'mask') syncMaskInspectorUI();
  else if (state.inspTab === 'spot') syncFollowspotInspectorUI();
  else if (state.inspTab === 'output') syncOutputInspectorUI();
  else if (state.inspTab === 'mod') {
    if (
      state.audio &&
      !state.audio.enabled &&
      state.sources.some(s => s && s.kind === 'video' && !s.offline && s.playing !== false) &&
      typeof enableAudioAnalyzer === 'function'
    ) {
      enableAudioAnalyzer('video');
    }
    syncModIoInspectorUI();
  }
  else syncInspectorUI();
  if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
  syncStageModePill();
}

function syncStageModePill() {
  const pill = document.getElementById('stage-mode-pill');
  if (!pill) return;
  const tpSpot = state.trackpadSpotTarget && typeof getActiveLiveSpot === 'function' ? getActiveLiveSpot() : null;
  if (state.showLock) {
    pill.textContent = '🔒 Show Locked (Live)';
    pill.style.color = '#ff8fa2';
  } else if (tpSpot || state.steerSpotMode) {
    pill.textContent = tpSpot ? `🎯 Trackpad Steer: ${tpSpot.name}` : '🎯 Live Followspot Steer';
    pill.style.color = 'var(--warm)';
  } else if (state.drawingSurfaceId) {
    const ds = state.surfaces.find(s => s.id === state.drawingSurfaceId);
    pill.textContent = ds?.type === 'line' ? '✎ Drawing Architectural Line' : '✎ Drawing N-Gon Polygon';
    pill.style.color = 'var(--brand-color)';
  } else if (state.drawingMaskId) {
    pill.textContent = '✎ Drawing Polygon Mask';
    pill.style.color = 'var(--violet)';
  } else if (typeof isMaskStageEditActive === 'function' ? isMaskStageEditActive() : state.leftTab === 'masks') {
    pill.textContent = '✂ Edit Polygon Masks';
    pill.style.color = 'var(--violet)';
  } else if (state.pixelMapper?.enabled && state.pixelMapper?.editOnStage) {
    pill.textContent = '💡 Edit DMX LED Fixtures';
    pill.style.color = 'var(--emerald)';
  } else if (state.masterKeystone?.enabled && state.masterKeystone?.editOnStage) {
    pill.textContent = '◈ Edit Master Keystone';
    pill.style.color = 'var(--emerald)';
  } else if ((state.selectedSurfaceIds?.length || 0) > 1) {
    pill.textContent = `⊞ Multi-Transform (${state.selectedSurfaceIds.length})`;
    pill.style.color = 'var(--emerald)';
  } else if (state.room === 'map' && !state.liveReachThrough) {
    pill.textContent = '🎨 Select Surface (F1 Build or Hold W to Warp)';
    pill.style.color = 'var(--brand-color)';
  } else {
    const selPrimary = getSelectedSurface();
    if (selPrimary && selPrimary.type === 'mesh3d' && selPrimary.calibMode === 'calibrated') {
      pill.textContent = '🎯 3D 6-Point PnP Calibration';
      pill.style.color = 'var(--emerald)';
    } else if (selPrimary && selPrimary.type === 'mesh3d') {
      pill.textContent = '🧊 Edit 3D Object Pose';
      pill.style.color = 'var(--brand-color)';
    } else {
      pill.textContent = 'Edit Physical Geometry';
      pill.style.color = 'var(--text-muted)';
    }
  }
}

function selectSurface(id, syncActiveMedia = false, appendMulti = false) {
  state.selectedVertex = null;
  if (!id) {
    state.selectedSurfaceId = null;
    state.selectedSurfaceIds = [];
  } else if (appendMulti) {
    const current = (Array.isArray(state.selectedSurfaceIds) && state.selectedSurfaceIds.length > 0)
      ? [...state.selectedSurfaceIds]
      : (state.selectedSurfaceId ? [state.selectedSurfaceId] : []);
    const existingIdx = current.indexOf(id);
    if (existingIdx >= 0) {
      if (current.length > 1) current.splice(existingIdx, 1);
      state.selectedSurfaceIds = current;
      state.selectedSurfaceId = current[current.length - 1] || id;
    } else {
      current.push(id);
      state.selectedSurfaceIds = current;
      state.selectedSurfaceId = id;
    }
  } else {
    state.selectedSurfaceId = id;
    state.selectedSurfaceIds = [id];
  }

  const surf = getSelectedSurface();
  if (surf && syncActiveMedia) {
    state.activeSourceId = surf.sourceId;
  }
  if (typeof setActiveSelection === 'function') {
    if (surf) setActiveSelection('surface', surf.id, surf.name);
    else if (state.activeSelection?.kind === 'surface') setActiveSelection(null, null, '');
  }
  renderSurfaceList();
  renderMediaBin();
  syncInspectorUI();
  syncTransportUI();
  syncStageModePill();
  if (typeof isBuildRoom === 'function' && isBuildRoom() && typeof renderWorldEntityInspectorUI === 'function') {
    renderWorldEntityInspectorUI();
  }
}

function selectMask(id) {
  state.selectedMaskId = id;
  if (typeof setActiveSelection === 'function') {
    const mk = state.masks.find(m => m.id === id);
    if (mk) setActiveSelection('mask', mk.id, mk.name);
  }
  renderMaskList();
  syncMaskInspectorUI();
  if (typeof isBuildRoom === 'function' && isBuildRoom() && typeof renderWorldEntityInspectorUI === 'function') {
    renderWorldEntityInspectorUI();
  }
}

function startNewInteractiveSurfaceDrawing(type = 'polygon') {
  if (state.showLock) {
    showToast('🔒 Show Lock active — press Shift+P to unlock');
    return;
  }
  if (state.drawingMaskId) finishActiveMaskDrawing();
  if (state.drawingSurfaceId) finishActiveSurfaceDrawing();
  if (state.steerSpotMode) toggleSpotSteerMode(false);
  if (state.layoutMode === 'input') setLayoutMode('split');

  const cleanType = type === 'line' ? 'line' : 'polygon';
  pushUndoCheckpoint(cleanType === 'line' ? 'Draw Architectural Line' : 'Draw N-Gon Polygon');
  const surf = createSurface(cleanType, {
    sourceId: state.activeSourceId || 'src_shards',
    points: [],
    polyUvs: []
  });
  state.surfaces.unshift(surf);
  state.selectedSurfaceId = surf.id;
  state.selectedSurfaceIds = [surf.id];
  state.drawingSurfaceId = surf.id;
  state.surfHoverPt = null;

  switchLeftTab('surfaces');
  switchInspTab('surface');
  renderSurfaceList();
  syncInspectorUI();
  syncStageModePill();
  showToast(cleanType === 'line'
    ? 'Click Stage to place Line points • Enter to finish (click 1st point to close loop)'
    : 'Click Stage to place Polygon vertices • Enter or click 1st point to close');
}

function finishActiveSurfaceDrawing(cancelForce = false) {
  if (!state.drawingSurfaceId) return;
  const surf = state.surfaces.find(s => s.id === state.drawingSurfaceId);
  state.drawingSurfaceId = null;
  state.surfHoverPt = null;

  const minPts = surf && surf.type === 'line' ? 2 : 3;
  if (!surf || cancelForce || surf.points.length < minPts) {
    if (surf) {
      state.surfaces = state.surfaces.filter(s => s.id !== surf.id);
    }
    const next = state.surfaces[0] ? state.surfaces[0].id : null;
    state.selectedSurfaceId = next;
    state.selectedSurfaceIds = next ? [next] : [];
    showToast(surf ? `${surf.type === 'line' ? 'Line' : 'Polygon'} cancelled (needs at least ${minPts} points)` : 'Drawing cancelled');
  } else {
    if (surf.type === 'polygon') {
      syncPolygonUvsFromStage(surf);
    }
    bumpSurfaceGeom(surf);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    showToast(`Finished ${surf.name} (${surf.points.length} points)`);
    scheduleAutosave();
  }
  renderSurfaceList();
  syncInspectorUI();
  syncStageModePill();
}

function startNewPolygonMaskDrawing() {
  if (state.showLock) {
    showToast('🔒 Show Lock active — press Shift+P to unlock');
    return;
  }
  if (state.drawingSurfaceId) finishActiveSurfaceDrawing();
  if (state.steerSpotMode) toggleSpotSteerMode(false);
  if (state.layoutMode === 'input') setLayoutMode('split');

  pushUndoCheckpoint('Draw Polygon Mask');
  const mask = createMask({
    name: `Polygon Mask ${state.nextMaskNum}`,
    mode: 'subtract',
    target: 'all',
    feather: 0.012,
    points: []
  });
  state.masks.unshift(mask);
  state.selectedMaskId = mask.id;
  state.drawingMaskId = mask.id;
  state.maskHoverPt = null;

  switchLeftTab('masks');
  switchInspTab('mask');
  renderMaskList();
  syncMaskInspectorUI();
  showToast('Click Stage to place polygon mask vertices • Enter or click 1st point to close');
}

function finishActiveMaskDrawing() {
  if (!state.drawingMaskId) return;
  const mask = state.masks.find(m => m.id === state.drawingMaskId);
  state.drawingMaskId = null;
  state.maskHoverPt = null;

  if (mask && mask.points.length < 3) {
    state.masks = state.masks.filter(m => m.id !== mask.id);
    state.selectedMaskId = state.masks[0] ? state.masks[0].id : null;
    showToast('Mask cancelled (needs at least 3 vertices)');
  } else if (mask) {
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    showToast(`Closed ${mask.name} (${mask.points.length} vertices)`);
    scheduleAutosave();
  }
  renderMaskList();
  syncMaskInspectorUI();
  syncStageModePill();
}

// ============================================================================
// 1. LEFT DOCK LIST RENDERERS (SURFACES, MASKS, MEDIA BIN, CUES)
// ============================================================================

let draggedLayerIdx = null;

function renderSurfaceList() {
  const listEl = document.getElementById('surface-list');
  const badgeEl = document.getElementById('surface-count-badge');
  const soloBanner = document.getElementById('solo-banner');
  const surfDrawBanner = document.getElementById('surf-draw-banner');
  const surfDrawText = document.getElementById('surf-draw-banner-text');
  if (!listEl) return;

  badgeEl.textContent = String(state.surfaces.length);
  if (surfDrawBanner) {
    const ds = state.drawingSurfaceId ? state.surfaces.find(s => s.id === state.drawingSurfaceId) : null;
    surfDrawBanner.classList.toggle('visible', !!ds);
    if (ds && surfDrawText) {
      surfDrawText.textContent = ds.type === 'line'
        ? `Drawing Line (${ds.points.length} pts) • Enter to finish`
        : `Drawing Polygon (${ds.points.length} pts) • Enter to close`;
    }
  }
  const anySolo = state.surfaces.some(s => {
    const eff = getEffectiveSurfaceProps(s);
    return eff.solo && eff.visible;
  });
  soloBanner.classList.toggle('visible', anySolo);

  listEl.innerHTML = '';
  const renderedGroupIds = new Set();

  const buildSurfaceRow = (surf, idx, inGroup = false) => {
    const eff = getEffectiveSurfaceProps(surf);
    const isPrimary = surf.id === state.selectedSurfaceId;
    const isMulti = isSurfaceSelected(surf.id) && !isPrimary;
    const item = document.createElement('div');
    item.className = 'layer-item' +
      (isPrimary ? ' selected' : (isMulti ? ' multi-selected' : '')) +
      (inGroup ? ' in-group' : '') +
      (!eff.visible ? ' hidden-layer' : '');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', (isPrimary || isMulti) ? 'true' : 'false');
    item.draggable = !state.showLock;

    const src = getSourceById(surf.sourceId);
    const curved = isCurvedMeshSurface(surf);
    const iconChar = surf.type === 'mesh3d'
      ? '🧊'
      : (surf.type === 'polygon'
          ? '⬠'
          : (surf.type === 'line'
              ? '╱'
              : (surf.type === 'triangle' ? '△' : (surf.type === 'circle' ? '◯' : (curved ? '⊞' : '▱')))));
    const warpTag = surf.type === 'mesh3d'
      ? ` • ${surf.objAssetId ? 'OBJ' : (MESH3D_PRIMITIVE_META[surf.mesh3dPrimitive]?.label?.replace(/^3D\s+/i, '') || 'Cube')}${surf.calibMode === 'calibrated' ? ' • PnP' : ''}`
      : (surf.type === 'polygon'
          ? ` • ${surf.points.length}v`
          : (surf.type === 'line'
              ? ` • ${surf.lineChaseMode || 'chase'}`
              : (curved ? ` • ${surf.quadWarp === 'bezier' ? 'Bezier' : `${surf.meshCols}×${surf.meshRows}`}` : '')));
    const srcLabel = (surf.type === 'line' && !surf.lineUseSource)
      ? 'Neon Beam'
      : (src ? src.name : 'None');
    const activeFxCount = Array.isArray(surf.fxChain)
      ? surf.fxChain.filter(f => f && f.enabled !== false).length
      : 0;
    const keyTag = (surf.keyMode && surf.keyMode !== 'off') ? ` • ${surf.keyMode}Key` : '';
    const fxTag = activeFxCount > 0 ? ` • ${activeFxCount}FX` : '';

    item.innerHTML = `
      <span class="layer-grip" aria-hidden="true">⋮⋮</span>
      <span class="layer-type-icon" style="color:${surf.accent};">${iconChar}</span>
      <div class="layer-meta">
        <span class="layer-name">${escapeHtml(surf.name)}</span>
        <span class="layer-sub">${escapeHtml(srcLabel)} • ${surf.blendMode}${keyTag}${fxTag}${warpTag}</span>
      </div>
      <div class="layer-actions">
        <button type="button" class="icon-btn surf-anim-btn ${surf.animateGeomInShow ? 'active' : ''}" data-act="animgeom" aria-label="Animate Geometry in Show Cues" title="${surf.animateGeomInShow ? 'Kinetic Surface: Geometry animates with Show Cues' : 'Venue Surface: Geometry protected from Show Cues (click to animate)'}">◆</button>
        <button type="button" class="icon-btn ${surf.solo ? 'on-solo' : ''}" data-act="solo" aria-label="Solo Surface">S</button>
        <button type="button" class="icon-btn ${!surf.visible ? 'off-vis' : ''}" data-act="vis" aria-label="Toggle Visibility">${surf.visible ? '◉' : '○'}</button>
        <button type="button" class="icon-btn ${surf.showCalGrid ? 'on-cal' : ''}" data-act="cal" aria-label="Calibration Grid">⌗</button>
        <button type="button" class="icon-btn ${surf.locked ? 'on-lock' : ''}" data-act="lock" aria-label="Lock Geometry">${surf.locked ? '🔒' : '🔓'}</button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) {
        e.stopPropagation();
        const act = btn.dataset.act;
        pushUndoCheckpoint(`Toggle Surface ${act}`);
        if (act === 'animgeom') {
          surf.animateGeomInShow = !surf.animateGeomInShow;
          showToast(surf.animateGeomInShow
            ? `◆ "${surf.name}" set to Kinetic (geometry animates in Show Cues)`
            : `🏛 "${surf.name}" locked to Venue Calibration`);
        } else if (act === 'solo') surf.solo = !surf.solo;
        else if (act === 'vis') surf.visible = !surf.visible;
        else if (act === 'cal') surf.showCalGrid = !surf.showCalGrid;
        else if (act === 'lock') surf.locked = !surf.locked;
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        renderSurfaceList();
        syncInspectorUI();
        scheduleAutosave();
        return;
      }
      selectSurface(surf.id, true, e.shiftKey || e.metaKey || e.ctrlKey);
      if (state.inspTab !== 'surface' && state.inspTab !== 'output') switchInspTab('surface');
    });

    item.addEventListener('dragstart', (e) => {
      if (state.showLock) { e.preventDefault(); return; }
      draggedLayerIdx = idx;
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (state.showLock || draggedLayerIdx === null || draggedLayerIdx === idx) return;
      pushUndoCheckpoint('Reorder Surface');
      const moved = state.surfaces.splice(draggedLayerIdx, 1)[0];
      moved.groupId = surf.groupId || null;
      state.surfaces.splice(idx, 0, moved);
      draggedLayerIdx = null;
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      renderSurfaceList();
      scheduleAutosave();
    });

    return item;
  };

  const renderGroupBlock = (grp) => {
    renderedGroupIds.add(grp.id);
    const members = [];
    state.surfaces.forEach((s, i) => {
      if (s.groupId === grp.id) members.push({ surf: s, idx: i });
    });
    const allGroupSel = members.length > 0 && members.every(m => isSurfaceSelected(m.surf.id));

    const hdr = document.createElement('div');
    hdr.className = 'group-header-item' +
      (allGroupSel ? ' group-selected' : '') +
      (!grp.visible ? ' hidden-layer' : '');
    hdr.innerHTML = `
      <button type="button" class="icon-btn" data-gact="collapse" aria-label="Collapse Group">${grp.collapsed ? '▸' : '▾'}</button>
      <span class="layer-type-icon" style="color:${grp.accent || 'var(--warm)'};">▣</span>
      <div class="layer-meta">
        <span class="layer-name" data-grp-rename="${grp.id}">${escapeHtml(grp.name)}</span>
        <span class="layer-sub">Group • ${members.length} surf${grp.opacity < 0.995 ? ` • ${Math.round(grp.opacity * 100)}%` : ''}</span>
      </div>
      <div class="layer-actions">
        <button type="button" class="icon-btn ${grp.solo ? 'on-solo' : ''}" data-gact="solo" title="Solo Group">S</button>
        <button type="button" class="icon-btn ${!grp.visible ? 'off-vis' : ''}" data-gact="vis" title="Group Visibility">${grp.visible ? '◉' : '○'}</button>
        <button type="button" class="icon-btn ${grp.locked ? 'on-lock' : ''}" data-gact="lock" title="Lock Group">${grp.locked ? '🔒' : '🔓'}</button>
        <button type="button" class="icon-btn" data-gact="ungroup" title="Ungroup Surfaces">✕</button>
      </div>
    `;

    const nameEl = hdr.querySelector('[data-grp-rename]');
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'studio-input';
      inp.value = grp.name;
      inp.style.width = '100%';
      nameEl.replaceWith(inp);
      inp.focus();
      inp.select();
      const commit = () => {
        grp.name = inp.value.trim() || grp.name;
        renderSurfaceList();
        scheduleAutosave();
      };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') {
          if (isImeComposingEnter(ke)) return;
          ke.preventDefault();
          inp.blur();
        } else if (ke.key === 'Escape') { inp.value = grp.name; inp.blur(); }
      });
    });

    hdr.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-gact]');
      if (btn) {
        e.stopPropagation();
        const gact = btn.dataset.gact;
        if (gact === 'collapse') {
          grp.collapsed = !grp.collapsed;
        } else if (gact === 'ungroup') {
          if (state.showLock) { showToast('🔒 Show Lock active'); return; }
          pushUndoCheckpoint(`Ungroup ${grp.name}`);
          state.surfaces.forEach(s => { if (s.groupId === grp.id) s.groupId = null; });
          state.groups = state.groups.filter(g => g.id !== grp.id);
        } else {
          pushUndoCheckpoint(`Toggle Group ${gact}`);
          if (gact === 'solo') grp.solo = !grp.solo;
          else if (gact === 'vis') grp.visible = !grp.visible;
          else if (gact === 'lock') grp.locked = !grp.locked;
        }
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        renderSurfaceList();
        syncInspectorUI();
        scheduleAutosave();
        return;
      }
      if (members.length > 0) {
        state.selectedVertex = null;
        state.selectedSurfaceIds = members.map(m => m.surf.id);
        state.selectedSurfaceId = members[0].surf.id;
        renderSurfaceList();
        syncInspectorUI();
        syncStageModePill();
      }
    });

    hdr.addEventListener('dragover', (e) => {
      e.preventDefault();
      hdr.classList.add('drag-over');
    });
    hdr.addEventListener('dragleave', () => hdr.classList.remove('drag-over'));
    hdr.addEventListener('drop', (e) => {
      e.preventDefault();
      hdr.classList.remove('drag-over');
      if (state.showLock || draggedLayerIdx === null) return;
      const moved = state.surfaces[draggedLayerIdx];
      if (moved) {
        pushUndoCheckpoint(`Move to ${grp.name}`);
        moved.groupId = grp.id;
        grp.collapsed = false;
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        draggedLayerIdx = null;
        renderSurfaceList();
        scheduleAutosave();
      }
    });

    listEl.appendChild(hdr);
    if (!grp.collapsed) {
      for (const m of members) {
        listEl.appendChild(buildSurfaceRow(m.surf, m.idx, true));
      }
    }
  };

  state.surfaces.forEach((surf, idx) => {
    const grp = surf.groupId ? getGroupById(surf.groupId) : null;
    if (grp) {
      if (!renderedGroupIds.has(grp.id)) {
        renderGroupBlock(grp);
      }
    } else {
      listEl.appendChild(buildSurfaceRow(surf, idx, false));
    }
  });

  if (Array.isArray(state.groups)) {
    for (const grp of state.groups) {
      if (!renderedGroupIds.has(grp.id)) {
        renderGroupBlock(grp);
      }
    }
  }

  // Keep Mask Target dropdown synced with current surfaces
  syncMaskTargetDropdown();
}

function renderMaskList() {
  const listEl = document.getElementById('mask-list');
  const badgeEl = document.getElementById('mask-count-badge');
  const drawBanner = document.getElementById('mask-draw-banner');
  if (!listEl) return;

  badgeEl.textContent = String(state.masks.length);
  drawBanner.classList.toggle('visible', !!state.drawingMaskId);

  listEl.innerHTML = '';
  for (const mask of state.masks) {
    const item = document.createElement('div');
    const isSel = mask.id === state.selectedMaskId;
    item.className = 'layer-item' +
      (isSel ? ' mask-selected' : '') +
      (!mask.visible ? ' hidden-layer' : '');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(isSel));

    const targetSurf = mask.target === 'all'
      ? 'Master Stage'
      : (state.surfaces.find(s => s.id === mask.target)?.name || 'Surface');
    const modeColor = mask.mode === 'add' ? 'var(--emerald)' : 'var(--violet)';
    const modeLabel = mask.mode === 'add' ? 'ADD' : 'CUT';
    const hasSmooth = !!mask.smoothAll || (Array.isArray(mask.curveFlags) && mask.curveFlags.some(Boolean));

    item.innerHTML = `
      <span class="layer-type-icon" style="color:${modeColor};">✂</span>
      <div class="layer-meta">
        <span class="layer-name">${escapeHtml(mask.name)}</span>
        <span class="layer-sub">${modeLabel} • ${mask.points.length} pts${hasSmooth ? ' • Bezier' : ''} • ${escapeHtml(targetSurf)}</span>
      </div>
      <div class="layer-actions">
        <button type="button" class="icon-btn ${!mask.visible ? 'off-vis' : ''}" data-mact="vis" aria-label="Toggle Mask Visibility">${mask.visible ? '◉' : '○'}</button>
        <button type="button" class="icon-btn ${mask.locked ? 'on-lock' : ''}" data-mact="lock" aria-label="Lock Mask">${mask.locked ? '🔒' : '🔓'}</button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mact]');
      if (btn) {
        e.stopPropagation();
        pushUndoCheckpoint('Toggle Mask');
        if (btn.dataset.mact === 'vis') mask.visible = !mask.visible;
        else if (btn.dataset.mact === 'lock') mask.locked = !mask.locked;
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        renderMaskList();
        syncMaskInspectorUI();
        scheduleAutosave();
        return;
      }
      selectMask(mask.id);
      switchInspTab('mask');
    });

    listEl.appendChild(item);
  }
}

function renderMediaBin() {
  const listEl = document.getElementById('media-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  for (const src of state.sources) {
    const card = document.createElement('div');
    card.className = 'media-card' +
      (src.id === state.activeSourceId ? ' active-source' : '') +
      (src.offline ? ' offline-source' : '');
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', src.id === state.activeSourceId ? 'true' : 'false');

    let thumbHtml = '';
    if (src.thumbUrl) {
      thumbHtml = `<div class="media-thumb"><img src="${src.thumbUrl}" width="38" height="25" alt="" /></div>`;
    } else if (src.kind === 'mixbus') {
      thumbHtml = `<div class="media-thumb" style="background:${src.swatchCss};color:#fff;font-size:12px;">◎</div>`;
    } else if (src.kind === 'isf') {
      thumbHtml = `<div class="media-thumb" style="background:${src.swatchCss};color:#04130d;font-weight:800;">ISF</div>`;
    } else if (src.kind === 'shader') {
      thumbHtml = `<div class="media-thumb" style="background:${src.swatchCss};color:#090d14;">GLSL</div>`;
    } else if (src.kind === 'text') {
      thumbHtml = `<div class="media-thumb" style="background:${src.swatchCss || '#101828'};color:#fff;font-weight:800;">Aa</div>`;
    } else if (src.kind === 'syphon') {
      thumbHtml = `<div class="media-thumb" style="color:var(--brand-color);">🖥</div>`;
    } else if (src.offline) {
      thumbHtml = `<div class="media-thumb" style="color:#ff8fa2;">⚠</div>`;
    } else if (src.kind === 'live') {
      thumbHtml = `<div class="media-thumb" style="color:#ff8fa2;">LIVE</div>`;
    } else {
      thumbHtml = `<div class="media-thumb">${getSourceKindLabel(src.kind).slice(0, 3)}</div>`;
    }

    const isIsfErr = src.kind === 'isf' && src.compileOk === false;
    const pillClass = (src.offline || isIsfErr)
      ? 'offline'
      : (src.kind === 'mixbus'
          ? 'mixbus'
          : (src.kind === 'isf'
              ? 'isf'
              : (src.kind === 'syphon'
                  ? 'syphon'
                  : (src.kind === 'text'
                      ? 'text'
                      : (src.kind === 'video' ? 'video' : src.kind === 'image' ? 'image' : src.kind === 'live' ? 'live' : '')))));
    const pillText = src.offline
      ? 'OFFLINE'
      : (isIsfErr
          ? 'ERR'
          : (src.kind === 'mixbus' ? 'MIX' : (src.kind === 'shader' ? 'SHADER' : getSourceKindLabel(src.kind))));

    const metaDetail = src.kind === 'mixbus'
      ? `${(src.orbs || []).length} Orbs • ${src.blendMode || 'screen'}`
      : (src.kind === 'syphon'
          ? (src.streamEnded ? 'Paused • Re-Capture' : `${src.width}×${src.height} Live${src.hasAudioTrack ? ' ♫' : ''}`)
          : (src.kind === 'text'
              ? `${src.animMode === 'static' ? 'Signage' : src.animMode} • ${src.width}×${src.height}`
              : (isIsfErr ? 'Check GLSL' : `${src.width}×${src.height}`)));

    const canDelete = src.kind !== 'shader' && src.kind !== 'mixbus';
    const extraBtns =
      (src.kind === 'video' && !src.offline
        ? `<button type="button" class="icon-btn ${!src.muted ? 'on-cal' : ''}" data-mute-vid="${src.id}" aria-pressed="${String(!src.muted)}" aria-label="Speaker sound for ${escapeHtml(src.name)}" title="${src.muted ? 'Speakers Muted — click to Unmute' : 'Speakers Sound ON — click to Mute'}">${src.muted ? '🔇' : '🔊'}</button>`
        : '') +
      (src.kind === 'isf'
        ? `<button type="button" class="icon-btn" data-edit-isf="${src.id}" aria-label="Edit ISF Shader">&lt;/&gt;</button>`
        : '') +
      (src.kind === 'text'
        ? `<button type="button" class="icon-btn" data-edit-txt="${src.id}" aria-label="Edit Stage Typography" title="Edit Stage Typography &amp; Countdown">✎</button>`
        : '') +
      (src.kind === 'syphon'
        ? `<button type="button" class="icon-btn ${src.streamEnded ? 'on-solo' : ''}" data-recap-capture="${src.id}" aria-label="Re-Capture Window or Screen" title="Select Window / App / Tab">↻</button>`
        : '') +
      (canDelete
        ? `<button type="button" class="icon-btn" data-del-src="${src.id}" aria-label="Remove Source">✕</button>`
        : '');

    card.innerHTML = `
      ${thumbHtml}
      <div class="media-info">
        <div class="media-title">${escapeHtml(src.name)}</div>
        <div class="media-meta">
          <span class="type-pill ${pillClass}">${pillText}</span>
          <span>${escapeHtml(metaDetail)}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;">
        ${extraBtns}
        <button type="button" class="btn" style="padding:2px 5px;font-size:9px;" data-assign="${src.id}">
          ${src.offline ? 'Relink' : 'Use'}
        </button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      const muteVidBtn = e.target.closest('button[data-mute-vid]');
      if (muteVidBtn) {
        e.stopPropagation();
        src.muted = !src.muted;
        if (!src.muted && (src.volume ?? 0.8) <= 0.01) src.volume = 0.8;
        if (typeof syncVideoAudioElementState === 'function') syncVideoAudioElementState(src, true);
        else if (src.video) src.video.muted = src.muted;
        if (!src.muted && state.audio) {
          state.audio.videoSourceId = 'auto';
          if (!state.audio.enabled || state.audio.sourceMode === 'synth') {
            if (typeof enableAudioAnalyzer === 'function') enableAudioAnalyzer('video');
          } else if (state.audio.sourceMode === 'video' && typeof attachActiveVideoToAudioGraph === 'function') {
            attachActiveVideoToAudioGraph();
          }
        }
        renderMediaBin();
        syncTransportUI();
        if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
        scheduleAutosave();
        showToast(src.muted
          ? `🔇 "${src.name}" Speakers Muted`
          : `🔊 "${src.name}" Sound ON (${Math.round((src.volume ?? 0.8) * 100)}%)`);
        return;
      }
      const editBtn = e.target.closest('button[data-edit-isf]');
      if (editBtn) {
        e.stopPropagation();
        state.activeSourceId = src.id;
        openShaderStudioDrawer(src.id);
        renderMediaBin();
        syncTransportUI();
        return;
      }
      const editTxtBtn = e.target.closest('button[data-edit-txt]');
      if (editTxtBtn) {
        e.stopPropagation();
        state.activeSourceId = src.id;
        openTextStudioModal(src.id);
        renderMediaBin();
        syncTransportUI();
        return;
      }
      const recapBtn = e.target.closest('button[data-recap-capture]');
      if (recapBtn) {
        e.stopPropagation();
        state.activeSourceId = src.id;
        addScreenCaptureSource(src);
        return;
      }
      const delBtn = e.target.closest('button[data-del-src]');
      if (delBtn) {
        e.stopPropagation();
        if (state.showLock) {
          showToast('🔒 Show Lock active — press Shift+P to unlock');
          return;
        }
        pushUndoCheckpoint(`Remove ${src.name}`);
        const name = src.name;
        if (removeCustomSource(src.id)) {
          showToast(`Removed source: ${name}`);
        }
        return;
      }
      const assignBtn = e.target.closest('button[data-assign]');
      state.activeSourceId = src.id;
      if (src.kind === 'isf') {
        state.shaderEditorSourceId = src.id;
        if (state.shaderDrawerOpen) syncShaderStudioUI(true);
      }
      if (assignBtn && src.offline) {
        e.stopPropagation();
        openRelinkModal();
        return;
      }
      if (assignBtn) {
        const targets = getSelectedSurfaces().filter(s => !getEffectiveSurfaceProps(s).locked);
        if (targets.length > 0 && !state.showLock) {
          pushUndoCheckpoint('Assign Media Source');
          targets.forEach(t => { t.sourceId = src.id; });
          state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
          renderSurfaceList();
          syncInspectorUI();
          scheduleAutosave();
          showToast(targets.length > 1
            ? `Assigned "${src.name}" → ${targets.length} surfaces`
            : `Assigned "${src.name}" → ${targets[0].name}`);
        }
      }
      renderMediaBin();
      syncTransportUI();
      if (state.inspTab === 'mod' && typeof syncModIoInspectorUI === 'function') {
        syncModIoInspectorUI();
      }
    });

    listEl.appendChild(card);
  }
}

function renderCueList() {
  const listEl = document.getElementById('cue-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const activeOverrides = new Set(state.activeOverrideCueIds || []);
  let seqOrdinal = 0;

  state.cues.forEach((cue, idx) => {
    if (typeof ensureCueMilestone5Props === 'function') {
      ensureCueMilestone5Props(cue, idx, state.cues.length);
    }
    const isDeck = cue.cueRole === 'deck';
    if (!isDeck) seqOrdinal++;
    const isOverrideOn = isDeck && activeOverrides.has(cue.id);
    const isActive = (!isDeck && cue.id === state.activeCueId) || isOverrideOn;
    const isSelected = cue.id === state.selectedCueId;
    const item = document.createElement('div');
    item.className = 'cue-item' + (isActive ? ' active-cue' : '') + (isSelected ? ' selected' : '');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(isActive || isSelected));

    const surfCount = cue.snapshot?.surfaces?.length || 0;
    const spotMode = cue.snapshot?.spots?.[0]?.mode || cue.snapshot?.followspot?.mode || 'off';
    const spotBadge = spotMode !== 'off' ? ` • Spot:${spotMode}` : '';
    const rf = cue.recallFilter || {};
    const hasGeomRecall = rf.geometry !== false;
    const geomBadgeHtml = hasGeomRecall ? ` <span class="cue-geom-badge" title="Recalls Venue Geometry">G</span>` : '';
    const autoBadge = (!isDeck && cue.autoFollow) ? ` • Auto ${Number(cue.waitSec ?? 4).toFixed(1)}s` : '';
    const retrigBadge = cue.retriggerVideos ? ' • ↻Vid' : '';
    const isPrio = cue.priorityMode === 'override';

    item.innerHTML = `
      <span class="layer-type-icon" style="color:${isOverrideOn ? 'var(--warm)' : (isActive ? 'var(--emerald)' : 'var(--text-muted)')};">${isDeck ? '⚡' : seqOrdinal}</span>
      <div class="layer-meta">
        <span class="layer-name" data-cue-rename="${cue.id}">${escapeHtml(cue.name)}${geomBadgeHtml}</span>
        <span class="layer-sub">${isDeck ? (isPrio ? 'Out-of-Seq · Priority' : 'Out-of-Seq · LTP') : `${surfCount} surf`}${spotBadge}${autoBadge}${retrigBadge}</span>
      </div>
      <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;">
        <button type="button" class="btn ${isDeck ? 'warm active' : ''} cue-role-btn" style="padding:1px 4px;font-size:8.5px;" title="Toggle Sequenced Cue (GO/Back) vs Out-of-Sequence Action Cue">${isDeck ? 'DECK' : 'SEQ'}</button>
        ${isDeck ? `<button type="button" class="btn ${isPrio ? 'warm active' : ''} cue-prio-btn" style="padding:1px 4px;font-size:8.5px;" title="Toggle Priority Override over Sequenced Cues vs LTP">${isPrio ? '⚡PRIO' : 'LTP'}</button>` : ''}
        <label class="mini-ctrl" style="gap:2px;" aria-label="Cue Crossfade Seconds">
          <input type="number" class="studio-input cue-fade-inp" min="0" max="15" step="0.2" value="${Number(cue.fadeSec).toFixed(1)}" style="width:38px;padding:2px 3px;font-size:9px;text-align:right;" />
          <span style="font-size:8.5px;">s</span>
        </label>
      </div>
    `;

    item.querySelector('.cue-role-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      pushUndoCheckpoint('Toggle Cue Sequence Role');
      cue.cueRole = cue.cueRole === 'deck' ? 'seq' : 'deck';
      if (cue.cueRole === 'deck') {
        cue.priorityMode = cue.priorityMode || 'override';
        if (state.activeCueId === cue.id) {
          const nextSeq = state.cues.find(c => c.cueRole !== 'deck');
          state.activeCueId = nextSeq ? nextSeq.id : null;
        }
      } else if (Array.isArray(state.activeOverrideCueIds)) {
        state.activeOverrideCueIds = state.activeOverrideCueIds.filter(id => id !== cue.id);
      }
      renderCueList();
      if (typeof renderLivePerformanceDockUI === 'function' && state.room === 'live') {
        renderLivePerformanceDockUI();
      }
      scheduleAutosave();
    });

    item.querySelector('.cue-prio-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      pushUndoCheckpoint('Toggle Cue Priority Mode');
      cue.priorityMode = cue.priorityMode === 'override' ? 'ltp' : 'override';
      if (cue.priorityMode !== 'override' && Array.isArray(state.activeOverrideCueIds)) {
        state.activeOverrideCueIds = state.activeOverrideCueIds.filter(id => id !== cue.id);
      }
      renderCueList();
      if (typeof renderLivePerformanceDockUI === 'function' && state.room === 'live') {
        renderLivePerformanceDockUI();
      }
      scheduleAutosave();
    });

    const fadeInp = item.querySelector('.cue-fade-inp');
    fadeInp.addEventListener('click', (e) => e.stopPropagation());
    fadeInp.addEventListener('change', (e) => {
      e.stopPropagation();
      cue.fadeSec = clamp(parseFloat(fadeInp.value) || 0, 0, 20);
      fadeInp.value = cue.fadeSec.toFixed(1);
      scheduleAutosave();
    });

    // Double-click cue title to rename inline without prompt()
    const nameEl = item.querySelector('[data-cue-rename]');
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'studio-input';
      inp.value = cue.name;
      inp.style.width = '100%';
      nameEl.replaceWith(inp);
      inp.focus();
      inp.select();
      const commit = () => {
        cue.name = inp.value.trim() || cue.name;
        renderCueList();
        if (typeof renderLivePerformanceDockUI === 'function' && state.room === 'live') {
          renderLivePerformanceDockUI();
        }
        scheduleAutosave();
      };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') {
          if (isImeComposingEnter(ke)) return;
          ke.preventDefault();
          inp.blur();
        } else if (ke.key === 'Escape') { inp.value = cue.name; inp.blur(); }
      });
    });

    item.addEventListener('click', () => {
      state.selectedCueId = cue.id;
      if (typeof setActiveSelection === 'function') {
        setActiveSelection('cue', cue.id, cue.name);
      }
      if (state.midi && state.midi.learnArmed && typeof armMidiLearnForTarget === 'function') {
        armMidiLearnForTarget({
          targetType: 'cue',
          targetKey: cue.id,
          label: `Cue: ${cue.name}`,
          min: 0,
          max: 1
        });
        return;
      }
      triggerCueById(cue.id);
    });

    listEl.appendChild(item);
  });

  syncCueRecallToolbarUI();
  if (typeof syncShowRailUI === 'function') syncShowRailUI();
  if (typeof syncCueScopeButtonUI === 'function') syncCueScopeButtonUI();
}

function syncCueRecallToolbarUI() {
  const cue = state.cues.find(c => c.id === (state.selectedCueId || state.activeCueId))
    || state.cues.find(c => c.id === state.activeCueId)
    || state.cues[0]
    || null;
  if (cue && typeof ensureCueMilestone5Props === 'function') {
    ensureCueMilestone5Props(cue, Math.max(0, state.cues.indexOf(cue)), state.cues.length);
  }
  const rf = cue?.recallFilter || {
    geometry: true,
    media: true,
    gradingFx: true,
    masks: true,
    followspot: true,
    modulators: true
  };
  const map = [
    ['chk-cue-rf-geom', rf.geometry !== false],
    ['chk-cue-rf-media', rf.media !== false],
    ['chk-cue-rf-fx', rf.gradingFx !== false],
    ['chk-cue-rf-masks', rf.masks !== false],
    ['chk-cue-rf-spot', rf.followspot !== false],
    ['chk-cue-rf-mods', rf.modulators !== false],
    ['chk-cue-autofollow', !!(cue && cue.autoFollow)],
    ['chk-cue-retrig', !!(cue && cue.retriggerVideos)]
  ];
  for (const [id, checked] of map) {
    const el = document.getElementById(id);
    if (el) {
      el.checked = checked;
      el.disabled = !cue;
    }
  }
  const waitInp = document.getElementById('inp-cue-wait');
  if (waitInp) {
    waitInp.disabled = !cue;
    if (document.activeElement !== waitInp) {
      waitInp.value = String(cue ? (cue.waitSec ?? 4) : 4);
    }
  }
}

// ============================================================================
// 2. RELINK MODAL & TOPBAR / INSPECTOR / TRANSPORT SYNCHRONIZATION
// ============================================================================

function updateRelinkBadgeUI() {
  const offlineCount = state.sources.filter(s => s.offline).length;
  const btn = document.getElementById('btn-open-relink');
  if (btn) {
    btn.hidden = offlineCount === 0;
    btn.textContent = `⚠ Relink Media (${offlineCount})`;
  }
  if (typeof refreshSavedHandleMatches === 'function') {
    refreshSavedHandleMatches();
  }
}

function renderRelinkDialogList() {
  const listEl = document.getElementById('relink-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const mediaClips = state.sources.filter(s => s.kind === 'video' || s.kind === 'image');
  if (mediaClips.length === 0) {
    listEl.innerHTML = `<div style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-muted);">No external video or image files referenced in this show.</div>`;
    return;
  }

  for (const s of mediaClips) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid var(--border-subtle);';
    const statusHtml = s.offline
      ? `<span class="type-pill offline">OFFLINE</span>`
      : `<span class="type-pill image">LINKED ✓</span>`;

    row.innerHTML = `
      <div style="min-width:0;flex:1;">
        <div style="font-weight:600;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.fileName || s.name)}</div>
        <div style="font-family:var(--font-mono);font-size:9.5px;color:var(--text-muted);">${getSourceKindLabel(s.kind)} • ${s.width}×${s.height}</div>
      </div>
      ${statusHtml}
    `;
    listEl.appendChild(row);
  }
}

function openRelinkModal() {
  const dlg = document.getElementById('relink-dialog');
  if (!dlg) return;
  renderRelinkDialogList();
  if (!dlg.open) {
    dlg.showModal();
  }
}

function syncTopbarUI() {
  document.getElementById('btn-snap-vert').classList.toggle('active', state.snapVertices);
  document.getElementById('btn-snap-grid').classList.toggle('active', state.snapGrid);
  document.getElementById('btn-weld-vert')?.classList.toggle('active', !!state.weldVertices);
  document.getElementById('btn-loupe')?.classList.toggle('active', !!state.enableLoupe);
  document.getElementById('btn-all-cal').classList.toggle('active', state.allCalGrids);
  document.getElementById('btn-wireframes').classList.toggle('active', state.showWireframes);
  document.getElementById('btn-steer-spot').classList.toggle('active', state.steerSpotMode);
  document.getElementById('btn-open-shader-drawer')?.classList.toggle('active', !!state.shaderDrawerOpen);
  document.getElementById('btn-eco-mode').classList.toggle('active', state.ecoMode);
  document.getElementById('btn-blackout').classList.toggle('active', state.blackout);

  const lockBtn = document.getElementById('btn-show-lock');
  if (lockBtn) {
    lockBtn.classList.toggle('active', !!state.showLock);
    lockBtn.innerHTML = state.showLock
      ? '🔒 Locked <span class="kbd">⇧P</span>'
      : '🔓 Setup <span class="kbd">⇧P</span>';
  }

  const resSel = document.getElementById('sel-stage-res');
  if (resSel) resSel.value = state.stageResPreset || '1920x1080';

  setSliderValue(document.getElementById('ctrl-master-opacity'), state.masterOpacity);
  document.getElementById('val-master-opacity').textContent = `${Math.round(state.masterOpacity * 100)}%`;

  if (typeof syncUndoButtonsUI === 'function') syncUndoButtonsUI();
  if (typeof syncShowRailUI === 'function') syncShowRailUI();
  if (typeof syncCueScopeButtonUI === 'function') syncCueScopeButtonUI();
  syncStageModePill();
  syncSliderAriaValuetext(document.getElementById('topbar'));
  syncSliderAriaValuetext(document.getElementById('show-rail'));
}

function syncInputPaneModeBarUI() {
  const sel = getSelectedSurface();
  const src = getSourceById(state.activeSourceId);
  const isMesh3D = !!(sel && sel.type === 'mesh3d' && (!src || src.kind !== 'mixbus'));
  const orbitActive = isMesh3D && !!state.input3DOrbitMode;

  const bar3d = document.getElementById('input-3d-bar');
  const bar2d = document.getElementById('input-2d-bar');
  const modeLbl = document.getElementById('input-pane-mode-label');
  const btnOrbit = document.getElementById('btn-input-orbit');
  const btnUv2d = document.getElementById('btn-input-uv2d');

  if (bar3d) {
    bar3d.hidden = !isMesh3D;
    bar3d.style.display = isMesh3D ? 'flex' : 'none';
  }
  if (bar2d) {
    bar2d.hidden = orbitActive;
    bar2d.style.display = orbitActive ? 'none' : 'flex';
  }
  if (modeLbl) {
    modeLbl.textContent = orbitActive ? '🧊 3D ORBIT' : '◧ INPUT UV';
  }
  if (btnOrbit) {
    btnOrbit.classList.toggle('active', !!state.input3DOrbitMode);
    btnOrbit.setAttribute('aria-pressed', String(!!state.input3DOrbitMode));
  }
  if (btnUv2d) {
    btnUv2d.classList.toggle('active', !state.input3DOrbitMode);
    btnUv2d.setAttribute('aria-pressed', String(!state.input3DOrbitMode));
  }
}

function syncMesh3DPnpStatusUI(surf) {
  if (!surf || surf.type !== 'mesh3d') return;
  const statusEl = document.getElementById('mesh3d-pnp-status');
  const listEl = document.getElementById('mesh3d-pin-list');
  const dropBtn = document.getElementById('btn-3d-drop-outlier');
  const pins = Array.isArray(surf.calibPins) ? surf.calibPins : [];
  const outW = state.stageWidth || 1920;
  const outH = state.stageHeight || 1080;
  const mats = resolveSurface3DRenderMatrices(surf, outW / Math.max(1, outH), outW, outH, state.objAssets);
  const pinErrs = Array.isArray(mats.pnp?.pinErrorsPx) ? mats.pnp.pinErrorsPx : [];

  if (dropBtn) {
    const canDrop = pins.length >= 7 && !!(mats.pnp && mats.pnp.ok) && pinErrs.length === pins.length;
    dropBtn.hidden = !canDrop;
    if (canDrop) {
      let worstIdx = 0;
      for (let i = 1; i < pinErrs.length; i++) {
        if (pinErrs[i] > pinErrs[worstIdx]) worstIdx = i;
      }
      dropBtn.textContent = `✂ Drop Worst (P${worstIdx + 1}: ${pinErrs[worstIdx].toFixed(1)}px)`;
    }
  }

  if (statusEl) {
    if (pins.length < 6) {
      statusEl.className = 'pnp-status-box';
      statusEl.textContent = `Click ${6 - pins.length} more 3D vertices in 🧊 3D Orbit (or click Auto-Seed 6 Pins) to solve physical projector pose (${pins.length}/6 pins).`;
    } else if (mats.pnp && mats.pnp.ok) {
      statusEl.className = 'pnp-status-box solved';
      statusEl.textContent =
        `✓ 6-Pt PnP Solved (${pins.length} pins) • RMS ${mats.pnp.rmsPx.toFixed(2)}px • Throw ${mats.pnp.throwRatio.toFixed(2)}:1 • Shift (${Math.round(mats.pnp.lensShiftX * 100)}%, ${Math.round(mats.pnp.lensShiftY * 100)}%)`;
    } else {
      statusEl.className = 'pnp-status-box warn';
      statusEl.textContent = `⚠ ${mats.pnp?.reason || 'Pins are nearly coplanar — spread pins across 3D depth (X, Y, and Z).'}`;
    }
  }

  if (listEl) {
    listEl.innerHTML = '';
    pins.forEach((pin, idx) => {
      if (!pin || !Array.isArray(pin.stage2d)) return;
      const li = document.createElement('li');
      li.className = 'pin-pill-item';
      li.addEventListener('pointerenter', () => { state.hoveredCalibPinIdx = idx; });
      li.addEventListener('pointerleave', () => { if (state.hoveredCalibPinIdx === idx) state.hoveredCalibPinIdx = -1; });

      const selBtn = document.createElement('button');
      const isSelPin = idx === state.selectedCalibPinIdx;
      selBtn.type = 'button';
      selBtn.className = `studio-btn mini pin-pill-sel${isSelPin ? ' active' : ''}`;
      const pxX = Math.round(pin.stage2d[0] * outW);
      const pxY = Math.round((1 - pin.stage2d[1]) * outH);
      const errPx = typeof pinErrs[idx] === 'number' ? pinErrs[idx] : null;
      let errHtml = '';
      if (errPx !== null) {
        const cls = errPx > 6.0 ? 'bad' : (errPx >= 2.0 ? 'warn' : 'good');
        const sym = errPx > 6.0 ? '!' : (errPx >= 2.0 ? '~' : '✓');
        errHtml = ` <span class="pin-err-badge ${cls}">${sym}${errPx.toFixed(1)}px</span>`;
      }
      selBtn.innerHTML = `${escapeHtml(`P${idx + 1} (${pxX},${pxY})`)}${errHtml}`;
      selBtn.addEventListener('click', () => {
        state.selectedCalibPinIdx = idx;
        state.selectedVertex = { kind: 'calib-pin', surfId: surf.id, idx };
        if (typeof pingCalibCrosshair === 'function') pingCalibCrosshair(pin.stage2d[0], pin.stage2d[1], 1800);
        if (typeof setLoupeTarget === 'function') setLoupeTarget(pin.stage2d[0], pin.stage2d[1], false, 1400);
        syncMesh3DPnpStatusUI(surf);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'studio-btn mini danger';
      delBtn.setAttribute('aria-label', `Remove Calibration Pin P${idx + 1}`);
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        if (state.showLock) { showToast('🔒 Show Lock active'); return; }
        pushUndoCheckpoint(`Remove Pin P${idx + 1}`);
        surf.calibPins.splice(idx, 1);
        state.selectedCalibPinIdx = Math.max(0, Math.min(state.selectedCalibPinIdx, surf.calibPins.length - 1));
        state.selectedVertex = null;
        bumpSurfaceGeom(surf);
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        syncMesh3DPnpStatusUI(surf);
        scheduleAutosave();
      });

      li.appendChild(selBtn);
      li.appendChild(delBtn);
      listEl.appendChild(li);
    });
  }
}

function syncInspectorUI() {
  syncInputPaneModeBarUI();
  const sel = getSelectedSurface();
  const emptyEl = document.getElementById('inspector-empty');
  const cardsEl = document.getElementById('surface-inspector-cards');
  if (!sel) {
    emptyEl.hidden = false;
    cardsEl.style.display = 'none';
    return;
  }
  emptyEl.hidden = true;
  cardsEl.style.display = 'flex';

  const zIndex = state.surfaces.findIndex(s => s.id === sel.id) + 1;
  const multiCount = state.selectedSurfaceIds?.length || 1;
  const typeDisplay = sel.type === 'mesh3d' ? '3D MESH' : sel.type.toUpperCase();
  document.getElementById('insp-id-label').textContent = multiCount > 1
    ? `#${zIndex} • ${typeDisplay} (${multiCount} sel)`
    : `#${zIndex} • ${typeDisplay}`;

  const nameInput = document.getElementById('inp-surf-name');
  if (document.activeElement !== nameInput) nameInput.value = sel.name;

  const srcSelect = document.getElementById('sel-surf-source');
  srcSelect.innerHTML = state.sources
    .map(s => `<option value="${s.id}" ${s.id === sel.sourceId ? 'selected' : ''}>${escapeHtml(s.name)}${s.offline ? ' (Offline)' : ''}</option>`)
    .join('');

  // Circle Iris & Sector Arc controls
  const circleRows = document.getElementById('rows-circle-iris');
  const isCircle = sel.type === 'circle';
  circleRows.hidden = !isCircle;
  circleRows.style.display = isCircle ? 'flex' : 'none';
  if (isCircle) {
    setSliderValue(document.getElementById('ctrl-circle-soft'), sel.circleSoftness);
    document.getElementById('val-circle-soft').textContent = `${Math.round(sel.circleSoftness * 100)}%`;
    setSliderValue(document.getElementById('ctrl-circle-inner'), sel.circleInner);
    document.getElementById('val-circle-inner').textContent = `${Math.round(sel.circleInner * 100)}%`;
    const cStart = sel.circleStartAngle ?? 0;
    const cEnd = sel.circleEndAngle ?? 360;
    setSliderValue(document.getElementById('ctrl-circle-start'), cStart);
    document.getElementById('val-circle-start').textContent = `${Math.round(cStart)}°`;
    setSliderValue(document.getElementById('ctrl-circle-end'), cEnd);
    document.getElementById('val-circle-end').textContent = `${Math.round(cEnd)}°`;
  }

  // Phase 3.2 + Milestone 1 & 2: Projective Mesh, Bezier Warping & Quad Cloner (Quad surfaces)
  const cardMesh = document.getElementById('card-mesh-warp');
  const isQuad = sel.type === 'quad';
  cardMesh.hidden = !isQuad;
  cardMesh.style.display = isQuad ? 'flex' : 'none';
  if (isQuad) {
    document.getElementById('sel-quad-warp').value = sel.quadWarp || 'perspective';
    const curved = isCurvedMeshSurface(sel);
    const subEl = document.getElementById('mesh-subdiv-controls');
    subEl.hidden = !curved;
    subEl.style.display = curved ? 'flex' : 'none';
    if (curved) {
      document.getElementById('sel-mesh-cols').value = String(sel.meshCols || 3);
      document.getElementById('sel-mesh-rows').value = String(sel.meshRows || 3);
      setSliderValue(document.getElementById('ctrl-mesh-brush'), sel.meshBrush ?? 0.22);
      document.getElementById('val-mesh-brush').textContent = `${Math.round((sel.meshBrush ?? 0.22) * 100)}%`;
      document.getElementById('btn-mesh-pin-corners')?.classList.toggle('active', !!sel.meshPinCorners);
    }
  }

  // Milestone 2: Architectural Line & Chase FX card (Line surfaces)
  const cardLine = document.getElementById('card-line-props');
  const isLine = sel.type === 'line';
  if (cardLine) {
    cardLine.hidden = !isLine;
    cardLine.style.display = isLine ? 'flex' : 'none';
    if (isLine) {
      document.getElementById('btn-line-closed').classList.toggle('active', !!sel.lineClosed);
      document.getElementById('btn-line-source').classList.toggle('active', !!sel.lineUseSource);
      document.getElementById('sel-line-chase').value = sel.lineChaseMode || 'chase';
      const lw = sel.lineWidth ?? 0.012;
      const lg = sel.lineGlow ?? 0.45;
      const ls = sel.lineSpeed ?? 0.65;
      const ld = sel.lineDuty ?? 0.32;
      const lc = sel.lineCount ?? 2;
      setSliderValue(document.getElementById('ctrl-line-width'), lw);
      document.getElementById('val-line-width').textContent = `${(lw * 100).toFixed(1)}%`;
      setSliderValue(document.getElementById('ctrl-line-glow'), lg);
      document.getElementById('val-line-glow').textContent = `${Math.round(lg * 100)}%`;
      setSliderValue(document.getElementById('ctrl-line-speed'), ls);
      document.getElementById('val-line-speed').textContent = `${Number(ls).toFixed(2)}×`;
      setSliderValue(document.getElementById('ctrl-line-duty'), ld);
      document.getElementById('val-line-duty').textContent = `${Math.round(ld * 100)}%`;
      setSliderValue(document.getElementById('ctrl-line-count'), lc);
      document.getElementById('val-line-count').textContent = String(Math.round(lc));
    }
  }

  // Phase 7A: 3D Mesh Object, 6-Point PnP Calibration & Studio Lighting Card
  const cardMesh3d = document.getElementById('card-mesh3d-props');
  const isMesh3D = sel.type === 'mesh3d';
  if (cardMesh3d) {
    cardMesh3d.hidden = !isMesh3D;
    cardMesh3d.style.display = isMesh3D ? 'flex' : 'none';
    if (isMesh3D) {
      const geom = getSurfaceMesh3DGeometry(sel, state.objAssets);
      const badgeEl = document.getElementById('mesh3d-tri-badge');
      if (badgeEl) {
        badgeEl.textContent = `${geom.triCount} tris${sel.objAssetId ? ' • OBJ' : ''}`;
      }

      const primSel = document.getElementById('sel-3d-primitive');
      if (primSel) {
        let objOpt = primSel.querySelector('option[value="obj"]');
        if (sel.objAssetId) {
          const asset = state.objAssets && state.objAssets[sel.objAssetId];
          if (!objOpt) {
            objOpt = document.createElement('option');
            objOpt.value = 'obj';
            primSel.appendChild(objOpt);
          }
          objOpt.textContent = `Custom .OBJ (${asset?.name || 'Imported'})`;
          primSel.value = 'obj';
        } else {
          if (objOpt) objOpt.remove();
          primSel.value = sel.mesh3dPrimitive || 'cube';
        }
      }

      document.getElementById('sel-3d-shade').value = sel.shade3d || 'lit_wire';
      document.getElementById('sel-3d-cull').value = sel.cull3d || 'back';

      const isCalib = sel.calibMode === 'calibrated';
      const btnManual = document.getElementById('btn-3d-calib-manual');
      const btnPnp = document.getElementById('btn-3d-calib-pnp');
      if (btnManual) {
        btnManual.classList.toggle('active', !isCalib);
        btnManual.setAttribute('aria-pressed', String(!isCalib));
      }
      if (btnPnp) {
        btnPnp.classList.toggle('active', isCalib);
        btnPnp.setAttribute('aria-pressed', String(isCalib));
      }
      const rowsManual = document.getElementById('rows-3d-manual');
      const rowsPnp = document.getElementById('rows-3d-pnp');
      if (rowsManual) {
        rowsManual.hidden = isCalib;
        rowsManual.style.display = isCalib ? 'none' : 'flex';
      }
      if (rowsPnp) {
        rowsPnp.hidden = !isCalib;
        rowsPnp.style.display = isCalib ? 'flex' : 'none';
      }

      const pos3 = Array.isArray(sel.pos3d) ? sel.pos3d : [0, 0, 0];
      const rot3 = Array.isArray(sel.rot3d) ? sel.rot3d : [18, -28, 0];
      const sclU = Array.isArray(sel.scale3d) ? (sel.scale3d[0] ?? 1) : 1;
      const cThrow = sel.camThrow ?? 1.20;
      const cDist = sel.camDist ?? 3.20;
      const sX = sel.lensShiftX ?? 0;
      const sY = sel.lensShiftY ?? 0;

      setSliderValue(document.getElementById('ctrl-3d-posx'), pos3[0]);
      document.getElementById('val-3d-posx').textContent = Number(pos3[0]).toFixed(2);
      setSliderValue(document.getElementById('ctrl-3d-posy'), pos3[1]);
      document.getElementById('val-3d-posy').textContent = Number(pos3[1]).toFixed(2);
      setSliderValue(document.getElementById('ctrl-3d-posz'), pos3[2]);
      document.getElementById('val-3d-posz').textContent = Number(pos3[2]).toFixed(2);

      setSliderValue(document.getElementById('ctrl-3d-rotx'), rot3[0]);
      document.getElementById('val-3d-rotx').textContent = `${Math.round(rot3[0])}°`;
      setSliderValue(document.getElementById('ctrl-3d-roty'), rot3[1]);
      document.getElementById('val-3d-roty').textContent = `${Math.round(rot3[1])}°`;
      setSliderValue(document.getElementById('ctrl-3d-rotz'), rot3[2]);
      document.getElementById('val-3d-rotz').textContent = `${Math.round(rot3[2])}°`;

      setSliderValue(document.getElementById('ctrl-3d-scale'), sclU);
      document.getElementById('val-3d-scale').textContent = `${Number(sclU).toFixed(2)}×`;
      setSliderValue(document.getElementById('ctrl-3d-throw'), cThrow);
      document.getElementById('val-3d-throw').textContent = `${Number(cThrow).toFixed(2)}:1`;
      setSliderValue(document.getElementById('ctrl-3d-camdist'), cDist);
      document.getElementById('val-3d-camdist').textContent = `${Number(cDist).toFixed(2)}m`;
      setSliderValue(document.getElementById('ctrl-3d-shiftx'), sX);
      document.getElementById('val-3d-shiftx').textContent = `${Math.round(sX * 100)}%`;
      setSliderValue(document.getElementById('ctrl-3d-shifty'), sY);
      document.getElementById('val-3d-shifty').textContent = `${Math.round(sY * 100)}%`;

      const ww = sel.wireWidth ?? 1.35;
      const wg = sel.wireGlow ?? 0.45;
      const wc = sel.wireChase ?? 0;
      const laz = sel.lightAzim ?? 36;
      const lel = sel.lightElev ?? 42;
      const lsp = sel.lightSpec ?? 0.42;
      setSliderValue(document.getElementById('ctrl-3d-wire-w'), ww);
      document.getElementById('val-3d-wire-w').textContent = ww <= 0.02 ? 'Off' : `${Number(ww).toFixed(2)}px`;
      setSliderValue(document.getElementById('ctrl-3d-wire-glow'), wg);
      document.getElementById('val-3d-wire-glow').textContent = `${Math.round(wg * 100)}%`;
      setSliderValue(document.getElementById('ctrl-3d-wire-chase'), wc);
      document.getElementById('val-3d-wire-chase').textContent = Math.abs(wc) <= 0.01 ? 'Off' : `${Number(wc).toFixed(2)}×`;
      const chkWireSrc = document.getElementById('chk-3d-wire-src');
      if (chkWireSrc) chkWireSrc.checked = !!sel.wireUseSource;

      setSliderValue(document.getElementById('ctrl-3d-light-az'), laz);
      document.getElementById('val-3d-light-az').textContent = `${Math.round(laz)}°`;
      setSliderValue(document.getElementById('ctrl-3d-light-el'), lel);
      document.getElementById('val-3d-light-el').textContent = `${Math.round(lel)}°`;
      setSliderValue(document.getElementById('ctrl-3d-light-spec'), lsp);
      document.getElementById('val-3d-light-spec').textContent = `${Math.round(lsp * 100)}%`;

      syncMesh3DPnpStatusUI(sel);
    }
  }

  document.getElementById('btn-geom-cal').classList.toggle('active', sel.showCalGrid);

  // Compositing, Keyer Matte, 4-Edge Feather, Blend Gamma & Black Uplift
  document.getElementById('sel-blend-mode').value = sel.blendMode || 'normal';

  const keyMode = sel.keyMode || 'off';
  const keySel = document.getElementById('sel-key-mode');
  if (keySel) keySel.value = keyMode;
  const rowsLuma = document.getElementById('rows-luma-key');
  const rowsChroma = document.getElementById('rows-chroma-key');
  if (rowsLuma) {
    const showLuma = keyMode === 'luma';
    rowsLuma.hidden = !showLuma;
    rowsLuma.style.display = showLuma ? 'flex' : 'none';
    if (showLuma) {
      const lMin = sel.lumaMin ?? 0.08;
      const lSoft = sel.lumaSoftness ?? 0.08;
      setSliderValue(document.getElementById('ctrl-luma-min'), lMin);
      document.getElementById('val-luma-min').textContent = `${Math.round(lMin * 100)}%`;
      setSliderValue(document.getElementById('ctrl-luma-soft'), lSoft);
      document.getElementById('val-luma-soft').textContent = `${Math.round(lSoft * 100)}%`;
      const chkInv = document.getElementById('chk-luma-invert');
      if (chkInv) chkInv.checked = !!sel.lumaInvert;
    }
  }
  if (rowsChroma) {
    const showChroma = keyMode === 'chroma';
    rowsChroma.hidden = !showChroma;
    rowsChroma.style.display = showChroma ? 'flex' : 'none';
    if (showChroma) {
      const cTol = sel.chromaTolerance ?? 0.28;
      const cSoft = sel.chromaSoftness ?? 0.10;
      const cSpill = sel.chromaSpill ?? 0.45;
      const pickCol = document.getElementById('pick-chroma-color');
      if (pickCol) pickCol.value = sel.chromaColor || '#00ff00';
      setSliderValue(document.getElementById('ctrl-chroma-tol'), cTol);
      document.getElementById('val-chroma-tol').textContent = `${Math.round(cTol * 100)}%`;
      setSliderValue(document.getElementById('ctrl-chroma-soft'), cSoft);
      document.getElementById('val-chroma-soft').textContent = `${Math.round(cSoft * 100)}%`;
      setSliderValue(document.getElementById('ctrl-chroma-spill'), cSpill);
      document.getElementById('val-chroma-spill').textContent = `${Math.round(cSpill * 100)}%`;
    }
  }

  setSliderValue(document.getElementById('ctrl-opacity'), sel.opacity);
  document.getElementById('val-opacity').textContent = `${Math.round(sel.opacity * 100)}%`;

  const supports4Edge = sel.type === 'quad' || sel.type === 'triangle';
  const unlinkBtn = document.getElementById('btn-feather-unlink');
  if (unlinkBtn) {
    unlinkBtn.hidden = !supports4Edge;
    unlinkBtn.classList.toggle('active', supports4Edge && sel.featherLink === false);
  }
  const fLinked = !supports4Edge || sel.featherLink !== false;
  const uniRow = document.getElementById('feather-uniform-row');
  const fourRows = document.getElementById('feather-4edge-rows');
  if (uniRow && fourRows) {
    uniRow.hidden = !fLinked;
    fourRows.hidden = fLinked;
    fourRows.style.display = fLinked ? 'none' : 'flex';
  }

  setSliderValue(document.getElementById('ctrl-feather'), sel.feather);
  document.getElementById('val-feather').textContent = `${Math.round(sel.feather * 100)}%`;

  const fL = sel.featherL ?? sel.feather;
  const fR = sel.featherR ?? sel.feather;
  const fT = sel.featherT ?? sel.feather;
  const fB = sel.featherB ?? sel.feather;
  setSliderValue(document.getElementById('ctrl-feather-l'), fL);
  document.getElementById('val-feather-l').textContent = `${Math.round(fL * 100)}%`;
  setSliderValue(document.getElementById('ctrl-feather-r'), fR);
  document.getElementById('val-feather-r').textContent = `${Math.round(fR * 100)}%`;
  setSliderValue(document.getElementById('ctrl-feather-t'), fT);
  document.getElementById('val-feather-t').textContent = `${Math.round(fT * 100)}%`;
  setSliderValue(document.getElementById('ctrl-feather-b'), fB);
  document.getElementById('val-feather-b').textContent = `${Math.round(fB * 100)}%`;

  const bGamma = sel.blendGamma ?? 1.0;
  setSliderValue(document.getElementById('ctrl-blend-gamma'), bGamma);
  document.getElementById('val-blend-gamma').textContent = bGamma.toFixed(2);

  const bBlack = sel.blackLevel ?? 0.0;
  setSliderValue(document.getElementById('ctrl-black-level'), bBlack);
  document.getElementById('val-black-level').textContent = `${(bBlack * 100).toFixed(1)}%`;

  // Grading & Expanded Color Science
  setSliderValue(document.getElementById('ctrl-brightness'), sel.brightness);
  document.getElementById('val-brightness').textContent = `${Math.round(sel.brightness * 100)}%`;
  setSliderValue(document.getElementById('ctrl-contrast'), sel.contrast);
  document.getElementById('val-contrast').textContent = sel.contrast.toFixed(2);
  setSliderValue(document.getElementById('ctrl-saturation'), sel.saturation);
  document.getElementById('val-saturation').textContent = sel.saturation.toFixed(2);
  setSliderValue(document.getElementById('ctrl-temp'), sel.colorTemp);
  document.getElementById('val-temp').textContent = `${Math.round(5100 + sel.colorTemp * 2400)}K`;

  const sGamma = sel.gamma ?? 1.0;
  const sHue = sel.hueShift ?? 0;
  const sTintAmt = sel.tintAmount ?? 0;
  setSliderValue(document.getElementById('ctrl-gamma'), sGamma);
  document.getElementById('val-gamma').textContent = sGamma.toFixed(2);
  setSliderValue(document.getElementById('ctrl-hue-shift'), sHue);
  document.getElementById('val-hue-shift').textContent = `${Math.round(sHue)}°`;
  const pickTint = document.getElementById('pick-tint-color');
  if (pickTint) pickTint.value = sel.tintColor || '#6fd3ff';
  setSliderValue(document.getElementById('ctrl-tint-amt'), sTintAmt);
  document.getElementById('val-tint-amt').textContent = `${Math.round(sTintAmt * 100)}%`;
  const selChan = document.getElementById('sel-channel-mode');
  if (selChan) selChan.value = sel.channelMode || 'rgb';
  document.getElementById('btn-invert-rgb')?.classList.toggle('active', !!sel.invertRgb);

  // Milestone 7C: Theatrical 4-Blade Framing Shutters
  const discShutters = document.getElementById('disc-framing-shutters');
  if (discShutters) {
    const shL = sel.shutterL ?? 0;
    const shR = sel.shutterR ?? 0;
    const shT = sel.shutterT ?? 0;
    const shB = sel.shutterB ?? 0;
    const shAL = sel.shutterAngL ?? 0;
    const shAR = sel.shutterAngR ?? 0;
    const shAT = sel.shutterAngT ?? 0;
    const shAB = sel.shutterAngB ?? 0;
    const shSoft = sel.shutterSoft ?? 0.015;
    setSliderValue(document.getElementById('ctrl-shutter-l'), shL);
    document.getElementById('val-shutter-l').textContent = `${Math.round(shL * 100)}%`;
    setSliderValue(document.getElementById('ctrl-shutter-ang-l'), shAL);
    document.getElementById('val-shutter-ang-l').textContent = `${Math.round(shAL)}°`;
    setSliderValue(document.getElementById('ctrl-shutter-r'), shR);
    document.getElementById('val-shutter-r').textContent = `${Math.round(shR * 100)}%`;
    setSliderValue(document.getElementById('ctrl-shutter-ang-r'), shAR);
    document.getElementById('val-shutter-ang-r').textContent = `${Math.round(shAR)}°`;
    setSliderValue(document.getElementById('ctrl-shutter-t'), shT);
    document.getElementById('val-shutter-t').textContent = `${Math.round(shT * 100)}%`;
    setSliderValue(document.getElementById('ctrl-shutter-ang-t'), shAT);
    document.getElementById('val-shutter-ang-t').textContent = `${Math.round(shAT)}°`;
    setSliderValue(document.getElementById('ctrl-shutter-b'), shB);
    document.getElementById('val-shutter-b').textContent = `${Math.round(shB * 100)}%`;
    setSliderValue(document.getElementById('ctrl-shutter-ang-b'), shAB);
    document.getElementById('val-shutter-ang-b').textContent = `${Math.round(shAB)}°`;
    setSliderValue(document.getElementById('ctrl-shutter-soft'), shSoft);
    document.getElementById('val-shutter-soft').textContent = `${(shSoft * 100).toFixed(1)}%`;
    const shBadge = document.getElementById('badge-shutter-status');
    if (shBadge) {
      const cuts = [];
      if (shL > 0.002) cuts.push(`L${Math.round(shL * 100)}`);
      if (shR > 0.002) cuts.push(`R${Math.round(shR * 100)}`);
      if (shT > 0.002) cuts.push(`T${Math.round(shT * 100)}`);
      if (shB > 0.002) cuts.push(`B${Math.round(shB * 100)}`);
      const anyCut = cuts.length > 0;
      shBadge.textContent = anyCut ? cuts.slice(0, 2).join(' ') + (cuts.length > 2 ? '+' : '') : 'Open';
      shBadge.classList.toggle('live', anyCut);
    }
    const shHandlesBtn = document.getElementById('btn-shutter-handles');
    if (shHandlesBtn) {
      shHandlesBtn.classList.toggle('active', !!state.shutterHandlesVisible);
      shHandlesBtn.setAttribute('aria-pressed', String(!!state.shutterHandlesVisible));
    }
  }

  // Milestone 2: Universal Perimeter Chase Outline FX (for non-line, non-3D surfaces)
  const cardBorder = document.getElementById('card-border-fx');
  if (cardBorder) {
    const hideBorder = isLine || isMesh3D;
    cardBorder.hidden = hideBorder;
    cardBorder.style.display = hideBorder ? 'none' : 'flex';
    if (!hideBorder) {
      const bw = sel.borderWidth ?? 0;
      const bg = sel.borderGlow ?? 0.4;
      const bs = sel.borderSpeed ?? 0.55;
      setSliderValue(document.getElementById('ctrl-border-width'), bw);
      document.getElementById('val-border-width').textContent = bw <= 0.0005 ? 'Off' : `${(bw * 100).toFixed(1)}%`;
      const extraEl = document.getElementById('border-fx-extra');
      if (extraEl) {
        const showExtra = bw > 0.0005;
        extraEl.hidden = !showExtra;
        extraEl.style.display = showExtra ? 'flex' : 'none';
      }
      document.getElementById('sel-border-chase').value = sel.borderChase || 'chase';
      setSliderValue(document.getElementById('ctrl-border-glow'), bg);
      document.getElementById('val-border-glow').textContent = `${Math.round(bg * 100)}%`;
      setSliderValue(document.getElementById('ctrl-border-speed'), bs);
      document.getElementById('val-border-speed').textContent = `${Number(bs).toFixed(2)}×`;
    }
  }

  // Milestone 3: Stackable Per-Surface GPU Post-FX Rack
  if (!Array.isArray(sel.fxChain)) sel.fxChain = [];
  refreshFxSelectDropdowns();
  renderFxChainListUI(
    document.getElementById('surf-fx-list'),
    sel.fxChain,
    `sfx_${sel.id}`,
    () => {
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      renderSurfaceList();
      syncInspectorUI();
      scheduleAutosave();
    }
  );

  syncUvSlidersFromSelected();
  syncSliderAriaValuetext(document.getElementById('insp-pane-surface'));
  if (typeof syncModulatedSliderHighlights === 'function') syncModulatedSliderHighlights();
  if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
}

function syncOutputInspectorUI() {
  const outRes = document.getElementById('sel-out-res');
  const topRes = document.getElementById('sel-stage-res');
  const preset = state.stageResPreset || '1920x1080';
  if (outRes) outRes.value = preset;
  if (topRes) topRes.value = preset;

  const customRow = document.getElementById('out-custom-res-row');
  const isCustom = preset === 'custom';
  if (customRow) {
    customRow.hidden = !isCustom;
    customRow.style.display = isCustom ? 'grid' : 'none';
  }
  const wInp = document.getElementById('inp-stage-w');
  const hInp = document.getElementById('inp-stage-h');
  if (wInp && document.activeElement !== wInp) wInp.value = String(state.stageWidth || 1920);
  if (hInp && document.activeElement !== hInp) hInp.value = String(state.stageHeight || 1080);

  const hdrBtn = document.getElementById('btn-hdr-pipeline');
  if (hdrBtn) hdrBtn.classList.toggle('active', state.hdrPipeline !== false);

  const capsEl = document.getElementById('out-gpu-caps');
  if (capsEl && typeof glCaps !== 'undefined') {
    const hdrTag = (state.hdrPipeline !== false && glCaps.supportsHalfFloatFbo)
      ? 'RGBA16F Linear HDR'
      : 'RGBA8 Standard';
    const anisoTag = glCaps.maxAniso > 1 ? `${Math.round(glCaps.maxAniso)}× Aniso Mip` : 'Trilinear Mip';
    capsEl.textContent = `Stage FBO: ${state.stageWidth}×${state.stageHeight} • ${hdrTag} • ${anisoTag}`;
  }

  const mk = state.masterKeystone || { enabled: false, editOnStage: false, lensK1: 0 };
  document.getElementById('btn-mk-enable')?.classList.toggle('active', !!mk.enabled);
  document.getElementById('btn-mk-edit-stage')?.classList.toggle('active', !!(mk.enabled && mk.editOnStage));
  setSliderValue(document.getElementById('ctrl-mk-lens'), mk.lensK1 || 0);
  const lensVal = document.getElementById('val-mk-lens');
  if (lensVal) lensVal.textContent = Number(mk.lensK1 || 0).toFixed(3);

  // Stage Reference Guide UI
  const bg = state.stageBg || { enabled: false, opacity: 0.52, img: null };
  const bgBtn = document.getElementById('btn-stage-bg-toggle');
  if (bgBtn) {
    const hasImg = !!(bg.img || bg.dataUrl);
    bgBtn.classList.toggle('active', !!(hasImg && bg.enabled));
    bgBtn.textContent = hasImg ? (bg.enabled ? '◉ Hide Ref Guide' : '○ Show Ref Guide') : 'Show Ref Guide';
  }
  const bgOp = bg.opacity ?? 0.52;
  setSliderValue(document.getElementById('ctrl-stage-bg-opacity'), bgOp);
  const bgVal = document.getElementById('val-stage-bg-opacity');
  if (bgVal) bgVal.textContent = `${Math.round(bgOp * 100)}%`;

  // Milestone 3: Master Output GPU Post-FX Rack
  if (!Array.isArray(state.masterFxChain)) state.masterFxChain = [];
  refreshFxSelectDropdowns();
  renderFxChainListUI(
    document.getElementById('master-fx-list'),
    state.masterFxChain,
    'mfx',
    () => {
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      syncOutputInspectorUI();
      scheduleAutosave();
    }
  );

  // Milestone 6A: Multi-Projector Edge Blending & Frame-Delay Routing UI
  if (typeof ensureMultiProjectorState === 'function') {
    const mp = ensureMultiProjectorState();
    const mpBadge = document.getElementById('badge-mp-status');
    if (mpBadge) {
      const planLive = !!(mp.enabled && mp.stagePlan && mp.stagePlan.enabled);
      mpBadge.textContent = mp.enabled
        ? (planLive ? `PLAN (${mp.screens.length})` : `${mp.layoutPreset.toUpperCase()} (${mp.screens.length})`)
        : 'Single';
      mpBadge.classList.toggle('live', !!mp.enabled);
    }
    document.getElementById('btn-mp-stageplan')?.classList.toggle('active', !!(mp.enabled && mp.stagePlan && mp.stagePlan.enabled));
    document.getElementById('btn-mp-enable')?.classList.toggle('active', !!mp.enabled);
    const selMpLayout = document.getElementById('sel-mp-layout');
    const presetVal = mp.layoutPreset || '2x1';
    let isCustomGridDim = false;
    if (selMpLayout) {
      const hasDirectOpt = Array.from(selMpLayout.options || []).some(o => o.value === presetVal);
      if (hasDirectOpt) {
        selMpLayout.value = presetVal;
      } else if (/^\d+x\d+$/.test(presetVal)) {
        selMpLayout.value = 'grid-custom';
        isCustomGridDim = true;
      } else {
        selMpLayout.value = 'custom';
      }
    }
    const customGridRow = document.getElementById('mp-custom-grid-row');
    if (customGridRow) {
      const showGridInputs = isCustomGridDim || (selMpLayout && selMpLayout.value === 'grid-custom');
      customGridRow.hidden = !showGridInputs;
      customGridRow.style.display = showGridInputs ? 'grid' : 'none';
      const colsInp = document.getElementById('inp-mp-cols');
      const rowsInp = document.getElementById('inp-mp-rows');
      if (colsInp && document.activeElement !== colsInp) colsInp.value = String(mp.customCols || 4);
      if (rowsInp && document.activeElement !== rowsInp) rowsInp.value = String(mp.customRows || 1);
    }

    const spec = presetVal !== 'custom' && typeof parseEdgeBlendGridSpec === 'function'
      ? parseEdgeBlendGridSpec(presetVal)
      : { cols: 2, rows: 1, stackCount: 0 };
    const isStack = !!(spec.stackCount && spec.stackCount >= 2);
    const maxOv = (spec.cols <= 2 && spec.rows <= 2 && (spec.cols === 1 || spec.rows === 1)) ? 0.95 : 0.48;
    const ovSlider = document.getElementById('ctrl-mp-overlap');
    if (ovSlider) {
      ovSlider.max = String(maxOv);
      ovSlider.disabled = isStack;
    }
    setSliderValue(ovSlider, isStack ? maxOv : Math.min(maxOv, mp.overlapPct ?? 0.15));
    const ovVal = document.getElementById('val-mp-overlap');
    if (ovVal) ovVal.textContent = isStack ? '100%' : `${Math.round((mp.overlapPct ?? 0.15) * 100)}%`;

    const delScrBtn = document.getElementById('btn-mp-del-screen');
    if (delScrBtn) delScrBtn.disabled = mp.screens.length <= 1;

    setSliderValue(document.getElementById('ctrl-mp-gamma'), mp.blendGamma ?? 2.2);
    const gmVal = document.getElementById('val-mp-gamma');
    if (gmVal) gmVal.textContent = Number(mp.blendGamma ?? 2.2).toFixed(2);

    setSliderValue(document.getElementById('ctrl-mp-black'), mp.blackOffset ?? 0);
    const blkVal = document.getElementById('val-mp-black');
    if (blkVal) blkVal.textContent = `${((mp.blackOffset ?? 0) * 100).toFixed(1)}%`;

    document.getElementById('btn-mp-stage-guides')?.classList.toggle('active', mp.showStageGuides !== false);
    document.getElementById('btn-mp-align-bars')?.classList.toggle('active', !!mp.alignmentGridOnOutput);

    const selScrEl = document.getElementById('sel-mp-screen');
    if (selScrEl) {
      selScrEl.innerHTML = '';
      for (const s of mp.screens) {
        const opt = document.createElement('option');
        opt.value = String(s.index);
        opt.textContent = `${s.name} [${Math.round(s.cropW * 100)}×${Math.round(s.cropH * 100)}%]`;
        selScrEl.appendChild(opt);
      }
      selScrEl.value = String(mp.selectedScreenIndex || 1);
    }

    const selPrevEl = document.getElementById('sel-mp-preview');
    if (selPrevEl) {
      selPrevEl.innerHTML = '';
      const fullOpt = document.createElement('option');
      fullOpt.value = '0';
      fullOpt.textContent = 'Full Canonical Stage';
      selPrevEl.appendChild(fullOpt);
      for (const s of mp.screens) {
        const opt = document.createElement('option');
        opt.value = String(s.index);
        opt.textContent = `Preview Screen ${s.index} Slice`;
        selPrevEl.appendChild(opt);
      }
      selPrevEl.value = String(mp.previewScreenIndex || 0);
    }

    const selScr = getSelectedProjectorScreen();
    if (selScr) {
      setSliderValue(document.getElementById('ctrl-mp-scr-delay'), selScr.delayMs || 0);
      const dEl = document.getElementById('val-mp-scr-delay');
      if (dEl) dEl.textContent = `${Math.round(selScr.delayMs || 0)}ms`;

      setSliderValue(document.getElementById('ctrl-mp-scr-gain'), selScr.gain ?? 1.0);
      const gEl = document.getElementById('val-mp-scr-gain');
      if (gEl) gEl.textContent = `${Math.round((selScr.gain ?? 1.0) * 100)}%`;

      setSliderValue(document.getElementById('ctrl-mp-scr-kelvin'), selScr.kelvin ?? 0);
      const kEl = document.getElementById('val-mp-scr-kelvin');
      if (kEl) kEl.textContent = `${Math.round(5100 + (selScr.kelvin ?? 0) * 2400)}K`;

      document.getElementById('btn-mp-scr-ks')?.classList.toggle('active', !!(selScr.keystone && selScr.keystone.enabled));
      document.getElementById('btn-mp-scr-ks-edit')?.classList.toggle('active', !!(selScr.keystone && selScr.keystone.enabled && selScr.keystone.editOnStage));
    }
  }

  // Milestone 6B: LED Pixel Mapper, WebSerial USB-DMX & Art-Net UI
  if (typeof ensurePixelMapperState === 'function') {
    const pm = ensurePixelMapperState();
    const collisions = typeof detectFixtureDmxCollisions === 'function'
      ? detectFixtureDmxCollisions(pm.fixtures)
      : { collisionCount: 0, universesUsed: [] };

    const dmxBadge = document.getElementById('badge-dmx-status');
    if (dmxBadge) {
      if (collisions.collisionCount > 0) {
        dmxBadge.textContent = `⚠ ${collisions.collisionCount} Clash`;
        dmxBadge.className = 'disc-badge warn';
      } else {
        dmxBadge.textContent = pm.enabled ? `${pm.fixtures.length} Live` : `${pm.fixtures.length} Fix`;
        dmxBadge.className = pm.enabled && pm.fixtures.length > 0 ? 'disc-badge live' : 'disc-badge';
      }
    }

    document.getElementById('btn-dmx-enable')?.classList.toggle('active', !!pm.enabled);
    document.getElementById('btn-dmx-edit-stage')?.classList.toggle('active', !!(pm.enabled && pm.editOnStage));

    const fixEditor = document.getElementById('dmx-fixture-editor');
    const selFix = getSelectedDmxFixture();
    if (fixEditor) {
      const hasFix = pm.fixtures.length > 0 && !!selFix;
      fixEditor.hidden = !hasFix;
      fixEditor.style.display = hasFix ? 'flex' : 'none';
      if (hasFix) {
        const selFixEl = document.getElementById('sel-dmx-fixture');
        if (selFixEl) {
          selFixEl.innerHTML = '';
          for (const f of pm.fixtures) {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = `${f.name} (U${f.universe}:${f.startChannel})`;
            selFixEl.appendChild(opt);
          }
          selFixEl.value = selFix.id;
        }
        const nameInp = document.getElementById('inp-dmx-name');
        if (nameInp && document.activeElement !== nameInp) nameInp.value = selFix.name;
        const uniInp = document.getElementById('inp-dmx-uni');
        if (uniInp && document.activeElement !== uniInp) uniInp.value = String(selFix.universe);
        const chInp = document.getElementById('inp-dmx-ch');
        if (chInp && document.activeElement !== chInp) chInp.value = String(selFix.startChannel);
        const ordSel = document.getElementById('sel-dmx-order');
        if (ordSel) ordSel.value = selFix.colorOrder || 'RGB';

        const isMat = selFix.type === 'matrix';
        const rowPix = document.getElementById('dmx-row-pixels');
        const rowMat = document.getElementById('dmx-row-matrix');
        if (rowPix) { rowPix.hidden = isMat; rowPix.style.display = isMat ? 'none' : 'grid'; }
        if (rowMat) { rowMat.hidden = !isMat; rowMat.style.display = isMat ? 'flex' : 'none'; }
        if (isMat) {
          const cInp = document.getElementById('inp-dmx-cols');
          const rInp = document.getElementById('inp-dmx-rows');
          const sChk = document.getElementById('chk-dmx-serp');
          if (cInp && document.activeElement !== cInp) cInp.value = String(selFix.cols || 16);
          if (rInp && document.activeElement !== rInp) rInp.value = String(selFix.rows || 8);
          if (sChk) sChk.checked = selFix.serpentine !== false;
        } else {
          const pInp = document.getElementById('inp-dmx-pixels');
          if (pInp && document.activeElement !== pInp) pInp.value = String(selFix.pixelCount || 32);
        }

        const spanInfo = computeFixtureEndPatch(selFix);
        const patchEl = document.getElementById('dmx-patch-badge');
        if (patchEl) {
          const warnTxt = collisions.collisionCount > 0 ? ` • ⚠ ${collisions.collisionCount} Ch Clash!` : ' • ✓ Clean';
          patchEl.textContent = `U${selFix.universe}:${selFix.startChannel} → U${spanInfo.endUniverse}:${spanInfo.endChannel} (${spanInfo.totalChannels}ch)${warnTxt}`;
          patchEl.style.color = collisions.collisionCount > 0 ? '#ff8fa2' : 'var(--emerald)';
        }
      }
    }

    setSliderValue(document.getElementById('ctrl-dmx-dimmer'), pm.masterDimmer ?? 1.0);
    const dimEl = document.getElementById('val-dmx-dimmer');
    if (dimEl) dimEl.textContent = `${Math.round((pm.masterDimmer ?? 1.0) * 100)}%`;

    setSliderValue(document.getElementById('ctrl-dmx-gamma'), pm.ledGamma ?? 2.2);
    const lgEl = document.getElementById('val-dmx-gamma');
    if (lgEl) lgEl.textContent = Number(pm.ledGamma ?? 2.2).toFixed(2);

    const usbProtoEl = document.getElementById('sel-dmx-usb-proto');
    if (usbProtoEl) usbProtoEl.value = pm.usbProtocol || 'enttec-pro';
    const usbUniEl = document.getElementById('inp-dmx-usb-uni');
    if (usbUniEl && document.activeElement !== usbUniEl) usbUniEl.value = String(pm.usbUniverse || 0);

    const usbBtn = document.getElementById('btn-dmx-usb-connect');
    if (usbBtn) {
      usbBtn.classList.toggle('active', !!pm.usbConnected);
      usbBtn.textContent = pm.usbConnected ? '🔌 Disconnect USB' : '🔌 Connect USB-DMX';
    }
    const artBtn = document.getElementById('btn-dmx-artnet');
    if (artBtn) {
      artBtn.classList.toggle('active', !!pm.artNetEnabled);
    }
    const usbStat = document.getElementById('dmx-usb-status');
    if (usbStat) usbStat.textContent = pm.usbStatus || 'USB-DMX Idle';

    if (typeof renderDmxMonitorCanvas === 'function') renderDmxMonitorCanvas();
  }

  const outLockBtn = document.getElementById('btn-out-show-lock');
  if (outLockBtn) {
    outLockBtn.classList.toggle('active', !!state.showLock);
    outLockBtn.textContent = state.showLock
      ? '🔒 Show Lock ARMED — Click or Shift+P to Unlock'
      : '🔓 Arm Show Lock [Shift+P]';
  }
  syncSliderAriaValuetext(document.getElementById('insp-pane-output'));
  if (typeof syncModulatedSliderHighlights === 'function') syncModulatedSliderHighlights();
  if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
}

function syncUvSlidersFromSelected() {
  const sel = getSelectedSurface();
  if (!sel) return;
  const rectInsp = document.getElementById('uv-rect-inspector');
  const triInsp = document.getElementById('uv-tri-inspector');
  const polyInsp = document.getElementById('uv-poly-inspector');
  const lineInsp = document.getElementById('uv-line-inspector');

  const setVis = (el, show) => {
    if (!el) return;
    el.hidden = !show;
    el.style.display = show ? 'flex' : 'none';
  };

  if (sel.type === 'triangle') {
    setVis(rectInsp, false);
    setVis(triInsp, true);
    setVis(polyInsp, false);
    setVis(lineInsp, false);
    const [a, b, c] = sel.triUvs;
    document.getElementById('tri-uv-readout').textContent =
      `A(${a[0].toFixed(2)},${a[1].toFixed(2)}) B(${b[0].toFixed(2)},${b[1].toFixed(2)}) C(${c[0].toFixed(2)},${c[1].toFixed(2)})`;
  } else if (sel.type === 'polygon') {
    setVis(rectInsp, false);
    setVis(triInsp, false);
    setVis(polyInsp, true);
    setVis(lineInsp, false);
    ensurePolygonUvs(sel);
    const readout = document.getElementById('poly-uv-readout');
    if (readout) {
      readout.textContent = `${sel.polyUvs.length} UV vertices mapped (P1..P${sel.polyUvs.length})`;
    }
  } else if (sel.type === 'line' && !sel.lineUseSource) {
    setVis(rectInsp, false);
    setVis(triInsp, false);
    setVis(polyInsp, false);
    setVis(lineInsp, true);
  } else {
    setVis(rectInsp, true);
    setVis(triInsp, false);
    setVis(polyInsp, false);
    setVis(lineInsp, false);

    setSliderValue(document.getElementById('ctrl-uv-x'), sel.uvX);
    document.getElementById('val-uv-x').textContent = sel.uvX.toFixed(2);
    setSliderValue(document.getElementById('ctrl-uv-y'), sel.uvY);
    document.getElementById('val-uv-y').textContent = sel.uvY.toFixed(2);
    setSliderValue(document.getElementById('ctrl-uv-w'), sel.uvW);
    document.getElementById('val-uv-w').textContent = `${Math.round(sel.uvW * 100)}%`;
    setSliderValue(document.getElementById('ctrl-uv-h'), sel.uvH);
    document.getElementById('val-uv-h').textContent = `${Math.round(sel.uvH * 100)}%`;
    setSliderValue(document.getElementById('ctrl-uv-rot'), sel.uvRot);
    document.getElementById('val-uv-rot').textContent = `${sel.uvRot.toFixed(1)}°`;

    setSliderValue(document.getElementById('ctrl-crop-l'), sel.cropL);
    document.getElementById('val-crop-l').textContent = `${Math.round(sel.cropL * 100)}%`;
    setSliderValue(document.getElementById('ctrl-crop-r'), sel.cropR);
    document.getElementById('val-crop-r').textContent = `${Math.round(sel.cropR * 100)}%`;
    setSliderValue(document.getElementById('ctrl-crop-t'), sel.cropT);
    document.getElementById('val-crop-t').textContent = `${Math.round(sel.cropT * 100)}%`;
    setSliderValue(document.getElementById('ctrl-crop-b'), sel.cropB);
    document.getElementById('val-crop-b').textContent = `${Math.round(sel.cropB * 100)}%`;
  }
}

function syncMaskTargetDropdown() {
  const selTarget = document.getElementById('sel-mask-target');
  if (!selTarget) return;
  const curMask = getSelectedMask();
  const curVal = curMask ? curMask.target : 'all';
  let html = `<option value="all" ${curVal === 'all' ? 'selected' : ''}>All Stage Layers (Master)</option>`;
  for (const s of state.surfaces) {
    html += `<option value="${s.id}" ${curVal === s.id ? 'selected' : ''}>Surface: ${escapeHtml(s.name)}</option>`;
  }
  selTarget.innerHTML = html;
}

function syncMaskInspectorUI() {
  const mask = getSelectedMask();
  const emptyEl = document.getElementById('mask-inspector-empty');
  const cardsEl = document.getElementById('mask-inspector-cards');
  if (!mask) {
    emptyEl.hidden = false;
    cardsEl.hidden = true;
    cardsEl.style.display = 'none';
    return;
  }
  emptyEl.hidden = true;
  cardsEl.hidden = false;
  cardsEl.style.display = 'flex';

  const smoothCnt = mask.smoothAll
    ? mask.points.length
    : (Array.isArray(mask.curveFlags) ? mask.curveFlags.filter(Boolean).length : 0);
  document.getElementById('mask-pts-count').textContent =
    `${mask.points.length} pts${smoothCnt > 0 ? ` • ${smoothCnt} smooth` : ''}`;
  const nameInp = document.getElementById('inp-mask-name');
  if (document.activeElement !== nameInp) nameInp.value = mask.name;

  document.getElementById('sel-mask-mode').value = mask.mode;
  syncMaskTargetDropdown();
  document.getElementById('sel-mask-target').value = mask.target;

  setSliderValue(document.getElementById('ctrl-mask-feather'), mask.feather);
  document.getElementById('val-mask-feather').textContent = `${(mask.feather * 100).toFixed(1)}%`;
  const choke = mask.choke ?? 0;
  setSliderValue(document.getElementById('ctrl-mask-choke'), choke);
  document.getElementById('val-mask-choke').textContent = `${choke >= 0 ? '+' : ''}${(choke * 100).toFixed(1)}%`;
  setSliderValue(document.getElementById('ctrl-mask-opacity'), mask.opacity);
  document.getElementById('val-mask-opacity').textContent = `${Math.round(mask.opacity * 100)}%`;
  const tension = mask.curveTension ?? 0.5;
  setSliderValue(document.getElementById('ctrl-mask-tension'), tension);
  document.getElementById('val-mask-tension').textContent = `${Math.round(tension * 100)}%`;
  document.getElementById('btn-mask-smooth')?.classList.toggle('active', !!mask.smoothAll);
  document.getElementById('btn-mask-invert').classList.toggle('active', !!mask.invert);
  const maskStageBtn = document.getElementById('btn-mask-edit-stage');
  if (maskStageBtn) {
    const activeStage = typeof isMaskStageEditActive === 'function' ? isMaskStageEditActive() : (state.leftTab === 'masks');
    maskStageBtn.classList.toggle('active', activeStage);
    maskStageBtn.setAttribute('aria-pressed', String(activeStage));
  }
  syncSliderAriaValuetext(document.getElementById('insp-pane-mask'));
  if (typeof syncModulatedSliderHighlights === 'function') syncModulatedSliderHighlights();
  if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
}

function syncFollowspotInspectorUI() {
  const selBar = document.getElementById('insp-spot-selector-bar');
  const hasLiveSpots = Array.isArray(state.spots) && state.spots.length > 0;
  if (selBar) {
    if (!hasLiveSpots) {
      selBar.innerHTML = `
        <div class="world-card" style="text-align:center;padding:8px;margin-bottom:6px;">
          <div class="mono-dim" style="margin-bottom:6px;">No active spotlights — stage output is clean.</div>
          <button type="button" class="btn warm" id="btn-insp-empty-add-spot">+ Add Spotlight</button>
        </div>
      `;
      selBar.querySelector('#btn-insp-empty-add-spot')?.addEventListener('click', () => {
        if (typeof addSpotInstance === 'function') addSpotInstance();
        syncFollowspotInspectorUI();
      });
    } else {
      const actIdx = clamp(state.activeSpotIndex || 0, 0, state.spots.length - 1);
      const actSp = state.spots[actIdx];
      const isEn = actSp && actSp.enabled !== false;
      selBar.innerHTML = `
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
          ${state.spots.map((s, idx) => `<button type="button" class="btn ${idx === actIdx ? 'primary active' : ''} insp-sp-pick" data-idx="${idx}" style="padding:2px 6px;font-size:9px;">${escapeHtml(s.name)}${s.enabled === false ? ' (Off)' : ''}</button>`).join('')}
          <button type="button" class="btn warm" id="btn-insp-add-spot" style="padding:2px 6px;font-size:9px;">+ Spot</button>
          <div style="flex:1;"></div>
          <button type="button" class="btn ${isEn ? 'warm active' : ''}" id="btn-insp-toggle-spot" style="padding:2px 6px;font-size:9px;" title="Enable or Disable Selected Spotlight">${isEn ? 'ON' : 'OFF'}</button>
          <button type="button" class="btn danger" id="btn-insp-del-spot" style="padding:2px 6px;font-size:9px;" title="Delete Selected Spotlight">✕</button>
        </div>
      `;
      selBar.querySelectorAll('.insp-sp-pick').forEach(b => {
        b.addEventListener('click', () => {
          const i = Number(b.dataset.idx) || 0;
          state.activeSpotIndex = i;
          const s = state.spots[i];
          if (s && typeof setActiveSelection === 'function') setActiveSelection('spot', s.id, s.name);
          syncFollowspotInspectorUI();
        });
      });
      selBar.querySelector('#btn-insp-add-spot')?.addEventListener('click', () => {
        if (typeof addSpotInstance === 'function') addSpotInstance();
        syncFollowspotInspectorUI();
      });
      selBar.querySelector('#btn-insp-toggle-spot')?.addEventListener('click', () => {
        if (actSp && typeof toggleSpotEnabled === 'function') toggleSpotEnabled(actSp.id);
        syncFollowspotInspectorUI();
      });
      selBar.querySelector('#btn-insp-del-spot')?.addEventListener('click', () => {
        if (actSp && typeof removeSpotById === 'function') removeSpotById(actSp.id);
        syncFollowspotInspectorUI();
      });
    }
  }

  const fs = typeof getActiveLiveSpot === 'function'
    ? (getActiveLiveSpot() || (hasLiveSpots ? state.spots[0] : state._detachedFallbackSpot))
    : state.followspot;
  if (!fs) return;
  const selModeEl = document.getElementById('sel-spot-mode');
  if (selModeEl) {
    selModeEl.value = fs.mode || 'off';
    if (!selModeEl.value) selModeEl.value = fs.mode === 'beam' ? 'additive' : 'off';
  }
  const steerBtn = document.getElementById('btn-insp-steer-spot');
  if (steerBtn) {
    const tpOn = !!(hasLiveSpots && state.trackpadSpotTarget && state.trackpadSpotTarget === fs.id && fs.enabled !== false);
    steerBtn.classList.toggle('active', tpOn || !!state.steerSpotMode);
    steerBtn.textContent = tpOn ? `🖱 ${fs.name} [\`]` : '🎯 Steer [`]';
  }

  const selContent = document.getElementById('sel-spot-content');
  if (selContent) {
    const srcOpts = (state.sources || [])
      .filter(s => s && s.id !== 'src_mixbus')
      .map(s => `<option value="${escapeHtml(s.id)}">🎬 ${escapeHtml(s.name)}</option>`)
      .join('');
    selContent.innerHTML =
      `<option value="__pure_light__">💡 Pure Planckian Light</option>` +
      `<option value="__nebula__">☁ Cosmic Nebula</option>` +
      `<option value="bus:orbital">◎ Orbital Mix Bus</option>` +
      srcOpts;
    selContent.value = fs.contentSrc || '__nebula__';
    if (!selContent.value) selContent.value = '__nebula__';
  }
  const selFit = document.getElementById('sel-spot-fit');
  if (selFit) selFit.value = fs.mediaFit || 'beam';

  const selGobo = document.getElementById('sel-spot-gobo');
  if (selGobo) {
    const goboOpts = (state.sources || [])
      .filter(s => s && s.id !== 'src_mixbus')
      .map(s => `<option value="${escapeHtml(s.id)}">☸ ${escapeHtml(s.name)}</option>`)
      .join('');
    selGobo.innerHTML = `<option value="">— Open Aperture —</option><option value="bus:orbital">◎ Orbital Mix Bus</option>${goboOpts}`;
    selGobo.value = fs.goboSrc || '';
  }

  const edgeV = fs.edge ?? 0.28;
  setSliderValue(document.getElementById('ctrl-spot-edge'), edgeV);
  const edgeValEl = document.getElementById('val-spot-edge');
  if (edgeValEl) edgeValEl.textContent = Number(edgeV).toFixed(2);

  const fbmV = fs.fbmAmt ?? 1.0;
  setSliderValue(document.getElementById('ctrl-spot-fbm'), fbmV);
  const fbmValEl = document.getElementById('val-spot-fbm');
  if (fbmValEl) fbmValEl.textContent = `${Math.round(Number(fbmV) * 100)}%`;

  const spinV = fs.goboSpin ?? 0;
  setSliderValue(document.getElementById('ctrl-spot-gobo-spin'), spinV);
  const spinValEl = document.getElementById('val-spot-gobo-spin');
  if (spinValEl) spinValEl.textContent = Number(spinV).toFixed(2);

  setSliderValue(document.getElementById('ctrl-spot-radius'), fs.radius);
  document.getElementById('val-spot-radius').textContent = fs.radius.toFixed(2);
  setSliderValue(document.getElementById('ctrl-spot-soft'), fs.softness);
  document.getElementById('val-spot-soft').textContent = fs.softness.toFixed(2);
  setSliderValue(document.getElementById('ctrl-spot-gain'), fs.gain);
  document.getElementById('val-spot-gain').textContent = fs.gain.toFixed(2);
  setSliderValue(document.getElementById('ctrl-spot-ambient'), fs.ambient);
  document.getElementById('val-spot-ambient').textContent = `${Math.round(fs.ambient * 100)}%`;

  setSliderValue(document.getElementById('ctrl-spot-sx'), fs.stretchX);
  document.getElementById('val-spot-sx').textContent = `${fs.stretchX.toFixed(2)}×`;
  setSliderValue(document.getElementById('ctrl-spot-sy'), fs.stretchY);
  document.getElementById('val-spot-sy').textContent = `${fs.stretchY.toFixed(2)}×`;
  setSliderValue(document.getElementById('ctrl-spot-rot'), fs.rotation);
  document.getElementById('val-spot-rot').textContent = `${Math.round(fs.rotation)}°`;

  setSliderValue(document.getElementById('ctrl-spot-morph'), fs.morph);
  const morphNames = ['Circle', 'Diamond', 'Star', 'Living'];
  const mIdx = Math.min(3, Math.round(fs.morph));
  document.getElementById('val-spot-morph').textContent = morphNames[mIdx];

  setSliderValue(document.getElementById('ctrl-spot-inertia'), fs.inertia);
  document.getElementById('val-spot-inertia').textContent = fs.inertia.toFixed(2);

  setSliderValue(document.getElementById('ctrl-spot-sdepth'), fs.shadowDepth);
  document.getElementById('val-spot-sdepth').textContent = fs.shadowDepth.toFixed(2);
  setSliderValue(document.getElementById('ctrl-spot-stex'), fs.shadowTex);
  document.getElementById('val-spot-stex').textContent = fs.shadowTex.toFixed(2);
  setSliderValue(document.getElementById('ctrl-spot-srnd'), fs.shadowRnd);
  document.getElementById('val-spot-srnd').textContent = fs.shadowRnd.toFixed(2);
  setSliderValue(document.getElementById('ctrl-spot-sspeed'), fs.shadowSpeed);
  document.getElementById('val-spot-sspeed').textContent = fs.shadowSpeed.toFixed(2);

  document.getElementById('pick-spot-a').value = fs.colA;
  document.getElementById('pick-spot-b').value = fs.colB;
  document.getElementById('pick-spot-c').value = fs.colC;

  setSliderValue(document.getElementById('ctrl-spot-temp'), fs.temp);
  document.getElementById('val-spot-temp').textContent = `${Math.round(5100 + fs.temp * 2400)}K`;

  const chkConv = document.getElementById('chk-spot-converge3d');
  if (chkConv) chkConv.checked = !!fs.converge3D;
  const chkSpill = document.getElementById('chk-spot-mask-spill');
  if (chkSpill) chkSpill.checked = !!fs.maskBgSpill;
  const pDepth = fs.performerDepthM ?? 1.20;
  const pHeight = fs.performerHeightM ?? 1.75;
  const pRad = fs.performerRadiusM ?? 0.45;
  setSliderValue(document.getElementById('ctrl-spot-perf-depth'), pDepth);
  const pdEl = document.getElementById('val-spot-perf-depth');
  if (pdEl) pdEl.textContent = `${Number(pDepth).toFixed(2)}m`;
  setSliderValue(document.getElementById('ctrl-spot-perf-height'), pHeight);
  const phEl = document.getElementById('val-spot-perf-height');
  if (phEl) phEl.textContent = `${Number(pHeight).toFixed(2)}m`;
  setSliderValue(document.getElementById('ctrl-spot-perf-radius'), pRad);
  const prEl = document.getElementById('val-spot-perf-radius');
  if (prEl) prEl.textContent = `${Number(pRad).toFixed(2)}m`;

  syncSliderAriaValuetext(document.getElementById('insp-pane-spot'));
  if (typeof syncModulatedSliderHighlights === 'function') syncModulatedSliderHighlights();
  if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
}

function syncTransportUI() {
  syncInputPaneModeBarUI();
  const src = getSourceById(state.activeSourceId);
  if (!src) return;

  document.getElementById('input-source-title').textContent = src.name;
  document.getElementById('transport-source-badge').textContent = `▸ ${src.name}`;

  const vidSec = document.getElementById('video-transport');
  const shdSec = document.getElementById('shader-transport');
  const isfSec = document.getElementById('isf-transport');
  const mixSec = document.getElementById('mixbus-transport');
  const txtSec = document.getElementById('text-transport');
  const liveSec = document.getElementById('live-transport');
  vidSec.classList.add('hidden');
  shdSec.classList.add('hidden');
  isfSec?.classList.add('hidden');
  mixSec?.classList.add('hidden');
  txtSec?.classList.add('hidden');
  liveSec.classList.add('hidden');

  if (src.kind === 'video' && !src.offline) {
    vidSec.classList.remove('hidden');
    initProVideoProps(src);
    document.getElementById('btn-vid-play').textContent = src.playing ? '⏸ Pause' : '▶ Play';
    document.getElementById('sel-vid-loop').value = src.loopMode;
    setSliderValue(document.getElementById('ctrl-vid-in'), src.trimIn ?? 0);
    document.getElementById('val-vid-in').textContent = `${Math.round((src.trimIn ?? 0) * 100)}%`;
    setSliderValue(document.getElementById('ctrl-vid-out'), src.trimOut ?? 1);
    document.getElementById('val-vid-out').textContent = `${Math.round((src.trimOut ?? 1) * 100)}%`;
    document.getElementById('btn-vid-xfade-loop')?.classList.toggle('active', !!src.seamlessLoop);
    document.getElementById('btn-vid-bpm-sync')?.classList.toggle('active', !!src.bpmSync);
    const bpmWrap = document.getElementById('vid-bpm-wrap');
    if (bpmWrap) bpmWrap.hidden = !src.bpmSync;
    const bpmInp = document.getElementById('inp-vid-bpm');
    if (bpmInp && document.activeElement !== bpmInp) {
      bpmInp.value = String(Math.round(src.targetBpm || 120));
    }
    setSliderValue(document.getElementById('ctrl-vid-rate'), src.rate);
    document.getElementById('val-vid-rate').textContent = `${src.rate.toFixed(2)}×`;
    document.getElementById('btn-vid-mute').textContent = src.muted ? '🔇' : '🔊';
    setSliderValue(document.getElementById('ctrl-vid-vol'), src.volume);
    renderVideoWaveformCanvas(src);
  } else if (src.kind === 'shader') {
    shdSec.classList.remove('hidden');
    document.getElementById('btn-shd-play').textContent = src.playing ? '⏸ Flow' : '▶ Flow';
    document.getElementById('sel-shd-palette').value = String(src.palette);
    setSliderValue(document.getElementById('ctrl-shd-speed'), src.speed);
    document.getElementById('val-shd-speed').textContent = src.speed.toFixed(2);
    setSliderValue(document.getElementById('ctrl-shd-scale'), src.scale);
    document.getElementById('val-shd-scale').textContent = src.scale.toFixed(2);
    setSliderValue(document.getElementById('ctrl-shd-detail'), src.detail);
    document.getElementById('val-shd-detail').textContent = src.detail.toFixed(2);
    setSliderValue(document.getElementById('ctrl-shd-temp'), src.temp);

    const macro1Map = {
      testcard: 'Grid',
      gridscan: 'Pitch',
      caustics: 'Cells',
      liquid: 'Zoom',
      strobegeo: 'Rings',
      gradient: 'Spread',
      videolight: 'Gobo'
    };
    const macro2Map = {
      shards: 'Aggr',
      gridscan: 'Beam',
      caustics: 'Focus',
      liquid: 'Swirl',
      strobegeo: 'Duty',
      gradient: 'Angle',
      videolight: 'Frost'
    };
    document.getElementById('lbl-shd-macro1').textContent = macro1Map[src.shaderKind] || 'Scale';
    document.getElementById('lbl-shd-macro2').textContent = macro2Map[src.shaderKind] || 'Turb';
  } else if (src.kind === 'isf' && isfSec) {
    isfSec.classList.remove('hidden');
    document.getElementById('btn-isf-play').textContent = src.playing ? '⏸ Flow' : '▶ Flow';
    const spd = src.speed ?? 1.0;
    setSliderValue(document.getElementById('ctrl-isf-speed'), spd);
    document.getElementById('val-isf-speed').textContent = `${Number(spd).toFixed(2)}×`;
    document.getElementById('btn-isf-mirror')?.classList.toggle('active', !!src.mirrorX);
  } else if (src.kind === 'mixbus' && mixSec) {
    mixSec.classList.remove('hidden');
    document.getElementById('btn-mixbus-mode')?.classList.toggle('active', src.editOrbsMode !== false);
    document.getElementById('sel-mixbus-blend').value = src.blendMode || 'screen';
    const orbit = src.autoOrbit ?? 0;
    const curve = src.falloffCurve ?? 1.35;
    setSliderValue(document.getElementById('ctrl-mixbus-orbit'), orbit);
    document.getElementById('val-mixbus-orbit').textContent = Number(orbit).toFixed(2);
    setSliderValue(document.getElementById('ctrl-mixbus-curve'), curve);
    document.getElementById('val-mixbus-curve').textContent = Number(curve).toFixed(2);

    const orbSelEl = document.getElementById('sel-mixbus-orb-src');
    const selOrb = (src.orbs || []).find(o => o.id === src.selectedOrbId) || (src.orbs || [])[0] || null;
    if (selOrb && src.selectedOrbId !== selOrb.id) src.selectedOrbId = selOrb.id;
    if (orbSelEl) {
      const eligible = state.sources.filter(s => s.id !== src.id && s.kind !== 'mixbus');
      orbSelEl.innerHTML = eligible
        .map(s => `<option value="${s.id}" ${selOrb && s.id === selOrb.sourceId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
        .join('');
    }
    const muteBtn = document.getElementById('btn-mixbus-mute-orb');
    if (muteBtn) {
      muteBtn.classList.toggle('active', !!(selOrb && selOrb.muted));
      muteBtn.textContent = (selOrb && selOrb.muted) ? '🔇 Muted' : 'Mute';
    }
  } else if (src.kind === 'text' && txtSec) {
    txtSec.classList.remove('hidden');
    document.getElementById('btn-txt-play').textContent = src.playing !== false ? '⏸ Motion' : '▶ Motion';
    const quickInp = document.getElementById('inp-txt-quick');
    if (quickInp && document.activeElement !== quickInp) {
      quickInp.value = String(src.text ?? '').replace(/\r?\n/g, ' ↵ ');
    }
    document.getElementById('sel-txt-anim').value = src.animMode || 'static';
    const fSize = Math.round(src.fontSize ?? 136);
    setSliderValue(document.getElementById('ctrl-txt-size'), fSize);
    document.getElementById('val-txt-size').textContent = String(fSize);
    document.getElementById('pick-txt-fg').value = src.fgColor || '#ffffff';
    const bgA = Number(src.bgOpacity ?? 0);
    setSliderValue(document.getElementById('ctrl-txt-bg-alpha'), bgA);
    document.getElementById('val-txt-bg-alpha').textContent = `${Math.round(bgA * 100)}%`;
    document.getElementById('btn-txt-mirror')?.classList.toggle('active', !!src.mirrorX);
  } else {
    liveSec.classList.remove('hidden');
    const camWrap = document.getElementById('cam-device-wrap');
    const statusText = document.getElementById('live-status-text');
    const btnMirror = document.getElementById('btn-cam-mirror');
    const btnRelinkOne = document.getElementById('btn-relink-single');
    const btnRecapSyphon = document.getElementById('btn-recapture-window');

    btnMirror.classList.toggle('active', !!src.mirrorX);
    btnRelinkOne.hidden = !src.offline;
    if (btnRecapSyphon) btnRecapSyphon.hidden = src.kind !== 'syphon';

    if (src.offline) {
      camWrap.style.display = 'none';
      statusText.textContent = `Offline File: ${src.fileName || src.name}`;
      statusText.style.color = '#ff8fa2';
    } else if (src.kind === 'syphon') {
      camWrap.style.display = 'none';
      if (src.streamEnded) {
        statusText.textContent = '🖥 Capture Stopped — Click ↻ Re-Capture Window…';
        statusText.style.color = 'var(--warm)';
      } else {
        statusText.textContent = `🖥 Screen capture live • ${src.width}×${src.height}`;
        statusText.style.color = 'var(--brand-color)';
      }
    } else if (src.kind === 'live') {
      camWrap.style.display = 'inline-flex';
      statusText.textContent = `Live Stream • ${src.width}×${src.height}`;
      statusText.style.color = 'var(--text-muted)';
      refreshCameraDeviceDropdown(src.deviceId);
    } else {
      camWrap.style.display = 'none';
      statusText.textContent = `Still Image • ${src.width}×${src.height} RGBA`;
      statusText.style.color = 'var(--text-muted)';
    }
  }
  syncSliderAriaValuetext(document.getElementById('transport-bar'));
}

async function refreshCameraDeviceDropdown(selectedId) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    const selEl = document.getElementById('sel-cam-device');
    selEl.innerHTML = cams.map((c, idx) =>
      `<option value="${c.deviceId}" ${c.deviceId === selectedId ? 'selected' : ''}>${escapeHtml(c.label || `Video Input ${idx + 1}`)}</option>`
    ).join('');
  } catch (_) {}
}

// ============================================================================
// 3. MILESTONE 3: STACKABLE GPU POST-FX RACK & LIVE ISF SHADER STUDIO UI
// ============================================================================

function refreshFxSelectDropdowns() {
  const defs = typeof getAllFxDefinitions === 'function' ? getAllFxDefinitions() : [];
  for (const selId of ['sel-add-surf-fx', 'sel-add-master-fx']) {
    const el = document.getElementById(selId);
    if (!el) continue;
    const prev = el.value;
    el.innerHTML = defs.map(d =>
      `<option value="${escapeHtml(d.type)}">${escapeHtml(d.isCustomIsf ? `🔌 ${d.name}` : d.name)}</option>`
    ).join('');
    if (prev && defs.some(d => d.type === prev)) {
      el.value = prev;
    }
  }
}

function renderFxChainListUI(containerEl, chainArray, idPrefix, onMutate) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  if (!Array.isArray(chainArray) || chainArray.length === 0) {
    containerEl.innerHTML = `<div class="fx-rack-empty">No active GPU Post-FX — choose an effect above and click + Add FX.</div>`;
    return;
  }

  chainArray.forEach((fx, idx) => {
    const def = typeof getFxDefinition === 'function' ? getFxDefinition(fx.type) : null;
    const card = document.createElement('div');
    card.className = 'fx-rack-card' + (fx.enabled === false ? ' fx-bypassed' : '');

    const head = document.createElement('div');
    head.className = 'fx-card-head';
    head.innerHTML = `
      <button type="button" class="icon-btn ${fx.enabled !== false ? 'on-cal' : 'off-vis'}" data-fxact="toggle" aria-label="Bypass Effect">${fx.enabled !== false ? '●' : '○'}</button>
      <button type="button" class="icon-btn" data-fxact="collapse" aria-label="Collapse Effect">${fx.collapsed ? '▸' : '▾'}</button>
      <span class="fx-card-title">${idx + 1}. ${escapeHtml(def ? def.name : fx.type)}</span>
      <button type="button" class="icon-btn" data-fxact="up" aria-label="Move Effect Up" ${idx === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="icon-btn" data-fxact="down" aria-label="Move Effect Down" ${idx === chainArray.length - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="icon-btn" data-fxact="del" aria-label="Remove Effect">✕</button>
    `;

    head.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-fxact]');
      if (!btn) return;
      const act = btn.dataset.fxact;
      if (act === 'collapse') {
        fx.collapsed = !fx.collapsed;
        renderFxChainListUI(containerEl, chainArray, idPrefix, onMutate);
        return;
      }
      pushUndoCheckpoint(`FX Rack ${act}`);
      if (act === 'toggle') {
        fx.enabled = !(fx.enabled !== false);
      } else if (act === 'up' && idx > 0) {
        const [item] = chainArray.splice(idx, 1);
        chainArray.splice(idx - 1, 0, item);
      } else if (act === 'down' && idx < chainArray.length - 1) {
        const [item] = chainArray.splice(idx, 1);
        chainArray.splice(idx + 1, 0, item);
      } else if (act === 'del') {
        chainArray.splice(idx, 1);
      }
      if (onMutate) onMutate();
    });
    card.appendChild(head);

    if (!fx.collapsed && def && Array.isArray(def.params) && def.params.length > 0) {
      const body = document.createElement('div');
      body.className = 'fx-card-body';
      if (!fx.params) fx.params = {};

      def.params.forEach((p, pIdx) => {
        const curVal = fx.params[p.key] !== undefined ? Number(fx.params[p.key]) : Number(p.defaultVal);
        const domId = `${idPrefix}_${idx}_${pIdx}_${sanitizeGlslIdentifier(p.key)}`;
        const fmtFn = typeof p.fmt === 'function' ? p.fmt : (v => Number(v).toFixed(2));
        const isMasterFx = idPrefix === 'mfx';
        const selSurf = !isMasterFx ? getSelectedSurface() : null;
        const wmTarget = isMasterFx
          ? `masterfx:${fx.id}:${p.key}`
          : (selSurf ? `surface:${selSurf.id}:fx:${fx.id}:${p.key}` : '');
        const wmLabel = isMasterFx
          ? `Master FX • ${def.name} ${p.label}`
          : `${selSurf ? selSurf.name : 'Surface'} • ${def.name} ${p.label}`;

        const row = document.createElement('div');
        row.className = 'ctrl-row';
        row.innerHTML = `
          <label class="ctrl-label" for="${domId}">${escapeHtml(p.label)}</label>
          <input type="range" id="${domId}" class="studio-slider" data-wm-target="${escapeHtml(wmTarget)}" data-wm-label="${escapeHtml(wmLabel)}" min="${p.min}" max="${p.max}" step="${p.step || 0.01}" value="${curVal}" />
          <span class="ctrl-val">${escapeHtml(fmtFn(curVal))}</span>
        `;
        const sl = row.querySelector('input[type="range"]');
        const valSpan = row.querySelector('.ctrl-val');
        setSliderValue(sl, curVal);

        sl.addEventListener('input', () => {
          const v = parseFloat(sl.value);
          setSliderValue(sl, v);
          pushUndoCheckpoint(`FX ${def.name} ${p.label}`, `fxparam:${fx.id}:${p.key}`);
          fx.params[p.key] = v;
          const txt = fmtFn(v);
          valSpan.textContent = txt;
          sl.setAttribute('aria-valuetext', txt);
          state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        });
        sl.addEventListener('change', () => scheduleAutosave());
        body.appendChild(row);
      });
      card.appendChild(body);
    }

    containerEl.appendChild(card);
  });

  syncSliderAriaValuetext(containerEl);
  if (typeof syncModulatedSliderHighlights === 'function') syncModulatedSliderHighlights();
}

function getActiveEditorIsfSource() {
  if (state.shaderEditorSourceId) {
    const found = getSourceById(state.shaderEditorSourceId);
    if (found && found.kind === 'isf') return found;
  }
  const firstIsf = state.sources.find(s => s.kind === 'isf') || null;
  if (firstIsf) state.shaderEditorSourceId = firstIsf.id;
  return firstIsf;
}

function openShaderStudioDrawer(sourceId = null) {
  if (state.isProjectorRole) return;
  let target = sourceId ? getSourceById(sourceId) : getActiveEditorIsfSource();
  if (!target || target.kind !== 'isf') {
    target = addNewCustomIsfSource({}, true);
  }
  state.shaderEditorSourceId = target.id;
  state.shaderDrawerOpen = true;
  const drawer = document.getElementById('shader-studio-drawer');
  if (drawer) drawer.hidden = false;
  syncTopbarUI();
  syncShaderStudioUI(true);
}

function closeShaderStudioDrawer() {
  state.shaderDrawerOpen = false;
  const drawer = document.getElementById('shader-studio-drawer');
  if (drawer) drawer.hidden = true;
  syncTopbarUI();
}

function toggleShaderStudioDrawer() {
  if (state.shaderDrawerOpen) closeShaderStudioDrawer();
  else openShaderStudioDrawer();
}

function syncShaderStudioCompileLog(srcObj) {
  const preEl = document.getElementById('isf-compile-log');
  const codeEl = document.getElementById('isf-compile-code');
  const regBtn = document.getElementById('btn-isf-register-fx');
  if (!preEl || !codeEl) return;

  if (!srcObj) {
    preEl.classList.remove('has-error');
    codeEl.textContent = '✓ Ready — Click + ISF or choose a Starter Template to author live shaders.';
    if (regBtn) regBtn.hidden = true;
    return;
  }

  if (srcObj.compileOk === false && srcObj.compileError) {
    preEl.classList.add('has-error');
    codeEl.textContent = `⚠ ${srcObj.compileError}`;
    if (regBtn) regBtn.hidden = true;
  } else {
    preEl.classList.remove('has-error');
    const inCount = srcObj.isfMeta?.inputs?.length || 0;
    const passCount = srcObj.isfMeta?.passes?.length || 1;
    const fxNote = srcObj.isfMeta?.isEffect ? ' • Effect Filter (inputImage detected)' : '';
    codeEl.textContent = `✓ Compiled OK — WebGL2 #version 300 es • ${inCount} uniform input${inCount === 1 ? '' : 's'} • ${passCount} pass${passCount === 1 ? '' : 'es'}${fxNote}`;
    if (regBtn) regBtn.hidden = !(srcObj.isfMeta && srcObj.isfMeta.isEffect);
  }
}

function syncShaderStudioUI(forceCodeSync = false) {
  const drawer = document.getElementById('shader-studio-drawer');
  if (drawer) drawer.hidden = !state.shaderDrawerOpen;
  document.getElementById('btn-open-shader-drawer')?.classList.toggle('active', !!state.shaderDrawerOpen);

  const autoChk = document.getElementById('chk-isf-autocompile');
  if (autoChk) autoChk.checked = state.shaderAutoCompile !== false;

  const isfSources = state.sources.filter(s => s.kind === 'isf');
  const selEl = document.getElementById('sel-isf-source');
  const activeIsf = getActiveEditorIsfSource();

  if (selEl) {
    if (isfSources.length === 0) {
      selEl.innerHTML = `<option value="">(Click + ISF to Create)</option>`;
    } else {
      selEl.innerHTML = isfSources
        .map(s => `<option value="${s.id}" ${activeIsf && s.id === activeIsf.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
        .join('');
    }
  }

  const nameInp = document.getElementById('inp-isf-name');
  if (nameInp && document.activeElement !== nameInp) {
    nameInp.value = activeIsf ? activeIsf.name : '';
    nameInp.disabled = !activeIsf;
  }

  const codeEditor = document.getElementById('isf-code-editor');
  if (codeEditor) {
    codeEditor.disabled = !activeIsf;
    if (activeIsf && (forceCodeSync || document.activeElement !== codeEditor)) {
      if (codeEditor.value !== activeIsf.isfCode) {
        codeEditor.value = activeIsf.isfCode || '';
      }
    } else if (!activeIsf) {
      codeEditor.value = '';
    }
  }

  syncShaderStudioCompileLog(activeIsf);
  renderIsfDynamicParamsUI(activeIsf);
}

function renderIsfDynamicParamsUI(srcObj) {
  const panel = document.getElementById('isf-params-panel');
  if (!panel) return;
  panel.innerHTML = '';

  if (!srcObj || !srcObj.isfMeta) {
    panel.innerHTML = `<div class="empty-inspector">Create or select an ISF shader to inspect live auto-generated uniform controls.</div>`;
    return;
  }

  const editableInputs = (srcObj.isfMeta.inputs || []).filter(inp => inp && inp.type !== 'image');
  if (editableInputs.length === 0) {
    panel.innerHTML = `<div class="empty-inspector">No custom <code>INPUTS</code> declared in <code>/*{ ... }*/</code> JSON header.<br />Standard uniforms (<code>TIME</code>, <code>RENDERSIZE</code>, <code>isf_FragNormCoord</code>) are active.</div>`;
    return;
  }

  const hdr = document.createElement('div');
  hdr.className = 'isf-param-group-title';
  hdr.innerHTML = `
    <span>ISF Uniforms (${editableInputs.length})</span>
    <button type="button" class="btn" style="padding:1px 6px;font-size:9px;" id="btn-isf-reset-vals">Reset</button>
  `;
  hdr.querySelector('#btn-isf-reset-vals').addEventListener('click', () => {
    srcObj.isfValues = buildDefaultIsfValues(srcObj.isfMeta.inputs, {});
    state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    renderIsfDynamicParamsUI(srcObj);
    scheduleAutosave();
  });
  panel.appendChild(hdr);

  if (!srcObj.isfValues) srcObj.isfValues = buildDefaultIsfValues(srcObj.isfMeta.inputs, {});

  editableInputs.forEach((inp, idx) => {
    const baseId = `isf_u_${idx}_${sanitizeGlslIdentifier(inp.name)}`;

    if (inp.type === 'float') {
      const cur = Number.isFinite(Number(srcObj.isfValues[inp.name]))
        ? Number(srcObj.isfValues[inp.name])
        : Number(inp.defaultVal ?? 0.5);
      const spanRange = Math.max(1e-4, inp.max - inp.min);
      const step = Number((spanRange / 200).toFixed(4)) || 0.005;

      const row = document.createElement('div');
      row.className = 'ctrl-row';
      row.innerHTML = `
        <label class="ctrl-label" for="${baseId}">${escapeHtml(inp.label)}</label>
        <input type="range" id="${baseId}" class="studio-slider" data-wm-target="${escapeHtml(`source:${srcObj.id}:isf:${inp.name}`)}" data-wm-label="${escapeHtml(`${srcObj.name} • ${inp.label}`)}" min="${inp.min}" max="${inp.max}" step="${step}" value="${cur}" />
        <span class="ctrl-val">${cur.toFixed(2)}</span>
      `;
      const sl = row.querySelector('input[type="range"]');
      const valSpan = row.querySelector('.ctrl-val');
      setSliderValue(sl, cur);
      sl.addEventListener('input', () => {
        const v = parseFloat(sl.value);
        setSliderValue(sl, v);
        srcObj.isfValues[inp.name] = v;
        const txt = v.toFixed(2);
        valSpan.textContent = txt;
        sl.setAttribute('aria-valuetext', txt);
        state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
      });
      sl.addEventListener('change', () => scheduleAutosave());
      panel.appendChild(row);
    } else if (inp.type === 'point2D') {
      const curArr = Array.isArray(srcObj.isfValues[inp.name]) ? srcObj.isfValues[inp.name] : [...inp.defaultVal];
      ['X', 'Y'].forEach((axis, aIdx) => {
        const domId = `${baseId}_${axis.toLowerCase()}`;
        const minV = inp.min[aIdx] ?? 0;
        const maxV = inp.max[aIdx] ?? 1;
        const curV = Number(curArr[aIdx] ?? 0.5);
        const step = Number((Math.max(1e-4, maxV - minV) / 200).toFixed(4)) || 0.005;
        const row = document.createElement('div');
        row.className = 'ctrl-row';
        row.innerHTML = `
          <label class="ctrl-label" for="${domId}">${escapeHtml(`${inp.label} ${axis}`)}</label>
          <input type="range" id="${domId}" class="studio-slider" data-wm-target="${escapeHtml(`source:${srcObj.id}:isf:${inp.name}:${aIdx}`)}" data-wm-label="${escapeHtml(`${srcObj.name} • ${inp.label} ${axis}`)}" min="${minV}" max="${maxV}" step="${step}" value="${curV}" />
          <span class="ctrl-val">${curV.toFixed(2)}</span>
        `;
        const sl = row.querySelector('input[type="range"]');
        const valSpan = row.querySelector('.ctrl-val');
        setSliderValue(sl, curV);
        sl.addEventListener('input', () => {
          const v = parseFloat(sl.value);
          setSliderValue(sl, v);
          if (!Array.isArray(srcObj.isfValues[inp.name])) srcObj.isfValues[inp.name] = [...inp.defaultVal];
          srcObj.isfValues[inp.name][aIdx] = v;
          const txt = v.toFixed(2);
          valSpan.textContent = txt;
          sl.setAttribute('aria-valuetext', txt);
          state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
        });
        sl.addEventListener('change', () => scheduleAutosave());
        panel.appendChild(row);
      });
    } else if (inp.type === 'color') {
      const curCol = Array.isArray(srcObj.isfValues[inp.name]) ? srcObj.isfValues[inp.name] : [...inp.defaultVal];
      const hex = rgbaArrayToHex(curCol);
      const row = document.createElement('div');
      row.className = 'ctrl-row';
      row.style.gridTemplateColumns = '84px 28px 1fr';
      row.innerHTML = `
        <label class="ctrl-label" for="${baseId}">${escapeHtml(inp.label)}</label>
        <input type="color" id="${baseId}" class="color-inline-pick" value="${hex}" />
        <span class="ctrl-val" style="text-align:left;">${hex.toUpperCase()}</span>
      `;
      const pick = row.querySelector('input[type="color"]');
      const hexSpan = row.querySelector('.ctrl-val');
      pick.addEventListener('input', () => {
        const prevA = Array.isArray(srcObj.isfValues[inp.name]) ? (srcObj.isfValues[inp.name][3] ?? 1.0) : 1.0;
        srcObj.isfValues[inp.name] = hexToRgbaArray(pick.value, prevA);
        hexSpan.textContent = pick.value.toUpperCase();
        state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
      });
      pick.addEventListener('change', () => scheduleAutosave());
      panel.appendChild(row);
    } else if (inp.type === 'bool') {
      const curBool = !!srcObj.isfValues[inp.name];
      const lbl = document.createElement('label');
      lbl.className = 'studio-check';
      lbl.setAttribute('for', baseId);
      lbl.innerHTML = `
        <input type="checkbox" id="${baseId}" ${curBool ? 'checked' : ''} />
        <span>${escapeHtml(inp.label)}</span>
      `;
      const chk = lbl.querySelector('input[type="checkbox"]');
      chk.addEventListener('change', () => {
        srcObj.isfValues[inp.name] = chk.checked;
        state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
        scheduleAutosave();
      });
      panel.appendChild(lbl);
    } else if (inp.type === 'long') {
      const curLong = Number(srcObj.isfValues[inp.name] ?? inp.defaultVal ?? 0);
      const row = document.createElement('div');
      row.className = 'ctrl-row';
      row.style.gridTemplateColumns = '84px 1fr';
      const optsHtml = (inp.values || []).map((valNum, oIdx) => {
        const optLbl = (inp.labels && inp.labels[oIdx]) ? inp.labels[oIdx] : String(valNum);
        return `<option value="${valNum}" ${valNum === curLong ? 'selected' : ''}>${escapeHtml(optLbl)}</option>`;
      }).join('');
      row.innerHTML = `
        <label class="ctrl-label" for="${baseId}">${escapeHtml(inp.label)}</label>
        <select id="${baseId}" class="studio-select">${optsHtml}</select>
      `;
      const sel = row.querySelector('select');
      sel.addEventListener('change', () => {
        srcObj.isfValues[inp.name] = parseInt(sel.value, 10) || 0;
        state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
        scheduleAutosave();
      });
      panel.appendChild(row);
    } else if (inp.type === 'event') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn emerald';
      btn.style.width = '100%';
      btn.textContent = `⚡ Trigger ${inp.label}`;
      btn.addEventListener('click', () => {
        if (!srcObj.isfEvents) srcObj.isfEvents = {};
        srcObj.isfEvents[inp.name] = true;
        state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
      });
      panel.appendChild(btn);
    }
  });

  syncSliderAriaValuetext(panel);
  if (typeof syncModulatedSliderHighlights === 'function') syncModulatedSliderHighlights();
}

// ============================================================================
// 4. MILESTONE 4: DYNAMIC TYPOGRAPHY, LIVE CLOCK & COUNTDOWN STUDIO DIALOG
// ============================================================================

function getActiveTextStudioSource() {
  if (state.textStudioSourceId) {
    const found = getSourceById(state.textStudioSourceId);
    if (found && found.kind === 'text') return found;
  }
  const active = getSourceById(state.activeSourceId);
  if (active && active.kind === 'text') {
    state.textStudioSourceId = active.id;
    return active;
  }
  const firstTxt = state.sources.find(s => s.kind === 'text') || null;
  if (firstTxt) state.textStudioSourceId = firstTxt.id;
  return firstTxt;
}

function syncTextStudioDialogUI(srcObj) {
  const dlg = document.getElementById('text-dialog');
  if (!dlg || !srcObj || srcObj.kind !== 'text') return;

  const nameInp = document.getElementById('inp-txt-src-name');
  if (nameInp && document.activeElement !== nameInp) nameInp.value = srcObj.name || 'Stage Text';

  const multiInp = document.getElementById('inp-txt-multiline');
  if (multiInp && document.activeElement !== multiInp) multiInp.value = srcObj.text ?? '';

  document.getElementById('sel-txt-font').value = srcObj.fontFamily || 'sans';
  document.getElementById('sel-txt-weight').value = String(srcObj.fontWeight || '800');
  document.getElementById('sel-txt-align').value = srcObj.align || 'center';

  const fSize = Math.round(srcObj.fontSize ?? 136);
  setSliderValue(document.getElementById('ctrl-txt-dlg-size'), fSize);
  document.getElementById('val-txt-dlg-size').textContent = `${fSize}px`;

  const trk = Math.round(srcObj.letterSpacing ?? 4);
  setSliderValue(document.getElementById('ctrl-txt-tracking'), trk);
  document.getElementById('val-txt-tracking').textContent = `${trk}px`;

  const lHeight = Number(srcObj.lineHeight ?? 1.18);
  setSliderValue(document.getElementById('ctrl-txt-leading'), lHeight);
  document.getElementById('val-txt-leading').textContent = `${lHeight.toFixed(2)}×`;

  document.getElementById('pick-txt-dlg-fg').value = srcObj.fgColor || '#ffffff';
  document.getElementById('pick-txt-stroke').value = srcObj.strokeColor || '#6fd3ff';
  document.getElementById('pick-txt-bg').value = srcObj.bgColor || '#070b14';

  const sW = Number(srcObj.strokeWidth ?? 0);
  setSliderValue(document.getElementById('ctrl-txt-stroke-w'), sW);
  document.getElementById('val-txt-stroke-w').textContent = `${sW.toFixed(1)}px`;

  const gBlur = Math.round(srcObj.glowBlur ?? 20);
  setSliderValue(document.getElementById('ctrl-txt-glow'), gBlur);
  document.getElementById('val-txt-glow').textContent = `${gBlur}px`;

  const bgOp = Number(srcObj.bgOpacity ?? 0);
  setSliderValue(document.getElementById('ctrl-txt-dlg-bgop'), bgOp);
  document.getElementById('val-txt-dlg-bgop').textContent = `${Math.round(bgOp * 100)}%`;

  document.getElementById('sel-txt-dlg-anim').value = srcObj.animMode || 'static';
  const spd = Number(srcObj.animSpeed ?? 1.0);
  setSliderValue(document.getElementById('ctrl-txt-speed'), spd);
  document.getElementById('val-txt-speed').textContent = `${spd.toFixed(2)}×`;

  const cdMins = document.getElementById('inp-txt-cd-mins');
  if (cdMins && document.activeElement !== cdMins) cdMins.value = String(srcObj.countdownMinutes ?? 10);

  const cdDone = document.getElementById('inp-txt-cd-done');
  if (cdDone && document.activeElement !== cdDone) cdDone.value = srcObj.countdownDoneText ?? 'LIVE NOW';

  syncSliderAriaValuetext(dlg);
}

function openTextStudioModal(sourceId = null) {
  if (state.isProjectorRole) return;
  let target = sourceId ? getSourceById(sourceId) : getActiveTextStudioSource();
  if (!target || target.kind !== 'text') {
    target = addNewTextSource({}, true);
  }
  state.textStudioSourceId = target.id;
  state.activeSourceId = target.id;
  syncTextStudioDialogUI(target);
  syncTransportUI();
  renderMediaBin();
  const dlg = document.getElementById('text-dialog');
  if (dlg && !dlg.open) {
    dlg.showModal();
  }
}

// ============================================================================
// 5. MILESTONE 5: AUDIO FFT, MODULATION MATRIX, WEBMIDI, GAMEPAD & OSC UI
// ============================================================================

function syncOscReadoutOnly() {
  const oscEl = document.getElementById('osc-status-readout');
  if (!oscEl || !state.osc) return;
  oscEl.textContent = `${state.osc.status.toUpperCase()} • RX:${state.osc.rxCount || 0} TX:${state.osc.txCount || 0} • ${state.osc.lastRx || ''}`;
}

function renderMidiMappingsListUI() {
  const listEl = document.getElementById('midi-mappings-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  const maps = state.midi?.mappings || [];
  if (maps.length === 0) {
    listEl.innerHTML = `<div class="fx-rack-empty">No MIDI mappings yet — press ⌘M, click any Slider or Cue, then move a hardware control.</div>`;
    return;
  }
  for (const m of maps) {
    const row = document.createElement('div');
    row.className = 'fx-rack-card';
    row.style.padding = '4px 6px';
    const badge = `Ch${(m.channel ?? 0) + 1} ${String(m.msgType || 'cc').toUpperCase()}#${m.code}`;
    row.innerHTML = `
      <div class="fx-card-head">
        <span class="type-pill isf" style="font-size:8px;">${escapeHtml(badge)}</span>
        <span class="fx-card-title">${escapeHtml(m.label || m.targetKey)}</span>
        <button type="button" class="icon-btn" data-del-midi="${escapeHtml(m.id)}" aria-label="Remove MIDI Mapping">✕</button>
      </div>
    `;
    row.querySelector('[data-del-midi]')?.addEventListener('click', () => {
      removeMidiMapping(m.id);
    });
    listEl.appendChild(row);
  }
}

function renderModulatorsListUI() {
  const listEl = document.getElementById('mod-matrix-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const mods = state.modulators || [];
  if (mods.length === 0) {
    listEl.innerHTML = `<div class="fx-rack-empty">No active modulators — right-click any Slider or click + Bind above.</div>`;
    return;
  }

  mods.forEach((mod, idx) => {
    const bounds = typeof getParamTargetBounds === 'function'
      ? getParamTargetBounds(mod.targetKey)
      : { min: 0, max: 1, label: mod.targetKey };
    const card = document.createElement('div');
    card.className = 'mod-card' + (mod.enabled === false ? ' mod-muted' : '');
    const kindIcon = mod.kind === 'audio' ? '♫' : (mod.kind === 'seq' ? '▦' : '∿');

    const head = document.createElement('div');
    head.className = 'fx-card-head';
    head.innerHTML = `
      <button type="button" class="icon-btn ${mod.enabled !== false ? 'on-cal' : 'off-vis'}" data-mact="toggle" aria-label="Toggle Modulator">${mod.enabled !== false ? '●' : '○'}</button>
      <span class="fx-card-title">${kindIcon} ${escapeHtml(bounds.label || mod.name)}</span>
      <button type="button" class="icon-btn" data-mact="del" aria-label="Remove Modulator">✕</button>
    `;
    head.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mact]');
      if (!btn) return;
      if (btn.dataset.mact === 'toggle') {
        mod.enabled = !(mod.enabled !== false);
        renderModulatorsListUI();
        if (typeof syncModulatedSliderHighlights === 'function') syncModulatedSliderHighlights();
        scheduleAutosave();
      } else if (btn.dataset.mact === 'del') {
        removeModulator(mod.id);
      }
    });
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'fx-card-body';
    const uid = `mod_${idx}_${sanitizeGlslIdentifier(mod.id)}`;
    const stepRange = Math.max(1e-4, bounds.max - bounds.min) / 100;

    if (mod.kind === 'lfo') {
      body.innerHTML = `
        <div class="ctrl-row" style="grid-template-columns: 58px 1fr 68px;">
          <label class="ctrl-label" for="${uid}_wf">Wave</label>
          <select id="${uid}_wf" class="studio-select">
            <option value="sine" ${mod.waveform === 'sine' ? 'selected' : ''}>Sine</option>
            <option value="triangle" ${mod.waveform === 'triangle' ? 'selected' : ''}>Triangle</option>
            <option value="saw" ${mod.waveform === 'saw' ? 'selected' : ''}>Sawtooth</option>
            <option value="square" ${mod.waveform === 'square' ? 'selected' : ''}>Square</option>
            <option value="perlin" ${mod.waveform === 'perlin' ? 'selected' : ''}>Perlin Drift</option>
            <option value="beat" ${mod.waveform === 'beat' ? 'selected' : ''}>BPM Sync</option>
          </select>
          <input type="number" id="${uid}_rate" class="studio-input" min="0.02" max="16" step="0.05" value="${Number(mod.waveform === 'beat' ? (mod.beatDiv || 1) : (mod.rate || 0.45)).toFixed(2)}" aria-label="LFO Rate Hz or Beat Division" title="Hz (or Beats when BPM Sync)" />
        </div>
      `;
      const wfSel = body.querySelector(`#${uid}_wf`);
      const rateInp = body.querySelector(`#${uid}_rate`);
      wfSel.addEventListener('change', () => {
        mod.waveform = wfSel.value;
        rateInp.value = Number(mod.waveform === 'beat' ? (mod.beatDiv || 1) : (mod.rate || 0.45)).toFixed(2);
        scheduleAutosave();
      });
      rateInp.addEventListener('change', () => {
        const v = clamp(parseFloat(rateInp.value) || 0.5, 0.02, 16);
        if (mod.waveform === 'beat') mod.beatDiv = v;
        else mod.rate = v;
        scheduleAutosave();
      });
    } else if (mod.kind === 'audio') {
      body.innerHTML = `
        <div class="ctrl-row" style="grid-template-columns: 58px 1fr 68px;">
          <label class="ctrl-label" for="${uid}_band">Band</label>
          <select id="${uid}_band" class="studio-select">
            <option value="sub" ${mod.audioBand === 'sub' ? 'selected' : ''}>Sub Bass</option>
            <option value="low" ${mod.audioBand === 'low' ? 'selected' : ''}>Low / Kick</option>
            <option value="mid" ${mod.audioBand === 'mid' ? 'selected' : ''}>Low-Mid</option>
            <option value="high" ${mod.audioBand === 'high' ? 'selected' : ''}>High / Air</option>
            <option value="rms" ${mod.audioBand === 'rms' ? 'selected' : ''}>RMS Level</option>
            <option value="beat" ${mod.audioBand === 'beat' ? 'selected' : ''}>Beat Gate</option>
          </select>
          <input type="number" id="${uid}_gain" class="studio-input" min="0.1" max="5" step="0.1" value="${Number(mod.gain ?? 1.4).toFixed(1)}" aria-label="Audio Envelope Gain" title="Envelope Gain" />
        </div>
      `;
      const bandSel = body.querySelector(`#${uid}_band`);
      const gainInp = body.querySelector(`#${uid}_gain`);
      bandSel.addEventListener('change', () => { mod.audioBand = bandSel.value; scheduleAutosave(); });
      gainInp.addEventListener('change', () => { mod.gain = clamp(parseFloat(gainInp.value) || 1.4, 0.1, 6); scheduleAutosave(); });
    } else if (mod.kind === 'seq') {
      const grid = document.createElement('div');
      grid.className = 'seq-steps-grid';
      if (!Array.isArray(mod.steps) || mod.steps.length !== 8) {
        mod.steps = [1.0, 0.25, 0.65, 0.15, 0.85, 0.35, 0.55, 0.1];
      }
      mod.steps.forEach((sv, sIdx) => {
        const col = document.createElement('div');
        col.className = 'seq-step-col';
        col.title = `Step ${sIdx + 1}: ${Math.round(sv * 100)}% (drag vertically)`;
        const fill = document.createElement('div');
        fill.className = 'seq-step-fill';
        fill.style.height = `${Math.round(clamp(sv, 0, 1) * 100)}%`;
        col.appendChild(fill);

        const applyStepY = (clientY) => {
          const r = col.getBoundingClientRect();
          const nv = clamp(1.0 - (clientY - r.top) / Math.max(8, r.height), 0, 1);
          mod.steps[sIdx] = Number(nv.toFixed(3));
          fill.style.height = `${Math.round(nv * 100)}%`;
        };
        col.addEventListener('pointerdown', (pe) => {
          pe.preventDefault();
          col.setPointerCapture(pe.pointerId);
          applyStepY(pe.clientY);
        });
        col.addEventListener('pointermove', (pe) => {
          if (col.hasPointerCapture(pe.pointerId)) applyStepY(pe.clientY);
        });
        col.addEventListener('pointerup', (pe) => {
          if (col.hasPointerCapture(pe.pointerId)) col.releasePointerCapture(pe.pointerId);
          scheduleAutosave();
        });
        grid.appendChild(col);
      });
      body.appendChild(grid);
    }

    // Min -> Max output range row
    const rangeRow = document.createElement('div');
    rangeRow.className = 'ctrl-row';
    rangeRow.style.gridTemplateColumns = '58px 1fr 1fr';
    rangeRow.innerHTML = `
      <span class="ctrl-label">Min / Max</span>
      <input type="number" id="${uid}_min" class="studio-input" step="${stepRange.toFixed(3)}" value="${Number(mod.minVal ?? bounds.min).toFixed(2)}" aria-label="Modulator Minimum Value" />
      <input type="number" id="${uid}_max" class="studio-input" step="${stepRange.toFixed(3)}" value="${Number(mod.maxVal ?? bounds.max).toFixed(2)}" aria-label="Modulator Maximum Value" />
    `;
    const minInp = rangeRow.querySelector(`#${uid}_min`);
    const maxInp = rangeRow.querySelector(`#${uid}_max`);
    minInp.addEventListener('change', () => {
      mod.minVal = clamp(parseFloat(minInp.value) || 0, bounds.min, bounds.max);
      scheduleAutosave();
    });
    maxInp.addEventListener('change', () => {
      mod.maxVal = clamp(parseFloat(maxInp.value) || 1, bounds.min, bounds.max);
      scheduleAutosave();
    });
    body.appendChild(rangeRow);

    card.appendChild(body);
    listEl.appendChild(card);
  });
}

function syncModIoInspectorUI() {
  const aud = state.audio;
  const audBtn = document.getElementById('btn-audio-enable');
  if (audBtn && aud) {
    audBtn.classList.toggle('active', !!aud.enabled);
    audBtn.setAttribute('aria-pressed', String(!!aud.enabled));
    audBtn.textContent = aud.enabled ? '♫ Audio Live' : '♫ Enable Audio Engine';
  }
  const audMode = document.getElementById('sel-audio-mode');
  const curMode = (aud && aud.sourceMode) ? aud.sourceMode : 'synth';
  if (audMode && aud) audMode.value = curMode;

  // Contextual source helper rows (Mic device selector, Video clip selector + speaker mute, screen capture)
  const micRow = document.getElementById('audio-mic-row');
  const vidRow = document.getElementById('audio-video-row');
  const syphonRow = document.getElementById('audio-capture-row');
  if (micRow) {
    const showMic = curMode === 'mic';
    micRow.hidden = !showMic;
    micRow.style.display = showMic ? 'grid' : 'none';
    if (showMic && typeof refreshAudioInputDevicesList === 'function') {
      refreshAudioInputDevicesList();
    }
  }
  if (vidRow) {
    const showVid = curMode === 'video';
    vidRow.hidden = !showVid;
    vidRow.style.display = showVid ? 'flex' : 'none';
    if (showVid) {
      const vidSel = document.getElementById('sel-audio-video-src');
      const spkBtn = document.getElementById('btn-audio-vid-speaker');
      const videos = state.sources.filter(s => s && s.kind === 'video' && !s.offline);
      const targetVid = typeof resolveAudioTargetVideoSource === 'function' ? resolveAudioTargetVideoSource() : null;
      if (vidSel) {
        if (videos.length === 0) {
          vidSel.innerHTML = `<option value="">(No video clips — click + Video…)</option>`;
        } else {
          const pref = (aud && aud.videoSourceId) ? aud.videoSourceId : 'auto';
          const autoSub = targetVid ? ` → ${targetVid.name}` : '';
          let html = `<option value="auto" ${pref === 'auto' || !pref ? 'selected' : ''}>${escapeHtml(`Auto (Active${autoSub})`)}</option>`;
          for (const v of videos) {
            html += `<option value="${escapeHtml(v.id)}" ${pref === v.id ? 'selected' : ''}>${escapeHtml(v.name)}</option>`;
          }
          vidSel.innerHTML = html;
        }
      }
      if (spkBtn) {
        spkBtn.disabled = !targetVid;
        const isAudible = !!(targetVid && !targetVid.muted);
        spkBtn.classList.toggle('active', isAudible);
        spkBtn.setAttribute('aria-pressed', String(isAudible));
        spkBtn.textContent = isAudible ? '🔊 Sound ON' : '🔇 Muted';
      }
    }
  }
  if (syphonRow) {
    const showSyphon = curMode === 'syphon';
    syphonRow.hidden = !showSyphon;
    syphonRow.style.display = showSyphon ? 'flex' : 'none';
  }
  if (typeof syncAudioSourceStatusBox === 'function') {
    syncAudioSourceStatusBox(true);
  }

  if (aud) {
    setSliderValue(document.getElementById('ctrl-audio-gain'), aud.gain ?? 1.35);
    const gv = document.getElementById('val-audio-gain');
    if (gv) gv.textContent = `${Number(aud.gain ?? 1.35).toFixed(2)}×`;
    const bpmInp = document.getElementById('inp-audio-bpm');
    if (bpmInp && document.activeElement !== bpmInp) {
      bpmInp.value = String(Math.round((aud.bpm || 120) * 10) / 10);
    }
    const autoChk = document.getElementById('chk-audio-autobpm');
    if (autoChk) autoChk.checked = !!aud.autoBpm;
  }

  // Target selector dropdown
  const targetSel = document.getElementById('sel-mod-target');
  if (targetSel && typeof getAvailableModTargetsList === 'function') {
    const prev = targetSel.value;
    const opts = getAvailableModTargetsList();
    targetSel.innerHTML = opts
      .map(o => {
        const k = o.key || o.targetKey || '';
        return `<option value="${escapeHtml(k)}">${escapeHtml(o.label)}</option>`;
      })
      .join('');
    if (prev && opts.some(o => (o.key || o.targetKey) === prev)) {
      targetSel.value = prev;
    }
  }

  renderModulatorsListUI();
  renderMidiMappingsListUI();

  // MIDI
  const midiLearnBtn = document.getElementById('btn-insp-midi-learn');
  if (midiLearnBtn && state.midi) {
    midiLearnBtn.classList.toggle('active', !!state.midi.learnArmed);
    midiLearnBtn.setAttribute('aria-pressed', String(!!state.midi.learnArmed));
  }
  const midiStat = document.getElementById('midi-status-readout');
  if (midiStat && state.midi) {
    midiStat.textContent = state.midi.lastMsgText || 'MIDI Idle';
  }

  // Gamepad
  const gpChk = document.getElementById('chk-gamepad-enable');
  if (gpChk && state.gamepad) gpChk.checked = state.gamepad.enabled !== false;
  const gpSel = document.getElementById('sel-gamepad-rstick');
  if (gpSel && state.gamepad) gpSel.value = state.gamepad.rightStickMode || 'auto';
  const gpStat = document.getElementById('gamepad-status-readout');
  if (gpStat && state.gamepad) {
    gpStat.textContent = state.gamepad.connectedName
      ? `🎮 Connected: ${state.gamepad.connectedName}`
      : 'Press any PS5 / Xbox controller button to wake';
  }

  // OSC
  const oscUrlInp = document.getElementById('inp-osc-url');
  if (oscUrlInp && state.osc && document.activeElement !== oscUrlInp) {
    oscUrlInp.value = state.osc.wsUrl || 'ws://127.0.0.1:8080';
  }
  const oscBtn = document.getElementById('btn-osc-connect');
  if (oscBtn && state.osc) {
    const isConn = state.osc.status === 'connected' || state.osc.status === 'connecting';
    oscBtn.classList.toggle('active', isConn);
    oscBtn.setAttribute('aria-pressed', String(isConn));
    oscBtn.textContent = isConn ? 'OSC ●' : 'OSC';
  }
  const oscFb = document.getElementById('chk-osc-feedback');
  if (oscFb && state.osc) oscFb.checked = state.osc.sendFeedback !== false;
  syncOscReadoutOnly();

  syncSliderAriaValuetext(document.getElementById('insp-pane-mod'));
  if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
}
