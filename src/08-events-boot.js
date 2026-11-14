// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 08-events-boot.js — Event Bindings, Dialog Fallbacks, Shortcuts & Main Loop
// ============================================================================

function setLayoutMode(mode) {
  const valid = (mode === 'input' || mode === 'output' || mode === 'mix' || mode === 'rig') ? mode : 'split';
  state.layoutMode = valid;
  document.body.classList.remove('layout-input-only', 'layout-output-only', 'layout-mix', 'layout-rig');
  if (valid === 'input') document.body.classList.add('layout-input-only');
  if (valid === 'output') document.body.classList.add('layout-output-only');
  if (valid === 'mix') document.body.classList.add('layout-mix');
  if (valid === 'rig') document.body.classList.add('layout-rig');
  document.getElementById('btn-view-split')?.classList.toggle('active', valid === 'split');
  document.getElementById('btn-view-input')?.classList.toggle('active', valid === 'input');
  document.getElementById('btn-view-output')?.classList.toggle('active', valid === 'output');
  document.getElementById('btn-view-mix')?.classList.toggle('active', valid === 'mix');
  document.getElementById('btn-view-rig')?.classList.toggle('active', valid === 'rig');
  if (valid === 'mix' && typeof syncMixPaneToolbarUI === 'function') {
    syncMixPaneToolbarUI();
  }
  if (valid === 'rig' && typeof syncRigWorkspaceUI === 'function') {
    syncRigWorkspaceUI();
  }
}

function toggleLocalProjectorMode(forceVal) {
  state.projectorMode = typeof forceVal === 'boolean' ? forceVal : !state.projectorMode;
  document.body.classList.toggle('mode-projector', state.projectorMode);

  const banner = document.getElementById('projector-banner');
  if (state.projectorMode) {
    banner.textContent = state.isMonitorRole
      ? APP_NAME_UPPER + ' OPERATOR MONITOR — Blind Pre-Aim Reticles Active • Press F for Fullscreen'
      : (state.isProjectorRole
        ? `${APP_NAME_UPPER} PROJECTOR SCREEN ${state.projectorScreenIndex || 1} — Click Banner or Press F for Fullscreen • Connected to Studio Controller`
        : 'CLEAN STAGE OUTPUT MODE — Press P or ESC to return to Studio • Press F for Fullscreen');
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 3600);
  } else {
    banner.classList.remove('show');
  }
}

function toggleEcoMode(forceVal) {
  if (state.isProjectorRole) return;
  state.ecoMode = typeof forceVal === 'boolean' ? forceVal : !state.ecoMode;
  document.body.classList.toggle('eco-mode-on', state.ecoMode);
  const ecoBtn = document.getElementById('btn-eco-mode');
  if (ecoBtn) {
    ecoBtn.classList.toggle('active', state.ecoMode);
    ecoBtn.setAttribute('aria-pressed', String(state.ecoMode));
  }
  showToast(state.ecoMode ? 'Laptop GPU Eco Mode ON — Vector Radar Active' : 'Laptop GPU Eco Mode OFF — Full WebGL2 Live');
}

function toggleSpotSteerMode(forceVal) {
  if (forceVal === false) {
    if (typeof setTrackpadSpotTarget === 'function') {
      setTrackpadSpotTarget(null);
      if (document.pointerLockElement === stageOverlay) document.exitPointerLock();
      return;
    }
  } else if (forceVal === true) {
    if (state.trackpadSpotTarget) return;
    if (typeof cycleTrackpadSpotTarget === 'function') {
      cycleTrackpadSpotTarget(1);
      return;
    }
  } else if (typeof cycleTrackpadSpotTarget === 'function') {
    if (state.drawingMaskId) finishActiveMaskDrawing();
    if (state.drawingSurfaceId) finishActiveSurfaceDrawing();
    cycleTrackpadSpotTarget(1);
    if (!state.trackpadSpotTarget && document.pointerLockElement === stageOverlay) {
      document.exitPointerLock();
    }
    return;
  }
  state.steerSpotMode = typeof forceVal === 'boolean' ? forceVal : !state.steerSpotMode;
  syncFollowspotInspectorUI();
  syncStageModePill();
}

function toggleShowLock(forceVal) {
  if (state.isProjectorRole) return;
  state.showLock = typeof forceVal === 'boolean' ? forceVal : !state.showLock;
  if (state.showLock) {
    if (state.drawingMaskId) finishActiveMaskDrawing();
    if (state.drawingSurfaceId) finishActiveSurfaceDrawing();
    if (state.calibCrosshair) state.calibCrosshair.active = false;
    if (state.loupeState) state.loupeState.active = false;
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  syncTopbarUI();
  syncOutputInspectorUI();
  renderSurfaceList();
  scheduleAutosave();
  showToast(state.showLock
    ? '🔒 SHOW LOCK ARMED — Stage geometry & projector guides protected'
    : '🔓 Show Lock disarmed — Geometry editing active');
}

function createGroupFromSelection() {
  if (state.showLock) {
    showToast('🔒 Show Lock active — press Shift+P to unlock');
    return;
  }
  const targets = getSelectedSurfaces();
  if (targets.length === 0) {
    showToast('Select one or more surfaces first to create a Group');
    return;
  }
  pushUndoCheckpoint('Group Surfaces');
  const grp = createSurfaceGroup();
  state.groups.unshift(grp);
  targets.forEach(s => { s.groupId = grp.id; });
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  renderSurfaceList();
  scheduleAutosave();
  showToast(`Grouped ${targets.length} surface${targets.length > 1 ? 's' : ''} into "${grp.name}"`);
}

function bindInspectorSlider(id, applyFn, saveOnChange = true, undoLabel = null) {
  const el = document.getElementById(id);
  if (!el) return;
  const trackUndo = saveOnChange && id !== 'ctrl-master-opacity';
  el.addEventListener('input', () => {
    const val = parseFloat(el.value);
    setSliderValue(el, val);
    if (trackUndo) {
      pushUndoCheckpoint(undoLabel || id, `slider:${id}`);
    }
    applyFn(val);
    if (typeof describeSliderTarget === 'function') {
      const desc = describeSliderTarget(el);
      if (desc && desc.targetKey) {
        if (!state.manualTouchedKeys) state.manualTouchedKeys = {};
        state.manualTouchedKeys[desc.targetKey] = true;
        if (state.room === 'live' && typeof recordLiveCapturedTrim === 'function') {
          recordLiveCapturedTrim(desc.targetKey, val);
        }
      }
    }
    const row = el.parentElement;
    const valSpan = row && (
      row.querySelector('.ctrl-val') ||
      (el.nextElementSibling && el.nextElementSibling.tagName === 'SPAN' ? el.nextElementSibling : null)
    );
    if (valSpan && valSpan.textContent) {
      el.setAttribute('aria-valuetext', valSpan.textContent.trim());
    }
    if (typeof syncModulatedSliderHighlights === 'function') syncModulatedSliderHighlights();
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  });
  if (saveOnChange) {
    el.addEventListener('change', () => scheduleAutosave());
  }
}

function bindAllControls() {
  // 1. Native Modal Dialog Wiring & Fallback (modern-web-guidance dialog spec)
  const relinkDialog = document.getElementById('relink-dialog');
  const shortcutsDialog = document.getElementById('shortcuts-dialog');
  const clonerDialog = document.getElementById('cloner-dialog');
  const scannerDialog = document.getElementById('scanner-dialog');
  const textDialog = document.getElementById('text-dialog');
  const edgeblendDialog = document.getElementById('edgeblend-dialog');
  const stageplanDialog = document.getElementById('stageplan-dialog');
  const cmdPaletteDialog = document.getElementById('cmd-palette-dialog');
  relinkDialog.addEventListener('close', () => {
    // Reset returnValue so Esc/dismiss never leaks a stale button value
    relinkDialog.returnValue = '';
  });
  shortcutsDialog.addEventListener('close', () => {
    shortcutsDialog.returnValue = '';
  });
  clonerDialog.addEventListener('close', () => {
    clonerDialog.returnValue = '';
  });
  scannerDialog.addEventListener('close', () => {
    scannerDialog.returnValue = '';
    stopScannerCamera(true);
  });
  textDialog.addEventListener('close', () => {
    textDialog.returnValue = '';
  });
  edgeblendDialog.addEventListener('close', () => {
    edgeblendDialog.returnValue = '';
  });
  stageplanDialog?.addEventListener('close', () => {
    stageplanDialog.returnValue = '';
  });
  cmdPaletteDialog?.addEventListener('close', () => {
    cmdPaletteDialog.returnValue = '';
  });
  if (typeof initStagePlanDialogControls === 'function') {
    initStagePlanDialogControls();
  }
  if (typeof initRigWorkspaceControls === 'function') {
    initRigWorkspaceControls();
    if (typeof initVenuePrevizModule === 'function') initVenuePrevizModule();
    if (typeof initProgramPreviewControls === 'function') initProgramPreviewControls();
    if (typeof initVenuePartsControls === 'function') initVenuePartsControls();
    if (typeof initWorkflowControls === 'function') initWorkflowControls();
    if (typeof initProjectorAlignModule === 'function') initProjectorAlignModule();
  }
  if (typeof initUxStudioSystems === 'function') {
    initUxStudioSystems();
  }
  if (typeof initRoomsDevicesSpotsBindings === 'function') {
    initRoomsDevicesSpotsBindings();
  }

  const bindImeSafeBlurOnEnter = (el) => {
    if (!el) return;
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (isImeComposingEnter(e)) return;
        e.preventDefault();
        el.blur();
      }
    });
  };

  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => { pressedOutside = outside(e, dialog); });
      dialog.addEventListener('pointerup', (e) => { if (pressedOutside && outside(e, dialog)) dialog.close(); });
    }
  }

  document.getElementById('btn-shortcuts').addEventListener('click', () => {
    if (!shortcutsDialog.open) shortcutsDialog.showModal();
  });

  document.getElementById('btn-open-relink').addEventListener('click', () => openRelinkModal());
  document.getElementById('btn-oneclick-reconnect').addEventListener('click', () => reconnectAllSavedHandles());
  document.getElementById('btn-relink-handles').addEventListener('click', () => reconnectAllSavedHandles());
  const relinkFileInput = document.getElementById('relink-file-input');
  document.getElementById('btn-relink-browse').addEventListener('click', () => {
    state.relinkSingleSourceId = null;
    pickMediaFilesWithHandles(true, relinkFileInput);
  });
  relinkFileInput.addEventListener('change', () => {
    if (relinkFileInput.files && relinkFileInput.files.length > 0) {
      batchRelinkFiles(relinkFileInput.files);
      relinkFileInput.value = '';
    }
  });

  // 2. Topbar Scene, Show JSON & Output Controls
  document.getElementById('btn-demo-scene').addEventListener('click', () => loadDemoScene(false));
  document.getElementById('btn-new-scene').addEventListener('click', () => loadBlankScene());
  document.getElementById('btn-save-json').addEventListener('click', () => exportShowJson());
  document.getElementById('btn-pack-wmshow').addEventListener('click', () => exportSelfContainedShowArchive());

  let loadKeepVenueMode = false;
  const projInput = document.getElementById('project-file-input');
  document.getElementById('btn-load-json').addEventListener('click', () => {
    loadKeepVenueMode = false;
    projInput.click();
  });
  document.getElementById('btn-load-keep-venue')?.addEventListener('click', () => {
    loadKeepVenueMode = true;
    projInput.click();
  });
  projInput.addEventListener('change', () => {
    const f = projInput.files && projInput.files[0];
    const keepV = loadKeepVenueMode;
    loadKeepVenueMode = false;
    if (f) {
      const r = new FileReader();
      r.onload = () => { if (typeof r.result === 'string') importShowJson(r.result, false, { keepVenue: keepV }); };
      r.readAsText(f);
    }
    projInput.value = '';
  });

  document.getElementById('btn-undo').addEventListener('click', () => performUndo());
  document.getElementById('btn-redo').addEventListener('click', () => performRedo());

  document.getElementById('btn-view-split').addEventListener('click', () => setLayoutMode('split'));
  document.getElementById('btn-view-input').addEventListener('click', () => setLayoutMode('input'));
  document.getElementById('btn-view-output').addEventListener('click', () => setLayoutMode('output'));
  document.getElementById('btn-view-mix').addEventListener('click', () => setLayoutMode('mix'));
  document.getElementById('btn-view-rig')?.addEventListener('click', () => setLayoutMode('rig'));
  document.getElementById('btn-cmd-palette')?.addEventListener('click', () => openCommandPalette());
  document.getElementById('btn-rail-go')?.addEventListener('click', () => stepCue(1));
  document.getElementById('btn-rail-back')?.addEventListener('click', () => stepCue(-1));

  document.getElementById('btn-snap-vert').addEventListener('click', (e) => {
    state.snapVertices = !state.snapVertices;
    e.currentTarget.classList.toggle('active', state.snapVertices);
  });
  document.getElementById('btn-snap-grid').addEventListener('click', (e) => {
    state.snapGrid = !state.snapGrid;
    e.currentTarget.classList.toggle('active', state.snapGrid);
  });
  document.getElementById('btn-weld-vert').addEventListener('click', (e) => {
    state.weldVertices = !state.weldVertices;
    e.currentTarget.classList.toggle('active', state.weldVertices);
    showToast(state.weldVertices
      ? '⛓ Magnetic Shared-Vertex Welding ON'
      : 'Shared-Vertex Welding OFF (independent corners)');
  });
  document.getElementById('btn-loupe').addEventListener('click', (e) => {
    state.enableLoupe = !state.enableLoupe;
    e.currentTarget.classList.toggle('active', state.enableLoupe);
    showToast(state.enableLoupe ? '🔍 6× Sub-Pixel Magnifier Loupe ON' : 'Magnifier Loupe OFF');
  });
  document.getElementById('btn-all-cal').addEventListener('click', (e) => {
    state.allCalGrids = !state.allCalGrids;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    e.currentTarget.classList.toggle('active', state.allCalGrids);
  });
  document.getElementById('btn-wireframes').addEventListener('click', (e) => {
    state.showWireframes = !state.showWireframes;
    e.currentTarget.classList.toggle('active', state.showWireframes);
  });
  document.getElementById('btn-steer-spot').addEventListener('click', () => toggleSpotSteerMode());
  document.getElementById('btn-open-scanner').addEventListener('click', () => openSpaceScannerModal());
  document.getElementById('btn-open-shader-drawer').addEventListener('click', () => toggleShaderStudioDrawer());
  document.getElementById('btn-midi-learn').addEventListener('click', () => toggleMidiLearnMode());
  document.getElementById('btn-toggle-timeline').addEventListener('click', () => toggleTimelineDrawer());
  document.getElementById('btn-stage-rec').addEventListener('click', () => toggleStageVideoRecording());

  document.getElementById('sel-stage-res').addEventListener('change', (e) => {
    const val = e.target.value;
    pushUndoCheckpoint('Change Stage Resolution');
    setCanonicalStageResolution(val);
    if (val === 'custom') switchInspTab('output');
    syncTopbarUI();
    syncOutputInspectorUI();
    scheduleAutosave();
    showToast(`Canonical Stage: ${state.stageWidth}×${state.stageHeight}`);
  });

  bindInspectorSlider('ctrl-master-opacity', (val) => {
    state.masterOpacity = val;
    document.getElementById('val-master-opacity').textContent = `${Math.round(val * 100)}%`;
  });

  document.getElementById('btn-show-lock').addEventListener('click', () => toggleShowLock());

  const dboBtn = document.getElementById('btn-blackout');
  dboBtn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    beginBlackoutPress(e.shiftKey);
  });
  dboBtn.addEventListener('pointerup', () => cancelOrFinishBlackoutPress());
  dboBtn.addEventListener('pointerleave', () => cancelOrFinishBlackoutPress());
  dboBtn.addEventListener('pointercancel', () => cancelOrFinishBlackoutPress());
  dboBtn.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault();
      beginBlackoutPress(e.shiftKey);
    }
  });
  dboBtn.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      cancelOrFinishBlackoutPress();
    }
  });
  dboBtn.addEventListener('click', (e) => {
    // Programmatic .click() fallback (e.detail === 0 when synthesized)
    if (e.detail === 0 && !e.isTrusted) {
      setBlackoutImmediate(!state.blackout);
    }
  });

  document.getElementById('btn-eco-mode').addEventListener('click', () => toggleEcoMode());
  document.getElementById('btn-launch-projector').addEventListener('click', () => launchProjectorWindow());
  document.getElementById('btn-projector-local').addEventListener('click', () => toggleLocalProjectorMode());

  document.getElementById('projector-banner').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    document.getElementById('projector-banner').classList.remove('show');
  });

  // 3. Left Dock Tabs, Surfaces, Masks, Media & Cues
  document.getElementById('tab-left-surfaces').addEventListener('click', () => switchLeftTab('surfaces'));
  document.getElementById('tab-left-masks').addEventListener('click', () => switchLeftTab('masks'));

  const addNewSurfaceUI = (type) => {
    if (state.showLock) { showToast('🔒 Show Lock active — press Shift+P to unlock'); return; }
    pushUndoCheckpoint(`Add ${type} Surface`);
    const s = createSurface(type, { sourceId: state.activeSourceId || 'src_shards' });
    state.surfaces.unshift(s);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    switchLeftTab('surfaces');
    switchInspTab('surface');
    selectSurface(s.id, false);
    scheduleAutosave();
    showToast(`Added ${s.name}`);
  };
  document.getElementById('btn-add-quad').addEventListener('click', () => addNewSurfaceUI('quad'));
  document.getElementById('btn-add-tri').addEventListener('click', () => addNewSurfaceUI('triangle'));
  document.getElementById('btn-add-circle').addEventListener('click', () => addNewSurfaceUI('circle'));
  document.getElementById('btn-add-poly').addEventListener('click', () => startNewInteractiveSurfaceDrawing('polygon'));
  document.getElementById('btn-add-line').addEventListener('click', () => startNewInteractiveSurfaceDrawing('line'));
  document.getElementById('btn-add-3d').addEventListener('click', () => addNewSurfaceUI('mesh3d'));
  document.getElementById('btn-finish-surf').addEventListener('click', () => finishActiveSurfaceDrawing());
  document.getElementById('btn-add-group').addEventListener('click', () => createGroupFromSelection());
  document.getElementById('btn-quick-mask').addEventListener('click', () => startNewPolygonMaskDrawing());

  let objImportReplaceSelected = false;
  const objFileInput = document.getElementById('obj-file-input');
  const triggerObjPicker = (replaceSelected = false) => {
    if (state.showLock) { showToast('🔒 Show Lock active — press Shift+P to unlock'); return; }
    if (state.drawingSurfaceId) finishActiveSurfaceDrawing();
    if (state.drawingMaskId) finishActiveMaskDrawing();
    objImportReplaceSelected = !!replaceSelected;
    objFileInput.click();
  };
  document.getElementById('btn-import-obj').addEventListener('click', () => triggerObjPicker(false));
  document.getElementById('btn-3d-load-obj').addEventListener('click', () => triggerObjPicker(true));
  objFileInput.addEventListener('change', () => {
    const f = objFileInput.files && objFileInput.files[0];
    if (f) {
      const r = new FileReader();
      r.onload = () => {
        if (typeof r.result !== 'string') return;
        const sel = getSelectedSurface();
        try {
          importObjMeshAsSurface(
            r.result,
            f.name,
            (objImportReplaceSelected && sel && sel.type === 'mesh3d') ? sel : null
          );
        } catch (err) {
          showToast(`OBJ parse error: ${err.message || err}`);
        }
      };
      r.readAsText(f);
    }
    objFileInput.value = '';
  });

  let svgImportTargetMode = 'surfaces';
  const svgFileInput = document.getElementById('svg-file-input');
  const triggerSvgPicker = (mode) => {
    if (state.showLock) { showToast('🔒 Show Lock active — press Shift+P to unlock'); return; }
    if (state.drawingSurfaceId) finishActiveSurfaceDrawing();
    if (state.drawingMaskId) finishActiveMaskDrawing();
    svgImportTargetMode = mode;
    svgFileInput.click();
  };
  document.getElementById('btn-import-svg').addEventListener('click', () => triggerSvgPicker('surfaces'));
  document.getElementById('btn-import-svg-mask').addEventListener('click', () => triggerSvgPicker('masks'));
  document.getElementById('btn-insp-svg-mask').addEventListener('click', () => triggerSvgPicker('masks'));
  svgFileInput.addEventListener('change', () => {
    const f = svgFileInput.files && svgFileInput.files[0];
    if (f) {
      const r = new FileReader();
      r.onload = () => {
        if (typeof r.result === 'string') {
          const stem = f.name ? f.name.replace(/\.[^.]+$/, '') : 'SVG';
          importSvgIntoScene(r.result, svgImportTargetMode, stem);
        }
      };
      r.readAsText(f);
    }
    svgFileInput.value = '';
  });

  document.getElementById('btn-dup-surf').addEventListener('click', () => {
    if (state.showLock) { showToast('🔒 Show Lock active'); return; }
    const sel = getSelectedSurface();
    if (!sel) return;
    pushUndoCheckpoint(`Duplicate ${sel.name}`);
    const copyData = cloneSurfaceData(sel);
    delete copyData.id;
    copyData.name = `${sel.name} Copy`;
    copyData.locked = false;
    copyData.points = sel.points.map(p => [clamp(p[0] + 0.03, -0.3, 1.3), clamp(p[1] - 0.03, -0.3, 1.3)]);
    if (copyData.meshPts) {
      copyData.meshPts = copyData.meshPts.map(p => [p[0] + 0.03, p[1] - 0.03]);
    }
    if (sel.type === 'mesh3d') {
      if (copyData.calibMode === 'calibrated' && Array.isArray(copyData.calibPins)) {
        copyData.calibPins = copyData.calibPins.map(cp => ({
          ...cp,
          stage2d: [clamp(cp.stage2d[0] + 0.03, -0.3, 1.3), clamp(cp.stage2d[1] - 0.03, -0.3, 1.3)]
        }));
      } else {
        const p3 = Array.isArray(copyData.pos3d) ? copyData.pos3d : [0, 0, 0];
        copyData.pos3d = [clamp(p3[0] + 0.22, -3, 3), clamp(p3[1] - 0.12, -3, 3), p3[2] || 0];
      }
    }
    const dup = createSurface(sel.type, copyData);
    const idx = state.surfaces.findIndex(s => s.id === sel.id);
    state.surfaces.splice(Math.max(0, idx), 0, dup);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    selectSurface(dup.id, false);
    scheduleAutosave();
    showToast(`Duplicated ${sel.name}`);
  });

  document.getElementById('btn-up-surf').addEventListener('click', () => {
    if (state.showLock) return;
    const idx = state.surfaces.findIndex(s => s.id === state.selectedSurfaceId);
    if (idx > 0) {
      pushUndoCheckpoint('Move Surface Up');
      const [item] = state.surfaces.splice(idx, 1);
      state.surfaces.splice(idx - 1, 0, item);
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      renderSurfaceList();
      syncInspectorUI();
      scheduleAutosave();
    }
  });

  document.getElementById('btn-down-surf').addEventListener('click', () => {
    if (state.showLock) return;
    const idx = state.surfaces.findIndex(s => s.id === state.selectedSurfaceId);
    if (idx >= 0 && idx < state.surfaces.length - 1) {
      pushUndoCheckpoint('Move Surface Down');
      const [item] = state.surfaces.splice(idx, 1);
      state.surfaces.splice(idx + 1, 0, item);
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      renderSurfaceList();
      syncInspectorUI();
      scheduleAutosave();
    }
  });

  document.getElementById('btn-del-surf').addEventListener('click', () => {
    if (state.showLock) { showToast('🔒 Show Lock active'); return; }
    const targets = getSelectedSurfaces();
    if (targets.length === 0) return;
    const deletable = targets.filter(s => !getEffectiveSurfaceProps(s).locked);
    if (deletable.length === 0) { showToast('Unlock surface(s) first before deleting'); return; }
    pushUndoCheckpoint(deletable.length > 1 ? `Delete ${deletable.length} Surfaces` : `Delete ${deletable[0].name}`);
    const delSet = new Set(deletable.map(s => s.id));
    state.surfaces = state.surfaces.filter(s => !delSet.has(s.id));
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    const next = state.surfaces[0] || null;
    selectSurface(next ? next.id : null, true);
    scheduleAutosave();
    showToast(deletable.length > 1 ? `Deleted ${deletable.length} surfaces` : `Deleted ${deletable[0].name}`);
  });

  document.getElementById('btn-clear-solo').addEventListener('click', () => {
    pushUndoCheckpoint('Clear Solo');
    state.surfaces.forEach(s => { s.solo = false; });
    if (Array.isArray(state.groups)) state.groups.forEach(g => { g.solo = false; });
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    scheduleAutosave();
  });

  // Mask Panel Buttons
  const addRectMaskUI = () => {
    if (state.showLock) { showToast('🔒 Show Lock active'); return; }
    if (state.drawingMaskId) finishActiveMaskDrawing();
    pushUndoCheckpoint('Add Rect Mask');
    const m = createMask({
      name: `Rect Cutout ${state.nextMaskNum}`,
      mode: 'subtract',
      target: 'all'
    });
    state.masks.unshift(m);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    switchLeftTab('masks');
    switchInspTab('mask');
    selectMask(m.id);
    scheduleAutosave();
    showToast(`Added ${m.name}`);
  };
  document.getElementById('btn-draw-mask').addEventListener('click', () => startNewPolygonMaskDrawing());
  document.getElementById('btn-insp-draw-mask').addEventListener('click', () => startNewPolygonMaskDrawing());
  document.getElementById('btn-add-rect-mask').addEventListener('click', addRectMaskUI);
  document.getElementById('btn-insp-rect-mask').addEventListener('click', addRectMaskUI);
  document.getElementById('btn-finish-mask').addEventListener('click', () => finishActiveMaskDrawing());

  document.getElementById('btn-dup-mask').addEventListener('click', () => {
    if (state.showLock) { showToast('🔒 Show Lock active'); return; }
    const m = getSelectedMask();
    if (!m) return;
    pushUndoCheckpoint(`Duplicate ${m.name}`);
    const dup = createMask({
      ...cloneMaskData(m),
      id: undefined,
      name: `${m.name} Copy`,
      locked: false,
      points: m.points.map(p => [p[0] + 0.03, p[1] - 0.03])
    });
    state.masks.unshift(dup);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    selectMask(dup.id);
    scheduleAutosave();
  });

  document.getElementById('btn-del-mask').addEventListener('click', () => {
    if (state.showLock) { showToast('🔒 Show Lock active'); return; }
    const m = getSelectedMask();
    if (!m) return;
    if (m.locked) { showToast('Unlock mask before deleting'); return; }
    pushUndoCheckpoint(`Delete ${m.name}`);
    if (state.drawingMaskId === m.id) state.drawingMaskId = null;
    state.masks = state.masks.filter(x => x.id !== m.id);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    selectMask(state.masks[0] ? state.masks[0].id : null);
    scheduleAutosave();
    showToast(`Deleted ${m.name}`);
  });

  // Media Bin Import, Built-In Demo Videos, Browser Screen Capture, Stage Typography, Live ISF Studio & Community Plugins
  const fileInputEl = document.getElementById('file-input');
  document.getElementById('btn-import-file').addEventListener('click', () => pickMediaFilesWithHandles(false, fileInputEl));
  document.getElementById('btn-demo-vid-1')?.addEventListener('click', () => {
    if (typeof loadBuiltInDemoVideo === 'function') loadBuiltInDemoVideo('drums', true);
  });
  document.getElementById('btn-demo-vid-2')?.addEventListener('click', () => {
    if (typeof loadBuiltInDemoVideo === 'function') loadBuiltInDemoVideo('beams', true);
  });
  fileInputEl.addEventListener('change', () => {
    if (fileInputEl.files && fileInputEl.files.length > 0) {
      handleDroppedOrPickedFiles(fileInputEl.files);
      fileInputEl.value = '';
    }
  });
  document.getElementById('btn-add-capture').addEventListener('click', () => addScreenCaptureSource());
  document.getElementById('btn-add-text').addEventListener('click', () => {
    if (state.showLock) { showToast('🔒 Show Lock active — press Shift+P to unlock'); return; }
    pushUndoCheckpoint('Create Stage Typography');
    const created = addNewTextSource({}, true);
    openTextStudioModal(created.id);
    scheduleAutosave();
    showToast(`Created Stage Typography: ${created.name}`);
  });
  document.getElementById('btn-add-videolight')?.addEventListener('click', () => {
    if (state.showLock) { showToast('🔒 Show Lock active — press Shift+P to unlock'); return; }
    pushUndoCheckpoint('Activate Stage Gobo Light');
    state.activeSourceId = 'src_videolight';
    const selSurfs = getSelectedSurfaces().filter(s => !getEffectiveSurfaceProps(s).locked);
    if (selSurfs.length > 0) {
      selSurfs.forEach(s => { s.sourceId = 'src_videolight'; });
    } else {
      const lightSurf = createSurface('quad', {
        name: `Stage Light ${state.nextSurfaceNum}`,
        sourceId: 'src_videolight',
        blendMode: 'additive',
        feather: 0.045,
        shutterL: 0.08,
        shutterR: 0.08,
        shutterAngL: 8,
        shutterAngR: -8
      });
      state.surfaces.unshift(lightSurf);
      state.selectedSurfaceIds = [lightSurf.id];
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderMediaBin();
    renderSurfaceList();
    syncInspectorUI();
    syncTransportUI();
    scheduleAutosave();
    showToast('💡 Stage Gobo Video-as-Light Active — Adjust Gobo & Frost in Transport Bar');
  });
  const isfFileInputEl = document.getElementById('isf-file-input');
  document.getElementById('btn-import-isf').addEventListener('click', () => isfFileInputEl.click());
  isfFileInputEl.addEventListener('change', () => {
    if (isfFileInputEl.files && isfFileInputEl.files.length > 0) {
      handleDroppedOrPickedFiles(isfFileInputEl.files);
      isfFileInputEl.value = '';
    }
  });
  document.getElementById('btn-new-isf').addEventListener('click', () => {
    if (state.showLock) { showToast('🔒 Show Lock active — press Shift+P to unlock'); return; }
    pushUndoCheckpoint('Create ISF Shader');
    const created = addNewCustomIsfSource({}, true);
    openShaderStudioDrawer(created.id);
    scheduleAutosave();
    showToast(`Created Live ISF Shader: ${created.name}`);
  });
  document.getElementById('btn-add-cam').addEventListener('click', () => addLiveCameraSource());

  // Live ISF v2 / GLSL Shader Studio Drawer Controls
  let isfCompileDebounce = null;
  const triggerLiveIsfCompile = (showFeedbackToast = false) => {
    const srcObj = getActiveEditorIsfSource();
    const codeEl = document.getElementById('isf-code-editor');
    if (!srcObj || !codeEl) return;
    const prevSig = JSON.stringify((srcObj.isfMeta?.inputs || []).map(i => `${i.name}:${i.type}:${i.min}:${i.max}`));
    const res = compileAndAttachIsfSource(srcObj, codeEl.value);
    syncShaderStudioCompileLog(srcObj);
    renderMediaBin();
    if (res.ok) {
      const nextSig = JSON.stringify((srcObj.isfMeta?.inputs || []).map(i => `${i.name}:${i.type}:${i.min}:${i.max}`));
      if (showFeedbackToast || nextSig !== prevSig) {
        renderIsfDynamicParamsUI(srcObj);
      }
      scheduleAutosave();
      if (showFeedbackToast) showToast(`✓ Compiled ${srcObj.name}`);
    } else if (showFeedbackToast) {
      showToast('⚠ Shader compile error — check compiler log');
    }
  };

  document.getElementById('sel-isf-source').addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    state.shaderEditorSourceId = id;
    state.activeSourceId = id;
    syncShaderStudioUI(true);
    renderMediaBin();
    syncTransportUI();
  });
  document.getElementById('inp-isf-name').addEventListener('input', (e) => {
    const srcObj = getActiveEditorIsfSource();
    if (!srcObj) return;
    srcObj.name = e.target.value || 'ISF Shader';
    const selOpt = document.querySelector(`#sel-isf-source option[value="${srcObj.id}"]`);
    if (selOpt) selOpt.textContent = srcObj.name;
    state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    renderMediaBin();
    renderSurfaceList();
    syncInspectorUI();
    syncTransportUI();
    scheduleAutosave();
  });
  document.getElementById('sel-isf-template').addEventListener('change', (e) => {
    const key = e.target.value;
    e.target.value = '';
    if (!key || !ISF_STARTER_TEMPLATES[key]) return;
    let srcObj = getActiveEditorIsfSource();
    if (!srcObj) srcObj = addNewCustomIsfSource({}, true);
    const tpl = ISF_STARTER_TEMPLATES[key];
    pushUndoCheckpoint(`Load ISF Template ${tpl.name}`);
    srcObj.isfValues = {};
    compileAndAttachIsfSource(srcObj, tpl.code);
    syncShaderStudioUI(true);
    renderMediaBin();
    scheduleAutosave();
    showToast(`Loaded ISF Template: ${tpl.name}`);
  });
  document.getElementById('btn-isf-compile').addEventListener('click', () => {
    clearTimeout(isfCompileDebounce);
    triggerLiveIsfCompile(true);
  });
  document.getElementById('chk-isf-autocompile').addEventListener('change', (e) => {
    state.shaderAutoCompile = !!e.target.checked;
  });

  const isfCodeEditor = document.getElementById('isf-code-editor');
  isfCodeEditor.addEventListener('input', () => {
    if (state.shaderAutoCompile !== false) {
      clearTimeout(isfCompileDebounce);
      isfCompileDebounce = setTimeout(() => triggerLiveIsfCompile(false), 200);
    }
  });
  isfCodeEditor.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(isfCompileDebounce);
      triggerLiveIsfCompile(true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const s = isfCodeEditor.selectionStart;
      const end = isfCodeEditor.selectionEnd;
      isfCodeEditor.setRangeText('  ', s, end, 'end');
      if (state.shaderAutoCompile !== false) {
        clearTimeout(isfCompileDebounce);
        isfCompileDebounce = setTimeout(() => triggerLiveIsfCompile(false), 200);
      }
    }
  });

  document.getElementById('btn-isf-register-fx').addEventListener('click', () => {
    const srcObj = getActiveEditorIsfSource();
    if (!srcObj || !srcObj.isfCode) return;
    const reg = registerCustomFxPlugin({
      id: srcObj.name,
      name: srcObj.name,
      author: srcObj.author,
      license: srcObj.license,
      isfCode: srcObj.isfCode,
      defaultValues: srcObj.isfValues
    });
    if (!reg.ok) {
      showToast(`FX Compile Error: ${reg.error}`);
      return;
    }
    const sel = getSelectedSurface();
    if (sel) {
      pushUndoCheckpoint(`Install FX ${reg.plugin.name}`);
      if (!Array.isArray(sel.fxChain)) sel.fxChain = [];
      sel.fxChain.push(createFxInstance(reg.plugin.type));
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      renderSurfaceList();
      syncInspectorUI();
    }
    syncOutputInspectorUI();
    scheduleAutosave();
    showToast(`Installed "${reg.plugin.name}" into GPU Post-FX Rack`);
  });
  document.getElementById('btn-isf-import').addEventListener('click', () => isfFileInputEl.click());
  document.getElementById('btn-isf-export-fs').addEventListener('click', () => {
    const srcObj = getActiveEditorIsfSource();
    if (srcObj) exportShaderAsFsFile(srcObj);
  });
  document.getElementById('btn-isf-export-plugin').addEventListener('click', () => {
    const srcObj = getActiveEditorIsfSource();
    if (srcObj) exportShaderAsWmPluginFile(srcObj);
  });
  document.getElementById('btn-isf-close').addEventListener('click', () => closeShaderStudioDrawer());

  // Cue Deck Controls & Selective Recall Filter Strip
  document.getElementById('btn-cue-scope')?.addEventListener('click', () => toggleCueRecordScope());
  document.getElementById('btn-cue-go').addEventListener('click', () => stepCue(1));
  document.getElementById('btn-cue-prev').addEventListener('click', () => stepCue(-1));
  document.getElementById('btn-cue-store').addEventListener('click', () => storeNewCue());
  document.getElementById('btn-cue-store-deck')?.addEventListener('click', () => storeNewCue({ cueRole: 'deck', priorityMode: 'override' }));
  document.getElementById('btn-cue-update').addEventListener('click', () => updateActiveCue());
  document.getElementById('btn-cue-del').addEventListener('click', () => deleteActiveCue());

  const mutateActiveCueFilter = (applyFn) => {
    const targetCid = state.selectedCueId || state.activeCueId;
    const cue = state.cues.find(c => c.id === targetCid) || state.cues.find(c => c.id === state.activeCueId) || state.cues[0];
    if (!cue) return;
    ensureCueMilestone5Props(cue, state.cues.indexOf(cue), state.cues.length);
    applyFn(cue);
    renderCueList();
    if (state.room === 'live' && typeof renderLivePerformanceDockUI === 'function') renderLivePerformanceDockUI();
    scheduleAutosave();
  };
  document.getElementById('chk-cue-rf-geom').addEventListener('change', (e) => mutateActiveCueFilter(c => { c.recallFilter.geometry = e.target.checked; }));
  document.getElementById('chk-cue-rf-media').addEventListener('change', (e) => mutateActiveCueFilter(c => { c.recallFilter.media = e.target.checked; }));
  document.getElementById('chk-cue-rf-fx').addEventListener('change', (e) => mutateActiveCueFilter(c => { c.recallFilter.gradingFx = e.target.checked; }));
  document.getElementById('chk-cue-rf-masks').addEventListener('change', (e) => mutateActiveCueFilter(c => { c.recallFilter.masks = e.target.checked; }));
  document.getElementById('chk-cue-rf-spot').addEventListener('change', (e) => mutateActiveCueFilter(c => { c.recallFilter.followspot = e.target.checked; }));
  document.getElementById('chk-cue-rf-mods').addEventListener('change', (e) => mutateActiveCueFilter(c => { c.recallFilter.modulators = e.target.checked; }));
  document.getElementById('chk-cue-autofollow').addEventListener('change', (e) => mutateActiveCueFilter(c => {
    c.autoFollow = e.target.checked;
    if (!c.autoFollow) cancelCueAutoFollow();
  }));
  document.getElementById('inp-cue-wait').addEventListener('change', (e) => mutateActiveCueFilter(c => {
    c.waitSec = clamp(parseFloat(e.target.value) || 0, 0, 600);
  }));
  document.getElementById('chk-cue-retrig').addEventListener('change', (e) => mutateActiveCueFilter(c => {
    c.retriggerVideos = e.target.checked;
  }));

  // ◎ Mix Pane (Spatial Radar & 2D Cue Constellation) + Keyframe Show Timeline
  bindMixDeckInteractions();
  document.getElementById('btn-mixtab-radar').addEventListener('click', () => {
    state.mixDeckTab = 'radar';
    syncMixPaneToolbarUI();
  });
  document.getElementById('btn-mixtab-constellation').addEventListener('click', () => {
    state.mixDeckTab = 'constellation';
    syncMixPaneToolbarUI();
  });
  document.getElementById('btn-mixpane-add-orb').addEventListener('click', () => {
    const mixSrc = getMixbusSource();
    if (!mixSrc) return;
    pushUndoCheckpoint('Add Mix Radar Orb');
    const candidate = (state.activeSourceId && state.activeSourceId !== mixSrc.id)
      ? state.activeSourceId
      : (state.sources.find(s => s.id !== mixSrc.id && s.kind !== 'mixbus')?.id || 'src_shards');
    addMixbusOrb(mixSrc, candidate);
    renderMediaBin();
    syncTransportUI();
    scheduleAutosave();
    showToast('◎ Added Source Orb to the Spatial Radar');
  });
  document.getElementById('btn-mixpane-route-surf').addEventListener('click', () => routeMixbusToSurfaceSelection(false));
  document.getElementById('btn-mixpane-route-all').addEventListener('click', () => routeMixbusToSurfaceSelection(true));
  document.getElementById('btn-const-circle').addEventListener('click', () => {
    pushUndoCheckpoint('Arrange Constellation Circle');
    autoArrangeConstellationNodes('circle');
    scheduleAutosave();
  });
  document.getElementById('btn-const-grid').addEventListener('click', () => {
    pushUndoCheckpoint('Arrange Constellation Grid');
    autoArrangeConstellationNodes('grid');
    scheduleAutosave();
  });
  document.getElementById('chk-const-media').addEventListener('change', (e) => {
    state.constellation.switchMedia = !!e.target.checked;
    scheduleAutosave();
  });

  bindTimelineInteractions();
  document.getElementById('btn-tl-play').addEventListener('click', () => {
    state.timeline.playing = !state.timeline.playing;
    syncTimelineToolbarUI();
  });
  document.getElementById('btn-tl-zero').addEventListener('click', () => {
    state.timeline.playhead = 0;
    applyTimelineAtPlayhead(0);
    syncTimelineToolbarUI();
    renderTimelineCanvas();
  });
  document.getElementById('btn-tl-loop').addEventListener('click', () => {
    state.timeline.loop = !state.timeline.loop;
    syncTimelineToolbarUI();
    scheduleAutosave();
  });
  document.getElementById('inp-tl-dur').addEventListener('change', (e) => {
    state.timeline.duration = clamp(parseFloat(e.target.value) || 30, 2, 1800);
    state.timeline.playhead = Math.min(state.timeline.playhead, state.timeline.duration);
    syncTimelineToolbarUI();
    renderTimelineCanvas();
    scheduleAutosave();
  });
  document.getElementById('sel-tl-zoom').addEventListener('change', (e) => {
    state.timeline.zoom = clamp(parseFloat(e.target.value) || 1, 1, 10);
    renderTimelineCanvas();
  });
  document.getElementById('sel-tl-curve').addEventListener('change', (e) => {
    const tr = state.timeline.tracks.find(t => t.id === state.timeline.selectedTrackId);
    const kf = tr?.keyframes?.find(k => k.id === state.timeline.selectedKfId);
    if (kf) {
      kf.curve = e.target.value;
      renderTimelineCanvas();
      scheduleAutosave();
    }
  });
  document.getElementById('btn-tl-add-lane').addEventListener('click', () => {
    const tKey = document.getElementById('sel-mod-target')?.value || 'master:opacity';
    addTimelineTrackForTarget(tKey);
  });
  document.getElementById('btn-tl-add-kf').addEventListener('click', () => {
    const curve = document.getElementById('sel-tl-curve')?.value || 'smooth';
    addKeyframeAtPlayhead(state.timeline.selectedTrackId, curve);
  });
  document.getElementById('btn-tl-add-cueflag').addEventListener('click', () => {
    addTimelineCueMarker(state.activeCueId, state.timeline.playhead);
  });
  document.getElementById('btn-tl-close').addEventListener('click', () => toggleTimelineDrawer(false));

  // 4. Center Input UV / 3D Orbit & Stage Toolbar Quick Actions
  document.getElementById('btn-input-orbit').addEventListener('click', () => {
    state.input3DOrbitMode = true;
    syncInputPaneModeBarUI();
  });
  document.getElementById('btn-input-uv2d').addEventListener('click', () => {
    state.input3DOrbitMode = false;
    syncInputPaneModeBarUI();
  });
  document.getElementById('btn-orbit-reset').addEventListener('click', () => {
    state.orbit3D = { yaw: -34, pitch: 22, dist: 2.65, panX: 0, panY: 0 };
  });

  document.getElementById('btn-input-reset-zoom').addEventListener('click', () => { state.inputView = { zoom: 1, panX: 0, panY: 0 }; });
  document.getElementById('btn-stage-reset-zoom').addEventListener('click', () => { state.stageView = { zoom: 1, panX: 0, panY: 0 }; });

  document.getElementById('btn-uv-full').addEventListener('click', () => {
    const sel = getSelectedSurface();
    if (!sel || getEffectiveSurfaceProps(sel).locked || state.showLock) return;
    pushUndoCheckpoint('UV Full Frame');
    sel.uvX = 0.5; sel.uvY = 0.5; sel.uvW = 1.0; sel.uvH = 1.0; sel.uvRot = 0;
    sel.cropL = 0; sel.cropR = 0; sel.cropT = 0; sel.cropB = 0;
    sel.triUvs = [[0.15, 0.15], [0.85, 0.15], [0.50, 0.88]];
    if (sel.type === 'polygon') syncPolygonUvsFromStage(sel);
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncUvSlidersFromSelected();
    scheduleAutosave();
  });

  document.getElementById('btn-uv-match').addEventListener('click', () => {
    const sel = getSelectedSurface();
    if (!sel || getEffectiveSurfaceProps(sel).locked || state.showLock) return;
    pushUndoCheckpoint('UV Match Stage');
    if (sel.type === 'triangle') {
      sel.triUvs = sel.points.map(p => [clamp(p[0], 0, 1), clamp(p[1], 0, 1)]);
    } else if (sel.type === 'polygon') {
      syncPolygonUvsFromStage(sel);
      bumpSurfaceGeom(sel);
    } else {
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      const samplePts = sel.type === 'mesh3d' ? getSurfacePerimeterContour(sel).pts : sel.points;
      samplePts.forEach(p => {
        minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
        maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
      });
      sel.uvX = clamp((minX + maxX) * 0.5, 0, 1);
      sel.uvY = clamp((minY + maxY) * 0.5, 0, 1);
      sel.uvW = clamp(maxX - minX, 0.05, 1.5);
      sel.uvH = clamp(maxY - minY, 0.05, 1.5);
      sel.uvRot = 0;
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncUvSlidersFromSelected();
    scheduleAutosave();
    showToast('Matched Input UV to Stage footprint');
  });

  document.getElementById('btn-uv-lhalf').addEventListener('click', () => {
    const sel = getSelectedSurface();
    if (!sel || getEffectiveSurfaceProps(sel).locked || state.showLock) return;
    pushUndoCheckpoint('UV Left Half');
    sel.uvX = 0.25; sel.uvY = 0.5; sel.uvW = 0.5; sel.uvH = 1.0; sel.uvRot = 0;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncUvSlidersFromSelected();
    scheduleAutosave();
  });
  document.getElementById('btn-uv-rhalf').addEventListener('click', () => {
    const sel = getSelectedSurface();
    if (!sel || getEffectiveSurfaceProps(sel).locked || state.showLock) return;
    pushUndoCheckpoint('UV Right Half');
    sel.uvX = 0.75; sel.uvY = 0.5; sel.uvW = 0.5; sel.uvH = 1.0; sel.uvRot = 0;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncUvSlidersFromSelected();
    scheduleAutosave();
  });

  // 5. Right Dock Inspector Tabs & WAI-ARIA Tablist Arrow-Key Navigation
  document.getElementById('tab-insp-surface').addEventListener('click', () => switchInspTab('surface'));
  document.getElementById('tab-insp-mask').addEventListener('click', () => switchInspTab('mask'));
  document.getElementById('tab-insp-spot').addEventListener('click', () => switchInspTab('spot'));
  document.getElementById('tab-insp-output').addEventListener('click', () => switchInspTab('output'));
  document.getElementById('tab-insp-mod').addEventListener('click', () => switchInspTab('mod'));

  for (const tablist of document.querySelectorAll('[role="tablist"]')) {
    tablist.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
      const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
      if (tabs.length === 0) return;
      const curIdx = tabs.indexOf(document.activeElement);
      if (curIdx < 0) return;
      e.preventDefault();
      let nextIdx = curIdx;
      if (e.key === 'ArrowRight') nextIdx = (curIdx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') nextIdx = (curIdx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = tabs.length - 1;
      const nextTab = tabs[nextIdx];
      if (nextTab) {
        nextTab.focus();
        nextTab.click();
      }
    });
  }

  bindImeSafeBlurOnEnter(document.getElementById('inp-isf-name'));
  bindImeSafeBlurOnEnter(document.getElementById('inp-surf-name'));
  bindImeSafeBlurOnEnter(document.getElementById('inp-mask-name'));

  // Surface Inspector
  document.getElementById('inp-surf-name').addEventListener('input', (e) => {
    const sel = getSelectedSurface();
    if (!sel) return;
    sel.name = e.target.value || 'Surface';
    renderSurfaceList();
    scheduleAutosave();
  });

  document.getElementById('sel-surf-source').addEventListener('change', (e) => {
    const sel = getSelectedSurface();
    if (!sel) return;
    pushUndoCheckpoint('Change Surface Source');
    sel.sourceId = e.target.value;
    state.activeSourceId = sel.sourceId;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    renderMediaBin();
    syncTransportUI();
    scheduleAutosave();
  });

  document.getElementById('sel-quad-warp').addEventListener('change', (e) => {
    const sel = getSelectedSurface();
    if (!sel || state.showLock) return;
    pushUndoCheckpoint('Change Warp Mode');
    const prevCurved = isCurvedMeshSurface(sel);
    sel.quadWarp = e.target.value;
    if (!prevCurved && isCurvedMeshSurface(sel)) {
      initSurfaceMeshFromCorners(sel);
    }
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    syncInspectorUI();
    scheduleAutosave();
  });

  document.getElementById('sel-mesh-cols').addEventListener('change', (e) => {
    const sel = getSelectedSurface();
    if (!sel || state.showLock) return;
    pushUndoCheckpoint('Resample Mesh Cols');
    resampleSurfaceMesh(sel, parseInt(e.target.value, 10), sel.meshRows || 3);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    scheduleAutosave();
  });

  document.getElementById('sel-mesh-rows').addEventListener('change', (e) => {
    const sel = getSelectedSurface();
    if (!sel || state.showLock) return;
    pushUndoCheckpoint('Resample Mesh Rows');
    resampleSurfaceMesh(sel, sel.meshCols || 3, parseInt(e.target.value, 10));
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    scheduleAutosave();
  });

  bindInspectorSlider('ctrl-mesh-brush', (val) => {
    const sel = getSelectedSurface();
    if (!sel) return;
    sel.meshBrush = val;
    document.getElementById('val-mesh-brush').textContent = `${Math.round(val * 100)}%`;
  });

  document.getElementById('btn-mesh-pin-corners').addEventListener('click', () => {
    const sel = getSelectedSurface();
    if (!sel) return;
    sel.meshPinCorners = !sel.meshPinCorners;
    syncInspectorUI();
    scheduleAutosave();
    showToast(sel.meshPinCorners
      ? '📌 Corner-Pin Transport ON — Corner drags preserve sculpted interior curves'
      : 'Corner-Pin Transport OFF (Hold Cmd/Ctrl while dragging a corner for temporary transport)');
  });

  const bindMeshPresetBtn = (id, preset) => {
    document.getElementById(id).addEventListener('click', () => {
      const sel = getSelectedSurface();
      if (!sel || getEffectiveSurfaceProps(sel).locked || state.showLock) return;
      pushUndoCheckpoint(`Mesh Preset ${preset}`);
      applyMeshPreset(sel, preset);
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      renderSurfaceList();
      syncInspectorUI();
      scheduleAutosave();
    });
  };
  bindMeshPresetBtn('btn-mesh-cylh', 'cylh');
  bindMeshPresetBtn('btn-mesh-cylv', 'cylv');
  bindMeshPresetBtn('btn-mesh-dome', 'dome');
  bindMeshPresetBtn('btn-mesh-pin', 'pin');
  bindMeshPresetBtn('btn-mesh-wave', 'wave');
  bindMeshPresetBtn('btn-mesh-reset', 'reset');

  // Perspective Quad N×M Grid Cloner Modal
  document.getElementById('btn-open-cloner').addEventListener('click', () => openQuadClonerModal());
  bindInspectorSlider('ctrl-clone-gap', (val) => {
    document.getElementById('val-clone-gap').textContent = `${(val * 100).toFixed(1)}%`;
  }, false);
  document.getElementById('btn-clone-exec').addEventListener('click', () => {
    const cols = parseInt(document.getElementById('inp-clone-cols').value, 10) || 3;
    const rows = parseInt(document.getElementById('inp-clone-rows').value, 10) || 3;
    const gap = parseFloat(document.getElementById('ctrl-clone-gap').value) || 0;
    const sliceUv = !!document.getElementById('chk-clone-slice-uv').checked;
    const grp = !!document.getElementById('chk-clone-group').checked;
    const count = executeQuadGridClone(cols, rows, gap, sliceUv, grp);
    if (count > 0 && clonerDialog.open) {
      clonerDialog.close('split');
    }
  });

  bindInspectorSlider('ctrl-circle-soft', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.circleSoftness = val;
    document.getElementById('val-circle-soft').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-circle-inner', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.circleInner = val;
    document.getElementById('val-circle-inner').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-circle-start', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.circleStartAngle = val;
    document.getElementById('val-circle-start').textContent = `${Math.round(val)}°`;
  });
  bindInspectorSlider('ctrl-circle-end', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.circleEndAngle = val;
    document.getElementById('val-circle-end').textContent = `${Math.round(val)}°`;
  });

  // Architectural Line & Chase FX Controls
  document.getElementById('btn-line-closed').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'line' || state.showLock) return;
    pushUndoCheckpoint('Toggle Closed Line');
    sel.lineClosed = !sel.lineClosed;
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-line-source').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'line' || state.showLock) return;
    pushUndoCheckpoint('Toggle Line Media Source');
    sel.lineUseSource = !sel.lineUseSource;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    syncInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('sel-line-chase').addEventListener('change', (e) => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'line') return;
    pushUndoCheckpoint('Change Line Chase Mode');
    sel.lineChaseMode = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    scheduleAutosave();
  });
  bindInspectorSlider('ctrl-line-width', (val) => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'line') return;
    sel.lineWidth = val;
    bumpSurfaceGeom(sel);
    document.getElementById('val-line-width').textContent = `${(val * 100).toFixed(1)}%`;
  });
  bindInspectorSlider('ctrl-line-glow', (val) => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'line') return;
    sel.lineGlow = val;
    bumpSurfaceGeom(sel);
    document.getElementById('val-line-glow').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-line-speed', (val) => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'line') return;
    sel.lineSpeed = val;
    document.getElementById('val-line-speed').textContent = `${val.toFixed(2)}×`;
  });
  bindInspectorSlider('ctrl-line-duty', (val) => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'line') return;
    sel.lineDuty = val;
    document.getElementById('val-line-duty').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-line-count', (val) => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'line') return;
    sel.lineCount = Math.round(val);
    document.getElementById('val-line-count').textContent = String(Math.round(val));
  });

  // Phase 7A: 3D Mesh Object, 6-Point PnP Calibration & Studio Lighting Controls
  document.getElementById('sel-3d-primitive').addEventListener('change', (e) => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'mesh3d' || state.showLock) return;
    const val = e.target.value;
    if (val === 'obj') return;
    pushUndoCheckpoint('Change 3D Primitive');
    sel.mesh3dPrimitive = val;
    sel.objAssetId = null;
    if (sel.calibMode === 'calibrated' && Array.isArray(sel.calibPins) && sel.calibPins.length > 0) {
      const stAspect = (state.stageWidth || 1920) / Math.max(1, state.stageHeight || 1080);
      sel.calibPins = autoSeed6CalibrationPins(sel, stAspect);
    }
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    syncInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('sel-3d-shade').addEventListener('change', (e) => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'mesh3d') return;
    pushUndoCheckpoint('Change 3D Shading Mode');
    sel.shade3d = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  document.getElementById('sel-3d-cull').addEventListener('change', (e) => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'mesh3d') return;
    pushUndoCheckpoint('Change 3D Cull Mode');
    sel.cull3d = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  document.getElementById('btn-3d-calib-manual').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'mesh3d' || state.showLock) return;
    pushUndoCheckpoint('Switch to Manual 3D Pose');
    sel.calibMode = 'manual';
    state.selectedVertex = null;
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    syncInspectorUI();
    syncStageModePill();
    scheduleAutosave();
  });
  document.getElementById('btn-3d-calib-pnp').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'mesh3d' || state.showLock) return;
    pushUndoCheckpoint('Switch to 6-Pt PnP Calibration');
    sel.calibMode = 'calibrated';
    state.input3DOrbitMode = true;
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    syncInspectorUI();
    syncStageModePill();
    scheduleAutosave();
  });
  document.getElementById('btn-3d-autoseed').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'mesh3d' || state.showLock) return;
    const stAspect = (state.stageWidth || 1920) / Math.max(1, state.stageHeight || 1080);
    const seeded = autoSeed6CalibrationPins(sel, stAspect);
    if (!seeded.length) {
      showToast('3D model needs at least 6 unique vertices for PnP calibration');
      return;
    }
    pushUndoCheckpoint('Auto-Seed 6 Calibration Pins');
    sel.calibPins = seeded;
    sel.calibMode = 'calibrated';
    state.selectedCalibPinIdx = 0;
    state.selectedVertex = { kind: 'calib-pin', surfId: sel.id, idx: 0 };
    state.input3DOrbitMode = true;
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    syncInspectorUI();
    syncStageModePill();
    scheduleAutosave();
    showToast('🎯 Auto-Seeded 6 3D Pins — drag P1..P6 crosshairs onto physical object!');
  });
  document.getElementById('btn-3d-clear-pins').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'mesh3d' || state.showLock) return;
    if (!sel.calibPins || sel.calibPins.length === 0) return;
    pushUndoCheckpoint('Clear 3D Calibration Pins');
    sel.calibPins = [];
    state.selectedCalibPinIdx = 0;
    state.selectedVertex = null;
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-3d-drop-outlier')?.addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'mesh3d' || state.showLock) return;
    if (!Array.isArray(sel.calibPins) || sel.calibPins.length < 7) {
      showToast('Need 7+ calibration pins to drop an outlier while keeping a 6-pin PnP lock');
      return;
    }
    const stAspect = (state.stageWidth || 1920) / Math.max(1, state.stageHeight || 1080);
    const solved = solveSurfacePnP(sel, stAspect, state.stageWidth || 1920, state.stageHeight || 1080);
    const errs = Array.isArray(solved?.pinErrorsPx) ? solved.pinErrorsPx : [];
    let worstIdx = 0, worstErr = -1;
    for (let i = 0; i < sel.calibPins.length; i++) {
      const ePx = Number(errs[i]) || 0;
      if (ePx > worstErr) { worstErr = ePx; worstIdx = i; }
    }
    pushUndoCheckpoint(`Drop Worst PnP Pin P${worstIdx + 1}`);
    sel.calibPins.splice(worstIdx, 1);
    state.selectedCalibPinIdx = Math.min(state.selectedCalibPinIdx || 0, sel.calibPins.length - 1);
    state.selectedVertex = null;
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncInspectorUI();
    scheduleAutosave();
    showToast(`✓ Dropped outlier Pin P${worstIdx + 1} (${worstErr.toFixed(1)}px) — re-solved PnP`);
  });
  document.getElementById('btn-3d-reset-pose').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || sel.type !== 'mesh3d' || state.showLock) return;
    pushUndoCheckpoint('Reset 3D Pose & Lens');
    sel.pos3d = [0, 0, 0];
    sel.rot3d = [18, -28, 0];
    sel.scale3d = [1, 1, 1];
    sel.camThrow = 1.20;
    sel.camDist = 3.20;
    sel.lensShiftX = 0;
    sel.lensShiftY = 0;
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncInspectorUI();
    scheduleAutosave();
  });

  bindInspectorSlider('ctrl-3d-posx', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    if (!Array.isArray(s.pos3d)) s.pos3d = [0, 0, 0];
    s.pos3d[0] = val; bumpSurfaceGeom(s);
    document.getElementById('val-3d-posx').textContent = val.toFixed(2);
  });
  bindInspectorSlider('ctrl-3d-posy', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    if (!Array.isArray(s.pos3d)) s.pos3d = [0, 0, 0];
    s.pos3d[1] = val; bumpSurfaceGeom(s);
    document.getElementById('val-3d-posy').textContent = val.toFixed(2);
  });
  bindInspectorSlider('ctrl-3d-posz', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    if (!Array.isArray(s.pos3d)) s.pos3d = [0, 0, 0];
    s.pos3d[2] = val; bumpSurfaceGeom(s);
    document.getElementById('val-3d-posz').textContent = val.toFixed(2);
  });
  bindInspectorSlider('ctrl-3d-rotx', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    if (!Array.isArray(s.rot3d)) s.rot3d = [18, -28, 0];
    s.rot3d[0] = val; bumpSurfaceGeom(s);
    document.getElementById('val-3d-rotx').textContent = `${Math.round(val)}°`;
  });
  bindInspectorSlider('ctrl-3d-roty', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    if (!Array.isArray(s.rot3d)) s.rot3d = [18, -28, 0];
    s.rot3d[1] = val; bumpSurfaceGeom(s);
    document.getElementById('val-3d-roty').textContent = `${Math.round(val)}°`;
  });
  bindInspectorSlider('ctrl-3d-rotz', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    if (!Array.isArray(s.rot3d)) s.rot3d = [18, -28, 0];
    s.rot3d[2] = val; bumpSurfaceGeom(s);
    document.getElementById('val-3d-rotz').textContent = `${Math.round(val)}°`;
  });
  bindInspectorSlider('ctrl-3d-scale', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    s.scale3d = [val, val, val]; bumpSurfaceGeom(s);
    document.getElementById('val-3d-scale').textContent = `${val.toFixed(2)}×`;
  });
  bindInspectorSlider('ctrl-3d-throw', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    s.camThrow = val; bumpSurfaceGeom(s);
    document.getElementById('val-3d-throw').textContent = `${val.toFixed(2)}:1`;
  });
  bindInspectorSlider('ctrl-3d-camdist', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    s.camDist = val; bumpSurfaceGeom(s);
    document.getElementById('val-3d-camdist').textContent = `${val.toFixed(2)}m`;
  });
  bindInspectorSlider('ctrl-3d-shiftx', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    s.lensShiftX = val; bumpSurfaceGeom(s);
    document.getElementById('val-3d-shiftx').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-3d-shifty', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    s.lensShiftY = val; bumpSurfaceGeom(s);
    document.getElementById('val-3d-shifty').textContent = `${Math.round(val * 100)}%`;
  });

  bindInspectorSlider('ctrl-3d-wire-w', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    s.wireWidth = val;
    document.getElementById('val-3d-wire-w').textContent = val <= 0.02 ? 'Off' : `${val.toFixed(2)}px`;
  });
  bindInspectorSlider('ctrl-3d-wire-glow', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    s.wireGlow = val;
    document.getElementById('val-3d-wire-glow').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-3d-wire-chase', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    s.wireChase = val;
    document.getElementById('val-3d-wire-chase').textContent = Math.abs(val) <= 0.01 ? 'Off' : `${val.toFixed(2)}×`;
  });
  document.getElementById('chk-3d-wire-src').addEventListener('change', (e) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    pushUndoCheckpoint('Toggle 3D Wireframe Media Color');
    s.wireUseSource = !!e.target.checked;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  bindInspectorSlider('ctrl-3d-light-az', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    s.lightAzim = val;
    document.getElementById('val-3d-light-az').textContent = `${Math.round(val)}°`;
  });
  bindInspectorSlider('ctrl-3d-light-el', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    s.lightElev = val;
    document.getElementById('val-3d-light-el').textContent = `${Math.round(val)}°`;
  });
  bindInspectorSlider('ctrl-3d-light-spec', (val) => {
    const s = getSelectedSurface(); if (!s || s.type !== 'mesh3d') return;
    s.lightSpec = val;
    document.getElementById('val-3d-light-spec').textContent = `${Math.round(val * 100)}%`;
  });

  // Universal Perimeter Chase Outline FX Controls
  bindInspectorSlider('ctrl-border-width', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.borderWidth = val;
    bumpSurfaceGeom(sel);
    document.getElementById('val-border-width').textContent = val <= 0.0005 ? 'Off' : `${(val * 100).toFixed(1)}%`;
    const extraEl = document.getElementById('border-fx-extra');
    if (extraEl) {
      const showExtra = val > 0.0005;
      extraEl.hidden = !showExtra;
      extraEl.style.display = showExtra ? 'flex' : 'none';
    }
  });
  document.getElementById('sel-border-chase').addEventListener('change', (e) => {
    const sel = getSelectedSurface(); if (!sel) return;
    pushUndoCheckpoint('Change Outline Chase Mode');
    sel.borderChase = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  bindInspectorSlider('ctrl-border-glow', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.borderGlow = val;
    bumpSurfaceGeom(sel);
    document.getElementById('val-border-glow').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-border-speed', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.borderSpeed = val;
    document.getElementById('val-border-speed').textContent = `${val.toFixed(2)}×`;
  });

  document.getElementById('btn-geom-center').addEventListener('click', () => {
    const sel = getSelectedSurface();
    if (!sel || getEffectiveSurfaceProps(sel).locked || state.showLock) return;
    pushUndoCheckpoint('Center Surface');
    if (sel.type === 'mesh3d') {
      if (sel.calibMode === 'calibrated' && Array.isArray(sel.calibPins)) {
        const [cx, cy] = getSurfaceCentroid(sel);
        const dx = 0.5 - cx, dy = 0.5 - cy;
        sel.calibPins.forEach(cp => { if (cp?.stage2d) cp.stage2d = [cp.stage2d[0] + dx, cp.stage2d[1] + dy]; });
      } else {
        sel.pos3d = [0, 0, sel.pos3d?.[2] || 0];
        sel.lensShiftX = 0;
        sel.lensShiftY = 0;
      }
      syncInspectorUI();
    } else {
      const [cx, cy] = getSurfaceCentroid(sel);
      const dx = 0.5 - cx, dy = 0.5 - cy;
      sel.points = sel.points.map(p => [p[0] + dx, p[1] + dy]);
      if (sel.meshPts) sel.meshPts = sel.meshPts.map(p => [p[0] + dx, p[1] + dy]);
    }
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  document.getElementById('btn-geom-fit').addEventListener('click', () => {
    const sel = getSelectedSurface();
    if (!sel || getEffectiveSurfaceProps(sel).locked || state.showLock) return;
    pushUndoCheckpoint('Fit Surface to Stage');
    if (sel.type === 'mesh3d') {
      sel.calibMode = 'manual';
      sel.pos3d = [0, 0, 0];
      sel.scale3d = [1.25, 1.25, 1.25];
      sel.camDist = 2.3;
      sel.lensShiftX = 0;
      sel.lensShiftY = 0;
      syncInspectorUI();
    } else if (sel.type === 'polygon' || sel.type === 'line') {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      sel.points.forEach(p => {
        if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
      });
      const sx = Math.max(1e-4, maxX - minX), sy = Math.max(1e-4, maxY - minY);
      sel.points = sel.points.map(p => [0.06 + ((p[0] - minX) / sx) * 0.88, 0.06 + ((p[1] - minY) / sy) * 0.88]);
      if (sel.type === 'polygon') syncPolygonUvsFromStage(sel);
    } else {
      sel.points = sel.type === 'triangle'
        ? [[0.06, 0.06], [0.94, 0.06], [0.50, 0.94]]
        : [[0, 0], [1, 0], [1, 1], [0, 1]];
      if (sel.type === 'quad') initSurfaceMeshFromCorners(sel);
    }
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  document.getElementById('btn-geom-cal').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.showCalGrid = !sel.showCalGrid;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList(); syncInspectorUI();
  });
  document.getElementById('btn-geom-fliph').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || getEffectiveSurfaceProps(sel).locked || state.showLock) return;
    pushUndoCheckpoint('Flip Horizontal');
    if (sel.type === 'mesh3d') {
      if (sel.calibMode === 'calibrated' && Array.isArray(sel.calibPins)) {
        const [cx] = getSurfaceCentroid(sel);
        sel.calibPins.forEach(cp => { if (cp?.stage2d) cp.stage2d[0] = cx - (cp.stage2d[0] - cx); });
      } else {
        const r = Array.isArray(sel.rot3d) ? sel.rot3d : [18, -28, 0];
        sel.rot3d = [r[0], -r[1], -r[2]];
      }
      syncInspectorUI();
    } else {
      const [cx] = getSurfaceCentroid(sel);
      sel.points = sel.points.map(p => [cx - (p[0] - cx), p[1]]);
      if (sel.points.length === 4) sel.points = [sel.points[1], sel.points[0], sel.points[3], sel.points[2]];
      if (sel.type === 'quad') initSurfaceMeshFromCorners(sel);
    }
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  document.getElementById('btn-geom-flipv').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || getEffectiveSurfaceProps(sel).locked || state.showLock) return;
    pushUndoCheckpoint('Flip Vertical');
    if (sel.type === 'mesh3d') {
      if (sel.calibMode === 'calibrated' && Array.isArray(sel.calibPins)) {
        const [, cy] = getSurfaceCentroid(sel);
        sel.calibPins.forEach(cp => { if (cp?.stage2d) cp.stage2d[1] = cy - (cp.stage2d[1] - cy); });
      } else {
        const r = Array.isArray(sel.rot3d) ? sel.rot3d : [18, -28, 0];
        sel.rot3d = [-r[0], r[1], ((r[2] + 180 + 540) % 360) - 180];
      }
      syncInspectorUI();
    } else {
      const [, cy] = getSurfaceCentroid(sel);
      sel.points = sel.points.map(p => [p[0], cy - (p[1] - cy)]);
      if (sel.points.length === 4) sel.points = [sel.points[3], sel.points[2], sel.points[1], sel.points[0]];
      if (sel.type === 'quad') initSurfaceMeshFromCorners(sel);
    }
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  document.getElementById('btn-geom-rot90').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || getEffectiveSurfaceProps(sel).locked || state.showLock) return;
    pushUndoCheckpoint('Rotate 90°');
    if (sel.type === 'mesh3d') {
      if (sel.calibMode === 'calibrated' && Array.isArray(sel.calibPins)) {
        const [cx, cy] = getSurfaceCentroid(sel);
        sel.calibPins.forEach(cp => {
          if (cp?.stage2d) cp.stage2d = [cx + (cp.stage2d[1] - cy), cy - (cp.stage2d[0] - cx)];
        });
      } else {
        const r = Array.isArray(sel.rot3d) ? sel.rot3d : [18, -28, 0];
        sel.rot3d = [r[0], ((r[1] + 90 + 540) % 360) - 180, r[2]];
      }
      syncInspectorUI();
    } else if (sel.points.length === 4) sel.points = [sel.points[3], sel.points[0], sel.points[1], sel.points[2]];
    else {
      const [cx, cy] = getSurfaceCentroid(sel);
      sel.points = sel.points.map(p => [cx + (p[1] - cy), cy - (p[0] - cx)]);
    }
    if (sel.type === 'quad') initSurfaceMeshFromCorners(sel);
    bumpSurfaceGeom(sel);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });

  document.getElementById('sel-blend-mode').addEventListener('change', (e) => {
    const sel = getSelectedSurface(); if (!sel) return;
    pushUndoCheckpoint('Change Blend Mode');
    sel.blendMode = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    scheduleAutosave();
  });

  // Milestone 7C: Theatrical 4-Blade Framing Shutters
  const refreshShutterBadge = (sel) => {
    const shBadge = document.getElementById('badge-shutter-status');
    if (shBadge && sel) {
      const sL = sel.shutterL ?? 0, sR = sel.shutterR ?? 0, sT = sel.shutterT ?? 0, sB = sel.shutterB ?? 0;
      const anyCut = Math.max(sL, sR, sT, sB) > 0.002;
      if (anyCut) {
        const parts = [];
        if (sL > 0.002) parts.push(`L${Math.round(sL * 100)}`);
        if (sR > 0.002) parts.push(`R${Math.round(sR * 100)}`);
        if (sT > 0.002) parts.push(`T${Math.round(sT * 100)}`);
        if (sB > 0.002) parts.push(`B${Math.round(sB * 100)}`);
        shBadge.textContent = parts.join(' ');
      } else {
        shBadge.textContent = 'Open';
      }
      shBadge.classList.toggle('live', anyCut);
    }
    if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
  };
  document.getElementById('btn-shutter-handles')?.addEventListener('click', () => {
    if (state.showLock) { showToast('🔒 Show Lock active'); return; }
    state.shutterHandlesVisible = !state.shutterHandlesVisible;
    const disc = document.getElementById('disc-framing-shutters');
    if (state.shutterHandlesVisible && disc) disc.open = true;
    syncInspectorUI();
    syncStageModePill();
    showToast(state.shutterHandlesVisible
      ? '◫ Shutter Blade Handles ON — Drag warm bars on Stage (Tip = Tilt, Alt = Frost, DblClick = Open)'
      : '◫ Stage Shutter Handles Hidden');
  });
  bindInspectorSlider('ctrl-shutter-l', (v) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.shutterL = v; document.getElementById('val-shutter-l').textContent = `${Math.round(v * 100)}%`;
    refreshShutterBadge(sel);
  });
  bindInspectorSlider('ctrl-shutter-ang-l', (v) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.shutterAngL = v; document.getElementById('val-shutter-ang-l').textContent = `${Math.round(v)}°`;
  });
  bindInspectorSlider('ctrl-shutter-r', (v) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.shutterR = v; document.getElementById('val-shutter-r').textContent = `${Math.round(v * 100)}%`;
    refreshShutterBadge(sel);
  });
  bindInspectorSlider('ctrl-shutter-ang-r', (v) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.shutterAngR = v; document.getElementById('val-shutter-ang-r').textContent = `${Math.round(v)}°`;
  });
  bindInspectorSlider('ctrl-shutter-t', (v) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.shutterT = v; document.getElementById('val-shutter-t').textContent = `${Math.round(v * 100)}%`;
    refreshShutterBadge(sel);
  });
  bindInspectorSlider('ctrl-shutter-ang-t', (v) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.shutterAngT = v; document.getElementById('val-shutter-ang-t').textContent = `${Math.round(v)}°`;
  });
  bindInspectorSlider('ctrl-shutter-b', (v) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.shutterB = v; document.getElementById('val-shutter-b').textContent = `${Math.round(v * 100)}%`;
    refreshShutterBadge(sel);
  });
  bindInspectorSlider('ctrl-shutter-ang-b', (v) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.shutterAngB = v; document.getElementById('val-shutter-ang-b').textContent = `${Math.round(v)}°`;
  });
  bindInspectorSlider('ctrl-shutter-soft', (v) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.shutterSoft = v; document.getElementById('val-shutter-soft').textContent = `${(v * 100).toFixed(1)}%`;
  });
  document.getElementById('btn-shutter-reset')?.addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || state.showLock) return;
    pushUndoCheckpoint('Open Framing Shutters');
    sel.shutterL = 0; sel.shutterR = 0; sel.shutterT = 0; sel.shutterB = 0;
    sel.shutterAngL = 0; sel.shutterAngR = 0; sel.shutterAngT = 0; sel.shutterAngB = 0;
    sel.shutterSoft = 0.015;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncInspectorUI();
    scheduleAutosave();
  });

  // Luma & YCbCr Chroma Keyer Controls
  document.getElementById('sel-key-mode').addEventListener('change', (e) => {
    const sel = getSelectedSurface(); if (!sel) return;
    pushUndoCheckpoint('Change Keyer Mode');
    sel.keyMode = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    syncInspectorUI();
    scheduleAutosave();
  });
  bindInspectorSlider('ctrl-luma-min', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.lumaMin = val;
    document.getElementById('val-luma-min').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-luma-soft', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.lumaSoftness = val;
    document.getElementById('val-luma-soft').textContent = `${Math.round(val * 100)}%`;
  });
  document.getElementById('chk-luma-invert').addEventListener('change', (e) => {
    const sel = getSelectedSurface(); if (!sel) return;
    pushUndoCheckpoint('Invert Luma Key');
    sel.lumaInvert = !!e.target.checked;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  document.getElementById('pick-chroma-color').addEventListener('input', (e) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.chromaColor = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  });
  document.getElementById('pick-chroma-color').addEventListener('change', () => scheduleAutosave());
  bindInspectorSlider('ctrl-chroma-tol', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.chromaTolerance = val;
    document.getElementById('val-chroma-tol').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-chroma-soft', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.chromaSoftness = val;
    document.getElementById('val-chroma-soft').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-chroma-spill', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.chromaSpill = val;
    document.getElementById('val-chroma-spill').textContent = `${Math.round(val * 100)}%`;
  });

  bindInspectorSlider('ctrl-opacity', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.opacity = val;
    document.getElementById('val-opacity').textContent = `${Math.round(val * 100)}%`;
  });

  document.getElementById('btn-feather-unlink').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel) return;
    pushUndoCheckpoint('Toggle 4-Edge Feather');
    sel.featherLink = !(sel.featherLink !== false);
    if (sel.featherLink) {
      sel.featherL = sel.featherR = sel.featherT = sel.featherB = sel.feather;
    } else {
      sel.featherL = sel.featherL ?? sel.feather;
      sel.featherR = sel.featherR ?? sel.feather;
      sel.featherT = sel.featherT ?? sel.feather;
      sel.featherB = sel.featherB ?? sel.feather;
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncInspectorUI();
    scheduleAutosave();
  });

  bindInspectorSlider('ctrl-feather', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.feather = val;
    sel.featherL = sel.featherR = sel.featherT = sel.featherB = val;
    document.getElementById('val-feather').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-feather-l', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.featherL = val;
    document.getElementById('val-feather-l').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-feather-r', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.featherR = val;
    document.getElementById('val-feather-r').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-feather-t', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.featherT = val;
    document.getElementById('val-feather-t').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-feather-b', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.featherB = val;
    document.getElementById('val-feather-b').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-blend-gamma', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.blendGamma = val;
    document.getElementById('val-blend-gamma').textContent = val.toFixed(2);
  });
  bindInspectorSlider('ctrl-black-level', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.blackLevel = val;
    document.getElementById('val-black-level').textContent = `${(val * 100).toFixed(1)}%`;
  });

  bindInspectorSlider('ctrl-brightness', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.brightness = val;
    document.getElementById('val-brightness').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-contrast', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.contrast = val;
    document.getElementById('val-contrast').textContent = val.toFixed(2);
  });
  bindInspectorSlider('ctrl-saturation', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.saturation = val;
    document.getElementById('val-saturation').textContent = val.toFixed(2);
  });
  bindInspectorSlider('ctrl-temp', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.colorTemp = val;
    document.getElementById('val-temp').textContent = `${Math.round(5100 + val * 2400)}K`;
  });
  bindInspectorSlider('ctrl-gamma', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.gamma = val;
    document.getElementById('val-gamma').textContent = val.toFixed(2);
  });
  bindInspectorSlider('ctrl-hue-shift', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.hueShift = val;
    document.getElementById('val-hue-shift').textContent = `${Math.round(val)}°`;
  });
  document.getElementById('pick-tint-color').addEventListener('input', (e) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.tintColor = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  });
  document.getElementById('pick-tint-color').addEventListener('change', () => scheduleAutosave());
  bindInspectorSlider('ctrl-tint-amt', (val) => {
    const sel = getSelectedSurface(); if (!sel) return;
    sel.tintAmount = val;
    document.getElementById('val-tint-amt').textContent = `${Math.round(val * 100)}%`;
  });
  document.getElementById('sel-channel-mode').addEventListener('change', (e) => {
    const sel = getSelectedSurface(); if (!sel) return;
    pushUndoCheckpoint('Change Color Channels');
    sel.channelMode = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  document.getElementById('btn-invert-rgb').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel) return;
    pushUndoCheckpoint('Toggle RGB Invert');
    sel.invertRgb = !sel.invertRgb;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-reset-color').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel) return;
    pushUndoCheckpoint('Reset Color Grading');
    sel.brightness = 0; sel.contrast = 1; sel.saturation = 1; sel.colorTemp = 0;
    sel.gamma = 1.0; sel.hueShift = 0; sel.tintColor = '#6fd3ff'; sel.tintAmount = 0;
    sel.invertRgb = false; sel.channelMode = 'rgb';
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncInspectorUI();
    scheduleAutosave();
  });

  // Per-Surface Stackable GPU Post-FX Rack Controls
  document.getElementById('btn-add-surf-fx').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel) return;
    const fxType = document.getElementById('sel-add-surf-fx').value || 'bloom';
    pushUndoCheckpoint(`Add Surface FX ${fxType}`);
    if (!Array.isArray(sel.fxChain)) sel.fxChain = [];
    sel.fxChain.push(createFxInstance(fxType));
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    syncInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-clear-surf-fx').addEventListener('click', () => {
    const sel = getSelectedSurface(); if (!sel || !sel.fxChain || sel.fxChain.length === 0) return;
    pushUndoCheckpoint('Clear Surface FX Rack');
    sel.fxChain = [];
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderSurfaceList();
    syncInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-load-fx-plugin').addEventListener('click', () => isfFileInputEl.click());

  bindInspectorSlider('ctrl-uv-x', (val) => { const s = getSelectedSurface(); if (s) { s.uvX = val; document.getElementById('val-uv-x').textContent = val.toFixed(2); } });
  bindInspectorSlider('ctrl-uv-y', (val) => { const s = getSelectedSurface(); if (s) { s.uvY = val; document.getElementById('val-uv-y').textContent = val.toFixed(2); } });
  bindInspectorSlider('ctrl-uv-w', (val) => { const s = getSelectedSurface(); if (s) { s.uvW = val; document.getElementById('val-uv-w').textContent = `${Math.round(val * 100)}%`; } });
  bindInspectorSlider('ctrl-uv-h', (val) => { const s = getSelectedSurface(); if (s) { s.uvH = val; document.getElementById('val-uv-h').textContent = `${Math.round(val * 100)}%`; } });
  bindInspectorSlider('ctrl-uv-rot', (val) => { const s = getSelectedSurface(); if (s) { s.uvRot = val; document.getElementById('val-uv-rot').textContent = `${val.toFixed(1)}°`; } });
  bindInspectorSlider('ctrl-crop-l', (val) => { const s = getSelectedSurface(); if (s) { s.cropL = val; document.getElementById('val-crop-l').textContent = `${Math.round(val * 100)}%`; } });
  bindInspectorSlider('ctrl-crop-r', (val) => { const s = getSelectedSurface(); if (s) { s.cropR = val; document.getElementById('val-crop-r').textContent = `${Math.round(val * 100)}%`; } });
  bindInspectorSlider('ctrl-crop-t', (val) => { const s = getSelectedSurface(); if (s) { s.cropT = val; document.getElementById('val-crop-t').textContent = `${Math.round(val * 100)}%`; } });
  bindInspectorSlider('ctrl-crop-b', (val) => { const s = getSelectedSurface(); if (s) { s.cropB = val; document.getElementById('val-crop-b').textContent = `${Math.round(val * 100)}%`; } });

  document.getElementById('btn-reset-uv').addEventListener('click', () => {
    const s = getSelectedSurface(); if (!s || getEffectiveSurfaceProps(s).locked || state.showLock) return;
    pushUndoCheckpoint('Reset Input UV');
    s.uvX = 0.5; s.uvY = 0.5; s.uvW = 1; s.uvH = 1; s.uvRot = 0;
    s.cropL = 0; s.cropR = 0; s.cropT = 0; s.cropB = 0;
    s.triUvs = [[0.22, 0.20], [0.78, 0.20], [0.50, 0.84]];
    if (s.type === 'polygon') syncPolygonUvsFromStage(s);
    bumpSurfaceGeom(s);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncUvSlidersFromSelected();
    scheduleAutosave();
  });

  const transformTriUv = (scaleF, rotDeg) => {
    const s = getSelectedSurface();
    if (!s || s.type !== 'triangle' || getEffectiveSurfaceProps(s).locked || state.showLock) return;
    pushUndoCheckpoint('Transform Triangle UV');
    const cx = (s.triUvs[0][0] + s.triUvs[1][0] + s.triUvs[2][0]) / 3;
    const cy = (s.triUvs[0][1] + s.triUvs[1][1] + s.triUvs[2][1]) / 3;
    const rad = (rotDeg * Math.PI) / 180;
    const c = Math.cos(rad), sn = Math.sin(rad);
    s.triUvs = s.triUvs.map(u => {
      const dx = (u[0] - cx) * scaleF, dy = (u[1] - cy) * scaleF;
      return [cx + dx * c - dy * sn, cy + dx * sn + dy * c];
    });
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncUvSlidersFromSelected();
    scheduleAutosave();
  };
  document.getElementById('btn-tri-uv-scale-down').addEventListener('click', () => transformTriUv(0.9, 0));
  document.getElementById('btn-tri-uv-scale-up').addEventListener('click', () => transformTriUv(1.1, 0));
  document.getElementById('btn-tri-uv-rot-ccw').addEventListener('click', () => transformTriUv(1.0, 15));
  document.getElementById('btn-tri-uv-rot-cw').addEventListener('click', () => transformTriUv(1.0, -15));

  // N-Gon Polygon Input UV Transform Controls
  document.getElementById('btn-poly-uv-sync').addEventListener('click', () => {
    const s = getSelectedSurface();
    if (!s || s.type !== 'polygon' || getEffectiveSurfaceProps(s).locked || state.showLock) return;
    pushUndoCheckpoint('Sync Polygon UV');
    syncPolygonUvsFromStage(s);
    bumpSurfaceGeom(s);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncUvSlidersFromSelected();
    scheduleAutosave();
  });
  const transformPolyUv = (scaleF, rotDeg) => {
    const s = getSelectedSurface();
    if (!s || s.type !== 'polygon' || getEffectiveSurfaceProps(s).locked || state.showLock) return;
    ensurePolygonUvs(s);
    if (s.polyUvs.length === 0) return;
    pushUndoCheckpoint('Transform Polygon UV');
    let cx = 0, cy = 0;
    s.polyUvs.forEach(u => { cx += u[0]; cy += u[1]; });
    cx /= s.polyUvs.length; cy /= s.polyUvs.length;
    const rad = (rotDeg * Math.PI) / 180;
    const c = Math.cos(rad), sn = Math.sin(rad);
    s.polyUvs = s.polyUvs.map(u => {
      const dx = (u[0] - cx) * scaleF, dy = (u[1] - cy) * scaleF;
      return [cx + dx * c - dy * sn, cy + dx * sn + dy * c];
    });
    bumpSurfaceGeom(s);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncUvSlidersFromSelected();
    scheduleAutosave();
  };
  document.getElementById('btn-poly-uv-scale-down').addEventListener('click', () => transformPolyUv(0.9, 0));
  document.getElementById('btn-poly-uv-scale-up').addEventListener('click', () => transformPolyUv(1.1, 0));
  document.getElementById('btn-poly-uv-rot-ccw').addEventListener('click', () => transformPolyUv(1.0, 15));
  document.getElementById('btn-poly-uv-rot-cw').addEventListener('click', () => transformPolyUv(1.0, -15));

  // Mask Inspector Controls
  document.getElementById('inp-mask-name').addEventListener('input', (e) => {
    const m = getSelectedMask(); if (!m) return;
    m.name = e.target.value || 'Mask';
    renderMaskList();
    scheduleAutosave();
  });
  document.getElementById('sel-mask-mode').addEventListener('change', (e) => {
    const m = getSelectedMask(); if (!m) return;
    pushUndoCheckpoint('Change Mask Operation');
    m.mode = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderMaskList();
    scheduleAutosave();
  });
  document.getElementById('sel-mask-target').addEventListener('change', (e) => {
    const m = getSelectedMask(); if (!m) return;
    pushUndoCheckpoint('Change Mask Target');
    m.target = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderMaskList();
    scheduleAutosave();
  });
  bindInspectorSlider('ctrl-mask-feather', (val) => {
    const m = getSelectedMask(); if (!m) return;
    m.feather = val;
    document.getElementById('val-mask-feather').textContent = `${(val * 100).toFixed(1)}%`;
  });
  bindInspectorSlider('ctrl-mask-choke', (val) => {
    const m = getSelectedMask(); if (!m) return;
    m.choke = val;
    document.getElementById('val-mask-choke').textContent = `${val >= 0 ? '+' : ''}${(val * 100).toFixed(1)}%`;
  });
  bindInspectorSlider('ctrl-mask-opacity', (val) => {
    const m = getSelectedMask(); if (!m) return;
    m.opacity = val;
    document.getElementById('val-mask-opacity').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-mask-tension', (val) => {
    const m = getSelectedMask(); if (!m) return;
    m.curveTension = val;
    document.getElementById('val-mask-tension').textContent = `${Math.round(val * 100)}%`;
  });
  document.getElementById('btn-mask-smooth').addEventListener('click', () => {
    const m = getSelectedMask(); if (!m || m.locked || state.showLock) return;
    pushUndoCheckpoint('Toggle Smooth Bezier Mask');
    m.smoothAll = !m.smoothAll;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderMaskList();
    syncMaskInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-mask-invert').addEventListener('click', () => {
    const m = getSelectedMask(); if (!m) return;
    pushUndoCheckpoint('Invert Mask');
    m.invert = !m.invert;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncMaskInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-mask-edit-stage')?.addEventListener('click', () => {
    if (state.showLock) { showToast('🔒 Show Lock active'); return; }
    const nextMaskEdit = state.stageEditMode !== 'mask' && state.leftTab !== 'masks';
    if (!nextMaskEdit && state.leftTab === 'masks') {
      switchLeftTab('surfaces');
      switchInspTab('mask');
    }
    state.stageEditMode = nextMaskEdit ? 'mask' : 'geometry';
    syncMaskInspectorUI();
    syncStageModePill();
    showToast(state.stageEditMode === 'mask'
      ? '✂ Mask Stage Vertex Editing ON (Esc to return to Surface Geometry)'
      : '▱ Stage returned to Surface Geometry');
  });
  document.getElementById('btn-mask-center').addEventListener('click', () => {
    const m = getSelectedMask(); if (!m || m.locked || state.showLock || m.points.length === 0) return;
    pushUndoCheckpoint('Center Mask');
    let cx = 0, cy = 0;
    m.points.forEach(p => { cx += p[0]; cy += p[1]; });
    cx /= m.points.length; cy /= m.points.length;
    m.points = m.points.map(p => [p[0] + (0.5 - cx), p[1] + (0.5 - cy)]);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });

  // Output Stage, HDR Pipeline & Master Keystone Inspector Controls
  document.getElementById('sel-out-res').addEventListener('change', (e) => {
    const val = e.target.value;
    pushUndoCheckpoint('Change Stage Resolution');
    if (val === 'custom') {
      const cw = parseInt(document.getElementById('inp-stage-w').value, 10) || 1920;
      const ch = parseInt(document.getElementById('inp-stage-h').value, 10) || 1080;
      setCanonicalStageResolution('custom', cw, ch);
    } else {
      setCanonicalStageResolution(val);
    }
    syncTopbarUI();
    syncOutputInspectorUI();
    scheduleAutosave();
    showToast(`Canonical Stage: ${state.stageWidth}×${state.stageHeight}`);
  });

  const applyCustomResInputs = () => {
    const cw = clamp(parseInt(document.getElementById('inp-stage-w').value, 10) || 1920, 256, 8192);
    const ch = clamp(parseInt(document.getElementById('inp-stage-h').value, 10) || 1080, 256, 8192);
    pushUndoCheckpoint('Custom Stage Resolution');
    setCanonicalStageResolution('custom', cw, ch);
    syncTopbarUI();
    syncOutputInspectorUI();
    scheduleAutosave();
  };
  document.getElementById('inp-stage-w').addEventListener('change', applyCustomResInputs);
  document.getElementById('inp-stage-h').addEventListener('change', applyCustomResInputs);

  document.getElementById('btn-hdr-pipeline').addEventListener('click', () => {
    state.hdrPipeline = !(state.hdrPipeline !== false);
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncOutputInspectorUI();
    scheduleAutosave();
    showToast(state.hdrPipeline
      ? '✦ 16-Bit RGBA16F Linear HDR Compositing Enabled'
      : 'Standard 8-Bit RGBA8 Compositing');
  });

  // Master Output GPU Post-FX Rack Controls
  document.getElementById('btn-add-master-fx').addEventListener('click', () => {
    const fxType = document.getElementById('sel-add-master-fx').value || 'bloom';
    pushUndoCheckpoint(`Add Master FX ${fxType}`);
    if (!Array.isArray(state.masterFxChain)) state.masterFxChain = [];
    state.masterFxChain.push(createFxInstance(fxType));
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncOutputInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-clear-master-fx').addEventListener('click', () => {
    if (!state.masterFxChain || state.masterFxChain.length === 0) return;
    pushUndoCheckpoint('Clear Master FX Rack');
    state.masterFxChain = [];
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncOutputInspectorUI();
    scheduleAutosave();
  });

  document.getElementById('btn-mk-enable').addEventListener('click', () => {
    pushUndoCheckpoint('Toggle Master Keystone');
    state.masterKeystone.enabled = !state.masterKeystone.enabled;
    if (state.masterKeystone.enabled && !state.masterKeystone.editOnStage) {
      state.masterKeystone.editOnStage = true;
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncOutputInspectorUI();
    syncStageModePill();
    scheduleAutosave();
    showToast(state.masterKeystone.enabled
      ? '◈ Master Output Keystone ON — Drag emerald K-BL..K-TL corners on Stage'
      : 'Master Output Keystone Bypassed');
  });

  document.getElementById('btn-mk-edit-stage').addEventListener('click', () => {
    if (state.showLock) { showToast('🔒 Show Lock active'); return; }
    state.masterKeystone.editOnStage = !state.masterKeystone.editOnStage;
    if (state.masterKeystone.editOnStage && !state.masterKeystone.enabled) {
      state.masterKeystone.enabled = true;
    }
    state.selectedVertex = null;
    syncOutputInspectorUI();
    syncStageModePill();
  });

  bindInspectorSlider('ctrl-mk-lens', (val) => {
    state.masterKeystone.lensK1 = val;
    if (Math.abs(val) > 0.001 && !state.masterKeystone.enabled) {
      state.masterKeystone.enabled = true;
      syncOutputInspectorUI();
    }
    document.getElementById('val-mk-lens').textContent = val.toFixed(3);
  });

  document.getElementById('btn-mk-reset').addEventListener('click', () => {
    pushUndoCheckpoint('Reset Master Keystone');
    state.masterKeystone.points = [[0, 0], [1, 0], [1, 1], [0, 1]];
    state.masterKeystone.lensK1 = 0;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncOutputInspectorUI();
    scheduleAutosave();
    showToast('Master Output Keystone reset to 1:1 frame');
  });

  // Stage UV Template Export, Reference Guide & Optical Space Scanner
  document.getElementById('btn-export-png').addEventListener('click', () => exportStageTemplatePNG());
  document.getElementById('btn-export-svg').addEventListener('click', () => exportStageTemplateSVG());
  document.getElementById('btn-out-scanner').addEventListener('click', () => openSpaceScannerModal());

  const stageBgInput = document.getElementById('stage-bg-file-input');
  document.getElementById('btn-stage-bg-load').addEventListener('click', () => stageBgInput.click());
  stageBgInput.addEventListener('change', () => {
    const f = stageBgInput.files && stageBgInput.files[0];
    if (f) {
      const r = new FileReader();
      r.onload = () => {
        if (typeof r.result === 'string') {
          setStageBackgroundDataUrl(r.result, true);
          syncOutputInspectorUI();
          scheduleAutosave();
          showToast(`Loaded Stage Reference: ${f.name}`);
        }
      };
      r.readAsDataURL(f);
    }
    stageBgInput.value = '';
  });
  document.getElementById('btn-stage-bg-toggle').addEventListener('click', () => {
    if (!state.stageBg.img && !state.stageBg.dataUrl) {
      stageBgInput.click();
      return;
    }
    state.stageBg.enabled = !state.stageBg.enabled;
    syncOutputInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-stage-bg-clear').addEventListener('click', () => {
    setStageBackgroundDataUrl(null, false);
    syncOutputInspectorUI();
    scheduleAutosave();
    showToast('Cleared Stage Reference Guide');
  });
  bindInspectorSlider('ctrl-stage-bg-opacity', (val) => {
    state.stageBg.opacity = val;
    document.getElementById('val-stage-bg-opacity').textContent = `${Math.round(val * 100)}%`;
  });

  // Space Scanner Dialog Controls
  document.getElementById('btn-scanner-cam-refresh').addEventListener('click', () => startScannerCamera());
  document.getElementById('sel-scanner-cam').addEventListener('change', (e) => startScannerCamera(e.target.value));
  bindInspectorSlider('ctrl-scanner-delay', (val) => {
    document.getElementById('val-scanner-delay').textContent = `${Math.round(val)}ms`;
  }, false);
  bindInspectorSlider('ctrl-scanner-thresh', (val) => {
    document.getElementById('val-scanner-thresh').textContent = String(Math.round(val));
  }, false);
  document.getElementById('btn-scanner-snap').addEventListener('click', () => captureDirectCameraSnapshot());
  document.getElementById('btn-scanner-run').addEventListener('click', () => runStructuredLightScan());

  document.getElementById('btn-out-show-lock').addEventListener('click', () => toggleShowLock());

  // Milestone 6A: Multi-Projector Optical Edge-Blend & Per-Screen Routing Controls
  const refreshEdgeBlendWizardPreview = () => {
    const gridPreset = document.getElementById('sel-wiz-grid').value || '2x1';
    const [pw, ph] = (document.getElementById('sel-wiz-proj-res').value || '1920x1080').split('x').map(Number);
    const ovSlider = document.getElementById('ctrl-wiz-overlap');
    const isStack = /-stack$/.test(gridPreset);
    const maxOv = (gridPreset === '2x1' || gridPreset === '1x2') ? 0.90 : 0.45;
    if (ovSlider) {
      ovSlider.max = String(maxOv);
      ovSlider.disabled = isStack;
    }
    const ov = clamp(parseFloat(ovSlider.value) || 0.15, 0.05, maxOv);
    document.getElementById('val-wiz-overlap').textContent = isStack ? '100%' : `${Math.round(ov * 100)}%`;
    const rec = computeRecommendedStageResForGrid(gridPreset, ov, pw, ph);
    if (rec.stackCount && rec.stackCount >= 2) {
      document.getElementById('wiz-calc-readout').textContent =
        `Combined Stage: ${rec.width}×${rec.height} px • 100% Full Overlap (${rec.stackCount}× Constant Brightness)`;
      return;
    }
    const seamTxt = rec.cols > 1 && rec.rows > 1
      ? `${rec.overlapPxX}×${rec.overlapPxY} px`
      : (rec.cols > 1 ? `${rec.overlapPxX} px` : `${rec.overlapPxY} px`);
    const totalScr = rec.screenCount || (rec.cols * rec.rows);
    document.getElementById('wiz-calc-readout').textContent =
      `Combined Stage: ${rec.width}×${rec.height} px • Seam Overlap: ${seamTxt} (${totalScr} Screens)`;
  };

  document.getElementById('btn-mp-enable').addEventListener('click', () => {
    const mp = ensureMultiProjectorState();
    pushUndoCheckpoint('Toggle Multi-Projector');
    mp.enabled = !mp.enabled;
    if (!mp.enabled) mp.previewScreenIndex = 0;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncOutputInspectorUI();
    scheduleAutosave();
    showToast(mp.enabled
      ? `⊞ Multi-Projector Routing ON (${mp.layoutPreset} • ${mp.screens.length} Screens)`
      : 'Multi-Projector Routing OFF (Single Canonical Output)');
  });

  document.getElementById('btn-mp-wizard').addEventListener('click', () => {
    const mp = ensureMultiProjectorState();
    if (mp.layoutPreset && mp.layoutPreset !== '1x1' && mp.layoutPreset !== 'custom') {
      document.getElementById('sel-wiz-grid').value = mp.layoutPreset;
    }
    setSliderValue(document.getElementById('ctrl-wiz-overlap'), mp.overlapPct ?? 0.15);
    refreshEdgeBlendWizardPreview();
    if (!edgeblendDialog.open) edgeblendDialog.showModal();
  });
  document.getElementById('btn-mp-stageplan')?.addEventListener('click', (e) => {
    if (e.altKey && typeof openStagePlanModal === 'function') openStagePlanModal();
    else setLayoutMode('rig');
  });
  document.getElementById('btn-wiz-stageplan')?.addEventListener('click', () => {
    if (edgeblendDialog.open) edgeblendDialog.close();
    setLayoutMode('rig');
  });

  document.getElementById('sel-wiz-grid').addEventListener('change', refreshEdgeBlendWizardPreview);
  document.getElementById('sel-wiz-proj-res').addEventListener('change', refreshEdgeBlendWizardPreview);
  bindInspectorSlider('ctrl-wiz-overlap', () => refreshEdgeBlendWizardPreview(), false);

  const executeEdgeBlendWizard = async (alsoLaunch = false) => {
    const gridPreset = document.getElementById('sel-wiz-grid').value || '2x1';
    const [pw, ph] = (document.getElementById('sel-wiz-proj-res').value || '1920x1080').split('x').map(Number);
    const ov = parseFloat(document.getElementById('ctrl-wiz-overlap').value) || 0.15;
    const resizeStage = document.getElementById('chk-wiz-resize-stage').checked;
    const alignBars = document.getElementById('chk-wiz-align-bars').checked;

    pushUndoCheckpoint('Apply Edge-Blend Wizard');
    const mp = ensureMultiProjectorState();
    mp.enabled = true;
    mp.alignmentGridOnOutput = alignBars;
    applyEdgeBlendLayoutPreset(gridPreset, ov, resizeStage, pw, ph);
    if (edgeblendDialog.open) edgeblendDialog.close('apply');
    if (alsoLaunch) {
      await launchAllProjectorScreens();
    } else {
      showToast(`Applied ${gridPreset} Optical Edge-Blend Rig (${Math.round(ov * 100)}% overlap)`);
    }
  };

  document.getElementById('btn-wiz-apply').addEventListener('click', () => executeEdgeBlendWizard(false));
  document.getElementById('btn-wiz-apply-launch').addEventListener('click', () => executeEdgeBlendWizard(true));

  document.getElementById('btn-mp-launch-all').addEventListener('click', () => launchAllProjectorScreens());
  document.getElementById('btn-mp-launch-one').addEventListener('click', () => {
    const mp = ensureMultiProjectorState();
    mp.enabled = true;
    syncOutputInspectorUI();
    launchProjectorScreenWindow(mp.selectedScreenIndex || 1);
  });
  document.getElementById('btn-mp-add-screen')?.addEventListener('click', () => {
    pushUndoCheckpoint('Add Projector Screen');
    const created = addCustomProjectorScreen();
    if (created) showToast(`Added ${created.name} (${state.multiProjector.screens.length} screens total)`);
  });
  document.getElementById('btn-mp-del-screen')?.addEventListener('click', () => {
    pushUndoCheckpoint('Remove Projector Screen');
    if (removeProjectorScreen()) {
      showToast(`Removed screen (${state.multiProjector.screens.length} remaining)`);
    }
  });

  const applyCustomMpGridDims = () => {
    const mp = ensureMultiProjectorState();
    const cols = clamp(parseInt(document.getElementById('inp-mp-cols')?.value || '4', 10) || 4, 1, 16);
    const maxRows = Math.max(1, Math.min(8, Math.floor(32 / cols)));
    const rows = clamp(parseInt(document.getElementById('inp-mp-rows')?.value || '1', 10) || 1, 1, maxRows);
    mp.customCols = cols;
    mp.customRows = rows;
    mp.enabled = (cols * rows) > 1 ? true : mp.enabled;
    pushUndoCheckpoint('Custom Projector Grid');
    applyEdgeBlendLayoutPreset(`${cols}x${rows}`, null, false);
  };
  document.getElementById('inp-mp-cols')?.addEventListener('change', applyCustomMpGridDims);
  document.getElementById('inp-mp-rows')?.addEventListener('change', applyCustomMpGridDims);

  document.getElementById('sel-mp-layout').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'grid-custom') {
      applyCustomMpGridDims();
      return;
    }
    pushUndoCheckpoint('Change Projector Grid');
    const mp = ensureMultiProjectorState();
    mp.enabled = val !== '1x1' ? true : mp.enabled;
    applyEdgeBlendLayoutPreset(val, null, false);
  });

  bindInspectorSlider('ctrl-mp-overlap', (val) => {
    const mp = ensureMultiProjectorState();
    if (mp.layoutPreset === 'custom') mp.layoutPreset = '2x1';
    applyEdgeBlendLayoutPreset(mp.layoutPreset, val, false);
  });
  bindInspectorSlider('ctrl-mp-gamma', (val) => {
    const mp = ensureMultiProjectorState();
    mp.blendGamma = val;
    if (/-stack$/.test(mp.layoutPreset || '')) {
      const n = Math.max(2, mp.screens.length);
      const gGain = Number(Math.pow(1.0 / n, 1.0 / Math.max(0.5, val)).toFixed(4));
      for (const s of mp.screens) s.gain = gGain;
      syncOutputInspectorUI();
    }
    document.getElementById('val-mp-gamma').textContent = val.toFixed(2);
  });
  bindInspectorSlider('ctrl-mp-black', (val) => {
    const mp = ensureMultiProjectorState();
    mp.blackOffset = val;
    document.getElementById('val-mp-black').textContent = `${(val * 100).toFixed(1)}%`;
  });

  document.getElementById('btn-mp-stage-guides').addEventListener('click', () => {
    const mp = ensureMultiProjectorState();
    mp.showStageGuides = !mp.showStageGuides;
    syncOutputInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-mp-align-bars').addEventListener('click', () => {
    const mp = ensureMultiProjectorState();
    mp.alignmentGridOnOutput = !mp.alignmentGridOnOutput;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncOutputInspectorUI();
    scheduleAutosave();
  });

  document.getElementById('sel-mp-screen').addEventListener('change', (e) => {
    const mp = ensureMultiProjectorState();
    mp.selectedScreenIndex = parseInt(e.target.value, 10) || 1;
    syncOutputInspectorUI();
  });
  document.getElementById('sel-mp-preview').addEventListener('change', (e) => {
    const mp = ensureMultiProjectorState();
    mp.previewScreenIndex = parseInt(e.target.value, 10) || 0;
    if (mp.previewScreenIndex > 0 && !mp.enabled) mp.enabled = true;
    syncOutputInspectorUI();
  });

  bindInspectorSlider('ctrl-mp-scr-delay', (val) => {
    const scr = getSelectedProjectorScreen();
    if (!scr) return;
    scr.delayMs = Math.round(val);
    document.getElementById('val-mp-scr-delay').textContent = `${scr.delayMs}ms`;
  });
  bindInspectorSlider('ctrl-mp-scr-gain', (val) => {
    const scr = getSelectedProjectorScreen();
    if (!scr) return;
    scr.gain = val;
    document.getElementById('val-mp-scr-gain').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-mp-scr-kelvin', (val) => {
    const scr = getSelectedProjectorScreen();
    if (!scr) return;
    scr.kelvin = val;
    document.getElementById('val-mp-scr-kelvin').textContent = `${Math.round(5100 + val * 2400)}K`;
  });
  document.getElementById('btn-mp-scr-ks').addEventListener('click', () => {
    const scr = getSelectedProjectorScreen();
    if (!scr) return;
    pushUndoCheckpoint(`Toggle Screen ${scr.index} Keystone`);
    scr.keystone.enabled = !scr.keystone.enabled;
    if (scr.keystone.enabled) scr.keystone.editOnStage = true;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncOutputInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-mp-scr-ks-edit').addEventListener('click', () => {
    const scr = getSelectedProjectorScreen();
    if (!scr) return;
    if (state.showLock) { showToast('🔒 Show Lock active'); return; }
    scr.keystone.editOnStage = !scr.keystone.editOnStage;
    if (scr.keystone.editOnStage) scr.keystone.enabled = true;
    syncOutputInspectorUI();
  });

  // Milestone 6B: LED Pixel Mapper, Direct Browser WebSerial USB-DMX & Art-Net Controls
  document.getElementById('btn-dmx-enable').addEventListener('click', () => {
    const pm = ensurePixelMapperState();
    pm.enabled = !pm.enabled;
    if (pm.enabled && pm.fixtures.length === 0) {
      addDmxFixture('strip', { _silent: true });
    }
    syncOutputInspectorUI();
    scheduleAutosave();
    showToast(pm.enabled ? '✦ LED Pixel Mapper Active (44Hz DMX512)' : 'LED Pixel Mapper Paused');
  });

  document.getElementById('btn-dmx-edit-stage').addEventListener('click', () => {
    if (state.showLock) { showToast('🔒 Show Lock active'); return; }
    const pm = ensurePixelMapperState();
    pm.editOnStage = !pm.editOnStage;
    if (pm.editOnStage && !pm.enabled) pm.enabled = true;
    syncOutputInspectorUI();
    showToast(pm.editOnStage ? 'Drag LED Fixtures directly on Stage' : 'LED Stage Handles Hidden');
  });

  document.getElementById('btn-dmx-add-strip').addEventListener('click', () => addDmxFixture('strip'));
  document.getElementById('btn-dmx-add-matrix').addEventListener('click', () => addDmxFixture('matrix'));
  document.getElementById('btn-dmx-add-ring').addEventListener('click', () => addDmxFixture('ring'));
  document.getElementById('btn-dmx-dup').addEventListener('click', () => duplicateDmxFixture());
  document.getElementById('btn-dmx-del').addEventListener('click', () => removeDmxFixture());

  document.getElementById('sel-dmx-fixture').addEventListener('change', (e) => {
    const pm = ensurePixelMapperState();
    pm.selectedFixtureId = e.target.value;
    syncOutputInspectorUI();
  });

  const inpDmxName = document.getElementById('inp-dmx-name');
  bindImeSafeBlurOnEnter(inpDmxName);
  inpDmxName.addEventListener('change', (e) => {
    const fix = getSelectedDmxFixture();
    if (!fix) return;
    fix.name = e.target.value.trim() || fix.name;
    syncOutputInspectorUI();
    scheduleAutosave();
  });

  document.getElementById('inp-dmx-uni').addEventListener('change', (e) => {
    const fix = getSelectedDmxFixture();
    if (!fix) return;
    pushUndoCheckpoint('Patch DMX Universe');
    fix.universe = clamp(Math.round(parseInt(e.target.value, 10) || 0), 0, 127);
    syncOutputInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('inp-dmx-ch').addEventListener('change', (e) => {
    const fix = getSelectedDmxFixture();
    if (!fix) return;
    pushUndoCheckpoint('Patch DMX Channel');
    fix.startChannel = clamp(Math.round(parseInt(e.target.value, 10) || 1), 1, 512);
    syncOutputInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('sel-dmx-order').addEventListener('change', (e) => {
    const fix = getSelectedDmxFixture();
    if (!fix) return;
    fix.colorOrder = e.target.value;
    syncOutputInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('inp-dmx-pixels').addEventListener('change', (e) => {
    const fix = getSelectedDmxFixture();
    if (!fix) return;
    fix.pixelCount = clamp(Math.round(parseInt(e.target.value, 10) || 32), 1, 512);
    syncOutputInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('inp-dmx-cols').addEventListener('change', (e) => {
    const fix = getSelectedDmxFixture();
    if (!fix) return;
    fix.cols = clamp(Math.round(parseInt(e.target.value, 10) || 16), 1, 64);
    syncOutputInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('inp-dmx-rows').addEventListener('change', (e) => {
    const fix = getSelectedDmxFixture();
    if (!fix) return;
    fix.rows = clamp(Math.round(parseInt(e.target.value, 10) || 8), 1, 64);
    syncOutputInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('chk-dmx-serp').addEventListener('change', (e) => {
    const fix = getSelectedDmxFixture();
    if (!fix) return;
    fix.serpentine = !!e.target.checked;
    scheduleAutosave();
  });

  bindInspectorSlider('ctrl-dmx-dimmer', (val) => {
    const pm = ensurePixelMapperState();
    pm.masterDimmer = val;
    document.getElementById('val-dmx-dimmer').textContent = `${Math.round(val * 100)}%`;
  });
  bindInspectorSlider('ctrl-dmx-gamma', (val) => {
    const pm = ensurePixelMapperState();
    pm.ledGamma = val;
    document.getElementById('val-dmx-gamma').textContent = val.toFixed(2);
  });

  document.getElementById('sel-dmx-usb-proto').addEventListener('change', (e) => {
    const pm = ensurePixelMapperState();
    pm.usbProtocol = e.target.value;
    scheduleAutosave();
  });
  document.getElementById('inp-dmx-usb-uni').addEventListener('change', (e) => {
    const pm = ensurePixelMapperState();
    pm.usbUniverse = clamp(Math.round(parseInt(e.target.value, 10) || 0), 0, 127);
    scheduleAutosave();
  });
  document.getElementById('btn-dmx-usb-connect').addEventListener('click', () => {
    const pm = ensurePixelMapperState();
    if (pm.usbConnected) disconnectWebSerialDmx(false);
    else connectWebSerialDmx();
  });
  document.getElementById('btn-dmx-artnet').addEventListener('click', () => {
    const pm = ensurePixelMapperState();
    pm.artNetEnabled = !pm.artNetEnabled;
    if (pm.artNetEnabled) {
      pm.enabled = true;
      if (!state.osc.enabled && typeof connectOscWebSocket === 'function') {
        connectOscWebSocket(state.osc.wsUrl);
      }
      showToast('🌐 Art-Net OpDmx Streaming ON (via ws://127.0.0.1:8080 → UDP 6454)');
    } else {
      showToast('Art-Net Streaming OFF');
    }
    syncOutputInspectorUI();
    scheduleAutosave();
  });

  // Followspot / Universal Optical Bench Inspector Controls
  const _actSpot = () => (typeof getActiveLiveSpot === 'function' && getActiveLiveSpot()) || (typeof getActiveSpot === 'function' ? getActiveSpot() : state.followspot);
  document.getElementById('btn-insp-steer-spot').addEventListener('click', () => toggleSpotSteerMode());
  document.getElementById('sel-spot-mode').addEventListener('change', (e) => {
    _actSpot().mode = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncFollowspotInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('sel-spot-content')?.addEventListener('change', (e) => {
    const sp = _actSpot();
    sp.contentSrc = e.target.value;
    if (sp.contentSrc === '__pure_light__' && (sp.fbmAmt ?? 1) > 0.99) {
      sp.fbmAmt = 0.0;
    } else if (sp.contentSrc === '__nebula__' && (sp.fbmAmt ?? 0) < 0.01) {
      sp.fbmAmt = 1.0;
    }
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncFollowspotInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('sel-spot-fit')?.addEventListener('change', (e) => {
    _actSpot().mediaFit = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  document.getElementById('sel-spot-gobo')?.addEventListener('change', (e) => {
    _actSpot().goboSrc = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  bindInspectorSlider('ctrl-spot-edge', (v) => {
    _actSpot().edge = v;
    const el = document.getElementById('val-spot-edge');
    if (el) el.textContent = v.toFixed(2);
  });
  bindInspectorSlider('ctrl-spot-fbm', (v) => {
    _actSpot().fbmAmt = v;
    const el = document.getElementById('val-spot-fbm');
    if (el) el.textContent = `${Math.round(v * 100)}%`;
  });
  bindInspectorSlider('ctrl-spot-gobo-spin', (v) => {
    _actSpot().goboSpin = v;
    const el = document.getElementById('val-spot-gobo-spin');
    if (el) el.textContent = v.toFixed(2);
  });
  bindInspectorSlider('ctrl-spot-radius', (v) => { _actSpot().radius = v; document.getElementById('val-spot-radius').textContent = v.toFixed(2); });
  bindInspectorSlider('ctrl-spot-soft', (v) => { _actSpot().softness = v; document.getElementById('val-spot-soft').textContent = v.toFixed(2); });
  bindInspectorSlider('ctrl-spot-gain', (v) => { _actSpot().gain = v; document.getElementById('val-spot-gain').textContent = v.toFixed(2); });
  bindInspectorSlider('ctrl-spot-ambient', (v) => { _actSpot().ambient = v; document.getElementById('val-spot-ambient').textContent = `${Math.round(v * 100)}%`; });
  bindInspectorSlider('ctrl-spot-sx', (v) => { _actSpot().stretchX = v; document.getElementById('val-spot-sx').textContent = `${v.toFixed(2)}×`; });
  bindInspectorSlider('ctrl-spot-sy', (v) => { _actSpot().stretchY = v; document.getElementById('val-spot-sy').textContent = `${v.toFixed(2)}×`; });
  bindInspectorSlider('ctrl-spot-rot', (v) => { _actSpot().rotation = v; document.getElementById('val-spot-rot').textContent = `${Math.round(v)}°`; });
  bindInspectorSlider('ctrl-spot-morph', (v) => {
    _actSpot().morph = v;
    const names = ['Circle', 'Diamond', 'Star', 'Living'];
    document.getElementById('val-spot-morph').textContent = names[Math.min(3, Math.round(v))];
  });
  bindInspectorSlider('ctrl-spot-inertia', (v) => { _actSpot().inertia = v; document.getElementById('val-spot-inertia').textContent = v.toFixed(2); });

  document.getElementById('btn-spot-reset-shape').addEventListener('click', () => {
    const sp = _actSpot();
    sp.stretchX = 1.0;
    sp.stretchY = 1.0;
    sp.rotation = 0;
    sp.morph = 0;
    syncFollowspotInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-spot-lock').addEventListener('click', () => {
    if (document.pointerLockElement === stageOverlay) {
      document.exitPointerLock();
    } else {
      if (!state.steerSpotMode) toggleSpotSteerMode(true);
      stageOverlay.requestPointerLock?.();
    }
  });

  bindInspectorSlider('ctrl-spot-sdepth', (v) => { _actSpot().shadowDepth = v; document.getElementById('val-spot-sdepth').textContent = v.toFixed(2); });
  bindInspectorSlider('ctrl-spot-stex', (v) => { _actSpot().shadowTex = v; document.getElementById('val-spot-stex').textContent = v.toFixed(2); });
  bindInspectorSlider('ctrl-spot-srnd', (v) => { _actSpot().shadowRnd = v; document.getElementById('val-spot-srnd').textContent = v.toFixed(2); });
  bindInspectorSlider('ctrl-spot-sspeed', (v) => { _actSpot().shadowSpeed = v; document.getElementById('val-spot-sspeed').textContent = v.toFixed(2); });
  bindInspectorSlider('ctrl-spot-temp', (v) => { _actSpot().temp = v; document.getElementById('val-spot-temp').textContent = `${Math.round(5100 + v * 2400)}K`; });

  document.getElementById('pick-spot-a').addEventListener('input', (e) => { _actSpot().colA = e.target.value; });
  document.getElementById('pick-spot-b').addEventListener('input', (e) => { _actSpot().colB = e.target.value; });
  document.getElementById('pick-spot-c').addEventListener('input', (e) => { _actSpot().colC = e.target.value; });

  // Milestone 7C: 3D Convergent Performer Followspot Controls
  document.getElementById('chk-spot-converge3d')?.addEventListener('change', (e) => {
    pushUndoCheckpoint('Toggle 3D Convergent Followspot');
    const sp = _actSpot();
    sp.converge3D = !!e.target.checked;
    if (sp.converge3D && sp.mode === 'off') {
      sp.mode = 'veil';
      syncFollowspotInspectorUI();
    }
    if (typeof syncStagePlanDialogUI === 'function') syncStagePlanDialogUI();
    scheduleAutosave();
  });
  document.getElementById('chk-spot-mask-spill')?.addEventListener('change', (e) => {
    pushUndoCheckpoint('Toggle Followspot Spill Mask');
    _actSpot().maskBgSpill = !!e.target.checked;
    scheduleAutosave();
  });
  bindInspectorSlider('ctrl-spot-perf-depth', (v) => {
    _actSpot().performerDepthM = v;
    document.getElementById('val-spot-perf-depth').textContent = `${v.toFixed(2)}m`;
    if (typeof syncStagePlanDialogUI === 'function') syncStagePlanDialogUI();
  });
  bindInspectorSlider('ctrl-spot-perf-height', (v) => {
    _actSpot().performerHeightM = v;
    document.getElementById('val-spot-perf-height').textContent = `${v.toFixed(2)}m`;
    if (typeof syncStagePlanDialogUI === 'function') syncStagePlanDialogUI();
  });
  bindInspectorSlider('ctrl-spot-perf-radius', (v) => {
    _actSpot().performerRadiusM = v;
    document.getElementById('val-spot-perf-radius').textContent = `${v.toFixed(2)}m`;
    if (typeof syncStagePlanDialogUI === 'function') syncStagePlanDialogUI();
  });
  document.getElementById('btn-spot-open-stageplan')?.addEventListener('click', (e) => {
    if (e.altKey && typeof openStagePlanModal === 'function') openStagePlanModal();
    else setLayoutMode('rig');
  });

  // Milestone 5: Mod/IO Inspector Controls (Audio FFT, Universal Modulators, MIDI, Gamepad, OSC)
  document.getElementById('btn-audio-enable').addEventListener('click', async () => {
    if (state.audio.enabled) disableAudioAnalyzer();
    else await enableAudioAnalyzer(state.audio.sourceMode);
    syncModIoInspectorUI();
  });
  document.getElementById('sel-audio-mode').addEventListener('change', async (e) => {
    state.audio.sourceMode = e.target.value;
    await enableAudioAnalyzer(state.audio.sourceMode);
    syncModIoInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('sel-audio-device')?.addEventListener('change', async (e) => {
    state.audio.deviceId = e.target.value || '';
    await enableAudioAnalyzer('mic', state.audio.deviceId);
    syncModIoInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('sel-audio-video-src')?.addEventListener('change', async (e) => {
    state.audio.videoSourceId = e.target.value || 'auto';
    if (!state.audio.enabled || state.audio.sourceMode !== 'video') {
      await enableAudioAnalyzer('video');
    } else {
      attachActiveVideoToAudioGraph();
    }
    syncModIoInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-audio-vid-speaker')?.addEventListener('click', async () => {
    const vSrc = typeof resolveAudioTargetVideoSource === 'function' ? resolveAudioTargetVideoSource() : null;
    if (!vSrc) {
      showToast('Import a Video Clip first (+ Video…)');
      return;
    }
    vSrc.muted = !vSrc.muted;
    if (!vSrc.muted && (vSrc.volume ?? 0.8) <= 0.01) vSrc.volume = 0.8;
    syncVideoAudioElementState(vSrc, true);
    if (!state.audio.enabled || state.audio.sourceMode !== 'video') {
      await enableAudioAnalyzer('video');
    } else {
      attachActiveVideoToAudioGraph();
    }
    renderMediaBin();
    syncTransportUI();
    syncModIoInspectorUI();
    scheduleAutosave();
    if (!vSrc.muted && vSrc.hasAudioTrack === false) {
      showToast(`⚠ "${vSrc.name}" has no audio track in the video file`);
    } else {
      showToast(vSrc.muted
        ? `🔇 "${vSrc.name}" Speakers Muted (FFT still active!)`
        : `🔊 "${vSrc.name}" Sound ON (${Math.round((vSrc.volume ?? 0.8) * 100)}%)`);
    }
  });
  document.getElementById('btn-audio-load-video')?.addEventListener('click', () => {
    // Keep file-picker call synchronous inside the click gesture so transient user activation is never lost!
    state._unmuteNextImportedVideo = true;
    state.audio.sourceMode = 'video';
    state.audio.enabled = true;
    if (typeof ensureLiveAudioGraph === 'function') ensureLiveAudioGraph();
    if (typeof liveAudioCtx !== 'undefined' && liveAudioCtx && liveAudioCtx.state === 'suspended' && typeof liveAudioCtx.resume === 'function') {
      try { liveAudioCtx.resume().catch(() => {}); } catch (_) {}
    }
    syncModIoInspectorUI();
    scheduleAutosave();
    pickMediaFilesWithHandles(false, fileInputEl);
  });
  document.getElementById('btn-audio-capture-window')?.addEventListener('click', async () => {
    const created = await addScreenCaptureSource();
    if (created) {
      await enableAudioAnalyzer('syphon');
    }
    syncModIoInspectorUI();
  });
  document.getElementById('btn-audio-demo-1')?.addEventListener('click', async () => {
    if (typeof loadBuiltInDemoVideo === 'function') {
      await loadBuiltInDemoVideo('drums', true);
    }
    syncModIoInspectorUI();
  });
  document.getElementById('btn-audio-demo-2')?.addEventListener('click', async () => {
    if (typeof loadBuiltInDemoVideo === 'function') {
      await loadBuiltInDemoVideo('beams', true);
    }
    syncModIoInspectorUI();
  });
  bindInspectorSlider('ctrl-audio-gain', (v) => {
    state.audio.gain = v;
    document.getElementById('val-audio-gain').textContent = `${v.toFixed(2)}×`;
  }, true, 'Audio Gain');
  document.getElementById('inp-audio-bpm').addEventListener('change', (e) => {
    state.audio.bpm = clamp(parseFloat(e.target.value) || 120, 40, 240);
    state.audio.autoBpm = false;
    syncModIoInspectorUI();
    scheduleAutosave();
  });
  document.getElementById('btn-audio-tap').addEventListener('click', () => {
    tapGlobalAudioBpm();
    syncModIoInspectorUI();
  });
  document.getElementById('chk-audio-autobpm').addEventListener('change', (e) => {
    state.audio.autoBpm = !!e.target.checked;
    scheduleAutosave();
  });

  document.getElementById('btn-add-mod').addEventListener('click', () => {
    const tKey = document.getElementById('sel-mod-target').value || 'master:opacity';
    const kind = document.getElementById('sel-mod-kind').value || 'lfo';
    if (kind === 'audio' && !state.audio.enabled) {
      enableAudioAnalyzer(state.audio.sourceMode);
    }
    addModulatorForTarget(tKey, kind);
    syncModIoInspectorUI();
  });
  document.getElementById('btn-clear-all-mods').addEventListener('click', () => {
    if (!state.modulators || state.modulators.length === 0) return;
    pushUndoCheckpoint('Clear All Modulators');
    state.modulators = [];
    syncModulatedSliderHighlights();
    renderModulatorsListUI();
    scheduleAutosave();
  });

  document.getElementById('btn-insp-midi-enable').addEventListener('click', () => enableWebMidi());
  document.getElementById('btn-insp-midi-learn').addEventListener('click', () => toggleMidiLearnMode());
  document.getElementById('chk-gamepad-enable').addEventListener('change', (e) => {
    state.gamepad.enabled = !!e.target.checked;
    syncModIoInspectorUI();
  });
  document.getElementById('sel-gamepad-rstick').addEventListener('change', (e) => {
    state.gamepad.rightStickMode = e.target.value;
  });

  const inpOscUrl = document.getElementById('inp-osc-url');
  bindImeSafeBlurOnEnter(inpOscUrl);
  inpOscUrl.addEventListener('change', (e) => {
    state.osc.wsUrl = e.target.value.trim() || 'ws://127.0.0.1:8080';
  });
  document.getElementById('btn-osc-connect').addEventListener('click', () => {
    if (state.osc.status === 'connected' || state.osc.status === 'connecting') {
      disconnectOscWebSocket(true);
    } else {
      connectOscWebSocket(inpOscUrl.value);
    }
  });
  document.getElementById('chk-osc-feedback').addEventListener('change', (e) => {
    state.osc.sendFeedback = !!e.target.checked;
    scheduleAutosave();
  });

  // Contextual Quick Modulation Popover & 1-Click MIDI Learn Slider Interception (viewport-aware-dropdowns)
  const modPopEl = document.getElementById('mod-quick-popover');
  let activePopTarget = null;
  let anchoredSliderEl = null;
  const hasNativePopover = typeof HTMLElement !== 'undefined' && ('popover' in HTMLElement.prototype);
  const supportsAnchorPos = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('position-area: block-end');

  const closeQuickModPopover = () => {
    if (!modPopEl) return;
    if (hasNativePopover) {
      try { if (modPopEl.matches(':popover-open')) modPopEl.hidePopover(); } catch (_) {}
    } else {
      modPopEl.classList.remove(':popover-open');
      modPopEl.style.display = 'none';
    }
    if (anchoredSliderEl) {
      anchoredSliderEl.style.anchorName = '';
      anchoredSliderEl = null;
    }
  };

  if (!hasNativePopover && modPopEl) {
    modPopEl.style.display = 'none';
    modPopEl.style.position = 'fixed';
    document.addEventListener('pointerdown', (ev) => {
      if (modPopEl.classList.contains(':popover-open') && !modPopEl.contains(ev.target)) {
        closeQuickModPopover();
      }
    });
  } else if (modPopEl) {
    modPopEl.addEventListener('toggle', (ev) => {
      if (ev.newState === 'closed' && anchoredSliderEl) {
        anchoredSliderEl.style.anchorName = '';
        anchoredSliderEl = null;
      }
    });
  }

  document.addEventListener('pointerdown', (ev) => {
    if (!state.midi || !state.midi.learnArmed || ev.button !== 0) return;
    const sl = ev.target && ev.target.closest ? ev.target.closest('input[type="range"].studio-slider') : null;
    if (!sl) return;
    const desc = describeSliderTarget(sl);
    if (!desc) return;
    ev.preventDefault();
    ev.stopPropagation();
    armMidiLearnForTarget(desc);
  }, true);

  document.addEventListener('contextmenu', (ev) => {
    const sl = ev.target && ev.target.closest ? ev.target.closest('input[type="range"].studio-slider') : null;
    if (!sl || !modPopEl) return;
    const desc = describeSliderTarget(sl);
    if (!desc) return;
    ev.preventDefault();
    activePopTarget = desc;
    const titleEl = document.getElementById('mod-pop-title');
    if (titleEl) titleEl.textContent = desc.label;

    if (anchoredSliderEl && anchoredSliderEl !== sl) {
      anchoredSliderEl.style.anchorName = '';
    }
    anchoredSliderEl = sl;
    if (supportsAnchorPos) {
      sl.style.anchorName = '--mod-pop-anchor';
    } else {
      const r = sl.getBoundingClientRect();
      const left = clamp(ev.clientX || r.left, 8, Math.max(8, window.innerWidth - 228));
      const top = clamp((r.bottom + 6), 8, Math.max(8, window.innerHeight - 230));
      modPopEl.style.position = 'fixed';
      modPopEl.style.left = `${Math.round(left)}px`;
      modPopEl.style.top = `${Math.round(top)}px`;
    }

    if (hasNativePopover) {
      try { modPopEl.showPopover(); } catch (_) {}
    } else {
      modPopEl.classList.add(':popover-open');
      modPopEl.style.display = 'flex';
    }
  });

  document.getElementById('btn-pop-lfo').addEventListener('click', () => {
    if (activePopTarget) {
      addModulatorForTarget(activePopTarget.targetKey, 'lfo');
      if (typeof openInlineModDrawerForTarget === 'function') openInlineModDrawerForTarget(activePopTarget.targetKey);
      if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
    }
    closeQuickModPopover();
  });
  document.getElementById('btn-pop-audio').addEventListener('click', () => {
    if (activePopTarget) {
      if (!state.audio.enabled) enableAudioAnalyzer(state.audio.sourceMode);
      addModulatorForTarget(activePopTarget.targetKey, 'audio', { audioBand: 'sub' });
      if (typeof openInlineModDrawerForTarget === 'function') openInlineModDrawerForTarget(activePopTarget.targetKey);
      if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
    }
    closeQuickModPopover();
  });
  document.getElementById('btn-pop-beat').addEventListener('click', () => {
    if (activePopTarget) {
      if (!state.audio.enabled) enableAudioAnalyzer(state.audio.sourceMode);
      addModulatorForTarget(activePopTarget.targetKey, 'audio', { audioBand: 'beat', gain: 1.5 });
      if (typeof openInlineModDrawerForTarget === 'function') openInlineModDrawerForTarget(activePopTarget.targetKey);
      if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
    }
    closeQuickModPopover();
  });
  document.getElementById('btn-pop-seq').addEventListener('click', () => {
    if (activePopTarget) {
      addModulatorForTarget(activePopTarget.targetKey, 'seq');
      if (typeof openInlineModDrawerForTarget === 'function') openInlineModDrawerForTarget(activePopTarget.targetKey);
      if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
    }
    closeQuickModPopover();
  });
  document.getElementById('btn-pop-midi').addEventListener('click', () => {
    if (activePopTarget) armMidiLearnForTarget(activePopTarget);
    closeQuickModPopover();
  });
  document.getElementById('btn-pop-timeline').addEventListener('click', () => {
    if (activePopTarget) addTimelineTrackForTarget(activePopTarget.targetKey);
    closeQuickModPopover();
  });
  document.getElementById('btn-pop-open-matrix')?.addEventListener('click', () => {
    switchInspTab('mod');
    closeQuickModPopover();
  });
  document.getElementById('btn-pop-clear').addEventListener('click', () => {
    if (activePopTarget) {
      if (state.inlineModOpenKeys) delete state.inlineModOpenKeys[activePopTarget.targetKey];
      clearModulatorsForTarget(activePopTarget.targetKey);
      if (typeof renderSynopticStripUI === 'function') renderSynopticStripUI();
    }
    closeQuickModPopover();
  });

  // 6. Transport Bar Controls (Pro Video, Procedural Shaders, ISF, Mixbus, Typography, Screen Capture & Cam)
  document.getElementById('btn-vid-play').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video' || src.offline) return;
    src.playing = !src.playing;
    if (src.playing) {
      const dur = src.video.duration || 0;
      const inSec = (src.trimIn ?? 0) * dur;
      const outSec = (src.trimOut ?? 1) * dur;
      if (src.video.ended || (dur > 0 && src.video.currentTime >= outSec - 0.02)) {
        src.video.currentTime = inSec;
      }
      syncVideoAudioElementState(src);
      src.video.play().catch(() => {});
    } else {
      src.video.pause();
    }
    if (state.audio && state.audio.enabled && state.audio.sourceMode === 'video') {
      attachActiveVideoToAudioGraph();
    }
    syncTransportUI();
    if (state.inspTab === 'mod' && typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  });
  document.getElementById('btn-vid-restart').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video' || src.offline) return;
    const dur = src.video.duration || 0;
    src.pingPongDir = 1;
    src.video.currentTime = (src.trimIn ?? 0) * dur;
    src.playing = true;
    src.needsUpload = true;
    syncVideoAudioElementState(src);
    src.video.play().catch(() => {});
    if (state.audio && state.audio.enabled && state.audio.sourceMode === 'video') {
      attachActiveVideoToAudioGraph();
    }
    syncTransportUI();
    if (state.inspTab === 'mod' && typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  });
  document.getElementById('btn-vid-prev-frame').addEventListener('click', () => {
    stepVideoFrame(getSourceById(state.activeSourceId), -1);
  });
  document.getElementById('btn-vid-next-frame').addEventListener('click', () => {
    stepVideoFrame(getSourceById(state.activeSourceId), 1);
  });
  const scrubEl = document.getElementById('ctrl-vid-scrub');
  let userScrubbing = false;
  scrubEl.addEventListener('pointerdown', () => { userScrubbing = true; });
  window.addEventListener('pointerup', () => { userScrubbing = false; });
  scrubEl.addEventListener('input', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video' || !src.video || !src.video.duration) return;
    const t = parseFloat(scrubEl.value);
    setSliderValue(scrubEl, t);
    src.video.currentTime = t * src.video.duration;
    src.needsUpload = true;
    if (state.audio && state.audio.enabled && state.audio.sourceMode === 'video') {
      attachActiveVideoToAudioGraph();
    }
  });

  const syncTrimControlsForVideo = (src) => {
    setSliderValue(document.getElementById('ctrl-vid-in'), src.trimIn ?? 0);
    document.getElementById('val-vid-in').textContent = `${Math.round((src.trimIn ?? 0) * 100)}%`;
    setSliderValue(document.getElementById('ctrl-vid-out'), src.trimOut ?? 1);
    document.getElementById('val-vid-out').textContent = `${Math.round((src.trimOut ?? 1) * 100)}%`;
    renderVideoWaveformCanvas(src);
  };

  document.getElementById('btn-vid-set-in').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video' || !src.video || !src.video.duration) return;
    src.trimIn = clamp(src.video.currentTime / src.video.duration, 0, 0.99);
    normalizeVideoTrim(src, 'in');
    syncTrimControlsForVideo(src);
    scheduleAutosave();
    showToast(`Trim In set at ${formatTimecode(src.trimIn * src.video.duration)}`);
  });
  document.getElementById('btn-vid-set-out').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video' || !src.video || !src.video.duration) return;
    src.trimOut = clamp(src.video.currentTime / src.video.duration, 0.01, 1);
    normalizeVideoTrim(src, 'out');
    syncTrimControlsForVideo(src);
    scheduleAutosave();
    showToast(`Trim Out set at ${formatTimecode(src.trimOut * src.video.duration)}`);
  });
  document.getElementById('btn-vid-reset-trim').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video') return;
    src.trimIn = 0;
    src.trimOut = 1;
    normalizeVideoTrim(src, 'in');
    syncTrimControlsForVideo(src);
    scheduleAutosave();
    showToast('Reset Video Trim Handles (0% – 100%)');
  });
  bindInspectorSlider('ctrl-vid-in', (val) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video') return;
    src.trimIn = val;
    normalizeVideoTrim(src, 'in');
    syncTrimControlsForVideo(src);
  }, false);
  document.getElementById('ctrl-vid-in').addEventListener('change', () => scheduleAutosave());

  bindInspectorSlider('ctrl-vid-out', (val) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video') return;
    src.trimOut = val;
    normalizeVideoTrim(src, 'out');
    syncTrimControlsForVideo(src);
  }, false);
  document.getElementById('ctrl-vid-out').addEventListener('change', () => scheduleAutosave());

  document.getElementById('sel-vid-loop').addEventListener('change', (e) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video') return;
    src.loopMode = e.target.value;
    src.pingPongDir = 1;
    normalizeVideoTrim(src, 'in');
    if (src.playing && src.loopMode === 'loop' && src.video?.paused) src.video.play().catch(() => {});
    scheduleAutosave();
  });
  document.getElementById('btn-vid-xfade-loop').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video') return;
    src.seamlessLoop = !src.seamlessLoop;
    normalizeVideoTrim(src, 'in');
    syncTransportUI();
    scheduleAutosave();
    showToast(src.seamlessLoop
      ? '⇄ GPU Seamless Loop Crossfade ON (zero-lag FBO dissolve)'
      : 'Seamless Loop Crossfade OFF');
  });
  bindInspectorSlider('ctrl-vid-rate', (val) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video') return;
    src.bpmSync = false;
    src.rate = val;
    if (src.video) src.video.playbackRate = val;
    document.getElementById('btn-vid-bpm-sync')?.classList.remove('active');
    const bpmWrap = document.getElementById('vid-bpm-wrap');
    if (bpmWrap) bpmWrap.hidden = true;
    document.getElementById('val-vid-rate').textContent = `${val.toFixed(2)}×`;
  }, false);
  document.getElementById('ctrl-vid-rate').addEventListener('change', () => scheduleAutosave());

  document.getElementById('btn-vid-bpm-sync').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video') return;
    src.bpmSync = !src.bpmSync;
    if (src.bpmSync) applyVideoBpmRate(src);
    syncTransportUI();
    scheduleAutosave();
    showToast(src.bpmSync
      ? `🥁 BPM Rate Sync ON (${Math.round(src.targetBpm || 120)} BPM → ${src.rate.toFixed(2)}×)`
      : 'BPM Rate Sync OFF');
  });
  document.getElementById('inp-vid-bpm').addEventListener('change', (e) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video') return;
    src.targetBpm = clamp(parseFloat(e.target.value) || 120, 40, 240);
    src.bpmSync = true;
    applyVideoBpmRate(src);
    syncTransportUI();
    scheduleAutosave();
  });
  document.getElementById('btn-vid-tap-bpm').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video') return;
    const bpm = registerVideoTapTempo(src);
    if (bpm) {
      syncTransportUI();
      scheduleAutosave();
      showToast(`🥁 Tap Tempo: ${bpm} BPM (${src.rate.toFixed(2)}×)`);
    } else {
      showToast('🥁 Tap again in rhythm to lock BPM…');
    }
  });
  document.getElementById('btn-vid-mute').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video' || !src.video) return;
    src.muted = !src.muted;
    if (!src.muted && (src.volume ?? 0.8) <= 0.01) src.volume = 0.8;
    if (typeof syncVideoAudioElementState === 'function') syncVideoAudioElementState(src, true);
    else src.video.muted = src.muted;
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
    if (!src.muted && src.hasAudioTrack === false) {
      showToast(`⚠ "${src.name}" has no audio track in the video file`);
    } else {
      showToast(src.muted
        ? `🔇 "${src.name}" Speakers Muted`
        : `🔊 "${src.name}" Sound ON (${Math.round((src.volume ?? 0.8) * 100)}%)`);
    }
  });
  bindInspectorSlider('ctrl-vid-vol', (val) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'video' || !src.video) return;
    src.volume = val;
    if (val > 0 && src.muted) {
      src.muted = false;
      if (state.audio && (!state.audio.enabled || state.audio.sourceMode === 'synth')) {
        state.audio.videoSourceId = 'auto';
        if (typeof enableAudioAnalyzer === 'function') enableAudioAnalyzer('video');
      }
    }
    if (typeof syncVideoAudioElementState === 'function') syncVideoAudioElementState(src, true);
    else { src.video.volume = val; src.video.muted = src.muted; }
    renderMediaBin();
    syncTransportUI();
    if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  }, false);
  document.getElementById('ctrl-vid-vol')?.addEventListener('change', () => scheduleAutosave());

  document.getElementById('btn-shd-play').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'shader') return;
    src.playing = !src.playing;
    syncTransportUI();
  });
  document.getElementById('sel-shd-palette').addEventListener('change', (e) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'shader') return;
    src.palette = parseInt(e.target.value, 10);
    scheduleAutosave();
  });
  bindInspectorSlider('ctrl-shd-speed', (v) => { const s = getSourceById(state.activeSourceId); if (s?.kind === 'shader') { s.speed = v; document.getElementById('val-shd-speed').textContent = v.toFixed(2); } });
  bindInspectorSlider('ctrl-shd-scale', (v) => { const s = getSourceById(state.activeSourceId); if (s?.kind === 'shader') { s.scale = v; document.getElementById('val-shd-scale').textContent = v.toFixed(2); } });
  bindInspectorSlider('ctrl-shd-detail', (v) => { const s = getSourceById(state.activeSourceId); if (s?.kind === 'shader') { s.detail = v; document.getElementById('val-shd-detail').textContent = v.toFixed(2); } });
  bindInspectorSlider('ctrl-shd-temp', (v) => { const s = getSourceById(state.activeSourceId); if (s?.kind === 'shader') s.temp = v; });
  document.getElementById('btn-shd-fork-isf').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    forkShaderToStudio(src);
  });

  // ISF Source Transport Controls
  document.getElementById('btn-isf-play').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'isf') return;
    src.playing = !src.playing;
    syncTransportUI();
  });
  bindInspectorSlider('ctrl-isf-speed', (v) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'isf') return;
    src.speed = v;
    document.getElementById('val-isf-speed').textContent = `${v.toFixed(2)}×`;
  });
  document.getElementById('btn-isf-edit-code').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (src && src.kind === 'isf') openShaderStudioDrawer(src.id);
  });
  document.getElementById('btn-isf-mirror').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'isf') return;
    src.mirrorX = !src.mirrorX;
    syncTransportUI();
  });

  // Mix Circle Bus Transport Controls
  document.getElementById('btn-mixbus-mode').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'mixbus') return;
    src.editOrbsMode = !(src.editOrbsMode !== false);
    syncTransportUI();
    showToast(src.editOrbsMode
      ? '◎ Mix Circle Radar Orbs ON — Drag orbs in Input UV (Dbl-Click to Solo)'
      : 'Input UV Slice Handles ON for Mix Circle Bus');
  });
  document.getElementById('sel-mixbus-blend').addEventListener('change', (e) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'mixbus') return;
    pushUndoCheckpoint('Change Mix Circle Blend');
    src.blendMode = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderMediaBin();
    scheduleAutosave();
  });
  bindInspectorSlider('ctrl-mixbus-orbit', (v) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'mixbus') return;
    src.autoOrbit = v;
    document.getElementById('val-mixbus-orbit').textContent = v.toFixed(2);
  });
  bindInspectorSlider('ctrl-mixbus-curve', (v) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'mixbus') return;
    src.falloffCurve = v;
    document.getElementById('val-mixbus-curve').textContent = v.toFixed(2);
  });
  document.getElementById('sel-mixbus-orb-src').addEventListener('change', (e) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'mixbus') return;
    const orb = (src.orbs || []).find(o => o.id === src.selectedOrbId);
    if (!orb) return;
    pushUndoCheckpoint('Change Mix Orb Source');
    orb.sourceId = e.target.value;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    scheduleAutosave();
  });
  document.getElementById('btn-mixbus-add-orb').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'mixbus') return;
    pushUndoCheckpoint('Add Mix Circle Orb');
    const chosenId = document.getElementById('sel-mixbus-orb-src').value;
    addMixbusOrb(src, chosenId);
    renderMediaBin();
    syncTransportUI();
    scheduleAutosave();
    showToast('Added Source Orb to Mix Circle Bus');
  });
  document.getElementById('btn-mixbus-mute-orb').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'mixbus') return;
    const orb = (src.orbs || []).find(o => o.id === src.selectedOrbId);
    if (!orb) return;
    pushUndoCheckpoint('Toggle Mix Orb Mute');
    orb.muted = !orb.muted;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    syncTransportUI();
    scheduleAutosave();
  });
  document.getElementById('btn-mixbus-del-orb').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'mixbus') return;
    if ((src.orbs || []).length <= 1) {
      showToast('Mix Circle Bus keeps at least 1 Source Orb');
      return;
    }
    pushUndoCheckpoint('Remove Mix Circle Orb');
    if (removeMixbusOrb(src, src.selectedOrbId)) {
      renderMediaBin();
      syncTransportUI();
      scheduleAutosave();
    }
  });

  // Dynamic Typography Transport & Typography Studio Modal Controls
  const markTextSourceMutated = (src, syncDlg = true) => {
    if (!src || src.kind !== 'text') return;
    src._textDirty = true;
    src._thumbDirty = true;
    state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    renderTextSourceCanvas(src, 0, true);
    syncTransportUI();
    if (syncDlg && textDialog.open) syncTextStudioDialogUI(src);
  };

  document.getElementById('btn-txt-play').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'text') return;
    src.playing = !(src.playing !== false);
    state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    syncTransportUI();
    scheduleAutosave();
  });

  const inpTxtQuick = document.getElementById('inp-txt-quick');
  bindImeSafeBlurOnEnter(inpTxtQuick);
  inpTxtQuick.addEventListener('input', (e) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'text') return;
    src.text = e.target.value.replace(/\s*↵\s*/g, '\n');
    markTextSourceMutated(src, true);
  });
  inpTxtQuick.addEventListener('change', () => scheduleAutosave());

  document.getElementById('sel-txt-anim').addEventListener('change', (e) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'text') return;
    pushUndoCheckpoint('Change Typography Motion');
    src.animMode = e.target.value;
    markTextSourceMutated(src, true);
    renderMediaBin();
    scheduleAutosave();
  });
  bindInspectorSlider('ctrl-txt-size', (v) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'text') return;
    src.fontSize = Math.round(v);
    document.getElementById('val-txt-size').textContent = String(src.fontSize);
    markTextSourceMutated(src, true);
  });
  document.getElementById('pick-txt-fg').addEventListener('input', (e) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'text') return;
    src.fgColor = e.target.value;
    markTextSourceMutated(src, true);
  });
  document.getElementById('pick-txt-fg').addEventListener('change', () => scheduleAutosave());
  bindInspectorSlider('ctrl-txt-bg-alpha', (v) => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'text') return;
    src.bgOpacity = v;
    document.getElementById('val-txt-bg-alpha').textContent = `${Math.round(v * 100)}%`;
    markTextSourceMutated(src, true);
  });
  document.getElementById('btn-open-text-dialog').addEventListener('click', () => {
    openTextStudioModal(state.activeSourceId);
  });
  document.getElementById('btn-txt-mirror').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || src.kind !== 'text') return;
    src.mirrorX = !src.mirrorX;
    state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    syncTransportUI();
    scheduleAutosave();
  });

  // Typography Studio Modal Dialog Bindings
  const inpTxtSrcName = document.getElementById('inp-txt-src-name');
  bindImeSafeBlurOnEnter(inpTxtSrcName);
  inpTxtSrcName.addEventListener('input', (e) => {
    const src = getActiveTextStudioSource();
    if (!src) return;
    src.name = e.target.value || 'Stage Text';
    state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    renderMediaBin();
    renderSurfaceList();
    syncInspectorUI();
    syncTransportUI();
    scheduleAutosave();
  });

  const inpTxtMulti = document.getElementById('inp-txt-multiline');
  inpTxtMulti.addEventListener('input', (e) => {
    const src = getActiveTextStudioSource();
    if (!src) return;
    src.text = e.target.value;
    markTextSourceMutated(src, false);
  });
  inpTxtMulti.addEventListener('change', () => scheduleAutosave());

  for (const tokBtn of textDialog.querySelectorAll('button[data-txt-token]')) {
    tokBtn.addEventListener('click', () => {
      const src = getActiveTextStudioSource();
      if (!src) return;
      const token = tokBtn.dataset.txtToken || '{TIME24}';
      const s = inpTxtMulti.selectionStart ?? inpTxtMulti.value.length;
      const end = inpTxtMulti.selectionEnd ?? inpTxtMulti.value.length;
      inpTxtMulti.setRangeText(token, s, end, 'end');
      src.text = inpTxtMulti.value;
      markTextSourceMutated(src, false);
      scheduleAutosave();
      inpTxtMulti.focus();
    });
  }

  document.getElementById('sel-txt-font').addEventListener('change', (e) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.fontFamily = e.target.value;
    markTextSourceMutated(src, false);
    scheduleAutosave();
  });
  document.getElementById('sel-txt-weight').addEventListener('change', (e) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.fontWeight = e.target.value;
    markTextSourceMutated(src, false);
    scheduleAutosave();
  });
  document.getElementById('sel-txt-align').addEventListener('change', (e) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.align = e.target.value;
    markTextSourceMutated(src, false);
    scheduleAutosave();
  });

  bindInspectorSlider('ctrl-txt-dlg-size', (v) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.fontSize = Math.round(v);
    document.getElementById('val-txt-dlg-size').textContent = `${src.fontSize}px`;
    markTextSourceMutated(src, false);
  });
  bindInspectorSlider('ctrl-txt-tracking', (v) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.letterSpacing = Math.round(v);
    document.getElementById('val-txt-tracking').textContent = `${src.letterSpacing}px`;
    markTextSourceMutated(src, false);
  });
  bindInspectorSlider('ctrl-txt-leading', (v) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.lineHeight = v;
    document.getElementById('val-txt-leading').textContent = `${v.toFixed(2)}×`;
    markTextSourceMutated(src, false);
  });

  document.getElementById('pick-txt-dlg-fg').addEventListener('input', (e) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.fgColor = e.target.value;
    markTextSourceMutated(src, false);
  });
  document.getElementById('pick-txt-dlg-fg').addEventListener('change', () => scheduleAutosave());

  document.getElementById('pick-txt-stroke').addEventListener('input', (e) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.strokeColor = e.target.value;
    markTextSourceMutated(src, false);
  });
  document.getElementById('pick-txt-stroke').addEventListener('change', () => scheduleAutosave());

  document.getElementById('pick-txt-bg').addEventListener('input', (e) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.bgColor = e.target.value;
    markTextSourceMutated(src, false);
  });
  document.getElementById('pick-txt-bg').addEventListener('change', () => scheduleAutosave());

  bindInspectorSlider('ctrl-txt-stroke-w', (v) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.strokeWidth = v;
    document.getElementById('val-txt-stroke-w').textContent = `${v.toFixed(1)}px`;
    markTextSourceMutated(src, false);
  });
  bindInspectorSlider('ctrl-txt-glow', (v) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.glowBlur = Math.round(v);
    src.glowColor = src.strokeWidth > 0.2 ? src.strokeColor : src.fgColor;
    document.getElementById('val-txt-glow').textContent = `${src.glowBlur}px`;
    markTextSourceMutated(src, false);
  });
  bindInspectorSlider('ctrl-txt-dlg-bgop', (v) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.bgOpacity = v;
    document.getElementById('val-txt-dlg-bgop').textContent = `${Math.round(v * 100)}%`;
    markTextSourceMutated(src, false);
  });
  document.getElementById('sel-txt-dlg-anim').addEventListener('change', (e) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.animMode = e.target.value;
    markTextSourceMutated(src, false);
    renderMediaBin();
    scheduleAutosave();
  });
  bindInspectorSlider('ctrl-txt-speed', (v) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.animSpeed = v;
    document.getElementById('val-txt-speed').textContent = `${v.toFixed(2)}×`;
    markTextSourceMutated(src, false);
  });

  const inpTxtCdDone = document.getElementById('inp-txt-cd-done');
  bindImeSafeBlurOnEnter(inpTxtCdDone);
  inpTxtCdDone.addEventListener('input', (e) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.countdownDoneText = e.target.value;
    markTextSourceMutated(src, false);
  });
  inpTxtCdDone.addEventListener('change', () => scheduleAutosave());

  document.getElementById('inp-txt-cd-mins').addEventListener('change', (e) => {
    const src = getActiveTextStudioSource(); if (!src) return;
    src.countdownMinutes = clamp(parseFloat(e.target.value) || 10, 0.1, 1440);
    scheduleAutosave();
  });

  document.getElementById('btn-txt-cd-start').addEventListener('click', () => {
    const src = getActiveTextStudioSource(); if (!src) return;
    const mins = clamp(parseFloat(document.getElementById('inp-txt-cd-mins').value) || 10, 0.1, 1440);
    src.countdownMinutes = mins;
    src.countdownTargetMs = Date.now() + mins * 60 * 1000;
    if (!String(src.text || '').toUpperCase().includes('{COUNTDOWN}')) {
      src.text = (src.text ? `${src.text}\n` : '') + '{COUNTDOWN}';
      inpTxtMulti.value = src.text;
    }
    markTextSourceMutated(src, true);
    scheduleAutosave();
    showToast(`⏱ Countdown started: ${mins} min`);
  });

  document.getElementById('sel-cam-device').addEventListener('change', (e) => {
    const src = getSourceById(state.activeSourceId);
    if (src?.kind === 'live') switchLiveCameraDevice(src, e.target.value);
  });
  document.getElementById('btn-recapture-window').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (src?.kind === 'syphon') addScreenCaptureSource(src);
  });
  document.getElementById('btn-cam-mirror').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src) return;
    src.mirrorX = !src.mirrorX;
    state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    syncTransportUI();
  });
  document.getElementById('btn-relink-single').addEventListener('click', () => {
    const src = getSourceById(state.activeSourceId);
    if (!src || !src.offline) return;
    state.relinkSingleSourceId = src.id;
    pickMediaFilesWithHandles(true, relinkFileInput);
  });

  // 7. Global Drag & Drop Overlay
  const dropOverlayEl = document.getElementById('drop-overlay');
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      dragDepth++;
      dropOverlayEl.classList.add('active');
    }
  });
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlayEl.classList.remove('active');
  });
  window.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      dragDepth = 0;
      dropOverlayEl.classList.remove('active');
      captureDroppedFileHandles(e.dataTransfer);
      handleDroppedOrPickedFiles(e.dataTransfer.files);
    }
  });

  // 8. Global Keyboard Shortcuts (Show-Safe, A11y Tab-Clean & Modal-Guarded)
  window.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName?.toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || !!e.target?.isContentEditable;
    const anyModalOpen = !!(
      relinkDialog.open || shortcutsDialog.open || clonerDialog.open ||
      scannerDialog.open || textDialog.open || edgeblendDialog.open ||
      stageplanDialog?.open || cmdPaletteDialog?.open
    );
    const cmdOrCtrl = e.metaKey || e.ctrlKey;

    // Cmd/Ctrl+K opens Command Palette from anywhere (except when already open)
    if (cmdOrCtrl && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (cmdPaletteDialog?.open) cmdPaletteDialog.close();
      else openCommandPalette();
      return;
    }

    // Escape closes active Radial Pie Quasimode first
    if (e.key === 'Escape' && state.pieMenu?.open) {
      e.preventDefault();
      closePieMenuQuasimode(false);
      return;
    }

    // Guard modKeys & global shortcuts against text inputs and open modal <dialog>s! (A5)
    if (isTyping || anyModalOpen) return;

    if (e.key === 'r' || e.key === 'R') state.modKeys.r = true;
    if (e.key === 'm' || e.key === 'M') state.modKeys.m = true;
    if (e.key === 's' || e.key === 'S') state.modKeys.s = true;

    // F1 / F2 / F3: Instant <16ms Studio Task Room Switching (1 · BUILD / 2 · MAP / 3 · LIVE)
    if (e.key === 'F1' && !cmdOrCtrl) {
      e.preventDefault();
      if (typeof setStudioRoom === 'function') setStudioRoom('build');
      return;
    }
    if (e.key === 'F2' && !cmdOrCtrl) {
      e.preventDefault();
      if (typeof setStudioRoom === 'function') setStudioRoom('map');
      return;
    }
    if (e.key === 'F3' && !cmdOrCtrl) {
      e.preventDefault();
      if (typeof setStudioRoom === 'function') setStudioRoom('live');
      return;
    }

    // Hold W in 2 · MAP or 3 · LIVE = Hardware-Interlocked Surgical Warp Reach-Through (Shift+W remains Projector Window)
    if ((e.key === 'w' || e.key === 'W') && !e.shiftKey && !cmdOrCtrl && !e.altKey && (state.room === 'live' || state.room === 'map')) {
      e.preventDefault();
      if (!e.repeat && typeof setLiveReachThrough === 'function') {
        setLiveReachThrough(true);
      }
      return;
    }

    // Space: In 3 · LIVE = 0ms keydown GO! In 1 · WORLD / 2 · MAP = Pan Viewport when dragged OR GO on clean tap
    if (e.code === 'Space' && !cmdOrCtrl) {
      const onInteractive = tag === 'button' || tag === 'summary' || tag === 'a';
      if (!onInteractive) {
        e.preventDefault();
        if (!e.repeat) {
          if (state.room === 'live') {
            spacePanHeld = false;
            spacePanUsed = false;
            stepCue(e.shiftKey ? -1 : 1);
          } else {
            spacePanUsed = false;
            spacePanHeld = true;
          }
        }
        return;
      }
    }

    if (cmdOrCtrl && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) performRedo();
      else performUndo();
      return;
    }
    if (e.ctrlKey && !e.metaKey && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      performRedo();
      return;
    }
    if (cmdOrCtrl && (e.key === 'g' || e.key === 'G')) {
      e.preventDefault();
      createGroupFromSelection();
      return;
    }
    if (cmdOrCtrl && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      toggleMidiLearnMode();
      return;
    }
    if (cmdOrCtrl && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      const selectable = state.surfaces.filter(s => {
        const eff = getEffectiveSurfaceProps(s);
        return eff.visible && !eff.locked;
      });
      if (selectable.length > 0) {
        state.selectedVertex = null;
        state.selectedSurfaceIds = selectable.map(s => s.id);
        state.selectedSurfaceId = selectable[0].id;
        renderSurfaceList();
        syncInspectorUI();
        syncStageModePill();
        showToast(`Selected ${selectable.length} surface${selectable.length > 1 ? 's' : ''}`);
      }
      return;
    }

    // NOTE: Tab is NEVER intercepted globally so WAI-ARIA keyboard navigation stays 100% intact! (A4)
    if (e.key === '/' && !cmdOrCtrl) {
      e.preventDefault();
      openCommandPalette();
    } else if (e.key === '?' && !cmdOrCtrl) {
      e.preventDefault();
      renderShortcutsDialogFromKeymap();
      if (!shortcutsDialog.open) shortcutsDialog.showModal();
    } else if ((e.code === 'Backquote' || e.key === '`') && !cmdOrCtrl && !e.shiftKey) {
      e.preventDefault();
      toggleSpotSteerMode();
    } else if ((e.key === 'a' || e.key === 'A') && !cmdOrCtrl && !e.altKey) {
      if (!e.repeat) {
        e.preventDefault();
        openPieMenuQuasimode('add');
      }
    } else if ((e.key === 's' || e.key === 'S') && !cmdOrCtrl && !e.altKey && !state.steerSpotMode) {
      if (!e.repeat) {
        e.preventDefault();
        openPieMenuQuasimode('precision');
      }
    } else if (e.key === ',' && !cmdOrCtrl) {
      e.preventDefault();
      cycleSelectedVertex(-1);
    } else if (e.key === '.' && !cmdOrCtrl) {
      e.preventDefault();
      cycleSelectedVertex(1);
    } else if (e.key === 'Enter' && state.drawingSurfaceId) {
      e.preventDefault();
      finishActiveSurfaceDrawing();
    } else if (e.key === 'Enter' && state.drawingMaskId) {
      e.preventDefault();
      finishActiveMaskDrawing();
    } else if (e.key === 'Escape') {
      const selScr = typeof getSelectedProjectorScreen === 'function' ? getSelectedProjectorScreen() : null;
      if (state.midi && state.midi.learnArmed) {
        toggleMidiLearnMode(false);
      } else if (state.drawingSurfaceId) {
        finishActiveSurfaceDrawing();
      } else if (state.drawingMaskId) {
        finishActiveMaskDrawing();
      } else if (state.trackpadSpotTarget || state.steerSpotMode) {
        toggleSpotSteerMode(false);
      } else if (state.floorplan?.calibMode && typeof toggleFloorplanCalibMode === 'function') {
        toggleFloorplanCalibMode(false);
      } else if (state.masterKeystone?.editOnStage) {
        state.masterKeystone.editOnStage = false;
        syncOutputInspectorUI();
        syncStageModePill();
      } else if (selScr?.keystone?.editOnStage) {
        selScr.keystone.editOnStage = false;
        syncOutputInspectorUI();
        syncStageModePill();
      } else if (state.pixelMapper?.editOnStage) {
        state.pixelMapper.editOnStage = false;
        syncOutputInspectorUI();
        syncStageModePill();
      } else if (state.shutterHandlesVisible) {
        state.shutterHandlesVisible = false;
        syncInspectorUI();
        syncStageModePill();
      } else if (state.stageEditMode === 'mask' || state.leftTab === 'masks') {
        state.stageEditMode = 'geometry';
        if (state.leftTab === 'masks') switchLeftTab('surfaces');
        syncMaskInspectorUI();
        syncStageModePill();
      } else if (state.selectedVertex) {
        state.selectedVertex = null;
        if (state.calibCrosshair) state.calibCrosshair.active = false;
      } else if ((state.selectedSurfaceIds?.length || 0) > 1) {
        state.selectedSurfaceIds = state.selectedSurfaceId ? [state.selectedSurfaceId] : [];
        renderSurfaceList();
        syncInspectorUI();
        syncStageModePill();
      } else if (state.projectorMode && !state.isProjectorRole) {
        toggleLocalProjectorMode(false);
      }
    } else if ((e.key === 'l' || e.key === 'L') && !cmdOrCtrl) {
      document.getElementById('btn-spot-lock').click();
    } else if ((e.key === 'w' || e.key === 'W') && e.shiftKey && !cmdOrCtrl) {
      e.preventDefault();
      launchProjectorWindow();
    } else if ((e.code === 'Digit9' || e.key === '9' || e.key === '(') && e.shiftKey && !cmdOrCtrl) {
      e.preventDefault();
      toggleEcoMode();
    } else if ((e.key === 'p' || e.key === 'P') && !cmdOrCtrl) {
      if (e.shiftKey) {
        e.preventDefault();
        toggleShowLock();
      } else if (!state.isProjectorRole) {
        toggleLocalProjectorMode();
      }
    } else if ((e.key === 'f' || e.key === 'F') && state.projectorMode) {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    } else if ((e.key === 'b' || e.key === 'B') && !cmdOrCtrl) {
      if (!e.repeat) {
        e.preventDefault();
        beginBlackoutPress(e.shiftKey);
      }
    } else if ((e.key === 'g' || e.key === 'G') && !cmdOrCtrl) {
      document.getElementById('btn-all-cal').click();
    } else if ((e.key === 'h' || e.key === 'H') && !cmdOrCtrl) {
      document.getElementById('btn-wireframes').click();
    } else if (e.key === 'PageDown' || e.key === ']') {
      e.preventDefault();
      stepCue(1);
    } else if (e.key === 'PageUp' || e.key === '[') {
      e.preventDefault();
      stepCue(-1);
    } else if (e.key === '1') setLayoutMode('split');
    else if (e.key === '2') setLayoutMode('input');
    else if (e.key === '3') setLayoutMode('output');
    else if (e.key === '4' || ((e.key === 'v' || e.key === 'V') && !cmdOrCtrl)) {
      setLayoutMode(state.layoutMode === 'mix' ? 'split' : 'mix');
    } else if (e.key === '5') {
      setLayoutMode(state.layoutMode === 'rig' ? 'split' : 'rig');
    } else if ((e.key === 't' || e.key === 'T') && !cmdOrCtrl) {
      toggleTimelineDrawer();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (typeof deleteActiveSelection === 'function') {
        deleteActiveSelection();
      } else if (typeof isMaskStageEditActive === 'function' && isMaskStageEditActive()) {
        document.getElementById('btn-del-mask').click();
      } else {
        document.getElementById('btn-del-surf').click();
      }
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const pxStep = e.altKey ? 0.2 : (e.shiftKey ? 10.0 : 1.0);
      const stepX = pxStep / Math.max(256, state.stageWidth || 1920);
      const stepY = pxStep / Math.max(256, state.stageHeight || 1080);
      const dx = e.key === 'ArrowLeft' ? -stepX : (e.key === 'ArrowRight' ? stepX : 0);
      const dy = e.key === 'ArrowDown' ? -stepY : (e.key === 'ArrowUp' ? stepY : 0);
      // 1 · BUILD: arrows nudge the selected physical world object in metres (1 cm, Shift 10 cm, Alt 2 mm).
      if (typeof nudgeWorldSelectionMeters === 'function' &&
          nudgeWorldSelectionMeters(Math.sign(dx) * pxStep * 0.01, -Math.sign(dy) * pxStep * 0.01)) {
        return;
      }
      nudgeSelectedTargetByDelta(dx, dy, e.altKey);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      if (spacePanHeld && !spacePanUsed) {
        stepCue(e.shiftKey ? -1 : 1);
      }
      spacePanHeld = false;
      spacePanUsed = false;
    }
    if ((e.key === 'b' || e.key === 'B')) {
      cancelOrFinishBlackoutPress();
    }
    if ((e.key === 'w' || e.key === 'W') && state.liveReachThrough && typeof setLiveReachThrough === 'function') {
      setLiveReachThrough(false);
    }
    if ((e.key === 'a' || e.key === 'A') && state.pieMenu?.open && state.pieMenu.kind === 'add') {
      closePieMenuQuasimode(true);
    }
    if ((e.key === 's' || e.key === 'S') && state.pieMenu?.open && state.pieMenu.kind === 'precision') {
      closePieMenuQuasimode(true);
    }
    if (e.key === 'r' || e.key === 'R') state.modKeys.r = false;
    if (e.key === 'm' || e.key === 'M') state.modKeys.m = false;
    if (e.key === 's' || e.key === 'S') state.modKeys.s = false;
  });

  // Expose scrubber check for frame loop
  window._wmIsUserScrubbing = () => userScrubbing;
}

// ============================================================================
// 9. MAIN 60HZ RENDER & SYNC LOOP + STUDIO BOOTSTRAP
// ============================================================================

let prevNow = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
const fpsBadgeEl = document.getElementById('fps-badge');

function frameLoop(now) {
  const rawDtMs = now - prevNow;
  const dt = Math.min(0.06, Math.max(0.001, rawDtMs / 1000));
  prevNow = now;
  if (typeof updatePerfGovernor === 'function') updatePerfGovernor(rawDtMs, now);

  // Asymmetric theatrical Blackout: 0ms instant panic cut OUT, smooth fade IN on restore
  if (state.blackout) {
    state.blackoutFade = 0.0;
  } else {
    state.blackoutFade += (1.0 - state.blackoutFade) * Math.min(1.0, dt * 10.0);
  }

  if (!state.isProjectorRole) {
    updateAudioAnalyzerFrame(dt);
    pollGamepadFrame(dt);
    updateTimelineFrame(dt);
    updateModulatorsFrame(dt);
    updateConstellationFrame(dt);
    updateCueAutoFollowFrame(dt);
    updateFollowspotPhysics(dt);
    const mixSrc = getMixbusSource();
    if (mixSrc) updateMixbusPhysics(mixSrc, dt);
    updateCrossfade(dt);
    if (typeof advanceHeldClocks === 'function' && state.program && state.program.held) advanceHeldClocks(state.program, dt);
  } else {
    const spotsList = Array.isArray(state.spots) ? state.spots : [];
    for (const sp of spotsList) {
      if (!sp || sp.enabled === false) continue;
      sp.shadowTime = (sp.shadowTime || 0) + dt * (sp.shadowSpeed ?? 0.65);
      if (Math.abs(sp.goboSpin || 0) > 1e-4) {
        sp.goboAngleDeg = ((sp.goboAngleDeg || 0) + sp.goboSpin * 45.0 * dt) % 360.0;
      }
    }
  }

  updateSourceTextures(dt);
  if (typeof tickVenueWalk === 'function') tickVenueWalk(dt);
  if (typeof syncVenueHudUI === 'function' && !state.projectorMode) syncVenueHudUI();
  if (typeof syncPaneSoloButtons === 'function' && !state.projectorMode) syncPaneSoloButtons();
  if (typeof updateLinkedObjectSurfaces === 'function') updateLinkedObjectSurfaces();
  if (typeof syncVenueCardUI === 'function' && !state.projectorMode) syncVenueCardUI();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const metrics = renderWebGLWorkspace(dpr);
  lastInputMetrics = metrics.inputMetrics;
  lastStageMetrics = metrics.stageMetrics;
  updatePixelMapperFrame(dt);
  captureStageRecorderFrame(dt, lastStageMetrics);

  if (!state.projectorMode) {
    if (state.layoutMode === 'mix') {
      renderMixDeckCanvas(dpr);
    } else if (state.layoutMode === 'rig') {
      if (typeof renderRigWorkspaceCanvas === 'function') renderRigWorkspaceCanvas();
    } else {
      renderInputOverlay(dpr, lastInputMetrics);
    }
    renderStageOverlay(dpr, lastStageMetrics);
    if (state.inspTab === 'mod') {
      renderAudioSpectrumCanvas();
    }

    // Update active Video timecode readout
    const activeSrc = getSourceById(state.activeSourceId);
    if (activeSrc && activeSrc.kind === 'video' && activeSrc.video && !activeSrc.offline) {
      const vid = activeSrc.video;
      const dur = vid.duration || 0;
      const cur = vid.currentTime || 0;
      if (dur > 0 && !window._wmIsUserScrubbing?.()) {
        setSliderValue(document.getElementById('ctrl-vid-scrub'), cur / dur);
      }
      document.getElementById('val-vid-timecode').textContent = `${formatTimecode(cur)} / ${formatTimecode(dur)}`;
    }
  } else if (state.isMonitorRole) {
    renderStageOverlay(dpr, lastStageMetrics);
  }

  // Broadcast live 60Hz state to 2nd-Screen Projector window if connected
  broadcastLiveStateTick(now);

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    const fps = Math.round(fpsFrames / fpsAccum);
    liveMeasuredFps = fps;
    if (fpsBadgeEl) {
      const q = state.renderQuality || 'auto';
      const pct = Math.round((typeof getAdaptiveRenderScale === 'function' ? getAdaptiveRenderScale() : 1) * 100);
      fpsBadgeEl.textContent = state.ecoMode ? `${fps} ECO` : `${fps} FPS`;
      fpsBadgeEl.dataset.quality = q;
      const capFps = typeof getBrowserFrameRateCap === 'function' ? getBrowserFrameRateCap() : 0;
      fpsBadgeEl.dataset.capped = capFps ? '1' : '';
      fpsBadgeEl.title = capFps
        ? `Frames arrive at a steady ${capFps} fps and lowering quality doesn't speed them up, so quality stays at 100%. Most often this is battery saving (Chrome Energy Saver switches on at 20% battery): plug in, or turn Energy Saver off in Chrome Settings → Performance. A ${capFps} Hz display or a very heavy scene can do the same.`
        : `Frame rate · render quality ${q.toUpperCase()} (${pct}% internal resolution for generators & 3D previz). Click to cycle Auto → Full → Fast.`;
      fpsBadgeEl.dataset.res = pct < 100 ? `${pct}%` : '';
    }
    fpsAccum = 0;
    fpsFrames = 0;
  }

  requestAnimationFrame(frameLoop);
}

function bootWebMapper() {
  if (typeof document !== 'undefined' && document.body && document.body.dataset) {
    document.body.dataset.role = state.isMonitorRole ? 'monitor' : (state.isProjectorRole ? 'projector' : 'studio');
  }
  ensureMultiProjectorState();
  ensurePixelMapperState();
  initBuiltInSources();
  bindViewportInteractions();
  bindAllControls();
  initSyncEngine();
  initWebMapperPublicAPI();

  if (!state.isProjectorRole && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const unlockMediaAndWebAudioOnGesture = () => {
      if (typeof liveAudioCtx !== 'undefined' && liveAudioCtx && liveAudioCtx.state === 'suspended' && typeof liveAudioCtx.resume === 'function') {
        try {
          liveAudioCtx.resume().then(() => {
            if (state.audio?.enabled && state.audio?.sourceMode === 'video' && typeof attachActiveVideoToAudioGraph === 'function') {
              attachActiveVideoToAudioGraph();
            }
            if (typeof syncAudioSourceStatusBox === 'function') syncAudioSourceStatusBox(true);
          }).catch(() => {});
        } catch (_) {}
      }
      for (const s of state.sources) {
        if (!s || s.kind !== 'video' || s.offline || !s.video || s.playing === false) continue;
        if (s._needsGestureUnmute || (!s.muted && s.video.muted) || (s.video.paused && !s.video.ended && !s.isSeekingReverse)) {
          if (typeof syncVideoAudioElementState === 'function') {
            syncVideoAudioElementState(s, true);
          } else {
            s.video.muted = !!s.muted;
            s.video.play().catch(() => {});
          }
        }
      }
    };
    window.addEventListener('pointerdown', unlockMediaAndWebAudioOnGesture, { capture: true });
    window.addEventListener('keydown', unlockMediaAndWebAudioOnGesture, { capture: true });
  }

  if (state.projectorMode) {
    toggleLocalProjectorMode(true);
  }

  let restored = false;
  let pendingStart = null;
  let freshLaunch = false;
  if (!state.isProjectorRole) {
    // "Start fresh" reloads with a pending choice; a ?fresh link skips the saved session.
    pendingStart = typeof takePendingStart === 'function' ? takePendingStart() : null;
    freshLaunch = !!pendingStart || (typeof isFreshLaunchRequested === 'function' && isFreshLaunchRequested());
    restored = freshLaunch ? false : tryRestoreAutosave();
    if (!restored) {
      loadDemoScene(true);
    }
  }

  refreshFxSelectDropdowns();
  syncTopbarUI();
  renderMediaBin();
  renderSurfaceList();
  renderMaskList();
  renderCueList();
  syncInspectorUI();
  syncMaskInspectorUI();
  syncFollowspotInspectorUI();
  syncOutputInspectorUI();
  syncModIoInspectorUI();
  syncCueRecallToolbarUI();
  syncTimelineToolbarUI();
  syncMixPaneToolbarUI();
  syncTransportUI();
  syncShaderStudioUI(true);
  syncUndoButtonsUI();
  updateRelinkBadgeUI();
  if (!state.isProjectorRole && typeof setStudioRoom === 'function') {
    setStudioRoom('map', { silent: true });
  }
  if (typeof initScrubbyReadoutsAndDiffDots === 'function') {
    initScrubbyReadoutsAndDiffDots();
  }
  if (typeof initBetaModule === 'function') initBetaModule(!!restored, { pending: pendingStart, freshLaunch });
  if (typeof initGrowthUx === 'function') initGrowthUx();

  requestAnimationFrame(frameLoop);
}

// The loading veil (body.html) covers the half-loaded page; lift it once the app is live —
// even if boot throws, so a problem is visible instead of an endless "Loading…".
function hideBootVeil() {
  if (typeof window !== 'undefined') window.__ccBooted = true;
  const veil = typeof document !== 'undefined' ? document.getElementById('boot-veil') : null;
  if (!veil) return;
  veil.classList.add('done');
  setTimeout(() => veil.remove(), 260);
}

let _bootOk = false;
try {
  bootWebMapper();
  _bootOk = true;
} finally {
  if (_bootOk) {
    hideBootVeil();
  } else if (typeof document !== 'undefined') {
    const sub = document.querySelector('#boot-veil .boot-sub');
    if (sub) sub.textContent = 'Something went wrong while starting. Reload the page; if it happens again, use a recent desktop Chrome or Edge and tell us at talk.to.chaos.productions@gmail.com.';
    document.getElementById('boot-veil')?.classList.add('stuck');
  }
}
